/*
 * Full-page intro that doubles as the loader (legacy/index.html 434-439, 1940-1952).
 * There is no bail timer: the intro leaves only through finish(), or turns into an error with Retry through fail().
 */
const started = performance.now();
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const el = () => document.getElementById('intro');
// captured at module load so a restored loader never carries progress state from the failed attempt
const original = el()?.querySelector('.intro-inner')?.innerHTML ?? '';
let finishing = false;

/** Keep the hopping wordmark on screen for at least 1.5 s, give it one big jump, then slide the intro away and remove it. */
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
