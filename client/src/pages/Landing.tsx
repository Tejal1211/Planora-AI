import { BarChart3, CalendarCheck, FlaskConical, Gauge, Sparkles, Store, Users, Wallet } from 'lucide-react';
import { Badge, Button } from '../ui';
import { useAsync } from '../ui';
import { api } from '../api';

const features = [
  [Sparkles, 'AI Copilot', 'Plans and checklists grounded in your saved event data.'],
  [Wallet, 'Budget Rescue', 'Deterministic overrun detection with honest trade-offs.'],
  [CalendarCheck, 'Adaptive Timeline', 'Deadlines that compress as your date gets closer.'],
  [FlaskConical, 'What-If Simulator', 'Preview cost, guest, vendor and weather shocks first.'],
  [Gauge, 'Readiness Score', 'A transparent 100-point score you can audit.'],
  [Store, 'Vendor Matching', 'Compare by price, rating, preferences and availability.'],
  [Users, 'Guest Manager', 'RSVPs, plus-ones and dietary needs in one place.'],
  [BarChart3, 'Exportable Report', 'CSV, JSON and print-ready summaries.'],
] as const;

export default function Landing({ onStart, onOpen, hasEvents }: { onStart: () => void; onOpen: () => void; hasEvents: boolean }) {
  const health = useAsync(() => api.health(), []);
  return (
    <div className="min-h-screen bg-gradient-to-b from-ivory-50 to-ivory-200">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="font-serif text-2xl font-bold text-emerald-800">Planora <span className="text-gold-500">AI</span></span>
        {hasEvents && <Button variant="ghost" onClick={onOpen}>My events</Button>}
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-20">
        <section className="py-16 text-center">
          <Badge tone="gold">Weddings · Birthdays · Community events</Badge>
          <h1 className="mx-auto mt-5 max-w-3xl text-5xl font-bold leading-tight text-emerald-900 sm:text-6xl">Plan the event. <span className="text-gold-500">Keep your calm.</span></h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-emerald-800/80">Planora combines an AI copilot with transparent, deterministic budgeting, timelines and readiness scoring, so every number is one you can verify.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3"><Button variant="gold" className="px-6 py-3 text-base" onClick={onStart}>Plan your event</Button>{hasEvents && <Button variant="ghost" className="px-6 py-3 text-base" onClick={onOpen}>Open dashboard</Button>}</div>
          <p className="mt-4 text-xs text-emerald-800/70">AI mode: {health.data ? (health.data.ai === 'gemini' ? 'Gemini connected' : 'Fallback mode (no API key configured, rule-based plans)') : health.error ? 'API unreachable' : 'checking...'}</p>
        </section>
        <section aria-label="Features" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(([Icon, t, d]) => (
            <div key={t} className="card"><Icon className="h-6 w-6 text-gold-500" aria-hidden /><h3 className="mt-3 text-lg font-semibold">{t}</h3><p className="mt-1 text-sm text-emerald-800/75">{d}</p></div>
          ))}
        </section>
        <p className="mt-10 text-center text-xs text-emerald-800/60">Vendors shown in the app are demonstration data and prices are estimates, not quotes.</p>
      </main>
    </div>
  );
}
