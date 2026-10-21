import * as THREE from 'three';
import { DEFAULT } from '../data/characters';
import { FAM, N, PRESETS, SWATCHES } from '../data/palette';
import { FINISHES, PART, PARTS, STICKERS } from '../data/parts';
import type { FinishId, PartId, StickerType } from '../data/parts';
import { validate } from '../state/design';
import type { Design } from '../state/design';
import type { Store } from '../state/store';
import { buildPart, dispose } from '../three/parts/index';
import type { BrushScene } from '../three/scene';
import { snapshot } from '../three/snapshot';
import { placeSticker, stickerUrl } from '../three/stickers';
import { toast } from './toast';
import { UPLOAD_COPY, parseStl } from './upload';

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const COLOUR_ONLY = (id: PartId) => Object.keys(PART[id].options).length === 1; // handle and button: just pick a colour

/** A random build (legacy surprise 1433-1442, minus the charm): one family leads, a second may join. */
export function surpriseDesign(d: Design, rand: () => number): Design {
  const pick = <T>(a: T[]): T => a[Math.floor(rand() * a.length)];
  const fams = Object.values(FAM), f = pick(fams), g = pick(fams);
  const parts = {} as Design['parts'];
  for (const p of PARTS) parts[p.id] = pick(Object.keys(p.options));
  const colours: Design['colours'] = {
    cap: f.bold,
    grip: pick([f.bold, g.bold]),
    button: pick([f.bold, g.bold]),
    head: pick([f.light, N]),
    handle: pick([f.light, N]),
    mount: pick([f.light, N, g.light]),
  };
  return { ...d, parts, colours, finish: pick(Object.keys(FINISHES) as FinishId[]), character: '' };
}

/** Design screen (legacy 1264-1385, 1433-1442, 1536-1548): colourway, surprise, part cards, stickers, reset. Returns an unmount. */
export function mountDesign(store: Store, scene: BrushScene): () => void {
  const ac = new AbortController();
  const on = { signal: ac.signal };
  const $ = (id: string) => document.getElementById(id)!;
  const stage = $('stage');
  const hint = $('placing-hint');
  const fileIn = $('file') as HTMLInputElement;
  const sizeIn = $('st-size') as HTMLInputElement, rotIn = $('st-rot') as HTMLInputElement;
  const unsubs: (() => void)[] = [];

  /* ---------- tiles: lazy off-screen renders, one per frame ---------- */
  // Task 16 swaps tileSrc for static `/tiles/<part>-<option>.webp` images.
  // Tiles show shape, not colour: soft neutral, matte, cap fitted to the current head.
  const tileCache = new Map<string, string>();
  let headUploadRev = 0; // bumps when the head upload changes, so cap tiles fitted to it re-render
  function tileSrc(part: PartId, style: string): string {
    const d = store.get();
    if (style === 'upload') return snapshot(scene, d, 'tile', 192, 192, { part, style }); // live, in the current colour
    const key = [part, style, N, part === 'cap' ? `${d.parts.head}:${headUploadRev}` : ''].join('|');
    let url = tileCache.get(key);
    if (!url) {
      const neutral: Design = { ...d, colours: { ...d.colours, [part]: N }, finish: 'matte' };
      url = snapshot(scene, neutral, 'tile', 192, 192, { part, style });
      tileCache.set(key, url);
    }
    return url;
  }
  const queue: HTMLImageElement[] = [];
  let pumping = false;
  const pump = () => {
    const img = queue.shift();
    if (!img) { pumping = false; return; }
    if (img.isConnected) {
      try { img.src = tileSrc(img.dataset.part as PartId, img.dataset.style!); } catch (e) { console.error(e); }
    }
    requestAnimationFrame(pump);
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      queue.push(e.target as HTMLImageElement);
      if (!pumping) { pumping = true; requestAnimationFrame(pump); }
    }
  });

  /* ---------- colourway + finish ---------- */
  const presetsEl = $('presets'), finishesEl = $('finishes');
  function renderPresets(d: Design) {
    presetsEl.innerHTML = '';
    for (const pr of PRESETS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'preset';
      b.setAttribute('aria-pressed', String(PARTS.every((p) => d.colours[p.id] === pr.c[p.id])));
      b.innerHTML = `<i style="background:conic-gradient(${pr.c.cap} 0 50%,${pr.c.mount} 0)"></i>${esc(pr.name)}`;
      b.addEventListener('click', () => store.update({ colours: { ...pr.c } }));
      presetsEl.appendChild(b);
    }
  }
  function renderFinishes(d: Design) {
    finishesEl.innerHTML = '';
    for (const [k, f] of Object.entries(FINISHES) as [FinishId, (typeof FINISHES)[FinishId]][]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(d.finish === k));
      b.textContent = f.name;
      b.title = f.sub;
      b.addEventListener('click', () => store.update({ finish: k }));
      finishesEl.appendChild(b);
    }
  }
  $('surprise').addEventListener('click', () => store.replace(surpriseDesign(store.get(), Math.random)), on);

  /* ---------- part cards ---------- */
  const cardsEl = $('part-cards');
  cardsEl.innerHTML = '';
  let uploadTarget: PartId | null = null;
  const cards = {} as Record<PartId, HTMLElement>;
  const cardKey = {} as Record<PartId, string>;
  const keyFor = (id: PartId, d: Design) =>
    [d.parts[id], d.colours[id], !!scene.uploads[id], id === 'cap' ? `${d.parts.head}:${headUploadRev}` : ''].join('|');

  for (const p of PARTS) {
    const sec = document.createElement('section');
    sec.className = 'part' + (COLOUR_ONLY(p.id) ? ' colour-only' : '');
    sec.id = 'card-' + p.id;
    if (p.id === 'head') {
      // lift the cap off so the head can be seen (legacy 1272)
      for (const ev of ['pointerenter', 'focusin']) sec.addEventListener(ev, () => scene.setCapLift(true), on);
      for (const ev of ['pointerleave', 'focusout']) sec.addEventListener(ev, () => scene.setCapLift(false), on);
    }
    cards[p.id] = sec;
    cardsEl.appendChild(sec);
  }

  function renderCard(id: PartId, d: Design) {
    const p = PART[id], sec = cards[id], hex = d.colours[id];
    cardKey[id] = keyFor(id, d);
    sec.querySelectorAll('img').forEach((img) => io.unobserve(img));
    const colourOnly = COLOUR_ONLY(id);
    sec.innerHTML = colourOnly
      ? `<div class="part-head"><h2>${esc(p.name)} colour</h2></div>`
      : `<div class="part-head"><h2>Pick your ${esc(p.name.toLowerCase())}</h2></div><p class="sub">${esc(p.sub)}</p><div class="tiles"></div>`;

    // colour: a row of circles right under the title, the current one ringed
    const row = document.createElement('div');
    row.className = 'swatch-row';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', `${p.name} colour`);
    for (const [h, n] of SWATCHES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.background = h;
      b.title = n;
      b.setAttribute('aria-label', `${p.name} colour: ${n}`);
      b.setAttribute('aria-pressed', String(h === hex));
      b.addEventListener('click', () => {
        store.update({ colours: { ...store.get().colours, [id]: h } });
        sec.querySelector<HTMLElement>('.swatch[aria-pressed="true"]')?.focus();
      });
      row.appendChild(b);
    }
    sec.querySelector('.part-head')!.after(row);
    if (colourOnly) return;

    const tiles = sec.querySelector('.tiles')!;
    const opts = Object.entries(p.options).map(([k, name]) => ({ k, name, badge: false }));
    if (scene.uploads[id]) opts.push({ k: 'upload', name: 'Your ' + p.name.toLowerCase(), badge: true });
    for (const o of opts) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tile';
      b.setAttribute('aria-pressed', String(d.parts[id] === o.k));
      b.innerHTML = `${o.badge ? '<span class="badge">STL</span>' : ''}<img alt="" width="192" height="192">${esc(o.name)}`;
      const img = b.querySelector('img')!;
      img.dataset.part = id;
      img.dataset.style = o.k;
      io.observe(img);
      b.addEventListener('click', () => store.update({ parts: { ...store.get().parts, [id]: o.k } }));
      tiles.appendChild(b);
    }
    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'tile upload';
    up.innerHTML = `<span class="ph" aria-hidden="true">+</span>Upload ${esc(p.name.toLowerCase())}`;
    up.addEventListener('click', () => { uploadTarget = id; fileIn.value = ''; fileIn.click(); });
    tiles.appendChild(up);
  }

  /** The default part's bounds: what an upload is scaled to fit (legacy 1314). */
  function referenceBox(id: PartId): THREE.Box3 {
    const ref = buildPart(id, DEFAULT.parts[id], '#ffffff', scene.buildCtxFor(store.get()));
    const box = new THREE.Box3().setFromObject(ref);
    dispose(ref);
    return box;
  }

  fileIn.addEventListener('change', async () => {
    const f = fileIn.files?.[0], id = uploadTarget;
    if (!f || !id) return;
    let geo: THREE.BufferGeometry;
    try {
      if (f.size > 20 * 1024 * 1024) throw new Error('too-big');
      geo = parseStl(await f.arrayBuffer(), id, referenceBox(id));
    } catch (err) {
      toast((err as Error).message === 'too-big' ? UPLOAD_COPY.tooBig : UPLOAD_COPY.notStl);
      return;
    }
    scene.uploads[id]?.dispose();
    scene.uploads[id] = geo;
    if (id === 'head') headUploadRev++;
    const d = store.get();
    if (d.parts[id] === 'upload') {
      // same design, new geometry: the store sees no change, so rebuild and redraw here
      scene.applyDesign(d, null);
      renderCard(id, d);
      if (id === 'head') renderCard('cap', d);
    } else {
      store.update({ parts: { ...d.parts, [id]: 'upload' } });
    }
    toast(UPLOAD_COPY.loaded);
  }, on);

  /* ---------- stickers (legacy 1352-1385) ---------- */
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

  /* ---------- reset appearance (legacy 1346-1350): keeps the stickers ---------- */
  $('reset').addEventListener('click', () => {
    store.replace({ ...validate(DEFAULT), stickers: store.get().stickers });
    toast('Appearance reset');
  }, on);

  /* ---------- first render, then only what changed ---------- */
  const d0 = store.get();
  renderPresets(d0);
  renderFinishes(d0);
  for (const p of PARTS) renderCard(p.id, d0);
  renderStickerTiles();
  renderStickerList(d0);
  syncSliders();

  unsubs.push(store.subscribe((next, prev) => {
    if (PARTS.some((p) => next.colours[p.id] !== prev.colours[p.id])) renderPresets(next);
    if (next.finish !== prev.finish) renderFinishes(next);
    for (const p of PARTS) if (keyFor(p.id, next) !== cardKey[p.id]) renderCard(p.id, next);
    if (JSON.stringify(next.stickers) !== JSON.stringify(prev.stickers)) {
      if (store.lastChange() !== 'edit') selected = -1; // undo/redo can change which sticker an index points at
      renderStickerList(next);
    }
  }));

  return () => {
    ac.abort();
    unsubs.forEach((u) => u());
    io.disconnect();
    mo.disconnect();
    queue.length = 0;
    if (armed) { armed = null; stage.classList.remove('placing'); hint.textContent = ''; }
  };
}
