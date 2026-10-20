// TEMPORARY manual-check harness for Task 9 (replaced in Task 12).
import { DEFAULT } from './data/characters';
import type { Design } from './state/design';
import type { CapCore } from './three/capfit';
import { loadModel } from './three/model';
import { BrushScene } from './three/scene';

declare global {
  interface Window {
    __scene: BrushScene;
    __apply: (d: Design) => void;
    __frames: () => number;
  }
}

const stage = document.getElementById('stage')!;
const [model, capFit] = await Promise.all([
  loadModel('/model/brush.glb', '/model/brush-meta.json', () => {}),
  fetch('/model/cap-fit.json').then((r) => r.json() as Promise<Record<string, CapCore>>),
]);
const scene = new BrushScene(stage, model, capFit);
let current: Design = structuredClone(DEFAULT);
scene.applyDesign(current, null);
scene.frameDefault();

window.__scene = scene;
window.__frames = () => scene.frames;
window.__apply = (d) => {
  const prev = current;
  current = structuredClone(d);
  scene.applyDesign(current, prev);
};

let apart = false;
const apartBtn = document.getElementById('tb-apart')!;
apartBtn.addEventListener('click', () => {
  apart = !apart;
  apartBtn.textContent = apart ? 'Put together' : 'Take apart';
  scene.setExploded(apart);
});
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) =>
  b.addEventListener('click', () => scene.setView(+b.dataset.view! as 0 | 1 | 2 | 3)),
);
