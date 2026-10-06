import { describe, expect, it } from 'vitest';
import { cleanPage } from './errorReport';

describe('cleanPage (what is sent about where a crash happened)', () => {
  it('hides ad ids and anything after a question mark', () => {
    expect(cleanPage('/job/1a2b3c4d-1111-2222-3333-444455556666')).toBe('/job/:id');
    expect(cleanPage('/jobs?country=uae&q=phone%209876543210')).toBe('/jobs');
    expect(cleanPage('/dashboard/pay/1a2b3c4d-1111-2222-3333-444455556666')).toBe('/dashboard/pay/:id');
  });
  it('is cut to 200 characters', () => {
    expect(cleanPage('/' + 'a'.repeat(500)).length).toBe(200);
  });
});
