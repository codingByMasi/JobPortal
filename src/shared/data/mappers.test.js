import { describe, expect, it } from 'vitest';
import { toDateString, toJob, toJobRow, toTime } from './mappers';

const row = (o) => ({ id: '1', title: 'Plumber', country: 'uae', category: 'plumber', status: 'live', ...o });

describe('toJob', () => {
  it('drops unsafe file links, keeps https ones', () => {
    expect(toJob(row({ file_url: 'javascript:alert(1)' })).fileUrl).toBe('');
    expect(toJob(row({ file_url: 'http://x.com/a.jpg' })).fileUrl).toBe('');
    expect(toJob(row({ file_url: 'https://x.supabase.co/a.jpg' })).fileUrl).toBe('https://x.supabase.co/a.jpg');
  });
  it('allows base64 pictures only in demo mode', () => {
    const url = 'data:image/png;base64,AAAA';
    expect(toJob(row({ file_url: url })).fileUrl).toBe('');
    expect(toJob(row({ file_url: url }), { allowData: true }).fileUrl).toBe(url);
    expect(toJob(row({ file_url: 'data:text/html;base64,AAAA' }), { allowData: true }).fileUrl).toBe('');
  });
  it('reads featured and verified from the public view and from joined rows', () => {
    expect(toJob(row({ featured: true, recruiter_verified: true }))).toMatchObject({ featured: true, verified: true });
    expect(toJob(row({ package: { id: 'p', name: 'x', price_paise: 1, duration_days: 7, featured: true }, recruiter: { id: 'r', verified: true } })))
      .toMatchObject({ featured: true, verified: true });
    expect(toJob(row({}))).toMatchObject({ featured: false, verified: false });
  });
  it('cleans the WhatsApp number and turns dates into timestamps', () => {
    const job = toJob(row({ whatsapp: '+91 98765-43210', starts_at: '2026-10-05T00:00:00Z', expires_at: null }));
    expect(job.whatsapp).toBe('919876543210');
    expect(job.startsAt).toBe(Date.UTC(2026, 9, 5));
    expect(job.expiresAt).toBeNull();
  });
});

describe('toJobRow', () => {
  it('only passes the fields people may type, with database names', () => {
    const out = toJobRow({ title: '  Plumber ', whatsapp: '98 76', status: 'live', recruiterId: 'x', expiresAt: 5, fileUrl: '', packageId: 'p1' });
    expect(out).toEqual({ title: 'Plumber', whatsapp: '9876', file_url: null, package_id: 'p1' });
  });
});

describe('dates', () => {
  it('reads plain dates as local midnight and writes them back unchanged', () => {
    const t = toTime('2026-03-09');
    expect(toDateString(t)).toBe('2026-03-09');
    expect(toTime('')).toBeNull();
    expect(toTime('not a date')).toBeNull();
  });
});
