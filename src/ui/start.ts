import { CHARACTERS } from '../data/characters';
import type { CharacterId } from '../data/characters';
import type { Design } from '../state/design';
import type { Store } from '../state/store';

const IDS = Object.keys(CHARACTERS) as CharacterId[]; // pip, puff, splash, nova, blank
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The design a character card starts you from (legacy chooseCharacter 1503). */
export function characterDesign(id: CharacterId): Design {
  const c = CHARACTERS[id];
  return { parts: { ...c.parts }, colours: { ...c.colours }, finish: c.finish, stickers: [], name: c.name, character: id };
}

/** Start screen: the four Season 01 characters plus "Start from blank" (legacy renderChars 1492). Returns an unmount. */
export function mountStart(store: Store): () => void {
  const el = document.getElementById('chars')!;
  el.innerHTML = '';
  const buttons = IDS.map((id) => {
    const c = CHARACTERS[id];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'char';
    b.dataset.id = id;
    b.innerHTML = `${id !== 'blank' ? '<span class="badge">Season 01</span>' : ''}<img src="${import.meta.env.BASE_URL}tiles/char-${id}.webp" alt="" width="192" height="192" loading="lazy"><strong>${id === 'blank' ? 'Start from blank' : esc(c.name)}</strong><span>${esc(c.tag)}</span>`;
    b.addEventListener('click', () => store.replace(characterDesign(id)));
    el.appendChild(b);
    return b;
  });

  const sync = (d: Design) => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === d.character)));
  sync(store.get());
  const unsub = store.subscribe((next) => sync(next));
  return unsub;
}
