// POST-DEPLOY SMOKE TEST (read-only): npm run smoke:live -- https://your-domain.com
// Only loads public pages. It never logs in, never submits a form and never writes data. Run it after the site is live.
// Checks: HTTPS and redirects (http, www), security headers, sitemap and robots, deep links, share-preview tags in the raw HTML,
// console errors and failed requests on the home page and a country page, and (with --lighthouse) a throttled phone score.
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const base = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https:\/\/[^/]+$/.test(base)) {
  console.error('Use: npm run smoke:live -- https://your-domain.com');
  process.exit(2);
}
const host = new URL(base).host;
const apex = host.replace(/^www\./, '');
const rows = [];
const add = (check, ok, evidence) => rows.push({ check, ok, evidence });
const get = (url, opts = {}) => fetch(url, { redirect: 'manual', ...opts }).catch((e) => ({ status: 0, headers: new Headers(), text: async () => '', error: e.message }));

// redirects
const http = await get(`http://${host}/`);
add('http:// goes to https://', [301, 302, 307, 308].includes(http.status) && (http.headers.get('location') || '').startsWith('https://'), `status ${http.status} -> ${http.headers.get('location')}`);
const other = host.startsWith('www.') ? apex : `www.${apex}`;
const alt = await get(`https://${other}/`);
const altTo = alt.headers.get('location') || '';
add(`https://${other} goes to https://${host}`, [301, 302, 307, 308].includes(alt.status) && altTo.includes(host), `status ${alt.status} -> ${altTo || 'no redirect (set up the redirect in Cloudflare)'}`);

// home + headers
const home = await get(`${base}/`);
const html = await home.text();
add('home answers 200 over HTTPS', home.status === 200, `status ${home.status}`);
for (const [name, re] of [['Content-Security-Policy', /default-src 'self'/], ['Strict-Transport-Security', /max-age=\d+/], ['X-Content-Type-Options', /nosniff/], ['X-Frame-Options', /DENY|SAMEORIGIN/], ['Referrer-Policy', /.+/]]) {
  add(`header ${name}`, re.test(home.headers.get(name) || ''), home.headers.get(name) ? 'present' : 'missing');
}
add('no secret key in the page source', !/service_role|sb_secret_/.test(html), 'checked index.html');
add('share preview tags in the raw HTML (WhatsApp cannot run scripts)', /og:title/.test(html) && /og:image/.test(html) && /rel="canonical"/.test(html) && /<title>.+<\/title>/.test(html), 'og:title, og:image, canonical, title');

// sitemap, robots, deep links
const sm = await get(`${base}/sitemap.xml`); const smText = await sm.text();
add('sitemap.xml is reachable and lists the site address', sm.status === 200 && smText.includes(base), `status ${sm.status}, ${(smText.match(/<loc>/g) || []).length} addresses`);
const rb = await get(`${base}/robots.txt`); const rbText = await rb.text();
add('robots.txt points to the sitemap with no double slash', rb.status === 200 && new RegExp(`Sitemap: ${base.replace(/[.]/g, '\\.')}/sitemap\\.xml`).test(rbText), rbText.split('\n').find((l) => /^Sitemap/i.test(l)) || 'no Sitemap line');
for (const path of ['/jobs', '/jobs/uae', '/about', '/faq', '/refund-policy', '/delete-account', '/reset-password', '/login', '/admin', '/no/such/page']) {
  const r = await get(`${base}${path}`);
  add(`deep link ${path} answers 200 (refresh works)`, r.status === 200, `status ${r.status}`);
}
const country = await (await get(`${base}/jobs/uae`)).text();
add('country page is readable without JavaScript (title and heading in the HTML)', /<title>Jobs in UAE/.test(country) && /<h1>Jobs in UAE<\/h1>/.test(country), 'checked /jobs/uae');

// browser: console errors and failed requests
const browser = await chromium.launch();
for (const path of ['/', '/jobs/uae']) {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  const bad = [];
  page.on('console', (m) => { if (m.type() === 'error') bad.push(m.text().slice(0, 120)); });
  page.on('pageerror', (e) => bad.push(String(e).slice(0, 120)));
  page.on('requestfailed', (r) => bad.push(`failed ${new URL(r.url()).host}${new URL(r.url()).pathname}`));
  page.on('response', (r) => { if (r.status() >= 400) bad.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`); });
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  add(`${path}: no console errors, no failed or 4xx/5xx requests`, bad.length === 0, bad.join(' | ') || 'clean');
  await page.close();
}
await browser.close();

if (process.argv.includes('--lighthouse')) {
  const chrome = spawnSync('node', ['-e', "console.log(require('@playwright/test').chromium.executablePath())"], { encoding: 'utf8' }).stdout.trim();
  for (const [name, path] of [['home', '/'], ['jobs', '/jobs']]) {
    const out = `test-results/lighthouse-live-${name}.json`;
    spawnSync('npx', ['--yes', 'lighthouse@latest', `${base}${path}`, '--only-categories=performance,accessibility,best-practices,seo', '--output=json', `--output-path=${out}`, '--chrome-flags="--headless=new --no-sandbox"', '--quiet'], { stdio: 'ignore', shell: true, env: { ...process.env, CHROME_PATH: chrome } });
    try {
      const j = JSON.parse((await import('node:fs')).readFileSync(out, 'utf8'));
      const sc = (c) => Math.round(j.categories[c].score * 100);
      add(`Lighthouse phone ${path}: performance at least 85`, sc('performance') >= 85, `performance ${sc('performance')}, accessibility ${sc('accessibility')}, best-practices ${sc('best-practices')}, seo ${sc('seo')}, LCP ${j.audits['largest-contentful-paint'].displayValue}`);
    } catch { add(`Lighthouse phone ${path}`, false, 'could not run'); }
  }
}

for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.check}\n      -> ${r.evidence}`);
const failed = rows.filter((r) => !r.ok).length;
console.log(`\n${rows.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
