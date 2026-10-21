import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

// Needs `npm run dev` on port 3240. Headed so the render uses a real GPU.
const URL = process.env.TILES_URL ?? 'http://localhost:3240/?tiles';
const OUT = 'public/tiles';
const parts: Record<string, string[]> = {
  cap: ['bubble', 'sprout', 'bear', 'hat', 'bunny', 'cloud'],
  head: ['plain', 'ears', 'spots'],
  grip: ['smooth', 'ribs', 'dots', 'rings'],
  handle: ['core'],
  button: ['core'],
  mount: ['original', 'cloud', 'arch'],
};
const chars = ['pip', 'puff', 'splash', 'nova', 'blank'];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(URL);
await page.waitForSelector('#intro', { state: 'detached', timeout: 60000 });
await page.waitForFunction(() => typeof (window as any).__renderTile === 'function', null, { timeout: 20000 });

const save = async (name: string, dataUrl: string) => {
  const png = Buffer.from(dataUrl.split(',')[1], 'base64');
  const webp = await sharp(png).webp({ quality: 82 }).toBuffer();
  writeFileSync(`${OUT}/${name}.webp`, webp);
  console.log('wrote', name, webp.length, 'bytes');
};

for (const [part, styles] of Object.entries(parts)) {
  for (const style of styles) {
    const url = await page.evaluate(([p, s]) => (window as any).__renderTile(p, s) as string, [part, style]);
    await save(`${part}-${style}`, url);
  }
}
for (const id of chars) {
  const url = await page.evaluate((i) => (window as any).__renderChar(i) as string, id);
  await save(`char-${id}`, url);
}
await browser.close();
