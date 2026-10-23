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
import { applyChangesDb, createEventWithSeed, getEvent, insertRow, loadState, syncTimeline, updateRow } from './repo';
import { aiRequestSchema, budgetSchema, eventSchema, eventUpdateSchema, guestSchema, scenarioSchema, taskSchema, vendorSchema } from './schemas';

export interface AppOptions { corsOrigins?: string[]; clientDist?: string; env?: NodeJS.ProcessEnv; fetchFn?: typeof fetch; today?: () => string }

const h = (fn: (req: Request, res: Response) => unknown): RequestHandler => (req, res, next) => { Promise.resolve().then(() => fn(req, res)).catch(next); };
const pid = (v: string) => { const n = Number(v); if (!Number.isInteger(n) || n < 1) throw new AppError(400, 'Invalid id'); return n; };
const RES: Record<string, { table: string; schema: ZodTypeAny }> = {
  budget: { table: 'budget_items', schema: budgetSchema }, tasks: { table: 'tasks', schema: taskSchema },
  guests: { table: 'guests', schema: guestSchema }, vendors: { table: 'vendors', schema: vendorSchema },
};

export function createApp(db: DB, opts: AppOptions = {}) {
  const env = opts.env ?? process.env;
  const today = opts.today ?? L.todayISO;
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"] } } }));
  app.use(cors({ origin: opts.corsOrigins?.length ? opts.corsOrigins : ['http://localhost:5173'] }));
  app.use(express.json({ limit: '100kb' }));

  // tiny in-memory rate limit for the AI endpoint
  const hits = new Map<string, number[]>();
  const aiLimit: RequestHandler = (req, _res, next) => {
    const now = Date.now(); const k = req.ip ?? 'x';
    const recent = (hits.get(k) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= 20) return next(new AppError(429, 'Too many AI requests - try again in a minute'));
    hits.set(k, [...recent, now]); next();
  };

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', ai: env.GEMINI_API_KEY?.trim() ? 'gemini' : 'fallback', time: new Date().toISOString() }));

  /* ---- events ---- */
  app.get('/api/events', h((_q, res) => res.json({ events: db.prepare('SELECT * FROM events ORDER BY date').all() })));
  app.post('/api/events', h((req, res) => {
    const id = createEventWithSeed(db, eventSchema.parse(req.body) as never);
    res.status(201).json({ event: getEvent(db, id) });
  }));
  app.get('/api/events/:id', h((req, res) => res.json({ event: getEvent(db, pid(req.params.id)) })));
  app.put('/api/events/:id', h((req, res) => {
    const id = pid(req.params.id); const old = getEvent(db, id);
    const data = eventUpdateSchema.parse(req.body);
    db.transaction(() => {
      const cols = Object.keys(data);
      if (cols.length) db.prepare(`UPDATE events SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => { const v = (data as Record<string, unknown>)[c]; return typeof v === 'boolean' ? Number(v) : v; }) as never[], id);
      if (data.date && data.date !== old.date) syncTimeline(db, id, today());
    })();
    res.json({ event: getEvent(db, id) });
  }));
  app.delete('/api/events/:id', h((req, res) => {
    const r = db.prepare('DELETE FROM events WHERE id = ?').run(pid(req.params.id));
    if (!r.changes) throw new AppError(404, 'Event not found');
    res.status(204).end();
  }));

  /* ---- read models ---- */
  app.get('/api/events/:id/budget', h((req, res) => {
    const s = loadState(db, pid(req.params.id));
    res.json({ items: s.budget, summary: L.budgetSummary(s.event, s.budget), rescue: L.rescuePlan(s.event, s.budget) });
  }));
  app.get('/api/events/:id/tasks', h((req, res) => {
    const s = loadState(db, pid(req.params.id)); const t = today();
    res.json({ tasks: L.withOverdue(s.tasks, t), stats: L.taskStats(s.tasks, t) });
  }));
  app.post('/api/events/:id/timeline/regenerate', h((req, res) => {
    const id = pid(req.params.id); getEvent(db, id); syncTimeline(db, id, today());
    const s = loadState(db, id); res.json({ tasks: L.withOverdue(s.tasks, today()), stats: L.taskStats(s.tasks, today()) });
  }));
  app.get('/api/events/:id/guests', h((req, res) => {
    const s = loadState(db, pid(req.params.id));
    const c = (r: string) => s.guests.filter((g) => g.rsvp === r).length;
    const headcount = (r: string) => s.guests.filter((g) => g.rsvp === r).reduce((a, g) => a + 1 + g.plus_ones, 0);
    res.json({ guests: s.guests, summary: { total: s.guests.length, yes: c('yes'), no: c('no'), pending: c('pending'), confirmedHeadcount: headcount('yes'), expectedHeadcount: headcount('yes') + headcount('pending'), plannedGuestCount: s.event.guest_count } });
  }));
  app.get('/api/events/:id/vendors', h((req, res) => res.json({ vendors: loadState(db, pid(req.params.id)).vendors })));
  app.get('/api/events/:id/vendors/match', h((req, res) => {
    const s = loadState(db, pid(req.params.id));
    const category = String(req.query.category ?? '').trim();
    if (!category) throw new AppError(400, 'category query parameter is required');
    res.json({ category, vendors: L.scoreVendors(s, category), disclaimer: 'Scores use supplied prices, services, ratings and availability. Demo vendors carry estimated prices.' });
  }));
  app.get('/api/events/:id/readiness', h((req, res) => res.json(L.readiness(loadState(db, pid(req.params.id)), today()))));

  /* ---- generic child CRUD (after specific routes) ---- */
  const base = '/api/events/:id/:res(budget|tasks|guests|vendors)';
  app.post(base, h((req, res) => {
    const id = pid(req.params.id); getEvent(db, id);
    const { table, schema } = RES[req.params.res];
    const data = schema.parse(req.body) as Record<string, unknown>;
    if (table === 'vendors' && data.selected && !data.available) throw new AppError(400, 'Cannot select an unavailable vendor');
    const rid = insertRow(db, table, id, data);
    if (table === 'vendors' && data.selected) db.prepare('UPDATE vendors SET selected = 0 WHERE event_id = ? AND category = ? AND id != ?').run(id, data.category, rid);
    res.status(201).json({ id: rid });
  }));
  app.put(`${base}/:rid`, h((req, res) => {
    const id = pid(req.params.id); const rid = pid(req.params.rid); getEvent(db, id);
    const { table, schema } = RES[req.params.res];
    const data = (schema as unknown as { partial(): ZodTypeAny }).partial().parse(req.body) as Record<string, unknown>;
    if (table === 'vendors') {
      const cur = db.prepare('SELECT * FROM vendors WHERE id = ? AND event_id = ?').get(rid, id) as L.VendorRow | undefined;
      if (!cur) throw new AppError(404, 'Record not found');
      const nextAvail = data.available ?? !!cur.available;
      if (data.selected && !nextAvail) throw new AppError(400, 'Cannot select an unavailable vendor');
      if (data.available === false) data.selected = false;
      updateRow(db, table, id, rid, data);
      if (data.selected) db.prepare('UPDATE vendors SET selected = 0 WHERE event_id = ? AND category = ? AND id != ?').run(id, cur.category, rid);
    } else updateRow(db, table, id, rid, data);
    res.json({ ok: true });
  }));
  app.delete(`${base}/:rid`, h((req, res) => {
    const id = pid(req.params.id); getEvent(db, id);
    const r = db.prepare(`DELETE FROM ${RES[req.params.res].table} WHERE id = ? AND event_id = ?`).run(pid(req.params.rid), id);
    if (!r.changes) throw new AppError(404, 'Record not found');
    res.status(204).end();
  }));

  /* ---- AI + simulation + report ---- */
  app.post('/api/events/:id/ai/plan', aiLimit, h(async (req, res) => {
    const { prompt } = aiRequestSchema.parse(req.body ?? {});
    res.json(await generatePlan(loadState(db, pid(req.params.id)), prompt, env, opts.fetchFn ?? fetch, today()));
  }));
  const preview = (id: number, body: unknown) => {
    const sc = scenarioSchema.parse(body); const s = loadState(db, id); const t = today();
    const sim = L.simulate(s, sc, t); const after = L.applyToState(s, sim.changes);
    return { sim, result: { scenario: sc, title: sim.title, notes: sim.notes, changes: sim.changes.map((c) => ({ kind: c.kind, label: c.label })), before: L.snapshot(s, t), after: L.snapshot(after, t), rescue: L.rescuePlan(after.event, after.budget) } };
  };
  app.post('/api/events/:id/simulate', h((req, res) => res.json(preview(pid(req.params.id), req.body).result)));
  app.post('/api/events/:id/simulate/apply', h((req, res) => {
    const id = pid(req.params.id); const { sim, result } = preview(id, req.body); // recomputed server-side, never trusting client changes
    if (!sim.changes.length) throw new AppError(400, 'This scenario produces no changes to apply');
    applyChangesDb(db, id, sim.changes);
    res.json({ applied: sim.changes.length, result });
  }));
  app.get('/api/events/:id/report', h((req, res) => {
    const s = loadState(db, pid(req.params.id)); const t = today();
    res.json({
      generatedAt: new Date().toISOString(), event: s.event, budget: { items: s.budget, summary: L.budgetSummary(s.event, s.budget), rescue: L.rescuePlan(s.event, s.budget) },
      readiness: L.readiness(s, t), tasks: L.withOverdue(s.tasks, t), taskStats: L.taskStats(s.tasks, t),
      guests: { total: s.guests.length, yes: s.guests.filter((g) => g.rsvp === 'yes').length, no: s.guests.filter((g) => g.rsvp === 'no').length, pending: s.guests.filter((g) => g.rsvp === 'pending').length },
      selectedVendors: s.vendors.filter((v) => v.selected),
      disclaimer: 'Vendors marked demo are demonstration data and all prices are estimates, not quotes.',
    });
  }));

  app.use('/api', (_req, _res, next) => next(new AppError(404, 'Route not found')));

  const dist = opts.clientDist;
  if (dist && fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.resolve(dist, 'index.html')));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) return res.status(400).json({ error: 'Validation failed', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    if (err instanceof AppError) return res.status(err.status).json({ error: err.message, details: err.details });
    if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'Invalid JSON body' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
