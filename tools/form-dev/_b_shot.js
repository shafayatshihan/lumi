// Part B: screenshot the two screens from _b_screens.html at both sizes, and report anything that overflows the
// 1600x900 stage, anything clipped inside its own box, and any text under the 14 px floor (hard-rules minFontPx).
//   python tools/form-dev/static_server.py 8791   (in another shell)
//   node tools/form-dev/_b_shot.js [tag]
// Shots land in %TEMP%\lumi-b\<tag>\.
const fs = require('fs');
const os = require('os');
const path = require('path');
const PW = [process.env.AURA_PLAYWRIGHT, path.join(__dirname, '..', '..', 'engine', 'node_modules', 'playwright-core'), 'playwright'].filter(Boolean);
let chromium;
for (const p of PW) { try { ({ chromium } = require(p)); break; } catch (e) { /* next */ } }
if (!chromium) { console.log('SKIP: no playwright'); process.exit(2); }

const PORT = +process.env.AURA_B_PORT || 8791;
const TAG = process.argv[2] || 'now';
const OUT = path.join(os.tmpdir(), 'lumi-b', TAG);
fs.mkdirSync(OUT, { recursive: true });
const SIZES = [[1366, 768], [1920, 1080]];
const SCREENS = [['plan', 'screen=plan'], ['plan-badge', 'screen=plan&badge=1'],
  ['look', 'screen=look'], ['look-open', 'screen=look&many=1']];
// 12 px is allowed for a micro-label and nothing else; everything that carries meaning is 14 px or more
const MICRO = ['ql-rec', 'ql-lab'];

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  let bad = 0;
  for (const [W, H] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text().slice(0, 200)); });
    page.on('requestfailed', r => errs.push('404? ' + r.url()));
    page.on('response', r => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url()); });
    for (const [name, qs] of SCREENS) {
      await page.goto(`http://127.0.0.1:${PORT}/dev/_b_screens.html?${qs}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      const file = path.join(OUT, `${name}-${W}x${H}.png`);
      await page.screenshot({ path: file });
      // every fault the owner marked, measured rather than eyeballed
      const report = await page.evaluate(MICRO => {
        const st = document.getElementById('stage');
        const sb = st.getBoundingClientRect();
        const k = sb.width / 1600;                                  // the stage scale, to report in stage px
        const out = { over: [], clipped: [], small: [], covers: [] };
        const box = el => { const r = el.getBoundingClientRect(); return { l: (r.left - sb.left) / k, t: (r.top - sb.top) / k, r: (r.right - sb.left) / k, b: (r.bottom - sb.top) / k }; };
        const named = el => el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : el.tagName.toLowerCase();
        for (const el of st.querySelectorAll('*')) {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height || el.hidden) continue;
          const b = box(el);
          if (b.r > 1600.5 || b.b > 900.5 || b.l < -0.5 || b.t < -0.5) out.over.push(`${named(el)} ${Math.round(b.l)},${Math.round(b.t)} -> ${Math.round(b.r)},${Math.round(b.b)}`);
          if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible') out.clipped.push(`${named(el)} needs ${Math.round(el.scrollWidth / k)} has ${Math.round(el.clientWidth / k)}`);
          const t = (el.textContent || '').trim();
          if (t && !el.children.length) {
            const px = parseFloat(getComputedStyle(el).fontSize);   // the stage's css px ARE stage px: the scale is a transform
            if (px < 13.5 && !MICRO.some(c => el.classList.contains(c))) out.small.push(`${named(el)} ${px.toFixed(1)}px "${t.slice(0, 30)}"`);
          }
        }
        // does anything sit on top of the heading or the sub-line? (the owner's "drawn over the heading")
        for (const sel of ['.pl-h', '.pl-sub', '.pl-costl', '.th-h', '.ql-pill', '.ql-row']) {
          for (const el of st.querySelectorAll(sel)) {
            const r = el.getBoundingClientRect();
            if (!r.width) continue;
            const mid = document.elementFromPoint(r.left + Math.min(8, r.width / 2), r.top + r.height / 2);
            if (mid && mid !== el && !el.contains(mid) && !mid.contains(el)) out.covers.push(`${named(el)} is covered by ${named(mid)}`);
          }
        }
        return out;
      }, MICRO);
      const lines = [];
      for (const k of ['over', 'clipped', 'small', 'covers']) for (const s of report[k]) lines.push(`    ${k.toUpperCase()} ${s}`);
      bad += lines.length;
      console.log(`  ${lines.length ? 'FAIL' : 'PASS'} ${name} ${W}x${H}  -> ${file}`);
      for (const l of lines) console.log(l);
    }
    for (const e of errs) { bad++; console.log('    ERR ' + e); }
    await ctx.close();
  }
  await browser.close();
  console.log(bad ? `${bad} problems` : 'clean at both sizes');
  process.exit(bad ? 1 : 0);
})();
