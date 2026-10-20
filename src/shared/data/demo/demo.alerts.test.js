// Demo backend: job alerts follow the same rules as the database (migration 0035).
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
const stored = () => JSON.parse(localStorage.getItem('jobs-abroad-demo-v2')).job_alerts || [];

describe('job alerts (demo)', () => {
  it('a visitor signs up (email cleaned), the alert waits, the same alert again changes nothing', async () => {
    await api.subscribeJobAlert({ email: '  Seeker@Example.COM ', country: 'uae', category: 'plumber', lang: 'hi' });
    await api.subscribeJobAlert({ email: 'seeker@example.com', country: 'uae', category: 'plumber', lang: 'en' });
    expect(stored()).toHaveLength(1);
    expect(stored()[0]).toMatchObject({ email: 'seeker@example.com', country: 'uae', category: 'plumber', lang: 'hi', confirmed_at: null });
  });

  it('wrong emails, countries and kinds of work are refused; at most 5 alerts per email', async () => {
    for (const email of ['', 'nobody', 'a@b', 'two words@x.co']) await expect(api.subscribeJobAlert({ email })).rejects.toMatchObject({ code: 'ALERT_EMAIL' });
    await expect(api.subscribeJobAlert({ email: 'ok@x.co', country: 'mars' })).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    for (const c of ['uae', 'saudi', 'qatar', 'kuwait', 'oman']) await api.subscribeJobAlert({ email: 'many@x.co', country: c });
    await expect(api.subscribeJobAlert({ email: 'many@x.co', country: 'others' })).rejects.toMatchObject({ code: 'ALERT_LIMIT' });
  });

  it('confirm works with the right token only (twice is fine); unsubscribe removes every alert of that email', async () => {
    await api.subscribeJobAlert({ email: 'bye@x.co', country: 'uae' });
    await api.subscribeJobAlert({ email: 'bye@x.co', country: 'qatar' });
    await api.subscribeJobAlert({ email: 'stay@x.co', country: 'uae' });
    const { token } = stored().find((a) => a.email === 'bye@x.co');
    expect(await api.confirmJobAlert('not-a-token')).toBe(false);
    expect(await api.confirmJobAlert('00000000-0000-4000-8000-000000000000')).toBe(false);
    expect(await api.confirmJobAlert(token)).toBe(true);
    expect(await api.confirmJobAlert(token)).toBe(true);
    expect(stored().find((a) => a.token === token).confirmed_at).not.toBeNull();
    expect(await api.unsubscribeJobAlert(token)).toBe(true);
    expect(stored().map((a) => a.email)).toEqual(['stay@x.co']);
    expect(await api.unsubscribeJobAlert(token)).toBe(false);
  });
});
