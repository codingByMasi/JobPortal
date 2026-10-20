// Browser tests: open reports and deletion requests show on the admin dashboard, and one tap hides a reported ad and closes its report.
import { expect, test } from '@playwright/test';
import { login } from './helpers.js';

test.describe('reports in the work queue', () => {
  test('a report shows as a card on the dashboard; "Hide the ad and close the report" hides the ad for visitors and closes the report', async ({ page }) => {
    await page.goto('/job/job-1');
    await page.getByRole('button', { name: 'Report this ad' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByRole('dialog').getByText('Thank you. We will check this ad.')).toBeVisible();

    await login(page, 'admin');
    await page.goto('/admin');
    const card = page.locator('.count-card', { hasText: 'Reports to check' });
    await expect(card.locator('.count-number')).toHaveText('1');
    await expect(card).toHaveClass(/is-todo/);
    await expect(page.locator('.count-card', { hasText: 'Account deletions' }).locator('.count-number')).toHaveText('0');
    await card.click();
    await expect(page).toHaveURL(/\/admin\/reports/);
    const row = page.locator('tbody tr', { hasText: 'Plumbers Needed' }).first();
    await row.getByRole('button', { name: 'Hide the ad and close the report' }).click();
    await expect(page.getByText('Saved.').first()).toBeVisible();
    await expect(page.locator('tbody tr', { hasText: 'Plumbers Needed' })).toHaveCount(0); // the open list is empty now

    await page.goto('/admin');
    await expect(page.locator('.count-card', { hasText: 'Reports to check' }).locator('.count-number')).toHaveText('0');
    await page.goto('/jobs');
    await expect(page.getByRole('heading', { name: 'Heavy Driver' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Plumbers Needed' })).toHaveCount(0);
  });
});
