// Accessibility tests: axe (WCAG 2.1 A/AA) on every main screen, plus tap-target size and text size.
// Results are also written to test-results/a11y/*.json so the report can quote them.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { login } from './helpers.js';

const PUBLIC = ['/', '/jobs', '/job/job-1', '/post-job', '/contact', '/login', '/signup', '/forgot-password', '/privacy', '/terms', '/about', '/faq', '/refund-policy', '/delete-account', '/jobs/uae'];
const EMPLOYER = ['/dashboard', '/dashboard/new', '/dashboard/pay/job-7', '/dashboard/payments', '/dashboard/applications', '/dashboard/profile'];
const ADMIN = ['/admin', '/admin/jobs', '/admin/jobs/new', '/admin/employers', '/admin/payments', '/admin/packages', '/admin/offers', '/admin/history', '/admin/reports', '/admin/settings', '/admin/guides', '/admin/applications', '/admin/requests', '/admin/security', '/admin/problems'];

const slug = (s) => s.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home';

async function scan(page, path, project, lang) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const small = await page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('.sr-only, .demo-banner');
    };
    const taps = [...document.querySelectorAll('a[href], button, input:not([type=hidden]):not([type=file]), select, textarea, [role=button]')]
      .filter(visible)
      .filter((el) => !(el.matches('input[type=radio], input[type=checkbox]') && el.closest('label')))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => Math.min(r.width, r.height) < 44)
      .map(({ el, r }) => `${el.tagName.toLowerCase()} "${(el.innerText || el.getAttribute('aria-label') || el.name || '').trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const tiny = new Set();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent.trim();
      const el = n.parentElement;
      if (!text || !el || !visible(el) || ['SCRIPT', 'STYLE'].includes(el.tagName)) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < 14) tiny.add(`${size}px "${text.slice(0, 28)}"`);
    }
    return { taps, tiny: [...tiny] };
  });
  const result = {
    path, project, lang,
    violations: axe.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, example: v.nodes[0]?.target?.join(' ') })),
    smallTapTargets: small.taps,
    smallText: small.tiny,
  };
  mkdirSync('test-results/a11y', { recursive: true });
  writeFileSync(`test-results/a11y/${project}_${lang}_${slug(path)}.json`, JSON.stringify(result, null, 1));
  return result;
}

for (const [group, paths, who] of [['public', PUBLIC, null], ['employer', EMPLOYER, 'employer'], ['admin', ADMIN, 'admin']]) {
  test.describe(`accessibility: ${group} screens`, () => {
    for (const path of paths) {
      test(`${path} (English)`, async ({ page }, info) => {
        if (who) await login(page, who);
        const r = await scan(page, path, info.project.name, 'en');
        expect(r.violations, `axe violations on ${path}`).toEqual([]);
        expect.soft(r.smallTapTargets, `tap targets under 44 px on ${path}`).toEqual([]);
        expect.soft(r.smallText, `text under 14 px on ${path}`).toEqual([]);
      });
    }
  });
}

test.describe('accessibility: Hindi', () => {
  for (const path of ['/', '/jobs', '/job/job-1', '/post-job', '/signup', '/terms']) {
    test(`${path} (Hindi)`, async ({ page }, info) => {
      await page.addInitScript(() => localStorage.setItem('jobs-abroad-lang', 'hi'));
      const r = await scan(page, path, info.project.name, 'hi');
      expect(r.violations, `axe violations on ${path} in Hindi`).toEqual([]);
      expect.soft(r.smallTapTargets, `tap targets under 44 px on ${path} in Hindi`).toEqual([]);
    });
  }
});
