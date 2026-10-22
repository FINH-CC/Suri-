import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// swiftshader Chromium is slow to compile shaders and render snapshots: generous timeouts throughout.
const BOOT = 45_000;

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const noHorizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

const box = async (page: Page, sel: string) => (await page.locator(sel).boundingBox())!;

/** Wait until a smooth scroll (or anything else) has stopped moving the page. */
async function settle(page: Page) {
  let last = -1;
  await expect.poll(async () => {
    const y = await page.evaluate(() => scrollY);
    const still = y === last;
    last = y;
    return still;
  }, { intervals: [150] }).toBe(true);
}

async function boot(page: Page) {
  await page.goto('/');
  await expect(page.locator('#intro')).toHaveCount(0, { timeout: BOOT });
}

test.describe('phone layout', () => {
  test.setTimeout(180_000);
  test.skip(({ isMobile }) => !isMobile, 'mobile only');

  test('pinned viewer, scrolling options, one bottom bar, landscape', async ({ page }) => {
    await boot(page);
    expect(await noHorizontalOverflow(page)).toBe(true);

    // phone chrome: nav links hidden, icon-only header buttons, no visible scrollbars
    await expect(page.locator('.nav')).toBeHidden();
    await expect(page.locator('#share span')).toBeHidden();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarWidth)).toBe('none');
    // the canvas takes drags (rotate), the options column scrolls the page
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('#stage canvas')!).touchAction)).toBe('none');
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('info')!).touchAction)).toBe('auto');
    // the step track is not sticky on phones
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('steps')!).position)).toBe('static');

    await page.locator('#step-next').click();
    await expect(page.locator('#step-2')).toBeVisible();
    await settle(page);

    // the step track lands below the pinned stage, not under it
    const header = await box(page, '.topbar');
    let stage = await box(page, '#stage');
    expect(stage.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
    expect((await box(page, '#steps')).y).toBeGreaterThanOrEqual(stage.y + stage.height - 1);

    // scroll the options column: the page scrolls, the stage stays pinned in view under the header
    const vp = page.viewportSize()!;
    await page.mouse.move(vp.width / 2, vp.height - 120);
    await page.mouse.wheel(0, 1500);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(1000);
    stage = await box(page, '#stage');
    const vh: number = await page.evaluate(() => window.innerHeight);
    expect(stage.y).toBeGreaterThanOrEqual(0);
    expect(stage.y + stage.height).toBeLessThanOrEqual(vh);
    expect(stage.y).toBeGreaterThanOrEqual(header.height - 1);
    expect(stage.height).toBeGreaterThanOrEqual(280);
    // the sticky stage is opaque: something painted at its edge is the media column, not a card behind it
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.media, .info')?.className, [stage.x + 2, stage.y + stage.height - 2]);
    expect(hit).toBe('media');

    // one bottom bar, in the viewport
    await expect(page.locator('#step-next')).toBeInViewport();
    await expect(page.locator('.step-nav')).toHaveCount(1);
    const nav = await box(page, '.step-nav');
    expect(nav.y + nav.height).toBeLessThanOrEqual(vh + 1);

    // jumping to the cap card (as Edit / tapping the brush do) shows it below the pinned stage
    await page.evaluate(() => document.getElementById('card-cap')!.scrollIntoView({ block: 'start' }));
    await expect(page.locator('#card-cap')).toBeInViewport();
    const cap = await box(page, '#card-cap');
    stage = await box(page, '#stage');
    expect(cap.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1);

    // undo/redo never collide with the toolbar (enable them first: while disabled they are dimmed, not hidden)
    await page.locator('#card-cap .swatch').nth(4).click();
    await page.waitForTimeout(800); // past the store's 700 ms collapse window: two undo steps
    await page.locator('#card-cap .swatch').nth(3).click();
    await page.locator('#undo').click();
    await expect(page.locator('#undo')).toBeEnabled();
    await expect(page.locator('#redo')).toBeEnabled();

    // rotate to landscape: no overflow, the stage keeps its minimum height and stops pinning
    await page.setViewportSize({ width: 812, height: 375 });
    await expect.poll(() => noHorizontalOverflow(page)).toBe(true);
    await expect.poll(async () => (await box(page, '#stage')).height).toBeGreaterThanOrEqual(280);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.media')!).position)).not.toBe('sticky');
  });

  test('undo/redo and the toolbar never overlap, at every width', async ({ page }) => {
    await boot(page);
    await page.locator('#step-next').click();
    await page.locator('#card-cap .swatch').nth(4).click();
    await page.waitForTimeout(800); // past the store's 700 ms collapse window: two undo steps
    await page.locator('#card-cap .swatch').nth(3).click();
    await page.locator('#undo').click();
    await expect(page.locator('#undo')).toBeEnabled();
    await expect(page.locator('#redo')).toBeEnabled();
    for (const [width, height] of [[320, 640], [375, 812], [390, 664], [520, 900], [768, 1024], [812, 375], [1000, 800], [1280, 900]]) {
      await page.setViewportSize({ width, height });
      await expect.poll(() => noHorizontalOverflow(page), { message: `overflow at ${width}` }).toBe(true);
      await page.locator('#stage').scrollIntoViewIfNeeded();
      const bar = await box(page, '.toolbar');
      const st = await box(page, '#stage');
      for (const id of ['#undo', '#redo']) {
        const b = await box(page, id);
        expect(overlaps(b, bar), `${id} overlaps the toolbar at ${width}×${height}`).toBe(false);
      }
      // the toolbar stays on one line inside the stage
      expect(bar.x, `toolbar inside the stage at ${width}`).toBeGreaterThanOrEqual(st.x);
      expect(bar.x + bar.width, `toolbar inside the stage at ${width}`).toBeLessThanOrEqual(st.x + st.width);
      expect(bar.height, `toolbar on one line at ${width}`).toBeLessThan(45);
    }
  });

  test('the sticker hint says tap, with no Esc key to mention', async ({ page }) => {
    await boot(page);
    await page.locator('#step-next').click();
    const star = page.locator('#sticker-tiles .tile', { hasText: 'Star' });
    await star.scrollIntoViewIfNeeded();
    await star.click();
    await expect(page.locator('#placing-hint')).toHaveText('Tap the brush to place a star.');
  });
});
