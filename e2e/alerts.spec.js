// Browser tests: job alerts (sign up from the jobs list, confirm and unsubscribe links) and that they work in Hindi.
import { expect, test } from '@playwright/test';

const alertsInDemo = (page) => page.evaluate(() => (JSON.parse(localStorage.getItem('jobs-abroad-demo-v2')) || {}).job_alerts || []);

test.describe('job alerts', () => {
  test('a visitor signs up for the country and work they chose, then the confirm and unsubscribe links work', async ({ page }) => {
    await page.goto('/jobs?country=uae&category=plumber');
    await page.getByRole('button', { name: 'Get job alerts' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Alerts for: UAE, Plumber/)).toBeVisible();
    await dialog.getByLabel('Your email').fill('not an email');
    await dialog.getByRole('button', { name: 'Send me alerts' }).click(); // the browser stops a wrong email before it is sent
    await expect(dialog.getByText('We sent you an email')).toHaveCount(0);
    await dialog.getByLabel('Your email').fill('Seeker@Example.com');
    await dialog.getByRole('button', { name: 'Send me alerts' }).click();
    await expect(dialog.getByText(/We sent you an email/)).toBeVisible();
    const [alert] = await alertsInDemo(page);
    expect(alert).toMatchObject({ email: 'seeker@example.com', country: 'uae', category: 'plumber', confirmed_at: null });

    await page.goto(`/alerts/confirm?token=${alert.token}`);
    await expect(page.getByRole('heading', { name: 'Confirm your alerts', level: 1 })).toBeVisible();
    await expect(page.getByText('You will now get an email when a new ad matches.')).toBeVisible();
    expect((await alertsInDemo(page))[0].confirmed_at).not.toBeNull();

    await page.goto(`/alerts/unsubscribe?token=${alert.token}`);
    await expect(page.getByText('We removed your email. You will get no more alerts.')).toBeVisible();
    expect(await alertsInDemo(page)).toHaveLength(0);
    await page.goto(`/alerts/unsubscribe?token=${alert.token}`);
    await expect(page.getByText(/We could not find this email/)).toBeVisible();
  });

  test('a broken or missing link says so plainly, and the pages are kept out of search engines', async ({ page }) => {
    await page.goto('/alerts/confirm?token=abc');
    await expect(page.getByText(/This link does not work any more/)).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await page.goto('/alerts/unsubscribe');
    await expect(page.getByText(/We could not find this email/)).toBeVisible();
  });

  test('the whole flow is in Hindi too', async ({ page }) => {
    await page.goto('/jobs');
    await page.getByRole('button', { name: /Change language/ }).click();
    await page.getByRole('button', { name: 'नौकरी की सूचना पाएँ' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/सूचना: सभी नए विज्ञापन/)).toBeVisible();
    await dialog.getByLabel('आपका ईमेल').fill('hindi@example.com');
    await dialog.getByRole('button', { name: 'मुझे सूचना भेजें' }).click();
    await expect(dialog.getByText(/हमने आपको ईमेल भेजा है/)).toBeVisible();
    expect((await alertsInDemo(page))[0].lang).toBe('hi');
  });
});
