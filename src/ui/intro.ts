/*
 * Full-page intro that doubles as the loader (legacy/index.html 434-439, 1940-1952).
 * There is no bail timer: the intro leaves only through finish(), or turns into an error with Retry through fail().
 */
const started = performance.now();
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const el = () => document.getElementById('intro');
let original = '';
let finishing = false;

/** Loaded bytes so far; `total` 0 (unknown length) creeps to 90% and holds. */
export function showProgress(loaded: number, total: number): void {
  const bar = el()?.querySelector<HTMLElement>('.intro-bar');
  const fill = bar?.querySelector<HTMLElement>('i');
  if (!bar || !fill) return;
  if (total > 0) {
    bar.classList.remove('indeterminate');
    fill.style.width = `${Math.min(100, Math.max(0, (loaded / total) * 100))}%`;
  } else if (!bar.classList.contains('indeterminate')) {
    fill.style.width = '';
    bar.classList.add('indeterminate');
  }
}

/** Let the words land (1.5 s minimum on screen), jump "Lab", then slide the intro away and remove it. */
export function finish(): void {
  const intro = el();
  if (!intro || finishing) return;
  finishing = true;
  const rm = reduceMotion();
  const wait = Math.max(0, 1500 - (performance.now() - started));
  setTimeout(() => {
    intro.classList.add('jump');
    setTimeout(() => {
      intro.classList.add('out');
      document.documentElement.classList.remove('intro-on');
      setTimeout(() => intro.remove(), 1000);
    }, rm ? 200 : 950);
  }, rm ? 0 : wait);
}

/** Replace the intro text with the load error and a Retry button that restores the loader and calls `retry`. */
export function fail(err: unknown, retry: () => void): void {
  console.error('[suri] could not load the brush', err);
  const intro = el();
  if (!intro) return;
  const inner = intro.querySelector<HTMLElement>('.intro-inner');
  if (!inner) return;
  if (!original) original = inner.innerHTML;
  finishing = false;
  inner.innerHTML = '';
  const h = document.createElement('h2');
  h.className = 'err';
  h.textContent = "Couldn't load the brush";
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cta';
  btn.textContent = 'Retry';
  btn.addEventListener('click', () => {
    inner.innerHTML = original;
    retry();
  });
  inner.append(h, btn);
  btn.focus();
}
