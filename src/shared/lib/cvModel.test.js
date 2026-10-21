// Tests for the CV maker helpers.
import { describe, expect, it } from 'vitest';
import { cvHasContent, emptyExperience, hasExperience, toLines, toList } from './cvModel';

describe('toList and toLines', () => {
  it('split on commas or lines, trim, drop empties, and cut long or many items', () => {
    expect(toList(' welding, ,pipe fitting\n driving ')).toEqual(['welding', 'pipe fitting', 'driving']);
    expect(toList('x'.repeat(100))[0]).toHaveLength(60);
    expect(toList(Array.from({ length: 40 }, (_, i) => `s${i}`).join(','))).toHaveLength(20);
    expect(toList(null)).toEqual([]);
    expect(toLines('ITI, Electrician\n\n  Driving license, heavy  ')).toEqual(['ITI, Electrician', 'Driving license, heavy']);
  });
});

describe('cvHasContent', () => {
  const blank = { name: '', phone: '', want: '', about: '', skills: '', languages: '', education: '', experience: [emptyExperience()] };
  it('is false for an empty form and true as soon as something useful is typed', () => {
    expect(cvHasContent(blank)).toBe(false);
    expect(cvHasContent({ ...blank, name: '   ' })).toBe(false);
    expect(cvHasContent({ ...blank, name: 'Ravi' })).toBe(true);
    expect(cvHasContent({ ...blank, skills: 'welding' })).toBe(true);
    expect(cvHasContent({ ...blank, experience: [{ ...emptyExperience(), company: 'Gulf Works, UAE' }] })).toBe(true);
  });
  it('a job entry needs a title or a company', () => {
    expect(hasExperience({ role: '', company: '', years: '3', details: 'x' })).toBe(false);
    expect(hasExperience({ role: 'Cook', company: '', years: '', details: '' })).toBe(true);
  });
});
