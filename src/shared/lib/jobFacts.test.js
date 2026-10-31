import { describe, expect, it } from 'vitest';
import { checkFacts, dayStart, factsFromForm, isNewAd, isPastLastDate, salaryText } from './jobFacts';

const DAY = 86400000;
const NOW = new Date(2026, 9, 7, 12).getTime();

describe('salaryText', () => {
  it('shows a range, one number, or nothing', () => {
    expect(salaryText({ salaryMin: 1500, salaryMax: 2200, currency: 'AED' })).toBe('AED 1,500 - 2,200');
    expect(salaryText({ salaryMin: 1500, salaryMax: 1500, currency: 'SAR' })).toBe('SAR 1,500');
    expect(salaryText({ salaryMax: 900, currency: 'QAR' })).toBe('QAR 900');
    expect(salaryText({})).toBe('');
  });
});

describe('isNewAd', () => {
  it('is new for under 3 days only', () => {
    expect(isNewAd({ startsAt: NOW - 2 * DAY }, NOW)).toBe(true);
    expect(isNewAd({ startsAt: NOW - 3 * DAY }, NOW)).toBe(false);
    expect(isNewAd({ posted: NOW - 0.5 * DAY }, NOW)).toBe(true);
    expect(isNewAd({}, NOW)).toBe(false);
  });
});

describe('checkFacts', () => {
  const ok = { salaryMin: '', salaryMax: '', currency: '', vacancies: '', lastDate: '' };
  it('accepts an empty form and a good one', () => {
    expect(checkFacts(ok, NOW)).toEqual({});
    expect(checkFacts({ ...ok, salaryMin: '1,500', salaryMax: '2200', currency: 'AED', vacancies: '5', lastDate: '2026-10-30' }, NOW)).toEqual({});
  });
  it('refuses wrong salary, order, missing currency, vacancies and a past last date', () => {
    expect(checkFacts({ ...ok, salaryMin: 'abc' }, NOW).salaryMin).toBe('errSalary');
    expect(checkFacts({ ...ok, salaryMin: '3000', salaryMax: '2000', currency: 'AED' }, NOW).salaryMax).toBe('errSalaryOrder');
    expect(checkFacts({ ...ok, salaryMin: '3000' }, NOW).currency).toBe('errRequired');
    expect(checkFacts({ ...ok, vacancies: '0' }, NOW).vacancies).toBe('errVacancies');
    expect(checkFacts({ ...ok, lastDate: '2026-09-01' }, NOW).lastDate).toBe('errLastDate');
  });
});

describe('factsFromForm and last date', () => {
  it('turns boxes into values and drops the currency without a salary', () => {
    expect(factsFromForm({ salaryMin: '1500', salaryMax: '', currency: 'AED', experienceLevel: '2-5', vacancies: '3', lastDate: '', visaType: ' Work visa ' }))
      .toEqual({ salaryMin: 1500, salaryMax: null, currency: 'AED', experienceLevel: '2-5', vacancies: 3, lastDate: null, visaType: 'Work visa' });
    expect(factsFromForm({ salaryMin: '', salaryMax: '', currency: 'AED' }).currency).toBeNull();
  });
  it('a last date still counts on its own day', () => {
    const d = dayStart('2026-10-07');
    expect(isPastLastDate({ lastDate: d }, d + 3600000)).toBe(false);
    expect(isPastLastDate({ lastDate: d }, d + DAY + 1)).toBe(true);
  });
});

describe('applyMessage', () => {
  it('lists the ad details and never the id', async () => {
    const { applyMessage } = await import('./jobFacts.js');
    const { en } = await import('../i18n/en.js');
    const job = { id: 'abc-123', title: 'Plumber', company: 'Acme', salaryMin: 1500, salaryMax: 2200, currency: 'AED', vacancies: 5, visaType: 'Employment' };
    const msg = applyMessage(job, en, 'en', 'Dubai, UAE', () => '');
    expect(msg).toContain('Plumber');
    expect(msg).toContain('Company: Acme');
    expect(msg).toContain('AED 1,500 - 2,200');
    expect(msg).toContain('Vacancies: 5');
    expect(msg).not.toContain('abc-123');
  });
});
