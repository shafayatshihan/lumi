// Lumi shell: scales the 1600x900 stage, walks the screens from steps.js, keeps the answers (local +
// server autosave), and wires in the optional modules (gaze, cursor, audio, scenes, uploads, looks, workshop).
// Every optional module is loaded defensively: if one is missing or throws, the app keeps working without it.
import { bus, emit, on, claudeNow, setClaude } from './bus.js';
import { announce } from './a11y.js';
import * as api from './api.js';
import { mountScene } from './scenes/index.js';
import { SCREENS, GROUPS, EXTRA_DEFAULTS, INITIAL, PHASES, amountLabel } from './steps.js';
import { renderFields } from './fields.js';
import { initUsage } from './usage.js';

const LS = 'aura-studio-v2';
const W = 1600, H = 900;
const EASE = 'cubic-bezier(.22,1,.36,1)';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const stage = $('#stage');
const motionQ = matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => motionQ.matches;
const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const QUESTIONS = SCREENS.filter(s => s.mode === 'stage' && s.id !== 'workshop').length;   // 26
const iOf = id => SCREENS.findIndex(s => s.id === id);

let data = {};                 // the brief (contract section 5 keys)
let touched = new Set();       // keys the person has changed (hides the "suggested" tag)
let idx = 0, reached = 0;      // current screen, furthest screen reached
let view = { offs: [] };       // what the current screen mounted
let busy = false, interacted = false, scale = 1, finalRunning = false;
// F-10: "is claude running" has one source of truth (bus.js claudeNow); the wizard asks it for the deck it is building
const claudeLive = () => { const c = claudeNow(buildDeck); return c.running || c.waiting; };
let scene = null, sceneName = '', sceneHost = null, sceneToken = 0;
let gaze = null;
// v0.3 routes: loading -> home -> (wizard: welcome ... review -> workshop) | editor
let route = 'loading', routeView = null, buildDeck = null, draftUsed = false, updateInfo = null, usagePill = null;

// ---------------------------------------------------------------- state
const getKey = (key, obj = data) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
function setPath(obj, key, value) {
  const ks = key.split('.');
  let o = obj;
  for (const k of ks.slice(0, -1)) { if (typeof o[k] !== 'object' || o[k] === null || Array.isArray(o[k])) o[k] = {}; o = o[k]; }
  o[ks[ks.length - 1]] = value;
}
function setKey(key, value, { touch = true } = {}) {
  setPath(data, key, value);
  if (key === 'style.amount') setPath(data, 'style.amountLabel', amountLabel(value));
  if (key === 'basics.type' && value !== 'Other') setPath(data, 'basics.typeOther', '');
  if (touch) touched.add(key);
  hideMsg();
  persistLocal();
  scheduleSave();
  emit('state:change', { key, value, state: data });
  scheduleRefresh();
}
const getState = () => data;

function applyDefaults() {
  for (const s of SCREENS) for (const f of [...(s.fields || []), ...(s.left || [])]) {
    if (f.default !== undefined && getKey(f.key) === undefined) setPath(data, f.key, clone(f.default));
  }
  for (const [k, v] of Object.entries({ ...EXTRA_DEFAULTS, ...INITIAL })) if (getKey(k) === undefined) setPath(data, k, clone(v));
  setPath(data, 'style.amountLabel', amountLabel(getKey('style.amount') ?? 60));
}

function persistLocal() {
  try { localStorage.setItem(LS, JSON.stringify({ v: 2, data, touched: [...touched], reached, used: draftUsed, buildDeck })); } catch (e) {}
}
function loadLocal() {
  try { const j = JSON.parse(localStorage.getItem(LS) || 'null'); if (j && j.v === 2 && j.data && typeof j.data === 'object') return j; } catch (e) {}
  return null;
}

let saveTimer = 0, lastSaved = '';
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 900); }
async function saveNow() {
  clearTimeout(saveTimer);
  const body = JSON.stringify(data);
  if (body === lastSaved) return true;
  const r = await api.brief.save(data);
  if (r && r.ok !== false) { lastSaved = body; flashSaved(); return true; }
  return false;
}
function saveOnExit() {
  const body = JSON.stringify(data);
  if (!interacted || body === lastSaved) return;
  api.brief.saveOnExit(body);
}

let refreshQueued = false;
function scheduleRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => {
    refreshQueued = false;
    view.fields && view.fields.refresh();
    view.leftFields && view.leftFields.refresh();
    if (scene) scene.update(data);
  });
}

// ---------------------------------------------------------------- optional modules
const PATHS = { audio: './audio.js', gaze: './gaze.js', cursor: './cursor.js', uploads: './uploads.js', looks: './looks.js', workshop: './workshop.js',
  loading: './loading.js', home: './home.js', editor: './editor.js', plan: './plan.js', build: './editor.js', finalize: './finalizing.js' };
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

const sceneCtx = {
  bus, audio, getState,
  get reducedMotion() { return reduced(); },
  get amount() { const a = +getKey('style.amount'); return Number.isFinite(a) ? a : 60; },
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

// The small top-left wordmark doubles as the big centred one on the welcome screen (it glides between the two).
function placeBrand() {
  const word = $('#brand .word'), by = $('#brand .by');
  if (!word.offsetWidth) return;
  const k = 272 / word.offsetWidth;
  stage.style.setProperty('--wk', k.toFixed(4));
  stage.style.setProperty('--wx', (645 - 96 - word.offsetLeft) + 'px');
  stage.style.setProperty('--wy', (123 - 44 - word.offsetTop) + 'px');
  const bx = 645 + 136 - by.offsetWidth / 2, byy = 123 + word.offsetHeight * k + 2;
  stage.style.setProperty('--bx', (bx - 96 - by.offsetLeft) + 'px');
  stage.style.setProperty('--by', (byy - 44 - by.offsetTop) + 'px');
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
function hideMsg() { clearTimeout(msgTimer); $('#msg').classList.remove('show'); $$('.field.invalid').forEach(f => f.classList.remove('invalid')); }
function shake(node) {
  if (!node || !node.animate) return;
  if (reduced()) { node.animate([{ opacity: .4 }, { opacity: 1 }], { duration: 300 }); return; }
  node.animate([0, -9, 8, -6, 5, -2, 0].map(x => ({ transform: `translateX(${x}px)` })), { duration: 440, easing: 'ease-out' });
}
function complain(bad) {
  showMsg(bad.msg || 'this one’s needed.');
  sfx('error');
  if (bad.field) bad.field.classList.add('invalid');
  shake(bad.field || bad.el);
  if (bad.el && bad.el.focus) bad.el.focus({ preventScroll: true });
}

let savedTimer = 0, savedSaid = 0;
function flashSaved() {
  const s = $('#saved');
  if (Date.now() - savedSaid > 6000) { savedSaid = Date.now(); announce('saved'); }
  s.classList.add('show');
  clearTimeout(savedTimer); savedTimer = setTimeout(() => s.classList.remove('show'), 1600);
}

// ---------------------------------------------------------------- gaze + typing feedback
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
let lastType = 0, lastSpark = 0;
function typed(t, quiet) {
  const now = performance.now();
  if (!quiet && now - lastType > 45) { sfx('type'); lastType = now; }
  lookAt(t);
  if (reduced() || quiet || now - lastSpark < 130) return;
  lastSpark = now;
  const p = caretPoint(t);
  if (!p) return;
  const hr = p.host.getBoundingClientRect();
  const s = el('span', { class: 'spark', 'aria-hidden': 'true',
    html: '<svg viewBox="0 0 20 20" width="14" height="14"><path d="M10 1c.8 5.4 2.6 7.2 8 8-5.4.8-7.2 2.6-8 8-.8-5.4-2.6-7.2-8-8 5.4-.8 7.2-2.6 8-8z"/></svg>' });
  s.style.left = (p.x - hr.left) / scale - 7 + 'px';
  s.style.top = (p.y - hr.top) / scale - 22 + 'px';
  s.style.color = ['var(--pink)', 'var(--fur4)', 'var(--orange)', 'var(--fur3)'][Math.floor(Math.random() * 4)];
  p.host.append(s);
  const dx = (Math.random() - .5) * 18;
  s.animate([{ transform: 'translate(0,6px) scale(.2) rotate(0deg)', opacity: 0 }, { transform: `translate(${dx / 2}px,-4px) scale(1) rotate(25deg)`, opacity: 1, offset: .35 },
    { transform: `translate(${dx}px,-16px) scale(.4) rotate(60deg)`, opacity: 0 }], { duration: 620, easing: 'ease-out' }).onfinish = () => s.remove();
}

const fieldCtx = {
  get: getKey,
  set: setKey,
  isTouched: k => touched.has(k),
  sfx, typed, reduced,
  files: () => api.files(),
};

// ---------------------------------------------------------------- left nav, counter, sound pill
function renderNav() {
  const nav = $('#nav');
  nav.replaceChildren(...GROUPS.map(g => el('button', { type: 'button', class: 'nav-item', 'data-group': g, 'data-nosfx': '', 'data-cursor-label': 'jump' },
    el('span', { class: 'nav-dot', 'aria-hidden': 'true' }), el('span', { class: 'nav-label' }, g.toLowerCase()))));
  nav.addEventListener('click', e => {
    const b = e.target.closest('.nav-item');
    if (!b || b.disabled) return;
    const first = SCREENS.findIndex(s => s.group === b.dataset.group);
    if (first !== idx) { sfx('slide'); go(first, { sound: false }); }
  });
}
function paintNav() {
  const cur = SCREENS[idx].group;
  $$('#nav .nav-item').forEach(b => {
    const g = b.dataset.group, first = SCREENS.findIndex(s => s.group === g);
    const isCur = g === cur, done = !isCur && first <= reached;
    b.classList.toggle('cur', isCur); b.classList.toggle('done', done);
    b.disabled = !(isCur || done);
    if (isCur) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
  });
}
function wizardTitle() { const h1 = $('#headline').textContent || (SCREENS[idx].mode === 'full' ? 'welcome' : ''); if (h1) titleFor('wizard', `${h1}${$('#counter').textContent ? ', ' + $('#counter').textContent : ''}`); }
function paintCounter() {
  const s = SCREENS[idx];
  $('#counter').textContent = route !== 'wizard' || s.mode === 'full' ? '' : s.id === 'workshop' ? 'making it' : `${idx} of ${QUESTIONS}`;
  paintChrome();
}
function paintSound() {
  const b = $('#sound');
  if (!A()) { b.hidden = true; return; }
  b.hidden = false;
  const st = audio.state() || {};
  b.setAttribute('aria-pressed', st.music ? 'true' : 'false');
  b.classList.toggle('on', !!st.music && interacted);
  $('.lbl', b).textContent = st.music ? 'music on' : 'music off';
}

// ---------------------------------------------------------------- scenes
async function dropScene() {
  if (!sceneHost) return;
  const inst = scene, host = sceneHost, slow = sceneName === 'welcome';
  scene = null; sceneHost = null; sceneName = '';
  if (!reduced()) {
    await host.animate([{ opacity: 1 }, { opacity: 0 }], { duration: slow ? 640 : 220, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
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
  (name === 'welcome' ? $('#welcomeLayer') : $('#illus')).append(host);
  sceneName = name; sceneHost = host;
  const inst = await mountScene(name, host, sceneCtx);
  if (token !== sceneToken) { inst.destroy(); host.remove(); return; }
  scene = inst;
  scene.update(data);
  if (!reduced()) host.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 520, easing: EASE });
}

// ---------------------------------------------------------------- building a screen
function badgeFor(s) {
  const inGroup = SCREENS.filter(x => x.group === s.group && x.id !== 'workshop');
  const dots = s.id === 'workshop' ? [] : inGroup.map(x => el('i', { class: x.id === s.id ? 'on' : '' }));
  return [el('span', {}, s.group.toLowerCase()), dots.length > 1 ? el('span', { class: 'dots', 'aria-hidden': 'true' }, dots) : null];
}

function setNext(label, show = true) {
  const n = $('#next');
  n.hidden = !show;
  $('.lbl', n).textContent = label;
}

async function build(s) {
  stage.dataset.screen = s.id;
  stage.dataset.kind = s.component || (s.mode === 'full' ? 'welcome' : 'fields');
  if (s.mode === 'full') { paintWelcome(); return; }
  $('#badge').replaceChildren(...badgeFor(s).filter(Boolean));
  $('#headline').textContent = s.headline;
  $('#lead').textContent = s.lead;
  const fieldsEl = $('#fields'), leftSlot = $('#leftSlot');
  setNext(s.id === 'extra' ? 'review' : 'next', s.id !== 'review' && s.id !== 'workshop');
  $('#make').hidden = s.id !== 'review';
  $('#back').hidden = s.id === 'workshop';
  if (s.fields && s.fields.length) view.fields = renderFields(fieldsEl, s.fields, fieldCtx);
  if (s.left) view.leftFields = renderFields(leftSlot, s.left, fieldCtx);
  const comp = s.component;
  try {
    if (comp === 'uploads') await buildUploads(s, fieldsEl);
    else if (comp === 'looks') await buildLooks(fieldsEl);
    else if (comp === 'review') buildReview(fieldsEl);
    else if (comp === 'workshop') await buildWorkshop(leftSlot, fieldsEl);
  } catch (e) {
    console.warn('[aura] component failed on', s.id, e);
  }
}

async function buildUploads(s, host) {
  const f = s.folder;
  const m = await need('uploads');
  let n = 0;
  const label = () => setNext(n ? 'next' : 'skip');
  label();
  api.files().then(g => {
    const grp = Array.isArray(g) ? g.find(x => x.folder === f.name) : null;
    n = grp ? (grp.files || []).length : 0;
    if (SCREENS[idx] === s) label();
  });
  view.offs.push(on('files:uploaded', d => { if (d && d.folder === f.name) { n++; label(); } }));
  if (m && m.mountUploads) {
    view.comp = m.mountUploads(host, { folder: f.name, title: f.title, hint: f.hint, accept: f.accept, setKey, getState, bus, audio });
  } else {
    host.append(el('div', { class: 'fallback' },
      el('p', {}, `drop your files into the “3 - Put your files here / ${f.name}” folder, then press next.`),
      el('button', { type: 'button', class: 'soft-pill', onclick: () => api.openFiles() }, 'open the files folder')));
  }
}

async function buildLooks(host) {
  const m = await need('looks');
  const slot = el('div', { class: 'illus-slot' });
  $('#illus').append(slot);
  view.illusSlot = slot;
  if (m && m.mountLooks) view.comp = m.mountLooks(host, slot, { getState, setKey, bus, audio });
  else {
    view.fields = renderFields(host, [{ type: 'seg', key: 'look.theme', label: 'the look', stack: true, default: 'Claude chooses',
      options: ['Pink Punch', 'Bold Blue', 'Flat-Pack', 'Happy Headspace', 'Yellow Frame', 'Claude chooses'].map(v => ({ value: v, label: v })) }], fieldCtx);
  }
}

async function buildWorkshop(leftSlot, host) {
  const m = await need('workshop');
  if (m && m.mountWorkshop) view.comp = m.mountWorkshop(leftSlot, host, { getState, bus, audio, deckId: buildDeck,
    onEdit: id => openEditor(id || buildDeck), onHome: () => goHome() });
  else host.append(el('div', { class: 'fallback' }, el('p', {}, 'claude is working in the background. your slides will appear in “4 - Your slides”.')));
}

const PENCIL = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M4 16l1-4 8-8 3 3-8 8zM11.5 5.5l3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>';
function reviewRows() {
  const g = getKey, list = a => (Array.isArray(a) ? a.filter(Boolean) : []);
  const mins = g('audience.minutes'), qa = g('audience.qa');
  const names = list((g('people.presenters') || []).map(p => p && p.name && p.name.trim()));
  return [
    ['the talk', 'type', g('basics.type') === 'Other' ? g('basics.typeOther') : g('basics.type')],
    ['title', 'title', g('basics.title')],
    ['presenters', 'presenters', names.join(', ')],
    ['time', 'time', mins ? `${mins} min${qa ? ` + ${qa} min for questions` : ''}` : ''],
    ['audience', 'audience', [list(g('audience.who')).join(', '), (g('audience.level') || '').toLowerCase()].filter(Boolean).join(' · ')],
    ['your work', 'work', g('work.summary') || g('work.field')],
    ['look', 'look', (g('look.theme') || '').replace('Claude chooses', 'claude chooses')],
    ['style', 'style', `3d ${g('style.threeD') || 'yes'} · 2d ${g('style.twoD') || 'yes'} · ${(g('style.amountLabel') || 'balanced').toLowerCase()}`],
    ['files', 'files-1', '…'],
    ['quality', 'quality', ({ best: 'best (recommended)', maximum: 'maximum', balanced: 'balanced', fast: 'fast' })[g('style.quality')] || 'best (recommended)'],
  ];
}
function buildReview(host) {
  const box = el('div', { class: 'review', role: 'list' });
  for (const [label, id, value] of reviewRows()) {
    const v = (value == null ? '' : String(value)).trim();
    const row = el('button', { type: 'button', class: 'rv-row', role: 'listitem', 'data-go': id, 'data-cursor-label': 'edit' },
      el('span', { class: 'rv-label' }, label), el('span', { class: `rv-value${v ? '' : ' none'}` }, v || 'not set'),
      el('span', { class: 'rv-edit', html: PENCIL }));
    if (id === 'files-1') row.dataset.files = '';
    box.append(row);
  }
  box.addEventListener('click', e => { const r = e.target.closest('.rv-row'); if (r) go(iOf(r.dataset.go), { check: false }); });
  host.append(box);
  api.files().then(g => {
    const v = $('[data-files] .rv-value', box);
    if (!v || !Array.isArray(g)) { if (v) v.textContent = 'whatever is in your folders'; return; }
    const groups = g.filter(x => (x.files || []).length), n = groups.reduce((a, x) => a + x.files.length, 0);
    v.textContent = n ? `${n} file${n > 1 ? 's' : ''} in ${groups.length} folder${groups.length > 1 ? 's' : ''}` : 'none yet, that’s fine';
    v.classList.toggle('none', !n);
  });
}

function paintWelcome() {
  const back = $('#welcomeBack');
  back.hidden = reached < 2;
  if (reached >= 2) $('#resumeAt').textContent = `step ${Math.min(reached, iOf('review'))}`;
}

function teardownView() {
  view.fields && view.fields.destroy();
  view.leftFields && view.leftFields.destroy();
  try { view.comp && view.comp.destroy && view.comp.destroy(); } catch (e) { console.warn('[aura] component cleanup', e); }
  view.offs.forEach(f => f());
  if (view.illusSlot) view.illusSlot.remove();
  view = { offs: [] };
  $('#fields').replaceChildren();
  $('#leftSlot').replaceChildren();
}

// ---------------------------------------------------------------- transitions
function partsFor(full) {
  return full ? $$('#welcome .w-anim') : [$('#badge'), $('#headline'), $('#lead'), $('#leftSlot'), $('#fields'), $('.actions')];
}
async function leave(dir, full) {
  const parts = partsFor(full);
  const rm = reduced();
  const anims = parts.map((p, i) => p.animate(
    [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: rm ? 'none' : `translate(${-dir * 18}px, 0)` }],
    { duration: rm ? 120 : 190, delay: rm ? 0 : i * 16, easing: 'cubic-bezier(.55,0,1,.45)', fill: 'forwards' }));
  // Never let a stalled animation (hidden tab, busy GPU) wedge navigation.
  await Promise.race([Promise.all(anims.map(a => a.finished.catch(() => {}))), new Promise(r => setTimeout(r, 700))]);
}
function enter(dir, full) {
  const rm = reduced();
  partsFor(full).forEach(p => p.getAnimations().forEach(a => a.cancel()));
  const parts = full ? partsFor(true)
    : [$('#badge'), $('#headline'), $('#lead'), ...$('#leftSlot').children, ...$('#fields').children, $('.actions')];
  parts.forEach((p, i) => p.animate(
    [{ opacity: 0, transform: rm ? 'none' : `translate(${dir * 26}px, 0)` }, { opacity: 1, transform: 'none' }],
    { duration: rm ? 160 : 560, delay: rm ? 0 : 40 + i * 45, easing: EASE, fill: 'backwards' }));
}

function focusFirst(s) {
  if (s.mode === 'full') { $('#begin').focus({ preventScroll: true }); return; }
  if (s.id === 'review') { $('#make').focus({ preventScroll: true }); return; }
  if (view.fields && !s.component) { view.fields.focusFirst(); return; }
  if (s.component === 'uploads' || s.component === 'looks') { $('#next').focus({ preventScroll: true }); }
}

async function go(to, { check = true, sound = true } = {}) {
  if (busy || to === idx || to < 0 || to >= SCREENS.length) return false;
  if (check && to > idx) {
    const bad = (view.fields && view.fields.validate()) || (view.leftFields && view.leftFields.validate());
    if (bad) { complain(bad); return false; }
  }
  busy = true;
  const from = SCREENS[idx], s = SCREENS[to], dir = to > idx ? 1 : -1;
  if (to > idx) { tidyRows(from); saveNow(); }
  hideMsg();
  if (sound) { sfx(dir > 0 ? 'next' : 'back'); sfx('whoosh'); }
  const fromFull = from.mode === 'full', toFull = s.mode === 'full';
  const sceneDone = switchScene(s.component === 'looks' ? null : s.scene);
  if (fromFull !== toFull) setMode(s.mode);
  await leave(dir, fromFull);
  teardownView();
  idx = to; reached = Math.max(reached, Math.min(to, iOf('review')));
  persistLocal();
  await build(s);
  paintNav(); paintCounter();
  enter(dir, toFull);
  busy = false;
  focusFirst(s);
  wizardTitle();
  emit('step:change', { from: from.id, to: s.id, step: s });
  sceneDone.catch(() => {});
  return true;
}
// Drop completely empty repeater rows when moving on (keeping the minimum), so the brief stays clean.
function tidyRows(s) {
  for (const f of s.fields || []) {
    if (f.type !== 'repeater') continue;
    const a = getKey(f.key);
    if (!Array.isArray(a)) continue;
    const keep = a.filter(r => r && f.cols.some(c => String(r[c.key] || '').trim()));
    while (keep.length < (f.min || 0)) keep.push(Object.fromEntries(f.cols.map(c => [c.key, ''])));
    if (keep.length !== a.length) setKey(f.key, keep, { touch: false });
  }
}

const next = () => {
  const s = SCREENS[idx];
  if (s.id === 'review') return makeSlides();
  if (s.id !== 'workshop') go(idx + 1);
};
const back = () => { if (idx > 0 && !(SCREENS[idx].id === 'workshop' && claudeLive())) go(idx - 1, { check: false }); };

function begin() {
  const at = reached >= 2 ? Math.min(reached, iOf('review')) : 1;
  go(at, { check: false });
}

function missingRequired(s) {
  for (const f of s.fields || []) {
    if (f.when && !f.when(getKey)) continue;
    if (f.type === 'repeater') {
      const req = f.cols.filter(c => c.required);
      if (req.length && !(getKey(f.key) || []).some(r => req.every(c => (r[c.key] || '').trim()))) return true;
    } else if (f.required) {
      const v = getKey(f.key);
      if (v == null || (typeof v === 'string' && !v.trim())) return true;
    }
  }
  return false;
}

async function makeSlides() {
  const btn = $('#make');
  if (busy || btn.disabled) return;
  const gap = SCREENS.findIndex(s => s.mode === 'stage' && missingRequired(s));
  if (gap > 0) {
    sfx('error');
    await go(gap, { check: false });
    const bad = view.fields && view.fields.validate();
    if (bad) complain(bad);
    return;
  }
  btn.disabled = true;
  $('.lbl', btn).textContent = 'getting ready…';
  sfx('launch');
  const saved = await saveNow();
  btn.disabled = false; $('.lbl', btn).textContent = 'make my slides';
  if (!saved) { complain({ msg: 'couldn’t reach lumi. is its window still open?', el: btn }); return; }
  // v0.5: the plan page asks "plan with claude (recommended)" or "skip, i'm in a hurry"
  setRoute('plan', {});
}

// "skip, i'm in a hurry": the whole deck in one go (the v0.3 workshop), then the editor. Resolves true when started.
async function startHurry(deckId) {
  const st = await api.claude.status();
  if (st && st.running) { showMsg('claude is still busy with another deck. try again when it’s done.'); sfx('error'); return false; }
  const r = await api.claude.start(deckId || undefined);
  if (!r || r.ok === false) {
    if (r && r.error === 'cli-missing') { buildDeck = null; await setRoute('wizard', { screen: 'workshop' }); return true; }
    showMsg(r && r.error === 'busy' ? 'claude is still busy with another deck. try again when it’s done.' : 'claude couldn’t start. try again in a moment.');
    sfx('error');
    return false;
  }
  buildDeck = r.deckId || null; draftUsed = true; setClaude({ running: true, waiting: false, deckId: buildDeck });
  persistLocal();
  await setRoute('wizard', { screen: 'workshop' });
  return true;
}

function paintWorkshopText(d = {}) {
  if (SCREENS[idx].id !== 'workshop') return;
  const [h, l] = d.done ? ['your slides are ready!', 'open them on the left. want changes? just ask claude on the right.']
    : d.waiting ? ['claude has a question', 'answer on the right and claude carries on.']
    : ['claude is making your slides', 'this takes a little while. if claude asks something, answer on the right.'];
  if ($('#headline').textContent !== h) { $('#headline').textContent = h; $('#lead').textContent = l; }
}

// ---------------------------------------------------------------- welcome extras
async function startFresh(e) {
  const b = e.currentTarget;
  if (!b.dataset.armed) {
    b.dataset.armed = '1'; b.textContent = 'tap again to clear everything';
    setTimeout(() => { delete b.dataset.armed; b.textContent = 'start fresh'; }, 3200);
    return;
  }
  // W-08: the old answers are copied to .aura/brief/brief-<time>.json first (the server keeps the newest ten)
  b.disabled = true;
  const kept = await api.brief.archive();
  b.disabled = false;
  if (kept && kept.ok === false && kept.error === 'offline') { showMsg('couldn’t reach lumi to keep a copy of your answers, so nothing was cleared.'); sfx('error'); delete b.dataset.armed; b.textContent = 'start fresh'; return; }
  try { localStorage.removeItem(LS); } catch (err) {}
  data = {}; touched = new Set(); reached = 0;
  applyDefaults(); persistLocal(); saveNow();
  delete b.dataset.armed; b.textContent = 'start fresh';
  sfx('pop'); paintWelcome(); paintNav();
  if (kept && kept.kept) showMsg('cleared. your old answers are kept in the folder “.aura/brief”.');
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
    // W-03: "are you sure?" only when something would really be lost: answers not yet saved to lumi, claude working, or a finalize running
    addEventListener('beforeunload', e => {
      saveOnExit();
      const risky = (route === 'wizard' && JSON.stringify(data) !== lastSaved) || claudeNow(buildDeck).running || finalRunning;
      if (risky) { e.preventDefault(); e.returnValue = ''; return ''; }
    });
    audio.start();
    paintSound();
  };
  addEventListener('pointerdown', first, true);
  addEventListener('keydown', first, true);
  addEventListener('pagehide', saveOnExit);

  addEventListener('keydown', e => {
    if (e.defaultPrevented || route !== 'wizard') return;
    if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); back(); return; }
    if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.isComposing) return;
    const s = SCREENS[idx], t = e.target;
    if (s.id === 'workshop' || busy) return;
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); if (s.mode === 'full') begin(); else next(); return; }   // Ctrl+Enter: next, even from a textarea
    if (t.tagName === 'TEXTAREA' && !('enterNext' in t.dataset)) return;
    if (t.isContentEditable) return;
    const choice = t.closest && t.closest('.choice');
    if (choice) {
      // Like a form: Space toggles a choice, Enter moves on. Only an unpicked card in an empty group gets picked.
      if (choice.getAttribute('role') === 'radio' && !choice.parentElement.querySelector('[aria-checked=true]')) return;
    } else if (t.closest && t.closest('button, a[href], select, [role=button], summary')) return;
    e.preventDefault();
    if (s.mode === 'full') begin(); else next();
  });

  // Keep the character's eyes on whatever is being typed or focused.
  document.addEventListener('focusin', e => {
    const t = e.target;
    if (!stage.contains(t) || stage.dataset.mode === 'full') return;
    if (t.matches('input, textarea') || t.matches(':focus-visible')) lookAt(t);
  });
  for (const type of ['click', 'keyup']) document.addEventListener(type, e => { if (e.target.matches && e.target.matches('#fields input, #fields textarea, #leftSlot input')) lookAt(e.target); });

  $('#next').addEventListener('click', next);
  $('#back').addEventListener('click', back);
  $('#make').addEventListener('click', makeSlides);
  $('#begin').addEventListener('click', () => begin());
  $('#fresh').addEventListener('click', startFresh);
  $('#homeBtn').addEventListener('click', () => { sfx('back'); goHome(); });
  $('#sound').addEventListener('click', () => {
    const st = audio.state() || {};
    audio.start(); audio.setMusic(!st.music); sfx('toggle');
    paintSound();
  });
  on('audio:change', paintSound);
  on('claude:state', d => { if (route !== 'wizard') return; paintWorkshopText(d || {}); });
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
  busy = true;   // no navigation until the first screen is built
  fit();
  addEventListener('resize', fit);
  stage.classList.toggle('reduced', reduced());
  $('#phases').replaceChildren(...PHASES.map((p, i) => el('li', {}, el('span', { class: 'ph-n' }, String(i + 1)), el('span', {}, p))));
  renderNav();
  wireInput();
  wireNet();

  const saved = loadLocal();
  if (saved) {
    data = saved.data; touched = new Set(saved.touched || []); reached = saved.reached | 0;
    draftUsed = !!saved.used; buildDeck = saved.buildDeck || null;
  } else {
    const b = await api.brief.get();
    if (b && typeof b === 'object' && b.ok !== false) {
      const { _savedAt, ok, ...rest } = b;
      // A brief saved from another browser: keep the answers; only treat it as progress if it has real ones.
      if (Object.keys(rest).length) { data = rest; if (getKey('basics.type') || getKey('basics.title')) reached = iOf('review'); }
      // ...unless a deck was already built from this very brief: then it is not an unfinished draft.
      if (_savedAt) {
        const ds = await api.decks.list();
        const built = ds && Array.isArray(ds.decks) && ds.decks.find(dk => dk.briefSavedAt === _savedAt);
        if (built) { draftUsed = true; buildDeck = built.id; }
      }
    }
  }
  delete data._savedAt;
  applyDefaults();
  lastSaved = draftUsed ? JSON.stringify(data) : '';   // a brief a deck was built from is never re-saved just by opening the app

  // Every launch starts on the loading screen (full mode), then goes home (or back to a deck Claude is working on).
  stage.classList.add('instant');
  stage.dataset.mode = 'full';
  stage.dataset.route = 'loading';
  usagePill = initUsage($('#usage'));
  requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.remove('instant')));
  document.fonts.ready.then(placeBrand);
  placeBrand();
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
  ['home', 'editor', 'workshop', 'uploads', 'looks'].forEach((n, i) => setTimeout(() => need(n), 600 + i * 300));
}

// ---------------------------------------------------------------- v0.3 routes
const ROUTE_MODE = { loading: 'full', home: 'home', editor: 'edit', plan: 'home', build: 'work', finalize: 'full' };
function paintChrome() {
  const s = SCREENS[idx];
  $('#homeBtn').hidden = route !== 'wizard';
  if (usagePill) usagePill.show(route === 'home' || route === 'editor' || route === 'plan' || route === 'build' || (route === 'wizard' && s.id === 'workshop'));
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
    if (prev === 'wizard') {
      await leave(1, SCREENS[idx].mode === 'full');
      teardownView();
      sceneToken++;                                    // F-20: a scene still being mounted must not land on the next screen
      dropScene();
      partsFor(true).concat(partsFor(false)).forEach(p => p && p.getAnimations().forEach(a => a.cancel()));
    } else if (routeView || prev) {
      const host = $('#' + prev);
      if (host) await fadeRoute(host, true);
      try { routeView && routeView.destroy(); } catch (e) { console.warn('[aura] route cleanup', e); }
      routeView = null;
      if (host) host.getAnimations().forEach(a => a.cancel());
    }
    hideMsg();
    if (name === 'wizard') {
      route = 'wizard'; stage.dataset.route = 'wizard';
      idx = Math.max(0, iOf(opts.screen || 'welcome'));
      const s = SCREENS[idx];
      setMode(s.mode);
      await build(s);
      paintNav(); paintCounter();
      busy = false;
      enter(1, s.mode === 'full');
      switchScene(s.component === 'looks' ? null : s.scene).catch(e => console.warn('[aura] scene', e));
      focusFirst(s);
      wizardTitle();
      emit('step:change', { from: prev, to: s.id, step: s });
      persistLocal();
    } else {
      await mountRoute(name, opts);
    }
    return true;
  } finally { routing = false; busy = false; }
}
async function mountRoute(name, opts = {}) {
  route = name; stage.dataset.route = name;
  setMode(ROUTE_MODE[name] || 'full');
  paintCounter();
  const host = $('#' + name);
  const m = await need(name);
  if (!m) { routeDown(host, name, opts); fadeRoute(host, false); return; }
  try {
    if (name === 'loading' && m) routeView = m.mountLoading(host, { audio, onDone: afterLoading });
    else if (name === 'home' && m) routeView = m.mountHome(host, { audio, update: updateInfo, onNew: () => newDeck({ fresh: true }), onResume: resumeDraft, onOpen: openFromHome,
      onFinalize: dk => openFinalize(dk.id), onSignin: () => setRoute('loading', {}), draft: () => (!draftUsed && reached >= 2 ? { step: Math.min(reached, iOf('review')) } : null) });
    else if (name === 'editor' && m) routeView = m.mountEditor(host, { deckId: opts.deckId, slide: opts.slide, audio, bus, sceneCtx, mountScene, onHome: goHome, onFinalize: openFinalize });
    else if (name === 'plan' && m) routeView = m.mountPlan(host, { deckId: opts.deckId || null, audio, setMode,
      onStarted: id => { draftUsed = true; buildDeck = id; persistLocal(); },
      onHurry: id => startHurry(id), onBuild: id => { draftUsed = true; buildDeck = id; persistLocal(); return openBuild(id); }, onHome: goHome });
    else if (name === 'build' && m) routeView = m.mountEditor(host, { deckId: opts.deckId, audio, bus, sceneCtx, mountScene, onHome: goHome, onFinalize: openFinalize, build: true });
    else if (name === 'finalize' && m) routeView = m.mountFinalizing(host, { deckId: opts.deckId, audio, onHome: goHome, onEdit: openEditor });
  } catch (e) { console.warn('[aura] could not open', name, e); }
  fadeRoute(host, false);
  titleFor(name);
  if (host) { host.tabIndex = -1; try { host.focus({ preventScroll: true }); } catch (e) { /* fine */ } }
  emit('route:change', { route: name });
}
// F-14: every screen change updates the tab title and tells a screen reader where it is (focus lands on the screen itself)
const ROUTE_TITLE = { loading: 'getting ready', home: 'your decks', editor: 'edit your deck', plan: 'plan your deck', build: 'build your deck', finalize: 'finalize your deck' };
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
    if (d && d.deck && d.deck.exists) return openEditor(st.deckId);
    buildDeck = st.deckId; setClaude({ running: true, deckId: st.deckId });
    return setRoute('wizard', { screen: 'workshop' });
  }
  return setRoute('home');
}
function goHome() { return setRoute('home'); }
function openEditor(deckId, slide) { if (!deckId) return goHome(); return setRoute('editor', { deckId, slide }); }
function openPlan(deckId) { return setRoute('plan', { deckId }); }
function openBuild(deckId) { return setRoute('build', { deckId }); }
function openFinalize(deckId) { if (!deckId) return goHome(); return setRoute('finalize', { deckId }); }
// A plan-flow deck opens where it stands: the plan, the build page, or (all built) the editor.
function openFromHome(dk) {
  if (dk.flow === 'plan') {
    if (!dk.builtCount && dk.planState !== 'building') return openPlan(dk.id);
    if (dk.builtCount < dk.planCount) return openBuild(dk.id);
  }
  if (dk.exists) return openEditor(dk.id);
  buildDeck = dk.id;
  return setRoute('wizard', { screen: 'workshop' });
}
// "make a new deck": a fresh draft once the last one has been built. From home it is always fresh (an unfinished
// draft has its own "continue" card there). The server's draft brief is only overwritten once the person starts answering.
function newDeck({ fresh = false } = {}) {
  if (draftUsed || fresh) {
    data = {}; touched = new Set(); reached = 0; draftUsed = false; buildDeck = null;
    applyDefaults(); lastSaved = JSON.stringify(data); persistLocal();
  }
  return setRoute('wizard', { screen: 'welcome' });
}
// "continue your draft": straight back to the step the person had reached.
function resumeDraft() {
  return setRoute('wizard', { screen: SCREENS[Math.max(0, Math.min(reached, iOf('review')))].id });
}

// Tiny hook for tests and the integration step.
window.__aura = { get state() { return data; }, get screen() { return SCREENS[idx].id; }, go: id => go(iOf(id), { check: false }), get busy() { return busy; },
  get route() { return route; }, home: () => goHome(), edit: (id, n) => openEditor(id, n), newDeck: () => newDeck(),
  plan: id => setRoute('plan', { deckId: id || null }), build: id => openBuild(id), finalize: id => openFinalize(id) };

boot();
