import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('wedding','birthday','community')),
  date TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  venue_type TEXT NOT NULL DEFAULT 'indoor' CHECK (venue_type IN ('indoor','outdoor','hybrid')),
  guest_count INTEGER NOT NULL CHECK (guest_count > 0),
  budget_total REAL NOT NULL CHECK (budget_total > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  preferences TEXT NOT NULL DEFAULT '',
  has_backup_plan INTEGER NOT NULL DEFAULT 0,
  contingency_notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS budget_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  estimated REAL NOT NULL DEFAULT 0,
  actual REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high'))
);
CREATE TABLE IF NOT EXISTS guests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  rsvp TEXT NOT NULL DEFAULT 'pending' CHECK (rsvp IN ('pending','yes','no')),
  dietary TEXT NOT NULL DEFAULT '',
  plus_ones INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  services TEXT NOT NULL DEFAULT '',
  rating REAL NOT NULL DEFAULT 0,
  available INTEGER NOT NULL DEFAULT 1,
  selected INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_budget_event ON budget_items(event_id);
CREATE INDEX IF NOT EXISTS idx_tasks_event ON tasks(event_id);
CREATE INDEX IF NOT EXISTS idx_guests_event ON guests(event_id);
CREATE INDEX IF NOT EXISTS idx_vendors_event ON vendors(event_id);
`;

/** Opens (and initialises) the SQLite database. Use ':memory:' for tests. */
export function openDb(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}
