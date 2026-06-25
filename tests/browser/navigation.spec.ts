import { test, expect } from '@playwright/test';
import { gotoSection, openApp } from '../helpers/browser';

const sections = [
  'SQL Manager',
  'NoSQL Manager',
  'Query',
  'Import',
  'Export',
  'Backup / Snapshot',
  'Reports',
  'Search',
  'Schema Diff',
  'Key Gen',
];

test('every primary section is reachable and can return to Dashboard', async ({ page }) => {
  await openApp(page);

  for (const section of sections) {
    await gotoSection(page, section);
    await expect(page.locator('.nav-item.active')).toContainText(section);
    await expect(page.getByRole('button', { name: /Dashboard/i }).first()).toBeVisible();
    await page.getByRole('button', { name: /Dashboard/i }).first().click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  }
});
