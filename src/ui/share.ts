import { PARTS } from '../data/parts';
import { encode } from '../state/design';
import type { Store } from '../state/store';
import { toast } from './toast';

/** Share (legacy 1629-1637): put the design in the address bar, copy the link, toast. */
export function mountShare(store: Store, signal: AbortSignal): void {
  document.getElementById('share')!.addEventListener('click', async () => {
    const d = store.get();
    let hash: string;
    try { hash = '#d=' + encode(d); } catch (err) {
      console.error(err);
      toast('Could not make a link for this design');
      return;
    }
    const clean = location.pathname + location.search;
    history.replaceState(null, '', clean + hash); // the address bar shows the link while it is copied
    const url = location.origin + clean + hash;
    try {
      await navigator.clipboard.writeText(url);
      toast(PARTS.some((p) => d.parts[p.id] === 'upload') ? 'Link copied. Uploaded parts show as originals.' : 'Link copied');
    } catch {
      prompt('Copy this link', url);
    } finally {
      history.replaceState(null, '', clean); // a reload then reopens the saved current design, not this snapshot
    }
  }, { signal });
}
