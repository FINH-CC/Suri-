import { CHARACTERS } from '../data/characters';
import type { CharacterId } from '../data/characters';
import type { Design } from '../state/design';
import type { Store } from '../state/store';
import type { BrushScene } from '../three/scene';
import { snapshot } from '../three/snapshot';

const IDS = Object.keys(CHARACTERS) as CharacterId[]; // pip, puff, splash, nova, blank
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The design a character card starts you from (legacy chooseCharacter 1503). */
export function characterDesign(id: CharacterId): Design {
  const c = CHARACTERS[id];
  return { parts: { ...c.parts }, colours: { ...c.colours }, finish: c.finish, stickers: [], name: c.name, character: id };
}

/** Start screen: the four Season 01 characters plus "Start from blank" (legacy renderChars 1492). Returns an unmount. */
export function mountStart(store: Store, scene: BrushScene): () => void {
  const el = document.getElementById('chars')!;
  el.innerHTML = '';
  // Task 16 swaps these off-screen renders for static /tiles/char-<id>.webp images.
  const thumbs = new Map<CharacterId, string>();
  const queue: [CharacterId, HTMLImageElement][] = [];
  let pumping = false;
  const pump = () => {
    const job = queue.shift();
    if (!job) { pumping = false; return; }
    const [id, img] = job;
    let url = thumbs.get(id);
    if (!url) {
      try {
        url = snapshot(scene, characterDesign(id), 'card', 192, 192);
        thumbs.set(id, url);
      } catch (e) { console.error(e); }
    }
    if (url) img.src = url;
    requestAnimationFrame(pump); // one render per frame so the page stays responsive
  };
  const want = (id: CharacterId, img: HTMLImageElement) => {
    queue.push([id, img]);
    if (!pumping) { pumping = true; requestAnimationFrame(pump); }
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const b = e.target as HTMLElement;
      want(b.dataset.id as CharacterId, b.querySelector('img')!);
    }
  });

  const buttons = IDS.map((id) => {
    const c = CHARACTERS[id];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'char';
    b.dataset.id = id;
    b.innerHTML = `${id !== 'blank' ? '<span class="badge">Season 01</span>' : ''}<img alt="" width="192" height="192"><strong>${id === 'blank' ? 'Start from blank' : esc(c.name)}</strong><span>${esc(c.tag)}</span>`;
    b.addEventListener('click', () => store.replace(characterDesign(id)));
    el.appendChild(b);
    io.observe(b);
    return b;
  });

  const sync = (d: Design) => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === d.character)));
  sync(store.get());
  const unsub = store.subscribe((next) => sync(next));
  return () => { unsub(); io.disconnect(); queue.length = 0; };
}
