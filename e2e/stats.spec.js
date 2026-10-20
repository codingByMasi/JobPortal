// Browser tests: a visitor's view is counted once per day, and the employer sees views and applications on their ads.
import { expect, test } from '@playwright/test';
import { login } from './helpers.js';

test.describe('ad views and numbers', () => {
  test('a visit counts once a day; the employer sees it; the employer looking at their own ad does not count', async ({ page }) => {
    await page.goto('/job/job-1');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    // the demo saves the count a moment after the page opens
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('jobs-abroad-demo-v2') || '{}').ad_views?.['job-1'] || 0)).toBe(1);
    await page.reload(); // the same browser again on the same day: not counted twice
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

    await login(page, 'employer');
    await page.goto('/dashboard');
    const ad = page.locator('.ad-row', { hasText: 'Plumbers Needed' });
    await expect(ad.getByText(/^1 view · \d+ applications?$/)).toBeVisible();

    await page.goto('/job/job-1'); // logged in: not counted
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await page.goto('/dashboard');
    await expect(page.locator('.ad-row', { hasText: 'Plumbers Needed' }).getByText(/^1 view · /)).toBeVisible();
  });

  test('a waiting ad shows no numbers yet; the privacy page says only a number is kept', async ({ page }) => {
    await login(page, 'employer');
    await page.goto('/dashboard');
    await expect(page.locator('.ad-row', { hasText: 'Office Assistant' }).locator('.ad-stats')).toHaveCount(0);
    await page.goto('/privacy');
    await expect(page.getByText('We count how many times each ad is opened, as a plain number. We do not store who opened it.')).toBeVisible();
  });
});
