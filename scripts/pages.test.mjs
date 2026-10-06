import { describe, expect, it } from 'vitest';
import { jobPageHtml, jobPostingJson, sitemapXml, STATIC_PAGES, withMeta } from './pages.mjs';

const base = `<!doctype html><html><head><title>Jobs Abroad</title>
<meta name="description" content="old" />
<meta property="og:title" content="old" />
<meta property="og:description" content="old" />
<meta property="og:image" content="/hero.jpg" />
</head><body><div id="root"></div></body></html>`;
const job = {
  id: '101',
  title: 'Plumber <b>"X"</b>',
  company: 'Gulf & Co',
  city: 'Dubai',
  country: 'uae',
  posted: new Date(2025, 2, 1).getTime(),
  expiresAt: new Date(2025, 3, 1).getTime(),
};

describe('withMeta', () => {
  it('replaces title, description and share tags and adds canonical', () => {
    const out = withMeta(base, { title: 'T', description: 'D', url: 'https://s.com/x', image: 'https://s.com/i.jpg' });
    expect(out).toContain('<title>T</title>');
    expect(out).toContain('name="description" content="D"');
    expect(out).toContain('property="og:image" content="https://s.com/i.jpg"');
    expect(out).toContain('<link rel="canonical" href="https://s.com/x" />');
  });
});

describe('job pages', () => {
  it('escapes HTML coming from the sheet', () => {
    const out = jobPageHtml(base, job, 'https://s.com');
    expect(out).not.toContain('<b>"X"</b>');
    expect(out).toContain('Plumber &lt;b&gt;&quot;X&quot;&lt;/b&gt;');
    expect(out).toContain('Gulf &amp; Co');
  });
  it('writes valid Google job data and cannot be broken out of the script tag', () => {
    const json = jobPostingJson({ ...job, title: '</script><script>alert(1)</script>' }, 'https://s.com');
    expect(json).not.toContain('</script>');
    const data = JSON.parse(json);
    expect(data['@type']).toBe('JobPosting');
    expect(data.datePosted).toBe('2025-03-01');
    expect(data.validThrough).toBe('2025-04-01');
    expect(data.jobLocation.address.addressCountry).toBe('AE');
    expect(data.url).toBe('https://s.com/job/101');
  });
});

describe('share preview picture', () => {
  it('uses the ad picture for a picture ad, and the site picture for a PDF or an ad without a file', () => {
    const picture = jobPageHtml(base, { ...job, fileType: 'image', fileUrl: 'https://p.supabase.co/storage/v1/object/public/job-files/u/a.jpg' }, 'https://s.com');
    expect(picture).toContain('property="og:image" content="https://p.supabase.co/storage/v1/object/public/job-files/u/a.jpg"');
    const pdf = jobPageHtml(base, { ...job, fileType: 'pdf', fileUrl: 'https://p.supabase.co/x.pdf' }, 'https://s.com');
    expect(pdf).toContain('property="og:image" content="https://s.com/hero.jpg"');
    expect(jobPageHtml(base, job, 'https://s.com')).toContain('content="https://s.com/hero.jpg"');
  });
  it('the public wording is true: employers pay, applicants are named in the privacy text', () => {
    const text = JSON.stringify(STATIC_PAGES);
    expect(text).not.toContain('Posting is free');
    expect(text).not.toContain('do not collect your name');
  });
});

describe('sitemapXml', () => {
  it('lists fixed pages and every job', () => {
    const xml = sitemapXml([job, { ...job, id: 'a b' }], 'https://s.com');
    expect(xml).toContain('<loc>https://s.com/</loc>');
    expect(xml).toContain('<loc>https://s.com/jobs</loc>');
    expect(xml).toContain('<loc>https://s.com/job/101</loc>');
    expect(xml).toContain('https://s.com/job/a%20b');
    expect(xml).toContain('<lastmod>2025-03-01</lastmod>');
  });
});
