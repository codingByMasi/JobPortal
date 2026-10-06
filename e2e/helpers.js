// Small helpers for the browser tests: login, and files made on the fly (a big noisy picture, PDFs, wrong types).
import { randomBytes } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';

export const ACCOUNTS = {
  employer: { email: 'recruiter@example.com', password: 'recruiter123' },
  otherEmployer: { email: 'other@example.com', password: 'other12345' },
  admin: { email: 'admin@example.com', password: 'admin123' },
};

/** Logs in through the real login screen and waits for the account area. */
export async function login(page, who) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ACCOUNTS[who].email);
  await page.getByLabel('Password').fill(ACCOUNTS[who].password);
  await page.locator('form').getByRole('button', { name: 'Login' }).click();
  await page.waitForURL(/\/(dashboard|admin)/);
}

export async function logout(page) {
  await page.getByRole('button', { name: 'Log out' }).first().click();
  await page.waitForURL((url) => !/\/(dashboard|admin)/.test(url.pathname) || /login/.test(url.pathname), { timeout: 5000 }).catch(() => {});
}

const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(4 + body.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body) >>> 0, 4 + body.length);
  return out;
};

/** A real PNG of random noise (does not compress): big on purpose, to test that pictures are shrunk. */
export function noisyPng(width = 1400, height = 900) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  const row = width * 3 + 1;
  const raw = randomBytes(row * height);
  for (let y = 0; y < height; y += 1) raw[y * row] = 0; // filter byte: none
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0))]);
}

const PDF_HEAD = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
export const smallPdf = () => ({ name: 'offer.pdf', mimeType: 'application/pdf', buffer: PDF_HEAD });
export const bigPdf = () => ({ name: 'huge.pdf', mimeType: 'application/pdf', buffer: Buffer.concat([PDF_HEAD, Buffer.alloc(2.5 * 1024 * 1024, 32)]) });
export const picture = () => ({ name: 'ad.png', mimeType: 'image/png', buffer: noisyPng() });
export const wrongTypes = () => [
  { name: 'virus.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ not really') },
  { name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') },
  { name: 'page.html', mimeType: 'text/html', buffer: Buffer.from('<script>alert(1)</script>') },
];

/** Fills the new-ad form (without the file) with plain valid values. */
export async function fillAd(page, title = 'E2E Welders needed') {
  await page.getByLabel('Job title').fill(title);
  await page.getByLabel(/WhatsApp number/).fill('9822211100');
  await page.getByLabel(/More about the job/).fill('Salary 1800 AED, food and room free');
}
