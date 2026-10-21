// getHumanPass: with a Turnstile site key a form send needs a pass from the verify-human function; without a key no pass is asked for.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ functions: { invoke }, auth: {} }) }));

let getHumanPass;
const load = async (siteKey) => {
  vi.resetModules();
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', siteKey);
  ({ getHumanPass } = await import('./client'));
};
beforeEach(() => invoke.mockReset());
afterEach(() => vi.unstubAllEnvs());

describe('getHumanPass', () => {
  it('without a site key: no pass, and the function is not called', async () => {
    await load('');
    expect(await getHumanPass('anything')).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('with a site key: the visitor token is exchanged for a pass', async () => {
    await load('site-key');
    invoke.mockResolvedValue({ data: { pass: 'pass-123' }, error: null });
    expect(await getHumanPass('visitor-token')).toBe('pass-123');
    expect(invoke).toHaveBeenCalledWith('verify-human', { body: { token: 'visitor-token' } });
  });

  it('with a site key: no token, a refusal, or an answer without a pass all stop the send with code HUMAN', async () => {
    await load('site-key');
    await expect(getHumanPass('')).rejects.toMatchObject({ code: 'HUMAN' });
    expect(invoke).not.toHaveBeenCalled();
    invoke.mockResolvedValue({ data: null, error: new Error('403') });
    await expect(getHumanPass('t')).rejects.toMatchObject({ code: 'HUMAN' });
    invoke.mockResolvedValue({ data: {}, error: null });
    await expect(getHumanPass('t')).rejects.toMatchObject({ code: 'HUMAN' });
  });
});
