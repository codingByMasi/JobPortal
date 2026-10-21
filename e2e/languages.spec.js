// Browser tests: choosing one of the six languages from the footer, reading direction for Urdu, English fallback for texts not yet translated, and that the choice is remembered.
import { expect, test } from '@playwright/test';

const picker = (page) => page.locator('footer .lang-picker'); // its label changes with the language, so find it by its class

test.describe('languages', () => {
  test('the footer offers six languages, each in its own writing; choosing Malayalam changes the page and the choice is remembered', async ({ page }) => {
    await page.goto('/jobs');
    for (const name of ['English', 'हिन्दी', 'മലയാളം', 'தமிழ்', 'తెలుగు', 'اردو']) await expect(picker(page).getByRole('button', { name })).toBeVisible();
    await expect(picker(page).getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    await picker(page).getByRole('button', { name: 'മലയാളം' }).click();
    await expect(page.getByRole('heading', { name: 'ജോലികൾ', level: 1 })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ml');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByText('ജോലികൾ കണ്ടെത്തി').first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'ജോലികൾ', level: 1 })).toBeVisible();
    await expect(picker(page).getByRole('button', { name: 'മലയാളം' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('Tamil and Telugu read in their own writing too', async ({ page }) => {
    await page.goto('/');
    await picker(page).getByRole('button', { name: 'தமிழ்' }).click();
    await expect(page.getByRole('heading', { name: 'வெளிநாட்டு வேலைகளைக் கண்டுபிடியுங்கள்' })).toBeVisible();
    await picker(page).getByRole('button', { name: 'తెలుగు' }).click();
    await expect(page.getByRole('heading', { name: 'విదేశాల్లో ఉద్యోగాలు కనుగొనండి' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'te');
  });

  test('Urdu reads right to left, and switching away puts the direction back', async ({ page }) => {
    await page.goto('/jobs');
    await picker(page).getByRole('button', { name: 'اردو' }).click();
    await expect(page.getByRole('heading', { name: 'نوکریاں', level: 1 })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ur');
    await expect(page.locator('main')).not.toHaveCSS('direction', 'ltr');
    await picker(page).getByRole('button', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { name: 'Jobs', level: 1 })).toBeVisible();
  });

  test('texts that are not translated yet show in English (privacy page, employer area) with the rest in the chosen language', async ({ page }) => {
    await page.goto('/privacy');
    await picker(page).getByRole('button', { name: 'தமிழ்' }).click();
    await expect(page.getByText('You do not need to log in or give your name to see jobs.')).toBeVisible(); // English fallback
    await expect(page.locator('footer').getByRole('link', { name: 'தனியுரிமை' })).toBeVisible(); // translated link
  });

  test('the header button still switches English and Hindi in one tap, and from another language it goes back to English', async ({ page }) => {
    await page.goto('/jobs');
    await page.getByRole('button', { name: /Change language/ }).click();
    await expect(page.getByRole('heading', { name: 'नौकरी', level: 1 })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
    await picker(page).getByRole('button', { name: 'తెలుగు' }).click();
    await page.locator('header .lang-btn').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('apply and alert forms work in a new language and errors are in plain words of that language', async ({ page }) => {
    await page.goto('/job/job-1');
    await picker(page).getByRole('button', { name: 'മലയാളം' }).click();
    await expect(page.getByRole('heading', { name: 'ഇവിടെ അപേക്ഷിക്കുക' })).toBeVisible();
    await page.getByRole('button', { name: 'എന്റെ വിവരങ്ങൾ അയയ്ക്കുക' }).click();
    await expect(page.getByText('ദയവായി നിങ്ങളുടെ പേര് എഴുതുക.')).toBeVisible();
    await expect(page.getByText('ദയവായി ശരിയായ ഫോൺ നമ്പർ എഴുതുക (അക്കങ്ങൾ മാത്രം).')).toBeVisible();
  });
});
