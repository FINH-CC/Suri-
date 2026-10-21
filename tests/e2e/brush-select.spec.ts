import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const BOOT = 45_000;
const cursor = (page: Page) => page.evaluate(() => document.querySelector<HTMLCanvasElement>('#stage canvas')!.style.cursor);

async function boot(page: Page) {
  await page.goto('/');
  await expect(page.locator('#intro')).toHaveCount(0, { timeout: BOOT });
}

test.describe('brush hover cursor', () => {
  test.setTimeout(180_000);
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('pointer over the brush, reset over empty space', async ({ page }) => {
    await boot(page);
    const c = (await page.locator('#stage canvas').boundingBox())!;
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2, { steps: 3 });
    await expect.poll(async () => { await page.mouse.move(c.x + c.width / 2 + 1, c.y + c.height / 2, { steps: 2 }); await page.waitForTimeout(100); return cursor(page); }).toBe('pointer');
    await page.mouse.move(c.x + 6, c.y + c.height - 6, { steps: 3 });
    await expect.poll(async () => { await page.mouse.move(c.x + 7, c.y + c.height - 6); await page.waitForTimeout(100); return cursor(page); }).toBe('');
  });
});

test.describe('undo / redo sizing', () => {
  test.setTimeout(180_000);
  for (const [width, height] of [[1280, 900], [375, 812]]) {
    test(`match the toolbar buttons at ${width}px and read as a pair while disabled`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await boot(page);
      await expect(page.locator('#undo')).toBeDisabled();
      for (const id of ['#undo', '#redo']) {
        await expect.poll(() => page.locator(id).evaluate((e) => +getComputedStyle(e).opacity)).toBeGreaterThan(0);
        const b = (await page.locator(id).boundingBox())!;
        const t = (await page.locator('#tb-apart').boundingBox())!;
        expect(Math.abs(b.height - t.height), `${id} height`).toBeLessThanOrEqual(1);
        expect(Math.abs(b.width - b.height), `${id} round`).toBeLessThanOrEqual(1);
      }
    });
  }
});
