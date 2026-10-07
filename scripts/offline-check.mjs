// Offline check on the REAL-mode build (npm run test:offline): the site is loaded, the network is switched off, and a form is sent.
// Because the network is off, nothing leaves the computer and nothing is written anywhere. Expected: a plain sentence, no technical words, no crash.
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const PORT = 4302;
const build = spawnSync('npm run build', { shell: true, stdio: 'ignore' });
if (build.status !== 0) { console.error('build failed'); process.exit(2); }
const server = spawn(`npx vite preview --port ${PORT} --strictPort`, { shell: true, stdio: 'ignore' });
const up = async () => { try { return (await fetch(`http://localhost:${PORT}/`)).ok; } catch { return false; } };
for (let i = 0; i < 30 && !(await up()); i += 1) await new Promise((r) => setTimeout(r, 1000));

let failed = 0;
const check = (name, ok, evidence) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      -> ${evidence}`); if (!ok) failed += 1; };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
const page = await context.newPage();
const crashes = [];
page.on('pageerror', (e) => crashes.push(String(e).slice(0, 100)));
try {
  await page.goto(`http://localhost:${PORT}/delete-account`, { waitUntil: 'networkidle' });
  const demo = await page.locator('.demo-banner').count();
  check('the build runs in real mode (not demo data)', demo === 0, `demo banner count ${demo}`);
  await context.setOffline(true);
  await page.getByLabel('Your email').fill('offline-check@example.com');
  await page.getByRole('button', { name: 'Send request' }).click();
  const message = page.locator('[role="alert"], .notice-error, .notice').first();
  await message.waitFor({ timeout: 25000 });
  const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  check('offline: a plain sentence is shown', /internet|connection|try again|network/i.test(text), text.slice(text.indexOf('Send request') - 5, text.indexOf('Send request') + 140));
  check('offline: no technical words', !/fetch|TypeError|supabase|undefined|exception|postgrest/i.test(text), 'checked the page text');
  check('offline: the page did not crash', crashes.length === 0, crashes.join(' | ') || 'no page errors');
  await page.getByRole('link', { name: /Jobs/ }).first().click();
  await page.waitForTimeout(1500);
  check('offline: moving to another screen still works (the app is already loaded)', (await page.locator('main').innerText()).length > 40, 'main text present');
} catch (e) {
  check('offline check ran', false, String(e).slice(0, 200));
}
await browser.close();
spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
process.exit(failed ? 1 : 0);
