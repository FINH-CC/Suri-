import { N, PRESETS } from './palette';
import type { FinishId, PartId, StickerType } from './parts';

export type CharacterId = 'pip' | 'puff' | 'splash' | 'nova' | 'blank';

export interface CharacterDef {
  name: string;
  tag: string;
  parts: Record<PartId, string>;
  colours: Record<PartId, string>;
  finish: FinishId;
}

/** Structural shape of a design; Task 5 aliases this as `Design`. */
export interface DesignData {
  parts: Record<PartId, string>;
  colours: Record<PartId, string>;
  stickers: { type: StickerType; [k: string]: unknown }[];
  name: string;
  finish: FinishId;
  character: CharacterId | null;
}

export const presetC = (n: string): Record<PartId, string> => {
  const p = PRESETS.find((q) => q.name === n);
  if (!p) throw new Error(`Unknown preset: ${n}`);
  return { ...p.c };
};

/* ---- Season 01 characters: ready-made builds to start from ---- */
export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  pip: {
    name: 'Pip', tag: 'A little sprout who grows a bit every morning.',
    parts: { cap: 'sprout', head: 'plain', grip: 'ribs', handle: 'core', button: 'core', charm: 'sprout', mount: 'original' }, colours: presetC('Green B'), finish: 'matte',
  },
  puff: {
    name: 'Puff', tag: 'A sleepy cloud who never skips bedtime brushing.',
    parts: { cap: 'cloud', head: 'ears', grip: 'dots', handle: 'core', button: 'core', charm: 'cloud', mount: 'cloud' }, colours: presetC('Lilac B'), finish: 'satin',
  },
  splash: {
    name: 'Splash', tag: 'A raindrop who always races to the sink first.',
    parts: { cap: 'hat', head: 'spots', grip: 'rings', handle: 'core', button: 'core', charm: 'fish', mount: 'arch' }, colours: presetC('Coral A'), finish: 'speckle',
  },
  nova: {
    name: 'Nova', tag: 'A night-sky dreamer who brushes under the stars.',
    parts: { cap: 'bunny', head: 'spots', grip: 'ribs', handle: 'core', button: 'core', charm: 'star', mount: 'arch' }, colours: presetC('Blue B'), finish: 'satin',
  },
  blank: {
    name: '', tag: 'A plain brush. Make it entirely yours.',
    parts: { cap: 'bubble', head: 'plain', grip: 'smooth', handle: 'core', button: 'core', charm: 'none', mount: 'original' },
    colours: { cap: N, head: N, grip: N, handle: N, button: N, charm: N, mount: N }, finish: 'matte',
  },
};

export const DEFAULT: DesignData = {
  parts: { ...CHARACTERS.nova.parts },
  colours: { ...CHARACTERS.nova.colours },
  stickers: [],
  name: 'Nova',
  finish: CHARACTERS.nova.finish,
  character: 'nova',
};
