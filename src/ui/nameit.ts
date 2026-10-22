import { CHARACTERS } from '../data/characters';
import { mixHex } from '../data/palette';
import { PART } from '../data/parts';
import type { PartId } from '../data/parts';
import { cleanName } from '../state/design';
import type { Design } from '../state/design';
import type { Store } from '../state/store';
import type { BrushScene } from '../three/scene';
import { snapshot } from '../three/snapshot';

const LOGO = '/suri-wordmark.png';
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Stable per-design passport number (legacy passportNo 1552). */
export function passportNo(d: Design): string {
  let h = 2166136261;
  const s = JSON.stringify([d.parts, d.colours, d.finish, d.name]);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 'SK01-' + (h >>> 0).toString(36).toUpperCase().padStart(7, '0');
}

/** ICAO 9303 check digit (7-3-1 weighting) so the machine-readable lines look the real thing (legacy mrzCheck 1554). */
export function mrzCheck(str: string): string {
  const v = (c: string) => (c === '<' ? 0 : /[0-9]/.test(c) ? +c : c.charCodeAt(0) - 55);
  let t = 0;
  for (let i = 0; i < str.length; i++) t += v(str[i]) * [7, 3, 1][i % 3];
  return String(t % 10);
}
const mrzPad = (str: string, n: number) => (str + '<'.repeat(n)).slice(0, n);

/** The two 44-character machine-readable lines (legacy 1573-1579). */
export function mrzLines(d: Design, date: Date): [string, string] {
  const name = d.name.trim();
  const no = passportNo(d).replace('-', '');
  const yymmdd = String(date.getFullYear()).slice(2) + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');
  const mrzName = (name || 'UNNAMED').toUpperCase().normalize('NFD').replace(/[^A-Z ]/g, '').trim().replace(/\s+/g, '<');
  const l1 = mrzPad(`P<SRK${mrzName}<<KIDS<LAB`, 44);
  const docNo = mrzPad(no, 9);
  const body = `${docNo}${mrzCheck(docNo)}SRK${yymmdd}${mrzCheck(yymmdd)}<${yymmdd}${mrzCheck(yymmdd)}`;
  return [l1, mrzPad(body, 43) + mrzCheck(body)];
}

/** Shrink the name until the longest word fits the line and it sits on two lines at most (legacy fitName 1557). */
function fitName(el: HTMLElement | null, max: number, min: number) {
  if (!el || !el.parentElement?.clientWidth) return;
  let size = max;
  el.style.fontSize = size + 'px';
  while (size > min && (el.scrollWidth > el.clientWidth + 1 || el.offsetHeight > size * 1.02 * 2 + 2)) {
    size -= 1;
    el.style.fontSize = size + 'px';
  }
}

const CREST = '<svg class="pp-crest" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="13" cy="13" r="11.5"/><path d="M7.5 15.5a3 3 0 01.6-5.9 4 4 0 017.6-1 3.2 3.2 0 012.4 5.6 2.5 2.5 0 01-1.6 1.3z"/><path d="M9 19h8M10.5 21.5h5"/></svg>';

/** Name it screen (legacy 1550-1602): the name field, the box front and the passport. Returns an unmount. */
export function mountNameIt(store: Store, scene: BrushScene): () => void {
  const ac = new AbortController();
  const section = document.getElementById('step-3')!;
  const input = document.getElementById('char-name') as HTMLInputElement;
  const boxEl = document.getElementById('box-mock')!;
  const passEl = document.getElementById('passport')!;
  let imgKey = '', thumb = '', hero = '';

  /** Box and hero renders are cached by what they depict; text never re-renders them. */
  function images(d: Design) {
    const key = JSON.stringify([d.parts, d.colours, d.finish]);
    if (key === imgKey) return;
    thumb = snapshot(scene, d, 'card', 560, 560);
    hero = snapshot(scene, d, 'hero', 280, 360);
    imgKey = key;
  }

  function render(d: Design) {
    const name = d.name.trim();
    const ch = d.character && d.character !== 'blank' ? CHARACTERS[d.character] : undefined;
    const base = ch ? ch.name : 'Original';
    const opt = (id: PartId) => (d.parts[id] === 'upload' ? 'Custom' : PART[id].options[d.parts[id]]);
    const capHex = d.colours.cap || '#adaae1';
    boxEl.style.background = mixHex(capHex, '#ffffff', 0.62);
    boxEl.innerHTML = `<div class="top"><span class="wm"><img src="${LOGO}" alt="SURI">KIDS</span></div><span class="ssn">SEASON 01</span>
    <span class="disc" style="background:${mixHex(capHex, '#ffffff', 0.18)}"></span><img class="br" src="${thumb}" alt="">
    <div class="bottom"><span class="nm${name ? '' : ' ph'}">${esc(name || 'Name me')}</span><span class="desc">Designed by a kid, built by SURI</span></div>`;
    const date = new Date();
    const issued = `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
    const [l1, l2] = mrzLines(d, date);
    const f = (k: string, v: string, cls = '') => `<span class="pp-f ${cls}"><small>${k}</small><b>${v}</b></span>`;
    passEl.innerHTML = `
    <div class="pp-head">${CREST}<span class="t"><b>SURI KIDS LAB</b><i>PASSPORT · PASSEPORT</i></span>
      <span class="no"><small>Passport no.</small><b>${passportNo(d)}</b></span></div>
    <div class="pp-body">
      <div class="pp-photo" style="--a:${mixHex(capHex, '#ffffff', 0.55)};--b:${mixHex(capHex, '#ffffff', 0.75)};--c:${capHex}"><span class="burst"></span><span class="spark s1"></span><span class="spark s2"></span><span class="spark s3"></span><img src="${hero}" alt=""></div>
      <div class="pp-fields">
        ${f('Name / Nom', name ? esc(name) : '&nbsp;', 'wide name')}
        ${f('Type', 'P')}${f('Code', 'SRK')}
        ${f('Based on', esc(base))}${f('Season', '01')}
        ${f('Cap', esc(opt('cap')))}${f('Grip', esc(opt('grip')))}
        ${f('Date of issue', issued)}${f('Authority', 'Kids Lab')}
        <span class="pp-f wide"><small>Holder's signature</small><b class="pp-sig">${esc(name || ' ')}</b></span>
        <img class="pp-ghost" src="${hero}" alt="">
      </div>
    </div>
    <div class="pp-mrz">${esc(l1)}\n${esc(l2)}</div>`;
    // the section must be laid out for the fit to measure anything
    requestAnimationFrame(() => fitName(boxEl.querySelector('.nm'), 26, 16));
  }

  const visible = () => !section.hidden;
  function enter() {
    const d = store.get();
    if (input.value !== d.name) input.value = d.name;
    images(d);
    render(d);
  }

  input.addEventListener('input', () => {
    const name = cleanName(input.value);
    if (input.value !== name) {
      input.value = name; // show what is kept, caret at the end
      input.setSelectionRange(name.length, name.length);
    }
    store.update({ name });
  }, { signal: ac.signal });

  const unsub = store.subscribe((d) => {
    if (!visible()) return;
    if (input.value !== d.name && document.activeElement !== input) input.value = d.name; // undo etc.; never fight the caret
    images(d);
    render(d);
  });

  let wasVisible = visible();
  const mo = new MutationObserver(() => {
    const v = visible();
    if (v && !wasVisible) enter();
    wasVisible = v;
  });
  mo.observe(section, { attributes: true, attributeFilter: ['hidden'] });
  if (wasVisible) enter();

  return () => { ac.abort(); unsub(); mo.disconnect(); };
}
