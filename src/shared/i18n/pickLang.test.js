import { describe, expect, it } from 'vitest';
import { pickLang } from './pickLang';

describe('pickLang', () => {
  it('keeps what the person chose before', () => {
    expect(pickLang('en', ['hi-IN'])).toBe('en');
    expect(pickLang('hi', ['en-US'])).toBe('hi');
  });
  it('starts in Hindi when the phone is set to Hindi', () => {
    expect(pickLang(null, ['hi-IN', 'en'])).toBe('hi');
    expect(pickLang(null, ['hi'])).toBe('hi');
  });
  it('starts in Malayalam, Tamil, Telugu or Urdu when the phone is set to one of them (and keeps a saved choice of them)', () => {
    expect(pickLang(null, ['ml-IN'])).toBe('ml');
    expect(pickLang(null, ['ta'])).toBe('ta');
    expect(pickLang(null, ['te-IN', 'en'])).toBe('te');
    expect(pickLang(null, ['ur-PK'])).toBe('ur');
    expect(pickLang('ta', ['en-US'])).toBe('ta');
    expect(pickLang('ur', [])).toBe('ur');
  });
  it('starts in English otherwise, or when nothing is known', () => {
    expect(pickLang(null, ['en-IN'])).toBe('en');
    expect(pickLang(null, [])).toBe('en');
    expect(pickLang('xx', undefined)).toBe('en');
  });
});
