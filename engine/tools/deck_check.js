#!/usr/bin/env node
// Aura deck check: renders a deck in Microsoft Edge with every slide shown and checks each slide against the HARD RULE
// (no text under 26 px) and the power-design slide rules that can be measured. Saves one PNG per slide plus an
// overview sheet to .aura/temp/shots/<deck>/ so the slides can be looked at.
//   node .aura/engine/tools/deck_check.js <build folder | deck.html> [--mode presenter|document] [--notes] [--no-shots] [--stills] [--finalize]
// --finalize: the deck is about to be finalized, so a Blender slide with no render yet, or showing only a preview, is an ERROR (a warning while building).
// The deck is served over http and probed after it loads (probeRender): a deck that did not finish drawing, or whose 3D scenes fell
// back, is reported - and a check that could not render the deck exits 2, never 0. --stills also tries candidate PDF still frames.
// Also checks (Batch E): every number is traceable (lib/claims.js + provenance.json), banned 3D props, an empty half-column, one .em per
// headline, speaker-note length, the title slide's required fields (from the brief), contrast against a fixed frame with a fix hex.
// Exit code 0 = no errors (warnings are advice), 1 = errors to fix, 2 = the check itself could not run.
'use strict';
const fs = require('fs'), path = require('path');
const { findAuraRoot, resolveDeck, serveRootFor, serve, launch, openDeck, probeRender, rel } = require('./lib/deckpage');
const claims = require('./lib/claims');
const blenderCheck = require('./lib/blender_check');
const editIds = require('./lib/edit_ids');

const RULES = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rules', 'hard-rules.json'), 'utf8')); } catch (e) { return {}; } })();
const MIN_PX = RULES.minFontPx || 26;
const LOOKS = RULES.looks || {};
// generic Lumi thresholds come from hard-rules.json -> generic (the one home of every number); a look listed in
// hard-rules.json -> looks replaces them with its own measured numbers. The literals below are only a fallback for a
// damaged rules file.
const GENERIC = Object.assign({ minFontPx: MIN_PX, svgTolerancePx: 0, bodyMinPx: 0, bodyMinExempt: '',
  typeScale: [28, 36, 48, 64, 84, 112, 150, 200],
  wordBudget: { title: 45, section: 8, content: 25, quote: 30, closing: 20, references: 140, document: 75 },
  whitespace: { title: 0.6, section: 0.6, quote: 0.7, closing: 0.6, content: 0.4, references: 0.3 },
  maxTypefaces: 4, maxSizesPerSlide: 4, maxSizesPerDeck: 6 }, RULES.generic || {}, { minFontPx: MIN_PX });

const argv = process.argv.slice(2);
const flag = n => { const i = argv.indexOf(n); if (i < 0) return false; argv.splice(i, 1); return true; };
const val = n => { const i = argv.indexOf(n); return i >= 0 ? argv.splice(i, 2)[1] : null; };
const wantFinalize = flag('--finalize'), wantNotes = flag('--notes'), noShots = flag('--no-shots'), wantStills = flag('--stills'), modeArg = val('--mode');
// L-15 reads the identity from THIS deck's interview, not the whole library's old brief. The deck id cannot be read off
// a build folder path, so the caller names the file: --interview .aura/decks/<id>/interview.json. Without it the old
// .aura/brief/brief.json is used, exactly as before, which is what keeps a v0.5.3 deck behaving the same.
const interviewArg = val('--interview');
// --blender-slides <sid,sid,...>: the slides the SERVER will really render in Blender (form_server.blender_args). With it,
// a `.bb-blender` holder whose id is not in the list is an orphan - no render will ever fill it - and that is an ERROR right
// after the build step instead of a raw failure at the end of a finalize. Without it nothing changes (a hand-run check).
const blenderSlidesArg = val('--blender-slides');

/* ------------------------------------------------------------------ in-page measuring ------------------------------- */
function collect({ MIN_PX, TOL, BODY_MIN, BODY_EXEMPT, ILLUS }) {
  const SKIP = '[data-aura-notes], .notes, .pnotes, [data-aura-ui], script, style, template, noscript';
  const slides = Array.from(document.querySelectorAll('.deck > .slide, body > .slide'));
  const parseRGBA = s => { const m = (s || '').match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(parseFloat); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const declared = new Set(); if (document.fonts) document.fonts.forEach(f => declared.add(f.family.replace(/["']/g, '')));
  const failedFonts = []; if (document.fonts) document.fonts.forEach(f => { if (f.status === 'error') failedFonts.push(f.family.replace(/["']/g, '')); });
  const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-\w+|emoji|math|fangsong|-apple-system|segoe ui|arial|helvetica|georgia|times new roman|consolas|impact)$/i;
  window.__auraItems = [];
  const out = slides.map((s, si) => {
    const sr = s.getBoundingClientRect();
    const items = [], seen = new Map();
    const w = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) {
      const t = n.textContent.replace(/\s+/g, ' ').trim(); if (!t) continue;
      const el = n.parentElement; if (!el || el.closest(SKIP)) continue;
      let it = seen.get(el);
      if (!it) { it = { el, text: '', rects: [] }; seen.set(el, it); items.push(it); }
      it.text += (it.text ? ' ' : '') + t;
      const r = document.createRange(); r.selectNodeContents(n);
      for (const cr of r.getClientRects()) if (cr.width > 0.5 && cr.height > 0.5)
        it.rects.push({ x: cr.left - sr.left, y: cr.top - sr.top, w: cr.width, h: cr.height });
    }
    const fonts = new Set(), sizes = new Set();
    let words = 0;
    const res = { tiny: [], small: [], unsafe: [], clipped: [], overlaps: [], systemFonts: [], gradientText: 0 };
    items.forEach(it => {
      const el = it.el, cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize); let eff = fs;
      if (el.closest('svg')) {
        let k = null; try { const m = el.getScreenCTM(); if (m) k = Math.hypot(m.a, m.b); } catch (e) { /* not rendered */ }
        if (!k) { const svg = el.closest('svg'), vb = svg.viewBox && svg.viewBox.baseVal;
          k = vb && vb.width ? (svg.width.baseVal.value || vb.width) / vb.width : 1; }
        eff = fs * k;
      } else if (el.offsetWidth > 0) { const k = el.getBoundingClientRect().width / el.offsetWidth; if (Math.abs(k - 1) > 0.02) eff = fs * k; }   // CSS transforms (scale); ignore sub-pixel rounding
      it.px = Math.round(eff * 10) / 10;
      if (eff < MIN_PX - Math.max(0.01, TOL)) res.tiny.push({ text: it.text.slice(0, 60), px: it.px });
      else if (BODY_MIN && eff < BODY_MIN - 0.5 && !(BODY_EXEMPT && el.closest(BODY_EXEMPT))) res.small.push({ text: it.text.slice(0, 60), px: it.px });
      const visible = it.rects.length && cs.visibility !== 'hidden';
      if (!visible) return;
      sizes.add(Math.round(eff));
      const fam = cs.fontFamily.split(',')[0].trim().replace(/["']/g, '');
      fonts.add(fam);
      if (!declared.has(fam)) res.systemFonts.push(fam);
      words += it.text.split(/\s+/).filter(x => /[A-Za-zÀ-ɏͰ-ϿЀ-ӿঀ-৿]/.test(x)).length;
      // union box, safe zone, clipping
      const L = Math.min(...it.rects.map(r => r.x)), T = Math.min(...it.rects.map(r => r.y));
      const R = Math.max(...it.rects.map(r => r.x + r.w)), B = Math.max(...it.rects.map(r => r.y + r.h));
      it.box = { x: L, y: T, w: R - L, h: B - T };
      if (L < 94 || T < 94 || R > 1826 || B > 986) res.unsafe.push({ text: it.text.slice(0, 50), box: [L, T, R, B].map(Math.round) });
      for (let a = el; a && a !== s.parentElement; a = a.parentElement) {
        const acs = getComputedStyle(a);
        if (a === s || acs.overflowX !== 'visible' || acs.overflowY !== 'visible') {
          const ar = a.getBoundingClientRect();
          const ax = ar.left - sr.left, ay = ar.top - sr.top;
          if (L < ax - 2 || T < ay - 2 || R > ax + ar.width + 2 || B > ay + ar.height + 2) { res.clipped.push({ text: it.text.slice(0, 50) }); break; }
        }
      }
      // colour for the contrast pass
      let alpha = 1;
      for (let a = el; a && a !== s.parentElement; a = a.parentElement) alpha *= parseFloat(getComputedStyle(a).opacity);
      let col;
      if (el.closest('svg')) {
        col = parseRGBA(cs.fill); if (col) col[3] *= parseFloat(cs.fillOpacity || 1);
      } else {
        const fill = cs.webkitTextFillColor; col = parseRGBA(fill && !/currentcolor/i.test(fill) ? fill : cs.color);
        if (/text/.test(cs.backgroundClip || cs.webkitBackgroundClip || '')) { col = null; res.gradientText++; }
      }
      if (col && col[3] * alpha > 0.05) {
        // text sitting on a DOM-painted box (a pill, a card) is not over the picture: candidate-still frames cannot judge it
        let dom = false;
        for (let a2 = el; a2 && a2 !== s; a2 = a2.parentElement) { const c2 = getComputedStyle(a2), bg2 = parseRGBA(c2.backgroundColor); if ((bg2 && bg2[3] > 0.05) || c2.backgroundImage !== 'none') { dom = true; break; } }
        window.__auraItems.push({ si, dom, text: it.text.slice(0, 50), rgb: col.slice(0, 3), a: col[3] * alpha, rects: it.rects, px: it.px });
      }
    });
    // overlapping text lines from unrelated elements
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const A = items[i], B = items[j];
      if (!A.box || !B.box || A.el.contains(B.el) || B.el.contains(A.el)) continue;
      let hit = false;
      for (const a of A.rects) { for (const b of B.rects) {
        const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ix > 0 && iy > 0 && ix * iy > 0.3 * Math.min(a.w * a.h, b.w * b.h)) { hit = true; break; } } if (hit) break; }
      if (hit) res.overlaps.push([A.text.slice(0, 30), B.text.slice(0, 30)]);
    }
    // the clash matrix: ONE main visual per slide (3D, chart, diagram or photo; none = text only) plus the companions
    // its layout supports
    const area = el => { const r = el.getBoundingClientRect(); return r.width * r.height; };
    const visuals = [];
    s.querySelectorAll('.aura-3d').forEach(el => { if (!el.parentElement.closest('.aura-3d')) visuals.push('3D'); });
    s.querySelectorAll('.bb-blender:not(.aura-3d)').forEach(() => visuals.push('3D'));        // a studio render (Blender) is the slide's 3D picture; a baked one is also .aura-3d, counted once
    s.querySelectorAll('.bb-chart, [data-visual="chart"]').forEach(() => visuals.push('chart'));
    // a 2D canvas loop (.aura-canvas) is an animated diagram: it counts as the slide's diagram, never as a sixth kind
    // C-11: on a slide that already has a 3D scene a 2D canvas is part of that motion visual (an overlay or a loop), not a second main visual
    const has3d = s.querySelector('.aura-3d[data-scene]');
    s.querySelectorAll(has3d ? '[data-visual="diagram"]' : '[data-visual="diagram"], .aura-canvas').forEach(el => { if (!el.parentElement.closest('[data-visual="diagram"], .aura-canvas')) visuals.push('diagram'); });
    const photos = new Set(s.querySelectorAll('.bb-photo, [data-visual="photo"]'));
    s.querySelectorAll('img').forEach(im => { if (!im.closest('.bb-photo, [data-visual="photo"], .bb-inset, .aura-3d, .aura-canvas, .bb-blender, .bb-mark, .bb-logo, [data-logo], .bb-foot') && area(im) > 1920 * 1080 * 0.15) photos.add(im); });
    photos.forEach(() => visuals.push('photo'));
    const companions = { stats: s.querySelectorAll('.bb-stats > li').length, steps: s.querySelectorAll('.bb-steps > li').length, chips: s.querySelectorAll('.bb-chips > li').length,
      insets: s.querySelectorAll('.bb-inset').length, goals: s.querySelectorAll('.bb-goals > li').length, zones: s.querySelectorAll('.bb-zones > li').length,
      tags: s.querySelectorAll('.aura-3d [data-follow], .bb-blender [data-anchor]').length, has3d: s.querySelectorAll('.aura-3d[data-scene]').length };
    const broken = Array.from(s.querySelectorAll('img')).filter(im => im.complete && im.naturalWidth === 0).map(im => (im.getAttribute('src') || '').slice(0, 60));
    const has3dFallback = s.querySelectorAll('.aura-3d[data-fallback]').length;
    const notesEl = s.querySelector('[data-aura-notes], .notes');
    // Batch E: what the node-side judges need (numbers, props, empty columns, headline accents, figures)
    const claimText = items.filter(it => !it.el.closest('.bb-foot, .bb-pageno, .bb-mark, [data-nonclaim]')).map(it => it.text).join(' \n ');
    const PROPS = /\b(M\.wood|plinth|wooden|walnut|display stand|pedestal|gauge|vial|beaker|test[- ]?tube|lab bench)\b/gi;
    const props = [];
    s.querySelectorAll('.aura-3d[data-scene]').forEach(hd => {
      const src = window.Aura && Aura.sceneSource ? Aura.sceneSource(hd.dataset.scene) : '';
      (src.match(PROPS) || []).forEach(m => { if (!props.includes(m.toLowerCase())) props.push(m.toLowerCase()); });
    });
    const MEDIA = 'img, svg, canvas, video, .aura-3d, .aura-canvas, .bb-blender, .bb-chart, .bb-photo, .bb-studio, [data-visual]';
    const emptyCols = Array.from(s.querySelectorAll('.bb-l, .bb-r')).filter(c => !c.textContent.trim() && !c.querySelector(MEDIA) && !c.matches(MEDIA)).length;
    const headlines = Array.from(s.querySelectorAll('h1, h2, .headline, .title')).filter(h => h.textContent.trim()).map(h => ({ text: h.textContent.replace(/\s+/g, ' ').trim().slice(0, 40), em: h.querySelectorAll('.em').length }));
    const figures = Array.from(s.querySelectorAll('img, [data-figure]')).map(im => ({ src: (im.getAttribute('src') || '').slice(0, 120), figure: im.dataset.figure || '',
      crop: (im.dataset.crop || '').split(/[ ,]+/).map(Number).filter(v => !isNaN(v)).length === 4 ? im.dataset.crop.split(/[ ,]+/).map(Number) : null }));
    const slideEmpty = s.querySelectorAll('.bb-steps > li').length;
    const title = s.dataset.title || ((s.querySelector('h1,h2,h3') || {}).textContent || '').replace(/\s+/g, ' ').trim();
    const stillEl = s.querySelector('[data-still]');
    return { index: si, title: title.slice(0, 70), still: stillEl ? parseFloat(stillEl.dataset.still) : null, claimText, notesText: notesEl ? notesEl.textContent.replace(/\s+/g, ' ').trim() : '', props, emptyCols, headlines, figures,
      illustrative: new RegExp(ILLUS.source, ILLUS.flags).test(claimText) || !!s.querySelector('[data-illustrative]'),
      kind: s.dataset.kind || 'content', words, sizes: [...sizes].sort((a, b) => a - b),
      fonts: [...fonts], broken, has3dFallback, visuals, companions, hasNotes: !!(notesEl && notesEl.textContent.trim()),
      minutes: parseFloat(s.dataset.minutes) || 0, w: Math.round(sr.width), h: Math.round(sr.height), ...res };
  });
  // text that sits outside every slide (not runtime chrome)
  const stray = [];
  const w2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w2.nextNode());) {
    const el = n.parentElement; if (!el || !n.textContent.trim() || el.closest(SKIP) || el.closest('.slide')) continue;
    stray.push(n.textContent.trim().slice(0, 40));
  }
  const deck = document.querySelector('.deck');
  return { slides: out, stray, failedFonts: [...new Set(failedFonts)], mode: deck && deck.dataset.mode || 'presenter', runtime: !!window.Aura };
}

// contrast + whitespace from screenshots (one with text hidden, one normal)
async function analysePixels({ si, plain, normal, bareOnly }) {
  const load = src => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = 'data:image/png;base64,' + src; });
  const pix = async b64 => { const im = await load(b64); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0); return { d: x.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height }; };
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => { const A = lum(a), B = lum(b); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); };
  const out = { contrast: [], whitespace: null };
  if (plain) {
    const P = await pix(plain);
    for (const it of window.__auraItems.filter(i => i.si === si && !(bareOnly && i.dom))) {
      const rs = [];
      for (const r of it.rects) {
        const cols = Math.max(3, Math.min(14, Math.round(r.w / 36))), rows = 3;
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
          const x = Math.round(r.x + (i + 0.5) * r.w / cols), y = Math.round(r.y + r.h * (0.25 + j * 0.25));
          if (x < 0 || y < 0 || x >= P.w || y >= P.h) continue;
          const k = (y * P.w + x) * 4, bg = [P.d[k], P.d[k + 1], P.d[k + 2]];
          const fg = it.rgb.map((c, n) => it.a * c + (1 - it.a) * bg[n]);
          rs.push({ r: ratio(fg, bg), bg, fg });
        }
      }
      if (!rs.length) continue;
      rs.sort((a, b) => a.r - b.r);
      const pick = rs[Math.floor(rs.length * 0.1)], worst = pick.r;
      // L-03: say what to change. The colour that would clear 4.5:1 on the background that was measured (walk the text colour
      // towards black on a light background, towards white on a dark one), so one edit is enough.
      const hex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
      const target = it.px >= 48 ? 3 : 4.5, lightBg = lum(pick.bg) > 0.4, end = lightBg ? [0, 0, 0] : [255, 255, 255];
      let fix = null;
      if (worst < target) for (let k = 0.05; k <= 1.0001; k += 0.05) {
        const c = pick.fg.map((v, n) => v + (end[n] - v) * k); if (ratio(c, pick.bg) >= target + 0.1) { fix = hex(c); break; } }
      out.contrast.push({ text: it.text, ratio: Math.round(worst * 100) / 100, px: it.px, bg: hex(pick.bg), fg: hex(pick.fg), fix });
    }
  }
  if (normal) {
    const N = await pix(normal), counts = new Map();
    const step = 6, key = k => (N.d[k] >> 3) + ',' + (N.d[k + 1] >> 3) + ',' + (N.d[k + 2] >> 3);
    let total = 0;
    for (let y = 0; y < N.h; y += step) for (let x = 0; x < N.w; x += step) { const k = (y * N.w + x) * 4, q = key(k); counts.set(q, (counts.get(q) || 0) + 1); total++; }
    let best = null, bc = 0; counts.forEach((v, q) => { if (v > bc) { bc = v; best = q; } });
    const ref = best.split(',').map(v => v * 8 + 4);
    let near = 0;
    for (let y = 0; y < N.h; y += step) for (let x = 0; x < N.w; x += step) {
      const k = (y * N.w + x) * 4;
      if (Math.abs(N.d[k] - ref[0]) + Math.abs(N.d[k + 1] - ref[1]) + Math.abs(N.d[k + 2] - ref[2]) < 30) near++;
    }
    out.whitespace = Math.round(near / total * 100) / 100;
  }
  return out;
}

/* ------------------------------------------------------------------ main ------------------------------------------- */
(async () => {
  let deck;
  try { deck = resolveDeck(argv[0]); } catch (e) { console.error(e.message); process.exit(2); }
  const auraRoot = findAuraRoot(deck);
  const name = path.basename(deck) === 'index.html' ? path.basename(path.dirname(deck)) : path.basename(deck, path.extname(deck));
  const shotsDir = path.join(auraRoot || path.dirname(deck), auraRoot ? '.aura/temp/shots' : '_shots', name.replace(/[^\w.-]+/g, '-'));
  const server = await serve(serveRootFor(deck));
  const browser = await launch();
  const errors = [], warnings = [], net = [];
  const err = (s, m) => errors.push({ slide: s, msg: m }), warn = (s, m) => warnings.push({ slide: s, msg: m });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('console', m => {
      if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) net.push('console error: ' + m.text().slice(0, 160));
      else if (m.type() === 'warning' && /^Aura /.test(m.text())) net.push(m.text().slice(0, 200));
    });
    page.on('pageerror', e => net.push('script error: ' + String(e.message).split('\n')[0].slice(0, 160)));
    await page.route('**/*', route => {
      const u = route.request().url();
      if (u.startsWith(server.origin) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
      net.push('needs the internet (blocked): ' + u.slice(0, 120));
      return route.abort();
    });
    page.on('response', r => { if (r.status() >= 400) net.push('missing file (' + r.status() + '): ' + decodeURIComponent(r.url().replace(server.origin, '')).slice(0, 120)); });

    await openDeck(page, server.url(deck));
    const probe = await probeRender(page);
    if (probe.problem) { console.error('The deck check could not verify the deck: ' + probe.problem + '. Nothing was passed.'); process.exitCode = 2; return; }
    const lookInfo = await page.evaluate(() => {
      const h = document.documentElement;
      return { token: getComputedStyle(h).getPropertyValue('--aura-look').trim().toLowerCase(), declared: (h.getAttribute('data-look') || '').trim().toLowerCase() };
    });
    const lookKey = lookInfo.token && LOOKS[lookInfo.token] && (!lookInfo.declared || lookInfo.declared === lookInfo.token) ? lookInfo.token : null;
    const P = Object.assign({}, GENERIC, lookKey ? LOOKS[lookKey] : {});
    P.wordBudget = Object.assign({}, GENERIC.wordBudget, lookKey ? LOOKS[lookKey].wordBudget : {});
    P.whitespace = Object.assign({}, GENERIC.whitespace, lookKey ? LOOKS[lookKey].whitespace : {});
    if (lookInfo.declared && LOOKS[lookInfo.declared] && lookInfo.declared !== lookInfo.token)
      warnings.push({ slide: 0, msg: `the deck says data-look="${lookInfo.declared}" but that look's theme stylesheet is not loaded, so the generic Lumi rules apply.` });
    const info = await page.evaluate(collect, { MIN_PX: P.minFontPx, TOL: P.svgTolerancePx || 0, BODY_MIN: P.bodyMinPx || 0, BODY_EXEMPT: P.bodyMinExempt || '', ILLUS: { source: claims.DECLARES.illustrative.source, flags: claims.DECLARES.illustrative.flags } });
    if (!info.slides.length) { console.error('No slides found. Each slide must be a <section class="slide"> inside <main class="deck">.'); process.exit(1); }
    const mode = modeArg || info.mode;

    // screenshots: normal (kept for review) and with the text hidden (for contrast)
    const handles = await page.$$('.deck > .slide, body > .slide');
    const shots = [], normals = [];
    if (!noShots) { fs.mkdirSync(shotsDir, { recursive: true }); for (const f of fs.readdirSync(shotsDir)) if (/\.png$/.test(f)) fs.unlinkSync(path.join(shotsDir, f)); }
    for (let i = 0; i < handles.length; i++) {
      const buf = await handles[i].screenshot({ animations: 'disabled' });
      normals.push(buf.toString('base64'));
      if (!noShots) { const f = path.join(shotsDir, 'slide-' + String(i + 1).padStart(2, '0') + '.png'); fs.writeFileSync(f, buf); shots.push(f); }
    }
    await page.addStyleTag({ content: '.aura-check-hide .slide, .aura-check-hide .slide * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; text-decoration-color: transparent !important; }' +
      '.aura-check-hide .slide svg text, .aura-check-hide .slide svg tspan, .aura-check-hide .slide svg textPath { fill: transparent !important; stroke: transparent !important; }' });
    await page.evaluate(() => document.documentElement.classList.add('aura-check-hide'));
    await page.waitForTimeout(50);
    const pixels = [];
    for (let i = 0; i < handles.length; i++) {
      const plain = (await handles[i].screenshot({ animations: 'disabled' })).toString('base64');
      pixels.push(await page.evaluate(analysePixels, { si: i, plain, normal: normals[i] }));
    }

    // judge every slide
    const deckSizes = new Set(), deckFonts = new Set();
    let minutes = 0;
    info.slides.forEach((s, i) => {
      const n = i + 1, px = pixels[i];
      s.sizes.forEach(v => deckSizes.add(v)); s.fonts.forEach(f => deckFonts.add(f)); minutes += s.minutes;
      s.tiny.forEach(t => err(n, `HARD RULE: text is ${t.px}px (minimum ${P.minFontPx}px${lookKey ? ' for ' + P.name : ''}): "${t.text}"`));
      s.small.forEach(t => (P.bodyMinIsError ? err : warn)(n, `text is ${t.px}px; ${P.name || 'this look'} keeps text at ${P.bodyMinPx}px or more (only the footer, page number, captions and chart step labels may be smaller): "${t.text}"`));
      // clash matrix (every look): one main visual, and only the companions its layout supports
      const kinds = s.visuals, main = kinds[0] || 'text', c = s.companions;
      if (kinds.length > 1) err(n, `${kinds.length} main visuals (${kinds.join(', ')}); a slide has ONE main visual. Swap one out, or put it on its own slide.`);
      if (c.stats > 3) err(n, `${c.stats} stats / facts; a slide holds at most 3 next to its main visual.`);
      if (c.steps > 5) err(n, `${c.steps} steps; a numbered process list holds at most 5.`);
      if (c.chips > 3) err(n, `${c.chips} chips; a chart takes at most 3 annotation chips.`);
      if (c.chips && main !== 'chart') err(n, `annotation chips go with a chart; this slide's main visual is ${main}.`);
      if (c.insets > 1) err(n, `${c.insets} inset pictures; a photo slide takes one inset.`);
      if (c.insets && main !== 'photo') err(n, `an inset picture goes with a photo; this slide's main visual is ${main}.`);
      if (c.zones > 3) err(n, `${c.zones} zone rows; a photo slide takes at most 3.`);
      if (c.goals > 4) err(n, `${c.goals} checklist rows; at most 4.`);
      if (c.tags > 4) warn(n, `${c.tags} projected labels on the 3D; 2-4 read best.`);
      s.unsafe.forEach(t => err(n, `text inside the 96 px edge safe zone ${JSON.stringify(t.box)}: "${t.text}"`));
      s.clipped.forEach(t => err(n, `text is cut off by its box or the slide edge: "${t.text}"`));
      s.broken.forEach(src => err(n, `picture did not load: ${src}`));
      const BUDGET = P.wordBudget, kind = BUDGET[s.kind] ? s.kind : 'content';
      const budget = kind === 'content' && mode === 'document' ? BUDGET.document : BUDGET[kind];
      if (s.words > budget) err(n, `${s.words} words; a ${kind} slide in ${mode} mode allows ${budget}. Cut words or split the slide.`);
      px.contrast.forEach(c => {
        // L-04: 3 to 4:1 is unreadable from the back of a hall, so it is an error, not advice. Large text (48 px and up) may be 3:1.
        const large = c.px >= 48, floor = large ? (P.contrastLargeErrorBelow || 3) : (P.contrastErrorBelow || 4), hint = c.fix
          ? ` Measured on the fixed frame: text ${c.fg} on ${c.bg}. Set the text colour to ${c.fix}, or darken/lighten what is behind it.` : ` Measured: text ${c.fg} on ${c.bg}.`;
        if (c.ratio < floor) err(n, `contrast ${c.ratio}:1 is too low (needs ${large ? 3 : 4.5}:1): "${c.text}".${hint}`);
        else if (c.ratio < (large ? 3 : (P.contrastWarnBelow || 4.5))) warn(n, `contrast ${c.ratio}:1, aim for 4.5:1 or more (7:1 for projectors): "${c.text}".${hint}`);
      });
      // Batch E rules (L-07, L-15, L-14): banned default props, empty half-column, one accent phrase per headline, note length
      const propsAllowed = w => (s.claimText + ' ' + s.notesText + ' ' + s.title).toLowerCase().includes(w.replace(/^m\./, ''));
      const badProps = s.props.filter(w => !propsAllowed(w)); if (badProps.length) [badProps.join('", "')].forEach(w => err(n, `the 3D scene uses a default prop ("${w}") that the slide is not about. Show the real subject in its own setting; a wooden base, stand, gauge, vial or lab bench is only for a slide whose subject IS that (LOOK.md 4.0).`));
      if (s.emptyCols && !kinds.length) err(n, `a half-column (.bb-l / .bb-r) is empty and nothing else fills the slide: put a picture or drawing in it, or drop the column and centre the message.`);
      s.headlines.forEach(h => { if (h.em > 1) err(n, `headline "${h.text}" has ${h.em} accent phrases (.em); exactly one per headline.`); });
      if (s.notesText) { const nw = s.notesText.split(/\s+/).filter(Boolean).length;
        if (nw < 60 || nw > 300) (nw < 30 || nw > 450 ? err : warn)(n, `speaker notes are ${nw} words; write 60-300 words the presenter can speak.`); }
      if (s.sizes.length > P.maxSizesPerSlide) warn(n, `${s.sizes.length} text sizes (${s.sizes.join(', ')} px); use at most ${P.maxSizesPerSlide} per slide.`);
      const off = s.sizes.filter(v => !P.typeScale.some(k => Math.abs(k - v) <= 1));
      if (off.length) warn(n, `text sizes not on the type scale ${P.typeScale.filter(v => v <= 112 || lookKey).join('/')}: ${off.join(', ')} px.`);
      const needWs = P.whitespace[s.kind] || P.whitespace.content || 0.4;
      if (px.whitespace !== null && px.whitespace < needWs - 0.05) warn(n, `only ${Math.round(px.whitespace * 100)}% empty space (aim for ${Math.round(needWs * 100)}%).`);
      s.overlaps.forEach(o => warn(n, `texts overlap: "${o[0]}" and "${o[1]}"`));
      [...new Set(s.systemFonts)].forEach(f => warn(n, `"${f}" is not an embedded font; use a font from .aura/engine/fonts so it looks the same everywhere.`));
      if (s.gradientText) warn(n, `${s.gradientText} gradient text item(s): contrast not measured; avoid gradients on text.`);
      if (s.has3dFallback) err(n, `a 3D scene did not start (the reason is listed under deck); fix it or turn it into a 2D illustration.`);
      if (wantNotes && !s.hasNotes) warn(n, 'no speaker notes yet.');
      if (s.w !== 1920 || s.h !== 1080) err(n, `slide is ${s.w} x ${s.h}; slides must be exactly 1920 x 1080.`);
    });
    // B-05 / L-05: every number traceable (the user's files, or a provenance entry, or visibly illustrative)
    // This deck's own extracted text, beside the interview.json the caller named. A deck from before per-deck folders has
    // no such folder, and falls back to the shared .aura/temp/text it has always read.
    const deckText = interviewArg ? path.join(path.dirname(path.isAbsolute(interviewArg) ? interviewArg : path.join(auraRoot || '.', interviewArg)), 'text') : null;
    const textDir = deckText && fs.existsSync(deckText) ? deckText : null;
    const corpus = claims.loadCorpus(auraRoot, textDir), prov = claims.loadProvenance(deck, auraRoot);
    let briefJson = null; try { briefJson = JSON.parse(fs.readFileSync(path.join(auraRoot || '', '.aura', 'brief', 'brief.json'), 'utf8')); } catch (e) { /* no brief */ }
    const verdict = claims.judge({ slides: info.slides.map((s, i) => ({ n: i + 1, text: s.claimText, notes: s.notesText, visibleIllustrative: s.illustrative, figures: s.figures })), corpus, prov, brief: briefJson });
    verdict.errors.forEach(x => err(x.slide, x.msg)); verdict.warnings.forEach(x => warn(x.slide, x.msg));
    if (!corpus.files && verdict.stat.numbers) warn(0, 'no extracted text of this deck\'s files was found, so every number needed a provenance entry; if you did add files, they were not read.');
    // L-15: the title slide carries the names the interview established - and only those. When this deck's
    // interview.json is named, its `identity` wins; otherwise the old brief is read and nothing changes.
    let identityOf = briefJson;
    if (interviewArg) {
      try {
        const iv = JSON.parse(fs.readFileSync(path.isAbsolute(interviewArg) ? interviewArg : path.join(auraRoot || '.', interviewArg), 'utf8'));
        const ivId = iv && iv.identity && typeof iv.identity === 'object' ? iv.identity : {};
        const est = Array.isArray(ivId.established) ? ivId.established : [];
        const flat = [];
        for (const f of est) {
          const v = ivId[f];
          if (Array.isArray(v)) v.forEach(x => { const s = typeof x === 'object' && x ? x.name : x; if (s && String(s).trim()) flat.push({ label: f.replace(/s$/, ''), value: String(s) }); });
          else if (v != null && String(v).trim()) flat.push({ label: f, value: String(v) });
        }
        identityOf = { identity: flat };
      } catch (e) { warn(0, `could not read the interview file "${interviewArg}"; the title-slide check fell back to the old brief.`); }
    }
    const ti = info.slides.findIndex(x => x.kind === 'title'), tsl = info.slides[ti >= 0 ? ti : 0];
    if (tsl && identityOf) { const miss = claims.titleFields(identityOf, tsl.claimText); if (miss.length) err((ti >= 0 ? ti : 0) + 1, `the title slide is missing what the brief gives: ${miss.join('; ')}. These are required on the title slide, not a suggestion to offer later.`); }
    if (deckFonts.size > P.maxTypefaces) err(0, `${deckFonts.size} typefaces (${[...deckFonts].join(', ')}); ${lookKey ? P.name + ' uses' : 'Aura allows'} at most ${P.maxTypefaces}.`);
    if (deckSizes.size > P.maxSizesPerDeck) warn(0, `${deckSizes.size} text sizes across the deck (${[...deckSizes].sort((a, b) => a - b).join(', ')}); aim for ${P.maxSizesPerDeck} or fewer.`);
    info.failedFonts.forEach(f => err(0, `font "${f}" failed to load (check its url).`));
    info.stray.forEach(t => err(0, `text outside any slide: "${t}"`));
    [...new Set(net)].forEach(m => err(0, m));
    if (!info.runtime) warn(0, 'the Aura runtime is not loaded: no navigation, notes or animation replay.');

    // studio renders (Blender): present, right size, background = the slide's colour, not black / blank, seamless, within budget
    const blNotes = [];
    try {
      const items = await page.evaluate(blenderCheck.collectBlender);
      if (items.length) {
        const v = blenderCheck.judge(items, { rules: RULES.blender, deckDir: path.dirname(deck), root: auraRoot, finalize: wantFinalize,
          known: blenderSlidesArg === null ? null : new Set(blenderSlidesArg.split(',').map(x => x.trim()).filter(Boolean)) });
        v.errors.forEach(x => err(x.slide, x.msg)); v.warnings.forEach(x => warn(x.slide, x.msg)); blNotes.push(...v.notes);
      }
    } catch (e) { err(0, 'the studio render check could not run: ' + String(e.message || e).split(/\r?\n/)[0].slice(0, 160)); }

    // editable text ids: one `s<position>-` prefix per slide, no id used twice (post-mortem problem 8). Read from the file,
    // not the page, so it is the same text the editor and the packer will see.
    try {
      const v = editIds.judgeEditIds(fs.readFileSync(deck, 'utf8'));
      v.errors.forEach(x => err(x.slide, x.msg)); v.warnings.forEach(x => warn(x.slide, x.msg));
    } catch (e) { warn(0, 'the text-id check could not run: ' + String(e.message || e).split(/\r?\n/)[0].slice(0, 160)); }

    // capture contract: every 3D slide registers a loop period, and its loop is seamless (seek(0) == seek(period))
    const stillNotes = [];
    const want3d = info.slides.map((s, i) => s.companions.has3d ? i + 1 : 0).filter(Boolean);
    if (want3d.length) {
      const cap = await ctx.newPage();
      try {
        await cap.goto(server.url(deck) + '?capture', { waitUntil: 'load', timeout: 60000 });
        const has = await cap.waitForFunction(() => window.LumiCapture && window.LumiCapture.ready, null, { timeout: 20000 }).then(() => true, () => false);
        if (!has) err(0, 'the deck did not set window.LumiCapture with ?capture (is the Lumi runtime loaded?), so its 3D cannot be recorded.');
        else {
          const reg = await cap.evaluate(async () => { const c = await window.LumiCapture.ready; return Object.fromEntries(Object.entries(c.slides).map(([k, v]) => [k, v.period])); });
          for (const n of want3d) {
            if (!(n in reg)) { err(n, 'this 3D slide does not register a capture entry: give the scene a loop period, Aura.scene(id, setup, { period: <seconds> }) or data-period on its holder.'); continue; }
            const period = reg[n];
            if (!(period > 0)) continue;                        // period 0: a still 3D picture, one frame is enough
            const shot = async t => {
              await cap.evaluate(async ({ n, t }) => { await window.LumiCapture.slides[n].seek(t); }, { n, t });
              const r = await cap.evaluate(n => window.LumiCapture.slides[n].rect, n);
              return cap.screenshot({ clip: { x: r.x, y: r.y, width: Math.max(1, r.w), height: Math.max(1, r.h) }, animations: 'disabled' });
            };
            // L-14: which frame should the PDF page use? Try candidate stills against the slide's own text (capture mode hides the text, so
            // what is photographed is exactly the picture behind it) and name the best one, so data-still is set once and not by trial and error.
            if (wantStills || pixels[n - 1].contrast.some(c => c.ratio < 4.5)) {
              try {
                const cands = [...new Set([0.1, 0.25, 0.35, 0.5, 0.65, 0.8, 0.9].map(f => Math.round(f * period * 10) / 10))];
                const cur = info.slides[n - 1].still != null ? info.slides[n - 1].still : Math.round(period * 0.35 * 10) / 10;
                if (!cands.includes(cur)) cands.push(cur);
                const rows = [];
                for (const t of cands) {
                  await cap.evaluate(async ({ n, t }) => { await window.LumiCapture.slides[n].seek(t); }, { n, t });
                  const box = await cap.evaluate(k => { const sl = document.querySelectorAll('.deck > .slide, body > .slide')[k - 1]; const r = sl.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; }, n);
                  const plain = (await cap.screenshot({ clip: box, animations: 'disabled' })).toString('base64');
                  const px = await page.evaluate(analysePixels, { si: n - 1, plain, normal: null, bareOnly: true });
                  rows.push({ t, min: px.contrast.length ? Math.min(...px.contrast.map(c => c.ratio)) : null });
                }
                const ok = rows.filter(r => r.min !== null), best = ok.sort((a, b) => b.min - a.min)[0], now = rows.find(r => r.t === cur);
                if (best) stillNotes.push(`slide ${n}: PDF still at t=${cur}s has text contrast ${now && now.min !== null ? now.min : '?'}:1; ` + (now && now.min !== null && now.min >= best.min - 0.05 ? `no candidate of ${rows.length} is better: keep it.` : `best of ${rows.length} candidate frames is data-still="${best.t}" (${best.min}:1).`) + ' Motion between frames is not measured.');
              } catch (e) { stillNotes.push(`slide ${n}: candidate stills could not be tried (${String(e.message || e).split(/\r?\n/)[0].slice(0, 80)})`); }
            }
            const a = await shot(0), b = await shot(period);
            if (!a.equals(b)) {
              const diff = await cap.evaluate(async ([A, B]) => {
                const load = src => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = 'data:image/png;base64,' + src; });
                const px = async b64 => { const im = await load(b64), c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
                  const x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
                const p = await px(A), q = await px(B); let bad = 0;
                for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 24) bad++;
                return bad / (p.length / 4);
              }, [a.toString('base64'), b.toString('base64')]);
              if (diff > 0.002) err(n, `the 3D loop is not seamless: the frame at t = ${period} s differs from t = 0 in ${(diff * 100).toFixed(1)}% of its pixels. Use whole harmonics of the period (BBTime.wave, S.orbit) or BBPhys.loop.`);
            }
          }
        }
      } catch (e) { err(0, 'the capture check could not run: ' + String(e.message || e).split(/\r?\n/)[0].slice(0, 160)); }
      finally { await cap.close().catch(() => {}); }
    }

    // overview sheet: every slide small, to look at the whole deck in one picture
    let overview = null;
    if (!noShots && shots.length) {
      const cols = shots.length > 9 ? 4 : 3, tw = cols === 4 ? 450 : 600, th = Math.round(tw * 9 / 16);
      const cells = normals.map((b, i) => `<figure><img src="data:image/png;base64,${b}"><figcaption>${i + 1}</figcaption></figure>`).join('');
      const sheet = await ctx.newPage();
      await sheet.setViewportSize({ width: cols * (tw + 24) + 24, height: 400 });
      await sheet.setContent(`<style>body{margin:0;padding:24px;background:#2a2a2e;display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:24px;font:600 26px system-ui;color:#fff}
        figure{margin:0}img{width:${tw}px;height:${th}px;display:block;border-radius:6px}
        figcaption{padding:6px 2px 0}</style>${cells}`);
      overview = path.join(shotsDir, 'overview.png');
      await sheet.screenshot({ path: overview, fullPage: true });
      await sheet.close();
    }

    // report
    const S = info.slides.length;
    const sizes = [...deckSizes].sort((a, b) => a - b);
    console.log(`Aura deck check: ${rel(auraRoot, deck)}`);
    console.log(`  ${S} slides, ${mode} mode, typefaces: ${[...deckFonts].join(', ') || '-'}, sizes: ${sizes.join('/')} px${minutes ? `, planned ${Math.round(minutes * 10) / 10} min` : ''}`);
    console.log(`  rendered: http, ${probe.drawn} of ${probe.holders} 3D scene(s) drawn; numbers on slides: ${verdict.stat.numbers} (${verdict.stat.traced} in your files, ${verdict.stat.declared} declared in provenance.json${verdict.stat.figureRead ? ', ' + verdict.stat.figureRead + ' read off figures' : ''})`);
    console.log(lookKey ? `  look: ${P.name} - checked against its measured thresholds (minimum ${P.minFontPx}px, body ${P.bodyMinPx}px, ${P.wordBudget.content} words per content slide)`
                        : `  look: generic Lumi rules (minimum ${P.minFontPx}px)`);
    const show = (list, label) => list.sort((a, b) => a.slide - b.slide).forEach(x =>
      console.log(`  ${label} ${x.slide ? 'slide ' + x.slide + (info.slides[x.slide - 1].title ? ' "' + info.slides[x.slide - 1].title.slice(0, 32) + '"' : '') : 'deck'}: ${x.msg}`));
    show(errors, 'ERROR'); show(warnings, 'warn ');
    stillNotes.forEach(m => console.log('  still ' + m));
    blNotes.forEach(m => console.log('  studio render ' + m));
    if (shots.length) console.log(`  screenshots: ${rel(auraRoot, shotsDir)}/slide-01.png ... slide-${String(S).padStart(2, '0')}.png${overview ? ', overview.png' : ''}`);
    console.log(errors.length ? `RESULT: ${errors.length} error(s), ${warnings.length} warning(s). Fix the errors and run the check again.`
                              : `RESULT: clean (${warnings.length} warning(s) to consider).` + (shots.length ? ' Look at the screenshots before packing.' : ''));
    const report = { deck: rel(auraRoot, deck), slides: S, mode, look: lookKey, minFontPx: P.minFontPx, errors, warnings, fonts: [...deckFonts], sizes,
      perSlide: info.slides.map((s, i) => ({ n: i + 1, title: s.title, kind: s.kind, words: s.words, sizes: s.sizes,
        whitespace: pixels[i].whitespace, minContrast: pixels[i].contrast.length ? Math.min(...pixels[i].contrast.map(c => c.ratio)) : null })) };
    if (auraRoot) { const d = path.join(auraRoot, '.aura', 'temp', 'check'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, name + '.json'), JSON.stringify(report, null, 2)); }
    await ctx.close();
    process.exitCode = errors.length ? 1 : 0;
  } catch (e) {
    console.error('The deck check could not run: ' + (e && e.message ? e.message.split('\n')[0] : e));
    process.exitCode = 2;
  } finally {
    await browser.close().catch(() => {});
    await server.close();
  }
})();
