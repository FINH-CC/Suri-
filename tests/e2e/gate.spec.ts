import { expect, test } from '@playwright/test';

// The `gate` project: a dev server with VITE_GATE=1 and the throwaway password below (playwright.config.ts), served
// through the emulation in vite.config.ts, which runs the same lib/ handlers and decision as the Vercel side.
const PW = 'test-gate-pass';
const BOOT = 45_000;
const GLB = '/src/assets/model/brush.glb';

test.describe('password gate', () => {
  test.setTimeout(120_000);

  test('locked: the field fades in under Lab, the model and tiles are refused', async ({ page }) => {
    const glb: number[] = [];
    // the file itself, not Vite's `?url` module for it
    page.on('response', (r) => { const u = new URL(r.url()); if (u.pathname === GLB && !u.search) glb.push(r.status()); });
    await page.goto('/');
    const field = page.getByLabel('Password');
    await expect(field).toBeVisible({ timeout: 10_000 });
    await expect(field).toHaveAttribute('type', 'password');
    await expect(field).toHaveAttribute('autocomplete', 'current-password');
    await expect(field).toHaveAttribute('placeholder', 'Password');
    await expect(field).toBeFocused();
    await expect(page.getByRole('button', { name: 'Unlock' })).toBeVisible();
    await expect(page.locator('#intro .logo img')).toBeVisible(); // the wordmark stays
    // nothing preloaded for a locked visitor, and the app never asked for the model
    await expect(page.locator('link[rel="preload"][as="fetch"]')).toHaveCount(0);
    expect(glb).toEqual([]);
    // the server refuses the gated files without the cookie; JS stays public
    expect((await page.request.get(GLB)).status()).toBe(401);
    expect((await page.request.get('/src/assets/model/brush-meta.json')).status()).toBe(401);
    expect((await page.request.get('/src/assets/tiles/char-pip.webp')).status()).toBe(401);
    expect((await page.request.get('/src/main.ts')).status()).toBe(200);
    expect(await page.request.get('/api/gate').then((r) => r.json())).toEqual({ unlocked: false });
  });

  test('wrong password: shake, message, field clears and keeps focus, model still refused', async ({ page }) => {
    await page.goto('/');
    const field = page.getByLabel('Password');
    await expect(field).toBeVisible({ timeout: 10_000 });
    await field.fill('not-the-password');
    const unlock = page.waitForResponse('**/api/unlock');
    await field.press('Enter');
    // busy while the server thinks (it waits ~600 ms on a wrong password)
    await expect(page.getByRole('button', { name: 'Unlock' })).toBeDisabled();
    expect((await unlock).status()).toBe(401);
    await expect(page.locator('#gate-msg')).toHaveText("That's not it, try again.");
    await expect(page.locator('#gate-msg')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('form.gate')).toHaveClass(/shake/);
    await expect(field).toHaveValue('');
    await expect(field).toBeFocused();
    await expect(page.getByRole('button', { name: 'Unlock' })).toBeEnabled();
    expect((await page.request.get(GLB)).status()).toBe(401);
    expect((await page.context().cookies()).map((c) => c.name)).not.toContain('suri_gate');
    await expect(page.locator('#intro')).toBeVisible();
  });

  test('reduced motion: a wrong password does not shake', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const field = page.getByLabel('Password');
    await expect(field).toBeVisible({ timeout: 10_000 });
    await field.fill('nope');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.locator('#gate-msg')).toHaveText("That's not it, try again.");
    await expect(page.locator('form.gate')).not.toHaveClass(/shake/);
  });

  test('right password opens the app, and a reload stays unlocked without the field', async ({ page }) => {
    await page.goto('/');
    const field = page.getByLabel('Password');
    await expect(field).toBeVisible({ timeout: 10_000 });
    await field.fill(PW);
    await field.press('Enter');
    await expect(page.locator('#intro')).toHaveCount(0, { timeout: BOOT });
    await expect(page.locator('#stage canvas')).toHaveCount(1);
    await expect(page.locator('#chars .char')).toHaveCount(5);
    const gateCookie = (await page.context().cookies()).find((c) => c.name === 'suri_gate');
    expect(gateCookie?.httpOnly).toBe(true);
    expect(gateCookie?.sameSite).toBe('Lax');
    expect((await page.request.get(GLB)).status()).toBe(200);

    // reload: the field must never appear, the model is preloaded from the HTML (hint cookie), the app opens
    await page.addInitScript(() => {
      new MutationObserver(() => { if (document.querySelector('form.gate')) (window as unknown as { __sawGate?: boolean }).__sawGate = true; })
        .observe(document, { childList: true, subtree: true });
    });
    const unlockCalls: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/api/unlock')) unlockCalls.push(r.url()); });
    await page.reload();
    await expect(page.locator('link[rel="preload"][as="fetch"]')).toHaveAttribute('href', GLB);
    await expect(page.locator('#intro')).toHaveCount(0, { timeout: BOOT });
    await expect(page.locator('#stage canvas')).toHaveCount(1);
    expect(await page.evaluate(() => (window as unknown as { __sawGate?: boolean }).__sawGate ?? false)).toBe(false);
    expect(unlockCalls).toEqual([]);
  });
});
