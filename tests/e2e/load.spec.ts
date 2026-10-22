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
    // the intro only leaves after the stage has actually drawn (window.__scene is exposed in dev only)
    const frames = await page.evaluate(() => (window as unknown as { __scene?: { frames: number } }).__scene?.frames ?? 0);
    expect(frames).toBeGreaterThan(0);
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
    // a load failure belongs to the intro, not the global "something went wrong" toast
    await expect(page.locator('#toast')).not.toHaveClass(/show/);
    await expect(page.locator('#toast')).not.toContainText('Something went wrong');
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
  test('start from blank spans both columns, below the four characters, image left of the text', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#intro')).toHaveCount(0, { timeout: BOOT });
    const grid = (await page.locator('#chars').boundingBox())!;
    const blank = (await page.locator('#chars .char.blank').boundingBox())!;
    const nova = (await page.locator('#chars .char[data-id="nova"]').boundingBox())!;
    expect(Math.abs(blank.width - grid.width)).toBeLessThan(2);
    expect(blank.y).toBeGreaterThanOrEqual(nova.y + nova.height);
    const img = (await page.locator('#chars .char.blank img').boundingBox())!;
    const txt = (await page.locator('#chars .char.blank .txt').boundingBox())!;
    expect(img.x + img.width).toBeLessThanOrEqual(txt.x);
    await expect(page.locator('#chars .char.blank strong')).toHaveText('Start from blank');
  });
});
