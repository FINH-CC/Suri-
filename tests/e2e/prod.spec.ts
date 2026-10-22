import { expect, test } from '@playwright/test';

// Smoke test of the production build (npm run build && vite preview, the `prod` project). Nothing here may rely on
// dev-only hooks such as window.__scene: the build strips them.
// The build always has the password gate on; the preview server emulates the Vercel side (VITE_GATE=1) with the
// throwaway test password from playwright.config.ts.
const BOOT = 60_000;
const PW = 'test-gate-pass';

test.describe('production build', () => {
  test.setTimeout(180_000);

  test('loads, intro leaves, a character opens the Design step, no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    const failed: string[] = [];
    page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });

    // unlock first (shares the browser context's cookies), so this run is the returning, unlocked visitor
    expect((await page.request.post('/api/unlock', { data: { password: PW } })).status()).toBe(204);
    await page.goto('/');
    await expect(page.locator('#intro')).toHaveCount(0, { timeout: BOOT });
    await expect(page.locator('#stage canvas')).toHaveCount(1);
    // the hashed glb is preloaded from the HTML
    await expect(page.locator('link[rel="preload"][as="fetch"]')).toHaveAttribute('href', /^\/assets\/brush-[\w-]+\.glb$/);
    // the hashed character tiles load
    const card = page.locator('#chars .char[data-id="pip"]');
    await expect(card.locator('img')).toHaveAttribute('src', /^\/assets\/char-pip-[\w-]+\.webp$/);
    await expect.poll(() => card.locator('img').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBeGreaterThan(0);

    await card.click();
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#step-next').click();
    await expect(page.locator('#step-2')).toBeVisible();
    await expect(page.locator('#card-cap .tile').first()).toBeVisible();
    await expect(page.locator('#card-cap .tile img').first()).toHaveAttribute('src', /^\/assets\/cap-[\w-]+\.webp$/);
    expect(await page.evaluate(() => '__scene' in window)).toBe(false); // dev hook stripped
    expect(errors).toEqual([]);
    expect(failed).toEqual([]);
  });

  test('locked: the build shows the password field, refuses the hashed model, tiles and data, keeps JS public', async ({ page }) => {
    await page.goto('/');
    const field = page.getByLabel('Password');
    await expect(field).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('link[rel="preload"][as="fetch"]')).toHaveCount(0);
    const html = await page.content();
    const glb = html.match(/\/assets\/brush-[\w-]+\.glb/)?.[0];
    const js = html.match(/\/assets\/index-[\w-]+\.js/)?.[0];
    expect(glb).toBeTruthy();
    expect(js).toBeTruthy();
    expect((await page.request.get(glb!)).status()).toBe(401);
    expect((await page.request.get(js!)).status()).toBe(200);
    await field.fill(PW);
    await field.press('Enter');
    await expect(page.locator('#intro')).toHaveCount(0, { timeout: BOOT });
    expect((await page.request.get(glb!)).status()).toBe(200);
    expect(await page.evaluate(() => '__scene' in window)).toBe(false);
  });
});
