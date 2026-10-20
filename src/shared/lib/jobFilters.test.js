// Tests for the salary filter and sort helpers.
import { describe, expect, it } from 'vitest';
import { currenciesIn, matchSalary, payOf, sortJobs } from './jobFilters';

const job = (id, salaryMin, salaryMax, currency) => ({ id, salaryMin, salaryMax, currency });
const jobs = [job('a', 1000, 1500, 'AED'), job('b', null, null, null), job('c', 2000, null, 'AED'), job('d', 900, 1200, 'SAR'), job('e', 0, 0, 'AED')];

describe('payOf', () => {
  it('uses the highest figure and ignores empty or zero salaries', () => {
    expect(payOf(jobs[0])).toBe(1500);
    expect(payOf(jobs[2])).toBe(2000);
    expect(payOf(jobs[1])).toBeNull();
    expect(payOf(jobs[4])).toBeNull();
  });
});

describe('currenciesIn', () => {
  it('lists only currencies that really show a salary, in the catalog order', () => {
    expect(currenciesIn(jobs, ['SAR', 'AED', 'QAR'])).toEqual(['SAR', 'AED']);
    expect(currenciesIn([job('x', null, null, 'QAR')], ['QAR'])).toEqual([]);
  });
});

describe('matchSalary', () => {
  it('lets everything through with no currency chosen', () => {
    expect(jobs.every((j) => matchSalary(j, {}))).toBe(true);
  });
  it('keeps one currency, with a minimum per month', () => {
    expect(jobs.filter((j) => matchSalary(j, { currency: 'AED' })).map((j) => j.id)).toEqual(['a', 'c']);
    expect(jobs.filter((j) => matchSalary(j, { currency: 'AED', min: '1600' })).map((j) => j.id)).toEqual(['c']);
    expect(jobs.filter((j) => matchSalary(j, { currency: 'SAR', min: 'abc' })).map((j) => j.id)).toEqual(['d']);
  });
});

describe('sortJobs', () => {
  it('keeps the given order unless "pay" is chosen', () => {
    expect(sortJobs(jobs, '')).toBe(jobs);
    expect(sortJobs(jobs, 'newest')).toBe(jobs);
  });
  it('pay puts the highest first, equal and empty pay keep their order, and the original list is not changed', () => {
    const before = jobs.map((j) => j.id);
    expect(sortJobs(jobs, 'pay').map((j) => j.id)).toEqual(['c', 'a', 'd', 'b', 'e']);
    expect(jobs.map((j) => j.id)).toEqual(before);
  });
});
