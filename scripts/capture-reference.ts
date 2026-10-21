import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * Captures the 17 parity shots (4 characters x 4 views + Nova taken apart).
 *   npm run capture-reference                         legacy build (port 3241) -> docs/reference
 *   npm run capture-reference -- --target new         new build (port 3240)    -> docs/reference/new
 *   ... --out <dir> overrides the output folder; --url <base> overrides the port (e.g. a production preview).
 *   ... --ids nova,splash --views front,iso --prefix a- --no-apart: a subset, file names prefixed (Task 19 looks;
 *   pass the look in the URL, e.g. --url 'http://localhost:3240/?look=a').
 * Both targets use the same crop: 1200x900 from the top-left of #stage at a 2100x1100 viewport, so the
 * stage chrome (undo/redo, toolbar) appears in both sets.
 */
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const target = arg('target') ?? 'legacy';
if (target !== 'legacy' && target !== 'new') throw new Error(`--target must be legacy or new, got ${target}`);
const OUT = arg('out') ?? (target === 'legacy' ? 'docs/reference' : 'docs/reference/new');
const URL = arg('url') ?? (target === 'legacy' ? 'http://localhost:3241/' : 'http://localhost:3240/');
const ids = arg('ids')?.split(',') ?? ['pip', 'puff', 'splash', 'nova'];
const ALL_VIEWS = ['front', 'side', 'back', 'iso'];
const views = arg('views')?.split(',') ?? ALL_VIEWS;
const PREFIX = arg('prefix') ?? '';
const APART = !process.argv.includes('--no-apart');

mkdirSync(OUT, { recursive: true });

/** Wait until the stage clip stops changing: two consecutive identical screenshots (camera lerp and pops done). */
async function settled(page: Page, clip: { x: number; y: number; width: number; height: number }, timeoutMs = 10_000) {
  const t0 = Date.now();
  let prev = await page.screenshot({ clip });
  while (Date.now() - t0 < timeoutMs) {
    await page.waitForTimeout(150);
    const next = await page.screenshot({ clip });
    if (next.equals(prev)) return next;
    prev = next;
  }
  console.warn(`  not settled after ${timeoutMs} ms, using the last frame`);
  return prev;
}

const browser = await chromium.launch({ headless: false });
try {
  // a fresh context each run: no stored design from an earlier session
  const page = await browser.newPage({ viewport: { width: 2100, height: 1100 } });
  await page.goto(URL);
  await page.waitForSelector('#intro', { state: 'detached', timeout: 60_000 });

  const clip = async () => {
    const box = await page.locator('#stage').boundingBox();
    if (!box || box.width < 1200 || box.height < 900) throw new Error(`stage too small: ${JSON.stringify(box)}`);
    return { x: box.x, y: box.y, width: 1200, height: 900 };
  };
  const shot = async (name: string) => {
    const png = await settled(page, await clip());
    writeFileSync(`${OUT}/${PREFIX}${name}.png`, png);
    console.log('wrote', `${OUT}/${PREFIX}${name}.png`);
  };

  for (const id of ids) {
    await page.click(`#chars .char[data-id="${id}"]`);
    await settled(page, await clip());
    for (const v of views) {
      await page.click(`#tb-views [data-view="${ALL_VIEWS.indexOf(v)}"]`);
      await shot(`${id}-${v}`);
    }
  }

  if (APART) {
  await page.click('#chars .char[data-id="nova"]');
  await settled(page, await clip());
  await page.click('#tb-views [data-view="3"]');
  await settled(page, await clip());
  await page.click('#tb-apart');
  await shot('nova-apart');
  }
} finally {
  await browser.close();
}
