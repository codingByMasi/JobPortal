// The real (Supabase) backend, tested against a recording stand-in for the Supabase client.
// It proves WHICH tables, columns and filters the public site asks for and how answers and errors are turned into app objects.
// It cannot prove the real database accepts them: that is checked by hand (docs/07-testing.md).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const state = { calls: [], result: { data: [], error: null } };
  /** Any chain of .select().eq()... is recorded, and awaiting it returns state.result. */
  const builder = (table) => {
    const call = { table, ops: [] };
    state.calls.push(call);
    const chain = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') return (resolve, reject) => Promise.resolve(state.result).then(resolve, reject);
        return (...args) => {
          call.ops.push([prop, ...args]);
          return chain;
        };
      },
    });
    return chain;
  };
  return { state, client: { from: builder } };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake.client }));

let publicApi;

beforeEach(async () => {
  fake.state.calls.length = 0;
  fake.state.result = { data: [], error: null };
  publicApi = await import('./public');
});

const opsOf = (call) => Object.fromEntries(call.ops.map(([name, ...args]) => [name, args]));

describe('listLiveJobs', () => {
  it('reads the safe public view, never the jobs table', async () => {
    await publicApi.listLiveJobs();
    expect(fake.state.calls).toHaveLength(1);
    expect(fake.state.calls[0].table).toBe('public_jobs');
    expect(opsOf(fake.state.calls[0]).select).toEqual(['*']);
  });
  it('turns view rows into app objects (featured, verified, safe links, timestamps)', async () => {
    fake.state.result = {
      data: [
        { id: 'a', title: 'Plumber', company: 'Gulf', country: 'uae', city: 'Dubai', category: 'plumber', file_url: 'https://x.supabase.co/storage/v1/object/public/job-files/u/1.jpg', file_type: 'image', whatsapp: '+91 98765 43210', posted_date: '2026-10-03', starts_at: '2026-10-03T05:00:00Z', expires_at: '2026-11-03T05:00:00Z', featured: true, recruiter_verified: true },
        { id: 'b', title: 'Driver', country: 'saudi', city: 'Riyadh', category: 'driver', file_url: 'javascript:alert(1)', file_type: 'pdf', whatsapp: '', starts_at: '2026-10-01T05:00:00Z', expires_at: '2026-10-20T05:00:00Z', featured: false, recruiter_verified: false },
      ],
      error: null,
    };
    const jobs = await publicApi.listLiveJobs();
    expect(jobs[0]).toMatchObject({ id: 'a', featured: true, verified: true, whatsapp: '919876543210', fileType: 'image', startsAt: Date.UTC(2026, 9, 3, 5) });
    expect(jobs[0].fileUrl).toContain('/storage/v1/object/public/job-files/');
    expect(jobs[1]).toMatchObject({ id: 'b', featured: false, verified: false, fileUrl: '', fileType: 'pdf' });
  });
  it('passes a Supabase error on with a code the app understands', async () => {
    fake.state.result = { data: null, error: { message: 'Failed to fetch', code: undefined } };
    await expect(publicApi.listLiveJobs()).rejects.toThrow('Failed to fetch');
  });
});

describe('listPackages', () => {
  it('asks for packages in the admin order (then cheapest) and maps them', async () => {
    fake.state.result = { data: [{ id: 'p1', name: '7 Days', price_paise: 29900, duration_days: 7, featured: false, active: true }], error: null };
    const list = await publicApi.listPackages();
    expect(fake.state.calls[0].table).toBe('packages');
    expect(opsOf(fake.state.calls[0]).order).toContain('price_paise');
    expect(list).toEqual([{ id: 'p1', name: '7 Days', pricePaise: 29900, durationDays: 7, featured: false, active: true, description: '', sortOrder: 0, badgeText: '', maxFiles: 1 }]);
  });
});

describe('submitApplication', () => {
  it('inserts only the applicant fields, trimmed, into applications', async () => {
    await publicApi.submitApplication({ jobId: 'job-1', name: '  Ram  ', phone: ' 98765 43210 ', city: ' Pune ', message: ' Hi ', status: 'x', extra: 'ignored' });
    const call = fake.state.calls[0];
    expect(call.table).toBe('applications');
    expect(opsOf(call).insert[0]).toEqual({ job_id: 'job-1', name: 'Ram', phone: '98765 43210', city: 'Pune', message: 'Hi' });
  });
  it('does not ask to read the row back (visitors are not allowed to read applications)', async () => {
    await publicApi.submitApplication({ jobId: 'job-1', name: 'Ram', phone: '9876543210' });
    expect(opsOf(fake.state.calls[0])).not.toHaveProperty('select');
  });
  it('reports a repeat application as a unique-violation the app turns into plain words', async () => {
    fake.state.result = { data: null, error: { message: 'duplicate key value violates unique constraint "applications_one_per_phone"', code: '23505' } };
    const { friendlyMessage } = await import('../../lib/friendlyError');
    const { translations } = await import('../../i18n');
    const err = await publicApi.submitApplication({ jobId: 'job-1', name: 'Ram', phone: '9876543210' }).catch((e) => e);
    expect(err.code).toBe('23505');
    expect(friendlyMessage(err, translations.en)).toBe(translations.en.errAlreadyApplied);
    expect(friendlyMessage(err, translations.hi)).toBe(translations.hi.errAlreadyApplied);
  });
});
