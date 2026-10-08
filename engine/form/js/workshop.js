// The live Claude screen. Left: stage tracker, elapsed time, stop and the open buttons. Right: a chat with Claude
// (friendly text with [[aura:...]] markers stripped, tool steps as tiny progress lines, replies) plus the sign-in,
// missing-CLI, usage-limit and error states. Events live on the server, so a reload simply replays them from 0.
// mountWorkshop(leftEl, rightEl, { getState, bus, audio, deckId, mode, getSlide, onEdit, onHome, onDone, onHints, onSlide,
//   onTarget(n) (which slide the next message is about; 0: the whole deck),
//   popupHost, slideInfo(ref) -> Promise<{info, thumb}|null>, onAsk(state 'open'|'collapsed'|'none'), hintsOk() -> bool })
//   -> { destroy(), setSlide(), fill(text), hints, running }
// mode 'build' (default): the first build of a deck, with the tracker on the left.
// mode 'edit' (v0.3 editor): no tracker; replies carry the deck id + selected slide; a hint row and a folder button sit
// above/in the box; only this deck's events are shown.
// Both modes show [[aura:choice]] markers as option buttons + a free-text box.
// ONE CONVERSATION PER DECK (owner, 2026-10-08; form_server.ONE_DECK_CONVERSATION). v0.5.2 gave every slide its own Claude
// conversation and the chat showed one thread at a time, picked by a "slide 1 | whole deck" switch in the head. That switch is
// gone: there is one conversation, so there is one log, unfiltered, in order. (It had also quietly broken the chat: it filtered
// events by `conv`, and `conv` is null now, so every slide rendered an EMPTY log on any deck built since the switch.)
//
// What survives is SCOPE, which is a different thing. The server still prefixes a message with '[slide n]' or '[whole deck]'
// (/api/claude/reply), and that prefix is the only thing telling Claude what a message is about. So scope is inferred from the
// slide the person has open, declared only to override that, and shown in every place that could disagree:
//   - the target follows getSlide(); an override lasts until that message is sent, then it goes back to following (a sticky
//     "whole deck" mode is invisible the moment you look away from it, and fails expensively);
//   - it is bound AT SEND TIME, onto the request and onto the sent bubble, so navigating later cannot retarget a message;
//   - Claude's side is tagged too. `say`/`tool` events carry no slide, so a turn's slide is the slide of the `user` event that
//     opened it. When that is not the slide now on screen, the tag becomes a button that goes there.
import * as api from './api.js';
import { pace } from './api.js';
import { emit, setClaude } from './bus.js';
import { announce } from './a11y.js';
import { parseMarkers, parseAnswer, scanMarkers, markersOf, hasMarker, choiceCard, hintChip, GENERIC_HINTS } from './markers.js';
import { ICON, MAINS, DETAILS, MOTIONS } from './plan.js';

const STAGES = [
  ['ready', 'getting ready', 'waking claude up'], ['read', 'reading', 'reading your brief and files'],
  ['plan', 'planning', 'planning the story, slide by slide'], ['build', 'building', 'building your slides'],
  ['check', 'checking', 'checking every slide'], ['export', 'exporting', 'making the backup copies'],
  ['done', 'done', 'all finished'],
];
const DONE_STAGE = STAGES.length - 1;
const MARK_RE = /\[\[aura:[^\]]*\]\]/g;
const POLL_MS = 700, LOGIN_POLL_MS = 2000;
const CARRY_ON = 'please carry on where you left off.';
const UPLOAD_FOLDER = 'Anything else';

import { h } from './dom.js';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const baseName = p => String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';
const clock = s => { s = Math.max(0, Math.floor(s)); const m = Math.floor(s / 60), x = String(s % 60).padStart(2, '0');
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${x}` : `${m}:${x}`; };

// Minimal, safe markdown: everything is escaped first; then bold, inline code, lists, headings and paragraphs.
function inline(s) {
  return esc(s)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1')
    .replace(/\*\*([^*]+?)\*\*|__([^_]+?)__/g, (m, a, b) => `<strong>${a || b}</strong>`)
    .replace(/`([^`]+)`/g, '<span class="ws-code">$1</span>')
    .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s.,!?;:)]|$)/g, '$1$2');
}
function renderMarkdown(text) {
  const out = [], lines = String(text).replace(/\r/g, '').split('\n');
  let para = [], list = null, fence = null;
  const flushP = () => { if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; };
  const flushL = () => { if (list) out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; };
  for (const raw of lines) {
    if (/^\s*```/.test(raw)) {
      if (fence) { out.push(`<p class="ws-pre">${fence.map(esc).join('<br>')}</p>`); fence = null; } else { flushP(); flushL(); fence = []; }
      continue;
    }
    if (fence) { fence.push(raw); continue; }
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flushP(); flushL(); continue; }
    if ((m = /^\s*[-*•]\s+(.*)$/.exec(line))) { flushP(); if (!list || list.tag !== 'ul') { flushL(); list = { tag: 'ul', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) { flushP(); if (!list || list.tag !== 'ol') { flushL(); list = { tag: 'ol', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = /^\s*#{1,6}\s+(.*)$/.exec(line))) { flushP(); flushL(); out.push(`<p class="ws-h">${inline(m[1])}</p>`); continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushP(); flushL(); continue; }
    flushL(); para.push(line.trim());
  }
  if (fence) out.push(`<p class="ws-pre">${fence.map(esc).join('<br>')}</p>`);
  flushP(); flushL();
  return out.join('');
}
// Markers out, and the fake/dev diagnostics lines ("[fake-argv] ...") too.
const stripMarkers = t => String(t || '').replace(MARK_RE, '').replace(/^\[fake-[a-z]+\].*$/gm, '').replace(/\n{3,}/g, '\n\n').trim();

function helperLine(cmd) {
  const c = String(cmd || '').toLowerCase();
  if (/pdf/.test(c) && /export|print|make/.test(c)) return 'making the pdf backup';
  if (/screenshot|check|lint|rules/.test(c)) return 'checking the slides';
  if (/extract|text|read/.test(c)) return 'reading text from your files';
  if (/pack|bundle|single|inline/.test(c)) return 'packing everything into one file';
  return 'running a helper';
}
export function toolLine(ev) {
  const tool = ev.tool || String(ev.text || '').split(' ')[0];
  const d = ev.detail || '', f = baseName(d);
  switch (tool) {
    case 'Read': return f ? `reading ${f}` : 'reading';
    case 'Write': case 'Edit': case 'MultiEdit': case 'NotebookEdit': return f ? `building ${f}` : 'building';
    case 'Bash': case 'PowerShell': return helperLine(d);
    case 'Glob': case 'Grep': case 'LS': return 'looking through your files';
    case 'TodoWrite': return 'updating the plan';
    case 'Skill': return 'opening the lumi toolkit';
    case 'WebFetch': case 'WebSearch': return 'looking something up';
    case 'Task': case 'Agent': return 'asking a helper';
    default: return 'working on it';
  }
}

// Claude's own mark. This panel IS Claude - it is labelled "claude" and the messages in it are Claude's - so it
// carries Claude's logo, supplied by the owner (2026-10-08) and served from assets/claude-mark.png. What was here
// before was a hand-drawn blob imitating it, which is the kind of stand-in the owner cut across the whole app.
// Lumi's own character is the plush (assets/lumi-mascot.png) and belongs on Lumi's surfaces: the icon, the loading
// screen, the home card, the waiting game. Two marks, two speakers, no imitations of either.
const AVATAR = '<img src="/assets/claude-mark.png" alt="" aria-hidden="true" draggable="false">';
const SEND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V6m-6 6 6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const FOLDER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2.2h7.4a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10.5v5.5M9.3 13.2 12 10.5l2.7 2.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CLIP_X = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ART = {
  cli: '<svg viewBox="0 0 120 90" aria-hidden="true"><rect x="14" y="12" width="92" height="62" rx="10" fill="var(--fur3)"/><rect x="22" y="20" width="76" height="46" rx="5" fill="var(--pill)"/><path d="M32 34l8 6-8 6M46 48h14" fill="none" stroke="var(--ink)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><rect x="48" y="74" width="24" height="8" fill="var(--fur4)"/><rect x="36" y="80" width="48" height="5" rx="2.5" fill="var(--fur5)"/><circle cx="92" cy="22" r="11" fill="var(--orange)"/><path d="M92 16v7M92 27v.5" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/></svg>',
  signin: '<svg viewBox="0 0 120 90" aria-hidden="true"><circle cx="60" cy="44" r="34" fill="var(--fur1)"/><rect x="38" y="40" width="44" height="34" rx="8" fill="var(--fur5)"/><path d="M48 40v-8a12 12 0 0 1 24 0v8" fill="none" stroke="var(--ink)" stroke-width="5" stroke-linecap="round"/><circle cx="60" cy="54" r="5" fill="var(--ink)"/><rect x="58" y="56" width="4" height="9" rx="2" fill="var(--ink)"/><circle cx="96" cy="18" r="4" fill="var(--pink)"/><circle cx="22" cy="26" r="3" fill="var(--orange)"/></svg>',
  start: '<svg viewBox="0 0 120 90" aria-hidden="true"><rect x="20" y="14" width="80" height="54" rx="8" fill="var(--pill)"/><rect x="28" y="24" width="38" height="6" rx="3" fill="var(--ink)"/><rect x="28" y="36" width="56" height="4" rx="2" fill="var(--fur3)"/><rect x="28" y="44" width="46" height="4" rx="2" fill="var(--fur3)"/><circle cx="86" cy="62" r="16" fill="var(--ink)"/><path d="M82 55l10 7-10 7z" fill="var(--pill)"/><circle cx="24" cy="76" r="4" fill="var(--pink)"/></svg>',
};

export function mountWorkshop(leftEl, rightEl, opts = {}) {
  const { bus, audio, deckId = null, mode = 'build', getSlide = () => null, onEdit, onHome, onDone, onHints, onSlide, onTarget = null, popupHost = null, slideInfo = null, onAsk = null, hintsOk = null } = opts;
  const EDIT = mode === 'edit';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sfx = n => { try { audio && audio.sfx && audio.sfx(n); } catch (e) { /* optional */ } };
  const fire = (type, detail) => {
    try { bus && bus.dispatchEvent ? bus.dispatchEvent(new CustomEvent(type, { detail })) : emit(type, detail); } catch (e) { /* optional */ }
  };
  let alive = true, next = 0, base = -1, pollT = 0, loginT = 0, tickT = 0, toastT = 0, lastTick = 0, lastSay = 0;
  let running = false, srvWaiting, session = null, offline = false, sending = false, gate = null, gateDismissed = false;
  let elsewhere = false;         // Claude is busy with a different deck
  let status = null, lastState = '';
  let hints = [];                // latest [[aura:hint]] set for this deck
  let cards = [];                // choice cards, newest last
  let attached = null;           // {name, state:'up'|'ok'|'err', p}
  let deckRec = null;
  let slideIds = [];             // the plan's slide ids, in order: index + 1 is the slide number
  let aim = null;                // the person's override for the next message: {deck:true} | {n} | null (= follow the open slide)
  let turnSlide;                 // the slide this turn of Claude's is about: a number, 0 (whole deck), or undefined (unknown)
  let turnTagged = false;        // this turn's first reply already carries the tag
  let turnTagEl = null;          // that tag, so a question later in the same turn can take it over
  let tags = [];                 // every slide tag on screen, repainted when the person navigates
  let askAim = null;             // the slide the open question is about (read only while a question is open)
  let own = [];                  // this deck's events
  let replayed = false;          // the editor's history has been put on screen once
  let polledBusy = false;        // busy (running or waiting) as the last poll saw it
  let lastSel = null;
  const M = { stage: -1, deck: null, asked: false, ok: null, code: null, t0: 0, tEnd: 0, auth: false, progress: false, stopped: false, failed: false, relaxed: false };

  // ---------------------------------------------------------------- left: tracker + actions (build mode)
  const rows = STAGES.map(([id, label, sub]) => h('li', { class: 'ws-st', 'data-stage': id },
    h('span', { class: 'ws-node', html: CHECK }), h('span', { class: 'ws-st-t' }, h('span', { class: 'ws-st-l' }, label), h('span', { class: 'ws-st-s' }, sub))));
  const track = h('ol', { class: 'ws-track', 'aria-label': 'progress' }, rows);
  const timeTxt = h('span', {}, 'not started yet');
  const timeEl = h('p', { class: 'ws-time' }, h('span', { class: 'ws-clock', 'aria-hidden': 'true' }), timeTxt);
  const stopBtn = h('button', { type: 'button', class: 'ws-btn ws-soft ws-stop', 'data-cursor-label': 'stop' }, h('span', { class: 'ws-sq', 'aria-hidden': 'true' }), h('span', { class: 'lbl' }, 'stop'));
  const editBtn = h('button', { type: 'button', class: 'ws-btn ws-ink ws-open', 'data-cursor-label': 'edit', 'data-nosfx': '' }, h('span', { class: 'lbl' }, 'edit my slides'), h('span', { class: 'ws-arrow', 'aria-hidden': 'true' }, '→'));
  const openBtn = h('button', { type: 'button', class: 'ws-btn ws-soft', 'data-cursor-label': 'present' }, 'present them');
  const folderBtn = h('button', { type: 'button', class: 'ws-btn ws-soft', 'data-cursor-label': 'folder' }, 'open slides folder');
  const againBtn = h('button', { type: 'button', class: 'ws-btn ws-soft', 'data-cursor-label': 'start' }, 'start over');
  const homeLink = h('button', { type: 'button', class: 'ws-link', 'data-cursor-label': 'library' }, 'back to my decks');
  const leftToast = h('p', { class: 'ws-ltoast', role: 'status', 'aria-live': 'polite' });
  const acts = h('div', { class: 'ws-acts' }, stopBtn, editBtn, openBtn, folderBtn, againBtn, homeLink, leftToast);
  const left = h('div', { class: 'ws-left' + (reduced ? ' ws-reduced' : '') }, track, timeEl, acts);
  if (leftEl && !EDIT) leftEl.append(left);

  // ---------------------------------------------------------------- right: chat
  const statusTxt = h('span', { class: 'ws-state' }, 'connecting…');
  // the head says which slide the chat is on, so the header and the strip can never disagree; it is a label, not a control
  const headAim = EDIT ? h('span', { class: 'ws-head-aim', hidden: true }) : null;
  const head = h('div', { class: 'ws-head' }, h('span', { class: 'ws-ava', html: AVATAR }),
    h('span', { class: 'ws-who' }, 'claude'), h('span', { class: 'ws-dot', 'aria-hidden': 'true' }), statusTxt, headAim);
  // F-14: the log is not a live region (it gets a line every second or two for half an hour, and replays its whole history on
  // opening); what a screen reader needs is announced separately: claude starting, asking, finishing (see paint) and its words.
  const log = h('div', { class: 'ws-log', role: 'log', 'aria-live': 'off', 'aria-label': 'what claude is doing', tabindex: '0' });
  const typing = h('div', { class: 'ws-typing', 'aria-label': 'claude is working' }, h('i'), h('i'), h('i'));
  const jump = h('button', { type: 'button', class: 'ws-jump', hidden: true, 'data-cursor-label': 'newest' }, 'new messages ↓');
  const input = h('textarea', { class: 'ws-input', rows: '1', maxlength: '20000', 'aria-label': 'message to claude', placeholder: 'claude is working…', disabled: true });
  const sendBtn = h('button', { type: 'submit', class: 'ws-send', 'aria-label': 'send', html: SEND, disabled: true, 'data-cursor-label': 'send', 'data-nosfx': '' });
  const fileIn = h('input', { type: 'file', hidden: true, 'aria-hidden': 'true', tabindex: '-1', class: 'ws-file' });
  const folderIco = EDIT ? h('button', { type: 'button', class: 'ws-attach', 'aria-label': 'add a file', title: 'add a file', html: FOLDER, 'data-cursor-label': 'add a file', 'data-nosfx': '' }) : null;
  const clip = h('div', { class: 'ws-clip', hidden: true });
  const box = h('form', { class: 'ws-box' + (EDIT ? ' has-attach' : '') }, folderIco, input, sendBtn, fileIn);
  const hintRow = EDIT ? h('div', { class: 'ws-hints', 'aria-label': 'suggestions' }) : null;
  // what the next message is about. It states the inference ("slide 4", because slide 4 is open) and is the way to override it.
  const aimBtn = EDIT ? h('button', { type: 'button', class: 'ws-aim-b', 'aria-haspopup': 'true', 'aria-expanded': 'false',
    'data-cursor-label': 'what about', 'data-nosfx': '' }, h('span', { class: 'ws-aim-t' }, 'this slide'), h('i', { 'aria-hidden': 'true' })) : null;
  const aimMenu = EDIT ? h('div', { class: 'ws-aim-m', role: 'menu', hidden: true }) : null;
  const aimRow = EDIT ? h('div', { class: 'ws-aim', hidden: true }, h('span', { class: 'ws-aim-l' }, 'about'), aimBtn, aimMenu) : null;
  const gateEl = h('div', { class: 'ws-gate', hidden: true });
  const chat = h('div', { class: 'ws' + (EDIT ? ' ws-edit' : '') + (reduced ? ' ws-reduced' : '') }, head, h('div', { class: 'ws-body' }, log, jump, gateEl), hintRow, aimRow, clip, box);
  rightEl && rightEl.append(chat);

  // ---------------------------------------------------------------- chat helpers
  const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 70;
  let live = false;     // false while replaying history (no sounds, no entrance animations)
  function append(node, { force = false } = {}) {
    const stick = force || nearBottom();
    log.insertBefore(node, typing.parentNode === log ? typing : null);
    if (!reduced && live) node.classList.add('ws-in');
    if (!live) node.classList.add('ws-old');
    if (stick) toBottom(); else jump.hidden = false;
    return node;
  }
  function toBottom(smooth = live && !reduced) {
    requestAnimationFrame(() => { if (!alive) return; log.scrollTo({ top: log.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); jump.hidden = true; });
  }
  log.addEventListener('scroll', () => { if (nearBottom()) jump.hidden = true; }, { passive: true });
  jump.addEventListener('click', () => toBottom(true));
  let steps = null;     // the open group of consecutive tool lines
  const closeSteps = () => { steps = null; };
  function stepLine(text, cls = '') {
    if (!steps) {
      const more = h('button', { type: 'button', class: 'ws-more', hidden: true, 'data-nosfx': '' });
      steps = { el: h('div', { class: 'ws-steps' }, more), more, lines: [] };
      more.addEventListener('click', ((g) => () => { g.el.classList.toggle('open'); paintSteps(g); })(steps));
      append(steps.el);
    }
    const ln = h('p', { class: 'ws-step ' + cls }, h('i', { 'aria-hidden': 'true' }), h('span', {}, text));
    steps.lines.push(ln);
    steps.el.append(ln);
    paintSteps(steps, true);
    if (live) { ln.classList.add('ws-in'); if (nearBottom()) toBottom(); }
  }
  // `added`: one line was just appended to a collapsed group, so only the line that fell out of the last three
  // needs hiding (O(1)); a full repaint (O(n)) is only for opening/closing the group.
  function paintSteps(g, added = false) {
    const open = g.el.classList.contains('open'), extra = g.lines.length - 3;
    if (added && !open) { if (extra > 0) g.lines[extra - 1].classList.add('ws-hide'); }
    else g.lines.forEach((l, n) => l.classList.toggle('ws-hide', !open && n < extra));
    g.more.hidden = extra <= 0;
    g.more.textContent = open ? 'show fewer steps' : `${extra} earlier step${extra === 1 ? '' : 's'}`;
  }
  // ---------------------------------------------------------------- which slide a message is about
  // 0 means the whole deck everywhere below; null/undefined means "no slide to show".
  const slideWord = n => (n ? `slide ${n}` : 'whole deck');
  const aimDeck = () => (askN() != null ? false : !!(aim && aim.deck));   // an answer is never a whole-deck message
  // An open question owns the target while it is open: the answer belongs to the slide that was ASKED about, whatever the
  // person has opened since. It cannot be overridden, because there is nowhere else for an answer to go.
  const askN = () => (pendingCard() ? askAim : null);
  const aimN = () => (askN() != null ? askN() : aim ? (aim.deck ? 0 : aim.n) : (getSlide() || 1));
  // The slide number a question card is about: its choices carry the slide's id (slide_ref on the server), or a number.
  function choiceN(cs) {
    for (const c of (cs || [])) {
      if (!c.slide) continue;
      const i = slideIds.indexOf(c.slide);
      if (i >= 0) return i + 1;
      const n = Number(c.slide);
      if (Number.isInteger(n) && n > 0) return n;
    }
    return null;
  }
  // A tag that always tells the truth: plain while it is the slide on screen, a button that goes there while it is not. Every
  // tag is kept so navigating repaints all of them at once - a message must never look like it is about the slide you moved to.
  function slideTag(n, cls = '') {
    const el = h('button', { type: 'button', class: 'ws-slidetag ' + cls, 'data-nosfx': '' });
    const rec = { el, n };
    tags.push(rec);
    el.addEventListener('click', () => {
      if (!rec.n || rec.n === (getSlide() || 1) || !onSlide) return;
      sfx('select');
      try { onSlide(rec.n); } catch (e) { /* optional */ }
    });
    paintTag(rec);
    return el;
  }
  function paintTag(rec) {
    const away = rec.n > 0 && rec.n !== (getSlide() || 1);
    rec.el.replaceChildren(h('span', {}, slideWord(rec.n)));          // replaceChildren is the DOM's, not h(): a null child would read as the word "null"
    if (away) rec.el.append(h('i', { 'aria-hidden': 'true' }, '↗'));
    rec.el.classList.toggle('is-away', away);
    rec.el.disabled = !away;
    rec.el.title = away ? `go to slide ${rec.n}` : '';
    rec.el.setAttribute('aria-label', away ? `go to slide ${rec.n}` : slideWord(rec.n));
  }
  function paintTags() {
    tags = tags.filter(t => t.el.isConnected);
    tags.forEach(paintTag);
  }

  function bubble(html, extraCls = '') {
    closeSteps();
    const bub = h('div', { class: 'ws-bub', html });
    // the first thing Claude says in a turn carries the turn's slide; the rest of the turn would only repeat it
    if (EDIT && turnSlide !== undefined && !turnTagged) { turnTagEl = slideTag(turnSlide, 'ws-tag-c'); bub.prepend(turnTagEl); turnTagged = true; }
    return append(h('div', { class: 'ws-msg ws-claude ' + extraCls }, h('span', { class: 'ws-mini', html: AVATAR }), bub));
  }
  function questionFor(id) {
    for (let i = cards.length - 1; i >= 0; i--) { const c = cards[i].choices.find(x => x.id === id); if (c) return c.question; }
    return null;
  }
  // A user message: answers to choice questions are shown as "question / answer"; a slide tag for editor messages. `n` is the
  // target this message was BOUND to when it was sent (0: the whole deck) and never changes afterwards.
  function userBubble(text, n, extraCls = '') {
    const { answers, text: rest } = parseAnswer(text);
    const known = answers.map(a => ({ a, q: questionFor(a.id) })).filter(x => x.q);
    const kids = [];
    if (n != null) kids.push(slideTag(n, 'ws-tag-u'));
    if (known.length && known.length === answers.length) {
      for (const { a, q } of known) kids.push(h('span', { class: 'ws-ans' }, h('span', { class: 'ws-ans-q' }, q), h('span', {}, a.answer)));
      if (rest) kids.push(h('span', { class: 'ws-ans-rest' }, rest));
    } else kids.push(h('span', { class: 'ws-utext' }, text));
    closeSteps();
    return append(h('div', { class: 'ws-msg ws-user ' + extraCls }, h('div', { class: 'ws-bub' }, kids)), { force: true });
  }
  function note(text, cls = '') { closeSteps(); return append(h('p', { class: 'ws-note ' + cls }, text)); }
  // a note that names its slide: C2's biting case is a question arriving about slide 2 while the person is looking at slide 7
  function noteAim(text, n, cls = 'ws-quiet') {
    closeSteps();
    return append(h('p', { class: 'ws-note ws-note-aim ' + cls }, h('span', {}, text), n == null ? null : slideTag(n, 'ws-tag-n')), { force: true });
  }
  function card(kind, title, text, buttons = []) {
    closeSteps();
    return append(h('div', { class: `ws-card ws-${kind}` }, h('p', { class: 'ws-card-t' }, title), text ? h('p', { class: 'ws-card-x' }, text) : null,
      buttons.length ? h('div', { class: 'ws-card-b' }, buttons) : null), { force: true });
  }
  const btn = (label, fn, cls = 'ws-soft') => h('button', { type: 'button', class: `ws-btn ws-sm ${cls}`, onclick: fn }, label);
  // an open question is a panel docked under the slide preview (popupHost, the build page): the slide stays visible, the
  // panel shows that slide's plan on the left and one question at a time on the right, and it can be folded away
  const popups = [];
  let collapsed = false;
  const tellAsk = () => { if (onAsk) { try { onAsk(popups.length ? (collapsed ? 'collapsed' : 'open') : 'none'); } catch (e) { /* optional */ } } };
  const closePopups = () => {
    const had = popups.some(p => p.contains(document.activeElement));
    while (popups.length) popups.pop().remove();
    collapsed = false; tellAsk();
    if (had && input && input.isConnected) try { input.focus({ preventScroll: true }); } catch (e) { /* gone */ }     // focus goes back, not to <body>
  };
  const fileName = f => String(f || '').split(/[\\/]/).pop();
  function slideCtxEl(info, thumb) {
    if (!info) return h('div', { class: 'qx qx-none' }, h('p', { class: 'qx-point' }, 'the plan for this slide isn’t available.'));
    const v = info.visual || {}, main = MAINS.find(m => m.id === v.main) || MAINS[4];
    const bits = [main.label];
    if (v.main === '3d') { const d = DETAILS.find(x => x.id === v.detail), m = MOTIONS.find(x => x.id === v.motion); if (d) bits.push(d.label); if (m) bits.push(m.label); if (v.engine === 'blender') bits.push('studio render'); }
    const comp = (v.companions || []).join(', ');
    const vis = h('p', { class: 'qx-vis' }, h('span', { class: 'qx-vi', html: ICON[main.id] || ICON.text }), h('span', {}, bits.join(' · ') + (comp ? ` + ${comp}` : '')));
    return h('div', { class: 'qx' },
      h('div', { class: 'qx-top' }, h('span', { class: 'qx-n' }, String(info.n)), h('b', { class: 'qx-title' }, info.title || 'untitled slide')),
      thumb ? h('img', { class: 'qx-thumb', src: thumb, alt: `slide ${info.n}, as built so far` }) : (info.built ? null : h('div', { class: 'qx-nothumb' }, 'not built yet')),
      info.point ? h('p', { class: 'qx-point' }, info.point) : null,
      info.bullets && info.bullets.length ? h('ul', { class: 'qx-b' }, info.bullets.map(b => h('li', {}, b))) : null,
      vis, v.phrase ? h('p', { class: 'qx-ph' }, `“${v.phrase}”`) : null,
      info.sources && info.sources.length ? h('p', { class: 'qx-src' }, h('span', { class: 'qx-vi', html: ICON.file }), h('span', {}, info.sources.map(fileName).join(', '))) : null);
  }
  function popupCard(choices) {
    const ctxBox = h('div', { class: 'ws-pop-ctx' });
    const refs = new Map();
    let shown = null;
    async function showCtx(ref) {
      ref = ref || '';
      shown = ref;
      if (!slideInfo) { ctxBox.hidden = true; return; }
      if (!refs.has(ref)) refs.set(ref, Promise.resolve().then(() => slideInfo(ref)).catch(() => null));
      const got = await refs.get(ref);
      if (!alive || shown !== ref) return;
      ctxBox.replaceChildren(slideCtxEl(got && got.info, got && got.thumb));
      ctxBox.hidden = false;
      if (got && got.later) { const u = await got.later; if (alive && shown === ref && u) ctxBox.replaceChildren(slideCtxEl(got.info, u)); }
    }
    // the slide's plan is fetched once the window is really shown (not for cards a history replay locks a moment later)
    let armed = false, want = '';
    const c = choiceCard(choices, { onSend: t => send(t), sfx, sendLabel: 'continue', freeLabel: 'something else? (optional)', steps: true,
      onStep: ch => { want = (ch && ch.slide) || (choices.find(x => x.slide) || {}).slide || ''; if (armed && want !== shown) showCtx(want); } });
    setTimeout(() => { armed = true; if (alive && c.pending && popups.includes(win)) showCtx(want); }, 0);
    const fold = h('button', { type: 'button', class: 'ws-pop-fold', 'data-nosfx': '', 'aria-expanded': 'true', 'data-cursor-label': 'fold' }, h('span', { class: 'lbl' }, 'hide'), h('i', { 'aria-hidden': 'true' }));
    const bar = h('div', { class: 'ws-pop-bar' }, h('span', { class: 'ws-pop-ava', html: AVATAR }), h('span', { class: 'ws-pop-t' }, 'a question is waiting'), fold);
    const win = h('div', { class: 'ws-pop', role: 'dialog', 'aria-label': 'questions from claude' }, bar,
      h('div', { class: 'ws-pop-main' }, ctxBox, h('div', { class: 'ws-pop-body' }, c.el)));
    fold.addEventListener('click', () => {
      collapsed = !collapsed; sfx(collapsed ? 'deselect' : 'pop');
      win.classList.toggle('is-folded', collapsed);
      fold.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      fold.querySelector('.lbl').textContent = collapsed ? 'show it' : 'hide';
      tellAsk();
    });
    closePopups();
    popupHost.append(win); popups.push(win);
    tellAsk();
    // F-06: the question takes the keyboard (first option of the first question), unless the person is typing somewhere;
    // the options are enabled only once the page learns the run ended (a poll, often over a second away), so keep trying
    // until they are - but never pull focus from somewhere the person has moved it to in the meantime
    let tries = 0;
    const was = document.activeElement;
    const takeFocus = () => {
      if (!alive || !popups.includes(win) || ++tries > 130) return;
      const a = document.activeElement;
      if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
      if (a && a !== was && a !== document.body && !win.contains(a)) return;
      const first = win.querySelector('.ch-q:not([hidden]) .ch-opt:not([disabled])');
      if (first) { try { first.focus({ preventScroll: true }); } catch (e) { /* gone */ } } else setTimeout(takeFocus, 150);
    };
    requestAnimationFrame(takeFocus);
    return c;
  }
  const lockCards = sent => { cards.forEach(c => c.lock(sent)); closePopups(); };
  const pendingCard = () => { const c = cards[cards.length - 1]; return c && c.pending ? c : null; };

  // ---------------------------------------------------------------- events -> model + chat
  function resetModel() {
    Object.assign(M, { stage: 0, deck: null, asked: false, ok: null, code: null, t0: 0, tEnd: 0, auth: false, progress: false, stopped: false, failed: false, relaxed: false });
  }
  function setStage(n) {
    if (n < 0 || n > DONE_STAGE) return;
    if (n > M.stage || M.relaxed) { if (live && n !== M.stage) sfx(n === DONE_STAGE ? 'done' : 'select'); M.stage = n; }
    M.relaxed = false;
  }
  const pendingUser = [];
  function handle(ev) {
    if (!ev || typeof ev !== 'object') return;
    const kind = ev.kind, text = typeof ev.text === 'string' ? ev.text : '';
    if (M.stage < 0) resetModel();
    if (!M.t0 && ev.t) M.t0 = ev.t;
    if (kind !== 'done') M.tEnd = 0;
    switch (kind) {
      case 'status':
        if (ev.code === 'start') {
          if (log.querySelector('.ws-msg, .ws-steps, .ws-card')) note(EDIT ? 'a new build' : 'starting again', 'ws-div');
          resetModel(); M.t0 = ev.t || 0;
          turnSlide = undefined; turnTagged = false; turnTagEl = null;   // a build run, not a chat turn: no one slide to claim
        }
        note(text ? text.replace(/^Claude/, 'claude') : 'claude is getting ready', 'ws-quiet');
        break;
      case 'say': {
        M.progress = true; M.auth = false;
        for (const mk of scanMarkers(text).markers) {          // one grammar (markers.js): a marker counts only as a whole line
          if (mk.name === 'stage') setStage(STAGES.findIndex(s => s[0] === mk.attrs.value));
          else if (mk.name === 'done') { M.deck = mk.attrs.path; setStage(DONE_STAGE); }
          else if (mk.name === 'ask') M.asked = true;
        }
        const clean = stripMarkers(text);
        if (clean) { bubble(renderMarkdown(clean)); if (live && performance.now() - lastSay > 600) { sfx('pop'); lastSay = performance.now(); } }
        const mk = parseMarkers(text);
        if (mk.choices.length) {
          closeSteps();
          cards.forEach(x => x.lock());
          // the question's own slide wins over the turn's: a whole-deck message can still raise a doubt about one slide
          const qn = EDIT ? (choiceN(mk.choices) ?? (turnSlide || null)) : null;
          askAim = qn;
          // one tag per turn, and the question is the thing that has to be answered: it takes the tag off the line above it
          if (qn != null && turnTagEl && qn === turnSlide) { turnTagEl.remove(); turnTagEl = null; }
          if (popupHost) {
            cards.push(popupCard(mk.choices));
            if (qn) noteAim('claude has a question about', qn); else note('claude has a question');
          } else {
            const c = choiceCard(mk.choices, { onSend: t => send(t), sfx });
            cards.push(c);
            append(h('div', { class: 'ws-msg ws-claude ws-choicewrap' }, h('span', { class: 'ws-mini' }),
              h('div', { class: 'ws-chcol' }, qn == null ? null : slideTag(qn, 'ws-tag-q'), c.el)), { force: true });
          }
        }
        if (mk.hints.length) {
          hints = mk.hints.slice(0, 5);
          if (!EDIT) {
            closeSteps();
            append(h('div', { class: 'ws-hintline' }, h('p', { class: 'ws-hl-t' }, 'ideas for changes'), h('div', { class: 'ws-hl-c' }, hints.map(x => hintChip(x, pickHint)))));
          }
          paintHints();
        }
        break;
      }
      case 'tool':
        M.progress = true; M.auth = false;
        if (M.stage === 0 && /^(Read|Glob|Grep|Skill|LS)$/.test(ev.tool || '')) setStage(1);
        stepLine(toolLine(ev));
        if (live && performance.now() - lastTick > 350) { sfx('tick'); lastTick = performance.now(); }
        break;
      case 'stage':                // L-08: the server derives the stage from the tool Claude called; markers are only an extra
        M.progress = true;
        setStage(STAGES.findIndex(s => s[0] === ev.stage));
        break;
      case 'tool-error':
        stepLine(ev.code === 'blocked' ? 'a rule blocked one step' : 'one step needed another try', 'ws-warn');
        break;
      case 'blender': {            // the server's studio-render steps for this slide (docs/blender-contract.md section 7); progress ticks stay out of the chat
        if (/-progress$|^preview-started$/.test(ev.code || '') || !text) break;
        note(text.charAt(0).toLowerCase() + text.slice(1), 'ws-quiet ws-bl');
        break;
      }
      case 'marker-problem':       // the server could not read one of claude's marker lines (it also logs it)
        note(text || 'claude sent something lumi could not read.', 'ws-warn');
        break;
      case 'user': {
        lockCards(text);
        // this message opens a turn, and everything Claude says until the next one is about the same slide
        turnSlide = EDIT ? (ev.slide || 0) : undefined;
        turnTagged = false; turnTagEl = null;
        const n = pendingUser.findIndex(p => p.text.trim() === text.trim());
        if (n >= 0) { pendingUser[n].el.classList.remove('ws-pending'); pendingUser.splice(n, 1); }
        else userBubble(text, EDIT ? (ev.slide || 0) : (ev.slide || null));
        M.asked = false; M.ok = null; M.code = null; M.stopped = M.failed = false; M.relaxed = true;
        if (ev.t) M.t0 = ev.t;
        if (M.stage === DONE_STAGE) M.stage = 3;
        break;
      }
      case 'limit': {
        let when = '';
        if (ev.resetsAt) {
          const d = new Date(Number(ev.resetsAt) * 1000);
          if (!isNaN(d)) { const mins = Math.round((d - Date.now()) / 60000);
            when = `it resets at ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${mins > 0 ? ` (in about ${mins < 90 ? mins + ' min' : Math.round(mins / 60) + ' h'})` : ''}.`; }
        }
        M.failed = true;
        card('limit', 'claude needs a little break', when ? `claude has used up its time for now. ${when} your work so far is saved.`
          : (text || 'claude has reached its usage limit for now. try again a bit later.'), [btn('try again', retry)]);
        if (live) sfx('error');
        break;
      }
      case 'error':
        if (ev.code === 'auth') { M.auth = true; M.failed = true; gateDismissed = false; note('claude needs you to sign in first.', 'ws-quiet'); }
        else {
          M.failed = true;
          card('error', ev.code === 'interrupted' ? 'claude was interrupted' : 'something went wrong',
            ev.code === 'interrupted' ? 'lumi was closed while claude was working. pick up where it left off?' : (ev.text || 'claude stopped unexpectedly. it usually works on a second try.'),
            [btn('try again', retry, 'ws-ink')]);
        }
        if (live) sfx('error');
        break;
      case 'done': {
        M.ok = !!ev.ok; M.code = ev.code || null; M.tEnd = ev.t || 0;
        const dones = markersOf(text, 'done'), built = dones.length > 0;
        if (built) M.deck = dones[dones.length - 1].attrs.path;
        M.asked = hasMarker(text, 'ask');      // the end of a turn decides whether Claude is waiting for an answer
        if (!M.asked) { cards.forEach(c => c.lock()); closePopups(); }
        if (ev.code === 'stopped') { M.stopped = true; note('you stopped claude. send a message to carry on' + (EDIT ? '.' : ', or start over.'), 'ws-quiet'); }
        else if (!ev.ok && ev.code !== 'limit') {
          M.failed = true;
          card('error', 'that didn’t finish', ev.text || 'claude stopped without saying why. it usually works on a second try.', [btn('try again', retry, 'ws-ink')]);
          if (live) sfx('error');
        } else if (ev.ok && M.deck && !M.asked) {
          setStage(DONE_STAGE);
          if (EDIT) { if (built) note('changes saved to your deck', 'ws-saved'); }
          else card('done', 'your slides are ready', `“${baseName(M.deck)}” is in your slides folder.`,
            [onEdit ? btn('edit my slides', () => onEdit(deckId || (status && status.deckId)), 'ws-ink') : null, btn('present them', openDeck)].filter(Boolean));
          if (live && built && onDone) { try { onDone(M.deck); } catch (e) { console.warn(e); } }
        }
        closeSteps();
        break;
      }
      default:
        if (text) stepLine(text.charAt(0).toLowerCase() + text.slice(1), 'ws-ok');
    }
  }

  // ---------------------------------------------------------------- hints
  function pickHint(hint) {
    if (running || elsewhere || pendingCard()) { sfx('error'); return; }       // never while claude works or waits for an answer
    sfx('select');
    if (EDIT && onSlide && hint.slide) { try { onSlide(hint.slide); } catch (e) { /* optional */ } }
    fill(hint.text);
  }
  function fill(text) {
    input.value = text; grow();
    if (!input.disabled) { input.focus({ preventScroll: true }); input.setSelectionRange(text.length, text.length); }
    box.classList.remove('ws-flash'); void box.offsetWidth; box.classList.add('ws-flash');
  }
  // ideas are only for a quiet moment: hidden while claude works or waits for an answer, and only when the deck (or the
  // selected slide) is there to change; the chips for the selected slide come first
  const ideasOk = () => !running && !elsewhere && !pendingCard() && !gate && !offline && (EDIT || hasRun()) && (!hintsOk || !!hintsOk());
  function paintHints() {
    // the ideas row and the target chip sit under the log and change its height: whoever was reading the newest message must
    // still be reading it afterwards, or their own message disappears behind a row that just appeared
    const stick = nearBottom();
    paintHintsIn();
    if (stick) toBottom(false);
  }
  function paintHintsIn() {
    if (onHints) { try { onHints(hints); } catch (e) { /* optional */ } }
    chat.classList.toggle('no-ideas', !ideasOk());
    if (!hintRow) return;
    const ok = ideasOk();
    hintRow.hidden = !ok;
    if (!ok) { hintRow.replaceChildren(); return; }
    const sel = getSlide() || 1;
    const mineH = hints.filter(x => x.slide === sel), other = hints.filter(x => x.slide !== sel);
    let list = mineH.concat(other).slice(0, 3);
    if (!mineH.length) list = GENERIC_HINTS.slice(0, 2).map(t => ({ slide: sel, text: t })).concat(other.slice(0, 1));
    hintRow.replaceChildren(h('span', { class: 'ws-hints-t' }, 'ideas'), ...list.map(x => hintChip(x, pickHint)));
  }

  // ---------------------------------------------------------------- attaching a file (edit mode)
  function paintClip() {
    clip.hidden = !attached;
    if (!attached) { clip.replaceChildren(); return; }
    const x = h('button', { type: 'button', class: 'ws-clip-x', 'aria-label': 'remove the file', html: CLIP_X });
    x.addEventListener('click', () => { attached = null; paintClip(); paint(); });
    const label = attached.state === 'up' ? `adding ${attached.name}… ${Math.round(attached.p * 100)}%`
      : attached.state === 'err' ? `couldn’t add ${attached.name}` : attached.name;
    clip.replaceChildren(h('span', { class: 'ws-clip-i', html: FOLDER }), h('span', { class: 'ws-clip-n' }, label),
      attached.state === 'ok' ? h('span', { class: 'ws-clip-s' }, 'claude will use it') : null, x);
    clip.dataset.state = attached.state;
    clip.style.setProperty('--p', attached.p || 0);
  }
  if (folderIco) {
    folderIco.addEventListener('click', () => { sfx('click'); fileIn.value = ''; fileIn.click(); });
    fileIn.addEventListener('change', async () => {
      const f = fileIn.files && fileIn.files[0];
      if (!f) return;
      const me = attached = { name: f.name, state: 'up', p: 0 };
      paintClip(); paint();
      const r = await api.upload(f, UPLOAD_FOLDER, p => { if (attached === me) { me.p = p; paintClip(); } }, deckId || undefined);
      if (!alive || attached !== me) return;
      if (r && r.ok) { me.state = 'ok'; me.name = r.name || f.name; sfx('upload'); fire('files:uploaded', { folder: UPLOAD_FOLDER, name: me.name, size: r.size }); }
      else { me.state = 'err'; sfx('error'); }
      paintClip(); paint();
      if (me.state === 'ok' && !input.disabled) input.focus({ preventScroll: true });
    });
  }

  // ---------------------------------------------------------------- state painting
  const hasRun = () => M.stage >= 0;
  const isWaiting = () => !running && hasRun() && (srvWaiting != null ? !!srvWaiting : M.asked);
  const isDone = () => !running && !!M.deck && M.ok === true && !M.asked && M.stage === DONE_STAGE;
  function paint() {
    const waiting = isWaiting(), done = isDone();
    rows.forEach((r, n) => {
      const st = M.stage;
      r.classList.toggle('is-done', hasRun() && (n < st || (done && n === DONE_STAGE)));
      r.classList.toggle('is-now', hasRun() && n === st && !done && running);
      r.classList.toggle('is-wait', hasRun() && n === st && !done && !running);
      r.classList.toggle('is-halt', hasRun() && n === st && !running && (M.stopped || M.failed));
    });
    left.classList.toggle('is-finished', done);
    left.classList.toggle('is-run', running);
    stopBtn.hidden = !running;
    editBtn.hidden = !done || !onEdit;
    openBtn.hidden = !done;
    againBtn.hidden = running || done || !hasRun() || !(M.stopped || M.failed);
    homeLink.hidden = !onHome;
    const uploading = attached && attached.state === 'up';
    const open = !running && !elsewhere && !sending && !gate && !offline;
    const asking = !!pendingCard();
    const canReply = open && (hasRun() || EDIT) && !asking;      // the chat box waits while a question card is open: answers go through its own button
    input.disabled = !canReply;
    sendBtn.disabled = !canReply || uploading || !(input.value.trim() || (attached && attached.state === 'ok') || pendingCard());
    if (folderIco) folderIco.disabled = !!gate || offline;
    const sel = getSlide();
    input.placeholder = elsewhere ? 'claude is busy with another deck…' : running ? 'working… write when it’s done'
      : !hasRun() && !EDIT ? 'nothing to reply to yet' : asking ? 'answer claude’s questions first…' : waiting ? 'type your answer…'
      : EDIT ? (aimDeck() ? 'what should change everywhere?' : aimN() ? `what should change on slide ${aimN()}?` : 'what should change?')
      : done ? 'ask for a change…' : 'tell claude what to do next…';
    cards.forEach(c => c.setEnabled(open));
    input.title = running ? 'wait until claude is done' : asking ? 'answer the questions first' : '';
    box.classList.toggle('is-ask', waiting && canReply);
    chat.classList.toggle('is-run', running || elsewhere);
    statusTxt.textContent = offline ? 'can’t reach lumi…' : gate === 'cli' ? 'not installed' : gate === 'signin' ? 'needs sign-in'
      : elsewhere ? 'busy with another deck' : running ? 'working' : waiting ? 'waiting for you' : done ? (EDIT ? 'ready' : 'finished')
      : M.stopped ? 'stopped' : M.failed ? 'paused' : hasRun() ? 'idle' : 'ready';
    head.dataset.state = offline ? 'off' : running ? 'run' : waiting ? 'ask' : done ? 'done' : 'idle';
    paintAim();
    if (running && typing.parentNode !== log) { log.append(typing); if (nearBottom()) toBottom(); }
    if (!running && typing.parentNode) typing.remove();
    paintTime();
    const key = `${running}|${waiting}|${done}|${asking}`;
    if (key !== lastState) {
      const first = lastState === '';
      lastState = key; paintHints(); fire('claude:state', { running, waiting, done, deckId });
      if (!first && live) announce(asking || waiting ? 'claude has a question for you' : running ? 'claude is working' : done ? 'claude is done' : 'claude stopped');
    }
  }
  function paintTime() {
    if (!hasRun() || !M.t0) { timeTxt.textContent = hasRun() ? 'getting started' : 'not started yet'; return; }
    const end = running ? Date.now() / 1000 : (M.tEnd || Date.now() / 1000);
    const t = clock(end - M.t0);
    timeTxt.textContent = running ? `working for ${t}` : isDone() ? `finished in ${t}` : `ran for ${t}`;
  }
  tickT = setInterval(() => { if (alive && running) paintTime(); }, 1000);

  // ---------------------------------------------------------------- gates (missing CLI, sign-in, nothing started)
  function showGate(kind) {
    if (gate === kind) return;
    gate = kind;
    clearTimeout(loginT);
    gateEl.hidden = !kind;
    chat.classList.toggle('has-gate', !!kind);
    if (!kind) { paint(); return; }
    let body;
    if (kind === 'cli') {
      body = [h('div', { class: 'ws-art', html: ART.cli }), h('p', { class: 'ws-g-t' }, 'claude isn’t installed yet'),
        h('p', { class: 'ws-g-x' }, 'lumi needs the claude app to build your slides. use “update lumi” on the loading screen, then come back here.'),
        h('div', { class: 'ws-g-b' }, btn('check again', async e => {
          const b = e.currentTarget; b.disabled = true; b.textContent = 'checking…';
          const s = await api.claude.status(true); if (!alive) return;
          b.disabled = false; b.textContent = 'check again';
          if (s && s.cli) { sfx('success'); status = s; showGate(null); decide(); } else { sfx('error'); gateToast('still not found. did the update finish?'); }
        }, 'ws-ink'))];
    } else if (kind === 'signin') {
      const go = h('button', { type: 'button', class: 'ws-btn ws-ink ws-big', 'data-cursor-label': 'sign in', 'data-nosfx': '' }, 'sign in to Claude');
      go.addEventListener('click', signIn);
      body = [h('div', { class: 'ws-art', html: ART.signin }), h('p', { class: 'ws-g-t' }, 'sign in to claude'),
        h('p', { class: 'ws-g-x' }, 'claude needs you to sign in once (any claude plan works; pro is recommended). a private browser window opens; sign in there and come back.'),
        h('div', { class: 'ws-g-b' }, go), hasRun() ? h('button', { type: 'button', class: 'ws-link', onclick: () => { gateDismissed = true; showGate(null); } }, 'not now, show the chat') : null];
    } else if (kind === 'start') {
      const go = h('button', { type: 'button', class: 'ws-btn ws-ink ws-big', 'data-cursor-label': 'go', 'data-nosfx': '' }, 'make my slides');
      go.addEventListener('click', async () => { go.disabled = true; go.textContent = 'starting…'; sfx('launch'); await startRun(); if (alive) { go.disabled = false; go.textContent = 'make my slides'; } });
      body = [h('div', { class: 'ws-art', html: ART.start }), h('p', { class: 'ws-g-t' }, 'ready when you are'),
        h('p', { class: 'ws-g-x' }, 'nothing has started yet.'), h('div', { class: 'ws-g-b' }, go)];
    } else if (kind === 'nosession') {
      body = [h('div', { class: 'ws-art', html: ART.start }), h('p', { class: 'ws-g-t' }, 'made outside the app'),
        h('p', { class: 'ws-g-x' }, 'claude didn’t build this deck, so it can’t continue it. click any text on a slide to change it.')];
    }
    gateEl.replaceChildren(h('div', { class: 'ws-g-in' }, body, h('p', { class: 'ws-g-toast', role: 'status' })));
    paint();
  }
  function gateToast(t) { const g = gateEl.querySelector('.ws-g-toast'); if (g) g.textContent = t; }
  async function signIn(e) {
    const b = e.currentTarget;
    b.disabled = true; sfx('launch');
    const r = await api.claude.login();
    if (!alive) return;
    if (r && r.ok === false) { b.disabled = false; sfx('error'); gateToast(r.error === 'offline' ? 'couldn’t reach lumi. is its window open?' : 'couldn’t open the sign-in window. try again?'); return; }
    b.textContent = 'waiting for you to sign in…';
    b.classList.add('is-waiting');
    gateToast('a sign-in window opened. finish there; this page notices by itself.');
    const check = async () => {
      if (!alive || gate !== 'signin') return;
      const s = await api.claude.status(true);
      if (!alive || gate !== 'signin') return;
      if (s && s.signedIn === true) {
        status = s; sfx('success');
        b.classList.remove('is-waiting'); b.textContent = 'signed in';
        loginT = setTimeout(async () => { if (!alive) return; showGate(null); M.auth = false; await continueAfterSignIn(); }, 900);
      } else loginT = setTimeout(check, LOGIN_POLL_MS);
    };
    loginT = setTimeout(check, LOGIN_POLL_MS);
  }
  async function continueAfterSignIn() {
    if (running) return;
    if (!hasRun()) return EDIT ? undefined : startRun();
    if (M.auth || M.failed || !M.progress) return retry();
  }
  function decide() {
    if (!alive || running) { if (running && gate && gate !== 'cli') showGate(null); return; }
    if (status && status.cli === false) return showGate('cli');
    if ((M.auth || (status && status.signedIn === false)) && !gateDismissed) return showGate('signin');
    if (EDIT && deckRec && !deckRec.sessionId && !hasRun() && !(deckId && slideIds.length)) return showGate('nosession');
    if (!hasRun() && !EDIT) return showGate('start');
    if (gate && gate !== 'cli') showGate(null);
  }

  // ---------------------------------------------------------------- actions
  function launched(r) {
    if (r && r.ok === false) {
      if (r.error === 'cli-missing') { status = { ...(status || {}), cli: false }; showGate('cli'); return false; }
      if (r.error === 'busy') return true;
      sfx('error');
      note(r.error === 'offline' ? 'couldn’t reach lumi. is its window still open?' : 'claude couldn’t start. try again in a moment.', 'ws-quiet');
      return false;
    }
    running = true; srvWaiting = undefined; idle = 0;
    setClaude({ running: true, waiting: false, deckId });
    paint(); schedule(250);
    return true;
  }
  async function startRun() {
    showGate(null);
    const r = await api.claude.start(deckId || undefined);
    if (!alive) return;
    if (launched(r) && !hasRun()) { resetModel(); M.t0 = Date.now() / 1000; paint(); }
  }
  async function retry() {
    if (running || sending) return;
    if (M.progress && (session || (status && status.sessionId) || (deckRec && deckRec.sessionId))) return send(CARRY_ON);
    if (EDIT) return;
    return startRun();
  }
  async function send(text) {
    text = String(text || '').trim();
    if (attached && attached.state === 'ok') text = (text ? text + '\n' : '') + `use the file ${attached.name}`;
    if (!text || running || sending || elsewhere) return;
    sending = true;
    // BOUND HERE, once. Whatever the person does next - scroll the strip, open another slide - this message keeps this target,
    // on the wire and on the bubble.
    const wasAim = aim;
    const deckWide = EDIT && aimDeck();
    const slide = EDIT && !deckWide ? aimN() : null;
    const scope = EDIT && deckId ? (deckWide ? 'deck' : 'slide') : undefined;
    const b = userBubble(text, EDIT ? (deckWide ? 0 : slide) : null, 'ws-pending');
    aim = null; paintAim();         // an override is a declaration about one message, not a mode
    const p = { text, el: b };
    pendingUser.push(p);
    lockCards(text);
    sfx('next');
    const hadFile = attached;
    attached = null; paintClip();
    paint();
    const r = await api.claude.reply(text, { deckId: deckId || undefined, slide: slide || undefined, scope });
    sending = false;
    if (!alive) return;
    if (r && r.ok === false && r.error !== 'busy') {
      b.classList.add('ws-failed'); b.classList.remove('ws-pending');
      const n = pendingUser.indexOf(p); if (n >= 0) pendingUser.splice(n, 1);
      if (wasAim) { aim = wasAim; paintAim(); }        // nothing was sent, so the override the person chose is still theirs
      if (hadFile) { attached = hadFile; paintClip(); }
      if (r.error === 'cli-missing') { status = { ...(status || {}), cli: false }; showGate('cli'); }
      else { sfx('error'); note(r.error === 'offline' ? 'couldn’t reach lumi, so that wasn’t sent.' : r.error === 'no-session' ? 'claude can’t pick this deck up here. small text changes still work on the slide.' : 'that didn’t send. try again?', 'ws-quiet'); }
      paint();
      return;
    }
    setTimeout(() => p.el.classList.remove('ws-pending'), 600);
    if (M.stage < 0) resetModel();
    M.asked = false; M.ok = null; M.stopped = M.failed = false; M.relaxed = true; M.t0 = Date.now() / 1000;
    if (M.stage === DONE_STAGE) M.stage = 3;
    launched(r);
  }
  function submitBox() {
    const pc = pendingCard();
    const t = pc ? pc.compose(input.value) : input.value;
    if (!t.trim() && !(attached && attached.state === 'ok')) return;
    input.value = ''; grow(); send(t);
  }
  box.addEventListener('submit', e => { e.preventDefault(); submitBox(); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); box.requestSubmit(); } });
  const grow = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 96) + 'px'; paint(); };
  input.addEventListener('input', grow);

  let stopArm = 0;
  stopBtn.addEventListener('click', async () => {
    if (!stopArm) {
      stopBtn.classList.add('is-armed'); stopBtn.querySelector('.lbl').textContent = 'tap again to stop';
      stopArm = setTimeout(() => { stopArm = 0; stopBtn.classList.remove('is-armed'); stopBtn.querySelector('.lbl').textContent = 'stop'; }, 3000);
      return;
    }
    clearTimeout(stopArm); stopArm = 0;
    stopBtn.disabled = true; stopBtn.querySelector('.lbl').textContent = 'stopping…';
    const r = await api.claude.stop();
    if (!alive) return;
    stopBtn.disabled = false; stopBtn.classList.remove('is-armed'); stopBtn.querySelector('.lbl').textContent = 'stop';
    if (r && r.ok === false) { sfx('error'); leftSay('couldn’t stop claude. try again?'); }
    schedule(100);
  });
  async function openDeck() {
    sfx('launch');
    const r = await api.openSlides(M.deck || undefined);
    if (alive && r && r.ok === false) leftSay('couldn’t open them. try the slides folder.');
  }
  editBtn.addEventListener('click', () => { if (onEdit) onEdit(deckId || (status && status.deckId)); });
  openBtn.addEventListener('click', openDeck);
  folderBtn.addEventListener('click', async () => { const r = await api.openSlides(); if (alive && r && r.ok === false) leftSay('couldn’t open the folder.'); });
  againBtn.addEventListener('click', async () => { againBtn.disabled = true; sfx('launch'); await startRun(); if (alive) againBtn.disabled = false; });
  homeLink.addEventListener('click', () => { if (onHome) onHome(); });
  function leftSay(t) { leftToast.textContent = t; leftToast.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => leftToast.classList.remove('show'), 3500); }

  // ---------------------------------------------------------------- one log, and the target chip
  // The editor's history, once, in order: one conversation, so no filtering. (This replaced renderThread(), which filtered the
  // log by each event's `conv` - dead since the server stopped setting it, and it rendered an empty chat on every new deck.)
  function replayOwn() {
    if (replayed) return;
    replayed = true;
    log.replaceChildren(); closeSteps(); cards = []; pendingUser.length = 0; closePopups();
    tags = []; M.stage = -1; hints = [];
    turnSlide = undefined; turnTagged = false; turnTagEl = null;
    live = false;
    for (const ev of own.slice(-240)) handle(ev);
    live = true;
    toBottom(false);
    paintAim(); paintHints();
  }
  function paintAim() {
    if (!aimRow) return;
    aimRow.hidden = !deckId;
    const n = aimN();
    if (headAim) {
      headAim.hidden = !EDIT || !deckId;
      headAim.textContent = slideWord(n);
      headAim.classList.toggle('is-set', !!aim);
    }
    if (aimRow.hidden) return;
    aimBtn.querySelector('.ws-aim-t').textContent = slideWord(n);
    aimBtn.classList.toggle('is-set', !!aim);
    aimBtn.disabled = !!gate || offline || running || elsewhere || askN() != null;
    if (aimBtn.disabled) closeAim();
    aimBtn.title = askN() != null ? 'claude asked about this slide, so your answer goes to it'
      : aim ? 'you picked this. it goes back to the open slide once you send'
      : 'the slide you have open. pick another for this message';
    if (onTarget) { try { onTarget(n); } catch (e) { /* optional */ } }
  }
  let aimOpen = false;
  const onDocDown = e => { if (aimOpen && !aimRow.contains(e.target)) closeAim(); };
  const onDocKey = e => { if (aimOpen && e.key === 'Escape') { closeAim(); aimBtn.focus({ preventScroll: true }); } };
  function closeAim() {
    if (!aimOpen) return;
    aimOpen = false;
    aimMenu.hidden = true;
    aimBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onDocDown, true);
    document.removeEventListener('keydown', onDocKey, true);
  }
  function openAim() {
    const here = getSlide() || 1;
    const item = (label, sub, on, pick) => {
      const b = h('button', { type: 'button', class: 'ws-aim-i' + (on ? ' on' : ''), role: 'menuitem', 'data-nosfx': '' },
        h('span', { class: 'ws-aim-il' }, label), h('small', {}, sub));
      b.addEventListener('click', () => { sfx('select'); pick(); closeAim(); paintAim(); paint(); if (!input.disabled) input.focus({ preventScroll: true }); });
      return b;
    };
    aimMenu.replaceChildren(
      item('this slide', `slide ${here}`, !aim, () => { aim = null; }),
      item('whole deck', 'every slide', aimDeck(), () => { aim = { deck: true }; }));
    aimMenu.hidden = false;
    aimOpen = true;
    aimBtn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onDocDown, true);
    document.addEventListener('keydown', onDocKey, true);
    const first = aimMenu.querySelector('.ws-aim-i');
    if (first) try { first.focus({ preventScroll: true }); } catch (e) { /* gone */ }
  }
  if (aimBtn) aimBtn.addEventListener('click', () => { if (aimBtn.disabled) return; sfx('click'); aimOpen ? closeAim() : openAim(); });
  async function refreshIds() {
    if (!EDIT || !deckId) return;
    const d = await api.decks.get(deckId);
    if (!alive || !d || d.ok === false || !d.deck) return;
    deckRec = d.deck;
    const ids = Array.isArray(d.deck.slideIds) ? d.deck.slideIds : [];
    if (ids.join() !== slideIds.join()) { slideIds = ids; paintAim(); paint(); }
  }

  // ---------------------------------------------------------------- polling
  const mine = ev => !deckId || !ev || ev.deck === deckId;
  function schedule(ms) { clearTimeout(pollT); if (alive) pollT = setTimeout(poll, ms); }
  let polling = false, idle = 0, offIdle = 0, lastPolled = '';
  async function poll() {
    if (!alive || polling) return;
    polling = true;
    const r = await api.claude.events(Math.max(next, 0));
    polling = false;
    if (!alive) return;
    if (!r || !Array.isArray(r.events)) {
      offline = true; paint();
      return schedule(pace(2000, ++offIdle, { max: 8000 }));
    }
    offIdle = 0;
    if (offline) { offline = false; idle = 0; }
    if (r.reset) { log.replaceChildren(); closeSteps(); cards = []; tags = []; M.stage = -1; base = -1; next = 0; replayed = false; return schedule(0); }
    let evs = r.events;
    const runDeck = r.deckId || null;
    const forMe = !deckId || !runDeck || runDeck === deckId;
    const wasBusy = polledBusy;
    running = !!r.running && forMe;
    elsewhere = !!r.running && !forMe;
    srvWaiting = forMe ? r.waiting : undefined;
    polledBusy = !!(running || srvWaiting);
    if (wasBusy && !polledBusy) refreshIds();        // a run may have changed the plan (new slide ids)
    if (base < 0) {
      // first load: a deck's own events (the editor shows its recent history, the workshop its latest build);
      // without a deck, the latest run (and its replies), not older runs from previous briefs
      if (deckId) {
        own = evs.filter(mine);
        const startIdx = own.map(e => e && e.kind === 'status' && e.code === 'start').lastIndexOf(true);
        evs = EDIT ? [] : own.slice(Math.max(0, startIdx));
        base = 0;
        if (EDIT) { replayOwn(); for (const ev of own.slice(-240)) fire('claude:event', { event: ev, replay: true, deckId }); }
      } else {
        const startIdx = evs.map(e => e && e.kind === 'status' && e.code === 'start').lastIndexOf(true);
        base = typeof r.runStart === 'number' && r.runStart >= 0 && r.runStart <= evs.length ? r.runStart : Math.max(0, startIdx);
        evs = evs.slice(base);
      }
      live = false;
      for (const ev of evs) { handle(ev); fire('claude:event', { event: ev, replay: true, deckId }); }
      live = true;
      toBottom(false);
    } else {
      const fresh = evs.filter(mine);
      if (deckId) { own.push(...fresh); if (own.length > 3000) own = own.slice(-2000); }
      for (const ev of fresh) {
        handle(ev);                                  // one conversation, one log: every event this deck's belongs on screen
        fire('claude:event', { event: ev, deckId });
      }
    }
    next = typeof r.next === 'number' ? r.next : next + r.events.length;
    if (r.sessionId && forMe) session = r.sessionId;
    if (!M.deck && r.lastDeck && M.ok && !running && M.stage === DONE_STAGE && forMe) M.deck = r.lastDeck;
    paint();
    decide();
    // F-09 / F-04: a run that says nothing for a while, or an idle deck, is polled less and less often; any event, a send or a
    // change of state brings it back to full speed
    if (r.events.length || lastState !== lastPolled) idle = 0; else idle++;
    lastPolled = lastState;
    setClaude({ running: !!r.running, waiting: !!r.waiting, deckId: runDeck });
    schedule(elsewhere ? pace(1500, idle, { max: 4000 }) : running ? pace(POLL_MS, idle, { max: 2200 }) : pace(POLL_MS, idle, { max: 4500 }));
  }
  const onVis = () => { if (!document.hidden && alive) schedule(50); };
  document.addEventListener('visibilitychange', onVis);

  // ---------------------------------------------------------------- boot
  paint(); paintHints();
  Promise.all([api.claude.status(false), deckId ? api.decks.get(deckId) : Promise.resolve(null)]).then(([s, d]) => {
    if (!alive) return;
    if (d && d.ok !== false && d.deck) { deckRec = d.deck; if (EDIT && Array.isArray(d.deck.slideIds)) slideIds = d.deck.slideIds; }
    lastSel = getSlide();
    if (s && s.ok !== false) { status = s; if (s.sessionId) session = s.sessionId; }
    if (s && s.running && (!deckId || !s.deckId || s.deckId === deckId)) running = true;
    poll();
  });

  return {
    setSlide() {
      const sel = getSlide();
      // Moving carries the target along - but only while the person has not said otherwise. A "whole deck" they picked
      // survives a look at another slide: it is on the chip the whole time, so keeping it is the visible choice and
      // dropping it would be the silent one.
      if (sel !== lastSel) { lastSel = sel; closeAim(); if (running || srvWaiting) schedule(60); }     // a stale 'running' is re-asked at once
      paintTags();                 // every message on screen re-states which slide it was about, from here
      paintHints(); paint();
    },
    fill,
    get hints() { return hints.slice(); },
    get running() { return running; },
    destroy() {
      alive = false;
      clearTimeout(pollT); clearTimeout(loginT); clearInterval(tickT); clearTimeout(toastT); clearTimeout(stopArm);
      if (aimRow) closeAim();
      document.removeEventListener('visibilitychange', onVis);
      left.remove(); chat.remove();
    },
  };
}
