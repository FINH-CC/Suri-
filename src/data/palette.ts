import type { PartId } from './parts';

// SURI Kids palette: one soft neutral + four colour families (light + bold)
export const N = '#ebeaeb';

export type FamId = 'lilac' | 'green' | 'coral' | 'yellow' | 'blue';

export const FAM: Record<FamId, { name: string; light: string; bold: string }> = {
  lilac: { name: 'Lilac', light: '#dfd7ef', bold: '#adaae1' },
  green: { name: 'Green', light: '#d0e3cf', bold: '#66bf8d' },
  coral: { name: 'Coral', light: '#fda691', bold: '#e86239' },
  yellow: { name: 'Yellow', light: '#fae59d', bold: '#fbbe6e' },
  blue: { name: 'Blue', light: '#d3e3f4', bold: '#6fa5dc' },
};

export const SWATCHES: [hex: string, name: string][] = [[N, 'Soft neutral']];
Object.values(FAM).forEach((f) => {
  SWATCHES.push([f.light, f.name + ' light'], [f.bold, f.name]);
});

// Each family has two pairings: A = bold + soft neutral (calmer), B = bold + its light tint.
// Bold goes on the playful parts (cap, grip, charm); the pairing colour on head, handle and mount.
export const PRESETS: { name: string; c: Record<PartId, string> }[] = [];
Object.values(FAM).forEach((f) => {
  (
    [
      ['A', N],
      ['B', f.light],
    ] as [string, string][]
  ).forEach(([v, second]) =>
    PRESETS.push({
      name: `${f.name} ${v}`,
      c: { cap: f.bold, grip: f.bold, charm: f.bold, button: f.bold, head: second, handle: second, mount: second },
    }),
  );
});

export const HEX = /^#[0-9a-f]{6}$/i;

export function swatchName(hex: string): string {
  const s = SWATCHES.find(([h]) => h.toLowerCase() === hex.toLowerCase());
  return s ? s[1] : hex.toUpperCase();
}

const channels = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Per-channel sRGB lerp (matches r128 THREE.Color.lerp on as-given values). Returns lowercase #rrggbb. */
export function mixHex(a: string, b: string, t: number): string {
  const ca = channels(a);
  const cb = channels(b);
  const out = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Luminance on sRGB values as given (no gamma), as legacy line 678. */
export function lum(hex: string): number {
  const [r, g, b] = channels(hex);
  return 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
}
