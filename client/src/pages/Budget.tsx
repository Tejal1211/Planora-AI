import { FormEvent, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '../api';
import { label, money } from '../format';
import type { BudgetItem } from '../types';
import { AsyncView, Badge, Button, Card, Empty, Field, Stat, TextInput, useAsync, useNotice } from '../ui';
import type { PageProps } from './Dashboard';

export default function Budget({ event, onChanged }: PageProps) {
  const st = useAsync(() => api.budget(event.id), [event]);
  const { notice, run } = useNotice();
  const [nf, setNf] = useState({ category: '', estimated: '' });
  const cur = event.currency;
  const act = (p: () => Promise<unknown>, msg: string) => run(p, msg, () => { st.reload(); onChanged(); });
  const add = async (e: FormEvent) => { e.preventDefault(); if (await act(() => api.create(event.id, 'budget', { category: nf.category.trim().toLowerCase().replace(/\s+/g, '_'), estimated: +nf.estimated }), 'Budget line added.')) setNf({ category: '', estimated: '' }); };
  const edit = (i: BudgetItem, k: 'estimated' | 'actual', v: string) => { const n = Number(v); if (v !== '' && n >= 0 && n !== i[k]) act(() => api.update(event.id, 'budget', i.id, { [k]: n }), 'Updated.'); };
  return (
    <div className="space-y-5">
      {notice}
      <AsyncView state={st}>{({ items, summary: s, rescue }) => (<>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Total budget" value={money(s.total, cur)} /><Stat label="Committed" value={money(s.committed, cur)} hint={`${s.usedPct}% of budget`} />
          <Stat label="Paid so far" value={money(s.actual, cur)} /><Stat label={s.status === 'over' ? 'Over budget by' : 'Remaining'} value={money(s.status === 'over' ? s.overrun : s.remaining, cur)} tone={s.status === 'over' ? 'bad' : 'good'} hint={<Badge tone={s.status === 'healthy' ? 'good' : s.status === 'warning' ? 'warn' : 'bad'}>{s.status}</Badge>} />
        </div>
        <Card title="Budget Rescue Engine" action={<Badge tone="neutral">Deterministic calculation</Badge>}>
          <p className="text-sm">{rescue.message}</p>
          {rescue.suggestions.length > 0 && <div className="mt-3 overflow-x-auto"><table className="w-full"><thead><tr><th className="th">Category</th><th className="th">Now</th><th className="th">Suggested cut</th><th className="th">After</th><th className="th">Trade-off</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-ivory-300">{rescue.suggestions.map((x) => <tr key={x.itemId}><td className="td font-medium">{label(x.category)}</td><td className="td">{money(x.current, cur)}</td><td className="td text-red-700">-{money(x.cut, cur)}</td><td className="td">{money(x.after, cur)}</td><td className="td max-w-xs text-xs">{x.tradeoff}</td>
              <td className="td"><Button variant="ghost" onClick={() => act(() => api.update(event.id, 'budget', x.itemId, { estimated: x.after }), `Applied cut to ${label(x.category)}.`)}>Apply</Button></td></tr>)}</tbody></table></div>}
        </Card>
        <Card title="Budget lines">
          {items.length === 0 ? <Empty title="No budget lines" hint="Add your first line below." /> : <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className="th">Category</th><th className="th">Estimated</th><th className="th">Actual paid</th><th className="th">Notes</th><th className="th"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody className="divide-y divide-ivory-300">{items.map((i) => (
              <tr key={`${i.id}-${i.estimated}-${i.actual}`}><td className="td font-medium">{label(i.category)}</td>
                <td className="td"><input aria-label={`${i.category} estimated`} className="input w-32" type="number" min={0} defaultValue={i.estimated} onBlur={(e) => edit(i, 'estimated', e.target.value)} /></td>
                <td className="td"><input aria-label={`${i.category} actual`} className="input w-32" type="number" min={0} defaultValue={i.actual} onBlur={(e) => edit(i, 'actual', e.target.value)} /></td>
                <td className="td text-xs text-emerald-800/70">{i.notes}</td>
                <td className="td"><Button variant="danger" aria-label={`Delete ${i.category}`} onClick={() => act(() => api.remove(event.id, 'budget', i.id), 'Line removed.')}><Trash2 className="h-4 w-4" aria-hidden /></Button></td></tr>))}</tbody></table></div>}
          <p className="mt-2 text-xs text-emerald-800/60">All amounts are estimates until you enter an actual paid amount. Edits save when you leave the field.</p>
          <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-3 border-t border-ivory-300 pt-4"><Field label="New category"><TextInput required value={nf.category} onChange={(e) => setNf({ ...nf, category: e.target.value })} placeholder="e.g. transport" maxLength={40} /></Field><Field label="Estimated amount"><TextInput required type="number" min={0} value={nf.estimated} onChange={(e) => setNf({ ...nf, estimated: e.target.value })} /></Field><Button type="submit">Add line</Button></form>
        </Card>
      </>)}</AsyncView>
    </div>
  );
}
