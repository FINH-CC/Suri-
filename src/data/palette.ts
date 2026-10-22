import type { PartId } from './parts';

// SURI Kids palette: four colour sets, each with a light and a dark tone. No neutral swatch.
export type SetId = 'lilac' | 'yellow' | 'green' | 'coral';

export const SETS: Record<SetId, { name: string; light: string; dark: string }> = {
  lilac: { name: 'Lilac', light: '#dfd7ef', dark: '#adaae1' },
  yellow: { name: 'Yellow', light: '#fae59d', dark: '#fbbe6e' },
  green: { name: 'Green', light: '#d0e3cf', dark: '#66bf8d' },
  coral: { name: 'Coral', light: '#fda691', dark: '#e86239' },
};
export const SET_IDS = Object.keys(SETS) as SetId[];

/** Bristles stay off-white; not a swatch. */
export const BRISTLE = '#f5f5f0';
/** Soft neutral the dev tile renderer paints option tiles with; not a swatch. */
export const N = '#ebeaeb';

/** The 8 tones in set order (light, dark). */
export const SWATCHES: [hex: string, name: string][] = [];
for (const s of Object.values(SETS)) SWATCHES.push([s.light, s.name + ' light'], [s.dark, s.name]);

/** Which set a swatch belongs to and whether it is the light or the dark tone; null for anything else. */
export function toneOf(hex: string): { set: SetId; tone: 'light' | 'dark' } | null {
  const h = hex.toLowerCase();
  for (const id of SET_IDS) {
    if (SETS[id].light === h) return { set: id, tone: 'light' };
    if (SETS[id].dark === h) return { set: id, tone: 'dark' };
  }
  return null;
}

export interface Preset { name: string; c: Record<PartId, string> }

/** Head, cap and grip share one colour; handle and mount share another; the button has its own. */
const build = (name: string, head: string, handle: string, button: string): Preset => ({
  name,
  c: { cap: head, head, grip: head, handle, button, mount: handle },
});

/** "Same set": A = dark on head, button, cap, grip + light on handle, mount; B = the reverse. */
export const SAME_SET: Preset[] = [];
for (const s of Object.values(SETS)) {
  SAME_SET.push({ name: `${s.name} A`, c: { cap: s.dark, head: s.dark, grip: s.dark, button: s.dark, handle: s.light, mount: s.light } });
  SAME_SET.push({ name: `${s.name} B`, c: { cap: s.light, head: s.light, grip: s.light, button: s.light, handle: s.dark, mount: s.dark } });
}

/** "Mix and match", from the client's sheet (head / handle / button; cap and grip follow the head, mount the handle). */
const { lilac, yellow, green, coral } = SETS;
export const MIX: Preset[] = [
  build('Mix 1', lilac.dark, green.light, green.dark),
  build('Mix 2', yellow.light, yellow.dark, coral.dark),
  build('Mix 3', coral.dark, green.light, coral.light),
  build('Mix 4', green.light, green.dark, yellow.light),
  build('Mix 5', lilac.dark, lilac.light, coral.light),
];

export const PRESET_GROUPS: { title: string; sub: string; presets: Preset[] }[] = [
  { title: 'Same set', sub: 'Each colour set has a light and a dark tone. Pairing them on one brush keeps it simple.', presets: SAME_SET },
  { title: 'Mix and match', sub: 'Kids can mix tones across two colour sets to make the brush their own.', presets: MIX },
];

export const PRESETS: Preset[] = [...SAME_SET, ...MIX];

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
