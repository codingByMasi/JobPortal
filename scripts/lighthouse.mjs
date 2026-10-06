// Lighthouse (phone, slow network) on Home, Jobs and one ad page. Starts the demo build itself. Use: npm run test:lighthouse
// Note: demo data has no ad pictures, so picture weight is only measured on the real site. Compression is also done by Cloudflare, not by this preview server.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const PORT = 4189;
const pages = [['home', '/'], ['jobs', '/jobs'], ['job', '/job/job-1']];
mkdirSync('test-results/lighthouse', { recursive: true });

const up = async () => {
  try {
    return (await fetch(`http://127.0.0.1:${PORT}/`)).ok;
  } catch {
    return false;
  }
};
let server;
if (!(await up())) {
  server = spawn('node', ['scripts/e2e-server.mjs'], { stdio: 'ignore', shell: true });
  for (let i = 0; i < 60 && !(await up()); i += 1) await new Promise((r) => setTimeout(r, 2000));
}
if (!(await up())) {
  console.error('The test site did not start.');
  process.exit(2);
}

const chrome = spawnSync('node', ['-e', "console.log(require('@playwright/test').chromium.executablePath())"], { encoding: 'utf8' }).stdout.trim();
let worst = 100;
for (const [name, path] of pages) {
  const out = `test-results/lighthouse/${name}.json`;
  spawnSync('npx', ['--yes', 'lighthouse@latest', `http://127.0.0.1:${PORT}${path}`, '--only-categories=performance,accessibility,best-practices,seo', '--output=json', `--output-path=${out}`, '--chrome-flags="--headless=new --no-sandbox"', '--quiet'], { stdio: 'ignore', shell: true, env: { ...process.env, CHROME_PATH: chrome } });
  const j = JSON.parse(readFileSync(out, 'utf8'));
  const score = (c) => Math.round(j.categories[c].score * 100);
  const a = j.audits;
  console.log(`${name.padEnd(5)} performance ${score('performance')}  accessibility ${score('accessibility')}  best-practices ${score('best-practices')}  seo ${score('seo')} | LCP ${a['largest-contentful-paint'].displayValue}  CLS ${a['cumulative-layout-shift'].displayValue}  TBT ${a['total-blocking-time'].displayValue}  weight ${a['total-byte-weight'].displayValue.replace('Total size was ', '')}`);
  worst = Math.min(worst, score('performance'));
}
if (server) spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
process.exit(worst >= 80 ? 0 : 1);
