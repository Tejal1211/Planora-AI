/**
 * @module app
 * @description Express application factory for Planora AI.
 *
 * Exports `createApp(db, opts)` which is called by `index.ts` in production
 * and by each test with an in-memory database, ensuring all routes are
 * tested without side effects on the filesystem.
 *
 * Route groups:
 *  - GET  /api/health
 *  - CRUD /api/events
 *  - Read /api/events/:id/{budget,tasks,guests,vendors,vendors/match,readiness}
 *  - CRUD /api/events/:id/{budget,tasks,guests,vendors}
 *  - POST /api/events/:id/ai/plan  (rate-limited: 20 req/min/IP)
 *  - POST /api/events/:id/simulate[/apply]
 *  - GET  /api/events/:id/report
 *
 * Security middleware applied (in order):
 *  1. helmet()     — comprehensive security headers (CSP, HSTS, noSniff, etc.)
 *  2. cors()       — explicit origin allow-list, no credentials
 *  3. json limit   — 100 KB body cap prevents large-payload DoS
 *  4. writeLimit   — 60 req/min/IP on all mutating (POST/PUT/DELETE) endpoints
 *  5. aiLimit      — 20 req/min/IP on the AI endpoint (nested inside writeLimit)
 *
 * Table-name safety:
 *  All dynamic SQL uses the ALLOWED_TABLES Set as an explicit whitelist.
 *  URL-segment values are validated against this set before any DB query.
 *
 * Error handling:
 *  - ZodError   → 400 with field-level details
 *  - AppError   → status from the error
 *  - SyntaxError (bad JSON) → 400
 *  - Unknown    → 500 (generic message; no internals leaked)
 */
import express, { NextFunction, Request, RequestHandler, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { ZodError, ZodTypeAny } from 'zod';
import type { DB } from './db';
import { AppError } from './errors';
import { generatePlan } from './ai';
import * as L from './logic';
import {
  applyChangesDb,
  createEventWithSeed,
  getEvent,
  insertRow,
  loadState,
  syncTimeline,
  updateRow,
} from './repo';
import {
  aiRequestSchema,
  budgetSchema,
  eventSchema,
  eventUpdateSchema,
  guestSchema,
  scenarioSchema,
  taskSchema,
  vendorSchema,
} from './schemas';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppOptions {
  corsOrigins?: string[];
  clientDist?: string;
  env?: NodeJS.ProcessEnv;
  fetchFn?: typeof fetch;
  today?: () => string;
}

/** Explicit whitelist of database table names that may be used in dynamic SQL. */
const ALLOWED_TABLES = new Set(['budget_items', 'tasks', 'guests', 'vendors'] as const);

/** Maps URL segment → { table, schema }. Tables are validated via ALLOWED_TABLES before use. */
const RES = {
  budget: { table: 'budget_items', schema: budgetSchema  as ZodTypeAny },
  tasks:  { table: 'tasks',        schema: taskSchema    as ZodTypeAny },
  guests: { table: 'guests',       schema: guestSchema   as ZodTypeAny },
  vendors:{ table: 'vendors',      schema: vendorSchema  as ZodTypeAny },
} as const satisfies Record<string, { table: string; schema: ZodTypeAny }>;

type ResKey = keyof typeof RES;

// ---------------------------------------------------------------------------
// Route helpers
// ---------------------------------------------------------------------------

/**
 * Wraps an async route handler so that any thrown error is forwarded to
 * Express's `next()` for centralised handling. Prevents unhandled promise rejections.
 */
const h =
  (fn: (req: Request, res: Response) => unknown): RequestHandler =>
  (req, res, next) => {
    Promise.resolve().then(() => fn(req, res)).catch(next);
  };

/**
 * Parses and validates a route parameter as a positive integer.
 * @throws {AppError} 400 if the value is not a positive integer.
 */
const pid = (v: string): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new AppError(400, 'Invalid id');
  return n;
};

// ---------------------------------------------------------------------------
// Application factory
// ---------------------------------------------------------------------------

/**
 * Creates and returns the configured Express application.
 *
 * @param db    - An open SQLite database (use `:memory:` in tests)
 * @param opts  - Optional overrides for CORS origins, static file path,
 *                environment variables, fetch function, and today's date
 *                (the last two are used by tests to inject mocks)
 */
export function createApp(db: DB, opts: AppOptions = {}) {
  const env = opts.env ?? process.env;
  const today = opts.today ?? L.todayISO;
  const app = express();

  // ── Security: disable server fingerprinting ─────────────────────────────
  app.disable('x-powered-by');

  // ── Security: comprehensive HTTP security headers via helmet ─────────────
  // CSP restricts resource loading; additional directives prevent clickjacking,
  // MIME sniffing, and cross-origin data leaks.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc:     ["'self'"],
          scriptSrc:      ["'self'"],
          styleSrc:       ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc:        ["'self'", 'https://fonts.gstatic.com'],
          imgSrc:         ["'self'", 'data:'],
          connectSrc:     ["'self'"],
          formAction:     ["'self'"],
          baseUri:        ["'self'"],
          objectSrc:      ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginEmbedderPolicy: false, // keep for SPA asset compatibility
      hsts: { maxAge: 31_536_000, includeSubDomains: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // ── Security: explicit CORS origin allow-list ───────────────────────────
  app.use(
    cors({
      origin: opts.corsOrigins?.length ? opts.corsOrigins : ['http://localhost:5173'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type'],
      credentials: false,
    }),
  );

  // ── Security: body size cap (100 KB) prevents large-payload DoS ─────────
  app.use(express.json({ limit: '100kb' }));

  // ── Security: in-memory rate limiters ───────────────────────────────────
  // Shared data structure — one per limiter instance, cleared of stale entries each call.
  const makeRateLimiter = (maxHits: number, windowMs: number, message: string): RequestHandler => {
    const hits = new Map<string, number[]>();
    return (req, _res, next) => {
      const now = Date.now();
      const key = req.ip ?? 'anon';
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= maxHits) return void next(new AppError(429, message));
      hits.set(key, [...recent, now]);
      next();
    };
  };

  /** 60 requests/min — applied to all mutating (POST/PUT/DELETE) routes. */
  const writeLimit = makeRateLimiter(60, 60_000, 'Too many requests - please slow down');

  /** 20 requests/min — applied to the expensive AI endpoint only. */
  const aiLimit = makeRateLimiter(20, 60_000, 'Too many AI requests - try again in a minute');

  // Apply write-rate limit globally to all mutating methods
  app.use((req, res, next) => {
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
      return writeLimit(req, res, next);
    }
    next();
  });

  // ── Health check ─────────────────────────────────────────────────────────
  app.get('/api/health', (_req, res) =>
    res.json({
      status: 'ok',
      ai: env.GEMINI_API_KEY?.trim() ? 'gemini' : 'fallback',
      time: new Date().toISOString(),
    }),
  );

  // ── Events CRUD ──────────────────────────────────────────────────────────
  app.get('/api/events', h((_q, res) =>
    res.json({ events: db.prepare('SELECT * FROM events ORDER BY date').all() }),
  ));

  app.post('/api/events', h((req, res) => {
    const id = createEventWithSeed(db, eventSchema.parse(req.body) as never);
    res.status(201).json({ event: getEvent(db, id) });
  }));

  app.get('/api/events/:id', h((req, res) =>
    res.json({ event: getEvent(db, pid(req.params.id)) }),
  ));

  app.put('/api/events/:id', h((req, res) => {
    const id = pid(req.params.id);
    const old = getEvent(db, id);
    const data = eventUpdateSchema.parse(req.body);
    db.transaction(() => {
      const cols = Object.keys(data);
      if (cols.length) {
        const values = cols.map((c) => {
          const v = (data as Record<string, unknown>)[c];
          return typeof v === 'boolean' ? Number(v) : v;
        });
        db.prepare(
          `UPDATE events SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        ).run(...(values as never[]), id);
      }
      if (data.date && data.date !== old.date) syncTimeline(db, id, today());
    })();
    res.json({ event: getEvent(db, id) });
  }));

  app.delete('/api/events/:id', h((req, res) => {
    const r = db.prepare('DELETE FROM events WHERE id = ?').run(pid(req.params.id));
    if (!r.changes) throw new AppError(404, 'Event not found');
    res.status(204).end();
  }));

  // ── Read models (computed views) ─────────────────────────────────────────
  app.get('/api/events/:id/budget', h((req, res) => {
    const s = loadState(db, pid(req.params.id));
    res.json({
      items: s.budget,
      summary: L.budgetSummary(s.event, s.budget),
      rescue: L.rescuePlan(s.event, s.budget),
    });
  }));

  app.get('/api/events/:id/tasks', h((req, res) => {
    const s = loadState(db, pid(req.params.id));
    const t = today();
    res.json({ tasks: L.withOverdue(s.tasks, t), stats: L.taskStats(s.tasks, t) });
  }));

  app.post('/api/events/:id/timeline/regenerate', h((req, res) => {
    const id = pid(req.params.id);
    getEvent(db, id);
    syncTimeline(db, id, today());
    const s = loadState(db, id);
    const t = today();
    res.json({ tasks: L.withOverdue(s.tasks, t), stats: L.taskStats(s.tasks, t) });
  }));

  app.get('/api/events/:id/guests', h((req, res) => {
    const s = loadState(db, pid(req.params.id));
    const byRsvp = (r: string) => s.guests.filter((g) => g.rsvp === r).length;
    const headcount = (r: string) =>
      s.guests.filter((g) => g.rsvp === r).reduce((a, g) => a + 1 + g.plus_ones, 0);
    res.json({
      guests: s.guests,
      summary: {
        total: s.guests.length,
        yes: byRsvp('yes'),
        no: byRsvp('no'),
        pending: byRsvp('pending'),
        confirmedHeadcount: headcount('yes'),
        expectedHeadcount: headcount('yes') + headcount('pending'),
        plannedGuestCount: s.event.guest_count,
      },
    });
  }));

  app.get('/api/events/:id/vendors', h((req, res) =>
    res.json({ vendors: loadState(db, pid(req.params.id)).vendors }),
  ));

  app.get('/api/events/:id/vendors/match', h((req, res) => {
    const s = loadState(db, pid(req.params.id));
    const category = String(req.query.category ?? '').trim();
    if (!category) throw new AppError(400, 'category query parameter is required');
    res.json({
      category,
      vendors: L.scoreVendors(s, category),
      disclaimer:
        'Scores use supplied prices, services, ratings and availability. Demo vendors carry estimated prices.',
    });
  }));

  app.get('/api/events/:id/readiness', h((req, res) =>
    res.json(L.readiness(loadState(db, pid(req.params.id)), today())),
  ));

  // ── Generic child-resource CRUD (budget | tasks | guests | vendors) ──────
  // Pattern must come AFTER the specific routes above (vendors/match, timeline/regenerate).
  const base = '/api/events/:id/:res(budget|tasks|guests|vendors)';

  app.post(base, h((req, res) => {
    const id = pid(req.params.id);
    getEvent(db, id);
    const resource = req.params.res as ResKey;
    const { table, schema } = RES[resource];
    // Safety: table name must be in the explicit allow-list — never user-controlled.
    if (!ALLOWED_TABLES.has(table as never)) throw new AppError(400, 'Invalid resource');
    const data = schema.parse(req.body) as Record<string, unknown>;
    if (table === 'vendors' && data.selected && !data.available) {
      throw new AppError(400, 'Cannot select an unavailable vendor');
    }
    const rid = insertRow(db, table, id, data);
    if (table === 'vendors' && data.selected) {
      db.prepare(
        'UPDATE vendors SET selected = 0 WHERE event_id = ? AND category = ? AND id != ?',
      ).run(id, data.category, rid);
    }
    res.status(201).json({ id: rid });
  }));

  app.put(`${base}/:rid`, h((req, res) => {
    const id = pid(req.params.id);
    const rid = pid(req.params.rid);
    getEvent(db, id);
    const resource = req.params.res as ResKey;
    const { table, schema } = RES[resource];
    if (!ALLOWED_TABLES.has(table as never)) throw new AppError(400, 'Invalid resource');
    const data = (schema as unknown as { partial(): ZodTypeAny })
      .partial()
      .parse(req.body) as Record<string, unknown>;
    if (table === 'vendors') {
      const cur = db
        .prepare('SELECT * FROM vendors WHERE id = ? AND event_id = ?')
        .get(rid, id) as L.VendorRow | undefined;
      if (!cur) throw new AppError(404, 'Record not found');
      const nextAvail = data.available ?? !!cur.available;
      if (data.selected && !nextAvail) throw new AppError(400, 'Cannot select an unavailable vendor');
      if (data.available === false) data.selected = false;
      updateRow(db, table, id, rid, data);
      if (data.selected) {
        db.prepare(
          'UPDATE vendors SET selected = 0 WHERE event_id = ? AND category = ? AND id != ?',
        ).run(id, cur.category, rid);
      }
    } else {
      updateRow(db, table, id, rid, data);
    }
    res.json({ ok: true });
  }));

  app.delete(`${base}/:rid`, h((req, res) => {
    const id = pid(req.params.id);
    getEvent(db, id);
    const resource = req.params.res as ResKey;
    const { table } = RES[resource];
    if (!ALLOWED_TABLES.has(table as never)) throw new AppError(400, 'Invalid resource');
    const r = db
      .prepare(`DELETE FROM ${table} WHERE id = ? AND event_id = ?`)
      .run(pid(req.params.rid), id);
    if (!r.changes) throw new AppError(404, 'Record not found');
    res.status(204).end();
  }));

  // ── AI plan (rate-limited) ───────────────────────────────────────────────
  app.post('/api/events/:id/ai/plan', aiLimit, h(async (req, res) => {
    const { prompt } = aiRequestSchema.parse(req.body ?? {});
    res.json(
      await generatePlan(
        loadState(db, pid(req.params.id)),
        prompt,
        env,
        opts.fetchFn ?? fetch,
        today(),
      ),
    );
  }));

  // ── Simulation ───────────────────────────────────────────────────────────

  /**
   * Builds a simulation preview from a scenario body.
   * Always recomputes server-side — client-supplied change lists are NEVER trusted.
   *
   * @param id   - Validated event primary key
   * @param body - Raw (unvalidated) request body; validated inside via scenarioSchema
   */
  const buildPreview = (id: number, body: unknown) => {
    const sc = scenarioSchema.parse(body);
    const s = loadState(db, id);
    const t = today();
    const sim = L.simulate(s, sc, t);
    const after = L.applyToState(s, sim.changes);
    return {
      sim,
      result: {
        scenario: sc,
        title: sim.title,
        notes: sim.notes,
        changes: sim.changes.map((c) => ({ kind: c.kind, label: c.label })),
        before: L.snapshot(s, t),
        after: L.snapshot(after, t),
        rescue: L.rescuePlan(after.event, after.budget),
      },
    };
  };

  app.post('/api/events/:id/simulate', h((req, res) =>
    res.json(buildPreview(pid(req.params.id), req.body).result),
  ));

  app.post('/api/events/:id/simulate/apply', h((req, res) => {
    const id = pid(req.params.id);
    const { sim, result } = buildPreview(id, req.body);
    if (!sim.changes.length) throw new AppError(400, 'This scenario produces no changes to apply');
    applyChangesDb(db, id, sim.changes);
    res.json({ applied: sim.changes.length, result });
  }));

  // ── Report ───────────────────────────────────────────────────────────────
  app.get('/api/events/:id/report', h((req, res) => {
    const s = loadState(db, pid(req.params.id));
    const t = today();
    const guestStats = {
      total:   s.guests.length,
      yes:     s.guests.filter((g) => g.rsvp === 'yes').length,
      no:      s.guests.filter((g) => g.rsvp === 'no').length,
      pending: s.guests.filter((g) => g.rsvp === 'pending').length,
    };
    res.json({
      generatedAt: new Date().toISOString(),
      event: s.event,
      budget: {
        items:   s.budget,
        summary: L.budgetSummary(s.event, s.budget),
        rescue:  L.rescuePlan(s.event, s.budget),
      },
      readiness:         L.readiness(s, t),
      tasks:             L.withOverdue(s.tasks, t),
      taskStats:         L.taskStats(s.tasks, t),
      guests:            guestStats,
      selectedVendors:   s.vendors.filter((v) => v.selected),
      disclaimer:
        'Vendors marked demo are demonstration data and all prices are estimates, not quotes.',
    });
  }));

  // ── 404 catch-all for unmatched /api routes ──────────────────────────────
  app.use('/api', (_req, _res, next) => next(new AppError(404, 'Route not found')));

  // ── Static client serving (production) ───────────────────────────────────
  const dist = opts.clientDist;
  if (dist && fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.resolve(dist, 'index.html')));
  }

  // ── Global error handler ─────────────────────────────────────────────────
  // Rule: never expose stack traces or internal details to clients.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: err.message, details: err.details });
    }
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
