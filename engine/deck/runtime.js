/* Lumi deck runtime (classic script, no dependencies).

   ==================================================================================================================
   CAPTURE CONTRACT (shared with the finalize recorder; keep it exactly as written here)
   ------------------------------------------------------------------------------------------------------------------
   1. Registration. Every animated piece declares its loop period in seconds when it is defined:
        Aura.scene('id', setup, { period: 12 })      or  <div class="aura-3d" data-scene="id" data-period="12">
        Aura.canvas('id', setup, { period: 6 })      (2D canvas loops work the same way)
      period 0 means "still": the scene does not move and one frame is enough. A scene must be periodic:
      update(t + period) draws exactly what update(t) draws (closed-form functions of t, or BBPhys.loop for
      simulations). update(t) never depends on wall-clock time, Math.random() or the previous frame.
   2. ?capture. The deck sets
        window.LumiCapture = { ready: Promise, slides: { <1-based n>: { period, seek: async t => {}, rect, holder } } }
      ready resolves (to the same object) once fonts are loaded and every slide is registered. Every slide holding an
      .aura-3d / .aura-canvas piece with a period gets an entry (the slide's period is the longest of its pieces).
      seek(t) makes slide n current (no entrance motion, no chrome, slide at scale 1 at the window's top-left), renders
      a deterministic frame of every piece on that slide at time t (t is NOT wrapped: the scene's own periodicity makes
      seek(0) and seek(period) identical), poses CSS animations inside the holder at t, and resolves once the frame is
      on screen. rect = { x, y, w, h }: the main holder in slide pixels (1920 x 1080), the region to record.
      While seeking, the slide's other content is visibility:hidden (layout unchanged), so slide TEXT is never baked
      into the video, even when the holder is full-bleed; it stays live HTML over the video. Kept visible: the holders,
      decorative backgrounds behind them (.bb-grid-bg, .bb-bg, .bb-blobs, [data-capture="keep"]) and the projected
      labels, which live INSIDE the holder and are deliberately BAKED into the picture (in a recorded deck the scene
      does not run, so live labels could not follow their anchors). DOM outside the holder that follows the scene
      (Aura.sync) stays live and follows the video's clock. Decorative background loops are frozen on slides that
      play a recorded loop, so they cannot drift against the copy baked into the video.
   3. Loops. If the HTML contains
        <script type="text/plain" id="lumi-loop-<n>" data-mime="video/mp4" data-period="12">BASE64</script>
      slide n plays that video (Blob URL, muted, loop, playsinline, only while the slide is current) inside its main
      holder ([data-loop-target], else the first .aura-3d / .aura-canvas) in place of the live scene, and never
      starts the live scene. The holder's other children (projected labels) are hidden: the video already shows them.
      ?live ignores the loops and runs WebGL; ?capture always runs the live scenes.
   3b. Blender holders (studio renders). <div class="bb-blender" data-blender="<id>" data-kind="still|animation"> holds a render that
      Lumi made in Blender and the packer inlined: <img class="bb-blender-img"> (the still, or the loop's poster = frame 1) and, for an
      animation, a muted <video class="bb-blender-video"> (20 fps seamless loop). It is NOT an .aura-3d / .aura-canvas, so it never
      appears in LumiCapture.slides (finalize must not record it: it is already a recorded video). It is listed in
      LumiCapture.recorded = { <n>: { kind, period } } so finalize can tell "already recorded" from "no 3D". Presenter mode plays the
      video only while the slide is current (reset to the start when it leaves); ?still, ?aura=all, ?aura=still, ?capture and
      reduced motion show the poster instead, so the PDF page is exactly the render's first frame. Projected labels:
      children [data-anchor="name"] are placed at the percentages recorded with the render (data-anchors on the holder, from
      lumi_bpy L.anchor), following the video's clock. data-draft="1" = the latest PREVIEW, not the approved render.
   4. Still frames. ?still=<n> shows slide n alone, frozen at t = period x 0.35 (data-still on a holder overrides; a
      loop video is sought to the same time), no chrome, no entrance motion, and sets <html data-aura-still-ready="1">
      when the frame is drawn. ?aura=all (PDF / check) uses the same still time for every piece.
   5. Did it draw? (batch 6 Part C.) "Ready" has never meant "the 3D is there": a scene that throws is skipped, the
      holder keeps a soft gradient (.aura-3d[data-fallback]::after) and the page reports ready at once, so a blank
      slide shipped silently. Beside the ready flag the still path now sets <html data-aura-still-3d="ok|failed">
      and, when it failed, data-aura-still-failed="<scene ids>". In capture mode
        window.LumiCapture.health() -> { <n>: { holders, drawn, failed: [{ scene, reason }] } }
      reports the same thing per slide (and slides[n].health for one slide), after any seek. A holder counts as drawn
      when it has a canvas with at least one non-transparent pixel (sampled at 64x36), a decoded still <img>, or a
      recorded loop video. finalize.js checks this
      before it records anything, retries the whole deck under a software GL, and fails loudly if it still cannot
      draw - a baked slide has no second source, so a blank one must never reach a client.
   ==================================================================================================================

   Load it in <head>; slides are <section class="slide"> inside <main class="deck">.
   Modes (URL): normal | ?aura=all (every slide stacked, final states: print, PDF, checks)
                | ?aura=still (normal navigation, no motion) | ?aura=presenter (notes view, used by the P window)
                | ?aura=edit (the app's editor preview: clicks select [data-edit] text instead of moving on)
   Embedded in a frame, the deck tells its parent {aura:'slide', index (1-based), count} on every slide change; in edit
   mode a click on a [data-edit] element posts {aura:'edit', id, slide (1-based), text}. The parent may post
   {aura:'go', index (0-based)}.
   API: Aura.scene(id, setup)  - lazy three.js scene for <div class="aura-3d" data-scene="id">
        Aura.canvas(id, setup) - lazy 2D canvas loop for <div class="aura-canvas" data-canvas="id">
        Aura.sync(id, fn)      - fn(t) on every frame of scene / canvas `id` (live, capture, still, and recorded loops):
                                 DOM outside the holder (a checklist, a map) that follows the scene's clock
        Aura.go(n), Aura.next(), Aura.prev(), Aura.slides(), Aura.ready (Promise), Aura.on(type, fn)
   Runtime chrome is marked data-aura-ui and never shows text below 26 px. */
(function () {
  'use strict';
  if (window.Aura && window.Aura.version) return;

  const html = document.documentElement;
  const params = new URLSearchParams(location.search);
  const mode = params.get('aura') || (location.hash === '#all' ? 'all' : '');
  const ALL = mode === 'all';
  const PRESENTER_WINDOW = mode === 'presenter';
  const EDIT = mode === 'edit';
  const EMBEDDED = (() => { try { return window.parent && window.parent !== window; } catch (e) { return true; } })();
  const reduceMQ = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const CAPTURE = params.has('capture');
  const STILL_N = parseInt(params.get('still') || '', 10) || 0;
  const LIVE = params.has('live') || CAPTURE;
  const STILL = ALL || mode === 'still' || !!STILL_N || reduceMQ.matches;
  const FROZEN = CAPTURE || !!STILL_N;      // driven by a tool: no chrome, no input, slide at scale 1
  const W = 1920, H = 1080, MAX_LIVE_3D = 3;

  if (ALL) html.classList.add('aura-all');
  if (STILL) html.classList.add('aura-still');
  if (EDIT) html.classList.add('aura-edit');
  if (FROZEN) html.classList.add('aura-still', 'aura-capture');

  const sceneDefs = new Map(), canvasDefs = new Map(), sceneOpts = new Map(), listeners = {};
  const loops = new Map();       // slide number -> { el, holder, mime, period, url, video }
  const syncDefs = new Map();    // scene / canvas id -> fn(t): DOM outside the holder that follows the scene's clock
  let slides = [], current = -1, deckEl = null, presenter = PRESENTER_WINDOW, peer = null;
  let readyResolve; const ready = new Promise(r => { readyResolve = r; });

  const emit = (type, detail) => {
    (listeners[type] || []).forEach(fn => { try { fn(detail); } catch (e) { console.error(e); } });
    document.dispatchEvent(new CustomEvent('aura:' + type, { detail }));
  };

  /* ---------------- slide info ---------------- */
  function notesOf(s) {
    const n = s.querySelector('[data-aura-notes], .notes');
    if (!n) return '';
    const blocks = n.querySelectorAll('p, li');
    const text = blocks.length ? Array.from(blocks, b => b.textContent.replace(/\s+/g, ' ').trim()).join('\n\n')
                               : n.textContent.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
    return text;
  }
  function titleOf(s) {
    if (s.dataset.title) return s.dataset.title;
    const h = s.querySelector('h1, h2, h3');
    return h ? h.textContent.replace(/\s+/g, ' ').trim() : '';
  }
  function info() {
    return slides.map((s, i) => ({ index: i, number: i + 1, title: titleOf(s), notes: notesOf(s),
      minutes: parseFloat(s.dataset.minutes) || null, kind: s.dataset.kind || 'content' }));
  }

  /* ---------------- fitting ---------------- */
  let scale = 1;
  function fit() {
    if (ALL || !deckEl) return;
    if (FROZEN) {
      scale = 1;
      deckEl.style.setProperty('--aura-scale', 1); deckEl.style.setProperty('--aura-x', '0px'); deckEl.style.setProperty('--aura-y', '0px');
      live3d.forEach(r => sizeRenderer(r));
      return;
    }
    const panel = presenter ? Math.max(360, innerWidth * 0.34) : 0;
    const w = Math.max(1, innerWidth - panel), h = Math.max(1, innerHeight);
    scale = Math.min(w / W, h / H);
    // no hairline letterbox when the window is within 2 px of 16:9
    if (w - W * scale < 2) scale = Math.max(scale, w / W);
    if (h - H * scale < 2) scale = Math.max(scale, h / H);
    deckEl.style.setProperty('--aura-scale', scale);
    deckEl.style.setProperty('--aura-x', ((w - W * scale) / 2) + 'px');
    deckEl.style.setProperty('--aura-y', ((h - H * scale) / 2) + 'px');
    live3d.forEach(r => sizeRenderer(r));
  }

  /* ---------------- animated pieces (3D + 2D canvas) ---------------- */
  let threePromise = null;
  function loadThree() {
    if (!threePromise) threePromise = import('three');
    return threePromise;
  }
  const live3d = new Set();       // records with a live WebGL renderer
  const running = new Set();      // records animating right now
  let raf = 0, last = 0;

  function holderSize(el) { return { w: el.offsetWidth || W, h: el.offsetHeight || H }; }
  function sizeRenderer(rec) {
    if (!rec.renderer) return;
    const { w, h } = holderSize(rec.el);
    const pr = ALL ? 1 : FROZEN ? (window.devicePixelRatio || 1) : Math.min(1.5, Math.max(0.5, (window.devicePixelRatio || 1) * scale));
    rec.renderer.setPixelRatio(pr);
    rec.renderer.setSize(w, h, false);
    if (rec.camera && rec.camera.isPerspectiveCamera) { rec.camera.aspect = w / h; rec.camera.updateProjectionMatrix(); }
    if (rec.api && rec.api.resize) rec.api.resize(w, h);
  }

  // one setup per holder, even when two callers ask at once (a slide entry and a still / capture frame): both await it
  function ensure3d(el) {
    if (el._aura && !el._aura.pending) return Promise.resolve(el._aura.failed ? null : el._aura);
    if (el._auraP) return el._auraP;
    const p = setup3d(el);
    el._auraP = p;
    p.then(() => { if (el._auraP === p) el._auraP = null; });
    return p;
  }
  async function setup3d(el) {
    const id = el.dataset.scene, setup = sceneDefs.get(id);
    if (!setup) return null;
    const rec = { el, kind: '3d', t0: 0, used: performance.now(), pending: true };
    el._aura = rec;
    try {
      const THREE = await loadThree();
      const canvas = document.createElement('canvas');
      el.appendChild(canvas);
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: ALL || FROZEN, powerPreference: 'default' });
      if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
      rec.renderer = renderer; rec.canvas = canvas;
      const { w, h } = holderSize(el);
      const api = (await setup({ THREE, el, canvas, renderer, width: w, height: h, still: STILL, reducedMotion: reduceMQ.matches,
        period: periodOf(el), capture: FROZEN })) || {};
      rec.api = api; rec.scene = api.scene; rec.camera = api.camera;
      live3d.add(rec);
      sizeRenderer(rec);
      rec.pending = false;
      return rec;
    } catch (err) {
      const why = String((err && err.message) || err || '').split('\n')[0];
      console.warn('Aura 3D scene "' + id + '" could not start:', why);
      dispose3d(rec);
      el.setAttribute('data-fallback', '');
      el.setAttribute('data-aura-error', why.slice(0, 160));   // read back by LumiCapture.health() (section 5)
      el._aura = { el, failed: true };
      return null;
    }
  }
  function render3d(rec, t, dt) {
    if (!rec || !rec.renderer) return;
    if (rec.api.update) rec.api.update(t, dt);
    if (rec.api.render) rec.api.render(t, dt);               // post-processing pipelines draw the frame themselves
    else if (rec.scene && rec.camera) rec.renderer.render(rec.scene, rec.camera);
    runSync(rec.el, t);
  }
  function dispose3d(rec) {
    if (!rec) return;
    running.delete(rec); live3d.delete(rec);
    try { if (rec.api && rec.api.dispose) rec.api.dispose(); } catch (e) { /* ignore */ }
    if (rec.scene && rec.scene.traverse) {
      rec.scene.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        mats.forEach(m => { Object.values(m).forEach(v => { if (v && v.isTexture) v.dispose(); }); m.dispose(); });
      });
    }
    if (rec.renderer) { rec.renderer.dispose(); if (rec.renderer.forceContextLoss) rec.renderer.forceContextLoss(); }
    if (rec.canvas && rec.canvas.parentNode) rec.canvas.remove();
    rec.renderer = null;
    if (rec.el && rec.el._aura === rec) rec.el._aura = null;
  }
  function trimLive() {
    if (live3d.size <= MAX_LIVE_3D) return;
    const idle = Array.from(live3d).filter(r => !running.has(r)).sort((a, b) => a.used - b.used);
    while (live3d.size > MAX_LIVE_3D && idle.length) dispose3d(idle.shift());
  }

  function ensureCanvas(el) {
    if (el._aura) return el._aura;
    const setup = canvasDefs.get(el.dataset.canvas);
    if (!setup) return null;
    const canvas = document.createElement('canvas');
    const { w, h } = holderSize(el);
    const pr = ALL ? 1 : Math.min(1.5, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.round(w * pr); canvas.height = Math.round(h * pr);
    el.appendChild(canvas);
    const ctx = canvas.getContext('2d'); ctx.scale(pr, pr);
    const rec = { el, kind: '2d', canvas, ctx, t0: 0 };
    try { rec.api = setup({ el, canvas, ctx, width: w, height: h, still: STILL, reducedMotion: reduceMQ.matches, period: periodOf(el), capture: FROZEN }) || {}; }
    catch (e) { console.warn('Aura canvas "' + el.dataset.canvas + '" failed:', e); rec.api = {}; }
    if (typeof rec.api === 'function') rec.api = { update: rec.api };
    el._aura = rec;
    return rec;
  }
  // the loop period a piece declared: data-period on the holder, else the options given to Aura.scene / Aura.canvas
  function periodOf(el) {
    const v = parseFloat(el.dataset.period);
    if (isFinite(v)) return v;
    const o = sceneOpts.get((el.classList.contains('aura-3d') ? '3d:' : '2d:') + (el.dataset.scene || el.dataset.canvas));
    return o && isFinite(o.period) ? +o.period : null;
  }
  function runSync(el, t) {
    const fn = syncDefs.get(el.dataset.scene || el.dataset.canvas);
    if (fn) { try { fn(t); } catch (e) { console.error(e); } }
  }
  function stillTime(el) {
    const v = parseFloat(el.dataset.still); if (isFinite(v)) return v;
    const p = periodOf(el); return p ? p * 0.35 : (p === 0 ? 0 : 1.5);
  }

  function tick(now) {
    raf = 0;
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0.016); last = now;
    running.forEach(rec => {
      const t = (now - rec.t0) / 1000;
      try { if (rec.kind === '3d') render3d(rec, t, dt); else if (rec.api.update) { rec.api.update(t, dt); runSync(rec.el, t); } }
      catch (e) { console.error(e); running.delete(rec); }
    });
    if (running.size && !document.hidden) raf = requestAnimationFrame(tick);
  }
  function kick() { if (!raf && running.size && !document.hidden) { last = 0; raf = requestAnimationFrame(tick); } }

  async function startPieces(slide) {
    const token = slide;
    playBlender(slide);
    const loop = !LIVE && loops.get(slides.indexOf(slide) + 1);
    if (loop) { playLoop(loop); return; }        // a recorded loop replaces the live scene on this slide
    if (CAPTURE) return;                         // the recorder draws every frame through LumiCapture.seek
    const pieces = slide.querySelectorAll('.aura-3d[data-scene], .aura-canvas[data-canvas]');
    for (const el of pieces) {
      const rec = el.classList.contains('aura-3d') ? await ensure3d(el) : ensureCanvas(el);
      if (!rec || rec.failed || slides[current] !== token) continue;
      rec.used = performance.now();
      if (STILL) {      // reduced motion: one calm still frame
        const t = stillTime(el);
        if (rec.kind === '3d') render3d(rec, t, 0); else if (rec.api.update) rec.api.update(t, 0);
        continue;
      }
      if (!rec.t0 || el.hasAttribute('data-camera-from')) rec.t0 = performance.now();
      running.add(rec);
    }
    trimLive(); kick();
  }
  function stopPieces(slide) {
    stopBlender(slide);
    running.forEach(rec => { if (slide.contains(rec.el)) running.delete(rec); });
    const loop = loops.get(slides.indexOf(slide) + 1);
    if (loop && loop.video) loop.video.pause();
  }

  /* ---------------- recorded loops (finalized decks) ---------------- */
  function holderOf(slide) {
    return slide.querySelector('[data-loop-target]') || slide.querySelector('.aura-3d[data-scene], .aura-canvas[data-canvas]');
  }
  function loopVideo(loop) {
    if (loop.video) return loop.video;
    if (!loop.url) {
      const bin = atob(loop.el.textContent.replace(/\s+/g, '')), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      loop.url = URL.createObjectURL(new Blob([u8], { type: loop.mime }));
    }
    const v = document.createElement('video');
    v.className = 'aura-loop'; v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
    ['muted', 'playsinline', 'disablepictureinpicture'].forEach(a => v.setAttribute(a, ''));
    v.setAttribute('aria-hidden', 'true');
    v.src = loop.url;
    loop.holder.classList.add('aura-looping');
    loop.holder.appendChild(v);
    loop.video = v;
    return v;
  }
  function playLoop(loop) {
    const v = loopVideo(loop);
    if (STILL) return;
    try { v.currentTime = 0; } catch (e) { /* not loaded yet */ }
    const p = v.play(); if (p && p.catch) p.catch(() => {});
    // DOM that follows the scene clock (Aura.sync) keeps following the video
    const id = loop.holder.dataset.scene || loop.holder.dataset.canvas;
    if (syncDefs.has(id)) {
      const step = () => { if (v.paused) return; runSync(loop.holder, v.currentTime); requestAnimationFrame(step); };
      v.addEventListener('playing', () => requestAnimationFrame(step), { once: true });
    }
  }
  function seekVideo(v, t) {
    return new Promise(ok => {
      const go2 = () => {
        const d = isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
        const tt = d ? Math.min(Math.max(0, t), d - 0.001) : t;
        v.addEventListener('seeked', () => ok(), { once: true });
        try { v.currentTime = tt; } catch (e) { ok(); }
      };
      if (v.readyState >= 1) go2(); else v.addEventListener('loadedmetadata', go2, { once: true });
      setTimeout(ok, 5000);
    });
  }
  function scanLoops() {
    document.querySelectorAll('script[type="text/plain"][id^="lumi-loop-"]').forEach(el => {
      const n = parseInt(el.id.slice(10), 10), slide = slides[n - 1];
      const holder = slide && holderOf(slide);
      if (!holder) return;
      const p = parseFloat(el.dataset.period);
      if (!LIVE) slide.classList.add('aura-has-loop');
      loops.set(n, { el, holder, mime: el.dataset.mime || 'video/mp4', period: isFinite(p) ? p : null, url: null, video: null });
    });
  }

  /* ================ projected labels: a label never covers the figure (LOOK-BASE 4.4) ================
     One placement engine for all five look engines, the Blender path below and the baked player. A caller
     hands over three things — the holder, each label's anchor point in holder pixels, and an occupancy grid
     saying where the picture's subject is — and this puts every label in clear space OUTSIDE that subject
     and draws a short leader back to its anchor.

     Deterministic by contract. The placement of a frame depends only on that frame's arguments, never on
     the previous frame, the clock or Math.random(), because a recorded loop has to seek to the same picture
     every time (capture contract, 1 above). That rules out hysteresis and easing. What stops a label
     flickering between two sides mid-loop instead is that the cost landscape is smooth and the author's own
     data-align hint outweighs a few pixels of leader.

     The ladder when the figure leaves no clear space (the "nowhere to go" case):
       1. a RING slot beside the anchor, the preferred direction first                 — the normal result
       2. a RAIL slot, stacked in the free margin between the figure and the frame edge, leader across
       3. the least-covered slot of them all, plus data-labels-crowded on the holder. deck_check.js calls
          that an error, because the fix belongs to the slide — fewer labels, or a smaller figure — and a
          placer that silently gave up would be the clamp-onto-the-subject bug all over again. */

  const SVGNS = 'http://www.w3.org/2000/svg';
  const LBL_COLS = 56;                 // occupancy resolution across the holder; rows follow the aspect

  function occGrid(w, h) {
    const cols = LBL_COLS, rows = Math.max(6, Math.round(cols * (h || 1) / (w || 1)));
    const cell = new Uint8Array(cols * rows);
    const g = {
      w, h, cols, rows, cell, filled: 0, box: null,
      addRect(x, y, rw, rh) {
        if (!(rw > 0) || !(rh > 0)) return;
        const c0 = Math.max(0, Math.floor(x / w * cols)), c1 = Math.min(cols - 1, Math.ceil((x + rw) / w * cols) - 1);
        const r0 = Math.max(0, Math.floor(y / h * rows)), r1 = Math.min(rows - 1, Math.ceil((y + rh) / h * rows) - 1);
        if (c1 < c0 || r1 < r0) return;
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const i = r * cols + c; if (!cell[i]) { cell[i] = 1; g.filled++; } }
        const b = g.box;
        if (!b) g.box = { x0: x, y0: y, x1: x + rw, y1: y + rh };
        else { b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x + rw); b.y1 = Math.max(b.y1, y + rh); }
      },
      // what share of a rectangle sits on the subject, 0 (clear) to 1 (wholly covered)
      coverage(x, y, rw, rh) {
        if (!g.filled) return 0;
        const c0 = Math.max(0, Math.floor(x / w * cols)), c1 = Math.min(cols - 1, Math.ceil((x + rw) / w * cols) - 1);
        const r0 = Math.max(0, Math.floor(y / h * rows)), r1 = Math.min(rows - 1, Math.ceil((y + rh) / h * rows) - 1);
        if (c1 < c0 || r1 < r0) return 0;
        let on = 0, n = 0;
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { n++; if (cell[r * cols + c]) on++; }
        return n ? on / n : 0;
      },
      // the same question along a line: how much of a leader runs over the subject
      lineCoverage(x0, y0, x1, y1) {
        if (!g.filled) return 0;
        const steps = Math.max(2, Math.min(24, Math.round(Math.hypot(x1 - x0, y1 - y0) / 12)));
        let on = 0;
        for (let i = 1; i < steps; i++) {
          const x = x0 + (x1 - x0) * i / steps, y = y0 + (y1 - y0) * i / steps;
          const c = Math.floor(x / w * cols), r = Math.floor(y / h * rows);
          if (c >= 0 && r >= 0 && c < cols && r < rows && cell[r * cols + c]) on++;
        }
        return on / Math.max(1, steps - 1);
      },
    };
    return g;
  }

  /* occupancy from the live scene: the screen-space box of every mesh that is part of the subject.
     Excluded, in this order: anything the author marked auraFigure === false; the floors, backdrops and
     fake-shadow sprites every look already marks userData.shadow === false; anything straddling the camera
     plane (its projection is meaningless); and anything that fills the frame, which is scenery by definition.
     A projected box is coarser than a silhouette, and deliberately so — it errs towards pushing the label
     further out, which is the side of the rule the owner cares about. */
  function sceneGrid(THREE, root, camera, w, h) {
    const g = occGrid(w, h);
    if (!THREE || !root || !camera) return g;
    const v = new THREE.Vector3(), bb = new THREE.Box3();
    /* Force the world matrices. three.js only refreshes them inside renderer.render(), and the label pass runs
       BEFORE the render — on the first frame they are still identity, which put the whole subject at the origin
       and made the grid report clear space exactly where the figure was about to be drawn. */
    root.updateMatrixWorld(true);
    root.traverse(o => {
      if (!o.visible) return;
      const ud = o.userData || {};
      if (ud.auraFigure === false) return;
      if (ud.auraFigure !== true) {
        if (!o.isMesh) return;
        if (ud.shadow === false) return;
        if (o.material && o.material.isShadowMaterial) return;      // a shadow-catcher floor is not the subject
      }
      const geo = o.geometry; if (!geo) return;
      if (!geo.boundingBox) { try { geo.computeBoundingBox(); } catch (e) { return; } }
      if (!geo.boundingBox) return;
      bb.copy(geo.boundingBox).applyMatrix4(o.matrixWorld);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, behind = 0;
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z);
        v.project(camera);
        if (v.z > 1) behind++;
        const sx = (v.x + 1) / 2 * w, sy = (1 - v.y) / 2 * h;
        if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
      }
      if (behind) return;
      x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(w, x1); y1 = Math.min(h, y1);
      const rw = x1 - x0, rh = y1 - y0;
      if (!(rw > 0 && rh > 0)) return;
      if (rw * rh > 0.62 * w * h) return;
      g.addRect(x0, y0, rw, rh);
    });
    return g;
  }

  /* where an object-fit: contain picture actually lands inside its holder. The Blender anchors are
     percentages of the FRAME, and the frame is letterboxed when its aspect is not the holder's. */
  function containBox(iw, ih, w, h) {
    if (!(iw > 0) || !(ih > 0)) return { x: 0, y: 0, w, h };
    const s = Math.min(w / iw, h / ih), dw = iw * s, dh = ih * s;
    return { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh };
  }

  /* occupancy from the picture itself: the Blender path has no scene, only an <img> or a <video>, so the
     silhouette is "every pixel that is not the background". The render's background IS the slide colour by
     contract (docs/blender-contract.md), and the outermost ring of the frame is background by construction,
     so the reference colour is read from there rather than assumed. This is the real silhouette, not a box. */
  const PIC_COLS = 64;
  let picCanvas = null;
  function pictureGrid(media, w, h) {
    const g = occGrid(w, h);
    const iw = media && (media.naturalWidth || media.videoWidth) || 0;
    const ih = media && (media.naturalHeight || media.videoHeight) || 0;
    if (!iw || !ih) return g;
    const cols = PIC_COLS, rows = Math.max(6, Math.round(cols * ih / iw));
    const cv = picCanvas || (picCanvas = document.createElement('canvas'));
    cv.width = cols; cv.height = rows;
    let d;
    try {
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.clearRect(0, 0, cols, rows);
      cx.drawImage(media, 0, 0, cols, rows);
      d = cx.getImageData(0, 0, cols, rows).data;
    } catch (e) { return g; }          // tainted or not yet decodable: no silhouette, the hint alone places it
    // reference = the median of the border ring
    const rs = [], gs = [], bs = [];
    for (let c = 0; c < cols; c++) for (const r of [0, rows - 1]) { const k = (r * cols + c) * 4; rs.push(d[k]); gs.push(d[k + 1]); bs.push(d[k + 2]); }
    for (let r = 1; r < rows - 1; r++) for (const c of [0, cols - 1]) { const k = (r * cols + c) * 4; rs.push(d[k]); gs.push(d[k + 1]); bs.push(d[k + 2]); }
    const mid = a => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
    const ref = [mid(rs), mid(gs), mid(bs)];
    const fit = containBox(iw, ih, w, h), cw = fit.w / cols, ch = fit.h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const k = (r * cols + c) * 4;
      if (d[k + 3] < 24) continue;      // transparent: the holder's own background shows through
      const diff = Math.abs(d[k] - ref[0]) + Math.abs(d[k + 1] - ref[1]) + Math.abs(d[k + 2] - ref[2]);
      if (diff > 30) g.addRect(fit.x + c * cw, fit.y + r * ch, cw, ch);
    }
    return g;
  }

  /* the holder clipped to the slide's 96 px edge safe zone, in holder pixels */
  function safeBox(holder, w, h) {
    const slide = holder.closest('.slide');
    let ox = 0, oy = 0;
    if (slide) for (let e = holder; e && e !== slide && slide.contains(e); e = e.offsetParent) { ox += e.offsetLeft; oy += e.offsetTop; }
    const x0 = Math.max(0, 96 - ox), y0 = Math.max(0, 96 - oy);
    const x1 = Math.min(w, 1824 - ox), y1 = Math.min(h, 984 - oy);
    return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
  }

  function leaderLayer(holder) {
    let svg = holder._auraLeaders;
    if (svg && svg.parentNode === holder) return svg;
    svg = holder.querySelector('svg.aura-leaders');
    if (!svg) {
      svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('class', 'aura-leaders');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('data-aura-rec-keep', '');     // it is part of the picture, so it is recorded with it
      holder.appendChild(svg);
    }
    holder._auraLeaders = svg;
    return svg;
  }

  const RING = [[1, 0], [0.92, -0.38], [0.92, 0.38], [0, -1], [0, 1], [-0.92, -0.38], [-0.92, 0.38], [-1, 0]];
  const GAPS = [20, 48, 92, 150, 224, 316];

  function rectOverlap(a, b) {
    const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return ix > 0 && iy > 0 ? (ix * iy) / Math.max(1, Math.min(a.w * a.h, b.w * b.h)) : 0;
  }
  function outsideShare(r, safe) {
    const ix = Math.max(0, Math.min(r.x + r.w, safe.x + safe.w) - Math.max(r.x, safe.x));
    const iy = Math.max(0, Math.min(r.y + r.h, safe.y + safe.h) - Math.max(r.y, safe.y));
    return 1 - (ix * iy) / Math.max(1, r.w * r.h);
  }
  // the point of a rectangle's edge nearest p, where a leader should land
  function edgePoint(r, px, py) {
    return { x: Math.max(r.x, Math.min(px, r.x + r.w)), y: Math.max(r.y, Math.min(py, r.y + r.h)) };
  }

  /* place(holder, items, grid, opts)
       items: [{ el, x, y, show }] — the anchor point in holder pixels, show=false hides the label
       grid:  an occupancy grid from sceneGrid / pictureGrid, or null to place on the hint alone
       opts:  { safe, leaders } */
  function placeLabels(holder, items, grid, opts) {
    opts = opts || {};
    const w = holder.offsetWidth, h = holder.offsetHeight;
    if (!w || !h || !items.length) return;
    const safe = opts.safe || safeBox(holder, w, h);
    const wantLeaders = opts.leaders !== false;
    const live = [];
    items.forEach(it => {
      const el = it.el;
      if (!it.show) { el.style.setProperty('visibility', 'hidden', 'important'); return; }
      el.style.setProperty('visibility', '', '');
      el.style.left = '0px'; el.style.top = '0px';
      live.push(it);
    });
    if (!live.length) { const s = holder._auraLeaders; if (s) s.replaceChildren(); holder.removeAttribute('data-labels-crowded'); return; }
    // measure after every label is at the origin, so one layout pass serves all of them
    live.forEach(it => { it.ew = it.el.offsetWidth; it.eh = it.el.offsetHeight; });

    /* ------------------------------------------------------------------ A LABEL IS PLACED ONCE AND STAYS PUT.
       This runs on every animation frame while a loop plays. Solving from scratch each time is what made labels
       jump: the solver is greedy, so a few pixels of anchor movement reorders the candidates and two labels
       swap slots - and with six labels on one figure that happens somewhere in the frame almost every frame.
       It cannot be damped with hysteresis, because the capture contract forbids reading the previous frame
       (seek(t) and the recorded loop must agree).
       So the box is solved ONCE per arrangement and held; only the LEADER follows the moving part. That is also
       how a human annotates a moving figure - the callout is still, the line tracks. A re-solve happens only
       when the arrangement genuinely changes: the holder resized, or a label appeared or disappeared.
       `sig` is built from ALL items, not just the visible ones, so an anchor flickering across the edge of the
       frame hides its own label without moving anyone else's. */
    const sig = w + 'x' + h + '|' + items.map(it => (it.el.dataset.anchor || it.el.textContent || '').slice(0, 24)).join('');
    const held = holder._auraSlots instanceof Map && holder._auraSig === sig
      && live.every(it => holder._auraSlots.has(it.el)) ? holder._auraSlots : null;

    holder._auraGrid = grid;                   // the last occupancy, so a test page can see what the placer saw
    const box = grid && grid.box, taken = [], segs = [];
    const slots = held || new Map();
    let crowded = held ? !!holder._auraCrowded : false;
    const drawLeader = (rect, ax, ay) => {
      if (!wantLeaders) return;
      const e = edgePoint(rect, ax, ay), len = Math.hypot(e.x - ax, e.y - ay);
      if (len <= 14) return;
      const ux = (e.x - ax) / len, uy = (e.y - ay) / len;
      segs.push({ x1: ax + ux * 7, y1: ay + uy * 7, x2: e.x - ux * 3, y2: e.y - uy * 3, dx: ax, dy: ay });
    };
    live.forEach(it => {
      const ew = it.ew, eh = it.eh, ax = it.x, ay = it.y;
      if (held) {                               // the box was solved already: move only the leader
        const s0 = slots.get(it.el), rect = { x: s0.x, y: s0.y, w: ew, h: eh };
        it.el.style.transform = 'translate(' + s0.x.toFixed(1) + 'px, ' + s0.y.toFixed(1) + 'px)';
        it.el.dataset.placed = '1';
        drawLeader(rect, ax, ay);
        return;
      }
      /* the author's old hard offset is now a HINT: data-align / data-dx / data-dy say which way the label
         wanted to sit, and that direction wins every tie, but it can no longer park the label on the figure. */
      const align = it.el.dataset.align || 'left';
      const dxh = parseFloat(it.el.dataset.dx), dyh = parseFloat(it.el.dataset.dy);
      const hx = align === 'center' ? 0 : (isFinite(dxh) ? Math.abs(dxh) : 24) * (align === 'right' ? -1 : 1);
      const hy = isFinite(dyh) ? dyh : (align === 'center' ? -24 : 0);
      const hm = Math.hypot(hx, hy) || 1;
      const pref = [hx / hm, hy / hm];
      // away from the subject's middle is a better guess than any fixed side
      let awayX = 0, awayY = 0;
      if (box) {
        const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2, d = Math.hypot(ax - cx, ay - cy) || 1;
        awayX = (ax - cx) / d; awayY = (ay - cy) / d;
      }
      const cand = [];
      RING.forEach(d => GAPS.forEach(gap => {
        const reach = gap + (Math.abs(d[0]) * ew + Math.abs(d[1]) * eh) / 2;
        cand.push({ x: ax + d[0] * reach - ew / 2, y: ay + d[1] * reach - eh / 2, w: ew, h: eh, d, rail: 0 });
      }));
      // rails: the free margin between the subject and the frame edge, at the anchor's own row or column
      if (box) {
        const g2 = 24;
        cand.push({ x: safe.x, y: ay - eh / 2, w: ew, h: eh, d: [-1, 0], rail: 1 });
        cand.push({ x: safe.x + safe.w - ew, y: ay - eh / 2, w: ew, h: eh, d: [1, 0], rail: 1 });
        cand.push({ x: ax - ew / 2, y: safe.y, w: ew, h: eh, d: [0, -1], rail: 1 });
        cand.push({ x: ax - ew / 2, y: safe.y + safe.h - eh, w: ew, h: eh, d: [0, 1], rail: 1 });
        cand.push({ x: Math.min(safe.x + safe.w - ew, box.x1 + g2), y: ay - eh / 2, w: ew, h: eh, d: [1, 0], rail: 1 });
        cand.push({ x: Math.max(safe.x, box.x0 - g2 - ew), y: ay - eh / 2, w: ew, h: eh, d: [-1, 0], rail: 1 });
      }
      let best = null, bestCost = Infinity;
      cand.forEach(c => {
        /* Clamp into the safe box BEFORE scoring, never after. A candidate scored where it wanted to be and then
           clamped is how a label ends up on the subject: the clamp is a push INWARD, which is a push onto the
           figure. Scoring the position the label will actually occupy is the whole difference. */
        c.x = Math.max(safe.x, Math.min(c.x, safe.x + safe.w - ew));
        c.y = Math.max(safe.y, Math.min(c.y, safe.y + safe.h - eh));
        const cov = grid ? grid.coverage(c.x, c.y, c.w, c.h) : 0;
        let cost = cov * 1000 + outsideShare(c, safe) * 700;
        for (const t of taken) cost += rectOverlap(c, t) * 800;
        const e = edgePoint(c, ax, ay);
        if (grid) cost += grid.lineCoverage(ax, ay, e.x, e.y) * 90;
        /* The weights decide how STABLE a label is over a loop, not just how it looks in one frame. The author's
           direction has to outweigh leader length by a wide margin: when the two were comparable, a label whose
           anchor sat near the middle of the frame flipped from one side to the other and back twice a loop, a 650 px
           jump, because the nearer side kept changing as the camera turned. Length now only orders the slots on the
           side that was chosen; the side itself changes when that side is actually covered, which is rare. */
        cost += Math.hypot(e.x - ax, e.y - ay) * 0.12;
        cost += (1 - (c.d[0] * pref[0] + c.d[1] * pref[1])) * 220;          // the author's hint: the stable choice
        cost += (1 - (c.d[0] * awayX + c.d[1] * awayY)) * 26;               // outward from the subject
        cost += c.rail * 30;                                                // a rail is the second choice
        if (cost < bestCost) { bestCost = cost; best = c; }
      });
      // 0.12 is deck_check.js's own threshold for "a label covers the figure", so the runtime flag and the
      // measured check agree on what counts. A projected box over-reports a silhouette; a few grazing cells are not
      // a covered figure.
      if (grid && grid.coverage(best.x, best.y, ew, eh) > 0.12) crowded = true;
      taken.push(best);
      slots.set(it.el, { x: best.x, y: best.y });
      it.el.style.transform = 'translate(' + best.x.toFixed(1) + 'px, ' + best.y.toFixed(1) + 'px)';
      it.el.dataset.placed = '1';
      drawLeader(best, ax, ay);
    });
    holder._auraSlots = slots; holder._auraSig = sig; holder._auraCrowded = crowded;
    if (crowded) holder.setAttribute('data-labels-crowded', ''); else holder.removeAttribute('data-labels-crowded');
    if (!wantLeaders) return;
    const svg = leaderLayer(holder);
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    const kids = svg.childNodes;
    while (kids.length > segs.length * 2) svg.removeChild(svg.lastChild);
    while (kids.length < segs.length * 2) {
      svg.appendChild(document.createElementNS(SVGNS, 'line'));
      svg.appendChild(document.createElementNS(SVGNS, 'circle'));
    }
    segs.forEach((s, i) => {
      const ln = kids[i * 2], dot = kids[i * 2 + 1];
      ln.setAttribute('x1', s.x1.toFixed(1)); ln.setAttribute('y1', s.y1.toFixed(1));
      ln.setAttribute('x2', s.x2.toFixed(1)); ln.setAttribute('y2', s.y2.toFixed(1));
      dot.setAttribute('cx', s.dx.toFixed(1)); dot.setAttribute('cy', s.dy.toFixed(1)); dot.setAttribute('r', '5');
    });
  }

  /* Force the next place() to solve again. Called when the thing the solve was based on really changed -
     a resize, or a new picture in the holder. Everything else holds its slots on purpose. */
  function resetLabels(holder) { if (holder) { holder._auraSlots = null; holder._auraSig = null; } }
  window.LumiLabel = { version: '1.1', grid: occGrid, sceneGrid, pictureGrid, containBox, safeBox, place: placeLabels, reset: resetLabels };

  /* ---------------- Blender holders: a render that is already a picture or a recorded loop ---------------- */
  function blenderHolders(slide) { return Array.from(slide.querySelectorAll('.bb-blender[data-filled]:not([data-baked])')); }
  function blenderAnchors(h) {
    if (h._anchors !== undefined) return h._anchors;
    try { h._anchors = JSON.parse(h.dataset.anchors || 'null'); } catch (e) { h._anchors = null; }
    return h._anchors;
  }
  // the picture inside the holder right now: the loop's video while it plays, else the still / poster
  function blenderMedia(h) {
    const v = h.querySelector('video.bb-blender-video');
    if (v && !v.paused && v.readyState >= 2 && getComputedStyle(v).display !== 'none') return v;
    const img = h.querySelector('img.bb-blender-img');
    return img && img.complete && img.naturalWidth ? img : null;
  }
  /* Put every [data-anchor] label beside the point recorded with the render, never on top of it.
     The recorded point is a percentage of the FRAME, and the frame is object-fit: contain inside the holder,
     so it is mapped through the letterbox box rather than through the holder (it used to be set straight as
     a holder percentage, which was already wrong whenever the two aspects differed).
     The silhouette comes from the picture, read at 64 columns; that costs a canvas read, so it is refreshed
     a few times a second rather than every frame. The Blender path is never recorded by finalize — it is
     already a video — so this throttle cannot make a captured loop non-deterministic. */
  function placeBlenderLabels(h, t) {
    const a = blenderAnchors(h); if (!a) return;
    const fps = parseFloat(h.dataset.fps) || 20;
    const w = h.offsetWidth, hh = h.offsetHeight;
    if (!w || !hh) return;
    const media = blenderMedia(h);
    const fit = media ? LumiLabel.containBox(media.naturalWidth || media.videoWidth, media.naturalHeight || media.videoHeight, w, hh)
                      : { x: 0, y: 0, w, h: hh };
    const now = Date.now();
    if (media && (!h._occ || now - h._occAt > 180 || h._occW !== w || h._occH !== hh)) {
      h._occ = LumiLabel.pictureGrid(media, w, hh); h._occAt = now; h._occW = w; h._occH = hh;
    }
    const items = [];
    h.querySelectorAll('[data-anchor]').forEach(el => {
      const pts = a[el.dataset.anchor]; if (!pts || !pts.length) { el.style.display = 'none'; return; }
      el.style.display = '';
      const i = pts.length > 1 ? Math.floor(((t || 0) * fps) + 1e-6) % pts.length : 0, p = pts[Math.max(0, i)];
      // a point well off the frame has nothing to point at. lumi_bpy drops the projected z, so a point BEHIND
      // the camera still arrives as a plausible percentage and cannot be told apart here — see docs/STATUS-P4.md.
      const show = p[0] > -5 && p[0] < 105 && p[1] > -5 && p[1] < 105;
      items.push({ el, x: fit.x + p[0] / 100 * fit.w, y: fit.y + p[1] / 100 * fit.h, show });
    });
    if (items.length) LumiLabel.place(h, items, h._occ || null);
  }
  function blenderVideo(h) { return h.querySelector('video.bb-blender-video'); }
  function playBlender(slide) {
    if (FROZEN || STILL) return;
    blenderHolders(slide).forEach(h => {
      const v = blenderVideo(h); if (!v) return;
      v.preload = 'auto';
      try { v.currentTime = 0; } catch (e) { /* not loaded yet */ }
      const p = v.play(); if (p && p.catch) p.catch(() => {});
      if (blenderAnchors(h) && !h._following) {
        h._following = true;
        const step = () => { if (v.paused) { h._following = false; return; } placeBlenderLabels(h, v.currentTime); requestAnimationFrame(step); };
        requestAnimationFrame(step);
      }
    });
  }
  function stopBlender(slide) {
    blenderHolders(slide).forEach(h => {
      const v = blenderVideo(h); if (!v) return;
      v.pause();
      try { v.currentTime = 0; } catch (e) { /* ignore */ }
      placeBlenderLabels(h, 0);
    });
  }
  async function readyBlender(slide) {       // a still / PDF frame waits until the render is decoded
    await Promise.all(blenderHolders(slide).map(h => { const im = h.querySelector('img.bb-blender-img');
      return im && im.decode ? im.decode().catch(() => {}) : null; }));
    blenderHolders(slide).forEach(h => placeBlenderLabels(h, 0));
  }
  /* Place now, and again once the render has actually decoded: the silhouette is read FROM the picture, so a
     first pass that ran before the <img> was ready would have placed every label on its hint alone. */
  function refreshBlenderLabels(h) {
    placeBlenderLabels(h, 0);
    const im = h.querySelector('img.bb-blender-img');
    if (im && !(im.complete && im.naturalWidth)) im.addEventListener('load', () => placeBlenderLabels(h, 0), { once: true });
    const v = h.querySelector('video.bb-blender-video');
    if (v) v.addEventListener('loadeddata', () => { if (v.paused) placeBlenderLabels(h, 0); }, { once: true });
  }
  let blenderResizePending = false;
  function placeAllBlenderLabels() {
    document.querySelectorAll('.bb-blender[data-filled]:not([data-baked])').forEach(h => {
      const v = blenderVideo(h);
      placeBlenderLabels(h, v && !v.paused ? v.currentTime : 0);
    });
  }
  addEventListener('resize', () => {         // the holder's pixels changed, so every placement is stale
    if (blenderResizePending) return;
    blenderResizePending = true;
    requestAnimationFrame(() => { blenderResizePending = false; placeAllBlenderLabels(); });
  });

  /* ---------------- capture (?capture) and still frames (?still=n) ---------------- */
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  // Did a holder actually DRAW? (capture contract section 5.) renderSlideAt() skips a holder whose scene threw, so
  // before this a dead scene was invisible to every check: the page still reported ready and finalize still recorded
  // a loop - of the background. A holder counts as drawn when it has a canvas with real pixels, a decoded still <img>
  // (all-slides mode swaps the canvas for one) or a recorded loop video.
  // A canvas counts only if something on it is not transparent: a scene that sets up without throwing but draws nothing
  // (a program that links and outputs zero alpha, a camera aimed at empty space) has the right size and no pixels.
  // Sampled only when a tool drives the page - that is when the WebGL buffer is preserved and can be read back. A
  // canvas that cannot be read (tainted) is taken on its size, as before.
  let probe = null;
  function canvasInked(c) {
    if (!FROZEN) return true;
    try {
      probe = probe || Object.assign(document.createElement('canvas'), { width: 64, height: 36 });
      const g = probe.getContext('2d', { willReadFrequently: true });
      g.clearRect(0, 0, 64, 36);
      g.drawImage(c, 0, 0, 64, 36);
      const px = g.getImageData(0, 0, 64, 36).data;
      for (let i = 3; i < px.length; i += 4) if (px[i] > 0) return true;
      return false;
    } catch (e) { return true; }
  }
  function holderDrawn(el) {
    if (el.hasAttribute('data-fallback')) return false;
    const c = el.querySelector('canvas');
    if (c && c.width > 0 && c.height > 0 && canvasInked(c)) return true;
    if (Array.from(el.querySelectorAll('img')).some(i => i.naturalWidth > 0)) return true;
    return !!el.querySelector('video.aura-loop');
  }
  function healthOf(slide) {
    const hs = Array.from(slide.querySelectorAll('.aura-3d[data-scene], .aura-canvas[data-canvas]'));
    const failed = hs.filter(el => !holderDrawn(el)).map(el => ({
      scene: el.dataset.scene || el.dataset.canvas || '',
      reason: el.getAttribute('data-aura-error') || 'the scene drew nothing',
    }));
    return { holders: hs.length, drawn: hs.length - failed.length, failed };
  }

  function poseCss(root, t) {
    if (!root.getAnimations) return;
    root.getAnimations({ subtree: true }).forEach(a => { try { a.pause(); a.currentTime = t * 1000; } catch (e) { /* ignore */ } });
  }
  async function renderSlideAt(slide, t, still) {
    for (const el of slide.querySelectorAll('.aura-3d[data-scene], .aura-canvas[data-canvas]')) {
      const rec = el.classList.contains('aura-3d') ? await ensure3d(el) : ensureCanvas(el);
      if (!rec || rec.failed) continue;
      running.delete(rec);
      if (rec.kind === '3d') sizeRenderer(rec);
      const tt = still ? stillTime(el) : t;
      if (rec.kind === '3d') render3d(rec, tt, 0); else if (rec.api.update) { rec.api.update(tt, 0); runSync(el, tt); }
      poseCss(el, tt);
    }
  }
  // while a slide is recorded, everything on it except the 3D / canvas holders (and their projected labels) and the
  // decorative backgrounds behind them is visibility:hidden - layout and framing do not move, but slide text never gets
  // baked into the loop video (it stays live HTML over the video in the finalized deck)
  const REC_KEEP = '.aura-3d[data-scene], .aura-canvas[data-canvas], [data-capture="keep"], .bb-grid-bg, .bb-bg, .bb-blobs';
  function markRecording(slide) {
    slides.forEach(x => { if (x !== slide) x.classList.remove('aura-rec'); });
    slide.classList.add('aura-rec');
    slide.querySelectorAll(REC_KEEP).forEach(el => {
      el.setAttribute('data-aura-rec-keep', '');
      // every ancestor between the picture and the slide that actually PAINTS is recorded with it, so the loop
      // carries the surface the picture sits on rather than whatever happened to be behind it.
      for (let a = el.parentElement; a && a !== slide; a = a.parentElement) {
        const cs = getComputedStyle(a);
        const bg = cs.backgroundColor || '';
        const m = bg.match(/rgba?\(([^)]+)\)/);
        const alpha = m ? (m[1].split(/[ ,\/]+/).filter(Boolean).map(parseFloat)[3]) : 1;
        const paints = (m && (alpha === undefined || alpha > 0.01)) || (cs.backgroundImage && cs.backgroundImage !== 'none');
        if (paints) a.setAttribute('data-aura-rec-bg', '');
      }
    });
  }
  function buildCapture() {
    const out = { ready: null, slides: {}, recorded: {} };
    slides.forEach((s, i) => {
      const bl = blenderHolders(s)[0] || s.querySelector('.bb-blender:not([data-baked])');   // a baked one is a live scene (Part B)
      if (bl) out.recorded[i + 1] = { kind: bl.dataset.kind || (blenderVideo(bl) ? 'animation' : 'still'), period: 0, draft: bl.hasAttribute('data-draft'), filled: bl.hasAttribute('data-filled') };
      const holder = holderOf(s);
      if (!holder) return;
      const ps = Array.from(s.querySelectorAll('.aura-3d[data-scene], .aura-canvas[data-canvas]')).map(periodOf).filter(p => p !== null);
      if (!ps.length) return;
      out.slides[i + 1] = {
        period: Math.max(...ps), holder,
        get rect() {
          const sr = s.getBoundingClientRect(), r = holder.getBoundingClientRect();
          return { x: Math.round(r.left - sr.left), y: Math.round(r.top - sr.top), w: Math.round(r.width), h: Math.round(r.height) };
        },
        async seek(t) {
          if (current !== i) go(i, { force: true, noHash: true, fromPeer: true });
          s.classList.remove('is-entering');
          markRecording(s);
          await renderSlideAt(s, +t || 0, false);
          await nextFrame();
        },
        get health() { return healthOf(s); }
      };
    });
    // every slide that has a holder at all, whether or not it is a loop: finalize reads this after seeking a frame
    out.health = () => {
      const r = {};
      slides.forEach((s, i) => { const h = healthOf(s); if (h.holders) r[i + 1] = h; });
      return r;
    };
    return out;
  }
  async function showStill(n) {
    const s = slides[n - 1]; if (!s) return;
    go(n - 1, { force: true, noHash: true, fromPeer: true });
    s.classList.remove('is-entering');
    const loop = !LIVE && loops.get(n);
    if (loop) {
      const v = loopVideo(loop);
      const t = (loop.period || (isFinite(v.duration) ? v.duration : 1)) * 0.35;
      await seekVideo(v, t);
      runSync(loop.holder, t);
    } else await renderSlideAt(s, 0, true);
    await readyBlender(s);
    await nextFrame();
    // auraStillReady keeps its old meaning - the frame is drawn, so photograph it now - and auraStill3d says WHAT was
    // drawn. Before this the flag alone was read as "the 3D is there", which it never promised: a holder whose scene
    // threw is skipped, the page reports ready in milliseconds, and the PDF page ships without its picture.
    const h = healthOf(s);
    html.dataset.auraStill3d = h.failed.length ? 'failed' : 'ok';
    if (h.failed.length) html.dataset.auraStillFailed = h.failed.map(f => f.scene).join(',');
    else delete html.dataset.auraStillFailed;
    html.dataset.auraStillReady = '1';
  }

  // all-slides mode: render each 3D scene once at its still time, keep it as a picture, free the GPU context
  async function renderStills() {
    await Promise.all(slides.map(readyBlender));
    for (const el of document.querySelectorAll('.aura-3d[data-scene]')) {
      const rec = await ensure3d(el);
      if (!rec || rec.failed) continue;
      try {
        render3d(rec, stillTime(el), 0);
        const img = new Image();
        img.alt = ''; img.src = rec.canvas.toDataURL('image/png');
        await img.decode().catch(() => {});
        el.appendChild(img);
      } catch (e) { console.warn('Aura still render failed:', e); }
      dispose3d(rec);
      el._aura = { el, still: true };
    }
    for (const el of document.querySelectorAll('.aura-canvas[data-canvas]')) {
      const rec = ensureCanvas(el);
      if (rec && rec.api.update) { try { rec.api.update(stillTime(el), 0); } catch (e) { console.error(e); } }
    }
  }

  /* ---------------- navigation ---------------- */
  function go(i, opts) {
    opts = opts || {};
    if (!slides.length || ALL) return;
    i = Math.max(0, Math.min(slides.length - 1, i | 0));
    if (i === current && !opts.force) return;
    const prev = slides[current];
    if (prev) { prev.classList.remove('is-current', 'is-entering'); stopPieces(prev); emit('leave', { index: current, slide: prev }); }
    current = i;
    const s = slides[i];
    s.classList.add('is-current');
    s.classList.remove('is-entering'); void s.offsetWidth; s.classList.add('is-entering');   // replay data-anim
    startPieces(s);
    if (!opts.noHash) { try { history.replaceState(null, '', location.pathname + location.search + '#' + (i + 1)); } catch (e) { /* file: urls */ } }
    updateChrome();
    if (!opts.fromPeer) tellPeer();
    if (EMBEDDED) { try { window.parent.postMessage({ aura: 'slide', index: i + 1, count: slides.length }, '*'); } catch (e) { /* cross-origin */ } }
    emit('slide', { index: i, slide: s });
  }
  const next = () => go(current + 1), prev = () => go(current - 1);

  /* ---------------- chrome ---------------- */
  let ui = {};
  const ICONS = {
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    notes: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM8 9h8M8 13h8M8 17h5"/></svg>',
    full: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>'
  };
  function buildChrome() {
    const progress = document.createElement('div');
    progress.className = 'aura-ui aura-progress'; progress.setAttribute('data-aura-ui', '');
    progress.setAttribute('aria-hidden', 'true'); progress.innerHTML = '<i></i>';
    const bar = document.createElement('nav');
    bar.className = 'aura-ui aura-bar'; bar.setAttribute('data-aura-ui', ''); bar.setAttribute('aria-label', 'Slide controls');
    bar.innerHTML = '<button type="button" data-act="prev" aria-label="Previous slide">' + ICONS.prev + '</button>' +
      '<span class="aura-count" aria-live="polite"></span>' +
      '<button type="button" data-act="next" aria-label="Next slide">' + ICONS.next + '</button>' +
      '<button type="button" data-act="notes" aria-label="Speaker notes (N)">' + ICONS.notes + '</button>' +
      '<button type="button" data-act="full" aria-label="Full screen (F)">' + ICONS.full + '</button>';
    bar.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      e.stopPropagation();
      ({ prev, next, notes: toggleNotes, full: toggleFull })[b.dataset.act]();
    });
    const panel = document.createElement('aside');
    panel.className = 'aura-notes-panel'; panel.setAttribute('data-aura-ui', '');
    panel.innerHTML = '<div class="aura-np-head"><span class="aura-np-time" title="Click to restart the timer">0:00</span>' +
      '<span class="aura-np-plan"></span></div><div class="aura-np-next"></div><div class="aura-np-notes"></div>';
    const black = document.createElement('div');
    black.setAttribute('data-aura-ui', ''); black.className = 'aura-ui';
    black.style.cssText = 'inset:0;background:#000;display:none;z-index:60';
    document.body.append(progress, bar, panel, black);
    ui = { progress: progress.firstChild, count: bar.querySelector('.aura-count'), panel, black,
      time: panel.querySelector('.aura-np-time'), plan: panel.querySelector('.aura-np-plan'),
      next: panel.querySelector('.aura-np-next'), notes: panel.querySelector('.aura-np-notes') };
    ui.time.addEventListener('click', () => { t0 = Date.now(); });
  }
  const fmt = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function updateChrome() {
    if (!ui.count) return;
    const n = slides.length;
    ui.count.textContent = (current + 1) + ' / ' + n;
    ui.progress.style.width = (n > 1 ? (current / (n - 1)) * 100 : 100) + '%';
    if (presenter) {
      const meta = info();
      ui.notes.textContent = meta[current] ? meta[current].notes : '';
      ui.next.textContent = meta[current + 1] ? 'Next: ' + (meta[current + 1].title || 'slide ' + (current + 2)) : 'Last slide';
      const before = meta.slice(0, current).reduce((a, m) => a + (m.minutes || 0), 0);
      const here = meta[current] && meta[current].minutes;
      ui.plan.textContent = here ? 'plan ' + fmt(before * 60) + ' to ' + fmt((before + here) * 60) : 'slide ' + (current + 1) + ' of ' + n;
    }
  }
  let t0 = Date.now(), clock = 0;
  function setPresenter(on) {
    presenter = on;
    html.classList.toggle('aura-presenter', on);
    clearInterval(clock);
    if (on) { clock = setInterval(() => { ui.time.textContent = fmt((Date.now() - t0) / 1000); }, 500); }
    fit(); updateChrome();
  }
  function toggleNotes() { setPresenter(!presenter); }
  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else html.requestFullscreen && html.requestFullscreen().catch(() => {});
  }
  function toggleBlack() { ui.black.style.display = ui.black.style.display === 'none' ? 'block' : 'none'; }

  // second window for dual screens: same deck in presenter view, kept in step both ways
  function openPresenterWindow() {
    const url = location.href.split('#')[0].replace(/([?&])aura=[^&]*&?/, '$1').replace(/[?&]$/, '');
    const w = window.open(url + (url.includes('?') ? '&' : '?') + 'aura=presenter#' + (current + 1), 'aura-presenter', 'width=1280,height=760');
    if (w) peer = w;
  }
  function tellPeer() {
    const target = peer && !peer.closed ? peer : (window.opener && !window.opener.closed ? window.opener : null);
    if (target) { try { target.postMessage({ aura: 'go', index: current }, '*'); } catch (e) { /* closed */ } }
  }
  window.addEventListener('message', e => {
    if (!e.data || e.data.aura !== 'go') return;
    if (e.source && e.source !== window) peer = e.source;
    go(e.data.index, { fromPeer: true });
  });

  /* ---------------- input ---------------- */
  let digits = '', digitTimer = 0;
  function onKey(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const k = e.key;
    if (/^[0-9]$/.test(k)) { digits += k; clearTimeout(digitTimer); digitTimer = setTimeout(() => { digits = ''; }, 1500); return; }
    if (k === 'Enter' && digits) { go(parseInt(digits, 10) - 1); digits = ''; e.preventDefault(); return; }
    const map = {
      ArrowRight: next, ArrowDown: next, PageDown: next, ' ': next, Enter: next, l: next,
      ArrowLeft: prev, ArrowUp: prev, PageUp: prev, Backspace: prev, h: prev,
      Home: () => go(0), End: () => go(slides.length - 1),
      f: toggleFull, F: toggleFull, n: toggleNotes, N: toggleNotes, p: openPresenterWindow, P: openPresenterWindow,
      b: toggleBlack, B: toggleBlack, '.': toggleBlack
    };
    if (e.shiftKey && k === ' ') { prev(); e.preventDefault(); return; }
    const fn = map[k];
    if (fn) { e.preventDefault(); fn(); }
  }
  const interactive = el => el.closest('a, button, input, textarea, select, label, [contenteditable="true"], [contenteditable=""], [data-interactive], [data-aura-ui]');
  let down = null;
  function onPointerDown(e) { if (e.button === 0 || e.pointerType === 'touch') down = { x: e.clientX, y: e.clientY, t: Date.now(), type: e.pointerType }; }
  function onPointerUp(e) {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y, d = down; down = null;
    if (interactive(e.target)) return;
    if (EDIT) {                     // editor preview: a click picks the text element, never changes slide
      const el = e.target.closest && e.target.closest('[data-edit]');
      if (el && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        const slide = slides.indexOf(el.closest('.slide')) + 1;
        const msg = { aura: 'edit', id: el.getAttribute('data-edit'), slide, text: el.textContent.replace(/\s+/g, ' ').trim() };
        try { window.parent.postMessage(msg, '*'); } catch (err) { /* not embedded */ }
        emit('edit', msg);
      }
      return;
    }
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) { dx < 0 ? next() : prev(); return; }
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && Date.now() - d.t < 600) {
      if (d.type === 'touch' && e.clientX < innerWidth / 3) prev(); else next();
    }
  }
  let idle = 0;
  function onMove() {
    html.classList.add('aura-show-ui'); html.classList.remove('aura-hide-cursor');
    clearTimeout(idle);
    idle = setTimeout(() => { html.classList.remove('aura-show-ui'); if (document.fullscreenElement) html.classList.add('aura-hide-cursor'); }, 2400);
  }

  /* ---------------- D-02: a browser that cannot run the live 3D ---------------- */
  // The editable deck needs Chrome or Edge (three.js is inlined as a data: module in an import map). A finalized deck plays
  // baked loops instead and needs neither, so the notice only shows when a 3D slide has no loop to play. Presenters get a plain
  // message and the way out (the PDF that Finalize makes), never a silent blank scene.
  function browserNotice(force) {
    const ua = navigator.userAgent || '';
    const chromium = !!(window.chrome || /(Chrome|Chromium|Edg|CriOS)\//.test(ua)) && !/Firefox\/|FxiOS/.test(ua);
    const maps = !(window.HTMLScriptElement && HTMLScriptElement.supports) || HTMLScriptElement.supports('importmap');
    if (chromium && maps && !force) return;
    const live = Array.from(document.querySelectorAll('.aura-3d[data-scene]')).filter(h => {
      const sl = h.closest('.slide'), n = slides.indexOf(sl) + 1; return !loops.has(n); });
    if (!live.length && !force) return;
    if (document.querySelector('.aura-browser-note')) return;
    const b = document.createElement('div');
    b.className = 'aura-ui aura-browser-note'; b.setAttribute('data-aura-ui', ''); b.setAttribute('role', 'alert');
    b.innerHTML = '<b>This browser may not show the 3D scenes.</b> Open this file in Microsoft Edge or Google Chrome, or present from the PDF copy that came with it.' +
      ' <button type="button">OK</button>';
    b.querySelector('button').addEventListener('click', () => b.remove());
    document.body.appendChild(b);
  }

  /* ---------------- start ---------------- */
  function init() {
    deckEl = document.querySelector('.deck') || document.body;
    slides = Array.from(deckEl.querySelectorAll(':scope > .slide'));
    if (!slides.length) slides = Array.from(document.querySelectorAll('.slide'));
    slides.forEach((s, i) => {
      s.setAttribute('aria-roledescription', 'slide');
      s.setAttribute('aria-label', (i + 1) + ' of ' + slides.length);
      s.querySelectorAll('[data-delay]').forEach(el => el.style.setProperty('--d', (parseFloat(el.dataset.delay) || 0) + 'ms'));
    });
    const finish = () => { html.dataset.auraReady = '1'; readyResolve(info()); emit('ready', info()); };
    scanLoops();
    slides.forEach(sl => blenderHolders(sl).forEach(refreshBlenderLabels));
    if (!FROZEN) browserNotice();
    if (FROZEN) {
      fit();
      addEventListener('resize', fit);
      const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
      if (CAPTURE) {
        const cap = buildCapture();
        cap.ready = fontsReady.then(() => cap, () => cap);
        window.LumiCapture = cap;
        go(0, { force: true, noHash: true, fromPeer: true });
        fontsReady.then(finish, finish);
      } else {
        fontsReady.then(() => showStill(STILL_N)).then(finish, finish);
      }
      return;
    }
    if (ALL) {
      Promise.all([document.fonts ? document.fonts.ready : null, renderStills()]).then(finish, finish);
      return;
    }
    buildChrome();
    fit();
    addEventListener('resize', fit);
    addEventListener('keydown', onKey);
    deckEl.addEventListener('pointerdown', onPointerDown);
    addEventListener('pointerup', onPointerUp);
    addEventListener('pointermove', onMove, { passive: true });
    addEventListener('hashchange', () => { const n = parseInt(location.hash.slice(1), 10); if (n) go(n - 1, { noHash: true }); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
    addEventListener('beforeprint', () => html.classList.add('aura-all'));
    addEventListener('afterprint', () => { if (!ALL) html.classList.remove('aura-all'); });
    if (PRESENTER_WINDOW) setPresenter(true);
    const start = parseInt((location.hash || '').slice(1), 10);
    go(start ? start - 1 : 0, { force: true, noHash: !start });
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(finish, finish);
  }

  window.Aura = {
    version: '0.5.0', mode: CAPTURE ? 'capture' : STILL_N ? 'still-frame' : ALL ? 'all' : (PRESENTER_WINDOW ? 'presenter' : (EDIT ? 'edit' : (STILL ? 'still' : 'normal'))), ready,
    scene(id, setup, opts) { sceneDefs.set(id, setup); if (opts) sceneOpts.set('3d:' + id, opts); },
    sceneSource: id => { const f = sceneDefs.get(id); return f ? String(f) : ''; },       // the checker reads a scene's code (banned props)
    browserNotice,
    canvas(id, setup, opts) { canvasDefs.set(id, setup); if (opts) sceneOpts.set('2d:' + id, opts); },
    period: el => periodOf(el),
    sync(id, fn) { syncDefs.set(id, fn); },
    go: n => go(n - 1), next: () => next(), prev: () => prev(),
    current: () => current + 1, slides: info,
    on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); return () => { listeners[type] = listeners[type].filter(f => f !== fn); }; }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else setTimeout(init, 0);
})();
