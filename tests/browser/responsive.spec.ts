import { test, expect } from '@playwright/test';
import { gotoSection, openApp } from '../helpers/browser';

const viewports = [
  { width: 360, height: 740 },
  { width: 1440, height: 900 },
];

for (const viewport of viewports) {
  test(`primary navigation remains usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openApp(page);

    await expect(page.locator('.app-nav')).toBeVisible();
    await gotoSection(page, 'Import');
    await expect(page.getByRole('heading', { name: 'Import' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Dashboard/i }).first()).toBeVisible();
    await gotoSection(page, 'Schema Diff');
    await expect(page.getByRole('heading', { name: /Schema/ })).toBeVisible();

    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    }));
    expect(overflow.x).toBeLessThanOrEqual(1);
    expect(overflow.y).toBeLessThanOrEqual(1);
  });
}
