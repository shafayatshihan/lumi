/* Candy Grid deck helpers (classic script; load after runtime.js and before your own slide scripts).
   - Page numbers: every <span class="cg-pageno"></span> becomes "03".
   - CGChart.line(holder, spec) / CGChart.bars(holder, spec): flat charts on a white rounded card (LOOK-BASE 5.1):
     rose is the series the slide is about, then ink, then grey. Rounded bars and tags, no gradient, no legend.
   Sizes: end labels and bar names 30 px; ticks, axis titles, the source line and the event tag 24 px Poppins - the
   only chart texts below 30 px, marked .cg-tick / .cg-cap.
   Spec: .claude/skills/aura-slide/looks/_shared/LOOK-BASE.md section 5, then looks/candy-grid/LOOK.md section 4. */
(function () {
  'use strict';
  if (window.CG) return;
  var NS = 'http://www.w3.org/2000/svg';
  var INK = '#1B1B1F', MUTED = '#5E5E68', HAIR = '#E2E2E8', GROOVE = '#EEEEF2';
  var CLAY = '#EC4A7B', CLAY_HI = '#EC4A7B', CLAY_LO = '#EC4A7B', CLAY_INK = '#C2185B', GREY = '#A9A9B3';   // flat rose
  var SERIES = [CLAY, INK, GREY];          // the primary first: it is the thing the slide is about
  var LABEL_INK = [CLAY_INK, INK, '#5E5E68'];
  var FONT = 'Poppins, Segoe UI, sans-serif', MONO = 'Poppins, Segoe UI, sans-serif';   // two typefaces only: no mono in this look
  var queue = [];
  var whenReady = function (fn) { if (document.readyState === 'loading') queue.push(fn); else fn(); };
  document.addEventListener('DOMContentLoaded', function () { while (queue.length) { try { queue.shift()(); } catch (e) { console.error(e); } } });

  /* ------------------------------------------------------------------ page numbers */
  function pageNumbers() {
    var slides = Array.prototype.slice.call(document.querySelectorAll('.deck > .slide'));
    var pad = function (n) { return String(n).padStart(2, '0'); };
    slides.forEach(function (s, i) {
      s.querySelectorAll('.cg-pageno').forEach(function (el) {
        el.setAttribute('data-edit', 'no');
        el.textContent = pad(i + 1);
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
    var t = S('text', { x: x, y: y, class: o.cls, 'text-anchor': o.anchor || 'middle', 'font-family': o.mono ? MONO : FONT,
      'font-size': o.size || 30, 'font-weight': o.weight || 700, fill: o.fill || MUTED, 'letter-spacing': o.mono ? '0.04em' : null,
      transform: o.rotate != null ? 'rotate(' + o.rotate + ' ' + x + ' ' + y + ')' : null }, parent);
    t.textContent = str; return t;
  }
  var uid = 0;
  /* the lit-clay gradient every orange mark uses: light top, the colour, a deeper bottom (light from above) */
  function clayGrad(defs, id) {
    var g = S('linearGradient', { id: id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    S('stop', { offset: '0', 'stop-color': CLAY_HI }, g);
    S('stop', { offset: '0.5', 'stop-color': CLAY }, g);
    S('stop', { offset: '1', 'stop-color': CLAY_LO }, g);
    return 'url(#' + id + ')';
  }
  function dims(el) {
    var cs = getComputedStyle(el);
    var padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight), padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    return { W: Math.max(400, (el.clientWidth - padX) || 1000), H: Math.max(300, (el.clientHeight - padY) || 700) };
  }
  function noteOf(spec) { return [(spec.illustrative || spec.sample) ? 'illustrative' : null, spec.source || null].filter(Boolean).join(' · '); }

  /* ------------------------------------------------------------------ the line chart
     spec = {
       x: { min, max, ticks: [..], title: 'time, min' }, y: { min, max, ticks: [..], title: 'load held, kg' },
       series: [{ name: 'after', points: [[x, y], ...], color, markers: true }],   // <= 3; the FIRST is the clay one
       band: { from: x, to: x },                 // the region the slide is about: a soft orange wash
       event: { x, y, label: 'where it lets go' },
       illustrative: false,                      // true: a shape, not data - prints "illustrative", drops the y numbers
       source: 'Source: Author et al., 2021, Fig. 3'
     } */
  function line(holder, spec) {
    var el = typeof holder === 'string' ? document.querySelector(holder) : holder;
    if (el) whenReady(function () { drawLine(el, spec); });
  }
  function drawLine(el, spec) {
    el.setAttribute('data-edit', 'no');
    el.innerHTML = '';
    var d = dims(el), W = d.W, H = d.H, id = 'cpc' + (++uid);
    var longest = 0;
    spec.series.forEach(function (s) { longest = Math.max(longest, (s.name || '').length); });
    var note = noteOf(spec);
    var pad = { l: 120, r: Math.min(300, 70 + longest * 18), t: 40, b: note ? 150 : 110 };
    var x0 = pad.l, x1 = W - pad.r, y0 = H - pad.b, y1 = pad.t;
    var X = function (v) { return x0 + (v - spec.x.min) / (spec.x.max - spec.x.min) * (x1 - x0); };
    var Y = function (v) { return y0 - (v - spec.y.min) / (spec.y.max - spec.y.min) * (y0 - y1); };
    var svg = S('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': spec.label || '', class: 'cg-chart-svg' }, el);
    svg.style.display = 'block'; svg.style.overflow = 'visible';
    var defs = S('defs', {}, svg);
    var sh = S('filter', { id: id + 's', x: '-20%', y: '-40%', width: '140%', height: '200%' }, defs);
    S('feDropShadow', { dx: 0, dy: 4, stdDeviation: 4, 'flood-color': '#28203C', 'flood-opacity': 0.22 }, sh);

    if (spec.band) S('rect', { x: X(spec.band.from), y: y1, width: X(spec.band.to) - X(spec.band.from), height: y0 - y1, rx: 0, fill: CLAY, opacity: 0.1 }, svg);
    spec.y.ticks.forEach(function (v) { S('path', { d: 'M' + x0 + ' ' + Y(v) + ' H' + x1, stroke: HAIR, 'stroke-width': 2 }, svg); });
    S('path', { d: 'M' + x0 + ' ' + y0 + ' H' + x1, stroke: INK, 'stroke-width': 3, 'stroke-linecap': 'round' }, svg);
    if (!spec.illustrative) spec.y.ticks.forEach(function (v) { T(svg, x0 - 22, Y(v) + 8, String(v), { anchor: 'end', size: 24, weight: 500, mono: true, fill: INK, cls: 'cg-tick' }); });
    if (spec.y.title) T(svg, 22, (y0 + y1) / 2, spec.y.title, { size: 24, weight: 500, mono: true, fill: MUTED, rotate: -90, cls: 'cg-tick' });
    (spec.illustrative && !spec.x.keepTicks ? [] : spec.x.ticks).forEach(function (v) { T(svg, X(v), y0 + 44, String(v), { size: 24, weight: 500, mono: true, fill: INK, cls: 'cg-tick' }); });
    if (spec.x.title) T(svg, (x0 + x1) / 2, y0 + 88, spec.x.title, { size: 24, weight: 500, mono: true, fill: MUTED, cls: 'cg-tick' });

    spec.series.forEach(function (s, k) {
      var pts = s.points.filter(function (p) { return p[0] >= spec.x.min && p[0] <= spec.x.max; });
      if (!pts.length) return;
      var col = s.color || SERIES[k] || INK, lab = s.color ? s.color : LABEL_INK[k] || INK;
      var dd = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); }).join(' ');
      var pth = S('path', { d: dd, fill: 'none', stroke: col, 'stroke-width': s.width || 8, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
        pathLength: 1, 'data-anim': 'draw', filter: k === 0 ? 'url(#' + id + 's)' : null }, svg);
      pth.style.setProperty('--d', (200 + k * 200) + 'ms');
      var bead = k === 0 && s.markers ? clayGrad(defs, id + 'm') : '#FFFFFF';
      if (s.markers) pts.forEach(function (p) {
        S('circle', { cx: X(p[0]), cy: Y(p[1]), r: 11, fill: bead, stroke: k === 0 ? 'none' : col, 'stroke-width': 4 }, svg);
      });
      var last = pts[pts.length - 1];
      if (s.name) {
        var w = s.name.length * 17 + 44;
        S('rect', { x: X(last[0]) + 22, y: Y(last[1]) - 27, width: w, height: 54, rx: 27, fill: k === 0 ? CLAY_INK : '#FFFFFF',
          filter: 'url(#' + id + 's)' }, svg);
        T(svg, X(last[0]) + 22 + w / 2, Y(last[1]) + 10, s.name, { weight: 800, fill: k === 0 ? '#FFFFFF' : lab });
      }
    });
    if (spec.event) {
      var ex = X(spec.event.x), ey = Y(spec.event.y);
      S('path', { d: 'M' + ex + ' ' + (y1 + 64) + ' V' + y0, stroke: INK, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-dasharray': '2 12' }, svg);
      var ew = Math.max(200, spec.event.label.length * 15 + 48);
      S('rect', { x: ex - ew / 2, y: y1, width: ew, height: 54, rx: 27, fill: INK }, svg);
      T(svg, ex, y1 + 35, spec.event.label, { size: 24, weight: 500, mono: true, fill: '#FFFFFF', cls: 'cg-cap' });
      S('circle', { cx: ex, cy: ey, r: 14, fill: '#FFFFFF', stroke: INK, 'stroke-width': 5 }, svg);
    }
    if (note) T(svg, W - 4, H - 6, note, { size: 24, weight: 400, mono: true, anchor: 'end', fill: MUTED, cls: 'cg-cap' });
  }

  /* ------------------------------------------------------------------ the bar chart
     spec = { bars: [{ name: 'after', value: 72, key: true }, ...], max: 100, ticks: [0, 50, 100], unit: '%',
              title: 'share recovered, %', illustrative: false, source: '...' }
     At most 6 bars; `key: true` makes ONE bar the clay one, the rest are grey clay. */
  function bars(holder, spec) {
    var el = typeof holder === 'string' ? document.querySelector(holder) : holder;
    if (el) whenReady(function () { drawBars(el, spec); });
  }
  function drawBars(el, spec) {
    el.setAttribute('data-edit', 'no');
    el.innerHTML = '';
    var d = dims(el), W = d.W, H = d.H, id = 'cpb' + (++uid);
    var note = noteOf(spec), n = spec.bars.length, longest = 0;
    spec.bars.forEach(function (b) { longest = Math.max(longest, (b.name || '').length); });
    var pad = { l: Math.min(380, 40 + longest * 17), r: 150, t: 20, b: note ? 140 : 100 };
    var x0 = pad.l, x1 = W - pad.r, y0 = H - pad.b, y1 = pad.t, max = spec.max != null ? spec.max : Math.max.apply(null, spec.bars.map(function (b) { return b.value; }));
    var X = function (v) { return x0 + v / max * (x1 - x0); };
    var row = (y0 - y1) / n, th = Math.min(56, row * 0.5);
    var svg = S('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': spec.label || '', class: 'cg-chart-svg' }, el);
    svg.style.display = 'block'; svg.style.overflow = 'visible';
    var defs = S('defs', {}, svg);
    var sh = S('filter', { id: id + 's', x: '-10%', y: '-50%', width: '120%', height: '220%' }, defs);
    S('feDropShadow', { dx: 0, dy: 5, stdDeviation: 5, 'flood-color': '#28203C', 'flood-opacity': 0.25 }, sh);
    var gk = clayGrad(defs, id + 'k');
    var gg = S('linearGradient', { id: id + 'g', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    S('stop', { offset: '0', 'stop-color': '#DEDBD8' }, gg); S('stop', { offset: '0.55', 'stop-color': '#B9B6B3' }, gg); S('stop', { offset: '1', 'stop-color': '#9C9894' }, gg);
    (spec.ticks || []).forEach(function (v) {
      S('path', { d: 'M' + X(v) + ' ' + y1 + ' V' + y0, stroke: HAIR, 'stroke-width': 2 }, svg);
      if (!spec.illustrative) T(svg, X(v), y0 + 40, String(v), { size: 24, weight: 500, mono: true, fill: INK, cls: 'cg-tick' });
    });
    S('path', { d: 'M' + x0 + ' ' + y1 + ' V' + y0, stroke: INK, 'stroke-width': 3, 'stroke-linecap': 'round' }, svg);
    spec.bars.forEach(function (b, i) {
      var cy = y1 + row * (i + 0.5);
      S('rect', { x: x0, y: cy - th / 2, width: x1 - x0, height: th, rx: th / 2, fill: GROOVE }, svg);   // the groove
      var r = S('rect', { x: x0, y: cy - th / 2, width: Math.max(th, X(b.value) - x0), height: th, rx: th / 2, fill: b.key ? gk : 'url(#' + id + 'g)',
        filter: 'url(#' + id + 's)', 'data-anim': 'grow-x' }, svg);
      r.style.transformOrigin = x0 + 'px ' + cy + 'px';
      r.style.setProperty('--d', (200 + i * 90) + 'ms');
      T(svg, x0 - 22, cy + 10, b.name, { anchor: 'end', weight: 700, fill: INK });
      if (!spec.illustrative) T(svg, X(b.value) + 18, cy + 10, b.value + (spec.unit || ''), { anchor: 'start', weight: 800, fill: b.key ? CLAY_INK : INK });
    });
    if (spec.title) T(svg, (x0 + x1) / 2, y0 + 84, spec.title, { size: 24, weight: 500, mono: true, fill: MUTED, cls: 'cg-tick' });
    if (note) T(svg, W - 4, H - 6, note, { size: 24, weight: 400, mono: true, anchor: 'end', fill: MUTED, cls: 'cg-cap' });
  }

  whenReady(pageNumbers);
  window.CG = { version: '1.0', pageNumbers: pageNumbers };
  window.CGChart = { line: line, bars: bars };
})();
