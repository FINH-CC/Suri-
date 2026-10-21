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

describe('store fixes', () => {
  it('upload survives only when io.uploads allows', () => {
    const mk = (uploads?: () => Record<string, boolean>) =>
      createStore(DEFAULT, { save: () => {}, uploads });
    const a = mk(() => ({ cap: true }));
    a.update({ parts: { ...a.get().parts, cap: 'upload' } });
    expect(a.get().parts.cap).toBe('upload');
    const b = mk();
    b.update({ parts: { ...b.get().parts, cap: 'upload' } });
    expect(b.get().parts.cap).toBe(DEFAULT.parts.cap);
  });
  it('mutating get() throws in dev', () => {
    const { store } = make();
    expect(() => { (store.get() as { name: string }).name = 'x'; }).toThrow();
  });
  it('sticker edit changing only s is saved and notified', () => {
    const save = vi.fn();
    const store = createStore(DEFAULT, { save, now: () => 1 });
    const st = { t: 'star' as const, p: 'cap' as const, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 1, s: 0.9, r: 0 };
    store.update({ stickers: [st] });
    const fn = vi.fn();
    store.subscribe(fn);
    save.mockClear();
    store.update({ stickers: [{ ...st, s: 1.2 }] });
    expect(save).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(store.get().stickers[0].s).toBe(1.2);
  });

  describe('redo', () => {
    it('redo re-applies an undone change', () => {
      const { store } = make();
      expect(store.canRedo()).toBe(false);
      store.update({ name: 'A' });
      store.undo();
      expect(store.canRedo()).toBe(true);
      expect(store.redo()).toBe(true);
      expect(store.get().name).toBe('A');
      expect(store.canRedo()).toBe(false);
      expect(store.canUndo()).toBe(true);
      expect(store.redo()).toBe(false);
    });
    it('a new edit clears the forward stack', () => {
      const { store, tick } = make();
      store.update({ name: 'A' }); tick(1000);
      store.undo();
      store.update({ name: 'B' });
      expect(store.canRedo()).toBe(false);
    });
    it('a no-op update keeps the forward stack', () => {
      const { store } = make();
      store.update({ name: 'A' });
      store.undo();
      store.update({ name: 'Nova' });
      expect(store.canRedo()).toBe(true);
    });
    it('an edit right after undo is a fresh step', () => {
      const { store, tick } = make();
      store.update({ name: 'A' }); tick(10);
      store.undo(); tick(10);
      store.update({ name: 'B' });
      expect(store.undo()).toBe(true);
      expect(store.get().name).toBe('Nova');
    });
    it('an edit right after redo is a fresh step', () => {
      const { store, tick } = make();
      store.update({ name: 'A' }); tick(10);
      store.undo(); tick(10);
      store.redo(); tick(10);
      store.update({ name: 'B' });
      expect(store.undo()).toBe(true);
      expect(store.get().name).toBe('A');
    });
    it('lastChange reports replace', () => {
      const { store } = make();
      store.replace({ ...store.get(), name: 'R' });
      expect(store.lastChange()).toBe('replace');
      store.update({ name: 'E' });
      expect(store.lastChange()).toBe('edit');
    });
    it('caps both stacks at 50 and reports the cause', () => {
      const { store, tick } = make();
      for (let i = 0; i < 60; i++) { store.update({ name: 'n' + i }); tick(1000); }
      let u = 0;
      while (store.undo()) u++;
      expect(u).toBe(50);
      expect(store.lastChange()).toBe('undo');
      let r = 0;
      while (store.redo()) r++;
      expect(r).toBe(50);
      expect(store.lastChange()).toBe('redo');
      store.update({ name: 'z' });
      expect(store.lastChange()).toBe('edit');
    });
    it('redo notifies with (next, prev)', () => {
      const { store } = make();
      store.update({ name: 'A' });
      store.undo();
      const fn = vi.fn();
      store.subscribe(fn);
      store.redo();
      expect(fn).toHaveBeenCalledWith(expect.objectContaining({ name: 'A' }), expect.objectContaining({ name: 'Nova' }));
    });
  });
});
