import { PARTS } from '../data/parts';
import { encode } from '../state/design';
import type { Store } from '../state/store';
import { toast } from './toast';

/** Share (legacy 1629-1637): put the design in the address bar, copy the link, toast. */
export function mountShare(store: Store, signal: AbortSignal): void {
  document.getElementById('share')!.addEventListener('click', async () => {
    const d = store.get();
    const hash = '#d=' + encode(d);
    history.replaceState(null, '', hash);
    const url = location.origin + location.pathname + location.search + hash;
    try {
      await navigator.clipboard.writeText(url);
      toast(PARTS.some((p) => d.parts[p.id] === 'upload') ? 'Link copied. Uploaded parts show as originals.' : 'Link copied');
    } catch {
      prompt('Copy this link', url);
    }
  }, { signal });
}
