import { FINISHES, PART } from '../data/parts';
import type { PartId } from '../data/parts';
import { swatchName } from '../data/palette';
import type { Design } from '../state/design';
import type { Store } from '../state/store';
import type { createFlow } from './flow';
import { toast } from './toast';

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Where an Edit link lands on the Design screen (or the name field). */
type Target = PartId | 'presets' | 'sticker-card' | 'name';

const ORDER: PartId[] = ['cap', 'head', 'grip', 'mount', 'handle', 'button'];

/** Hand over screen (legacy 1604-1627): grown-up review, confirm box, concept checkout. Returns an unmount. */
export function mountHandover(store: Store, flow: ReturnType<typeof createFlow>): () => void {
  const ac = new AbortController();
  const on = { signal: ac.signal };
  const section = document.getElementById('step-4')!;
  const review = document.getElementById('review')!;
  const grownup = document.getElementById('grownup') as HTMLInputElement;
  const checkout = document.getElementById('checkout') as HTMLButtonElement;

  function render(d: Design) {
    const opt = (id: PartId) => (d.parts[id] === 'upload' ? 'Custom upload' : PART[id].options[d.parts[id]]);
    const row = (k: string, v: string, hex: string | null, to: Target) =>
      `<div class="review-row"><span class="k">${k}</span><span class="v">${v}</span>${hex ? `<i style="background:${hex}" title="${swatchName(hex)}"></i>` : ''}<button type="button" data-to="${to}">Edit</button></div>`;
    const nm = d.name.trim();
    review.innerHTML = [
      row('Name', nm ? esc(nm) : '<span style="color:var(--muted)">Not named yet</span>', null, 'name'),
      ...ORDER.map((id) => row(PART[id].name, opt(id), d.colours[id], id)),
      row('Finish', FINISHES[d.finish].name, null, 'presets'),
      row('Stickers', d.stickers.length ? d.stickers.length + ' on the brush' : 'None', null, 'sticker-card'),
    ].join('');
  }

  review.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-to]');
    if (!b) return;
    const to = b.dataset.to as Target;
    flow.goStep(to === 'name' ? 3 : 2, true);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (to === 'name') {
      document.getElementById('char-name')?.focus();
      return;
    }
    const el = to === 'presets' ? document.getElementById('presets')?.closest('section') : document.getElementById(to === 'sticker-card' ? to : 'card-' + to);
    el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  }, on);

  grownup.addEventListener('change', () => { checkout.disabled = !grownup.checked; }, on);
  checkout.addEventListener('click', () => toast("Concept prototype: checkout isn't connected yet."), on);

  const unsub = store.subscribe((d) => { if (!section.hidden) render(d); });
  const mo = new MutationObserver(() => { if (!section.hidden) render(store.get()); });
  mo.observe(section, { attributes: true, attributeFilter: ['hidden'] });
  checkout.disabled = !grownup.checked;
  if (!section.hidden) render(store.get());

  return () => { ac.abort(); unsub(); mo.disconnect(); };
}
