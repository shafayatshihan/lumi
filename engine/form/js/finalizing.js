// Finalize progress screen (v0.5). Local tools only, no Claude: every 3D slide is recorded as a seamless 1080p loop,
// then the final HTML and a PDF backup go to "4 - Your slides". Shows "recording slide 5 of 8 · ~6 min left" with a
// Cancel (tap twice). The previous final stays until the new one is complete.
// mountFinalizing(el, { deckId, audio, onHome, onEdit }) -> { destroy() }
import * as api from './api.js';
import { h, ICON } from './plan.js';
import { emit } from './bus.js';

const mins = s => (s == null ? '' : s < 50 ? 'under a minute left' : `~${Math.max(1, Math.round(s / 60))} min left`);
const mb = n => (n >= 1048576 ? (n / 1048576).toFixed(n >= 10485760 ? 0 : 1) + ' MB' : Math.max(1, Math.round((n || 0) / 1024)) + ' KB');

export function mountFinalizing(el, { deckId, audio, onHome, onEdit } = {}) {
  const sfx = n => { try { audio && audio.sfx && audio.sfx(n); } catch (e) { /* optional */ } };
  let alive = true, pollT = 0, armed = 0, started = false, final = null, idle = 0, offTries = 0, since = 0;

  const badge = h('span', { class: 'badge' }, 'finalize');
  const head = h('h1', { class: 'q fz-h' }, 'finalizing your deck');
  const line = h('p', { class: 'fz-line', 'aria-live': 'polite' }, 'getting ready…');
  const bar = h('i');
  const meter = h('div', { class: 'fz-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, bar);
  const note = h('p', { class: 'fz-note' }, 'lumi records every moving 3D slide as a smooth video and makes a pdf backup. this runs on your computer and does not use claude.');
  const cancelB = h('button', { type: 'button', class: 'fz-b', 'data-cursor-label': 'cancel' }, 'cancel');
  const acts = h('div', { class: 'fz-acts' }, cancelB);
  const box = h('div', { class: 'fz' }, badge, head, line, meter, note, acts);
  el.replaceChildren(box);

  const btn = (label, fn, ink, icon) => { const b = h('button', { type: 'button', class: 'fz-b' + (ink ? ' fz-ink' : ''), 'data-nosfx': '' }, icon ? h('span', { html: ICON[icon] }) : null, label); b.addEventListener('click', fn); return b; };
  cancelB.addEventListener('click', async () => {
    if (!armed) { cancelB.textContent = 'tap again to cancel'; cancelB.classList.add('is-armed'); armed = setTimeout(() => { armed = 0; cancelB.textContent = 'cancel'; cancelB.classList.remove('is-armed'); }, 3000); return; }
    clearTimeout(armed); armed = 0; cancelB.disabled = true; cancelB.textContent = 'cancelling…';
    await api.finalize.cancel();
    poll();
  });

  function paint(st) {
    const of = st.of || 0, stillsOf = st.stillsOf || 0;
    let frac = 0;
    const rec = of ? ((Math.max(0, (st.slide || 1) - 1) + (st.frames ? (st.frame || 0) / st.frames : 0)) / of) : 1;
    const pdf = stillsOf ? (st.stills || 0) / stillsOf : 0;
    if (st.phase === 'record' || st.phase === 'encode') frac = (of ? 0.8 : 0) * rec;
    else if (st.phase === 'pdf') frac = (of ? 0.8 : 0) + (of ? 0.2 : 1) * pdf;
    else if (st.phase === 'write') frac = of ? 0.8 : 0.05;
    else if (st.phase === 'done') frac = 1;
    bar.style.transform = `scaleX(${Math.max(0.02, Math.min(1, frac))})`;
    meter.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
    const eta = mins(st.etaSec);
    line.textContent = st.phase === 'record' ? `recording slide ${st.slide || 1} of ${of}${eta ? ' · ' + eta : ''}`
      : st.phase === 'encode' ? `saving the video of slide ${st.slide || 1} of ${of}${eta ? ' · ' + eta : ''}`
      : st.phase === 'write' ? 'putting the final deck together…'
      : st.phase === 'pdf' ? `making the pdf backup · page ${Math.min((st.stills || 0) + 1, stillsOf)} of ${stillsOf}${eta ? ' · ' + eta : ''}`
      : 'getting ready…';
  }
  function finished(st) {
    clearTimeout(pollT);
    emit('finalize:state', { running: false });
    if (st.ok) {
      sfx('done');
      showDone(st.final || final, 'all done!');
    } else {
      sfx(st.phase === 'cancelled' ? 'deselect' : 'error');
      head.textContent = st.phase === 'cancelled' ? 'finalizing stopped' : 'that didn’t work';
      line.textContent = st.phase === 'cancelled' ? 'nothing changed. your previous final deck (if any) is still there.' : `${(st.message || 'something went wrong.').toLowerCase()}`;
      note.textContent = '';
      acts.replaceChildren(btn('try again', () => { reset(); start({ retry: true }); }, true), btn('back to the deck', () => onEdit && onEdit(deckId)), btn('my decks', () => onHome && onHome()));
    }
  }
  // The finished state, also shown when a finalized deck is opened again (W-05): nothing is re-recorded unless asked.
  function showDone(fin, title, again) {
    final = fin;
    head.textContent = title; badge.textContent = 'finalized';
    bar.style.transform = 'scaleX(1)';
    const size = fin && fin.htmlBytes ? ` (${mb(fin.htmlBytes)} deck${fin.pdfBytes ? ', ' + mb(fin.pdfBytes) + ' pdf' : ''})` : '';
    line.textContent = `your final deck and its pdf are in “4 - Your slides”.${size}`;
    const warn = (fin && fin.warnings || []).filter(Boolean);
    note.textContent = (warn.length ? 'one thing to know: ' + warn.join(' ') + ' ' : '') +
      (fin && fin.htmlBytes > 24 * 1048576 ? 'this file is big for e-mail: “smaller file” makes a lighter copy. ' : '') +
      'present plays this final file. before the day: open it once in microsoft edge or google chrome on the computer you will present from (firefox and old browsers may not show the 3D), and keep the pdf as your backup.';
    pptxLine.textContent = '';
    const row = [btn('present it', async () => { sfx('launch'); await api.openSlides(final && final.html); }, true, 'right'),
      btn('open the folder', () => api.openSlides()),
      btn('make a powerpoint copy', makePptx),
      btn('smaller file', () => { reset(); start({ light: true }); }),
      btn(again ? 'finalize again' : 'back to my decks', again ? () => { reset(); start({ force: true }); } : () => { sfx('back'); onHome && onHome(); })];
    if (again) row.push(btn('back to my decks', () => { sfx('back'); onHome && onHome(); }));
    acts.replaceChildren(...row);
    box.appendChild(pptxLine);
  }
  // D-01: the explicit PowerPoint action. Each slide becomes one picture (3D scenes become a still image) and the
  // speaker notes go in the notes pane, so edits are made in lumi, not in powerpoint.
  const pptxLine = h('p', { class: 'fz-note', 'aria-live': 'polite' });
  let pptxT = 0;
  async function makePptx() {
    pptxLine.textContent = 'making the powerpoint copy… each slide becomes one picture (3d scenes become a still image) and your speaker notes go in the notes pane.';
    const r = await api.pptx.start(deckId);
    if (!alive) return;
    if (!r || r.ok === false) { pptxLine.textContent = (r && r.reason) || 'the powerpoint copy could not start.'; return; }
    const tick = async () => {
      const st = await api.pptx.status(deckId);
      if (!alive) return;
      if (st && st.running) { pptxT = setTimeout(tick, 1200); return; }
      if (st && st.ok !== false && st.pptx) { sfx('done'); pptxLine.textContent = `the powerpoint copy is in “4 - Your slides” (${mb(st.pptx.bytes)}). edit the slides here in lumi and make the copy again; in powerpoint they are pictures.`; }
      else pptxLine.textContent = ((st && st.message) || 'the powerpoint copy did not work.').toLowerCase();
    };
    tick();
  }
  // contract section 10: finalize only embeds studio renders, it never makes them. A slide without its full render (409
  // blender-pending) sends the person back to that slide; a render older than its design (409 blender-stale) is their call.
  async function showBlender(r, opts) {
    const pending = r.error === 'blender-pending', nums = (r.slides || []).map(Number).filter(Boolean);
    clearTimeout(pollT); sfx('pop');
    const [pl, bv] = await Promise.all([api.plan.get(deckId), api.blender.deck(deckId)]);
    if (!alive) return;
    const slides = (pl && pl.plan && pl.plan.slides) || [], views = Object.values((bv && bv.slides) || {});
    const one = nums.length === 1;
    badge.textContent = 'finalize';
    head.textContent = pending ? (one ? 'one studio render isn’t finished' : `${nums.length} studio renders aren’t finished`) : (one ? 'a studio render is older than its design' : 'some studio renders are older than their design');
    line.textContent = pending ? 'finalize puts finished renders into the deck; it never makes them. approve each design and let lumi render it, then finalize again.'
      : `${one ? 'this slide' : 'these slides'} changed after the last full render, so the deck still shows the older picture. render again, or finalize with the older render.`;
    bar.style.transform = 'scaleX(.02)';
    const why = v => !v ? '' : v.status === 'rendering' ? `rendering now · ${Math.round(((v.job || {}).progress || 0) * 100)}%`
      : v.status === 'failed' ? 'the last try didn’t work' : v.status === 'previewing' || v.status === 'changing' ? 'a new preview is on its way'
      : v.status === 'approved' ? 'approved, not rendered yet' : v.deferred ? 'kept as a preview for now' : pending ? 'waiting for you to approve the design' : 'the design changed after the render';
    note.replaceChildren(h('span', { class: 'fz-bl' }, ...nums.map(n => {
      const s = slides[n - 1] || {}, v = views.find(x => x.n === n);
      const goB = btn(`go to slide ${n}`, () => { sfx('slide'); onEdit && onEdit(deckId, n); });
      goB.classList.add('fz-bl-go');
      return h('span', { class: 'fz-bl-row' }, h('span', { class: 'fz-bl-n' }, String(n)),
        h('span', { class: 'fz-bl-t' }, h('b', {}, s.title || `slide ${n}`), h('span', {}, why(v))), goB);
    })));
    acts.replaceChildren(...(pending
      ? [btn('check again', () => { reset(); start({ ...opts, retry: true }); }, true), btn('my decks', () => { sfx('back'); onHome && onHome(); })]
      : [btn('use it anyway', () => { reset(); start({ ...opts, retry: true, acceptStale: true }); }, true), btn('my decks', () => { sfx('back'); onHome && onHome(); })]));
  }
  function reset() {
    head.textContent = 'finalizing your deck'; badge.textContent = 'finalize';
    line.textContent = 'getting ready…'; bar.style.transform = 'scaleX(.02)';
    note.textContent = 'lumi records every moving 3D slide as a smooth video and makes a pdf backup. this runs on your computer and does not use claude.';
    cancelB.disabled = false; cancelB.textContent = 'cancel'; acts.replaceChildren(cancelB); pptxLine.remove(); clearTimeout(pptxT);
  }
  async function poll() {
    clearTimeout(pollT);
    const st = await api.finalize.status();
    if (!alive) return;
    // F-19: an unreachable server is said out loud and polled gently, never a silent "getting ready…" at full speed
    if (st && st.error === 'offline') { line.textContent = 'can’t reach lumi. trying again…'; pollT = setTimeout(poll, api.pace(1500, ++offTries, { max: 8000 })); return; }
    offTries = 0;
    if (st && st.deckId === deckId) {
      if (st.running) { idle = 0; emit('finalize:state', { running: true }); paint(st); pollT = setTimeout(poll, api.pace(600, 0)); return; }
      if (started) return finished(st);
    }
    // it was started but this deck never shows up as running: after 20 s say so instead of waiting for ever
    if (started && since && Date.now() - since > 20000) { started = false; return finished({ ok: false, phase: 'failed', message: 'finalizing did not start. try again.' }); }
    pollT = setTimeout(poll, api.pace(800, ++idle, { max: 3000 }));
  }
  async function start(opts = {}) {
    const cur = await api.finalize.status();
    if (!alive) return;
    if (cur && cur.running && cur.deckId === deckId) { started = true; since = Date.now(); return poll(); }
    if (!opts.light && !opts.force && !opts.retry) {
      // W-05: a deck that is already finalized and unchanged is shown finished, never re-recorded just by opening this page
      const d = await api.decks.get(deckId);
      if (!alive) return;
      const rec = d && d.deck;
      if (rec && rec.finalized && !rec.changedSinceFinalize && rec.final) return showDone(rec.final, 'already finalized', true);
    }
    const r = await api.finalize.start(deckId, { ...(opts.light ? { light: true } : {}), ...(opts.acceptStale ? { acceptStale: true } : {}) });
    if (!alive) return;
    if (r && (r.error === 'blender-pending' || r.error === 'blender-stale')) { started = false; return showBlender(r, opts); }
    if (!r || r.ok === false) {
      started = false;
      return finished({ ok: false, phase: 'failed', message: r && r.error === 'offline' ? 'can’t reach lumi. nothing was started. try again in a moment.' : r && r.reason ? r.reason : r && r.error === 'finalizing' ? 'another deck is being finalized. wait for it to finish.' : 'finalize could not start.' });
    }
    started = true; since = Date.now(); sfx('launch'); poll();
  }
  start();
  return { destroy() { alive = false; emit('finalize:state', { running: false }); clearTimeout(pollT); clearTimeout(armed); clearTimeout(pptxT); el.replaceChildren(); } };
}
