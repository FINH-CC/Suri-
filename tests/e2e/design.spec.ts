import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// swiftshader Chromium is slow to compile shaders and render snapshots: generous timeouts throughout.
const BOOT = 45_000;
const KEY = 'suri-kids-current';
const saved = (page: Page) => page.evaluate((k) => localStorage.getItem(k) ?? '', KEY);

test.describe('design screen', () => {
  test.setTimeout(180_000);
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('parts, colours, finish, stickers and a bad upload', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#intro')).toHaveCount(0, { timeout: BOOT });
    await page.locator('#step-next').click();
    await expect(page.locator('#step-2')).toBeVisible();

    // a part tile
    const cloud = () => page.locator('#card-cap .tile', { hasText: 'Cloud' });
    await cloud().click();
    await expect(cloud()).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => saved(page)).toContain('"cap":"cloud"');

    // the 5th swatch in the cap card is Green
    await page.locator('#card-cap .swatch').nth(4).click();
    await expect.poll(() => saved(page)).toContain('"colours":{"cap":"#66bf8d"');

    // finish
    await page.locator('#finishes button', { hasText: 'Satin' }).click();
    await expect.poll(() => saved(page)).toContain('"finish":"satin"');

    // arm a sticker, place one, and the tile disarms
    const star = () => page.locator('#sticker-tiles .tile', { hasText: 'Star' });
    await star().click();
    await expect(star()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#stage')).toHaveClass(/placing/);
    const canvas = page.locator('#stage canvas');
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.click(cx, cy);
    const rows = page.locator('#sticker-list .list-row');
    await expect(rows).toHaveCount(1, { timeout: 15_000 });
    await expect(star()).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#stage')).not.toHaveClass(/placing/);

    // one sticker per tap on a tile: a second click does not place another
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(500);
    await expect(rows).toHaveCount(1);

    await page.locator('#sticker-list .list-item').first().getByRole('button', { name: /Remove/ }).click();
    await expect(rows).toHaveCount(0);

    // a file that is not an STL: toast, and the design is unchanged
    const before = await saved(page);
    await page.locator('#card-cap .tile.upload').click();
    await page.locator('#file').setInputFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await expect(page.locator('#toast')).toHaveText('That file could not be read as an STL');
    expect(await saved(page)).toBe(before);
  });

  test('keyboard focus stays on the picked tile, preset, finish and sticker after a re-render', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#intro')).toHaveCount(0, { timeout: BOOT });
    await page.locator('#step-next').click();
    const focused = () => page.evaluate(() => { const a = document.activeElement as HTMLElement; return a === document.body ? 'body' : `${a.className}|${a.getAttribute('aria-pressed')}|${a.textContent?.trim()}`; });
    for (const [sel, text] of [['#card-cap .tile', 'Bear'], ['#presets .preset', ''], ['#finishes button', 'Satin'], ['#sticker-tiles .tile', 'Star']] as const) {
      const b = text ? page.locator(sel, { hasText: text }) : page.locator(sel).nth(1);
      await b.focus();
      await page.keyboard.press('Enter');
      await expect.poll(focused, { message: sel }).toMatch(/\|true\|/);
    }
    await page.keyboard.press('Escape');
  });
});
