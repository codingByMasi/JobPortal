// The real (supabase/) and demo (demo/) data functions must have the same names (rule in CLAUDE.md), so no screen breaks in one mode.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const names = (folder) => {
  const dir = new URL(`./${folder}/`, import.meta.url);
  const out = new Set();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.js') && !f.endsWith('.test.js') && f !== 'index.js' && f !== 'client.js' && f !== 'store.js' && f !== 'seed.js')) {
    const text = readFileSync(new URL(file, dir), 'utf8');
    for (const m of text.matchAll(/export (?:async )?function (\w+)/g)) out.add(m[1]);
    for (const m of text.matchAll(/export const (\w+) =/g)) out.add(m[1]);
  }
  return out;
};

describe('real and demo data functions match', () => {
  it('have the same names', () => {
    const real = names('supabase');
    const demo = names('demo');
    expect([...real].filter((n) => !demo.has(n))).toEqual([]);
    expect([...demo].filter((n) => !real.has(n))).toEqual([]);
    expect(real.size).toBeGreaterThan(30);
  });
});
