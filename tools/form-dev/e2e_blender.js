// Blender batch 3 walk: the REAL pages in Edge against a sandbox server with the fake Claude AND the fake Blender
// (AURA_BLENDER=tools/form-dev/fake_blender.py, AURA_FAKE_BLENDER_ART=1 so previews are visible pictures).
//   plan: engine chips (default, "?" note, a choice that persists) -> build: preview card under the shrunk slide, Enter never sends,
//   a change -> preview 2, the history, estimates, approve -> render progress -> rendered; an animation: 720/1080 with estimates,
//   render -> cancel (tap twice) -> "skip for now" -> finalize 409 blender-pending -> "go to slide" -> editor approve + render ->
//   finalize -> editor "change the design" -> deck changed since finalizing -> finalize 409 blender-stale -> "use it anyway".
// Started by tools/form-dev/test_frontend.py --e2e (after the main walk), or by hand with a server already running:
//   AURA_E2E_PORT=8862 node tools/form-dev/e2e_blender.js 1366 768
// Exit code 0 only when every check holds, the page never scrolls, the slide stays visible beside the card, and no console error.
const fs = require('fs');
const path = require('path');
const os = require('os');
const PW = [process.env.AURA_PLAYWRIGHT, 'playwright', 'X:/CLPHP_Project/frontend/node_modules/playwright'].filter(Boolean);
let chromium;
for (const p of PW) { try { ({ chromium } = require(p)); break; } catch (e) { /* next */ } }
if (!chromium) { console.log('SKIP: playwright is not installed (set AURA_PLAYWRIGHT)'); process.exit(2); }
const PORT = +process.env.AURA_E2E_PORT || 8798, BASE = `http://127.0.0.1:${PORT}`;
const W = +process.argv[2] || 1366, H = +process.argv[3] || 768;
const tag = `blender-${W}x${H}`;
const OUT = path.join(process.env.AURA_E2E_OUT || path.join(os.tmpdir(), 'lumi-e2e'), tag) + path.sep;
const AURA = process.env.AURA_HOME || '';
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) fs.rmSync(OUT + f);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n = 0, pass = 0, total = 0;
const log = (...a) => console.log(`[${tag}]`, ...a);
const check = (name, ok, detail = '') => { total++; if (ok) pass++; log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : '   -> ' + JSON.stringify(detail).slice(0, 300)}`); };
const api = async (p, body, method) => { const r = await fetch(BASE + p, body === undefined && !method ? {} : { method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); return r.json().catch(() => ({})); };
async function until(fn, ms = 60000, every = 250) { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v) return v; await sleep(every); } return v; }

(async () => {
  // ---- a deck with a plan: slide 1 a still 3D (Bold Blue -> studio render by default), slide 2 a turning 3D, slide 3 text
  await api('/api/brief', { basics: { title: 'Pumps in studio light' }, look: { theme: 'Bold Blue' }, style: { quality: 'balanced' } });
  const st = await api('/api/plan/start', {});
  const D = st.deckId;
  let pj = await until(async () => { const p = await api(`/api/decks/${D}/plan`); return p.planState === 'ready' && !p.running && p.plan && p.plan.slides.length ? p : null; }, 90000);
  const plan = JSON.parse(JSON.stringify(pj.plan));
  plan.slides = plan.slides.slice(0, 3);
  plan.doubts = [];
  Object.assign(plan.slides[0], { title: 'The pump, in studio light', point: 'one pump moves the whole loop', bullets: [], visual: { main: '3d', companions: [], detail: 'detailed', motion: 'still', phrase: 'a pump on a stand' } });
  Object.assign(plan.slides[1], { title: 'The rotor turning', point: 'the rotor spins the fluid', bullets: [], visual: { main: '3d', companions: [], detail: 'detailed', motion: 'timed', phrase: 'a rotor' } });
  Object.assign(plan.slides[2], { title: 'What to remember', point: 'pumps move heat', bullets: ['small pumps', 'big loops'], visual: { main: 'text', companions: [], phrase: '' } });
  await api(`/api/decks/${D}/plan`, { plan });
  pj = await until(async () => { const p = await api(`/api/decks/${D}/plan`); return !p.running && !(p.queued || []).length ? p : null; }, 60000);
  const [s1, s2] = pj.plan.slides.map(x => x.id);
  const scene = sid => path.join(AURA, 'decks', D, 'blender', sid, 'scene.py');

  const browser = await chromium.launch({ channel: 'msedge' });
  const errs = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: W, height: H } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    // the finalize refusals (409 blender-pending / blender-stale) are answers this walk asks for on purpose; the browser still logs them
    page.on('console', m => { if (m.type() === 'error' && !(/status of 409/.test(m.text()) && /\/finalize$/.test((m.location() || {}).url || ''))) errs.push('console.error: ' + m.text().slice(0, 200) + ' ' + ((m.location() || {}).url || '')); });
    const shot = async name => { await page.screenshot({ path: `${OUT}${String(++n).padStart(2, '0')}-${name}.png` }); };
    const noScroll = () => page.evaluate(() => !(document.documentElement.scrollHeight > innerHeight + 2 || document.documentElement.scrollWidth > innerWidth + 2));
    // the slide must stay visible while the card is open: the preview is on screen and the card never covers it
    const slideVisible = () => page.evaluate(() => {
      const r = s => { const e = document.querySelector(s); if (!e || !e.offsetParent) return null; const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, r: b.right, w: b.width, h: b.height }; };
      const route = window.__aura.route, root = '#' + route;
      const p = r(root + ' .ed-preview'), c = r(root + ' .bl-dock');
      return { ok: !!p && p.w > 280 && p.t >= 0 && p.b <= innerHeight && (!c || c.t >= p.b - 1), p, c };
    });
    const card = () => page.evaluate(() => { const c = document.querySelector('.bl-card:not([hidden])'); if (!c) return null;
      const t = s => { const e = c.querySelector(s); return e && e.offsetParent ? e.textContent.trim() : ''; };
      return { mode: c.dataset.mode, head: t('.bl-h'), msg: t('.bl-msg'), go: t('.bl-go'), est: [...c.querySelectorAll('.bl-est')].filter(e => e.offsetParent).map(e => e.textContent), bar: t('.bl-bt'),
        hist: t('.bl-hlab'), img: (c.querySelector('.bl-img') || {}).naturalWidth || 0, res: [...c.querySelectorAll('.bl-r')].map(e => e.textContent), cap: t('.bl-cap') }; });
    const view = sid => api(`/api/decks/${D}/blender/${sid}`);
    const waitCard = (pred, ms = 60000) => until(async () => { const c = await card(); return c && pred(c) ? c : null; }, ms, 200);

    await page.goto(BASE + '/');
    // the loading screen: confirm the sign-in; a sandbox without its private Python (--no-venv) gets "carry on anyway"
    await until(async () => {
      if (await page.evaluate(() => window.__aura && window.__aura.route !== 'loading')) return true;
      if (await page.$('.ld-c-who')) await page.click('.ld-primary:has-text("that")').catch(() => {});
      const skip = page.locator('text=carry on anyway');
      if (await skip.count() && await skip.first().isVisible()) await skip.first().click().catch(() => {});
      return false;
    }, 120000, 500);

    // ================================================================ plan page: the engine chips
    await page.evaluate(id => window.__aura.plan(id), D);
    await page.waitForSelector('.pl-list .pl-row', { timeout: 60000 }); await sleep(1200);
    const pic = await page.textContent('.pl-picline');
    check('plan: the picture line names the engine (studio render, the Bold Blue default for a still 3D)', /3D model · studio render/.test(pic), pic);
    await page.click('.pl-picline'); await sleep(300);
    await page.click('.pl-chips[aria-label="main picture"] .pl-chip.on'); await sleep(500);
    const chips = await page.evaluate(() => [...document.querySelectorAll('.pl-eng')].map(b => ({ id: b.dataset.eng, on: b.classList.contains('on'), t: b.textContent })));
    check('plan: two named options, studio render · blender suggested and on', chips.length === 2 && chips[0].id === 'blender' && chips[0].on && /studio render · blender/.test(chips[0].t) && /suggested/.test(chips[0].t)
      && /live 3D · three.js/.test(chips[1].t) && /instant, animated, editable/.test(chips[1].t), chips);
    check('plan: the studio render note carries the server estimate (still ≈ … min)', /photo-real; still ≈ (\d+ min|under a minute)/.test(chips[0].t), chips[0].t);
    await page.evaluate(() => document.querySelector('.pl-card .pl-pic').scrollTo(0, 9999)); await sleep(200);
    await shot('plan-engine-chips');
    await page.click('.pl-eng[data-eng=blender] .pl-chip-q'); await sleep(400);
    const why = await page.textContent('.pl-chead .pl-note');
    check('plan: "?" explains the studio render in plain words', /studio render: a photo-real picture, made with Blender/.test(why), why);
    await shot('plan-engine-why');
    await page.click('.pl-eng[data-eng=threejs]'); await sleep(2600);
    let e1 = (await api(`/api/decks/${D}/plan`)).engines[s1];
    check('plan: picking live 3D is saved (chosen, three.js)', e1 && e1.engine === 'threejs' && e1.chosen, e1);
    await page.click('.pl-eng[data-eng=blender]'); await sleep(2600);
    e1 = (await api(`/api/decks/${D}/plan`)).engines[s1];
    check('plan: picking the studio render back is saved (chosen, blender)', e1 && e1.engine === 'blender' && e1.chosen, e1);
    await page.click('.pl-row >> nth=1'); await sleep(700);
    await page.click('.pl-picline'); await sleep(300);
    await page.click('.pl-chips[aria-label="main picture"] .pl-chip.on'); await sleep(500);
    await page.click('.pl-eng[data-eng=blender]'); await sleep(500);
    const n2 = await page.textContent('.pl-eng[data-eng=blender]');
    // a deck that bakes renders an animation once (one time, no resolution); an older deck still offers 720p and 1080p
    check('plan: a turning 3D slide says what its animation costs', /animation ≈ .+|720p ≈ .+, 1080p ≈ .+/.test(n2), n2);
    await sleep(2400);
    const e2 = (await api(`/api/decks/${D}/plan`)).engines[s2];
    check('plan: slide 2 chosen as a studio render animation', e2 && e2.engine === 'blender' && e2.kind === 'animation', e2);
    check('plan: no page scroll', await noScroll());
    await shot('plan-engine-anim');

    // ================================================================ build page: slide 1 preview card
    await page.click('.pl-build'); await sleep(400);
    await page.click('.pl-dlg .pl-big:has-text("yes, build slide 1")');
    await page.waitForFunction(() => window.__aura.route === 'build', null, { timeout: 30000 });
    let c = await waitCard(c => c.mode === 'open' && /do you like the design/.test(c.head) && c.img > 0, 90000);
    check('build: after slide 1 the card asks "do you like the design?" with the preview picture', !!c, c);
    check('build: estimates before committing: full render time, and one more preview (time + cost)', c && c.est.some(t => /^full render ≈ .+ · runs on this computer/.test(t)) && c.est.some(t => /^one more preview ≈ /.test(t) && !/tokens/.test(t)), c && c.est);
    let sv = await slideVisible();
    check('build: the slide stays visible above the card (no overlap)', sv.ok, sv);
    check('build: no page scroll with the card open', await noScroll());
    const mainHidden = await page.evaluate(() => { const b = document.querySelector('.bd-main'); return !b.offsetParent || b.disabled; });
    check('build: "make next slide" is not offered while the design waits for an answer', mainHidden);
    await shot('build-preview-1');
    // Enter never sends
    await page.click('.bl-chg-in'); await page.keyboard.type('a darker casing'); await page.keyboard.press('Enter'); await sleep(900);
    let v1 = await view(s1);
    check('build: Enter in the change box is a new line, never a send', v1.status === 'preview' && (await page.inputValue('.bl-chg-in')).includes('\n'), v1.status);
    await page.fill('.bl-chg-in', 'a darker casing, render-slowly');
    await page.click('.bl-send');
    c = await waitCard(c => /claude is changing the design|making a new preview/.test(c.head), 20000);
    check('build: a change shows "claude is changing the design" (then a new preview)', !!c, c);
    await shot('build-changing');
    c = await waitCard(c => /do you like the design/.test(c.head) && /preview 2 of 2/.test(c.hist), 90000);
    check('build: preview 2 arrives with the history (2 of 2) and the change as its caption', !!c && /darker casing/.test(c.cap), c);
    await shot('build-preview-2');
    await page.click('.bl-dot >> nth=0'); await sleep(400);
    c = await card();
    check('build: flipping back shows preview 1 as "an older preview" (approve is for the newest only)', c && /older preview/.test(c.head) && /show the newest/.test(c.go) && /preview 1 of 2/.test(c.hist), c);
    await shot('build-history');
    await page.click('.bl-go'); await sleep(300);
    await page.click('.bl-go:has-text("yes, render it")');
    c = await waitCard(c => c.mode === 'bar' && /rendering slide 1/.test(c.bar), 20000);
    check('build: approving starts the full render: a slim bar with progress, the slide back at full size', !!c, c);
    await until(async () => /rendering slide 1 · [1-9]/.test(((await card()) || {}).bar || ''), 20000, 200);
    // the waiting game is the flappy one now (lumi-play.js): the arena with the pause control, beside the real step
    const during = await page.evaluate(() => ({ main: document.querySelector('.bd-main').disabled, play: !!document.querySelector('.pl-play:not([hidden])'),
      arena: !!document.querySelector('.pl-arena'), label: (document.querySelector('.pl-arena') || {}).ariaLabel || ((document.querySelector('.pl-arena') || { getAttribute: () => '' }).getAttribute('aria-label') || ''),
      say: (document.querySelector('.pl-step-h') || {}).textContent }));
    check('build: while it renders: no next slide, the flappy waiting game shows with the render step',
      during.main && during.play && during.arena && /flappy/i.test(during.label || '') && /rendering slide 1/.test(during.say || ''), during);
    check('build: no page scroll while rendering', await noScroll());
    // A full render is the long wait the game exists for (the owner's real deck took 45 minutes), so this is where it
    // is played: space flaps it once it holds the keyboard, the arena grows to the lower half of the stage, and the
    // pause control shrinks it back. A slide build in e2e_walk can finish in a second, which is too short to drive.
    const g0 = await page.evaluate(() => {
      const a = document.querySelector('.pl-arena');
      return { h: Math.round(a.getBoundingClientRect().height), tab: a.tabIndex };
    });
    await page.focus('.pl-arena');
    await page.keyboard.press('Space'); await sleep(200); await page.keyboard.press('Space'); await sleep(700);
    const g1 = await page.evaluate(() => {
      const a = document.querySelector('.pl-arena').getBoundingClientRect(), p = document.querySelector('.pl-pause');
      return { h: Math.round(a.height), big: document.querySelector('.bd-playhost').classList.contains('is-big'),
        pause: p && !p.hidden ? p.textContent.trim() : null };
    });
    check('build: space plays the game and the arena grows to the lower half of the stage',
      g0.tab >= 0 && g1.big === true && g1.h > g0.h * 2, { g0, g1 });
    check('build: the control says "pause", in a word', g1.pause === 'pause', g1);
    check('build: no page scroll while the game is open', await noScroll());
    await shot('build-game-playing');
    await page.click('.pl-pause'); await sleep(700);
    const g2 = await page.evaluate(() => {
      const a = document.querySelector('.pl-arena').getBoundingClientRect(), p = document.querySelector('.pl-pause');
      return { h: Math.round(a.height), big: document.querySelector('.bd-playhost').classList.contains('is-big'),
        resume: p && !p.hidden ? p.textContent.trim() : null };
    });
    check('build: pause shrinks it back and offers "resume"',
      g2.big === false && g2.resume === 'resume' && g2.h < g1.h, { g1, g2 });
    await page.evaluate(() => document.querySelector('.pl-arena').blur());
    await shot('build-rendering');
    c = await waitCard(c => c.mode === 'bar' && /studio render ready/.test(c.bar), 60000);
    check('build: rendered -> "studio render ready" and "make next slide" is back', !!c && await page.evaluate(() => !document.querySelector('.bd-main').disabled && /next slide/.test(document.querySelector('.bd-main').textContent)), c);
    await sleep(2500); await shot('build-rendered');

    // ================================================================ slide 2: an animation
    // A deck that bakes (batch 6 B.9, every new deck) renders it once and on its own: a rough look, then the final loop,
    // no approval and no resolution. What the person must still get is the cost before it is spent, so the card's
    // first words are recorded as they appear (the rough look can be over in a second under the fake Blender).
    await page.evaluate(() => {
      const w = window.__bake = { said: '' };
      // the up-front "≈ x in all", or (when the fake rough look is over before slide 2's card is up) the bake's own time left
      w.t = setInterval(() => {
        const c = document.querySelector('.bl-card:not([hidden])'); if (!c || w.said) return;
        const m = c.querySelector('.bl-msg'), b = c.querySelector('.bl-bt');
        if (m && /in all/.test(m.textContent)) w.said = m.textContent.trim();
        else if (b && /rendering slide 2 .*left/.test(b.textContent)) w.said = b.textContent.trim();
      }, 100);
    });
    await page.click('.bd-main');
    // whether this slide bakes is the server's call (bl_baked), known before it is built; slide 1's card is still on
    // screen until slide 2 is done, so everything below waits on slide 2's OWN state, never on whatever card shows
    const v2 = await view(s2);
    if (v2 && v2.baked) {
      const seen = new Set();
      const busy = await until(async () => { const v = await view(s2); if (v && v.status) seen.add(v.status); return v && /previewing|rendering/.test(v.status || '') ? v : null; }, 120000, 300);
      if (busy) await shot('build-anim-baking');
      const done = await until(async () => { const v = await view(s2); if (v && v.status) seen.add(v.status); return v && v.status === 'rendered' ? v : null; }, 180000, 300);
      const said = await page.evaluate(() => { clearInterval(window.__bake.t); return window.__bake.said; });
      check('build: a baked animation says how long it takes (up front, or as time left while it renders)', /then the final loop.+≈ .+ in all|rendering slide 2 .*left/.test(said), said);
      check('build: the final loop renders by itself, with no approval asked', !!done && !seen.has('approved'), [...seen]);
      c = await waitCard(c => c.mode === 'bar' && /studio render ready/.test(c.bar), 30000);
      const on2 = await page.evaluate(() => /^slide 2 of/.test(document.querySelector('.ed-pos').textContent));
      check('build: the baked loop lands in slide 2, with no resolution offered (a bake has one)', !!c && on2 && c.res.length === 0, { c, on2 });
      await page.waitForFunction(() => { const b = document.querySelector('.bd-main'); return b && !b.disabled && /next slide/.test(b.textContent); }, null, { timeout: 30000 }).catch(() => {});
      check('build: "make next slide" is back once the loop is in', await page.evaluate(() => !document.querySelector('.bd-main').disabled));
      await shot('build-anim-rendered');
      await page.click('.bd-main');
      await page.waitForFunction(() => { const b = document.querySelector('.bd-main'); return b && !b.disabled && /finalize/.test(b.textContent); }, null, { timeout: 90000 });
      await sleep(800);
      await page.click('.bd-main');
      await page.waitForFunction(() => /all done|didn’t work|isn’t finished/.test((document.querySelector('.fz-h') || {}).textContent || ''), null, { timeout: 240000 });
      const fh0 = await page.textContent('.fz-h');
      check('finalize: with every studio render done it finishes', /all done/.test(fh0), fh0);
      await shot('finalize-done');
    } else {     // a deck that does not bake: 720/1080, render + cancel, skip for now, then the finalize stop for it
    await page.evaluate(() => clearInterval(window.__bake.t));
    c = await waitCard(c => c.mode === 'open' && /do you like the design/.test(c.head) && c.img > 0, 90000);
    check('build: slide 2 (animation) offers 720p and 1080p, each with its estimate, 720p first', !!c && c.res.length === 2 && /720p ≈/.test(c.res[0]) && /1080p ≈ .+sharper/.test(c.res[1]), c && c.res);
    const on720 = await page.evaluate(() => document.querySelector('.bl-r.on').textContent);
    check('build: 720p is the default for an animation', /^720p/.test(on720), on720);
    await shot('build-anim-preview');
    await page.fill('.bl-chg-in', 'smoother spin, render-slowly');
    await page.click('.bl-send');
    c = await waitCard(c => /do you like the design/.test(c.head) && /preview 2 of 2/.test(c.hist), 90000);
    await page.click('.bl-r >> nth=1'); await sleep(200);
    c = await card();
    check('build: picking 1080p changes the full render estimate', c && c.est.some(t => /full render ≈/.test(t)), c && c.est);
    await page.click('.bl-go:has-text("yes, render it")');
    await until(async () => (await view(s2)).job && (await view(s2)).job.state === 'running', 20000, 200);
    const job = (await view(s2)).job || {};
    check('build: the animation renders at 1080p', job.kind === 'full' && job.res === 1080, job);
    await waitCard(c => /rendering slide 2/.test(c.bar), 10000);
    await shot('build-anim-rendering');
    await page.click('.bl-bx'); await sleep(300);
    const armed = await page.textContent('.bl-bx');
    check('build: cancel asks first ("tap again to cancel")', /tap again/.test(armed), armed);
    await shot('build-cancel-confirm');
    await page.click('.bl-bx');
    c = await waitCard(c => c.mode === 'open' && /design approved/.test(c.head), 20000);
    check('build: cancelled -> the approval is kept, "render it" offered again', !!c && /render it/.test(c.go), c);
    await shot('build-cancelled');
    await page.click('.bl-skip');
    c = await waitCard(c => c.mode === 'bar' && /preview kept for now/.test(c.bar), 10000);
    check('build: "skip for now, keep the preview" folds it to a bar and lets the next slide start', !!c && await page.evaluate(() => !document.querySelector('.bd-main').disabled), c);
    await shot('build-skipped');
    await page.click('.bd-main');
    await page.waitForFunction(() => { const b = document.querySelector('.bd-main'); return b && !b.disabled && /finalize/.test(b.textContent); }, null, { timeout: 90000 });
    await sleep(800);

    // ================================================================ finalize: 409 blender-pending -> go to slide 2 (editor)
    await page.click('.bd-main');
    await page.waitForSelector('.fz-bl-row', { timeout: 30000 }); await sleep(400);
    const fz = await page.evaluate(() => ({ h: document.querySelector('.fz-h').textContent, rows: [...document.querySelectorAll('.fz-bl-row')].map(r => r.textContent) }));
    check('finalize: 409 blender-pending explained, slide 2 listed with its reason and a "go to slide 2" button', /studio render isn’t finished/.test(fz.h) && fz.rows.length === 1 && /The rotor turning/.test(fz.rows[0])
      && /kept as a preview for now|approved/.test(fz.rows[0]) && /go to slide 2/.test(fz.rows[0]), fz);
    check('finalize: no page scroll', await noScroll());
    await shot('finalize-pending');
    await page.click('.fz-bl-go');
    await page.waitForFunction(() => window.__aura.route === 'editor', null, { timeout: 20000 });
    c = await waitCard(c => c.mode === 'bar', 20000);
    check('editor: opens on slide 2 with its studio-render bar', !!c && /preview kept for now/.test(c.bar), c);
    await page.waitForFunction(() => { const v = document.querySelector('#editor .ed-veil'); return !v || v.hidden || getComputedStyle(v).display === 'none'; }, null, { timeout: 30000 }).catch(() => {}); await sleep(300);
    await shot('editor-slide2-bar');
    await page.click('.bl-bb');
    c = await waitCard(c => c.mode === 'open', 5000);
    sv = await slideVisible();
    check('editor: "show it" docks the card under the shrunk slide (slide visible, no overlap)', !!c && sv.ok, sv);
    await page.click('.bl-r >> nth=0');
    await page.click('.bl-go');
    await waitCard(c => /rendering slide 2/.test(c.bar), 20000);
    await shot('editor-rendering');
    c = await waitCard(c => /studio render ready/.test(c.bar), 120000);
    check('editor: the animation renders and the bar says ready (720p loop)', !!c && /720p loop/.test(c.bar), c);

    // ================================================================ finalize for real, then "change the design" in the editor
    await page.click('.ed-fin');
    await page.waitForFunction(() => /all done|finalized/.test((document.querySelector('.fz-h') || {}).textContent || '') || /didn’t work/.test((document.querySelector('.fz-h') || {}).textContent || ''), null, { timeout: 240000 });
    const fh = await page.textContent('.fz-h');
    check('finalize: with every studio render done it finishes', /all done/.test(fh), fh);
    await shot('finalize-done');
    }
    await page.evaluate(id => window.__aura.edit(id, 1), D);
    await page.waitForFunction(() => window.__aura.route === 'editor', null, { timeout: 20000 });
    c = await waitCard(c => /studio render ready/.test(c.bar), 20000);
    await page.waitForFunction(() => { const v = document.querySelector('#editor .ed-veil'); return !v || v.hidden || getComputedStyle(v).display === 'none'; }, null, { timeout: 30000 }).catch(() => {}); await sleep(300);
    await shot('editor-slide1-bar');
    await page.click('.bl-bb');
    c = await waitCard(c => c.mode === 'open' && /in your slide/.test(c.head), 5000);
    check('editor: "change the design" opens the box with the estimate for one more preview', !!c && c.est.some(t => /one more preview/.test(t)), c);
    await page.fill('.bl-chg-in', 'a softer shadow');
    await shot('editor-change-typed');
    await page.click('.bl-send');
    c = await waitCard(c => /do you like the design/.test(c.head) && /preview 3 of 3/.test(c.hist), 90000);
    check('editor: the change comes back as a new preview to approve', !!c, c);
    const fin = await until(async () => { const d = await api(`/api/decks/${D}`); return d.deck && d.deck.changedSinceFinalize ? d.deck : null; }, 15000);
    check('editor: the deck is marked changed since finalizing', !!fin);
    await until(async () => /finalize again/.test(await page.textContent('.ed-fin')), 10000);
    check('editor: the finalize button says "finalize again"', /finalize again/.test(await page.textContent('.ed-fin')));
    sv = await slideVisible();
    check('editor: slide visible while the card is open, no page scroll', sv.ok && await noScroll(), sv);
    const veilGone = await page.waitForFunction(() => { const v = document.querySelector('#editor .ed-veil'); return !v || v.hidden || getComputedStyle(v).display === 'none'; }, null, { timeout: 20000 }).then(() => true, () => false);
    check('editor: the slide reloads after the change (no stuck "loading your slides" veil)', veilGone);
    await sleep(300);
    await shot('editor-change-preview');

    // ================================================================ finalize: 409 blender-stale -> use it anyway
    await page.click('.ed-fin');
    await page.waitForSelector('.fz-bl-row', { timeout: 30000 }); await sleep(400);
    const fs2 = await page.evaluate(() => ({ h: document.querySelector('.fz-h').textContent, acts: [...document.querySelectorAll('.fz-acts .fz-b')].map(b => b.textContent) }));
    check('finalize: 409 blender-stale explained with "use it anyway"', /older than its design/.test(fs2.h) && fs2.acts.includes('use it anyway'), fs2);
    await shot('finalize-stale');
    await page.click('.fz-acts .fz-b:has-text("use it anyway")');
    await page.waitForFunction(() => /all done|didn’t work/.test((document.querySelector('.fz-h') || {}).textContent || ''), null, { timeout: 240000 });
    check('finalize: "use it anyway" finalizes with the older render', /all done/.test(await page.textContent('.fz-h')));
    await shot('finalize-stale-done');
  } catch (e) {
    check('the walk ran to the end', false, String(e && e.stack || e).slice(0, 400));
    try { const pg = browser.contexts()[0].pages()[0]; await pg.screenshot({ path: `${OUT}zz-failed.png` }); } catch (x) { /* gone */ }
  } finally {
    await browser.close();
  }
  check('no console errors', errs.length === 0, errs.slice(0, 5));
  log(`${pass}/${total} blender walk checks passed. shots: ${OUT}`);
  process.exit(pass === total ? 0 : 1);
})();
