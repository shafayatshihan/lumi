/* Violet Lime deck helpers (classic script; load after runtime.js and before your own slide scripts).
   - Page numbers: every <span class="vl-pageno"></span> becomes "03".
   - VL.grounds(): the ground must ALTERNATE (white / violet). Three slides in a row on the same ground is a fault,
     and this prints it to the console on load so you catch it before you look at the deck.
   - VLChart.dials / .years / .line / .bars: flat charts drawn straight on the slide's ground - no card, no shadow,
     no gradient, no legend. Exactly one mark is lime (`key: true`), and it is the slide's ONE lime thing.
   Every chart reads its ground from the slide: ink and violet on white, white on violet. Text inside a chart obeys
   the look's sizes - 30 px for names and end labels, 24 px for ticks, axis titles and the source line (.vl-tick /
   .vl-cap are the only chart texts below 30 px).
   Spec: .claude/skills/aura-slide/looks/_shared/LOOK-BASE.md section 5, then looks/violet-lime/LOOK.md section 4. */
(function () {
  'use strict';
  if (window.VL) return;
  var NS = 'http://www.w3.org/2000/svg';
  var VIOLET = '#3D2EE6', DEEP = '#2B1FB0', LIME = '#D2F53C', WHITE = '#FFFFFF';
  var INK = '#15151A', MUTED = '#5A5A66', HAIR = '#E4E3EF', VHAIR = 'rgba(255,255,255,.34)', VMUTED = '#D4D0F7';
  var FONT = '"Plus Jakarta Sans", Segoe UI, sans-serif';       // ONE typeface: maxTypefaces is 1
  var queue = [];
  var whenReady = function (fn) { if (document.readyState === 'loading') queue.push(fn); else fn(); };
  document.addEventListener('DOMContentLoaded', function () { while (queue.length) { try { queue.shift()(); } catch (e) { console.error(e); } } });

  /* the palette for the ground this holder sits on. The lime is the same on both: it is ALWAYS a field with ink on it. */
  function ground(el) {
    var dark = !!(el && el.closest && el.closest('.slide.on-violet'));
    return dark
      ? { dark: true, fg: WHITE, muted: VMUTED, rule: VHAIR, track: DEEP, key: LIME, keyInk: INK, series: [LIME, WHITE, VMUTED] }
      : { dark: false, fg: INK, muted: MUTED, rule: HAIR, track: HAIR, key: LIME, keyInk: INK, series: [VIOLET, INK, '#A9A9B8'] };
  }

  /* ------------------------------------------------------------------ page numbers */
  function pageNumbers() {
    var slides = Array.prototype.slice.call(document.querySelectorAll('.deck > .slide'));
    var pad = function (n) { return String(n).padStart(2, '0'); };
    slides.forEach(function (s, i) {
      s.querySelectorAll('.vl-pageno').forEach(function (el) {
        el.setAttribute('data-edit', 'no');
        el.textContent = pad(i + 1);
      });
    });
  }

  /* ------------------------------------------------------------------ the ground alternates (LOOK.md section 1)
     Returns the runs of three or more on one ground. Prints them, because the checker cannot see this: it is taste,
     and it is the rhythm the whole look rests on. */
  function grounds(quiet) {
    var slides = Array.prototype.slice.call(document.querySelectorAll('.deck > .slide'));
    var seq = slides.map(function (s) { return s.classList.contains('on-violet') ? 'violet' : 'white'; });
    var runs = [], start = 0;
    for (var i = 1; i <= seq.length; i++) {
      if (i === seq.length || seq[i] !== seq[start]) {
        if (i - start >= 3) runs.push({ ground: seq[start], from: start + 1, to: i, length: i - start });
        start = i;
      }
    }
    if (!quiet) {
      if (runs.length) runs.forEach(function (r) {
        console.warn('Violet Lime: slides ' + r.from + '-' + r.to + ' are all on ' + r.ground +
          ' (' + r.length + ' in a row). The ground alternates; a run of three is a fault - see LOOK.md section 1.');
      });
      else if (seq.length) console.info('Violet Lime: ground ' + seq.map(function (g) { return g === 'violet' ? 'V' : 'W'; }).join(' ') + ' - alternation is clean.');
    }
    return runs;
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
      'font-size': o.size || 30, 'font-weight': o.weight || 700, fill: o.fill || MUTED, 'letter-spacing': o.track || null,
      transform: o.rotate != null ? 'rotate(' + o.rotate + ' ' + x + ' ' + y + ')' : null }, parent);
    t.textContent = str; return t;
  }
  function dims(el) {
    var cs = getComputedStyle(el);
    var padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight), padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    return { W: Math.max(400, (el.clientWidth - padX) || 1000), H: Math.max(300, (el.clientHeight - padY) || 700) };
  }
  function noteOf(spec) { return [(spec.illustrative || spec.sample) ? 'illustrative' : null, spec.source || null].filter(Boolean).join(' · '); }
  function mount(holder, draw) {
    var el = typeof holder === 'string' ? document.querySelector(holder) : holder;
    if (el) whenReady(function () { el.setAttribute('data-edit', 'no'); el.setAttribute('data-visual', 'chart'); el.innerHTML = ''; draw(el, ground(el)); });
  }
  function svgOf(el, W, H, label) {
    var svg = S('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': label || '', class: 'vl-chart-svg' }, el);
    svg.style.display = 'block'; svg.style.overflow = 'visible';
    return svg;
  }
  function warnKeys(n, what) {
    if (n > 1) console.warn('Violet Lime: ' + n + ' ' + what + ' marked key - the lime marks exactly ONE thing per slide (LOOK.md section 1).');
  }

  /* ------------------------------------------------------------------ the dial row - this look's signature chart
     spec = { dials: [{ value: 77, label: 'held at load', key: true }, ...],   // 2-4; exactly one key
              max: 100, unit: '%', illustrative: false, source: '...' }
     A donut with the figure in the middle. The key dial's arc is lime; the others are the ground's own ink / white. */
  function dials(holder, spec) {
    mount(holder, function (el, G) {
      var d = dims(el), W = d.W, H = d.H;
      var list = spec.dials.slice(0, 4), n = list.length, note = noteOf(spec), max = spec.max != null ? spec.max : 100;
      warnKeys(list.filter(function (x) { return x.key; }).length, 'dials');
      var svg = svgOf(el, W, H, spec.label);
      var colW = W / n, cy = H * 0.42;
      var R = Math.min(colW * 0.36, H * 0.3), th = Math.max(18, R * 0.26);
      list.forEach(function (dl, i) {
        var cx = colW * (i + 0.5), frac = Math.max(0, Math.min(1, (dl.value || 0) / max));
        var col = dl.key ? LIME : G.series[1];
        S('circle', { cx: cx, cy: cy, r: R, fill: 'none', stroke: G.track, 'stroke-width': th }, svg);
        if (frac > 0) {
          var C = 2 * Math.PI * R;
          // the dasharray IS the value, so this cannot use data-anim="draw" (the runtime sets dasharray: 1 there).
          // It sweeps on its own dashoffset instead - see vlSweep in violet-lime.css.
          var arc = S('circle', { cx: cx, cy: cy, r: R, fill: 'none', stroke: col, 'stroke-width': th, 'stroke-linecap': 'round',
            'stroke-dasharray': (C * frac).toFixed(2) + ' ' + (C * (1 - frac) + 1).toFixed(2),
            'stroke-dashoffset': 0, class: 'vl-dial-arc',
            transform: 'rotate(-90 ' + cx + ' ' + cy + ')' }, svg);
          arc.style.setProperty('--c', (C * frac).toFixed(2));
          arc.style.setProperty('--d', (160 + i * 120) + 'ms');
        }
        // the figure inside: 48 px, the ground's own colour. On violet a lime figure is allowed at this size (6.2:1).
        if (!spec.illustrative) T(svg, cx, cy + 17, String(dl.value) + (spec.unit || ''), { size: 48, weight: 800, fill: G.fg, track: '-.035em' });
        if (dl.label) {
          var words = String(dl.label).split(' '), lines = [], line = '';
          words.forEach(function (w) {
            if ((line + ' ' + w).trim().length > 16) { lines.push(line.trim()); line = w; } else line = (line + ' ' + w).trim();
          });
          if (line) lines.push(line);
          lines.slice(0, 2).forEach(function (ln, k) { T(svg, cx, cy + R + 56 + k * 38, ln, { size: 30, weight: 700, fill: dl.key ? G.fg : G.muted }); });
        }
      });
      if (spec.title) T(svg, W / 2, H - (note ? 52 : 12), spec.title, { size: 24, weight: 500, fill: G.muted, cls: 'vl-tick' });
      if (note) T(svg, W - 2, H - 6, note, { size: 24, weight: 500, anchor: 'end', fill: G.muted, cls: 'vl-cap' });
    });
  }

  /* ------------------------------------------------------------------ the year line
     spec = { years: [{ year: '2019', note: 'first rig', side: 'up' | 'down', key: true }, ...] }   // 3-6
     A horizontal rule, a pill per year, the note above or below. Exactly one pill is lime. */
  function years(holder, spec) {
    mount(holder, function (el, G) {
      var d = dims(el), W = d.W, H = d.H;
      var list = spec.years.slice(0, 6), n = list.length, note = noteOf(spec);
      warnKeys(list.filter(function (x) { return x.key; }).length, 'year pills');
      var svg = svgOf(el, W, H, spec.label);
      var cy = H / 2, colW = W / n;
      S('path', { d: 'M0 ' + cy + ' H' + W, stroke: G.rule, 'stroke-width': 2 }, svg);
      list.forEach(function (y, i) {
        var cx = colW * (i + 0.5), up = y.side !== 'down';
        var label = String(y.year), w = Math.max(104, label.length * 15 + 58), h = 50;
        S('rect', { x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: h / 2, fill: y.key ? LIME : G.track }, svg);
        // 24 px is allowed here only because the year sits in bodyMinExempt as .vl-tick (hard-rules.json)
        T(svg, cx, cy + 9, label, { size: 24, weight: 700, fill: y.key ? INK : G.fg, cls: 'vl-tick' });
        if (y.note) {
          var words = String(y.note).split(' '), lines = [], line = '';
          words.forEach(function (wd) {
            if ((line + ' ' + wd).trim().length > 18) { lines.push(line.trim()); line = wd; } else line = (line + ' ' + wd).trim();
          });
          if (line) lines.push(line);
          lines = lines.slice(0, 3);
          var y0 = up ? cy - h / 2 - 34 - (lines.length - 1) * 40 : cy + h / 2 + 68;
          lines.forEach(function (ln, k) { T(svg, cx, y0 + k * 40, ln, { size: 30, weight: y.key ? 700 : 500, fill: y.key ? G.fg : G.muted }); });
          S('path', { d: 'M' + cx + ' ' + (up ? cy - h / 2 - 8 : cy + h / 2 + 8) + ' V' + (up ? cy - h / 2 - 24 : cy + h / 2 + 24),
            stroke: G.rule, 'stroke-width': 2, 'stroke-linecap': 'round' }, svg);
        }
      });
      if (note) T(svg, W - 2, H - 6, note, { size: 24, weight: 500, anchor: 'end', fill: G.muted, cls: 'vl-cap' });
    });
  }

  /* ------------------------------------------------------------------ the line chart
     spec = { x: {min,max,ticks,title}, y: {min,max,ticks,title}, series: [{name, points, markers, key}], <= 3,
              band: {from,to}, event: {x,y,label}, illustrative, source } */
  function line(holder, spec) {
    mount(holder, function (el, G) {
      var d = dims(el), W = d.W, H = d.H;
      var longest = 0;
      spec.series.forEach(function (s) { longest = Math.max(longest, (s.name || '').length); });
      var note = noteOf(spec);
      var pad = { l: 118, r: Math.min(300, 70 + longest * 18), t: 40, b: note ? 150 : 110 };
      var x0 = pad.l, x1 = W - pad.r, y0 = H - pad.b, y1 = pad.t;
      var X = function (v) { return x0 + (v - spec.x.min) / (spec.x.max - spec.x.min) * (x1 - x0); };
      var Y = function (v) { return y0 - (v - spec.y.min) / (spec.y.max - spec.y.min) * (y0 - y1); };
      var svg = svgOf(el, W, H, spec.label);
      if (spec.band) S('rect', { x: X(spec.band.from), y: y1, width: X(spec.band.to) - X(spec.band.from), height: y0 - y1,
        fill: LIME, opacity: G.dark ? 0.16 : 0.22 }, svg);
      spec.y.ticks.forEach(function (v) { S('path', { d: 'M' + x0 + ' ' + Y(v) + ' H' + x1, stroke: G.rule, 'stroke-width': 2 }, svg); });
      S('path', { d: 'M' + x0 + ' ' + y0 + ' H' + x1, stroke: G.fg, 'stroke-width': 3, 'stroke-linecap': 'round' }, svg);
      if (!spec.illustrative) spec.y.ticks.forEach(function (v) { T(svg, x0 - 22, Y(v) + 8, String(v), { anchor: 'end', size: 24, weight: 500, fill: G.fg, cls: 'vl-tick' }); });
      if (spec.y.title) T(svg, 22, (y0 + y1) / 2, spec.y.title, { size: 24, weight: 500, fill: G.muted, rotate: -90, cls: 'vl-tick' });
      (spec.illustrative && !spec.x.keepTicks ? [] : spec.x.ticks).forEach(function (v) { T(svg, X(v), y0 + 44, String(v), { size: 24, weight: 500, fill: G.fg, cls: 'vl-tick' }); });
      if (spec.x.title) T(svg, (x0 + x1) / 2, y0 + 88, spec.x.title, { size: 24, weight: 500, fill: G.muted, cls: 'vl-tick' });
      warnKeys(spec.series.filter(function (s) { return s.key; }).length, 'series');
      spec.series.slice(0, 3).forEach(function (s, k) {
        var pts = s.points.filter(function (p) { return p[0] >= spec.x.min && p[0] <= spec.x.max; });
        if (!pts.length) return;
        var isKey = s.key != null ? !!s.key : k === 0;
        var col = isKey ? LIME : G.series[k === 0 ? 1 : k];
        if (isKey && !G.dark) col = VIOLET;                 // lime on white is 1.2:1 - a line is not a field
        var dd = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); }).join(' ');
        var pth = S('path', { d: dd, fill: 'none', stroke: col, 'stroke-width': s.width || 7, 'stroke-linejoin': 'round',
          'stroke-linecap': 'round', pathLength: 1, 'data-anim': 'draw' }, svg);
        pth.style.setProperty('--d', (200 + k * 200) + 'ms');
        if (s.markers) pts.forEach(function (p) { S('circle', { cx: X(p[0]), cy: Y(p[1]), r: 10, fill: col, stroke: G.dark ? VIOLET : WHITE, 'stroke-width': 4 }, svg); });
        var last = pts[pts.length - 1];
        if (s.name) {
          var w = s.name.length * 16 + 44;
          S('rect', { x: X(last[0]) + 20, y: Y(last[1]) - 26, width: w, height: 52, rx: 26, fill: isKey ? LIME : G.track }, svg);
          T(svg, X(last[0]) + 20 + w / 2, Y(last[1]) + 9, s.name, { weight: 700, fill: isKey ? INK : G.fg });
        }
      });
      if (spec.event) {
        var ex = X(spec.event.x), ey = Y(spec.event.y);
        S('path', { d: 'M' + ex + ' ' + (y1 + 62) + ' V' + y0, stroke: G.rule, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-dasharray': '2 12' }, svg);
        var ew = Math.max(200, spec.event.label.length * 15 + 48);
        S('rect', { x: ex - ew / 2, y: y1, width: ew, height: 52, rx: 26, fill: G.fg }, svg);
        T(svg, ex, y1 + 34, spec.event.label, { size: 24, weight: 500, fill: G.dark ? VIOLET : WHITE, cls: 'vl-cap' });
        S('circle', { cx: ex, cy: ey, r: 13, fill: G.dark ? VIOLET : WHITE, stroke: G.fg, 'stroke-width': 5 }, svg);
      }
      if (note) T(svg, W - 4, H - 6, note, { size: 24, weight: 500, anchor: 'end', fill: G.muted, cls: 'vl-cap' });
    });
  }

  /* ------------------------------------------------------------------ the bar chart
     spec = { bars: [{name, value, key}], max, ticks, unit, title, illustrative, source }   // <= 6 bars, one key */
  function bars(holder, spec) {
    mount(holder, function (el, G) {
      var d = dims(el), W = d.W, H = d.H;
      var note = noteOf(spec), list = spec.bars.slice(0, 6), n = list.length, longest = 0;
      list.forEach(function (b) { longest = Math.max(longest, (b.name || '').length); });
      warnKeys(list.filter(function (b) { return b.key; }).length, 'bars');
      var pad = { l: Math.min(380, 40 + longest * 17), r: 150, t: 20, b: note ? 140 : 100 };
      var x0 = pad.l, x1 = W - pad.r, y0 = H - pad.b, y1 = pad.t;
      var max = spec.max != null ? spec.max : Math.max.apply(null, list.map(function (b) { return b.value; }));
      var X = function (v) { return x0 + v / max * (x1 - x0); };
      var row = (y0 - y1) / n, th = Math.min(54, row * 0.5);
      var svg = svgOf(el, W, H, spec.label);
      (spec.ticks || []).forEach(function (v) {
        S('path', { d: 'M' + X(v) + ' ' + y1 + ' V' + y0, stroke: G.rule, 'stroke-width': 2 }, svg);
        if (!spec.illustrative) T(svg, X(v), y0 + 40, String(v), { size: 24, weight: 500, fill: G.fg, cls: 'vl-tick' });
      });
      S('path', { d: 'M' + x0 + ' ' + y1 + ' V' + y0, stroke: G.fg, 'stroke-width': 3, 'stroke-linecap': 'round' }, svg);
      list.forEach(function (b, i) {
        var cy = y1 + row * (i + 0.5);
        S('rect', { x: x0, y: cy - th / 2, width: x1 - x0, height: th, rx: th / 2, fill: G.track }, svg);
        var r = S('rect', { x: x0, y: cy - th / 2, width: Math.max(th, X(b.value) - x0), height: th, rx: th / 2,
          fill: b.key ? LIME : G.series[1], 'data-anim': 'grow-x' }, svg);
        r.style.transformOrigin = x0 + 'px ' + cy + 'px';
        r.style.setProperty('--d', (200 + i * 90) + 'ms');
        T(svg, x0 - 22, cy + 10, b.name, { anchor: 'end', weight: 700, fill: G.fg });
        if (!spec.illustrative) T(svg, X(b.value) + 18, cy + 10, b.value + (spec.unit || ''), { anchor: 'start', weight: 800, fill: G.fg });
      });
      if (spec.title) T(svg, (x0 + x1) / 2, y0 + 84, spec.title, { size: 24, weight: 500, fill: G.muted, cls: 'vl-tick' });
      if (note) T(svg, W - 4, H - 6, note, { size: 24, weight: 500, anchor: 'end', fill: G.muted, cls: 'vl-cap' });
    });
  }

  whenReady(pageNumbers);
  whenReady(function () { grounds(false); });
  window.VL = { version: '1.0', pageNumbers: pageNumbers, grounds: grounds, ground: ground };
  window.VLChart = { line: line, bars: bars, dials: dials, years: years };
})();
