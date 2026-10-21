// Browser tests: help articles, the CV maker (screen and print), the install bar, and the admin activity list; all in English and Hindi where it matters.
import { expect, test } from '@playwright/test';
import { login } from './helpers.js';

test.describe('help articles', () => {
  test('the list shows every article; one opens with its sections, a way back and the not-legal-advice note', async ({ page }) => {
    await page.goto('/articles');
    await expect(page.getByRole('heading', { name: 'Help articles', level: 1 })).toBeVisible();
    for (const title of ['Papers to keep ready for a job abroad', 'How to read a job offer', 'Before you pay anyone', 'A CV that gets replies']) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
    }
    await page.locator('.agency-card', { hasText: 'Before you pay anyone' }).getByRole('link', { name: 'Read this article' }).click();
    await expect(page).toHaveURL(/\/articles\/before-you-pay$/);
    await expect(page.getByRole('heading', { name: 'Before you pay anyone', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Always get a receipt' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open the government eMigrate website' })).toHaveAttribute('href', 'https://emigrate.gov.in');
    await expect(page.getByText(/not legal advice/)).toBeVisible();
    await page.getByRole('link', { name: 'All articles' }).click();
    await expect(page).toHaveURL(/\/articles$/);
  });

  test('an unknown article says so; the footer links work; the articles are in Hindi', async ({ page }) => {
    await page.goto('/articles/no-such-article');
    await expect(page.getByText('We could not find this article.')).toBeVisible();
    await page.goto('/');
    await page.locator('footer').getByRole('link', { name: 'Help articles' }).click();
    await expect(page).toHaveURL(/\/articles$/);
    await page.getByRole('button', { name: /Change language/ }).click();
    await expect(page.getByRole('heading', { name: 'मदद के लेख', level: 1 })).toBeVisible();
    await page.goto('/articles/cv-tips');
    await expect(page.getByRole('heading', { name: 'ऐसा CV जिस पर जवाब आए', level: 1 })).toBeVisible();
  });
});

test.describe('CV maker', () => {
  test('typing builds the CV; the print button works only when there is something to print; printing shows only the CV', async ({ page }) => {
    await page.goto('/cv');
    await expect(page.getByRole('heading', { name: 'Free CV maker', level: 1 })).toBeVisible();
    await expect(page.getByText('Your CV appears here as you type.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeDisabled();

    await page.getByLabel('Full name').fill('Ravi Kumar');
    await page.getByLabel('Phone number').fill('9876543210');
    await page.getByLabel('Job you want').fill('Welder');
    await page.getByLabel('Job title').fill('Pipe welder');
    await page.getByLabel('Company and country').fill('Gulf Works, UAE');
    await page.getByLabel('Years or dates').fill('2019-2024');
    await page.getByLabel('Skills (separate with commas)').fill('welding, pipe fitting ,, driving');
    await page.getByRole('button', { name: 'Add another job' }).click();
    await page.getByLabel('Job title').nth(1).fill('Helper');
    await expect(page.getByRole('button', { name: 'Remove this job' })).toHaveCount(2);

    const sheet = page.locator('.cv-sheet');
    await expect(sheet.getByRole('heading', { name: 'Ravi Kumar' })).toBeVisible();
    await expect(sheet).toContainText('9876543210');
    await expect(sheet).toContainText('Looking for work as: Welder');
    await expect(sheet).toContainText('Pipe welder - Gulf Works, UAE (2019-2024)');
    await expect(sheet).toContainText('Helper');
    await expect(sheet).toContainText('welding, pipe fitting, driving'); // empty items are dropped
    await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeEnabled();

    await page.getByRole('button', { name: 'Remove this job' }).nth(1).click();
    await expect(sheet).not.toContainText('Helper');

    await page.emulateMedia({ media: 'print' }); // what the printed page looks like: the CV only
    await expect(sheet).toBeVisible();
    await expect(page.locator('.site-header')).toBeHidden();
    await expect(page.locator('footer')).toBeHidden();
    await expect(page.getByLabel('Full name')).toBeHidden();
  });

  test('typed text is shown as plain text (never as HTML) and the page is in Hindi too', async ({ page }) => {
    await page.goto('/cv');
    await page.getByLabel('Full name').fill('<img src=x onerror=alert(1)>');
    await expect(page.locator('.cv-sheet img')).toHaveCount(0);
    await expect(page.locator('.cv-sheet')).toContainText('<img src=x onerror=alert(1)>');
    await page.getByRole('button', { name: /Change language/ }).click();
    await expect(page.getByRole('heading', { name: 'मुफ़्त CV मेकर', level: 1 })).toBeVisible();
    await expect(page.getByLabel('पूरा नाम')).toBeVisible();
    await expect(page.getByRole('button', { name: 'प्रिंट करें या PDF में सेव करें' })).toBeEnabled();
  });
});

test.describe('install bar', () => {
  const offer = (page) => page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = () => { window.__prompted = true; };
    e.userChoice = Promise.resolve({ outcome: 'dismissed' });
    window.dispatchEvent(e);
  });

  test('shows when the browser offers it; Install asks the browser; Not now hides it for a long time', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Install Jobs Abroad on your phone')).toHaveCount(0);
    await offer(page);
    await expect(page.getByText('Install Jobs Abroad on your phone')).toBeVisible();
    await page.getByRole('button', { name: 'Install' }).click();
    expect(await page.evaluate(() => window.__prompted)).toBe(true);
    await expect(page.getByText('Install Jobs Abroad on your phone')).toHaveCount(0);

    await page.reload();
    await offer(page);
    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByText('Install Jobs Abroad on your phone')).toHaveCount(0);
    await page.reload();
    await offer(page);
    await expect(page.getByText('Install Jobs Abroad on your phone')).toHaveCount(0); // said "not now": quiet for 30 days
  });
});

test.describe('admin activity', () => {
  test('hiding an ad is written in the activity list, with who and which ad; the filter works', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/admin/activity');
    await expect(page.getByText('Nothing here yet.')).toBeVisible();
    await page.goto('/admin/jobs');
    await page.getByRole('searchbox').fill('Plumbers Needed');
    await page.locator('tbody tr').first().getByRole('button', { name: 'Hide' }).click();
    await expect(page.locator('tbody tr').first().getByText('Hidden').first()).toBeVisible();

    await page.goto('/admin/activity');
    const row = page.locator('tbody tr').first();
    await expect(row).toContainText('Hid an ad');
    await expect(row.getByRole('link', { name: /^AD-/ })).toBeVisible();
    await page.getByLabel('What', { exact: true }).selectOption('approve_job');
    await expect(page.getByText('Nothing here yet.')).toBeVisible();
    await page.getByLabel('What', { exact: true }).selectOption('hide_job');
    await expect(page.locator('tbody tr').first()).toContainText('Hid an ad');
  });
});
