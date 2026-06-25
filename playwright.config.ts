import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://${host}:${port}`;
const systemChromium = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  outputDir: 'test-results/browser',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: {
      executablePath: existsSync(systemChromium) ? systemChromium : undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
  },
  webServer: {
    command: 'npm run build && npm run serve',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
    },
  ],
});
