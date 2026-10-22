import { CHARACTERS, DEFAULT } from '../data/characters';
import type { CharacterId, DesignData, Sticker } from '../data/characters';
import { check } from '../data/colourRules';
import { SWATCHES } from '../data/palette';
import { FINISHES, PART, PARTS, STICKERS } from '../data/parts';
import type { PartId } from '../data/parts';

export type Design = DesignData;
export type { Sticker };

const has = (o: object, k: unknown): k is string => typeof k === 'string' && Object.hasOwn(o, k);
/** Names: at most 14 characters (code points, so an emoji is never split in half), no angle brackets. */
export const cleanName = (v: unknown): string => Array.from(String(v || '').replace(/[<>]/g, '')).slice(0, 14).join('');
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

/** Coerce anything (hash, storage, user input) into a well-formed Design. */
export function validate(input: unknown, opts: { uploads?: Partial<Record<PartId, boolean>> } = {}): Design {
  const s = rec(input);
  const sp = rec(s.parts);
  const sc = rec(s.colours);
  const parts = {} as Design['parts'];
  const colours = {} as Design['colours'];
  for (const p of PARTS) {
    const v = sp[p.id];
    parts[p.id] = (v === 'upload' && opts.uploads?.[p.id]) || has(p.options, v) ? (v as string) : DEFAULT.parts[p.id];
    const c = typeof sc[p.id] === 'string' ? (sc[p.id] as string).toLowerCase() : '';
    colours[p.id] = SWATCHES.some((w) => w[0] === c) ? c : ''; // not a swatch: the whole brush is repaired below
  }
  const character = has(CHARACTERS, s.character) ? (s.character as CharacterId) : '';
  // never an invalid brush (legacy link, old saved design, unknown colour): use the character's colours, or the default's
  if (!check(colours).ok) Object.assign(colours, character ? CHARACTERS[character].colours : DEFAULT.colours);
  const stickers: Sticker[] = [];
  if (Array.isArray(s.stickers)) {
    for (const raw of s.stickers.slice(0, 40)) {
      const t = rec(raw);
      if (!has(STICKERS, t.t) || !has(PART, t.p)) continue;
      const pos = [t.x, t.y, t.z, t.nx, t.ny, t.nz].map((v) => +(v as number));
      if (!pos.every(Number.isFinite)) continue; // a sticker with no place on the brush is dropped
      const [x, y, z, nx, ny, nz] = pos;
      stickers.push({
        t: t.t as Sticker['t'], p: t.p as PartId, x, y, z, nx, ny, nz,
        s: clamp(+(t.s as number) || 0.9, 0.4, 2), r: clamp(+(t.r as number) || 0, -180, 180),
      });
    }
  }
  return {
    parts, colours, stickers,
    name: cleanName(s.name),
    finish: has(FINISHES, s.finish) ? (s.finish as Design['finish']) : 'matte',
    character,
  };
}

/** Share-link payload; uploads cannot travel so they fall back to defaults. */
export function encode(d: Design): string {
  const parts = {} as Record<PartId, string>;
  for (const p of PARTS) parts[p.id] = d.parts[p.id] === 'upload' ? DEFAULT.parts[p.id] : d.parts[p.id];
  const o = { parts, colours: d.colours, stickers: d.stickers, name: d.name, finish: d.finish, character: d.character };
  return btoa(unescape(encodeURIComponent(JSON.stringify(o))));
}

export function decode(hash: string): Design | null {
  const b64 = hash.startsWith('#d=') ? hash.slice(3) : hash.startsWith('d=') ? hash.slice(2) : hash;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(escape(atob(b64))));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return validate(parsed);
  } catch {
    return null;
  }
}
