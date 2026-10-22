import sharp from 'sharp';
import type { OverlayOptions } from 'sharp';

/*
 * Task 22: before/after sheet for the render match, built to be read on a phone.
 *   npx tsx scripts/compare-render-match.ts
 * Inputs (captured as described in the Task 22 report):
 *   docs/reference/render-match/{before,after}/<who>-front.png   1200x900 stage shots (capture-reference --views front,iso)
 *   docs/reference/render-match/closeups/{before,after}/*.png    700x700 close-up crops
 *   docs/reference/render-match/client-bristles-reference.png    the client's bristle reference
 * Columns: before (look b at 3fef73e) and after. Rows: Pip, Puff, Splash, Nova front; close-ups of the button,
 * the wordmark, the seam, the bristles (front and 3/4); last row: the client's bristle reference next to ours.
 */
const DIR = 'docs/reference/render-match';
const CW = 510, LABEL = 130, GAP = 8, TAG = 80;
const FRONT = { left: 450, top: 75, width: 340, height: 800 }; // the brush in a 1200x900 front shot
const FRONT_H = 1200, CLOSE_H = 510;

type Cell = { file: string; crop?: typeof FRONT; h: number; tag: string };
type Row = [Cell, Cell];
const front = (who: string): Row =>
  (['before', 'after'] as const).map((s) => ({ file: `${DIR}/${s}/${who}-front.png`, crop: FRONT, h: FRONT_H, tag: `${who[0].toUpperCase()}${who.slice(1)} · front` })) as Row;
const close = (name: string, tag: string): Row =>
  (['before', 'after'] as const).map((s) => ({ file: `${DIR}/closeups/${s}/${name}.png`, h: CLOSE_H, tag })) as Row;

const ROWS: Row[] = [
  front('pip'),
  front('puff'),
  front('splash'),
  front('nova'),
  close('nova-btn', 'Button'),
  close('nova-low', 'Wordmark'),
  close('nova-seam', 'Seam + head gloss'),
  close('puff-brf', 'Bristles · front'),
  close('puff-br34', 'Bristles · 3/4'),
  close('splash-br34', 'Bristles · tint'),
  [
    { file: `${DIR}/client-bristles-reference.png`, h: CLOSE_H, tag: 'Client reference' },
    { file: `${DIR}/closeups/after/puff-br34.png`, h: CLOSE_H, tag: 'After' },
  ],
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const text = (w: number, h: number, s: string, size: number, weight: number, fill: string, anchor: 'middle' | 'start') =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<text x="${anchor === 'middle' ? w / 2 : 20}" y="${h / 2}" dominant-baseline="central" text-anchor="${anchor}" ` +
      `font-family="Helvetica, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" ` +
      `stroke="#ffffff" stroke-width="6" paint-order="stroke">${esc(s)}</text></svg>`,
  );

const W = 2 * CW + GAP;
const H = LABEL + ROWS.reduce((a, r) => a + r[0].h + GAP, 0);
const layers: OverlayOptions[] = [];
['Before', 'After'].forEach((label, c) => layers.push({ input: text(CW, LABEL, label, 56, 700, '#252525', 'middle'), left: c * (CW + GAP), top: 0 }));
let top = LABEL + GAP;
for (const row of ROWS) {
  for (const [c, cell] of row.entries()) {
    const left = c * (CW + GAP);
    let img = sharp(cell.file);
    if (cell.crop) img = img.extract(cell.crop);
    const buf = await img.resize(CW, cell.h, { fit: 'cover' }).png().toBuffer();
    layers.push({ input: buf, left, top });
    layers.push({ input: text(CW, TAG, cell.tag, 40, 600, '#3a3630', 'start'), left, top: top + 6 });
  }
  top += row[0].h + GAP;
}
await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
  .composite(layers)
  .png()
  .toFile(`${DIR}/compare.png`);
console.log(`wrote ${DIR}/compare.png`, `${W}x${H}`);
