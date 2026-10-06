// Lumi shell: scales the 1600x900 stage, walks the routes, and wires in the optional modules (gaze, cursor, audio,
// scenes). Every optional module is loaded defensively: if one is missing or throws, the app keeps working without it.
//
// The 40-field form is GONE (interview plan section 9). It assumed everyone has a supervisor, an institution and a
// department, and asked forty things before Claude had read a single file. A deck now starts with one box and your
// files (start.js), Claude interviews you (interview.js, on the plan page), you pick a look, and then the plan. The
// "skip, i'm in a hurry" shortcut went with it: there is one path, and every deck gets planned before it is built.
import { bus, emit, on, claudeNow, setClaude } from './bus.js';
import { announce } from './a11y.js';
import * as api from './api.js';
import { mountScene } from './scenes/index.js';
import { initUsage } from './usage.js';

const LS = 'aura-studio-v2';
const W = 1600, H = 900;
const EASE = 'cubic-bezier(.22,1,.36,1)';
const $ = (s, r = document) => r.querySelector(s);
const stage = $('#stage');
const motionQ = matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => motionQ.matches;

let busy = false, interacted = false, scale = 1, finalRunning = false;
// F-10: "is claude running" has one source of truth (bus.js claudeNow); each page asks it for the deck it is showing
let scene = null, sceneName = '', sceneHost = null, sceneToken = 0;
let gaze = null;
// routes: loading -> home -> start (your talk, your files) -> plan (interview -> look -> the plan) -> build -> editor -> finalize
let route = 'loading', routeView = null, buildDeck = null, updateInfo = null, usagePill = null;

function persistLocal() {
  try { localStorage.setItem(LS, JSON.stringify({ v: 3, buildDeck })); } catch (e) {}
}
function loadLocal() {
  try { const j = JSON.parse(localStorage.getItem(LS) || 'null'); return j && typeof j === 'object' ? j : null; } catch (e) { return null; }
}

// ---------------------------------------------------------------- optional modules
const PATHS = { audio: './audio.js', gaze: './gaze.js', cursor: './cursor.js',
  loading: './loading.js', home: './home.js', start: './start.js', editor: './editor.js', plan: './plan.js',
  build: './editor.js', finalize: './finalizing.js' };
const mods = {}, loading = {};
function need(name) {
  return (loading[name] ||= import(PATHS[name]).then(m => (mods[name] = m),
    e => { console.warn(`[aura] ${name}.js is not available, carrying on without it.`, e); delete loading[name]; return null; }));
}
const A = () => mods.audio && mods.audio.audio;
function call(fn, ...args) { try { const a = A(); return a && typeof a[fn] === 'function' ? a[fn](...args) : undefined; } catch (e) { return undefined; } }
const audio = {
  start: () => call('start'), setMusic: v => call('setMusic', v), setSfx: v => call('setSfx', v),
  setVolume: v => call('setVolume', v), sfx: n => call('sfx', n), state: () => call('state') || { music: true, sfx: true },
};
const sfx = n => audio.sfx(n);

// The scenes still draw: the slide previews in the editor, and the quiet picture behind "drop in your files".
let sceneState = {};
const sceneCtx = {
  bus, audio, getState: () => sceneState,
  get reducedMotion() { return reduced(); },
  get amount() { return 60; },
  three: () => import('three'),
};

// ---------------------------------------------------------------- stage scaling
// F-08 / F-01. The stage is a fixed 1600x900 design scaled to the window. Two rules keep it usable:
//  - browser zoom works: zoom shrinks innerWidth by the zoom factor, which the old fit() cancelled out exactly (zoom was a
//    no-op). The zoom factor is recovered from outerWidth/innerWidth and multiplied back in, so Ctrl+ makes things bigger.
//  - it may scroll: the stage never shrinks below MIN_SCALE and, when zoomed in (or in a very small window), the page scrolls
//    instead of clipping. "Nothing scrolls" is the normal case at a normal zoom, not a trap.
// App text minimum (F-01, decided): 14 stage px for anything you read, 12 for pure micro-labels (counters, tags), nothing below 12; at MIN_SCALE that is still about 10 px on screen, and zoom or scrolling take it from there.
const MIN_SCALE = 0.7;
const ZOOMS = [1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
function zoomLevel() {
  const q = +new URLSearchParams(location.search).get('zoom');            // test hook: ?zoom=1.5 stands in for Ctrl+ at 150 %
  if (q >= 1 && q <= 5) return q;
  const r = outerWidth && innerWidth ? outerWidth / innerWidth : 1;
  if (r < 1.07) return 1;
  let best = 1;
  for (const z of ZOOMS) if (Math.abs(z - r) < Math.abs(best - r)) best = z;
  return Math.abs(r - best) / best < 0.07 ? best : 1;
}
function fit() {
  const z = zoomLevel();
  scale = Math.max(Math.min(innerWidth / W, innerHeight / H) * z, MIN_SCALE);
  const sw = W * scale, sh = H * scale, over = sw > innerWidth + 1 || sh > innerHeight + 1;
  document.documentElement.classList.toggle('scrolls', over);
  document.documentElement.dataset.zoom = String(z);
  stage.style.transform = `scale(${scale})`;
  stage.style.left = Math.max(0, Math.round((innerWidth - sw) / 2)) + 'px';
  stage.style.top = Math.max(0, Math.round((innerHeight - sh) / 2)) + 'px';
  const se = document.scrollingElement;
  if (se && !over) { se.scrollTop = 0; se.scrollLeft = 0; }
}

function setMode(mode) {
  if (stage.dataset.mode === mode) return;
  stage.dataset.mode = mode;
  emit('char:mode', { mode });
}

// ---------------------------------------------------------------- small UI helpers
import { h as el } from './dom.js';

let msgTimer = 0;
function showMsg(text) {
  const m = $('#msg');
  $('.msg-text', m).textContent = text;
  m.classList.remove('show'); void m.offsetWidth; m.classList.add('show');
  clearTimeout(msgTimer); msgTimer = setTimeout(hideMsg, 6000);
}
function hideMsg() { clearTimeout(msgTimer); $('#msg').classList.remove('show'); }

function paintSound() {
  const b = $('#sound');
  if (!A()) { b.hidden = true; return; }
  b.hidden = false;
  const st = audio.state() || {};
  b.setAttribute('aria-pressed', st.music ? 'true' : 'false');
  b.classList.toggle('on', !!st.music && interacted);
  $('.lbl', b).textContent = st.music ? 'music on' : 'music off';
}

// ---------------------------------------------------------------- gaze: the character's eyes follow the caret
function caretPoint(t) {
  if (!(t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && /^(text|search|)$/.test(t.type)))) return null;
  const host = t.offsetParent;
  if (!host) return null;
  const cs = getComputedStyle(t);
  const m = document.createElement('div');
  ['boxSizing', 'width', 'height', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontFamily', 'fontSize', 'lineHeight',
    'letterSpacing', 'wordSpacing', 'textIndent'].forEach(p => { m.style[p] = cs[p]; });
  Object.assign(m.style, { position: 'absolute', visibility: 'hidden', pointerEvents: 'none', overflow: 'hidden', left: t.offsetLeft + 'px', top: t.offsetTop + 'px',
    whiteSpace: t.tagName === 'TEXTAREA' ? 'pre-wrap' : 'pre', overflowWrap: 'break-word', border: '0' });
  const pos = t.selectionEnd ?? t.value.length;
  m.textContent = t.value.slice(0, pos);
  const mark = document.createElement('span');
  mark.textContent = '​';
  m.append(mark);
  host.append(m);
  const r = mark.getBoundingClientRect(), box = t.getBoundingClientRect();
  m.remove();
  const x = Math.min(box.right - 6, Math.max(box.left + 6, r.left - t.scrollLeft * scale));
  const y = Math.min(box.bottom - 6, Math.max(box.top + 6, r.top + r.height / 2 - t.scrollTop * scale));
  return { x, y, host };
}
let lookQueued = null;
function lookAt(t) {
  if (!gaze || !t) return;
  if (lookQueued) { lookQueued = t; return; }
  lookQueued = t;
  requestAnimationFrame(() => {
    const n = lookQueued; lookQueued = null;
    if (!n || !n.isConnected) return;
    const p = caretPoint(n);
    const r = n.getBoundingClientRect();
    try { gaze.lookAt(p ? p.x : r.left + r.width / 2, p ? p.y : r.top + r.height / 2); } catch (e) {}
  });
}

// ---------------------------------------------------------------- scenes
async function dropScene() {
  if (!sceneHost) return;
  const inst = scene, host = sceneHost;
  scene = null; sceneHost = null; sceneName = '';
  if (!reduced()) {
    await host.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
  }
  if (inst) inst.destroy();
  host.remove();
}
// F-20: the token is taken FIRST, before the fade-out is awaited. A second call during the fade (a double "next", a held
// Enter) takes a newer token, so the first call finds on waking that it was superseded and mounts nothing; before, both
// mounted and the first one's instance was orphaned (a 60 fps WebGL loop and a stacked host for the rest of the session).
async function switchScene(name) {
  if (name && name === sceneName) return;
  const token = ++sceneToken;
  await dropScene();
  if (token !== sceneToken || !name) return;
  const host = el('div', { class: 'scene-host' });
  $('#illus').append(host);
  sceneName = name; sceneHost = host;
  const inst = await mountScene(name, host, sceneCtx);
  if (token !== sceneToken) { inst.destroy(); host.remove(); return; }
  scene = inst;
  scene.update(sceneState);
  if (!reduced()) host.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 520, easing: EASE });
}

// ---------------------------------------------------------------- global input
const INTERACTIVE = 'button, [role=button], .choice, a[href], select, input[type=range], input[type=date]';
let hoverEl = null, hoverT = 0;
function wireInput() {
  stage.addEventListener('pointerover', e => {
    const t = e.target.closest && e.target.closest(INTERACTIVE);
    if (!t || t === hoverEl || t.disabled) return;
    hoverEl = t;
    emit('ui:hover', { el: t });
    const now = performance.now();
    if (now - hoverT > 70) { sfx('hover'); hoverT = now; }
  });
  stage.addEventListener('pointerout', e => { if (hoverEl && !hoverEl.contains(e.relatedTarget)) hoverEl = null; });
  stage.addEventListener('pointerdown', e => {
    const t = e.target.closest && e.target.closest(INTERACTIVE);
    if (!t || t.disabled) return;
    emit('ui:press', { el: t });
    if (!t.closest('[data-nosfx]')) sfx('click');
  });

  const first = () => {
    if (interacted) return;
    interacted = true;
    // W-03: "are you sure?" only when something would really be lost: claude working, or a finalize running. Nothing
    // typed is at risk any more - the old form held 40 unsaved answers; a deck's answers are on the server as they go.
    addEventListener('beforeunload', e => {
      const risky = claudeNow(buildDeck).running || finalRunning;
      if (risky) { e.preventDefault(); e.returnValue = ''; return ''; }
    });
    audio.start();
    paintSound();
  };
  addEventListener('pointerdown', first, true);
  addEventListener('keydown', first, true);

  // Keep the character's eyes on whatever is being typed or focused.
  document.addEventListener('focusin', e => {
    const t = e.target;
    if (!stage.contains(t) || stage.dataset.mode === 'full') return;
    if (t.matches('input, textarea') || t.matches(':focus-visible')) lookAt(t);
  });

  $('#sound').addEventListener('click', () => {
    const st = audio.state() || {};
    audio.start(); audio.setMusic(!st.music); sfx('toggle');
    paintSound();
  });
  on('audio:change', paintSound);
  on('finalize:state', d => { finalRunning = !!(d && d.running); });
  motionQ.addEventListener('change', () => stage.classList.toggle('reduced', reduced()));
}

// ---------------------------------------------------------------- F-19: one honest "can't reach lumi" state, everywhere
// api.js decides (two failures in a row, or a request that hangs, flip it); this is the single bar every screen shares,
// with a retry button and a quiet retry loop that backs off. Each screen's own polls recover by themselves once it clears.
function wireNet() {
  const bar = $('#netbar'), btn = $('#netretry');
  let t = 0, tries = 0;
  const loop = () => {
    clearTimeout(t);
    t = setTimeout(async () => { await api.ping(); if (!api.reachable()) loop(); }, Math.min(10000, 1500 * (1 + tries++)));
  };
  api.onReach(ok => {
    bar.hidden = ok;
    if (ok) { clearTimeout(t); tries = 0; announce('lumi is back'); } else { announce('can’t reach lumi, trying again'); loop(); }
  });
  btn.addEventListener('click', async () => { btn.disabled = true; tries = 0; await api.ping(); btn.disabled = false; });
  // a quiet screen (home, nothing running) polls only every 15-30 s: if nothing at all has succeeded for a while, check
  // that lumi is still there, so the bar appears within seconds and not at the next poll
  setInterval(() => { if (!document.hidden && api.reachable() && api.idleMs() > 10000) api.ping(); }, 3000);
}

// ---------------------------------------------------------------- boot
async function boot() {
  busy = true;
  fit();
  addEventListener('resize', fit);
  stage.classList.toggle('reduced', reduced());
  wireInput();
  wireNet();

  const saved = loadLocal();
  if (saved) buildDeck = saved.buildDeck || null;

  // Every launch starts on the loading screen (full mode), then goes home (or back to a deck Claude is working on).
  stage.classList.add('instant');
  stage.dataset.mode = 'full';
  stage.dataset.route = 'loading';
  usagePill = initUsage($('#usage'));
  requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.remove('instant')));
  stage.classList.add('ready');
  busy = false;
  emit('char:mode', { mode: 'full' });
  await mountRoute('loading');
  persistLocal();

  need('audio').then(m => { if (m && interacted) audio.start(); paintSound(); });
  need('cursor').then(m => { try { m && m.initCursor && m.initCursor(); } catch (e) { console.warn('[aura] cursor', e); } });
  need('gaze').then(m => {
    try { gaze = m && m.initGaze ? m.initGaze($('#charVideo'), { framesUrl: '/assets/gaze-frames.json' }) : null; } catch (e) { console.warn('[aura] gaze', e); }
  });
  ['home', 'start', 'editor'].forEach((n, i) => setTimeout(() => need(n), 600 + i * 300));
}

// ---------------------------------------------------------------- routes
const ROUTE_MODE = { loading: 'full', home: 'home', start: 'home', editor: 'edit', plan: 'home', build: 'work', finalize: 'full' };
function paintChrome() {
  if (usagePill) usagePill.show(route === 'home' || route === 'start' || route === 'editor' || route === 'plan' || route === 'build');
}
async function fadeRoute(el, out) {
  if (reduced() || !el.animate) return;
  const a = el.animate(out ? [{ opacity: 1 }, { opacity: 0, transform: 'translateY(-6px)' }] : [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
    { duration: out ? 240 : 520, easing: out ? 'ease-in' : EASE, fill: out ? 'forwards' : 'backwards' });
  if (out) await Promise.race([a.finished.catch(() => {}), new Promise(r => setTimeout(r, 400))]);
}
let routing = false;
async function setRoute(name, opts = {}) {
  if (routing) return false;
  routing = true; busy = true;
  try {
    const prev = route;
    if (routeView || prev) {
      const host = $('#' + prev);
      if (host) await fadeRoute(host, true);
      try { routeView && routeView.destroy(); } catch (e) { console.warn('[aura] route cleanup', e); }
      routeView = null;
      if (host) host.getAnimations().forEach(a => a.cancel());
    }
    hideMsg();
    await mountRoute(name, opts);
    return true;
  } finally { routing = false; busy = false; }
}
async function mountRoute(name, opts = {}) {
  route = name; stage.dataset.route = name;
  setMode(ROUTE_MODE[name] || 'full');
  if (name !== 'start') switchScene(null).catch(() => {});
  paintChrome();
  const host = $('#' + name);
  const m = await need(name);
  if (!m) { routeDown(host, name, opts); fadeRoute(host, false); return; }
  try {
    if (name === 'loading' && m) routeView = m.mountLoading(host, { audio, onDone: afterLoading });
    else if (name === 'home' && m) routeView = m.mountHome(host, { audio, update: updateInfo, onNew: () => setRoute('start', {}), onOpen: openFromHome,
      onFinalize: dk => openFinalize(dk.id), onSignin: () => setRoute('loading', {}) });
    else if (name === 'start' && m) routeView = m.mountStart(host, { audio, setMode,
      onScene: n => { switchScene(n).catch(e => console.warn('[aura] scene', e)); },
      onStarted: id => { buildDeck = id; persistLocal(); return openPlan(id); }, onHome: goHome });
    else if (name === 'editor' && m) routeView = m.mountEditor(host, { deckId: opts.deckId, slide: opts.slide, audio, bus, sceneCtx, mountScene, onHome: goHome, onFinalize: openFinalize });
    else if (name === 'plan' && m) routeView = m.mountPlan(host, { deckId: opts.deckId || null, audio, setMode,
      onStarted: id => { buildDeck = id; persistLocal(); },
      onBuild: id => { buildDeck = id; persistLocal(); return openBuild(id); }, onHome: goHome });
    else if (name === 'build' && m) routeView = m.mountEditor(host, { deckId: opts.deckId, audio, bus, sceneCtx, mountScene, onHome: goHome, onFinalize: openFinalize, build: true });
    else if (name === 'finalize' && m) routeView = m.mountFinalizing(host, { deckId: opts.deckId, audio, onHome: goHome, onEdit: openEditor });
  } catch (e) { console.warn('[aura] could not open', name, e); }
  fadeRoute(host, false);
  titleFor(name);
  if (host) { host.tabIndex = -1; try { host.focus({ preventScroll: true }); } catch (e) { /* fine */ } }
  emit('route:change', { route: name });
}
// F-14: every screen change updates the tab title and tells a screen reader where it is (focus lands on the screen itself)
const ROUTE_TITLE = { loading: 'getting ready', home: 'your decks', start: 'tell lumi about your talk', editor: 'edit your deck',
  plan: 'plan your deck', build: 'build your deck', finalize: 'finalize your deck' };
function titleFor(name, text) {
  const t = text || ROUTE_TITLE[name] || '';
  document.title = t ? `${t} · Lumi` : 'Lumi';
  if (t) announce(t);
}
// F-19: a screen's module is fetched from the server the first time it is opened; if the server is away at that moment the
// screen says so (never a blank page) and opens by itself when lumi is back.
function routeDown(host, name, opts) {
  const b = el('button', { type: 'button', class: 'pl-big pl-big-s1', 'data-nosfx': '' }, el('span', { class: 'pl-big-t' }, el('span', { class: 'pl-big-h' }, 'try again now')));
  host.replaceChildren(el('div', { class: 'pl-wait route-down' }, el('h2', { class: 'pl-wait-h' }, 'can’t reach lumi. trying again…'),
    el('p', { class: 'pl-wait-p' }, 'is its window still open? nothing you made is lost.'), el('div', { class: 'pl-bigs' }, b)));
  let off = null;
  const retry = () => { if (off) { off(); off = null; } if (route === name) mountRoute(name, opts); };
  off = api.onReach(ok => { if (ok) retry(); });
  b.addEventListener('click', async () => { b.disabled = true; await api.ping(); b.disabled = false; if (api.reachable()) retry(); });
  routeView = { destroy() { if (off) off(); host.replaceChildren(); } };
}
async function afterLoading(info = {}) {
  updateInfo = info.update || null;
  const fz = await api.finalize.status();
  if (fz && fz.running && fz.deckId) return openFinalize(fz.deckId);
  const st = await api.claude.status();
  if (st && st.running && st.deckId) {
    const d = await api.decks.get(st.deckId);
    if (d && d.deck && d.deck.flow === 'plan') return openFromHome(d.deck);
    buildDeck = st.deckId; setClaude({ running: true, deckId: st.deckId });
    // a deck from before this version, built in one go: its slides open as they appear
    return openEditor(st.deckId);
  }
  return setRoute('home');
}
function goHome() { return setRoute('home'); }
function openEditor(deckId, slide) { if (!deckId) return goHome(); return setRoute('editor', { deckId, slide }); }
function openPlan(deckId) { return setRoute('plan', { deckId }); }
function openBuild(deckId) { return setRoute('build', { deckId }); }
function openFinalize(deckId) { if (!deckId) return goHome(); return setRoute('finalize', { deckId }); }
// A deck opens where it stands: the plan page (which holds the interview and the look step too), the build page, or the
// editor. A deck made before this version, built in one go, has no plan at all and goes straight to its slides.
function openFromHome(dk) {
  if (dk.flow === 'plan') {
    if (!dk.builtCount && dk.planState !== 'building') return openPlan(dk.id);
    if (dk.builtCount < dk.planCount) return openBuild(dk.id);
  }
  if (dk.exists) return openEditor(dk.id);
  buildDeck = dk.id;
  return dk.flow ? openPlan(dk.id) : openEditor(dk.id);
}

// Tiny hook for tests and the integration step.
window.__aura = { get busy() { return busy; }, get route() { return route; }, home: () => goHome(),
  edit: (id, n) => openEditor(id, n), newDeck: () => setRoute('start', {}),
  plan: id => setRoute('plan', { deckId: id || null }), build: id => openBuild(id), finalize: id => openFinalize(id),
  msg: t => showMsg(t) };

boot();
