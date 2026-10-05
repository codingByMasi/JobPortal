import { describe, expect, it } from 'vitest';
import { chooseMode } from './env';

describe('chooseMode', () => {
  it('uses real data when both keys are there, even on a published site', () => {
    expect(chooseMode({ url: 'https://x.supabase.co', key: 'k', dev: false, allowDemo: false })).toBe('supabase');
  });
  it('uses demo data while developing without keys', () => {
    expect(chooseMode({ url: '', key: '', dev: true, allowDemo: false })).toBe('demo');
  });
  it('a published site with no keys is BLOCKED, not a silent demo', () => {
    expect(chooseMode({ url: '', key: '', dev: false, allowDemo: false })).toBe('blocked');
  });
  it('one missing key is also blocked (a typo in the settings)', () => {
    expect(chooseMode({ url: 'https://x.supabase.co', key: '', dev: false, allowDemo: false })).toBe('blocked');
    expect(chooseMode({ url: '', key: 'k', dev: false, allowDemo: false })).toBe('blocked');
  });
  it('a public demo site is possible only on purpose', () => {
    expect(chooseMode({ url: '', key: '', dev: false, allowDemo: true })).toBe('demo');
  });
});
