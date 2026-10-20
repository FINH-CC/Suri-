let timer = 0;

/** Legacy toast (legacy/index.html 1664): show `msg` for 2.2 s. */
export function toast(msg: string): void {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(timer);
  timer = window.setTimeout(() => t.classList.remove('show'), 2200);
}
