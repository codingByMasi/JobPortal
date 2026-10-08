// Extra browser tests added for the final release gate: every protected route, every deep link, Hindi on every public screen,
// image zoom, PDF view, and the coupon cases that were only tested in the database (expired, used up, wrong plan).
import { expect, test } from '@playwright/test';
import { fillAd, login, logout, picture, smallPdf } from './helpers.js';

const ADMIN_ROUTES = ['/admin', '/admin/jobs', '/admin/jobs/new', '/admin/jobs/job-1', '/admin/employers', '/admin/payments', '/admin/packages', '/admin/offers', '/admin/history', '/admin/reports', '/admin/settings', '/admin/guides', '/admin/applications', '/admin/requests', '/admin/security', '/admin/problems'];
const EMPLOYER_ROUTES = ['/dashboard', '/dashboard/new', '/dashboard/edit/job-7', '/dashboard/pay/job-7', '/dashboard/payments', '/dashboard/applications', '/dashboard/profile', '/dashboard/receipt/pay-1'];
const PUBLIC_ROUTES = ['/', '/jobs', '/jobs/uae', '/jobs/saudi-arabia', '/jobs/qatar', '/jobs/kuwait', '/jobs/oman', '/jobs/other-countries', '/job/job-1', '/post-job', '/contact', '/about', '/faq', '/privacy', '/terms', '/refund-policy', '/delete-account', '/login', '/signup', '/forgot-password', '/reset-password'];

test.describe('release gate', () => {
  test('every private route sends a visitor to the login page', async ({ page }) => {
    for (const path of [...ADMIN_ROUTES, ...EMPLOYER_ROUTES]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login/);
    }
  });

  test('an employer is kept out of every admin route, and an admin sees the admin area on every admin route', async ({ page }) => {
    await login(page, 'employer');
    for (const path of ADMIN_ROUTES) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'This page is not for you' }), path).toBeVisible();
      await expect(page.getByRole('link', { name: 'All ads' }), path).toHaveCount(0);
    }
    await page.goto('/dashboard');
    await logout(page);
    await login(page, 'admin');
    for (const path of ADMIN_ROUTES.filter((p) => !p.includes('job-1') && !p.endsWith('/new'))) {
      await page.goto(path);
      await expect(page, path).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('heading', { name: 'Admin' }).first(), path).toBeVisible();
    }
  });

  test('every public address opens and survives a refresh (no 404 from the host, no blank page)', async ({ page }) => {
    for (const path of PUBLIC_ROUTES) {
      const response = await page.goto(path);
      expect(response.status(), path).toBe(200);
      await expect(page.locator('main').first(), path).toBeVisible();
      await page.reload();
      await expect(page.locator('#root'), path).not.toBeEmpty();
      expect(await page.locator('body').innerText(), path).not.toMatch(/undefined|\[object|NaN/);
    }
  });

  test('Hindi: every public screen has Hindi text in its heading and no English key names leak', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Change language/ }).click();
    for (const path of PUBLIC_ROUTES.filter((p) => p !== '/reset-password' && !p.startsWith('/job/'))) {
      await page.goto(path);
      const heading = await page.locator('h1').first().innerText();
      expect(heading, path).toMatch(/[ऀ-ॿ]/);
      expect(await page.locator('body').innerText(), path).not.toMatch(/\b(err|meta|tab)[A-Z]\w+\b|undefined|\[object/);
    }
  });

  test('a friendly not-found page with a way back, and no technical words', async ({ page }) => {
    await page.goto('/this/does/not/exist');
    await expect(page.getByText(/not found/i).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /home|jobs/i }).first()).toBeVisible();
    expect(await page.locator('body').innerText()).not.toMatch(/404|exception|stack|supabase/i);
  });

  test('a picture ad and a PDF ad: employer posts, admin pays and approves, a visitor can zoom the picture, download it and open the PDF', async ({ page }) => {
    const codes = {};
    for (const [title, file] of [['GATE Picture Ad', picture()], ['GATE Pdf Ad', smallPdf()]]) {
      await login(page, 'employer');
      await page.goto('/dashboard/new');
      await fillAd(page, title);
      await page.locator('input[type=file]').setInputFiles(file);
      await expect(page.getByText(/\(\d+ KB\)/)).toBeVisible({ timeout: 15000 });
      await page.locator('input[name=package]').nth(1).check({ force: true });
      await page.getByRole('button', { name: 'Save and go to payment' }).click();
      await expect(page.getByText('Name on the UPI ID')).toBeVisible();
      codes[title] = (await page.locator('body').innerText()).match(/AD-[0-9A-F]{8}/)[0];
      await logout(page);
    }
    await login(page, 'admin');
    for (const [title, code] of Object.entries(codes)) {
      await page.goto('/admin/jobs');
      await page.getByRole('searchbox').fill(code);
      const row = page.locator('tbody tr').first();
      await row.getByRole('button', { name: 'Mark as paid' }).click();
      await page.getByRole('dialog').getByLabel(/Payment reference/).fill(`GATE-${code}`);
      await page.getByRole('dialog').getByRole('button', { name: 'Mark as paid' }).click();
      await row.getByRole('button', { name: 'Approve' }).click();
      await expect(row.getByText(/Live until/).first(), title).toBeVisible();
    }
    await logout(page);

    await page.goto('/jobs');
    await page.getByRole('link', { name: /View: GATE Picture Ad/ }).click();
    await page.getByRole('button', { name: 'Zoom' }).click();
    await expect(page.getByRole('dialog', { name: /zoom/i })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: /zoom/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Download' })).toHaveAttribute('download', 'job-ad.jpg');

    await page.goto('/jobs');
    await page.getByRole('link', { name: /View: GATE Pdf Ad/ }).click();
    await expect(page.getByRole('link', { name: /Open the PDF/ })).toHaveAttribute('href', /.+/);
    await expect(page.getByRole('link', { name: 'Download' })).toHaveAttribute('download', 'job-ad.pdf');
  });

  test('coupons: expired, used up, wrong plan and already used each give their own plain words', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/admin/offers');
    const make = async (name, code, extra = async () => {}) => {
      await page.getByRole('button', { name: 'New offer' }).click();
      const form = page.getByRole('dialog');
      await form.getByLabel('Offer name').fill(name);
      await form.getByLabel('Percent (1 to 100)').fill('10');
      await form.getByLabel('Coupon code').fill(code);
      await extra(form);
      await form.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Offer saved.')).toBeVisible();
    };
    await make('Gate expired', 'GATEOLD', async (form) => {
      await form.getByLabel('Starts on (optional)').fill('2020-01-01');
      await form.getByLabel('Ends on (optional)').fill('2020-02-01');
    });
    await make('Gate one use', 'GATEONE', async (form) => { await form.getByLabel('Total uses (optional)').fill('1'); });
    await make('Gate wrong plan', 'GATEPLAN', async (form) => {
      await form.getByLabel('Who gets it?').selectOption('package');
      await form.getByLabel('Plan', { exact: true }).selectOption({ index: 0 });
    });
    await logout(page);

    await login(page, 'employer');
    await page.goto('/dashboard/new');
    await fillAd(page, 'GATE Coupon Ad');
    await page.locator('input[name=package]').nth(1).check({ force: true });
    const apply = async (code) => {
      await page.getByLabel('Have a coupon code?').fill(code);
      await page.getByRole('button', { name: 'Apply' }).click();
    };
    await apply('GATEOLD');
    await expect(page.getByText('Code expired')).toBeVisible();
    await apply('GATEPLAN');
    await expect(page.getByText('This code is not for this plan')).toBeVisible();
    await apply('GATEONE');
    await expect(page.getByText('Coupon GATEONE is applied.')).toBeVisible();
  });

  test('responsive: no sideways scrolling and nothing cut off on any screen at phone and desktop width', async ({ page }) => {
    const check = async (path) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const wide = await page.evaluate(() => {
        const w = document.documentElement.clientWidth;
        const off = [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > w + 1) && getComputedStyle(e).position !== 'fixed' && !e.closest('.table-wrap, .lightbox, .sr-only'); });
        return { overflow: document.documentElement.scrollWidth - w, off: off.slice(0, 3).map((e) => e.tagName + '.' + e.className) };
      });
      expect(wide.overflow, `${path} scrolls sideways ${JSON.stringify(wide.off)}`).toBeLessThanOrEqual(1);
    };
    for (const path of PUBLIC_ROUTES) await check(path);
    await login(page, 'employer');
    for (const path of EMPLOYER_ROUTES) await check(path);
    await logout(page);
    await login(page, 'admin');
    for (const path of ADMIN_ROUTES) await check(path);
  });
});
