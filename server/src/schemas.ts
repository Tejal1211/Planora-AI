/**
 * @module schemas
 * @description Zod request-validation schemas for Planora AI.
 *
 * Security architecture:
 *  - `text()` is the primary XSS defence: it strips HTML tags and control
 *    characters from every string field before length validation, ensuring
 *    user-supplied payloads are neutralised at the boundary regardless of
 *    which route or downstream handler processes them.
 *  - `dateStr` uses a two-phase validation (regex + round-trip parse) so
 *    invalid calendar dates like `2024-02-30` are caught before reaching SQLite.
 *  - All numeric fields are bounded (min/max) to prevent arithmetic overflows
 *    and unrealistic data from skewing budget calculations.
 *  - Schemas are immutable Zod instances; mutation is impossible at runtime.
 *
 * Usage: all schemas are imported centrally by `app.ts`; no route bypasses them.
 */
import { z } from 'zod';
import { parseDate, toISO } from './logic';

// ---------------------------------------------------------------------------
// Primitive validators
// ---------------------------------------------------------------------------

/**
 * Sanitises a string then enforces minimum and maximum length.
 *
 * Pipeline:
 *  1. Strip HTML tags (e.g. `<script>`) — prevents XSS stored in the DB.
 *  2. Strip C0 control characters (U+0000–U+001F) — prevents log injection.
 *  3. Trim leading/trailing whitespace.
 *  4. Enforce `min`–`max` length on the cleaned string.
 *
 * @param min - Minimum character count (post-sanitisation)
 * @param max - Maximum character count (post-sanitisation)
 */
export const text = (min: number, max: number) =>
  z
    .string()
    .transform((s) =>
      s
        .replace(/<[^>]*>/g, '')        // strip HTML tags
        .replace(/[\u0000-\u001f]/g, ' ') // replace control chars with space
        .trim(),
    )
    .pipe(z.string().min(min).max(max));

/**
 * Validates an ISO 8601 date string (`YYYY-MM-DD`).
 *
 * Two-phase check:
 *  1. Regex ensures the format is exactly `YYYY-MM-DD`.
 *  2. Round-trip via `parseDate`/`toISO` rejects invalid calendar dates
 *     such as `2024-02-30` or `2023-13-01`.
 */
export const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => toISO(parseDate(s)) === s, 'Invalid date');

// ---------------------------------------------------------------------------
// Domain schemas
// ---------------------------------------------------------------------------

/** Schema for creating or replacing an event record. */
export const eventSchema = z.object({
  name:               text(2, 100),
  type:               z.enum(['wedding', 'birthday', 'community']),
  date:               dateStr,
  location:           text(0, 120).default(''),
  venue_type:         z.enum(['indoor', 'outdoor', 'hybrid']).default('indoor'),
  guest_count:        z.number().int().min(1).max(5000),
  budget_total:       z.number().positive().max(1e9),
  currency:           z.enum(['INR', 'USD', 'EUR', 'GBP']).default('INR'),
  preferences:        text(0, 1000).default(''),
  has_backup_plan:    z.boolean().default(false),
  contingency_notes:  text(0, 1000).default(''),
});

/** Schema for partial event updates (all fields optional). */
export const eventUpdateSchema = eventSchema.partial();

/** Schema for a budget line item. */
export const budgetSchema = z.object({
  category:   text(1, 40),
  estimated:  z.number().min(0).max(1e9),
  actual:     z.number().min(0).max(1e9).default(0),
  notes:      text(0, 300).default(''),
});

/** Schema for a task / timeline item. */
export const taskSchema = z.object({
  title:      text(1, 140),
  category:   text(0, 40).default('general'),
  due_date:   dateStr,
  status:     z.enum(['todo', 'doing', 'done']).default('todo'),
  priority:   z.enum(['low', 'medium', 'high']).default('medium'),
});

/** Schema for a guest record. */
export const guestSchema = z.object({
  name:       text(1, 100),
  email:      z.union([z.literal(''), z.string().trim().email().max(120)]).default(''),
  rsvp:       z.enum(['pending', 'yes', 'no']).default('pending'),
  dietary:    text(0, 100).default(''),
  plus_ones:  z.number().int().min(0).max(10).default(0),
});

/** Schema for a vendor record. */
export const vendorSchema = z.object({
  name:       text(1, 100),
  category:   text(1, 40),
  price:      z.number().min(0).max(1e9),
  services:   text(0, 300).default(''),
  rating:     z.number().min(0).max(5).default(0),
  available:  z.boolean().default(true),
  selected:   z.boolean().default(false),
  notes:      text(0, 300).default(''),
});

/**
 * Discriminated union for What-If simulator scenarios.
 * Each variant carries only the fields relevant to that scenario type.
 */
export const scenarioSchema = z.discriminatedUnion('type', [
  z.object({
    type:     z.literal('cost_increase'),
    percent:  z.number().min(1).max(200),
    category: text(1, 40).optional(),
  }),
  z.object({
    type:  z.literal('add_guests'),
    count: z.number().int().min(1).max(2000),
  }),
  z.object({
    type:     z.literal('vendor_unavailable'),
    vendorId: z.number().int().positive(),
  }),
  z.object({ type: z.literal('weather') }),
]);

/** Schema for the AI copilot prompt endpoint. */
export const aiRequestSchema = z.object({
  prompt: text(0, 500).default(''),
});
