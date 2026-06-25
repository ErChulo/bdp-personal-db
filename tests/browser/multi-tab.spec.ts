import { test, expect } from '@playwright/test';
import { createSqlDatabase, expectReadOnly, expectWritable, gotoSection, openApp } from '../helpers/browser';

test('keeps a second tab read-only until takeover', async ({ browser }) => {
  const context = await browser.newContext();
  const owner = await context.newPage();
  const reader = await context.newPage();

  await openApp(owner);
  await expectWritable(owner);
  await createSqlDatabase(
    owner,
    'owned',
    'CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT);',
  );

  await openApp(reader);
  await expectReadOnly(reader);

  await gotoSection(reader, 'Query');
  await reader.getByLabel('SQL editor').fill("INSERT INTO notes (id, body) VALUES (1, 'blocked');");
  await expect(reader.getByRole('button', { name: /run/i })).toBeDisabled();
  await expect(reader.getByText(/This tab is read-only/i)).toHaveCount(0);

  await gotoSection(reader, 'SQL Manager');
  await expect(reader.getByRole('button', { name: /new sql db/i })).toBeDisabled();
  await expect(reader.getByRole('button', { name: /take over/i })).toBeVisible();

  await context.close();
});
