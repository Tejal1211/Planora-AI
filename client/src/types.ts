export type Priority = 'low' | 'medium' | 'high';
export type EventType = 'wedding' | 'birthday' | 'community';
export interface EventT { id: number; name: string; type: EventType; date: string; location: string; venue_type: 'indoor' | 'outdoor' | 'hybrid'; guest_count: number; budget_total: number; currency: string; preferences: string; has_backup_plan: number; contingency_notes: string }
export type EventInput = Omit<EventT, 'id' | 'has_backup_plan' | 'contingency_notes'>;
export interface BudgetItem { id: number; category: string; estimated: number; actual: number; notes: string }
export interface Task { id: number; title: string; category: string; due_date: string; status: 'todo' | 'doing' | 'done'; priority: Priority; overdue: boolean }
export interface TaskStats { total: number; done: number; progress: number; overdue: number; dueSoon: number }
export interface Guest { id: number; name: string; email: string; rsvp: 'pending' | 'yes' | 'no'; dietary: string; plus_ones: number }
export interface Vendor { id: number; name: string; category: string; price: number; services: string; rating: number; available: number; selected: number; notes: string; is_demo: number }
export interface BudgetSummary { total: number; estimated: number; actual: number; committed: number; remaining: number; overrun: number; usedPct: number; status: 'healthy' | 'warning' | 'over'; byCategory: { category: string; estimated: number; actual: number; committed: number }[] }
export interface Rescue { overrun: number; covered: number; shortfall: number; guestReduction: number | null; message: string; suggestions: { category: string; itemId: number; current: number; cut: number; after: number; tradeoff: string }[] }
export interface Readiness { score: number; label: string; nextActions: string[]; components: { key: string; label: string; weight: number; score: number; points: number; detail: string }[] }
export interface ScoredVendor extends Vendor { score: number; eligible: boolean; breakdown: { price: number; rating: number; fit: number; availability: number }; reasons: string[] }
export interface Snapshot { guestCount: number; committed: number; remaining: number; status: string; readiness: number; tasks: number; overdue: number }
export type Scenario = { type: 'cost_increase'; percent: number; category?: string } | { type: 'add_guests'; count: number } | { type: 'vendor_unavailable'; vendorId: number } | { type: 'weather' };
export interface SimResult { title: string; notes: string[]; changes: { kind: string; label: string }[]; before: Snapshot; after: Snapshot; rescue: Rescue }
export interface AiPlan { summary: string; recommendations: string[]; checklist: { title: string; category: string; priority: Priority }[]; risks: string[] }
export interface AiResponse { mode: 'gemini' | 'fallback'; reason?: string; plan: AiPlan }
export interface Report { generatedAt: string; event: EventT; budget: { items: BudgetItem[]; summary: BudgetSummary; rescue: Rescue }; readiness: Readiness; tasks: Task[]; taskStats: TaskStats; guests: { total: number; yes: number; no: number; pending: number }; selectedVendors: Vendor[]; disclaimer: string }
