import { CHARACTERS, DEFAULT } from '../data/characters';
import type { CharacterId } from '../data/characters';
import { N } from '../data/palette';
import { PARTS } from '../data/parts';
import type { PartId } from '../data/parts';
import type { Design } from '../state/design';
import type { BrushScene } from '../three/scene';
import { snapshot } from '../three/snapshot';

/*
 * Dev-only tile renderer (loaded by main.ts when DEV and the URL is `?tiles`).
 * scripts/render-tiles.ts calls these in a headed Chromium and writes public/tiles/*.webp.
 */

declare global {
  interface Window {
    __renderTile?: (part: PartId, style: string) => string;
    __renderChar?: (id: CharacterId) => string;
  }
}

const SIZE = 384;

export function installTileRenderer(scene: BrushScene): void {
  window.__renderTile = (part, style) => {
    const colours = {} as Design['colours'];
    for (const p of PARTS) colours[p.id] = N;
    const design: Design = { ...DEFAULT, colours, finish: 'matte', parts: { ...DEFAULT.parts, head: 'plain' }, stickers: [] };
    return snapshot(scene, design, 'tile', SIZE, SIZE, { part, style });
  };
  window.__renderChar = (id) => {
    const c = CHARACTERS[id];
    const design: Design = { parts: { ...c.parts }, colours: { ...c.colours }, finish: c.finish, stickers: [], name: c.name, character: id };
    return snapshot(scene, design, 'card', SIZE, SIZE);
  };
}
