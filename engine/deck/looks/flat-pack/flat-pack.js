/* Flat-Pack deck helpers (classic script; load after runtime.js and before your own slide scripts).
   - Page numbers: every <span class="fp-pageno"></span> becomes "03 / 12".
   - FPChart.line(holder, spec): the manual's own chart - a drawn figure, not a data-viz widget. Everything is one
     4 px ink pen plus flat fills: no gradients, no glow, no blur, no shadow, no legend box. Direct end labels sit in
     outlined boxes, the x and y axes are ink lines with solid triangular heads, the grid is dotted, a highlighted
     region is flat yellow, and a marked moment is a square ink-outlined badge.
     Sizes: ticks, axis titles and end labels 32 px; step labels, the event badge and the source / "illustrative"
     caption 24 px - the only chart texts allowed below 32 px, marked .fp-steplbl / .fp-cap.
   Spec: .claude/skills/aura-slide/looks/_shared/LOOK-BASE.md section 5, then looks/flat-pack/LOOK.md section 4. */
(function () {
  'use strict';
  if (window.FP) return;
  var NS = 'http://www.w3.org/2000/svg';
  var html = document.documentElement;
  var INK = '#111111', MUTED = '#484848', BRAND = '#0058A3', YELLOW = '#FFDB00', SIGNAL = '#CA5008';
  var FONT = 'Noto Sans, Segoe UI, sans-serif';
  var queue = [];
  var whenReady = function (fn) { if (document.readyState === 'loading') queue.push(fn); else fn(); };
  document.addEventListener('DOMContentLoaded', function () { while (queue.length) { try { queue.shift()(); } catch (e) { console.error(e); } } });

  /* ------------------------------------------------------------------ page numbers */
  function pageNumbers() {
    var slides = Array.prototype.slice.call(document.querySelectorAll('.deck > .slide'));
    var pad = function (n) { return String(n).padStart(2, '0'); };
    slides.forEach(function (s, i) {
      s.querySelectorAll('.fp-pageno').forEach(function (el) {
        el.setAttribute('data-edit', 'no');
        el.textContent = pad(i + 1) + ' / ' + pad(slides.length);
      });
    });
  }

  /* ------------------------------------------------------------------ SVG helpers */
  function S(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function T(parent, x, y, str, o) {
    o = o || {};
    var t = S('text', { x: x, y: y, class: o.cls, 'text-anchor': o.anchor || 'middle', 'font-family': FONT,
      'font-size': o.size || 32, 'font-weight': o.weight || 700, fill: o.fill || MUTED,
      transform: o.rotate != null ? 'rotate(' + o.rotate + ' ' + x + ' ' + y + ')' : null }, parent);
    t.textContent = str; return t;
  }
  var uid = 0;

  /* ------------------------------------------------------------------ the line chart
     spec = {
       x: { min, max, ticks: [..], title: 'time elapsed, min' }, y: { min, max, ticks: [..], title: 'load, kg' },
       series: [{ name: 'before', color: '#111111', points: [[x, y], ...], markers: false }],
       steps: { at: [x0, x1, ...], labels: ['5 W', ...], highlight: 2 },
       band: { from: x, to: x },                 // the region the slide is about: flat yellow, no opacity tricks
       event: { x, y, label: 'the turning point' },
       illustrative: false,                      // true: a shape, not data - prints "illustrative", drops the y numbers
       source: 'Source: Author et al., 2021, Fig. 3'
     }
     Series colours in this look: ink #111111 first, blue #0058A3 second, orange #CA5008 third. Never more than three. */
  function line(holder, spec) {
    var el = typeof holder === 'string' ? document.querySelector(holder) : holder;
    if (!el) return;
    whenReady(function () { draw(el, spec); });
  }
  function draw(el, spec) {
    el.setAttribute('data-edit', 'no');
    el.innerHTML = '';
    var cs = getComputedStyle(el);
    var padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    var padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    var W = Math.max(400, (el.clientWidth - padX) || 1000), H = Math.max(300, (el.clientHeight - padY) || 700);
    var id = 'fpc' + (++uid);
    var longest = 0;
    spec.series.forEach(function (s) { longest = Math.max(longest, (s.name || '').length); });
    var note = [(spec.illustrative || spec.sample) ? 'illustrative' : null, spec.source || null].filter(Boolean).join(' - ');
    var pad = { l: 150, r: Math.min(300, 56 + longest * 19), t: spec.steps ? 112 : 48, b: note ? 190 : 146 };
    var x0 = pad.l, x1 = W - pad.r, y0 = H - pad.b, y1 = pad.t;
    var X = function (v) { return x0 + (v - spec.x.min) / (spec.x.max - spec.x.min) * (x1 - x0); };
    var Y = function (v) { return y0 - (v - spec.y.min) / (spec.y.max - spec.y.min) * (y0 - y1); };
    var svg = S('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': spec.label || '', class: 'fp-chart-svg' }, el);
    svg.style.display = 'block'; svg.style.overflow = 'visible';
    var defs = S('defs', {}, svg);
    var mk = S('marker', { id: id + 'a', markerUnits: 'userSpaceOnUse', markerWidth: 26, markerHeight: 26, refX: 13, refY: 13, orient: 'auto' }, defs);
    S('path', { d: 'M3 3 L23 13 L3 23 Z', fill: INK }, mk);

    // the region the slide is about: a flat yellow block, drawn first so everything else sits on top of it
    if (spec.band) S('rect', { x: X(spec.band.from), y: y1 - 8, width: X(spec.band.to) - X(spec.band.from), height: y0 - y1 + 8, fill: YELLOW }, svg);
    // dotted grid: the graph paper under the drawing
    spec.y.ticks.forEach(function (v) {
      S('path', { d: 'M' + (x0 + 10) + ' ' + Y(v) + ' H' + x1, stroke: INK, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-dasharray': '0 16', opacity: 0.45 }, svg);
    });
    if (spec.steps) {
      var at = spec.steps.at;
      at.forEach(function (v, i) {
        if (i > 0) S('path', { d: 'M' + X(v) + ' ' + (y1 - 8) + ' V' + y0, stroke: INK, 'stroke-width': 3, 'stroke-dasharray': '12 12', opacity: 0.5 }, svg);
      });
      (spec.steps.labels || []).forEach(function (lab, i) {
        var a = at[i], b = i + 1 < at.length ? at[i + 1] : spec.x.max, cx = (X(a) + X(b)) / 2, hi = i === spec.steps.highlight;
        if (hi) S('rect', { x: cx - 56, y: y1 - 70, width: 112, height: 44, fill: YELLOW, stroke: INK, 'stroke-width': 3, rx: 4 }, svg);
        T(svg, cx, y1 - 38, lab, { size: 24, weight: 700, fill: hi ? INK : MUTED, cls: 'fp-steplbl' });
      });
    }
    // y axis: one ink line with a solid head, plain numbers, the title turned on its side
    S('path', { d: 'M' + x0 + ' ' + (y0 + 30) + ' V' + (y1 - 40), stroke: INK, 'stroke-width': 4, 'stroke-linecap': 'round', 'marker-end': 'url(#' + id + 'a)' }, svg);
    if (!spec.illustrative) spec.y.ticks.forEach(function (v) {
      S('path', { d: 'M' + (x0 - 14) + ' ' + Y(v) + ' H' + x0, stroke: INK, 'stroke-width': 4, 'stroke-linecap': 'round' }, svg);
      T(svg, x0 - 26, Y(v) + 11, String(v), { anchor: 'end', fill: INK });
    });
    if (spec.y.title) T(svg, 44, (y0 + y1) / 2, spec.y.title, { weight: 700, fill: INK, rotate: -90 });
    // x axis: the same ink line, the same head. No gradient, no glow: this look has one pen.
    S('path', { d: 'M' + (x0 - 30) + ' ' + y0 + ' H' + (x1 + 44), stroke: INK, 'stroke-width': 4, 'stroke-linecap': 'round', 'marker-end': 'url(#' + id + 'a)' }, svg);
    (spec.illustrative && !spec.x.keepTicks ? [] : spec.x.ticks).forEach(function (v) {
      S('path', { d: 'M' + X(v) + ' ' + y0 + ' V' + (y0 + 14), stroke: INK, 'stroke-width': 4, 'stroke-linecap': 'round' }, svg);
      T(svg, X(v), y0 + 54, String(v), { fill: INK });
    });
    if (spec.x.title) T(svg, (x0 + x1) / 2, y0 + 110, spec.x.title, { weight: 700, fill: INK });
    // series: 6 px pen strokes, square joins, and a direct end label in its own outlined box (never a legend)
    spec.series.forEach(function (s, k) {
      var pts = s.points.filter(function (p) { return p[0] >= spec.x.min && p[0] <= spec.x.max; });
      if (!pts.length) return;
      var col = s.color || [INK, BRAND, SIGNAL][k] || INK;
      var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); }).join(' ');
      var pth = S('path', { d: d, fill: 'none', stroke: col, 'stroke-width': s.width || 6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', pathLength: 1, 'data-anim': 'draw' }, svg);
      pth.style.setProperty('--d', (200 + k * 200) + 'ms');
      if (s.markers) pts.forEach(function (p) {
        S('rect', { x: X(p[0]) - 9, y: Y(p[1]) - 9, width: 18, height: 18, fill: '#FFFFFF', stroke: col, 'stroke-width': 4 }, svg);
      });
      var last = pts[pts.length - 1];
      if (s.name) {
        var w = s.name.length * 18 + 36;
        S('rect', { x: X(last[0]) + 20, y: Y(last[1]) - 27, width: w, height: 54, fill: '#FFFFFF', stroke: col, 'stroke-width': 4, rx: 4 }, svg);
        T(svg, X(last[0]) + 20 + w / 2, Y(last[1]) + 11, s.name, { weight: 800, fill: col });
      }
    });
    // the marked moment: an ink line down to the axis and a square badge. Nothing breathes in a manual.
    if (spec.event) {
      var ex = X(spec.event.x), ey = Y(spec.event.y);
      S('path', { d: 'M' + ex + ' ' + (y1 + 66) + ' V' + y0, stroke: INK, 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-dasharray': '14 14' }, svg);
      var ew = Math.max(220, spec.event.label.length * 13 + 56);
      S('rect', { x: ex - ew / 2, y: y1, width: ew, height: 62, fill: YELLOW, stroke: INK, 'stroke-width': 4, rx: 4 }, svg);
      T(svg, ex, y1 + 41, spec.event.label, { size: 24, weight: 700, fill: INK, cls: 'fp-cap' });
      S('circle', { cx: ex, cy: ey, r: 14, fill: '#FFFFFF', stroke: INK, 'stroke-width': 6 }, svg);
    }
    if (note) T(svg, W - 8, H - 8, note, { size: 24, weight: 400, anchor: 'end', fill: MUTED, cls: 'fp-cap' });
  }

  whenReady(pageNumbers);
  window.FP = { version: '1.0', pageNumbers: pageNumbers };
  window.FPChart = { line: line };
})();
