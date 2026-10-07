// Runs after `vite build`. Reads the live ads from Supabase (the safe public view, anon key only) and writes, into dist/:
//   - one search-friendly page per live job (own title, description, share preview, Google job data)
//   - pages for /jobs, /contact ... with the right titles
//   - sitemap.xml and robots.txt
// Skipped (with a message) until Supabase and SITE_URL are set. A failure here never breaks the deploy:
// the normal app still works without these extras.
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { SITE_URL as CONFIG_SITE_URL, isPlaceholder } from '../src/config.js';

// A build (or a test) can name the site address in the environment; otherwise the one in src/config.js is used.
const SITE_URL = (process.env.SITE_URL || CONFIG_SITE_URL).replace(/\/$/, '');
import { toJob } from '../src/shared/data/mappers.js';
import { STATIC_PAGES, countryPages, jobPageHtml, sitemapXml, withMeta } from './pages.mjs';

/** Value from the environment (the hosting build) or from the local .env file. */
function setting(name) {
  if (process.env[name]) return process.env[name];
  if (!existsSync('.env')) return '';
  const line = readFileSync('.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : '';
}

async function fetchLiveJobs(url, key) {
  const columns = 'id,title,company,country,city,category,file_url,file_type,details,posted_date,starts_at,expires_at,salary_min,salary_max,currency,experience_level,vacancies,last_date,visa_type';
  const res = await fetch(`${url}/rest/v1/public_jobs?select=${columns}&order=starts_at.desc&limit=1000`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Supabase answered ${res.status}`);
  return (await res.json()).map((row) => toJob(row));
}

// Each page is a flat file (jobs.html, job/<id>.html), not a folder with index.html: Cloudflare Pages then serves it at /jobs and
// /job/<id> exactly (a folder would be redirected to /jobs/ and would not match the address in the share preview and sitemap).
async function writePage(urlPath, html) {
  const file = `dist${urlPath}.html`;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html);
}

async function main() {
  const url = setting('VITE_SUPABASE_URL');
  const key = setting('VITE_SUPABASE_ANON_KEY');
  if (!url || !key || isPlaceholder(SITE_URL)) {
    console.log('prerender: skipped (set the two Supabase values and SITE_URL in src/config.js to enable job pages and sitemap)');
    return;
  }
  const base = await readFile('dist/index.html', 'utf8');
  const jobs = await fetchLiveJobs(url, key);

  await writeFile('dist/index.html', withMeta(base, {
    title: 'Jobs Abroad',
    description: 'Find jobs abroad in UAE, Saudi Arabia, Qatar, Kuwait and Oman. See full job ads. No login, no payment.',
    url: `${SITE_URL}/`,
    image: `${SITE_URL}/hero.jpg`,
  }));
  for (const p of STATIC_PAGES) {
    await writePage(p.path, withMeta(base, { ...p, url: `${SITE_URL}${p.path}`, image: `${SITE_URL}/hero.jpg` }));
  }
  for (const p of countryPages(jobs, SITE_URL)) {
    await writePage(p.path, withMeta(base, { ...p, image: `${SITE_URL}/hero.jpg` }));
  }
  for (const job of jobs) await writePage(`/job/${encodeURIComponent(job.id)}`, jobPageHtml(base, job, SITE_URL));

  await writeFile('dist/sitemap.xml', sitemapXml(jobs, SITE_URL));
  await writeFile('dist/robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  console.log(`prerender: wrote ${jobs.length} job pages, ${STATIC_PAGES.length} fixed pages, sitemap.xml, robots.txt`);
}

main().catch((err) => {
  console.warn('prerender: skipped because of an error:', err.message);
  // on the hosting service a missing search/share page set must not go unnoticed: stop the publish, the old site stays online
  if (process.env.CF_PAGES === '1' || process.env.NETLIFY === 'true') process.exit(1);
});
