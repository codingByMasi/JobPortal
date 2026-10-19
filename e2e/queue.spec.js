// Browser tests: the admin work queue on the dashboard (licenses, ending soon, ended) and the employer's "ends soon" note with a ready-typed request for more days.
import { expect, test } from '@playwright/test';
import { fillAd, login, logout, picture } from './helpers.js';

const card = (page, name) => page.locator('.count-card', { hasText: name });

async function postAndApprove(page, title, days) {
  await login(page, 'employer');
  await page.goto('/dashboard/new');
  await fillAd(page, title);
  await page.locator('input[type=file]').setInputFiles(picture());
  await expect(page.getByText(/ad\.png \(\d+ KB\)/)).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Send for approval' }).click();
  await expect(page.getByText('Your ad was sent to us. It goes live after we approve it.')).toBeVisible();
  await logout(page);
  await login(page, 'admin');
  await page.goto('/admin/jobs');
  await page.getByRole('searchbox').fill(title);
  await page.locator('tbody tr').first().getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('dialog').getByLabel('Days live').fill(String(days));
  await page.getByRole('dialog').getByRole('button', { name: 'Approve and go live' }).click();
  await expect(page.locator('tbody tr').first().getByText(/Live until/).first()).toBeVisible();
}

test.describe('work queue', () => {
  test('the dashboard shows what needs the admin; ending soon and ended lists open from it; more days brings an ended ad back', async ({ page }) => {
    await postAndApprove(page, 'E2E Ending Ad', 2);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'What needs you today' })).toBeVisible();
    const number = Number(await card(page, 'Ending in 3 days').locator('.count-number').innerText());
    expect(number).toBeGreaterThanOrEqual(1); // the sample data has an ad ending soon too
    await card(page, 'Ending in 3 days').click();
    await expect(page.getByText(/Showing live ads that end in the next 3 days/)).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(number); // the list matches the number on the card
    await expect(page.locator('tbody tr', { hasText: 'E2E Ending Ad' })).toHaveCount(1);
    await page.getByRole('button', { name: 'Show all' }).click();
    await expect(page.getByText(/Showing live ads that end/)).toHaveCount(0);

    // the days run out
    await page.getByRole('searchbox').fill('E2E Ending Ad');
    await page.locator('tbody tr').first().getByRole('link', { name: 'Edit' }).click();
    await page.getByLabel('Ends on').fill('2020-01-01');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.waitForURL(/\/admin\/jobs$/);
    await page.goto('/admin');
    await expect(card(page, 'Ended in the last 30 days')).toBeVisible();
    // an ad that ended years ago is not in the "last 30 days" list
    await card(page, 'Ended in the last 30 days').click();
    await expect(page.getByText(/Showing ads that ended in the last 30 days/)).toBeVisible();
    await expect(page.getByText('E2E Ending Ad')).toHaveCount(0);
    await logout(page);
  });

  test('the employer sees the note and asks for more days with a ready message; the admin then sees the request', async ({ page }) => {
    await postAndApprove(page, 'E2E Note Ad', 2);
    await logout(page);
    await login(page, 'employer');
    const mine = page.locator('.ad-row', { hasText: 'E2E Note Ad' });
    await expect(mine.getByText(/Ends in [12] days?\. Ask us to add days to keep it live\./)).toBeVisible();
    await mine.getByRole('button', { name: 'Ask for more days' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Your message')).toHaveValue('Please add more days to this ad.');
    await dialog.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByText('Request sent')).toBeVisible();
    await logout(page);
    await login(page, 'admin');
    await page.goto('/admin/requests');
    await expect(page.getByText('Please add more days to this ad.').first()).toBeVisible();
  });

  test('a license waiting for a check shows on the dashboard; its list shows only that employer and the way back', async ({ page }) => {
    await login(page, 'otherEmployer');
    await page.goto('/dashboard/new');
    await page.getByLabel('License number').fill('LIC-Q-001');
    await page.locator('input[type=file]').setInputFiles(picture());
    await expect(page.getByText(/ad\.png \(\d+ KB\)/)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Send license' }).click();
    await expect(page.getByText('License LIC-Q-001 sent. We are checking it.')).toBeVisible();
    await logout(page);
    await login(page, 'admin');
    await page.goto('/admin');
    await expect(card(page, 'Licenses to check').locator('.count-number')).toHaveText('1');
    await card(page, 'Licenses to check').click();
    await expect(page.getByText('Showing employers whose license waits for your check.')).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr').first()).toContainText('Desert Transport');
    await page.getByRole('button', { name: 'Show all' }).click();
    await expect(page.locator('tbody tr')).not.toHaveCount(1); // everyone is back
    await expect(page.locator('tbody tr').first()).toContainText('Desert Transport'); // waiting licenses sort first
  });

  test('the dashboard no longer asks for UPI details or shows money', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/admin');
    expect(await page.locator('main').innerText()).not.toMatch(/UPI|Money this month|₹/);
    await page.goto('/admin/settings');
    await expect(page.getByLabel('UPI ID for payments')).toHaveCount(0);
  });
});
