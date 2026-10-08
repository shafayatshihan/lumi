// Checks for Blender slides (studio renders), shared by deck_check.js. Contract: docs/blender-contract.md sections 4 and 10.
// A Blender slide holds <div class="bb-blender" data-blender="<id>" data-kind="still|animation">, filled by the packer with the
// render (an <img>, and for a loop a muted <video>). What is checked, and where each message lives (enforcement.md lists them):
//   the render is in the deck and readable   the right size (1080p still; 720p or 1080p loop at 20 fps)
//   the background is the slide's canvas colour at the edges   not black, not blank (pixel statistics)
//   the loop is seamless (last frame -> first frame is a normal step)   the file is within its size budget
//   not shipped as an unapproved preview (a warning while building, an ERROR with --finalize)
// Numbers: engine/rules/hard-rules.json -> blender. Images are measured in the browser (any format, the pixels the deck really shows);
// videos with ffmpeg (decoded to 96 x 54 frames), because a browser cannot step through every frame of a clip quickly.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');

/* ------------------------------------------------------------------ in the page (serialised by Playwright: no outer references) */
async function collectBlender() {
  const slides = Array.from(document.querySelectorAll('.deck > .slide, body > .slide'));
  const out = [];
  for (let si = 0; si < slides.length; si++) {
    const s = slides[si];
    const m = (getComputedStyle(s).backgroundColor || '').match(/rgba?\(([^)]+)\)/);
    const bg = m ? m[1].split(/[ ,/]+/).filter(Boolean).slice(0, 3).map(parseFloat) : [249, 244, 242];
    for (const h of s.querySelectorAll('.bb-blender')) {
      if (h.hasAttribute('data-baked')) {
        // batch 6 B.7: a baked studio render is a live model. In all-slides mode the runtime has drawn it once and left the
        // frame as a plain <img>; that frame is measured, over the slide colour (it has alpha), like a still render is.
        const po = h.querySelector('img.bb-bake-poster');
        const fr = Array.from(h.querySelectorAll(':scope > img')).filter(i => !i.classList.contains('bb-blender-img')).pop() || null;
        const it = { n: si + 1, sid: h.dataset.blender || '', kind: 'animation', baked: true, draft: h.hasAttribute('data-draft'), stale: h.hasAttribute('data-stale'),
          filled: h.hasAttribute('data-filled'), period: parseFloat(h.dataset.period) || 0, failed: h.hasAttribute('data-fallback'), bg,
          labels: Array.from(h.querySelectorAll('[data-anchor]')).map(e => e.dataset.anchor), anchors: (h.dataset.anchorNames || '').split(',').filter(Boolean),
          hasPoster: false, drawn: false, w: 0, h: 0, px: null };
        if (po) { try { await po.decode(); } catch (e) { /* reported */ } it.hasPoster = po.naturalWidth > 0; }
        if (fr) {
          try { await fr.decode(); } catch (e) { /* reported */ }
          it.w = fr.naturalWidth; it.h = fr.naturalHeight; it.drawn = it.w > 0 && it.h > 0;
          if (it.drawn) {
            const c = document.createElement('canvas'); c.width = it.w; c.height = it.h;
            const x = c.getContext('2d', { willReadFrequently: true }); x.fillStyle = `rgb(${bg.join(',')})`; x.fillRect(0, 0, it.w, it.h); x.drawImage(fr, 0, 0);
            const d = x.getImageData(0, 0, it.w, it.h).data, W = it.w, H = it.h, P = Math.max(4, Math.min(24, Math.round(W / 80)));
            const patch = (x0, y0) => { let r = 0, g = 0, b = 0, n = 0;
              for (let y = y0; y < Math.min(H, y0 + P); y++) for (let xx = x0; xx < Math.min(W, x0 + P); xx++) { const k = (y * W + xx) * 4; r += d[k]; g += d[k + 1]; b += d[k + 2]; n++; }
              return [r / n, g / n, b / n]; };
            let non = 0, black = 0, luma = 0, cnt = 0;
            for (let y = 0; y < H; y += 3) for (let xx = 0; xx < W; xx += 3) {
              const k = (y * W + xx) * 4, r = d[k], g = d[k + 1], b = d[k + 2], l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
              if (Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2])) > 8) non++;
              if (l < 14) black++;
              luma += l; cnt++;
            }
            it.px = { patches: { tl: patch(0, 0), tr: patch(W - P, 0), bl: patch(0, H - P), br: patch(W - P, H - P) }, nonBg: non / cnt, black: black / cnt, luma: luma / cnt };
          }
        }
        out.push(it);
        continue;
      }
      const im = h.querySelector('img.bb-blender-img'), v = h.querySelector('video.bb-blender-video');
      const it = { n: si + 1, sid: h.dataset.blender || '', kind: h.dataset.kind || '', draft: h.hasAttribute('data-draft'), stale: h.hasAttribute('data-stale'),
        filled: h.hasAttribute('data-filled'), hasImg: !!im, hasVideo: !!v, imgSrc: im ? (im.getAttribute('src') || '') : '', videoSrc: v ? (v.getAttribute('src') || '') : '',
        fps: parseFloat(h.dataset.fps) || null, bg, labels: Array.from(h.querySelectorAll('[data-anchor]')).map(e => e.dataset.anchor), anchors: (() => { try { return Object.keys(JSON.parse(h.dataset.anchors || 'null') || {}); } catch (e) { return []; } })(), imgOk: false, w: 0, h: 0, px: null };
      if (im) {
        try { await im.decode(); } catch (e) { /* reported as unreadable */ }
        it.w = im.naturalWidth; it.h = im.naturalHeight; it.imgOk = it.w > 0 && it.h > 0;
        if (it.imgOk) {
          const c = document.createElement('canvas'); c.width = it.w; c.height = it.h;
          const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
          const d = x.getImageData(0, 0, it.w, it.h).data, W = it.w, H = it.h, P = Math.max(4, Math.min(24, Math.round(W / 80)));
          const patch = (x0, y0) => { let r = 0, g = 0, b = 0, n = 0;
            for (let y = y0; y < Math.min(H, y0 + P); y++) for (let xx = x0; xx < Math.min(W, x0 + P); xx++) { const k = (y * W + xx) * 4; r += d[k]; g += d[k + 1]; b += d[k + 2]; n++; }
            return [r / n, g / n, b / n]; };
          let non = 0, black = 0, luma = 0, cnt = 0;
          for (let y = 0; y < H; y += 3) for (let xx = 0; xx < W; xx += 3) {
            const k = (y * W + xx) * 4, r = d[k], g = d[k + 1], b = d[k + 2], l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            if (Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2])) > 8) non++;
            if (l < 14) black++;
            luma += l; cnt++;
          }
          it.px = { patches: { tl: patch(0, 0), tr: patch(W - P, 0), bl: patch(0, H - P), br: patch(W - P, H - P), left: patch(0, Math.floor(H / 2)), top: patch(Math.floor(W / 2), 0) },
            nonBg: non / cnt, black: black / cnt, luma: luma / cnt };
        }
      }
      out.push(it);
    }
  }
  // Part E (LOOK-BASE 4.11): which holders the honesty gate holds still (measured values on the slide)
  for (const it of out) {
    const h = slides[it.n - 1].querySelector(`.bb-blender[data-blender="${CSS.escape(it.sid)}"]`);
    try { it.held = !!(h && window.LumiPostPolicy && window.LumiPostPolicy.cameraMotion && !window.LumiPostPolicy.cameraMotion(h).moving); }
    catch (e) { it.held = false; }
  }
  return out;
}

/* ------------------------------------------------------------------ in node */
function findFfmpeg(root) {
  if (process.env.AURA_FFMPEG && fs.existsSync(process.env.AURA_FFMPEG)) return process.env.AURA_FFMPEG;
  const cands = [];
  for (const base of [root && path.join(root, '.aura', 'venv', 'Lib', 'site-packages', 'imageio_ffmpeg', 'binaries'),
    root && path.join(root, '.aura', 'venv', 'lib')].filter(Boolean)) {
    try { for (const f of fs.readdirSync(base)) if (/^ffmpeg.*\.exe$/i.test(f) || /^ffmpeg-/.test(f)) cands.push(path.join(base, f)); } catch (e) { /* none */ }
  }
  if (cands.length) return cands[0];
  const r = cp.spawnSync(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg'], { encoding: 'utf8' });
  const line = r.status === 0 && (r.stdout || '').split(/\r?\n/).find(Boolean);
  return line && fs.existsSync(line) ? line : null;
}

// a media reference of the deck -> { bytes, file } (file = a path ffmpeg can open; data: URIs are written to a temp file)
function mediaFile(src, deckDir, tmpDir, name) {
  if (/^data:/i.test(src)) {
    const m = src.match(/^data:([^;,]+)?(;base64)?,/i); if (!m) return null;
    const buf = m[2] ? Buffer.from(src.slice(m[0].length), 'base64') : Buffer.from(decodeURIComponent(src.slice(m[0].length)));
    const file = path.join(tmpDir, name); fs.writeFileSync(file, buf);
    return { bytes: buf.length, file };
  }
  const file = path.resolve(deckDir, decodeURIComponent(src.split(/[?#]/)[0]));
  try { return { bytes: fs.statSync(file).size, file }; } catch (e) { return null; }
}

function probeVideo(ff, file) {
  const r = cp.spawnSync(ff, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const t = (r.stderr || '') + (r.stdout || '');
  const line = (t.match(/Stream #[^\n]*Video:[^\n]*/) || [''])[0];
  const wh = line.match(/,\s*(\d{2,5})x(\d{2,5})/), fps = line.match(/([\d.]+)\s*fps/);
  return { w: wh ? +wh[1] : 0, h: wh ? +wh[2] : 0, fps: fps ? +fps[1] : 0, codec: (line.match(/Video:\s*(\w+)/) || [])[1] || '', ok: !!wh };
}

// every frame of the clip as 96 x 54 RGB (area averaged, so a flat background stays exact)
function videoFrames(ff, file) {
  const r = cp.spawnSync(ff, ['-v', 'error', '-i', file, '-vf', 'scale=96:54:flags=area', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'],
    { maxBuffer: 512 * 1024 * 1024 });
  if (r.status !== 0 || !r.stdout || !r.stdout.length) return null;
  const size = 96 * 54 * 3, n = Math.floor(r.stdout.length / size);
  return { n, size, buf: r.stdout };
}
const frameDiff = (buf, a, b, size) => { let s = 0; for (let i = 0; i < size; i++) s += Math.abs(buf[a * size + i] - buf[b * size + i]); return s / size; };

const hex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

// items: collectBlender() results. opts: { rules (hard-rules.json -> blender), deckDir, root, finalize, ffmpeg?, known? }
// opts.known (a Set of slide ids, or null when the caller does not know): the slides the server really renders in Blender. A
// holder whose id is not in it is an ORPHAN - the slide's engine is three.js, so no render is ever made for it and the holder
// stays empty for ever. That is an error at once, while the person is still on that slide, not a finalize that dies at the end.
// returns { errors: [{slide, msg}], warnings: [{slide, msg}], notes: [string] }
// batch 6 B.7: the baked path. The loop is recorded later by finalize.js with the capture contract (its seam is exact by
// construction: the player seeks the glTF animation absolutely), so what is checked here is the model as it draws.
function judgeBaked(it, who, R, err) {
  if (!(it.period > 0)) err(it.n, `${who} has no loop period: the bake did not record how long the motion is (L.loop in scene.py)`);
  if (!it.hasPoster) err(it.n, `${who} has no poster frame: it is the picture shown when the model cannot draw, and the bake writes it (bake/<mode>/poster.png)`);
  if (it.failed || !it.drawn) { err(it.n, `${who} did not draw: the baked model could not be shown in the browser (look at the console of the deck)`); return; }
  const px = it.px;
  if (px.black > R.blackFracAbove || px.luma < R.meanLumaBelow) err(it.n, `${who} looks black (mean brightness ${px.luma.toFixed(0)}): a metal with no environment, or the camera is inside the model`);
  else if (px.nonBg < R.nonBgBelow) err(it.n, `${who} is blank: only ${(px.nonBg * 100).toFixed(2)}% of it is anything but the background, so the model is missing or out of frame`);
  const bad = Object.entries(px.patches).map(([k, c]) => [k, c, Math.max(...c.map((v, i) => Math.abs(v - it.bg[i])))]).filter(p => p[2] > R.edgeTolerance);
  if (bad.length) err(it.n, `${who} background is not the slide colour at its edges: ${bad.slice(0, 3).map(p => `${p[0]} ${hex(p[1])}`).join(', ')} against the slide's ${hex(it.bg)}. The model must sit on a transparent background, or on the slide's own colour (L.studio(bg=...)).`);
}

/* ------------------------------------------------------------------ Part E: the scene itself (LOOK-BASE 4.10 / 4.11)
   The pixels cannot say whether a figure is the real thing, but scene.py can say whether it CLAIMS to be: where its
   numbers come from (L.real), whether its parts are real materials, and whether a part is a stand-in (a cloud for
   airflow). The scene lives in .aura/decks/<id>/blender/<sid>/scene.py; the build folder's name ends in the first
   characters of <id>. */
// any identifier or name in the CODE (comments stripped): the owner's own failing scene named its objects hot0 / cool0
// but built them with `def puff(...)`, so object names alone would have let it through
const ANALOGY = /\b\w*(cloud|puff|sparkle|twinkle|heart|smiley|mascot|emoji|cartoon|swoosh|confetti)\w*\b/i;
function sceneFile(root, deckDir, sid) {
  const near = path.join(deckDir, 'blender', sid, 'scene.py');
  if (fs.existsSync(near)) return near;
  const m = /-([0-9a-f]{6,})$/.exec(path.basename(deckDir));
  const decks = root ? path.join(root, '.aura', 'decks') : null;
  if (!m || !decks || !fs.existsSync(decks)) return null;
  const hits = fs.readdirSync(decks).filter(d => d.startsWith(m[1])).map(d => path.join(decks, d, 'blender', sid, 'scene.py')).filter(f => fs.existsSync(f));
  return hits.length === 1 ? hits[0] : null;
}
function judgeScene(it, who, opts, err, warn) {
  const f = sceneFile(opts.root, opts.deckDir, it.sid);
  if (!f) return;
  const src = fs.readFileSync(f, 'utf8').split(/\r?\n/).map(l => l.replace(/(^|\s)#.*$/, '')).join('\n');   // code, not comments
  // a render the person already approved is not failed after the fact for a rule it predates: it is told, not blocked
  const firm = !(it.filled && !it.draft) ? err : warn;
  if (!/\bL\.real\s*\(/.test(src))
    firm(it.n, `${who}: scene.py does not say where its numbers come from. Add L.real('<source>', <real counts and sizes>) - a figure without its real dimensions is a likeness, not the thing (LOOK-BASE 4.10)`);
  const a = ANALOGY.exec(src);
  if (a) firm(it.n, `${who}: scene.py builds a stand-in (${a[0].slice(0, 40)}): draw flow, heat and fields as notation - arrows, streamlines, particles on the real flow direction - never as a cartoon of the medium (LOOK-BASE 4.10)`);
  if (!/\bL\.(mat|pbr)\s*\(|\bM\.\w+\s*\(/.test(src))
    firm(it.n, `${who}: scene.py uses no real material: build every part with L.mat(kind), L.pbr(id) or lumi_mech (LOOK-BASE 4.10)`);
  const mv = /\bL\.move\s*\(\s*['"](\w+)['"]/.exec(src);
  if (it.held && mv && mv[1] !== 'still' && !it.baked)
    err(it.n, `${who}: the slide carries measured values, but its render moves the camera (L.move('${mv[1]}')) and a rendered video cannot be held still. Use L.move('still') on this slide (LOOK-BASE 4.11)`);
  if (it.kind === 'animation' && !mv && !it.held)
    warn(it.n, `${who}: the loop's camera is locked off. Add a camera setup after L.loop(): L.move('sway'), or 'crane', 'dolly', 'push', 'orbit', 'whip' (BLENDER.md 2c)`);
}

function judge(items, opts) {
  const R = opts.rules, errors = [], warnings = [], notes = [];
  const err = (n, m) => errors.push({ slide: n, msg: m }), warn = (n, m) => warnings.push({ slide: n, msg: m });
  const early = opts.finalize ? err : warn;          // while building a slide has no render yet: only a finalize insists
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumi-bl-check-'));
  try {
    for (const it of items) {
      const who = `studio render "${it.sid}"`;
      if (opts.known && !opts.known.has(it.sid)) {
        err(it.n, `${who} is a studio render holder on a slide that is NOT a studio render slide: this slide's 3D figure is live 3D (three.js), so Lumi never renders a picture for it and the holder stays empty for ever (the deck cannot be finalized). Remove the <div class="bb-blender" data-blender="${it.sid}"> holder and draw the figure live with Aura.scene(...), or ask for the studio render engine on this slide.`);
        continue;
      }
      try { judgeScene(it, who, opts, err, warn); } catch (e) { warn(it.n, `${who}: the scene check could not run: ${String(e.message || e).slice(0, 120)}`); }
      if (!it.filled) { early(it.n, `${who} is not in the deck yet (Lumi renders a preview after the build step, and the full render after the user approves it)`); continue; }
      if (it.draft) early(it.n, `${who} shows a preview, not the approved render: the user has not approved it yet, so it cannot be finalized`);
      if (it.stale && opts.finalize) warn(it.n, `${who} is older than the scene: the scene changed after the last full render`);
      const lost = it.labels.filter(l => !it.anchors.includes(l));
      if (lost.length) warn(it.n, `${who} has label(s) with no anchor point in the render (${lost.join(', ')}): call L.anchor('<name>', object) in scene.py so the label can follow it, or the label stays hidden`);
      if (it.baked) { judgeBaked(it, who, R, err); continue; }
      const animation = it.kind === 'animation';
      if (animation && !it.hasVideo && !it.draft) { err(it.n, `${who} could not be read: the slide says it is an animation but the loop video is missing`); continue; }
      if (!animation && it.hasVideo) { err(it.n, `${who} could not be read: the slide says it is a still but a video is inside it`); continue; }
      if (!it.hasImg || !it.imgOk) { err(it.n, `${who} could not be read (the picture did not decode)`); continue; }
      const draftOnly = it.draft && animation && !it.hasVideo;     // an animation's preview is one poster frame: no video yet

      // size of the picture the deck carries: a still must be 1080p; a loop's poster is its first frame (720p or 1080p)
      const stillOk = it.w === R.stillSize[0] && it.h === R.stillSize[1];
      const loopOk = R.loopSizes.some(s => s[0] === it.w && s[1] === it.h);
      if (!it.draft && (animation ? !loopOk : !stillOk))
        err(it.n, `${who} is ${it.w} x ${it.h}; ${animation ? `a loop must be ${R.loopSizes.map(s => s.join(' x ')).join(' or ')}` : `a still must be ${R.stillSize.join(' x ')}`} (the full render, not a preview)`);

      // pixel statistics: not black, not blank
      const px = it.px;
      if (px.black > R.blackFracAbove || px.luma < R.meanLumaBelow) err(it.n, `${who} looks black (mean brightness ${px.luma.toFixed(0)}, ${(px.black * 100).toFixed(0)}% black pixels): the camera, the lights or the scale are wrong (BLENDER.md section 8)`);
      else if (px.nonBg < R.nonBgBelow) err(it.n, `${who} is blank: only ${(px.nonBg * 100).toFixed(2)}% of it is anything but the background, so the subject is missing or out of frame`);

      // the background at the edges is the slide's own canvas colour (BLENDER.md section 3: composited to the exact colour)
      const bad = Object.entries(px.patches).map(([k, c]) => [k, c, Math.max(...c.map((v, i) => Math.abs(v - it.bg[i])))]).filter(p => p[2] > R.edgeTolerance);
      if (bad.length) err(it.n, `${who} background is not the slide colour at its edges: ${bad.slice(0, 3).map(p => `${p[0]} ${hex(p[1])}`).join(', ')} against the slide's ${hex(it.bg)}. Render with L.studio(bg=...) matching the slide (canvas / stage / blueprint / title / close), or set the slide's colour class to match.`);

      // size budget of the file the deck carries
      const still = mediaFile(it.imgSrc, opts.deckDir, tmpDir, 'still.bin');
      if (!still) err(it.n, `${who} could not be read: its picture file is missing`);
      else if (!animation && still.bytes > R.stillMaxMB * 1048576) err(it.n, `${who} is ${(still.bytes / 1048576).toFixed(1)} MB; a still stays under ${R.stillMaxMB} MB (compress the render, or simplify noisy textures)`);

      if (animation && it.hasVideo) {
        const vf = mediaFile(it.videoSrc, opts.deckDir, tmpDir, 'loop.mp4');
        if (!vf) { err(it.n, `${who} could not be read: its loop video file is missing`); continue; }
        const ff = opts.ffmpeg || findFfmpeg(opts.root);
        if (!ff) { warn(it.n, `${who} loop was not verified: no video tool (ffmpeg) was found, so its size, frame rate and seam were not measured`); continue; }
        const pr = probeVideo(ff, vf.file);
        if (!pr.ok) { err(it.n, `${who} could not be read: the loop video does not open`); continue; }
        if (!R.loopSizes.some(s => s[0] === pr.w && s[1] === pr.h)) err(it.n, `${who} loop is ${pr.w} x ${pr.h}; a loop must be ${R.loopSizes.map(s => s.join(' x ')).join(' or ')}`);
        if (Math.abs(pr.fps - R.loopFps) > 0.05) err(it.n, `${who} loop runs at ${pr.fps} fps; the loops of this deck run at ${R.loopFps} fps`);
        const cap = (R.loopMaxMB[String(pr.h)] || R.loopMaxMB['1080']) * 1048576;
        if (vf.bytes > cap) err(it.n, `${who} loop is ${(vf.bytes / 1048576).toFixed(1)} MB; a ${pr.h}p loop stays under ${cap / 1048576} MB (shorter loop, 720p, or a calmer scene)`);
        const fr = videoFrames(ff, vf.file);
        if (!fr || fr.n < 2) { err(it.n, `${who} could not be read: no frames could be decoded from the loop`); continue; }
        // frame statistics: first, middle and last frame must not be black or blank, and their corners must be the slide colour
        let worst = 0;
        for (const k of [0, Math.floor(fr.n / 2), fr.n - 1]) {
          const o = k * fr.size, W = 96, c = (x, y) => [0, 1, 2].map(i => fr.buf[o + (y * W + x) * 3 + i]);
          for (const [nm, col] of [['tl', c(0, 0)], ['tr', c(95, 0)], ['bl', c(0, 53)], ['br', c(95, 53)]]) worst = Math.max(worst, ...col.map((v, i) => Math.abs(v - it.bg[i])));
          let non = 0, luma = 0, cnt = 0;
          for (let y = 0; y < 54; y++) for (let x = 0; x < 96; x++) { const p = c(x, y); luma += 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]; cnt++;
            if (Math.max(...p.map((v, i) => Math.abs(v - it.bg[i]))) > 8) non++; }
          if (luma / cnt < R.meanLumaBelow) err(it.n, `${who} loop looks black at frame ${k + 1}`);
          else if (non / cnt < R.nonBgBelow) err(it.n, `${who} loop is blank at frame ${k + 1}: the subject is missing or out of frame`);
        }
        if (worst > R.edgeTolerance + 1) err(it.n, `${who} loop background is not the slide colour at its edges (off by ${worst.toFixed(0)} levels): render with L.studio(bg=...) matching the slide`);
        // seam: the step from the last frame back to the first must look like any other step
        let sum = 0, max = 0; const steps = fr.n - 1;
        for (let k = 0; k < steps; k++) { const d = frameDiff(fr.buf, k, k + 1, fr.size); sum += d; max = Math.max(max, d); }
        const mean = sum / steps, seam = frameDiff(fr.buf, fr.n - 1, 0, fr.size);
        notes.push(`slide ${it.n} loop: ${fr.n} frames, ${pr.w}x${pr.h} ${pr.fps} fps, ${(vf.bytes / 1048576).toFixed(1)} MB, seam ${seam.toFixed(2)} (typical step ${mean.toFixed(2)}, largest ${max.toFixed(2)})`);
        if (seam > Math.max(R.seamFactor * Math.max(mean, max * 0.5), R.seamFloor))
          err(it.n, `${who} loop is not seamless: the step from the last frame back to the first changes ${seam.toFixed(1)} levels, a normal step changes ${mean.toFixed(1)}. Key the motion over whole turns or whole cycles (L.loop + L.turntable / L.spin / L.wave).`);
      }
      if (draftOnly) notes.push(`slide ${it.n}: the preview of an animation is one poster frame`);
    }
  } finally { fs.rmSync(tmpDir, { recursive: true, force: true }); }
  return { errors, warnings, notes };
}

module.exports = { collectBlender, judge, findFfmpeg, probeVideo, videoFrames };
