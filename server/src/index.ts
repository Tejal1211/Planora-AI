/**
 * @file index.ts
 * @description Production entry point for the Planora AI server.
 *
 * Reads configuration from environment variables (via dotenv), opens the
 * SQLite database, creates the Express application and starts listening.
 *
 * Environment variables:
 *  - PORT           — TCP port to listen on (default: 4000)
 *  - DATABASE_PATH  — Path to the SQLite database file (default: ./data/planora.db)
 *  - CORS_ORIGINS   — Comma-separated list of allowed CORS origins
 *                     (default: http://localhost:5173)
 *  - CLIENT_DIST    — Path to the built client bundle for static serving
 *  - GEMINI_API_KEY — Google Gemini API key (omit to use the fallback rule-based plan)
 *  - GEMINI_MODEL   — Gemini model name (default: gemini-2.5-flash)
 *
 * Security notes:
 *  - PORT is clamped to a valid TCP range (1–65535); invalid values fall back to 4000.
 *  - DATABASE_PATH is resolved to an absolute path to prevent path traversal.
 *  - GEMINI_API_KEY is never logged or included in any API response.
 */
import 'dotenv/config';
import path from 'node:path';
import { createApp } from './app';
import { openDb } from './db';

/** Clamps a value to a valid TCP port range. Falls back to `defaultPort` if out of range. */
function resolvePort(raw: string | undefined, defaultPort: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 65_535 ? n : defaultPort;
}

const port = resolvePort(process.env.PORT, 4000);
const dbPath = path.resolve(process.env.DATABASE_PATH ?? './data/planora.db');
const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const clientDist = process.env.CLIENT_DIST ?? path.resolve(process.cwd(), '../client/dist');

const db = openDb(dbPath);
const app = createApp(db, { corsOrigins, clientDist });

app.listen(port, () => {
  const aiMode = process.env.GEMINI_API_KEY?.trim() ? 'gemini' : 'fallback';
  console.log(`Planora API listening on http://localhost:${port} (AI mode: ${aiMode})`);
});
