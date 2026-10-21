import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const BOOT = 45_000;
const KEY = 'suri-kids-current';
const saved = (page: Page) => page.evaluate((k) => localStorage.getItem(k) ?? '', KEY);
// nothing is saved until the first edit, so read the cap colour (null = untouched)
const cap = async (page: Page) => { const j = await saved(page); return j ? (JSON.parse(j) as { colours: { cap: string } }).colours.cap : null; };

async function boot(page: Page, url = '/') {
  await page.goto(url);
  await expect(page.locator('#intro')).toHaveCount(0, { timeout: BOOT });
}

test.describe('share, my designs, undo and redo', () => {
  test.setTimeout(180_000);
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('share link round-trips the cap choice', async ({ page, context, browser }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    page.on('dialog', (d) => void d.dismiss());
    await boot(page);
    await page.locator('#step-next').click();
    await page.locator('#card-cap .tile', { hasText: 'Cloud' }).click();
    await page.locator('#share').click();
    await expect(page.locator('#toast')).toContainText('Link copied');
    const url = await page.evaluate(() => navigator.clipboard.readText());
    expect(new URL(url).hash).toMatch(/^#d=/);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(''); // cleared again after copying
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, baseURL: 'http://localhost:3240' }); // fresh storage: only the hash can supply Cloud
    const page2 = await ctx2.newPage();
    await boot(page2, url);
    await page2.locator('#step-next').click();
    await expect(page2.locator('#card-cap .tile', { hasText: 'Cloud' })).toHaveAttribute('aria-pressed', 'true');
    await ctx2.close();
  });

  test('a share link is consumed: edits after opening it survive a reload', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    page.on('dialog', (d) => void d.dismiss());
    await boot(page);
    await page.locator('#step-next').click();
    await page.locator('#card-cap .tile', { hasText: 'Cloud' }).click();
    await page.locator('#share').click();
    await expect(page.locator('#toast')).toContainText('Link copied');
    const url = await page.evaluate(() => navigator.clipboard.readText());
    await page.goto('about:blank'); // a hash-only goto from the same page would not reload it
    await boot(page, url);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('');
    await page.locator('#step-next').click();
    await expect(page.locator('#card-cap .tile', { hasText: 'Cloud' })).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#card-cap .tile', { hasText: 'Bear' }).click();
    await expect.poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}').parts?.cap, KEY)).toBe('bear');
    await page.reload();
    await expect(page.locator('#intro')).toHaveCount(0, { timeout: BOOT });
    await page.locator('#step-next').click();
    await expect(page.locator('#card-cap .tile', { hasText: 'Bear' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('save design lists a card, open restores it, delete removes it', async ({ page }) => {
    await boot(page);
    await page.locator('#open-designs').click();
    await expect(page.locator('#designs-empty')).toBeVisible();
    await page.locator('#save-design').click();
    await expect(page.locator('#designs .design')).toHaveCount(1, { timeout: 60_000 });
    await expect(page.locator('#designs .design img')).toHaveAttribute('src', /^data:image\/jpeg/);
    await expect(page.locator('#designs .design span')).toHaveText('Design 1');
    await page.locator('#designs .design .text-btn').click();
    await expect(page.locator('#toast')).toHaveText('Design opened');
    await expect(page.locator('#designs-dlg')).not.toHaveAttribute('open', '');
    await page.locator('#open-designs').click();
    await page.locator('#designs .design .link-btn').click();
    await expect(page.locator('#designs .design')).toHaveCount(0);
    await expect(page.locator('#designs-empty')).toBeVisible();
  });

  test('a blocked localStorage still boots and Save shows the storage toast', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); };
    });
    await boot(page);
    await page.locator('#open-designs').click();
    await page.locator('#save-design').click();
    await expect(page.locator('#toast')).toHaveText('Storage is full. Delete a design first.', { timeout: 60_000 });
    await expect(page.locator('#designs .design')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('undo and redo by button and keyboard', async ({ page }) => {
    await boot(page);
    await page.locator('#step-next').click();
    const undo = page.locator('#undo'), redo = page.locator('#redo');
    await expect(undo).toBeDisabled();
    await expect(redo).toBeDisabled();
    const before = '#6fa5dc'; // the default cap colour (nothing saved yet)
    await page.locator('#card-cap .swatch').nth(4).click();
    const after = '#66bf8d';
    await expect.poll(() => cap(page)).toBe(after);
    await expect(undo).toBeEnabled();
    await expect(redo).toBeDisabled();

    await undo.click();
    await expect.poll(() => cap(page)).toBe(before);
    await expect(undo).toBeDisabled();
    await expect(redo).toBeEnabled();
    await redo.click();
    await expect.poll(() => cap(page)).toBe(after);
    await expect(redo).toBeDisabled();

    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => cap(page)).toBe(before);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(() => cap(page)).toBe(after);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => cap(page)).toBe(before);
    await page.keyboard.press('ControlOrMeta+y');
    await expect.poll(() => cap(page)).toBe(after);
  });

  test('shortcuts are ignored while typing in a field', async ({ page }) => {
    await boot(page);
    await page.locator('#step-next').click();
    await page.locator('#card-cap .swatch').nth(4).click();
    await expect(page.locator('#undo')).toBeEnabled();
    const after = await saved(page);
    await page.locator('#step-next').click(); // Name it step
    const input = page.locator('#step-3 input[type="text"], #step-3 input:not([type])').first();
    await input.focus();
    await page.keyboard.press('ControlOrMeta+z');
    expect(await saved(page)).toBe(after);
  });

  test('undo clears the selected sticker so sliders cannot edit another', async ({ page }) => {
    await boot(page);
    await page.locator('#step-next').click();
    const box = (await page.locator('#stage canvas').boundingBox())!;
    const rows = page.locator('#sticker-list .list-row');
    for (const dx of [0, 6]) {
      await page.locator('#sticker-tiles .tile', { hasText: 'Star' }).click();
      await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2);
      await page.waitForTimeout(900); // outside the 700 ms collapse window
    }
    await expect(rows).toHaveCount(2, { timeout: 15_000 });
    await expect(rows.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#undo').click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute('aria-pressed', 'false');
  });
});
