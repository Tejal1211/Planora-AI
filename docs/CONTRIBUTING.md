# Contributing to Planora AI

Thank you for your interest in this project! This guide explains how to set up, test, and submit changes.

## Prerequisites

- Node 20.19+ or 22.12+ (Node 22 LTS recommended)
- Git
- A text editor or IDE with TypeScript support

## Local Setup

```bash
# Install all dependencies
npm run install:all

# Optional: configure Gemini AI
cp .env.example server/.env
# Edit server/.env and set GEMINI_API_KEY=your_key

# Start both servers (two terminals)
npm run dev:server   # API on http://localhost:4000
npm run dev:client   # UI on http://localhost:5173
```

## Project Structure

| Directory | Purpose |
|---|---|
| `server/src/logic.ts` | **Core planning engine** — budget, timeline, vendors, readiness, simulation. Pure TypeScript, no I/O. |
| `server/src/app.ts` | Express routes, middleware, error handling |
| `server/src/ai.ts` | Gemini integration, prompt construction, output sanitisation |
| `server/src/repo.ts` | SQLite queries (all DB I/O lives here) |
| `server/src/schemas.ts` | Zod input validation + HTML sanitisation |
| `server/src/db.ts` | Database schema + connection factory |
| `client/src/pages/` | Lazy-loaded React page components |
| `client/src/ui.tsx` | Shared UI primitives and hooks |
| `docs/` | API reference and security policy |

## Running Tests

```bash
# All server tests (57 tests: integration + unit)
npm test --prefix server

# All client tests (12 tests: components + API + Wizard)
npm test --prefix client
```

All tests must pass before submitting a pull request.

## Code Style Guidelines

- **TypeScript strict mode** — avoid `any`; use explicit types or inference
- **Pure functions** — all planning logic in `logic.ts` must remain side-effect free (`@pure` JSDoc tag)
- **JSDoc** — add JSDoc to all exported functions; include `@throws` where applicable
- **Zod validation** — all user input must be validated before use; use the `text()` helper in `schemas.ts` for string fields
- **No financial calculations in AI** — the Gemini prompt must only receive pre-computed figures; never let the model calculate money
- **Error handling** — use `AppError` for expected errors; let the central handler in `app.ts` format responses

## Security Rules

- Never log the `GEMINI_API_KEY` or any credential
- Never trust client-supplied IDs without verifying ownership via `event_id` join
- Always use `better-sqlite3` prepared statements; no string interpolation for user data
- Strip HTML from all text fields before storing or returning them
- See [`docs/SECURITY.md`](SECURITY.md) for the full threat model

## Commit Messages

Use conventional commits format:

```
feat: add weather scenario to simulator
fix: prevent division by zero in budget summary with zero total
docs: update API.md with full field constraints
test: add boundary tests for guest_count validation
refactor: extract vendor scoring into a helper function
```

## Architecture Decisions

### Why SQLite?
Lightweight, zero-config, file-based. Sufficient for a single-user local tool. Upgrade to PostgreSQL for multi-user deployment.

### Why deterministic logic?
Financial calculations that live in `logic.ts` are:
- Unit-testable without a database
- Reproducible across environments
- Never hallucinated by an AI model

### Why a fallback plan?
The app must be useful even without a Gemini API key. The rule-based fallback in `logic.ts` uses the same state the AI would receive, ensuring outputs are always grounded in real data.
