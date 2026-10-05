// Browser side of the Blender batch 2 tests (run by test_blender_deck.py):  node t_blender_runtime.js <packed deck.html>
// Opens a packed deck with Blender holders in Edge and prints ONE json line with what the runtime did:
//   slide 1 = a still (img only), slide 2 = a loop (img + video + two anchored labels), optional slide 3 = a draft preview.
// presenter mode: the video plays muted + looping only while its slide is current and is paused / reset when it leaves;
// ?still=n, ?aura=all and reduced motion show the poster only; ?capture lists the slides under LumiCapture.recorded and NOT under .slides.
const path = require('path');
const ENGINE = process.env.ENGINE;
const dp = require(path.join(ENGINE, 'tools', 'lib', 'deckpage'));

(async () => {
  const deck = path.resolve(process.argv[2]);
  const server = await dp.serve(dp.serveRootFor(deck));
  const browser = await dp.launch();
  const out = { errors: [] };
  try {
    const url = server.url(deck);
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', e => out.errors.push(String(e.message).slice(0, 160)));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) out.errors.push(m.text().slice(0, 160)); });
    await page.goto(url + '#1', { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset.auraReady === '1', null, { timeout: 30000 });
    const vid = () => page.evaluate(() => { const v = document.querySelector('.bb-blender video.bb-blender-video');
      return v ? { paused: v.paused, muted: v.muted, loop: v.loop, t: v.currentTime, display: getComputedStyle(v).display, src: v.getAttribute('src').slice(0, 20), poster: !!v.getAttribute('poster') } : null; });
    out.s1 = await page.evaluate(() => { const h = document.querySelector('.bb-blender[data-kind="still"]');
      const im = h.querySelector('img.bb-blender-img'); return { kind: h.dataset.kind, w: im.naturalWidth, h: im.naturalHeight, video: !!h.querySelector('video'), filled: h.hasAttribute('data-filled') }; });
    out.onS1 = await vid();                                   // not the current slide: not playing
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(1300);
    out.onS2 = await vid();
    await page.waitForTimeout(500);
    out.onS2later = await vid();
    out.labels = await page.evaluate(() => Array.from(document.querySelectorAll('.bb-blender[data-kind="animation"] [data-anchor]')).map(e => ({ n: e.dataset.anchor, l: e.style.left, t: e.style.top, shown: getComputedStyle(e).display !== 'none' })));
    out.tagDraftS2 = await page.evaluate(() => !!document.querySelector('.bb-blender[data-kind="animation"] .bb-blender-tag'));
    await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(400);
    out.backS1 = await vid();                                 // left the slide: paused and reset
    // ?still=2 : the poster only, nothing plays
    const p2 = await ctx.newPage();
    await p2.goto(url + '?still=2#2', { waitUntil: 'load' });
    await p2.waitForFunction(() => document.documentElement.getAttribute('data-aura-still-ready') === '1', null, { timeout: 30000 });
    out.still2 = await p2.evaluate(() => { const v = document.querySelector('.bb-blender video'); const im = document.querySelector('.slide.is-current .bb-blender-img');
      return { videoDisplay: v ? getComputedStyle(v).display : null, paused: v ? v.paused : null, img: im ? im.naturalWidth : 0, imgVisible: im ? im.getBoundingClientRect().width > 100 : false }; });
    await p2.close();
    // ?aura=all
    const p3 = await ctx.newPage();
    await p3.goto(url + '?aura=all', { waitUntil: 'load' });
    await p3.waitForFunction(() => document.documentElement.dataset.auraReady === '1', null, { timeout: 30000 });
    out.all = await p3.evaluate(() => ({ videos: Array.from(document.querySelectorAll('.bb-blender video')).map(v => getComputedStyle(v).display + '/' + v.paused),
      imgs: Array.from(document.querySelectorAll('.bb-blender img.bb-blender-img')).map(i => i.naturalWidth) }));
    await p3.close();
    // ?capture
    const p4 = await ctx.newPage();
    await p4.goto(url + '?capture', { waitUntil: 'load' });
    await p4.waitForFunction(() => window.LumiCapture && window.LumiCapture.ready, null, { timeout: 30000 });
    out.capture = await p4.evaluate(async () => { const c = await window.LumiCapture.ready; return { slides: Object.keys(c.slides), recorded: c.recorded }; });
    await p4.close();
    // reduced motion
    const ctx2 = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
    const p5 = await ctx2.newPage();
    await p5.goto(url + '#2', { waitUntil: 'load' });
    await p5.waitForFunction(() => document.documentElement.dataset.auraReady === '1', null, { timeout: 30000 });
    await p5.waitForTimeout(1000);
    out.reduced = await p5.evaluate(() => { const v = document.querySelector('.bb-blender video'); return { paused: v.paused, display: getComputedStyle(v).display }; });
    await ctx2.close();
    await ctx.close();
  } catch (e) { out.fatal = String(e && e.message || e).slice(0, 300); }
  finally { await browser.close().catch(() => {}); await server.close(); }
  console.log('RESULT ' + JSON.stringify(out));
})();
