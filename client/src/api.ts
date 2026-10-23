import type * as T from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: { path: string; message: string }[]) { super(message); }
}

export async function request<R>(path: string, init: { method?: string; body?: unknown } = {}): Promise<R> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method: init.method ?? 'GET', headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined, body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
  } catch { throw new ApiError(0, 'Cannot reach the server. Is the API running?'); }
  if (res.status === 204) return undefined as R;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = (data as { details?: { path: string; message: string }[] }).details;
    const msg = (data as { error?: string }).error ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, Array.isArray(d) && d.length ? `${msg}: ${d.map((x) => `${x.path} ${x.message}`).join('; ')}` : msg, Array.isArray(d) ? d : undefined);
  }
  return data as R;
}

const ev = (id: number) => `/events/${id}`;
export const api = {
  health: () => request<{ status: string; ai: 'gemini' | 'fallback' }>('/health'),
  events: () => request<{ events: T.EventT[] }>('/events').then((r) => r.events),
  createEvent: (b: T.EventInput) => request<{ event: T.EventT }>('/events', { method: 'POST', body: b }).then((r) => r.event),
  updateEvent: (id: number, b: Partial<Omit<T.EventT, 'id' | 'has_backup_plan'>> & { has_backup_plan?: boolean }) => request<{ event: T.EventT }>(ev(id), { method: 'PUT', body: b }).then((r) => r.event),
  deleteEvent: (id: number) => request<void>(ev(id), { method: 'DELETE' }),
  budget: (id: number) => request<{ items: T.BudgetItem[]; summary: T.BudgetSummary; rescue: T.Rescue }>(`${ev(id)}/budget`),
  tasks: (id: number) => request<{ tasks: T.Task[]; stats: T.TaskStats }>(`${ev(id)}/tasks`),
  regenerateTimeline: (id: number) => request<{ tasks: T.Task[] }>(`${ev(id)}/timeline/regenerate`, { method: 'POST' }),
  guests: (id: number) => request<{ guests: T.Guest[]; summary: { total: number; yes: number; no: number; pending: number; confirmedHeadcount: number; expectedHeadcount: number; plannedGuestCount: number } }>(`${ev(id)}/guests`),
  vendors: (id: number) => request<{ vendors: T.Vendor[] }>(`${ev(id)}/vendors`).then((r) => r.vendors),
  match: (id: number, category: string) => request<{ vendors: T.ScoredVendor[]; disclaimer: string }>(`${ev(id)}/vendors/match?category=${encodeURIComponent(category)}`),
  readiness: (id: number) => request<T.Readiness>(`${ev(id)}/readiness`),
  create: (id: number, res: 'budget' | 'tasks' | 'guests' | 'vendors', body: unknown) => request<{ id: number }>(`${ev(id)}/${res}`, { method: 'POST', body }),
  update: (id: number, res: 'budget' | 'tasks' | 'guests' | 'vendors', rid: number, body: unknown) => request<{ ok: true }>(`${ev(id)}/${res}/${rid}`, { method: 'PUT', body }),
  remove: (id: number, res: 'budget' | 'tasks' | 'guests' | 'vendors', rid: number) => request<void>(`${ev(id)}/${res}/${rid}`, { method: 'DELETE' }),
  plan: (id: number, prompt: string) => request<T.AiResponse>(`${ev(id)}/ai/plan`, { method: 'POST', body: { prompt } }),
  simulate: (id: number, s: T.Scenario) => request<T.SimResult>(`${ev(id)}/simulate`, { method: 'POST', body: s }),
  applySim: (id: number, s: T.Scenario) => request<{ applied: number }>(`${ev(id)}/simulate/apply`, { method: 'POST', body: s }),
  report: (id: number) => request<T.Report>(`${ev(id)}/report`),
};
