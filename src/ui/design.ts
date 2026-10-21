import * as THREE from 'three';
import { DEFAULT } from '../data/characters';
import { FAM, N, PRESETS, SWATCHES } from '../data/palette';
import { FINISHES, PART, PARTS } from '../data/parts';
import type { FinishId, PartId } from '../data/parts';
import { validate } from '../state/design';
import type { Design } from '../state/design';
import type { Store } from '../state/store';
import { buildPart, dispose } from '../three/parts/index';
import type { BrushScene } from '../three/scene';
import { snapshot } from '../three/snapshot';
import { tileUrl } from '../assets/tiles';
import { mountStickersCard } from './stickers-card';
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
  const fileIn = $('file') as HTMLInputElement;
  const unsubs: (() => void)[] = [];

  /* ---------- tiles: static renders (npm run tiles), uploads are live ---------- */
  let headUploadRev = 0; // bumps when the head upload changes, so cap cards re-render
  function tileSrc(part: PartId, style: string): string {
    if (style === 'upload') return snapshot(scene, store.get(), 'tile', 192, 192, { part, style }); // live, in the current colour
    if (!(style in PART[part].options)) { console.error(`No tile for ${part}-${style}`); return ''; }
    return tileUrl(`${part}-${style}`);
  }

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
      b.innerHTML = `${o.badge ? '<span class="badge">STL</span>' : ''}<img alt="" width="192" height="192" loading="lazy">${esc(o.name)}`;
      const img = b.querySelector('img')!;
      try { const src = tileSrc(id, o.k); if (src) img.src = src; } catch (e) { console.error(e); }
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

  unsubs.push(mountStickersCard(store, scene));

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

  unsubs.push(store.subscribe((next, prev) => {
    if (PARTS.some((p) => next.colours[p.id] !== prev.colours[p.id])) renderPresets(next);
    if (next.finish !== prev.finish) renderFinishes(next);
    for (const p of PARTS) if (keyFor(p.id, next) !== cardKey[p.id]) renderCard(p.id, next);
  }));

  return () => {
    ac.abort();
    unsubs.forEach((u) => u());
  };
}
