#!/usr/bin/env node
// Finalize a deck (local tools only, no Claude): record every looping slide as a seamless 1920x1080 MP4 and embed
// it, then write a PDF backup (one still page per slide, then the speaker notes as pages).
//   node .aura/engine/tools/finalize.js <editable deck.html> --html <out.html> --pdf <out.pdf> --ffmpeg <ffmpeg.exe> [--fps 20] [--crf 21] [--light]
// Size (D-03): the file is mostly base64 video. Default quality is CRF 21 (was 18: visually the same on a projector, ~30 % smaller);
// a loop longer than 15 s gets +2 CRF; --light = CRF 27 (about half the size, for e-mail). The floor that remains: one
// 1080p-region clip per animated slide, +33 % for base64, plus three.js (~2 MB) and the fonts, inlined once each by pack_deck.py.
//
// Capture contract (written out in full at the top of engine/deck/runtime.js; keep the two in step):
//   <deck>?capture -> window.LumiCapture = { ready: Promise, slides: { <n>: { period /*s*/, seek: async t => {}, rect, holder } } }
//   seek(t) makes slide n current at scale 1 in the window's top-left and draws the frame at time t; rect = {x,y,w,h}
//   is the main holder in slide pixels, the region recorded (projected labels live inside it). Frames are taken at
//   t = k / fps for k = 0 .. round(period * fps) - 1, so the clip loops seamlessly (period 0 = a still: one second of
//   the same frame). Each clip is H.264 / yuv420p / faststart, embedded in a copy of the deck as
//   <script type="text/plain" id="lumi-loop-<n>" data-mime="video/mp4" data-period="<period>">BASE64</script>.
//   window.LumiCapture.recorded = { <n>: { kind, draft, filled } } lists the Blender slides: studio renders that are already a picture or
//   a recorded loop inside the deck. They are skipped (never recorded or re-rendered), keep their embedded media, and a draft preview or an
//   empty holder stops the finalize with a plain message. Their PDF page is the render itself (the loop's poster, frame 1).
//   <deck>?still=<n> shows slide n as a still and sets <html data-aura-still-ready="1"> when it is drawn (PDF pages).
// Before anything is recorded, every loop slide is drawn once and window.LumiCapture.health() (runtime.js contract
// section 5) is asked what actually drew. A slide whose 3D did not draw makes finalize start over under Chromium's
// software GL, and if that fails too it stops with a plain sentence and writes nothing - a blank slide must never
// reach a client, and before this it did so silently with exit 0.
// Progress goes to stdout as JSON lines: {t:'plan',loops:[{n,frames}],slides,softGl}, {t:'frame',i,n,k,frames},
// {t:'encode',i,n}, {t:'still',k,of}, {t:'write'}, {t:'done'}. Errors go to stderr (one plain line) with exit code 1.
// Timing (batch 6 spec Part D): {t:'timing',scope:'loop',...} after each loop and {t:'timing',scope:'deck',...} at the
// end. They are measurement only - an older reader ignores an unknown `t`, and nothing here changes what is rendered.
'use strict';
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { serveRootFor, serve, launch, SOFT_GL_ARGS } = require('./lib/deckpage');

const say = o => process.stdout.write(JSON.stringify(o) + '\n');
const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def; };
const W = 1920, H = 1080;
const LIGHT = process.argv.includes('--light');
const BASE_CRF = Math.max(14, Math.min(34, parseInt(arg('--crf', LIGHT ? '27' : '21'), 10) || 21));

function encode(ffmpeg, out, fps, crf) {
  const p = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg',
    '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-pix_fmt', 'yuv420p',
    // the screenshots are full-range BT.601 JPEGs; convert explicitly to limited-range BT.709 and tag it, or players
    // stretch the levels (light greys such as the slide background play back as pure white)
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2:in_range=full:out_range=limited:in_color_matrix=bt601:out_color_matrix=bt709',
    '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-movflags', '+faststart', '-r', String(fps), out], { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
  let err = '';
  p.stderr.on('data', d => { err += d; });
  const done = new Promise((ok, fail) => p.on('close', code => code === 0 ? ok() : fail(new Error('the video encoder failed: ' + err.trim().split('\n').pop()))));
  return {
    write: buf => new Promise(ok => { if (!p.stdin.write(buf)) p.stdin.once('drain', ok); else ok(); }),
    end: () => { p.stdin.end(); return done; },
  };
}

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// ---- timing instrumentation (docs/blender-batch6-spec.md Part D). Measurement only.
// hr() is a monotonic clock in seconds; r3 rounds for the JSON; bytesOf never throws (a missing size is null).
// Capture and encode OVERLAP (frames go down a pipe while ffmpeg works), so `encodeS.write` is the time the capture
// loop was BLOCKED by the encoder, not ffmpeg's own cost, and `encodeS.flush` is the wait after the last frame.
const hr = () => Number(process.hrtime.bigint()) / 1e9;
const r3 = x => (typeof x === 'number' && isFinite(x) ? Math.round(x * 1000) / 1000 : null);
const bytesOf = p => { try { return fs.statSync(p).size; } catch (e) { return null; } };
const T0 = hr();

// Post-mortem problem 7 / HANDOFF rule 12: a stack trace must never reach the user. Anything that escapes the try below
// (a browser that will not launch, a rejected promise) becomes one plain sentence; the server reads the last line.
const sayFail = e => {
  const msg = String((e && e.message) || e || '').split('\n')[0].trim();
  const locked = /EBUSY|EPERM|EACCES|operation not permitted|access is denied/i.test(msg);
  console.error('Could not finalize: ' + (locked
    ? 'a file Lumi had to write is open in another program. Close the deck everywhere and finalize again.'
    : (msg || 'something went wrong inside Lumi. Try again; if it keeps happening, restart Lumi.')));
};
process.on('uncaughtException', e => { sayFail(e); process.exit(1); });
process.on('unhandledRejection', e => { sayFail(e); process.exit(1); });

(async () => {
  const deck = path.resolve(process.argv[2] || '');
  // 20 fps is the global default (docs/blender-contract.md; a Blender loop is authored at 20 fps, so capturing at
  // 30 only resampled it). The SERVER always passes --fps from the deck's own pin, so a deck built before this
  // change keeps rendering at the frame rate it was built with; this default is the floor for a bare command line.
  const outHtml = arg('--html'), outPdf = arg('--pdf'), ffmpeg = arg('--ffmpeg'), fps = Math.max(1, parseInt(arg('--fps', '20'), 10) || 20);
  if (!fs.existsSync(deck) || !outHtml || !outPdf || !ffmpeg) { console.error('usage: finalize.js <deck.html> --html <out> --pdf <out> --ffmpeg <exe>'); process.exit(2); }
  const server = await serve(serveRootFor(deck));
  let browser = await launch();
  let softGl = false;
  const tmpDir = fs.mkdtempSync(path.join(path.dirname(path.resolve(outHtml)), '.finalize-'));
  try {
    let ctx, page, hasCapture = false, loops = [], recorded = [], slideCount = 0, health = {};
    const base = server.url(deck);

    // ---- 1. loops
    // Open the deck in capture mode, draw one frame of every loop, and ask the runtime what actually drew
    // (contract section 5). Doing this BEFORE recording is the whole point: a scene that throws used to be invisible,
    // and 40 frames of the slide background were encoded, embedded and reported as a success.
    const openCapture = async () => {
      ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
      await ctx.route('**/*', r => (r.request().url().startsWith(server.origin) || /^(data|blob):/.test(r.request().url())) ? r.continue() : r.abort());
      page = await ctx.newPage();
      await page.goto(base + '?capture', { waitUntil: 'load', timeout: 120000 });
      hasCapture = await page.waitForFunction(() => !!window.LumiCapture, null, { timeout: 15000 }).then(() => true, () => false);
      loops = []; recorded = []; health = {};
      if (hasCapture) {
        await page.evaluate(() => Promise.resolve(window.LumiCapture.ready));
        // Blender slides (studio renders) are already pictures / recorded loops: they are listed here, never recorded again (contract 10)
        recorded = await page.evaluate(() => Object.entries(window.LumiCapture.recorded || {}).map(([n, v]) => ({ n: parseInt(n, 10), kind: v.kind, draft: !!v.draft, filled: !!v.filled })).sort((a, b) => a.n - b.n));
        loops = await page.evaluate(() => Object.entries(window.LumiCapture.slides || {})
          .map(([n, s]) => ({ n: parseInt(n, 10), period: Number(s && s.period), rect: s && s.rect ? { x: +s.rect.x, y: +s.rect.y, w: +s.rect.w, h: +s.rect.h } : null }))
          .filter(x => x.n > 0 && x.period >= 0 && isFinite(x.period)).sort((a, b) => a.n - b.n));
      }
      slideCount = await page.evaluate(() => (window.Aura && Aura.slides ? Aura.slides().length : 0) ||
        document.querySelectorAll('.deck > .slide, body > .slide, .slide').length);
      if (!slideCount) throw new Error('no slides found in the deck');
      const bad = recorded.filter(r => r.draft || !r.filled);
      if (bad.length) throw new Error(`slide ${bad.map(r => r.n).join(', ')} still ${bad.length === 1 ? 'shows' : 'show'} ${bad.some(r => r.draft) ? 'a preview, not the approved render' : 'no render'}: render ${bad.length === 1 ? 'it' : 'them'} in the build first.`);
      const done = new Set(recorded.map(r => r.n));
      loops = loops.filter(x => !done.has(x.n)).map(x => ({ ...x, frames: x.period > 0 ? Math.max(1, Math.round(x.period * fps)) : 1 }));
      for (const l of loops) await page.evaluate(n => Promise.resolve(window.LumiCapture.slides[n].seek(0)), l.n);
      if (hasCapture) health = await page.evaluate(() => (window.LumiCapture.health ? window.LumiCapture.health() : {}));
    };
    // the loop slides whose 3D did not draw. A deck built before this change has no health(), so health is {} and
    // nothing is gated - the check can only ever add a failure that was already there, never invent one.
    const blank = () => loops.filter(l => (health[l.n] || {}).failed && health[l.n].failed.length)
      .map(l => ({ n: l.n, why: health[l.n].failed[0].reason }));

    await openCapture();
    if (blank().length && !softGl) {
      const first = blank()[0];
      say({ t: 'warn', slide: first.n, message: `the 3D picture on slide ${first.n} did not draw on this computer's graphics card, so Lumi is recording the deck again with its own software renderer. This takes longer.` });
      await ctx.close().catch(() => {});
      await browser.close().catch(() => {});
      browser = await launch({ args: SOFT_GL_ARGS });
      softGl = true;
      await openCapture();
    }
    if (blank().length) {
      // the server shows the LAST stderr line and cuts it at 200 characters (friendly_tool_error), so the sentence stays
      // short and the slide list is capped rather than running on
      const ns = blank().map(b => b.n), one = ns.length === 1;
      const list = ns.length <= 3 ? (one ? String(ns[0]) : ns.slice(0, -1).join(', ') + ' and ' + ns[ns.length - 1])
        : ns.slice(0, 3).join(', ') + ' and ' + (ns.length - 3) + ' more';
      // the technical cause goes to the log, never into the sentence: it is a stack-shaped string with a localhost URL
      // in it, and the standing rule is that an error reaching a person is plain and says what to do next.
      say({ t: 'detail', scope: 'capture', slides: ns, reason: blank()[0].why, softGl });
      throw new Error(`the 3D picture${one ? '' : 's'} on slide${one ? '' : 's'} ${list} did not draw, even with Lumi's ` +
        `software renderer. Nothing was written. Check ${one ? 'that slide' : 'those slides'}, then finalize again.`);
    }
    say({ t: 'plan', loops: loops.map(({ n, frames }) => ({ n, frames })), slides: slideCount, recorded: recorded.map(r => r.n), softGl });

    const clips = [];
    const tLoops0 = hr();
    for (let i = 0; i < loops.length; i++) {
      const { n, frames, period, rect } = loops[i];
      // the recorded region: the main holder, inside the 1920 x 1080 slide (whole slide when the deck gives no rect)
      const r = rect && rect.w > 0 && rect.h > 0 ? rect : { x: 0, y: 0, w: W, h: H };
      const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
      const clip = { x: x0, y: y0, width: Math.min(W - x0, Math.ceil(r.x + r.w) - x0), height: Math.min(H - y0, Math.ceil(r.y + r.h) - y0) };
      const mp4 = path.join(tmpDir, `loop-${n}.mp4`);
      const crf = BASE_CRF + (period > 15 ? 2 : 0);
      const enc = encode(ffmpeg, mp4, fps, crf);
      let last = null;
      const tLoop0 = hr();
      let seekS = 0, shotS = 0, settleS = 0, writeS = 0, jpegBytes = 0;
      for (let k = 0; k < frames; k++) {
        let m = hr();
        await page.evaluate(([n, t]) => Promise.resolve(window.LumiCapture.slides[n].seek(t)), [n, k / fps]);
        seekS += hr() - m;
        if (k === 0) { m = hr(); await page.waitForTimeout(120); settleS += hr() - m; }   // the first frame of a slide: let fonts and layout settle
        m = hr();
        last = await page.screenshot({ type: 'jpeg', quality: 95, clip });
        shotS += hr() - m;
        jpegBytes += last.length;
        m = hr();
        await enc.write(last);
        writeS += hr() - m;
        say({ t: 'frame', i, n, k, frames });
      }
      if (!(period > 0)) {                                 // a still: one second of the same frame
        const m = hr();
        for (let k = 1; k < fps; k++) await enc.write(last);
        writeS += hr() - m;
      }
      say({ t: 'encode', i, n });
      const tFlush = hr();
      await enc.end();
      const flushS = hr() - tFlush;
      say({ t: 'timing', scope: 'loop', i, n, frames, fps, crf, period: r3(period),
            width: clip.width, height: clip.height,
            captureS: { total: r3(seekS + shotS + settleS), seek: r3(seekS), screenshot: r3(shotS), settle: r3(settleS) },
            encodeS: { total: r3(writeS + flushS), write: r3(writeS), flush: r3(flushS) },
            wallS: r3(hr() - tLoop0), bytes: bytesOf(mp4), jpegBytes });
      clips.push({ n, file: mp4, period });
    }
    const tLoopsDone = hr();

    // ---- 2. the final HTML: a copy of the deck with every loop embedded
    say({ t: 'write' });
    const tWrite0 = hr();
    let src = fs.readFileSync(deck, 'utf8').replace(/<script type="text\/plain" id="lumi-loop-\d+"[^>]*>[\s\S]*?<\/script>\s*/g, '');
    // batch 6: a baked slide is now a recorded loop like every other scene, so its inlined model and the player are dead weight
    // (several MB a slide). The holder keeps its poster for a viewer without video.
    src = src.replace(/<script id="lumi-bake-(?:player|scenes)">[\s\S]*?<\/script>\s*/g, '');
    const blobs = clips.map(c => `<script type="text/plain" id="lumi-loop-${c.n}" data-mime="video/mp4" data-period="${c.period}">${fs.readFileSync(c.file).toString('base64')}</script>`).join('\n');
    const at = src.lastIndexOf('</body>');
    src = at >= 0 ? src.slice(0, at) + blobs + '\n' + src.slice(at) : src + '\n' + blobs + '\n';
    fs.writeFileSync(outHtml, src, 'utf8');
    const htmlS = hr() - tWrite0;

    // ---- 3. PDF backup: a still page per slide, then the notes
    const stills = [], notes = [];
    const tStills0 = hr();
    let stillWarnings = 0;
    for (let k = 0; k < slideCount; k++) {
      await page.goto(`${base}?still=${k + 1}#${k + 1}`, { waitUntil: 'load', timeout: 120000 });
      // the runtime sets <html data-aura-still-ready="1"> once the still (3D scene included) is drawn. A heavy scene on a
      // slow / software GL takes far longer than a few seconds, so wait for the flag itself (up to 3 min), never a short
      // timer: a screenshot taken early shows the slide without its 3D. Only a deck with no Aura runtime gets 6 s.
      const hasRuntime = await page.evaluate(() => !!window.Aura).catch(() => false);
      const flagged = await page.waitForFunction(() => document.documentElement.getAttribute('data-aura-still-ready') === '1', null,
        { timeout: hasRuntime ? (parseInt(process.env.AURA_STILL_TIMEOUT_MS, 10) || 180000) : 6000 }).then(() => true, () => false);
      // "Ready" only ever promised that a frame was drawn, not that the 3D was in it: a scene that threw is skipped and
      // the page reports ready in milliseconds. data-aura-still-3d (contract section 5) is the one that answers the
      // question, and without it this loop photographed blank pages and counted zero warnings.
      const still3d = hasRuntime ? await page.evaluate(() => document.documentElement.dataset.auraStill3d || '').catch(() => '') : '';
      // D-04: one slow slide must not lose every loop already recorded. After the 3-minute wait the page is photographed as it
      // is (the slide without its finished 3D picture) and the person is told which page is affected.
      if (hasRuntime && (!flagged || still3d === 'failed')) {
        stillWarnings++;
        say({ t: 'warn', slide: k + 1, message: still3d === 'failed'
          ? `the 3D picture on slide ${k + 1} did not draw, so its page in the PDF shows the slide without it (the video in the deck itself is fine)`
          : `the 3D picture on slide ${k + 1} was not ready, so its page in the PDF shows the slide without it (the video in the deck itself is fine)` });
      }
      await page.waitForTimeout(250);
      stills.push((await page.screenshot({ type: 'jpeg', quality: 92 })).toString('base64'));
      if (k === 0) {
        notes.push(...await page.evaluate(() => {
          const list = window.Aura && Aura.slides ? Aura.slides() : null;
          if (list && list.length) return list.map(s => ({ n: s.number, title: s.title || '', notes: s.notes || '' }));
          return [...document.querySelectorAll('.slide')].map((s, i) => {
            const n = s.querySelector('[data-aura-notes], .notes'), h = s.querySelector('h1, h2, h3');
            return { n: i + 1, title: s.dataset.title || (h ? h.textContent.trim() : ''), notes: n ? n.textContent.replace(/\s+/g, ' ').trim() : '' };
          });
        }));
      }
      say({ t: 'still', k, of: slideCount });
    }
    const stillsS = hr() - tStills0;
    const tPdf0 = hr();
    const pdfPage = await ctx.newPage();
    const pages = stills.map(b => `<section class="pg"><img src="data:image/jpeg;base64,${b}"></section>`).join('') +
      notes.filter(x => x.notes).map(x => `<section class="pg nt"><p class="k">speaker notes · slide ${x.n}</p><h1>${esc(x.title)}</h1>` +
        x.notes.split(/\n{2,}/).map(p => `<p>${esc(p)}</p>`).join('') + '</section>').join('');
    await pdfPage.setContent(`<!doctype html><meta charset="utf-8"><style>@page{size:${W}px ${H}px;margin:0}html,body{margin:0}
      .pg{width:${W}px;height:${H}px;overflow:hidden;page-break-after:always;break-after:page;position:relative}
      .pg img{display:block;width:${W}px;height:${H}px}.nt{box-sizing:border-box;padding:120px 160px;font:34px/1.5 'Segoe UI',system-ui,sans-serif;color:#111}
      .nt .k{font-size:26px;color:#666;margin:0 0 12px}.nt h1{font-size:56px;line-height:1.15;margin:0 0 36px}.nt p{margin:0 0 22px}</style>${pages}`, { waitUntil: 'load' });
    await pdfPage.pdf({ path: outPdf, width: `${W}px`, height: `${H}px`, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    const pdfS = hr() - tPdf0;
    say({ t: 'timing', scope: 'deck', fps, crf: BASE_CRF, light: LIGHT, softGl, loopCount: clips.length, slides: slideCount,
          startupS: r3(tLoops0 - T0), loopsS: r3(tLoopsDone - tLoops0), htmlS: r3(htmlS), stillsS: r3(stillsS),
          stills: stills.length, stillWarnings, pdfS: r3(pdfS), totalS: r3(hr() - T0),
          htmlBytes: bytesOf(outHtml), pdfBytes: bytesOf(outPdf) });
    say({ t: 'done', loops: clips.length, slides: slideCount, notes: notes.filter(x => x.notes).length });
  } catch (e) {
    sayFail(e);
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})();
