import { Download, Printer } from 'lucide-react';
import { api } from '../api';
import { csvCell, fmtDate, label, money } from '../format';
import type { Report } from '../types';
import { Alert, AsyncView, Badge, Button, Card, useAsync } from '../ui';
import type { PageProps } from './Dashboard';

const download = (name: string, mime: string, content: string) => {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
};
export const toCsv = (r: Report) => {
  const rows: unknown[][] = [['Planora AI report', r.event.name], ['Generated', r.generatedAt], ['Readiness', r.readiness.score], [], ['Budget category', 'Estimated', 'Actual', 'Notes'], ...r.budget.items.map((i) => [i.category, i.estimated, i.actual, i.notes]), [],
    ['Task', 'Due', 'Status', 'Priority', 'Overdue'], ...r.tasks.map((t) => [t.title, t.due_date, t.status, t.priority, t.overdue ? 'yes' : 'no']), [], ['Selected vendor', 'Category', 'Estimated price', 'Demo data'], ...r.selectedVendors.map((v) => [v.name, v.category, v.price, v.is_demo ? 'yes' : 'no']), [], ['Note', r.disclaimer]];
  return rows.map((r2) => r2.map(csvCell).join(',')).join('\n');
};

export default function ReportPage({ event }: PageProps) {
  const st = useAsync(() => api.report(event.id), [event]);
  const cur = event.currency;
  return (
    <AsyncView state={st}>{(r) => (
      <div className="space-y-5">
        <div className="no-print flex flex-wrap gap-2">
          <Button onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden />Print / Save as PDF</Button>
          <Button variant="ghost" onClick={() => download(`planora-${event.id}.csv`, 'text/csv', toCsv(r))}><Download className="h-4 w-4" aria-hidden />CSV</Button>
          <Button variant="ghost" onClick={() => download(`planora-${event.id}.json`, 'application/json', JSON.stringify(r, null, 2))}><Download className="h-4 w-4" aria-hidden />JSON</Button>
        </div>
        <Card title={`${r.event.name} - Event report`}>
          <p className="text-sm">{label(r.event.type)} · {fmtDate(r.event.date)} · {r.event.location || 'Location TBD'} · {r.event.guest_count} guests</p>
          <p className="mt-2 text-sm">Readiness <b>{r.readiness.score}/100</b> <Badge tone="good">{r.readiness.label}</Badge></p>
          <ul className="mt-2 list-disc pl-5 text-sm">{r.readiness.components.map((c) => <li key={c.key}>{c.label}: {c.points}/{c.weight}. {c.detail}</li>)}</ul>
        </Card>
        <Card title="Budget"><p className="text-sm">Total {money(r.budget.summary.total, cur)} · Committed {money(r.budget.summary.committed, cur)} · Remaining {money(r.budget.summary.remaining, cur)} · Status <b>{r.budget.summary.status}</b></p>
          <table className="mt-3 w-full"><thead><tr><th className="th">Category</th><th className="th">Estimated</th><th className="th">Actual</th></tr></thead><tbody className="divide-y divide-ivory-300">{r.budget.items.map((i) => <tr key={i.id}><td className="td">{label(i.category)}</td><td className="td">{money(i.estimated, cur)}</td><td className="td">{money(i.actual, cur)}</td></tr>)}</tbody></table>
          {r.budget.rescue.overrun > 0 && <p className="mt-2 text-sm">{r.budget.rescue.message}</p>}</Card>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Tasks"><p className="text-sm">{r.taskStats.done}/{r.taskStats.total} done · {r.taskStats.overdue} overdue</p><ul className="mt-2 space-y-1 text-sm">{r.tasks.filter((t) => t.overdue).map((t) => <li key={t.id} className="text-red-700">Overdue: {t.title} ({fmtDate(t.due_date)})</li>)}</ul></Card>
          <Card title="Guests & vendors"><p className="text-sm">{r.guests.yes} attending · {r.guests.pending} pending · {r.guests.no} declined</p><ul className="mt-2 text-sm">{r.selectedVendors.length ? r.selectedVendors.map((v) => <li key={v.id}>{v.name} ({label(v.category)}) {money(v.price, cur)} (est.){v.is_demo ? ' [demo]' : ''}</li>) : <li>No vendors selected yet.</li>}</ul></Card>
        </div>
        <Alert kind="info">{r.disclaimer}</Alert>
      </div>)}</AsyncView>
  );
}
