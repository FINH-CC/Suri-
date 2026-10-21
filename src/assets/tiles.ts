/* Static option and character tiles (npm run tiles). Vite content-hashes each file, so the URLs change whenever an
   image does and the host can cache /assets/* forever. Keys are the bare tile names, e.g. "cap-bear", "char-pip". */
const files = import.meta.glob<string>('./tiles/*.webp', { eager: true, query: '?url', import: 'default' });

export const TILES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.slice('./tiles/'.length, -'.webp'.length), url]),
);

/** URL of a static tile, or '' (with a console error) when no such tile was rendered. */
export function tileUrl(name: string): string {
  const url = TILES[name];
  if (!url) console.error(`No tile ${name}`);
  return url ?? '';
}
