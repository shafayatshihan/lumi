// "The talk" scene: a little theatre stage. The projector screen shows a mini slide with the title and subtitle as
// they are typed, a round sign shows the kind of talk as a drawn icon, and a calendar card on an easel shows the date
// and event. This file also holds the small 2D kit the other 2D scenes import (SVG helpers, text fitting, parallax,
// timers and clean-up), so every 2D scene looks and behaves the same.

// ------------------------------------------------------------------------------------------------ shared 2D kit
export const C = {
  bg: '#EEEDF9', f1: '#e4d3e8', f2: '#d7c2dd', f3: '#c5b3d5', f4: '#b09fc7', f5: '#9281b0', f6: '#76669a',
  p0: '#f3d7e2', p1: '#d89cb3', p2: '#b77292', ink: '#080909', or: '#f2a65a', or0: '#f9d3a8', or2: '#de8a3e',
  pill: '#f7f8fa', lilac: '#c9c3ef', white: '#ffffff', muted: '#5b5470',
};
export const EASE = 'cubic-bezier(.22,1,.36,1)';
export const SPRING = 'cubic-bezier(.34,1.45,.5,1)';
const NS = 'http://www.w3.org/2000/svg';
export const ELL = String.fromCharCode(8230), DOT = String.fromCharCode(183);
let uidN = 0;

// h('rect', {x:1, class:'a'}, [children]) -> SVG element. `text` sets textContent, `style` may be an object.
export function h(tag, attrs = {}, kids = []) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'text') n.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else n.setAttribute(k, v);
  }
  for (const c of [].concat(kids)) if (c) n.append(c);
  return n;
}
export const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
export const currentScreen = () => (document.getElementById('stage') || {}).dataset?.screen || '';

let mctx = null;
export function textWidth(str, size, family = 'DM Sans') {
  mctx ||= document.createElement('canvas').getContext('2d');
  mctx.font = family === 'Epilogue' ? `900 ${size}px Epilogue` : `400 ${size}px "DM Sans"`;
  return mctx.measureText(str).width;
}

// Greedy word wrap into at most `lines` lines of `width` px, with an ellipsis when it does not fit.
export function wrap(str, { size = 13, family = 'DM Sans', width = 100, lines = 1 } = {}) {
  const fits = s => textWidth(s, size, family) <= width;
  let rest = clean(str);
  const out = [];
  while (rest && out.length < lines) {
    if (fits(rest)) { out.push(rest); rest = ''; break; }
    let lo = 1, hi = rest.length;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (fits(rest.slice(0, mid))) lo = mid; else hi = mid - 1; }
    let n = lo;
    const sp = rest.lastIndexOf(' ', n);
    if (rest[n] !== ' ' && sp > 0) n = sp;
    out.push(rest.slice(0, n).trim());
    rest = rest.slice(n).trim();
  }
  if (rest && out.length) {
    let last = out[out.length - 1] + ELL;
    while (last.length > 1 && !fits(last)) last = last.slice(0, -2).trimEnd() + ELL;
    out[out.length - 1] = last;
  }
  return { lines: out, overflow: !!rest };
}
// The biggest size from `sizes` whose wrap fits without an ellipsis (else the smallest, ellipsised).
export function fitLines(str, { sizes, family = 'DM Sans', width, lines }) {
  for (const size of sizes) {
    const r = wrap(str, { size, family, width, lines });
    if (!r.overflow) return { size, lines: r.lines };
  }
  const size = sizes[sizes.length - 1];
  return { size, lines: wrap(str, { size, family, width, lines }).lines };
}
export function setLines(t, lines, lh) {
  const x = t.getAttribute('x') || 0;
  t.replaceChildren(...lines.map((s, i) => h('tspan', { x, dy: i ? lh : 0, text: s })));
}
export const short = (str, size, width, family) => wrap(str, { size, width, family, lines: 1 }).lines[0] || '';

// A four-point sparkle.
export const star = (cx, cy, r, fill, cls = '') =>
  h('path', { d: `M${cx},${cy - r}Q${cx},${cy} ${cx + r},${cy}Q${cx},${cy} ${cx},${cy + r}Q${cx},${cy} ${cx - r},${cy}Q${cx},${cy} ${cx},${cy - r}Z`, fill, class: cls });

// A pill badge with text that resizes to its content. align: left | center | right around x.
export function pill({ x = 0, y = 0, ht = 24, pad = 10, size = 13, fill = C.ink, color = C.pill, align = 'left', max = 220, family = 'DM Sans', cls = '' } = {}) {
  const rect = h('rect', { height: ht, rx: ht / 2, fill });
  const text = h('text', { 'font-size': size, fill: color, y: ht / 2 + size * 0.35, x: pad, class: family === 'Epilogue' ? 'ep' : '' });
  const inner = h('g', {}, [rect, text]);
  const g = h('g', { transform: `translate(${x},${y})`, class: cls }, [inner]);
  const api = {
    g, rect, text, width: 0, value: null,
    set(str) {
      api.value = str;
      const line = short(str, size, max - pad * 2, family);
      text.textContent = line;
      const w = Math.ceil(textWidth(line, size, family)) + pad * 2;
      api.width = w;
      rect.setAttribute('width', w);
      inner.setAttribute('transform', `translate(${align === 'center' ? -w / 2 : align === 'right' ? -w : 0},0)`);
      return api;
    },
    refit() { if (api.value != null) api.set(api.value); },
  };
  return api;
}

const CSS = `
.s2d text{font-family:'DM Sans',system-ui,sans-serif;font-weight:400;font-synthesis:none}
.s2d text.ep,.s2d .ep text{font-family:Epilogue,'DM Sans',sans-serif;font-weight:900}
.s2d .fb{transform-box:fill-box;transform-origin:50% 50%}
.s2d .fbb{transform-box:fill-box;transform-origin:50% 100%}
.s2d .fbt{transform-box:fill-box;transform-origin:50% 0%}
.s2d .plx{transition:transform 1.3s cubic-bezier(.2,.8,.2,1)}
.s2d .tr{transition:transform .75s ${SPRING},opacity .45s ease,fill .45s ease}
.s2d .tr-s{transition:transform .9s ${EASE},opacity .5s ease,fill .5s ease}
.s2d .fade{transition:opacity .5s ease}
.s2d .bob{animation:s2d-bob 3.4s ease-in-out infinite}
.s2d .bob-s{animation:s2d-bob-s 4.6s ease-in-out infinite}
.s2d .sway{animation:s2d-sway 3.8s ease-in-out infinite}
.s2d .sway-s{animation:s2d-sway-s 5.2s ease-in-out infinite}
.s2d .spin{animation:s2d-spin 8s linear infinite}
.s2d .spinr{animation:s2d-spin 8s linear infinite reverse}
.s2d .blink{animation:s2d-blink 4.6s ease-in-out infinite}
.s2d .twinkle{animation:s2d-twinkle 2.8s ease-in-out infinite}
.s2d .breathe{animation:s2d-breathe 3.6s ease-in-out infinite}
.s2d .rise{animation:s2d-rise 3.6s ease-out infinite}
.s2d .caret{animation:s2d-caret 1.05s steps(1) infinite}
.s2d .glow{animation:s2d-glow 2.6s ease-in-out infinite}
@keyframes s2d-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes s2d-bob-s{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
@keyframes s2d-sway{0%,100%{transform:rotate(-2.5deg)}50%{transform:rotate(2.5deg)}}
@keyframes s2d-sway-s{0%,100%{transform:rotate(-.9deg)}50%{transform:rotate(.9deg)}}
@keyframes s2d-spin{to{transform:rotate(360deg)}}
@keyframes s2d-blink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.12)}}
@keyframes s2d-twinkle{0%,100%{opacity:.3;transform:scale(.65)}50%{opacity:1;transform:scale(1)}}
@keyframes s2d-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.012,1.028)}}
@keyframes s2d-rise{0%{transform:translateY(0);opacity:0}20%{opacity:.85}100%{transform:translateY(-46px);opacity:0}}
@keyframes s2d-caret{0%{opacity:1}50%{opacity:0}}
@keyframes s2d-glow{0%,100%{opacity:.55}50%{opacity:1}}
.s2d.rm *{animation:none!important;transition:none!important}
.s2d.paused *{animation-play-state:paused!important}
`;

// Creates the 660x390 SVG inside `el` and everything a scene needs to clean up after itself.
export function makeStage(el, ctx, name) {
  const rm = !!(ctx && ctx.reducedMotion);
  const id = `s2d${++uidN}`;
  const wrapEl = document.createElement('div');
  wrapEl.className = `s2d s2d-${name}${rm ? ' rm' : ''}`;
  wrapEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;user-select:none';
  const svg = h('svg', { viewBox: '0 0 660 390', width: '100%', height: '100%', preserveAspectRatio: 'xMidYMid meet',
    'aria-hidden': 'true', focusable: 'false', style: 'display:block;overflow:visible' });
  const defs = h('defs');
  svg.append(h('style', { text: CSS }), defs);
  wrapEl.append(svg);
  el.append(wrapEl);

  const offs = [], timeouts = new Set(), intervals = new Set(), layers = [];
  let dead = false, raf = 0, px = null, py = null;
  const listen = (t, type, fn, opt) => { t.addEventListener(type, fn, opt); offs.push(() => t.removeEventListener(type, fn, opt)); };
  const vis = () => wrapEl.classList.toggle('paused', document.hidden);
  listen(document, 'visibilitychange', vis);
  vis();

  function applyParallax() {
    raf = 0;
    if (dead || px == null) return;
    const r = wrapEl.getBoundingClientRect();
    if (!r.width) return;
    const nx = clamp((px - (r.left + r.width / 2)) / (r.width * 0.9), -1, 1);
    const ny = clamp((py - (r.top + r.height / 2)) / (r.height * 1.4), -1, 1);
    for (const [g, d] of layers) g.style.transform = `translate(${(-nx * d).toFixed(2)}px,${(-ny * d * 0.55).toFixed(2)}px)`;
  }
  if (!rm) listen(window, 'pointermove', e => { px = e.clientX; py = e.clientY; if (!raf) raf = requestAnimationFrame(applyParallax); }, { passive: true });

  const S = {
    id, svg, defs, wrap: wrapEl, rm, listen,
    alive: () => !dead,
    uid: p => `${id}-${p}`,
    // A parallax layer: moves a little against the pointer, more for bigger depth.
    layer(parent, depth, attrs = {}) { const g = h('g', { ...attrs, class: `plx ${attrs.class || ''}` }); parent.append(g); layers.push([g, depth]); return g; },
    onBus(type, fn) {
      const bus = ctx && ctx.bus;
      if (!bus || !bus.addEventListener) return;
      const f = e => { if (!dead) fn(e.detail || {}); };
      bus.addEventListener(type, f);
      offs.push(() => bus.removeEventListener(type, f));
    },
    later(ms, fn) { const t = setTimeout(() => { timeouts.delete(t); if (!dead) fn(); }, ms); timeouts.add(t); return t; },
    every(ms, fn) { const t = setInterval(() => { if (!dead && !document.hidden) fn(); }, ms); intervals.add(t); return t; },
    // A one-off Web Animation (skipped for reduced motion). Returns the Animation or null.
    anim(node, frames, opts = {}) {
      if (rm || dead || !node || !node.animate) return null;
      try { return node.animate(frames, { duration: 600, easing: EASE, ...opts }); } catch (e) { return null; }
    },
    fonts(fn) {
      if (!document.fonts || !document.fonts.load) return;
      Promise.all([document.fonts.load('400 16px "DM Sans"'), document.fonts.load('900 16px Epilogue')])
        .then(() => { if (!dead) fn(); }, () => {});
    },
    destroy() {
      if (dead) return;
      dead = true;
      offs.forEach(f => f());
      timeouts.forEach(clearTimeout);
      intervals.forEach(clearInterval);
      if (raf) cancelAnimationFrame(raf);
      try { wrapEl.getAnimations({ subtree: true }).forEach(a => a.cancel()); } catch (e) {}
      wrapEl.remove();
    },
  };
  return S;
}

// The kinds of talk (the old form's values; a deck may still carry one) -> short label and icon.
export const TYPES = {
  'Thesis defence': ['thesis defence', 'cap'], 'Thesis progress / interim': ['thesis progress', 'progress'],
  'Project presentation': ['project', 'rocket'], 'Class presentation': ['class talk', 'board'], Seminar: ['seminar', 'chat'],
  'Conference talk': ['conference talk', 'mic'], Proposal: ['proposal', 'bulb'], Lecture: ['lecture', 'book'], Other: ['something else', 'sparkle'],
};
export function typeLabel(state) {
  const t = get(state, 'basics.type');
  if (!t) return '';
  if (t === 'Other') return clean(get(state, 'basics.typeOther')).toLowerCase() || 'something else';
  return (TYPES[t] || [String(t).toLowerCase()])[0];
}

// Drawn icons for the kinds of talk, centred on 0,0, about 44 px across.
export function typeIcon(key) {
  const s = { stroke: C.ink, 'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' };
  switch (key) {
    case 'cap': return h('g', {}, [
      h('path', { d: 'M-12,2v9c0,4 24,4 24,0v-9', fill: C.f5 }),
      h('path', { d: 'M-24,-4L0,-15L24,-4L0,7Z', fill: C.ink }),
      h('path', { d: 'M-20,-4L0,-12', stroke: C.f6, 'stroke-width': 2, 'stroke-linecap': 'round' }),
      h('path', { d: 'M17,-1v12', ...s, stroke: C.or, 'stroke-width': 2.4 }), h('circle', { cx: 17, cy: 13, r: 3.2, fill: C.or })]);
    case 'progress': return h('g', {}, [
      h('circle', { r: 18, fill: C.f2 }), h('path', { d: 'M0,0V-18A18,18 0 1 1 -18,0Z', fill: C.p2 }),
      h('circle', { r: 8, fill: C.pill }), h('path', { d: 'M-3,0l2.5,2.5L4,-3', ...s, 'stroke-width': 2.2 })]);
    case 'rocket': return h('g', { transform: 'rotate(35)' }, [
      h('path', { d: 'M-5,12Q0,26 5,12Z', fill: C.or }),
      h('path', { d: 'M-8,6L-15,14L-8,13Z M8,6L15,14L8,13Z', fill: C.p2 }),
      h('path', { d: 'M0,-21C10,-12 10,4 7,12H-7C-10,4 -10,-12 0,-21Z', fill: C.pill, stroke: C.ink, 'stroke-width': 2.4, 'stroke-linejoin': 'round' }),
      h('circle', { cy: -5, r: 4.4, fill: C.lilac, stroke: C.ink, 'stroke-width': 2.2 })]);
    case 'board': return h('g', {}, [
      h('path', { d: 'M-12,12L-16,22M12,12L16,22', ...s }),
      h('rect', { x: -21, y: -16, width: 42, height: 29, rx: 4, fill: C.f5 }),
      h('rect', { x: -17, y: -12, width: 34, height: 21, rx: 2, fill: C.pill }),
      h('path', { d: 'M-12,-5h14M-12,1h22', ...s, stroke: C.p2, 'stroke-width': 2.4 }),
      h('path', { d: 'M8,-6l4,-3', ...s, stroke: C.or })]);
    case 'chat': return h('g', {}, [
      h('path', { d: 'M-20,-14h22a6,6 0 0 1 6,6v8a6,6 0 0 1 -6,6h-12l-8,6v-6h-2a6,6 0 0 1 -6,-6v-8a6,6 0 0 1 6,-6Z', fill: C.ink }),
      h('path', { d: 'M2,-2h16a6,6 0 0 1 6,6v8a6,6 0 0 1 -6,6h-2v6l-8,-6h-6a6,6 0 0 1 -6,-6v-8a6,6 0 0 1 6,-6Z', fill: C.p1 }),
      h('circle', { cx: -14, cy: -4, r: 1.8, fill: C.pill }), h('circle', { cx: -8, cy: -4, r: 1.8, fill: C.pill }), h('circle', { cx: -2, cy: -4, r: 1.8, fill: C.pill })]);
    case 'mic': return h('g', {}, [
      h('path', { d: 'M-11,0a11,11 0 0 0 22,0M0,11v9M-7,20h14', ...s }),
      h('rect', { x: -7, y: -21, width: 14, height: 26, rx: 7, fill: C.f5 }),
      h('path', { d: 'M-7,-12h14M-7,-6h14', stroke: C.f3, 'stroke-width': 2 }),
      h('circle', { cx: -3, cy: -16, r: 1.6, fill: C.pill })]);
    case 'bulb': return h('g', {}, [
      h('path', { d: 'M-7,9C-7,2 -14,-1 -14,-9A14,14 0 0 1 14,-9C14,-1 7,2 7,9Z', fill: C.or0, stroke: C.ink, 'stroke-width': 2.4, 'stroke-linejoin': 'round' }),
      h('rect', { x: -7, y: 10, width: 14, height: 9, rx: 2.5, fill: C.f5 }),
      h('path', { d: 'M-4,-4l4,6l4,-6', ...s, stroke: C.or2, 'stroke-width': 2.2 }),
      h('path', { d: 'M-9,-12a8,8 0 0 1 5,-4', ...s, stroke: C.white, 'stroke-width': 2.2 })]);
    case 'book': return h('g', {}, [
      h('path', { d: 'M0,-10C-8,-15 -16,-15 -22,-12V14C-16,11 -8,11 0,16Z', fill: C.pill, stroke: C.ink, 'stroke-width': 2.4, 'stroke-linejoin': 'round' }),
      h('path', { d: 'M0,-10C8,-15 16,-15 22,-12V14C16,11 8,11 0,16Z', fill: C.p0, stroke: C.ink, 'stroke-width': 2.4, 'stroke-linejoin': 'round' }),
      h('path', { d: 'M-17,-5c4,-1 8,-1 12,1M-17,2c4,-1 8,-1 12,1M6,-4c4,-2 8,-2 11,-1', ...s, stroke: C.f5, 'stroke-width': 2 })]);
    default: return h('g', {}, [star(0, 0, 18, C.p2), star(14, -12, 6, C.or), star(-14, 12, 5, C.f5)]);
  }
}

// ------------------------------------------------------------------------------------------------ the talk scene
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
function parseDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return isNaN(d) ? null : d;
}

function curtain(x0, flip) {
  const g = h('g', { transform: flip ? 'translate(660,0) scale(-1,1)' : `translate(${x0},0)` });
  const sway = h('g', { class: 'sway-s fbt', style: { animationDuration: flip ? '6.1s' : '5.4s' } });
  sway.append(
    h('path', { d: 'M-4,24H58C54,90 62,150 46,208C40,252 50,300 46,338H-4Z', fill: C.f3 }),
    h('path', { d: 'M10,30C16,120 6,220 14,338H4C-1,230 6,120 2,30Z', fill: C.f4 }),
    h('path', { d: 'M32,30C36,130 26,230 32,338H22C20,230 26,120 22,30Z', fill: C.f4 }),
    h('path', { d: 'M50,30C52,100 56,160 46,210L41,210C48,160 44,100 42,30Z', fill: C.f2, opacity: 0.7 }),
    h('path', { d: 'M-4,202C16,210 34,210 50,200L52,212C34,222 16,222 -4,214Z', fill: C.p2 }),
    h('circle', { cx: 49, cy: 206, r: 6, fill: C.p1 }));
  g.append(sway);
  return g;
}

export default {
  mount(el, ctx) {
    const S = makeStage(el, ctx, 'talk');
    S.svg.append(h('style', { text: `
      .s2d-talk .focus{transition:transform .8s ${SPRING}}
      .s2d-talk[data-focus=type] .f-sign,.s2d-talk[data-focus=when] .f-cal{transform:scale(1.07)}
      .s2d-talk[data-focus=title] .f-slide{transform:scale(1.03)}
      .s2d-talk:not([data-focus=title]) .caret-g{opacity:0}` }));
    const back = S.layer(S.svg, 3), mid = S.layer(S.svg, 7), front = S.layer(S.svg, 13);

    // ---- back: floor, stage platform, lamps
    back.append(
      h('ellipse', { cx: 330, cy: 354, rx: 300, ry: 12, fill: C.f2, opacity: 0.6 }),
      h('rect', { x: 40, y: 304, width: 580, height: 42, rx: 12, fill: C.f4 }),
      h('path', { d: 'M100,312v30M170,312v30M240,312v30M310,312v30M380,312v30M450,312v30M520,312v30M590,312v30', stroke: C.f5, 'stroke-width': 2, opacity: 0.45 }),
      h('rect', { x: 30, y: 290, width: 600, height: 22, rx: 11, fill: C.f2 }),
      h('rect', { x: 46, y: 294, width: 568, height: 3, rx: 1.5, fill: C.white, opacity: 0.6 }));
    [80, 160, 240, 420, 500, 580].forEach((x, i) => back.append(
      h('path', { d: `M${x - 9},343a9,9 0 0 1 18,0Z`, fill: C.f5 }),
      h('circle', { cx: x, cy: 338, r: 3.5, fill: C.or, class: 'glow', style: { animationDelay: `${-i * 0.43}s` } })));


    // ---- mid: projector screen with the mini slide, projector, sign, calendar
    const clip = S.uid('slide');
    S.defs.append(h('clipPath', { id: clip }, [h('rect', { x: 186, y: 66, width: 288, height: 162, rx: 4 })]));
    mid.append(
      h('path', { d: 'M200,30v12M460,30v12', stroke: C.f6, 'stroke-width': 2 }),
      h('rect', { x: 172, y: 50, width: 316, height: 194, rx: 6, fill: C.pill }),
      h('rect', { x: 172, y: 50, width: 316, height: 8, fill: C.f1 }),
      h('rect', { x: 160, y: 40, width: 340, height: 14, rx: 7, fill: C.f5 }),
      h('circle', { cx: 160, cy: 47, r: 8, fill: C.f6 }), h('circle', { cx: 500, cy: 47, r: 8, fill: C.f6 }),
      h('rect', { x: 166, y: 240, width: 328, height: 10, rx: 5, fill: C.f4 }));
    const cord = h('g', { transform: 'translate(452,250)' }, [h('g', { class: 'sway' }, [
      h('path', { d: 'M0,0v20', stroke: C.f5, 'stroke-width': 2 }), h('circle', { cy: 23, r: 5, fill: C.p2 }), h('circle', { cx: -1.5, cy: 21.5, r: 1.5, fill: C.white, opacity: 0.8 })])]);
    mid.append(cord);

    const slideF = h('g', { class: 'focus f-slide fb' });
    const slide = h('g', { 'clip-path': `url(#${clip})` });
    slide.append(
      h('rect', { x: 186, y: 66, width: 288, height: 162, fill: C.white }),
      h('circle', { cx: 478, cy: 66, r: 60, fill: C.lilac }),
      h('circle', { cx: 448, cy: 124, r: 10, fill: C.p1, class: 'bob' }),
      h('circle', { cx: 430, cy: 92, r: 4, fill: C.or }),
      h('path', { d: 'M420,228c6,-26 30,-34 54,-26v26Z', fill: C.p0 }),
      h('rect', { x: 186, y: 66, width: 5, height: 162, fill: C.p1 }));
    const kicker = pill({ x: 200, y: 78, ht: 20, pad: 9, size: 13, fill: C.ink, color: C.pill, max: 200 });
    const titleT = h('text', { x: 200, class: 'ep', fill: C.ink });
    const subT = h('text', { x: 200, 'font-size': 13, fill: C.muted });
    const footT = h('text', { x: 200, y: 216, 'font-size': 13, fill: C.muted });
    const caret = h('rect', { width: 2.5, rx: 1, fill: C.p2, class: 'caret' });
    const caretG = h('g', { class: 'caret-g fade' }, [caret]);
    slide.append(kicker.g, titleT, subT, footT, caretG);
    slideF.append(slide);
    mid.append(slideF);
    const sparks = [star(150, 76, 8, C.or, 'twinkle fb'), star(516, 96, 6, C.p1, 'twinkle fb'), star(506, 222, 9, C.white, 'twinkle fb')];
    sparks.forEach((s, i) => { s.style.animationDelay = `${-i * 0.9}s`; mid.append(s); });

    // projector, seen from behind, with its beam
    mid.append(
      h('path', { d: 'M318,272H342L470,248H190Z', fill: C.white, opacity: 0.4 }),
      ...[0, 1, 2, 3].map(i => h('circle', { cx: 290 + i * 26, cy: 262 - (i % 2) * 6, r: 1.8, fill: C.white, class: 'rise', style: { animationDelay: `${-i * 0.9}s` } })),
      h('rect', { x: 292, y: 268, width: 76, height: 28, rx: 9, fill: C.f5 }),
      h('rect', { x: 292, y: 268, width: 76, height: 9, rx: 4.5, fill: C.f4 }),
      h('path', { d: 'M304,284h22M304,289h22', stroke: C.f6, 'stroke-width': 2, 'stroke-linecap': 'round' }),
      h('circle', { cx: 352, cy: 286, r: 3.5, fill: C.or, class: 'glow' }),
      h('rect', { x: 300, y: 295, width: 10, height: 5, rx: 2, fill: C.f6 }), h('rect', { x: 350, y: 295, width: 10, height: 5, rx: 2, fill: C.f6 }));

    // the sign with the kind of talk
    const signF = h('g', { class: 'focus f-sign', style: { transformOrigin: '112px 296px' } });
    const sign = h('g', { transform: 'translate(112,296)' });
    const signSway = h('g', { class: 'sway-s', style: { animationDuration: '4.4s' } });
    const iconHolder = h('g', { transform: 'translate(0,-100)' });
    const signLabel = pill({ x: 0, y: -42, ht: 26, pad: 11, size: 13, align: 'center', max: 150 });
    signSway.append(
      h('rect', { x: -3.5, y: -60, width: 7, height: 60, rx: 3, fill: C.f5 }),
      h('circle', { cx: 4, cy: -96, r: 46, fill: C.f4 }),
      h('circle', { cy: -100, r: 46, fill: C.pill }),
      h('circle', { cy: -100, r: 37, fill: C.f1 }),
      h('path', { d: 'M-30,-122a37,37 0 0 1 22,-14', stroke: C.white, 'stroke-width': 4, 'stroke-linecap': 'round', fill: 'none' }),
      iconHolder, signLabel.g);
    sign.append(signSway);
    signF.append(sign);
    mid.append(signF);

    // the calendar card on an easel
    const calF = h('g', { class: 'focus f-cal', style: { transformOrigin: '552px 180px' } });
    calF.append(
      h('path', { d: 'M526,170L510,298M578,170L594,298', stroke: C.f6, 'stroke-width': 6, 'stroke-linecap': 'round' }),
      h('path', { d: 'M552,170V292', stroke: C.f5, 'stroke-width': 5, 'stroke-linecap': 'round' }));
    const card = h('g', { transform: 'translate(506,116)' });
    const page = h('g', { class: 'fbt' });
    const monthT = h('text', { x: 46, y: 22, 'font-size': 13, fill: C.pill, 'text-anchor': 'middle', 'letter-spacing': '0.08em' });
    const dayT = h('text', { x: 46, y: 77, 'font-size': 40, class: 'ep', 'text-anchor': 'middle' });
    const wdT = h('text', { x: 46, y: 99, 'font-size': 13, fill: C.muted, 'text-anchor': 'middle' });
    page.append(h('rect', { width: 92, height: 112, rx: 12, fill: C.pill }), h('rect', { width: 92, height: 32, rx: 12, fill: C.p2 }),
      h('rect', { y: 18, width: 92, height: 14, fill: C.p2 }), monthT, dayT, wdT);
    card.append(h('rect', { x: 4, y: 5, width: 92, height: 112, rx: 12, fill: C.f4 }), page,
      h('rect', { x: 24, y: -7, width: 7, height: 15, rx: 3.5, fill: C.ink }), h('rect', { x: 61, y: -7, width: 7, height: 15, rx: 3.5, fill: C.ink }));
    const eventP = pill({ x: 552, y: 240, ht: 26, pad: 11, size: 13, fill: C.lilac, color: C.ink, align: 'center', max: 118 });
    calF.append(card, eventP.g);
    mid.append(calF);

    // ---- front: curtains and the valance
    front.append(curtain(0, false), curtain(0, true));
    const scallops = Array.from({ length: 12 }, (_, i) => `a27.5,14 0 0 0 55,0`).join('');
    front.append(h('path', { d: `M0,0H660V24${'a27.5,14 0 0 1 -55,0'.repeat(12)}Z`, fill: C.f5 }),
      h('path', { d: `M0,24${scallops}`, fill: 'none', stroke: C.p1, 'stroke-width': 3, 'stroke-dasharray': '1 9', 'stroke-linecap': 'round' }),
      h('rect', { x: 0, y: 0, width: 660, height: 8, fill: C.f6 }));

    // ---- state
    let last = {};
    function focus(screen) { S.wrap.dataset.focus = ['type', 'title', 'when'].includes(screen) ? screen : ''; }
    focus(currentScreen());
    S.onBus('step:change', d => focus(d.to));

    function renderSlide(title, sub, typeL, foot) {
      kicker.set(typeL || 'your talk');
      kicker.rect.setAttribute('fill', typeL ? C.ink : C.f4);
      const empty = !title;
      const fit = fitLines(empty ? 'your title here' : title, { sizes: [25, 22, 19, 17, 15], family: 'Epilogue', width: 232, lines: 3 });
      const lh = Math.round(fit.size * 1.12);
      titleT.setAttribute('font-size', fit.size);
      titleT.setAttribute('y', 118 + fit.size * 0.2);
      titleT.setAttribute('fill', empty ? C.f4 : C.ink);
      setLines(titleT, fit.lines, lh);
      const lastLine = fit.lines[fit.lines.length - 1] || '';
      const baseY = 118 + fit.size * 0.2 + lh * (fit.lines.length - 1);
      caret.setAttribute('x', empty ? 198 : 202 + textWidth(lastLine, fit.size, 'Epilogue'));
      caret.setAttribute('y', baseY - fit.size * 0.82);
      caret.setAttribute('height', fit.size * 0.95);
      const subY = baseY + 22;
      subT.setAttribute('y', Math.min(subY, 198));
      subT.textContent = sub ? short(sub, 13, 240) : '';
      footT.textContent = short(foot, 13, 216);
    }

    function renderCal(dateV, eventV) {
      const d = parseDate(dateV);
      if (d) { monthT.textContent = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; dayT.textContent = d.getDate(); dayT.setAttribute('fill', C.ink); wdT.textContent = DAYS[d.getDay()]; }
      else { monthT.textContent = 'date'; dayT.textContent = '?'; dayT.setAttribute('fill', C.f4); wdT.textContent = dateV ? short(dateV, 13, 80) : 'pick a day'; }
      eventP.set(eventV || 'event or course');
      eventP.rect.setAttribute('fill', eventV ? C.lilac : C.f1);
      eventP.text.setAttribute('fill', eventV ? C.ink : C.muted);
    }

    function render(state, force) {
      const type = get(state, 'basics.type') || '';
      const typeL = typeLabel(state);
      const title = clean(get(state, 'basics.title')), sub = clean(get(state, 'basics.subtitle'));
      const dateV = clean(get(state, 'basics.date')), eventV = clean(get(state, 'basics.event'));
      const d = parseDate(dateV);
      const foot = [eventV, d ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : ''].filter(Boolean).join('  ' + DOT + '  ');
      if (force || type !== last.type) {
        const icon = typeIcon(type ? (TYPES[type] || [0, 'sparkle'])[1] : 'none');
        if (!type) icon.replaceChildren(h('text', { 'font-size': 34, class: 'ep', fill: C.f4, 'text-anchor': 'middle', y: 12, text: '?' }));
        const pop = h('g', { class: 'fb' }, [icon]);
        iconHolder.replaceChildren(pop);
        if (!force) S.anim(pop, [{ transform: 'scale(.2) rotate(-25deg)', opacity: 0 }, { transform: 'scale(1.12) rotate(6deg)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 620 });
      }
      if (force || typeL !== last.typeL) { signLabel.set(typeL || 'what kind?'); signLabel.rect.setAttribute('fill', typeL ? C.ink : C.f4); }
      if (force || title !== last.title || sub !== last.sub || typeL !== last.typeL || foot !== last.foot) renderSlide(title, sub, typeL, foot);
      if (force || dateV !== last.dateV || eventV !== last.eventV) {
        renderCal(dateV, eventV);
        if (!force && dateV !== last.dateV) S.anim(page, [{ transform: 'translateY(-10px) rotate(-4deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: SPRING });
      }
      last = { type, typeL, title, sub, dateV, eventV, foot };
    }

    let state = ctx.getState ? ctx.getState() : {};
    render(state || {}, true);
    S.fonts(() => render(state || {}, true));
    return {
      update(s) { state = s || {}; render(state, false); },
      destroy() { S.destroy(); },
    };
  },
};
