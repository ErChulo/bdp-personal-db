import { test, expect } from '@playwright/test';
import { openApp, gotoSection } from '../helpers/browser';

test('loads the production app shell and navigates visible sections', async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole('button', { name: /verify offline readiness/i })).toBeVisible();
  await gotoSection(page, 'SQL Manager');
  await expect(page.getByRole('heading', { name: 'SQL Manager' })).toBeVisible();
  await gotoSection(page, 'Dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
