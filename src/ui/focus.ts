/**
 * Run `change` (which re-renders `container`, replacing button `b`). If `b` had keyboard focus, move focus to the
 * re-rendered pressed button matching `sel`, or else the button at the same position, so focus never drops to <body>.
 */
export function keepFocus(container: ParentNode, b: HTMLElement, sel: string, change: () => void): void {
  const had = document.activeElement === b;
  const idx = [...container.querySelectorAll(sel)].indexOf(b);
  change();
  if (!had || b.isConnected) return;
  const next = container.querySelector<HTMLElement>(`${sel}[aria-pressed="true"]`) ?? container.querySelectorAll<HTMLElement>(sel)[idx];
  next?.focus();
}
