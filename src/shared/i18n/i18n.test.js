import { describe, expect, it } from 'vitest';
import { LANGUAGES, partialTexts, translations } from './index.js';

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
  it('WhatsApp message carries the job id, title and city in every language', () => {
    for (const lang of Object.keys(translations)) {
      const msg = translations[lang].waMessage('101', 'Plumber', 'Dubai');
      expect(msg).toContain('101');
      expect(msg).toContain('Plumber');
      expect(msg).toContain('Dubai');
    }
  });
});

// Malayalam, Tamil, Telugu and Urdu hold only what job seekers see; the rest shows in English. What they hold must match English exactly in kind.
describe('partial languages (Malayalam, Tamil, Telugu, Urdu)', () => {
  const en = translations.en;
  const ARGS = ['XQZ1', 'XQZ2', 'XQZ3'];

  for (const [code, part] of Object.entries(partialTexts)) {
    describe(code, () => {
      it('only has keys that exist in English, with the same kind of value (text, list, group, function with the same inputs)', () => {
        const unknown = Object.keys(part).filter((k) => !(k in en));
        expect(unknown).toEqual([]);
        for (const [key, value] of Object.entries(part)) {
          expect(shape(value), key).toEqual(shape(en[key]));
          if (typeof value === 'function') expect(value.length, `${key} takes the same inputs`).toBe(en[key].length);
        }
      });

      it('covers what a job seeker sees (at least 230 texts), including safety, apply, report and alerts', () => {
        expect(Object.keys(part).length).toBeGreaterThanOrEqual(230);
        for (const key of ['fraudBanner', 'fraudBannerMore', 'safety', 'applyConsent', 'reportReasons', 'alertConsent', 'cvPrivacy', 'errHumanCheck', 'langButton', 'langPickerLabel']) expect(part[key], key).toBeTruthy();
      });

      it('every sentence that puts a number or name inside keeps all of them (nothing dropped from the English)', () => {
        for (const [key, value] of Object.entries(part)) {
          if (typeof value !== 'function') continue;
          const wanted = ARGS.filter((a) => String(en[key](...ARGS.slice(0, en[key].length))).includes(a));
          const got = String(value(...ARGS.slice(0, value.length)));
          for (const a of wanted) expect(got, `${key} must show ${a}`).toContain(a);
        }
      });

      it('lists keep the same number of items as English, and the brand name stays in Latin letters where English has it', () => {
        for (const key of ['reportReasons', 'exp', 'country', 'category']) expect(Object.keys(part[key])).toEqual(Object.keys(en[key]));
        expect(part.applyConsent).toContain('Jobs Abroad');
        expect(part.installTitle).toContain('Jobs Abroad');
      });
    });
  }

  it('every language can be chosen: there is a name for it and a reading direction, and a text set to show', () => {
    expect(LANGUAGES.map((l) => l.code).sort()).toEqual(Object.keys(translations).sort());
    for (const l of LANGUAGES) {
      expect(l.name).toBeTruthy();
      expect(['ltr', 'rtl']).toContain(l.dir);
      expect(translations[l.code].siteName).toBeTruthy();
    }
    expect(LANGUAGES.find((l) => l.code === 'ur').dir).toBe('rtl');
  });

  it('texts that are not translated fall back to English instead of showing nothing', () => {
    for (const code of Object.keys(partialTexts)) {
      expect(translations[code].privacyPoints).toEqual(en.privacyPoints);
      expect(translations[code].tabDashboard).toBe(en.tabDashboard);
      expect(translations[code].jobsTitle).not.toBe(en.jobsTitle);
    }
  });
});
