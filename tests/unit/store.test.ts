import { describe, expect, it, vi } from 'vitest';
import { DEFAULT } from '../../src/data/characters';
import { createStore } from '../../src/state/store';

function make(save: (j: string) => void = () => {}) {
  let t = 10000;
  const store = createStore(DEFAULT, { save, now: () => t });
  return { store, tick: (ms: number) => (t += ms) };
}

describe('store', () => {
  it('update patches state and notifies (next, prev)', () => {
    const { store } = make();
    const fn = vi.fn();
    store.subscribe(fn);
    store.update({ name: 'Zed' });
    expect(store.get().name).toBe('Zed');
    expect(fn).toHaveBeenCalledWith(store.get(), expect.objectContaining({ name: 'Nova' }));
  });
  it('accepts function updaters and validates', () => {
    const { store } = make();
    store.update((d) => ({ ...d, name: 'x<y>' }));
    expect(store.get().name).toBe('xy');
  });
  it('collapses quick bursts into one undo step', () => {
    const { store, tick } = make();
    store.update({ name: 'A' }); tick(100);
    store.update({ name: 'B' });
    expect(store.undo()).toBe(true);
    expect(store.get().name).toBe('Nova');
    expect(store.canUndo()).toBe(false);
    expect(store.undo()).toBe(false);
  });
  it('slow updates make separate steps', () => {
    const { store, tick } = make();
    store.update({ name: 'A' }); tick(1000);
    store.update({ name: 'B' });
    store.undo();
    expect(store.get().name).toBe('A');
    expect(store.canUndo()).toBe(true);
  });
  it('caps history at 50', () => {
    const { store, tick } = make();
    for (let i = 0; i < 60; i++) { store.update({ name: 'n' + i }); tick(1000); }
    let n = 0;
    while (store.undo()) n++;
    expect(n).toBe(50);
  });
  it('history:false skips snapshot', () => {
    const { store } = make();
    store.update({ name: 'A' }, { history: false });
    expect(store.canUndo()).toBe(false);
  });
  it('saves JSON and survives save throwing', () => {
    const save = vi.fn(() => { throw new Error('quota'); });
    const { store } = make(save);
    expect(() => store.update({ name: 'A' })).not.toThrow();
    expect(store.get().name).toBe('A');
    expect(save).toHaveBeenCalledWith(JSON.stringify(store.get()));
  });
  it('a throwing listener does not block others; unsubscribe works', () => {
    const { store } = make();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ok = vi.fn();
    store.subscribe(() => { throw new Error('x'); });
    const off = store.subscribe(ok);
    store.update({ name: 'A' });
    expect(ok).toHaveBeenCalledTimes(1);
    off();
    store.update({ name: 'B' });
    expect(ok).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
  it('undo does not push history and notifies', () => {
    const { store } = make();
    store.update({ name: 'A' });
    const fn = vi.fn();
    store.subscribe(fn);
    store.undo();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(store.canUndo()).toBe(false);
  });
});
