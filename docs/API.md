# Planora AI - REST API

Base URL: `http://localhost:4000/api`. JSON in/out. Errors: `{ "error": string, "details"?: [{path, message}] }`
with status `400` (validation), `404`, `429` (AI rate limit) or `500` (generic message only).
Booleans are accepted as `true/false` on write and returned as `0/1` on read. Dates are `YYYY-MM-DD`.

| Method & path | Purpose |
|---|---|
| `GET /health` | `{status, ai: "gemini" \| "fallback"}` |
| `GET /events` · `POST /events` | List / create event (seeds budget, adaptive timeline, **demo** vendors) |
| `GET/PUT/DELETE /events/:id` | Read / update (date change re-syncs open task deadlines) / delete (cascades) |
| `GET /events/:id/budget` | `{items, summary, rescue}` - all maths deterministic |
| `GET /events/:id/tasks` | `{tasks (with overdue flag), stats}` |
| `POST /events/:id/timeline/regenerate` | Add missing template tasks, re-space open ones |
| `GET /events/:id/guests` | `{guests, summary}` (RSVP counts, headcount incl. plus-ones) |
| `GET /events/:id/vendors` | All vendors |
| `GET /events/:id/vendors/match?category=catering` | Ranked vendors with score breakdown + reasons |
| `POST /events/:id/{budget\|tasks\|guests\|vendors}` | Create row (returns `{id}`) |
| `PUT /events/:id/{budget\|tasks\|guests\|vendors}/:rid` | Partial update. Selecting a vendor deselects others in its category; unavailable vendors cannot be selected |
| `DELETE /events/:id/{...}/:rid` | Delete row (204) |
| `GET /events/:id/readiness` | `{score, label, components[{weight, points, detail}], nextActions}` |
| `POST /events/:id/ai/plan` `{prompt?}` | `{mode: "gemini"\|"fallback", reason?, plan:{summary, recommendations, checklist, risks}}` |
| `POST /events/:id/simulate` | Preview a scenario (no writes): `{title, notes, changes, before, after, rescue}` |
| `POST /events/:id/simulate/apply` | Recomputes the scenario **server-side** and persists it atomically |
| `GET /events/:id/report` | Aggregated report incl. demo-data disclaimer |

## Scenarios
```json
{"type":"cost_increase","percent":15,"category":"catering"}
{"type":"add_guests","count":25}
{"type":"vendor_unavailable","vendorId":7}
{"type":"weather"}
```

## Readiness score (100 points)
Budget health 30 (full at <=90% committed, zero at 130%) - Task progress 30 (done share minus half the overdue share) -
Vendor status 25 (essential categories with an available selected vendor) - Contingency 15 (10% buffer, weather/backup plan, backup vendors).
