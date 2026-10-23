import { FormEvent, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api';
import { daysUntil, label, money } from '../format';
import type { EventT } from '../types';
import { AsyncView, Badge, Button, Card, Empty, Field, Select, Stat, TextInput, useAsync, useNotice } from '../ui';

const COLORS = ['#0B4A32', '#C09A38', '#3E9E73', '#E3C677', '#157A4F', '#9C7A25', '#9FD1B6', '#073624'];
export interface PageProps { event: EventT; onChanged: () => void }

export default function Dashboard({ event, onChanged }: PageProps) {
  const data = useAsync(async () => { const [b, r, t] = await Promise.all([api.budget(event.id), api.readiness(event.id), api.tasks(event.id)]); return { b, r, t }; }, [event]);
  const d = daysUntil(event.date);
  return (
    <div className="space-y-5">
      <AsyncView state={data}>{({ b, r, t }) => (<>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Days to go" value={d >= 0 ? d : 'Past'} hint={event.date} />
          <Stat label="Readiness" value={`${r.score}/100`} hint={r.label} tone={r.score < 40 ? 'bad' : 'good'} />
          <Stat label="Budget used" value={`${b.summary.usedPct}%`} hint={`${money(b.summary.remaining, event.currency)} remaining`} tone={b.summary.status === 'over' ? 'bad' : undefined} />
          <Stat label="Tasks done" value={`${t.stats.done}/${t.stats.total}`} hint={t.stats.overdue ? `${t.stats.overdue} overdue` : 'None overdue'} tone={t.stats.overdue ? 'bad' : undefined} />
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Budget by category">
            {b.summary.byCategory.length ? <div className="h-64" role="img" aria-label="Budget by category pie chart"><ResponsiveContainer><PieChart><Pie data={b.summary.byCategory} dataKey="committed" nameKey="category" outerRadius={90} label={(x) => label(String(x.name))}>{b.summary.byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip formatter={(v: number) => money(v, event.currency)} /></PieChart></ResponsiveContainer></div> : <Empty title="No budget lines yet" />}
          </Card>
          <Card title="Estimated vs actual">
            <div className="h-64" role="img" aria-label="Estimated versus actual bar chart"><ResponsiveContainer><BarChart data={b.summary.byCategory.map((c) => ({ ...c, name: label(c.category) }))}><CartesianGrid strokeDasharray="3 3" stroke="#E6DCC6" /><XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={60} /><YAxis tick={{ fontSize: 10 }} /><Tooltip formatter={(v: number) => money(v, event.currency)} /><Legend /><Bar dataKey="estimated" fill="#0B4A32" /><Bar dataKey="actual" fill="#C09A38" /></BarChart></ResponsiveContainer></div>
          </Card>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Readiness breakdown" action={<Badge tone={r.score >= 60 ? 'good' : 'warn'}>{r.label}</Badge>}>
            <ul className="space-y-3">{r.components.map((c) => (
              <li key={c.key}><div className="flex justify-between text-sm font-medium"><span>{c.label}</span><span>{c.points}/{c.weight}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-ivory-200" role="progressbar" aria-valuenow={c.points} aria-valuemax={c.weight} aria-label={c.label}><div className="h-full bg-emerald-700" style={{ width: `${(c.points / c.weight) * 100}%` }} /></div>
                <p className="mt-1 text-xs text-emerald-800/70">{c.detail}</p></li>))}</ul>
            {r.nextActions.length > 0 && <div className="mt-4 rounded-lg bg-gold-100 p-3 text-sm"><p className="font-medium">Next best actions</p><ul className="list-disc pl-5">{r.nextActions.map((a) => <li key={a}>{a}</li>)}</ul></div>}
          </Card>
          <SettingsCard event={event} onChanged={onChanged} />
        </div>
      </>)}</AsyncView>
    </div>
  );
}

function SettingsCard({ event, onChanged }: PageProps) {
  const [f, setF] = useState({ date: event.date, guest_count: String(event.guest_count), budget_total: String(event.budget_total), venue_type: event.venue_type, has_backup_plan: !!event.has_backup_plan, contingency_notes: event.contingency_notes });
  const { notice, run } = useNotice(); const [busy, setBusy] = useState(false);
  const save = async (e: FormEvent) => { e.preventDefault(); setBusy(true); await run(() => api.updateEvent(event.id, { ...f, guest_count: +f.guest_count, budget_total: +f.budget_total }), 'Saved. Timeline dates re-synced if the date changed.', onChanged); setBusy(false); };
  return (
    <Card title="Event settings">
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><TextInput type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></Field>
          <Field label="Guests"><TextInput type="number" min={1} value={f.guest_count} onChange={(e) => setF({ ...f, guest_count: e.target.value })} /></Field>
          <Field label={`Budget (${event.currency})`}><TextInput type="number" min={1} value={f.budget_total} onChange={(e) => setF({ ...f, budget_total: e.target.value })} /></Field>
          <Field label="Venue"><Select value={f.venue_type} onChange={(e) => setF({ ...f, venue_type: e.target.value as EventT['venue_type'] })}><option value="indoor">Indoor</option><option value="outdoor">Outdoor</option><option value="hybrid">Hybrid</option></Select></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.has_backup_plan} onChange={(e) => setF({ ...f, has_backup_plan: e.target.checked })} /> Weather / backup venue plan is in place</label>
        <Field label="Contingency notes"><textarea className="input" rows={2} maxLength={1000} value={f.contingency_notes} onChange={(e) => setF({ ...f, contingency_notes: e.target.value })} /></Field>
        {notice}<Button type="submit" loading={busy}>Save settings</Button>
      </form>
    </Card>
  );
}
