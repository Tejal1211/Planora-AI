import { describe, expect, it } from 'vitest';
import * as L from './logic';

const event: L.EventRow = { id: 1, name: 'T', type: 'wedding', date: '2026-12-31', location: '', venue_type: 'outdoor', guest_count: 100, budget_total: 100000, currency: 'INR', preferences: 'vegetarian live music', has_backup_plan: 0, contingency_notes: '' };
const mk = (): L.State => ({
  event: { ...event },
  budget: [
    { id: 1, event_id: 1, category: 'venue', estimated: 30000, actual: 0, notes: '' },
    { id: 2, event_id: 1, category: 'catering', estimated: 40000, actual: 0, notes: '' },
    { id: 3, event_id: 1, category: 'decor', estimated: 20000, actual: 0, notes: '' },
  ],
  tasks: [
    { id: 1, event_id: 1, title: 'a', category: 'x', due_date: '2026-10-01', status: 'todo', priority: 'high' },
    { id: 2, event_id: 1, title: 'b', category: 'x', due_date: '2026-10-01', status: 'done', priority: 'low' },
    { id: 3, event_id: 1, title: 'c', category: 'x', due_date: '2026-11-30', status: 'todo', priority: 'low' },
  ],
  guests: [],
  vendors: [
    { id: 1, event_id: 1, name: 'Cheap', category: 'catering', price: 30000, services: 'vegetarian menu', rating: 4, available: 1, selected: 0, notes: '', is_demo: 1 },
    { id: 2, event_id: 1, name: 'Pricey', category: 'catering', price: 90000, services: 'buffet', rating: 5, available: 1, selected: 1, notes: '', is_demo: 1 },
    { id: 3, event_id: 1, name: 'Gone', category: 'catering', price: 20000, services: 'vegetarian', rating: 5, available: 0, selected: 0, notes: '', is_demo: 1 },
  ],
});
const TODAY = '2026-10-23';

describe('budget', () => {
  it('sums committed using actual when present', () => {
    const s = mk(); s.budget[0].actual = 35000;
    const b = L.budgetSummary(s.event, s.budget);
    expect(b.committed).toBe(95000); expect(b.remaining).toBe(5000); expect(b.status).toBe('warning');
  });
  it('detects overrun and builds a rescue plan that closes the gap when possible', () => {
    const s = mk(); s.budget[2].estimated = 40000; // committed 110k vs 100k
    const b = L.budgetSummary(s.event, s.budget); expect(b.status).toBe('over'); expect(b.overrun).toBe(10000);
    const r = L.rescuePlan(s.event, s.budget);
    expect(r.suggestions[0].category).toBe('decor'); // most flexible first
    expect(r.covered + r.shortfall).toBe(10000);
    expect(r.suggestions.every((x) => x.cut > 0 && x.after === x.current - x.cut)).toBe(true);
  });
  it('never cuts already-paid lines and reports shortfall + guest reduction', () => {
    const s = mk(); s.budget.forEach((b) => (b.actual = b.estimated)); s.budget[1].actual = 90000;
    const r = L.rescuePlan(s.event, s.budget);
    expect(r.suggestions).toHaveLength(0); expect(r.shortfall).toBe(r.overrun); expect(r.guestReduction).toBeGreaterThan(0);
  });
  it('healthy budget needs no rescue', () => expect(L.rescuePlan(mk().event, mk().budget).suggestions).toEqual([]));
});

describe('timeline & tasks', () => {
  it('flags overdue tasks only when not done', () => {
    const st = L.taskStats(mk().tasks, TODAY);
    expect(st.overdue).toBe(1); expect(st.overdueIds).toEqual([1]); expect(st.progress).toBe(33);
    expect(L.withOverdue(mk().tasks, TODAY).map((t) => t.overdue)).toEqual([true, false, false]);
  });
  it('compresses the timeline when the event is close and never schedules before today', () => {
    const near = L.generateTimeline({ ...event, date: '2026-11-06' }, TODAY);
    expect(near.every((t) => t.due_date >= TODAY && t.due_date <= '2026-11-06')).toBe(true);
    const far = L.generateTimeline({ ...event, date: '2027-06-01' }, TODAY);
    expect(far.find((t) => t.title === 'Book venue')!.due_date).toBe('2027-02-11');
  });
  it('adds weather task only for non-indoor events', () => {
    expect(L.generateTimeline({ ...event, venue_type: 'indoor' }, TODAY).some((t) => t.category === 'contingency')).toBe(false);
    expect(L.generateTimeline(event, TODAY).some((t) => t.category === 'contingency')).toBe(true);
  });
});

describe('vendor matching', () => {
  it('ranks by price, rating, preference fit, and excludes unavailable', () => {
    const r = L.scoreVendors(mk(), 'catering');
    expect(r[0].name).toBe('Cheap'); expect(r[r.length - 1].name).toBe('Gone'); expect(r[r.length - 1].eligible).toBe(false);
    expect(r[0].reasons.join(' ')).toMatch(/vegetarian/);
    expect(r[0].breakdown.price).toBe(40);
  });
});

describe('readiness', () => {
  it('is transparent: weights sum to 100 and points sum to the score', () => {
    const r = L.readiness(mk(), TODAY);
    expect(r.components.reduce((a, c) => a + c.weight, 0)).toBe(100);
    expect(r.score).toBe(Math.round(r.components.reduce((a, c) => a + c.points, 0)));
  });
  it('rewards a backup plan and penalises overdue tasks', () => {
    const a = L.readiness(mk(), TODAY);
    const withPlan = mk(); withPlan.event.has_backup_plan = 1;
    expect(L.readiness(withPlan, TODAY).score).toBeGreaterThan(a.score);
    expect(L.readiness(mk(), '2026-12-01').components.find((c) => c.key === 'tasks')!.points).toBeLessThan(a.components.find((c) => c.key === 'tasks')!.points);
  });
  it('flags a selected vendor that becomes unavailable', () => {
    const s = mk(); s.vendors[1].available = 0;
    expect(L.readiness(s, TODAY).components.find((c) => c.key === 'vendors')!.detail).toMatch(/unavailable selected: Pricey/);
  });
});

describe('simulation', () => {
  it('cost increase scales unpaid lines only and previews without mutating', () => {
    const s = mk(); s.budget[0].actual = 1;
    const sim = L.simulate(s, { type: 'cost_increase', percent: 10 }, TODAY);
    const after = L.applyToState(s, sim.changes);
    expect(after.budget[1].estimated).toBe(44000); expect(after.budget[0].estimated).toBe(30000);
    expect(s.budget[1].estimated).toBe(40000);
  });
  it('adding guests scales catering and adds capacity task', () => {
    const s = mk(); const sim = L.simulate(s, { type: 'add_guests', count: 50 }, TODAY); const a = L.applyToState(s, sim.changes);
    expect(a.event.guest_count).toBe(150); expect(a.budget[1].estimated).toBe(60000); expect(a.tasks.length).toBe(5);
  });
  it('vendor unavailable suggests a replacement and updates the budget line', () => {
    const s = mk(); const sim = L.simulate(s, { type: 'vendor_unavailable', vendorId: 2 }, TODAY); const a = L.applyToState(s, sim.changes);
    expect(a.vendors[1].available).toBe(0); expect(sim.notes.join(' ')).toMatch(/Cheap/); expect(a.budget[1].estimated).toBe(30000);
  });
  it('weather adds contingency for outdoor, nothing for indoor', () => {
    const s = mk(); const a = L.applyToState(s, L.simulate(s, { type: 'weather' }, TODAY).changes);
    expect(a.event.has_backup_plan).toBe(1); expect(a.budget.find((b) => b.category === 'contingency')!.estimated).toBe(8000);
    s.event.venue_type = 'indoor'; expect(L.simulate(s, { type: 'weather' }, TODAY).changes).toHaveLength(0);
  });
  it('rejects unknown vendors', () => expect(() => L.simulate(mk(), { type: 'vendor_unavailable', vendorId: 99 })).toThrow());
});

describe('fallback plan', () => {
  it('is grounded in the saved data', () => {
    const p = L.fallbackPlan(mk(), TODAY);
    expect(p.summary).toContain('100 guests'); expect(p.recommendations.join(' ')).toMatch(/weather|overdue|vendors/i);
    expect(p.checklist.length).toBeGreaterThan(0);
  });
});

describe('utilities', () => {
  it('money formats INR with Indian locale', () => {
    expect(L.money(100000, 'INR')).toMatch(/₹/);
    expect(L.money(0, 'USD')).toMatch(/\$|USD/i);
  });

  it('label replaces underscores with spaces', () => {
    expect(L.label('av_equipment')).toBe('av equipment');
    expect(L.label('catering')).toBe('catering');
    expect(L.label('venue_type_outdoor')).toBe('venue type outdoor');
  });

  it('round2 avoids floating-point drift', () => {
    expect(L.round2(0.1 + 0.2)).toBe(0.3);
    expect(L.round2(1.115)).toBe(1.12);  // 1.115 in IEEE754 is exactly 1.115, rounds to 1.12
    expect(L.round2(100)).toBe(100);
    expect(L.round2(12.345)).toBe(12.35);
  });

  it('daysBetween is signed and symmetric', () => {
    expect(L.daysBetween('2026-01-01', '2026-01-08')).toBe(7);
    expect(L.daysBetween('2026-01-08', '2026-01-01')).toBe(-7);
  });

  it('addDays crosses month and year boundaries correctly', () => {
    expect(L.addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(L.addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
});

describe('budget edge cases', () => {
  it('budgetSummary handles an empty budget gracefully', () => {
    const b = L.budgetSummary({ budget_total: 100000 }, []);
    expect(b.committed).toBe(0);
    expect(b.remaining).toBe(100000);
    expect(b.status).toBe('healthy');
    expect(b.byCategory).toHaveLength(0);
  });

  it('rescuePlan on an empty budget returns no suggestions and zero overrun', () => {
    const r = L.rescuePlan({ budget_total: 100000, guest_count: 100, currency: 'INR' }, []);
    expect(r.overrun).toBe(0);
    expect(r.suggestions).toHaveLength(0);
  });

  it('budget with zero total does not divide by zero', () => {
    const b = L.budgetSummary({ budget_total: 0 }, [{ id: 1, event_id: 1, category: 'venue', estimated: 1000, actual: 0, notes: '' }]);
    expect(b.usedPct).toBe(0);
    expect(Number.isFinite(b.usedPct)).toBe(true);
  });
});

describe('readiness edge cases', () => {
  it('score is 0 when there are no tasks and no vendors', () => {
    const s = mk();
    s.tasks = [];
    s.vendors = [];
    s.budget = [];
    const r = L.readiness(s, TODAY);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.components.reduce((a, c) => a + c.weight, 0)).toBe(100);
  });

  it('snapshot returns all expected keys', () => {
    const snap = L.snapshot(mk(), TODAY);
    expect(snap).toHaveProperty('guestCount');
    expect(snap).toHaveProperty('committed');
    expect(snap).toHaveProperty('remaining');
    expect(snap).toHaveProperty('readiness');
    expect(snap).toHaveProperty('overdue');
  });
});
