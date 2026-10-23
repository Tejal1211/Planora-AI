import { ReactNode, useCallback, useEffect, useState, SelectHTMLAttributes, InputHTMLAttributes, ButtonHTMLAttributes } from 'react';
import { AlertCircle, CheckCircle2, Inbox, Loader2 } from 'lucide-react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Button({ variant = 'primary', loading, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'gold' | 'ghost' | 'danger'; loading?: boolean }) {
  return <button {...p} disabled={p.disabled || loading} className={cx('btn', `btn-${variant}`, className)}>{loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{children}</button>;
}
export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={cx('card', className)}>{(title || action) && <header className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold">{title}</h2>{action}</header>}{children}</section>;
}
export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const s = { error: 'border-red-200 bg-red-50 text-red-900', success: 'border-emerald-200 bg-emerald-50 text-emerald-900', info: 'border-gold-300 bg-gold-100 text-emerald-900' }[kind];
  return <div role={kind === 'error' ? 'alert' : 'status'} className={cx('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', s)}>{kind === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}<div>{children}</div></div>;
}
export function Spinner({ label = 'Loading...' }: { label?: string }) {
  return <div role="status" className="flex items-center justify-center gap-2 py-10 text-emerald-800/70"><Loader2 className="h-5 w-5 animate-spin" aria-hidden />{label}</div>;
}
export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center gap-2 py-10 text-center"><Inbox className="h-8 w-8 text-gold-500" aria-hidden /><p className="font-medium">{title}</p>{hint && <p className="text-sm text-emerald-800/70">{hint}</p>}{action}</div>;
}
export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'gold'; children: ReactNode }) {
  const s = { neutral: 'bg-ivory-200 text-emerald-800', good: 'bg-emerald-100 text-emerald-800', warn: 'bg-gold-100 text-gold-600', bad: 'bg-red-100 text-red-800', gold: 'bg-gold-400 text-emerald-900' }[tone];
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', s)}>{children}</span>;
}
export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium">{label}</span>{children}{hint && !error && <span className="mt-1 block text-xs text-emerald-800/60">{hint}</span>}{error && <span role="alert" className="mt-1 block text-xs text-red-700">{error}</span>}</label>;
}
export const TextInput = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx('input', p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx('input', p.className)} />;
export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'bad' | 'good' }) {
  return <div className="card"><p className="text-xs font-medium uppercase tracking-wide text-emerald-800/60">{label}</p><p className={cx('mt-1 font-serif text-3xl font-semibold', tone === 'bad' && 'text-red-700')}>{value}</p>{hint && <p className="mt-1 text-xs text-emerald-800/70">{hint}</p>}</div>;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [st, set] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let live = true;
    set((s) => ({ ...s, loading: true, error: undefined }));
    fn().then((data) => live && set({ data, loading: false }), (e) => live && set({ error: e instanceof Error ? e.message : 'Something went wrong', loading: false }));
    return () => { live = false; };
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...st, reload };
}

/** Renders loading / error / content for a useAsync result. */
export function AsyncView<T>({ state, children }: { state: { data?: T; error?: string; loading: boolean; reload: () => void }; children: (d: T) => ReactNode }) {
  if (state.data !== undefined) return <>{state.error && <Alert>{state.error}</Alert>}{children(state.data)}</>;
  if (state.error) return <div className="space-y-3"><Alert>{state.error}</Alert><Button variant="ghost" onClick={state.reload}>Retry</Button></div>;
  return <Spinner />;
}

export function useNotice() {
  const [n, set] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const ok = (text: string) => set({ kind: 'success', text });
  const fail = (e: unknown) => set({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
  const run = async (p: () => Promise<unknown>, msg?: string, after?: () => void) => { try { await p(); if (msg) ok(msg); after?.(); return true; } catch (e) { fail(e); return false; } };
  return { notice: n ? <Alert kind={n.kind}>{n.text}</Alert> : null, ok, fail, run };
}
