import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarCheck,
  FlaskConical,
  FileText,
  LayoutDashboard,
  Plus,
  Sparkles,
  Store,
  Trash2,
  Users,
  Wallet,
} from 'lucide-react';
import { api } from './api';
import type { EventT } from './types';
import { Alert, Badge, Button, Select, Spinner, useAsync } from './ui';

// Lazy-loaded page modules — each splits into its own chunk for faster initial load.
const Landing = lazy(() => import('./pages/Landing'));
const Wizard = lazy(() => import('./pages/Wizard'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Copilot = lazy(() => import('./pages/Copilot'));
const Budget = lazy(() => import('./pages/Budget'));
const Tasks = lazy(() => import('./pages/Tasks'));
const Vendors = lazy(() => import('./pages/Vendors'));
const Guests = lazy(() => import('./pages/Guests'));
const Simulator = lazy(() => import('./pages/Simulator'));
const ReportPage = lazy(() => import('./pages/ReportPage'));

// ---------------------------------------------------------------------------
// Navigation configuration
// ---------------------------------------------------------------------------

/**
 * Tuple: [route key, display label, Lucide icon component].
 * `as const` narrows types for the `Tab` union below.
 */
const TABS = [
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['copilot', 'AI Copilot', Sparkles],
  ['budget', 'Budget', Wallet],
  ['tasks', 'Timeline', CalendarCheck],
  ['vendors', 'Vendors', Store],
  ['guests', 'Guests', Users],
  ['simulator', 'Simulator', FlaskConical],
  ['report', 'Report', FileText],
] as const;

type Tab = (typeof TABS)[number][0];
type View = 'landing' | 'wizard' | 'app';

/** Map from tab key to its lazy-loaded page component. */
const PAGES: Record<Tab, typeof Dashboard> = {
  dashboard: Dashboard,
  copilot: Copilot,
  budget: Budget,
  tasks: Tasks,
  vendors: Vendors,
  guests: Guests,
  simulator: Simulator,
  report: ReportPage,
};

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

/** Read the last-selected event id from localStorage (UI preference only). */
const readStoredId = (): number | null => {
  try {
    return Number(localStorage.getItem('planora.selected')) || null;
  } catch {
    return null;
  }
};

/** Persist the selected event id to localStorage (best-effort; ignore quota errors). */
const writeStoredId = (id: number): void => {
  try {
    localStorage.setItem('planora.selected', String(id));
  } catch {
    /* ignore storage quota errors */
  }
};

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export default function App() {
  const events = useAsync(() => api.events(), []);
  const [view, setView] = useState<View>('landing');
  const [tab, setTab] = useState<Tab>('dashboard');

  // All event data lives in SQLite; this is a UI preference only.
  const [selId, setSelId] = useState<number | null>(readStoredId);

  const list = events.data ?? [];

  /** The currently active event — falls back to the first event in the list. */
  const event = useMemo(
    () => list.find((e) => e.id === selId) ?? list[0],
    [list, selId],
  );

  // Persist selected event id whenever the active event changes.
  useEffect(() => {
    if (event) writeStoredId(event.id);
  }, [event]);

  const handleCreated = useCallback(
    (e: EventT) => {
      setSelId(e.id);
      setTab('dashboard');
      events.reload();
      setView('app');
    },
    [events],
  );

  const handleDelete = useCallback(async () => {
    if (!event) return;
    if (confirm(`Delete "${event.name}" and all its data? This cannot be undone.`)) {
      await api.deleteEvent(event.id);
      setSelId(null);
      events.reload();
    }
  }, [event, events]);

  // Full-screen loading / error gates (before we have any data)
  if (view === 'landing') {
    return (
      <Suspense fallback={<Spinner label="Loading planner..." />}>
        <Landing
          onStart={() => setView('wizard')}
          onOpen={() => setView('app')}
          hasEvents={list.length > 0}
        />
      </Suspense>
    );
  }

  if (view === 'wizard') {
    return (
      <Suspense fallback={<Spinner label="Loading planner..." />}>
        <Wizard
          onCancel={() => setView(list.length ? 'app' : 'landing')}
          onCreated={handleCreated}
        />
      </Suspense>
    );
  }

  if (events.loading && !events.data) return <Spinner label="Loading your events..." />;

  if (events.error && !events.data) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <Alert>{events.error}</Alert>
        <Button className="mt-3" onClick={events.reload}>
          Retry
        </Button>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="mx-auto max-w-lg p-10 text-center">
        <h1 className="text-3xl font-bold">No events yet</h1>
        <p className="my-3 text-sm">Create your first event to unlock the planner.</p>
        <Button variant="gold" onClick={() => setView('wizard')}>
          Create event
        </Button>
      </div>
    );
  }

  const Page = PAGES[tab];

  return (
    <div className="min-h-screen lg:flex">
      {/* Skip-to-main link for keyboard and screen reader users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-emerald-900 focus:px-3 focus:py-2 focus:text-ivory-50 focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      {/* Sidebar navigation */}
      <nav
        aria-label="Main navigation"
        className="border-b border-ivory-300 bg-emerald-900 text-ivory-100 lg:min-h-screen lg:w-60 lg:border-b-0 lg:p-4"
      >
        <div className="flex items-center justify-between px-4 py-3 lg:px-2">
          <button
            onClick={() => setView('landing')}
            className="font-serif text-2xl font-bold"
            aria-label="Go to Planora AI home page"
          >
            Planora <span className="text-gold-400">AI</span>
          </button>
        </div>

        <ul
          className="flex gap-1 overflow-x-auto px-2 pb-2 lg:block lg:space-y-1 lg:px-0 lg:pb-0"
          role="list"
        >
          {TABS.map(([k, l, Icon]) => (
            <li key={k} role="listitem">
              <button
                onClick={() => setTab(k)}
                aria-current={tab === k ? 'page' : undefined}
                className={`flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm ${
                  tab === k ? 'bg-gold-400 text-emerald-900' : 'hover:bg-emerald-800'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {l}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Main content area */}
      <main id="main-content" className="flex-1 p-4 lg:p-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">{event.name}</h1>
            <p className="text-sm text-emerald-800/70">
              {event.type} · {event.date} ·{' '}
              <Badge tone="warn">Demo vendor data · estimated prices</Badge>
            </p>
          </div>

          <div className="no-print flex flex-wrap items-center gap-2">
            {list.length > 1 && (
              <Select
                aria-label="Switch event"
                value={event.id}
                onChange={(e) => setSelId(+e.target.value)}
                className="w-48"
              >
                {list.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            )}
            <Button variant="gold" onClick={() => setView('wizard')}>
              <Plus className="h-4 w-4" aria-hidden />
              New event
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              aria-label={`Delete event: ${event.name}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </header>

        {/* Page content — keyed so each event+tab combo mounts fresh */}
        <Suspense fallback={<Spinner label="Loading view..." />}>
          <Page key={`${event.id}-${tab}`} event={event} onChanged={events.reload} />
        </Suspense>

        <p className="mt-10 flex items-center gap-1 text-xs text-emerald-800/50">
          <BarChart3 className="h-3 w-3" aria-hidden />
          Planora AI · budget maths, scores and simulations are deterministic; AI only drafts advice.
        </p>
      </main>
    </div>
  );
}
