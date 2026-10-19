// Browser tests: an unverified employer cannot post; they send a license, the admin checks it (rejects once, then verifies), and then they post for free.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { fillAd, login, logout, picture } from './helpers.js';

const employerRow = (page) => page.locator('tbody tr', { hasText: 'Desert Transport' });

test.describe('license verification and free posting', () => {
  test('an unverified employer sees the license form instead of the ad form', async ({ page }) => {
    await login(page, 'otherEmployer');
    await expect(page.getByText(/not verified yet/i).first()).toBeVisible();
    await page.goto('/dashboard/new');
    await expect(page.getByRole('heading', { name: 'Your company must be verified first' })).toBeVisible();
    await expect(page.getByLabel('Job title')).toHaveCount(0);
    await expect(page.getByLabel('License number')).toBeVisible();
    expect(await page.locator('body').innerText()).not.toMatch(/UPI|₹|price/i);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(axe.violations.map((v) => v.id)).toEqual([]);
  });

  test('the license goes to the admin: rejected once, sent again, verified; then the employer posts and the admin approves with days', async ({ page }) => {
    await login(page, 'otherEmployer');
    await page.goto('/dashboard/new');
    await page.getByRole('button', { name: 'Send license' }).click();
    await expect(page.getByText('Please enter the license number and choose the file.')).toBeVisible();
    await page.getByLabel('License number').fill('LIC-2024/77');
    await page.locator('input[type=file]').setInputFiles(picture());
    await expect(page.getByText(/ad\.png \(\d+ KB\)/)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Send license' }).click();
    await expect(page.getByText('License LIC-2024/77 sent. We are checking it.')).toBeVisible();
    await logout(page);

    // the admin cannot verify an employer who sent nothing, and can check one who did
    await login(page, 'admin');
    await page.goto('/admin/employers');
    await expect(employerRow(page).getByText('License sent: check it')).toBeVisible();
    await employerRow(page).getByRole('button', { name: 'Check license' }).click();
    let dialog = page.getByRole('dialog');
    await expect(dialog.getByText('LIC-2024/77')).toBeVisible();
    await dialog.getByRole('button', { name: 'Open license file' }).click();
    await expect(dialog.getByRole('img', { name: 'License sent by the employer' })).toBeVisible();
    await dialog.getByRole('button', { name: 'License not accepted' }).click();
    await expect(dialog.getByRole('button', { name: 'Reject license' })).toBeDisabled();
    await dialog.getByLabel('Reason (the employer will read this)').fill('The picture is not readable');
    await dialog.getByRole('button', { name: 'Reject license' }).click();
    await expect(page.getByText('License rejected.')).toBeVisible();
    await expect(employerRow(page).getByText('License rejected', { exact: true })).toBeVisible();
    await logout(page);

    // the employer reads the reason and sends again
    await login(page, 'otherEmployer');
    await page.goto('/dashboard/new');
    await expect(page.getByText(/We could not accept your license. The picture is not readable/)).toBeVisible();
    await page.getByLabel('License number').fill('LIC-2024/78');
    await page.locator('input[type=file]').setInputFiles(picture());
    await expect(page.getByText(/ad\.png \(\d+ KB\)/)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Send license again' }).click();
    await expect(page.getByText('License LIC-2024/78 sent. We are checking it.')).toBeVisible();
    await logout(page);

    // the admin verifies
    await login(page, 'admin');
    await page.goto('/admin/employers');
    await employerRow(page).getByRole('button', { name: 'Check license' }).click();
    dialog = page.getByRole('dialog');
    await expect(dialog.getByText('LIC-2024/78')).toBeVisible();
    await dialog.getByRole('button', { name: 'Verify this employer' }).click();
    await expect(employerRow(page).getByText('Verified').first()).toBeVisible();
    await logout(page);

    // now the employer can post, for free
    await login(page, 'otherEmployer');
    await page.goto('/dashboard/new');
    await fillAd(page, 'E2E Verified Ad');
    await page.locator('input[type=file]').setInputFiles(picture());
    await expect(page.getByText(/ad\.png \(\d+ KB\)/)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Send for approval' }).click();
    await expect(page.getByText('Your ad was sent to us. It goes live after we approve it.')).toBeVisible();
    await expect(page.locator('.ad-row', { hasText: 'E2E Verified Ad' }).getByText('Waiting for approval').first()).toBeVisible();
    await logout(page);

    // it is not public until the admin approves it, and the admin chooses the days
    await page.goto('/jobs');
    await expect(page.getByRole('link', { name: /View: E2E Verified Ad/ })).toHaveCount(0);
    await login(page, 'admin');
    await page.goto('/admin/jobs');
    await page.getByRole('searchbox').fill('E2E Verified Ad');
    await page.locator('tbody tr').first().getByRole('button', { name: 'Approve' }).click();
    await page.getByRole('dialog').getByLabel('Days live').fill('15');
    await page.getByRole('dialog').getByRole('button', { name: 'Approve and go live' }).click();
    await expect(page.locator('tbody tr').first().getByText(/Live until/).first()).toBeVisible();
    await logout(page);
    await page.goto('/jobs');
    await expect(page.getByRole('link', { name: /View: E2E Verified Ad/ })).toBeVisible();
  });

  test('the admin cannot verify an employer who sent no license', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/admin/employers');
    await expect(employerRow(page).getByText('No license sent')).toBeVisible();
    await expect(employerRow(page).getByRole('button', { name: 'Check license' })).toHaveCount(0);
  });
});
