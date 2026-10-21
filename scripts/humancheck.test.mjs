// Tests for the human check function logic: Cloudflare's answer decides, a pass is made only on success, and only our own website may call it.
import { describe, expect, it } from 'vitest';
import { SITEVERIFY, corsFor, verifyHuman } from '../supabase/functions/_shared/humanCheck.js';

const env = { TURNSTILE_SECRET_KEY: 'secret-key' };
const make = (answer, { throws = false, insertThrows = false } = {}) => {
  const calls = [];
  let passes = 0;
  return {
    calls,
    passes: () => passes,
    deps: {
      env,
      fetchFn: async (url, init) => { calls.push({ url, init }); if (throws) throw new Error('down'); return { json: async () => answer }; },
      insertPass: async () => { if (insertThrows) throw new Error('db'); passes += 1; return 'pass-1'; },
    },
  };
};

describe('verifyHuman', () => {
  it('asks Cloudflare with the secret and the visitor token, and on success hands out one pass', async () => {
    const m = make({ success: true });
    expect(await verifyHuman('tok', m.deps)).toEqual({ status: 200, body: { pass: 'pass-1' } });
    expect(m.calls[0].url).toBe(SITEVERIFY);
    expect(m.calls[0].init.body.get('secret')).toBe('secret-key');
    expect(m.calls[0].init.body.get('response')).toBe('tok');
    expect(m.passes()).toBe(1);
  });

  it('a failed check, a missing or odd answer gives no pass', async () => {
    for (const answer of [{ success: false }, {}, null, { success: 'true' }]) {
      const m = make(answer);
      expect((await verifyHuman('tok', m.deps)).status).toBe(403);
      expect(m.passes()).toBe(0);
    }
  });

  it('refuses an empty, huge or non-text token without asking Cloudflare', async () => {
    for (const bad of ['', 'x'.repeat(2049), null, undefined, 12, {}]) {
      const m = make({ success: true });
      expect(await verifyHuman(bad, m.deps)).toEqual({ status: 400, body: { error: 'token' } });
      expect(m.calls).toEqual([]);
    }
  });

  it('without the secret key it refuses everything; if Cloudflare is unreachable or the pass cannot be saved it says so and gives nothing', async () => {
    const m = make({ success: true });
    expect(await verifyHuman('tok', { ...m.deps, env: {} })).toEqual({ status: 503, body: { error: 'not_configured' } });
    expect(m.calls).toEqual([]);
    expect((await verifyHuman('tok', make({}, { throws: true }).deps)).status).toBe(502);
    const broken = make({ success: true }, { insertThrows: true });
    expect((await verifyHuman('tok', broken.deps)).status).toBe(500);
  });
});

describe('corsFor', () => {
  it('lets only our own website call it from a browser (trailing slash in the setting does not matter)', () => {
    expect(corsFor('https://deshduniyanaukri.com', 'https://deshduniyanaukri.com/')['Access-Control-Allow-Origin']).toBe('https://deshduniyanaukri.com');
    expect(corsFor('https://evil.example', 'https://deshduniyanaukri.com')['Access-Control-Allow-Origin']).toBeUndefined();
    expect(corsFor(null, 'https://deshduniyanaukri.com')['Access-Control-Allow-Origin']).toBeUndefined();
    expect(corsFor('https://deshduniyanaukri.com', '')['Access-Control-Allow-Origin']).toBeUndefined();
    expect(corsFor('https://deshduniyanaukri.com', 'https://deshduniyanaukri.com').Vary).toBe('Origin');
  });
});
