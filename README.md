# Planora AI — Intelligent Event Planner

> **Challenge vertical: Smart Event Planning Assistant** for people organising weddings, birthdays, and community events.

**Tech stack:** React 18 + TypeScript + Vite + Tailwind CSS + Recharts (frontend) · Express 4 + TypeScript + SQLite (backend) · Gemini AI with deterministic fallback · Vitest (46 passing tests)


## Quick Start

Requires **Node 20.19+ or 22.12+** (tested on Node 22).

```bash
# 1. Install dependencies
npm run install:all

# 2. (Optional) Configure Gemini API key for AI mode
cp .env.example server/.env
# Then edit server/.env and set GEMINI_API_KEY=your_key_here

# 3. Start the backend (API on :4000)
npm run dev:server

# 4. In a second terminal, start the frontend (UI on :5173)
npm run dev:client
```

**Production (single process):**
```bash
npm run build && npm start
# then open http://localhost:4000
```

**Tests (46 total, all passing):**
```bash
npm test --prefix server   # 34 tests: API integration + logic unit
npm test --prefix client   # 12 tests: UI components + API client + Wizard
```

The SQLite file (`server/data/planora.db`) is created automatically on first run.

---

## Chosen Vertical & Problem It Solves

**Vertical: Intelligent Event Planning Assistant**

Event planning is stressful because it involves many interdependent decisions—budget allocation, vendor selection, deadline tracking, guest management—that traditional spreadsheets handle poorly and generic AI handles incorrectly (hallucinating prices or missing context).

**Planora AI solves this by:**
1. Grounding every AI recommendation in the user's *actual saved data* (budget, tasks, vendors, guests)
2. Keeping all financial calculations deterministic and auditable—the AI *never* computes money
3. Giving the organiser a transparent 100-point readiness score they can verify component by component
4. Letting them preview "what-if" scenarios (cost shocks, extra guests, vendor dropping out, bad weather) before committing

---

## Approach & Logic

### Architecture

```
┌─────────────────────────────────────────────────────┐
│  Client (React + Vite)                              │
│  Landing · Wizard · Dashboard · AI Copilot          │
│  Budget · Timeline · Vendors · Guests               │
│  Simulator · Report                                  │
└──────────────────┬──────────────────────────────────┘
                   │ REST API  /api/*
┌──────────────────▼──────────────────────────────────┐
│  Express 4 + TypeScript                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ app.ts   │  │ logic.ts │  │ ai.ts            │  │
│  │ (routes) │  │ (engine) │  │ (Gemini + strip) │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ repo.ts  │  │ schemas  │  │ db.ts (SQLite)   │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Core Design Principles

#### 1. Deterministic Money — AI Never Calculates Figures
All budget maths, overrun detection, rescue suggestions, readiness scoring, vendor ranking and simulations live in `server/src/logic.ts`. This module is pure TypeScript with no side effects and is covered by 17 unit tests. The Gemini model receives pre-computed figures as context; it only drafts advice.

#### 2. AI Is Optional, Safe, and Transparent
- The `GEMINI_API_KEY` never leaves the server
- Model output is sanitised (HTML tags and control characters stripped), length-capped, and validated with Zod
- Any failure (network error, invalid JSON, schema mismatch) falls back silently to a deterministic rule-based plan
- The UI always labels which mode is active: **Gemini** vs **Fallback (rule-based)**
- User prompts are length-limited (500 chars) and the endpoint is rate-limited (20 req/min per IP)

#### 3. Preview Before Apply
The Simulator runs scenarios on an in-memory copy of the event state. The user sees a full diff (before/after snapshot) before deciding to persist. The `apply` endpoint recomputes the scenario server-side and writes all changes in a single SQLite transaction—the client result is never trusted.

#### 4. Adaptive Timeline
Task deadlines are generated from event type and date, then *compressed proportionally* when the event is close. If the event is 14 days away and a template calls for something 120 days out, it is rescheduled to today so no task is in the past. Outdoor/hybrid events automatically get a weather-contingency task.

#### 5. Vendor Matching Score (0–100)
Each vendor is scored across four dimensions:
- **Price fit** (40 pts) — how well the price fits the allocated category budget
- **Rating** (25 pts) — vendor's star rating / 5
- **Preference match** (20 pts) — keyword overlap with the organiser's stated preferences
- **Availability** (15 pts) — binary; unavailable vendors are ranked last and flagged ineligible

#### 6. Budget Rescue Engine
When the event is over budget, the rescue engine identifies which *unpaid* budget lines have the most flexibility (e.g. decor is most flexible at 30%, venue least at 5%) and proposes cuts with explicit trade-off text. If cuts cannot cover the overrun, it suggests a guest count reduction as a last resort.

#### 7. Readiness Score (0–100, transparent)
| Component | Weight | Full score condition |
|---|---|---|
| Budget health | 30 | Committed spend ≤ 90% of total |
| Task progress | 30 | All tasks done, zero overdue |
| Vendor status | 25 | All essential categories have an available, selected vendor |
| Contingency | 15 | 10% budget buffer + weather/backup plan + backup vendors |

---

## How the Solution Works — Feature Walk-through

1. **Wizard** — 3-step setup collects event name, type, date, venue, guests, budget, currency and preferences. On creation, the server seeds a proportional budget (8 categories, keeping 10% as a buffer), an adaptive task timeline, and clearly-labelled demo vendors with estimated prices.

2. **Dashboard** — At-a-glance stats (days to go, readiness score, budget used, tasks done), budget charts (pie + estimated vs actual bar), readiness breakdown with progress bars, and a quick settings form.

3. **AI Copilot** — Free-text prompt (optional), grounded in saved event context. Shows mode badge, summary, recommendations, risks and a suggested checklist with one-click task addition.

4. **Budget** — Line-item CRUD with estimated and actual amounts. Live summary (total, committed, remaining, status). Budget Rescue panel appears automatically when over budget.

5. **Timeline** — Kanban-style task list with overdue flags, priority badges and status updates. One-click regenerate recalculates all open deadlines from the current date.

6. **Vendors** — Add real vendors; compare via the Match tab which shows ranked score breakdowns and reasons. Selecting one vendor in a category auto-deselects others. Unavailable vendors cannot be selected.

7. **Guests** — RSVP management with plus-ones and dietary notes. Summary counts confirmed vs expected headcount.

8. **Simulator** — Four scenario types (cost increase, add guests, vendor dropout, weather) with full before/after diff. Apply commits changes server-side atomically.

9. **Report** — Aggregated JSON report with disclaimer, printable via browser Print-to-PDF.

---

## Project Layout

```
planora-ai/
├── package.json          # Workspace scripts (install:all, dev:server, dev:client, test)
├── README.md             # This file
├── .env.example          # Environment variable template
├── docs/
│   └── API.md            # REST API reference
├── server/
│   └── src/
│       ├── index.ts      # Entry point (openDb → createApp → listen)
│       ├── app.ts        # Express routes, middleware, error handler
│       ├── logic.ts      # Deterministic engine (budget, timeline, vendors, readiness, simulation)
│       ├── ai.ts         # Gemini integration, prompt builder, output sanitiser
│       ├── repo.ts       # SQLite read/write helpers (loadState, insertRow, etc.)
│       ├── schemas.ts    # Zod request schemas (HTML-stripping text validator)
│       ├── db.ts         # Database schema + openDb()
│       ├── errors.ts     # AppError class
│       ├── api.test.ts   # 17 integration tests (supertest + in-memory SQLite)
│       └── logic.test.ts # 17 unit tests (pure logic, no I/O)
└── client/
    └── src/
        ├── main.tsx      # React entry point
        ├── App.tsx       # Root component, routing, sidebar nav
        ├── api.ts        # Typed fetch wrapper (ApiError, request)
        ├── ui.tsx        # Shared components (Button, Card, Alert, Spinner, hooks)
        ├── types.ts      # Shared TypeScript types
        ├── format.ts     # Money, date, label formatters
        ├── index.css     # Tailwind theme tokens + component classes
        ├── format.test.ts# 4 formatter unit tests
        ├── ui.test.tsx   # 4 component + 3 API + 1 Wizard integration tests
        └── pages/        # Lazy-loaded page components (Landing, Wizard, Dashboard, …)
```

---

## Security Notes

- **Helmet** (Content-Security-Policy, X-Frame-Options, etc.) — configured in `app.ts`
- **CORS** — explicit allow-list; defaults to `http://localhost:5173`; configurable via `CORS_ORIGINS`
- **Body size limit** — 100 kB (`express.json({ limit: '100kb' })`)
- **Rate limiting** — 20 AI requests / minute / IP (in-memory; use Redis in production)
- **Input validation** — all routes validated with Zod; invalid IDs throw `AppError(400)`
- **HTML sanitisation** — all text fields strip `<tags>` and control characters server-side
- **Parameterised SQL** — `better-sqlite3` prepared statements; no string interpolation in user data
- **No key leakage** — `GEMINI_API_KEY` is never sent to the client or logged
- **Error handling** — centralised handler returns generic `"Internal server error"` (no stack traces)
- **`.gitignore`** — excludes `.env`, `*.db`, `node_modules`, `dist`

See [`docs/SECURITY.md`](docs/SECURITY.md) for the full threat model and mitigations.

---

## Assumptions Made

- **Single trusted operator** — no authentication, multi-tenancy or role-based access control; suitable for a single user running locally
- **Local data only** — all data is stored in SQLite on the server; no cloud sync, email delivery or mobile app
- **Demo vendors** — all seeded vendors are synthetic demonstration data with estimated prices; they are not real businesses or verified quotes. Every vendor is labelled `is_demo = 1` in the database and the UI/report display a disclaimer
- **Readiness heuristics** — the weights (budget 30, tasks 30, vendors 25, contingency 15) and budget-flexibility factors (decor 30%, venue 5%, etc.) are transparent, documented heuristics, not industry standards or legal/financial advice
- **Gemini API** — optional; the app is fully functional without it; the fallback plan is deterministic and always available
- **Print-to-PDF** — the "report" page is designed for the browser's built-in Print dialog; a native PDF export library was not added to keep the repository under the 10 MB limit
- **Currency** — supported: INR (default), USD, EUR, GBP; formatting uses `Intl.NumberFormat`

---

## Known Limits

| Limit | Note |
|---|---|
| No authentication | Suitable for local/single-user use only |
| No email sending | RSVP collection is manual |
| Vendor data is synthetic | Replace with real vendor database for production |
| In-memory rate limiter | Resets on server restart; use Redis for production |
| SQLite only | No horizontal scaling; sufficient for the challenge scope |
| No offline mode | Client requires the local Express server to be running |

---

## Publishing to GitHub

Before submitting, ensure:
- Repository is **public**
- Has exactly **one branch** (`main`)
- Repository size is **under 10 MB** (no `node_modules`, `dist`, `.env` or `*.db` files — all excluded by `.gitignore`)

```bash
git init -b main
git add .
git commit -m "feat: Planora AI - intelligent event planning assistant"
git remote add origin <your-repo-url>
git push -u origin main
```
