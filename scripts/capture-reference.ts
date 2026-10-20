import { chromium } from '@playwright/test';

const OUT = 'docs/reference';
const ids = ['pip', 'puff', 'splash', 'nova'];
const views = ['front', 'side', 'back', 'iso'];

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 2100, height: 1100 } });
await page.goto('http://localhost:3241/');
await page.waitForSelector('#intro', { state: 'detached', timeout: 20000 });

const shot = async (name: string) => {
  const box = await page.locator('#stage').boundingBox();
  if (!box || box.width < 1200 || box.height < 900) {
    throw new Error(`stage too small: ${JSON.stringify(box)}`);
  }
  await page.screenshot({
    path: `${OUT}/${name}.png`,
    clip: { x: box.x, y: box.y, width: 1200, height: 900 },
  });
  console.log('wrote', name);
};

for (const id of ids) {
  await page.click(`#chars .char[data-id="${id}"]`);
  await page.waitForTimeout(800);
  for (let i = 0; i < views.length; i++) {
    await page.click(`#tb-views [data-view="${i}"]`);
    await page.waitForTimeout(1200);
    await shot(`${id}-${views[i]}`);
  }
}

await page.click('#chars .char[data-id="nova"]');
await page.waitForTimeout(800);
await page.click('#tb-views [data-view="3"]');
await page.waitForTimeout(1200);
await page.click('#tb-apart');
await page.waitForTimeout(1200);
await shot('nova-apart');

await browser.close();
