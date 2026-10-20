// Browser tests: the share button on an ad, the verified agencies page, and the "how to check an agency" page.
import { expect, test } from '@playwright/test';

test.describe('trust pages and sharing', () => {
  test('an ad has a WhatsApp share button that opens the chat chooser with the ad link', async ({ page }) => {
    await page.goto('/job/job-1');
    const share = page.getByRole('link', { name: 'Share this job on WhatsApp' });
    await expect(share).toBeVisible();
    const href = await share.getAttribute('href');
    expect(href.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(href.split('?text=')[1])).toMatch(/\/job\/job-1$/);
    await expect(share).toHaveAttribute('target', '_blank');
    await expect(share).toHaveAttribute('rel', /noopener/);
  });

  test('verified agencies: a verified employer is listed with its registration number; an unverified one is not; no contact details', async ({ page }) => {
    await page.goto('/agencies');
    await expect(page.getByRole('heading', { name: 'Verified agencies', level: 1 })).toBeVisible();
    const card = page.locator('.agency-card', { hasText: 'Gulf Works' });
    await expect(card).toBeVisible();
    await expect(card.getByText('Registration number: B-1234/DEL/2020')).toBeVisible();
    await expect(card.getByText(/live ads?/)).toBeVisible();
    await expect(page.getByText('Desert Transport')).toHaveCount(0);
    const body = await page.locator('main').innerText();
    expect(body).not.toMatch(/@|\b9[0-9]{9}\b|recruiter@example/);
    await card.getByRole('link', { name: 'See their ads' }).click();
    await expect(page).toHaveURL(/\/jobs\?q=Gulf%20Works/);
  });

  test('how to check an agency: every step is there and the government website opens in a new tab', async ({ page }) => {
    await page.goto('/check-agency');
    await expect(page.getByRole('heading', { name: 'How to check a recruitment agency', level: 1 })).toBeVisible();
    for (const h of ['Ask for the registration number', 'Check the number on the government website', 'Get the job offer in writing', 'Never pay before you check', 'Signs of a fake offer', 'What we check here', 'If something goes wrong']) {
      await expect(page.getByRole('heading', { name: h })).toBeVisible();
    }
    const link = page.getByRole('link', { name: 'Open the government eMigrate website' });
    await expect(link).toHaveAttribute('href', 'https://emigrate.gov.in');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
  });

  test('the footer links to both pages, and both work in Hindi', async ({ page }) => {
    await page.goto('/');
    await page.locator('footer').getByRole('link', { name: 'How to check an agency' }).click();
    await expect(page).toHaveURL(/\/check-agency$/);
    await page.locator('footer').getByRole('link', { name: 'Verified agencies' }).click();
    await expect(page).toHaveURL(/\/agencies$/);
    await page.getByRole('button', { name: /Change language/ }).click();
    await expect(page.getByRole('heading', { name: 'वेरिफ़ाइड एजेंसियां', level: 1 })).toBeVisible();
    await page.goto('/check-agency');
    await expect(page.getByRole('heading', { name: 'भर्ती एजेंसी कैसे जाँचें', level: 1 })).toBeVisible();
  });
});
