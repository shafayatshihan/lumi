// "Make it" scene: a live mini title slide in the chosen look, showing the talk title, the presenters and the event.
// Each look is drawn in its own colours, shapes and display font (Bold Blue, Clay Pop, Red Gallery,
// Candy Grid); "Claude chooses" gently cycles through all of them. Under the slide, the plan: either a pill saying
// Claude plans the slides, or a strip of the slides the user listed.

import { C, SPRING, h, get, clean, currentScreen, short, star, pill, makeStage, DOT, ELL } from './talk.js';

const W = 440, H = 248, X0 = 110, Y0 = 34;
const LOOKS = ['Bold Blue', 'Clay Pop', 'Red Gallery', 'Candy Grid', 'Violet Lime'];
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
// Red Gallery: warm paper, the strip down the left, a framed monochrome print with the red block behind its corner, the
// title in red condensed capitals on the right, the names right-aligned at the foot, the red page badge.
function redGallery(d) {
  const g = h('g');
  const t = fitF(d.title.toUpperCase(), { sizes: [34, 30, 26, 22, 19, 16], fam: 'anton', weight: 400, width: 196, lines: 4 });
  g.append(
    h('rect', { width: W, height: H, fill: '#ecebe4' }),
    h('rect', { width: 22, height: H, fill: '#f6f5f0' }),
    h('rect', { x: 22, width: 1, height: H, fill: '#d6d3ca' }),
    h('rect', { x: 7, y: 96, width: 8, height: 8, fill: '#e31b23' }),                              // the strip's red square
    h('rect', { x: 30, y: 150, width: 72, height: 78, fill: '#e31b23' }),                          // the red block, behind
    h('rect', { x: 40, y: 20, width: 166, height: 192, fill: '#ffffff' }),                         // the print border
    h('rect', { x: 47, y: 27, width: 152, height: 178, fill: '#c9c6c0' }),                         // the grey photograph
    h('ellipse', { cx: 123, cy: 176, rx: 46, ry: 6, fill: '#111111', opacity: 0.22 }),             // the contact shadow
    h('rect', { x: 92, y: 96, width: 62, height: 78, fill: '#2a2a2a' }),                           // the dark hero
    h('rect', { x: 92, y: 96, width: 62, height: 8, fill: '#4a4947' }),
    h('g', { transform: 'translate(170,66)' }, [h('g', { class: 'bob' }, [h('circle', { r: 7, fill: '#edebe6' })])]),
    textF(222, 42 + t.size * 0.8, t.lines, { size: t.size, fam: 'anton', weight: 400, fill: d.empty ? '#b9b6b0' : '#e31b23', lh: 0.98 }),
    textF(418, 196, [short(namesLine(d).toUpperCase(), 12, 190)], { size: 12, fam: 'jak', weight: 800, fill: '#111111', anchor: 'end' }),
    textF(418, 214, [short(d.foot, 12, 190)], { size: 12, fam: 'jak', weight: 400, fill: '#555555', anchor: 'end' }),
    h('circle', { cx: 424, cy: 234, r: 8, fill: '#e31b23' }));
  return g;
}
// Candy Grid: a white board cut by a black bar, a yellow block with a glossy figure, a cyan block, a pink disc on the
// seam, the stacked tracked title on white, a floating pill with a rose dot.
function candyGrid(d) {
  const g = h('g');
  const t = fitF(d.title.toUpperCase(), { sizes: [22, 19, 17, 15, 13], fam: 'jak', weight: 800, width: 150, lines: 4 });
  g.append(
    h('rect', { width: W, height: H, fill: '#ffffff' }),
    h('rect', { width: 26, height: H, fill: '#1f1f23' }),
    h('rect', { x: 26, width: 200, height: 140, fill: '#ffc72c' }),
    h('rect', { x: 226, y: 140, width: 214, height: 108, fill: '#29c4e6' }),
    h('rect', { x: 386, width: 54, height: 140, fill: '#ff8a00' }),
    h('circle', { cx: 226, cy: 140, r: 34, fill: '#f9a8c9' }),
    h('ellipse', { cx: 126, cy: 118, rx: 44, ry: 6, fill: '#1b1b1f', opacity: 0.15 }),
    h('rect', { x: 92, y: 52, width: 68, height: 64, rx: 12, fill: '#ffffff' }),
    h('rect', { x: 112, y: 40, width: 28, height: 16, rx: 6, fill: '#ec4a7b' }),
    h('g', { transform: 'translate(190,40)' }, [h('g', { class: 'bob' }, [h('circle', { r: 9, fill: '#29c4e6' })])]),
    textF(240, 34 + t.size, t.lines, { size: t.size, fam: 'jak', weight: 800, fill: d.empty ? '#b9b9c4' : '#1b1b1f', lh: 1.15, spacing: '0.14em' }),
    textF(44, 176, [short(namesLine(d), 13, 170)], { size: 13, fam: 'jak', weight: 700, fill: '#1b1b1f' }),
    textF(44, 194, [short(d.foot, 12, 170)], { size: 12, fam: 'jak', weight: 400, fill: '#5e5e68' }),
    h('rect', { x: 120, y: 126, width: 92, height: 24, rx: 12, fill: '#ffffff' }),
    h('circle', { cx: 134, cy: 138, r: 4, fill: '#ec4a7b' }));
  return g;
}
// Violet Lime: a white ground, the title in violet, the ONE lime CTA pill, the picture in a rounded frame with its
// bottom-left corner squared, a violet band along the foot and a thin outlined frame bleeding off the top corner.
function violetLime(d) {
  const g = h('g');
  const t = fitF(d.title, { sizes: [30, 26, 23, 20, 17], fam: 'jak', weight: 800, width: 212, lines: 4 });
  g.append(
    h('rect', { width: W, height: H, fill: '#ffffff' }),
    h('rect', { x: 318, y: -26, width: 96, height: 92, rx: 14, fill: 'none', stroke: '#e4e3ef', 'stroke-width': 2 }),
    h('rect', { y: 214, width: W, height: 34, fill: '#3d2ee6' }),
    h('rect', { x: 266, y: 26, width: 150, height: 176, rx: 14, fill: '#3d2ee6' }),
    h('rect', { x: 266, y: 186, width: 16, height: 16, fill: '#3d2ee6' }),
    h('g', { transform: 'translate(341,96)' }, [h('g', { class: 'bob' }, [h('circle', { r: 17, fill: '#d2f53c' })])]),
    textF(26, 44, ['IN TWO COLOURS'], { size: 11, fam: 'jak', weight: 700, fill: '#5a5a66', spacing: '0.14em' }),
    textF(26, 72 + t.size * 0.5, t.lines, { size: t.size, fam: 'jak', weight: 800, fill: d.empty ? '#b9b9c4' : '#3d2ee6', lh: 1.04, spacing: '-0.035em' }),
    h('rect', { x: 26, y: 162, width: 104, height: 30, rx: 15, fill: '#d2f53c' }),
    textF(50, 182, ['Start here'], { size: 12, fam: 'jak', weight: 700, fill: '#15151a' }),
    textF(26, 232, [short(namesLine(d), 13, 190)], { size: 13, fam: 'jak', weight: 700, fill: '#ffffff' }),
    textF(418, 232, [short(d.foot, 12, 150)], { size: 12, fam: 'jak', weight: 500, fill: '#d4d0f7', anchor: 'end' }));
  return g;
}
const DRAW = { 'Bold Blue': boldBlue, 'Clay Pop': clayPop, 'Red Gallery': redGallery, 'Candy Grid': candyGrid, 'Violet Lime': violetLime };

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
