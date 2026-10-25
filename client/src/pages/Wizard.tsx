import { FormEvent, useCallback, useId, useState } from 'react';
import { api } from '../api';
import type { EventInput, EventT, EventType } from '../types';
import { Alert, Button, Card, Field, Select, TextInput } from '../ui';

/** Human-readable labels for each event type. */
const EVENT_TYPES: [EventType, string][] = [
  ['wedding', 'Wedding'],
  ['birthday', 'Birthday'],
  ['community', 'Community event'],
];

/** Available currency options. */
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'] as const;

/** Initial blank form state. */
const INIT: Readonly<{
  name: string;
  type: EventType;
  date: string;
  location: string;
  venue_type: EventInput['venue_type'];
  guest_count: string;
  budget_total: string;
  currency: string;
  preferences: string;
}> = {
  name: '',
  type: 'wedding',
  date: '',
  location: '',
  venue_type: 'indoor',
  guest_count: '100',
  budget_total: '',
  currency: 'INR',
  preferences: '',
};

/** Ordered step labels for the progress indicator. */
const STEPS = ['Basics', 'Venue & guests', 'Budget'] as const;

export default function Wizard({
  onCreated,
  onCancel,
}: {
  onCreated: (e: EventT) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ ...INIT });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState('');
  const progressId = useId();

  /** Generic field setter — keeps the rest of the form intact. */
  const set = useCallback(
    <K extends keyof typeof INIT>(k: K) =>
      (e: { target: { value: string } }) =>
        setF((p) => ({ ...p, [k]: e.target.value })),
    [],
  );

  /** Validates the current step and updates the error map. Returns true if valid. */
  const validate = useCallback(
    (s: number): boolean => {
      const e: Record<string, string> = {};
      if (s === 0) {
        if (f.name.trim().length < 2) e.name = 'Enter a name (at least 2 characters).';
        if (!f.date) e.date = 'Choose the event date.';
      }
      if (
        s === 1 &&
        (!Number.isInteger(+f.guest_count) || +f.guest_count < 1 || +f.guest_count > 5000)
      ) {
        e.guest_count = 'Enter a whole number between 1 and 5000.';
      }
      if (s === 2 && !(+f.budget_total > 0)) {
        e.budget_total = 'Enter a budget greater than zero.';
      }
      setErrors(e);
      return Object.keys(e).length === 0;
    },
    [f],
  );

  const next = useCallback(() => {
    if (validate(step)) setStep((s) => s + 1);
  }, [validate, step]);

  const back = useCallback(() => setStep((s) => s - 1), []);

  const submit = useCallback(
    async (ev: FormEvent) => {
      ev.preventDefault();
      if (!validate(2)) return;
      setBusy(true);
      setApiError('');
      try {
        onCreated(
          await api.createEvent({
            ...f,
            guest_count: +f.guest_count,
            budget_total: +f.budget_total,
          }),
        );
      } catch (e) {
        setApiError(e instanceof Error ? e.message : 'Could not create event');
      } finally {
        setBusy(false);
      }
    },
    [validate, f, onCreated],
  );

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <Card title="Create your event" action={<Button variant="ghost" onClick={onCancel}>Cancel</Button>}>
        {/* Progress stepper */}
        <nav aria-label="Event creation steps">
          <ol id={progressId} className="mb-5 flex gap-2">
            {STEPS.map((s, i) => (
              <li
                key={s}
                aria-current={i === step ? 'step' : undefined}
                className={`flex-1 rounded-full px-3 py-1 text-center text-xs font-medium ${
                  i <= step ? 'bg-emerald-800 text-ivory-50' : 'bg-ivory-200'
                }`}
              >
                {i + 1}. {s}
              </li>
            ))}
          </ol>
        </nav>

        <form
          onSubmit={submit}
          noValidate
          className="space-y-4"
          aria-label={`Event creation step ${step + 1}: ${STEPS[step]}`}
        >
          {/* Step 0: Basics */}
          {step === 0 && (
            <>
              <Field label="Event name" error={errors.name}>
                <TextInput
                  value={f.name}
                  onChange={set('name')}
                  placeholder="Asha & Ravi's wedding"
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? 'name-error' : undefined}
                  maxLength={100}
                  autoFocus
                />
              </Field>
              <Field label="Event type">
                <Select value={f.type} onChange={set('type')} aria-label="Event type">
                  {EVENT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </Field>
              <Field label="Event date" error={errors.date}>
                <TextInput
                  type="date"
                  value={f.date}
                  onChange={set('date')}
                  aria-invalid={!!errors.date}
                  aria-describedby={errors.date ? 'date-error' : undefined}
                />
              </Field>
            </>
          )}

          {/* Step 1: Venue & Guests */}
          {step === 1 && (
            <>
              <Field label="Location">
                <TextInput
                  value={f.location}
                  onChange={set('location')}
                  placeholder="City or venue"
                  maxLength={120}
                  aria-label="Event location"
                />
              </Field>
              <Field
                label="Venue type"
                hint="Outdoor and hybrid events get weather-contingency tasks."
              >
                <Select value={f.venue_type} onChange={set('venue_type')} aria-label="Venue type">
                  <option value="indoor">Indoor</option>
                  <option value="outdoor">Outdoor</option>
                  <option value="hybrid">Hybrid</option>
                </Select>
              </Field>
              <Field label="Expected guests" error={errors.guest_count}>
                <TextInput
                  type="number"
                  min={1}
                  max={5000}
                  value={f.guest_count}
                  onChange={set('guest_count')}
                  aria-invalid={!!errors.guest_count}
                  aria-describedby={errors.guest_count ? 'guest_count-error' : undefined}
                  aria-label="Expected number of guests"
                />
              </Field>
            </>
          )}

          {/* Step 2: Budget */}
          {step === 2 && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <Field label="Currency">
                    <Select value={f.currency} onChange={set('currency')} aria-label="Currency">
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </Select>
                  </Field>
                </div>
                <div className="col-span-2">
                  <Field label="Total budget" error={errors.budget_total}>
                    <TextInput
                      type="number"
                      min={1}
                      value={f.budget_total}
                      onChange={set('budget_total')}
                      aria-invalid={!!errors.budget_total}
                      aria-describedby={errors.budget_total ? 'budget_total-error' : undefined}
                      aria-label="Total event budget"
                    />
                  </Field>
                </div>
              </div>
              <Field
                label="Preferences"
                hint="e.g. vegetarian menu, live music, minimal decor. Used for vendor matching and AI advice."
              >
                <textarea
                  className="input min-h-[80px]"
                  value={f.preferences}
                  onChange={set('preferences')}
                  maxLength={1000}
                  aria-label="Event preferences for vendor matching and AI advice"
                />
              </Field>
              <p className="text-xs text-emerald-800/70">
                We'll create a starter budget (keeping a 10% buffer), an adaptive timeline and
                clearly-labelled demo vendors with estimated prices.
              </p>
            </>
          )}

          {apiError && <Alert>{apiError}</Alert>}

          <div className="flex justify-between pt-2">
            <Button type="button" variant="ghost" disabled={step === 0} onClick={back}>
              Back
            </Button>
            {step < 2
              ? <Button type="button" onClick={next}>Continue</Button>
              : <Button type="submit" variant="gold" loading={busy}>Create event</Button>}
          </div>
        </form>
      </Card>
    </div>
  );
}
