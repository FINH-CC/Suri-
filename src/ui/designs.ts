import { DEFAULT } from '../data/characters';
import { PARTS } from '../data/parts';
import { validate } from '../state/design';
import type { Design } from '../state/design';
import type { Store } from '../state/store';
import { snapshot } from '../three/snapshot';
import type { BrushScene } from '../three/scene';
import { toast } from './toast';

const KEY = 'suri-kids-designs';
const MAX = 24;
const STAGE_BG = '#e8e4de';

interface Saved { name: string; state: unknown; thumb: string }

function load(): Saved[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is Saved => !!x && typeof x === 'object' && typeof (x as Saved).thumb === 'string') : [];
  } catch { return []; }
}

function persist(list: Saved[]): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; }
  catch { toast('Storage is full. Delete a design first.'); return false; }
}

/** Uploads cannot be stored; they go back to the default style (legacy 1656). */
function storable(d: Design): Design {
  const parts = { ...d.parts };
  for (const p of PARTS) if (parts[p.id] === 'upload') parts[p.id] = DEFAULT.parts[p.id];
  return { ...d, parts };
}

/** Transparent PNG on the stage colour, re-encoded as a small JPEG (JPEG has no alpha). */
async function jpeg(png: string): Promise<string> {
  const img = new Image();
  img.src = png;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = c.height = 300;
  const g = c.getContext('2d')!;
  g.fillStyle = STAGE_BG;
  g.fillRect(0, 0, 300, 300);
  g.drawImage(img, 0, 0, 300, 300);
  return c.toDataURL('image/jpeg', 0.8);
}

/** My designs dialog (legacy 1639-1660). */
export function mountDesigns(store: Store, scene: BrushScene, signal: AbortSignal): void {
  const on = { signal };
  const dlg = document.getElementById('designs-dlg') as HTMLDialogElement;
  const grid = document.getElementById('designs')!;
  const empty = document.getElementById('designs-empty')!;

  function render() {
    const list = load();
    grid.innerHTML = '';
    empty.hidden = list.length > 0;
    list.forEach((x, i) => {
      const card = document.createElement('div');
      card.className = 'design';
      const img = document.createElement('img');
      img.alt = '';
      img.src = x.thumb;
      const label = document.createElement('span');
      label.textContent = String(x.name ?? '');
      const acts = document.createElement('div');
      acts.className = 'acts';
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'text-btn';
      open.textContent = 'Open';
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'link-btn';
      del.style.padding = '2px';
      del.textContent = 'Delete';
      acts.append(open, del);
      card.append(img, label, acts);
      open.addEventListener('click', () => {
        store.replace(validate(x.state));
        dlg.close();
        toast('Design opened');
      });
      del.addEventListener('click', () => {
        const next = load();
        next.splice(i, 1);
        persist(next);
        render();
      });
      grid.appendChild(card);
    });
  }

  document.getElementById('open-designs')!.addEventListener('click', () => { render(); dlg.showModal(); }, on);
  document.getElementById('close-designs')!.addEventListener('click', () => dlg.close(), on);
  document.getElementById('save-design')!.addEventListener('click', async () => {
    let d: Design, thumb: string;
    try {
      d = storable(store.get());
      thumb = await jpeg(snapshot(scene, d, 'hero', 300, 300));
    } catch (e) {
      console.error(e);
      toast("Couldn't save this design");
      return;
    }
    const list = load();
    list.unshift({ name: 'Design ' + (list.length + 1), state: d, thumb });
    if (persist(list.slice(0, MAX))) render();
  }, on);
}
