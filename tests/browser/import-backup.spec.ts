import { test, expect } from '@playwright/test';
import { openApp, createNosqlCollection, addNosqlDocument, gotoSection } from '../helpers/browser';

test('backup restore keeps existing NoSQL data and renames collisions', async ({ page }, testInfo) => {
  await openApp(page);
  await createNosqlCollection(page, 'contacts', 'name');
  await addNosqlDocument(page, 'Ada');

  await gotoSection(page, 'Backup / Snapshot');
  const snapshotPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /snapshot all dbs and collections/i }).click();
  const snapshot = await snapshotPromise;
  const snapshotPath = testInfo.outputPath(snapshot.suggestedFilename());
  await snapshot.saveAs(snapshotPath);
  await expect(page.getByText(/snapshot created/i)).toBeVisible();

  await page.locator('#backup-restore-file').setInputFiles(snapshotPath);
  await expect(page.locator('.banner.ok').last()).toContainText(/restored 1 items/i);

  await gotoSection(page, 'NoSQL Manager');
  await expect(page.locator('.list-pane')).toContainText('contacts');
  await expect(page.locator('.list-pane')).toContainText(/contacts \(restored/);
});
