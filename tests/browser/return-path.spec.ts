import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { openApp, gotoSection } from '../helpers/browser';

test('import keeps its draft state after returning from another section', async ({ page }, testInfo) => {
  await openApp(page);
  await gotoSection(page, 'SQL Manager');
  await gotoSection(page, 'Import');

  const filePath = testInfo.outputPath('import-draft.csv');
  await writeFile(filePath, 'name,score\nAda,99\n');

  await page.locator('#import-file').setInputFiles(filePath);
  await expect(page.getByText('detected format:')).toBeVisible();

  await page.locator('#import-newDbName').fill('scratch-db');
  await expect(page.locator('#import-newDbName')).toHaveValue('scratch-db');

  await page.getByRole('button', { name: /Back to SQL Manager/i }).click();
  await expect(page.getByRole('heading', { name: 'SQL Manager' })).toBeVisible();

  await gotoSection(page, 'Import');
  await expect(page.locator('#import-newDbName')).toHaveValue('scratch-db');
  await expect(page.getByText('detected format:')).toBeVisible();
});
