// "Plan your deck" (v0.5, every look). Before anything is built, Claude suggests the slides; the person checks them.
// States: the interview -> the look -> planning (Claude reads the files once)
// -> the plan: a draggable slide list on the left, the selected slide's words in the middle, its picture on the right,
// deck-wide questions in a strip on top, per-slide questions as badges. Every edit to a slide asks Claude for a quick
// re-plan of that slide only (queued on the server, sonnet/high); neighbours it changed flash; "✓ all clear" or a new
// question comes back. One main picture per slide: clashing chips are greyed with a reason and two fixes.
// mountPlan(el, { deckId?, audio, setMode, onStarted(deckId), onBuild(deckId), onHome }) -> { destroy() }
// Also exports the pieces the build page reuses: slideEditor(), doubtCard(), MAINS, COMPANIONS.
import * as api from './api.js';
import { parseWhen, whenMatches } from './markers.js';
import { openDialog, roving, syncTab } from './a11y.js';
import { setClaude } from './bus.js';
import { pace } from './api.js';
import { ENGINE, effEngine, engineNotes } from './blender.js';

import { h } from './dom.js';
export { h };
import { ICON } from './dom.js';
export { ICON };

// The doability matrix. The server (form_server.py: COMPANIONS / clash_reason) checks the same - keep them in step.
export const MAINS = [
  { id: '3d', label: '3D model', name: 'a 3D model', why: 'a real-looking model that can turn and move' },
  { id: 'chart', label: 'chart', name: 'a chart', why: 'your numbers as bars or lines' },
  { id: 'diagram', label: 'diagram', name: 'a diagram', why: 'a moving picture of how something works' },
  { id: 'photo', label: 'photo', name: 'a photo', why: 'one of your own pictures' },
  { id: 'text', label: 'text only', name: 'big text only', why: 'one strong sentence or quote' },
];
export const COMPANIONS = {
  '3d': [{ id: 'stats', label: '3 numbers', why: 'up to 3 number cards beside the model' },
    { id: 'checklist', label: 'checklist', why: 'a short list of ticks' },
    { id: 'labels', label: 'labels', why: 'name tags pointing at its parts' },
    { id: 'map', label: 'small map', why: 'a tiny map in a corner' }],
  chart: [{ id: 'notes', label: '3 notes', why: 'up to 3 notes pinned to the chart' }],
  photo: [{ id: 'zones', label: 'zones', why: 'the photo split into labelled bands' },
    { id: 'inset', label: 'small inset', why: 'a small close-up on top' },
    { id: 'marks', label: 'marks', why: 'circles and arrows drawn on the photo' }],
  diagram: [{ id: 'steps', label: 'steps', why: 'builds up in a few steps' }],
  text: [{ id: 'quote', label: 'big quote', why: 'a big quote, with who said it' }],
};
export const DETAILS = [{ id: 'simple', label: 'simple', why: 'clean and plain. quick to build' },
  { id: 'detailed', label: 'detailed', why: 'real materials, shadows and small parts' },
  { id: 'showpiece', label: 'showpiece', why: 'every detail, best lighting. slowest' }];
export const MOTIONS = [{ id: 'still', label: 'still', why: 'stands still, like a photo' },
  { id: 'timed', label: 'loop', why: 'turns or moves in a smooth loop' },
  { id: 'physics-like', label: 'physics-like', why: 'things fall, flow or bounce in a believable way' },
  { id: 'simulation', label: 'simulation', why: 'motion from real equations. slowest to build' }];
const mainOf = id => MAINS.find(m => m.id === id) || MAINS[4];
const compHome = id => Object.keys(COMPANIONS).find(m => COMPANIONS[m].some(c => c.id === id));
export function clashReason(main, item) {
  if (MAINS.some(m => m.id === item)) return item === main ? '' : `one main picture per slide. this one already has ${mainOf(main).name}.`;
  const home = compHome(item);
  return !home || home === main ? '' : `this only works with ${mainOf(home).name}.`;
}
// words exactly as deck_check.js and the server count them: whitespace-separated tokens containing a letter ("34%", "2025" are not words)
export const countWords = (...parts) => parts.reduce((n, p) => n + String(p || '').split(/\s+/).filter(t => /[A-Za-zÀ-ɏͰ-ϿЀ-ӿঀ-৿]/.test(t)).length, 0);
const clone = v => JSON.parse(JSON.stringify(v));
const baseName = p => String(p || '').split('/').pop();

// visual.engine (docs/blender-contract.md section 2): 'blender' | 'threejs' | absent (= lumi decides); only for a 3D picture
export function fixVisual(v) {
  const main = MAINS.some(m => m.id === v.main) ? v.main : 'text';
  const ok = (COMPANIONS[main] || []).map(c => c.id);
  const out = { main, companions: (v.companions || []).filter(c => ok.includes(c)), phrase: v.phrase || '',
    detail: main === '3d' ? (v.detail || 'detailed') : null, motion: main === '3d' ? (v.motion || 'timed') : null };
  if (main === '3d' && (v.engine === 'blender' || v.engine === 'threejs')) out.engine = v.engine;
  // post-mortem problem 2: `builtAs` is lumi's own record of what the finished slide really holds. it is a fact, not an
  // intent, so the page carries it through untouched - dropping it here would silently erase the record on the next edit.
  if (v.builtAs) out.builtAs = v.builtAs;
  return out;
}

// ---------------------------------------------------------------- a question card (deck strip, slide badge popover)
// One question. Its button is "use this" for a lone question, "next question" on the way through several and "continue" on
// the last one (the page sends the answers together then). Enter in the text box never sends: it does nothing.
// opts: { onAnswer(picks, other) -> bool|Promise<bool>, onDraft(picks, other) (every change), draft: {picks, other}, label, sfx, compact }
export function doubtCard(d, { onAnswer, onDraft, draft = null, label = 'use this', sfx = () => {}, compact = false } = {}) {
  const picks = new Set(draft && draft.picks ? draft.picks : d.answer ? String(d.answer).split(' | ') : d.default || []);
  const opts = h('div', { class: 'pl-dq-opts', role: d.multi ? 'group' : 'radiogroup', 'aria-label': d.question });
  const free = h('input', { class: 'pl-dq-free', type: 'text', maxlength: '300', placeholder: 'something else…', 'aria-label': 'your own answer' });
  free.value = (draft && draft.other) || d.other || '';
  const send = h('button', { type: 'button', class: 'pl-dq-send', 'data-nosfx': '', 'data-cursor-label': 'answer' }, label);
  const note = () => { if (onDraft) onDraft([...picks], free.value.trim()); };
  const paint = () => { [...opts.children].forEach(b => { const on = picks.has(b.dataset.opt); b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); }); if (!d.multi) syncTab(opts, '[role=radio]'); };
  if (!d.multi) roving(opts, '[role=radio]');
  for (const o of d.options) {
    const b = h('button', { type: 'button', class: 'pl-dq-opt', role: d.multi ? 'checkbox' : 'radio', 'data-opt': o, 'data-nosfx': '' },
      h('span', { class: 'pl-dq-tick', html: ICON.tick }), h('span', {}, o),
      (d.default || []).includes(o) && !d.answer ? h('span', { class: 'pl-dq-sug' }, 'suggested') : null);
    b.addEventListener('click', () => { if (d.multi) picks.has(o) ? picks.delete(o) : picks.add(o); else { picks.clear(); picks.add(o); } sfx('select'); paint(); note(); });
    opts.append(b);
  }
  paint();
  const el = h('div', { class: 'pl-dq' + (compact ? ' is-compact' : '') + (d.answer ? ' is-done' : '') },
    h('p', { class: 'pl-dq-q' }, d.question), opts, h('div', { class: 'pl-dq-foot' }, free, send));
  send.addEventListener('click', async () => {
    const other = free.value.trim();
    if (!picks.size && !other) { sfx('error'); return; }
    send.disabled = true; send.textContent = 'sending…';
    sfx('next');
    const ok = onAnswer ? await onAnswer([...picks], other) : true;
    if (!ok) { send.disabled = false; send.textContent = label; }
  });
  free.addEventListener('input', note);
  free.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });     // Enter must not send (or skip the questions after this one)
  return el;
}

// ---------------------------------------------------------------- the slide editor (plan page detail + build popup)
// slideEditor(slide, { cap, files, sfx, onChange(slide, {replan}), onOwnSlide(main), compact }) -> { el, words, set(slide), slide }
// Short-lived UI timers (armed-confirm buttons, the "why" note, the flash marker). Tracked so a destroyed view leaves none behind.
const pendingTimers = new Set();
function later(fn, ms) {
  const id = setTimeout(() => { pendingTimers.delete(id); fn(); }, ms);
  pendingTimers.add(id);
  return id;
}
export function clearLater() { for (const id of pendingTimers) clearTimeout(id); pendingTimers.clear(); }

export function slideEditor(slide, ctx = {}) {
  const sfx = ctx.sfx || (() => {});
  let s = clone(slide);
  s.visual = fixVisual(s.visual || {});
  s.bullets = Array.isArray(s.bullets) ? s.bullets : [];
  s.sources = Array.isArray(s.sources) ? s.sources : [];
  const change = (replan = true) => { s.words = countWords(s.title, ...s.bullets); meter(); ctx.onChange && ctx.onChange(clone(s), { replan }); };

  // ---- words
  const title = h('input', { class: 'pl-title-in', type: 'text', maxlength: '200', placeholder: 'slide title', 'aria-label': 'slide title' });
  const point = h('textarea', { class: 'pl-point-in', rows: '2', maxlength: '400', placeholder: 'the one thing this slide should say', 'aria-label': 'the one point' });
  const bullets = h('div', { class: 'pl-bullets' });
  const addB = h('button', { type: 'button', class: 'pl-add-b', 'data-cursor-label': 'add' }, h('span', { html: ICON.plus }), 'add a line');
  const meterBar = h('i'), meterTxt = h('span', { class: 'pl-meter-t' });
  const meterEl = h('div', { class: 'pl-meter' }, h('span', { class: 'pl-meter-bar' }, meterBar), meterTxt);
  const srcRow = h('div', { class: 'pl-src' });
  function paintBullets() {
    bullets.replaceChildren(...s.bullets.map((b, i) => {
      const inp = h('input', { class: 'pl-b-in', type: 'text', maxlength: '240', placeholder: 'a short line', 'aria-label': `line ${i + 1}` });
      inp.value = b;
      inp.addEventListener('input', () => { s.bullets[i] = inp.value; s.words = countWords(s.title, ...s.bullets); meter(); });
      inp.addEventListener('change', () => { s.bullets[i] = inp.value.trim(); change(); });
      const x = h('button', { type: 'button', class: 'pl-b-x', 'aria-label': 'remove this line', title: 'remove this line', html: '×' });
      x.addEventListener('click', () => { s.bullets.splice(i, 1); sfx('deselect'); paintBullets(); change(); });
      return h('div', { class: 'pl-b' }, h('span', { class: 'pl-b-dot' }), inp, x);
    }));
    addB.hidden = s.bullets.length >= 4;
  }
  addB.addEventListener('click', () => { s.bullets.push(''); sfx('pop'); paintBullets(); bullets.lastChild && bullets.lastChild.querySelector('input').focus(); });
  title.addEventListener('input', () => { s.title = title.value; s.words = countWords(s.title, ...s.bullets); meter(); });
  title.addEventListener('change', () => { s.title = title.value.trim(); change(); });
  point.addEventListener('change', () => { s.point = point.value.trim(); change(); });
  function meter() {
    const cap = ctx.cap || 25, n = countWords(s.title, ...s.bullets), over = n > cap;
    meterBar.style.transform = `scaleX(${Math.min(1, n / cap)})`;
    meterEl.classList.toggle('is-over', over);
    meterTxt.textContent = over ? `${n} words · the look allows ${cap}. trim a line.` : `${n} of ${cap} words`;
  }
  function paintSources() {
    const chips = s.sources.map((f, i) => {
      const x = h('button', { type: 'button', class: 'pl-src-x', 'aria-label': `stop using ${baseName(f)}`, html: '×' });
      x.addEventListener('click', () => { s.sources.splice(i, 1); sfx('deselect'); paintSources(); change(false); });
      return h('span', { class: 'pl-src-chip', title: f }, h('span', { class: 'pl-src-i', html: ICON.file }), h('span', { class: 'pl-src-n' }, baseName(f)), x);
    });
    const files = (ctx.files || []).filter(f => !s.sources.includes(f));
    let pick = null;
    if (files.length && s.sources.length < 3) {
      pick = h('select', { class: 'pl-src-add', 'aria-label': 'use one of your files' }, h('option', { value: '' }, '+ use a file'), files.map(f => h('option', { value: f }, baseName(f))));
      pick.addEventListener('change', () => { if (pick.value) { s.sources.push(pick.value); sfx('select'); paintSources(); change(false); } });
    }
    srcRow.replaceChildren(...[...(chips.length ? chips : [h('span', { class: 'pl-src-none' }, 'no file yet')]), pick].filter(Boolean));
  }

  // ---- picture
  // explanations ("?" on a chip, "switched to …") go into a quiet note that never sits on top of any control: the
  // card header on the plan page, the top of the picture panel in the build page's popup card.
  const why = h('p', { class: 'pl-why pl-note', 'aria-live': 'polite', hidden: true });
  let whyT = 0;
  const tell = t => {
    why.textContent = t; why.hidden = false;
    why.classList.remove('pop'); void why.offsetWidth; why.classList.add('pop');
    clearTimeout(whyT); whyT = later(() => { why.hidden = true; }, 6000);
  };
  const chip = (item, on, { grey = '', onPick, onWhy, radio = false } = {}) => {
    const b = h('button', { type: 'button', class: 'pl-chip' + (on ? ' on' : '') + (grey ? ' is-grey' : ''),
      ...(radio ? { role: 'radio', 'aria-checked': on ? 'true' : 'false' } : { 'aria-pressed': on ? 'true' : 'false' }),
      'data-nosfx': '', 'data-cursor-label': grey ? 'why?' : 'pick', title: grey || item.why },
      ICON[item.id] ? h('span', { class: 'pl-chip-i', html: ICON[item.id] }) : null, h('span', {}, item.label));
    const q = h('span', { class: 'pl-chip-q', role: 'button', tabindex: '0', 'aria-label': `what is ${item.label}?`, html: ICON.q });
    q.addEventListener('click', e => { e.stopPropagation(); sfx('pop'); tell(`${item.label.replace(/^\+ /, '')}: ${grey ? grey : item.why}`, q); onWhy && onWhy(); });
    q.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); q.click(); } });
    if (!grey) b.append(q);
    b.addEventListener('click', () => onPick && onPick(b));
    return b;
  };
  // progressive disclosure: the card shows one line "picture: 3D model ✎"; tapping it opens the main-picture choices,
  // and the extras (plus detail and motion for 3D), the phrase and the files appear once a main picture is picked.
  let picOpen = false, picked = false;
  const picLine = h('button', { type: 'button', class: 'pl-picline', 'aria-expanded': 'false', 'data-cursor-label': 'picture', 'data-nosfx': '' });
  picLine.addEventListener('click', () => { picOpen = !picOpen; if (!picOpen) picked = false; sfx(picOpen ? 'pop' : 'deselect'); paintVisual(); });
  const doneB = h('button', { type: 'button', class: 'pl-picdone', 'data-cursor-label': 'done', 'data-nosfx': '' }, 'done');
  doneB.addEventListener('click', () => { picOpen = false; picked = false; sfx('deselect'); paintVisual(); });
  const mainRow = h('div', { class: 'pl-chips', role: 'radiogroup', 'aria-label': 'main picture' });
  let fixClose = null;
  const addRow = h('div', { class: 'pl-chips', 'aria-label': 'add to it' });
  const alsoRow = h('div', { class: 'pl-chips pl-also', 'aria-label': 'another main picture' });
  const detailRow = h('div', { class: 'pl-chips', role: 'radiogroup', 'aria-label': 'how detailed' });
  const motionRow = h('div', { class: 'pl-chips', role: 'radiogroup', 'aria-label': 'how it moves' });
  roving(mainRow, '[role=radio]'); roving(detailRow, '[role=radio]'); roving(motionRow, '[role=radio]');
  // the engine of a 3D picture: two named options with plain notes and the server's time estimates (ctx.engineInfo(slide id))
  const engRow = h('div', { class: 'pl-engs', role: 'radiogroup', 'aria-label': 'how the 3D picture is made' });
  roving(engRow, '[role=radio]');
  const engBox = h('div', { class: 'pl-engbox' }, engRow);
  const threeBox = h('div', { class: 'pl-3d' }, h('div', { class: 'pl-inl' }, h('p', { class: 'pl-lab' }, 'how detailed?'), detailRow),
    h('p', { class: 'pl-lab' }, 'how does it move?'), motionRow, engBox);
  const phrase = h('input', { class: 'pl-phrase', type: 'text', maxlength: '160', placeholder: 'what the picture shows, in a few words', 'aria-label': 'what the picture shows' });
  phrase.addEventListener('change', () => { s.visual.phrase = phrase.value.trim(); change(); });
  const fixPop = h('div', { class: 'pl-fix', hidden: true, role: 'dialog', 'aria-label': 'why this is greyed out' });

  const say2 = t => { tell(t, mainRow); };
  function setMain(id) {
    if (!picked) { picked = true; if (s.visual.main === id) { sfx('select'); paintVisual(); return; } }
    if (s.visual.main === id) return;
    const dropped = s.visual.companions.filter(c => clashReason(id, c));
    s.visual = fixVisual({ ...s.visual, main: id });
    sfx('select');
    if (dropped.length) say2(`switched to ${mainOf(id).label}. left out: ${dropped.map(c => (COMPANIONS[compHome(c)].find(x => x.id === c) || {}).label).join(', ')} (they only fit ${mainOf(compHome(dropped[0])).name}).`);
    paintVisual(); change();
  }
  function openFix(item, grey, anchor) {
    sfx('pop');
    const swap = h('button', { type: 'button', class: 'pl-fix-b pl-ink', 'data-nosfx': '' }, `swap: make ${item.label} the main picture`);
    const own = h('button', { type: 'button', class: 'pl-fix-b', 'data-nosfx': '' }, `put ${item.label} on its own slide`);
    const close = h('button', { type: 'button', class: 'pl-fix-x', 'aria-label': 'close', html: '×' });
    fixPop.replaceChildren(...[close, h('p', { class: 'pl-fix-t' }, grey), swap, ctx.onOwnSlide ? own : null].filter(Boolean));
    fixPop.hidden = false;
    if (fixClose) fixClose();
    const closeFix = () => { fixPop.hidden = true; if (fixClose) { fixClose(); fixClose = null; } };
    fixClose = openDialog(fixPop, { onEsc: closeFix });
    const hostR = fixPop.parentElement.getBoundingClientRect(), r = anchor.getBoundingClientRect(), k = hostR.width / fixPop.parentElement.offsetWidth || 1;
    fixPop.style.left = Math.max(0, Math.min((r.left - hostR.left) / k, fixPop.parentElement.offsetWidth - 400)) + 'px';
    fixPop.style.top = ((r.bottom - hostR.top) / k + 8 + fixPop.parentElement.scrollTop) + 'px';     // the picture panel may be scrolled
    close.addEventListener('click', closeFix);
    swap.addEventListener('click', () => { closeFix(); setMain(item.id); });
    own.addEventListener('click', () => { closeFix(); sfx('launch'); ctx.onOwnSlide(item.id); });
  }
  const engInfo = () => (ctx.engineInfo ? ctx.engineInfo(s.id) : null);
  const engNow = () => { const i = engInfo(); return i ? effEngine(s.visual, i.look, i.available, i.bakes) : null; };
  function paintEngines() {
    const i = engInfo(), v = s.visual;
    engBox.hidden = !i || v.main !== '3d';
    if (engBox.hidden) { engRow.replaceChildren(); return; }
    const now = engNow(), kind = v.motion === 'still' ? 'still' : 'animation', notes = engineNotes(kind, i.est);
    engRow.replaceChildren(...['blender', 'threejs'].map(id => {
      const E = ENGINE[id], on = now === id, grey = id === 'blender' && !i.available ? 'blender isn’t installed on this computer yet. repair lumi from the loading screen to add it.' : '';
      const b = h('button', { type: 'button', class: 'pl-eng' + (on ? ' on' : '') + (grey ? ' is-grey' : ''), role: 'radio', 'aria-checked': on ? 'true' : 'false',
        'data-eng': id, 'data-nosfx': '', 'data-cursor-label': grey ? 'why?' : 'pick' },
        h('span', { class: 'pl-eng-t' }, h('b', {}, E.name), h('span', { class: 'pl-eng-tool' }, ` · ${E.tool}`)),
        h('span', { class: 'pl-eng-n', title: grey || notes[id] }, grey || ((on && !v.engine ? 'suggested · ' : '') + notes[id])));
      const q = h('span', { class: 'pl-chip-q', role: 'button', tabindex: '0', 'aria-label': `what is ${E.name}?`, html: ICON.q });
      q.addEventListener('click', e => { e.stopPropagation(); sfx('pop'); tell(`${E.name}: ${E.why}`); });
      q.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); q.click(); } });
      b.append(q);
      b.addEventListener('click', () => {
        if (grey) { sfx('error'); tell(grey); return; }
        if (s.visual.engine === id && engNow() === id) return;
        s.visual.engine = id; sfx('select'); paintVisual(); change(false);
      });
      return b;
    }));
    syncTab(engRow, '[role=radio]');
  }
  function paintVisual() {
    const v = s.visual;
    const a = document.activeElement, row = [mainRow, detailRow, motionRow, engRow].find(r => r.contains(a));
    const refocus = row && a.matches('[role=radio]') ? { parent: row, n: [...row.children].indexOf(a) } : null;   // the chips are rebuilt: keep the keyboard where it was
    mainRow.replaceChildren(...MAINS.map(m => chip(m, v.main === m.id, { radio: true, onPick: () => setMain(m.id) })));
    const own = COMPANIONS[v.main] || [];
    const others = MAINS.filter(m => m.id !== v.main);
    // handlers read s.visual when tapped: a poll that brings the same plan replaces s (set()), so a captured object would be stale
    addRow.replaceChildren(...own.map(c => chip(c, v.companions.includes(c.id), { onPick: () => {
      const cv = s.visual, i = cv.companions.indexOf(c.id);
      if (i >= 0) { cv.companions.splice(i, 1); sfx('deselect'); } else { cv.companions.push(c.id); sfx('select'); }
      paintVisual(); change();
    } })));
    alsoRow.replaceChildren(...others.map(m => { const g = clashReason(v.main, m.id); return chip({ ...m, label: `+ ${m.label}` }, false, { grey: g, onPick: b => openFix(m, g, b) }); }));
    threeBox.hidden = v.main !== '3d' || !picked;
    const eng = engNow();
    // replaceChildren() renders a null argument as the text "null" (h() drops it), so the optional engine span is filtered out
    picLine.replaceChildren(...[h('span', { class: 'pl-picline-i', html: ICON[v.main] || ICON.text }), h('span', { class: 'pl-picline-l' }, 'picture: '),
      h('b', {}, mainOf(v.main).label), eng ? h('span', { class: 'pl-picline-x' }, ` · ${ENGINE[eng].name}`) : null,
      h('span', { class: 'pl-picline-e', html: ICON.pen })].filter(Boolean));
    picLine.setAttribute('aria-expanded', picOpen ? 'true' : 'false');
    picLine.classList.toggle('on', picOpen);
    el.classList.toggle('pic-open', picOpen);
    picture.hidden = !picOpen;
    for (const x of extras) x.hidden = !picked;
    pickHint.hidden = picked;
    detailRow.replaceChildren(...DETAILS.map(d => chip(d, v.detail === d.id, { radio: true, onPick: () => { s.visual.detail = d.id; sfx('select'); paintVisual(); change(); } })));
    motionRow.replaceChildren(...MOTIONS.map(d => chip(d, v.motion === d.id, { radio: true, onPick: () => { s.visual.motion = d.id; sfx('select'); paintVisual(); change(); } })));
    paintEngines();
    for (const row of [mainRow, detailRow, motionRow]) syncTab(row, '[role=radio]');
    if (refocus) { const b = refocus.parent.children[refocus.n]; if (b) b.focus({ preventScroll: true }); }
  }

  const words = h('div', { class: 'pl-words' },
    h('label', { class: 'pl-lab' }, 'title'), title,
    h('label', { class: 'pl-lab' }, 'the one point it makes'), point,
    h('p', { class: 'pl-lab' }, 'what goes on the slide'), bullets, addB, picLine);
  const extras = [h('p', { class: 'pl-lab' }, 'add to it'), addRow, alsoRow, h('p', { class: 'pl-lab' }, 'what it shows'), phrase,
    h('p', { class: 'pl-lab' }, 'uses your file'), srcRow];
  const pickHint = h('p', { class: 'pl-pichint' }, 'pick one.');
  const picture = h('div', { class: 'pl-pic', hidden: true },
    h('div', { class: 'pl-pichead' }, h('p', { class: 'pl-lab' }, 'main picture'), doneB), mainRow, pickHint,
    ctx.compact ? why : null, extras.slice(0, 3), threeBox, extras.slice(3), fixPop);
  if (ctx.compact) words.append(meterEl);
  const el = h('div', { class: 'pl-ed' + (ctx.compact ? ' is-compact' : '') }, words, picture);

  // F-18: a repaint never happens under the person's hands. Same words -> nothing is touched; a focused text box keeps
  // what is typed in it; a focused chip / file picker waits until focus leaves (then the newest version is painted).
  const sig = x => JSON.stringify([x.title, x.point, x.bullets, x.sources, x.visual, x.status, x.words, engInfo()]);
  let pendingNext = null;
  function set(next, { keepFocus = true } = {}) {
    const focused = keepFocus && el.contains(document.activeElement) ? document.activeElement : null;
    const ns = clone(next);
    ns.visual = fixVisual(ns.visual || {});
    ns.bullets = Array.isArray(ns.bullets) ? ns.bullets : [];
    ns.sources = Array.isArray(ns.sources) ? ns.sources : [];
    if (focused === title) ns.title = title.value;
    if (focused === point) ns.point = point.value;
    if (focused === phrase) ns.visual.phrase = phrase.value;
    const inBullets = !!focused && bullets.contains(focused);
    if (inBullets) ns.bullets = s.bullets;
    if (keepFocus && sig(ns) === sig(s)) { s = { ...ns }; pendingNext = null; return; }
    if (focused && !inBullets && focused !== title && focused !== point && focused !== phrase) { pendingNext = next; return; }
    pendingNext = null;
    s = ns;
    if (focused !== title) title.value = s.title || '';
    if (focused !== point) point.value = s.point || '';
    if (focused !== phrase) phrase.value = s.visual.phrase || '';
    if (!inBullets) paintBullets();
    paintSources(); paintVisual(); meter();
  }
  set(s, { keepFocus: false });
  el.addEventListener('focusout', () => setTimeout(() => { if (pendingNext && !el.contains(document.activeElement)) { const n = pendingNext; pendingNext = null; set(n); } }, 0));
  return { el, set, meter: meterEl, note: why, destroy() { clearTimeout(whyT); if (fixClose) fixClose(false); }, get slide() { return clone(s); }, focusTitle: () => title.focus({ preventScroll: true }) };
}

// ---------------------------------------------------------------- what this deck costs (section 6)
// Two things, in plain words, and never money and never the machine's own units: how long the deck takes to make, and how much
// of today's claude allowance is left. The allowance is only ever as fresh as the last time claude was working, so it
// carries an honest "as of" stamp - and when lumi has no trustworthy reading at all, the whole line is left out rather
// than guessed at (the server sends cost.allowance = null for that).
const hoursWords = s => {
  if (!(s > 0)) return '';
  const m = Math.round(s / 60);
  if (m < 2) return 'about a minute';
  if (m < 50) return `about ${m} minutes`;
  const q = Math.round(m / 15) / 4;                       // to the nearest quarter hour, said the way a person says it
  if (q <= 1) return 'about an hour';
  if (q === 1.25 || q === 1.5) return 'about an hour and a half';
  const w = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  const hh = Math.round(q), half = Math.abs(q - Math.floor(q) - 0.5) < 0.13 ? Math.floor(q) : 0;
  if (half && w[half]) return `about ${w[half]} and a half hours`;
  return `about ${w[hh] || hh} hours`;
};
const SHARE = [[0.04, 'almost none'], [0.16, 'about a tenth'], [0.3, 'about a quarter'], [0.42, 'about a third'],
  [0.58, 'about half'], [0.72, 'about two thirds'], [0.88, 'about three quarters'], [2, 'nearly all']];
// exported so the look step says a saving in exactly the words this page says an allowance in - never money, never machine units
export const shareWords = f => (SHARE.find(x => f < x[0]) || SHARE[SHARE.length - 1])[1];
const clockOf = sec => { const d = new Date(sec * 1000); return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(/\s+/g, ' '); };
// -> [{ text, warn }] lines, or [] when there is nothing honest to say
export function costLines(cost) {
  const b = (cost && cost.build) || null, a = (cost && cost.allowance) || null, out = [];
  const build = b && b.seconds > 0 ? hoursWords(b.seconds) : '';
  if (build) out.push({ text: `${build} to make this deck` + (b.rendered ? `, because ${b.rendered === 1 ? 'one slide gets' : `${b.rendered} slides get`} a photo-real picture, made with blender` : ''), warn: false });
  if (!a || !isFinite(a.pct)) return out;                 // missing or stale: the time stands on its own
  const left = Math.max(0, Math.min(1, 1 - a.pct / 100));
  const stamp = clockOf(a.capturedAt);
  out.push({ text: `${shareWords(left)} of your claude allowance is left today${stamp ? ` · as of ${stamp}` : ''}`, warn: false });
  // over budget: say so plainly and change NOTHING. the person decides which slide to make simpler.
  const secsLeft = a.resetsAt ? a.resetsAt - Date.now() / 1000 : 0;
  if (build && secsLeft > 0 && b.seconds > secsLeft) {
    out.push({ text: `this deck needs ${build}, and your allowance refills ${clockOf(a.resetsAt) ? `at ${clockOf(a.resetsAt)}` : 'later today'}. you can still start it - it carries on afterwards - or make a slide or two simpler first.`, warn: true });
  }
  return out;
}

// ---------------------------------------------------------------- the page
// The slide list pages itself to the room it actually has. It used to be a flat 10, or 9 when a question was open,
// which assumed a page that started at a fixed y and a question strip exactly 84 px tall - neither is true now that
// both bands grow with their content, and a tall strip pushed the last row off the bottom of the stage.
const PER_PAGE_TALL = 10, ROW_H = 56, ROW_GAP = 6, LIST_FOOT = 56, PAGE_BOTTOM = 866;
export function mountPlan(el, { deckId = null, audio, setMode, onStarted, onBuild, onHome } = {}) {
  const sfx = n => { try { audio && audio.sfx && audio.sfx(n); } catch (e) { /* optional */ } };
  let alive = true, pay = null, plan = null, sel = null, page = 0, pollT = 0, saveT = 0, files = [], lastSeq = 0, noticeSeq = -1;
  let dirty = new Set(), pendingSave = false, editor = null, editorFor = null, view = '', snappedFor = null;
  // F-18 / F-12: what was last painted (so a poll that changes nothing repaints nothing), edits not yet sent, the last poll payload
  let lastRaw = '', stripSig = '', stripStale = false, listSig = '', cardSig = '', badgeFor = null, badgeSig = '', idle = 0, offlineView = false;
  const unsaved = new Set(), undoStack = [];
  let modalRel = null, addRel = null, badgeRel = null, undoT = 0;
  const dragState = { id: null };

  const homeB = h('button', { type: 'button', class: 'ed-home pl-home', 'data-cursor-label': 'library' }, h('span', { html: ICON.back }), 'my decks');
  const costEl = h('div', { class: 'pl-cost', hidden: true, role: 'status' });
  const head = h('div', { class: 'pl-head' }, h('h1', { class: 'pl-h' }, 'plan your deck'), h('p', { class: 'pl-sub' }, ''), costEl);
  const buildB = h('button', { type: 'button', class: 'pl-build', 'data-nosfx': '', 'data-cursor-label': 'build' }, h('span', {}, 'build my deck'), h('span', { html: ICON.right }));
  const strip = h('div', { class: 'pl-strip', 'aria-label': 'questions about the whole deck' });
  const list = h('div', { class: 'pl-list', role: 'listbox', 'aria-label': 'your slides' });
  const pgPrev = h('button', { type: 'button', class: 'pg', 'aria-label': 'earlier slides', html: ICON.up });
  const pgNext = h('button', { type: 'button', class: 'pg', 'aria-label': 'later slides', html: ICON.down });
  const pgLabel = h('span', { class: 'pl-pg' });
  const addSlideB = h('button', { type: 'button', class: 'pl-addslide', 'data-cursor-label': 'add' }, h('span', { html: ICON.plus }), 'add a slide');
  const addPop = h('div', { class: 'pl-addpop', hidden: true, role: 'dialog', 'aria-label': 'add a slide' });
  const listCol = h('div', { class: 'pl-listcol' }, list, h('div', { class: 'pl-listfoot' }, addSlideB, h('span', { class: 'pl-gap' }), pgPrev, pgLabel, pgNext), addPop);
  const cardHead = h('div', { class: 'pl-chead' });
  const cardBody = h('div', { class: 'pl-cbody' });
  const shim = h('div', { class: 'pl-shim', hidden: true }, h('span', { class: 'pl-shim-t' }, 'claude is updating this slide…'));
  const badgePop = h('div', { class: 'pl-badgepop', hidden: true, role: 'dialog', 'aria-label': 'a question about this slide' });
  const card = h('div', { class: 'pl-card' }, cardHead, cardBody, shim, badgePop);
  const main = h('div', { class: 'pl-main' }, strip, listCol, card);
  const intro = h('div', { class: 'pl-intro' });
  const ivHost = h('div', { class: 'pl-ivhost', hidden: true });                  // the interview's own centred scene
  const thHost = h('div', { class: 'pl-thhost', hidden: true });                  // the theme, its own step after the interview
  const toast = h('p', { class: 'pl-toast', role: 'status' });
  const undoB = h('button', { type: 'button', class: 'pl-undo', hidden: true, 'data-cursor-label': 'undo', 'data-nosfx': '' });
  const modal = h('div', { class: 'pl-modal', hidden: true });
  el.replaceChildren(homeB, head, buildB, main, intro, ivHost, thHost, toast, undoB, modal);

  // ---- the two bands that grow: the header (the cost lines come and go, and the over-budget one is two lines long) and
  // the question strip (a question with four long answers is three rows, not one). Both used to be fixed numbers in the
  // css, so the strip was drawn straight over "plan your deck" and over the cost it was meant to sit under. Measured
  // here instead, in stage px: the stage is a scaled 1600x900, so a box's own offsetHeight is already stage px.
  const BAND_GAP = 16;
  let perPageWas = 0;
  function remeasure() {
    const top = Math.max(160, Math.round(head.offsetTop + head.offsetHeight + BAND_GAP));
    el.style.setProperty('--pl-main-top', `${Math.min(top, PAGE_BOTTOM - 200)}px`);
    el.style.setProperty('--pl-strip-h', `${strip.hidden ? 0 : Math.round(strip.offsetHeight)}px`);
    // fewer rows fit under a taller strip; the list repaints rather than running off the bottom of the stage
    const per = perPage();
    if (per !== perPageWas && plan) { perPageWas = per; paintList(true); }
  }
  // one observer for both; a question arriving, a cost line changing or a font loading all land here
  const bandObs = typeof ResizeObserver === 'function' ? new ResizeObserver(() => remeasure()) : null;
  if (bandObs) { bandObs.observe(head); bandObs.observe(strip); }
  remeasure();

  // F-06: the "ready to build?" dialog takes focus, traps Tab, hides the page behind it and gives focus back
  const openModal = node => { if (modalRel) modalRel(false); modal.replaceChildren(node); modal.hidden = false; modalRel = openDialog(node, { host: modal, onEsc: closeModal }); };
  function closeModal() { modal.hidden = true; if (modalRel) { modalRel(); modalRel = null; } }
  function closeAdd() { addPop.hidden = true; if (addRel) { addRel(); addRel = null; } }
  function closeBadge() { badgePop.hidden = true; badgeFor = null; if (badgeRel) { badgeRel(); badgeRel = null; } }
  // W-06: every structural change (move, duplicate, remove, add, own slide) can be undone, one step at a time
  function pushUndo(label) {
    undoStack.push({ label, slides: clone(plan.slides), sel });
    if (undoStack.length > 12) undoStack.shift();
    showUndo();
  }
  function showUndo() {
    const u = undoStack[undoStack.length - 1];
    clearTimeout(undoT);
    if (!u) { undoB.hidden = true; return; }
    undoB.textContent = `undo: ${u.label}`; undoB.hidden = false;
    undoT = setTimeout(() => { undoB.hidden = true; }, 10000);
  }
  function undo() {
    const u = undoStack.pop();
    if (!u || !plan) return;
    plan.slides = u.slides.map(x => { const c = { ...x }; if (c.status === 'queued' || c.status === 'replanning') delete c.status; return c; });
    sel = u.sel && idx(u.sel) >= 0 ? u.sel : (slides()[0] || {}).id || null;
    for (const x of plan.slides) unsaved.add(x.id);
    pendingSave = true; sfx('back'); say(`undone: ${u.label}.`);
    showUndo(); paintHead(); paintStrip(true); paintList(true); paintCard(true); flushNow();
  }
  undoB.addEventListener('click', undo);

  let toastT = 0;
  const say = (t, bad) => { toast.textContent = t; toast.classList.toggle('bad', !!bad); toast.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('show'), 4200); };
  homeB.addEventListener('click', () => { sfx('back'); onHome && onHome(); });

  // ---------------------------------------------------------------- intro: start planning
  // There is only one way to make a deck now: the interview, then the look, then the plan. The old "skip, i'm in a
  // hurry" button is gone (interview plan section 9) - it built a whole deck from answers nobody had checked. This
  // screen is what a deck made before that change still lands on when it has never been planned.
  function showIntro() {
    view = 'intro';
    setMode && setMode('home');
    main.hidden = true; buildB.hidden = true; head.hidden = true; intro.hidden = false; ivHost.hidden = true; thHost.hidden = true;
    const planB = h('button', { type: 'button', class: 'pl-big pl-ink pl-big-s1', 'data-nosfx': '', 'data-cursor-label': 'plan' },
      h('span', { class: 'pl-big-i', html: ICON.spark }), h('span', { class: 'pl-big-t' }, h('span', { class: 'pl-big-h' }, 'plan my slides')));
    intro.replaceChildren(h('span', { class: 'badge' }, 'plan your deck'), h('h1', { class: 'q pl-intro-h' }, 'shall we plan the slides?'), h('div', { class: 'pl-bigs' }, planB));
    planB.addEventListener('click', async () => {
      planB.disabled = true; sfx('launch');
      const r = await api.plan.start(deckId || undefined);
      if (!alive) return;
      if (!r || r.ok === false) {
        planB.disabled = false; sfx('error');
        say(r && r.error === 'busy' ? 'claude is still busy with another deck. try again when it’s done.' : r && r.error === 'cli-missing' ? 'claude isn’t installed on this computer yet.' : 'claude couldn’t start. try again in a moment.', true);
        return;
      }
      deckId = r.deckId;
      onStarted && onStarted(deckId);
      refresh();
    });
  }

  // ---------------------------------------------------------------- the look: its own step, after the interview
  // The interview is forbidden to ask about appearance (it asks only what costs time or changes meaning), and the form
  // that used to ask is gone, so the look is asked here - once, on its own, right before planning.
  let thScene = null, thLoading = false, thLook = null, thQual = null, thQuality = null;
  function showTheme(p) {
    if (view === 'theme') return;
    view = 'theme';
    setMode && setMode('home');
    main.hidden = true; buildB.hidden = true; head.hidden = true; intro.hidden = true; ivHost.hidden = true; thHost.hidden = false;
    thLook = p.look || null;
    thQuality = (p.qualityView && p.qualityView.quality) || p.quality || (p.qualityOptions && p.qualityOptions.default) || null;
    const qualEl = h('div', { class: 'th-qual' });
    const listEl = h('div', { class: 'th-list' });
    const illus = h('div', { class: 'th-illus' }, h('div', { class: 'illus-slot' }));
    const goB = h('button', { type: 'button', class: 'pl-big pl-ink pl-big-s1', 'data-nosfx': '', 'data-cursor-label': 'plan' },
      h('span', { class: 'pl-big-t' }, h('span', { class: 'pl-big-h' }, 'plan my slides')));
    // The quality choice is NOT in the left column any more. Lumi stands at the bottom of that column, and whatever sat
    // under her - the model and effort ticks, and then the "plan my slides" button - could not be seen at all. She is
    // Part A's and must not move, so the controls take the empty band under the look preview instead, where there is room
    // to read them. (.th-qual is placed by plan.css; it is a sibling of .th-left now, not a child of it.)
    thHost.replaceChildren(h('div', { class: 'th' },
      h('div', { class: 'th-left' }, h('span', { class: 'badge' }, 'the look'), h('h1', { class: 'th-h' }, 'pick a look'),
        h('p', { class: 'th-lead' }, 'hover a look to see real slides.'),
        h('div', { class: 'pl-bigs' }, goB),
        // The real Lumi (the knitted character from the loading screen), cropped by the bottom of the column.
        // Not the flat cartoon: this screen is full of someone else's slides, so the one thing that is ours
        // should be the thing people recognise from launch.
        h('img', { class: 'th-lumi', src: '/assets/lumi-cutout.png', alt: '', 'aria-hidden': 'true' })),
      qualEl, illus, listEl));
    if (!thLoading) {
      thLoading = true;
      import('./looks.js').then(m => {
        if (!alive || view !== 'theme' || !m || !m.mountLooks) return;
        thScene = m.mountLooks(listEl, illus.firstChild, { audio,
          getState: () => ({ look: { theme: thLook } }),
          setKey: (k, v) => { if (k === 'look.theme') thLook = v; } });
      }, e => { console.warn('[aura] looks.js is not available', e); }).finally(() => { thLoading = false; });
      // the quality choice lives beside the look because this is the last screen before claude starts spending the allowance
      import('./quality.js').then(m => {
        if (!alive || view !== 'theme' || !m || !m.mountQuality || !p.qualityOptions) return;
        thQual = m.mountQuality(qualEl, { value: thQuality, options: p.qualityOptions, sfx, onChange: v => { thQuality = v; } });
      }, e => { console.warn('[aura] quality.js is not available', e); });
    }
    goB.addEventListener('click', async () => {
      goB.disabled = true; sfx('launch');
      const r = await api.decks.patch(deckId, thQuality ? { look: thLook || 'Claude chooses', quality: thQuality }
        : { look: thLook || 'Claude chooses' });
      if (!alive) return;
      if (!r || r.ok === false) {
        goB.disabled = false; sfx('error');
        say(r && r.reason ? r.reason : 'lumi couldn’t save that look. try again in a moment.', true);
        return;
      }
      const s = await api.plan.start(deckId);
      if (!alive) return;
      if (!s || s.ok === false) {
        goB.disabled = false; sfx('error');
        say(s && s.error === 'busy' ? 'claude is still busy with another deck. try again when it’s done.' : s && s.error === 'cli-missing' ? 'claude isn’t installed on this computer yet.' : 'claude couldn’t start. try again in a moment.', true);
        return;
      }
      dropTheme();
      onStarted && onStarted(deckId);
      refresh();
    });
  }
  function dropTheme() {
    if (thScene) { try { thScene.destroy(); } catch (e) { /* fine */ } thScene = null; }
    if (thQual) { try { thQual.destroy(); } catch (e) { /* fine */ } thQual = null; }
    thHost.replaceChildren();
  }

  // ---------------------------------------------------------------- planning (claude reads the files once)
  function showPlanning(p) {
    if (view !== 'planning') {
      view = 'planning';
      setMode && setMode('home');
      main.hidden = true; buildB.hidden = true; head.hidden = false; intro.hidden = false; ivHost.hidden = true; thHost.hidden = true;
      const stopB = h('button', { type: 'button', class: 'pl-soft', 'data-cursor-label': 'stop' }, 'stop');
      let armed = 0;
      stopB.addEventListener('click', async () => {
        if (!armed) { stopB.textContent = 'tap again to stop'; armed = later(() => { armed = 0; stopB.textContent = 'stop'; }, 3000); return; }
        clearTimeout(armed); stopB.disabled = true; await api.claude.stop(); refresh();
      });
      intro.replaceChildren(h('div', { class: 'pl-wait' }, h('div', { class: 'pl-wait-cards', 'aria-hidden': 'true' }, Array.from({ length: 5 }, (_, i) => h('i', { style: `--i:${i}` }))),
        h('h2', { class: 'pl-wait-h' }, 'lumi is reading'), h('p', { class: 'pl-wait-p' }, 'this takes a minute or two.'), stopB));
    }
    head.querySelector('.pl-sub').textContent = p.waiting ? 'claude has a question for you' : 'planning…';
  }
  // ---------------------------------------------------------------- the interview (before any plan exists)
  // Loaded only when a deck is actually in it, so an older deck never pays for the module. It gets the whole page to
  // itself: head, slide list and build button are all hidden, because there is nothing to plan yet.
  let ivScene = null, ivLoading = null, ivPending = null;
  async function showInterview(p) {
    if (view !== 'interview') {
      view = 'interview';
      setMode && setMode('home');
      main.hidden = true; buildB.hidden = true; head.hidden = true; intro.hidden = true; ivHost.hidden = false; thHost.hidden = true;
    }
    if (!ivScene) {
      if (ivLoading) { ivPending = p; return; }
      ivLoading = import('./interview.js').then(m => {
        if (!alive) return;
        ivScene = m.interviewScene(ivHost, { sfx,
          onAsk: async t => { const r = await api.interview.answer(deckId, t); if (r && r.ok === false) say('claude couldn’t take that answer. try again in a moment.', true); refresh(); },
          onStart: async () => { const r = await api.interview.start(deckId); if (r && r.ok === false) say('claude couldn’t start. is it busy with another deck?', true); refresh(); },
          onRetry: async () => { const r = await api.interview.start(deckId); if (r && r.ok === false) say('claude couldn’t start. try again in a moment.', true); refresh(); } });
        ivScene.update(ivPending || p);
        ivPending = null;
      }, e => { console.warn('[aura] interview.js is not available', e); });
      ivPending = p;
      return;
    }
    ivScene.update(p);
  }
  function showError(p) {
    view = 'error';
    setMode && setMode('home');
    main.hidden = true; buildB.hidden = true; head.hidden = false; intro.hidden = false; ivHost.hidden = true; thHost.hidden = true;
    const again = h('button', { type: 'button', class: 'pl-big pl-ink pl-big-s1', 'data-nosfx': '' }, h('span', { class: 'pl-big-t' }, h('span', { class: 'pl-big-h' }, 'try planning again')));
    intro.replaceChildren(h('div', { class: 'pl-wait' }, h('h2', { class: 'pl-wait-h' }, 'the plan didn’t come through'),
      h('p', { class: 'pl-wait-p' }, (p.planError || 'something went wrong.').toLowerCase()),
      h('p', { class: 'pl-wait-p' }, 'your answers are kept. try again to pick up where it stopped.'),
      h('div', { class: 'pl-bigs' }, again)));
    again.addEventListener('click', async () => { again.disabled = true; sfx('launch'); const r = await api.plan.start(deckId); if (r && r.ok === false) { again.disabled = false; say('claude couldn’t start. try again in a moment.', true); } refresh(); });
  }

  // ---------------------------------------------------------------- the plan
  const slides = () => (plan && plan.slides) || [];
  const idx = id => slides().findIndex(s => s.id === id);
  const busy = () => !!(pay && (pay.running || (pay.queued && pay.queued.length)));
  // Answers typed so far but not sent yet (a question's button only moves to the next one; the last one sends them all).
  // A doubt with `when="q1=2"` is a variant: it is live only while the answer to q1 (sent, or picked here) matches.
  const drafts = new Map(), stacks = new Map();
  const draftOf = d => drafts.get(d.id) || null;
  const selOf = d => { const dr = draftOf(d); return dr && dr.picks && dr.picks.length ? dr.picks : d.answer ? String(d.answer).split(' | ') : d.default || []; };
  function liveDoubts() {
    const all = (plan && plan.doubts) || [], ans = {}, out = [];
    for (const d of all) {
      const key = d.key || d.id;
      if (d.when && ans[key] && !d.answer) continue;                                   // the question already has its variant
      if (d.when && !d.answer && !whenMatches(parseWhen(d.when), ans)) continue;
      ans[key] = { selected: selOf(d), options: d.options }; out.push(d);
    }
    return out;
  }
  const openDoubts = (sid = null) => liveDoubts().filter(d => !d.answer && (sid ? d.slide === sid : d.scope === 'deck'));
  const stackOf = key => { let st = stacks.get(key); if (!st) stacks.set(key, st = { at: 0, reached: 0 }); return st; };
  function perPage() {
    const room = list.clientHeight || (PAGE_BOTTOM - 160 - (openDoubts().length ? 100 : 0) - LIST_FOOT);
    return Math.max(4, Math.min(PER_PAGE_TALL, Math.floor((room + ROW_GAP) / (ROW_H + ROW_GAP))));
  }

  function showPlan() {
    if (view !== 'plan') {
      view = 'plan';
      setMode && setMode('work');
      intro.hidden = true; main.hidden = false; head.hidden = false; buildB.hidden = false; ivHost.hidden = true; thHost.hidden = true;
    }
    if (!sel || idx(sel) < 0) sel = slides()[0] ? slides()[0].id : null;
    paintHead(); paintStrip(); paintList(); paintCard(); refreshBadge();
  }
  function paintHead() {
    const n = slides().length, q = liveDoubts().filter(d => !d.answer).length;
    const sub = busy() ? 'claude is updating the plan…' : q ? `${n} slides · ${q} question${q > 1 ? 's' : ''} for you` : `${n} slides · ✓ all clear`;
    head.querySelector('.pl-sub').textContent = sub;
    head.querySelector('.pl-sub').classList.toggle('is-busy', busy());
    paintCost();
    buildB.disabled = busy() || !n;
    buildB.title = busy() ? 'wait until claude has updated the plan' : '';
  }
  let costSig = '';
  function paintCost() {
    const lines = costLines(pay && pay.cost);
    const sig = JSON.stringify(lines);
    if (sig === costSig) return;
    costSig = sig;
    costEl.hidden = !lines.length;
    costEl.replaceChildren(...lines.map(l => h('p', { class: 'pl-costl' + (l.warn ? ' is-warn' : '') }, l.text)));
    remeasure();                                        // the header just got taller or shorter; the page starts under it
  }
  function paintStrip(force = false) {
    const ds = openDoubts();
    main.classList.toggle('has-strip', !!ds.length);
    strip.hidden = !ds.length;
    if (!ds.length) { if (stripSig) strip.replaceChildren(); stripSig = ''; remeasure(); return; }
    const st = stackOf('deck');
    st.at = Math.min(st.at, ds.length - 1); st.reached = Math.min(Math.max(st.reached, st.at), ds.length - 1);
    // F-18: the question card is rebuilt only when a question really changed, and never while its text box has focus
    // (the typed words and the picked option are kept in `drafts` either way)
    const sig = JSON.stringify([ds.map(q => [q.id, q.question, q.options, q.answer, q.multi, q.default]), st.at, st.reached]);
    if (!force && sig === stripSig) return;
    if (!force && /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '') && strip.contains(document.activeElement)) { stripStale = true; return; }
    stripSig = sig; stripStale = false;
    const d = ds[st.at], last = st.at === ds.length - 1;
    const go = n => { st.at = n; sfx('slide'); paintStrip(true); };
    const nav = ds.length > 1 ? h('span', { class: 'pl-strip-nav' },
      h('button', { type: 'button', class: 'pg', 'aria-label': 'previous question', html: ICON.left, disabled: st.at === 0 || null, onclick: () => go(st.at - 1) }),
      h('span', { class: 'pl-strip-n' }, `${st.at + 1} of ${ds.length}`),
      h('button', { type: 'button', class: 'pg', 'aria-label': 'next question', html: ICON.rright, disabled: st.at >= st.reached || null, onclick: () => go(st.at + 1) })) : null;
    strip.replaceChildren(h('span', { class: 'pl-strip-t' }, h('span', { html: ICON.q }), 'whole deck'),
      doubtCard(d, { sfx, compact: true, label: ds.length === 1 ? 'use this' : last ? 'continue' : 'next question', draft: draftOf(d),
        onDraft: (a, o) => drafts.set(d.id, { picks: a, other: o }), onAnswer: (a, o) => step('deck', ds, a, o) }), ...(nav ? [nav] : []));
    remeasure();                                        // a longer question makes the strip taller; the slides move down
  }
  // a question's button: keep the answer, go to the next one; on the last, send them all in order
  async function step(key, ds, picks, other) {
    const st = stackOf(key), d = ds[st.at];
    drafts.set(d.id, { picks, other });
    if (st.at < ds.length - 1) {
      st.at++; st.reached = Math.max(st.reached, st.at);
      if (key === 'deck') paintStrip(true); else openBadge(key, true);
      return true;
    }
    stacks.delete(key);
    for (const x of ds) {
      const dr = draftOf(x) || { picks: x.default || [], other: '' };
      if (!(await answer(x, dr.picks, dr.other))) return false;
      drafts.delete(x.id);
    }
    return true;
  }
  strip.addEventListener('focusout', () => setTimeout(() => { if (stripStale && !strip.contains(document.activeElement)) paintStrip(); }, 0));
  function rowStatus(s) {
    if (s.status === 'queued' || s.status === 'replanning' || (pay && pay.queued && pay.queued.includes(s.id))) return h('span', { class: 'pl-st is-busy', title: 'claude is updating it' }, h('i'), h('i'), h('i'));
    if (openDoubts(s.id).length) return h('span', { class: 'pl-st is-q', title: 'claude has a question' }, '?');
    if (s.status === 'clear') return h('span', { class: 'pl-st is-ok', title: 'all clear', html: ICON.tick });
    return null;
  }
  function paintList(force = false) {
    const all = slides(), per = perPage(), pages = Math.max(1, Math.ceil(all.length / per));
    // follow the selected slide only when the selection changes, so paging (buttons or a drag) is not undone
    if (sel !== snappedFor && sel && idx(sel) >= 0) { page = Math.floor(idx(sel) / per); snappedFor = sel; }
    page = Math.min(Math.max(0, page), pages - 1);
    const flash = new Set(plan && plan.lastChange && plan.lastChange.seq > lastSeq ? plan.lastChange.flash || [] : []);
    const sig = JSON.stringify([page, per, pages, all.length, sel, dragState.id, all.slice(page * per, page * per + per).map(x =>
      [x.id, x.title, x.status, (x.visual || {}).main, openDoubts(x.id).length, flash.has(x.id), !!(pay && pay.queued && pay.queued.includes(x.id))])]);
    if (!force && sig === listSig) return;
    listSig = sig;
    const heldId = list.contains(document.activeElement) && document.activeElement.dataset ? document.activeElement.dataset.id : null;
    list.replaceChildren(...all.slice(page * per, page * per + per).map(s => {
      const i = idx(s.id);
      const row = h('div', { class: 'pl-row' + (s.id === sel ? ' on' : '') + (s.status === 'replanning' ? ' is-shim' : '') + (flash.has(s.id) ? ' is-flash' : '') + (s.id === dragState.id ? ' is-drag' : ''),
        role: 'option', 'aria-selected': s.id === sel ? 'true' : 'false', tabindex: s.id === sel ? '0' : '-1', draggable: 'true', 'data-id': s.id, 'data-cursor-label': 'open' },
        h('span', { class: 'pl-grip', html: ICON.grip, 'aria-hidden': 'true' }), h('span', { class: 'pl-n' }, String(i + 1)),
        h('span', { class: 'pl-rt' }, s.title || (s.status ? 'claude is suggesting a slide…' : 'untitled slide')),
        h('span', { class: 'pl-ri', html: ICON[(s.visual || {}).main] || ICON.text, title: mainOf((s.visual || {}).main).label }), rowStatus(s));
      row.addEventListener('click', () => select(s.id));
      row.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(s.id); }
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); move(s.id, e.key === 'ArrowUp' ? -1 : 1); }
      });
      row.addEventListener('dragstart', e => { dragState.id = s.id; row.classList.add('is-drag'); try { e.dataTransfer.setData('text/plain', s.id); e.dataTransfer.effectAllowed = 'move'; } catch (x) { /* ok */ } });
      row.addEventListener('dragend', endDrag);
      row.addEventListener('dragover', e => { if (!dragState.id || dragState.id === s.id) return; e.preventDefault(); list.querySelectorAll('.is-over').forEach(x => x.classList.remove('is-over')); row.classList.add('is-over'); });
      row.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); const from = dragState.id; endDrag(); if (from && from !== s.id) moveTo(from, idx(s.id)); });
      return row;
    }));
    if (!list.querySelector('[tabindex="0"]') && list.firstChild) list.firstChild.tabIndex = 0;    // one tab stop, arrows move inside
    if (heldId) { const r = [...list.children].find(x => x.dataset.id === heldId); if (r) r.focus({ preventScroll: true }); }
    if (flash.size && plan.lastChange) later(() => { lastSeq = Math.max(lastSeq, plan.lastChange.seq); }, 50);
    pgLabel.textContent = pages > 1 ? `${page + 1} / ${pages}` : '';
    pgPrev.hidden = pgNext.hidden = pages <= 1;
    pgPrev.disabled = page === 0; pgNext.disabled = page >= pages - 1;
  }
  pgPrev.addEventListener('click', () => { page--; sfx('slide'); paintList(true); });
  pgNext.addEventListener('click', () => { page++; sfx('slide'); paintList(true); });
  roving(list, '.pl-row', { select: false, orientation: 'vertical' });
  // drag across pages: holding a dragged slide near the top or bottom edge of the list (or over the page arrows)
  // flips the page after a short pause; dropping on empty space puts it last on the page shown.
  let flipT = 0, flipDir = 0;
  function endDrag() {
    dragState.id = null; clearTimeout(flipT); flipDir = 0;
    list.querySelectorAll('.is-drag,.is-over').forEach(x => x.classList.remove('is-drag', 'is-over'));
    listCol.classList.remove('is-flip-up', 'is-flip-down');
    listSig = '';
  }
  function wantFlip(dir) {
    const pages = Math.max(1, Math.ceil(slides().length / perPage()));
    if (!dragState.id || !dir || (dir < 0 && page === 0) || (dir > 0 && page >= pages - 1)) { dir = 0; }
    listCol.classList.toggle('is-flip-up', dir < 0); listCol.classList.toggle('is-flip-down', dir > 0);
    if (dir === flipDir) return;
    flipDir = dir; clearTimeout(flipT);
    if (dir) flipT = setTimeout(function flip() {
      if (!dragState.id || !flipDir) return;
      page += flipDir; sfx('slide'); paintList(true);
      const pg = Math.max(1, Math.ceil(slides().length / perPage()));
      if ((flipDir < 0 && page > 0) || (flipDir > 0 && page < pg - 1)) flipT = setTimeout(flip, 900); else wantFlip(0);
    }, 650);
  }
  listCol.addEventListener('dragover', e => {
    if (!dragState.id) return;
    e.preventDefault();
    const r = list.getBoundingClientRect(), k = r.height / (list.offsetHeight || 1), edge = 44 * k;
    const overBtn = e.target.closest && e.target.closest('.pg');
    wantFlip(overBtn === pgPrev || e.clientY < r.top + edge ? -1 : overBtn === pgNext || e.clientY > r.bottom - edge ? 1 : 0);
  });
  listCol.addEventListener('dragleave', e => { if (!listCol.contains(e.relatedTarget)) wantFlip(0); });
  listCol.addEventListener('drop', e => {
    if (!dragState.id) return;
    e.preventDefault();
    const from = dragState.id, last = Math.min(slides().length - 1, page * perPage() + perPage() - 1);
    endDrag();
    moveTo(from, idx(from) < last ? last : Math.min(last, slides().length - 1));
  });

  // the engine chips need: is Blender here, the look (Bold Blue auto-picks it for still 3D), the server's estimates for this slide
  const engineInfo = sid => pay && pay.blender ? { available: !!pay.blender.available, bakes: !!pay.blender.bakes, look: pay.look, est: (pay.blender.estimates || {})[sid] || null } : null;
  function paintCard(force = false) {
    const s = slides().find(x => x.id === sel);
    if (badgeFor && (!s || badgeFor !== s.id)) closeBadge();
    if (!s) { cardSig = ''; cardHead.replaceChildren(); cardBody.replaceChildren(h('p', { class: 'pl-empty' }, 'no slides yet. add one on the left.')); editor = editorFor = null; shim.hidden = true; return; }
    const i = idx(s.id), n = slides().length;
    const q = openDoubts(s.id);
    // F-18: the card (header buttons + editor) is rebuilt only when this slide, its position or its questions changed
    const sig = JSON.stringify([s.id, i, n, s.title, s.point, s.bullets, s.sources, s.visual, s.status, q.map(x => x.id), pay ? pay.wordCap : 25, files.length, engineInfo(s.id)]);
    if (!force && sig === cardSig && editor && editorFor === s.id) return;
    cardSig = sig;
    const ctx = { cap: pay ? pay.wordCap : 25, files, sfx, onChange: (ns, { replan }) => edited(ns, replan), onOwnSlide: m => ownSlide(s.id, m), engineInfo };
    const act = (icon, label, fn, dis) => { const b = h('button', { type: 'button', class: 'pl-act', 'aria-label': label, title: label, html: ICON[icon], disabled: dis || null, 'data-cursor-label': label.split(' ')[0] }); b.addEventListener('click', fn); return b; };
    const qBadge = q.length ? h('button', { type: 'button', class: 'pl-qbadge', 'data-nosfx': '', 'data-cursor-label': 'answer' }, h('span', { html: ICON.q }), q.length > 1 ? `${q.length} questions` : '1 question') : null;
    if (qBadge) qBadge.addEventListener('click', () => openBadge(s.id));
    const status = s.status === 'replanning' || s.status === 'queued' ? h('span', { class: 'pl-cst is-busy' }, 'updating…')
      : s.status === 'clear' && !q.length ? h('span', { class: 'pl-cst is-ok' }, h('span', { html: ICON.tick }), 'all clear') : null;
    let rmArm = 0;
    const rm = act('bin', 'remove this slide', () => {
      if (!rmArm) { rm.classList.add('is-armed'); rm.title = 'tap again to remove'; say('tap the bin again to remove this slide.'); rmArm = later(() => { rmArm = 0; rm.classList.remove('is-armed'); }, 3000); return; }
      clearTimeout(rmArm); remove(s.id);
    }, n <= 1);
    if (force && editor && editorFor === s.id && cardBody.contains(document.activeElement) === false) { editor.destroy(); editor = null; }
    if (!(editor && editorFor === s.id)) { if (editor) editor.destroy(); editor = slideEditor(s, ctx); editorFor = s.id; cardBody.replaceChildren(editor.el); }
    else editor.set(s);
    cardHead.replaceChildren(...[h('span', { class: 'pl-cpos' }, `slide ${i + 1} of ${n}`), status, qBadge, editor.meter, editor.note, h('span', { class: 'pl-gap' }),
      act('up', 'move up', () => move(s.id, -1), i === 0), act('down', 'move down', () => move(s.id, 1), i === n - 1),
      act('copy', 'duplicate this slide', () => duplicate(s.id)), rm].filter(Boolean));
    shim.hidden = !(s.status === 'replanning' || s.status === 'queued');
    shim.querySelector('.pl-shim-t').textContent = s.status === 'queued' ? 'waiting for claude…' : (s.title ? 'claude is updating this slide…' : 'claude is suggesting a slide…');
  }
  function openBadge(sid, keep = false) {
    const q = openDoubts(sid);
    if (!q.length) return;
    if (!keep) sfx('pop');
    const st = stackOf(sid);
    st.at = Math.min(st.at, q.length - 1); st.reached = Math.min(Math.max(st.reached, st.at), q.length - 1);
    const d = q[st.at], last = st.at === q.length - 1;
    const close = h('button', { type: 'button', class: 'pl-fix-x', 'aria-label': 'close', html: '×' });
    close.addEventListener('click', closeBadge);
    const go = n => { st.at = n; sfx('slide'); openBadge(sid, true); };
    const nav = q.length > 1 ? h('div', { class: 'pl-strip-nav pl-badge-nav' },
      h('button', { type: 'button', class: 'pg', 'aria-label': 'previous question', html: ICON.left, disabled: st.at === 0 || null, onclick: () => go(st.at - 1) }),
      h('span', { class: 'pl-strip-n' }, `${st.at + 1} of ${q.length}`),
      h('button', { type: 'button', class: 'pg', 'aria-label': 'next question', html: ICON.rright, disabled: st.at >= st.reached || null, onclick: () => go(st.at + 1) })) : null;
    badgePop.replaceChildren(...[close, nav, doubtCard(d, { sfx, label: q.length === 1 ? 'use this' : last ? 'continue' : 'next question', draft: draftOf(d),
      onDraft: (a, o) => drafts.set(d.id, { picks: a, other: o }), onAnswer: (a, o) => step(sid, q, a, o) })].filter(Boolean));
    const was = !badgePop.hidden;
    badgePop.hidden = false; badgeFor = sid;
    badgeSig = JSON.stringify(q.map(x => [x.id, x.question, x.options, x.answer]));
    if (!was) badgeRel = openDialog(badgePop, { onEsc: closeBadge });
  }
  // a poll that brings a new question for the open popover repaints it, unless a text box in it has focus; a popover
  // whose questions were all answered closes itself
  function refreshBadge() {
    if (badgePop.hidden || !badgeFor) return;
    const q = openDoubts(badgeFor);
    if (!q.length) { closeBadge(); return; }
    const sig = JSON.stringify(q.map(x => [x.id, x.question, x.options, x.answer]));
    if (sig !== badgeSig && !badgePop.contains(document.activeElement)) openBadge(badgeFor, true);
  }
  function select(id) {
    if (sel === id) return;
    flushNow();
    sel = id; sfx('slide');
    paintList(true); paintCard(true);
  }

  // ---------------------------------------------------------------- edits -> save (+ quick re-plan of that slide)
  function edited(ns, replan) {
    const i = idx(ns.id);
    if (i < 0) return;
    plan.slides[i] = { ...plan.slides[i], ...ns };
    if (replan) dirty.add(ns.id);
    unsaved.add(ns.id);                               // F-12: even an edit that asks for no re-plan (a file attached) must survive the next poll
    pendingSave = true;
    paintList(); paintHead();
    clearTimeout(saveT); saveT = setTimeout(flushNow, 1100);
  }
  async function flushNow(extraReplan = []) {
    clearTimeout(saveT);
    if (!pendingSave && !extraReplan.length) return;
    pendingSave = false;
    const replan = [...new Set([...dirty, ...extraReplan])];
    const sent = new Set(unsaved);
    dirty = new Set(); unsaved.clear();
    for (const id of replan) { const s = plan.slides.find(x => x.id === id); if (s) s.status = 'queued'; }
    paintList(); if (replan.includes(sel)) paintCard();
    const r = await api.plan.save(deckId, plan, replan);
    if (!alive) return;
    if (r && r.ok) { take(r); return; }
    if (r && r.error === 'offline') {                 // F-19: the server is not there: keep what was typed and try again, never throw it away
      pendingSave = true; replan.forEach(id => dirty.add(id)); sent.forEach(id => unsaved.add(id));
      clearTimeout(saveT); saveT = setTimeout(flushNow, 3000);
      return;
    }
    sfx('error');
    say(r && r.reason ? r.reason : 'couldn’t save that change. try again?', true);
    refresh();
  }
  function newId() { const taken = new Set(slides().map(s => s.id)); let n = taken.size + 1; while (taken.has('s' + n)) n++; return 's' + n; }
  function move(id, d) { const i = idx(id); if (i + d < 0 || i + d >= slides().length) return; moveTo(id, i + d); }
  function moveTo(id, to) {
    const i = idx(id); if (i < 0 || i === to) return;
    pushUndo('moved a slide');
    const [s] = plan.slides.splice(i, 1); plan.slides.splice(to, 0, s);
    unsaved.add(id);
    sfx('slide'); sel = id; pendingSave = true; paintList(true); paintCard(true); flushNow();
  }
  function duplicate(id) {
    const i = idx(id), copy = clone(plan.slides[i]);
    pushUndo('duplicated a slide');
    copy.id = newId(); delete copy.status; delete copy.built;
    plan.slides.splice(i + 1, 0, copy); sel = copy.id; unsaved.add(copy.id); sfx('pop'); pendingSave = true; paintList(true); paintCard(true); flushNow();
  }
  function remove(id) {
    const i = idx(id);
    pushUndo('removed a slide');
    plan.slides.splice(i, 1);
    sel = (plan.slides[i] || plan.slides[i - 1] || {}).id || null;
    sfx('deselect'); pendingSave = true; paintList(true); paintCard(true); paintStrip(true); flushNow();
  }
  function ownSlide(fromId, m) {
    const i = idx(fromId), from = plan.slides[i];
    const s = { id: newId(), title: `${from.title || 'more'}: ${mainOf(m).label}`, point: '', bullets: [], sources: [...(from.sources || [])],
      visual: fixVisual({ main: m, companions: [], phrase: '' }) };
    pushUndo('added a slide');
    plan.slides.splice(i + 1, 0, s); sel = s.id; unsaved.add(s.id); pendingSave = true;
    say(`added a slide after slide ${i + 1}. claude is filling it in.`);
    paintList(true); paintCard(true); flushNow([s.id]);
  }
  addSlideB.addEventListener('click', () => {
    sfx('pop');
    const blank = h('button', { type: 'button', class: 'pl-fix-b', 'data-nosfx': '' }, h('span', { html: ICON.plus }), 'a blank slide');
    const sug = h('button', { type: 'button', class: 'pl-fix-b pl-ink', 'data-nosfx': '' }, h('span', { html: ICON.spark }), 'claude, suggest one here');
    const close = h('button', { type: 'button', class: 'pl-fix-x', 'aria-label': 'close', html: '×' });
    const at = sel ? idx(sel) + 1 : slides().length;
    addPop.replaceChildren(close, h('p', { class: 'pl-fix-t' }, `add a slide after slide ${at}`), sug, blank);
    if (addRel) addRel(false);
    addPop.hidden = false;
    addRel = openDialog(addPop, { onEsc: closeAdd });
    close.addEventListener('click', closeAdd);
    blank.addEventListener('click', () => {
      closeAdd();
      const s = { id: newId(), title: '', point: '', bullets: [], sources: [], visual: fixVisual({ main: 'text' }) };
      pushUndo('added a slide');
      plan.slides.splice(at, 0, s); sel = s.id; unsaved.add(s.id); pendingSave = true; sfx('select');
      paintList(true); paintCard(true); flushNow(); setTimeout(() => editor && editor.focusTitle(), 80);
    });
    sug.addEventListener('click', async () => {
      closeAdd(); sfx('launch');
      await flushNow();
      const r = await api.plan.suggest(deckId, sel || (slides()[slides().length - 1] || {}).id);
      if (!alive) return;
      if (r && r.ok) { sel = r.newId || sel; take(r); } else { sfx('error'); say(r && r.reason ? r.reason : 'claude couldn’t suggest one right now.', true); }
    });
  });
  async function answer(d, picks, other) {
    sfx('next');
    const r = await api.plan.answer(deckId, d.id, d.multi ? picks : picks[0], other);
    if (!alive) return false;
    if (r && r.ok) { sfx('success'); closeBadge(); take(r); return true; }
    sfx('error'); say('couldn’t send that answer. try again?', true); return false;
  }

  // ---------------------------------------------------------------- build
  buildB.addEventListener('click', () => {
    if (buildB.disabled) return;
    sfx('pop');
    const go = h('button', { type: 'button', class: 'pl-big pl-ink pl-big-s1', 'data-nosfx': '' }, h('span', { class: 'pl-big-t' }, h('span', { class: 'pl-big-h' }, 'yes, build slide 1')));
    const no = h('button', { type: 'button', class: 'pl-big pl-big-s1', 'data-nosfx': '' }, h('span', { class: 'pl-big-t' }, h('span', { class: 'pl-big-h' }, 'keep planning')));
    const open = openDoubts().length + slides().reduce((n, s) => n + openDoubts(s.id).length, 0);
    openModal(h('div', { class: 'pl-dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'start building' },
      h('h2', { class: 'pl-dlg-h' }, 'ready to build?'),
      h('p', { class: 'pl-dlg-p' }, 'claude builds slide 1 and shows it to you. the rest stay editable.' +
        (open ? ` ${open} question${open > 1 ? 's are' : ' is'} still open: claude will use the suggested answer${open > 1 ? 's' : ''}.` : '')),
      h('div', { class: 'pl-dlg-b' }, no, go)));
    no.addEventListener('click', closeModal);
    go.addEventListener('click', async () => {
      go.disabled = no.disabled = true; sfx('launch');
      await flushNow();
      const r = await api.build.next(deckId);
      if (!alive) return;
      closeModal();
      if (r && r.ok) { onBuild && onBuild(deckId); return; }
      sfx('error'); say(r && r.reason ? r.reason : r && r.error === 'busy' ? 'claude is still busy. try again in a moment.' : 'couldn’t start building. try again?', true);
      refresh();
    });
  });

  // ---------------------------------------------------------------- data
  function take(r, { poll = false } = {}) {
    offlineView = false;
    if (r.plan && plan && (r.plan.seq | 0) < (plan.seq | 0)) { schedule(); return; }            // F-12: an older answer that arrived late is dropped
    if (poll) {                                                                               // F-18: a poll that brings nothing new repaints nothing
      const raw = JSON.stringify(r);
      if (raw === lastRaw && !pendingSave && !unsaved.size && view !== 'opening') { idle++; schedule(); return; }
      lastRaw = raw;
    } else lastRaw = '';
    idle = 0;
    if (r && 'running' in r) setClaude({ running: !!r.running, deckId });                      // F-10: one shared answer to "is claude running"
    pay = r;
    const local = plan;
    plan = clone(r.plan || { slides: [], doubts: [] });
    const lc = plan.lastChange;                       // a line of claude's last answer that lumi could not read: say so once
    if (noticeSeq < 0) noticeSeq = lc && !r.running && r.planState !== 'planning' ? lc.seq : 0;
    if (lc && lc.seq > noticeSeq) { noticeSeq = lc.seq; if (lc.notices && lc.notices.length) say(lc.notices.join(' '), true); }
    if (local && (pendingSave || unsaved.size)) {     // keep edits that are not saved yet (any edit, not only the ones that ask for a re-plan)
      for (const s of local.slides) { const i = idx(s.id); if (i >= 0 && (dirty.has(s.id) || unsaved.has(s.id))) plan.slides[i] = { ...plan.slides[i], ...s }; }
      if (pendingSave) { const have = new Set(plan.slides.map(x => x.id)); plan.slides = [...plan.slides, ...local.slides.filter(x => !have.has(x.id) && unsaved.has(x.id))]; }
    }
    route();
  }
  function route() {
    if (!pay) return;
    if (pay.buildStarted) { onBuild && onBuild(deckId); return; }
    const st = pay.planState;
    // The interview comes BEFORE any plan, and only then. A deck that already has slides, or is planning, or was made
    // before the interview existed (its state reads 'ready') never sees this screen, so a published v0.5.3 deck opens
    // exactly where it always did.
    const ivLive = pay.interviewState === 'asking' || pay.interviewState === 'waiting' || pay.interviewState === 'error';
    // The look comes after the interview and before the plan, and only for a deck that has never been asked: a deck made
    // by the old form carries its answer in its brief and the server reports it as already chosen, so it never stops here.
    const themeDue = pay.interviewState === 'ready' && !pay.lookUser && !slides().length && st === 'none';
    if (view === 'theme' && !themeDue) dropTheme();
    if (st === 'planning' || (pay.running && pay.runKind === 'plan')) showPlanning(pay);
    else if (ivLive && !slides().length && st === 'none') showInterview(pay);
    else if (themeDue) showTheme(pay);
    else if (st === 'error' && !slides().length) showError(pay);
    else if (slides().length || st === 'ready') showPlan();
    else showIntro();
    schedule();
  }
  // F-19: opening a plan never leaves a blank page: a short "opening" card first, an honest one when the server is
  // unreachable (the shell's "can't reach lumi" bar also shows) or the deck is gone
  function showOpening(r) {
    if (pay) return;
    view = 'opening'; offlineView = true;
    setMode && setMode('home');
    main.hidden = true; buildB.hidden = true; head.hidden = true; intro.hidden = false; ivHost.hidden = true; thHost.hidden = true;
    const gone = r && r.status === 404;
    const retry = h('button', { type: 'button', class: 'pl-big pl-big-s1', 'data-nosfx': '' }, h('span', { class: 'pl-big-t' }, h('span', { class: 'pl-big-h' }, gone ? 'back to my decks' : 'try again now')));
    retry.addEventListener('click', () => { if (gone) { onHome && onHome(); return; } retry.disabled = true; idle = 0; refresh().then(() => { retry.disabled = false; }); });
    intro.replaceChildren(h('div', { class: 'pl-wait' }, h('h2', { class: 'pl-wait-h' }, gone ? 'this deck isn’t in your library any more' : r && r.error === 'offline' ? 'can’t reach lumi. trying again…' : 'opening your plan…'),
      h('p', { class: 'pl-wait-p' }, gone ? 'it may have been moved to the bin.' : r && r.error === 'offline' ? 'is lumi’s window still open? your plan is safe on this computer.' : 'one moment.'), h('div', { class: 'pl-bigs' }, retry)));
  }
  async function refresh() {
    if (!deckId) return;
    const r = await api.plan.get(deckId);
    if (!alive) return;
    if (r && r.ok) take(r, { poll: true });
    else { idle++; showOpening(r); schedule(pace(r && r.status === 404 ? 8000 : 3000, idle, { max: 10000 })); }
  }
  function schedule(ms) {
    clearTimeout(pollT);
    if (!alive || !deckId) return;
    const base = busy() || view === 'planning' ? 1000 : 4000;
    pollT = setTimeout(refresh, ms || pace(base, idle, { max: base === 1000 ? 3000 : 10000, hidden: 5000 }));
  }
  const onDocDragEnd = e => { if (dragState.id && (e.type !== 'mousemove' || !e.buttons)) endDrag(); };
  document.addEventListener('dragend', onDocDragEnd);
  document.addEventListener('mousemove', onDocDragEnd);
  const onKey = e => {
    if (e.key === 'Escape') { closeAdd(); closeBadge(); closeModal(); card.querySelectorAll('.pl-fix').forEach(f => { f.hidden = true; }); }
    else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z' && undoStack.length && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '')) { e.preventDefault(); undo(); }
  };
  addEventListener('keydown', onKey);

  api.files(deckId || undefined).then(g => {
    if (!alive || !Array.isArray(g)) return;
    files = g.flatMap(x => x.files || []);
    if (view === 'plan') { editor = editorFor = null; paintCard(true); }
  });
  if (deckId) { head.hidden = true; main.hidden = true; buildB.hidden = true; refresh(); } else showIntro();

  return {
    destroy() {
      alive = false; clearTimeout(pollT); clearTimeout(saveT); clearTimeout(toastT); clearTimeout(undoT); clearLater();
      if (bandObs) bandObs.disconnect();
      if (modalRel) modalRel(false); if (addRel) addRel(false); if (badgeRel) badgeRel(false);
      if (editor) editor.destroy();
      if (ivScene) { try { ivScene.destroy(); } catch (e) { /* fine */ } ivScene = null; }
      dropTheme();
      if (pendingSave && deckId && plan) api.plan.save(deckId, plan, [...dirty]);
      removeEventListener('keydown', onKey);
      document.removeEventListener('dragend', onDocDragEnd);
      document.removeEventListener('mousemove', onDocDragEnd);
      clearTimeout(flipT);
      el.replaceChildren();
    },
  };
}
