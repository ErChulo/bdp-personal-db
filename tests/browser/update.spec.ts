import { test, expect } from '@playwright/test';
import { openApp } from '../helpers/browser';

test('surfaces service-worker update messages and returns to current state', async ({ page }) => {
  await openApp(page);

  await page.evaluate(() => {
    navigator.serviceWorker.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'UPDATE_READY', buildId: 'test-build' },
      }),
    );
  });

  await expect(page.getByRole('button', { name: /apply ready update/i })).toBeVisible();
  await page.getByRole('button', { name: /apply ready update/i }).click();

  await page.evaluate(() => {
    navigator.serviceWorker.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'ACTIVATED', buildId: 'test-build' },
      }),
    );
  });

  await expect(page.getByRole('button', { name: /apply ready update/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /verify offline readiness/i })).toBeVisible();
});
