import { describe, expect, it } from 'vitest';
import { withParam } from './urlParams';

describe('withParam', () => {
  it('sets, replaces and removes a value without touching the others', () => {
    const a = withParam(new URLSearchParams('country=uae'), 'category', 'driver');
    expect(a.toString()).toBe('country=uae&category=driver');
    expect(withParam(a, 'country', 'oman').toString()).toBe('country=oman&category=driver');
    expect(withParam(a, 'country', '').toString()).toBe('category=driver');
  });
  it('treats the "all" value as empty', () => {
    expect(withParam(new URLSearchParams('status=live'), 'status', 'all', 'all').toString()).toBe('');
  });
  it('does not change the original', () => {
    const original = new URLSearchParams('a=1');
    withParam(original, 'a', '2');
    expect(original.toString()).toBe('a=1');
  });
  it('two changes made one after the other both survive', () => {
    let current = new URLSearchParams('status=live');
    current = withParam(current, 'status', 'all', 'all');
    current = withParam(current, 'q', 'gulf');
    expect(current.toString()).toBe('q=gulf');
  });
});
