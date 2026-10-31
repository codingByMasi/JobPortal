// Checks the security headers let the ad form show a just-chosen picture (a blob: address).
import { describe, expect, it } from 'vitest';
import { buildHeaders } from './headers.mjs';

describe('buildHeaders', () => {
  it('allows blob: pictures for the ad form preview', () => {
    const csp = buildHeaders({ supabaseUrl: 'https://x.supabase.co' }).split('\n').find((l) => l.includes('Content-Security-Policy'));
    expect(csp).toMatch(/img-src [^;]*blob:/);
  });
});
