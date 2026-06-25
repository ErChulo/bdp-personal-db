import { test, expect } from '@playwright/test';
import { buildLargeMetricsInsertSql, writeOversizedSparseFixture } from '../fixtures/large-files';
import { addNosqlDocument, createNosqlCollection, createSqlDatabase, editNosqlDocument, gotoSection, openApp, runSql } from '../helpers/browser';

test('local tools stay responsive and honest on large datasets', async ({ page }, testInfo) => {
  await openApp(page);
  await createSqlDatabase(page, 'local-tools', 'CREATE TABLE metrics (id INTEGER PRIMARY KEY, score INTEGER, label TEXT);');
  await runSql(page, buildLargeMetricsInsertSql('metrics', 10_000));

  await gotoSection(page, 'Query');
  await page.getByLabel('SQL editor').fill('SELECT * FROM metrics ORDER BY id;');
  await page.getByRole('button', { name: /run/i }).click();
  await expect(page.getByText(/page 1 \/ 100/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Next page/i })).toBeVisible();
  await page.getByRole('button', { name: /Next page/i }).click();
  await expect(page.getByText(/page 2 \/ 100/)).toBeVisible();

  await gotoSection(page, 'Reports');
  const started = Date.now();
  await page.locator('#reports-table').selectOption('metrics');
  await expect(page.getByText(/page 1 \/ 100/)).toBeVisible();
  await expect(page.locator('.workspace-panel:not([hidden])')).toContainText('10000 rows');
  expect(Date.now() - started).toBeLessThan(1000);

  await gotoSection(page, 'Search');
  await page.getByRole('button', { name: /Rebuild index/i }).click();
  await expect(page.locator('.workspace-panel:not([hidden]) .section-header')).toContainText('10000 indexed docs');
  await page.getByLabel('Search across all databases').fill('row-9999');
  await page.getByRole('button', { name: '▶ Search' }).click();
  await expect(page.locator('.workspace-panel:not([hidden]) tbody tr').first()).toBeVisible();

  await gotoSection(page, 'Schema Diff');
  await page.locator('#diff-left').selectOption('local-tools');
  await page.locator('#diff-right').selectOption('local-tools');
  await expect(page.getByText(/UNCHANGED/)).toBeVisible();

  await gotoSection(page, 'Key Gen');
  await page.getByRole('button', { name: /Hex/i }).click();
  await page.locator('#keygen-count').fill('3');
  await page.getByRole('button', { name: /^generate$/i }).click();
  await expect(page.getByText(/generated 3 hex values/i)).toBeVisible();

  await gotoSection(page, 'Import');
  const oversizedPath = testInfo.outputPath('oversized.csv');
  await writeOversizedSparseFixture(oversizedPath, 524_288_001);
  await page.locator('#import-file').setInputFiles(oversizedPath);
  await expect(page.getByText(/maximum size is 500 MB/i)).toBeVisible();
});

test('NoSQL metadata persists across reload', async ({ page }) => {
  await openApp(page);
  await createNosqlCollection(page, 'inventory', 'name');
  await page.once('dialog', async (dialog) => {
    await dialog.accept('catalog');
  });
  await page.getByRole('button', { name: /^rename$/i }).click();
  await expect(page.getByText(/renamed to 'catalog'/i)).toBeVisible();

  await page.reload();
  await openApp(page);
  await gotoSection(page, 'NoSQL Manager');
  await expect(page.locator('.list-pane')).toContainText('catalog');
  await page.getByRole('button', { name: /^Data$/i }).click();
  await page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole('button', { name: /delete collection/i }).click();
  await expect(page.getByText(/deleted catalog/i)).toBeVisible();
  await page.reload();
  await openApp(page);
  await gotoSection(page, 'NoSQL Manager');
  await expect(page.locator('.list-pane')).not.toContainText('catalog');
});

test('NoSQL document CRUD persists across reload', async ({ page }) => {
  await openApp(page);
  await createNosqlCollection(page, 'contacts', 'name');
  await addNosqlDocument(page, 'Ada');
  await editNosqlDocument(page, 'Grace');
  await expect(page.getByText(/updated document/i)).toBeVisible();

  await page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page.locator('.workspace-panel:not([hidden]) tbody tr').first().getByRole('button', { name: /^delete$/i }).click();
  await expect(page.locator('.workspace-panel:not([hidden]) tbody tr')).toHaveCount(0);

  await page.reload();
  await openApp(page);
  await gotoSection(page, 'NoSQL Manager');
  await expect(page.locator('.list-pane')).toContainText('contacts');
  await page.getByRole('button', { name: /Data/i }).click();
  await expect(page.locator('.workspace-panel:not([hidden]) tbody tr')).toHaveCount(0);
});

test('NoSQL query jobs run as pure JS over the local snapshot', async ({ page }) => {
  await openApp(page);
  await createNosqlCollection(page, 'contacts', 'name');
  await addNosqlDocument(page, 'Ada');
  await addNosqlDocument(page, 'Grace');

  await page.getByRole('button', { name: /^Jobs$/i }).click();
  await page.locator('#nosql-job-code').fill("return docs.filter((doc) => String(doc.name ?? '').startsWith('G'));");
  await page.getByRole('button', { name: /^run job$/i }).click();
  await expect(page.getByText(/1 matched document/i)).toBeVisible();
  await expect(page.locator('.workspace-panel:not([hidden]) tbody tr')).toHaveCount(1);
});

test('NoSQL indexed lookup helpers can use Dexie-backed field indexes', async ({ page }) => {
  await openApp(page);
  await createNosqlCollection(page, 'contacts', 'name');
  await addNosqlDocument(page, 'Ada');
  await addNosqlDocument(page, 'Grace');

  await page.getByRole('button', { name: /^Jobs$/i }).click();
  await page.getByLabel('Indexed field').selectOption('name');
  await page.getByRole('button', { name: /\+ index field/i }).click();
  await page.getByLabel('Lookup value').fill('Ada');
  await page.getByRole('button', { name: /^lookup$/i }).click();
  await expect(page.getByText(/1 document matched/i)).toBeVisible();
  await expect(page.locator('.workspace-panel:not([hidden]) tbody tr')).toHaveCount(1);
});
