import { describe, expect, it } from 'vitest';
import { landingPath } from './landing';

describe('landingPath', () => {
  it('sends people back to the page they wanted', () => {
    expect(landingPath('/dashboard/new', false)).toBe('/dashboard/new');
    expect(landingPath('/admin/jobs', true)).toBe('/admin/jobs');
    expect(landingPath('/jobs?country=uae', false)).toBe('/jobs?country=uae');
  });
  it('never sends an employer to an admin address', () => {
    expect(landingPath('/admin', false)).toBe('/dashboard');
    expect(landingPath('/admin/payments', false)).toBe('/dashboard');
  });
  it('with no wanted page: admin goes to /admin, employer to /dashboard', () => {
    expect(landingPath(undefined, true)).toBe('/admin');
    expect(landingPath(null, false)).toBe('/dashboard');
    expect(landingPath('', false)).toBe('/dashboard');
  });
  it('ignores anything that is not a normal page of this site', () => {
    for (const bad of ['https://evil.example.com', '//evil.example.com', 'javascript:alert(1)', 'dashboard', 42, {}]) {
      expect(landingPath(bad, false)).toBe('/dashboard');
    }
  });
  it('does not bounce back to the login or signup page', () => {
    expect(landingPath('/login', false)).toBe('/dashboard');
    expect(landingPath('/signup', true)).toBe('/admin');
  });
});
