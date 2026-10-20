import { describe, expect, it } from 'vitest';
import { DEFAULT } from '../../src/data/characters';
import { PARTS } from '../../src/data/parts';
import { decode, encode, validate } from '../../src/state/design';

describe('validate', () => {
  it('empty input gives defaults with no character', () => {
    const v = validate({});
    expect(v.parts).toEqual(DEFAULT.parts);
    expect(v.colours).toEqual(DEFAULT.colours);
    expect(v.character).toBe('');
    expect(v.finish).toBe('matte');
  });
  it('rejects bad options and stickers', () => {
    const v = validate({ parts: { cap: 'nope' }, stickers: [{ t: 'ghost', p: 'cap' }] });
    expect(v.parts.cap).toBe(DEFAULT.parts.cap);
    expect(v.stickers.length).toBe(0);
  });
  it('sanitises name', () => {
    expect(validate({ name: 'a<b>cdefghijklmnopq' }).name).toBe('abcdefghijklmn');
  });
  it('upload only kept when flagged', () => {
    expect(validate({ parts: { cap: 'upload' } }).parts.cap).toBe(DEFAULT.parts.cap);
    expect(validate({ parts: { cap: 'upload' } }, { uploads: { cap: true } }).parts.cap).toBe('upload');
  });
  it('keeps valid stickers with defaults', () => {
    const v = validate({ stickers: [{ t: 'star', p: 'cap', x: 1, y: 2, z: 3, nx: 0, ny: 1, nz: 0 }] });
    expect(v.stickers[0]).toEqual({ t: 'star', p: 'cap', x: 1, y: 2, z: 3, nx: 0, ny: 1, nz: 0, s: 0.9, r: 0 });
  });
});

describe('encode/decode', () => {
  it('round-trips DEFAULT', () => {
    expect(decode(encode(DEFAULT))).toEqual(DEFAULT);
    expect(decode('#d=' + encode(DEFAULT))).toEqual(DEFAULT);
  });
  it('replaces uploads with defaults', () => {
    const d = { ...DEFAULT, parts: { ...DEFAULT.parts, cap: 'upload' } };
    expect(decode(encode(d))!.parts.cap).toBe(DEFAULT.parts.cap);
  });
  it('returns null for garbage', () => {
    expect(decode('#d=not-base64!')).toBeNull();
    expect(decode('#d=' + btoa('nope'))).toBeNull();
  });
  it('decodes the exact legacy hash', () => {
    const h = '#d=' + btoa(unescape(encodeURIComponent(JSON.stringify({ parts: { cap: 'cloud' } }))));
    expect(decode(h)!.parts.cap).toBe('cloud');
  });
});

describe('extra', () => {
  it('encode matches the legacy bytes', () => {
    const parts: Record<string, string> = {};
    PARTS.forEach((p) => (parts[p.id] = DEFAULT.parts[p.id]));
    const legacy = btoa(unescape(encodeURIComponent(JSON.stringify({ parts, colours: DEFAULT.colours, stickers: [], name: 'Nova', finish: DEFAULT.finish, character: 'nova' }))));
    expect(encode(DEFAULT)).toBe(legacy);
  });
  it('lowercases colours', () => {
    expect(validate({ colours: { cap: '#ADAAE1' } }).colours.cap).toBe('#adaae1');
  });
  it('skips bad stickers and caps at 40', () => {
    expect(validate({ stickers: 'x' }).stickers).toEqual([]);
    expect(validate({ stickers: [null] }).stickers).toEqual([]);
    const st = Array.from({ length: 45 }, () => ({ t: 'star', p: 'cap', x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 1 }));
    expect(validate({ stickers: st }).stickers.length).toBe(40);
  });
  it('decode rejects non-objects', () => {
    for (const v of ['null', '[]', '5']) expect(decode(btoa(v))).toBeNull();
  });
  it('legacy link with unknown option gives default', () => {
    const h = '#d=' + btoa(JSON.stringify({ parts: { cap: 'zzz' } }));
    expect(decode(h)!.parts.cap).toBe(DEFAULT.parts.cap);
  });
});
