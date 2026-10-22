import { SWATCHES, toneOf } from './palette';
import type { SetId } from './palette';
import { PARTS } from './parts';
import type { PartId } from './parts';

/* The colour rules for a whole brush (all six parts). Pure: no DOM, no store. */

export type RuleId = 'sets' | 'light' | 'button' | 'dark';

/** What a disabled swatch says about why it can't be picked. */
export const RULE_COPY: Record<RuleId, string> = {
  sets: 'Max two colour sets',
  light: 'Needs one light tone',
  button: 'Button should stand out from the handle',
  dark: 'Only one dark colour set',
};

/**
 * Parts counted by the "only one dark colour set" rule. The button is the brush's accent and is left out: the
 * client's own Mix 1 and Mix 2 put a second set's dark tone on the button (see the Task 21 report).
 */
const DARK_RULE_PARTS: PartId[] = ['cap', 'head', 'grip', 'handle', 'mount'];

/** Every rule the design breaks (in RULE_COPY order); a colour that is not one of the 8 swatches breaks "sets". */
export function check(colours: Record<PartId, string>): { ok: boolean; broken: RuleId[] } {
  const broken: RuleId[] = [];
  const tones = PARTS.map((p) => toneOf(colours[p.id] ?? ''));
  const sets = new Set<SetId>();
  for (const t of tones) if (t) sets.add(t.set);
  if (tones.some((t) => !t) || sets.size > 2) broken.push('sets');
  if (!tones.some((t) => t?.tone === 'light')) broken.push('light');
  if ((colours.button ?? '').toLowerCase() === (colours.handle ?? '').toLowerCase()) broken.push('button');
  const darkSets = new Set<SetId>();
  for (const id of DARK_RULE_PARTS) {
    const t = toneOf(colours[id] ?? '');
    if (t?.tone === 'dark') darkSets.add(t.set);
  }
  if (darkSets.size > 1) broken.push('dark');
  return { ok: broken.length === 0, broken };
}

/** The swatches that keep the design valid if assigned to `part`. */
export function allowed(colours: Record<PartId, string>, part: PartId): string[] {
  return SWATCHES.map(([h]) => h).filter((h) => check({ ...colours, [part]: h }).ok);
}

/** Why `hex` can't go on `part` (the first rule it would break), or '' when it can. */
export function whyNot(colours: Record<PartId, string>, part: PartId, hex: string): string {
  const r = check({ ...colours, [part]: hex });
  return r.ok ? '' : RULE_COPY[r.broken[0]];
}
