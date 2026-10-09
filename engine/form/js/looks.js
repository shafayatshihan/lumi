// "The look" screen: six entries in the right column (five looks + Claude chooses), and the hovered / selected look's
// real slides large in the illustration zone. "Claude chooses" plays a playful shuffle through the five looks.
// Bold Blue is listed first, carries a "recommended" badge and is pre-selected until the user picks a look themselves
// (the explicit pick is remembered in localStorage, so a deliberate "Claude chooses" is never overwritten).
// mountLooks(el, illusEl, { getState, setKey, bus, audio }) -> { destroy() }
import { emit } from './bus.js';

export const LOOKS = [
  { name: 'Bold Blue', slug: '2-bold-blue', desc: 'studio 3D and clear charts: warm canvas, one blue phrase, photoreal models', recommended: true },
  { name: 'Clay Pop', slug: '5-clay-pop', desc: 'tactile 3D: chunky clay models in one hot orange, soft studio light' },
  { name: 'Red Gallery', slug: '7-red-gallery', desc: 'editorial exhibition: red condensed capitals, black-and-white framed prints' },
  { name: 'Candy Grid', slug: '8-candy-grid', desc: 'bright portfolio: colour-block boards, black bars, glossy product shots' },
  { name: 'Violet Lime', slug: '9-violet-lime', desc: 'two-colour pitch deck: violet and acid lime, rounded frames, your own photographs' },
  { name: 'Claude chooses', slug: null, desc: 'Claude picks the look that suits your topic and audience' },
];
const AUTO = 'Claude chooses';
const RECOMMENDED = 'Bold Blue';
const PICKED_KEY = 'lumi-look-picked';
const userPicked = () => { try { return localStorage.getItem(PICKED_KEY) === '1'; } catch (e) { return false; } };
const rememberPick = () => { try { localStorage.setItem(PICKED_KEY, '1'); } catch (e) { /* private window */ } };
const SHUFFLE_MS = 2600;
// Each look shows real slides from a real deck in that look, not a demo video: four stills at
// /themes/<slug>-1..4.jpg, cross-faded in place. Stills beat video here - they load instantly, they are the
// actual output rather than a trailer for it, and nothing has to decode while the person is reading.
const SHOTS = 4;
const SLIDE_MS = 2300;

// Tiny flat swatches that hint at each look.
const SWATCH = {
  'Bold Blue': '<rect x="4" y="4" width="36" height="36" rx="8" fill="#1d4ed8"/><circle cx="29" cy="15" r="6" fill="var(--pill)"/><rect x="10" y="25" width="24" height="5" rx="2.5" fill="var(--ink)"/><rect x="10" y="33" width="14" height="3" rx="1.5" fill="var(--pill)"/>',
  'Red Gallery': '<rect x="4" y="4" width="36" height="36" rx="8" fill="#ecebe4"/><rect x="4" y="4" width="6" height="36" fill="#f6f5f0"/><rect x="11" y="21" width="11" height="13" fill="#e31b23"/><rect x="14" y="10" width="15" height="20" fill="#ffffff"/><rect x="16" y="12" width="11" height="16" fill="#9a9894"/><rect x="18" y="17" width="6" height="9" fill="#2a2a2a"/><rect x="31" y="11" width="6" height="3" fill="#e31b23"/><rect x="31" y="16" width="6" height="3" fill="#e31b23"/><circle cx="35" cy="35" r="2.5" fill="#e31b23"/>',
  'Candy Grid': '<rect x="4" y="4" width="36" height="36" rx="8" fill="#ffffff"/><rect x="4" y="4" width="6" height="36" fill="#1f1f23"/><rect x="10" y="4" width="16" height="18" fill="#ffc72c"/><rect x="26" y="22" width="14" height="18" fill="#29c4e6"/><circle cx="26" cy="22" r="7" fill="#f9a8c9"/><rect x="28" y="9" width="9" height="2.5" fill="#1b1b1f"/><rect x="28" y="13" width="7" height="2.5" fill="#1b1b1f"/><circle cx="15" cy="32" r="2.5" fill="#ec4a7b"/>',
  'Clay Pop': '<rect x="4" y="4" width="36" height="36" rx="8" fill="#f0f0f5"/><ellipse cx="20" cy="35.5" rx="11" ry="2" fill="#15151c" opacity=".16"/><rect x="9" y="16" width="22" height="19" rx="6" fill="#c93a05"/><rect x="9" y="14" width="22" height="18" rx="6" fill="#ff6a13"/><rect x="12" y="16" width="16" height="4" rx="2" fill="#ff9a3d"/><circle cx="33" cy="10.5" r="3.6" fill="#ff6a13"/><rect x="21" y="23" width="7" height="4" rx="1" fill="#f2c29a" transform="rotate(-18 24.5 25)"/>',
  'Violet Lime': '<rect x="4" y="4" width="36" height="36" rx="8" fill="#ffffff"/><rect x="4" y="22" width="36" height="18" fill="#3d2ee6"/><rect x="22" y="8" width="15" height="19" rx="4" fill="#3d2ee6"/><rect x="7" y="9" width="12" height="7" rx="3.5" fill="#d2f53c"/><rect x="7" y="27" width="11" height="3" rx="1.5" fill="#ffffff"/><rect x="7" y="32" width="7" height="3" rx="1.5" fill="#d4d0f7"/><rect x="26" y="28" width="13" height="13" rx="4" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="1.6"/>',
  'Claude chooses': '<g class="lk-dice"><rect x="5" y="5" width="15" height="15" rx="4" fill="#ff4fa3"/><rect x="24" y="5" width="15" height="15" rx="4" fill="#1d4ed8"/><rect x="5" y="24" width="15" height="15" rx="4" fill="#ffd23f"/><rect x="24" y="24" width="15" height="15" rx="4" fill="#ff8a3d"/></g><circle cx="22" cy="22" r="5.5" fill="var(--ink)"/><path d="M22 19.2v5.6M19.2 22h5.6" stroke="var(--pill)" stroke-width="1.8" stroke-linecap="round"/>',
};

import { h } from './dom.js';

export function mountLooks(el, illusEl, { getState, setKey, bus, audio } = {}) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sfx = n => { try { audio && audio.sfx && audio.sfx(n); } catch (e) { /* optional */ } };
  const fire = (type, detail) => {
    try { bus && bus.dispatchEvent ? bus.dispatchEvent(new CustomEvent(type, { detail })) : emit(type, detail); } catch (e) { /* optional */ }
  };
  const current = () => {
    const l = getState && getState().look; const t = l && l.theme;
    if (LOOKS.some(x => x.name === t) && (t !== AUTO || userPicked())) return t;
    return RECOMMENDED;            // nothing chosen by the user yet: Bold Blue is pre-selected
  };
  let alive = true, selected = current(), shown = null, hoverT = 0, leaveT = 0, shuffleT = 0, shuffleIdx = 0, swapT = 0, clicked = false;
  let slideT = 0, slideIdx = 0;

  // ---- right column: the options
  const opts = LOOKS.map((L, n) => {
    const b = h('button', { type: 'button', class: 'lk-opt', role: 'radio', 'data-look': L.name, 'data-nosfx': '', 'data-cursor-label': 'pick',
      style: `--d:${n * 45}ms` },
      h('span', { class: 'lk-sw', html: `<svg viewBox="0 0 44 44" aria-hidden="true">${SWATCH[L.name]}</svg>` }),
      h('span', { class: 'lk-txt' }, h('span', { class: 'lk-name' }, L.name,
        L.recommended ? h('span', { class: 'lk-sugg lk-rec', style: 'display:inline-flex;margin-left:8px;background:#0061EF;color:#FFFFFF' }, 'recommended') : null),
        h('span', { class: 'lk-desc' }, L.desc)),
      h('span', { class: 'lk-tick', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' }));
    b.addEventListener('click', () => pick(L.name));
    b.addEventListener('pointerenter', () => preview(L.name));
    b.addEventListener('focus', () => preview(L.name, 0));
    return b;
  });
  const listEl = h('div', { class: 'lk', role: 'radiogroup', 'aria-label': 'the look' }, opts);
  listEl.addEventListener('pointerleave', () => unpreview());
  listEl.addEventListener('focusout', e => { if (!listEl.contains(e.relatedTarget)) unpreview(); });
  listEl.addEventListener('keydown', e => {
    const n = opts.indexOf(document.activeElement);
    if (n < 0) return;
    const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    opts[(n + d + opts.length) % opts.length].focus();
  });
  el.append(listEl);

  // ---- illustration zone: a framed screen with two stacked stills for smooth swaps
  const mkShot = () => h('img', { class: 'lk-vid', alt: '', 'aria-hidden': 'true', decoding: 'async', draggable: 'false' });
  const vids = [mkShot(), mkShot()];
  let front = 0;
  const badge = h('span', { class: 'lk-badge' });
  const REAL = LOOKS.filter(L => L.slug);          // the looks with slides; 'Claude chooses' has none
  const dots = h('span', { class: 'lk-dots', 'aria-hidden': 'true' }, Array.from({ length: SHOTS }, () => h('i')));
  const screen = h('div', { class: 'lk-screen' }, vids, h('div', { class: 'lk-top' }, badge, dots));
  const stageEl = h('div', { class: 'lk-stage' + (reduced ? ' lk-reduced' : '') }, screen,
    h('p', { class: 'lk-cap', 'aria-live': 'polite' }));
  const cap = stageEl.lastChild;
  if (illusEl) illusEl.append(stageEl);

  // Show one slide of one look. `dir` slides it in from a side when the LOOK changed; a step within the same
  // look cross-fades in place, so moving between slides reads as one deck rather than as another product.
  function showShot(L, i, dir = 0) {
    if (!L || !L.slug) return;
    const src = `/themes/${L.slug}-${(i % SHOTS) + 1}.jpg`;
    const back = vids[1 - front], cur = vids[front];
    if (cur.dataset.src === src) return;
    back.src = src; back.dataset.src = src;
    paintDots(i % SHOTS);
    back.classList.remove('is-out', 'from-r', 'from-l');
    cur.classList.remove('from-r', 'from-l');
    if (!reduced && dir) back.classList.add(dir > 0 ? 'from-r' : 'from-l');
    back.classList.add('is-in');
    cur.classList.remove('is-in');
    cur.classList.add('is-out');
    front = 1 - front;
    clearTimeout(swapT);
    swapT = setTimeout(() => { if (alive) cur.classList.remove('is-out'); }, 520);
  }
  function paintDots(n) { [...dots.children].forEach((d, k) => d.classList.toggle('on', k === n)); }
  function stopSlides() { clearTimeout(slideT); slideT = 0; }
  // Walk one look's four slides. Paused with the tab, and restarted from the first slide whenever the look changes,
  // so a look is always introduced by its title slide.
  // A look is still INTRODUCED by its title slide - that is what makes it recognisable - but after that the walk
  // is random, not 1-2-3-4. Three things change together and all three matter:
  //   * the next slide is picked at random and never repeats the one showing, so the page never settles into a
  //     loop a person can predict and stop watching;
  //   * the beat is jittered +/- 30 %, so two looks on screen never fall into lockstep;
  //   * each step slides in from a random side instead of cross-fading in place, which is what reads as movement.
  function startSlides(L, dir) {
    stopSlides();
    slideIdx = 0;
    showShot(L, 0, dir);
    const beat = () => SLIDE_MS * (0.7 + Math.random() * 0.6);
    const step = () => {
      if (!alive || document.hidden) return;
      let next = slideIdx;
      if (SHOTS > 1) while (next === slideIdx) next = Math.floor(Math.random() * SHOTS);
      slideIdx = next;
      showShot(L, slideIdx, Math.random() < 0.5 ? -1 : 1);
      slideT = setTimeout(step, beat());
    };
    slideT = setTimeout(step, beat());
  }
  function stopShuffle() { clearTimeout(shuffleT); shuffleT = 0; stageEl.classList.remove('is-shuffle'); }
  function startShuffle() {
    stopShuffle();
    stopSlides();                                  // the shuffle drives the picture itself, one look per beat
    stageEl.classList.add('is-shuffle');
    const step = (first) => {
      if (!alive) return;
      if (!first && REAL.length > 1) {
        let nx = shuffleIdx;
        while (nx === shuffleIdx) nx = Math.floor(Math.random() * REAL.length);
        shuffleIdx = nx;
      }
      // a random slide each beat, so the shuffle shows the range of the whole set rather than a row of title slides
      showShot(REAL[shuffleIdx], Math.floor(Math.random() * SHOTS), first ? 0 : (Math.random() < 0.5 ? -1 : 1));
      badge.textContent = REAL[shuffleIdx].name.toLowerCase();
      if (!first) sfx('tick');
      shuffleT = setTimeout(() => step(false), SHUFFLE_MS);
    };
    step(true);
  }
  function show(name) {
    if (!alive || shown === name) return;
    const prevIdx = LOOKS.findIndex(x => x.name === shown);
    shown = name;
    const L = LOOKS.find(x => x.name === name);
    const isPreview = name !== selected;
    stageEl.classList.toggle('is-preview', isPreview);
    cap.textContent = name === AUTO ? 'claude shuffles them all and picks the best fit for your talk.'
      : `${isPreview ? 'preview: ' : ''}${L.desc}.`;
    if (name === AUTO) { startShuffle(); return; }
    stopShuffle();
    badge.textContent = name.toLowerCase();
    const n = LOOKS.indexOf(L);
    startSlides(L, prevIdx < 0 ? 0 : n > prevIdx ? 1 : -1);
  }
  function preview(name, delay = 140) {
    clearTimeout(leaveT); clearTimeout(hoverT);
    hoverT = setTimeout(() => show(name), delay);
  }
  function unpreview() {
    clearTimeout(hoverT); clearTimeout(leaveT);
    leaveT = setTimeout(() => show(selected), 260);
  }
  function paint() {
    opts.forEach(b => {
      const on = b.dataset.look === selected;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    listEl.classList.toggle('show-sugg', selected === RECOMMENDED && !clicked);
  }
  function pick(name) {
    clicked = true;
    rememberPick();
    const changed = name !== selected;
    selected = name;
    paint();
    if (setKey) setKey('look.theme', name);
    fire('look:change', { theme: name });
    sfx(changed ? 'select' : 'pop');
    const b = opts.find(x => x.dataset.look === name);
    if (b && !reduced) { b.classList.remove('lk-pop'); void b.offsetWidth; b.classList.add('lk-pop'); }
    shown = null;   // replay the chosen look from its start
    clearTimeout(hoverT); clearTimeout(leaveT);
    show(name);
    stageEl.classList.remove('is-preview');
  }

  const onVis = () => {
    if (document.hidden) { stopSlides(); clearTimeout(shuffleT); }
    else if (alive) { const was = shown; shown = null; show(was); }
  };
  document.addEventListener('visibilitychange', onVis);

  paint();
  // write the pre-selection into the form state so the brief carries it even when the user never clicks
  { const l = getState && getState().look; if (setKey && (!l || l.theme !== selected)) setKey('look.theme', selected); }
  show(selected);
  requestAnimationFrame(() => alive && listEl.classList.add('lk-ready'));

  return {
    destroy() {
      alive = false;
      clearTimeout(hoverT); clearTimeout(leaveT); clearTimeout(swapT); stopShuffle(); stopSlides();
      document.removeEventListener('visibilitychange', onVis);
      for (const v of vids) v.removeAttribute('src');
      stageEl.remove();
      listEl.remove();
    },
  };
}
