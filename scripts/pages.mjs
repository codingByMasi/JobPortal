// Pure helpers used after the build to make search-friendly pages, a sitemap and Google job data.
import { COUNTRIES } from '../src/shared/lib/catalog.js';

/** YYYY-MM-DD from a local-midnight timestamp (toISOString would shift the day in time zones ahead of UTC). */
const day = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Puts title, description, share-preview tags, canonical link and optional extra head HTML into an index.html text. */
export function withMeta(html, { title, description, url, image, extraHead = '', body = '' }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  let out = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${t}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${d}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${t}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${d}$2`)
    .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${escapeHtml(image)}$2`);
  const add = `    <meta property="og:url" content="${escapeHtml(url)}" />\n    <link rel="canonical" href="${escapeHtml(url)}" />\n${extraHead}`;
  out = out.replace('</head>', `${add}  </head>`);
  if (body) out = out.replace('<div id="root"></div>', `<div id="root">${body}</div>`);
  return out;
}

/** Google "JobPosting" data for one job (shown as a script tag of type application/ld+json). */
export function jobPostingJson(job, siteUrl) {
  const country = COUNTRIES.find((c) => c.id === job.country);
  const data = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: `${job.title}${job.company ? ` at ${job.company}` : ''} in ${[job.city, country?.name].filter(Boolean).join(', ')}. Open the full advertisement on Jobs Abroad.`,
    hiringOrganization: { '@type': 'Organization', name: job.company || 'Employer' },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: job.city || undefined,
        addressCountry: country?.iso || undefined,
      },
    },
    url: `${siteUrl}/job/${encodeURIComponent(job.id)}`,
  };
  if (job.posted) data.datePosted = day(job.posted);
  if (job.expiry) data.validThrough = day(job.expiry);
  return JSON.stringify(data).replace(/</g, '\\u003c'); // never let a cell close the script tag
}

/** index.html text for one job's address. */
export function jobPageHtml(html, job, siteUrl) {
  const place = [job.city, COUNTRIES.find((c) => c.id === job.country)?.name].filter(Boolean).join(', ');
  const title = `${job.title}${place ? ` - ${place}` : ''} | Jobs Abroad`;
  const description = `${job.title}${job.company ? ` at ${job.company}` : ''}${place ? ` in ${place}` : ''}. See the full job ad. No login, no payment.`;
  const body = `<main><h1>${escapeHtml(job.title)}</h1><p>${escapeHtml(description)}</p></main>`;
  const extraHead = `    <script type="application/ld+json">${jobPostingJson(job, siteUrl)}</script>\n`;
  return withMeta(html, { title, description, url: `${siteUrl}/job/${encodeURIComponent(job.id)}`, image: `${siteUrl}/hero.jpg`, extraHead, body });
}

export const STATIC_PAGES = [
  { path: '/jobs', title: 'Jobs | Jobs Abroad', description: 'Latest job ads for plumber, electrician, driver, technician, cook and helper jobs in the Gulf.' },
  { path: '/contact', title: 'Contact us | Jobs Abroad', description: 'WhatsApp or email us for help with job ads.' },
  { path: '/post-job', title: 'Post a Job | Jobs Abroad', description: 'Employers can post a job ad in 3 easy steps. Posting is free.' },
  { path: '/privacy', title: 'Privacy | Jobs Abroad', description: 'No login. We do not collect your name, phone number or documents.' },
  { path: '/terms', title: 'Terms and safety | Jobs Abroad', description: 'Stay safe: never pay before checking the employer.' },
];

/** sitemap.xml text for the fixed pages plus every job. */
export function sitemapXml(jobs, siteUrl) {
  const urls = [
    { loc: `${siteUrl}/` },
    ...STATIC_PAGES.map((p) => ({ loc: `${siteUrl}${p.path}` })),
    ...jobs.map((j) => ({ loc: `${siteUrl}/job/${encodeURIComponent(j.id)}`, lastmod: j.posted ? day(j.posted) : '' })),
  ];
  const rows = urls.map((u) => `  <url><loc>${escapeHtml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows}\n</urlset>\n`;
}
