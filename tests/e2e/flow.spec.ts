import { expect, test } from '@playwright/test';

// swiftshader Chromium is slow to compile shaders and render snapshots: generous timeouts throughout.
const BOOT = 45_000;

test.describe('name it and hand over', () => {
  test.setTimeout(180_000);
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('name the brush, review, check out', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#intro')).toHaveCount(0, { timeout: BOOT });
    await page.locator('#step-next').click();
    await expect(page.locator('#step-2')).toBeVisible();
    await page.locator('#step-next').click();
    await expect(page.locator('#step-3')).toBeVisible();

    await page.locator('#char-name').fill('Puff');
    await expect(page.locator('#box-mock .nm')).toHaveText('Puff');
    await expect(page.locator('#passport .pp-mrz')).toContainText('PUFF');
    await expect(page.locator('#box-mock img.br')).toHaveAttribute('src', /^data:image/, { timeout: 30_000 });

    await page.locator('#step-next').click();
    await expect(page.locator('#step-4')).toBeVisible();
    await expect(page.locator('#review .review-row', { hasText: 'Name' }).first().locator('.v')).toHaveText('Puff');
    await expect(page.locator('#review')).not.toContainText('Charm');

    const checkout = page.locator('#checkout');
    await expect(checkout).toBeDisabled();
    await page.locator('#grownup').check();
    await expect(checkout).toBeEnabled();
    await checkout.click();
    await expect(page.locator('#toast')).toContainText('Concept prototype');

    await page.locator('#review .review-row', { hasText: 'Cap' }).locator('button').click();
    await expect(page.locator('#step-2')).toBeVisible();
    await expect(page.locator('#card-cap')).toBeInViewport({ timeout: 10_000 });
  });
});
