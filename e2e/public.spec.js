// Browser tests for visitors: browse, filter, open an ad, apply, language, deep links, protected areas.
import { expect, test } from '@playwright/test';
import { login, logout } from './helpers.js';

test.describe('visitor', () => {
  test('home page loads with country and work buttons and no demo-data crash', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Find Jobs Abroad' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Saudi Arabia/ }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('jobs list shows only live ads, search and country filter work', async ({ page }) => {
    await page.goto('/jobs');
    await expect(page.getByRole('link', { name: /View: Plumbers Needed/ })).toBeVisible();
    for (const hidden of ['Site Helper', 'Kitchen Helper', 'Office Assistant', 'Driver wanted']) {
      await expect(page.getByText(hidden, { exact: true })).toHaveCount(0); // expired, unpaid, waiting, rejected
    }
    await page.getByRole('searchbox').fill('driver');
    await expect(page.getByRole('link', { name: /View: Heavy Driver/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /View: Plumbers Needed/ })).toHaveCount(0);
    await page.getByRole('searchbox').fill('');
    await page.getByRole('button', { name: 'Qatar' }).click();
    await expect(page.getByRole('link', { name: /View: Building Electrician/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /View: Plumbers Needed/ })).toHaveCount(0);
    await page.getByRole('searchbox').fill('zzzz-nothing');
    await expect(page.getByText('No jobs found').first()).toBeVisible();
  });

  test('open an ad: details, WhatsApp link with country code, safety notice, report link', async ({ page }) => {
    await page.goto('/jobs');
    await page.getByRole('link', { name: /View: Plumbers Needed/ }).click();
    await expect(page).toHaveURL(/\/job\/job-1$/);
    await expect(page.getByRole('heading', { name: 'Plumbers Needed' })).toBeVisible();
    const wa = await page.getByRole('link', { name: 'Apply on WhatsApp' }).getAttribute('href');
    expect(wa).toMatch(/^https:\/\/wa\.me\/919876543210/);
    await expect(page.getByText(/Do not pay anyone/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Report this ad' })).toBeVisible();
  });

  test('apply form: consent is needed, details are sent, the same phone cannot apply twice', async ({ page }) => {
    await page.goto('/job/job-1');
    const send = () => page.getByRole('button', { name: 'Send my details' }).click();
    await page.getByLabel('Your name').fill('E2E Ramesh');
    await page.getByLabel('Your phone number').fill('98111 22233');
    await send();
    await expect(page.getByText(/tick the box/i)).toBeVisible();
    await page.getByLabel(/I agree that my name/).check();
    await send();
    await expect(page.getByText(/Your details were sent/)).toBeVisible();
    await page.locator('.apply-done button').click();
    await page.getByLabel('Your name').fill('E2E Ramesh again');
    await page.getByLabel('Your phone number').fill('+91 98111-22233');
    await page.getByLabel(/I agree that my name/).check();
    await send();
    await expect(page.getByText(/already applied/i)).toBeVisible();
  });

  test('apply form: a bad phone number and an empty name are refused with plain words', async ({ page }) => {
    await page.goto('/job/job-1');
    await page.getByLabel(/I agree that my name/).check();
    await page.getByRole('button', { name: 'Send my details' }).click();
    await expect(page.locator('.field-error').first()).toBeVisible();
    await page.getByLabel('Your name').fill('X');
    await page.getByLabel('Your phone number').fill('abc');
    await page.getByRole('button', { name: 'Send my details' }).click();
    await expect(page.locator('.field-error').first()).toBeVisible();
    await expect(page.getByText(/exception|undefined|code/i)).toHaveCount(0);
  });

  test('language switch: Hindi and back, remembered after a reload', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Change language/ }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
    await expect(page.getByText('देश', { exact: false }).first()).toBeVisible();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
    await page.getByRole('button', { name: /भाषा|Change language|English/ }).first().click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('refreshing a deep link does not 404 (/job/:id, /jobs, /post-job, an unknown address)', async ({ page }) => {
    for (const path of ['/job/job-1', '/jobs?country=uae', '/post-job', '/no/such/page']) {
      const response = await page.goto(path);
      expect(response.status(), path).toBe(200);
      await page.reload();
      await expect(page.locator('#root')).not.toBeEmpty();
    }
    await expect(page.getByText(/Page not found|not found/i).first()).toBeVisible();
  });

  test('private areas send a visitor to the login page', async ({ page }) => {
    for (const path of ['/dashboard', '/dashboard/new', '/admin', '/admin/jobs', '/admin/payments']) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login/);
    }
  });

  test('an employer cannot open admin screens; an admin can; logout works', async ({ page }) => {
    await login(page, 'employer');
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'This page is not for you' })).toBeVisible();
    await page.goto('/admin/payments');
    await expect(page.getByRole('heading', { name: 'This page is not for you' })).toBeVisible();
    await page.goto('/dashboard');
    await logout(page);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
    await login(page, 'admin');
    await page.goto('/admin/jobs');
    await expect(page.getByRole('heading', { name: 'This page is not for you' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('link', { name: 'All ads' }).first()).toBeVisible();
  });

  test('forgot password gives the same friendly answer for any email', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill('nobody-here@example.com');
    await page.getByRole('button', { name: 'Send me the link' }).click();
    await expect(page.getByText(/If this email has an account/)).toBeVisible();
  });
});
