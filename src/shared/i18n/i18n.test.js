import { describe, expect, it } from 'vitest';
import { translations } from './index.js';

const shape = (v) => {
  if (Array.isArray(v)) return `array${v.length}`;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]));
  return typeof v;
};

describe('translations', () => {
  it('Hindi has exactly the same keys and kinds of value as English', () => {
    expect(shape(translations.hi)).toEqual(shape(translations.en));
  });
  it('has no empty text', () => {
    const empties = [];
    const walk = (v, path) => {
      if (typeof v === 'string' && !v.trim()) empties.push(path);
      else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, `${path}.${k}`));
    };
    walk(translations, 'translations');
    expect(empties).toEqual([]);
  });
  it('WhatsApp message carries the job id, title and city in both languages', () => {
    for (const lang of ['en', 'hi']) {
      const msg = translations[lang].waMessage('101', 'Plumber', 'Dubai');
      expect(msg).toContain('101');
      expect(msg).toContain('Plumber');
      expect(msg).toContain('Dubai');
    }
  });
});
