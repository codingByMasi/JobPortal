// Browser tests for the admin: approve with days, reject (and the employer fixing it), hide, show, extend, delete, refund, block, plans, requests, CSV.
import { expect, test } from '@playwright/test';
import { fillAd, login, logout, picture } from './helpers.js';

/** A verified employer (the demo employer) posts an ad for free; it waits for approval. Returns the title to search for. */
async function postAd(page, title) {
  await login(page, 'employer');
  await page.goto('/dashboard/new');
  await fillAd(page, title);
  await page.locator('input[type=file]').setInputFiles(picture());
  await expect(page.getByText(/ad\.png \(\d+ KB\)/)).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Send for approval' }).click();
  await expect(page.getByText('Your ad was sent to us. It goes live after we approve it.')).toBeVisible();
  await page.getByRole('button', { name: 'Log out' }).click();
  return title;
}

async function adminFind(page, title) {
  await login(page, 'admin');
  await page.goto('/admin/jobs');
  await page.getByRole('searchbox').fill(title);
}

const row = (page) => page.locator('tbody tr').first();

test.describe('admin', () => {
  test('full life of an ad: it waits for approval, reject with reason, employer fixes, approve with days, hide, show, an ended ad is extended and is live again, delete', async ({ page }) => {
    const code = await postAd(page, 'E2E Life Ad');
    await adminFind(page, code);
    await expect(row(page).getByText('Waiting for approval').first()).toBeVisible();
    await expect(row(page).getByRole('button', { name: 'Mark as paid' })).toHaveCount(0); // nothing to pay

    await row(page).getByRole('button', { name: 'View ad' }).click();
    await expect(page.getByRole('dialog').locator('img.ad-image')).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/Salary 1800 AED/)).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

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
    const approve = page.getByRole('dialog');
    await approve.getByLabel('Days live').fill('0');
    await expect(approve.getByRole('button', { name: 'Approve and go live' })).toBeDisabled();
    await approve.getByLabel('Days live').fill('20');
    await approve.getByRole('button', { name: 'Approve and go live' }).click();
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

    // the days end: the ad is no longer shown; the admin extends it and it is live again
    await row(page).getByRole('link', { name: 'Edit' }).click();
    await page.getByLabel(/Ends on|Expires/i).fill('2020-01-01');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.waitForURL(/\/admin\/jobs$/); // wait until the change is saved
    await page.getByRole('searchbox').fill(code);
    await expect(row(page).getByText('Expired').first()).toBeVisible();
    await page.getByRole('button', { name: 'Log out' }).click();
    await page.goto('/jobs');
    await expect(page.getByRole('link', { name: /View: E2E Life Ad/ })).toHaveCount(0);
    await adminFind(page, code);
    await row(page).getByRole('button', { name: 'More days' }).click();
    await page.getByRole('dialog').getByLabel('Reason').fill('Employer asked to run it again');
    await page.getByRole('dialog').getByRole('button', { name: 'Add days' }).click();
    await expect(page.getByText('Days were added to the ad.')).toBeVisible();
    await expect(row(page).getByText(/Live until/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Log out' }).click();
    await page.goto('/jobs');
    await expect(page.getByRole('link', { name: /View: E2E Life Ad/ })).toBeVisible();
    await adminFind(page, code);
    await row(page).getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Yes, delete' }).click();
    await expect(page.getByText('E2E Life Ad')).toHaveCount(0);
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

  test('offers: the admin makes a coupon; it shows in the list and in the history', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/admin/offers');
    await page.getByRole('button', { name: 'New offer' }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel('Offer name').fill('E2E twenty');
    await form.getByLabel('Percent (1 to 100)').fill('20');
    await form.getByLabel('Coupon code').fill('E2E20');
    await expect(form.getByText(/20% off every plan/)).toBeVisible();
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Offer saved.')).toBeVisible();
    await expect(page.getByRole('row', { name: /E2E twenty/ })).toContainText('Active');
    await page.goto('/admin/history');
    await expect(page.getByText(/E2E twenty/).first()).toBeVisible();
  });

  test('one ad: more days (reason needed), featured on and off, free ad (note needed)', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/admin/jobs?status=live');
    const live = page.locator('tbody tr').first();
    await live.getByRole('button', { name: 'More days' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Add days' })).toBeDisabled();
    await dialog.getByLabel('Reason').fill('site was down');
    await dialog.getByRole('button', { name: 'Add days' }).click();
    await expect(page.getByText('Days were added to the ad.')).toBeVisible();
    await page.locator('tbody tr').first().getByRole('button', { name: /Make featured|Remove featured/ }).click();
    await expect(page.getByText('The featured setting was saved.')).toBeVisible();

    await page.goto('/admin/jobs?status=pending_payment');
    await page.locator('tbody tr').first().getByRole('button', { name: 'Free ad' }).click();
    const free = page.getByRole('dialog');
    await expect(free.getByRole('button', { name: 'Give free ad' })).toBeDisabled();
    await free.getByLabel('Note').fill('launch gift');
    await free.getByRole('button', { name: 'Give free ad' }).click();
    await expect(page.getByText(/The ad is free/)).toBeVisible();
  });

  test('plans: move down and back, add a badge; the history shows the change', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/admin/packages');
    const names = async () => page.locator('tbody tr td:nth-child(2) strong').allInnerTexts();
    await expect(page.locator('tbody tr').first()).toBeVisible();
    const before = await names();
    await page.getByRole('button', { name: `Move down: ${before[0]}` }).click();
    await expect.poll(names).toEqual([before[1], before[0], ...before.slice(2)]);
    await page.getByRole('button', { name: 'Edit' }).first().click();
    await page.getByRole('dialog').getByLabel('Badge (optional)').fill('Best value');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Package saved.')).toBeVisible();
    await page.goto('/admin/history');
    await expect(page.getByText(/badge_text/).first()).toBeVisible();
  });

  test('settings: wrong values are refused in plain words; the WhatsApp number follows on the site', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/admin/settings');
    await page.getByLabel('Contact email').fill('not-an-email');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Please correct the boxes marked in red.')).toBeVisible();
    await page.getByLabel('Contact email').fill('hello@e2eshop.example');
    await page.getByLabel('WhatsApp number').fill('98123 45678');
    await page.getByLabel('Company name').fill('E2E Services Pvt Ltd');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Settings saved.')).toBeVisible();
    await logout(page);

    await page.goto('/');
    await expect(page.getByRole('link', { name: /WhatsApp us/ }).first()).toHaveAttribute('href', /919812345678/);
  });
});
