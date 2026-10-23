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

/**
 * Keep the hopping wordmark on screen for at least 1.5 s, give it one big jump, and slide the intro away while the
 * jump lands (0.6 s jump, slide from 0.4 s, 0.75 s long: ~1.2 s from ready to gone, so the brush is not kept waiting).
 */
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
      setTimeout(() => intro.remove(), 800);
    }, rm ? 200 : 400);
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

/* ---------- password gate ---------- */

const LANDED_MS = 900; // "Lab" lands 0.2 s + 0.7 s after load (base.css .intro .w / .lab)
const ARROW = '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 9h11M10 4.5L14.5 9 10 13.5"/></svg>';

/**
 * Show the password field under "Lab" once the wordmark has landed, and resolve when `submit` accepts a password
 * (the field fades out first) or reports the gate is not configured. The wordmark keeps hopping throughout.
 */
export function askPassword(submit: (password: string) => Promise<'ok' | 'wrong' | 'not-configured'>): Promise<'ok' | 'not-configured'> {
  const inner = el()?.querySelector<HTMLElement>('.intro-inner');
  if (!inner) return Promise.resolve('not-configured'); // no loader to ask on: never open by default
  inner.querySelector('.gate')?.remove();
  const form = document.createElement('form');
  form.className = 'gate';
  form.noValidate = true;
  form.innerHTML =
    '<label class="vh" for="gate-pw">Password</label>' +
    '<div class="gate-field">' +
    '<input id="gate-pw" name="password" type="password" placeholder="Password" autocomplete="current-password" autocapitalize="off" spellcheck="false" aria-describedby="gate-msg">' +
    `<button class="gate-go" type="submit" aria-label="Unlock">${ARROW}</button>` +
    '</div>' +
    '<p class="gate-msg" id="gate-msg" aria-live="polite"></p>';
  const wait = Math.max(0, LANDED_MS - (performance.now() - started));
  form.style.animationDelay = `${wait}ms`;
  inner.append(form);
  const input = form.querySelector<HTMLInputElement>('input')!;
  const btn = form.querySelector<HTMLButtonElement>('button')!;
  const msg = form.querySelector<HTMLElement>('.gate-msg')!;
  setTimeout(() => input.focus({ preventScroll: true }), wait);

  const shake = () => {
    if (reduceMotion()) return;
    form.classList.remove('shake');
    void form.offsetWidth;
    form.classList.add('shake');
  };
  const setBusy = (busy: boolean) => {
    form.classList.toggle('busy', busy);
    btn.disabled = busy;
    btn.setAttribute('aria-busy', String(busy));
    input.readOnly = busy;
  };

  return new Promise((resolve) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (btn.disabled) return;
      const pw = input.value;
      if (!pw) { shake(); input.focus(); return; }
      setBusy(true);
      msg.textContent = '';
      let result: 'ok' | 'wrong' | 'not-configured' | 'error';
      try { result = await submit(pw); } catch (err) { console.error('[suri] unlock failed', err); result = 'error'; }
      setBusy(false);
      if (result === 'ok' || result === 'not-configured') {
        form.style.animationDelay = '';
        form.classList.add('out');
        input.blur();
        setTimeout(() => form.remove(), reduceMotion() ? 0 : 300);
        resolve(result);
        return;
      }
      msg.textContent = result === 'wrong' ? "That's not it, try again." : "Couldn't check that, try again.";
      if (result === 'wrong') input.value = '';
      shake();
      input.focus();
    });
  });
}

/** The gate has no password configured on the server: say so, with no field. */
export function notConfigured(): void {
  const inner = el()?.querySelector<HTMLElement>('.intro-inner');
  if (!inner) return;
  inner.querySelector('.gate')?.remove();
  const p = document.createElement('p');
  p.className = 'gate-note';
  p.textContent = "This preview isn't set up yet.";
  inner.append(p);
}
