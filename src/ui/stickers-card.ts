import { PART, STICKERS } from '../data/parts';
import type { StickerType } from '../data/parts';
import type { Design } from '../state/design';
import type { Store } from '../state/store';
import type { BrushScene } from '../three/scene';
import { placeSticker, stickerUrl } from '../three/stickers';

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Stickers card (legacy 1352-1385): arm a sticker, tap the brush to place it, list, resize, rotate, remove. Returns an unmount. */
export function mountStickersCard(store: Store, scene: BrushScene): () => void {
  const ac = new AbortController();
  const on = { signal: ac.signal };
  const $ = (id: string) => document.getElementById(id)!;
  const stage = $('stage');
  const hint = $('placing-hint');
  const sizeIn = $('st-size') as HTMLInputElement, rotIn = $('st-rot') as HTMLInputElement;
  const stTiles = $('sticker-tiles'), stList = $('sticker-list');
  let armed: StickerType | null = null;
  let selected = -1;
  const syncSliders = () => {
    $('st-size-o').textContent = (+sizeIn.value).toFixed(2);
    $('st-rot-o').textContent = rotIn.value + '°';
  };
  function setArmed(t: StickerType | null) {
    armed = t;
    renderStickerTiles();
  }
  function renderStickerTiles() {
    stTiles.innerHTML = '';
    for (const [k, name] of Object.entries(STICKERS) as [StickerType, string][]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tile';
      b.setAttribute('aria-pressed', String(armed === k));
      b.innerHTML = `<img src="${stickerUrl(k)}" alt="">${esc(name)}`;
      b.addEventListener('click', () => setArmed(armed === k ? null : k));
      stTiles.appendChild(b);
    }
    stage.classList.toggle('placing', !!armed);
    hint.textContent = armed ? `Click the brush to place a ${STICKERS[armed].toLowerCase()}. Esc to stop.` : '';
  }
  function renderStickerList(d: Design) {
    stList.innerHTML = '';
    if (selected >= d.stickers.length) selected = -1;
    if (!d.stickers.length) {
      stList.innerHTML = '<li><p class="empty">No stickers yet.</p></li>';
      return;
    }
    d.stickers.forEach((st, i) => {
      const li = document.createElement('li');
      const name = STICKERS[st.t];
      li.innerHTML = `<div class="list-row" role="button" tabindex="0" aria-pressed="${i === selected}"><img src="${stickerUrl(st.t)}" alt=""><span>${esc(name)} on ${esc(PART[st.p].name.toLowerCase())}</span><button class="rm" type="button" aria-label="Remove ${esc(name.toLowerCase())}">Remove</button></div>`;
      const row = li.firstElementChild as HTMLElement;
      const pick = () => {
        selected = i;
        sizeIn.value = String(st.s);
        rotIn.value = String(st.r);
        syncSliders();
        renderStickerList(store.get());
      };
      row.addEventListener('click', (e) => { if (!(e.target as HTMLElement).classList.contains('rm')) pick(); });
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      row.querySelector('.rm')!.addEventListener('click', () => {
        selected = -1;
        store.update({ stickers: store.get().stickers.filter((_, j) => j !== i) });
      });
      stList.appendChild(li);
    });
  }
  for (const inp of [sizeIn, rotIn]) {
    inp.addEventListener('input', () => {
      syncSliders();
      const list = store.get().stickers;
      if (!list[selected]) return;
      store.update({ stickers: list.map((st, j) => (j === selected ? { ...st, s: +sizeIn.value, r: +rotIn.value } : st)) });
    }, on);
  }
  $('clear-stickers').addEventListener('click', () => { selected = -1; store.update({ stickers: [] }); }, on);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && armed) setArmed(null); }, on);
  // leaving the Design step drops an armed sticker (legacy 1423)
  const step2 = $('step-2');
  const mo = new MutationObserver(() => { if (step2.hidden && armed) setArmed(null); });
  mo.observe(step2, { attributes: true, attributeFilter: ['hidden'] });

  // place on a tap (no drag) while armed; one sticker per tap on a tile (legacy 1225-1240)
  const canvas = scene.renderer.domElement;
  let down: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; }, on);
  canvas.addEventListener('pointerup', (e) => {
    const start = down;
    down = null;
    if (!armed || !start || e.button !== 0) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) return;
    const st = placeSticker(scene, armed, e.clientX, e.clientY, +sizeIn.value, +rotIn.value);
    if (!st) return;
    const list = store.get().stickers;
    selected = list.length;
    setArmed(null);
    store.update({ stickers: [...list, st] });
  }, on);

  /* ---------- first render, then only what changed ---------- */
  renderStickerTiles();
  renderStickerList(store.get());
  syncSliders();
  const unsub = store.subscribe((next, prev) => {
    if (JSON.stringify(next.stickers) !== JSON.stringify(prev.stickers)) {
      if (store.lastChange() !== 'edit') selected = -1; // undo, redo and replace can change which sticker an index points at
      renderStickerList(next);
    }
  });

  return () => {
    ac.abort();
    unsub();
    mo.disconnect();
    if (armed) { armed = null; stage.classList.remove('placing'); hint.textContent = ''; }
  };
}
