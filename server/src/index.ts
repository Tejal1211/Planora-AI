import 'dotenv/config';
import path from 'node:path';
import { createApp } from './app';
import { openDb } from './db';

const port = Number(process.env.PORT ?? 4000);
const db = openDb(process.env.DATABASE_PATH ?? './data/planora.db');
const app = createApp(db, {
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  clientDist: process.env.CLIENT_DIST ?? path.resolve(process.cwd(), '../client/dist'),
});
app.listen(port, () => console.log(`Planora API on http://localhost:${port} (AI mode: ${process.env.GEMINI_API_KEY ? 'gemini' : 'fallback'})`));
