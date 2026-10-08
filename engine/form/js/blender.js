// Blender studio renders on the build page and in the editor (docs/blender-contract.md, batch 3).
// The SERVER renders: after Claude writes a slide's scene it makes a quick preview; the person looks at it under the slide
// ("do you like the design?"), approves it (then the full render runs, with progress and cancel) or types a change (Claude edits
// the scene in the slide's own conversation and a new preview follows). Every preview is kept, so the history can be flipped
// through. Estimates (time, and tokens for one more round) are shown BEFORE anything is committed.
//   mountBlenderCard(host, { deckId, build, sfx, onLayout(mode 'none'|'open'|'bar'), onMedia(sid), onState() })
//     -> { setSlide(n), gate(built) -> {ok, n, text}, rendering() -> {n, progress, etaS} | null, refresh(), destroy() }
// The pure helpers (time/token wording, the effective engine, the next-slide gate, the card mode) are exported for the unit tests.
import * as api from './api.js';
import { on } from './bus.js';
import { h } from './dom.js';

// ---------------------------------------------------------------- wording (pure)
export const ENGINE = {
  blender: { name: 'studio render', tool: 'blender', note: 'photo-real', fixed: 'still ≈ 1–2 min, animation 10–60 min',
    why: 'a photo-real picture, made with Blender. you approve a quick preview first.' },
  threejs: { name: 'live 3D', tool: 'three.js', note: 'instant, animated, editable',
    why: 'drawn live on the slide. it can move and turn.' },
};
export function fmtDur(s) {
  if (s == null || !isFinite(s)) return '';
  s = Math.max(0, Math.round(s));
  if (s < 45) return 'under a minute';
  const m = Math.max(1, Math.round(s / 60));
  if (m < 60) return `${m} min`;
  const hh = Math.floor(m / 60), r = m % 60;
  return r ? `${hh} h ${r} min` : `${hh} h`;
}
export const fmtLeft = s => (s == null || !isFinite(s) ? '' : s < 45 ? 'under a minute left' : `about ${fmtDur(s)} left`);
export const fmtCost = usd => (typeof usd === 'number' && usd > 0 ? (usd < 0.01 ? 'under $0.01' : '$' + usd.toFixed(2)) : '');
// seconds of the full render for this kind / resolution (+ the wait for a render that is ahead of it)
export function fullSeconds(est, kind, res) {
  const f = (est && est.full) || {};
  const one = kind === 'still' ? f.still : f.baked || f[String(res || 720)];     // a baked slide has one time, no resolution
  if (!one || one.seconds == null) return null;
  return one.seconds + ((est.queue && est.queue.waitS) || 0);
}
export function fullLine(est, kind, res) {
  const s = fullSeconds(est, kind, res);
  return `full render ≈ ${s == null ? 'a few min' : fmtDur(s)} · runs on this computer`;
}
export function iterLine(est) {
  const it = (est && est.iteration) || {}, pv = (est && est.preview) || {};
  // post-mortem problem 6: the cost is per-RUN (`costUsdRun`). The old `costUsd` was the session running total, so the
  // line could say "one more preview ≈ $1.82" where $1.82 was what the whole slide had cost. An older server sends only
  // the old name, and its cumulative cost is deliberately dropped rather than shown as a per-run price. No token count:
  // the reader is not technical (copy pass kill list, 2026-10-08).
  const secs = it.seconds || ((pv.seconds || 20) + 90), cost = fmtCost(it.costUsdRun);
  return `one more preview ≈ ${fmtDur(secs)}${cost ? ` · ≈ ${cost}` : ''}`;
}
// the plan page's two named options (contract section 2); est = plan payload blender.estimates[sid]
export function engineNotes(kind, est) {
  const b = ENGINE.blender;
  let time = b.fixed;
  if (est) time = kind === 'still' ? `still ≈ ${fmtDur(est.still)}` : est.baked ? `animation ≈ ${fmtDur(est['1080'])}`
    : `720p ≈ ${fmtDur(est['720'])}, 1080p ≈ ${fmtDur(est['1080'])}`;
  return { blender: `${b.note}; ${time}`, threejs: ENGINE.threejs.note };
}
// the effective engine, exactly as the server decides it (form_server.slide_engine, LOOK_3D). bakes: a deck from batch 6 on,
// where a moving figure on a Blender look is a baked studio render too (B.2)
const BLENDER_LOOKS = ['bold blue', 'clay pop'];
export function effEngine(visual, look, available, bakes = false) {
  const v = visual || {};
  if (v.main !== '3d') return null;
  if (v.engine === 'blender') return available ? 'blender' : 'threejs';
  if (v.engine === 'threejs') return 'threejs';
  return available && BLENDER_LOOKS.includes(String(look || '').trim().toLowerCase()) && (v.motion === 'still' || bakes) ? 'blender' : 'threejs';
}
const ACTIVE = ['previewing', 'rendering', 'changing', 'writing'];
const isBl = v => !!v && (v.engine === 'blender' || !!(v.previews && v.previews.length) || !!v.final);
// "make next slide" waits for every built Blender slide: rendered, or kept as a preview on purpose ("skip for now")
export function nextGate(views, built) {
  const list = Object.values(views || {}).filter(v => isBl(v) && v.engine === 'blender' && !v.baked && v.n && v.n <= built).sort((a, b) => a.n - b.n);
  const r = list.find(v => v.status === 'rendering');
  if (r) return { ok: false, n: r.n, why: 'rendering', text: `lumi is rendering slide ${r.n}. the next slide can start when it is done (or cancel the render).` };
  const w = list.find(v => v.status !== 'rendered' && !v.deferred);
  if (w) return { ok: false, n: w.n, why: w.status, text: w.status === 'previewing' || w.status === 'changing'
    ? `slide ${w.n}’s new preview is on its way. have a look at it first.`
    : `slide ${w.n} is a studio render: approve its design (or skip it for now) before the next slide.` };
  return { ok: true };
}
// how the card shows for one view: hidden, the full card docked under the slide, or a slim bar
export function cardMode(v, { folded = false, editing = false } = {}) {
  if (!isBl(v) || v.engine !== 'blender') return 'none';
  const st = v.status;
  if (st === 'writing' || st === 'none' || !st) return 'none';
  if (st === 'rendering') return 'bar';
  if (st === 'rendered') return editing ? 'open' : 'bar';
  if (v.deferred && !editing) return 'bar';
  return folded ? 'bar' : 'open';
}

// ---------------------------------------------------------------- the card
export function mountBlenderCard(host, { deckId, build = false, sfx = () => {}, onLayout = () => {}, onMedia = () => {}, onState = () => {} } = {}) {
  let alive = true, views = {}, cur = 1, pollT = 0, idle = 0, busy = false, first = true, layout = '', noteT = 0, armT = 0, armed = false;
  const folded = new Map(), editing = new Set(), shownN = new Map(), resOf = new Map(), drafts = new Map(), mediaKey = new Map();

  // ---- the full card
  const img = h('img', { class: 'bl-img', alt: '' });
  const imgTag = h('span', { class: 'bl-imgtag' });
  const shim = h('span', { class: 'bl-shim', hidden: true }, h('span', { class: 'bl-shim-t' }, 'making the first preview…'));
  const pic = h('div', { class: 'bl-pic' }, img, shim, imgTag);
  const hPrev = h('button', { type: 'button', class: 'bl-hb', 'aria-label': 'earlier preview', html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' });
  const hNext = h('button', { type: 'button', class: 'bl-hb', 'aria-label': 'later preview', html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' });
  const dots = h('span', { class: 'bl-dots', role: 'group', 'aria-label': 'previews so far' });
  const hLab = h('span', { class: 'bl-hlab' });
  const hist = h('div', { class: 'bl-hist' }, hPrev, dots, hNext, hLab);
  const cap = h('p', { class: 'bl-cap' });
  const left = h('div', { class: 'bl-left' }, pic, hist, cap);

  const head = h('p', { class: 'bl-h' });
  const fold = h('button', { type: 'button', class: 'bl-fold', 'data-nosfx': '', 'aria-expanded': 'true', 'data-cursor-label': 'fold' }, h('span', { class: 'lbl' }, 'hide'), h('i', { 'aria-hidden': 'true' }));
  const msg = h('p', { class: 'bl-msg' });
  const prog = h('div', { class: 'bl-prog', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', hidden: true }, h('i'));
  const progT = h('p', { class: 'bl-progt', hidden: true });
  const resRow = h('div', { class: 'bl-res', role: 'radiogroup', 'aria-label': 'how sharp the animation is', hidden: true });
  const go = h('button', { type: 'button', class: 'bl-go', 'data-nosfx': '', 'data-cursor-label': 'render' });
  const goEst = h('span', { class: 'bl-est' });
  const goRow = h('div', { class: 'bl-gorow' }, go, goEst);
  const chgIn = h('textarea', { class: 'bl-chg-in', rows: '2', maxlength: '4000', 'aria-label': 'what should change in the design', placeholder: 'or tell claude what to change…' });
  const send = h('button', { type: 'button', class: 'bl-send', 'data-nosfx': '', 'data-cursor-label': 'send', disabled: true }, 'send change');
  const chgEst = h('span', { class: 'bl-est' });
  const chg = h('div', { class: 'bl-chg' }, chgIn, h('div', { class: 'bl-chgrow' }, chgEst, send));
  const skip = h('button', { type: 'button', class: 'bl-skip', 'data-nosfx': '' }, 'skip for now, keep the preview');
  const note = h('p', { class: 'bl-note', role: 'status' });
  // the short-lived note floats over the foot of the picture, so it never pushes the right column out of the card
  pic.append(note);
  const right = h('div', { class: 'bl-right' }, h('div', { class: 'bl-top' }, head, fold), msg, prog, progT, resRow, goRow, chg, skip);
  const main = h('div', { class: 'bl-main' }, left, right);

  // ---- the slim bar
  const barDot = h('span', { class: 'bl-bdot', 'aria-hidden': 'true' });
  const barT = h('span', { class: 'bl-bt' });
  const barProg = h('span', { class: 'bl-bprog', hidden: true }, h('i'));
  const barB = h('button', { type: 'button', class: 'bl-bb', 'data-nosfx': '' });
  const barX = h('button', { type: 'button', class: 'bl-bx', 'data-nosfx': '', hidden: true });
  const bar = h('div', { class: 'bl-bar' }, barDot, barT, barProg, barX, barB);
  const card = h('div', { class: 'bl-card', role: 'region', 'aria-label': 'studio render of this slide' }, bar, main);
  host.append(card);

  const say = (t, bad) => { note.textContent = t; note.classList.toggle('bad', !!bad); clearTimeout(noteT); noteT = setTimeout(() => { note.textContent = ''; }, 6000); };
  const view = () => Object.values(views).find(v => v.n === cur) || null;
  const sidNow = () => { const v = view(); return v ? v.id : null; };
  const latest = v => ((v && v.previews) || []).slice(-1)[0] || null;
  const shownPrev = v => { const n = shownN.get(v.id); return (n && (v.previews || []).find(p => p.n === n)) || latest(v); };
  const kindOf = v => (v && v.kind) || 'still';
  const resFor = v => resOf.get(v.id) || 720;

  // ---- actions
  async function act(fn, okText) {
    if (busy) return;
    busy = true; paint();
    let r;
    try { r = await fn(); } finally { busy = false; }
    if (!alive) return;
    if (r && r.ok === false) { sfx('error'); say(r.error === 'offline' ? 'can’t reach lumi. nothing changed. try again in a moment.' : (r.reason || 'that didn’t work. try again?').toLowerCase(), true); }
    else if (okText) say(okText);
    await poll(true);
    return r;
  }
  go.addEventListener('click', () => {
    const v = view(); if (!v || go.disabled) return;
    const mode = go.dataset.act;
    if (mode === 'newest') { shownN.delete(v.id); sfx('slide'); paint(); return; }
    if (mode === 'repreview') { sfx('launch'); act(() => api.blender.preview(deckId, v.id), 'lumi is making a new preview.'); return; }
    if (mode === 'cancel') return cancelRender();
    if (mode === 'render' || mode === 'approve') {
      sfx('launch');
      act(async () => {
        if (mode === 'approve') { const a = await api.blender.approve(deckId, v.id); if (a && a.ok === false) return a; }
        return api.blender.render(deckId, v.id, kindOf(v) === 'still' ? null : resFor(v));
      }, 'approved. rendering now.');
    }
  });
  function cancelRender() {
    const v = view(); if (!v) return;
    if (!armed) {
      armed = true; sfx('pop'); paint();
      clearTimeout(armT); armT = setTimeout(() => { armed = false; paint(); }, 3500);
      return;
    }
    armed = false; clearTimeout(armT); sfx('deselect');
    act(() => api.blender.cancel(deckId, v.id, 'full'), 'render cancelled. the design is kept.');
  }
  barX.addEventListener('click', cancelRender);
  chgIn.addEventListener('input', () => { const v = view(); if (v) drafts.set(v.id, chgIn.value); send.disabled = busy || !chgIn.value.trim(); });
  // Enter in the box is a new line, never a send (the owner's rule)
  send.addEventListener('click', () => {
    const v = view(), text = chgIn.value.trim();
    if (!v || !text || send.disabled) return;
    sfx('next');
    act(async () => {
      const r = await api.blender.change(deckId, v.id, text);
      if (r && r.ok !== false) { drafts.delete(v.id); chgIn.value = ''; editing.delete(v.id); shownN.delete(v.id); }
      return r;
    }).then(r => { if (r && r.queued) say('claude is busy. your change starts when it’s free.'); });
  });
  skip.addEventListener('click', () => {
    const v = view(); if (!v) return;
    sfx('deselect');
    act(() => api.blender.defer(deckId, v.id, true), 'kept the preview for now. render it before you finalize.');
  });
  fold.addEventListener('click', () => {
    const v = view(); if (!v) return;
    sfx('deselect');
    if (editing.has(v.id)) editing.delete(v.id); else folded.set(v.id, true);
    paint();
  });
  barB.addEventListener('click', () => {
    const v = view(); if (!v) return;
    sfx('pop');
    if (v.status === 'rendered' || v.deferred) editing.add(v.id);      // a kept preview opens without undoing "skip for now"
    folded.set(v.id, false);
    paint();
    if (v.status === 'rendered') setTimeout(() => { try { chgIn.focus({ preventScroll: true }); } catch (e) { /* gone */ } }, 60);
  });
  const stepTo = n => { const v = view(); if (!v) return; const ps = v.previews || []; const p = ps[Math.max(0, Math.min(ps.length - 1, n))]; if (!p) return;
    if (p === latest(v)) shownN.delete(v.id); else shownN.set(v.id, p.n); sfx('slide'); paint(); };
  hPrev.addEventListener('click', () => { const v = view(); if (!v) return; const ps = v.previews || []; stepTo(ps.indexOf(shownPrev(v)) - 1); });
  hNext.addEventListener('click', () => { const v = view(); if (!v) return; const ps = v.previews || []; stepTo(ps.indexOf(shownPrev(v)) + 1); });

  // ---- painting
  function setProg(el, frac) { el.firstChild.style.transform = `scaleX(${Math.max(0.02, Math.min(1, frac || 0))})`; el.setAttribute && el.setAttribute('aria-valuenow', String(Math.round((frac || 0) * 100))); }
  function paintRes(v) {
    const est = v.estimates || {};
    const want = resFor(v);
    const opt = (res, extra) => {
      const s = fullSeconds(est, 'animation', res);
      const b = h('button', { type: 'button', class: 'bl-r' + (want === res ? ' on' : ''), role: 'radio', 'aria-checked': want === res ? 'true' : 'false', 'data-nosfx': '' },
        h('b', {}, `${res}p`), h('span', {}, ` ≈ ${s == null ? '?' : fmtDur(s)}${extra}`));
      b.addEventListener('click', () => { resOf.set(v.id, res); sfx('select'); paint(); });
      return b;
    };
    resRow.replaceChildren(h('span', { class: 'bl-rl' }, 'animation, 20 fps:'), opt(720, ''), opt(1080, ', sharper when time allows'));
  }
  function paintHistory(v) {
    const ps = v.previews || [];
    const sp = shownPrev(v);
    hist.hidden = ps.length < 2;
    const i = ps.indexOf(sp);
    hPrev.disabled = i <= 0; hNext.disabled = i < 0 || i >= ps.length - 1;
    const tail = ps.slice(-9);
    dots.replaceChildren(...tail.map(p => {
      const b = h('button', { type: 'button', class: 'bl-dot' + (p === sp ? ' on' : ''), 'aria-label': `preview ${p.n}`, 'aria-pressed': p === sp ? 'true' : 'false', 'data-nosfx': '' });
      b.addEventListener('click', () => stepTo(ps.indexOf(p)));
      return b;
    }));
    hLab.textContent = ps.length ? `preview ${i + 1} of ${ps.length}` : '';
  }
  function paintPic(v, mode) {
    const sp = shownPrev(v);
    const fin = v.final || null;
    const useFinal = fin && (v.status === 'rendered' || v.status === 'rendering') && !shownN.has(v.id);
    const src = useFinal ? (fin.posterUrl || fin.url) : sp ? sp.url : '';
    if (src && img.getAttribute('src') !== src) img.src = src;
    img.hidden = !src;
    shim.hidden = !!src;
    imgTag.textContent = useFinal ? (fin.stale ? 'final render (older design)' : fin.kind === 'animation' ? `final loop · ${fin.res}p` : 'final render') : sp ? `preview ${sp.n}` : '';
    imgTag.hidden = !imgTag.textContent;
    img.alt = useFinal ? `the full render of slide ${v.n}` : sp ? `preview ${sp.n} of slide ${v.n}` : '';
    cap.textContent = !useFinal && sp ? (sp.change ? `after: “${sp.change}”` : sp.n === 1 ? 'claude’s first design' : '') : '';
    if (mode === 'open') paintHistory(v); else hist.hidden = true;
  }
  function paint() {
    if (!alive) return;
    const v = view();
    const ed = v ? editing.has(v.id) : false;
    const mode = v ? cardMode(v, { folded: v ? folded.get(v.id) === true : false, editing: ed }) : 'none';
    if (mode !== layout) { layout = mode; try { onLayout(mode); } catch (e) { /* optional */ } }
    card.hidden = mode === 'none';
    card.dataset.mode = mode;
    if (mode === 'none') return;
    const st = v.status, job = v.job || null, kind = kindOf(v), est = v.estimates || {};
    const frac = job && typeof job.progress === 'number' ? job.progress : 0;
    const sp = latest(v), old = shownN.has(v.id) && shownPrev(v) !== sp;
    paintPic(v, mode);

    // the slim bar
    barProg.hidden = st !== 'rendering'; barX.hidden = st !== 'rendering' || !!v.baked;     // B.5: a bake is a minute or two, no cancel
    if (st === 'rendering') {
      const queued = job && job.state === 'queued';
      const res = (job && job.res) || (v.final && v.final.res);
      barT.textContent = queued ? `slide ${v.n} waits for another render to finish` : `rendering slide ${v.n}${kind === 'animation' && res && !v.baked ? ` · ${res}p` : ''} · ${Math.round(frac * 100)}%${job && job.etaS != null ? ' · ' + fmtLeft(job.etaS) : ''}`;
      setProg(barProg, frac);
      barX.textContent = armed ? 'tap again to cancel' : 'cancel';
      barX.classList.toggle('is-armed', armed);
      barB.hidden = true;
    } else if (st === 'rendered') {
      barT.textContent = v.final && v.final.stale ? 'the studio render is older than the design' : `studio render ready${kind === 'animation' && v.final && v.final.res ? ` · ${v.final.res}p loop` : ''}`;
      barB.textContent = 'change the design'; barB.hidden = false;
    } else if (v.deferred) {
      barT.textContent = 'preview kept for now · render it before you finalize';
      barB.textContent = 'show it'; barB.hidden = false;
    } else {
      barT.textContent = st === 'previewing' ? 'a new preview is on its way' : st === 'changing' ? 'claude is changing the design' : st === 'failed' ? 'the studio render needs you' : 'do you like the design?';
      barB.textContent = 'show it'; barB.hidden = false;
    }
    bar.dataset.st = st;

    // the full card
    fold.querySelector('.lbl').textContent = ed ? 'done' : 'hide';
    let H = '', M = '', G = null, showChg = true, showProg = false, P = '';
    goRow.hidden = false; resRow.hidden = true; skip.hidden = !build || !!v.baked || !!v.deferred || st === 'rendered' || st === 'rendering' || st === 'changing';
    const stale = v.final && v.final.stale ? ' the slide keeps the older render until this one is rendered.' : '';
    if (st === 'previewing') {
      H = sp ? 'making a new preview…' : 'making the first preview…';
      // a baked animation never stops to ask: the final loop follows the rough look on its own, so its time is said now
      const all = v.baked ? ((est.preview || {}).seconds || 0) + (fullSeconds(est, 'animation') || 0) : 0;
      M = v.baked && all ? `a rough look, then the final loop, on this computer. ≈ ${fmtDur(all)} in all.`
        : `a quick, rough look at the design. ≈ ${fmtDur((est.preview || {}).seconds || 20)}.`;
      showProg = true; P = job && job.etaS != null ? fmtLeft(job.etaS) : 'starting…'; showChg = false; goRow.hidden = true;
    } else if (st === 'changing') {
      const last = ((v.changes || []).slice(-1)[0] || {}).text;
      H = 'claude is changing the design';
      M = v.pendingChange ? `“${v.pendingChange.split('\n').pop()}” · it starts as soon as claude is free.` : last ? `“${last}” · then lumi makes a new preview.` : 'then lumi makes a new preview.';
      showProg = true; P = ''; showChg = false; goRow.hidden = true;
    } else if (st === 'rendering') {
      H = 'rendering the full picture';
      M = `${Math.round(frac * 100)}%${job && job.frames > 1 ? ` · frame ${job.frame || 0} of ${job.frames}` : ''}${job && job.etaS != null ? ' · ' + fmtLeft(job.etaS) : ''}`;
      showProg = true; showChg = false;
      G = v.baked ? null : { act: 'cancel', label: armed ? 'tap again to cancel' : 'cancel the render', est: '' };
      if (v.baked) goRow.hidden = true;
    } else if (st === 'rendered') {
      H = 'the studio render is in your slide';
      M = 'want something different? describe it below.';
      goRow.hidden = true;
    } else if (st === 'failed') {
      const e = v.error || {};
      H = e.job === 'full' ? 'the render didn’t finish' : 'the preview didn’t work';
      M = (e.reason || 'something went wrong.').toLowerCase();
      if (e.code === 'no-blender') G = null;
      else if (e.code === 'no-scene') G = null;
      else if (e.job === 'full' && v.approved) G = { act: 'render', label: 'try again', est: fullLine(est, kind, resFor(v)) };
      else G = { act: 'repreview', label: 'try again', est: `≈ ${fmtDur((est.preview || {}).seconds || 20)}` };
      if (G && G.act === 'render' && kind === 'animation' && !v.baked) resRow.hidden = false;
      chgIn.placeholder = 'or tell claude what to fix…';
    } else if (old) {
      H = 'an older preview';
      M = `you are looking at preview ${shownPrev(v).n}. lumi renders the newest one, preview ${sp.n}.`;
      G = { act: 'newest', label: 'show the newest', est: '' };
    } else if (!v.sceneCurrent && v.sceneExists) {
      H = 'the design changed after this preview';
      M = 'make a new preview to see it before the full render.';
      G = { act: 'repreview', label: 'make a new preview', est: `≈ ${fmtDur((est.preview || {}).seconds || 20)}` };
    } else if (st === 'approved') {
      H = 'design approved';
      M = 'ready for the full render.' + stale;
      G = { act: 'render', label: 'render it', est: fullLine(est, kind, resFor(v)) };
      if (kind === 'animation' && !v.baked) resRow.hidden = false;
    } else {
      H = 'do you like the design?';
      M = stale.trim();
      G = { act: 'approve', label: 'yes, render it', est: fullLine(est, kind, resFor(v)) };
      if (kind === 'animation' && !v.baked) resRow.hidden = false;
    }
    if (st !== 'failed') chgIn.placeholder = st === 'rendered' ? 'what should change in the design?' : 'or tell claude what to change…';
    head.textContent = H; msg.textContent = M; msg.hidden = !M;
    prog.hidden = !showProg; progT.hidden = !showProg || !P; progT.textContent = P;
    prog.classList.toggle('is-wait', showProg && st !== 'rendering' && !(job && job.state === 'running' && frac > 0));
    if (showProg) setProg(prog, st === 'rendering' || (job && frac > 0) ? frac : 0.35);
    if (!resRow.hidden) paintRes(v);
    goRow.hidden = goRow.hidden || !G;
    if (G) {
      go.dataset.act = G.act; go.textContent = G.label; goEst.textContent = G.est;
      go.classList.toggle('is-soft', G.act === 'newest' || G.act === 'cancel');
      go.classList.toggle('is-armed', G.act === 'cancel' && armed);
      go.disabled = busy;
    }
    chg.hidden = !showChg || old;
    if (!chg.hidden) {
      const d = drafts.get(v.id) || '';
      if (document.activeElement !== chgIn && chgIn.value !== d) chgIn.value = d;
      chgEst.textContent = iterLine(est);
      send.disabled = busy || !chgIn.value.trim();
    }
    fold.setAttribute('aria-expanded', mode === 'open' ? 'true' : 'false');
  }

  // ---- data
  function hot() { return Object.values(views).some(v => v.job || ACTIVE.includes(v.status)); }
  async function poll(now = false) {
    clearTimeout(pollT);
    if (!alive) return;
    const r = await api.blender.deck(deckId);
    if (!alive) return;
    if (r && r.ok !== false && r.slides) {
      const raw = JSON.stringify(r.slides);
      idle = raw === poll.raw ? idle + 1 : 0; poll.raw = raw;
      const before = views;
      views = r.slides;
      for (const v of Object.values(views)) {
        const key = `${(v.previews || []).length}|${(v.final || {}).at || ''}`;
        const was = mediaKey.get(v.id);
        mediaKey.set(v.id, key);
        if (!first && was != null && was !== key) {
          const pv = before[v.id];
          if (pv && pv.status === 'rendering' && v.status === 'rendered') sfx('done');
          else if (pv && pv.status !== 'preview' && v.status === 'preview') sfx('pop');
          try { onMedia(v.id); } catch (e) { /* optional */ }
        }
        if (v.status === 'rendered' && before[v.id] && before[v.id].status === 'rendering') editing.delete(v.id);
      }
      first = false;
      paint();
      try { onState(); } catch (e) { /* optional */ }
    } else idle++;
    pollT = setTimeout(poll, hot() ? 1200 : api.pace(5000, idle, { max: 15000, hidden: 8000 }));
  }
  const offs = [on('claude:event', d => {
    const ev = d && d.event;
    if (!ev || d.replay || ev.kind !== 'blender' || (ev.deck && ev.deck !== deckId)) return;
    clearTimeout(pollT); pollT = setTimeout(poll, /-progress$/.test(ev.code || '') ? 400 : 120);
  })];
  poll();

  return {
    setSlide(n) { if ((n | 0) === cur) return; cur = n | 0; armed = false; paint(); },
    gate: built => nextGate(views, built),
    rendering() {
      const v = Object.values(views).find(x => x.status === 'rendering');
      return v ? { n: v.n, progress: (v.job && v.job.progress) || 0, etaS: v.job ? v.job.etaS : null, queued: !!(v.job && v.job.state === 'queued') } : null;
    },
    get views() { return views; },
    get sid() { return sidNow(); },
    refresh: () => poll(true),
    destroy() { alive = false; clearTimeout(pollT); clearTimeout(noteT); clearTimeout(armT); offs.forEach(f => f()); card.remove(); },
  };
}
