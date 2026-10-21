// The visitor forms for reports and account deletion: they must not ask the database to send the saved row back,
// because visitors may add these rows but not read them (the database refuses an insert that asks for the row back).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const state = { calls: [], result: { data: null, error: null } };
  const builder = (table) => {
    const call = { table, ops: [] };
    state.calls.push(call);
    const chain = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') return (resolve, reject) => Promise.resolve(state.result).then(resolve, reject);
        return (...args) => { call.ops.push([prop, ...args]); return chain; };
      },
    });
    return chain;
  };
  return { state, client: { from: builder } };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake.client }));

let trust;
beforeEach(async () => {
  fake.state.calls.length = 0;
  fake.state.result = { data: null, error: null };
  trust = await import('./trust');
});
const opsOf = (call) => Object.fromEntries(call.ops.map(([name, ...args]) => [name, args]));

describe('reportAd', () => {
  it('inserts only the report fields, trimmed, and does not ask for the row back', async () => {
    await trust.reportAd({ jobId: 'job-1', reason: 'asked_money', message: '  They asked  ', contact: ' 98765 ', status: 'done', extra: 'ignored' });
    const call = fake.state.calls[0];
    expect(call.table).toBe('reports');
    expect(opsOf(call).insert[0]).toEqual({ job_id: 'job-1', reason: 'asked_money', message: 'They asked', contact: '98765', human_pass: null });
    expect(opsOf(call)).not.toHaveProperty('select');
    expect(opsOf(call)).not.toHaveProperty('single');
    expect(opsOf(call)).not.toHaveProperty('maybeSingle');
  });
  it('turns a repeat report into the code the app shows in plain words', async () => {
    fake.state.result = { data: null, error: { message: 'You already reported this ad.', code: '23505' } };
    const err = await trust.reportAd({ jobId: 'job-1', reason: 'other' }).catch((e) => e);
    expect(err.code).toBe('23505');
  });
});

describe('requestAccountDeletion', () => {
  it('inserts only the email and note, trimmed, and does not ask for the row back', async () => {
    await trust.requestAccountDeletion({ email: '  a@x.co ', note: ' please ', status: 'done' });
    const call = fake.state.calls[0];
    expect(call.table).toBe('deletion_requests');
    expect(opsOf(call).insert[0]).toEqual({ email: 'a@x.co', note: 'please' });
    expect(opsOf(call)).not.toHaveProperty('select');
    expect(opsOf(call)).not.toHaveProperty('maybeSingle');
  });
});
