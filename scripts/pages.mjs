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
    description: `${job.title}${job.company ? ` at ${job.company}` : ''} in ${[job.city, country?.name].filter(Boolean).join(', ')}. ${job.details ? `${job.details} ` : ''}Open the full advertisement on Jobs Abroad.`,
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
  const end = job.lastDate && (!job.expiresAt || job.lastDate < job.expiresAt) ? job.lastDate : job.expiresAt;
  if (end) data.validThrough = day(end);
  if (job.vacancies) data.totalJobOpenings = job.vacancies;
  if (job.salaryMin != null || job.salaryMax != null) {
    data.baseSalary = {
      '@type': 'MonetaryAmount',
      currency: job.currency || undefined,
      value: { '@type': 'QuantitativeValue', minValue: job.salaryMin ?? job.salaryMax, maxValue: job.salaryMax ?? job.salaryMin, unitText: 'MONTH' },
    };
  }
  return JSON.stringify(data).replace(/</g, '\\u003c'); // never let a cell close the script tag
}

/** index.html text for one job's address. */
export function jobPageHtml(html, job, siteUrl) {
  const place = [job.city, COUNTRIES.find((c) => c.id === job.country)?.name].filter(Boolean).join(', ');
  const title = `${job.title}${place ? ` - ${place}` : ''} | Jobs Abroad`;
  const description = `${job.title}${job.company ? ` at ${job.company}` : ''}${place ? ` in ${place}` : ''}. See the full job ad. No login, no payment.`;
  const body = `<main><h1>${escapeHtml(job.title)}</h1><p>${escapeHtml(description)}</p></main>`;
  const extraHead = `    <script type="application/ld+json">${jobPostingJson(job, siteUrl)}</script>\n`;
  // an ad that is a picture shows that picture in the WhatsApp / Facebook preview; a PDF ad shows the site picture
  const image = job.fileType === 'image' && job.fileUrl ? job.fileUrl : `${siteUrl}/hero.jpg`;
  return withMeta(html, { title, description, url: `${siteUrl}/job/${encodeURIComponent(job.id)}`, image, extraHead, body });
}

export const STATIC_PAGES = [
  { path: '/jobs', title: 'Jobs | Jobs Abroad', description: 'Latest job ads for plumber, electrician, driver, technician, cook and helper jobs in the Gulf.' },
  { path: '/contact', title: 'Contact us | Jobs Abroad', description: 'WhatsApp or email us for help with job ads.' },
  { path: '/post-job', title: 'Post a Job | Jobs Abroad', description: 'Verified employers can post job ads for free in 3 easy steps: make an account, send your license, post your ad.' },
  { path: '/agencies', title: 'Verified agencies | Jobs Abroad', description: 'Employers whose license our team checked: company name, registration number and live ads.' },
  { path: '/check-agency', title: 'How to check a recruitment agency | Jobs Abroad', description: 'Before you pay or send documents: check the registration number, the government list, the job offer and the signs of a fake offer.' },
  { path: '/articles', title: 'Help articles | Jobs Abroad', description: 'Short, plain guides for job seekers: papers to keep ready, how to read a job offer, how to avoid paying for fake jobs, and how to write a CV.' },
  { path: '/articles/documents', title: 'Papers to keep ready for a job abroad | Jobs Abroad', description: 'The papers most employers and countries ask for, and how to keep them safe.' },
  { path: '/articles/offer-letter', title: 'How to read a job offer | Jobs Abroad', description: 'What a proper offer must say, and what to ask before you say yes.' },
  { path: '/articles/before-you-pay', title: 'Before you pay anyone | Jobs Abroad', description: 'Money rules that protect you from fake job offers.' },
  { path: '/articles/cv-tips', title: 'A CV that gets replies | Jobs Abroad', description: 'Short, clear and true: what to put in your CV, and how to make one for free.' },
  { path: '/cv', title: 'Free CV maker | Jobs Abroad', description: 'Make a simple one-page CV for free. Fill in the boxes, then print it or save it as a PDF. Nothing is saved or sent.' },
  { path: '/privacy', title: 'Privacy | Jobs Abroad', description: 'No login to see jobs. If you apply, your name and phone go to the employer and are deleted after 180 days.' },
  { path: '/terms', title: 'Terms and safety | Jobs Abroad', description: 'Stay safe: never pay before checking the employer.' },
  { path: '/about', title: 'About us | Jobs Abroad', description: 'About Jobs Abroad: a free place to see job ads for work in the Gulf, with checks on every ad.' },
  { path: '/faq', title: 'Questions and answers | Jobs Abroad', description: 'Is it free, how to apply, how to stay safe from fake job offers.' },
  { path: '/refund-policy', title: 'Refund policy | Jobs Abroad', description: 'Posting ads is free for verified employers and job seekers never pay, so there is nothing to refund.' },
  { path: '/delete-account', title: 'Delete my account | Jobs Abroad', description: 'Ask us to delete your account and your data.' },
];

/** One landing page per country: /jobs/uae, /jobs/saudi-arabia ... with its own title and the list of ads written into the page text. */
export function countryPages(jobs, siteUrl) {
  return COUNTRIES.map((c) => {
    const list = jobs.filter((j) => j.country === c.id);
    const title = `Jobs in ${c.name} | Jobs Abroad`;
    const description = `Latest job ads in ${c.name} for plumber, electrician, driver, cook and helper jobs. See the full ad. No login, no payment.`;
    const items = list.slice(0, 50).map((j) => `<li><a href="/job/${encodeURIComponent(j.id)}">${escapeHtml(j.title)}${j.city ? ` - ${escapeHtml(j.city)}` : ''}</a></li>`).join('');
    const body = `<main><h1>Jobs in ${escapeHtml(c.name)}</h1><p>${escapeHtml(description)}</p><ul>${items}</ul></main>`;
    return { path: `/jobs/${c.slug}`, title, description, body, url: `${siteUrl}/jobs/${c.slug}` };
  });
}

/** sitemap.xml text for the fixed pages plus every job. */
export function sitemapXml(jobs, siteUrl) {
  const urls = [
    { loc: `${siteUrl}/` },
    ...STATIC_PAGES.map((p) => ({ loc: `${siteUrl}${p.path}` })),
    ...COUNTRIES.map((c) => ({ loc: `${siteUrl}/jobs/${c.slug}` })),
    ...jobs.map((j) => ({ loc: `${siteUrl}/job/${encodeURIComponent(j.id)}`, lastmod: j.posted ? day(j.posted) : '' })),
  ];
  const rows = urls.map((u) => `  <url><loc>${escapeHtml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows}\n</urlset>\n`;
}
