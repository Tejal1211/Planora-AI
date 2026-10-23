import { z } from 'zod';
import { parseDate, toISO } from './logic';

/** Strips HTML tags / control chars, trims, then enforces length. */
export const text = (min: number, max: number) =>
  z.string().transform((s) => s.replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f]/g, ' ').trim()).pipe(z.string().min(min).max(max));
export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((s) => toISO(parseDate(s)) === s, 'Invalid date');

export const eventSchema = z.object({
  name: text(2, 100),
  type: z.enum(['wedding', 'birthday', 'community']),
  date: dateStr,
  location: text(0, 120).default(''),
  venue_type: z.enum(['indoor', 'outdoor', 'hybrid']).default('indoor'),
  guest_count: z.number().int().min(1).max(5000),
  budget_total: z.number().positive().max(1e9),
  currency: z.enum(['INR', 'USD', 'EUR', 'GBP']).default('INR'),
  preferences: text(0, 1000).default(''),
  has_backup_plan: z.boolean().default(false),
  contingency_notes: text(0, 1000).default(''),
});
export const eventUpdateSchema = eventSchema.partial();

export const budgetSchema = z.object({ category: text(1, 40), estimated: z.number().min(0).max(1e9), actual: z.number().min(0).max(1e9).default(0), notes: text(0, 300).default('') });
export const taskSchema = z.object({ title: text(1, 140), category: text(0, 40).default('general'), due_date: dateStr, status: z.enum(['todo', 'doing', 'done']).default('todo'), priority: z.enum(['low', 'medium', 'high']).default('medium') });
export const guestSchema = z.object({ name: text(1, 100), email: z.union([z.literal(''), z.string().trim().email().max(120)]).default(''), rsvp: z.enum(['pending', 'yes', 'no']).default('pending'), dietary: text(0, 100).default(''), plus_ones: z.number().int().min(0).max(10).default(0) });
export const vendorSchema = z.object({ name: text(1, 100), category: text(1, 40), price: z.number().min(0).max(1e9), services: text(0, 300).default(''), rating: z.number().min(0).max(5).default(0), available: z.boolean().default(true), selected: z.boolean().default(false), notes: text(0, 300).default('') });

export const scenarioSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('cost_increase'), percent: z.number().min(1).max(200), category: text(1, 40).optional() }),
  z.object({ type: z.literal('add_guests'), count: z.number().int().min(1).max(2000) }),
  z.object({ type: z.literal('vendor_unavailable'), vendorId: z.number().int().positive() }),
  z.object({ type: z.literal('weather') }),
]);
export const aiRequestSchema = z.object({ prompt: text(0, 500).default('') });
