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

  test('share link round-trips the cap choice', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    page.on('dialog', (d) => void d.dismiss());
    await boot(page);
    await page.locator('#step-next').click();
    await page.locator('#card-cap .tile', { hasText: 'Cloud' }).click();
    await page.locator('#share').click();
    await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#d=/);
    await expect(page.locator('#toast')).toContainText('Link copied');
    const url = page.url();
    const page2 = await context.newPage();
    await boot(page2, url);
    await page2.locator('#step-next').click();
    await expect(page2.locator('#card-cap .tile', { hasText: 'Cloud' })).toHaveAttribute('aria-pressed', 'true');
    await page2.close();
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
});
