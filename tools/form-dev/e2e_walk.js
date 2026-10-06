// Front-end end-to-end walk (X-03): the REAL pages in Edge against a sandbox server with the fake Claude.
//   loading -> home -> start (topic, files) -> interview -> look -> plan (typing while the poll runs) -> build (questions, locks, coming-up edits, stop) -> finalize
//   -> home (rename / archive / delete + undo). Runs at one viewport; zoom 1.5 stands in for Ctrl+ at 150 %.
// Normally started by tools/form-dev/test_frontend.py --e2e, which makes the sandbox and the server. By hand:
//   AURA_E2E_PORT=8798 node tools/form-dev/e2e_walk.js 1366 768 [1.5]      (server already running on that port)
// Env: AURA_E2E_PORT (8798), AURA_E2E_OUT (screenshots folder), AURA_PLAYWRIGHT (path of the playwright package).
// Exit code 0 only when every check below holds and the page logged no console error.
const fs = require('fs');
const path = require('path');
const os = require('os');
const PW = [process.env.AURA_PLAYWRIGHT, 'playwright', 'X:/CLPHP_Project/frontend/node_modules/playwright'].filter(Boolean);
let chromium;
for (const p of PW) { try { ({ chromium } = require(p)); break; } catch (e) { /* next */ } }
if (!chromium) { console.log('SKIP: playwright is not installed (set AURA_PLAYWRIGHT)'); process.exit(2); }
const PORT = +process.env.AURA_E2E_PORT || 8798;
const W = +process.argv[2] || 1366, H = +process.argv[3] || 768, Z = +process.argv[4] || 1;
const tag = Z > 1 ? `zoom${Math.round(Z * 100)}` : `${W}x${H}`;
const OUT = path.join(process.env.AURA_E2E_OUT || path.join(os.tmpdir(), 'lumi-e2e'), tag) + path.sep;
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) fs.rmSync(OUT + f);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 60000, every = 500) { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v) return v; await sleep(every); } return v; }
let n = 0, pass = 0, total = 0;
const log = (...a) => console.log(`[${tag}]`, ...a);
(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ viewport: { width: Math.round(W / Z), height: Math.round(H / Z) }, deviceScaleFactor: Z });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text().slice(0, 200)); });
  // a refusal has to name itself: a bare "status of 409" in the console says nothing about which call was refused
  const bad = [];
  page.on('response', async r => {
    if (r.status() < 400) return;
    let why = '';
    try { why = (await r.text()).slice(0, 200); } catch (e) { /* body gone */ }
    bad.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname} ${why}`);
    log('HTTP', bad[bad.length - 1]);
  });
  const shot = async name => { await page.screenshot({ path: `${OUT}${String(++n).padStart(2, '0')}-${name}.png` }); };
  const scrolls = () => page.evaluate(() => ({ doc: document.documentElement.scrollHeight > innerHeight + 2 || document.documentElement.scrollWidth > innerWidth + 2, zoom: document.documentElement.dataset.zoom, cls: document.documentElement.className }));
  const dlg = async text => { await page.click(`.pl-dlg .pl-big:has-text("${text}")`); };
  const waitBuilt = async k => page.waitForFunction(k => { const b = document.querySelector('.bd-main'); return b && !b.disabled && /next slide|finalize/.test(b.textContent) && true; }, k, { timeout: 180000 });
  const R = {};
  try {
    await page.goto(`http://127.0.0.1:${PORT}/${Z > 1 ? '?zoom=' + Z : ''}`);
    await sleep(900); await shot('loading');
    // sign-in fix: a login this install never confirmed shows "is this you?" first
    await page.waitForFunction(() => (window.__aura && window.__aura.route === 'home') || document.querySelector('.ld-c-who'), null, { timeout: 120000 });
    if (await page.$('.ld-c-who')) { await shot('loading-confirm'); await page.click('.ld-primary:has-text("that")'); }
    await page.waitForFunction(() => window.__aura && window.__aura.route === 'home', null, { timeout: 120000 });
    await sleep(1200); await shot('home-empty'); R.homeScroll = await scrolls();

    // ---- a second deck to practise the library actions on
    await page.evaluate(() => fetch('/api/decks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));

    // ---- starting a deck: one box, then the files (the 40-field form is gone)
    await page.evaluate(() => window.__aura.newDeck());
    await page.waitForFunction(() => window.__aura.route === 'start');
    await page.waitForSelector('#start .st-in'); await sleep(1200); await shot('start-topic');
    R.startScroll = await scrolls();
    await page.click('#start .st-in');
    await page.keyboard.type('a final-year project on a cheap soil sensor, 12 minutes in front of two examiners');
    await page.click('#start .pl-big.pl-ink');
    await page.waitForSelector('#start .st-folder'); await sleep(1200); await shot('start-files');
    // the scene behind this step follows the folder; switching twice quickly must leave exactly one (F-20)
    await page.locator('#start .st-folder').nth(2).click();
    await page.locator('#start .st-folder').nth(1).click();
    await sleep(2500);
    R.scenes = await page.evaluate(() => document.querySelectorAll('.scene-host').length);
    await page.click('#start .pl-big.pl-ink');

    // ---- the interview: several rounds, each mixing a multiple choice and a question in your own words
    await page.waitForFunction(() => window.__aura.route === 'plan');
    await page.waitForSelector('.iv .ch-card', { timeout: 120000 }); await sleep(1200); await shot('interview-round1');
    R.ivKinds = await page.evaluate(() => [...document.querySelectorAll('.iv .ch-tag')].map(t => t.textContent.trim()));
    // A reload in the middle must lose nothing: the open question lives in interview.json, not in the page. A reload
    // with nothing running lands on the library (Lumi only reopens a deck Claude is working on), so the walk opens the
    // deck again from there - which is exactly what a person would do - and the question must be waiting, word for word.
    const askedBefore = await page.evaluate(() => (document.querySelector('.iv .ch-q') || {}).textContent || '');
    const ivDeck = await page.evaluate(async () => {
      const r = await (await fetch('/api/decks')).json();
      const d = (r.decks || []).find(x => ['asking', 'waiting', 'error'].includes(x.interviewState));
      return d ? d.id : null;
    });
    R.ivDeck = ivDeck;
    await page.reload();
    await page.waitForFunction(() => window.__aura && window.__aura.route === 'home', null, { timeout: 120000 });
    await sleep(800);
    await page.evaluate(id => window.__aura.plan(id), ivDeck);
    await page.waitForSelector('.iv .ch-card', { timeout: 120000 }); await sleep(1500);
    R.ivAfterReload = await page.evaluate(() => (document.querySelector('.iv .ch-q') || {}).textContent || '');
    R.ivReloadKept = R.ivAfterReload === askedBefore && !!askedBefore;
    await shot('interview-after-reload');
    const roundNow = () => page.evaluate(() => (document.querySelector('.iv-round') || {}).textContent || '');
    R.loop = [];
    for (let round = 0; round < 6; round++) {
      if (await page.locator('.th-list').count()) { R.loop.push('theme'); break; }
      try { await page.waitForSelector('.iv .ch-card, .th-list', { timeout: 120000 }); } catch (e) { R.loop.push('no-card'); break; }
      if (await page.locator('.th-list').count()) { R.loop.push('theme'); break; }
      // the card is switched off while claude is still working: wait for it to come back before answering
      await page.waitForFunction(() => { const c = document.querySelector('.iv .ch-card'); return c && !c.classList.contains('is-waiting'); }, null, { timeout: 120000 });
      const was = await page.evaluate(() => (document.querySelector('.iv .ch-q') || {}).textContent || '');
      const opt = page.locator('.iv .ch-opt').first();
      if (await opt.count()) { await opt.click(); await sleep(400); }
      const next = page.locator('.iv .ch-next');
      if (await next.count() && await next.first().isVisible()) { await next.first().click(); await sleep(500); }
      const box = page.locator('.iv .ch-in');
      if (await box.count()) { await box.first().click(); await page.keyboard.type('that cheap sensors can save a whole harvest'); }
      const send = page.locator('.iv .ch-send');
      if (!(await send.count()) || !(await send.first().isVisible())) { R.loop.push('no-send@' + was); break; }
      R.loop.push('sent@' + was);
      await send.first().click();
      // While Claude thinks, the card is gone and only the round line has moved on: wait for the NEXT question
      // (or the look step), never merely for the round number.
      await page.waitForFunction(p => document.querySelector('.th-list')
        || (document.querySelector('.iv .ch-card') && ((document.querySelector('.iv .ch-q') || {}).textContent || '') !== p), was, { timeout: 120000 });
      await sleep(800);
    }
    R.ivRounds = await page.evaluate(() => { const t = document.querySelector('.iv-round'); return t ? t.textContent : ''; });

    // ---- the look: its own step, after the interview and before the plan
    await page.waitForSelector('.th-list .lk-opt', { timeout: 120000 }); await sleep(1500); await shot('theme-step');
    R.themeStep = true;
    await page.locator('.th-list .lk-opt').nth(1).click(); await sleep(800);
    await page.click('.th-left .pl-big.pl-ink');
    await sleep(1200); await shot('planning');
    await page.waitForSelector('.pl-list .pl-row', { timeout: 120000 }); await sleep(1500); await shot('plan-ready'); R.planScroll = await scrolls();
    R.cost = await page.evaluate(() => [...document.querySelectorAll('.pl-costl')].map(p => p.textContent));

    // F-18: type in the deck question box and let several polls pass
    await page.click('.pl-strip .pl-dq-opt >> nth=1');
    await page.click('.pl-strip .pl-dq-free'); await page.keyboard.type('typed while polling');
    await sleep(6500);
    R.noWipe = await page.evaluate(() => ({ v: document.querySelector('.pl-strip .pl-dq-free').value, on: (document.querySelector('.pl-strip .pl-dq-opt.on') || {}).textContent, focus: document.activeElement.className }));
    await shot('plan-typing-kept');
    // answer every deck-wide question, then every slide question
    for (let i = 0; i < 6; i++) {
      const b = page.locator('.pl-strip .pl-dq-send');
      if (!(await b.count()) || !(await b.first().isVisible())) break;
      await b.first().click(); await sleep(1800);
    }
    for (let i = 0; i < 6; i++) {
      const q = page.locator('.pl-qbadge');
      if (!(await q.count())) { const row = page.locator('.pl-row:has(.pl-st.is-q)'); if (await row.count()) { await row.first().click(); await sleep(400); continue; } break; }
      await q.first().click(); await sleep(400);
      for (let k = 0; k < 6; k++) { const s = page.locator('.pl-badgepop .pl-dq-send'); if (!(await s.count()) || !(await s.first().isVisible())) break; await s.first().click(); await sleep(900); }
      await sleep(1500);
    }
    await sleep(2500); await shot('plan-answered');
    // remove slides until 3 are left (two taps each), then undo one removal to see the undo toast
    while ((await page.locator('.pl-cpos').textContent()).match(/of (\d+)/)[1] > 3 || false) {
      const total = +(await page.locator('.pl-cpos').textContent()).match(/of (\d+)/)[1];
      if (total <= 3) break;
      await page.click('.pl-act[aria-label="remove this slide"]'); await page.click('.pl-act[aria-label="remove this slide"]'); await sleep(900);
    }
    await sleep(1500); await shot('plan-three'); R.undoVisible = await page.evaluate(() => !document.querySelector('.pl-undo').hidden);
    // slide 2 gets "ask-me" in its title so Claude asks real questions when it is built
    await page.click('.pl-row >> nth=1');
    await page.fill('.pl-title-in', 'ask-me the second one'); await page.keyboard.press('Tab');
    await sleep(2000);
    await page.waitForFunction(() => !document.querySelector('.pl-build').disabled, null, { timeout: 120000 });
    await shot('plan-before-build');
    await page.click('.pl-build'); await page.waitForSelector('.pl-dlg'); await sleep(500); await shot('plan-build-dialog');
    await dlg('yes, build slide 1');

    // ---- build page
    await page.waitForFunction(() => window.__aura.route === 'build', null, { timeout: 30000 });
    await sleep(2500); await shot('build-running'); R.buildScroll = await scrolls();
    R.homeEnabledWhileRunning = await page.evaluate(() => !document.querySelector('.ed-home').disabled);
    // W-01: edit the unbuilt slide 3 (coming up) while slide 1 is being built
    await page.click('.bd-up-row >> nth=-1');
    await page.waitForSelector('.bd-card'); await sleep(500); await shot('build-coming-up-edit');
    await page.fill('.bd-card .pl-title-in', 'edited while building'); await page.keyboard.press('Tab');
    await page.click('.pl-dlg .pl-big:has-text("save")'); await sleep(1500);
    R.comingUpSaved = await page.evaluate(async () => { const id = location.hash; const l = await (await fetch('/api/decks')).json(); const d = l.decks.find(x => x.planCount); const p = await (await fetch('/api/decks/' + d.id + '/plan')).json(); return p.plan.slides.map(s => s.title); });
    // the slide being built right now says so
    const rows = await page.locator('.bd-up-row').count();
    await page.evaluate(() => { const r = [...document.querySelectorAll('.bd-up-row')].find(x => x.classList.contains('is-now')); if (r) r.click(); });
    await sleep(500); R.targetBlocked = await page.evaluate(() => document.querySelector('.ed-toast').textContent);
    await shot('build-target-blocked');
    // add a slide from the coming-up header, then remove it again.
    // "coming up" counts every slide that is NOT built yet, so it still counts the one Claude is building right now.
    // Whether slide 1 has finished by this point is a race, so the count is checked RELATIVE to what it was before
    // the add, never against a fixed number (a fixed 3 failed whenever slide 1 was still in flight).
    const upN = async () => +((await page.evaluate(() => document.querySelector('.bd-up-n').textContent)) || 0);
    R.upBefore = await upN();
    await page.click('.bd-up-add'); await page.waitForSelector('.bd-card'); await page.fill('.bd-card .pl-title-in', 'a slide added mid build'); await page.keyboard.press('Tab');
    await page.click('.pl-dlg .pl-big:has-text("save")'); await sleep(1500); await shot('build-slide-added');
    R.slidesAfterAdd = await upN();
    // "coming up" only shows the first 3 rows and hides the rest behind "+N more", so membership is read from the plan
    // itself, not from the visible rows (a 4th slide is correctly off-list and that is not a failure).
    const planTitles = () => page.evaluate(async () => {
      const l = await (await fetch('/api/decks')).json();
      const d = l.decks.find(x => x.planCount);
      const p = await (await fetch('/api/decks/' + d.id + '/plan')).json();
      return p.plan.slides.map(s => s.title);
    });
    R.addedListed = (await planTitles()).some(t => /a slide added/.test(t || ''));
    await page.click('.bd-up-row:has-text("a slide added")').catch(async () => { await page.click('.bd-up-more'); await sleep(400); await page.click('.bd-all .bd-up-row:has-text("a slide added")'); });
    await page.waitForSelector('.bd-card'); await shot('build-remove-dialog');
    await page.click('.pl-dlg .pl-big:has-text("remove this slide")'); await page.click('.pl-dlg .pl-big:has-text("tap again")'); await sleep(1500);
    R.slidesAfterRemove = await upN();
    R.removedGone = !(await planTitles()).some(t => /a slide added/.test(t || ''));
    await waitBuilt(); await sleep(1500); await shot('build-slide1-done');
    // ---- slide 2: Claude asks real questions
    await page.click('.bd-main');
    await page.waitForSelector('.ws-pop', { timeout: 90000 }); await sleep(1200); await shot('build-questions');
    R.locked = await page.evaluate(() => document.querySelector('.bd-main').disabled);
    R.popFocus = await page.evaluate(() => !!document.activeElement.closest('.ws-pop'));
    await page.keyboard.press('ArrowDown'); await sleep(200);
    // batch 5 invariant: the card must never show an answer as chosen while every way forward is dead and nothing on
    // the card says why. (Claude's suggested answers arrive already ticked; the card is switched off while Claude
    // still works, and with no note that reads as a broken app - it is what trapped the real end-to-end run.)
    R.deadEnd = await page.evaluate(() => {
      const vis = e => !!e && e.offsetParent !== null && !e.hidden;
      const card = document.querySelector('.ws-pop .ch-card'); if (!card) return 'no card';
      const chosen = !!card.querySelector('.ch-opt.on');
      const nx = card.querySelector('.ch-next'), sd = card.querySelector('.ch-send');
      const canGo = (vis(nx) && !nx.disabled) || (vis(sd) && !sd.disabled);
      if (!chosen || canGo) return 'ok';
      const told = card.classList.contains('is-waiting') || card.classList.contains('is-locked');
      const note = [...card.querySelectorAll('.ch-wait')].some(vis);
      return told && note ? 'ok (explained)' : 'DEAD END: an answer is chosen, nothing can advance, and the card says nothing';
    });
    for (let i = 0; i < 6; i++) {
      await page.click('.ws-pop .ch-q:not([hidden]) .ch-opt >> nth=0');
      const nx = page.locator('.ws-pop .ch-next:not([hidden])');
      if (await nx.count() && await nx.first().isVisible()) await nx.first().click(); else break;
    }
    await shot('build-questions-last');
    await page.click('.ws-pop .ch-send');
    await waitBuilt(); await sleep(1200); await shot('build-slide2-done');
    // ---- stop test on slide 3
    await page.click('.bd-main'); await page.waitForSelector('.bd-stop:not([hidden])', { timeout: 20000 }); await sleep(1500);
    await page.click('.bd-stop'); await page.waitForSelector('.pl-dlg'); await shot('build-stop-dialog');
    // After a stop the server kills the run and the PAGE learns it from its next poll (1.5-5 s, slower when idle), so
    // the button is briefly still disabled. What matters to a person is that it comes BACK, not that it is back in 2.5 s:
    // wait for it (bounded) and record how long it took, so a build that can never be resumed still fails here.
    const stoppedAt = Date.now();
    await dlg('stop');
    await page.waitForFunction(() => { const b = document.querySelector('.bd-main'); return b && !b.disabled; }, null, { timeout: 30000 }).catch(() => {});
    R.stopResumeS = +((Date.now() - stoppedAt) / 1000).toFixed(1);
    R.afterStop = await page.evaluate(() => ({ main: document.querySelector('.bd-main .lbl').textContent, disabled: document.querySelector('.bd-main').disabled }));
    await shot('build-stopped');
    await page.click('.bd-main'); await waitBuilt(); await sleep(1200); await shot('build-all-built');
    // ---- finalize
    // "make next slide" goes enabled from the page's own poll, which can still be a second behind the server while the
    // last run settles. Clicking straight away makes the server answer 409 busy ("claude is still working on this
    // deck") - the finalize screen shows that reason, which is correct, but it is not what this walk is measuring.
    // Wait for the server itself to say Claude is idle, then finalize.
    await until(async () => page.evaluate(async () => {
      // `busy` on the server is `run is not None or settling is not None`, so the settling window counts too
      try { const s = await (await fetch('/api/claude/status')).json(); return !s.running && !s.waiting && !s.settling; } catch (e) { return false; }
    }), 120000, 1000);
    await page.click('.bd-main');
    await page.waitForFunction(() => window.__aura.route === 'finalize'); await sleep(2500); await shot('finalizing');
    await page.waitForFunction(() => /all done|already finalized/.test(document.querySelector('.fz-h') ? document.querySelector('.fz-h').textContent : ''), null, { timeout: 240000 });
    await sleep(1000); await shot('finalized'); R.finScroll = await scrolls();
    await page.click('.fz-b:has-text("back to my decks")'); await page.waitForFunction(() => window.__aura.route === 'home'); await sleep(2500); await shot('home-with-decks');
    // ---- library actions: rename, archive, delete + undo
    const card = page.locator('.hm-card').first();
    await card.locator('.hm-more').click(); await sleep(400); await shot('home-menu');
    await page.click('.hm-mi:has-text("rename")'); await page.fill('.hm-rename', 'Renamed from the library'); await page.keyboard.press('Enter'); await sleep(1500);
    R.renamed = await page.evaluate(() => [...document.querySelectorAll('.hm-title')].map(x => x.textContent));
    await shot('home-renamed');
    await page.locator('.hm-card').last().locator('.hm-more').click(); await page.click('.hm-mi:has-text("archive")'); await sleep(1800);
    R.afterArchive = await page.evaluate(() => ({ cards: document.querySelectorAll('.hm-card').length, arch: document.querySelector('.hm-arch').textContent }));
    await shot('home-archived');
    await page.click('.hm-arch'); await sleep(800); await shot('home-archive-view'); await page.click('.hm-arch'); await sleep(800);
    await page.locator('.hm-card').first().locator('.hm-more').click();
    await page.click('.hm-mi:has-text("delete")'); await page.click('.hm-mi:has-text("tap again")'); await sleep(1500);
    R.afterDelete = await page.evaluate(() => ({ cards: document.querySelectorAll('.hm-card').length, toast: document.querySelector('.hm-toast').textContent }));
    await shot('home-deleted-undo');
    await page.click('.hm-undo'); await sleep(2000);
    R.afterUndo = await page.evaluate(() => document.querySelectorAll('.hm-card').length);
    await shot('home-restored');
    log(JSON.stringify(R, null, 1));
    const ok = (name, cond) => { total++; if (cond) pass++; log((cond ? 'PASS ' : 'FAIL ') + name); };
    ok('home does not scroll at a normal zoom', Z > 1 || !R.homeScroll.doc);
    ok('zoom makes the page scroll instead of clipping (F-08)', Z === 1 || R.homeScroll.cls.includes('scrolls') || R.planScroll.cls.includes('scrolls'));
    ok('a double next leaves exactly one scene (F-20)', R.scenes === 1);
    ok('a round mixes a multiple choice and a question in your own words', R.ivKinds.includes('in your words') && R.ivKinds.length > 1);
    ok('a reload in the middle of the interview loses nothing', R.ivReloadKept === true);
    ok('the look is asked once, after the interview, before the plan', R.themeStep === true);
    ok('the plan page says how long the whole deck takes', R.cost.some(t => /to make this deck/.test(t)));
    // Lumi has just run Claude, so a fresh allowance reading usually exists here. What must never happen is a bare
    // number: an allowance line always carries its "as of" stamp, and no cost is ever quoted in tokens or money.
    // (That the line is left out ENTIRELY when the reading is missing or stale is proved in test_interview.py.)
    ok('the allowance line is stamped when it is shown, and no cost is ever tokens or money',
      R.cost.every(t => !/allowance/.test(t) || /as of/.test(t)) && !R.cost.some(t => /token|\$/.test(t)));
    ok('typing in a plan question survives the polls (F-18)', R.noWipe.v === 'typed while polling' && R.noWipe.on === 'Classmates' && /pl-dq-free/.test(R.noWipe.focus));
    ok('leaving the build page while claude works is allowed (W-04)', R.homeEnabledWhileRunning === true);
    ok('an unbuilt slide can be edited mid-build (W-01)', R.comingUpSaved.includes('edited while building'));
    ok('the slide being built right now says so', /building this slide right now/.test(R.targetBlocked));
    // What W-01 promises is that the new slide appears in "coming up" and the removed one leaves it. The COUNT also
    // drops by one whenever the slide being built finishes, which can happen at any moment here, so the count is only
    // checked for the right direction; the membership checks are the race-free ones.
    ok('add / remove a slide mid-build (W-01)', R.addedListed === true && R.removedGone === true
      && R.slidesAfterAdd <= R.upBefore + 1 && R.slidesAfterAdd >= R.upBefore
      && R.slidesAfterRemove < R.slidesAfterAdd);
    ok("claude's questions lock the build and take focus", R.locked === true && R.popFocus === true);
    ok('a question card is never a dead end (an answer chosen, nothing to press, no reason)', /^ok/.test(R.deadEnd || ''));
    ok('stop leaves a buildable deck', R.afterStop.main === 'make next slide' && R.afterStop.disabled === false);
    ok('stop hands the build back within one poll (under 30 s)', R.stopResumeS < 30);
    ok('rename from the library (W-02)', R.renamed.includes('Renamed from the library'));
    ok('archive hides a deck and counts it (W-02)', R.afterArchive.cards === 1 && /\(1\)/.test(R.afterArchive.arch));
    ok('delete moves to the bin and undo brings it back (W-02)', R.afterDelete.cards === 0 && /moved to the bin/.test(R.afterDelete.toast) && R.afterUndo === 1);
    ok('no console errors', errs.length === 0);
    ok('no request was refused', bad.length === 0);
  } catch (e) { log('ERR', e.message.split('\n')[0]); log(JSON.stringify(R)); total++; try { await page.screenshot({ path: OUT + 'zz-error.png' }); } catch (x) { /* gone */ } }
  finally { log('CONSOLE ERRORS:', errs.join(' | ') || 'none'); log('REFUSED REQUESTS:', bad.join(' | ') || 'none'); await browser.close(); }
  log(`${pass}/${total} e2e checks passed`);
  process.exit(pass === total && total > 0 ? 0 : 1);
})();
