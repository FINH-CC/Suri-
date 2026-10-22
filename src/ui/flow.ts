export type Step = 1 | 2 | 3 | 4;

export const STEP_LABELS = ['Start', 'Design', 'Name it', 'Hand over'] as const;

const svg = (d: string) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const CHECK = svg('<path d="M3.5 8.5l3 3 6-7"/>');
/** one small icon per step: star, palette, pencil, gift */
const ICONS = [
  svg('<path d="M8 1.8l1.8 4 4.3.4-3.3 2.9 1 4.2L8 11.1l-3.8 2.2 1-4.2L1.9 6.2l4.3-.4z"/>'),
  svg('<path d="M8 2a6 6 0 100 12c.9 0 1.3-.7 1-1.4-.4-.9.2-1.9 1.2-1.9H12a2 2 0 002-2A6 6 0 008 2z"/><circle cx="5" cy="7" r=".7"/><circle cx="7.5" cy="4.8" r=".7"/><circle cx="10.6" cy="5.6" r=".7"/>'),
  svg('<path d="M10.5 2.5l3 3L6 13H3v-3z"/><path d="M9 4l3 3"/>'),
  svg('<rect x="2.5" y="6" width="11" height="7.5" rx="1"/><path d="M2 6h12M8 6v7.5"/><path d="M8 6C6.5 3 4 3.5 4.5 5S8 6 8 6zm0 0c1.5-3 4-2.5 3.5-1S8 6 8 6z"/>'),
];
const clamp = (n: number): Step => Math.min(4, Math.max(1, Math.round(n))) as Step;

/** Four-step flow (legacy goStep 1403-1450, minus the pick/create modes): step sections, level track, bottom bar. */
export function createFlow(opts: { onEnter: (step: Step) => void }): { goStep(n: Step, scroll?: boolean): void; step(): Step } {
  let cur: Step = 1;
  let prev = 0;
  const nav = document.getElementById('steps')!;
  const back = document.getElementById('step-back') as HTMLButtonElement;
  const next = document.getElementById('step-next') as HTMLButtonElement;

  /** Slim segmented progress: one bar per step (done = ink, current = the brush accent), a small label under each. */
  function renderTrack() {
    nav.innerHTML = '';
    for (let k = 1; k <= 4; k++) {
      const b = document.createElement('button');
      b.type = 'button';
      const filling = k === cur && prev === k - 1 ? ' fill' : '';
      b.className = 'seg-step' + (k < cur ? ' done' : k === cur ? ' cur' + filling : '');
      b.innerHTML = `<span class="bar"><i></i></span><span class="nm"><span class="ico">${k < cur ? CHECK : ICONS[k - 1]}</span>${STEP_LABELS[k - 1]}</span>`;
      b.setAttribute('aria-label', `Step ${k} of 4: ${STEP_LABELS[k - 1]}`);
      if (k === cur) b.setAttribute('aria-current', 'step');
      b.addEventListener('click', () => goStep(k as Step, true));
      nav.appendChild(b);
    }
  }

  function goStep(n: Step, scroll = false) {
    cur = clamp(n);
    for (let i = 1; i <= 4; i++) document.getElementById('step-' + i)!.hidden = i !== cur;
    renderTrack();
    prev = cur;
    back.hidden = cur === 1;
    next.hidden = cur === 4;
    if (cur < 4) next.textContent = 'Next: ' + STEP_LABELS[cur as 1 | 2 | 3];
    opts.onEnter(cur);
    if (scroll) {
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      nav.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  }

  back.addEventListener('click', () => goStep(clamp(cur - 1), true));
  next.addEventListener('click', () => goStep(clamp(cur + 1), true));
  return { goStep, step: () => cur };
}
