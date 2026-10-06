// Browser tests for the admin: approve, reject (and the employer fixing it), hide, show, delete, mark paid, refund, block, packages, requests, CSV.
import { expect, test } from '@playwright/test';
import { fillAd, login, picture } from './helpers.js';

/** An employer posts an ad (as the demo employer); returns its payment code. */
async function postAd(page, title) {
  await login(page, 'employer');
  await page.goto('/dashboard/new');
  await fillAd(page, title);
  await page.locator('input[type=file]').setInputFiles(picture());
  await expect(page.getByText(/ad\.png \(\d+ KB\)/)).toBeVisible({ timeout: 15000 });
  await page.locator('input[name=package]').nth(1).check({ force: true });
  await page.getByRole('button', { name: 'Save and go to payment' }).click();
  await expect(page.getByText('Name on the UPI ID')).toBeVisible();
  const code = (await page.locator('body').innerText()).match(/AD-[0-9A-F]{8}/)[0];
  await page.getByRole('button', { name: 'Log out' }).click();
  return code;
}

async function adminFind(page, code) {
  await login(page, 'admin');
  await page.goto('/admin/jobs');
  await page.getByRole('searchbox').fill(code);
}

const row = (page) => page.locator('tbody tr').first();

test.describe('admin', () => {
  test('full life of an ad: mark paid (reference needed), reject with reason, employer fixes, approve, hide, show, visitors see it, delete', async ({ page }) => {
    const code = await postAd(page, 'E2E Life Ad');
    await adminFind(page, code);
    await expect(page.getByText('First ad of this employer').or(page.getByText('E2E Life Ad'))).toBeVisible();

    await row(page).getByRole('button', { name: 'View ad' }).click();
    await expect(page.getByRole('dialog').locator('img.ad-image')).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/Salary 1800 AED/)).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

    await row(page).getByRole('button', { name: 'Mark as paid' }).click();
    const paid = page.getByRole('dialog');
    await expect(paid.getByRole('button', { name: 'Mark as paid' })).toBeDisabled();
    await paid.getByLabel(/Payment reference/).fill(`E2E-UTR-${code}`);
    await paid.getByRole('button', { name: 'Mark as paid' }).click();
    await expect(row(page).getByText('Waiting for approval').first()).toBeVisible();

    await row(page).getByRole('button', { name: 'Reject' }).click();
    const reject = page.getByRole('dialog');
    await expect(reject.getByRole('button', { name: 'Reject the ad' })).toBeDisabled();
    await reject.locator('textarea').fill('Please add the company name.');
    await reject.getByRole('button', { name: 'Reject the ad' }).click();
    await expect(row(page).getByText(/Rejected/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Log out' }).click();

    await login(page, 'employer');
    const mine = page.locator('.ad-row', { hasText: 'E2E Life Ad' });
    await expect(mine.getByText(/Please add the company name/)).toBeVisible();
    await mine.getByRole('link', { name: 'Fix and send again' }).click();
    await page.getByLabel('Company name').fill('E2E Company');
    await page.getByRole('button', { name: 'Save and send for review' }).click();
    await expect(page.locator('.ad-row', { hasText: 'E2E Life Ad' }).getByText('Waiting for approval').first()).toBeVisible();
    await page.getByRole('button', { name: 'Log out' }).click();

    await adminFind(page, code);
    await row(page).getByRole('button', { name: 'Approve' }).click();
    await expect(row(page).getByText(/Live until/).first()).toBeVisible();
    await expect(row(page).getByRole('button', { name: 'Approve' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Log out' }).click();
    await page.goto('/jobs');
    await expect(page.getByRole('link', { name: /View: E2E Life Ad/ })).toBeVisible();
    await page.getByRole('link', { name: /View: E2E Life Ad/ }).click();
    await expect(page.getByText(/Salary 1800 AED/)).toBeVisible();
    const wa = await page.getByRole('link', { name: 'Apply on WhatsApp' }).getAttribute('href');
    expect(wa).toContain('919822211100');

    await adminFind(page, code);
    await row(page).getByRole('button', { name: 'Hide' }).click();
    await expect(row(page).getByText('Hidden').first()).toBeVisible();
    await page.getByRole('button', { name: 'Log out' }).click();
    await page.goto('/jobs');
    await expect(page.getByRole('link', { name: /View: E2E Life Ad/ })).toHaveCount(0);

    await adminFind(page, code);
    await row(page).getByRole('button', { name: 'Show' }).click();
    await expect(row(page).getByText(/Live until/).first()).toBeVisible();
    await row(page).getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Yes, delete' }).click();
    await expect(page.getByText('E2E Life Ad')).toHaveCount(0);
  });

  test('the same payment reference cannot be used for a second ad', async ({ page }) => {
    const first = await postAd(page, 'E2E Ref Ad One');
    const second = await postAd(page, 'E2E Ref Ad Two');
    await adminFind(page, first);
    await row(page).getByRole('button', { name: 'Mark as paid' }).click();
    await page.getByRole('dialog').getByLabel(/Payment reference/).fill('E2E-SAME-REF');
    await page.getByRole('dialog').getByRole('button', { name: 'Mark as paid' }).click();
    await expect(row(page).getByText('Waiting for approval').first()).toBeVisible();
    await page.getByRole('searchbox').fill(second);
    await row(page).getByRole('button', { name: 'Mark as paid' }).click();
    await page.getByRole('dialog').getByLabel(/Payment reference/).fill('e2e-same-ref');
    await page.getByRole('dialog').getByRole('button', { name: 'Mark as paid' }).click();
    await expect(page.getByText(/already used|already has a payment/)).toBeVisible();
    await expect(row(page).getByText('Waiting for payment').first()).toBeVisible();
  });

  test('refund can hide the ad; blocking an employer hides their live ads', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/admin/payments');
    const paid = page.locator('tbody tr', { hasText: 'Plumbers Needed' });
    await paid.getByRole('button', { name: 'Mark refunded' }).click();
    await page.getByRole('dialog').getByLabel('Also hide this ad').check();
    await page.getByRole('dialog').getByRole('button', { name: 'Mark refunded' }).click();
    await expect(page.getByText('Marked as refunded.')).toBeVisible();
    await page.goto('/admin/employers');
    await page.locator('tbody tr', { hasText: 'Desert Transport' }).getByRole('button', { name: 'Block' }).click();
    await expect(page.locator('tbody tr', { hasText: 'Desert Transport' }).getByText(/Blocked/i).first()).toBeVisible();
    await page.getByRole('button', { name: 'Log out' }).click();
    await page.goto('/jobs');
    await expect(page.getByRole('link', { name: /View: Plumbers Needed/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /View: Heavy Driver/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /View: Building Electrician/ })).toBeVisible();
  });

  test('edit a package price: the public Post-a-job page follows; an ad made earlier keeps its old price when paid', async ({ page }) => {
    const code = await postAd(page, 'E2E Price Ad');
    await login(page, 'admin');
    await page.goto('/admin/packages');
    await page.locator('tbody tr', { hasText: '30 Days' }).filter({ hasNotText: 'Featured' }).getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('dialog').getByLabel(/Price/).fill('999');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Package saved.')).toBeVisible();
    await page.getByRole('button', { name: 'Log out' }).click();
    await page.goto('/post-job');
    await expect(page.getByText('₹999')).toBeVisible();
    await adminFind(page, code);
    await row(page).getByRole('button', { name: 'Mark as paid' }).click();
    await expect(page.getByRole('dialog').getByText(/₹799/)).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/₹999/)).toHaveCount(0);
  });

  test('change requests can be closed; payments and applications download as spreadsheets', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/admin/requests');
    await expect(page.getByText('Please change the WhatsApp number')).toBeVisible();
    await page.getByRole('button', { name: 'Mark done' }).first().click();
    await expect(page.getByText('The request is updated.')).toBeVisible();
    await page.goto('/admin/payments');
    const [payments] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download as spreadsheet' }).click()]);
    expect(payments.suggestedFilename()).toMatch(/^payments-\d{4}-\d{2}-\d{2}\.csv$/);
    await page.goto('/admin/applications');
    await expect(page.getByText('Ramesh Kumar').first()).toBeVisible();
  });

  test('Problems page: crash list and the unused-files tool', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/admin/problems');
    await expect(page.getByRole('heading', { name: 'Unused picture files' })).toBeVisible();
    await page.getByRole('button', { name: 'Look for unused files' }).click();
    await expect(page.getByText('No unused files. Everything in storage belongs to an ad.')).toBeVisible();
  });

  test('refresh works on every admin address (no 404, still logged in)', async ({ page }) => {
    await login(page, 'admin');
    for (const path of ['/admin', '/admin/jobs', '/admin/employers', '/admin/payments', '/admin/packages', '/admin/applications', '/admin/requests', '/admin/security', '/admin/problems']) {
      await page.goto(path);
      await page.reload();
      await expect(page.getByRole('link', { name: 'All ads' }).first(), path).toBeVisible();
    }
  });

  test('offers, coupon codes and discounts', async () => {
    test.fixme(true, 'NOT BUILT: the project has no offers, coupon codes, discounts or bonus days (see docs/14-release-readiness-report.md).');
  });
});
