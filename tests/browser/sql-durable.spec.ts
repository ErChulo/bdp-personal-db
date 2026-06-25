import { test, expect } from '@playwright/test';
import { createSqlDatabase, expectSqlResult, gotoSection, openApp, runSql } from '../helpers/browser';

test('keeps a created SQL table and rows after navigation and reload', async ({ page }) => {
  await openApp(page);

  await createSqlDatabase(
    page,
    'drills',
    'CREATE TABLE scores (id INTEGER PRIMARY KEY, name TEXT, score INTEGER);',
  );

  await runSql(page, "INSERT INTO scores (id, name, score) VALUES (1, 'Ada', 91), (2, 'Linus', 88);");
  await runSql(page, 'SELECT * FROM scores ORDER BY id;');
  await expectSqlResult(page, 'Ada');
  await expectSqlResult(page, 'Linus');

  await gotoSection(page, 'Dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await gotoSection(page, 'Reports');
  await expect(page.getByRole('heading', { name: /Reports/ })).toBeVisible();

  await page.reload();
  await openApp(page);
  await gotoSection(page, 'Query');
  await expect(page.getByRole('heading', { name: /Query .*drills/ })).toBeVisible();

  await runSql(page, 'SELECT * FROM scores ORDER BY id;');
  await expectSqlResult(page, 'Ada');
  await expectSqlResult(page, '91');
  await expectSqlResult(page, 'Linus');
  await expectSqlResult(page, '88');
});
