import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { api } from '../api';
import { label, money } from '../format';
import type { Scenario, SimResult, Vendor } from '../types';
import { Alert, Badge, Button, Card, Field, Select, TextInput, useAsync, useNotice } from '../ui';
import type { PageProps } from './Dashboard';

export default function Simulator({ event, onChanged }: PageProps) {
  const vendors = useAsync(() => api.vendors(event.id), [event]);
  const [type, setType] = useState<Scenario['type']>('cost_increase');
  const [percent, setPercent] = useState('15'); const [category, setCategory] = useState(''); const [count, setCount] = useState('25'); const [vendorId, setVendorId] = useState('');
  const [res, setRes] = useState<SimResult | null>(null); const [busy, setBusy] = useState(false); const [applied, setApplied] = useState(false);
  const { notice, run } = useNotice();
  const selected = (vendors.data ?? []).filter((v: Vendor) => v.selected);
  const pool = selected.length ? selected : vendors.data ?? [];
  const scenario = (): Scenario => type === 'cost_increase' ? { type, percent: +percent, ...(category ? { category } : {}) } : type === 'add_guests' ? { type, count: +count } : type === 'vendor_unavailable' ? { type, vendorId: +(vendorId || pool[0]?.id || 0) } : { type };
  const preview = async () => { setBusy(true); setApplied(false); setRes(null); await run(async () => setRes(await api.simulate(event.id, scenario()))); setBusy(false); };
  const apply = () => run(async () => { await api.applySim(event.id, scenario()); setApplied(true); setRes(null); vendors.reload(); }, 'Changes applied and saved to your event.', onChanged);
  const Row = ({ l, a, b, money: m }: { l: string; a: number | string; b: number | string; money?: boolean }) => <tr><td className="td font-medium">{l}</td><td className="td">{m ? money(+a, event.currency) : a}</td><td className="td"><ArrowRight className="h-4 w-4 text-gold-500" aria-label="becomes" /></td><td className={`td font-semibold ${a !== b ? 'text-emerald-700' : ''}`}>{m ? money(+b, event.currency) : b}</td></tr>;
  return (
    <div className="space-y-5">
      <Card title="What-If Simulator">
        <p className="mb-3 text-sm text-emerald-800/80">Preview how a change affects your budget, tasks and readiness. Nothing is saved until you click Apply.</p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Scenario"><Select value={type} onChange={(e) => { setType(e.target.value as Scenario['type']); setRes(null); }}><option value="cost_increase">Costs increase</option><option value="add_guests">Guests are added</option><option value="vendor_unavailable">Vendor becomes unavailable</option><option value="weather">Weather disrupts outdoor event</option></Select></Field>
          {type === 'cost_increase' && <><Field label="Increase %"><TextInput type="number" min={1} max={200} value={percent} onChange={(e) => setPercent(e.target.value)} className="w-24" /></Field><Field label="Category"><Select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All unpaid lines</option>{['venue', 'catering', 'decor', 'photography', 'entertainment', 'av_equipment'].map((c) => <option key={c} value={c}>{label(c)}</option>)}</Select></Field></>}
          {type === 'add_guests' && <Field label="Extra guests"><TextInput type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} className="w-24" /></Field>}
          {type === 'vendor_unavailable' && <Field label="Vendor"><Select value={vendorId || pool[0]?.id || ''} onChange={(e) => setVendorId(e.target.value)}>{pool.map((v) => <option key={v.id} value={v.id}>{v.name}{v.selected ? ' (selected)' : ''}</option>)}</Select></Field>}
          <Button variant="gold" loading={busy} onClick={preview} disabled={type === 'vendor_unavailable' && pool.length === 0}>Preview impact</Button>
        </div>
      </Card>
      {notice}
      {applied && <Alert kind="success">Applied. Check the Budget and Timeline tabs for the updated numbers.</Alert>}
      {res && <Card title={res.title} action={<Badge tone="warn">Preview only</Badge>}>
        {res.changes.length === 0 ? <Alert kind="info">{res.notes.join(' ')}</Alert> : <>
          <div className="grid gap-5 lg:grid-cols-2">
            <div><h3 className="mb-2 font-semibold">Before to after</h3><table className="w-full"><tbody className="divide-y divide-ivory-300">
              <Row l="Guests" a={res.before.guestCount} b={res.after.guestCount} /><Row l="Committed" a={res.before.committed} b={res.after.committed} money /><Row l="Remaining" a={res.before.remaining} b={res.after.remaining} money />
              <Row l="Budget status" a={res.before.status} b={res.after.status} /><Row l="Tasks" a={res.before.tasks} b={res.after.tasks} /><Row l="Readiness" a={res.before.readiness} b={res.after.readiness} /></tbody></table></div>
            <div><h3 className="mb-2 font-semibold">Proposed changes ({res.changes.length})</h3><ul className="list-disc space-y-1 pl-5 text-sm">{res.changes.map((c, i) => <li key={i}>{c.label}</li>)}</ul></div>
          </div>
          {res.notes.length > 0 && <div className="mt-3 space-y-1 text-sm">{res.notes.map((n) => <p key={n}>• {n}</p>)}</div>}
          {res.rescue.overrun > 0 && <div className="mt-4"><Alert>{res.rescue.message}</Alert></div>}
          <div className="mt-4 flex gap-2"><Button onClick={apply}>Apply these changes</Button><Button variant="ghost" onClick={() => setRes(null)}>Discard</Button></div></>}
      </Card>}
    </div>
  );
}
