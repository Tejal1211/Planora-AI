import { FormEvent, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '../api';
import type { Guest } from '../types';
import { Alert, AsyncView, Button, Card, Empty, Field, Select, Stat, TextInput, useAsync, useNotice } from '../ui';
import type { PageProps } from './Dashboard';

export default function Guests({ event, onChanged }: PageProps) {
  const st = useAsync(() => api.guests(event.id), [event]);
  const { notice, run } = useNotice();
  const [nf, setNf] = useState({ name: '', email: '', dietary: '', plus_ones: '0' });
  const act = (p: () => Promise<unknown>, msg?: string) => run(p, msg, () => { st.reload(); onChanged(); });
  const add = async (e: FormEvent) => { e.preventDefault(); if (await act(() => api.create(event.id, 'guests', { ...nf, plus_ones: +nf.plus_ones }), 'Guest added.')) setNf({ name: '', email: '', dietary: '', plus_ones: '0' }); };
  return (
    <div className="space-y-5">
      {notice}
      <AsyncView state={st}>{({ guests, summary: s }) => (<>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4"><Stat label="Invited" value={s.total} /><Stat label="Attending" value={s.yes} hint={`${s.confirmedHeadcount} people incl. plus-ones`} /><Stat label="Pending" value={s.pending} /><Stat label="Declined" value={s.no} /></div>
        {s.expectedHeadcount > s.plannedGuestCount && <Alert kind="info">Expected headcount ({s.expectedHeadcount}) exceeds the planned guest count ({s.plannedGuestCount}). Use the Simulator's "Add guests" scenario to see the budget impact.</Alert>}
        <Card title="Guest list">
          {guests.length === 0 ? <Empty title="No guests yet" hint="Add your first guest below." /> : <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className="th">Name</th><th className="th">Email</th><th className="th">RSVP</th><th className="th">Plus-ones</th><th className="th">Dietary</th><th className="th"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody className="divide-y divide-ivory-300">{guests.map((g: Guest) => (<tr key={g.id}><td className="td font-medium">{g.name}</td><td className="td text-xs">{g.email || '-'}</td>
              <td className="td"><Select aria-label={`RSVP for ${g.name}`} value={g.rsvp} onChange={(e) => act(() => api.update(event.id, 'guests', g.id, { rsvp: e.target.value }))} className="!py-1"><option value="pending">Pending</option><option value="yes">Attending</option><option value="no">Declined</option></Select></td>
              <td className="td">{g.plus_ones}</td><td className="td text-xs">{g.dietary || '-'}</td>
              <td className="td"><Button variant="danger" aria-label={`Delete ${g.name}`} onClick={() => act(() => api.remove(event.id, 'guests', g.id), 'Guest removed.')}><Trash2 className="h-4 w-4" aria-hidden /></Button></td></tr>))}</tbody></table></div>}
          <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-3 border-t border-ivory-300 pt-4"><Field label="Name"><TextInput required value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} maxLength={100} /></Field><Field label="Email"><TextInput type="email" value={nf.email} onChange={(e) => setNf({ ...nf, email: e.target.value })} /></Field><Field label="Dietary"><TextInput value={nf.dietary} onChange={(e) => setNf({ ...nf, dietary: e.target.value })} maxLength={100} /></Field><Field label="Plus-ones"><TextInput type="number" min={0} max={10} value={nf.plus_ones} onChange={(e) => setNf({ ...nf, plus_ones: e.target.value })} className="w-20" /></Field><Button type="submit">Add guest</Button></form>
        </Card>
      </>)}</AsyncView>
    </div>
  );
}
