// Browser tests (Playwright): phone width (390 px) and desktop width (1440 px). Run with: npm run test:e2e
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60000,
  retries: 1, // one retry: a test that passes on the second try is reported as "flaky" so it is still visible
  workers: 3,
  fullyParallel: true,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e.json' }]],
  use: { baseURL: 'http://127.0.0.1:4189', screenshot: 'only-on-failure', trace: 'off' },
  projects: [
    { name: 'mobile-390', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
    { name: 'desktop-1440', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: { command: 'node scripts/e2e-server.mjs', url: 'http://127.0.0.1:4189', timeout: 180000, reuseExistingServer: true },
});
