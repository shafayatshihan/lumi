// "Make it" scene: a live mini title slide in the chosen look, showing the talk title, the presenters and the event.
// Each look is drawn in its own colours, shapes and display font (Pink Punch, Bold Blue, Flat-Pack,
// Happy Headspace, Clay Pop); "Claude chooses" gently cycles through all five. Under the slide, the plan: either a pill saying
// Claude plans the slides, or a strip of the slides the user listed.

import { C, SPRING, h, get, clean, currentScreen, short, star, pill, makeStage, DOT, ELL } from './talk.js';

const W = 440, H = 248, X0 = 110, Y0 = 34;
const LOOKS = ['Pink Punch', 'Bold Blue', 'Flat-Pack', 'Happy Headspace', 'Clay Pop'];
const FONT_CSS = `
@font-face{font-family:AuraAnton;src:url('/fonts/Anton-400.woff2') format('woff2');font-weight:400;font-display:swap}
@font-face{font-family:AuraJakarta;src:url('/fonts/PlusJakartaSans-200-800.woff2') format('woff2');font-weight:200 800;font-display:swap}
@font-face{font-family:AuraNoto;src:url('/fonts/NotoSans-100-900.woff2') format('woff2');font-weight:100 900;font-display:swap}
@font-face{font-family:AuraQuick;src:url('/fonts/Quicksand-300-700.ttf') format('truetype');font-weight:300 700;font-display:swap}
@font-face{font-family:AuraSerif;src:url('/fonts/SourceSerif4-200-900.woff2') format('woff2');font-weight:200 900;font-display:swap}
@font-face{font-family:AuraWork;src:url('/fonts/WorkSans-100-900.ttf') format('truetype');font-weight:100 900;font-display:swap}
@font-face{font-family:AuraOpen;src:url('/fonts/OpenSans-300-800.woff2') format('woff2');font-weight:300 800;font-display:swap}`;
const FAMILY = { anton: 'AuraAnton', jak: 'AuraJakarta', noto: 'AuraNoto', quick: 'AuraQuick', serif: 'AuraSerif', work: 'AuraWork', open: 'AuraOpen', dm: '"DM Sans"' };
const FALLBACK = { anton: 'Impact,sans-serif', serif: 'Georgia,serif' };

// ---- text measuring for the look fonts
let mctx = null;
function tw(str, size, fam, weight) {
  mctx ||= document.createElement('canvas').getContext('2d');
  mctx.font = `${weight} ${size}px ${FAMILY[fam]},${FALLBACK[fam] || 'sans-serif'}`;
  return mctx.measureText(str).width;
}
function wrapF(str, { size, fam, weight, width, lines }) {
  const fits = s => tw(s, size, fam, weight) <= width;
  const words = clean(str).split(' ').filter(Boolean);
  const out = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const next = cur ? cur + ' ' + words[i] : words[i];
    if (fits(next)) { cur = next; continue; }
    if (cur) out.push(cur);
    cur = words[i];
    if (out.length === lines) { cur = ''; return { lines: ell(out, size, fam, weight, width), overflow: true }; }
  }
  if (cur) out.push(cur);
  const overflow = out.length > lines || out.some(l => !fits(l));
  return { lines: overflow ? ell(out.slice(0, lines), size, fam, weight, width) : out, overflow };
}
function ell(out, size, fam, weight, width) {
  const res = out.slice();
  let last = (res[res.length - 1] || '') + ELL;
  while (last.length > 1 && tw(last, size, fam, weight) > width) last = last.slice(0, -2).trimEnd() + ELL;
  res[res.length - 1] = last;
  return res;
}
function fitF(str, o) {
  for (const size of o.sizes) { const r = wrapF(str, { ...o, size }); if (!r.overflow) return { size, lines: r.lines }; }
  const size = o.sizes[o.sizes.length - 1];
  return { size, lines: wrapF(str, { ...o, size }).lines };
}
// A multi-line <text> in a look font.
function textF(x, y, lines, { size, fam, weight, fill, lh = 1.12, anchor = 'start', spacing } = {}) {
  const t = h('text', { x, y, 'font-size': size, fill, 'text-anchor': anchor,
    style: { fontFamily: `${FAMILY[fam]},${FALLBACK[fam] || 'sans-serif'}`, fontWeight: weight, letterSpacing: spacing || 'normal' } });
  lines.forEach((s, i) => t.append(h('tspan', { x, dy: i ? Math.round(size * lh) : 0, text: s })));
  return t;
}
function namesLine(d) {
  const n = d.names;
  if (!n.length) return 'your name';
  if (n.length <= 3) return n.join(`  ${DOT}  `);
  return `${n[0]}  ${DOT}  ${n[1]}  ${DOT}  +${n.length - 2} more`;
}

// ---- the five looks. Each returns a <g> drawn in a 440 x 248 box.
function pinkPunch(d) {
  const g = h('g');
  const t = fitF(d.title.toUpperCase(), { sizes: [36, 31, 27, 23, 20, 17, 15], fam: 'anton', weight: 400, width: 226, lines: 4 });
  const lh = Math.round(t.size * 1.06), ty = 66 + t.size * 0.82;
  const lastY = ty + lh * (t.lines.length - 1);
  const hiW = Math.min(232, tw(t.lines[t.lines.length - 1] || '', t.size, 'anton', 400) + 10);
  g.append(
    h('rect', { width: W, height: H, fill: '#f4f4f0' }),
    h('rect', { x: 276, y: 30, width: 140, height: 172, rx: 4, fill: C.ink }),
    h('rect', { x: 268, y: 22, width: 140, height: 172, rx: 4, fill: '#ff90e8', stroke: C.ink, 'stroke-width': 2.5 }),
    h('g', { transform: 'translate(338,92)' }, [h('g', { class: 'breathe fb' }, [h('circle', { r: 40, fill: '#ffc900', stroke: C.ink, 'stroke-width': 2.5 })])]),
    h('g', { transform: 'translate(372,154)' }, [h('g', { class: 'spin fb', style: { animationDuration: '14s' } }, [
      h('path', { d: 'M0,-20L5,-6L20,-6L8,3L12,18L0,9L-12,18L-8,3L-20,-6L-5,-6Z', fill: '#23a094', stroke: C.ink, 'stroke-width': 2.2, 'stroke-linejoin': 'round' })])]),
    h('circle', { cx: 296, cy: 166, r: 10, fill: '#ff5a5f', stroke: C.ink, 'stroke-width': 2.2 }),
    h('rect', { x: 22, y: 22, width: Math.min(200, tw(d.kicker.toUpperCase(), 13, 'work', 600) + 22), height: 24, rx: 12, fill: C.white, stroke: C.ink, 'stroke-width': 2 }),
    textF(33, 38.5, [short(d.kicker.toUpperCase(), 13, 176)], { size: 13, fam: 'work', weight: 600, fill: C.ink }),
    h('rect', { x: 20, y: lastY - t.size * 0.5, width: hiW, height: t.size * 0.55, fill: '#ff90e8' }),
    textF(24, ty, t.lines, { size: t.size, fam: 'anton', weight: 400, fill: d.empty ? '#9c9a94' : C.ink, lh: 1.06 }),
    textF(24, 212, [short(namesLine(d), 14, 240)], { size: 14, fam: 'work', weight: 600, fill: C.ink }),
    textF(24, 232, [short(d.foot, 13, 380)], { size: 13, fam: 'work', weight: 400, fill: '#55534e' }));
  return g;
}
function boldBlue(d) {
  const g = h('g');
  const t = fitF(d.title, { sizes: [30, 26, 23, 20, 17, 15], fam: 'jak', weight: 800, width: 246, lines: 4 });
  const lh = Math.round(t.size * 1.1), ty = 70 + t.size * 0.8;
  g.append(
    h('rect', { width: W, height: H, fill: C.white }),
    h('rect', { x: 300, width: 140, height: H, fill: '#0052ff' }),
    h('g', { transform: 'translate(370,78)' }, [h('g', { class: 'breathe fb' }, [h('circle', { r: 42, fill: C.white })])]),
    h('path', { d: 'M300,248V168A80,80 0 0 1 380,248Z', fill: C.ink }),
    h('path', { d: 'M440,180A40,40 0 0 0 400,220V248H440Z', fill: C.white }),
    h('rect', { x: 352, y: 150, width: 36, height: 12, fill: '#ffd200' }),
    h('rect', { x: 26, y: 34, width: 18, height: 4, fill: '#0052ff' }),
    textF(52, 40, [short(d.kicker.toUpperCase(), 13, 220)], { size: 13, fam: 'jak', weight: 700, fill: '#0052ff', spacing: '0.06em' }));
  const tt = textF(26, ty, t.lines, { size: t.size, fam: 'jak', weight: 800, fill: d.empty ? '#b8bcc8' : C.ink, lh: 1.1 });
  if (!d.empty && t.lines.length > 1) tt.lastChild.setAttribute('fill', '#0052ff');
  g.append(tt,
    textF(26, 212, [short(namesLine(d), 14, 248)], { size: 14, fam: 'work', weight: 600, fill: C.ink }),
    textF(26, 232, [short(d.foot, 13, 248)], { size: 13, fam: 'work', weight: 400, fill: '#5b616e' }));
  return g;
}
function flatPack(d) {
  const g = h('g');
  const t = fitF(d.title, { sizes: [28, 25, 22, 19, 17, 15], fam: 'noto', weight: 800, width: 236, lines: 4 });
  const ty = 76 + t.size * 0.8;
  const kw = Math.min(190, tw(d.kicker, 13, 'noto', 700) + 30);
  g.append(
    h('rect', { width: W, height: H, fill: C.white }),
    h('path', { d: `M22,24H${22 + kw - 10}L${22 + kw},36L${22 + kw - 10},48H22Z`, fill: '#ffdb00' }),
    h('circle', { cx: 32, cy: 36, r: 3.5, fill: C.white }),
    textF(42, 40.5, [short(d.kicker, 13, kw - 32)], { size: 13, fam: 'noto', weight: 700, fill: C.ink }),
    h('rect', { x: 284, y: 22, width: 136, height: 178, rx: 6, fill: '#f5f5f5' }),
    h('circle', { cx: 304, cy: 42, r: 12, fill: C.ink }),
    textF(304, 47, ['1'], { size: 14, fam: 'noto', weight: 800, fill: C.white, anchor: 'middle' }),
    h('g', { transform: 'translate(352,104)' }, [h('g', { class: 'sway fb' }, [
      h('path', { d: 'M-26,-30V12H22', stroke: C.ink, 'stroke-width': 7, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })])]),
    ...[0, 1, 2].map(i => h('g', { transform: `translate(${312 + i * 22},164)` }, [
      h('rect', { x: -5, y: -4, width: 10, height: 6, rx: 1.5, fill: '#0058a3' }), h('rect', { x: -2, y: 2, width: 4, height: 16, fill: '#0058a3' })])),
    textF(392, 178, ['6x'], { size: 15, fam: 'noto', weight: 800, fill: C.ink, anchor: 'middle' }),
    h('rect', { y: 236, width: W, height: 12, fill: '#0058a3' }),
    h('rect', { x: 400, y: 232, width: 20, height: 20, fill: '#ffdb00' }));
  const tt = textF(24, ty, t.lines, { size: t.size, fam: 'noto', weight: 800, fill: d.empty ? '#b5b5b5' : C.ink, lh: 1.12 });
  if (!d.empty && t.lines.length > 1) tt.lastChild.setAttribute('fill', '#0058a3');
  g.append(tt,
    textF(24, 202, [short(namesLine(d), 14, 250)], { size: 14, fam: 'noto', weight: 700, fill: C.ink }),
    textF(24, 222, [short(d.foot, 13, 250)], { size: 13, fam: 'noto', weight: 400, fill: '#484848' }));
  return g;
}
function headspace(d) {
  const g = h('g');
  const t = fitF(d.title, { sizes: [30, 26, 23, 20, 17, 15], fam: 'quick', weight: 700, width: 236, lines: 4 });
  const lh = Math.round(t.size * 1.12), ty = 76 + t.size * 0.8;
  const ly = ty + lh * (t.lines.length - 1) + 14;
  const uw = Math.min(200, Math.max(60, tw(t.lines[0] || '', t.size, 'quick', 700) * 0.7));
  let sq = `M24,${ly}`;
  for (let x = 24; x < 24 + uw; x += 16) sq += `q4,-6 8,0t8,0`;
  const kw = Math.min(190, tw(d.kicker, 13, 'quick', 700) + 24);
  g.append(
    h('rect', { width: W, height: H, fill: C.white }),
    h('g', { transform: 'translate(388,196)' }, [h('g', { class: 'breathe fb', style: { animationDuration: '5s' } }, [
      h('path', { d: 'M-96,10C-100,-50 -46,-96 10,-90C70,-84 104,-40 98,18C92,76 40,100 -14,96C-62,92 -92,58 -96,10Z', fill: '#ff7300' })])]),
    h('g', { transform: 'translate(334,52)' }, [h('g', { class: 'bob' }, [h('circle', { r: 30, fill: '#ffce00' })])]),
    h('circle', { cx: 404, cy: 40, r: 12, fill: '#ffa400' }),
    h('circle', { cx: 290, cy: 120, r: 8, fill: '#7a5af8' }),
    h('circle', { cx: 268, cy: 214, r: 5, fill: '#ff8fb1' }),
    h('rect', { x: 22, y: 24, width: kw, height: 24, rx: 12, fill: '#ffce00' }),
    textF(34, 40.5, [short(d.kicker, 13, kw - 22)], { size: 13, fam: 'quick', weight: 700, fill: '#2d2c2c' }),
    textF(24, ty, t.lines, { size: t.size, fam: 'quick', weight: 700, fill: d.empty ? '#bdb8b5' : '#2d2c2c', lh: 1.12 }),
    h('path', { d: sq, stroke: '#ff7300', 'stroke-width': 3.5, fill: 'none', 'stroke-linecap': 'round' }),
    textF(24, 212, [short(namesLine(d), 14, 240)], { size: 14, fam: 'dm', weight: 400, fill: '#2d2c2c' }),
    textF(24, 232, [short(d.foot, 13, 240)], { size: 13, fam: 'dm', weight: 400, fill: '#6b6766' }));
  return g;
}
function clayPop(d) {
  const g = h('g');
  const t = fitF(d.title, { sizes: [28, 25, 22, 19, 17, 15], fam: 'jak', weight: 800, width: 236, lines: 4 });
  const lh = Math.round(t.size * 1.1), ty = 66 + t.size * 0.8;            // a 4-line title keeps its key clear of the names
  const lastY = ty + lh * (t.lines.length - 1);
  const keyW = Math.min(244, tw(t.lines[t.lines.length - 1] || '', t.size, 'jak', 800) + 12);
  g.append(
    h('rect', { width: W, height: H, fill: '#f0f0f5' }),
    h('ellipse', { cx: 352, cy: 197, rx: 66, ry: 9, fill: '#15151c', opacity: 0.12 }),            // the contact shadow
    h('rect', { x: 296, y: 104, width: 112, height: 92, rx: 22, fill: '#c93a05' }),                 // a clay block: shadow side
    h('rect', { x: 296, y: 98, width: 112, height: 88, rx: 22, fill: '#ff6a13' }),
    h('rect', { x: 306, y: 104, width: 92, height: 14, rx: 7, fill: '#ff9a3d' }),                    // its lit top edge
    h('rect', { x: 318, y: 84, width: 40, height: 18, rx: 9, fill: '#2a2724' }),
    h('rect', { x: 368, y: 150, width: 26, height: 16, rx: 3, fill: '#f2c29a', transform: 'rotate(-18 381 158)' }),   // the one wink
    h('g', { transform: 'translate(298,56)' }, [h('g', { class: 'bob' }, [h('circle', { r: 11, fill: '#ff6a13' })])]),
    h('g', { transform: 'translate(392,44)' }, [h('g', { class: 'bob', style: { animationDelay: '-1.2s' } }, [h('circle', { r: 7, fill: '#b9b6b3' })])]),
    h('circle', { cx: 30, cy: 36, r: 5, fill: '#ff6a13' }),
    textF(42, 40.5, [short(d.kicker.toUpperCase(), 12, 220)], { size: 12, fam: 'jak', weight: 700, fill: '#2b2b33', spacing: '0.12em' }));
  if (!d.empty && t.lines.length > 1)                                                                  // the emphasis: an orange clay key
    g.append(h('rect', { x: 20, y: lastY - t.size * 0.82, width: keyW, height: t.size * 1.08, rx: t.size * 0.22, fill: '#ff6a13' }));
  g.append(
    textF(24, ty, t.lines, { size: t.size, fam: 'jak', weight: 800, fill: d.empty ? '#b9b9c4' : '#15151c', lh: 1.1 }),
    textF(24, 212, [short(namesLine(d), 14, 240)], { size: 14, fam: 'jak', weight: 600, fill: '#15151c' }),
    textF(24, 232, [short(d.foot, 13, 240)], { size: 13, fam: 'jak', weight: 400, fill: '#5a5a66' }));
  return g;
}
const DRAW = { 'Pink Punch': pinkPunch, 'Bold Blue': boldBlue, 'Flat-Pack': flatPack, 'Happy Headspace': headspace, 'Clay Pop': clayPop };

export default {
  mount(el, ctx) {
    const S = makeStage(el, ctx, 'review');
    S.svg.append(h('style', { text: FONT_CSS + `
      .s2d-review .focus{transition:transform .8s ${SPRING}}
      .s2d-review[data-focus=plan] .f-plan{transform:scale(1.05)}
      .s2d-review .card{transition:transform .7s ${SPRING},opacity .4s ease}` }));
    const back = S.layer(S.svg, 3), mid = S.layer(S.svg, 7), front = S.layer(S.svg, 11);

    // ---- back: floor glow, sparkles, little confetti
    back.append(h('ellipse', { cx: 330, cy: 300, rx: 260, ry: 12, fill: C.f2, opacity: 0.55 }));
    const sp = [star(84, 60, 9, C.or, 'twinkle fb'), star(584, 44, 7, C.p1, 'twinkle fb'), star(596, 250, 8, C.white, 'twinkle fb'), star(66, 230, 6, C.f5, 'twinkle fb')];
    sp.forEach((s, i) => { s.style.animationDelay = `${-i * 0.7}s`; back.append(s); });
    [[40, 140, C.p1], [616, 150, C.or0], [600, 100, C.lilac], [56, 290, C.or]].forEach(([x, y, c], i) =>
      back.append(h('circle', { cx: x, cy: y, r: 5, fill: c, class: 'bob', style: { animationDelay: `${-i * 0.9}s` } })));

    // ---- mid: the slide
    const clip = S.uid('slide');
    S.defs.append(h('clipPath', { id: clip }, [h('rect', { width: W, height: H, rx: 8 })]));
    const slideG = h('g', { transform: `translate(${X0},${Y0})` });
    const bob = h('g', { class: 'bob-s' });
    const layers = h('g', { 'clip-path': `url(#${clip})` });
    bob.append(h('rect', { x: 8, y: 9, width: W, height: H, rx: 10, fill: C.f4 }), h('rect', { x: -5, y: -5, width: W + 10, height: H + 10, rx: 12, fill: C.pill }), layers);
    slideG.append(bob);
    mid.append(slideG);
    const lookP = pill({ x: 330, y: 294, ht: 26, pad: 11, size: 13, align: 'center', max: 300 });
    mid.append(lookP.g);
    const dots = h('g', { transform: 'translate(330,330)' });
    mid.append(dots);

    // ---- front: the plan strip
    const plan = h('g', { class: 'focus f-plan', style: { transformOrigin: '330px 352px' } });
    front.append(plan);

    // ---- state
    let last = {}, cycleI = 0, current = null, cycler = 0, data = null;
    const focus = s => { S.wrap.dataset.focus = ['plan', 'review'].includes(s) ? s : ''; };
    focus(currentScreen());
    S.onBus('step:change', d => focus(d.to));

    function readData(state) {
      const title = clean(get(state, 'basics.title'));
      const list = Array.isArray(get(state, 'people.presenters')) ? get(state, 'people.presenters') : [];
      const names = list.map(p => clean(get(p || {}, 'name'))).filter(Boolean);
      const type = clean(get(state, 'basics.type'));
      const kicker = type === 'Other' ? clean(get(state, 'basics.typeOther')) || 'presentation' : type ? type.replace(' / interim', '') : 'presentation';
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(clean(get(state, 'basics.date')));
      const date = m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
      const sup = clean(get(state, 'people.supervisor'));
      const foot = [clean(get(state, 'basics.event')), date].filter(Boolean).join(`  ${DOT}  `) || (sup ? 'supervised by ' + sup : 'event and date');
      return { title: title || 'your title here', empty: !title, names, kicker, foot };
    }

    function draw(look, fade) {
      const node = DRAW[look](data);
      const old = [...layers.childNodes];
      layers.append(node);
      if (fade && !S.rm) {
        const a = S.anim(node, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 650 });
        S.later(660, () => old.forEach(n => n.remove()));
        if (!a) old.forEach(n => n.remove());
      } else old.forEach(n => n.remove());
      current = look;
    }

    function setLabel(theme) {
      const auto = !LOOKS.includes(theme);
      lookP.set(auto ? `claude chooses ${DOT} ${current.toLowerCase()}` : `look: ${theme.toLowerCase()}`);
      lookP.rect.setAttribute('fill', '#5b3fa8');
      dots.replaceChildren(...(auto ? LOOKS.map((l, i) => h('circle', { cx: (i - (LOOKS.length - 1) / 2) * 14, r: 4, fill: l === current ? C.ink : C.f3 })) : []));
    }

    function renderPlan(auto, slides) {
      plan.replaceChildren();
      const list = (Array.isArray(slides) ? slides : []).filter(s => clean(get(s || {}, 'title')) || clean(get(s || {}, 'covers')));
      if (auto !== false || !list.length) {
        const p = pill({ x: 330, y: 344, ht: 28, pad: 13, size: 13, fill: C.lilac, color: C.ink, align: 'center', max: 300 })
          .set(auto !== false ? 'claude plans the slides for you' : 'list your slides on the right');
        plan.append(p.g, h('g', { transform: `translate(${330 + p.width / 2 + 14},358)` }, [star(0, 0, 8, C.or, 'twinkle fb')]));
        return;
      }
      const show = list.slice(0, 5), more = list.length - show.length;
      const n = show.length + (more ? 1 : 0), cw = 96, gap = 10, x0 = 330 - (n * cw + (n - 1) * gap) / 2;
      show.forEach((s, i) => {
        const x = x0 + i * (cw + gap);
        const label = clean(get(s, 'title')) || clean(get(s, 'covers'));
        plan.append(h('g', { class: 'card', transform: `translate(${x},${330})` }, [
          h('rect', { x: 3, y: 3, width: cw, height: 50, rx: 8, fill: C.f4 }),
          h('rect', { width: cw, height: 50, rx: 8, fill: C.pill }),
          h('circle', { cx: 15, cy: 15, r: 9, fill: C.ink }),
          h('text', { x: 15, y: 19.5, 'font-size': 13, class: 'ep', 'text-anchor': 'middle', fill: C.pill, text: i + 1 }),
          h('text', { x: 9, y: 41, 'font-size': 13, fill: C.ink, text: short(label, 13, cw - 16) })]));
      });
      if (more) {
        const x = x0 + show.length * (cw + gap);
        plan.append(h('g', { transform: `translate(${x},330)` }, [h('rect', { width: cw, height: 50, rx: 8, fill: C.ink }),
          h('text', { x: cw / 2, y: 30, 'font-size': 14, class: 'ep', 'text-anchor': 'middle', fill: C.pill, text: `+${more} more` })]));
      }
    }

    function render(state, force) {
      const theme = clean(get(state, 'look.theme'));
      data = readData(state);
      const dk = JSON.stringify(data);
      const auto = !LOOKS.includes(theme);
      const look = auto ? LOOKS[cycleI % LOOKS.length] : theme;
      if (force || theme !== last.theme) {
        draw(look, !force);
        setLabel(theme);
        if (!force && theme !== last.theme) S.anim(bob, [{ transform: 'scale(.96)' }, { transform: 'scale(1.02)', offset: 0.6 }, { transform: 'none' }], { duration: 560, easing: SPRING });
      } else if (dk !== last.dk) draw(current, false);
      const pk = JSON.stringify([get(state, 'plan.auto'), get(state, 'plan.slides')]);
      if (force || pk !== last.pk) renderPlan(get(state, 'plan.auto'), get(state, 'plan.slides'));
      last = { theme, dk, pk, auto };
    }

    // "Claude chooses": gently cycle the five looks (every() pauses while the tab is hidden).
    cycler = S.every(3400, () => {
      if (!last.auto || S.rm) return;
      cycleI = (cycleI + 1) % LOOKS.length;
      draw(LOOKS[cycleI], true);
      setLabel(last.theme);
    });

    let state = ctx.getState ? ctx.getState() : {};
    render(state || {}, true);
    S.fonts(() => render(state || {}, true));
    if (document.fonts && document.fonts.load) {
      Promise.all([['400', 'AuraAnton'], ['800', 'AuraJakarta'], ['700', 'AuraJakarta'], ['800', 'AuraNoto'], ['700', 'AuraNoto'], ['400', 'AuraNoto'], ['700', 'AuraQuick'],
        ['700', 'AuraSerif'], ['600', 'AuraWork'], ['400', 'AuraWork'], ['700', 'AuraOpen'], ['400', 'AuraOpen']].map(([w, f]) => document.fonts.load(`${w} 20px ${f}`).catch(() => null)))
        .then(() => { if (S.alive()) render(state || {}, true); });
    }
    return {
      update(s) { state = s || {}; render(state, false); },
      destroy() { cycler = 0; S.destroy(); },
    };
  },
};
