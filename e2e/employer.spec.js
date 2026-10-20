// Browser tests for employers: signup, login errors, posting ads (picture and PDF; free, they wait for approval), file rules, edit, delete.
import { expect, test } from '@playwright/test';
import { ACCOUNTS, bigPdf, fillAd, login, picture, smallPdf, wrongTypes } from './helpers.js';

const unique = () => `e2e${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function signup(page, email = `${unique()}@example.com`) {
  await page.goto('/signup');
  await page.getByLabel('Company name').fill('E2E Manpower');
  await page.getByLabel('Phone number').fill('9822211100');
  await page.getByLabel('Registration number').fill('B-1234/DEL/2020');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('strongpass1');
  await page.getByLabel(/I agree to the employer rules/).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Hello, E2E Manpower' })).toBeVisible();
  return email;
}

test.describe('employer', () => {
  test('signup: plain messages for empty form, short password, missing tick; then a good signup', async ({ page }) => {
    await page.goto('/signup');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('.field-error, .msg-error').first()).toBeVisible();
    await expect(page.getByText(/tick the box/i)).toBeVisible();
    await page.getByLabel('Company name').fill('E2E Manpower');
    await page.getByLabel('Phone number').fill('9822211100');
    await page.getByLabel('Email').fill(`${unique()}@example.com`);
    await page.getByLabel('Password').fill('short');
    await page.getByLabel(/I agree to the employer rules/).check();
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('.field-error', { hasText: /8 letters/ })).toBeVisible();
    await signup(page);
    await expect(page.getByText(/not verified yet/)).toBeVisible();
    await expect(page.getByText(/no ads yet/i)).toBeVisible();
  });

  test('signup with an email that is already used is refused with plain words', async ({ page }) => {
    const email = await signup(page);
    await page.getByRole('button', { name: 'Log out' }).click();
    await page.goto('/signup');
    await page.getByLabel('Company name').fill('Copy Co');
    await page.getByLabel('Phone number').fill('9822211100');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('strongpass1');
    await page.getByLabel(/I agree to the employer rules/).check();
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText(/already/i).first()).toBeVisible();
  });

  test('login: wrong password gives a plain message; right password opens the dashboard; logout closes it', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(ACCOUNTS.employer.email);
    await page.getByLabel('Password').fill('wrong-password');
    await page.locator('form').getByRole('button', { name: 'Login' }).click();
    await expect(page.getByText(/not correct/i)).toBeVisible();
    await login(page, 'employer');
    await expect(page.getByRole('heading', { name: /Hello/ })).toBeVisible();
    await page.getByRole('button', { name: 'Log out' }).click();
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('post an ad with a big picture: it is shrunk and sent for approval, with no package or price on the form', async ({ page }) => {
    await login(page, 'employer');
    await page.goto('/dashboard/new');
    await fillAd(page);
    await page.locator('input[type=file]').setInputFiles(picture());
    await expect(page.getByText(/ad\.png \(\d+ KB\)/)).toBeVisible({ timeout: 15000 });
    const kb = Number((await page.getByText(/ad\.png \(\d+ KB\)/).textContent()).match(/\((\d+) KB\)/)[1]);
    expect(kb).toBeLessThanOrEqual(400);
    await expect(page.locator('input[name=package]')).toHaveCount(0); // employers never choose a plan
    await expect(page.getByLabel('Have a coupon code?')).toHaveCount(0);
    await page.getByRole('button', { name: 'Send for approval' }).click();
    await expect(page.getByText('Your ad was sent to us. It goes live after we approve it.')).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard$/);
    const ad = page.locator('.ad-row', { hasText: 'E2E Welders needed' }).first();
    await expect(ad.getByText('Waiting for approval').first()).toBeVisible();
    expect(await page.locator('body').innerText()).not.toMatch(/Pay now|UPI|₹|price|coupon/i); // no payment buttons or prices on the employer's page
  });

  test('post an ad with a PDF', async ({ page }) => {
    await login(page, 'employer');
    await page.goto('/dashboard/new');
    await fillAd(page, 'E2E PDF ad');
    await page.locator('input[type=file]').setInputFiles(smallPdf());
    await expect(page.getByText(/offer\.pdf/)).toBeVisible();
    await page.getByRole('button', { name: 'Send for approval' }).click();
    await expect(page.getByText('Your ad was sent to us. It goes live after we approve it.')).toBeVisible();
  });

  test('wrong file types and a PDF over 2 MB are refused in plain words', async ({ page }) => {
    await login(page, 'employer');
    await page.goto('/dashboard/new');
    for (const file of wrongTypes()) {
      await page.locator('input[type=file]').setInputFiles(file);
      await expect(page.getByText(/choose a picture/i), file.name).toBeVisible();
    }
    await page.locator('input[type=file]').setInputFiles(bigPdf());
    await expect(page.getByText(/too big/i)).toBeVisible();
  });

  test('saving without a file or a valid WhatsApp number is refused', async ({ page }) => {
    await login(page, 'employer');
    await page.goto('/dashboard/new');
    await page.getByLabel('Job title').fill('No file ad');
    await page.getByLabel(/WhatsApp number/).fill('123');
    await page.getByRole('button', { name: 'Send for approval' }).click();
    await expect(page.locator('.field-error, .has-error').first()).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/new/);
  });

  test('an older ad that still waits for payment can be edited; a waiting or rejected ad can be withdrawn (after a question); a live ad cannot be deleted', async ({ page }) => {
    await login(page, 'employer');
    await page.goto('/dashboard');
    const kitchen = page.locator('.ad-row', { hasText: 'Kitchen Helper' });
    await expect(kitchen.getByRole('link', { name: 'Edit' })).toBeVisible();
    await kitchen.getByRole('link', { name: 'Edit' }).click();
    await page.getByLabel('Job title').fill('Kitchen Helper (edited)');
    await page.locator('input[type=file]').setInputFiles(picture()); // the sample ad has no file yet, and an ad needs one
    await expect(page.getByText(/ad\.png \(\d+ KB\)/)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Kitchen Helper (edited)').first()).toBeVisible();
    const live = page.locator('.ad-row', { hasText: 'Plumbers Needed' });
    await expect(live.getByRole('button', { name: 'Delete' })).toHaveCount(0);
    await expect(live.getByRole('link', { name: 'Edit' })).toHaveCount(0);
    const waiting = page.locator('.ad-row', { hasText: 'Office Assistant' }); // waiting for approval
    await expect(waiting.getByRole('button', { name: 'Delete' })).toHaveCount(1);
    await expect(waiting.getByRole('button', { name: 'Ask us to change this' })).toHaveCount(0); // while it waits they edit it themselves
    await waiting.getByRole('link', { name: 'Edit' }).click();
    await page.getByLabel('Job title').fill('Office Assistant (better title)');
    await page.locator('input[type=file]').setInputFiles(picture()); // the sample ad has no file yet, and an ad needs one
    await expect(page.getByText(/ad\.png \(\d+ KB\)/)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Office Assistant (better title)').first()).toBeVisible();
    await expect(page.locator('.ad-row', { hasText: 'Office Assistant (better title)' }).getByText('Waiting for approval').first()).toBeVisible(); // still waiting, not live
    const edited = page.locator('.ad-row', { hasText: 'Kitchen Helper (edited)' });
    await edited.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Yes, delete' }).click();
    await expect(page.getByText('Kitchen Helper (edited)')).toHaveCount(0);
  });

  test('an approved ad cannot be edited, but the employer can ask for a change (3 open at most)', async ({ page }) => {
    await login(page, 'employer');
    await page.goto('/dashboard');
    const live = page.locator('.ad-row', { hasText: 'AC Technician' });
    for (const text of ['First change', 'Second change']) {
      await live.getByRole('button', { name: 'Ask us to change this' }).click();
      await page.getByRole('dialog').getByLabel('Your message').fill(text);
      await page.getByRole('dialog').getByRole('button', { name: 'Send request' }).click();
      await expect(page.getByText('Request sent')).toBeVisible();
    }
    await live.getByRole('button', { name: 'Ask us to change this' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByRole('dialog').getByText(/at least 3 letters/)).toBeVisible();
    await page.getByRole('dialog').getByLabel('Your message').fill('Third change');
    await page.getByRole('dialog').getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByText('Request sent')).toBeVisible();
    await live.getByRole('button', { name: 'Ask us to change this' }).click();
    await page.getByRole('dialog').getByLabel('Your message').fill('Fourth change');
    await page.getByRole('dialog').getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByRole('dialog').getByText(/3 requests/)).toBeVisible();
  });

  test('applicants are hidden from an unverified employer (only a count) and shown to a verified one', async ({ page }) => {
    await login(page, 'otherEmployer');
    await page.goto('/dashboard/applications');
    await expect(page.getByText(/after we verify your company/)).toBeVisible();
    await expect(page.getByText('Ramesh Kumar')).toHaveCount(0);
    await page.getByRole('button', { name: 'Log out' }).click();
    await login(page, 'employer');
    await page.goto('/dashboard/applications');
    await expect(page.getByText('Ramesh Kumar')).toBeVisible();
  });

  test('the employer details page, and no payment tabs or pages for employers', async ({ page }) => {
    await login(page, 'employer');
    await expect(page.getByRole('link', { name: /Payments/ })).toHaveCount(0);
    await page.goto('/dashboard/payments');
    await expect(page.getByText(/not found/i).first()).toBeVisible();
    await page.goto('/dashboard/profile');
    await expect(page.getByLabel('Company name')).toHaveValue('Gulf Works');
    // the emails about my account and ads: on by default, can be turned off and stay off
    const emails = page.getByLabel('Send me emails about my account and my ads');
    await expect(emails).toBeChecked();
    await emails.uncheck();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Your details are saved.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Send me emails about my account and my ads')).not.toBeChecked();
  });
});
