import { expect, test } from '@playwright/test';

// Served by the `legacy` project's webServer (npm run legacy, port 3241).
test('legacy build loads', async ({ page }) => {
  await page.goto('http://localhost:3241/');
  await expect(page).toHaveTitle('SURI Kids lab · Brush');
});
