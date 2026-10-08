// Browser tests for job facts, the fraud banner, reports, new pages, country pages, counters (migration 0020).
import { expect, test } from '@playwright/test';
import { fillAd, login, logout, picture } from './helpers.js';

test.describe('trust and facts', () => {
  test('home: fraud banner, real counters, a country button opens the country page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Never pay money for a job. Applying is free.')).toBeVisible();
    const counters = page.locator('.counters');
    await expect(counters).toContainText('Live ads');
    await expect(counters).toContainText('Verified employers');
    await expect(counters).toContainText('Applications sent');
    await page.getByRole('link', { name: /Saudi Arabia/ }).first().click();
    await expect(page).toHaveURL(/\/jobs\/saudi-arabia$/);
    await expect(page.getByRole('heading', { name: 'Jobs in Saudi Arabia' })).toBeVisible();
    await expect(page.getByRole('link', { name: /View: Heavy Driver/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /View: Plumbers Needed/ })).toHaveCount(0);
  });

  test('country page: an unknown country gives the not-found page; the title follows the country', async ({ page }) => {
    await page.goto('/jobs/uae');
    await expect(page).toHaveTitle(/Jobs in UAE/);
    await page.goto('/jobs/narnia');
    await expect(page.getByText(/not found|could not find/i).first()).toBeVisible();
  });

  test('list: salary and experience on the card, New tag, experience filter', async ({ page }) => {
    await page.goto('/jobs');
    const card = page.locator('article', { hasText: 'Plumbers Needed' });
    await expect(card).toContainText('AED 1,500 - 2,200 per month');
    await expect(card).toContainText('2 to 5 years');
    await expect(card.locator('.tag-new')).toHaveText('New');
    await page.getByRole('button', { name: '2 to 5 years' }).click();
    await expect(page.getByRole('link', { name: /View: Plumbers Needed/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /View: Heavy Driver/ })).toHaveCount(0);
  });

  test('ad page: facts, registration number with Verified, fraud banner, report form saves once', async ({ page }) => {
    await page.goto('/job/job-1');
    const facts = page.locator('.job-facts');
    await expect(facts).toContainText('AED 1,500 - 2,200 per month');
    await expect(facts).toContainText('Vacancies');
    await expect(facts).toContainText('Employment visa');
    await expect(page.getByText('Registration number: B-1234/DEL/2020')).toBeVisible();
    await expect(page.getByText('Never pay money for a job. Applying is free.')).toBeVisible();
    await page.getByRole('button', { name: 'Report this ad' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('What is wrong?').selectOption('asked_money');
    await dialog.getByRole('button', { name: 'Send report' }).click();
    await expect(dialog.getByText('Thank you. We will check this ad.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Report this ad' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByRole('dialog').getByText(/already reported/)).toBeVisible();
  });

  test('a report reaches the admin, who can close it; a deletion request too', async ({ page }) => {
    await page.goto('/job/job-2');
    await page.getByRole('button', { name: 'Report this ad' }).click();
    await page.getByRole('dialog').getByLabel('Tell us more (optional)').fill('They asked for 3000 rupees');
    await page.getByRole('dialog').getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByRole('dialog').getByText('Thank you. We will check this ad.')).toBeVisible();
    await page.goto('/delete-account');
    await page.getByLabel('Your email').fill('someone@example.com');
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByText('We have your request.')).toBeVisible();

    await login(page, 'admin');
    await page.goto('/admin/reports');
    await expect(page.getByText('They asked for 3000 rupees')).toBeVisible();
    await expect(page.getByText('someone@example.com')).toBeVisible();
    await page.getByRole('row', { name: /3000 rupees/ }).getByRole('button', { name: 'Mark done' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    await expect(page.getByText('They asked for 3000 rupees')).toHaveCount(0);
  });

  test('footer pages open and have their own titles; a bad email is refused on the deletion page', async ({ page }) => {
    await page.goto('/');
    for (const [link, title] of [['About us', /About us/], ['Questions and answers', /Questions and answers/], ['Refund policy', /Refund policy/], ['Delete my account', /Delete my account/]]) {
      await page.getByRole('link', { name: link }).first().click();
      await expect(page).toHaveTitle(title);
    }
    await page.getByLabel('Your email').fill('not-an-email');
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByText(/correct email/)).toBeVisible();
  });

  test('Hindi: the banner and the new pages read in Hindi', async ({ page }) => {
    await page.goto('/about');
    await page.getByRole('button', { name: /Change language/ }).click();
    await expect(page.getByRole('heading', { name: 'हमारे बारे में' })).toBeVisible();
    await page.goto('/');
    await expect(page.getByText('नौकरी के लिए कभी पैसे न दें')).toBeVisible();
  });

  test('employer form: salary order is checked in plain words, then an ad with facts is saved', async ({ page }) => {
    await login(page, 'employer');
    await page.goto('/dashboard/new');
    await fillAd(page, 'E2E Facts Ad');
    await page.locator('input[type=file]').setInputFiles(picture());
    await expect(page.getByText(/ad\.png \(\d+ KB\)/)).toBeVisible({ timeout: 15000 });
    await page.locator('input[name=package]').nth(1).check({ force: true });
    await page.getByLabel('Salary from (per month)').fill('3000');
    await page.getByLabel('Salary up to (per month)').fill('2000');
    await page.getByRole('button', { name: 'Save and go to payment' }).click();
    await expect(page.getByText(/must not be less/)).toBeVisible();
    await page.getByLabel('Salary up to (per month)').fill('3500');
    await page.getByLabel('Currency').selectOption('AED');
    await page.getByLabel('Experience needed').selectOption('1-2');
    await page.getByLabel('Number of vacancies').fill('5');
    await page.getByRole('button', { name: 'Save and go to payment' }).click();
    await expect(page.getByText('Name on the UPI ID')).toBeVisible();
    await logout(page);
  });
});

test.describe('guides are for admins only', () => {
  test('an admin reads and copies a guide; an employer and a visitor cannot open the page', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await page.goto('/admin/guides');
    await expect(page).toHaveURL(/\/login/);
    await login(page, 'employer');
    await page.goto('/admin/guides');
    await expect(page.getByRole('heading', { name: 'This page is not for you' })).toBeVisible();
    await page.goto('/dashboard');
    await logout(page);
    await login(page, 'admin');
    await page.goto('/admin/guides');
    await expect(page.getByRole('button', { name: 'Admin guide' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Every day' })).toBeVisible();
    await page.getByRole('button', { name: 'Employer guide' }).click();
    await expect(page.getByText('Demo copy for employers.')).toBeVisible();
    await page.getByRole('button', { name: 'Copy the text' }).click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  });
});
