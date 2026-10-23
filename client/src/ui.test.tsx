import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, request } from './api';
import { Alert, AsyncView, Empty, Field, TextInput } from './ui';
import Wizard from './pages/Wizard';

afterEach(() => vi.restoreAllMocks());

describe('ui components', () => {
  it('Alert uses role=alert for errors and status otherwise', () => {
    render(<><Alert>Bad</Alert><Alert kind="success">Good</Alert></>);
    expect(screen.getByRole('alert')).toHaveTextContent('Bad'); expect(screen.getByRole('status')).toHaveTextContent('Good');
  });
  it('Empty renders title and hint', () => { render(<Empty title="Nothing" hint="Add one" />); expect(screen.getByText('Nothing')).toBeInTheDocument(); expect(screen.getByText('Add one')).toBeInTheDocument(); });
  it('Field associates label with input and shows errors', () => {
    render(<Field label="Name" error="Required"><TextInput /></Field>);
    expect(screen.getByLabelText(/Name/)).toBeInTheDocument(); expect(screen.getByRole('alert')).toHaveTextContent('Required');
  });
  it('AsyncView shows loading, error + retry, and content', () => {
    const reload = vi.fn();
    const { rerender } = render(<AsyncView state={{ loading: true, reload }}>{() => <p>data</p>}</AsyncView>);
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
    rerender(<AsyncView state={{ loading: false, error: 'boom', reload }}>{() => <p>data</p>}</AsyncView>);
    expect(screen.getByRole('alert')).toHaveTextContent('boom'); expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    rerender(<AsyncView state={{ loading: false, data: 1, reload }}>{(d) => <p>data {d}</p>}</AsyncView>);
    expect(screen.getByText('data 1')).toBeInTheDocument();
  });
});

describe('api client', () => {
  it('surfaces validation details from the server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Validation failed', details: [{ path: 'name', message: 'Too short' }] }) }));
    await expect(request('/events')).rejects.toMatchObject({ status: 400, message: 'Validation failed: name Too short' });
  });
  it('reports an unreachable server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fail')));
    await expect(request('/events')).rejects.toBeInstanceOf(ApiError);
  });
  it('returns parsed JSON on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ a: 1 }) }));
    expect(await request('/x')).toEqual({ a: 1 });
  });
});

describe('Wizard', () => {
  it('validates required fields before moving on, then creates the event', async () => {
    const created = { id: 1 };
    const f = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ event: created }) });
    vi.stubGlobal('fetch', f);
    const onCreated = vi.fn();
    render(<Wizard onCreated={onCreated} onCancel={() => {}} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getAllByRole('alert').length).toBe(2);
    await user.type(screen.getByLabelText(/Event name/), 'My Party');
    await user.type(screen.getByLabelText(/Event date/), '2027-05-01');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/budget/i);
    await user.type(screen.getByLabelText(/Total budget/), '500000');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({ name: 'My Party', budget_total: 500000, guest_count: 100 });
  });
});
