// The first screen on every launch: the character in full mode, then a calm progress bar with a little cartoon Lumi
// running along it and ONE line of status text. Order:
//   1. Claude sign-in first (GET /api/health?part=claude). Signed out: the bar pauses on "sign in to claude"; the card
//      says the browser may sign in at once with the account already open there, so the default button opens the
//      sign-in page in a private Edge window (POST /api/fix/signin {browser:'private'}), with "use my normal browser"
//      as a secondary link. After any sign-in, and for a login this install never confirmed, a confirm step shows
//      "Signed in as x - Pro plan": [yes, that's me] (POST /api/claude/confirm, remembered until the email changes) or
//      [use a different account] (logout, then the private sign-in). Every plan may continue; Free gets a gentle note.
//   2. Every other check runs hidden (GET /api/health). A failing check is fixed silently (/api/fix/npm|pip); if that
//      fails and Claude can run, Claude headless tries (/api/fix/claude mode fix); if that fails too, Claude explains
//      it in one or two plain sentences (mode explain). Without Claude: "something's wrong" + Repair (/api/fix/repair).
//   A small "details" link shows the old check list; a newer version is a small tappable note, never automatic.
// mountLoading(el, { audio, onDone(info) }) -> { destroy() }      info = { health, update: {latest, version}|null }
import * as api from './api.js';
import { startUpdate } from './update.js';
import { lumiArt } from './lumi-art.js';

const ORDER = ['engine', 'node', 'modules', 'edge', 'python', 'claude', 'signin', 'blender', 'disk', 'version'];
const NAMES = { engine: 'lumi files', node: 'node.js', modules: 'slide tools', edge: 'microsoft edge', python: 'export tools',
  claude: 'claude', signin: 'claude sign-in', blender: 'studio renders', disk: 'free space', version: 'updates' };
const SILENT = ['npm', 'pip'];                      // fixes that run quietly in the background
// fix "repair" cannot run quietly: it closes the app and runs the installer again. The person decides, so a check that
// asks for it goes straight to the problem card with its Repair button (blender is the one, and it never blocks).
const CLAUDE_CAN_FIX = ['modules', 'python', 'node'];
const MIN_MS = 1400;

import { h } from './dom.js';
const ICON = {
  ok: '<svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  fail: '<svg viewBox="0 0 24 24"><path d="M12 7v6.5M12 17v.4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lowerFirst = s => { s = String(s || ''); return /^(Lumi|Claude|Microsoft|Node\.js|Python)\b/.test(s) ? s : s.replace(/^[A-Z](?=[a-z ])/, c => c.toLowerCase()); };
const find = (hh, id) => hh && (hh.checks || []).find(c => c.id === id);

export function mountLoading(el, { audio, onDone } = {}) {
  const sfx = n => { try { audio && audio.sfx && audio.sfx(n); } catch (e) { /* optional */ } };
  let alive = true, health = null, finished = false, timers = [], prog = 0, creep = 0, flowRun = 0;
  const later = (fn, ms) => { const t = setTimeout(() => { if (alive) fn(); }, ms); timers.push(t); return t; };

  // ---- left: headline, the bar with Lumi running on it, one status line, "details"
  const badge = h('span', { class: 'badge ld-badge' }, h('i', { class: 'ld-pulse', 'aria-hidden': 'true' }), h('span', { class: 'ld-badge-t' }, 'getting ready'));
  const head = h('h1', { class: 'w-head ld-head' }, 'warming up', h('br'), 'the studio');
  const runner = h('span', { class: 'ld-runner', html: lumiArt({ size: 62 }) });
  const fill = h('i', { class: 'ld-fill' });
  const bar = h('div', { class: 'ld-bar', role: 'progressbar', 'aria-label': 'getting ready', 'aria-valuemin': '0', 'aria-valuemax': '100' },
    h('span', { class: 'ld-track' }, fill), runner);
  const line = h('p', { class: 'ld-line', 'aria-live': 'polite' }, 'saying hello to claude…');
  const detailsB = h('button', { type: 'button', class: 'link ld-details-b', 'aria-expanded': 'false' }, 'details');
  const list = h('ol', { class: 'ld-list', 'aria-label': 'readiness checks', hidden: true });
  const leftB = h('div', { class: 'ld-left' }, badge, head, bar, line, detailsB, list);

  // ---- right: only what needs the person (sign in, confirm the account, a problem, an update)
  const card = h('div', { class: 'ld-card', hidden: true });
  const update = h('button', { type: 'button', class: 'ld-update', hidden: true, 'data-cursor-label': 'update' });
  const sideB = h('div', { class: 'ld-right' }, card, update);
  el.replaceChildren(leftB, sideB);

  detailsB.addEventListener('click', () => {
    const open = list.hidden; list.hidden = !open; detailsB.textContent = open ? 'hide details' : 'details';
    detailsB.setAttribute('aria-expanded', open ? 'true' : 'false'); sfx('click');
  });

  // ---- the bar
  function setProg(p, { running = true } = {}) {
    prog = Math.max(prog, Math.min(1, p));
    bar.style.setProperty('--p', prog.toFixed(3));
    bar.setAttribute('aria-valuenow', String(Math.round(prog * 100)));
    runner.classList.toggle('is-running', running && prog < 1);
    bar.classList.toggle('is-paused', !running);
  }
  function creepTo(target, ms) {                     // slow fake progress while a request is out
    clearInterval(creep);
    const from = prog, t0 = performance.now();
    creep = setInterval(() => {
      if (!alive) return clearInterval(creep);
      const k = Math.min(1, (performance.now() - t0) / ms);
      setProg(from + (target - from) * (1 - Math.pow(1 - k, 2)));
      if (k >= 1) clearInterval(creep);
    }, 60);
  }
  const say = t => { line.textContent = t; };
  function mood(m) { runner.innerHTML = lumiArt({ mood: m, size: 62 }); }
  function paintHead(state, n = 0) {
    badge.dataset.state = state;
    const t = el.querySelector('.ld-badge-t');
    const set = (b, a, c) => { t.textContent = b; head.replaceChildren(a, h('br'), c); };
    if (state === 'checking') set('getting ready', 'warming up', 'the studio');
    else if (state === 'signin') set('one step', 'first, sign in', 'to claude');
    else if (state === 'confirm') set('one check', 'is this', 'your account?');
    else if (state === 'fixing') set('one moment', 'tidying up', 'a few things');
    else if (state === 'ok') set('all set', 'all set!', 'let’s make slides');
    else if (state === 'offline') set('can’t reach lumi', 'hmm, the studio', 'isn’t answering');
    else set(n > 1 ? `${n} things` : 'one thing', 'something', 'needs a hand');
  }

  // ---- the details list (the old check list, hidden by default)
  function paintList() {
    const checks = (health && health.checks) || [];
    const ids = ORDER.concat(checks.map(c => c.id).filter(id => !ORDER.includes(id)));
    list.replaceChildren(...ids.map(id => {
      const c = checks.find(x => x.id === id);
      if (!c) return null;
      const state = c.ok ? 'ok' : c.blocking === false ? 'warn' : 'fail';
      return h('li', { class: 'ld-row', 'data-id': id, 'data-state': state }, h('span', { class: 'ld-ico', 'aria-hidden': 'true', html: ICON[state === 'ok' ? 'ok' : 'fail'] }),
        h('span', { class: 'ld-t' }, h('span', { class: 'ld-l' }, lowerFirst(c.label || NAMES[id])),
          h('span', { class: 'ld-d' }, String(c.detail || '').replace(/^\(simulated failure\)\s*/, '(test) '))));
    }).filter(Boolean));
  }

  // ---- the right-hand card
  const btn = (t, cls, fn, label) => { const b = h('button', { type: 'button', class: cls, 'data-nosfx': '', 'data-cursor-label': label || 'go' }, t); b.addEventListener('click', fn); return b; };
  function showCard({ face = null, title, text, buttons = [], extra = null }) {
    card.replaceChildren(...[face ? h('span', { class: 'ld-face', html: lumiArt({ mood: face, size: 88 }) }) : null,
      h('p', { class: 'ld-c-t' }, title), text ? h('p', { class: 'ld-c-x' }, text) : null,
      buttons.length ? h('div', { class: 'ld-c-b' }, ...buttons) : null, extra].filter(Boolean));
    card.hidden = false;
    card.classList.remove('is-in'); void card.offsetWidth; card.classList.add('is-in');
  }
  const hideCard = () => { card.hidden = true; card.replaceChildren(); };
  function paintUpdate() {
    const vc = find(health, 'version');
    const newer = vc && !vc.ok && vc.latest;
    update.hidden = !newer;
    if (newer) update.replaceChildren(h('span', { class: 'ld-uspark', 'aria-hidden': 'true' }), h('span', {}, `update available (${String(vc.latest).replace(/^v/, '')})`), h('span', { class: 'ld-u-go' }, 'update'));
  }
  update.addEventListener('click', () => { sfx('launch'); runUpdate('update'); });

  // ---- step 1: claude sign-in, never silent: the browser choice is explained first, and every account Lumi finds
  // (after a sign-in, or an existing login this install never confirmed) is shown for a "that's me" before carrying on
  async function signinStep(run) {
    paintHead('checking'); say('saying hello to claude…');
    creepTo(0.14, 2500);
    const r = await api.health('claude');
    if (!alive || run !== flowRun) return null;
    if (!r || !Array.isArray(r.checks)) return 'offline';
    const cli = find(r, 'claude'), si = find(r, 'signin');
    if (!cli || !cli.ok) return 'no-claude';
    if (si && si.ok) return si.confirmed ? 'ok' : confirmStep(run, si);
    return waitSignin(run);
  }
  function waitSignin(run, { again = false } = {}) {
    return new Promise(resolve => {
      paintHead('signin'); setProg(prog, { running: false }); mood('hmm');
      say(again ? 'sign in with the account you want to use' : 'waiting for you to sign in');
      const go = btn('sign in (private window)', 'ld-primary', () => begin('private'), 'sign in');
      const normal = h('button', { type: 'button', class: 'link ld-skip ld-normal' }, 'use my normal browser instead');
      normal.addEventListener('click', () => begin('normal'));
      async function begin(browser) {
        if (go.disabled) return;
        go.disabled = true; normal.disabled = true; sfx('launch');
        const res = await api.fix('signin', { browser });
        if (!alive || run !== flowRun) return;
        if (!res || res.ok === false) { go.disabled = false; normal.disabled = false; sfx('error'); say('the sign-in window didn’t open. try again?'); return; }
        go.textContent = 'waiting for the sign-in…';
        say(browser === 'private' ? 'sign in with your own email in the private window. this page notices by itself.'
          : 'finish signing in in your browser. this page notices by itself.');
        const t0 = Date.now();
        let polls = 0;
        while (alive && run === flowRun && Date.now() - t0 < 6 * 60 * 1000) {
          await sleep(api.pace(3000, polls++, { max: 9000 }));
          const hh = await api.health('claude');
          if (!alive || run !== flowRun) return;
          const si = find(hh, 'signin');
          if (si && si.ok) { sfx('success'); hideCard(); resolve(await confirmStep(run, si)); return; }
        }
        go.disabled = false; normal.disabled = false; go.textContent = 'sign in (private window)';
        say('still not signed in. press the button when you’re ready.');
      }
      showCard({ face: 'hmm', title: 'sign in to claude',
        text: 'Claude will open in your browser. If it signs you in straight away, it is using the account already open in that browser. A private window asks for your own email, so you choose the account.',
        buttons: [go], extra: normal });
    });
  }
  // "Signed in as x@y - Pro plan": [yes, that's me] (remembered for this install) or [use a different account]
  // (signs out of Lumi's Claude, then the private sign-in again). A Free plan carries a gentle note here.
  function confirmStep(run, si) {
    return new Promise(resolve => {
      paintHead('confirm'); setProg(prog, { running: false }); mood('happy');
      const who = si.email || 'this claude account';
      say('is this the right account?');
      const yes = btn('yes, that’s me', 'ld-primary', async () => {
        yes.disabled = true; other.disabled = true; sfx('click');
        const r = await api.claude.confirm(si.email || '');
        if (!alive || run !== flowRun) return;
        if (r && r.ok === false && r.error === 'account-changed') { hideCard(); resolve(await signinStep(run)); return; }
        hideCard(); resolve('ok');
      }, 'continue');
      const other = btn('use a different account', 'ld-soft', async () => {
        yes.disabled = true; other.disabled = true; sfx('click');
        const r = await api.claude.logout();
        if (!alive || run !== flowRun) return;
        if (r && r.ok === false) { yes.disabled = false; other.disabled = false; say(r.error === 'busy' ? 'claude is busy right now. try again when it’s done.' : 'couldn’t sign out. try again?'); return; }
        hideCard(); resolve(await waitSignin(run, { again: true }));
      }, 'switch');
      const note = si.free ? h('p', { class: 'ld-c-note', 'data-k': 'free' }, si.note || 'Lumi works, but Claude’s Free plan has very little Claude Code usage, so builds may stop early; Pro or higher is recommended.') : null;
      const card0 = h('p', { class: 'ld-c-who' }, h('span', {}, 'Signed in as '), h('b', {}, who), h('span', {}, ' — ' + (si.planLabel || 'Claude')));
      showCard({ face: si.free ? 'hmm' : 'happy', title: 'is this you?', text: '', buttons: [yes, other], extra: null });
      // the account line + optional free note go above the buttons
      const btns = card.querySelector('.ld-c-b');
      card.insertBefore(card0, btns);
      if (note) card.insertBefore(note, btns);
    });
  }

  // ---- step 2: everything else, hidden
  const blockers = hh => ((hh && hh.checks) || []).filter(c => !c.ok && c.blocking !== false && c.id !== 'signin');
  async function fullCheck(run) {
    const t0 = performance.now();
    creepTo(0.82, 3200);
    let i = 0;
    const names = ['lumi files', 'node.js', 'slide tools', 'microsoft edge', 'export tools', 'free space'];
    const cycle = setInterval(() => { if (alive && run === flowRun) say(`checking ${names[i++ % names.length]}…`); }, 420);
    say('checking lumi files…');
    const r = await api.health();
    clearInterval(cycle);
    if (!alive || run !== flowRun) return null;
    if (!r || !Array.isArray(r.checks)) return null;
    await sleep(Math.max(0, MIN_MS - (performance.now() - t0)));
    health = r; paintList(); paintUpdate();
    return r;
  }
  async function waitFix() {
    for (let n = 0; ; n++) {
      await sleep(api.pace(700, n, { max: 2500 }));
      if (!alive) return null;
      const st = await api.fixStatus();
      if (!alive) return null;
      if (st && st.running) continue;
      return st || {};
    }
  }
  async function claudeHelp(c, mode, tried) {
    const r = await api.fixClaude({ check: c.id, label: c.label, detail: c.detail, mode, tried });
    if (!alive || !r || r.ok === false) return { ran: false, ok: false };
    return (await waitFix()) || { ran: false };
  }
  async function depsStep(run) {
    paintHead('checking'); mood('happy');
    let r = await fullCheck(run);
    if (!alive || run !== flowRun) return;
    if (!r) return showOffline();
    const claudeOk = () => { const cl = find(health, 'claude'), si = find(health, 'signin'); return !!(cl && cl.ok && si && si.ok); };
    const tried = {};
    for (let pass = 0; pass < 6; pass++) {
      const bad = blockers(health);
      if (!bad.length) return allSet();
      const c = bad.find(x => !tried[x.id]);
      if (!c) break;
      tried[c.id] = [];
      paintHead('fixing'); setProg(Math.max(prog, 0.84));
      const name = NAMES[c.id] || c.id;
      // only the installer can put this one back (the bundled Blender): ask, never do it behind the person's back
      if (c.fix === 'repair') return showProblem(run, c, claudeOk(), '');
      if (SILENT.includes(c.fix)) {
        say(`fixing ${name}…`);
        const res = await api.fix(c.fix);
        if (!alive || run !== flowRun) return;
        const st = res && res.ok !== false ? await waitFix() : null;
        if (!alive || run !== flowRun) return;
        tried[c.id].push(st && st.ok ? 'reinstalled it' : `the automatic repair failed (${(st && st.message) || (res && res.message) || 'did not start'})`);
        r = await fullCheck(run);
        if (!alive || run !== flowRun) return;
        if (!r) return showOffline();
        if ((find(health, c.id) || {}).ok) continue;
      }
      if (claudeOk() && CLAUDE_CAN_FIX.includes(c.id)) {
        say(`asking claude to fix ${name}…`);
        const st = await claudeHelp(c, 'fix', tried[c.id].join('; '));
        if (!alive || run !== flowRun) return;
        if (st.ran) tried[c.id].push('claude tried: ' + (st.message || ''));
        r = await fullCheck(run);
        if (!alive || run !== flowRun) return;
        if (!r) return showOffline();
        if ((find(health, c.id) || {}).ok) continue;
      }
      return showProblem(run, find(health, c.id) || c, claudeOk(), tried[c.id].join('; '));
    }
    const left = blockers(health);
    if (!left.length) return allSet();
    return showProblem(run, left[0], claudeOk(), '');
  }
  async function showProblem(run, c, canAsk, tried) {
    const n = blockers(health).length;
    paintHead('fail', n); setProg(prog, { running: false }); mood('sad');
    sfx('error');
    const name = NAMES[c.id] || c.id;
    let text = '';
    if (canAsk) {
      say('asking claude what went wrong…');
      const st = await claudeHelp(c, 'explain', tried);
      if (!alive || run !== flowRun) return;
      if (st.ran && st.ok && st.message) text = st.message;
    }
    say(`${name} isn’t working yet`);
    const repairB = btn('repair lumi', 'ld-primary', () => { sfx('launch'); runUpdate('repair', repairB); }, 'repair');
    const againB = btn('check again', 'ld-soft', () => { sfx('click'); start(); }, 'again');
    const skipB = h('button', { type: 'button', class: 'link ld-skip' }, 'carry on anyway');
    skipB.addEventListener('click', () => { sfx('click'); finished = true; done(); });
    showCard({ face: 'sad', title: text ? `${name} needs a hand` : 'something’s wrong',
      text: text || `lumi couldn’t get ${name} working by itself. repair reinstalls lumi and keeps your decks and files.`,
      buttons: [repairB, againB], extra: skipB });
  }
  function showOffline() {
    paintHead('offline'); setProg(prog, { running: false }); mood('sad');
    say('lumi’s helper stopped running');
    showCard({ face: 'sad', title: 'lumi isn’t answering', text: 'close this window and open lumi again from your desktop.',
      buttons: [btn('check again', 'ld-soft', () => { sfx('click'); start(); }, 'again')] });
  }
  function allSet() {
    clearInterval(creep);
    hideCard(); paintHead('ok'); mood('happy');
    setProg(1, { running: false });
    say('all set. taking you to your decks…');
    if (!finished) { finished = true; sfx('success'); later(done, 1000); }
  }
  function done() {
    if (!alive) return;
    const vc = find(health, 'version');
    onDone && onDone({ health, update: vc && !vc.ok && vc.latest ? { latest: vc.latest, version: vc.version } : null });
  }

  // ---- update / repair: the launcher stops this server, installs, starts it again; then reload in place
  const runUpdate = (name, b) => startUpdate(name, { say, sfx, alive: () => alive, button: b });

  // ---- the flow
  async function start() {
    const run = ++flowRun;
    finished = false; hideCard(); clearInterval(creep);
    prog = 0; setProg(0); health = null;
    const s1 = await signinStep(run);
    if (!alive || run !== flowRun || s1 == null) return;
    if (s1 === 'offline') return showOffline();
    if (s1 === 'ok') { sfx('tick'); setProg(Math.max(prog, 0.2)); }
    await depsStep(run);
  }
  start();

  return { destroy() { alive = false; flowRun++; clearInterval(creep); timers.forEach(clearTimeout); el.replaceChildren(); } };
}
