import type { Store } from '../state/store';
import clickUrl from '../assets/audio/click.mp3?url';
import loopUrl from '../assets/audio/backloop.mp3?url';

/*
 * Sound: a click when a tap on the page changes the brush, and quiet looping menu music. Both play through Web Audio:
 * a decoded buffer loops sample-exact (an <audio loop> leaves a gap), and a click starts with no decode lag.
 * The files sit under /assets/, so the password gate serves them only once unlocked; they load after the brush shows.
 * Browsers only start audio after a user gesture: the password Enter usually counts, otherwise the first tap starts it.
 * The stage's speaker button mutes and unmutes, remembered in this browser.
 */
const KEY = 'suri-sound';
const MUSIC = 0.15; // menu music level (the brief: about 20% or less)
const CLICK = 0.7;
const CLICK_WINDOW_MS = 400; // a change this soon after a click came from that click (not typing, not a share link)

export function mountSound(st: Store, signal: AbortSignal): () => void {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const btn = document.getElementById('sound') as HTMLButtonElement | null;
  let ctx: AudioContext;
  try {
    if (!AC || !btn) throw new Error('no Web Audio');
    ctx = new AC();
  } catch (e) {
    console.warn('[sound] off', e); // sound is extra: never fail the boot over it
    btn?.remove();
    return () => {};
  }
  const master = ctx.createGain();
  const music = ctx.createGain();
  master.connect(ctx.destination);
  music.connect(master);
  music.gain.value = 0;

  let muted = false;
  try { muted = localStorage.getItem(KEY) === 'off'; } catch { /* storage blocked */ }
  master.gain.value = muted ? 0 : 1;
  const sync = () => {
    btn.setAttribute('aria-pressed', String(!muted));
    btn.classList.toggle('off', muted);
  };
  sync();

  let click: AudioBuffer | null = null;
  let loop: AudioBufferSourceNode | null = null;
  const load = (url: string) => fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return r.arrayBuffer();
  }).then((b) => ctx.decodeAudioData(b));
  void load(clickUrl).then((b) => { click = b; }).catch((e) => console.warn('[sound] click', e));
  void load(loopUrl).then((b) => {
    if (signal.aborted) return;
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.loop = true;
    src.connect(music);
    src.start();
    loop = src;
    music.gain.setTargetAtTime(MUSIC, ctx.currentTime, 0.6); // fade in
  }).catch((e) => console.warn('[sound] music', e));

  // the context starts suspended without a gesture: the first tap or key resumes it
  const wake = () => { if (ctx.state === 'suspended' && !document.hidden) void ctx.resume(); };
  wake();
  for (const t of ['pointerdown', 'keydown'] as const) addEventListener(t, wake, { signal, capture: true });
  // quiet in a background tab
  document.addEventListener('visibilitychange', () => { if (document.hidden) void ctx.suspend(); else wake(); }, { signal });

  btn.addEventListener('click', () => {
    muted = !muted;
    try { localStorage.setItem(KEY, muted ? 'off' : 'on'); } catch { /* storage blocked */ }
    master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.08);
    sync();
  }, { signal });

  let clickedAt = -Infinity;
  addEventListener('click', (e) => { if (e.target !== btn) clickedAt = performance.now(); }, { signal, capture: true });
  let lastPlay = 0;
  const unsub = st.subscribe(() => {
    const now = performance.now();
    if (!click || muted || now - clickedAt > CLICK_WINDOW_MS || now - lastPlay < 40) return;
    lastPlay = now;
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    g.gain.value = CLICK;
    src.buffer = click;
    src.connect(g).connect(master);
    src.start();
  });

  return () => {
    unsub();
    loop?.stop();
    void ctx.close();
  };
}
