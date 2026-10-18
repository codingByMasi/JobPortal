// Browser tests: the admin's own QR picture (upload, show, remove) and the employer's payment proof (send, admin checks, reject, send again, mark paid).
import { expect, test } from '@playwright/test';
import { login, logout, picture } from './helpers.js';

test.describe('payment QR and proof', () => {
  test('QR picture: the admin uploads it, the payment screen shows it, removing it brings back the generated code', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/admin/settings');
    await expect(page.getByText('No picture uploaded')).toBeVisible();
    await page.locator('input[type=file]').setInputFiles(picture());
    await page.getByRole('button', { name: 'Upload QR picture' }).click();
    await expect(page.getByText('QR picture saved.')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('img', { name: 'Our payment QR code' })).toBeVisible();
    await logout(page);

    await login(page, 'employer');
    await page.goto('/dashboard/pay/job-7');
    const shopQr = page.getByRole('img', { name: 'Our payment QR code' });
    await expect(shopQr).toBeVisible();
    expect(await shopQr.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(page.getByRole('img', { name: /QR code to pay/ })).toHaveCount(0);
    await logout(page);

    await login(page, 'admin');
    await page.goto('/admin/settings');
    await page.getByRole('button', { name: 'Remove QR picture' }).click();
    await expect(page.getByText('QR picture removed.')).toBeVisible();
    await expect(page.getByText('No picture uploaded')).toBeVisible();
    await logout(page);

    await login(page, 'employer');
    await page.goto('/dashboard/pay/job-7');
    await expect(page.getByRole('img', { name: /QR code to pay/ })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Our payment QR code' })).toHaveCount(0);
  });

  test('QR picture: a PDF is refused', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/admin/settings');
    await page.locator('input[type=file]').setInputFiles({ name: 'qr.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') });
    await expect(page.getByRole('button', { name: 'Upload QR picture' })).toHaveCount(0);
    await expect(page.locator('.msg-error')).toBeVisible();
  });

  test('proof: the employer sends it, the admin sees it and rejects it, the employer sends again, the admin marks the ad paid', async ({ page }) => {
    await login(page, 'employer');
    await page.goto('/dashboard/pay/job-7');
    // a bad reference and a missing screenshot are refused on the screen
    await page.getByRole('button', { name: 'Send proof' }).click();
    await expect(page.getByText('Please enter the reference number and choose the screenshot.')).toBeVisible();
    await page.getByLabel('Payment reference number (UTR)').fill('12');
    await page.locator('.proof-box input[type=file]').setInputFiles(picture());
    await expect(page.getByText(/ad\.png \(\d+ KB\)/)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Send proof' }).click();
    await expect(page.getByText(/reference number looks wrong/)).toBeVisible();
    // a good one
    await page.getByLabel('Payment reference number (UTR)').fill('4021 5678 90ab');
    await page.getByRole('button', { name: 'Send proof' }).click();
    await expect(page.getByText('Proof sent (reference 4021567890AB). We are checking it.')).toBeVisible();
    await logout(page);

    await login(page, 'admin');
    await page.goto('/admin/jobs?status=pending_payment');
    const row = page.getByRole('row').filter({ has: page.getByText('Proof sent', { exact: true }) }).first();
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Mark as paid' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('4021567890AB').first()).toBeVisible();
    await expect(dialog.getByLabel('Payment reference number (UTR)')).toHaveValue('4021567890AB'); // filled in from the proof
    await dialog.getByRole('button', { name: 'Open screenshot' }).click();
    await expect(dialog.getByRole('img', { name: 'Payment proof from the employer' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Money not found' }).click();
    await dialog.getByLabel('Reason (the employer will read this)').fill('Amount is less than the price');
    await dialog.getByRole('button', { name: 'Reject proof' }).click();
    await expect(page.getByText('Proof rejected.')).toBeVisible();
    await logout(page);

    await login(page, 'employer');
    await page.goto('/dashboard/pay/job-7');
    await expect(page.getByText(/We could not find your payment. Amount is less than the price/)).toBeVisible();
    await page.getByLabel('Payment reference number (UTR)').fill('4021567890AC');
    await page.locator('.proof-box input[type=file]').setInputFiles(picture());
    await expect(page.getByText(/ad\.png \(\d+ KB\)/)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Send proof again' }).click();
    await expect(page.getByText('Proof sent (reference 4021567890AC). We are checking it.')).toBeVisible();
    await logout(page);

    await login(page, 'admin');
    await page.goto('/admin/jobs?status=pending_payment');
    const again = page.getByRole('row').filter({ has: page.getByText('Proof sent', { exact: true }) }).first();
    await again.getByRole('button', { name: 'Mark as paid' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Mark as paid' }).click();
    await expect(page.getByText(/marked as paid|Payment saved|paid/i).first()).toBeVisible();
    await page.goto('/admin/jobs?status=paid_pending_review');
    await expect(page.getByText('Proof sent', { exact: true })).toHaveCount(0);
  });
});
