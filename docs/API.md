# Planora AI — REST API Reference

**Base URL:** `http://localhost:4000/api`  
**Format:** JSON in · JSON out  
**Auth:** None (local single-user app)

## Error Responses

All errors return a consistent JSON body:

```json
{ "error": "Human-readable message", "details": [{ "path": "field", "message": "reason" }] }
```

| Status | Cause |
|---|---|
| `400` | Validation failure (Zod) — `details` array contains field-level errors |
| `400` | Malformed JSON body |
| `404` | Resource not found |
| `429` | AI rate limit exceeded (20 req / 60 s / IP) |
| `500` | Internal server error (generic message only; no internals leaked) |

**Notes:**
- Booleans are accepted as `true`/`false` in request bodies
- Boolean fields are returned as `0`/`1` in SQLite-backed responses
- Dates are always `YYYY-MM-DD`
- All text fields are HTML-sanitised server-side (tags and control characters stripped)

---

## Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Returns `{ status: "ok", ai: "gemini"\|"fallback", time: ISO }` |

---

## Events

| Method | Path | Description |
|---|---|---|
| `GET` | `/events` | List all events ordered by date |
| `POST` | `/events` | Create event (seeds budget, adaptive timeline, demo vendors) |
| `GET` | `/events/:id` | Get single event |
| `PUT` | `/events/:id` | Partial update (date change re-syncs open task deadlines) |
| `DELETE` | `/events/:id` | Delete event and cascade-delete all child rows |

### POST /events body

```json
{
  "name": "Asha & Ravi's Wedding",
  "type": "wedding",
  "date": "2027-02-14",
  "location": "Mumbai",
  "venue_type": "outdoor",
  "guest_count": 150,
  "budget_total": 1000000,
  "currency": "INR",
  "preferences": "vegetarian live music",
  "has_backup_plan": false,
  "contingency_notes": ""
}
```

| Field | Type | Constraints |
|---|---|---|
| `name` | string | 2–100 chars |
| `type` | enum | `wedding` \| `birthday` \| `community` |
| `date` | string | `YYYY-MM-DD`, must be a valid calendar date |
| `location` | string | 0–120 chars |
| `venue_type` | enum | `indoor` \| `outdoor` \| `hybrid` |
| `guest_count` | integer | 1–5000 |
| `budget_total` | number | > 0, ≤ 1,000,000,000 |
| `currency` | enum | `INR` \| `USD` \| `EUR` \| `GBP` |
| `preferences` | string | 0–1000 chars |

---

## Budget

| Method | Path | Description |
|---|---|---|
| `GET` | `/events/:id/budget` | Returns `{ items, summary, rescue }` |
| `POST` | `/events/:id/budget` | Add budget line |
| `PUT` | `/events/:id/budget/:rid` | Partial update |
| `DELETE` | `/events/:id/budget/:rid` | Delete line |

**summary fields:** `total`, `estimated`, `actual`, `committed`, `remaining`, `overrun`, `usedPct`, `status` (`healthy`/`warning`/`over`), `byCategory`

**rescue fields:** `overrun`, `covered`, `shortfall`, `suggestions[]`, `guestReduction`, `message`

---

## Tasks

| Method | Path | Description |
|---|---|---|
| `GET` | `/events/:id/tasks` | Returns `{ tasks (with overdue flag), stats }` |
| `POST` | `/events/:id/tasks` | Add task |
| `PUT` | `/events/:id/tasks/:rid` | Partial update |
| `DELETE` | `/events/:id/tasks/:rid` | Delete task |
| `POST` | `/events/:id/timeline/regenerate` | Re-space open deadlines from today |

**stats fields:** `total`, `done`, `progress`, `overdue`, `overdueIds`, `dueSoon`

---

## Guests

| Method | Path | Description |
|---|---|---|
| `GET` | `/events/:id/guests` | Returns `{ guests, summary }` |
| `POST` | `/events/:id/guests` | Add guest |
| `PUT` | `/events/:id/guests/:rid` | Partial update |
| `DELETE` | `/events/:id/guests/:rid` | Delete guest |

**summary fields:** `total`, `yes`, `no`, `pending`, `confirmedHeadcount`, `expectedHeadcount`, `plannedGuestCount`

---

## Vendors

| Method | Path | Description |
|---|---|---|
| `GET` | `/events/:id/vendors` | All vendors for the event |
| `POST` | `/events/:id/vendors` | Add vendor |
| `PUT` | `/events/:id/vendors/:rid` | Partial update (selecting a vendor deselects others in its category; unavailable vendors cannot be selected) |
| `DELETE` | `/events/:id/vendors/:rid` | Delete vendor |
| `GET` | `/events/:id/vendors/match?category=catering` | Ranked score breakdown per vendor (requires `category` query param) |

---

## Readiness

| Method | Path | Description |
|---|---|---|
| `GET` | `/events/:id/readiness` | Returns `{ score, label, components[], nextActions[] }` |

### Readiness Score (100 points total)

| Component | Weight | Full score condition |
|---|---|---|
| Budget health | 30 | Committed spend ≤ 90% of total |
| Task progress | 30 | All tasks done, zero overdue |
| Vendor status | 25 | All essential categories have an available, selected vendor |
| Contingency | 15 | 10% budget buffer + weather/backup plan + backup vendors |

---

## AI Copilot

| Method | Path | Description |
|---|---|---|
| `POST` | `/events/:id/ai/plan` | Generate a plan grounded in the event's saved data |

**Request body:** `{ "prompt": "optional free-text question (max 500 chars)" }`

**Response:** `{ "mode": "gemini"|"fallback", "reason"?: string, "plan": { "summary", "recommendations", "checklist", "risks" } }`

**Rate limit:** 20 requests per 60 seconds per IP address.

---

## Simulation (What-If)

| Method | Path | Description |
|---|---|---|
| `POST` | `/events/:id/simulate` | Preview scenario (no writes) — returns `{ title, notes, changes, before, after, rescue }` |
| `POST` | `/events/:id/simulate/apply` | Recomputes scenario server-side and persists it atomically |

### Scenario bodies

```json
{ "type": "cost_increase", "percent": 15, "category": "catering" }
{ "type": "add_guests",    "count": 25 }
{ "type": "vendor_unavailable", "vendorId": 7 }
{ "type": "weather" }
```

| Type | `percent` | `count` | `category` | `vendorId` |
|---|---|---|---|---|
| `cost_increase` | 1–200 required | — | optional (scopes to one category) | — |
| `add_guests` | — | 1–2000 required | — | — |
| `vendor_unavailable` | — | — | — | integer required |
| `weather` | — | — | — | — |

---

## Report

| Method | Path | Description |
|---|---|---|
| `GET` | `/events/:id/report` | Aggregated report: event, budget, tasks, guests, vendors, readiness, disclaimer |
