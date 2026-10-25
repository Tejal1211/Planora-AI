import { memo, useCallback, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { api } from '../api';
import { label, money } from '../format';
import type { Scenario, SimResult, Vendor } from '../types';
import { Alert, Badge, Button, Card, Field, Select, TextInput, useAsync, useNotice } from '../ui';
import type { PageProps } from './Dashboard';

/** Scenario type labels for the select options. */
const SCENARIO_LABELS: Record<Scenario['type'], string> = {
  cost_increase: 'Costs increase',
  add_guests: 'Guests are added',
  vendor_unavailable: 'Vendor becomes unavailable',
  weather: 'Weather disrupts outdoor event',
};

/** Available budget categories for the cost-increase scenario. */
const BUDGET_CATEGORIES = ['venue', 'catering', 'decor', 'photography', 'entertainment', 'av_equipment'] as const;

/** A single before/after comparison row in the simulation results table. */
const CompareRow = memo(function CompareRow({
  l,
  a,
  b,
  currency,
  isMoney = false,
}: {
  l: string;
  a: number | string;
  b: number | string;
  currency: string;
  isMoney?: boolean;
}) {
  const fmt = (v: number | string) => (isMoney ? money(+v, currency) : v);
  return (
    <tr>
      <td className="td font-medium">{l}</td>
      <td className="td">{fmt(a)}</td>
      <td className="td">
        <ArrowRight className="h-4 w-4 text-gold-500" aria-label="becomes" />
      </td>
      <td className={`td font-semibold ${a !== b ? 'text-emerald-700' : ''}`}>{fmt(b)}</td>
    </tr>
  );
});

export default function Simulator({ event, onChanged }: PageProps) {
  const vendors = useAsync(() => api.vendors(event.id), [event]);
  const [type, setType] = useState<Scenario['type']>('cost_increase');
  const [percent, setPercent] = useState('15');
  const [category, setCategory] = useState('');
  const [count, setCount] = useState('25');
  const [vendorId, setVendorId] = useState('');
  const [res, setRes] = useState<SimResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  const { notice, run } = useNotice();

  /** Vendors available for the "vendor becomes unavailable" scenario. */
  const pool = useMemo(() => {
    const selected = (vendors.data ?? []).filter((v: Vendor) => v.selected);
    return selected.length ? selected : (vendors.data ?? []);
  }, [vendors.data]);

  /** Builds the current scenario object from local form state. */
  const buildScenario = useCallback((): Scenario => {
    if (type === 'cost_increase') {
      return { type, percent: +percent, ...(category ? { category } : {}) };
    }
    if (type === 'add_guests') return { type, count: +count };
    if (type === 'vendor_unavailable') {
      return { type, vendorId: +(vendorId || pool[0]?.id || 0) };
    }
    return { type: 'weather' };
  }, [type, percent, category, count, vendorId, pool]);

  const preview = useCallback(async () => {
    setBusy(true);
    setApplied(false);
    setRes(null);
    await run(async () => setRes(await api.simulate(event.id, buildScenario())));
    setBusy(false);
  }, [run, event.id, buildScenario]);

  const apply = useCallback(
    () =>
      run(
        async () => {
          await api.applySim(event.id, buildScenario());
          setApplied(true);
          setRes(null);
          vendors.reload();
        },
        'Changes applied and saved to your event.',
        onChanged,
      ),
    [run, event.id, buildScenario, vendors, onChanged],
  );

  return (
    <div className="space-y-5">
      {/* Scenario builder */}
      <Card title="What-If Simulator">
        <p className="mb-3 text-sm text-emerald-800/80">
          Preview how a change affects your budget, tasks and readiness. Nothing is saved until you click Apply.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Scenario">
            <Select
              value={type}
              onChange={(e) => { setType(e.target.value as Scenario['type']); setRes(null); }}
              aria-label="Simulation scenario type"
            >
              {(Object.entries(SCENARIO_LABELS) as [Scenario['type'], string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>

          {type === 'cost_increase' && (
            <>
              <Field label="Increase %">
                <TextInput
                  type="number"
                  min={1}
                  max={200}
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  className="w-24"
                  aria-label="Cost increase percentage"
                />
              </Field>
              <Field label="Category">
                <Select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  aria-label="Budget category to apply cost increase to"
                >
                  <option value="">All unpaid lines</option>
                  {BUDGET_CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
                </Select>
              </Field>
            </>
          )}

          {type === 'add_guests' && (
            <Field label="Extra guests">
              <TextInput
                type="number"
                min={1}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="w-24"
                aria-label="Number of extra guests to add"
              />
            </Field>
          )}

          {type === 'vendor_unavailable' && (
            <Field label="Vendor">
              <Select
                value={vendorId || pool[0]?.id || ''}
                onChange={(e) => setVendorId(e.target.value)}
                aria-label="Vendor to mark as unavailable"
              >
                {pool.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}{v.selected ? ' (selected)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Button
            variant="gold"
            loading={busy}
            onClick={preview}
            disabled={type === 'vendor_unavailable' && pool.length === 0}
            aria-label="Preview the impact of the selected scenario"
          >
            Preview impact
          </Button>
        </div>
      </Card>

      {notice}

      {applied && (
        <Alert kind="success">
          Applied. Check the Budget and Timeline tabs for the updated numbers.
        </Alert>
      )}

      {/* Preview results */}
      {res && (
        <Card title={res.title} action={<Badge tone="warn">Preview only</Badge>}>
          {res.changes.length === 0
            ? <Alert kind="info">{res.notes.join(' ')}</Alert>
            : (
              <>
                <div className="grid gap-5 lg:grid-cols-2">
                  {/* Before → After comparison */}
                  <div>
                    <h3 className="mb-2 font-semibold">Before to after</h3>
                    <table className="w-full" aria-label="Scenario impact comparison">
                      <tbody className="divide-y divide-ivory-300">
                        <CompareRow l="Guests" a={res.before.guestCount} b={res.after.guestCount} currency={event.currency} />
                        <CompareRow l="Committed" a={res.before.committed} b={res.after.committed} currency={event.currency} isMoney />
                        <CompareRow l="Remaining" a={res.before.remaining} b={res.after.remaining} currency={event.currency} isMoney />
                        <CompareRow l="Budget status" a={res.before.status} b={res.after.status} currency={event.currency} />
                        <CompareRow l="Tasks" a={res.before.tasks} b={res.after.tasks} currency={event.currency} />
                        <CompareRow l="Readiness" a={res.before.readiness} b={res.after.readiness} currency={event.currency} />
                      </tbody>
                    </table>
                  </div>

                  {/* Proposed changes list */}
                  <div>
                    <h3 className="mb-2 font-semibold">Proposed changes ({res.changes.length})</h3>
                    <ul className="list-disc space-y-1 pl-5 text-sm" aria-label="List of proposed changes">
                      {res.changes.map((c, i) => <li key={i}>{c.label}</li>)}
                    </ul>
                  </div>
                </div>

                {/* Notes */}
                {res.notes.length > 0 && (
                  <div className="mt-3 space-y-1 text-sm" role="note" aria-label="Important simulation notes">
                    {res.notes.map((n) => <p key={n}>• {n}</p>)}
                  </div>
                )}

                {/* Rescue alert */}
                {res.rescue.overrun > 0 && (
                  <div className="mt-4"><Alert>{res.rescue.message}</Alert></div>
                )}

                <div className="mt-4 flex gap-2">
                  <Button onClick={apply} aria-label="Apply scenario changes to your event">
                    Apply these changes
                  </Button>
                  <Button variant="ghost" onClick={() => setRes(null)} aria-label="Discard scenario preview">
                    Discard
                  </Button>
                </div>
              </>
            )}
        </Card>
      )}
    </div>
  );
}
