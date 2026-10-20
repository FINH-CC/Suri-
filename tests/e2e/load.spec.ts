import { expect, test } from '@playwright/test';

// swiftshader Chromium is slow to compile shaders and render snapshots: generous timeouts throughout.
const BOOT = 45_000;

test.describe('app shell', () => {
  test.setTimeout(120_000);

  test('loads: intro leaves, stage has a canvas, no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/');
    await expect(page.locator('#intro')).toHaveCount(0, { timeout: BOOT });
    await expect(page.locator('#stage canvas')).toHaveCount(1);
    await expect(page.locator('#step-1')).toBeVisible();
    await expect(page.locator('#chars .char')).toHaveCount(5);
    expect(errors).toEqual([]);
  });

  // Review Focus 3: the model request failing shows "Couldn't load the brush" with a working Retry.
  test('model failure shows the error with a working Retry', async ({ page }) => {
    await page.route('**/model/brush.glb', (r) => r.abort());
    await page.goto('/');
    const intro = page.locator('#intro');
    await expect(intro).toContainText("Couldn't load the brush", { timeout: BOOT });
    const retry = intro.getByRole('button', { name: 'Retry' });
    await expect(retry).toBeVisible();
    await page.unroute('**/model/brush.glb');
    await retry.click();
    await expect(intro).toHaveCount(0, { timeout: BOOT });
    await expect(page.locator('#stage canvas')).toHaveCount(1);
  });

  test('clicking the Puff card stores the character', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#intro')).toHaveCount(0, { timeout: BOOT });
    const puff = page.locator('#chars .char[data-id="puff"]');
    await puff.click();
    await expect(puff).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('suri-kids-current') ?? ''))
      .toContain('"character":"puff"');
  });
});
