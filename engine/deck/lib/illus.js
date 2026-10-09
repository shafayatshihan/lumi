/* Lumi illustration engine - the non-3D 30 % of the picture mix, drawn as inline SVG.
   Load after runtime.js, before the look's own helpers. Spec: .claude/skills/aura-slide/illustration.md
   and LOOK-BASE.md section 4.12; each look's drawing surface is in its LOOK.md "The illustration idiom".

   Why SVG and not a canvas or an image: it packs into the one offline HTML file, it is crisp at any stage
   size and in the PDF, its <text> is real text so deck_check.js measures its size and contrast like any other
   text on the slide, and a person can read it and correct it. No raster, no generated images, no network.

   An illustration drawn here is STILL. It registers no scene, declares no period and never reads a clock, so
   the capture contract (LOOK-BASE 4.3) has nothing to hold it to and ?still / the PDF / the recorder get the
   same frame the audience sees.

   Credits, both MIT and both required to stay:
     - the layout taxonomy (comparison / progression / hierarchy / matrix / cycle / part-to-whole / hub / breakdown)
       is adapted from baoyu-infographic by 宝玉 (JimLiu), https://github.com/JimLiu/baoyu-skills - ported here as
       composition guidance for SVG we draw ourselves, not as prompts for an image generator;
     - the "inline SVG inside the HTML, no external tools, no rendering library" pattern is from
       architecture-diagram by Cocoon AI, https://github.com/Cocoon-AI/architecture-diagram-generator. */
(function () {
  'use strict';
  if (window.LumiIllus) return;
  const NS = 'http://www.w3.org/2000/svg';
  const html = document.documentElement;
  let uid = 0;

  const queue = [];
  const whenReady = fn => { if (document.readyState === 'loading') queue.push(fn); else fn(); };
  document.addEventListener('DOMContentLoaded', () => { while (queue.length) { try { queue.shift()(); } catch (e) { console.error(e); } } });

  /* ---------------------------------------------------------------- the look's drawing surface
     Structure is shared; only the surface differs. `floor` is the look's own minimum text size from
     hard-rules.json (bodyMinPx), `cap` the size its exempt captions are allowed to use. Colours are read
     from the theme's CSS variables where one exists, so a theme edit reaches the drawing with it. */
  const LOOKS = {
    'bold-blue': { weight: 3, outline: 'var(--ink)', radius: 16, floor: 28, cap: 20, capClass: 'bb-cap',
      fills: { hero: 'var(--accent)', body: 'var(--surface)', context: 'var(--bg-stage)', signal: 'var(--hot)', paper: 'var(--bg)' },
      font: 'var(--font-display)', mono: 'var(--font-mono)', shadow: 'soft', texture: null, outlineAll: false },
    'clay-pop': { weight: 0, outline: 'var(--ink)', radius: 28, floor: 30, cap: 24, capClass: 'cp-cap',
      fills: { hero: 'var(--clay)', body: 'var(--surface)', context: 'var(--groove)', signal: 'var(--clay-lo)', paper: 'var(--bg)', mark: 'var(--clay-top)' },
      font: 'var(--font-display)', mono: 'var(--font-mono)', shadow: 'clay', texture: 'clay', outlineAll: false },
  };
  const GENERIC = { weight: 3, outline: '#2D2C2B', radius: 16, floor: 28, cap: 26, capClass: null,
    fills: { hero: '#2D2C2B', body: '#FFFFFF', context: '#EFEBE6', signal: '#E23B00', paper: '#F9F4F2' },
    font: 'inherit', mono: 'monospace', shadow: 'none', texture: null, outlineAll: true };

  const lookSlug = () => (html.getAttribute('data-look') || getComputedStyle(html).getPropertyValue('--aura-look') || '').trim().toLowerCase();
  const look = () => LOOKS[lookSlug()] || GENERIC;

  /* ---------------------------------------------------------------- colour: pick the readable ink
     Text on a filled shape takes whichever of the look's ink and white has the higher contrast on it, measured,
     so a label inside a hero shape cannot fail the contrast pass the way a guessed colour can. */
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:0;height:0';
  function resolve(c) {                                   // 'var(--accent)' or '#005AE0' -> 'rgb(0, 90, 224)'
    if (!c) return 'rgb(0, 0, 0)';
    if (!probe.isConnected) (document.body || html).appendChild(probe);
    probe.style.color = ''; probe.style.color = c;
    const v = getComputedStyle(probe).color;
    return v || 'rgb(0, 0, 0)';
  }
  function lum(c) {
    const m = /(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)/.exec(resolve(c));
    if (!m) return 0;
    const f = v => { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(+m[1]) + 0.7152 * f(+m[2]) + 0.0722 * f(+m[3]);
  }
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  /* ---------------------------------------------------------------- element helpers */
  function S(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const rounded = (x, y, w, h, r) => `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}` +
    `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
  const polyD = pts => pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join('') + 'Z';

  /* ---------------------------------------------------------------- the figure */
  function figure(holder, opts) {
    opts = opts || {};
    if (typeof holder === 'string') holder = document.querySelector(holder);
    if (!holder) { console.error('LumiIllus: no holder'); return null; }
    const L = look(), id = 'li' + (++uid);
    const cs = getComputedStyle(holder);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    // viewBox units ARE stage px: a font-size written here is the size deck_check measures.
    const W = Math.max(320, opts.w || (holder.clientWidth - padX) || 900);
    const H = Math.max(240, opts.h || (holder.clientHeight - padY) || 700);

    holder.innerHTML = '';
    holder.setAttribute('data-edit', 'no');
    if (!holder.hasAttribute('data-visual')) holder.setAttribute('data-visual', 'diagram');   // the slide's ONE main visual
    const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'lumi-illus', role: 'img',
      'aria-label': opts.label || opts.alt || 'illustration' }, holder);
    svg.style.display = 'block';
    const defs = S('defs', {}, svg);
    const layers = {};
    ['back', 'link', 'body', 'front', 'label'].forEach(n => { layers[n] = S('g', { 'data-layer': n }, svg); });

    /* arrowhead, hard shadow, soft shadow, clay light, halftone - made once, only if used */
    const made = {};
    function head(colour) {
      const k = 'h' + colour.replace(/\W/g, '');
      if (!made[k]) {
        const m = S('marker', { id: id + k, viewBox: '0 0 10 10', refX: 8.4, refY: 5, markerWidth: 5.2, markerHeight: 5.2,
          orient: 'auto-start-reverse', markerUnits: 'strokeWidth' }, defs);
        S('path', { d: 'M0 0.6L10 5L0 9.4Z', fill: colour }, m);
        made[k] = true;
      }
      return `url(#${id}h${colour.replace(/\W/g, '')})`;
    }
    function softShadow() {
      if (!made.soft) { const f = S('filter', { id: id + 'soft', x: '-25%', y: '-25%', width: '150%', height: '160%' }, defs);
        S('feDropShadow', { dx: 0, dy: 14, stdDeviation: 14, 'flood-color': L.outline, 'flood-opacity': 0.14 }, f); made.soft = true; }
      return `url(#${id}soft)`;
    }
    function halftone(colour) {
      const k = 'ht' + colour.replace(/\W/g, '');
      if (!made[k]) { const p = S('pattern', { id: id + k, width: 14, height: 14, patternUnits: 'userSpaceOnUse' }, defs);
        S('circle', { cx: 7, cy: 7, r: 3.1, fill: colour }, p); made[k] = true; }
      return `url(#${id}${k})`;
    }
    function clayFace(colour) {
      const k = 'cf' + colour.replace(/\W/g, '');
      if (!made[k]) { const g = S('linearGradient', { id: id + k, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
        S('stop', { offset: 0, 'stop-color': 'var(--clay-hi)' }, g);
        S('stop', { offset: 0.52, 'stop-color': colour }, g);
        S('stop', { offset: 1, 'stop-color': 'var(--clay-lo)' }, g);
        made[k] = true; }
      return `url(#${id}${k})`;
    }

    const F = {
      svg, defs, W, H, look: L, slug: lookSlug(), holder,
      layer: n => layers[n] || layers.body,
      el: S,
      claims: [],
      pad: Math.round(Math.min(W, H) * 0.06),
    };

    /* ------------------------------------------------- a drawn part */
    // shape: { rect:[x,y,w,h,r?] } | { circle:[cx,cy,r] } | { poly:[[x,y],..] } | { path:'M..' }
    // o.role: hero | body | context | signal | paper | mark ; o.into: layer name ; o.dashed ; o.weight ; o.texture
    F.part = function (shape, o) {
      o = o || {};
      const g = S('g', { class: o.class || null }, F.layer(o.into || 'body'));
      const fill = o.fill || L.fills[o.role || 'body'] || L.fills.body;
      const stroke = o.stroke != null ? o.stroke : ((L.outlineAll || o.outline) ? L.outline : null);
      const weight = o.weight != null ? o.weight : L.weight;
      let d = shape.path || null, tag = 'path', attrs = {};
      if (shape.rect) { const r = shape.rect; d = rounded(r[0], r[1], r[2], r[3], r[4] != null ? r[4] : L.radius); }
      else if (shape.poly) d = polyD(shape.poly);
      else if (shape.circle) { tag = 'circle'; attrs = { cx: shape.circle[0], cy: shape.circle[1], r: shape.circle[2] }; }
      // the look's own surface, behind the shape
      if (L.shadow === 'hard' && o.lift !== false) {
        const sh = tag === 'circle' ? S('circle', Object.assign({}, attrs, { fill: L.outline }), g)
          : S('path', { d, fill: L.outline }, g);
        sh.setAttribute('transform', 'translate(8 8)');
      }
      const node = tag === 'circle' ? S('circle', Object.assign({}, attrs, { fill: fill }), g) : S('path', { d, fill }, g);
      if (L.shadow === 'soft' && o.lift !== false) node.setAttribute('filter', softShadow());
      if (L.shadow === 'clay' && o.lift !== false && (o.role === 'hero' || o.role === 'signal')) node.setAttribute('fill', clayFace(fill));
      if (stroke && weight) { node.setAttribute('stroke', stroke); node.setAttribute('stroke-width', weight);
        node.setAttribute('stroke-linejoin', 'round');
        if (o.dashed) node.setAttribute('stroke-dasharray', (weight * 3) + ' ' + (weight * 2.6)); }
      // the texture that says which look this is, over the fill and under the line
      const tex = o.texture !== undefined ? o.texture : L.texture;
      if (tex === 'halftone' && o.role === 'context') {
        const t = tag === 'circle' ? S('circle', Object.assign({}, attrs, { fill: halftone(L.outline), opacity: 0.22 }), g)
          : S('path', { d, fill: halftone(L.outline), opacity: 0.22 }, g);
        t.setAttribute('pointer-events', 'none');
      }
      g._fill = fill; g._node = node;
      return g;
    };

    /* ------------------------------------------------- text
       Every word in the drawing is a real <text>, sized in stage px and never below the look's floor:
       deck_check.js measures it exactly as it measures a headline. */
    F.text = function (x, y, str, o) {
      o = o || {};
      const isCap = o.role === 'cap';
      let size = o.size || (isCap ? L.cap : o.role === 'lead' ? Math.round(L.floor * 1.6) : L.floor);
      const floor = isCap ? L.cap : L.floor;
      if (size < floor) { console.warn('LumiIllus: "' + str + '" asked for ' + size + 'px, raised to the look floor ' + floor + 'px'); size = floor; }
      const anchor = o.anchor || 'middle';
      const m = Math.max(8, size * 0.5);
      x = Math.min(Math.max(x, anchor === 'start' ? m : m / 2), W - (anchor === 'end' ? m : m / 2));
      y = Math.min(Math.max(y, size * 0.9), H - size * 0.35);
      const on = o.on || null;                         // the fill this text sits on, so the ink is the readable one
      const fill = o.fill || (on ? (ratio(L.outline, on) >= ratio('#FFFFFF', on) ? L.outline : '#FFFFFF') : L.outline);
      const cls = [o.class, isCap && L.capClass ? L.capClass : null].filter(Boolean).join(' ') || null;
      const t = S('text', { x, y, class: cls, 'text-anchor': anchor, 'font-family': o.mono ? L.mono : L.font,
        'font-size': size, 'font-weight': o.weight || (o.role === 'lead' ? 700 : 600), fill,
        transform: o.rotate != null ? `rotate(${o.rotate} ${x} ${y})` : null }, F.layer(o.into || 'label'));
      t.textContent = str;
      if (o.edit) t.setAttribute('data-edit', o.edit);
      return t;
    };

    /* a number in the drawing. `kind` is the provenance kind it will be declared under (LOOK-BASE 4.7 / claims.js):
       source | published | computed | figure | scan | illustrative. It is recorded so the build can check the
       drawing's numbers are in provenance.json, and an undeclared one is called out in the console at once. */
    F.value = function (x, y, str, o) {
      o = o || {};
      if (!o.kind) console.error('LumiIllus.value("' + str + '"): no kind. Every number in a drawing is traced (LOOK-BASE 6).');
      F.claims.push({ text: String(str), kind: o.kind || null });
      if (o.kind === 'illustrative') F._illustrative = true;
      const t = F.text(x, y, str, Object.assign({ mono: true }, o));
      t.setAttribute('data-claim-kind', o.kind || 'undeclared');
      return t;
    };

    /* ------------------------------------------------- marks */
    F.line = function (a, b, o) {
      o = o || {};
      return S('path', { d: `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`, fill: 'none', stroke: o.colour || L.outline,
        'stroke-width': o.weight || Math.max(2, L.weight || 3), 'stroke-linecap': 'round',
        'stroke-dasharray': o.dashed ? '10 12' : null, opacity: o.opacity || null }, F.layer(o.into || 'link'));
    };
    F.arrow = function (a, b, o) {
      o = o || {};
      const colour = o.colour || L.outline;
      const p = F.line(a, b, Object.assign({ colour }, o));
      p.setAttribute('marker-end', head(colour));
      if (o.both) p.setAttribute('marker-start', head(colour));
      return p;
    };
    // a dimension line with its real number: the look-neutral way to put a size on a drawing
    F.dim = function (a, b, str, o) {
      o = o || {};
      const g = F.arrow(a, b, { colour: o.colour || L.outline, both: true, weight: 2, into: 'front' });
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const vertical = Math.abs(b[0] - a[0]) < Math.abs(b[1] - a[1]);
      const side = o.side || 'end';                    // which side of a vertical dimension the number sits on
      F.value(mx + (vertical ? (side === 'start' ? 14 : -14) : 0), my + (vertical ? L.cap * 0.35 : -14), str,
        Object.assign({ role: 'cap', anchor: vertical ? side : 'middle' }, o));
      return g;
    };
    // a numbered callout that names a part: a leader from the part to a disc and a word
    F.callout = function (from, at, n, str, o) {
      o = o || {};
      const r = Math.round(L.floor * 0.78);
      // the leader stops at the disc's edge, and the word goes on the side the leader does NOT come from, so the
      // two never cross - a crossing is a contrast failure in any look with a heavy line
      const dx = from[0] - at[0], dy = from[1] - at[1], d = Math.hypot(dx, dy) || 1;
      F.line(from, [at[0] + dx / d * (r + 2), at[1] + dy / d * (r + 2)], { weight: 2, into: 'front' });
      F.part({ circle: [at[0], at[1], r] }, { role: o.role || 'hero', into: 'front', lift: false });
      F.text(at[0], at[1] + r * 0.36, String(n), { size: L.floor, on: L.fills[o.role || 'hero'], weight: 700 });
      const left = o.anchor ? o.anchor === 'end' : dx > 0;
      if (str) F.text(at[0] + (left ? -(r + 16) : r + 16), at[1] + r * 0.36, str, { anchor: left ? 'end' : 'start', size: o.size || L.floor });
    };
    // the one-line caption at the foot of the drawing: "illustrative", a source, a scale
    F.note = function (str) {
      return F.text(W - 4, H - 6, str, { role: 'cap', anchor: 'end' });
    };
    // a scale cue: a bar of known length with its number
    F.scaleBar = function (x, y, len, str, o) {
      o = o || {};
      F.line([x, y], [x + len, y], { weight: Math.max(3, L.weight || 3), into: 'front' });
      F.line([x, y - 10], [x, y + 10], { weight: Math.max(3, L.weight || 3), into: 'front' });
      F.line([x + len, y - 10], [x + len, y + 10], { weight: Math.max(3, L.weight || 3), into: 'front' });
      F.value(x + len / 2, y - 18, str, Object.assign({ role: 'cap' }, o));
    };
    // a cut surface: the honest way to show the inside of a thing
    F.hatch = function (shape, o) {
      o = o || {};
      if (!made.hatch) { const p = S('pattern', { id: id + 'hatch', width: 16, height: 16, patternUnits: 'userSpaceOnUse',
        patternTransform: 'rotate(45)' }, defs);
        S('path', { d: 'M0 0V16', stroke: L.outline, 'stroke-width': 3, opacity: 0.55 }, p); made.hatch = true; }
      return F.part(shape, Object.assign({ fill: `url(#${id}hatch)` }, o));
    };

    /* ------------------------------------------------- the layout vocabulary
       Adapted from the baoyu-infographic layout taxonomy (宝玉 / JimLiu, MIT). Each one returns the slots it
       made - { x, y, w, h, cx, cy } in stage px - and draws only the layout's own furniture: the rail, the
       spokes, the arrows between states. What goes IN a slot is the subject, drawn from its real anatomy. */

    // binary-comparison: both things whole, side by side, same size, same staging (LOOK-BASE S5)
    F.compare = function (o) {
      o = o || {};
      const pad = o.pad != null ? o.pad : F.pad, gap = o.gap != null ? o.gap : Math.round(W * 0.06);
      const top = pad + (o.titles ? L.floor * 1.6 : 0), bot = H - pad - (o.captions ? L.floor * 1.6 : 0);
      const cw = (W - pad * 2 - gap) / 2, ch = bot - top;
      const slots = [0, 1].map(i => { const x = pad + i * (cw + gap);
        return { x, y: top, w: cw, h: ch, cx: x + cw / 2, cy: top + ch / 2 }; });
      if (o.titles) slots.forEach((s, i) => F.text(s.cx, top - L.floor * 0.5, o.titles[i], { weight: 700 }));
      if (o.captions) slots.forEach((s, i) => F.text(s.cx, bot + L.cap * 1.5, o.captions[i], { role: 'cap' }));
      if (o.divider !== false) F.line([W / 2, top], [W / 2, bot], { dashed: true, weight: 2, opacity: 0.45 });
      return slots;
    };

    // linear-progression: LOOK-BASE S4 says a sequence CLIMBS. n stations rising left to right, goal at the top.
    F.progression = function (n, o) {
      o = o || {};
      const pad = F.pad, climb = o.climb !== false;
      const bw = (W - pad * 2) / n, rise = climb ? (H - pad * 2) * 0.52 : 0;
      const slots = [];
      for (let i = 0; i < n; i++) {
        const x = pad + i * bw, h = Math.min(bw * 0.8, (H - pad * 2) - rise);
        const y = H - pad - h - (climb ? rise * (i / Math.max(1, n - 1)) : 0);
        slots.push({ x: x + bw * 0.08, y, w: bw * 0.84, h, cx: x + bw / 2, cy: y + h / 2, i });
      }
      for (let i = 1; i < n; i++) {
        const a = slots[i - 1], b = slots[i];
        F.arrow([a.x + a.w, a.cy], [b.x - 8, b.cy], { weight: Math.max(2, (L.weight || 3) - 1) });
      }
      if (o.numbers !== false) slots.forEach((s, i) => {
        const r = Math.round(L.floor * 0.72);
        F.part({ circle: [s.x + r, s.y - r * 0.4, r] }, { role: o.done && i < o.done ? 'hero' : 'context', into: 'front', lift: false });
        F.text(s.x + r, s.y - r * 0.4 + r * 0.36, String(i + 1), { size: L.floor, on: o.done && i < o.done ? L.fills.hero : L.fills.context, weight: 700 });
      });
      if (o.labels) slots.forEach((s, i) => F.text(s.cx, s.y + s.h + L.floor * 1.1, o.labels[i], { role: 'cap' }));
      return slots;
    };

    // hierarchical-layers: stacked bands, widest at the base when `pyramid`
    F.layers = function (n, o) {
      o = o || {};
      const pad = F.pad, gap = 14, bh = (H - pad * 2 - gap * (n - 1)) / n, slots = [];
      for (let i = 0; i < n; i++) {
        const k = o.pyramid ? 0.42 + 0.58 * (i / Math.max(1, n - 1)) : 1;
        const w = (W - pad * 2) * k, x = (W - w) / 2, y = pad + i * (bh + gap);
        slots.push({ x, y, w, h: bh, cx: x + w / 2, cy: y + bh / 2, i });
      }
      return slots;
    };

    // comparison-matrix: a grid with a header row and a header column
    F.matrix = function (rows, cols, o) {
      o = o || {};
      const pad = F.pad, hw = o.rowLabels ? (W - pad * 2) * 0.26 : 0, hh = o.colLabels ? L.floor * 2 : 0;
      const cw = (W - pad * 2 - hw) / cols, ch = (H - pad * 2 - hh) / rows, cells = [];
      if (o.colLabels) for (let c = 0; c < cols; c++) F.text(pad + hw + cw * (c + 0.5), pad + L.floor, o.colLabels[c], { weight: 700 });
      if (o.rowLabels) for (let r = 0; r < rows; r++) F.text(pad, pad + hh + ch * (r + 0.5) + L.floor * 0.35, o.rowLabels[r], { anchor: 'start' });
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const x = pad + hw + c * cw, y = pad + hh + r * ch;
        cells.push({ x: x + 6, y: y + 6, w: cw - 12, h: ch - 12, cx: x + cw / 2, cy: y + ch / 2, r, c });
      }
      return cells;
    };

    // circular-flow: n slots on a ring, each arrow drawn along the ring in the direction the process runs
    F.cycle = function (n, o) {
      o = o || {};
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - F.pad - (o.slot || 70);
      const slots = [];
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + i * 2 * Math.PI / n;
        const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a), s = o.slot || 70;
        slots.push({ x: x - s, y: y - s, w: s * 2, h: s * 2, cx: x, cy: y, angle: a, i });
      }
      for (let i = 0; i < n; i++) {
        const a0 = -Math.PI / 2 + (i + 0.26) * 2 * Math.PI / n, a1 = -Math.PI / 2 + (i + 0.74) * 2 * Math.PI / n;
        const p = S('path', { d: `M${cx + R * Math.cos(a0)} ${cy + R * Math.sin(a0)}A${R} ${R} 0 0 1 ${cx + R * Math.cos(a1)} ${cy + R * Math.sin(a1)}`,
          fill: 'none', stroke: L.outline, 'stroke-width': Math.max(2, (L.weight || 3) - 1), 'stroke-linecap': 'round' }, F.layer('link'));
        p.setAttribute('marker-end', head(L.outline));
      }
      return slots;
    };

    // part-to-whole: one bar of the whole, cut into its real parts. Every share is a number, so each is a claim.
    F.whole = function (parts, o) {
      o = o || {};
      const pad = F.pad, y = o.y != null ? o.y : H / 2 - 60, h = o.h || 120;
      const total = parts.reduce((s, p) => s + p.share, 0) || 1;
      let x = pad; const slots = [];
      parts.forEach((p, i) => {
        const w = (W - pad * 2) * p.share / total;
        F.part({ rect: [x, y, w, h, i === 0 || i === parts.length - 1 ? L.radius : 0] },
          { role: p.role || (i === 0 ? 'hero' : 'context'), lift: i === 0 });
        if (p.label) F.text(x + w / 2, y + h / 2 + L.floor * 0.35, p.label, { on: L.fills[p.role || (i === 0 ? 'hero' : 'context')] });
        slots.push({ x, y, w, h, cx: x + w / 2, cy: y + h / 2 });
        x += w;
      });
      return slots;
    };

    // hub-spoke: a centre with n things around it
    F.hub = function (n, o) {
      o = o || {};
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - F.pad - (o.slot || 64);
      const hubR = o.hubR || Math.min(W, H) * 0.16, slots = [];
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + i * 2 * Math.PI / n, s = o.slot || 64;
        const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
        F.line([cx + hubR * Math.cos(a), cy + hubR * Math.sin(a)], [x - s * 0.72 * Math.cos(a), y - s * 0.72 * Math.sin(a)], { weight: 2 });
        slots.push({ x: x - s, y: y - s, w: s * 2, h: s * 2, cx: x, cy: y, angle: a, i });
      }
      return { hub: { cx, cy, r: hubR }, slots };
    };

    // structural-breakdown: the exploded view - the parts of one object, pulled apart along an axis, in order
    F.breakdown = function (n, o) {
      o = o || {};
      const pad = F.pad, vertical = o.axis !== 'x';
      const span = (vertical ? H : W) - pad * 2, step = span / n, slots = [];
      for (let i = 0; i < n; i++) {
        const a = pad + i * step;
        slots.push(vertical
          ? { x: pad, y: a, w: W - pad * 2, h: step * 0.78, cx: W / 2, cy: a + step * 0.39, i }
          : { x: a, y: pad, w: step * 0.78, h: H - pad * 2, cx: a + step * 0.39, cy: H / 2, i });
      }
      for (let i = 1; i < n; i++) {                       // the dashed guide that says "this goes there"
        const a = slots[i - 1], b = slots[i];
        F.line(vertical ? [a.cx, a.y + a.h] : [a.x + a.w, a.cy], vertical ? [b.cx, b.y] : [b.x, b.cy], { dashed: true, weight: 2 });
      }
      return slots;
    };

    return F;
  }

  /* draw once the holder has its layout; the handle is returned to the caller through fn */
  function draw(target, fn, opts) {
    whenReady(() => {
      const els = typeof target === 'string' ? document.querySelectorAll(target) : [target];
      els.forEach(el => { const F = figure(el, opts); if (F) { try { fn(F); } catch (e) { console.error('LumiIllus draw:', e); } } });
    });
  }

  window.LumiIllus = { version: '1.0', figure, draw, look, LOOKS };
})();
