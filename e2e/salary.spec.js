// Browser tests: the salary filter on the jobs list (currency, lowest salary, order) and that it works in Hindi.
import { expect, test } from '@playwright/test';

test.describe('salary filter', () => {
  test('choosing a currency keeps only ads in that currency, and a lowest salary narrows them', async ({ page }) => {
    await page.goto('/jobs');
    const salary = page.getByRole('group', { name: 'Salary' });
    await expect(page.getByLabel(/Lowest salary per month/)).toHaveCount(0); // appears only after a currency is chosen
    await expect(page.getByRole('heading', { name: 'Heavy Driver' })).toBeVisible();
    await salary.getByRole('button', { name: 'AED' }).click();
    await expect(page).toHaveURL(/currency=AED/);
    await expect(page.getByRole('heading', { name: 'Plumbers Needed' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Heavy Driver' })).toHaveCount(0); // that ad is in SAR
    await page.getByLabel('Lowest salary per month (AED)').fill('2000');
    await expect(page.getByRole('heading', { name: 'Plumbers Needed' })).toBeVisible(); // highest figure is 2200
    await page.getByLabel('Lowest salary per month (AED)').fill('2300');
    await expect(page.getByRole('heading', { name: 'Plumbers Needed' })).toHaveCount(0);
    await salary.getByRole('button', { name: 'Any salary' }).click();
    await expect(page).not.toHaveURL(/currency|min=/);
    await expect(page.getByRole('heading', { name: 'Plumbers Needed' })).toBeVisible();
  });

  test('the order choice is shared in the address, and the whole filter works in Hindi', async ({ page }) => {
    await page.goto('/jobs?currency=SAR&sort=pay');
    await expect(page.getByRole('button', { name: 'Highest salary first' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: /Change language/ }).click();
    await expect(page.getByRole('group', { name: 'वेतन' })).toBeVisible();
    await expect(page.getByLabel('महीने का सबसे कम वेतन (SAR)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'सबसे ज़्यादा वेतन पहले' })).toHaveAttribute('aria-pressed', 'true');
  });
});
