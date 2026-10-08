/* Happy Headspace deck helpers (classic script; load after runtime.js and before your own slide scripts).
   - Page numbers: every <span class="hs-pageno"></span> becomes "03 / 12".
   - HSChart.line(holder, spec): this look's chart - a soft figure, not a data-viz widget. Round stroke caps, a soft
     tinted wash under the lead series, pale round axis rules with no arrowheads, a faint dotted grid, direct end
     labels in round pills and NO legend. Nothing here has a corner, an outline or a shadow.
     Axis numbers and the axis titles are set in Reno Mono, the same label voice as the kicker and the footer.
     Sizes: ticks, axis titles and end labels 36 px; step labels, the moment pill and the source / "illustrative"
     caption 28 px - the only chart texts allowed below 36 px, marked .hs-steplbl / .hs-cap.
     Series colours: orange #FF7300, then navy #27455C, then purple #3B197F. Never more than three, and orange first:
     the lead colour leads. The wash belongs to series 1 only.
   Spec: .claude/skills/aura-slide/looks/_shared/LOOK-BASE.md section 5, then looks/happy-headspace/LOOK.md section 4. */
(function () {
  'use strict';
  if (window.HS) return;
  var NS = 'http://www.w3.org/2000/svg';
  var INK = '#2D2C2B', MUTED = '#44423F', ORANGE = '#FF7300', NAVY = '#27455C', PURPLE = '#3B197F',
      GOLD = '#FFCE00', WARM = '#F9F4F2', PALE = '#E2DED9';
  var FONT = 'DM Sans, Segoe UI, sans-serif';
  var LABEL = 'Reno Mono, Consolas, monospace';
  var queue = [];
  var whenReady = function (fn) { if (document.readyState === 'loading') queue.push(fn); else fn(); };
  document.addEventListener('DOMContentLoaded', function () { while (queue.length) { try { queue.shift()(); } catch (e) { console.error(e); } } });

  /* ------------------------------------------------------------------ page numbers */
  function pageNumbers() {
    var slides = Array.prototype.slice.call(document.querySelectorAll('.deck > .slide'));
    var pad = function (n) { return String(n).padStart(2, '0'); };
    slides.forEach(function (s, i) {
      s.querySelectorAll('.hs-pageno').forEach(function (el) {
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
    var t = S('text', { x: x, y: y, class: o.cls, 'text-anchor': o.anchor || 'middle',
      'font-family': o.label ? LABEL : FONT, 'font-size': o.size || 36, 'font-weight': o.weight || 500,
      fill: o.fill || MUTED, 'letter-spacing': o.track || null,
      transform: o.rotate != null ? 'rotate(' + o.rotate + ' ' + x + ' ' + y + ')' : null }, parent);
    t.textContent = str; return t;
  }
  var uid = 0;

  /* ------------------------------------------------------------------ the soft line chart.
     spec = {
       x: { min, max, ticks: [..], title: 'minutes' }, y: { min, max, ticks: [..], title: 'calm, %' },
       series: [{ name: 'after', color: '#FF7300', points: [[x, y], ...], markers: false, wash: true }],
       steps: { at: [x0, x1, ...], labels: ['week 1', ...], highlight: 2 },
       band: { from: x, to: x },                 // the region the slide is about: a soft warm wash
       event: { x, y, label: 'the turning point' },
       illustrative: false,                      // true: a shape, not data - prints "illustrative", drops the y numbers
       source: 'Source: Author et al., 2021, Fig. 3'
     } */
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
    var id = 'hsc' + (++uid);
    var longest = 0;
    spec.series.forEach(function (s) { longest = Math.max(longest, (s.name || '').length); });
    var note = [spec.illustrative || spec.sample ? 'illustrative' : null, spec.source || null].filter(Boolean).join(' · ');
    var pad = { l: 150, r: Math.min(320, 64 + longest * 20), t: spec.steps ? 118 : 52, b: note ? 190 : 148 };
    var x0 = pad.l, x1 = W - pad.r, y0 = H - pad.b, y1 = pad.t;
    var X = function (v) { return x0 + (v - spec.x.min) / (spec.x.max - spec.x.min) * (x1 - x0); };
    var Y = function (v) { return y0 - (v - spec.y.min) / (spec.y.max - spec.y.min) * (y0 - y1); };
    var svg = S('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img',
      'aria-label': spec.label || '', class: 'hs-chart-svg' }, el);
    svg.style.display = 'block'; svg.style.overflow = 'visible';
    var defs = S('defs', {}, svg);

    // the region the slide is about: a soft warm wash with round ends, drawn first
    if (spec.band) S('rect', { x: X(spec.band.from), y: y1 - 10, width: X(spec.band.to) - X(spec.band.from),
      height: y0 - y1 + 10, rx: 20, fill: WARM }, svg);
    // a faint dotted grid: nearly not there
    (spec.y.ticks || []).forEach(function (v) {
      S('path', { d: 'M' + (x0 + 12) + ' ' + Y(v) + ' H' + x1, stroke: PALE, 'stroke-width': 4,
        'stroke-linecap': 'round', 'stroke-dasharray': '0 20' }, svg);
    });
    if (spec.steps) {
      var at = spec.steps.at;
      at.forEach(function (v, i) {
        if (i > 0) S('path', { d: 'M' + X(v) + ' ' + (y1 - 8) + ' V' + y0, stroke: PALE, 'stroke-width': 4,
          'stroke-linecap': 'round', 'stroke-dasharray': '0 18' }, svg);
      });
      (spec.steps.labels || []).forEach(function (lab, i) {
        var a = at[i], b = i + 1 < at.length ? at[i + 1] : spec.x.max, cx = (X(a) + X(b)) / 2, hi = i === spec.steps.highlight;
        if (hi) S('rect', { x: cx - 76, y: y1 - 78, width: 152, height: 50, rx: 25, fill: GOLD }, svg);
        T(svg, cx, y1 - 44, lab, { size: 28, label: true, weight: 400, fill: hi ? INK : MUTED, cls: 'hs-steplbl' });
      });
    }
    // the axes: pale round rules, NO arrowheads. A soft look does not point.
    S('path', { d: 'M' + x0 + ' ' + (y0 + 18) + ' V' + (y1 - 20), stroke: PALE, 'stroke-width': 8, 'stroke-linecap': 'round' }, svg);
    S('path', { d: 'M' + (x0 - 18) + ' ' + y0 + ' H' + (x1 + 24), stroke: PALE, 'stroke-width': 8, 'stroke-linecap': 'round' }, svg);
    if (!spec.illustrative) (spec.y.ticks || []).forEach(function (v) {
      T(svg, x0 - 30, Y(v) + 12, String(v), { anchor: 'end', fill: MUTED, label: true, weight: 400 });
    });
    if (spec.y.title) T(svg, 48, (y0 + y1) / 2, spec.y.title, { label: true, weight: 400, fill: MUTED, rotate: -90 });
    (spec.illustrative && !spec.x.keepTicks ? [] : (spec.x.ticks || [])).forEach(function (v) {
      T(svg, X(v), y0 + 56, String(v), { fill: MUTED, label: true, weight: 400 });
    });
    if (spec.x.title) T(svg, (x0 + x1) / 2, y0 + 114, spec.x.title, { label: true, weight: 400, fill: MUTED });

    // series: a 10 px round-capped stroke, and a soft wash under the lead one
    spec.series.forEach(function (s, k) {
      var pts = s.points.filter(function (p) { return p[0] >= spec.x.min && p[0] <= spec.x.max; });
      if (!pts.length) return;
      var col = s.color || [ORANGE, NAVY, PURPLE][k] || ORANGE;
      var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); }).join(' ');
      var wash = s.wash != null ? s.wash : k === 0;
      if (wash) {
        var gid = id + 'w' + k;
        var lg = S('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
        S('stop', { offset: '0%', 'stop-color': col, 'stop-opacity': .22 }, lg);
        S('stop', { offset: '100%', 'stop-color': col, 'stop-opacity': 0 }, lg);
        S('path', { d: d + ' L' + X(pts[pts.length - 1][0]).toFixed(1) + ' ' + y0 + ' L' + X(pts[0][0]).toFixed(1) + ' ' + y0 + ' Z',
          fill: 'url(#' + gid + ')', stroke: 'none' }, svg);
      }
      var pth = S('path', { d: d, fill: 'none', stroke: col, 'stroke-width': s.width || 10, 'stroke-linejoin': 'round',
        'stroke-linecap': 'round', pathLength: 1, 'data-anim': 'draw' }, svg);
      pth.style.setProperty('--d', (260 + k * 240) + 'ms');
      if (s.markers) pts.forEach(function (p) {
        S('circle', { cx: X(p[0]), cy: Y(p[1]), r: 10, fill: '#FFFFFF', stroke: col, 'stroke-width': 6 }, svg);
      });
      var last = pts[pts.length - 1];
      if (s.name) {
        var w = s.name.length * 19 + 48;
        S('rect', { x: X(last[0]) + 22, y: Y(last[1]) - 31, width: w, height: 62, rx: 31, fill: col }, svg);
        T(svg, X(last[0]) + 22 + w / 2, Y(last[1]) + 12, s.name, { weight: 700, fill: col === GOLD ? INK : '#FFFFFF' });
      }
    });
    // the marked moment: a soft gold pill and a pale drop line. Nothing shouts.
    if (spec.event) {
      var ex = X(spec.event.x), ey = Y(spec.event.y);
      S('path', { d: 'M' + ex + ' ' + (y1 + 74) + ' V' + y0, stroke: PALE, 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-dasharray': '0 22' }, svg);
      var ew = Math.max(240, spec.event.label.length * 15 + 60);
      S('rect', { x: ex - ew / 2, y: y1, width: ew, height: 66, rx: 33, fill: GOLD }, svg);
      T(svg, ex, y1 + 44, spec.event.label, { size: 28, label: true, weight: 400, fill: INK, cls: 'hs-cap' });
      S('circle', { cx: ex, cy: ey, r: 15, fill: '#FFFFFF', stroke: ORANGE, 'stroke-width': 8 }, svg);
    }
    if (note) T(svg, W - 8, H - 10, note, { size: 28, weight: 400, anchor: 'end', fill: MUTED, cls: 'hs-cap' });
  }

  whenReady(pageNumbers);
  window.HS = { version: '1.0', pageNumbers: pageNumbers };
  window.HSChart = { line: line };
})();
