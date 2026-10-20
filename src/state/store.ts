import { validate } from './design';
import type { Design } from './design';
import type { PartId } from '../data/parts';

export interface Store {
  get(): Design;
  update(patch: Partial<Design> | ((d: Design) => Design), opts?: { history?: boolean }): void;
  replace(d: Design): void;
  subscribe(fn: (next: Design, prev: Design) => void): () => void;
  undo(): boolean;
  canUndo(): boolean;
}

const MAX_HISTORY = 50;
const COLLAPSE_MS = 700;

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    Object.values(o).forEach(deepFreeze);
  }
  return o;
}

export function createStore(initial: Design, io: { save(json: string): void; now?: () => number; uploads?: () => Partial<Record<PartId, boolean>> }): Store {
  const now = io.now ?? Date.now;
  const dev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
  const check = (d: unknown): Design => {
    const v = validate(d, { uploads: io.uploads?.() });
    return dev ? deepFreeze(v) : v;
  };
  let state = check(initial);
  let lastSnap = JSON.stringify(state);
  const history: Design[] = [];
  const listeners = new Set<(next: Design, prev: Design) => void>();
  let lastPush = 0;

  function commit(next: Design, prev: Design) {
    state = next;
    lastSnap = JSON.stringify(next);
    try { io.save(lastSnap); } catch { /* storage may be full or blocked */ }
    for (const fn of [...listeners]) {
      try { fn(next, prev); } catch (e) { console.error(e); }
    }
  }

  function set(raw: Design, record: boolean) {
    const prev = state;
    const next = check(raw);
    if (JSON.stringify(next) === lastSnap) return;
    if (record) {
      const t = now();
      if (t - lastPush > COLLAPSE_MS) {
        history.push(prev);
        if (history.length > MAX_HISTORY) history.shift();
      }
      lastPush = t;
    }
    commit(next, prev);
  }

  return {
    get: () => state,
    update(patch, opts) {
      set(typeof patch === 'function' ? patch(state) : { ...state, ...patch }, opts?.history !== false);
    },
    replace: (d) => set(d, true),
    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    undo() {
      const prev = history.pop();
      if (!prev) return false;
      commit(check(prev), state);
      return true;
    },
    canUndo: () => history.length > 0,
  };
}
