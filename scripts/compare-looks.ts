import sharp from 'sharp';
import type { OverlayOptions } from 'sharp';

/*
 * Task 19: the side-by-side sheet of the studio looks.
 *   npx tsx scripts/compare-looks.ts [--dir docs/reference/looks]
 * Reads <look>-<character>-<view>.png (written by capture-reference with --prefix <look>-) and writes compare.png:
 * 4 columns (parity, a, b, c) x 4 rows (Nova front, Nova iso, Splash front, Splash iso) of 600x450 thumbnails under
 * a label row. Each thumbnail is the brush's 4:3 neighbourhood of the 1200x900 shot, so the brush fills its height.
 */
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const DIR = arg('dir') ?? 'docs/reference/looks';
const LOOKS = [
  ['parity', 'Parity (today)'],
  ['a', 'a · Soft studio'],
  ['b', 'b · Product hero'],
  ['c', 'c · Bright & playful'],
] as const;
const ROWS = [
  ['nova', 'front'],
  ['nova', 'iso'],
  ['splash', 'front'],
  ['splash', 'iso'],
] as const;
const TW = 600, TH = 450, LABEL = 96, GAP = 6;
// the brush sits around x 615 in every shot; a 1066x800 window (4:3) holds it top to bottom
const CROP = { left: 82, top: 60, width: 1066, height: 800 };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const text = (w: number, h: number, s: string, size: number, weight = 600, fill = '#252525', anchor = 'middle') =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<text x="${anchor === 'middle' ? w / 2 : 14}" y="${h / 2}" dominant-baseline="central" text-anchor="${anchor}" ` +
      `font-family="Helvetica, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(s)}</text></svg>`,
  );

const W = LOOKS.length * TW + (LOOKS.length - 1) * GAP;
const H = LABEL + ROWS.length * TH + ROWS.length * GAP;
const layers: OverlayOptions[] = [];
LOOKS.forEach(([, label], c) => layers.push({ input: text(TW, LABEL, label, 44), left: c * (TW + GAP), top: 0 }));
for (const [r, [who, view]] of ROWS.entries()) {
  for (const [c, [look]] of LOOKS.entries()) {
    const left = c * (TW + GAP), top = LABEL + GAP + r * (TH + GAP);
    const img = await sharp(`${DIR}/${look}-${who}-${view}.png`).extract(CROP).resize(TW, TH).png().toBuffer();
    layers.push({ input: img, left, top });
    const tag = `${who[0].toUpperCase()}${who.slice(1)} · ${view}`;
    layers.push({ input: text(260, 48, tag, 26, 500, '#5a5650', 'start'), left, top: top + 4 });
  }
}
await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
  .composite(layers)
  .png()
  .toFile(`${DIR}/compare.png`);
console.log('wrote', `${DIR}/compare.png`, `${W}x${H}`);
