/* Pink Punch deck helpers (classic script; load after runtime.js and before your own slide scripts).
   - Page numbers: every <span class="pp-pageno"></span> becomes "03 / 12".
   - PPChart.bar(holder, spec)  - THIS LOOK'S OWN CHART. Chunky outlined bars with a hard black offset copy behind
     each one, the value printed on top in Anton. A poster counts things in blocks.
   - PPChart.line(holder, spec) - the same pen for a trend: an 8 px stroke with a hard black copy 6 px behind it,
     direct end labels in outlined pills, never a legend.

   Everything is one black outline plus flat fills. NO gradient, NO blur, NO soft shadow, NO legend box: every shadow
   here is a solid black copy of the shape, drawn first and offset. Sizes: ticks, axis titles, end labels and bar
   values 36 px; step labels, the event badge and the source / "illustrative" caption 28 px - the only chart texts
   allowed below 36 px, marked .pp-steplbl / .pp-cap.
   Series colours: ink #000000, then pink #FF90E8, then teal #23A094. Never more than three.
   Spec: .claude/skills/aura-slide/looks/_shared/LOOK-BASE.md section 5, then looks/pink-punch/LOOK.md section 4. */
(function () {
  'use strict';
  if (window.PP) return;
  var NS = 'http://www.w3.org/2000/svg';
  var INK = '#000000', MUTED = '#242423', PINK = '#FF90E8', TEAL = '#23A094', YELLOW = '#FFC900', PAPER = '#FFFFFF';
  var FONT = 'Work Sans, Segoe UI, sans-serif';
  var DISPLAY = 'Anton, Impact, Arial Narrow, sans-serif';
  var SH = 8;                                   /* the hard offset, in chart units - the same device as the CSS cards */
  var queue = [];
  var whenReady = function (fn) { if (document.readyState === 'loading') queue.push(fn); else fn(); };
  document.addEventListener('DOMContentLoaded', function () { while (queue.length) { try { queue.shift()(); } catch (e) { console.error(e); } } });

  /* ------------------------------------------------------------------ page numbers */
  function pageNumbers() {
    var slides = Array.prototype.slice.call(document.querySelectorAll('.deck > .slide'));
    var pad = function (n) { return String(n).padStart(2, '0'); };
    slides.forEach(function (s, i) {
      s.querySelectorAll('.pp-pageno').forEach(function (el) {
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
      'font-family': o.display ? DISPLAY : FONT, 'font-size': o.size || 36, 'font-weight': o.weight || 600,
      fill: o.fill || MUTED, 'letter-spacing': o.track || null,
      transform: o.rotate != null ? 'rotate(' + o.rotate + ' ' + x + ' ' + y + ')' : null }, parent);
    t.textContent = str; return t;
  }
  /* THE DEVICE: draw the shape twice - a solid black copy offset down and right, then the real one on top.
     make(fillColour, strokeColour, offsetX, offsetY) is called for the shadow first, then for the shape. */
  function printed(make, dx, dy) {
    dx = dx == null ? SH : dx; dy = dy == null ? SH : dy;
    make(INK, INK, dx, dy);
    make(null, null, 0, 0);
  }
  var uid = 0;

  function frame(el, spec, hasSteps, note) {
    el.setAttribute('data-edit', 'no');
    el.innerHTML = '';
    var cs = getComputedStyle(el);
    var padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    var padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    var W = Math.max(400, (el.clientWidth - padX) || 1000), H = Math.max(300, (el.clientHeight - padY) || 700);
    var svg = S('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img',
      'aria-label': spec.label || '', class: 'pp-chart-svg' }, el);
    svg.style.display = 'block'; svg.style.overflow = 'visible';
    return { W: W, H: H, svg: svg, id: 'ppc' + (++uid) };
  }
  function axisHead(svg, id) {
    var defs = S('defs', {}, svg);
    var mk = S('marker', { id: id + 'a', markerUnits: 'userSpaceOnUse', markerWidth: 30, markerHeight: 30, refX: 15, refY: 15, orient: 'auto' }, defs);
    S('path', { d: 'M3 2 L27 15 L3 28 Z', fill: INK }, mk);
    return 'url(#' + id + 'a)';
  }

  /* ------------------------------------------------------------------ the bar chart: this look's first answer.
     spec = {
       bars: [{ name: 'before', value: 82, color: '#FF90E8' }, ...],      // 2-6 bars
       y: { min: 0, max: 100, ticks: [0, 50, 100], title: 'load held, kg' },
       unit: 'kg',                        // printed after each value
       illustrative: false,               // true: shapes, not data - prints "illustrative", drops the y numbers
       source: 'Source: Author et al., 2021, Table 2'
     }
     A bar chart is read against a flat baseline, so it stays honest (LOOK-BASE 5.1): the depth is in the print, never
     in the measurement. y.min must be 0 - a truncated bar axis lies about the ratio, and this function refuses it. */
  function bar(holder, spec) {
    var el = typeof holder === 'string' ? document.querySelector(holder) : holder;
    if (!el) return;
    whenReady(function () { drawBar(el, spec); });
  }
  function drawBar(el, spec) {
    if (spec.y && spec.y.min) throw new Error('PPChart.bar: a bar chart must start at zero (y.min = 0), or the blocks lie about the ratio.');
    var note = [spec.illustrative ? 'illustrative' : null, spec.source || null].filter(Boolean).join(' - ');
    var f = frame(el, spec, false, note), W = f.W, H = f.H, svg = f.svg;
    var head = axisHead(svg, f.id);
    var pad = { l: 140, r: 56, t: 110, b: note ? 190 : 150 };
    var x0 = pad.l, x1 = W - pad.r, y0 = H - pad.b, y1 = pad.t;
    var max = spec.y.max, Y = function (v) { return y0 - v / max * (y0 - y1); };
    var n = spec.bars.length, slot = (x1 - x0) / n, bw = Math.min(190, slot * 0.6);

    // dotted grid: the paper under the print
    (spec.y.ticks || []).forEach(function (v) {
      S('path', { d: 'M' + (x0 + 10) + ' ' + Y(v) + ' H' + x1, stroke: INK, 'stroke-width': 3,
        'stroke-linecap': 'round', 'stroke-dasharray': '0 18', opacity: .5 }, svg);
    });
    // y axis
    S('path', { d: 'M' + x0 + ' ' + (y0 + 34) + ' V' + (y1 - 46), stroke: INK, 'stroke-width': 5, 'stroke-linecap': 'round', 'marker-end': head }, svg);
    if (!spec.illustrative) (spec.y.ticks || []).forEach(function (v) {
      S('path', { d: 'M' + (x0 - 16) + ' ' + Y(v) + ' H' + x0, stroke: INK, 'stroke-width': 5, 'stroke-linecap': 'round' }, svg);
      T(svg, x0 - 28, Y(v) + 12, String(v), { anchor: 'end', fill: INK, weight: 700 });
    });
    if (spec.y.title) T(svg, 46, (y0 + y1) / 2, spec.y.title, { weight: 700, fill: INK, rotate: -90 });
    // the baseline: one fat black rule the whole way across. Every bar is read against THIS.
    S('path', { d: 'M' + (x0 - 30) + ' ' + y0 + ' H' + (x1 + 30), stroke: INK, 'stroke-width': 5, 'stroke-linecap': 'round' }, svg);

    spec.bars.forEach(function (b, k) {
      var cx = x0 + slot * (k + 0.5), top = Y(b.value), col = b.color || [PINK, TEAL, YELLOW, PAPER][k % 4];
      printed(function (fillC, strokeC, dx, dy) {
        S('rect', { x: cx - bw / 2 + dx, y: top + dy, width: bw, height: Math.max(2, y0 - top), rx: 10,
          fill: fillC || col, stroke: strokeC || INK, 'stroke-width': 5 }, svg);
      });
      T(svg, cx, top - 28, String(b.value) + (spec.unit ? ' ' + spec.unit : ''), { display: true, size: 36, weight: 400, fill: INK });
      T(svg, cx, y0 + 58, b.name, { size: 36, weight: 600, fill: INK });
    });
    if (note) T(svg, W - 8, H - 10, note, { size: 28, weight: 500, anchor: 'end', fill: MUTED, cls: 'pp-cap' });
  }

  /* ------------------------------------------------------------------ the line chart, for a trend over time.
     Same spec shape as the other looks' line charts, so a plan can move between them:
     { x, y, series: [{name, color, points, markers}], steps, band, event, illustrative, source } */
  function line(holder, spec) {
    var el = typeof holder === 'string' ? document.querySelector(holder) : holder;
    if (!el) return;
    whenReady(function () { drawLine(el, spec); });
  }
  function drawLine(el, spec) {
    var note = [spec.illustrative || spec.sample ? 'illustrative' : null, spec.source || null].filter(Boolean).join(' - ');
    var f = frame(el, spec, !!spec.steps, note), W = f.W, H = f.H, svg = f.svg;
    var head = axisHead(svg, f.id);
    var longest = 0;
    spec.series.forEach(function (s) { longest = Math.max(longest, (s.name || '').length); });
    var pad = { l: 150, r: Math.min(320, 70 + longest * 21), t: spec.steps ? 124 : 56, b: note ? 196 : 152 };
    var x0 = pad.l, x1 = W - pad.r, y0 = H - pad.b, y1 = pad.t;
    var X = function (v) { return x0 + (v - spec.x.min) / (spec.x.max - spec.x.min) * (x1 - x0); };
    var Y = function (v) { return y0 - (v - spec.y.min) / (spec.y.max - spec.y.min) * (y0 - y1); };

    // the region the slide is about: a flat pink block, drawn first
    if (spec.band) S('rect', { x: X(spec.band.from), y: y1 - 10, width: X(spec.band.to) - X(spec.band.from),
      height: y0 - y1 + 10, fill: PINK }, svg);
    (spec.y.ticks || []).forEach(function (v) {
      S('path', { d: 'M' + (x0 + 10) + ' ' + Y(v) + ' H' + x1, stroke: INK, 'stroke-width': 3,
        'stroke-linecap': 'round', 'stroke-dasharray': '0 18', opacity: .5 }, svg);
    });
    if (spec.steps) {
      var at = spec.steps.at;
      at.forEach(function (v, i) {
        if (i > 0) S('path', { d: 'M' + X(v) + ' ' + (y1 - 10) + ' V' + y0, stroke: INK, 'stroke-width': 3, 'stroke-dasharray': '14 14', opacity: .55 }, svg);
      });
      (spec.steps.labels || []).forEach(function (lab, i) {
        var a = at[i], b = i + 1 < at.length ? at[i + 1] : spec.x.max, cx = (X(a) + X(b)) / 2, hi = i === spec.steps.highlight;
        if (hi) printed(function (fc, sc, dx, dy) {
          S('rect', { x: cx - 64 + dx, y: y1 - 80 + dy, width: 128, height: 50, rx: 25, fill: fc || PINK, stroke: sc || INK, 'stroke-width': 4 }, svg);
        }, 5, 5);
        T(svg, cx, y1 - 46, lab, { size: 28, weight: 700, fill: INK, cls: 'pp-steplbl' });
      });
    }
    // axes: fat black rules with fat heads
    S('path', { d: 'M' + x0 + ' ' + (y0 + 34) + ' V' + (y1 - 46), stroke: INK, 'stroke-width': 5, 'stroke-linecap': 'round', 'marker-end': head }, svg);
    if (!spec.illustrative) (spec.y.ticks || []).forEach(function (v) {
      S('path', { d: 'M' + (x0 - 16) + ' ' + Y(v) + ' H' + x0, stroke: INK, 'stroke-width': 5, 'stroke-linecap': 'round' }, svg);
      T(svg, x0 - 28, Y(v) + 12, String(v), { anchor: 'end', fill: INK, weight: 700 });
    });
    if (spec.y.title) T(svg, 46, (y0 + y1) / 2, spec.y.title, { weight: 700, fill: INK, rotate: -90 });
    S('path', { d: 'M' + (x0 - 34) + ' ' + y0 + ' H' + (x1 + 48), stroke: INK, 'stroke-width': 5, 'stroke-linecap': 'round', 'marker-end': head }, svg);
    (spec.illustrative && !spec.x.keepTicks ? [] : (spec.x.ticks || [])).forEach(function (v) {
      S('path', { d: 'M' + X(v) + ' ' + y0 + ' V' + (y0 + 16), stroke: INK, 'stroke-width': 5, 'stroke-linecap': 'round' }, svg);
      T(svg, X(v), y0 + 58, String(v), { fill: INK, weight: 700 });
    });
    if (spec.x.title) T(svg, (x0 + x1) / 2, y0 + 118, spec.x.title, { weight: 700, fill: INK });

    // series: an 8 px stroke with its own hard black copy behind it, and a direct end label in a printed pill
    spec.series.forEach(function (s, k) {
      var pts = s.points.filter(function (p) { return p[0] >= spec.x.min && p[0] <= spec.x.max; });
      if (!pts.length) return;
      var col = s.color || [INK, PINK, TEAL][k] || INK;
      var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); }).join(' ');
      if (col !== INK) S('path', { d: d, fill: 'none', stroke: INK, 'stroke-width': s.width || 8,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round', transform: 'translate(6,6)' }, svg);
      var pth = S('path', { d: d, fill: 'none', stroke: col, 'stroke-width': s.width || 8, 'stroke-linejoin': 'round',
        'stroke-linecap': 'round', pathLength: 1, 'data-anim': 'draw' }, svg);
      pth.style.setProperty('--d', (200 + k * 200) + 'ms');
      if (s.markers) pts.forEach(function (p) {
        S('circle', { cx: X(p[0]), cy: Y(p[1]), r: 11, fill: PAPER, stroke: INK, 'stroke-width': 5 }, svg);
      });
      var last = pts[pts.length - 1];
      if (s.name) {
        var w = s.name.length * 20 + 48;
        printed(function (fc, sc, dx, dy) {
          S('rect', { x: X(last[0]) + 24 + dx, y: Y(last[1]) - 32 + dy, width: w, height: 64, rx: 32,
            fill: fc || PAPER, stroke: sc || INK, 'stroke-width': 5 }, svg);
        }, 5, 5);
        T(svg, X(last[0]) + 24 + w / 2, Y(last[1]) + 12, s.name, { weight: 700, fill: col === PINK ? INK : col });
      }
    });
    // the marked moment: a dashed black drop line and a printed black pill
    if (spec.event) {
      var ex = X(spec.event.x), ey = Y(spec.event.y);
      S('path', { d: 'M' + ex + ' ' + (y1 + 76) + ' V' + y0, stroke: INK, 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-dasharray': '16 16' }, svg);
      var ew = Math.max(240, spec.event.label.length * 15 + 64);
      printed(function (fc, sc, dx, dy) {
        S('rect', { x: ex - ew / 2 + dx, y: y1 + dy, width: ew, height: 70, rx: 35, fill: fc || PINK, stroke: sc || INK, 'stroke-width': 5 }, svg);
      }, 5, 5);
      T(svg, ex, y1 + 46, spec.event.label, { size: 28, weight: 700, fill: INK, cls: 'pp-cap' });
      S('circle', { cx: ex, cy: ey, r: 16, fill: PAPER, stroke: INK, 'stroke-width': 7 }, svg);
    }
    if (note) T(svg, W - 8, H - 10, note, { size: 28, weight: 500, anchor: 'end', fill: MUTED, cls: 'pp-cap' });
  }

  whenReady(pageNumbers);
  window.PP = { version: '1.0', pageNumbers: pageNumbers };
  window.PPChart = { line: line, bar: bar };
})();
