export type Step = 1 | 2 | 3 | 4;

export const STEP_LABELS = ['Start', 'Design', 'Name it', 'Hand over'] as const;

const CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3.5 8.5l3 3 6-7"/></svg>';
const clamp = (n: number): Step => Math.min(4, Math.max(1, Math.round(n))) as Step;

/** Four-step flow (legacy goStep 1403-1450, minus the pick/create modes): step sections, level track, bottom bar. */
export function createFlow(opts: { onEnter: (step: Step) => void }): { goStep(n: Step, scroll?: boolean): void; step(): Step } {
  let cur: Step = 1;
  let prev = 0;
  const nav = document.getElementById('steps')!;
  const back = document.getElementById('step-back') as HTMLButtonElement;
  const next = document.getElementById('step-next') as HTMLButtonElement;

  function renderTrack() {
    nav.innerHTML = '';
    for (let k = 1; k <= 4; k++) {
      if (k > 1) {
        const l = document.createElement('span');
        l.className = 'link' + (k <= cur ? (k === cur && prev === k - 1 ? ' fill' : ' done') : '');
        l.innerHTML = '<i></i>';
        nav.appendChild(l);
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'node' + (k < cur ? ' done' : k === cur ? ' cur' : '');
      b.innerHTML = `<span class="dot">${k < cur ? CHECK : k}</span><span class="nm">${STEP_LABELS[k - 1]}</span>`;
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
