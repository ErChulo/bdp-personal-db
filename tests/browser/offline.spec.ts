import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from '@playwright/test';
import { createSqlDatabase, expectSqlResult, gotoSection, openApp, runSql } from '../helpers/browser';

test('reloads and keeps local data available after the browser goes offline', async ({ page, context }) => {
  await openApp(page);

  await createSqlDatabase(
    page,
    'offline-demo',
    'CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT);',
  );
  await runSql(page, "INSERT INTO notes (id, body) VALUES (1, 'cached');");

  await page.getByRole('button', { name: /verify offline readiness/i }).click();
  await expect(page.locator('.status-bar')).toContainText(/offline ready|offline cache/i);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));

  await context.setOffline(true);
  await page.reload();
  await openApp(page);

  await gotoSection(page, 'Query');
  await page.getByLabel('SQL editor').fill('SELECT * FROM notes ORDER BY id;');
  await page.getByRole('button', { name: /run/i }).click();
  await expectSqlResult(page, 'cached');

  await context.setOffline(false);
});

test('shows the standalone vault gate when opened from file://', async ({ page }) => {
  const fileUrl = pathToFileURL(resolve(process.cwd(), 'dist/index.html')).href;
  await page.goto(fileUrl);
  await expect(page.getByRole('heading', { name: 'Set up local vault' })).toBeVisible();
  await expect(page.getByText(/Create a passphrase to secure this vault/i)).toBeVisible();
});
