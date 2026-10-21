import sharp from 'sharp';
import type { OverlayOptions } from 'sharp';

/*
 * Task 19b: the before/after sheet, built to be read on a phone.
 *   npx tsx scripts/compare-final.ts
 * Columns: parity (docs/reference/new, the Task 18 render) and final (docs/reference/final, look b).
 * Rows: Nova front, Nova iso, Splash front, Splash iso, Pip iso. Each cell is the brush's own box (plus margin) cut
 * from the 1200x900 shot, so the brush fills the cell; big labels.
 */
const COLS = [
  ['docs/reference/new', 'Before (parity)'],
  ['docs/reference/final', 'After (look b)'],
] as const;
const ROWS = [
  ['nova', 'front'],
  ['nova', 'iso'],
  ['splash', 'front'],
  ['splash', 'iso'],
  ['pip', 'iso'],
] as const;
// the brush (with its floor shadow) inside the 1200x900 shot, per view: a 340x800 window around it
const CROP: Record<string, { left: number; top: number; width: number; height: number }> = {
  front: { left: 450, top: 75, width: 340, height: 800 },
  iso: { left: 470, top: 95, width: 340, height: 800 },
};
const CW = 510, CH = 1200, LABEL = 130, GAP = 8;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const text = (w: number, h: number, s: string, size: number, weight: number, fill: string, anchor: 'middle' | 'start') =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<text x="${anchor === 'middle' ? w / 2 : 20}" y="${h / 2}" dominant-baseline="central" text-anchor="${anchor}" ` +
      `font-family="Helvetica, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(s)}</text></svg>`,
  );

const W = COLS.length * CW + (COLS.length - 1) * GAP;
const H = LABEL + ROWS.length * (CH + GAP);
const layers: OverlayOptions[] = [];
COLS.forEach(([, label], c) => layers.push({ input: text(CW, LABEL, label, 56, 700, '#252525', 'middle'), left: c * (CW + GAP), top: 0 }));
for (const [r, [who, view]] of ROWS.entries()) {
  for (const [c, [dir]] of COLS.entries()) {
    const left = c * (CW + GAP), top = LABEL + GAP + r * (CH + GAP);
    const img = await sharp(`${dir}/${who}-${view}.png`).extract(CROP[view]).resize(CW, CH).png().toBuffer();
    layers.push({ input: img, left, top });
    const tag = `${who[0].toUpperCase()}${who.slice(1)} · ${view}`;
    layers.push({ input: text(CW, 80, tag, 44, 600, '#4a4640', 'start'), left, top: top + 6 });
  }
}
await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
  .composite(layers)
  .png()
  .toFile('docs/reference/final/compare.png');
console.log('wrote docs/reference/final/compare.png', `${W}x${H}`);
