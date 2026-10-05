// Claude's markers (contract section 10), shared by the first-build workshop, the editor and the build page.
// THE GRAMMAR lives in engine/rules/markers.json (the server reads that file, engine/aura_markers.py); MARKER_SPEC below is
// its browser copy and tools/form-dev/test_instructions.py fails if the two differ. Both parsers are also run against
// tools/form-dev/marker_cases.json. The prose for Claude is the "App markers" section of the aura-slide SKILL.md.
//   [[aura:choice id="q1" question="..." options="A|B|C" multi="no" default="B" slide=3]]  -> option buttons + a free-text box
//   [[aura:choice id="q2" when="q1=2" depends="q1" ...]]                                    -> a variant of q2 shown only when q1 was answered 2
//   [[aura:hint slide=3 text="..."]]                                                        -> clickable suggestion chips
// A marker is one whole line; attribute order is free; a value is "quoted" or a bare token. A line that mentions [[aura: but
// cannot be used is reported in `problems` (never dropped silently); the server shows it to the person and logs it.
// `slide` (a 1-based number or a plan id) says which slide a question is about (the window shows that slide's plan).
// `when="q1=<option text or 1-based number>"` (several: "q1=2 & q3=Left|Right") makes a question a VARIANT: several markers may
// share one id, and only the variant whose condition holds for the answers so far is shown; changing an earlier answer swaps
// the variant and clears the answer it had. `depends="q1"` (comma list) resets a question to its default when q1 changes.
// A missing multi/default is fine (single pick, first option pre-selected). There is no cap on the number of questions: the
// card pages through them one at a time.
// Answers go back as a normal reply, one line per question: "q1: B", multi joined with " | ", then "note: <own words>".

export const MARKER_SPEC = {
  stages: ['read', 'plan', 'build', 'check', 'export', 'done'],
  limits: { options: 8, questionChars: 200, optionChars: 60, whenChars: 200 },
  markers: {
    stage: { form: 'value' },
    ask: { required: [], optional: [] },
    done: { required: ['path'], optional: [] },
    choice: { required: ['id', 'question', 'options'], optional: ['multi', 'default', 'slide', 'scope', 'when', 'depends'] },
    hint: { required: ['slide', 'text'], optional: [] },
    plan: { required: [], optional: ['path'] },
    'plan-ok': { required: ['slide'], optional: [] },
    built: { required: ['slide'], optional: [] },
  },
};
const LIM = MARKER_SPEC.limits;
const BODY = '((?:"[^"]*"|[^\\]"])*)';
const LINE = new RegExp('^\\s*\\[\\[aura:([a-z][a-z-]*)' + BODY + '\\]\\]\\s*$');
const INLINE = new RegExp('\\[\\[aura:[a-z][a-z-]*' + BODY + '\\]\\]');
const ATTR = /([a-z]+)\s*=\s*(?:"([^"]*)"|([A-Za-z0-9._-]+))/g;
const ID = /^[A-Za-z0-9-]+$/;
export const MAX_VARIANTS = 48;
const split = v => String(v || '').split('|').map(s => s.trim()).filter(Boolean);

function normaliseChoice(a) {
  const options = split(a.options).map(o => o.slice(0, LIM.optionChars)).slice(0, LIM.options);
  const multi = String(a.multi || '').trim().toLowerCase() === 'yes';
  const defs = split(a.default).map(d => d.slice(0, LIM.optionChars)).filter(d => options.includes(d));
  const def = (multi ? defs : defs.slice(0, 1));
  return { id: String(a.id || '').trim(), question: String(a.question || '').trim().slice(0, LIM.questionChars), options, multi,
    default: def.length ? def : options.slice(0, 1), slide: String(a.slide || '').trim(), scope: String(a.scope || '').trim().toLowerCase(),
    when: String(a.when || '').trim().slice(0, LIM.whenChars), depends: String(a.depends || '').split(/[\s,]+/).filter(d => ID.test(d)) };
}

function build(name, body) {
  const spec = MARKER_SPEC.markers[name];
  if (!spec) return { why: 'unknown' };
  if (spec.form === 'value') {
    const m = /^=\s*([A-Za-z0-9._-]+)\s*$/.exec(body);
    if (!m) return { why: 'bad-attrs' };
    if (!MARKER_SPEC.stages.includes(m[1])) return { why: 'bad-value' };
    return { mk: { name, attrs: { value: m[1] } } };
  }
  const attrs = {}; let x; ATTR.lastIndex = 0;
  while ((x = ATTR.exec(body))) attrs[x[1]] = x[2] !== undefined ? x[2] : x[3];
  if (body.replace(ATTR, '').trim()) return { why: 'bad-attrs' };
  for (const k of spec.required) if (!String(attrs[k] === undefined ? '' : attrs[k]).trim()) return { why: 'missing-' + k };
  const mk = { name, attrs };
  if (name === 'hint' && !(/^\d+$/.test(attrs.slide) && parseInt(attrs.slide, 10) > 0)) return { why: 'bad-value' };
  if (name === 'choice') {
    if (!ID.test(attrs.id.trim())) return { why: 'bad-id' };
    mk.choice = normaliseChoice(attrs);
    if (mk.choice.options.length < 2) return { why: 'few-options' };
  }
  return { mk };
}

// text -> { markers: [{ name, attrs, line, choice? }], problems: [{ line, reason, marker, text }] }   (same as aura_markers.scan)
export function scanMarkers(text) {
  const markers = [], problems = [], seen = new Set();
  String(text || '').split(/\r?\n/).forEach((raw, i) => {
    if (!raw.includes('[[aura:')) return;
    const m = LINE.exec(raw);
    let why, name;
    if (m) {
      const r = build(m[1], m[2]);
      if (r.mk) { r.mk.line = i + 1; markers.push(r.mk); return; }
      why = r.why; name = m[1];
    } else {
      why = INLINE.test(raw) ? 'not-alone' : 'unclosed';
      const nm = /\[\[aura:([a-z][a-z-]*)/.exec(raw); name = nm ? nm[1] : null;
    }
    const t = raw.trim().slice(0, 160), k = why + '\u0000' + t;
    if (seen.has(k)) return;
    seen.add(k); problems.push({ line: i + 1, reason: why, marker: name, text: t });
  });
  return { markers, problems };
}
export const markersOf = (text, name) => scanMarkers(text).markers.filter(m => m.name === name);
export const hasMarker = (text, name) => markersOf(text, name).length > 0;

// "q1=2 & q3=Left|Right" -> [{ id:'q1', vals:['2'] }, { id:'q3', vals:['Left','Right'] }]
export function parseWhen(text) {
  const out = [];
  for (const part of String(text || '').split(/\s*[&;]\s*/)) {
    const m = /^([A-Za-z0-9-]+)\s*=\s*(.+)$/.exec(part.trim());
    if (m) out.push({ id: m[1], vals: m[2].split('|').map(v => v.trim()).filter(Boolean) });
  }
  return out;
}
// conds hold when, for every condition, one of the referenced question's selected options is named (or numbered) in it.
// answers: id -> { selected: [option text], options: [option text] }
export function whenMatches(conds, answers) {
  return (conds || []).every(c => {
    const a = answers[c.id];
    if (!a || !a.selected.length) return false;
    const sel = a.selected.map(x => x.toLowerCase());
    return c.vals.some(v => sel.includes(v.toLowerCase()) || (/^\d+$/.test(v) && sel.includes(String(a.options[parseInt(v, 10) - 1] || '').toLowerCase())));
  });
}

// text -> { choices (cards' questions), hints, problems }
export function parseMarkers(text) {
  const { markers, problems } = scanMarkers(text);
  const choices = [], hints = [];
  for (const mk of markers) {
    if (mk.name === 'choice') {
      const c = mk.choice, key = c.when ? `${c.id}@${c.when}` : c.id;
      if (choices.some(x => x.key === key) || choices.length >= MAX_VARIANTS) continue;
      choices.push({ id: c.id, key, question: c.question, options: c.options, multi: c.multi, defaults: c.default,
        slide: c.slide, scope: c.scope, when: c.when, conds: parseWhen(c.when), depends: c.depends });
    } else if (mk.name === 'hint') {
      hints.push({ slide: parseInt(mk.attrs.slide, 10), text: mk.attrs.text.trim() });
    }
  }
  return { choices, hints, problems };
}

// "q1: Bold Blue" lines -> [{id, answer}] (used to show a sent answer in a friendly way)
export function parseAnswer(text) {
  const out = [], rest = [];
  for (const ln of String(text || '').split(/\r?\n/)) {
    const m = /^([a-z0-9-]+):\s*(.+)$/i.exec(ln.trim());
    if (m && m[1].toLowerCase() === 'note') rest.push(m[2]);
    else if (m && !rest.length) out.push({ id: m[1], answer: m[2] }); else rest.push(ln);
  }
  return { answers: out, text: rest.join('\n').trim() };
}

import { h } from './dom.js';
import { roving, syncTab } from './a11y.js';
let CARD_N = 0;
const TICK = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// A card with one block per question; questions are shown one at a time ("next question"), only the LAST one has the
// submit button, so nothing can be skipped, and Enter never submits (in the free-text box it is just a new line).
// Variants (see the top of the file): the card shows the variant whose `when` holds and re-evaluates on every pick.
// onSend(text) is called with the composed answer. onStep(choice) tells the window which question (and slide) is shown.
// Returns { el, lock(sentText?), compose(extra), pending, choices, setEnabled(on), active() }.
export function choiceCard(choices, { onSend, sfx = () => {}, sendLabel = 'send my answers', freeLabel = 'anything else? (optional)', steps = true, onStep } = {}) {
  const ids = [...new Set(choices.map(c => c.id))];
  const stepped = steps && ids.length > 1;
  const uid = 'chc' + (++CARD_N);
  const touched = new Set();
  const picks = new Map(choices.map(c => [c.key, new Set(c.defaults)]));
  let cur = 0, reached = 0, locked = false, enabled = true, act = [];
  const sigs = new Map();
  const selOf = c => c.options.filter(o => picks.get(c.key).has(o));
  const reset = c => { picks.set(c.key, new Set(c.defaults)); touched.delete(c.key); };

  // which variant of each question is showing now, given the answers above it
  function resolve() {
    const out = [], ans = {};
    for (const id of ids) {
      const cand = choices.filter(c => c.id === id);
      const hit = cand.find(c => c.when && whenMatches(c.conds, ans)) || cand.find(c => !c.when);
      if (!hit) continue;
      out.push(hit); ans[id] = { selected: selOf(hit), options: hit.options };
    }
    return out;
  }
  // after a pick: swap variants, and clear the answers that no longer follow from the ones above
  function settle() {
    let prev = act.map(c => c.key).join('|'), guard = 0;
    for (;;) {
      const nxt = resolve(), nk = nxt.map(c => c.key).join('|');
      for (const c of nxt) if (!act.some(x => x.key === c.key)) reset(c);                  // a variant just appeared: start from its defaults
      const changed = new Set();
      for (const c of nxt) { const sig = selOf(c).join('|'); if (sigs.has(c.id) && sigs.get(c.id) !== sig) changed.add(c.id); sigs.set(c.id, sig); }
      for (const c of nxt) if (c.depends.some(d => changed.has(d)) && !changed.has(c.id)) reset(c);   // depends="q1": refresh when q1 changed
      act = nxt;
      if (nk === prev || ++guard > 6) break;
      prev = nk;
    }
  }
  const free = h('textarea', { class: 'ch-free', rows: '1', maxlength: '4000', placeholder: freeLabel, 'aria-label': 'your own words' });
  const complete = c => picks.get(c.key).size > 0 || !!free.value.trim();

  const blocks = new Map(choices.map(c => {
    const row = h('div', { class: 'ch-opts', role: c.multi ? 'group' : 'radiogroup', 'aria-label': c.question });
    const btns = c.options.map(opt => {
      const b = h('button', { type: 'button', class: 'ch-opt', 'data-nosfx': '', 'data-cursor-label': 'pick' },
        h('span', { class: 'ch-tick' }), h('span', {}, opt));
      b.querySelector('.ch-tick').innerHTML = TICK;
      b.addEventListener('click', () => {
        if (locked || !enabled) return;
        const set = picks.get(c.key);
        if (c.multi) { if (set.has(opt)) { set.delete(opt); sfx('deselect'); } else { set.add(opt); sfx('select'); } }
        else { set.clear(); set.add(opt); sfx('select'); }
        touched.add(c.key); settle(); paint();
      });
      return { b, opt };
    });
    row.append(...btns.map(x => x.b));
    if (!c.multi) roving(row, '[role=radio]');                                  // F-13: arrows move through and pick, one tab stop
    const tag = c.multi ? 'pick any' : 'pick one';
    return [c.key, { c, btns, row, el: h('div', { class: 'ch-q', 'data-q': c.id, id: `${uid}-p-${c.key.replace(/[^A-Za-z0-9_-]/g, '_')}`, ...(stepped ? { role: 'tabpanel' } : {}) },
      h('p', { class: 'ch-qt' }, c.question, h('span', { class: 'ch-tag' }, tag)), row) }];
  }));
  const send = h('button', { type: 'button', class: 'ch-send', 'data-nosfx': '', 'data-cursor-label': 'send' }, sendLabel);
  const nav = stepped ? h('div', { class: 'ch-steps', role: 'tablist', 'aria-label': 'questions' }) : null;
  const back = stepped ? h('button', { type: 'button', class: 'ch-nav', 'data-nosfx': '', onclick: () => go(cur - 1) }, 'back') : null;
  const next = stepped ? h('button', { type: 'button', class: 'ch-nav ch-next', 'data-nosfx': '', onclick: () => { sfx('next'); go(cur + 1); } }, 'next question') : null;
  // While Claude is still working the whole card is switched off (workshop.js: setEnabled(!running)). The suggested
  // answers are already ticked, so without this note the person sees an answer chosen, a dead "next question" and no
  // reason at all - a dead end that reads as a broken app. It reuses the .ch-stepof style, so it needs no new CSS.
  const waitNote = h('span', { class: 'ch-stepof ch-wait', hidden: true }, 'claude is still working - you can answer in a moment');
  const el = h('div', { class: 'ch-card' + (stepped ? ' is-stepped' : '') }, nav, [...blocks.values()].map(b => b.el),
    h('div', { class: 'ch-foot' }, back, free, waitNote, next, send));
  if (stepped) roving(nav, '[role=tab]', { orientation: 'horizontal' });
  function go(i) { cur = Math.max(0, Math.min(act.length - 1, i)); reached = Math.max(reached, cur); paint(); }
  let shown = '';
  function paint() {
    cur = Math.max(0, Math.min(act.length - 1, cur)); reached = Math.min(Math.max(reached, cur), act.length - 1);
    const last = !stepped || cur === act.length - 1, here = act[cur];
    for (const b of blocks.values()) b.el.hidden = !(locked ? act.includes(b.c) : stepped ? b.c === here : act.includes(b.c));
    if (stepped) {
      const hadFocus = nav.contains(document.activeElement);
      const panelId = c => `${uid}-p-${c.key.replace(/[^A-Za-z0-9_-]/g, '_')}`;
      nav.replaceChildren(...act.map((c, i) => {
        const d = h('button', { type: 'button', class: 'ch-step' + (i === cur ? ' cur' : '') + (touched.has(c.key) && i !== cur ? ' done' : ''), role: 'tab', 'data-nosfx': '', title: c.question,
          id: `${uid}-t-${i}`, 'aria-controls': panelId(c), 'aria-selected': i === cur ? 'true' : 'false', onclick: () => go(i) }, String(i + 1));
        d.disabled = locked || i > reached; return d;
      }), h('span', { class: 'ch-stepof' }, `question ${cur + 1} of ${act.length}`));
      syncTab(nav, '[role=tab]');
      if (hadFocus && nav.children[cur]) nav.children[cur].focus({ preventScroll: true });
      for (const b of blocks.values()) { const i = act.indexOf(b.c); if (i >= 0) b.el.setAttribute('aria-labelledby', `${uid}-t-${i}`); }
      back.disabled = locked || cur === 0; back.hidden = cur === 0;
      next.hidden = last; next.disabled = locked || !enabled || !complete(here);
    }
    send.hidden = !last; send.disabled = locked || !enabled || !act.every(complete);
    // The invariant: a card must never show an answer as chosen with every way forward dead and no reason given.
    const stalled = !locked && !enabled;
    el.classList.toggle('is-waiting', stalled);
    waitNote.hidden = !stalled;
    const why = stalled ? 'claude is still working, so answers wait until it stops' : '';
    send.title = why; if (next) next.title = why;
    for (const { c, btns } of blocks.values()) {
      const set = picks.get(c.key);
      for (const { b, opt } of btns) {
        const on = set.has(opt);
        b.classList.toggle('on', on);
        b.setAttribute(c.multi ? 'aria-pressed' : 'aria-checked', on ? 'true' : 'false');
        if (!c.multi) b.setAttribute('role', 'radio');
        b.disabled = locked || !enabled;
      }
      if (!c.multi) syncTab(blocks.get(c.key).row, '[role=radio]');
    }
    free.disabled = locked || !enabled;
    el.classList.toggle('is-locked', locked);
    const sig = here ? here.key : '';
    if (onStep && sig !== shown) { shown = sig; try { onStep(here, cur, act.length); } catch (e) { /* optional */ } }
  }
  function compose(extra = '') {
    const lines = [];
    for (const c of act) { const sel = selOf(c); if (sel.length) lines.push(`${c.id}: ${sel.join(' | ')}`); }
    const own = [free.value.trim(), String(extra || '').trim()].filter(Boolean).join('\n');
    if (own) lines.push(lines.length ? 'note: ' + own.replace(/\n+/g, ' ') : own);   // labelled, so it is never read as part of an answer
    return lines.join('\n');
  }
  send.addEventListener('click', () => { if (!locked && enabled && !send.disabled) { const t = compose(); if (t && onSend) onSend(t); } });
  // Enter is only a new line here: answers leave through the explicit button on the last question
  free.addEventListener('keydown', e => { if (e.key === 'Enter') e.stopPropagation(); });
  free.addEventListener('input', () => { free.style.height = 'auto'; free.style.height = Math.min(free.scrollHeight, 80) + 'px'; paint(); });
  settle(); paint();
  return {
    el, compose, choices,
    get pending() { return !locked; },
    active: () => act.slice(),
    // Lock the card; when the sent text is known, show exactly what was answered.
    lock(sent) {
      if (locked) return;
      if (typeof sent === 'string') {
        for (const a of parseAnswer(sent).answers) {
          const c = act.find(x => x.id === a.id);
          if (!c) continue;
          picks.set(c.key, new Set(a.answer.split('|').map(s => s.trim()).filter(o => c.options.includes(o))));
          settle();
        }
      }
      locked = true; paint();
    },
    setEnabled(on) { if (!locked && enabled !== !!on) { enabled = !!on; paint(); } },
  };
}

export function hintChip(hint, onPick, { showSlide = true } = {}) {
  const b = h('button', { type: 'button', class: 'hint-chip', 'data-cursor-label': 'use it', title: hint.text },
    showSlide ? h('span', { class: 'hint-n' }, String(hint.slide)) : null, h('span', { class: 'hint-t' }, hint.text));
  b.addEventListener('click', () => onPick(hint));
  return b;
}

// Gentle defaults for a slide when Claude has not suggested anything for it yet.
export const GENERIC_HINTS = ['make the title shorter', 'make this slide simpler', 'add a picture or diagram', 'add a small animation', 'use bigger text'];
