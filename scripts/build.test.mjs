import { describe, expect, it } from 'vitest';
import { configProblems } from './checkConfig.mjs';
import { buildHeaders } from './headers.mjs';

const ENV = { VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: 'key' };

describe('configProblems (the hosted build needs only the database connection)', () => {
  it('has nothing to say when the two Supabase values are set; the shop details are filled in the app, not here', () => {
    expect(configProblems({}, ENV)).toEqual([]);
  });
  it('catches missing Supabase settings', () => {
    expect(configProblems({}, {})).toHaveLength(1);
    expect(configProblems({}, { VITE_SUPABASE_URL: 'https://abc.supabase.co' })).toHaveLength(1);
  });
});

describe('buildHeaders (security headers)', () => {
  it('names only your own Supabase project, never every project', () => {
    const text = buildHeaders({ supabaseUrl: 'https://abc.supabase.co/' });
    expect(text).toContain('connect-src \'self\' https://abc.supabase.co;');
    expect(text).toContain('frame-src https://abc.supabase.co;');
    expect(text).not.toContain('*.supabase.co');
  });
  it('allows no scripts from outside by default, and the check or counter only when turned on', () => {
    expect(buildHeaders({ supabaseUrl: 'https://abc.supabase.co' })).toContain("script-src 'self';");
    const on = buildHeaders({ supabaseUrl: 'https://abc.supabase.co', turnstile: true, plausible: true });
    expect(on).toContain('https://challenges.cloudflare.com');
    expect(on).toContain('https://plausible.io');
  });
  it('keeps the other protections', () => {
    const text = buildHeaders({ supabaseUrl: 'https://abc.supabase.co' });
    for (const part of ["frame-ancestors 'none'", "object-src 'none'", 'X-Content-Type-Options: nosniff', 'X-Frame-Options: DENY', 'Strict-Transport-Security']) {
      expect(text).toContain(part);
    }
    expect(text).not.toContain('unsafe-inline');
  });
  it('built files are cached for a year, the start page is always checked', () => {
    const text = buildHeaders({ supabaseUrl: 'https://abc.supabase.co' });
    expect(text).toContain('/assets/*\n  Cache-Control: public, max-age=31536000, immutable');
    expect(text).toContain('/index.html\n  Cache-Control: public, max-age=0, must-revalidate');
  });
  it('stays inside the Cloudflare Pages limits (at most 100 rules, 2000 characters a line)', () => {
    const lines = buildHeaders({ supabaseUrl: 'https://abc.supabase.co', turnstile: true, plausible: true }).split('\n');
    expect(lines.filter((l) => l && !l.startsWith(' ') && !l.startsWith('#')).length).toBeLessThanOrEqual(100);
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThan(2000);
  });
  it('without a Supabase address nothing outside is allowed', () => {
    const text = buildHeaders({});
    expect(text).toContain("connect-src 'self';");
    expect(text).toContain("frame-src 'none';");
  });
});
