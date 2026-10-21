import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { CHARACTERS } from '../src/data/characters';
import { PARTS } from '../src/data/parts';

// Needs `npm run dev` on port 3240. Headed so the render uses a real GPU.
const URL = process.env.TILES_URL ?? 'http://localhost:3240/?tiles';
const OUT = 'public/tiles';
const parts = Object.fromEntries(PARTS.map((p) => [p.id, Object.keys(p.options)])) as Record<string, string[]>;
const chars = Object.keys(CHARACTERS);
const MIN_BYTES = 2048; // an empty transparent render is far smaller


mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: false });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(URL);
  try {
    await page.waitForSelector('#intro', { state: 'detached', timeout: 60000 });
  } catch {
    const text = await page.locator('#intro').innerText().catch(() => '(no intro element text)');
    throw new Error(`Intro did not detach within 60 s. Intro text: ${text}`);
  }
  await page.waitForFunction(() => typeof (window as any).__renderTile === 'function', null, { timeout: 20000 });

  const save = async (name: string, render: () => Promise<string>) => {
    let dataUrl: string;
    try { dataUrl = await render(); } catch (e) { throw new Error(`Rendering ${name} failed: ${(e as Error).message}`); }
    const prefix = 'data:image/png;base64,';
    if (!dataUrl.startsWith(prefix)) throw new Error(`${name}: not a PNG data URL`);
    const png = Buffer.from(dataUrl.slice(prefix.length), 'base64');
    if (png.length < MIN_BYTES) throw new Error(`${name}: render looks empty (${png.length} bytes)`);
    const webp = await sharp(png).webp({ quality: 82 }).toBuffer();
    writeFileSync(`${OUT}/${name}.webp`, webp);
    console.log('wrote', name, webp.length, 'bytes');
  };

  for (const [part, styles] of Object.entries(parts)) {
    for (const style of styles) {
      await save(`${part}-${style}`, () => page.evaluate(([p, s]) => (window as any).__renderTile(p, s) as string, [part, style]));
    }
  }
  for (const id of chars) {
    await save(`char-${id}`, () => page.evaluate((i) => (window as any).__renderChar(i) as string, id));
  }
} finally {
  await browser.close();
}
