import { FormEvent, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../api';
import { fmtDate, label } from '../format';
import type { Task } from '../types';
import { AsyncView, Badge, Button, Card, Empty, Field, Select, Stat, TextInput, useAsync, useNotice } from '../ui';
import type { PageProps } from './Dashboard';

const cols: [Task['status'], string][] = [['todo', 'To do'], ['doing', 'In progress'], ['done', 'Done']];

export default function Tasks({ event, onChanged }: PageProps) {
  const st = useAsync(() => api.tasks(event.id), [event]);
  const { notice, run } = useNotice();
  const [nf, setNf] = useState({ title: '', due_date: event.date, priority: 'medium' });
  const act = (p: () => Promise<unknown>, msg?: string) => run(p, msg, () => { st.reload(); onChanged(); });
  const add = async (e: FormEvent) => { e.preventDefault(); if (await act(() => api.create(event.id, 'tasks', { ...nf, category: 'general' }), 'Task added.')) setNf({ ...nf, title: '' }); };
  return (
    <div className="space-y-5">
      {notice}
      <AsyncView state={st}>{({ tasks, stats }) => (<>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4"><Stat label="Progress" value={`${stats.progress}%`} /><Stat label="Done" value={`${stats.done}/${stats.total}`} /><Stat label="Overdue" value={stats.overdue} tone={stats.overdue ? 'bad' : 'good'} /><Stat label="Due in 7 days" value={stats.dueSoon} /></div>
        <Card title="Adaptive timeline" action={<Button variant="ghost" onClick={() => act(() => api.regenerateTimeline(event.id), 'Timeline re-synced to your event date.')}><RefreshCw className="h-4 w-4" aria-hidden />Re-sync deadlines</Button>}>
          <p className="text-sm text-emerald-800/80">Deadlines are generated from your event date and compressed automatically when time is short. Completed tasks are never changed.</p>
          <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-3"><Field label="New task"><TextInput required value={nf.title} onChange={(e) => setNf({ ...nf, title: e.target.value })} maxLength={140} /></Field><Field label="Due"><TextInput type="date" required value={nf.due_date} onChange={(e) => setNf({ ...nf, due_date: e.target.value })} /></Field><Field label="Priority"><Select value={nf.priority} onChange={(e) => setNf({ ...nf, priority: e.target.value })}><option>low</option><option>medium</option><option>high</option></Select></Field><Button type="submit">Add task</Button></form>
        </Card>
        {tasks.length === 0 ? <Card><Empty title="No tasks yet" hint="Re-sync deadlines to generate your timeline." /></Card> :
          <div className="grid gap-5 lg:grid-cols-3">{cols.map(([s, title]) => (
            <Card key={s} title={`${title} (${tasks.filter((t) => t.status === s).length})`}>
              <ul className="space-y-2">{tasks.filter((t) => t.status === s).map((t) => (
                <li key={t.id} className={`rounded-lg border p-3 text-sm ${t.overdue ? 'border-red-300 bg-red-50' : 'border-ivory-300 bg-white'}`}>
                  <p className="font-medium">{t.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1 text-xs"><span>{fmtDate(t.due_date)}</span><Badge tone={t.priority === 'high' ? 'bad' : 'neutral'}>{t.priority}</Badge><Badge>{label(t.category)}</Badge>{t.overdue && <Badge tone="bad">Overdue</Badge>}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Select aria-label={`Status of ${t.title}`} value={t.status} onChange={(e) => act(() => api.update(event.id, 'tasks', t.id, { status: e.target.value }))} className="!py-1">{cols.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
                    <Button variant="danger" aria-label={`Delete ${t.title}`} className="!px-2 !py-1" onClick={() => act(() => api.remove(event.id, 'tasks', t.id))}><Trash2 className="h-4 w-4" aria-hidden /></Button></div>
                </li>))}</ul>
              {tasks.every((t) => t.status !== s) && <p className="py-4 text-center text-sm text-emerald-800/60">Nothing here</p>}
            </Card>))}</div>}
      </>)}</AsyncView>
    </div>
  );
}
