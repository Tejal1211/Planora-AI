/**
 * Deterministic planning engine. ALL financial maths, scoring and simulation live here -
 * the AI layer never calculates money.
 */
import { AppError } from './errors';

export type EventType = 'wedding' | 'birthday' | 'community';
export type VenueType = 'indoor' | 'outdoor' | 'hybrid';
export type Priority = 'low' | 'medium' | 'high';

export interface EventRow { id: number; name: string; type: EventType; date: string; location: string; venue_type: VenueType; guest_count: number; budget_total: number; currency: string; preferences: string; has_backup_plan: number; contingency_notes: string }
export interface BudgetRow { id: number; event_id: number; category: string; estimated: number; actual: number; notes: string }
export interface TaskRow { id: number; event_id: number; title: string; category: string; due_date: string; status: 'todo' | 'doing' | 'done'; priority: Priority }
export interface GuestRow { id: number; event_id: number; name: string; email: string; rsvp: 'pending' | 'yes' | 'no'; dietary: string; plus_ones: number }
export interface VendorRow { id: number; event_id: number; name: string; category: string; price: number; services: string; rating: number; available: number; selected: number; notes: string; is_demo: number }
export interface State { event: EventRow; budget: BudgetRow[]; tasks: TaskRow[]; guests: GuestRow[]; vendors: VendorRow[] }

/* ---------- date + number helpers ---------- */
const DAY = 86_400_000;
export const parseDate = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
export const toISO = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((parseDate(b) - parseDate(a)) / DAY);
export const addDays = (s: string, n: number) => toISO(parseDate(s) + n * DAY);
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n));
export const label = (c: string) => c.replace(/_/g, ' ');
export const money = (n: number, cur = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n);

/* ---------- templates ---------- */
export const BUDGET_TEMPLATES: Record<EventType, Record<string, number>> = {
  wedding: { venue: 25, catering: 30, decor: 12, photography: 10, entertainment: 8, attire: 7, invitations: 2, miscellaneous: 6 },
  birthday: { venue: 20, catering: 35, decor: 15, entertainment: 15, photography: 5, invitations: 3, miscellaneous: 7 },
  community: { venue: 20, catering: 25, decor: 8, entertainment: 15, av_equipment: 12, marketing: 8, permits: 4, miscellaneous: 8 },
};
/** Initial allocation keeps 10% unallocated as a contingency buffer. */
export const ALLOCATION_FACTOR = 0.9;
export const ESSENTIAL: Record<EventType, string[]> = {
  wedding: ['venue', 'catering', 'decor', 'photography', 'entertainment'],
  birthday: ['venue', 'catering', 'decor', 'entertainment'],
  community: ['venue', 'catering', 'av_equipment', 'entertainment'],
};
const GUEST_DRIVEN = ['catering', 'invitations', 'favors', 'rentals'];
const FLEX: Record<string, number> = { decor: 0.3, entertainment: 0.35, miscellaneous: 0.3, marketing: 0.25, invitations: 0.25, attire: 0.2, photography: 0.15, av_equipment: 0.15, catering: 0.12, venue: 0.05 };
const TRADEOFF: Record<string, string> = {
  decor: 'Simpler styling and fewer florals/lighting layers; focus spend on one or two focal points.',
  entertainment: 'Shorter performance window or a DJ/playlist option instead of a full live act.',
  miscellaneous: 'Fewer extras and favours; keep only items guests will actually notice.',
  marketing: 'Rely on organic/WhatsApp/community promotion instead of paid reach.',
  invitations: 'Digital invitations instead of printed cards; slightly less formal feel.',
  attire: 'Rent or reuse outfits rather than buying new; fewer fittings.',
  photography: 'Shorter coverage or fewer deliverables; risk of missing candid moments.',
  av_equipment: 'Basic sound setup; check coverage for larger crowds first.',
  catering: 'Trim menu variety or live counters; the guest experience is the most visible trade-off.',
  venue: 'Negotiating venue price is hard late in planning; changes may affect capacity or location.',
};

type Tpl = [string, string, number, Priority];
const COMMON: Tpl[] = [
  ['Finalize budget and priorities', 'planning', 120, 'high'], ['Book venue', 'venue', 110, 'high'], ['Confirm guest list', 'guests', 90, 'high'],
  ['Book caterer', 'catering', 80, 'high'], ['Book entertainment', 'entertainment', 70, 'medium'], ['Send invitations', 'invitations', 45, 'high'],
  ['Finalize menu', 'catering', 30, 'medium'], ['Collect RSVPs', 'guests', 14, 'high'], ['Confirm vendors and final headcount', 'vendors', 7, 'high'],
  ['Prepare day-of schedule', 'planning', 3, 'medium'],
];
const TYPE_TASKS: Record<EventType, Tpl[]> = {
  wedding: [['Book photographer', 'photography', 100, 'high'], ['Complete legal and registration paperwork', 'planning', 60, 'high'], ['Attire fittings', 'attire', 40, 'medium']],
  birthday: [['Plan activities and games', 'entertainment', 20, 'medium'], ['Order cake', 'catering', 10, 'medium']],
  community: [['Obtain permits and permissions', 'permits', 60, 'high'], ['Promote the event', 'marketing', 35, 'medium'], ['Recruit volunteers', 'planning', 30, 'medium'], ['Arrange AV and sound check', 'av_equipment', 14, 'medium']],
};
const EXTRA_IDEAS: Record<EventType, Tpl[]> = {
  wedding: [['Assign a day-of coordinator', 'planning', 0, 'high'], ['Share guest accommodation and travel info', 'guests', 0, 'medium'], ['Plan ceremony and reception run-of-show', 'planning', 0, 'medium']],
  birthday: [['Prepare return gifts', 'miscellaneous', 0, 'low'], ['Confirm allergy and dietary needs', 'catering', 0, 'medium'], ['Arrange a photo corner', 'decor', 0, 'low']],
  community: [['Prepare first-aid and safety plan', 'planning', 0, 'high'], ['Set up feedback form', 'marketing', 0, 'low'], ['Arrange cleanup crew', 'planning', 0, 'medium']],
};
const SERVICE_POOL: Record<string, string[]> = {
  venue: ['indoor hall', 'garden lawn', 'parking', 'air conditioning', 'stage', 'backup power'],
  catering: ['vegetarian menu', 'vegan options', 'live counters', 'buffet', 'desserts', 'plated service'],
  decor: ['floral', 'lighting', 'stage design', 'minimal styling', 'themed props', 'outdoor tents'],
  photography: ['candid photography', 'video', 'drone', 'albums', 'same-day edits', 'traditional portraits'],
  entertainment: ['live band', 'dj', 'folk performance', 'kids activities', 'emcee', 'sound system'],
  av_equipment: ['sound system', 'projector', 'microphones', 'lighting', 'live streaming', 'technician'],
};
/** Clearly-labelled demonstration vendors with ESTIMATED prices. */
export const demoVendorsFor = (e: Pick<EventRow, 'type' | 'budget_total'>) => {
  const out: { name: string; category: string; price: number; services: string; rating: number; notes: string }[] = [];
  const names = ['Emerald', 'Heritage', 'Value'];
  const mult = [1.05, 1.3, 0.8];
  const ratings = [4.5, 4.8, 4.1];
  for (const cat of ESSENTIAL[e.type]) {
    const alloc = (e.budget_total * (BUDGET_TEMPLATES[e.type][cat] ?? 5) / 100) * ALLOCATION_FACTOR;
    const pool = SERVICE_POOL[cat] ?? ['standard service'];
    names.forEach((n, i) => out.push({
      name: `Demo ${label(cat)} - ${n}`, category: cat, price: Math.round(alloc * mult[i] / 100) * 100,
      services: [pool[i], pool[(i + 2) % pool.length], pool[(i + 4) % pool.length]].join(', '), rating: ratings[i],
      notes: 'Demonstration data - estimated price, not a real vendor quote.',
    }));
  }
  return out;
};

/* ---------- budget ---------- */
export interface RescueSuggestion { category: string; itemId: number; current: number; cut: number; after: number; tradeoff: string }

export function budgetSummary(e: Pick<EventRow, 'budget_total'>, items: BudgetRow[]) {
  const total = e.budget_total;
  const sum = (f: (i: BudgetRow) => number) => round2(items.reduce((a, i) => a + f(i), 0));
  const estimated = sum((i) => i.estimated);
  const actual = sum((i) => i.actual);
  const committed = sum((i) => (i.actual > 0 ? i.actual : i.estimated));
  const remaining = round2(total - committed);
  const ratio = total ? committed / total : 0;
  const status: 'healthy' | 'warning' | 'over' = committed > total ? 'over' : ratio > 0.9 + 0.001 ? 'warning' : 'healthy';
  const byCategory = Object.values(items.reduce<Record<string, { category: string; estimated: number; actual: number; committed: number }>>((m, i) => {
    const c = (m[i.category] ??= { category: i.category, estimated: 0, actual: 0, committed: 0 });
    c.estimated = round2(c.estimated + i.estimated); c.actual = round2(c.actual + i.actual);
    c.committed = round2(c.committed + (i.actual > 0 ? i.actual : i.estimated));
    return m;
  }, {}));
  return { total, estimated, actual, committed, remaining, overrun: Math.max(0, round2(-remaining)), usedPct: total ? round2(ratio * 100) : 0, status, byCategory };
}

/** Budget Rescue Engine: flexibility-weighted savings on UNPAID lines only. */
export function rescuePlan(e: Pick<EventRow, 'budget_total' | 'guest_count' | 'currency'>, items: BudgetRow[]) {
  const s = budgetSummary(e, items);
  if (s.overrun <= 0) return { overrun: 0, covered: 0, shortfall: 0, suggestions: [] as RescueSuggestion[], guestReduction: null as number | null, message: 'Budget is within limit - no rescue needed.' };
  const cand = items.filter((i) => i.actual === 0 && i.estimated > 0 && (FLEX[i.category] ?? 0.2) > 0)
    .map((i) => ({ i, max: i.estimated * (FLEX[i.category] ?? 0.2) })).sort((a, b) => (FLEX[b.i.category] ?? 0.2) - (FLEX[a.i.category] ?? 0.2));
  let need = s.overrun;
  const suggestions: RescueSuggestion[] = [];
  for (const { i, max } of cand) {
    if (need <= 0) break;
    const cut = round2(Math.min(max, need));
    if (cut <= 0) continue;
    suggestions.push({ category: i.category, itemId: i.id, current: i.estimated, cut, after: round2(i.estimated - cut), tradeoff: TRADEOFF[i.category] ?? 'Reduce scope for this line.' });
    need = round2(need - cut);
  }
  const shortfall = Math.max(0, round2(need));
  const covered = round2(s.overrun - shortfall);
  let guestReduction: number | null = null;
  if (shortfall > 0) {
    const cat = items.filter((i) => i.category === 'catering').reduce((a, i) => a + (i.actual > 0 ? i.actual : i.estimated), 0);
    const perGuest = cat / Math.max(1, e.guest_count);
    guestReduction = perGuest > 0 ? Math.min(e.guest_count, Math.ceil(shortfall / perGuest)) : null;
  }
  const message = shortfall > 0
    ? `Over budget by ${money(s.overrun, e.currency)}. Suggested cuts cover ${money(covered, e.currency)}; ${money(shortfall, e.currency)} remains${guestReduction ? ` (about ${guestReduction} fewer guests at the current catering cost per head, or raise the budget)` : ''}.`
    : `Over budget by ${money(s.overrun, e.currency)}. The suggested cuts below fully close the gap.`;
  return { overrun: s.overrun, covered, shortfall, suggestions, guestReduction, message };
}

/* ---------- tasks / timeline ---------- */
export function taskStats(tasks: TaskRow[], today: string) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const overdue = tasks.filter((t) => t.status !== 'done' && t.due_date < today);
  return {
    total, done, progress: total ? Math.round((done / total) * 100) : 0, overdue: overdue.length, overdueIds: overdue.map((t) => t.id),
    dueSoon: tasks.filter((t) => t.status !== 'done' && t.due_date >= today && daysBetween(today, t.due_date) <= 7).length,
  };
}
export const withOverdue = (tasks: TaskRow[], today: string) => tasks.map((t) => ({ ...t, overdue: t.status !== 'done' && t.due_date < today }));

/** Adaptive timeline: offsets are compressed proportionally when the event is close. */
export function generateTimeline(e: Pick<EventRow, 'type' | 'date' | 'venue_type'>, today = todayISO()) {
  const tpl: Tpl[] = [...COMMON, ...TYPE_TASKS[e.type], ...(e.venue_type !== 'indoor' ? [['Prepare weather and contingency plan', 'contingency', 21, 'medium'] as Tpl] : [])];
  const days = Math.max(daysBetween(today, e.date), 1);
  const scale = Math.min(1, days / Math.max(...tpl.map((t) => t[2])));
  return tpl.map(([title, category, off, priority]) => {
    let due = addDays(e.date, -Math.round(off * scale));
    if (due < today && e.date >= today) due = today;
    return { title, category, due_date: due, priority };
  });
}

/* ---------- vendors ---------- */
export function scoreVendors(s: State, category: string) {
  const alloc = Math.max(1, s.budget.filter((b) => b.category === category).reduce((a, b) => a + b.estimated, 0) || s.event.budget_total * 0.1);
  const words = [...new Set(s.event.preferences.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4))];
  return s.vendors.filter((v) => v.category === category).map((v) => {
    const price = round2(v.price <= alloc ? 40 : 40 * clamp(1 - (v.price - alloc) / alloc));
    const rating = round2((v.rating / 5) * 25);
    const text = `${v.services} ${v.notes}`.toLowerCase();
    const hits = words.filter((w) => text.includes(w));
    const fit = round2(words.length ? 20 * clamp(hits.length / Math.min(words.length, 3)) : 10);
    const availability = v.available ? 15 : 0;
    const diff = Math.round(((v.price - alloc) / alloc) * 100);
    const reasons = [
      diff <= 0 ? `Price is ${Math.abs(diff)}% within the ${label(category)} allocation` : `Price is ${diff}% over the ${label(category)} allocation`,
      `Rated ${v.rating}/5`,
      hits.length ? `Matches your preferences: ${hits.join(', ')}` : words.length ? 'No match with your stated preferences' : 'No preferences supplied (neutral fit score)',
      v.available ? 'Available on the event date' : 'Not available - excluded from ranking',
    ];
    return { ...v, score: Math.round(price + rating + fit + availability), eligible: !!v.available, breakdown: { price, rating, fit, availability }, reasons };
  }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score);
}

/* ---------- readiness ---------- */
export function readiness(s: State, today = todayISO()) {
  const e = s.event;
  const b = budgetSummary(e, s.budget);
  const st = taskStats(s.tasks, today);
  const ratio = e.budget_total ? b.committed / e.budget_total : 2;
  const budgetScore = clamp(1 - (ratio - 0.9 - 0.001) / 0.4);
  const progress = st.total ? st.done / st.total : 0;
  const taskScore = clamp(progress - 0.5 * (st.total ? st.overdue / st.total : 0));
  const essentials = ESSENTIAL[e.type];
  const booked = essentials.filter((c) => s.vendors.some((v) => v.category === c && v.selected && v.available));
  const broken = s.vendors.filter((v) => v.selected && !v.available).map((v) => v.name);
  const vendorScore = booked.length / essentials.length;
  const buffer = e.budget_total ? b.remaining / e.budget_total : 0;
  const bufferPart = clamp(buffer / 0.0999);
  const planPart = e.venue_type === 'indoor' || e.has_backup_plan ? 1 : 0;
  const backups = essentials.filter((c) => s.vendors.filter((v) => v.category === c && v.available).length >= 2);
  const contScore = (bufferPart + planPart + backups.length / essentials.length) / 3;
  const mk = (key: string, lab: string, weight: number, score: number, detail: string, action: string) =>
    ({ key, label: lab, weight, score: round2(score), points: round2(weight * score), detail, action });
  const comps = [
    mk('budget', 'Budget health', 30, budgetScore, `Committed spend is ${round2(ratio * 100)}% of budget (full marks at or below 90%, zero at 130%).`, b.status === 'healthy' ? 'Keep committed spend at or below 90% of budget.' : 'Reduce committed spend - open the Budget Rescue panel.'),
    mk('tasks', 'Task progress', 30, taskScore, `${st.done}/${st.total} tasks done; ${st.overdue} overdue (overdue share costs half its weight).`, st.overdue ? `Clear ${st.overdue} overdue task(s).` : 'Complete upcoming tasks.'),
    mk('vendors', 'Vendor status', 25, vendorScore, `${booked.length}/${essentials.length} essential categories have an available, selected vendor${broken.length ? `; unavailable selected: ${broken.join(', ')}` : ''}.`, `Select vendors for: ${essentials.filter((c) => !booked.includes(c)).map(label).join(', ') || 'all essentials done'}.`),
    mk('contingency', 'Contingency planning', 15, contScore, `Budget buffer ${round2(buffer * 100)}% (target 10%); weather/backup plan ${planPart ? 'covered' : 'missing'}; ${backups.length}/${essentials.length} essentials have a backup vendor.`, planPart ? 'Keep a 10% buffer and backup vendors.' : 'Add a weather/backup venue plan.'),
  ];
  const score = Math.round(comps.reduce((a, c) => a + c.points, 0));
  const rating = score >= 80 ? 'Ready' : score >= 60 ? 'On track' : score >= 40 ? 'Needs attention' : 'At risk';
  const nextActions = [...comps].filter((c) => c.points < c.weight - 0.5).sort((a, b2) => b2.weight - b2.points - (a.weight - a.points)).slice(0, 3).map((c) => c.action);
  return { score, label: rating, components: comps.map(({ action: _a, ...c }) => c), nextActions };
}

/* ---------- what-if simulation ---------- */
export type Change = { label: string } & (
  | { kind: 'budget_update'; id: number; estimated: number }
  | { kind: 'budget_add'; category: string; estimated: number; notes: string }
  | { kind: 'task_add'; title: string; category: string; due_date: string; priority: Priority }
  | { kind: 'event_update'; guest_count?: number; has_backup_plan?: number }
  | { kind: 'vendor_update'; id: number; price?: number; available?: number; selected?: number });
export type Scenario =
  | { type: 'cost_increase'; percent: number; category?: string }
  | { type: 'add_guests'; count: number }
  | { type: 'vendor_unavailable'; vendorId: number }
  | { type: 'weather' };

export function simulate(s: State, sc: Scenario, today = todayISO()) {
  const changes: Change[] = [];
  const notes: string[] = [];
  const soon = (n: number) => { const d = addDays(today, n); return d > s.event.date ? s.event.date : d; };
  let title = '';
  if (sc.type === 'cost_increase') {
    const f = 1 + sc.percent / 100;
    title = `Costs rise ${sc.percent}%${sc.category ? ` for ${label(sc.category)}` : ''}`;
    for (const b of s.budget) if ((!sc.category || b.category === sc.category) && b.actual === 0) changes.push({ kind: 'budget_update', id: b.id, estimated: round2(b.estimated * f), label: `${label(b.category)} estimate +${sc.percent}%` });
    for (const v of s.vendors) if (v.selected && (!sc.category || v.category === sc.category)) changes.push({ kind: 'vendor_update', id: v.id, price: round2(v.price * f), label: `${v.name} price +${sc.percent}%` });
    notes.push('Already-paid (actual) amounts are not changed.');
    if (!changes.length) notes.push('No unpaid budget lines matched this scenario.');
  } else if (sc.type === 'add_guests') {
    const n = s.event.guest_count + sc.count; const r = n / s.event.guest_count;
    title = `Add ${sc.count} guests (${s.event.guest_count} to ${n})`;
    changes.push({ kind: 'event_update', guest_count: n, label: `Guest count ${s.event.guest_count} to ${n}` });
    for (const b of s.budget) if (GUEST_DRIVEN.includes(b.category) && b.actual === 0) changes.push({ kind: 'budget_update', id: b.id, estimated: round2(b.estimated * r), label: `${label(b.category)} scaled by guest count (x${round2(r)})` });
    changes.push({ kind: 'task_add', title: `Confirm venue capacity for ${n} guests`, category: 'venue', due_date: soon(3), priority: 'high' , label: 'New task: confirm venue capacity' });
    changes.push({ kind: 'task_add', title: 'Update final headcount with caterer', category: 'catering', due_date: soon(5), priority: 'high', label: 'New task: update caterer headcount' });
    notes.push('Venue cost is not auto-scaled; confirm capacity and any extra seating/rental fees.');
  } else if (sc.type === 'vendor_unavailable') {
    const v = s.vendors.find((x) => x.id === sc.vendorId);
    if (!v) throw new AppError(404, 'Vendor not found for this event');
    title = `${v.name} becomes unavailable`;
    changes.push({ kind: 'vendor_update', id: v.id, available: 0, selected: 0, label: `Mark ${v.name} unavailable` });
    const alt = scoreVendors({ ...s, vendors: s.vendors.filter((x) => x.id !== v.id) }, v.category).find((x) => x.eligible);
    if (alt) {
      changes.push({ kind: 'task_add', title: `Contact ${alt.name} as replacement for ${v.name}`, category: v.category, due_date: soon(2), priority: 'high', label: `New task: contact ${alt.name}` });
      const line = s.budget.find((b) => b.category === v.category && b.actual === 0);
      if (v.selected && line) changes.push({ kind: 'budget_update', id: line.id, estimated: alt.price, label: `${label(v.category)} estimate set to ${alt.name} price` });
      notes.push(`Best replacement: ${alt.name} (match score ${alt.score}/100, price ${money(alt.price, s.event.currency)}).`);
    } else {
      changes.push({ kind: 'task_add', title: `Urgently source a replacement ${label(v.category)} vendor`, category: v.category, due_date: soon(2), priority: 'high', label: 'New task: source replacement vendor' });
      notes.push('No alternative vendor is recorded for this category - add one in the Vendors tab.');
    }
  } else {
    title = 'Weather disrupts an outdoor event';
    if (s.event.venue_type === 'indoor') notes.push('This event is indoor, so weather has no direct impact. No changes proposed.');
    else {
      changes.push({ kind: 'budget_add', category: 'contingency', estimated: round2(s.event.budget_total * 0.08), notes: 'Weather backup (tent / indoor fallback) - estimate', label: 'Add weather contingency line (8% of budget)' });
      changes.push({ kind: 'task_add', title: 'Reserve tent or indoor backup venue', category: 'contingency', due_date: soon(3), priority: 'high', label: 'New task: reserve tent or indoor backup' });
      changes.push({ kind: 'task_add', title: 'Prepare guest weather communication plan', category: 'guests', due_date: soon(7), priority: 'medium', label: 'New task: guest weather communication' });
      changes.push({ kind: 'event_update', has_backup_plan: 1, label: 'Mark backup plan in place' });
      notes.push('The 8% figure is an estimate; replace it with a real quote.');
    }
  }
  return { title, changes, notes };
}

export function applyToState(s: State, changes: Change[]): State {
  const n: State = structuredClone(s);
  let tmp = -1;
  for (const c of changes) {
    if (c.kind === 'budget_update') { const b = n.budget.find((x) => x.id === c.id); if (b) b.estimated = c.estimated; }
    else if (c.kind === 'budget_add') n.budget.push({ id: tmp--, event_id: n.event.id, category: c.category, estimated: c.estimated, actual: 0, notes: c.notes });
    else if (c.kind === 'task_add') n.tasks.push({ id: tmp--, event_id: n.event.id, title: c.title, category: c.category, due_date: c.due_date, status: 'todo', priority: c.priority });
    else if (c.kind === 'event_update') { if (c.guest_count !== undefined) n.event.guest_count = c.guest_count; if (c.has_backup_plan !== undefined) n.event.has_backup_plan = c.has_backup_plan; }
    else { const v = n.vendors.find((x) => x.id === c.id); if (v) { if (c.price !== undefined) v.price = c.price; if (c.available !== undefined) v.available = c.available; if (c.selected !== undefined) v.selected = c.selected; } }
  }
  return n;
}

export function snapshot(s: State, today = todayISO()) {
  const b = budgetSummary(s.event, s.budget); const st = taskStats(s.tasks, today);
  return { guestCount: s.event.guest_count, committed: b.committed, remaining: b.remaining, status: b.status, readiness: readiness(s, today).score, tasks: st.total, overdue: st.overdue };
}

/* ---------- deterministic AI fallback ---------- */
export interface AiPlan { summary: string; recommendations: string[]; checklist: { title: string; category: string; priority: Priority }[]; risks: string[] }

export function fallbackPlan(s: State, today = todayISO()): AiPlan {
  const e = s.event; const b = budgetSummary(e, s.budget); const r = readiness(s, today); const st = taskStats(s.tasks, today);
  const rp = rescuePlan(e, s.budget); const days = daysBetween(today, e.date);
  const when = days >= 0 ? `${days} day(s) away` : `${-days} day(s) ago`;
  const recs: string[] = []; const risks: string[] = [];
  if (b.status === 'over') { recs.push(`Budget is over by ${money(b.overrun, e.currency)}. ${rp.suggestions[0] ? `Start with ${label(rp.suggestions[0].category)}: ${rp.suggestions[0].tradeoff}` : 'Raise the budget or reduce guests.'}`); risks.push('Budget overrun'); }
  else if (b.status === 'warning') recs.push(`Committed spend is ${b.usedPct}% of budget. Protect the remaining ${money(b.remaining, e.currency)} as a buffer.`);
  if (st.overdue) { const t = s.tasks.find((x) => st.overdueIds.includes(x.id)); recs.push(`${st.overdue} task(s) are overdue${t ? `, starting with "${t.title}"` : ''}.`); risks.push('Overdue tasks'); }
  const missing = ESSENTIAL[e.type].filter((c) => !s.vendors.some((v) => v.category === c && v.selected && v.available));
  if (missing.length) { recs.push(`Select vendors for: ${missing.map(label).join(', ')}. Use the Vendors tab to compare scores.`); risks.push('Essential vendors not booked'); }
  if (e.venue_type !== 'indoor' && !e.has_backup_plan) { recs.push('Outdoor/hybrid venue without a weather plan: reserve a tent or indoor fallback.'); risks.push('Weather exposure'); }
  const pending = s.guests.filter((g) => g.rsvp === 'pending').length;
  if (pending) recs.push(`${pending} guest(s) have not responded yet; send a reminder before the final headcount deadline.`);
  if (days >= 0 && days <= 14 && st.progress < 50) { recs.push('The event is within two weeks and under half of tasks are done: focus on high-priority tasks only.'); risks.push('Compressed timeline'); }
  recs.push(`Readiness is ${r.score}/100 (${r.label}). ${r.nextActions[0] ?? ''}`.trim());
  const have = new Set(s.tasks.map((t) => t.title.toLowerCase()));
  const checklist = EXTRA_IDEAS[e.type].filter((t) => !have.has(t[0].toLowerCase())).slice(0, 5).map(([title, category, , priority]) => ({ title, category, priority }));
  return {
    summary: `${e.name} is a ${e.type} for ${e.guest_count} guests, ${when} (${e.date})${e.location ? ` at ${e.location}` : ''}. Readiness: ${r.score}/100 (${r.label}). Budget: ${b.status}, ${money(b.committed, e.currency)} committed of ${money(e.budget_total, e.currency)}.`,
    recommendations: recs.slice(0, 8), checklist, risks: risks.length ? risks : ['No major risks detected from current data'],
  };
}
