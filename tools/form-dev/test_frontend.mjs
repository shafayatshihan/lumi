// Front-end unit tests (X-03): the pure logic of engine/form/js under Node, plus the structural rules the survey found broken
// (duplicated helpers, hard-coded palette, API strings, font floor, modals without focus handling).
//   node tools/form-dev/test_frontend.mjs        prints "PASS ..." / "FAIL ..." lines and "N/M frontend checks passed"
// tools/form-dev/test_frontend.py runs this (and the markers fixtures) and, with --e2e, the Playwright walk.
import fs from 'node:fs';
import path from 'node:path';
import { load, jsDir } from './fe_load.mjs';

let pass = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (ok) pass++; console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : '   -> ' + String(detail).slice(0, 240)}`); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const read = f => fs.readFileSync(path.join(jsDir, f), 'utf8');
const cssDir = path.join(jsDir, '..', 'css');
const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));

// ---------------------------------------------------------------- bus.js: ONE answer to "is claude running" (F-10)
{
  const B = await load('bus.js');
  B._resetClaude();
  check('bus: nothing reported -> not running', !B.claudeNow().running);
  B.setClaude({ running: true, deckId: 'a' }, 1000);
  check('bus: a report makes it running for that deck', B.claudeNow('a', 1500).running && !B.claudeNow('a', 1500).elsewhere);
  check('bus: for another deck it is "elsewhere", not running', !B.claudeNow('b', 1500).running && B.claudeNow('b', 1500).elsewhere);
  B.setClaude({ running: false }, 900);                      // an OLDER observation arriving late must not win
  check('bus: an older report never overrides a newer one', B.claudeNow('a', 1500).running);
  B.setClaude({ running: false }, 2000);
  check('bus: the freshest report wins', !B.claudeNow('a', 2100).running);
  B.setClaude({ running: true, deckId: 'a' }, 3000);
  check('bus: a "running" nobody refreshes is not believed for ever (stale)', B.claudeNow('a', 3000 + B.STALE_MS + 1).running === false);
  let n = 0; const off = B.on('claude:change', () => { n++; });
  B.setClaude({ running: true, waiting: false }, 4000); B.setClaude({ running: true }, 4100); B.setClaude({ waiting: true }, 4200);
  off();
  check('bus: claude:change fires only when something really changed', n >= 1 && n <= 2, n);
}

// ---------------------------------------------------------------- api.js: reachability, pacing, timeouts (F-19, F-09)
{
  const realFetch = globalThis.fetch;
  const A = await load('api.js');
  const flips = []; const off = A.onReach(ok => flips.push(ok));
  globalThis.fetch = async () => { throw new TypeError('network down'); };
  let r = await A.getJSON('/api/x');
  check('api: a network failure is {ok:false, error:"offline"}', r.ok === false && r.error === 'offline', JSON.stringify(r));
  check('api: one failure does not flip the state', A.reachable() === true);
  await A.getJSON('/api/x');
  check('api: two failures in a row flip it to unreachable (once)', A.reachable() === false && eq(flips, [false]), JSON.stringify(flips));
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
  await A.getJSON('/api/x');
  check('api: the next success flips it back', A.reachable() === true && eq(flips, [false, true]));
  globalThis.fetch = (u, o) => new Promise((_, rej) => { o.signal.addEventListener('abort', () => rej(new Error('aborted'))); });
  const t0 = Date.now(); r = await A.getJSON('/api/hang', 60);
  check('api: a hung request is cut off by the timeout and reported offline', r.error === 'offline' && Date.now() - t0 < 2000, JSON.stringify(r));
  globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({ error: 'no-deck' }) });
  r = await A.getJSON('/api/decks/zz');
  check('api: a real 404 is NOT "offline" (the editor must not say the deck was deleted for an unreachable server)', r.status === 404 && r.error === 'no-deck', JSON.stringify(r));
  off(); globalThis.fetch = realFetch;
  check('api: pace grows with idle polls', A.pace(1000, 0) === 1000 && A.pace(1000, 4) > A.pace(1000, 1));
  check('api: pace is capped', A.pace(1000, 50, { max: 3000 }) === 3000);
}

// ---------------------------------------------------------------- plan.js: the doability matrix and the word counter
{
  const P = await load('plan.js');
  check('plan: one main picture per slide, a second main is refused with a reason', /one main picture/.test(P.clashReason('3d', 'chart')));
  check('plan: a companion fits only its own main picture', P.clashReason('3d', 'stats') === '' && /only works with/.test(P.clashReason('chart', 'stats')));
  check('plan: the same main is no clash', P.clashReason('3d', '3d') === '');
  check('plan: words are counted as the checker counts them (numbers are not words)', P.countWords('Results 2025', '34% faster', 'a b') === 4, P.countWords('Results 2025', '34% faster', 'a b'));
  check('plan: five main pictures', eq(P.MAINS.map(m => m.id), ['3d', 'chart', 'diagram', 'photo', 'text']));
}

// ---------------------------------------------------------------- plan-store.js: ONE plan, and changes said as changes
// The release blocker: the build page saved the WHOLE plan from a copy it was holding, and that copy stops being true the
// moment a build step finishes (the step writes visual.builtAs into the slide it built). Removing an UNBUILT slide from
// such a copy was then refused as an edit to a BUILT one. These pin both halves of the fix: nobody sends a plan, and
// every reader is handed the same newest one.
{
  const S = await load('plan-store.js');
  const realFetch = globalThis.fetch;
  const sent = [];
  const reply = { ok: true, count: 2, built: 1, plan: { slides: [{ id: 's1', built: true }, { id: 's2' }] } };
  globalThis.fetch = async (url, o) => { sent.push({ url, body: o && o.body ? JSON.parse(o.body) : null }); return { ok: true, json: async () => reply }; };
  S._reset();
  const st = S.openPlan('d1');
  const seen = [];
  const off = st.subscribe(p => seen.push(p.count));
  await st.refresh();
  check('plan-store: one GET fills every subscriber at once', eq(seen, [2]) && st.count() === 2 && st.built() === 1, JSON.stringify(seen));
  const st2 = S.openPlan('d1');
  check('plan-store: a second reader of the same deck gets the same store, already filled', st2 === st && st2.get().count === 2);
  sent.length = 0;
  await st.removeSlide('s2');
  check('plan-store: remove names the slide and sends NO plan (this is the 409 "built" fix)',
    sent.length === 1 && /\/plan\/slide\/remove$/.test(sent[0].url) && sent[0].body.slide === 's2' && !('plan' in sent[0].body) && !('discard' in sent[0].body),
    JSON.stringify(sent));
  sent.length = 0;
  await st.removeSlide('s1', { discard: true });
  check('plan-store: removing a BUILT slide says its work is being discarded', sent[0].body.discard === true, JSON.stringify(sent[0].body));
  sent.length = 0;
  await st.addSlide({ title: 'new one' });
  check('plan-store: add sends the slide, no id (the server mints it) and no plan',
    /\/plan\/slide\/add$/.test(sent[0].url) && sent[0].body.slide.title === 'new one' && !('after' in sent[0].body) && !('plan' in sent[0].body), JSON.stringify(sent[0].body));
  sent.length = 0;
  await st.saveSlide({ id: 's2', title: 'x' });
  check('plan-store: saving one slide sends that slide, not the deck\'s plan', /\/plan\/slide\/save$/.test(sent[0].url) && !('plan' in sent[0].body));
  // a slow GET that lands after a change must never put the old plan back - the counters would disagree again
  let hold;
  globalThis.fetch = async () => new Promise(res => { hold = () => res({ ok: true, json: async () => ({ ok: true, count: 99, plan: { slides: [] } }) }); });
  const slow = st.refresh();
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, count: 7, plan: { slides: [] } }) });
  await st.addSlide({});
  hold(); await slow;
  check('plan-store: an older answer landing late is dropped; the newest stays', st.count() === 7, st.count());
  globalThis.fetch = async () => { throw new TypeError('down'); };
  await st.refresh();
  check('plan-store: an unreachable server never wipes the plan the page is showing', st.count() === 7 && st.get().ok === true);
  off(); st.release(); st2.release();
  check('plan-store: let go of when nobody is reading it any more', S.openPlan('d1') !== st);
  globalThis.fetch = realFetch;
  check('X-07: the build page keeps no plan of its own - it reads plan-store and sends changes, never a plan',
    /openPlan/.test(read('editor.js')) && !/api\.plan\.save/.test(read('editor.js')) && !/JSON\.parse\(JSON\.stringify\(pay\.plan\)\)/.test(read('editor.js')));
}

// ---------------------------------------------------------------- Blender batch 3: engine chips, estimates wording, the next-slide gate
{
  const B = await load('blender.js'), P = await load('plan.js');
  const fv = P.fixVisual;
  check('blender: fixVisual keeps visual.engine on a 3D picture (blender / threejs)', fv({ main: '3d', engine: 'blender' }).engine === 'blender' && fv({ main: '3d', engine: 'threejs' }).engine === 'threejs');
  check('blender: fixVisual drops engine for other pictures and unknown values (absent = lumi decides)', !('engine' in fv({ main: 'chart', engine: 'blender' })) && !('engine' in fv({ main: '3d', engine: 'pov' })) && !('engine' in fv({ main: '3d' })));
  const E = (v, look = 'Bold Blue', av = true) => B.effEngine(v, look, av);
  check('blender: default = the server\'s rule (Bold Blue + still 3D + Blender -> blender; moving -> three.js)', E({ main: '3d', motion: 'still' }) === 'blender' && E({ main: '3d', motion: 'timed' }) === 'threejs');
  check('blender: other looks never auto-pick blender; no Blender -> three.js even when chosen', E({ main: '3d', motion: 'still' }, 'Pink Punch') === 'threejs' && E({ main: '3d', motion: 'still', engine: 'blender' }, 'Bold Blue', false) === 'threejs');
  check('blender: an explicit choice wins over the default', E({ main: '3d', motion: 'still', engine: 'threejs' }) === 'threejs' && E({ main: '3d', motion: 'timed', engine: 'blender' }) === 'blender' && E({ main: 'chart' }) === null);
  check('blender: the two named options with plain notes', B.ENGINE.blender.name === 'studio render' && B.ENGINE.blender.tool === 'blender' && B.ENGINE.threejs.name === 'live 3D' && /instant, animated, editable/.test(B.engineNotes('still').threejs));
  const n0 = B.engineNotes('still'), n1 = B.engineNotes('still', { still: 95, 720: 1500, 1080: 3300 }), n2 = B.engineNotes('animation', { still: 95, 720: 1500, 1080: 3300 });
  check('blender: notes use the server\'s calibrated estimates when there are some (fixed text otherwise)', /1–2 min, animation 10–60 min/.test(n0.blender) && /still ≈ 2 min/.test(n1.blender) && /720p ≈ 25 min, 1080p ≈ 55 min/.test(n2.blender), JSON.stringify([n0, n1, n2]));
  check('blender: durations read plainly', B.fmtDur(20) === 'under a minute' && B.fmtDur(95) === '2 min' && B.fmtDur(3300) === '55 min' && B.fmtDur(4500) === '1 h 15 min');
  const est = { preview: { seconds: 14 }, iteration: { tokensRun: 55000, costUsdRun: 0.45, seconds: 104 }, full: { 720: { seconds: 1500 }, 1080: { seconds: 3300 } }, queue: { waitS: 0 } };
  check('blender: one more preview = time + cost, no tokens', B.iterLine(est) === 'one more preview ≈ 2 min · ≈ $0.45', B.iterLine(est));
  check('blender: no cost known -> no $ part', !/\$/.test(B.iterLine({ iteration: { tokensRun: 60000, costUsdRun: null, seconds: 110 } })));
  // post-mortem P6: an older server sends a CUMULATIVE `costUsd`. It is dropped rather than printed as the price of one
  // more preview.
  check('blender: a pre-0.5.5 server loses its cumulative cost',
    B.iterLine({ iteration: { tokens: 55000, costUsd: 1.8168, seconds: 104 } }) === 'one more preview ≈ 2 min',
    B.iterLine({ iteration: { tokens: 55000, costUsd: 1.8168, seconds: 104 } }));
  check('blender: full render line per resolution', /≈ 25 min · runs on this computer/.test(B.fullLine(est, 'animation', 720)) && /≈ 55 min/.test(B.fullLine(est, 'animation', 1080)) && /≈ 2 min/.test(B.fullLine({ full: { still: { seconds: 95 } } }, 'still')));
  check('blender: a render ahead in the queue adds its wait', B.fullSeconds({ full: { still: { seconds: 95 } }, queue: { waitS: 600 } }, 'still') === 695);
  const V = (n, status, extra = {}) => ({ id: 's' + n, n, engine: 'blender', status, previews: [{ n: 1 }], ...extra });
  check('blender: next slide waits for an unapproved studio render', B.nextGate({ a: V(1, 'preview') }, 1).ok === false && /approve its design/.test(B.nextGate({ a: V(1, 'preview') }, 1).text));
  check('blender: next slide waits while a full render runs', B.nextGate({ a: V(1, 'rendering') }, 1).why === 'rendering');
  check('blender: rendered or "skip for now" lets the next slide start; unbuilt slides do not count', B.nextGate({ a: V(1, 'rendered'), b: V(2, 'preview', { deferred: { at: 'x' } }), c: V(3, 'writing') }, 2).ok);
  // batch 6 Part B: a moving figure on a Blender look is a BAKED studio render in a new deck; it never holds up the next slide
  check('blender B.2: a new deck bakes moving figures on Bold Blue and Clay Pop; an older deck keeps them live',
    B.effEngine({ main: '3d', motion: 'timed' }, 'Bold Blue', true, true) === 'blender' && B.effEngine({ main: '3d', motion: 'timed' }, 'Clay Pop', true, true) === 'blender'
    && B.effEngine({ main: '3d', motion: 'timed' }, 'Bold Blue', true, false) === 'threejs' && B.effEngine({ main: '3d', motion: 'timed' }, 'Flat-Pack', true, true) === 'threejs');
  check('blender B.5: a baked slide never blocks the next one', B.nextGate({ a: V(1, 'preview', { baked: true }), b: V(2, 'rendering', { baked: true }) }, 2).ok);
  check('blender B.5: a baked slide shows ONE time, no resolution choice',
    /≈ 3 min$/.test(B.engineNotes('animation', { baked: true, 720: 170, 1080: 170 }).blender)
    && B.fullSeconds({ full: { baked: { seconds: 100 } }, queue: { waitS: 20 } }, 'animation', 1080) === 120);
  check('blender: card mode: preview/approved/failed open, rendering/rendered/kept bar, writing none', B.cardMode(V(1, 'preview')) === 'open' && B.cardMode(V(1, 'failed')) === 'open'
    && B.cardMode(V(1, 'rendering')) === 'bar' && B.cardMode(V(1, 'rendered')) === 'bar' && B.cardMode(V(1, 'preview', { deferred: {} })) === 'bar'
    && B.cardMode(V(1, 'writing')) === 'none' && B.cardMode(V(1, 'preview'), { folded: true }) === 'bar' && B.cardMode(V(1, 'rendered'), { editing: true }) === 'open'
    && B.cardMode({ id: 's1', n: 1, engine: 'threejs', status: 'none' }) === 'none');
}

// ---------------------------------------------------------------- dom.js + a11y.js load, and expose what the pages rely on
{
  const D = await load('dom.js'), Y = await load('a11y.js');
  check('dom: the one DOM helper and the icon set are exported', typeof D.h === 'function' && D.el === D.h && D.ICON && D.ICON.tick && D.ICON.play && D.ICON.folder);
  check('a11y: openDialog / roving / syncTab / announce exported', ['openDialog', 'roving', 'syncTab', 'announce'].every(k => typeof Y[k] === 'function'));
}

// ---------------------------------------------------------------- structure (the survey's X-07, F-06, F-01, F-14)
const src = Object.fromEntries(jsFiles.map(f => [f, read(f)]));
{
  const dupes = jsFiles.filter(f => f !== 'dom.js' && /^(export )?function (h|el)\(tag/m.test(src[f]));
  check('X-07: the DOM helper h()/el() exists once (dom.js), not once per file', dupes.length === 0, dupes.join(', '));
  const hex = /#(f2a65a|c5b3d5|d89cb3|080909|f7f8fa|e4d3e8|c9c3ef|b09fc7|9281b0|5b3fa8)\b/i;
  const bad = jsFiles.filter(f => !['lumi-play.js'].includes(f) && hex.test(src[f])).map(f => f);
  check('X-07: brand colours in JS are the CSS tokens (var(--...)), not hex copies (lumi-play.js draws on a canvas and cannot)', bad.length === 0, bad.join(', '));
  const raw = jsFiles.filter(f => !['api.js', 'update.js'].includes(f) && /['"`]\/api\//.test(src[f]));
  check('X-07: /api/ strings live in api.js only (update.js polls /api/ping on purpose while the server restarts)', raw.length === 0, raw.join(', '));
  const modal = jsFiles.filter(f => /aria-modal/.test(src[f]) && !/openDialog/.test(src[f]));
  check('F-06: every file that declares aria-modal also moves/traps/restores focus (openDialog)', modal.length === 0, modal.join(', '));
  const rootCss = fs.readFileSync(path.join(cssDir, 'app.css'), 'utf8'), themeCss = fs.readFileSync(path.join(cssDir, 'theme.css'), 'utf8');
  check('X-07: one token root (the brand tokens are not declared in two files)', !/--accent:#/.test(themeCss) && /--accent:#/.test(rootCss));
  check('F-14: the chat log is not a live region (it replays history and gets a line every second)', /role: 'log', 'aria-live': 'off'/.test(src['workshop.js']));
  check('F-14: there is a polite announce region and screen changes announce themselves', /id="announce"/.test(fs.readFileSync(path.join(jsDir, '..', 'index.html'), 'utf8')) && /announce\(t\)/.test(src['app.js']));
  check('F-08: browser zoom is multiplied back into the stage scale, and the page can scroll', /zoomLevel\(\)/.test(src['app.js']) && /html\.scrolls\{overflow:auto\}/.test(themeCss));
  check('F-20: scenes: the token is taken before the fade-out is awaited', /const token = \+\+sceneToken;\s*await dropScene\(\);/.test(src['app.js']));
  // batch 5: a question card must never look answered with every way forward dead and no reason ON the card.
  // The suggested answers ARE real picks (picks starts from c.defaults and complete() reads picks), so the only thing
  // that can close the gate is setEnabled(false) while Claude is still working - and that has to say so.
  check('Q: a suggested answer is a real pick (picks starts from the defaults, complete() reads picks)',
    /picks = new Map\(choices\.map\(c => \[c\.key, new Set\(c\.defaults\)\]\)\)/.test(src['markers.js'])
    && /const complete = c => \(isText\(c\) \? !!valOf\(c\) : picks\.get\(c\.key\)\.size > 0\)/.test(src['markers.js']));
  // a free-text question ([[aura:text]]) is gated the same way a pick is: its own words, or the shared free box
  check('Q: a free-text question has a box, is tagged "in your words", and is sent through safeAnswer()',
    /class: 'ch-in'/.test(src['markers.js']) && /'in your words'/.test(src['markers.js'])
    && /lines\.push\(`\$\{c\.id\}: \$\{v\}`\)/.test(src['markers.js']) && /const v = safeAnswer\(valOf\(c\)\)/.test(src['markers.js']));
  // section 5/6 of the interview plan: the interview screen, and what the plan page says a deck costs
  check('IV: the interview is its own centred scene, not docked under a slide preview',
    /\.iv-col\{width:720px/.test(fs.readFileSync(path.join(cssDir, 'plan.css'), 'utf8'))
    && !/bd-qdock/.test(src['interview.js']));
  check('IV: progress is what is BANKED (a round line and settled chips), never a countdown',
    /`round \$\{round\}`/.test(src['interview.js']) && /settledChips/.test(src['interview.js'])
    && !/class: 'iv-(bar|progress)'/.test(src['interview.js']));
  check('COST: the allowance line is left out when lumi has no trustworthy reading, and costs are time, never money or tokens',
    /if \(!a \|\| !isFinite\(a\.pct\)\) return out;/.test(src['plan.js'])
    && !/token|costUsd|fmtCost/.test(src['plan.js'].slice(src['plan.js'].indexOf('what this deck costs'), src['plan.js'].indexOf('const PER_PAGE_TALL'))));
  check('Q: a card switched off while claude works says so (is-waiting, a visible note and button titles)',
    /const stalled = !locked && !enabled;/.test(src['markers.js']) && /classList\.toggle\('is-waiting', stalled\)/.test(src['markers.js'])
    && /waitNote\.hidden = !stalled;/.test(src['markers.js']) && /ch-wait/.test(src['markers.js']));
  check('W-03: beforeunload asks only when something would be lost', /const risky = /.test(src['app.js']) && !/e\.preventDefault\(\); e\.returnValue = ''; return ''; \}\);\n/.test(src['app.js'].replace(/\r/g, '')));
  // the 'second tap never signs out' launch blocker: the first tap rewrites the button's label, so a handler that
  // re-derives signedIn from that label reads false on the second tap and skips api.claude.logout() entirely.
  check('switch account: signed-in state is never re-derived from the button label',
    !/signedIn\s*=\s*acctGo\.textContent/.test(src['home.js'])
    && /let acctArm = 0, acctSignedIn = false;/.test(src['home.js'])
    && /acctSignedIn = !!st\.signedIn;/.test(src['home.js'])
    && /const signedIn = acctSignedIn;/.test(src['home.js']));
  check('switch account: a status poll cannot disarm the confirm mid-countdown',
    /if \(!acctArm\) acctGo\.textContent = st\.signedIn \?/.test(src['home.js']));
  // section 9: the 40-field form and the hurry flow are DELETED. These are the checks that would catch a half-removal,
  // which is worse than either state: a route nothing can reach, or a button that still promises an unplanned deck.
  check('W-09: the form is gone - no steps.js, no fields.js, and nothing imports them',
    !jsFiles.includes('steps.js') && !jsFiles.includes('fields.js')
    && !jsFiles.some(f => /from '\.\/(steps|fields)\.js'/.test(src[f])), jsFiles.filter(f => /from '\.\/(steps|fields)\.js'/.test(src[f])).join(', '));
  check('W-09: the shell has no wizard route left, and the index page has no wizard markup',
    !/'wizard'/.test(src['app.js']) && !/id="ask"|id="welcome"/.test(fs.readFileSync(path.join(jsDir, '..', 'index.html'), 'utf8')));
  check('W-09: a deck starts in start.js - what it is about, then the files',
    jsFiles.includes('start.js') && /what’s your talk about\?/.test(src['start.js']) && /drop in your files/.test(src['start.js'])
    && /api\.interview\.create/.test(src['start.js']));
  check('W-09: the seven upload folders moved to the panel that fills them', /export const FOLDERS/.test(src['uploads.js'])
    && (src['uploads.js'].match(/\{ name: '/g) || []).length === 7);
  check('W-09: the "skip, i’m in a hurry" path is gone from the pages (one route for everyone)',
    !/onHurry|startHurry/.test(src['plan.js'] + src['app.js']) && !/claude\.start\(/.test(src['app.js'])
    && !/i’m in a hurry'/.test(src['plan.js']));
  check('W-09: the look is its own step, after the interview and before the plan',
    /function showTheme/.test(src['plan.js']) && /interviewState === 'ready' && !pay\.lookUser/.test(src['plan.js'])
    && /mountLooks/.test(src['plan.js']));
  check('F-15: the custom pointer has an opt-out and a forced-colors guard', /setNativePointer/.test(src['cursor.js']) && /forced-colors:active/.test(fs.readFileSync(path.join(cssDir, 'cursor.css'), 'utf8')));
  // The waiting game BORROWS space; it must never take it. The one document-level key listener in lumi-play.js may act
  // only while the pointer is over the arena AND nothing at all is focused - a text box, a question card or the chat
  // input keeps space for itself. These are the lines that make that true; losing any of them is the bug.
  const play = src['lumi-play.js'], studio = fs.readFileSync(path.join(cssDir, 'studio.css'), 'utf8');
  check('PLAY: the game reads space only when nothing else holds the keyboard',
    /const nothingFocused = /.test(play) && /if \(!nothingFocused\(\)\) return;/.test(play)
    && /if \(!running \|\| hidden \|\| asking \|\| !inside \|\| focused\) return;/.test(play)
    && /if \(isTyping\(\)\) e\.preventDefault\(\);/.test(play));
  check('PLAY: the loop runs only while on screen, focused and engaged, and stops the moment it may not',
    /alive && running && !asking && !hidden && !paused && engaged\(\) && onScreen && !document\.hidden && document\.hasFocus\(\)/.test(play)
    && /if \(!on && raf\) \{ cancelAnimationFrame\(raf\); raf = 0; \}/.test(play));
  check('PLAY: the game is named for what it is, not after the product, and its controls are one word',
    /flappy/i.test(play) && !/lumi/i.test((/'aria-label': '([^']*)'/.exec(play.slice(play.indexOf("class: 'pl-arena'"))) || [])[1] || 'lumi')
    && /\}, 'pause'\)/.test(play) && /paused \? 'resume' : 'pause'/.test(play));
  check('PLAY: the arena grows to the lower half of the stage, and gives it back',
    /\.bd-playhost\.is-big\{/.test(fs.readFileSync(path.join(cssDir, 'theme.css'), 'utf8'))
    && /setBig\(false\)/.test(play) && /host\.classList\.toggle\('is-big', big\)/.test(play));
  // N1: the slide list had no overflow rule at all, so a long deck spilled out of the stage.
  check('N1: the slide list has an overflow rule and keeps its wheel off the page',
    /\.ed-strip-list\{[^}]*overflow-y:auto/.test(studio.replace(/\s*\n\s*/g, '')) && /overscroll-behavior:contain/.test(studio));
  // Lumi opens fullscreen, which has no title bar: the page must carry the way out, and kiosk must stay out of it.
  check('the app opens fullscreen in both launch paths, never kiosk, and the page shows the way out', (() => {
    // the two launch LINES, not the prose around them (the comments name --kiosk to say it is not used)
    const cs = (/string args = "--app=.*/.exec(fs.readFileSync(path.join(jsDir, '..', '..', '..', 'installer', 'Lumi.cs'), 'utf8')) || [''])[0];
    const ps = (/Start-Process -FilePath \$edge .*/.exec(fs.readFileSync(path.join(jsDir, '..', '..', 'form.ps1'), 'utf8')) || [''])[0];
    return /--start-fullscreen/.test(cs) && /--start-fullscreen/.test(ps)
      && !/--start-maximized|--kiosk/.test(cs + ps)
      && /mountShellExit/.test(src['app.js']) && /window\.close\(\)/.test(src['shell.js'])
      && /\.sh-exit\{/.test(studio);
  })());
}
// the font floor (F-01, decided): nothing under 12 px; 12 px only for micro-labels (a short, named allow-list); everything you read is 14+
{
  const allowed12 = /(\.up-chip|\.lk-sugg|\.ql-rec|\.ql-lab|\.ed-picopt-now|\.ch-tag|\.pl-chip-q|\.hm-look|\.ph-n|\.dots|\.ws-stage|\.up-|\.us-asof|\.aura-cursor|\.pg-label|\.ch-stepof|-sub|-tag|-n\b)/;
  const small = [];
  for (const f of fs.readdirSync(cssDir).filter(f => f.endsWith('.css'))) {
    const css = fs.readFileSync(path.join(cssDir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const fs_ = /font-size:\s*([0-9.]+)px/.exec(m[2]);
      if (fs_ && +fs_[1] < 14) small.push({ sel: m[1].trim().split(',')[0].slice(0, 60), px: +fs_[1], file: f });
    }
  }
  check('F-01: no text smaller than 12 stage px anywhere', small.every(s => s.px >= 12), JSON.stringify(small.filter(s => s.px < 12)));
  check('F-01: 12 px text (below the 14 px reading size) is limited to micro-labels', small.every(s => allowed12.test(s.sel)), JSON.stringify(small.filter(s => !allowed12.test(s.sel))));
}

console.log(`\n${pass}/${total} frontend checks passed`);
process.exit(pass === total ? 0 : 1);
