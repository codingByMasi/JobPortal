// Demo backend: the admin activity list shows what admins did, newest first, can be filtered, and is for admins only.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_LOGINS } from './seed';

let api;
const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
};
beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('localStorage', memoryStorage());
  ({ demoApi: api } = await import('./index'));
});

describe('admin activity (demo)', () => {
  it('is empty at first; hiding and showing an ad are listed newest first, and the filter keeps one kind', async () => {
    await api.signIn(DEMO_LOGINS.admin);
    expect(await api.adminListActivity()).toEqual([]);
    await api.adminSetHidden('job-1', true);
    await api.adminSetHidden('job-1', false);
    const all = await api.adminListActivity();
    expect(all.map((a) => a.action)).toEqual(['show_job', 'hide_job']);
    expect(all[0]).toMatchObject({ targetId: 'job-1' });
    expect((await api.adminListActivity({ action: 'hide_job' })).map((a) => a.action)).toEqual(['hide_job']);
    expect(await api.adminListActivity({ action: 'approve_job' })).toEqual([]);
  });

  it('an employer or a visitor cannot read it', async () => {
    await expect(api.adminListActivity()).rejects.toBeTruthy();
    await api.signIn(DEMO_LOGINS.recruiter);
    await expect(api.adminListActivity()).rejects.toBeTruthy();
  });
});
