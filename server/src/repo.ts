/**
 * @module repo
 * @description SQLite data-access helpers for Planora AI.
 *
 * All database I/O lives here. Route handlers in `app.ts` call these
 * functions; the planning engine in `logic.ts` is pure and never touches
 * the database directly.
 *
 * Key design choices:
 * - `loadState` fetches all five tables in one go and returns a typed `State`
 *   object; this avoids scattered queries in route handlers and makes tests easy.
 * - `createEventWithSeed` runs inside a transaction: event row + budget lines +
 *   demo vendors + timeline are either all created or all rolled back.
 * - `applyChangesDb` is also transactional: every simulation `apply` is atomic.
 * - Column names in INSERT/UPDATE are taken from validated Zod-parsed objects,
 *   never from raw user strings, so the only dynamic SQL is field-list expansion.
 */
import type { DB } from './db';
import { AppError } from './errors';
import { BUDGET_TEMPLATES, ALLOCATION_FACTOR, Change, EventRow, State, BudgetRow, TaskRow, GuestRow, VendorRow, demoVendorsFor, generateTimeline, round2, todayISO } from './logic';

/** Converts booleans to SQLite integers (0/1); passes all other values through unchanged. */
const toDb = (v: unknown) => (typeof v === 'boolean' ? (v ? 1 : 0) : v);

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
 * Uses five prepared queries in a single call; no transaction is needed
 * since SQLite reads are always consistent within a connection in WAL mode.
 */
export function loadState(db: DB, id: number): State {
  const q = <T>(t: string, order: string) => db.prepare(`SELECT * FROM ${t} WHERE event_id = ? ORDER BY ${order}`).all(id) as T[];
  return { event: getEvent(db, id), budget: q<BudgetRow>('budget_items', 'id'), tasks: q<TaskRow>('tasks', 'due_date, id'), guests: q<GuestRow>('guests', 'id'), vendors: q<VendorRow>('vendors', 'category, price') };
}

/**
 * Inserts a single row into any child table (`budget_items`, `tasks`, `guests`, `vendors`).
 * The caller is responsible for ensuring `data` contains only valid, Zod-validated keys.
 * @returns The auto-generated primary key of the new row.
 */
export function insertRow(db: DB, table: string, eventId: number, data: Record<string, unknown>): number {
  const cols = Object.keys(data);
  const r = db.prepare(`INSERT INTO ${table} (event_id, ${cols.join(',')}) VALUES (?, ${cols.map(() => '?').join(',')})`).run(eventId, ...cols.map((c) => toDb(data[c])) as never[]);
  return Number(r.lastInsertRowid);
}
/**
 * Updates a single row in any child table.
 * Requires at least one field in `data`.
 * @throws {AppError} 400 if `data` is empty.
 * @throws {AppError} 404 if the row does not exist for this event.
 */
export function updateRow(db: DB, table: string, eventId: number, id: number, data: Record<string, unknown>) {
  const cols = Object.keys(data);
  if (!cols.length) throw new AppError(400, 'No fields to update');
  const r = db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND event_id = ?`).run(...cols.map((c) => toDb(data[c])) as never[], id, eventId);
  if (!r.changes) throw new AppError(404, 'Record not found');
}

/**
 * Synchronises the task timeline for an event:
 * - Adds any template tasks that are not yet present (matched by exact title).
 * - Re-spaces existing open (not-done) tasks to new compressed deadlines.
 * - Never modifies tasks that are already marked `done`.
 *
 * Called automatically on event creation, on date change, and on manual
 * regeneration via `POST /events/:id/timeline/regenerate`.
 */
export function syncTimeline(db: DB, eventId: number, today = todayISO()) {
  const ev = getEvent(db, eventId);
  const existing = db.prepare('SELECT id, title, status FROM tasks WHERE event_id = ?').all(eventId) as { id: number; title: string; status: string }[];
  for (const t of generateTimeline(ev, today)) {
    const hit = existing.find((x) => x.title === t.title);
    if (!hit) insertRow(db, 'tasks', eventId, { ...t, status: 'todo' });
    else if (hit.status !== 'done') db.prepare('UPDATE tasks SET due_date = ? WHERE id = ?').run(t.due_date, hit.id);
  }
}

/**
 * Creates an event and atomically seeds all related data in a single transaction:
 * 1. Inserts the event row.
 * 2. Seeds proportional budget lines from `BUDGET_TEMPLATES` (keeping 10% as a
 *    contingency buffer via `ALLOCATION_FACTOR`).
 * 3. Inserts clearly-labelled demonstration vendors with estimated prices.
 * 4. Generates and inserts an adaptive task timeline.
 *
 * @returns The auto-generated event `id`.
 */
export function createEventWithSeed(db: DB, d: Record<string, unknown> & { type: keyof typeof BUDGET_TEMPLATES; budget_total: number }): number {
  return db.transaction(() => {
    const cols = Object.keys(d);
    const r = db.prepare(`INSERT INTO events (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map((c) => toDb(d[c])) as never[]);
    const id = Number(r.lastInsertRowid);
    for (const [category, pct] of Object.entries(BUDGET_TEMPLATES[d.type]))
      insertRow(db, 'budget_items', id, { category, estimated: round2((d.budget_total * pct / 100) * ALLOCATION_FACTOR), actual: 0, notes: 'Estimated allocation from template' });
    for (const v of demoVendorsFor(d)) insertRow(db, 'vendors', id, { ...v, available: 1, selected: 0, is_demo: 1 });
    syncTimeline(db, id);
    return id;
  })();
}

/**
 * Persists a list of simulation `Change` objects atomically.
 * All changes succeed or all are rolled back.
 * The server always recomputes changes before calling this function
 * (see `simulate/apply` in `app.ts`) — the client-supplied scenario
 * body is never trusted.
 */
export function applyChangesDb(db: DB, eventId: number, changes: Change[]) {
  db.transaction(() => {
    for (const c of changes) {
      if (c.kind === 'budget_update') updateRow(db, 'budget_items', eventId, c.id, { estimated: c.estimated });
      else if (c.kind === 'budget_add') insertRow(db, 'budget_items', eventId, { category: c.category, estimated: c.estimated, actual: 0, notes: c.notes });
      else if (c.kind === 'task_add') insertRow(db, 'tasks', eventId, { title: c.title, category: c.category, due_date: c.due_date, status: 'todo', priority: c.priority });
      else if (c.kind === 'event_update') {
        const f: Record<string, unknown> = {};
        if (c.guest_count !== undefined) f.guest_count = c.guest_count;
        if (c.has_backup_plan !== undefined) f.has_backup_plan = c.has_backup_plan;
        const cols = Object.keys(f);
        if (cols.length) db.prepare(`UPDATE events SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(f) as never[], eventId);
      } else {
        const f: Record<string, unknown> = {};
        if (c.price !== undefined) f.price = c.price;
        if (c.available !== undefined) f.available = c.available;
        if (c.selected !== undefined) f.selected = c.selected;
        updateRow(db, 'vendors', eventId, c.id, f);
      }
    }
  })();
}
