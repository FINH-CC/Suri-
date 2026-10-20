export type PartId = 'cap' | 'head' | 'grip' | 'handle' | 'button' | 'mount';
export type FinishId = 'matte' | 'satin' | 'speckle';
export type StickerType = 'star' | 'heart' | 'smile' | 'bolt' | 'cloud' | 'rainbow' | 'flower' | 'moon';

export interface PartDef {
  id: PartId;
  name: string;
  sub: string;
  options: Record<string, string>;
}

export const PARTS: PartDef[] = [
  { id: 'cap', name: 'Cap', sub: 'Soft silicone cap that slides down over the bristles. Pick a shape.', options: { bubble: 'Pebble', sprout: 'Sprout', bear: 'Bear', hat: 'Hat', bunny: 'Bunny', cloud: 'Cloud' } },
  { id: 'head', name: 'Head', sub: 'Changeable head with subtle character cues.', options: { plain: 'Plain', ears: 'Ears', spots: 'Spots' } },
  { id: 'grip', name: 'Grip', sub: 'A sleeve that changes the look and feel of the handle.', options: { smooth: 'Smooth', ribs: 'Ribs', dots: 'Dots', rings: 'Rings' } },
  { id: 'handle', name: 'Handle', sub: 'The core. Houses the motor and battery.', options: { core: 'Core' } },
  { id: 'button', name: 'Button', sub: 'The power button. Match it or make it pop.', options: { core: 'Core' } },
  { id: 'mount', name: 'Mount', sub: 'Mirror mount that holds the brush. It can be themed.', options: { original: 'Original', cloud: 'Cloud', arch: 'Arch' } },
];

export const PART = Object.fromEntries(PARTS.map((p) => [p.id, p])) as Record<PartId, PartDef>;

export const STICKERS: Record<StickerType, string> = { star: 'Star', heart: 'Heart', smile: 'Smile', bolt: 'Bolt', cloud: 'Cloud', rainbow: 'Rainbow', flower: 'Flower', moon: 'Moon' };

export const FINISHES: Record<FinishId, { name: string; sub: string }> = {
  matte: { name: 'Matte', sub: 'Soft-touch' },
  satin: { name: 'Satin', sub: 'Gentle sheen' },
  speckle: { name: 'Speckle', sub: 'Plant-based flecks' },
};

export const DIM_STATIC = {
  handleBottom: 0.9,
  handleTop: 14.53,
  handleHalfX: 1.03,
  handleHalfZ: 0.9,
  buttonY: [9.0, 11.3] as [number, number],
  padY: [20.2, 22.29] as [number, number],
  padHalfX: 0.59,
  padBackZ: -0.32,
  tuftLen: 0.9,
  mountCY: 7.5,
  mountFrontZ: -0.9,
  mountHalf: [1.42, 3.12] as [number, number],
};

/** Legacy DIM; padFrontZ comes from the CAD meta tuftFaceZ at runtime. */
export function dimFor(tuftFaceZ: number) {
  return { ...DIM_STATIC, padFrontZ: tuftFaceZ };
}
