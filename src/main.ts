import './styles/base.css';
import './styles/header.css';
import './styles/stage.css';
import './styles/cards.css';
import './styles/flow.css';
import './styles/prints.css';
import './styles/mobile.css';
import { DEFAULT } from './data/characters';
import { mixHex } from './data/palette';
import type { PartId } from './data/parts';
import { decode, validate } from './state/design';
import type { Design } from './state/design';
import { createStore } from './state/store';
import type { Store } from './state/store';
import type { CapCore } from './three/capfit';
import { DEFAULT_LOOK, LOOKS, isLookId } from './three/looks';
import type { LookId } from './three/looks';
import { loadModel } from './three/model';
import { BrushScene } from './three/scene';
import { projectStickers } from './three/stickers';
import { createFlow } from './ui/flow';
import type { Step } from './ui/flow';
import * as intro from './ui/intro';
import { mountDesign } from './ui/design';
import { mountDesigns } from './ui/designs';
import { mountShare } from './ui/share';
import { mountHandover } from './ui/handover';
import { mountNameIt } from './ui/nameit';
import { mountStart } from './ui/start';
import { toast } from './ui/toast';

const KEY = 'suri-kids-current';

/* Anything that slips through at runtime: tell the user their work is safe, keep the details in the console. */
addEventListener('error', (e) => {
  console.error(e.error ?? e.message);
  toast('Something went wrong, your design is saved');
});
addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  toast('Something went wrong, your design is saved');
});

/** Share link first, then the last design in this browser, then the default; every read may throw. */
function readInitial(): Design {
  let hashed: Design | null = null;
  try { hashed = decode(location.hash); } catch { /* malformed hash */ }
  let stored: unknown = null;
  if (!hashed) {
    try { stored = JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { /* blocked or corrupt storage */ }
  }
  return validate(hashed ?? stored ?? DEFAULT);
}

/** The picked character's colour runs through the UI (legacy setAccent 651). */
function setAccent(d: Design) {
  const c = d.colours.cap || '#adaae1', r = document.documentElement.style;
  r.setProperty('--accent', c);
  r.setProperty('--accent-soft', mixHex(c, '#ffffff', 0.62));
  r.setProperty('--accent-deep', mixHex(c, '#252525', 0.22));
}

/** The studio look: `b` ships (Task 19b). Dev only: `?look=parity` shows the Task 18 render for comparison. */
function lookFromUrl(): LookId {
  if (!import.meta.env.DEV) return DEFAULT_LOOK;
  const id = new URLSearchParams(location.search).get('look');
  return isLookId(id) ? id : DEFAULT_LOOK;
}

type Flow = ReturnType<typeof createFlow>;

let store: Store | null = null;
let scene: BrushScene | null = null;

function wireStage(s: BrushScene, st: Store, flow: Flow, signal: AbortSignal, unsubs: (() => void)[]) {
  const on = { signal };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = document.getElementById('stage')!;

  // undo / redo buttons and keyboard (legacy 1443)
  const undo = document.getElementById('undo') as HTMLButtonElement;
  const redo = document.getElementById('redo') as HTMLButtonElement;
  undo.addEventListener('click', () => st.undo(), on);
  redo.addEventListener('click', () => st.redo(), on);
  const syncHistory = () => { undo.disabled = !st.canUndo(); redo.disabled = !st.canRedo(); };
  syncHistory();
  unsubs.push(st.subscribe(syncHistory));
  addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    if ((document.getElementById('designs-dlg') as HTMLDialogElement).open) return;
    const el = document.activeElement as HTMLElement | null;
    if (el && (/^(INPUT|TEXTAREA)$/.test(el.tagName) || el.isContentEditable)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); st.undo(); }
    else if ((k === 'z' && e.shiftKey) || (k === 'y' && !e.shiftKey)) { e.preventDefault(); st.redo(); }
  }, on);
  mountShare(st, signal);
  mountDesigns(st, s, signal);

  // toolbar: take apart, camera views (legacy 1679-1684)
  const apart = document.getElementById('tb-apart')!;
  let exploded = false;
  apart.addEventListener('click', () => {
    exploded = !exploded;
    apart.setAttribute('aria-pressed', String(exploded));
    apart.textContent = exploded ? 'Put together' : 'Take apart';
    s.setExploded(exploded);
  }, on);
  const views = [...document.querySelectorAll<HTMLButtonElement>('#tb-views [data-view]')];
  const syncViews = () => views.forEach((b, i) => b.setAttribute('aria-pressed', String(i === s.view)));
  views.forEach((b, i) => b.addEventListener('click', () => { s.setView(i as 0 | 1 | 2 | 3); syncViews(); }, on));
  unsubs.push(s.on('userMove', syncViews));

  // tap a part on the brush (no drag, not while placing a sticker) to jump to its card (legacy 1249-1257)
  const canvas = s.renderer.domElement;
  let down: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; }, on);
  canvas.addEventListener('pointerup', (e) => {
    const start = down;
    down = null;
    if (!start || e.button !== 0 || stage.classList.contains('placing')) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) return;
    const id: PartId | null = s.partAt(e.clientX, e.clientY);
    if (!id) return;
    s.pop(id);
    flow.goStep(2);
    const card = document.getElementById('card-' + id);
    if (!card) return;
    card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    card.classList.remove('flash');
    void card.offsetWidth;
    card.classList.add('flash');
  }, on);

  // pointer cursor over a part (mouse only; throttled to one hit-test per 90 ms; legacy 1258-1261)
  let hoverT = 0;
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || e.buttons || stage.classList.contains('placing')) return;
    const n = performance.now();
    if (n - hoverT < 90) return;
    hoverT = n;
    canvas.style.cursor = s.partAt(e.clientX, e.clientY) ? 'pointer' : '';
  }, on);
}

// Created once: the step sections and bottom bar exist before the brush loads. Task 13-15 hook their screens in here.
const flow: Flow = createFlow({ onEnter: (_step: Step) => {} });

/** Resolve once the scene has rendered a frame; reject on a frame-loop error or after 30 s with nothing drawn. */
function firstFrame(s: BrushScene, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    s.lastError = null;
    s.requestFrame();
    const poll = () => {
      if (s.lastError) return reject(s.lastError);
      if (s.frames > 0) return resolve();
      if (performance.now() - t0 > timeoutMs) return reject(new Error('No frame rendered'));
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  });
}

async function boot(): Promise<void> {
  const ac = new AbortController();
  const unsubs: (() => void)[] = [];
  try {
    store ??= createStore(readInitial(), {
      save: (json) => { try { localStorage.setItem(KEY, json); } catch { /* storage blocked or full */ } },
      uploads: () => Object.fromEntries(Object.keys(scene?.uploads ?? {}).map((k) => [k, true])) as Partial<Record<PartId, boolean>>,
    });
    const st = store;
    const [model, capFit] = await Promise.all([
      loadModel('/model/brush.glb', '/model/brush-meta.json', intro.showProgress),
      fetch('/model/cap-fit.json').then((r) => {
        if (!r.ok) throw new Error(`cap-fit.json: HTTP ${r.status}`);
        return r.json() as Promise<Record<string, CapCore>>;
      }),
    ]);
    const s = (scene = new BrushScene(document.getElementById('stage')!, model, capFit, LOOKS[lookFromUrl()]));
    s.onPartsChanged = (d) => projectStickers(s, d.stickers);
    s.applyDesign(st.get(), null);
    setAccent(st.get());
    unsubs.push(st.subscribe((next, prev) => {
      s.applyDesign(next, prev);
      setAccent(next);
    }));

    unsubs.push(mountStart(st));
    wireStage(s, st, flow, ac.signal, unsubs);
    unsubs.push(mountDesign(st, s)); // after wireStage: its canvas tap handler must see `placing` before a placed sticker clears it
    unsubs.push(mountNameIt(st, s));
    unsubs.push(mountHandover(st, flow));
    flow.goStep(1);
    s.frameDefault();
    await firstFrame(s);
    if (import.meta.env.DEV) (window as unknown as { __scene?: BrushScene }).__scene = s;
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('tiles')) void import('./dev/tiles').then((m) => m.installTileRenderer(s));
    intro.finish();
  } catch (err) {
    ac.abort(); // undo any half-finished mount so Retry starts clean
    unsubs.forEach((u) => u());
    scene?.dispose();
    scene?.renderer.domElement.remove();
    scene = null;
    intro.fail(err, () => void boot());
  }
}

void boot();
