import { describe, expect, it } from 'vitest';
import { CHARACTERS, DEFAULT } from '../../src/data/characters';
import { allowed, check, RULE_COPY, whyNot } from '../../src/data/colourRules';
import { MIX, PRESETS, SAME_SET, SETS, SWATCHES } from '../../src/data/palette';
import type { PartId } from '../../src/data/parts';

const { lilac, yellow, green, coral } = SETS;
type C = Record<PartId, string>;
const brush = (head: string, handle: string, button: string, extra: Partial<C> = {}): C =>
  ({ cap: head, head, grip: head, handle, button, mount: handle, ...extra });

describe('colour rules: check', () => {
  it('a same-set brush passes', () => {
    expect(check(brush(lilac.dark, lilac.light, lilac.dark))).toEqual({ ok: true, broken: [] });
  });
  it('at most two colour sets', () => {
    expect(check(brush(lilac.light, green.light, coral.light)).broken).toEqual(['sets']);
    expect(check(brush(lilac.light, green.light, green.dark)).ok).toBe(true);
  });
  it('a colour that is not a swatch counts as broken', () => {
    expect(check(brush(lilac.light, lilac.dark, '#ebeaeb')).broken).toContain('sets');
  });
  it('at least one light tone', () => {
    expect(check(brush(lilac.dark, lilac.dark, lilac.dark)).broken).toContain('light');
    expect(check(brush(lilac.dark, lilac.dark, lilac.dark, { mount: lilac.light })).broken).not.toContain('light');
  });
  it('the button never equals the handle', () => {
    expect(check(brush(lilac.dark, lilac.light, lilac.light)).broken).toEqual(['button']);
  });
  it('never two dark tones from different sets', () => {
    expect(check(brush(lilac.dark, green.dark, lilac.light)).broken).toEqual(['dark']);
    expect(check(brush(lilac.dark, lilac.light, lilac.dark, { grip: green.dark })).broken).toEqual(['dark']);
  });
  it('the button is the accent: its dark tone may come from the second set (client Mix 1 and Mix 2)', () => {
    expect(check(brush(lilac.dark, green.light, green.dark)).ok).toBe(true);
  });
  it('reports every broken rule', () => {
    expect(check({ cap: lilac.dark, head: green.dark, grip: coral.dark, handle: yellow.dark, button: yellow.dark, mount: lilac.dark }).broken)
      .toEqual(['sets', 'light', 'button', 'dark']);
  });
});

describe('colour rules: allowed', () => {
  it('lists the swatches that keep the design valid for one part', () => {
    const c = brush(lilac.dark, lilac.light, lilac.dark);
    // cap: either lilac tone, or a light tone of another set; never another set's dark
    expect(allowed(c, 'cap').sort()).toEqual([lilac.light, lilac.dark, yellow.light, green.light, coral.light].sort());
    // handle: not the button's colour; another set's light would make 2 sets (fine)
    expect(allowed(c, 'handle')).not.toContain(lilac.dark);
    expect(allowed(c, 'handle')).toContain(green.light);
    for (const h of allowed(c, 'mount')) expect(check({ ...c, mount: h }).ok).toBe(true);
  });
  it('whyNot names the rule', () => {
    const c = brush(lilac.dark, lilac.light, lilac.dark);
    expect(whyNot(c, 'cap', green.dark)).toBe(RULE_COPY.dark);
    expect(whyNot(c, 'handle', lilac.dark)).toBe(RULE_COPY.button);
    expect(whyNot(brush(lilac.light, green.light, green.dark), 'cap', coral.light)).toBe(RULE_COPY.sets);
    expect(whyNot(brush(lilac.dark, lilac.light, lilac.dark, { handle: lilac.dark, button: lilac.light, mount: lilac.dark }), 'button', lilac.dark))
      .toBe(RULE_COPY.light);
    expect(whyNot(c, 'cap', lilac.light)).toBe('');
  });
  it('rule copy', () => {
    expect(RULE_COPY).toEqual({
      sets: 'Max two colour sets', light: 'Needs one light tone',
      button: 'Button should stand out from the handle', dark: 'Only one dark colour set',
    });
  });
});

describe('presets and characters', () => {
  it('8 same-set + 5 mix presets, all passing', () => {
    expect(SAME_SET.map((p) => p.name)).toEqual(['Lilac A', 'Lilac B', 'Yellow A', 'Yellow B', 'Green A', 'Green B', 'Coral A', 'Coral B']);
    expect(MIX.map((p) => p.name)).toEqual(['Mix 1', 'Mix 2', 'Mix 3', 'Mix 4', 'Mix 5']);
    for (const p of PRESETS) expect(check(p.c), p.name).toEqual({ ok: true, broken: [] });
  });
  it('same set A: dark on head, button, cap, grip; light on handle, mount (B the reverse)', () => {
    expect(SAME_SET[0].c).toEqual({ cap: lilac.dark, head: lilac.dark, grip: lilac.dark, button: lilac.dark, handle: lilac.light, mount: lilac.light });
    expect(SAME_SET[1].c).toEqual({ cap: lilac.light, head: lilac.light, grip: lilac.light, button: lilac.light, handle: lilac.dark, mount: lilac.dark });
  });
  it('mix presets follow the client sheet', () => {
    expect(MIX.map((p) => [p.c.head, p.c.handle, p.c.button])).toEqual([
      [lilac.dark, green.light, green.dark], [yellow.light, yellow.dark, coral.dark], [coral.dark, green.light, coral.light],
      [green.light, green.dark, yellow.light], [lilac.dark, lilac.light, coral.light],
    ]);
    for (const p of MIX) {
      expect([p.c.cap, p.c.grip]).toEqual([p.c.head, p.c.head]);
      expect(p.c.mount).toBe(p.c.handle);
    }
  });
  it('every character and the default pass', () => {
    for (const [id, c] of Object.entries(CHARACTERS)) expect(check(c.colours).ok, id).toBe(true);
    expect(check(DEFAULT.colours).ok).toBe(true);
  });
  it('8 swatches, no neutral, no blue', () => {
    expect(SWATCHES.map(([, n]) => n)).toEqual(['Lilac light', 'Lilac', 'Yellow light', 'Yellow', 'Green light', 'Green', 'Coral light', 'Coral']);
  });
});
