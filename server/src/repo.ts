/**
 * @module repo
 * @description SQLite data-access helpers for Planora AI.
 *
 * All database I/O lives here. Route handlers in `app.ts` call these
 * functions; the planning engine in `logic.ts` is pure and never touches
 * the database directly.
 *
 * Key design choices:
 *  - `loadState` fetches all five tables in one go and returns a typed `State`
 *    object; this avoids scattered queries in route handlers and makes tests easy.
 *  - `createEventWithSeed` runs inside a transaction: event row + budget lines +
 *    demo vendors + timeline are either all created or all rolled back.
 *  - `applyChangesDb` is also transactional: every simulation `apply` is atomic.
 *
 * SQL injection prevention:
 *  - All user-supplied values are bound as parameterised query placeholders (`?`).
 *  - Column names in INSERT/UPDATE come from Zod-validated objects whose keys are
 *    known at schema definition time, never from raw HTTP input.
 *  - Table names come from the ALLOWED_TABLES whitelist in `app.ts` and are
 *    additionally constrained by the TypeScript type system.
 */
import type { DB } from './db';
import { AppError } from './errors';
import {
  ALLOCATION_FACTOR,
  BUDGET_TEMPLATES,
  type BudgetRow,
  type Change,
  type EventRow,
  type GuestRow,
  type State,
  type TaskRow,
  type VendorRow,
  demoVendorsFor,
  generateTimeline,
  round2,
  todayISO,
} from './logic';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Converts JavaScript booleans to SQLite integers (0/1).
 * All other values are passed through unchanged.
 * SQLite has no native boolean type; better-sqlite3 stores booleans as integers.
 */
const toDb = (v: unknown): unknown => (typeof v === 'boolean' ? (v ? 1 : 0) : v);

/**
 * Internal query helper for loading child rows by `event_id`.
 * @param db    - Open database connection
 * @param table - Validated table name (comes from ALLOWED_TABLES in app.ts)
 * @param order - ORDER BY clause fragment (always a hard-coded string literal)
 * @param id    - Event primary key (bound as a parameterised placeholder)
 */
function childRows<T>(db: DB, table: string, order: string, id: number): T[] {
  return db
    .prepare(`SELECT * FROM ${table} WHERE event_id = ? ORDER BY ${order}`)
    .all(id) as T[];
}

// ---------------------------------------------------------------------------
// Public data-access functions
// ---------------------------------------------------------------------------

/**
 * Fetches a single event row by primary key.
 * @throws {AppError} 404 if the event does not exist.
 */
export function getEvent(db: DB, id: number): EventRow {
  const e = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow | undefined;
  if (!e) throw new AppError(404, 'Event not found');
  return e;
}

/**
 * Loads all five tables for an event into a typed `State` object.
 * Uses five prepared queries in a single synchronous call; no transaction is needed
 * since SQLite reads are always consistent within a connection in WAL mode.
 *
 * @throws {AppError} 404 if the event does not exist.
 */
export function loadState(db: DB, id: number): State {
  return {
    event:   getEvent(db, id),
    budget:  childRows<BudgetRow>(db, 'budget_items', 'id',             id),
    tasks:   childRows<TaskRow>  (db, 'tasks',        'due_date, id',   id),
    guests:  childRows<GuestRow> (db, 'guests',       'id',             id),
    vendors: childRows<VendorRow>(db, 'vendors',      'category, price',id),
  };
}

/**
 * Inserts a single row into a child table.
 * Column names come from a Zod-validated object, never from raw user input.
 *
 * @param db      - Open database connection
 * @param table   - Target table (validated against ALLOWED_TABLES in app.ts)
 * @param eventId - Parent event primary key
 * @param data    - Key/value pairs from a Zod-parsed schema
 * @returns The auto-generated primary key of the new row.
 */
export function insertRow(
  db: DB,
  table: string,
  eventId: number,
  data: Record<string, unknown>,
): number {
  const cols = Object.keys(data);
  const placeholders = cols.map(() => '?').join(',');
  const values = cols.map((c) => toDb(data[c]));
  const r = db
    .prepare(`INSERT INTO ${table} (event_id, ${cols.join(',')}) VALUES (?, ${placeholders})`)
    .run(eventId, ...(values as never[]));
  return Number(r.lastInsertRowid);
}

/**
 * Updates a single row in a child table.
 * Column names come from a Zod-validated partial object.
 *
 * @throws {AppError} 400 if `data` contains no fields to update.
 * @throws {AppError} 404 if the row does not exist for this event.
 */
export function updateRow(
  db: DB,
  table: string,
  eventId: number,
  id: number,
  data: Record<string, unknown>,
): void {
  const cols = Object.keys(data);
  if (!cols.length) throw new AppError(400, 'No fields to update');
  const values = cols.map((c) => toDb(data[c]));
  const r = db
    .prepare(
      `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND event_id = ?`,
    )
    .run(...(values as never[]), id, eventId);
  if (!r.changes) throw new AppError(404, 'Record not found');
}

/**
 * Synchronises the task timeline for an event:
 *  - Adds any template tasks that are not yet present (matched by exact title).
 *  - Re-spaces existing open (non-done) tasks to compressed deadlines.
 *  - Never modifies tasks already marked `done`.
 *
 * Called automatically on event creation, on date change, and on manual
 * regeneration via `POST /events/:id/timeline/regenerate`.
 *
 * @param db      - Open database connection
 * @param eventId - Event primary key
 * @param today   - ISO date string representing today (defaults to real today)
 */
export function syncTimeline(db: DB, eventId: number, today = todayISO()): void {
  const ev = getEvent(db, eventId);
  const existing = db
    .prepare('SELECT id, title, status FROM tasks WHERE event_id = ?')
    .all(eventId) as { id: number; title: string; status: string }[];

  for (const t of generateTimeline(ev, today)) {
    const hit = existing.find((x) => x.title === t.title);
    if (!hit) {
      insertRow(db, 'tasks', eventId, { ...t, status: 'todo' });
    } else if (hit.status !== 'done') {
      db.prepare('UPDATE tasks SET due_date = ? WHERE id = ?').run(t.due_date, hit.id);
    }
  }
}

/**
 * Creates an event and atomically seeds all related data in a single transaction:
 *  1. Inserts the event row.
 *  2. Seeds proportional budget lines from `BUDGET_TEMPLATES`, retaining a 10%
 *     contingency buffer via `ALLOCATION_FACTOR`.
 *  3. Inserts clearly-labelled demonstration vendors with estimated prices.
 *  4. Generates and inserts an adaptive task timeline.
 *
 * The entire operation is wrapped in a `db.transaction()` — if any step fails,
 * no partial data is written to the database.
 *
 * @returns The auto-generated event `id`.
 */
export function createEventWithSeed(
  db: DB,
  d: Record<string, unknown> & { type: keyof typeof BUDGET_TEMPLATES; budget_total: number },
): number {
  return db.transaction(() => {
    const cols = Object.keys(d);
    const values = cols.map((c) => toDb(d[c]));
    const r = db
      .prepare(`INSERT INTO events (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
      .run(...(values as never[]));
    const id = Number(r.lastInsertRowid);

    // Seed budget lines from event-type template
    for (const [category, pct] of Object.entries(BUDGET_TEMPLATES[d.type])) {
      const estimated = round2(((d.budget_total * pct) / 100) * ALLOCATION_FACTOR);
      insertRow(db, 'budget_items', id, {
        category,
        estimated,
        actual: 0,
        notes: 'Estimated allocation from template',
      });
    }

    // Seed labelled demo vendors
    for (const v of demoVendorsFor(d)) {
      insertRow(db, 'vendors', id, { ...v, available: 1, selected: 0, is_demo: 1 });
    }

    // Generate adaptive task timeline
    syncTimeline(db, id);

    return id;
  })();
}

/**
 * Persists a list of simulation `Change` objects atomically.
 * All changes succeed or all are rolled back.
 *
 * @security The server ALWAYS recomputes changes from the scenario body before
 *   calling this function (see `simulate/apply` in `app.ts`). The client never
 *   supplies the change list directly — only the scenario parameters.
 */
export function applyChangesDb(db: DB, eventId: number, changes: readonly Change[]): void {
  db.transaction(() => {
    for (const c of changes) {
      if (c.kind === 'budget_update') {
        updateRow(db, 'budget_items', eventId, c.id, { estimated: c.estimated });
      } else if (c.kind === 'budget_add') {
        insertRow(db, 'budget_items', eventId, {
          category: c.category,
          estimated: c.estimated,
          actual: 0,
          notes: c.notes,
        });
      } else if (c.kind === 'task_add') {
        insertRow(db, 'tasks', eventId, {
          title: c.title,
          category: c.category,
          due_date: c.due_date,
          status: 'todo',
          priority: c.priority,
        });
      } else if (c.kind === 'event_update') {
        const fields: Record<string, unknown> = {};
        if (c.guest_count !== undefined) fields.guest_count = c.guest_count;
        if (c.has_backup_plan !== undefined) fields.has_backup_plan = c.has_backup_plan;
        if (Object.keys(fields).length) {
          const cols = Object.keys(fields);
          db.prepare(
            `UPDATE events SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
          ).run(...(Object.values(fields) as never[]), eventId);
        }
      } else {
        // vendor_update
        const fields: Record<string, unknown> = {};
        if (c.price     !== undefined) fields.price     = c.price;
        if (c.available !== undefined) fields.available = c.available;
        if (c.selected  !== undefined) fields.selected  = c.selected;
        updateRow(db, 'vendors', eventId, c.id, fields);
      }
    }
  })();
}
