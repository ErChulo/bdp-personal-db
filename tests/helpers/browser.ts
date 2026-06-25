import { expect, type Page } from '@playwright/test';

export const TEST_VAULT_PASSPHRASE = 'test-passphrase';

const SECTION_INDEX: Record<string, number> = {
  Dashboard: 0,
  'SQL Manager': 1,
  'NoSQL Manager': 2,
  Query: 3,
  Import: 4,
  Export: 5,
  'Backup / Snapshot': 6,
  Reports: 7,
  Search: 8,
  'Schema Diff': 9,
  'Key Gen': 10,
};

export async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  const gate = page.locator('.vault-gate');
  if (await gate.isVisible().catch(() => false)) {
    await page.locator('#vault-passphrase').fill(TEST_VAULT_PASSPHRASE);
    const confirm = page.locator('#vault-passphrase-confirm');
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.fill(TEST_VAULT_PASSPHRASE);
      await page.getByRole('button', { name: /^create vault$/i }).click();
    } else {
      await page.getByRole('button', { name: /^unlock vault$/i }).click();
    }
    await expect(page.locator('.workspace-shell')).toBeVisible();
  }
  await expect(page.locator('.status-bar')).toContainText('BDP');
  await expect(page.locator('.app-nav')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
}

export async function gotoSection(page: Page, label: string): Promise<void> {
  const index = SECTION_INDEX[label];
  if (index === undefined) throw new Error(`Unknown section "${label}"`);
  await page.locator('.nav-item').nth(index).click();
}

export async function createSqlDatabase(page: Page, name: string, schemaSql: string): Promise<void> {
  await gotoSection(page, 'SQL Manager');
  await page.getByRole('button', { name: /new sql db/i }).click();
  await page.getByLabel('name').fill(name);
  await page.getByLabel(/initial schema/i).fill(schemaSql);
  await page.getByRole('button', { name: /^create$/i }).click();
  await expect(page.getByText(`created '${name}'`)).toBeVisible();
}

export async function createNosqlCollection(page: Page, name: string, fieldName = 'title'): Promise<void> {
  await gotoSection(page, 'NoSQL Manager');
  await page.getByRole('button', { name: /\+ New Collection/i }).click();
  await page.locator('#nosql-newName').fill(name);
  await page.locator('#nosql-field-name-0').fill(fieldName);
  await page.getByRole('button', { name: /^create$/i }).click();
  await expect(page.getByText(`created '${name}'`)).toBeVisible();
}

export async function addNosqlDocument(page: Page, value: string): Promise<void> {
  await page.getByRole('button', { name: /^Data$/i }).click();
  await page.once('dialog', async (dialog) => {
    await dialog.accept(value);
  });
  await page.getByRole('button', { name: /^\+ add document$/i }).click();
  await expect(page.getByText(/added document/i)).toBeVisible();
}

export async function editNosqlDocument(page: Page, value: string): Promise<void> {
  await page.getByRole('button', { name: /^Data$/i }).click();
  await page.once('dialog', async (dialog) => {
    await dialog.accept(value);
  });
  await page.getByRole('button', { name: /^edit$/i }).click();
  await expect(page.getByText(/updated document/i)).toBeVisible();
}

export async function runSql(page: Page, sql: string): Promise<void> {
  await gotoSection(page, 'Query');
  await page.getByLabel('SQL editor').fill(sql);
  await page.getByRole('button', { name: /run/i }).click();
}

export async function expectSqlResult(page: Page, text: string): Promise<void> {
  await expect(page.locator('pre').filter({ hasText: text }).first()).toBeVisible();
}

export async function waitForWritable(page: Page): Promise<void> {
  await expect(page.locator('.status-bar')).toContainText(/WRITABLE|READ-ONLY/);
}

export async function expectWritable(page: Page): Promise<void> {
  await expect(page.locator('.status-bar')).toContainText('WRITABLE');
}

export async function expectReadOnly(page: Page): Promise<void> {
  await expect(page.locator('.status-bar')).toContainText('READ-ONLY');
}
