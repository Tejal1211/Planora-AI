/**
 * @module format
 * @description Pure formatting utilities for the Planora AI client.
 *
 * All functions are side-effect-free and fully tree-shakeable.
 * Heavy `Intl` constructors are created once per locale/currency pair
 * and reused via a tiny module-level cache to avoid per-render allocation.
 */

/** Cache for `Intl.NumberFormat` instances keyed by `${locale}-${currency}`. */
const fmtCache = new Map<string, Intl.NumberFormat>();

/**
 * Formats a number as a locale-aware currency string.
 * The formatter is memoised per currency to avoid repeated `Intl` construction.
 *
 * @param n   - Amount to format
 * @param cur - ISO 4217 currency code (default: 'INR')
 */
export const money = (n: number, cur = 'INR'): string => {
  const key = `en-IN-${cur}`;
  if (!fmtCache.has(key)) {
    fmtCache.set(key, new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur, maximumFractionDigits: 0 }));
  }
  return fmtCache.get(key)!.format(n);
};

/**
 * Converts a snake_case or lowercase category key to a human-readable label
 * with the first letter capitalised.
 *
 * @example label('av_equipment') → 'Av equipment'
 */
export const label = (c: string): string => c.replace(/_/g, ' ').replace(/^\w/, (m) => m.toUpperCase());

/**
 * Returns the number of calendar days from today (UTC midnight) to `date`.
 * Positive when `date` is in the future; negative when in the past.
 *
 * @param date - ISO date string `YYYY-MM-DD`
 * @param now  - Reference date (defaults to `new Date()`)
 */
export const daysUntil = (date: string, now = new Date()): number => {
  const t = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
  const n = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((t - n) / 86_400_000);
};

/**
 * Formats an ISO date string for display using the Indian locale.
 *
 * @example fmtDate('2026-12-31') → '31 Dec 2026'
 */
export const fmtDate = (d: string): string =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Escapes a value for safe inclusion in a CSV cell (RFC 4180).
 * Wraps in double-quotes and doubles any embedded double-quotes.
 */
export const csvCell = (v: unknown): string => `"${String(v ?? '').replace(/"/g, '""')}"`;

/**
 * Returns an ISO date string `YYYY-MM-DD` for `n` days from today (local time).
 *
 * @param n - Number of days to add (can be negative)
 */
export const addDaysISO = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Clamps `value` to the inclusive range [`min`, `max`].
 *
 * @param value - The number to clamp
 * @param min   - Lower bound (inclusive)
 * @param max   - Upper bound (inclusive)
 */
export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Returns a percentage string rounded to one decimal place.
 *
 * @example pct(0.857) → '85.7%'
 */
export const pct = (ratio: number): string => `${Math.round(ratio * 1000) / 10}%`;
