// Shared helpers for the Aura deck tools: find the Aura folder, serve it over a private local web server
// (ES modules and three.js do not load from file:// pages), start Microsoft Edge, open a deck in all-slides mode.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');

const ENGINE = path.resolve(__dirname, '..', '..');

function findAuraRoot(start) {
  let dir = path.resolve(start);
  if (fs.existsSync(dir) && fs.statSync(dir).isFile()) dir = path.dirname(dir);
  for (let d = dir; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.aura')) && fs.statSync(path.join(d, '.aura')).isDirectory()) return d;
    if (path.dirname(d) === d) break;
  }
  const env = process.env.CLAUDE_PROJECT_DIR;
  if (env && fs.existsSync(path.join(env, '.aura'))) return path.resolve(env);
  return fs.existsSync(path.join(process.cwd(), '.aura')) ? process.cwd() : null;
}

// a deck argument may be a build folder (uses its index.html) or an .html file
function resolveDeck(arg) {
  if (!arg) throw new Error('Tell me which deck: a build folder or an .html file.');
  let p = path.resolve(arg);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) throw new Error('Deck not found: ' + p);
  return p;
}

// the folder to serve: the Aura root when the deck is inside it (build decks reach ../../../engine), else the deck's folder
function serveRootFor(deck) {
  const root = findAuraRoot(deck);
  if (!root) return path.dirname(deck);
  const rel = path.relative(root, deck);
  /* On Windows path.relative() across DRIVE LETTERS returns an absolute path ('C:\\Users\\...'), which does not
     start with '..' - so the old containment test said 'inside the root' for a deck on another drive, and we
     served a folder that did not contain it. Every request 404'd and the deck opened blank. isAbsolute is the
     missing half of the test. This is reachable for real: Lumi on C: exporting a deck kept on D:. */
  const inside = !!rel && !path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep);
  return inside ? root : path.dirname(deck);
}

const MIME = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.txt': 'text/plain; charset=utf-8' };

// tiny static server confined to `root`; follows the .aura/engine junction like the browser would
function serve(root) {
  root = path.resolve(root);
  const srv = http.createServer((req, res) => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); return res.end(); }
    const file = path.resolve(root, '.' + rel);
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': st.size, 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise((ok, fail) => {
    srv.once('error', fail);
    srv.listen(0, '127.0.0.1', () => {
      const origin = 'http://127.0.0.1:' + srv.address().port;
      ok({ origin, root,
        url: f => origin + '/' + path.relative(root, f).split(path.sep).map(encodeURIComponent).join('/'),
        close: () => new Promise(r => { srv.closeAllConnections && srv.closeAllConnections(); srv.close(() => r()); }) });
    });
  });
}

function playwright() {
  try { return require(path.join(ENGINE, 'node_modules', 'playwright-core')); }
  catch (e) { return require('playwright-core'); }
}
// A GPU-less or driver-broken machine still has to produce a deck: these force ANGLE onto SwiftShader, Chromium's
// software GL. Verified end to end on 2026-10-07 - the real finalize of a two-scene three.js deck took 9.2 s and the
// frames carry the lit mesh, so this is a usable fallback and not just a test switch. finalize.js retries with it.
const SOFT_GL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'];

async function launch(opts) {
  if (process.env.AURA_TEST_NO_BROWSER) throw new Error('Microsoft Edge could not be started for the check: (test switch AURA_TEST_NO_BROWSER)');
  const { chromium } = playwright();
  // the caller's args go LAST so a deliberate retry (finalize's software-GL fallback) outranks the env switch
  const extraArgs = (process.env.AURA_BROWSER_ARGS || '').split(/\s+/).filter(Boolean).concat((opts && opts.args) || []);
  try { return await chromium.launch({ channel: 'msedge', args: extraArgs }); }
  catch (e) {
    try { return await chromium.launch({ channel: 'chrome', args: extraArgs }); }
    catch (e2) { throw new Error('Microsoft Edge could not be started for the check: ' + e.message.split('\n')[0]); }
  }
}

// open a deck in all-slides mode and wait until the runtime says it is ready (3D stills rendered, fonts loaded)
async function openDeck(page, url, { mode = 'all', timeout = 60000 } = {}) {
  await page.goto(url + (mode ? (url.includes('?') ? '&' : '?') + 'aura=' + mode : ''), { waitUntil: 'load', timeout });
  await page.waitForFunction(() => !window.Aura || document.documentElement.dataset.auraReady === '1', null, { timeout }).catch(() => {});
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(150);
}

// one PNG per slide (slides are 1920 x 1080 elements in all-slides mode)
async function shootSlides(page, outDir, { prefix = 'slide-' } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) if (f.startsWith(prefix) && f.endsWith('.png')) fs.unlinkSync(path.join(outDir, f));
  const handles = await page.$$('.deck > .slide, body > .slide');
  const files = [];
  for (let i = 0; i < handles.length; i++) {
    const file = path.join(outDir, prefix + String(i + 1).padStart(2, '0') + '.png');
    await handles[i].screenshot({ path: file, animations: 'disabled' });
    files.push(file);
  }
  return files;
}

async function slideInfo(page) {
  return page.evaluate(() => {
    if (window.Aura && Aura.slides) return Aura.slides();
    return Array.from(document.querySelectorAll('.slide'), (s, i) => ({ index: i, number: i + 1,
      title: (s.querySelector('h1,h2,h3') || {}).textContent || '', minutes: null, kind: 'content',
      // a deck without the Aura runtime: its notes are the .notes / [data-aura-notes] element, as finalize.js reads them
      notes: (() => { const n = s.querySelector('[data-aura-notes], .notes'); return n ? n.textContent.replace(/\s+/g, ' ').trim() : ''; })() }));
  });
}

// B-02: what the browser actually rendered. A checker that measures a deck whose 3D never started has measured the wrong deck,
// so every checker calls this right after openDeck() and treats `problem` as "could not verify" (never a pass).
async function probeRender(page, { expectHttp = true } = {}) {
  const r = await page.evaluate(() => {
    const holders = Array.from(document.querySelectorAll('.aura-3d[data-scene]'));
    return { protocol: location.protocol, runtime: !!window.Aura, ready: document.documentElement.dataset.auraReady === '1',
      holders: holders.length, fallback: holders.filter(h => h.hasAttribute('data-fallback')).length,
      drawn: holders.filter(h => h.querySelector('canvas') || Array.from(h.querySelectorAll('img')).some(i => i.naturalWidth > 0)).length,   // all-slides mode swaps the canvas for a still frame <img>
      slides: document.querySelectorAll('.deck > .slide, body > .slide').length };
  });
  let problem = '';
  if (expectHttp && r.protocol !== 'http:') problem = `the deck was opened over ${r.protocol}, where three.js cannot load`;
  else if (r.runtime && !r.ready) problem = 'the deck did not finish drawing (the runtime never reported ready), so what was measured is not the final deck';
  else if (!r.slides) problem = 'no slides were found in the page';
  return Object.assign(r, { problem });
}

const rel = (root, f) => (root ? path.relative(root, f) : f).split(path.sep).join('/');

module.exports = { probeRender, ENGINE, SOFT_GL_ARGS, findAuraRoot, resolveDeck, serveRootFor, serve, launch, openDeck, shootSlides, slideInfo, rel };
