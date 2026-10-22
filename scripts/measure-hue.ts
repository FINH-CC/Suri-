import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { hexHsl } from '../src/three/details';
import { SETS, toneOf } from '../src/data/palette';

/*
 * Task 22: hue drift of the 8 palette tones as rendered (mid-tones), per set.
 *   npx vite --port 3240 &   (dev build: needs window.__scene)
 *   npx tsx scripts/measure-hue.ts [--url http://localhost:3240/] [--finish satin|own]
 * Front view, cap hidden. Samples a 9x9 patch (median) on the handle's core below the seam (y 13.6) and on the
 * head's neck (y 15.2), on the brush's axis, and compares the rendered hue with the swatch's hue (both sRGB HSL).
 * Characters: Pip (Green B), Puff (Lilac B), Splash (Coral A), Nova (Yellow B), so every set shows both tones.
 */
const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const URL = arg('url') ?? 'http://localhost:3240/';
const FINISH = arg('finish') ?? 'satin';
const POINTS: [part: 'handle' | 'head', y: number][] = [['handle', 13.6], ['head', 15.2]];

const hueOf = (rgb: number[]) => {
  const hex = '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  return hexHsl(hex);
};
const dh = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

const browser = await chromium.launch({ headless: false });
const rows: string[] = [];
const worst: Record<string, number> = {};
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(URL);
  await page.waitForSelector('#intro', { state: 'detached', timeout: 60_000 });
  for (const id of ['pip', 'puff', 'splash', 'nova']) {
    await page.click(`#chars .char[data-id="${id}"]`);
    await page.waitForTimeout(2500);
    const info = await page.evaluate(
      ([finish, pts]) => {
        const s = (window as any).__scene;
        const d = s.design;
        if (finish !== 'own' && d.finish !== finish) s.applyDesign({ ...d, finish }, d);
        s.camTo = null;
        s.userMoved = true;
        s.camera.position.set(0, 12, 50);
        s.controls.target.set(0, 11.5, 0);
        s.controls.update();
        s.groups.cap.visible = false;
        s.invalidateShadows();
        const r = s.renderer.domElement.getBoundingClientRect();
        const cam = s.camera;
        cam.updateMatrixWorld();
        const V = cam.position.constructor;
        const px = (pts as [string, number][]).map(([part, y]) => {
          const v = new V(0, y, 0).project(cam);
          return { part, x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
        });
        return { px, colours: s.design.colours, finish: s.design.finish };
      },
      [FINISH, POINTS] as const,
    );
    await page.waitForTimeout(1500);
    const png = await page.screenshot();
    for (const p of info.px) {
      const { data } = await sharp(png)
        .extract({ left: Math.round(p.x) - 4, top: Math.round(p.y) - 4, width: 9, height: 9 })
        .raw()
        .toBuffer({ resolveWithObject: true });
      const px: number[][] = [];
      for (let i = 0; i < 81; i++) px.push([data[i * 3], data[i * 3 + 1], data[i * 3 + 2]]);
      px.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
      const med = px[40];
      const hex: string = info.colours[p.part];
      const [h0, s0, l0] = hexHsl(hex);
      const [h1, s1, l1] = hueOf(med);
      const t = toneOf(hex)!;
      const drift = dh(h0, h1);
      const key = `${SETS[t.set].name} ${t.tone}`;
      worst[key] = Math.max(worst[key] ?? 0, drift);
      rows.push(
        `${id.padEnd(6)} ${info.finish.padEnd(7)} ${p.part.padEnd(6)} ${key.padEnd(13)} ${hex} hue ${h0.toFixed(1)} -> ${h1.toFixed(1)}  drift ${drift.toFixed(1)}  sat ${s0.toFixed(2)}->${s1.toFixed(2)}  light ${l0.toFixed(2)}->${l1.toFixed(2)}`,
      );
    }
  }
} finally {
  await browser.close();
}
console.log(rows.join('\n'));
console.log('max drift per tone:', JSON.stringify(Object.fromEntries(Object.entries(worst).map(([k, v]) => [k, +v.toFixed(1)]))));
