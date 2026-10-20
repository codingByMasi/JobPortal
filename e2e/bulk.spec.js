// Browser tests: ready-made rejection reasons (ads and licenses) and approving several ads at once.
import { expect, test } from '@playwright/test';
import { fillAd, login, logout, picture } from './helpers.js';

async function postAds(page, titles) {
  await login(page, 'employer');
  for (const title of titles) {
    await page.goto('/dashboard/new');
    await fillAd(page, title);
    await page.locator('input[type=file]').setInputFiles(picture());
    await expect(page.getByText(/ad\.png \(\d+ KB\)/)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Send for approval' }).click();
    await expect(page.getByText('Your ad was sent to us. It goes live after we approve it.')).toBeVisible();
  }
  await logout(page);
}

test.describe('ready-made reasons and bulk approve', () => {
  test('a ready-made reason fills the box, can be edited, and is what the employer is told', async ({ page }) => {
    await postAds(page, ['E2E Reason Ad']);
    await login(page, 'admin');
    await page.goto('/admin/jobs');
    await page.getByRole('searchbox').fill('E2E Reason Ad');
    await page.locator('tbody tr').first().getByRole('button', { name: 'Reject' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Reject the ad' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'The ad asks job seekers for money.' }).click();
    await expect(dialog.getByLabel('Reason (the employer will read this)')).toHaveValue('The ad asks job seekers for money.');
    await dialog.getByLabel('Reason (the employer will read this)').fill('The ad asks job seekers for money. Please remove the fee.');
    await dialog.getByRole('button', { name: 'Reject the ad' }).click();
    await expect(page.locator('tbody tr').first().getByText(/Rejected/).first()).toBeVisible();
    expect(decodeURIComponent(await page.getByRole('link', { name: 'Tell the employer on WhatsApp' }).getAttribute('href'))).toContain('Please remove the fee.');
  });

  test('a ready-made reason works for a license too', async ({ page }) => {
    await login(page, 'otherEmployer');
    await page.goto('/dashboard/new');
    await page.getByLabel('License number').fill('LIC-B-001');
    await page.locator('input[type=file]').setInputFiles(picture());
    await expect(page.getByText(/ad\.png \(\d+ KB\)/)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Send license' }).click();
    await expect(page.getByText('License LIC-B-001 sent. We are checking it.')).toBeVisible();
    await logout(page);
    await login(page, 'admin');
    await page.goto('/admin/employers');
    await page.locator('tbody tr', { hasText: 'Desert Transport' }).getByRole('button', { name: 'Check license' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'License not accepted' }).click();
    await dialog.getByRole('button', { name: 'The license has expired.' }).click();
    await expect(dialog.getByLabel('Reason (the employer will read this)')).toHaveValue('The license has expired.');
    await dialog.getByRole('button', { name: 'Reject license' }).click();
    await expect(page.getByText('License rejected.')).toBeVisible();
    await logout(page);
    await login(page, 'otherEmployer');
    await page.goto('/dashboard/new');
    await expect(page.getByText(/The license has expired\./)).toBeVisible();
  });

  test('approve several ads at once for the same days; only the ticked ones go live', async ({ page }) => {
    await postAds(page, ['E2E Bulk One', 'E2E Bulk Two', 'E2E Bulk Three']);
    await login(page, 'admin');
    await page.goto('/admin/jobs?status=paid_pending_review');
    await page.getByRole('searchbox').fill('E2E Bulk');
    await expect(page.locator('tbody tr')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Approve selected (0)' })).toBeDisabled();
    await page.getByRole('checkbox', { name: 'Select the ad: E2E Bulk One' }).check();
    await page.getByRole('checkbox', { name: 'Select the ad: E2E Bulk Three' }).check();
    await page.getByRole('button', { name: 'Approve selected (2)' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/2 ads will go live now/)).toBeVisible();
    await dialog.getByLabel('Days live').fill('0');
    await expect(dialog.getByRole('button', { name: 'Approve 2 ads' })).toBeDisabled();
    await dialog.getByLabel('Days live').fill('7');
    await dialog.getByRole('button', { name: 'Approve 2 ads' }).click();
    await expect(page.getByText('2 ads approved.')).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(1); // only the unticked one still waits
    await expect(page.locator('tbody tr').first()).toContainText('E2E Bulk Two');
    await logout(page);
    await page.goto('/jobs');
    await expect(page.getByRole('link', { name: /View: E2E Bulk One/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /View: E2E Bulk Three/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /View: E2E Bulk Two/ })).toHaveCount(0);
  });

  test('select all and select none; the boxes appear only on the "waiting for approval" list', async ({ page }) => {
    await postAds(page, ['E2E Pick One', 'E2E Pick Two']);
    await login(page, 'admin');
    await page.goto('/admin/jobs');
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await page.goto('/admin/jobs?status=paid_pending_review');
    await page.getByRole('searchbox').fill('E2E Pick');
    await page.getByRole('button', { name: 'Select all' }).click();
    await expect(page.getByRole('button', { name: /Approve selected \(2\)/ })).toBeEnabled();
    await page.getByRole('button', { name: 'Select none' }).click();
    await expect(page.getByRole('button', { name: 'Approve selected (0)' })).toBeDisabled();
  });
});
