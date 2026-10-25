import { FormEvent, useCallback, useMemo, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { api } from '../api';
import { label, money } from '../format';
import { AsyncView, Alert, Badge, Button, Card, Empty, Field, Select, TextInput, useAsync, useNotice } from '../ui';
import type { PageProps } from './Dashboard';

/** All possible vendor categories — filtered per event type below. */
const ALL_CATS = ['venue', 'catering', 'decor', 'photography', 'entertainment', 'av_equipment', 'other'] as const;

/**
 * Returns the relevant vendor categories for a given event type.
 * Community events skip photography/decor; wedding/birthday skip av_equipment.
 */
function categoriesForType(type: string): string[] {
  return ALL_CATS.filter((c) => {
    if (c === 'other') return true;
    if (type === 'community') return c !== 'photography' && c !== 'decor';
    if (type === 'wedding') return c !== 'av_equipment';
    return c !== 'av_equipment' && c !== 'photography'; // birthday
  });
}

export default function Vendors({ event, onChanged }: PageProps) {
  const options = useMemo(() => categoriesForType(event.type), [event.type]);
  const [cat, setCat] = useState(options[1] ?? options[0]);
  const st = useAsync(() => api.match(event.id, cat), [event, cat]);
  const { notice, run } = useNotice();
  const [nf, setNf] = useState({ name: '', price: '', rating: '4', services: '' });

  const act = useCallback(
    (p: () => Promise<unknown>, msg: string) => run(p, msg, () => { st.reload(); onChanged(); }),
    [run, st, onChanged],
  );

  const add = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    const success = await act(
      () => api.create(event.id, 'vendors', {
        name: nf.name,
        category: cat,
        price: +nf.price,
        rating: +nf.rating,
        services: nf.services,
        available: true,
        notes: 'Added by you - verify price directly with the vendor.',
      }),
      'Vendor added.',
    );
    if (success) setNf({ name: '', price: '', rating: '4', services: '' });
  }, [act, event.id, cat, nf]);

  return (
    <div className="space-y-5">
      <Alert kind="info">
        Vendors marked <b>Demo</b> are demonstration data with <b>estimated prices</b>, not real quotes.
        Scores are computed from price vs your category allocation, rating, preference match and availability.
      </Alert>
      {notice}

      <Card
        title="Smart vendor matching"
        action={
          <Select
            aria-label="Filter vendors by category"
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            className="w-48"
          >
            {options.map((c) => <option key={c} value={c}>{label(c)}</option>)}
          </Select>
        }
      >
        <AsyncView state={st}>{({ vendors }) =>
          vendors.length === 0
            ? <Empty title={`No ${label(cat)} vendors yet`} hint="Add one below to compare." />
            : (
              <div className="overflow-x-auto">
                <table className="w-full" aria-label={`${label(cat)} vendor comparison table`}>
                  <thead>
                    <tr>
                      <th className="th" scope="col">Vendor</th>
                      <th className="th" scope="col">Price</th>
                      <th className="th" scope="col">Rating</th>
                      <th className="th" scope="col">Score</th>
                      <th className="th" scope="col">Why</th>
                      <th className="th" scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ivory-300">
                    {vendors.map((v, i) => (
                      <tr key={v.id} className={v.available ? '' : 'opacity-60'}>
                        <td className="td">
                          <p className="font-medium">{v.name}</p>
                          <p className="text-xs text-emerald-800/70">{v.services}</p>
                          <div className="mt-1 flex gap-1">
                            {v.is_demo ? <Badge tone="warn">Demo</Badge> : null}
                            {v.selected ? <Badge tone="good">Selected</Badge> : null}
                            {!v.available && <Badge tone="bad">Unavailable</Badge>}
                            {i === 0 && v.eligible && <Badge tone="gold">Top match</Badge>}
                          </div>
                        </td>
                        <td className="td whitespace-nowrap">
                          {money(v.price, event.currency)}
                          <span className="block text-[10px] text-emerald-800/60">estimated</span>
                        </td>
                        <td className="td" aria-label={`Rating: ${v.rating} out of 5`}>{v.rating}/5</td>
                        <td className="td">
                          <b className="font-serif text-xl" aria-label={`Match score: ${v.score} out of 100`}>{v.score}</b>
                          <span className="block text-[10px] text-emerald-800/60">
                            P{v.breakdown.price} R{v.breakdown.rating} F{v.breakdown.fit} A{v.breakdown.availability}
                          </span>
                        </td>
                        <td className="td max-w-xs">
                          <ul className="list-disc pl-4 text-xs" aria-label={`Reasons for ${v.name}'s score`}>
                            {v.reasons.map((r) => <li key={r}>{r}</li>)}
                          </ul>
                        </td>
                        <td className="td">
                          <div className="flex flex-wrap gap-1">
                            <Button
                              variant={v.selected ? 'primary' : 'ghost'}
                              disabled={!v.available}
                              aria-label={v.selected ? `Unselect ${v.name}` : `Select ${v.name}`}
                              aria-pressed={v.selected ? 'true' : 'false'}
                              onClick={() => act(
                                () => api.update(event.id, 'vendors', v.id, { selected: !v.selected }),
                                v.selected ? 'Vendor unselected.' : `${v.name} selected.`,
                              )}
                            >
                              <Check className="h-4 w-4" aria-hidden />
                              {v.selected ? 'Selected' : 'Select'}
                            </Button>
                            <Button
                              variant="ghost"
                              aria-label={v.available ? `Mark ${v.name} as unavailable` : `Mark ${v.name} as available`}
                              onClick={() => act(
                                () => api.update(event.id, 'vendors', v.id, { available: !v.available }),
                                'Availability updated.',
                              )}
                            >
                              {v.available ? 'Mark unavailable' : 'Mark available'}
                            </Button>
                            <Button
                              variant="danger"
                              aria-label={`Delete vendor: ${v.name}`}
                              onClick={() => act(() => api.remove(event.id, 'vendors', v.id), 'Vendor removed.')}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        }</AsyncView>

        <form
          onSubmit={add}
          className="mt-4 flex flex-wrap items-end gap-3 border-t border-ivory-300 pt-4"
          aria-label={`Add a new ${label(cat)} vendor`}
        >
          <Field label={`Add ${label(cat)} vendor`}>
            <TextInput
              required
              value={nf.name}
              onChange={(e) => setNf({ ...nf, name: e.target.value })}
              maxLength={100}
              aria-label="Vendor name"
            />
          </Field>
          <Field label="Quoted price">
            <TextInput
              required
              type="number"
              min={0}
              value={nf.price}
              onChange={(e) => setNf({ ...nf, price: e.target.value })}
              aria-label="Quoted price"
            />
          </Field>
          <Field label="Rating (0–5)">
            <TextInput
              type="number"
              min={0}
              max={5}
              step={0.1}
              value={nf.rating}
              onChange={(e) => setNf({ ...nf, rating: e.target.value })}
              aria-label="Vendor rating between 0 and 5"
            />
          </Field>
          <Field label="Services (comma separated)">
            <TextInput
              value={nf.services}
              onChange={(e) => setNf({ ...nf, services: e.target.value })}
              maxLength={300}
              aria-label="Vendor services, comma separated"
            />
          </Field>
          <Button type="submit">Add vendor</Button>
        </form>
      </Card>
    </div>
  );
}
