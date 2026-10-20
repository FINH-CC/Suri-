import { CHARACTERS, DEFAULT } from '../data/characters';
import type { CharacterId, DesignData, Sticker } from '../data/characters';
import { SWATCHES } from '../data/palette';
import { FINISHES, PART, PARTS, STICKERS } from '../data/parts';
import type { PartId } from '../data/parts';

export type Design = DesignData;
export type { Sticker };

const has = (o: object, k: unknown): k is string => typeof k === 'string' && Object.hasOwn(o, k);
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
    colours[p.id] = SWATCHES.some((w) => w[0] === c) ? c : DEFAULT.colours[p.id];
  }
  const stickers: Sticker[] = [];
  if (Array.isArray(s.stickers)) {
    for (const raw of s.stickers.slice(0, 40)) {
      const t = rec(raw);
      if (has(STICKERS, t.t) && has(PART, t.p)) {
        stickers.push({
          t: t.t as Sticker['t'], p: t.p as PartId,
          x: +(t.x as number), y: +(t.y as number), z: +(t.z as number),
          nx: +(t.nx as number), ny: +(t.ny as number), nz: +(t.nz as number),
          s: +(t.s as number) || 0.9, r: +(t.r as number) || 0,
        });
      }
    }
  }
  return {
    parts, colours, stickers,
    name: String(s.name || '').replace(/[<>]/g, '').slice(0, 14),
    finish: has(FINISHES, s.finish) ? (s.finish as Design['finish']) : 'matte',
    character: has(CHARACTERS, s.character) ? (s.character as CharacterId) : '',
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
    return validate(JSON.parse(decodeURIComponent(escape(atob(b64)))));
  } catch {
    return null;
  }
}
