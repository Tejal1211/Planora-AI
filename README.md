# Planora AI - Intelligent Event Planner

**Chosen vertical: event planning** for people organising weddings, birthdays, and community events.
**React + TypeScript + Vite + Tailwind + Recharts** frontend · **Express + TypeScript** REST API · **SQLite** persistence ·
**Gemini** AI through the backend only, with a deterministic fallback when no key is set.

## Quick start
Requires Node 20.19+ or Node 22.12+ (tested on Node 22).
```bash
npm run install:all
cp .env.example server/.env        # optional: add GEMINI_API_KEY
npm run dev:server                 # API on :4000
npm run dev:client                 # UI on :5173 (proxies /api)
```
Production-style single process: `npm run build && npm start` then open http://localhost:4000 (the API serves `client/dist`).
Tests: `npm test` (Vitest: 34 API/logic tests + 12 frontend tests). The SQLite file (`server/data/planora.db`) is created automatically on first start.

## Challenge approach and assumptions
The app treats the organiser as the primary persona and keeps event records locally in SQLite for a single user. It seeds a practical plan from event date, type, budget and guest count; deterministic server logic handles money, deadlines, vendor ranking and readiness. The optional Gemini copilot receives saved event context but does not calculate financial figures. If Gemini is unavailable or returns invalid output, the app uses a deterministic fallback.

All vendor entries and prices are synthetic estimates, not real businesses or quotes. Readiness weights and budget-flexibility rules are transparent heuristics, not professional advice. The app assumes one trusted local operator; it does not provide accounts, multi-user access, email delivery or cloud hosting. Do not enter sensitive personal data. A Gemini API key is optional and must remain in `server/.env`.

## Design principles
* **Deterministic money.** Budget totals, overruns, rescue cuts, readiness and simulations live in `server/src/logic.ts`. The AI never calculates figures; it receives them as context.
* **AI is optional and safe.** `GEMINI_API_KEY` stays server-side. Model output is sanitised (tags/control chars stripped), length-limited and validated with Zod; any failure falls back to a rule-based plan. The UI labels the mode ("Gemini" vs "Fallback (rule-based)"). User prompts are length-limited and the endpoint is rate-limited.
* **Preview before apply.** Simulations are computed on an in-memory copy; `apply` recomputes server-side and writes in one transaction.
* **Honest data.** All vendors are generated *demonstration* data with *estimated* prices and are labelled as such in the UI, API notes and report.
* **Security basics.** Helmet + CSP, explicit CORS allow-list (`CORS_ORIGINS`), 100 kB body limit, parameterised SQL, Zod validation, centralised error handler (no internals leaked), `.env` ignored by git.

## Layout
```
server/src  app.ts (routes) · logic.ts (engine) · ai.ts · repo.ts · schemas.ts · db.ts · *.test.ts
client/src  App.tsx · api.ts · ui.tsx (components/hooks) · pages/* · *.test.ts(x)
docs/API.md endpoint reference
```

## Known limits
Single-user (no authentication or multi-tenancy); no email sending; vendor data is synthetic; the "report" PDF uses the browser's Print-to-PDF; the readiness weights and category flexibility factors are documented heuristics, not industry standards.

## Publishing to GitHub (single `main` branch)
Before submitting, verify the repository is public, has only the `main` branch, and is under 10 MB. Do not commit `.env`, API keys, SQLite data, `node_modules`, or build output. Give evaluators access to any linked demo video.

```bash
git init -b main && git add . && git commit -m "Initial commit"
git remote add origin <your-repo-url> && git push -u origin main
```
