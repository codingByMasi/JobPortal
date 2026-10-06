import { describe, expect, it, vi } from 'vitest';
import { withTimeout } from './fetchTimeout';

describe('withTimeout', () => {
  it('adds a time limit to ordinary calls and a longer one to file calls', async () => {
    const base = vi.fn().mockResolvedValue('ok');
    const f = withTimeout(base, { dataMs: 1000, fileMs: 5000 });
    await f('https://x.supabase.co/rest/v1/public_jobs');
    expect(base.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    await f('https://x.supabase.co/storage/v1/object/job-files/a.jpg', { method: 'POST' });
    expect(base.mock.calls[1][1].method).toBe('POST');
    expect(base.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
  });
  it('keeps a signal that the caller already set', async () => {
    const base = vi.fn().mockResolvedValue('ok');
    const own = new AbortController().signal;
    await withTimeout(base)('https://x/y', { signal: own });
    expect(base.mock.calls[0][1].signal).toBe(own);
  });
  it('really gives up after the time limit', async () => {
    const base = (_url, init) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));
    await expect(withTimeout(base, { dataMs: 20 })('https://x/y')).rejects.toThrow();
  });
});
