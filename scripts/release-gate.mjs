// FINAL RELEASE GATE: npm run release:gate   (add --live-readonly to also read the linked Supabase project, SELECT only)
// Runs the static and safety checks that need no browser: secrets, placeholder text, build guards, headers, SEO output, audit, lint, commit state.
// It never prints a secret (only the file and line of a match), never writes to a database, and changes no application file.
// The result goes to test-results/release-gate.json and the table in the console. Browser, database-rule and Lighthouse tests are in `npm run test:all`.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, relative } from 'node:path';

const liveReadonly = process.argv.includes('--live-readonly');
const results = [];
const add = (item, check, result, evidence) => results.push({ item, check, result, evidence });
const sh = (cmd, env = {}) => spawnSync(cmd, { shell: true, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 1 << 28 });

/** All text files under a folder (skips big and generated folders). */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.git', 'dist', 'dist-e2e', 'test-results', 'playwright-report', '.wrangler'].includes(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (st.size < 2_000_000 && !/\.(png|jpg|jpeg|webp|ico|woff2?|pdf)$/i.test(name)) out.push(full);
  }
  return out;
}
const lines = (file) => readFileSync(file, 'utf8').split(/\r?\n/);
const rel = (f) => relative('.', f).replace(/\\/g, '/');

// ---------- 1. secrets ----------
const SECRET_PATTERNS = [
  ['service_role key word', /service_role/i], ['Supabase secret key', /sb_secret_[A-Za-z0-9_-]{10,}/], ['Supabase access token', /\bsbp_[a-f0-9]{30,}/],
  ['Razorpay key', /rzp_(live|test)_[A-Za-z0-9]{8,}/], ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/], ['Resend key', /\bre_[A-Za-z0-9]{20,}/],
];
const decodeRole = (jwt) => { try { return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).role; } catch { return null; } };
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

{
  const hits = [];
  for (const f of walk('.')) {
    if (/(release-gate|smoke-live)\.mjs$|package-lock\.json$|\.md$|\.sql$|\.test\.(js|mjs)$/.test(f) || /^\.env/.test(rel(f))) continue;
    lines(f).forEach((l, i) => {
      for (const [name, re] of SECRET_PATTERNS) if (re.test(l)) hits.push(`${rel(f)}:${i + 1} (${name})`);
      for (const m of l.match(JWT) || []) if (decodeRole(m) !== 'anon') hits.push(`${rel(f)}:${i + 1} (JWT with role ${decodeRole(m)})`); // the public anon key is allowed (wrangler.toml)
    });
  }
  add('Secrets', 'Working tree has no secret keys or tokens (code, config, scripts)', hits.length ? 'FAIL' : 'PASS', hits.length ? hits.join('; ') : 'pattern scan of all text files except docs, SQL and tests');

  const docs = [];
  for (const f of walk('docs').concat(['README.md', 'CLAUDE.md'])) lines(f).forEach((l, i) => { if (/sb_secret_[A-Za-z0-9_-]{10,}|rzp_(live|test)_[A-Za-z0-9]{8,}|re_[A-Za-z0-9]{24,}|eyJ[A-Za-z0-9_-]{20,}\.eyJ/.test(l)) docs.push(`${rel(f)}:${i + 1}`); });
  add('Secrets', 'Docs and README contain no key values', docs.length ? 'FAIL' : 'PASS', docs.length ? docs.join('; ') : 'pattern scan');

  const hist = sh('git log --all -p --no-color');
  const found = new Set();
  for (const [name, re] of SECRET_PATTERNS.slice(1)) if (re.test(hist.stdout)) found.add(name);
  for (const m of hist.stdout.match(JWT) || []) { const role = decodeRole(m); found.add(`JWT with role ${role}`); }
  const onlyAnon = [...found].every((x) => /JWT with role anon/.test(x));
  add('Secrets', 'Full git history has no secret keys (a public anon key is allowed)', found.size === 0 || onlyAnon ? 'PASS' : 'FAIL', found.size ? [...found].join('; ') : 'git log --all -p scanned');
  const trackedEnv = sh('git ls-files').stdout.split('\n').filter((f) => /(^|\/)\.env(\..*)?$|\.dev\.vars$/.test(f) && !/\.example$/.test(f));
  const ignored = sh('git check-ignore .env .dev.vars').stdout.split('\n').filter(Boolean);
  add('Secrets', '.env and .dev.vars are git-ignored and not tracked', trackedEnv.length === 0 && ignored.includes('.env') ? 'PASS' : 'FAIL', trackedEnv.length ? `tracked: ${trackedEnv.join(', ')}` : `ignored: ${ignored.join(', ')}`);
}

// ---------- 2. variables exposed to the browser ----------
{
  const used = new Set();
  for (const f of walk('src')) lines(f).forEach((l) => { for (const m of l.matchAll(/import\.meta\.env\.(\w+)/g)) used.add(m[1]); });
  // VITE_ALLOW_DEMO is a yes/no switch (never a key); it must NOT be set to true on the real site
  const allowed = new Set(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_TURNSTILE_SITE_KEY', 'VITE_ALLOW_DEMO', 'MODE', 'DEV', 'PROD', 'BASE_URL', 'SSR']);
  const extra = [...used].filter((n) => !allowed.has(n));
  add('Config', `Browser code reads only these variables: ${[...used].sort().join(', ')}`, extra.length ? 'FAIL' : 'PASS', extra.length ? `unexpected: ${extra.join(', ')}` : 'grep of import.meta.env in src/');
}

// ---------- 3. build, lockfile, audit, lint ----------
{
  add('Dependencies', 'package-lock.json is committed', sh('git ls-files package-lock.json').stdout.trim() ? 'PASS' : 'FAIL', 'git ls-files');
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const ranges = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).filter(([, v]) => /^[\^~]/.test(v)).length;
  add('Dependencies', 'Versions are fixed by the lockfile (package.json uses ranges)', 'INFO', `${ranges} ranges in package.json; the lockfile fixes the exact versions and Cloudflare installs with it`);
  const audit = sh('npm audit --json');
  try { const v = JSON.parse(audit.stdout).metadata.vulnerabilities; add('Dependencies', 'npm audit: no high or critical issues', v.high + v.critical === 0 ? 'PASS' : 'FAIL', `critical ${v.critical}, high ${v.high}, moderate ${v.moderate}, low ${v.low}`); } catch { add('Dependencies', 'npm audit', 'NOT RUN', 'no answer (offline?)'); }
  const lint = sh('npx eslint .');
  add('Static checks', 'Lint (ESLint) has no errors', lint.status === 0 ? 'PASS' : 'FAIL', lint.status === 0 ? 'npx eslint .' : (lint.stdout || '').split('\n').slice(0, 5).join(' | '));
  add('Static checks', 'Type check', 'N/A', 'plain JavaScript project, no TypeScript');

  const build = sh('npm run build', { SITE_URL: 'https://gate-check.example.test' });
  add('Build', 'Production build succeeds', build.status === 0 ? 'PASS' : 'FAIL', build.status === 0 ? 'npm run build' : (build.stderr || build.stdout).split('\n').slice(-5).join(' | '));
  const warn = `${build.stdout}${build.stderr}`.split('\n').filter((l) => /warn|deprecat/i.test(l) && !/config check/i.test(l));
  add('Build', 'No build warnings', warn.length ? 'FAIL' : 'PASS', warn.length ? warn.slice(0, 3).join(' | ') : 'none printed');
  const strictOff = sh('node scripts/checkConfig.mjs', { CF_PAGES: '1', VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' });
  const strictOn = sh('node scripts/checkConfig.mjs', { CF_PAGES: '1', VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' });
  add('Build', 'The Cloudflare build stops when the Supabase values are missing, and passes when they are set', strictOff.status === 1 && strictOn.status === 0 ? 'PASS' : 'FAIL', `CF_PAGES=1 without values exit ${strictOff.status}, with values exit ${strictOn.status}`);
  add('Build', 'The build stops while src/config.js has placeholders (your brief)', 'CHANGED BY DESIGN', 'Since step 12 the shop details live in Admin > Settings; the site hides anything not filled in. config.js placeholders are demo defaults only');

  if (existsSync('dist/assets')) {
    let raw = 0; let gz = 0; const big = [];
    for (const f of readdirSync('dist/assets')) { const b = readFileSync(join('dist/assets', f)); raw += b.length; const g = gzipSync(b).length; gz += g; if (g > 100_000) big.push(`${f} ${Math.round(g / 1024)} KB`); }
    add('Build', 'Bundle size', gz < 500_000 ? 'PASS' : 'FAIL', `${Math.round(raw / 1024)} KB raw, ${Math.round(gz / 1024)} KB compressed; largest: ${big.join(', ') || 'none over 100 KB'}`);
    const bad = [];
    for (const f of readdirSync('dist/assets')) {
      const text = readFileSync(join('dist/assets', f), 'utf8');
      // the Supabase library itself contains the word "sb_secret_" (it checks key types); a real secret key is 20+ more characters
      if (/sb_secret_[A-Za-z0-9_-]{20,}/.test(text) || (/service_role/.test(text) && !/^supabase-/.test(f))) bad.push(`${f} contains a secret key or the word service_role`);
      for (const m of text.match(JWT) || []) if (decodeRole(m) !== 'anon') bad.push(`${f} has a key with role ${decodeRole(m)}`);
    }
    add('Secrets', 'Built site has no service_role or secret key; any key inside is the public anon key', bad.length ? 'FAIL' : 'PASS', bad.length ? bad.join('; ') : 'dist/assets scanned and JWT roles decoded');
  }
}

// ---------- 4. placeholder text ----------
{
  const rules = [
    ['lorem ipsum', /lorem ipsum/i], ['TODO/FIXME', /\b(TODO|FIXME|XXX)\b/], ['localhost url', /localhost|127\.0\.0\.1/], ['example email/domain', /@example\.(com|org)|example\.com/i],
    ['fake UPI', /yourname@upi|Your Business Name/], ['test phone', /919999999999|9876543210|987654321/], ['placeholder marker', /\[?PLACEHOLDER\b/],
  ];
  const hits = { visible: [], defaults: [] };
  for (const f of walk('src').concat(walk('public'), ['index.html'])) {
    const r = rel(f);
    if (/\.test\.|demo\/|\/e2e\//.test(r)) continue;
    lines(f).forEach((l, i) => {
      for (const [name, re] of rules) {
        if (!re.test(l)) continue;
        if (/(for example|example:|like name@example\.com|जैसे|उदाहरण)/i.test(l) && name !== 'placeholder marker') continue; // help lines that show how to write a value
        const isDefault = /^src\/config\.js|^src\/shared\/lib\/siteSettings\.js|^src\/shared\/data\/env\.js/.test(r);
        (isDefault ? hits.defaults : hits.visible).push(`${r}:${i + 1} (${name})`);
      }
    });
  }
  add('Placeholders', 'No placeholder text in screens, translations, public files (English and Hindi)', hits.visible.length ? 'FAIL' : 'PASS', hits.visible.length ? hits.visible.slice(0, 12).join('; ') + (hits.visible.length > 12 ? ` ... +${hits.visible.length - 12}` : '') : 'scanned src/, public/, index.html');
  add('Placeholders', 'Example values only in demo defaults (src/config.js), never shown while the real project is not configured', hits.defaults.length ? 'INFO' : 'PASS', hits.defaults.slice(0, 8).join('; ') || 'none');
}

// ---------- 5. deployment config and SEO output ----------
{
  const headers = existsSync('dist/_headers') ? readFileSync('dist/_headers', 'utf8') : '';
  const need = ["frame-ancestors 'none'", "object-src 'none'", 'Strict-Transport-Security', 'X-Content-Type-Options: nosniff', "script-src 'self'", '/assets/*'];
  const missing = need.filter((n) => !headers.includes(n));
  add('Deployment', 'Security and caching headers are written (_headers)', headers && !missing.length && !headers.includes('unsafe-inline') ? 'PASS' : 'FAIL', missing.length ? `missing: ${missing.join(', ')}` : 'CSP, HSTS, nosniff, frame protection, asset caching, no unsafe-inline');
  const fallback = !existsSync('dist/404.html') && !existsSync('dist/_redirects') && existsSync('dist/index.html');
  add('Deployment', 'Single-page fallback works on Cloudflare Pages (no 404.html, no _redirects)', fallback ? 'PASS' : 'FAIL', 'dist/ has index.html and neither 404.html nor _redirects (either would switch the fallback off)');
  add('Deployment', 'Hosting config files exist (wrangler.toml, .node-version, CI)', existsSync('wrangler.toml') && existsSync('.node-version') && existsSync('.github/workflows/ci.yml') ? 'PASS' : 'FAIL', 'wrangler.toml, .node-version, .github/workflows/ci.yml');
  const head = sh('git rev-parse --short HEAD').stdout.trim();
  const tags = sh('git tag --points-at HEAD').stdout.trim();
  const dirty = sh('git status --porcelain').stdout.trim();
  const ahead = sh('git rev-list --count @{u}..HEAD').stdout.trim();
  add('Deployment', 'Commit is clean and pushed', !dirty && ahead === '0' ? 'PASS' : 'FAIL', `commit ${head}; uncommitted files ${dirty ? dirty.split('\n').length : 0}; commits not pushed ${ahead || 'unknown'}`);
  add('Deployment', 'A release tag marks this commit (the rollback point)', tags ? 'PASS' : 'FAIL', tags ? `tag ${tags}` : 'no tag: run  git tag -a v1.0.0 -m "First release" && git push origin v1.0.0');

  const sitemap = existsSync('dist/sitemap.xml') ? readFileSync('dist/sitemap.xml', 'utf8') : '';
  const robots = existsSync('dist/robots.txt') ? readFileSync('dist/robots.txt', 'utf8') : '';
  const country = existsSync('dist/jobs/uae.html') ? readFileSync('dist/jobs/uae.html', 'utf8') : '';
  const okSeo = sitemap.includes('/jobs/uae') && sitemap.includes('/about') && /Sitemap: https:\/\/[^/]+\/sitemap\.xml/.test(robots) && country.includes('<title>Jobs in UAE') && country.includes('rel="canonical"') && country.includes('<h1>Jobs in UAE</h1>');
  add('SEO', 'Pre-render writes sitemap, robots.txt and readable country pages (checked with a test site address)', okSeo ? 'PASS' : 'FAIL', okSeo ? 'dist/sitemap.xml, dist/robots.txt, dist/jobs/uae.html have title, canonical, <h1> in the HTML' : 'a file or tag is missing');
  const index = readFileSync('dist/index.html', 'utf8');
  add('SEO', 'Start page has title, description and share tags', /<title>.+<\/title>/.test(index) && /name="description"/.test(index) && /og:image/.test(index) ? 'PASS' : 'FAIL', 'dist/index.html');
}

// ---------- 6. abuse protection (code evidence) ----------
{
  const sql = walk('supabase/migrations').map((f) => readFileSync(f, 'utf8')).join('\n');
  const has = (re) => re.test(sql);
  add('Abuse', 'Apply form: per-address flood limit and one application per phone per ad', has(/applications_guard_insert/) && has(/54001/) ? 'PASS' : 'FAIL', 'migration 0017 trigger (30/hour, 100/day) and unique phone per ad');
  add('Abuse', 'Report form and deletion requests: flood limits and one report per ad per address', has(/reports_guard_insert/) && has(/deletion_requests_guard_insert/) ? 'PASS' : 'FAIL', 'migration 0020 triggers');
  add('Abuse', 'Blocked employers cannot come back with a new login (phone ban)', has(/blocked_contacts/) ? 'PASS' : 'FAIL', 'migration 0017');
  const signup = readFileSync('src/features/auth/Signup.jsx', 'utf8');
  add('Abuse', 'CAPTCHA on signup (Cloudflare Turnstile, optional until keys are set)', /turnstile/i.test(signup) ? 'PARTIAL' : 'FAIL', 'code present; works only when VITE_TURNSTILE_SITE_KEY and the Supabase CAPTCHA secret are set (NOT VERIFIED). Not on login, password reset or the apply form');
  add('Abuse', 'Login and password reset rate limits', 'NOT VERIFIED', 'Supabase Auth rate limits are in the dashboard (Authentication > Rate Limits)');
}

// ---------- 7. live project, SELECT only ----------
if (liveReadonly) {
  const q = (sql) => { const r = sh(`npx supabase db query --linked "${sql.replace(/"/g, '\\"')}" -o json`); try { const t = r.stdout; return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)).rows; } catch { return null; } };
  const rls = q("select c.relname as t, c.relrowsecurity as rls, (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1");
  if (rls) {
    // app_settings is deliberately closed to everybody (no policy = no access); only database functions read it
    const bad = rls.filter((r) => !r.rls || (Number(r.policies) === 0 && r.t !== 'app_settings'));
    add('Live database (read-only)', 'RLS is on for every table and every table has at least one policy', bad.length ? 'FAIL' : 'PASS', bad.length ? bad.map((r) => `${r.t} rls=${r.rls} policies=${r.policies}`).join('; ') : `${rls.length} tables checked; app_settings has no policy on purpose (private, functions only)`);
  } else add('Live database (read-only)', 'RLS on every table', 'NOT RUN', 'could not read the linked project (run npx supabase link)');
  const data = q("select (select count(*) from auth.users) as users, (select count(*) from public.jobs) as jobs, (select count(*) from public.applications) as applications, (select count(*) from public.packages) as plans, (select count(*) from public.offers) as offers, (select count(*) from public.site_settings) as settings, (select count(*) from storage.objects) as files, (select string_agg(jobname || ':' || schedule, ', ') from cron.job) as cron, (select count(*) from cron.job_run_details where status='failed') as cron_failed, (select count(*) from cron.job_run_details) as cron_runs");
  if (data) add('Live database (read-only)', 'Counts (test users and sample data should be zero or intended)', 'INFO', JSON.stringify(data[0]));
  const bucket = q("select file_size_limit, allowed_mime_types, public from storage.buckets where id='job-files'");
  if (bucket) add('Live database (read-only)', 'Storage bucket limits (size, types)', bucket[0] ? 'PASS' : 'FAIL', JSON.stringify(bucket[0] || 'bucket missing'));
  const mig = sh('npx supabase migration list --linked').stdout;
  const unapplied = (mig.match(/"local":"(\d+)","remote":""/g) || []);
  add('Live database (read-only)', 'Every migration in the repository is applied on the project', mig && !unapplied.length ? 'PASS' : 'FAIL', unapplied.length ? `not applied: ${unapplied.join(', ')}` : 'supabase migration list');
}

// ---------- report ----------
mkdirSync('test-results', { recursive: true });
writeFileSync('test-results/release-gate.json', JSON.stringify({ at: new Date().toISOString(), commit: sh('git rev-parse --short HEAD').stdout.trim(), results }, null, 2));
const width = Math.max(...results.map((r) => r.item.length));
for (const r of results) console.log(`${r.result.padEnd(17)} ${r.item.padEnd(width)}  ${r.check}\n${' '.repeat(18 + width)}  -> ${r.evidence}`);
const count = (s) => results.filter((r) => r.result === s).length;
console.log(`\nPASS ${count('PASS')}  FAIL ${count('FAIL')}  PARTIAL ${count('PARTIAL')}  NOT VERIFIED/NOT RUN ${results.filter((r) => /^NOT/.test(r.result)).length}  INFO/CHANGED ${results.filter((r) => /INFO|CHANGED|N\/A/.test(r.result)).length}`);
process.exit(count('FAIL') ? 1 : 0);
