import { memo } from 'react';
import { BarChart3, CalendarCheck, FlaskConical, Gauge, Sparkles, Store, Users, Wallet } from 'lucide-react';
import { Badge, Button, useAsync } from '../ui';
import { api } from '../api';
import type { ComponentType } from 'react';

// ---------------------------------------------------------------------------
// Feature list — defined outside the component so it's never re-created
// ---------------------------------------------------------------------------

interface Feature {
  Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  { Icon: Sparkles,      title: 'AI Copilot',         description: 'Plans and checklists grounded in your saved event data.' },
  { Icon: Wallet,        title: 'Budget Rescue',       description: 'Deterministic overrun detection with honest trade-offs.' },
  { Icon: CalendarCheck, title: 'Adaptive Timeline',   description: 'Deadlines that compress as your date gets closer.' },
  { Icon: FlaskConical,  title: 'What-If Simulator',   description: 'Preview cost, guest, vendor and weather shocks first.' },
  { Icon: Gauge,         title: 'Readiness Score',     description: 'A transparent 100-point score you can audit.' },
  { Icon: Store,         title: 'Vendor Matching',     description: 'Compare by price, rating, preferences and availability.' },
  { Icon: Users,         title: 'Guest Manager',       description: 'RSVPs, plus-ones and dietary needs in one place.' },
  { Icon: BarChart3,     title: 'Exportable Report',   description: 'CSV, JSON and print-ready summaries.' },
];

// ---------------------------------------------------------------------------
// Feature card — memoized; only re-renders when its own props change
// ---------------------------------------------------------------------------

const FeatureCard = memo(function FeatureCard({ Icon, title, description }: Feature) {
  return (
    <article className="card">
      <Icon className="h-6 w-6 text-gold-500" aria-hidden />
      <h2 className="mt-3 text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-emerald-800/75">{description}</p>
    </article>
  );
});

// ---------------------------------------------------------------------------
// AI status indicator
// ---------------------------------------------------------------------------

function AiStatusMessage({ ai }: { ai: string | undefined }) {
  if (ai === undefined) return <>checking&hellip;</>;
  if (ai === 'gemini') return <>Gemini connected</>;
  return <>Fallback mode (no API key configured, rule-based plans)</>;
}

// ---------------------------------------------------------------------------
// Landing page
// ---------------------------------------------------------------------------

export default function Landing({
  onStart,
  onOpen,
  hasEvents,
}: {
  onStart: () => void;
  onOpen: () => void;
  hasEvents: boolean;
}) {
  const health = useAsync(() => api.health(), []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-ivory-50 to-ivory-200">
      {/* Site header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="font-serif text-2xl font-bold text-emerald-800" aria-label="Planora AI">
          Planora <span className="text-gold-500" aria-hidden>AI</span>
        </span>
        {hasEvents && (
          <Button variant="ghost" onClick={onOpen} aria-label="Open my events dashboard">
            My events
          </Button>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-20">
        {/* Hero section */}
        <section className="py-16 text-center" aria-labelledby="hero-heading">
          <Badge tone="gold">Weddings · Birthdays · Community events</Badge>
          <h1
            id="hero-heading"
            className="mx-auto mt-5 max-w-3xl text-5xl font-bold leading-tight text-emerald-900 sm:text-6xl"
          >
            Plan the event.{' '}
            <span className="text-gold-500">Keep your calm.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-emerald-800/80">
            Planora combines an AI copilot with transparent, deterministic budgeting, timelines and
            readiness scoring, so every number is one you can verify.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              variant="gold"
              className="px-6 py-3 text-base"
              onClick={onStart}
              aria-label="Start planning your event"
            >
              Plan your event
            </Button>
            {hasEvents && (
              <Button
                variant="ghost"
                className="px-6 py-3 text-base"
                onClick={onOpen}
                aria-label="Open existing events dashboard"
              >
                Open dashboard
              </Button>
            )}
          </div>
          <p className="mt-4 text-xs text-emerald-800/70" aria-live="polite">
            AI mode:{' '}
            {health.error
              ? 'API unreachable'
              : <AiStatusMessage ai={health.data?.ai} />}
          </p>
        </section>

        {/* Feature grid */}
        <section aria-label="Planora AI features">
          <h2 className="sr-only">Features</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => <FeatureCard key={f.title} {...f} />)}
          </div>
        </section>

        <p className="mt-10 text-center text-xs text-emerald-800/60">
          Vendors shown in the app are demonstration data and prices are estimates, not quotes.
        </p>
      </main>
    </div>
  );
}
