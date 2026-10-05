import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_LOGINS } from './demo/seed';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
};

let mod;
let events;

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('localStorage', memoryStorage());
  const target = new EventTarget();
  vi.stubGlobal('window', target);
  mod = await import('./index');
  events = 0;
  target.addEventListener(mod.DATA_CHANGED, () => { events += 1; });
});

describe('which data calls tell the public list to reload', () => {
  it('writes that change what visitors see', () => {
    for (const name of ['createJob', 'updateJob', 'deleteJob', 'adminApprove', 'adminReject', 'adminSetHidden', 'adminMarkPaid',
      'adminUpdateJob', 'adminCreateJob', 'adminSetRecruiter', 'adminSavePackage']) {
      expect(mod.changesPublicData(name)).toBe(true);
    }
  });
  it('reads and visitor actions do not', () => {
    for (const name of ['listLiveJobs', 'listMyJobs', 'listPackages', 'adminListJobs', 'adminListPayments', 'adminCounts', 'submitApplication', 'signIn']) {
      expect(mod.changesPublicData(name)).toBe(false);
    }
  });
});

describe('the api proxy', () => {
  it('sends the "data changed" signal after an admin write, not after a read', async () => {
    await mod.api.signIn(DEMO_LOGINS.admin);
    await mod.api.adminListJobs();
    expect(events).toBe(0);
    await mod.api.adminApprove('job-6');
    expect(events).toBe(1);
  });
  it('does not send the signal when the call fails', async () => {
    await expect(mod.api.adminApprove('job-6')).rejects.toBeTruthy(); // not logged in
    expect(events).toBe(0);
  });
  it('fails loudly for a function that does not exist', async () => {
    await expect(mod.api.doesNotExist()).rejects.toThrow('does not exist');
  });
  it('runs in demo mode when there are no Supabase keys', () => {
    expect(mod.api.mode).toBe('demo');
    expect(mod.isDemo).toBe(true);
  });
});
