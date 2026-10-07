import { describe, expect, it } from 'vitest';
import { countryPages, jobPostingJson, sitemapXml, STATIC_PAGES, withMeta } from './pages.mjs';

const base = `<!doctype html><html><head><title>Jobs Abroad</title>
<meta name="description" content="old" />
<meta property="og:title" content="old" />
<meta property="og:description" content="old" />
<meta property="og:image" content="/hero.jpg" />
</head><body><div id="root"></div></body></html>`;
const job = { id: '7', title: 'Plumber', company: 'Gulf Co', city: 'Dubai', country: 'uae', posted: new Date(2026, 9, 1).getTime(), expiresAt: new Date(2026, 10, 1).getTime() };

describe('Google job data with the new facts', () => {
  it('adds the salary, the number of openings and uses the last date when it is sooner than the end of the ad', () => {
    const data = JSON.parse(jobPostingJson({ ...job, salaryMin: 1500, salaryMax: 2200, currency: 'AED', vacancies: 6, lastDate: new Date(2026, 9, 20).getTime() }, 'https://s.com'));
    expect(data.baseSalary).toEqual({ '@type': 'MonetaryAmount', currency: 'AED', value: { '@type': 'QuantitativeValue', minValue: 1500, maxValue: 2200, unitText: 'MONTH' } });
    expect(data.totalJobOpenings).toBe(6);
    expect(data.validThrough).toBe('2026-10-20');
  });
  it('has no salary block when no salary was given, and keeps the ad end date', () => {
    const data = JSON.parse(jobPostingJson(job, 'https://s.com'));
    expect(data.baseSalary).toBeUndefined();
    expect(data.validThrough).toBe('2026-11-01');
  });
});

describe('country landing pages', () => {
  const pages = countryPages([job, { ...job, id: '8', title: 'Cook <x>', country: 'saudi' }], 'https://s.com');
  it('makes one page for every country with its own address, title and the ads in the text', () => {
    expect(pages.map((p) => p.path)).toEqual(['/jobs/uae', '/jobs/saudi-arabia', '/jobs/qatar', '/jobs/kuwait', '/jobs/oman', '/jobs/other-countries']);
    const uae = pages[0];
    expect(uae.title).toBe('Jobs in UAE | Jobs Abroad');
    expect(uae.body).toContain('<a href="/job/7">Plumber - Dubai</a>');
    expect(uae.body).not.toContain('Cook');
    expect(pages[1].body).toContain('Cook &lt;x&gt;');
  });
  it('can be put into the page frame with a canonical address', () => {
    const out = withMeta(base, { ...pages[1], image: 'https://s.com/hero.jpg' });
    expect(out).toContain('<title>Jobs in Saudi Arabia | Jobs Abroad</title>');
    expect(out).toContain('<link rel="canonical" href="https://s.com/jobs/saudi-arabia" />');
    expect(out).toContain('<div id="root"><main>');
  });
});

describe('sitemap', () => {
  const xml = sitemapXml([job], 'https://s.com');
  it('lists the new pages, every country page and every ad', () => {
    for (const path of ['/about', '/faq', '/refund-policy', '/delete-account', '/jobs/uae', '/jobs/saudi-arabia', '/jobs/other-countries', '/job/7']) expect(xml).toContain(`<loc>https://s.com${path}</loc>`);
    expect(STATIC_PAGES.map((p) => p.path)).toEqual(expect.arrayContaining(['/about', '/faq', '/refund-policy', '/delete-account']));
  });
});
