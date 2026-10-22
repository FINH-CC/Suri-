import { chromium } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * Interaction budgets on the production build, in headed Chromium (real GPU).
 *   npm run build && npx vite preview --port 3242 --strictPort &
 *   npx tsx scripts/measure-budgets.ts [--url http://localhost:3242/] [--runs 5] [--stickers 3]
 * Click-to-paint = from the input event's timeStamp to the second requestAnimationFrame after it (the frame that
 * carries the change has been produced). Long Tasks (> 50 ms) are collected over the whole scripted flow.
 */
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const URL = arg('url') ?? 'http://localhost:3242/';
const RUNS = Number(arg('runs') ?? 5);
const STICKERS = Number(arg('stickers') ?? 3);

type Sample = { label: string; ms: number };
type LongTask = { start: number; dur: number };

async function timed(page: Page, label: string, act: () => Promise<void>): Promise<number> {
  const before = await page.evaluate(() => (window as any).__samples.length as number);
  await page.evaluate((l) => { (window as any).__label = l; (window as any).__marks.push({ label: l, t: performance.now() }); }, label);
  await act();
  await page.waitForFunction((n) => (window as any).__samples.length > n, before, { timeout: 30_000 });
  const s: Sample[] = await page.evaluate(() => (window as any).__samples);
  await page.waitForTimeout(250); // let the scene settle (pops, lerps) before the next action
  return s[before].ms;
}

const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return { median: +s[Math.floor(s.length / 2)].toFixed(1), max: +s[s.length - 1].toFixed(1), runs: s.map((x) => +x.toFixed(1)) };
};

const browser = await chromium.launch({ headless: false });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  // a string, not a function: tsx would wrap named inner functions in a __name() helper the page does not have
  await page.addInitScript(`
    window.__samples = []; window.__longtasks = []; window.__marks = []; window.__label = 'boot';
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__longtasks.push({ start: e.startTime, dur: e.duration }); })
      .observe({ type: 'longtask', buffered: true });
    for (const type of ['click', 'input']) addEventListener(type, (e) => {
      const ts = e.timeStamp, label = window.__label;
      requestAnimationFrame(() => requestAnimationFrame(() => window.__samples.push({ label, ms: performance.now() - ts })));
    }, true);
  `);
  const t0 = Date.now();
  await page.goto(URL);
  await page.waitForSelector('#intro', { state: 'detached', timeout: 60_000 });
  const boot = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const gl = document.createElement('canvas').getContext('webgl2')!;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return { domContentLoaded: Math.round(nav.domContentLoadedEventEnd), gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown' };
  });
  console.log('boot', { ...boot, introGoneAfterMs: Date.now() - t0 });

  const results: Record<string, number[]> = {};
  const add = (k: string, v: number) => (results[k] ??= []).push(v);

  // pick a character (every part rebuilds)
  const chars = ['puff', 'splash', 'nova', 'pip'];
  for (let i = 0; i < RUNS; i++) add('character', await timed(page, 'character', () => page.click(`#chars .char[data-id="${chars[i % 4]}"]`)));

  add('enter Design', await timed(page, 'enter Design', () => page.click('#step-next')));
  await page.waitForSelector('#step-2:not([hidden])');

  // a swatch the colour rules allow and that is not the current one (Task 21 disables swatches that break a rule)
  const swatch = (card: string) => page.locator(`#card-${card} .swatch:not([aria-disabled="true"]):not([aria-pressed="true"])`).first();
  for (let i = 0; i < RUNS; i++) add('swatch (cap colour)', await timed(page, 'swatch', () => swatch('cap').click()));
  for (let i = 0; i < RUNS; i++) add('simple tile (grip)', await timed(page, 'grip', () => page.locator('#card-grip .tile:not(.upload)').nth(i % 4).click()));
  for (let i = 0; i < RUNS; i++) add('cap tile', await timed(page, 'cap', () => page.locator('#card-cap .tile:not(.upload)').nth(i % 6).click()));
  // the head has no shapes since Task 21: its colour swatch is the head rebuild (pad + every bristle tuft)
  for (let i = 0; i < RUNS; i++) add('head rebuild (colour)', await timed(page, 'head', () => swatch('head').click()));
  const finishes = ['Satin', 'Speckle', 'Matte'];
  for (let i = 0; i < RUNS; i++) add('finish', await timed(page, 'finish', () => page.locator('#finishes button', { hasText: finishes[i % 3] }).click()));

  // stickers: arm, place on the handle (centre of the canvas), then rebuild parts with stickers on
  const canvas = (await page.locator('#stage canvas').boundingBox())!;
  const cx = canvas.x + canvas.width / 2, cy = canvas.y + canvas.height / 2;
  for (let i = 0; i < STICKERS; i++) {
    await page.locator('#sticker-tiles .tile').nth(i % 4).click();
    add('place sticker', await timed(page, 'place sticker', () => page.mouse.click(cx + ((i % 2) - 0.5) * 8, cy + (Math.floor(i / 2) - 1) * 30)));
  }
  const stickers = await page.locator('#sticker-list .list-row').count();
  for (let i = 0; i < RUNS; i++) add('head rebuild, stickers on', await timed(page, 'head+stickers', () => swatch('head').click()));
  for (let i = 0; i < RUNS; i++) add('handle colour, stickers on', await timed(page, 'swatch+stickers', () => swatch('handle').click()));
  for (let i = 0; i < RUNS; i++) add('grip tile, stickers on', await timed(page, 'grip+stickers', () => page.locator('#card-grip .tile:not(.upload)').nth(i % 4).click()));

  // name it
  add('enter Name it', await timed(page, 'enter Name it', () => page.click('#step-next')));
  await page.waitForSelector('#step-3:not([hidden])');
  await page.waitForTimeout(1500);
  for (const n of ['B', 'Bo', 'Bob', 'Bobb', 'Bobby']) {
    add('name keystroke', await timed(page, 'name', () => page.locator('#char-name').fill(n)));
  }
  await page.waitForTimeout(1500);

  const out = Object.fromEntries(Object.entries(results).map(([k, v]) => [k, stats(v)]));
  console.log('stickers placed', stickers);
  console.log(JSON.stringify(out, null, 2));

  const { longtasks, marks } = await page.evaluate(() => ({ longtasks: (window as any).__longtasks as LongTask[], marks: (window as any).__marks as { label: string; t: number }[] }));
  const labelAt = (t: number) => [...marks].reverse().find((m) => m.t <= t)?.label ?? 'boot';
  const byLabel: Record<string, { count: number; max: number; total: number }> = {};
  for (const lt of longtasks) {
    const l = labelAt(lt.start), b = (byLabel[l] ??= { count: 0, max: 0, total: 0 });
    b.count++; b.max = Math.max(b.max, Math.round(lt.dur)); b.total += Math.round(lt.dur);
  }
  console.log('long tasks by phase', JSON.stringify(byLabel, null, 2));
} finally {
  await browser.close();
}
