import { describe, expect, it } from 'vitest';
import { CHARACTERS, DEFAULT } from '../../src/data/characters';
import { check } from '../../src/data/colourRules';
import { cleanName, decode, encode, validate } from '../../src/state/design';

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
  it('legacy head styles become plain', () => {
    expect(validate({ parts: { head: 'ears' } }).parts.head).toBe('plain');
    expect(validate({ parts: { head: 'spots' } }).parts.head).toBe('plain');
  });
  it('repairs a brush that breaks the colour rules with the character colours, else the default', () => {
    const bad = { cap: '#adaae1', head: '#66bf8d', grip: '#adaae1', handle: '#dfd7ef', button: '#adaae1', mount: '#dfd7ef' }; // two dark sets
    expect(check(bad).ok).toBe(false);
    expect(validate({ colours: bad, character: 'pip' }).colours).toEqual(CHARACTERS.pip.colours);
    expect(validate({ colours: bad }).colours).toEqual(DEFAULT.colours);
    // the old neutral and blue are no longer swatches: the whole brush is repaired, not one part
    const legacy = { cap: '#6fa5dc', head: '#ebeaeb', grip: '#6fa5dc', handle: '#ebeaeb', button: '#6fa5dc', mount: '#ebeaeb' };
    expect(validate({ colours: legacy, character: 'splash' }).colours).toEqual(CHARACTERS.splash.colours);
    expect(validate({ colours: { ...CHARACTERS.blank.colours, cap: '#ebeaeb' }, character: 'blank' }).colours).toEqual(CHARACTERS.blank.colours);
  });
  it('keeps a valid brush as it is', () => {
    const ok = { cap: '#adaae1', head: '#adaae1', grip: '#adaae1', handle: '#d0e3cf', button: '#66bf8d', mount: '#d0e3cf' }; // Mix 1
    expect(validate({ colours: ok, character: 'pip' }).colours).toEqual(ok);
  });
  it('sanitises name', () => {
    expect(validate({ name: 'a<b>cdefghijklmnopq' }).name).toBe('abcdefghijklmn');
  });
  it('truncates names by code point, never splitting an emoji', () => {
    expect(validate({ name: '😀'.repeat(20) }).name).toBe('😀'.repeat(14));
    expect(cleanName('abcdefghijklm😀x')).toBe('abcdefghijklm😀');
  });
  it('clamps sticker size and rotation, drops stickers with non-finite positions', () => {
    const at = { t: 'star', p: 'cap', x: 1, y: 2, z: 3, nx: 0, ny: 1, nz: 0 };
    const v = validate({ stickers: [{ ...at, s: 9, r: 400 }, { ...at, s: 0.1, r: -999 }, { ...at, x: 'nope' }, { ...at, nz: Infinity }, { ...at, y: undefined }] });
    expect(v.stickers.map((st) => [st.s, st.r])).toEqual([[2, 180], [0.4, -180]]);
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
    const P = DEFAULT.parts;
    const parts = { cap: P.cap, head: P.head, grip: P.grip, handle: P.handle, button: P.button, mount: P.mount };
    const legacy = btoa(unescape(encodeURIComponent(JSON.stringify({ parts, colours: DEFAULT.colours, stickers: [], name: 'Nova', finish: DEFAULT.finish, character: 'nova' }))));
    expect(encode(DEFAULT)).toBe(legacy);
    const out = JSON.parse(decodeURIComponent(escape(atob(encode(DEFAULT)))));
    expect('charm' in out.parts).toBe(false);
    expect('charm' in out.colours).toBe(false);
  });
  it('a legacy link carrying a charm validates without it and never throws', () => {
    const legacy = {
      parts: { ...DEFAULT.parts, charm: 'star' },
      colours: { ...DEFAULT.colours, charm: '#adaae1' },
      stickers: [
        { t: 'star', p: 'charm', x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 1 },
        { t: 'heart', p: 'cap', x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 1 },
      ],
      name: 'Nova', finish: DEFAULT.finish, character: 'nova',
    };
    let v!: ReturnType<typeof validate>;
    expect(() => (v = validate(legacy))).not.toThrow();
    expect('charm' in v.parts).toBe(false);
    expect('charm' in v.colours).toBe(false);
    expect(v.stickers.map((s) => s.p)).toEqual(['cap']);
    expect(v.parts).toEqual(DEFAULT.parts);
    const d = decode('#d=' + btoa(unescape(encodeURIComponent(JSON.stringify(legacy)))));
    expect(d).not.toBeNull();
    expect('charm' in d!.parts).toBe(false);
    expect(d!.stickers.length).toBe(1);
  });
  it('lowercases colours', () => {
    const up = Object.fromEntries(Object.entries(CHARACTERS.puff.colours).map(([k, v]) => [k, v.toUpperCase()]));
    expect(validate({ colours: up }).colours).toEqual(CHARACTERS.puff.colours);
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
