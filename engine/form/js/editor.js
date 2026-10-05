// The editor for one deck. Left: slide thumbnails (paged, never scrolls). Centre: the live deck in edit mode
// (/deck/<id>/?aura=edit#n, synced by postMessage), with a direct text tweak box when a text is clicked. Right: the
// editing bench illustration above the Claude chat (workshop.js in 'edit' mode: [slide N] replies, hints, choices,
// a folder button for files).
// mountEditor(el, { deckId, slide, audio, bus, sceneCtx, mountScene, onHome, onFinalize, build }) -> { destroy() }
// v0.5: the same pieces make the "build my deck" page (build: true): the strip holds the slides built so far, a build
// bar under the preview (build deck / make next slide / build the rest for me / stop / i'm happy, finalize), a
// "coming up" column of the unbuilt slides (tap one: a small plan card with Save) instead of the bench illustration.
// While Claude runs, next / build the rest / going back are locked. The finished-deck editor gets a finalize button and
// "present" plays only the finalized file.
import * as api from './api.js';
import { on, claudeNow, setClaude } from './bus.js';
import { pace } from './api.js';
import { openDialog, roving, syncTab, announce } from './a11y.js';
import { mountWorkshop, toolLine } from './workshop.js';
import { markersOf } from './markers.js';
import { slideEditor, ICON, clearLater } from './plan.js';
import { mountPlay } from './lumi-play.js';
import { mountBlenderCard, fmtLeft } from './blender.js';

const PER_PAGE = 6;
import { h } from './dom.js';
import { ICON as ICONS } from './dom.js';
const SVG = { back: ICONS.back, up: ICONS.up, down: ICONS.down, left: ICONS.left, right: ICONS.rright, play: ICONS.play, folder: ICONS.folder, pen: ICONS.pen,
  tip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"/></svg>',
};
const QUALITY = { best: 'best quality', maximum: 'maximum', balanced: 'balanced', fast: 'fast' };

export function mountEditor(el, { deckId, slide = 1, audio, bus, sceneCtx, mountScene, onHome, onFinalize, build = false } = {}) {
  const sfx = n => { try { audio && audio.sfx && audio.sfx(n); } catch (e) { /* optional */ } };
  let alive = true, deck = null, cur = Math.max(1, slide | 0), count = 0, page = 0, thumbs = [], runtime = false, shim = null;
  let loadT = 0, scene = null, chat = null, editing = null, thumbsT = 0, thumbsVer = 0;
  // F-10: no private copy of "claude is running": it is read from the one shared answer (bus.js), which both the events poll
  // (workshop.js) and this page's plan poll keep up to date, the freshest report winning.
  const isBusy = () => claudeNow(deckId).running;
  let blc = null;                                   // the studio-render card (blender.js), mounted below
  let buildVeil = false;                            // the build page put its own "claude is building" veil up
  let wasBusy = false, acting = false, planVer = 0, planIdle = 0, planRaw = '', loadFails = 0, modalRel = null;
  const offs = [];

  // ---------------------------------------------------------------- layout
  const homeBtn = h('button', { type: 'button', class: 'ed-home', 'data-cursor-label': 'library' }, h('span', { html: SVG.back }), 'my decks');
  const title = h('h1', { class: 'ed-title' }, 'opening your deck…');
  const upB = h('button', { type: 'button', class: 'pg', 'aria-label': 'earlier slides', html: SVG.up });
  const downB = h('button', { type: 'button', class: 'pg', 'aria-label': 'later slides', html: SVG.down });
  const stripList = h('div', { class: 'ed-strip-list', role: 'listbox', 'aria-label': 'slides' });
  roving(stripList, '.ed-th', { select: false, orientation: 'vertical' });
  const stripPg = h('span', { class: 'ed-strip-pg' });
  const strip = h('div', { class: 'ed-strip' }, h('div', { class: 'ed-strip-top' }, h('span', { class: 'ed-strip-t' }, 'slides'), stripPg, upB), stripList, h('div', { class: 'ed-strip-bot' }, downB));

  const frame = h('iframe', { class: 'ed-frame', title: 'your deck', tabindex: '-1' });
  const veil = h('div', { class: 'ed-veil' }, h('span', { class: 'ed-spin' }), h('span', {}, 'loading your slides…'));
  const work = h('div', { class: 'ed-work', hidden: true }, h('i', { class: 'ed-work-dot' }), h('span', { class: 'ed-work-t' }, 'claude is working on this deck'));
  const pop = h('div', { class: 'ed-pop', hidden: true, role: 'dialog', 'aria-label': 'change this text' });
  const preview = h('div', { class: 'ed-preview' }, frame, veil, work, pop);

  const prevB = h('button', { type: 'button', class: 'pg', 'aria-label': 'previous slide', html: SVG.left });
  const nextB = h('button', { type: 'button', class: 'pg', 'aria-label': 'next slide', html: SVG.right });
  const posTxt = h('span', { class: 'ed-pos' }, 'slide 1');
  const slideName = h('span', { class: 'ed-sname' });
  const presentB = h('button', { type: 'button', class: 'ed-act ed-ink', 'data-cursor-label': 'present' }, h('span', { html: SVG.play }), 'present');
  const folderB = h('button', { type: 'button', class: 'ed-act', 'aria-label': 'open the slides folder', title: 'open the slides folder', 'data-cursor-label': 'folder', html: SVG.folder });
  const finB = h('button', { type: 'button', class: 'ed-act ed-fin', 'data-cursor-label': 'finalize' }, h('span', { html: ICON.tick }), h('span', {}, 'finalize'));
  const nav = h('div', { class: 'ed-nav' }, prevB, posTxt, nextB, slideName, h('span', { class: 'ed-gap' }), build ? null : finB, build ? null : presentB, build ? null : folderB);

  const tip = h('div', { class: 'ed-tip' }, h('span', { class: 'ed-tip-i', html: SVG.tip }),
    h('p', {}, h('span', { class: 'ed-tip-h' }, 'click any text'), ' on the slide to change it yourself. bigger changes? ask claude on the right.'));
  const stats = h('div', { class: 'ed-stats' });
  const toast = h('p', { class: 'ed-toast', role: 'status' });
  const bench = h('div', { class: 'ed-bench' });
  const chatHost = h('div', { class: 'ed-chat' });
  // build page: the build bar, the "coming up" column and its popup
  const bdMain = h('button', { type: 'button', class: 'bd-main', 'data-nosfx': '', 'data-cursor-label': 'build' }, h('span', { class: 'lbl' }, 'build deck'), h('span', { html: ICON.right }));
  const bdRest = h('button', { type: 'button', class: 'bd-rest', 'data-nosfx': '', 'data-cursor-label': 'build all' }, 'build the rest for me');
  const bdStop = h('button', { type: 'button', class: 'bd-stop', 'data-nosfx': '', 'data-cursor-label': 'stop', hidden: true }, h('i'), 'stop');
  const bdSay = h('p', { class: 'bd-say', 'aria-live': 'polite' });
  // the secondary action ("build the rest for me") is tucked behind a small "more" toggle that opens in place
  const bdMore = h('button', { type: 'button', class: 'bd-more', 'aria-expanded': 'false', 'aria-label': 'more options', title: 'more options', 'data-cursor-label': 'more',
    html: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><circle cx="6" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="18" cy="12" r="2"/></g></svg>' });
  const bdBar = h('div', { class: 'bd-bar' }, bdMain, bdMore, bdRest, bdStop);
  let moreOpen = false;
  bdMore.addEventListener('click', () => { moreOpen = !moreOpen; sfx(moreOpen ? 'pop' : 'deselect'); paintBuild(); });
  const upList = h('div', { class: 'bd-up-list' });
  const upCol = h('div', { class: 'bd-up' }, h('div', { class: 'bd-up-top' }, h('span', { class: 'bd-up-t' }, 'coming up'), h('span', { class: 'bd-up-n' })), upList);
  const modal = h('div', { class: 'pl-modal bd-modal', hidden: true });
  const qdock = h('div', { class: 'bd-qdock' });              // claude's questions, docked under the preview (the slide stays visible)
  const playHost = h('div', { class: 'bd-playhost' });        // something to do while claude works + what it is doing now
  const blDock = h('div', { class: 'bl-dock' });              // a Blender slide's studio render: preview, "do you like the design?", render
  el.replaceChildren(...(build ? [homeBtn, title, strip, preview, nav, bdBar, bdSay, stats, toast, upCol, qdock, playHost, blDock, chatHost, modal]
    : [homeBtn, title, strip, preview, nav, tip, stats, toast, bench, blDock, chatHost]));

  let toastT = 0;
  const say = (t, bad) => { toast.textContent = t; toast.classList.toggle('bad', !!bad); toast.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('show'), 3800); };

  // ---------------------------------------------------------------- slides + preview
  const deckUrl = (v = '') => `/deck/${encodeURIComponent(deckId)}/?aura=edit${v ? '&v=' + v : ''}#${cur}`;
  function loadFrame(v) {
    runtime = false; shim = null; buildVeil = false;
    veil.hidden = false;
    frame.src = deckUrl(v);
  }
  frame.addEventListener('load', () => {
    if (!alive) return;
    clearTimeout(loadT);
    // A deck without the Aura runtime (made by hand, or by the test stand-in) gets a small same-origin shim instead.
    loadT = setTimeout(() => { if (alive && !runtime) installShim(); }, 650);
  });
  function onMessage(e) {
    if (!alive || e.source !== frame.contentWindow || !e.data || typeof e.data !== 'object') return;
    const d = e.data;
    if (d.aura === 'slide') {
      runtime = true; veil.hidden = true;
      if (d.count) count = d.count | 0;
      if (d.index && d.index !== cur) { cur = d.index | 0; changed(); } else paintAll();
    } else if (d.aura === 'edit') openEdit(String(d.id || ''), String(d.text || ''), d.slide | 0);
  }
  addEventListener('message', onMessage);

  function installShim() {
    let doc;
    try { doc = frame.contentDocument; } catch (e) { doc = null; }
    if (!doc || !doc.body) { veil.hidden = true; return; }
    const slides = [...doc.querySelectorAll('.slide')].length ? [...doc.querySelectorAll('.slide')] : [...doc.querySelectorAll('body > section')];
    const st = doc.createElement('style');
    st.textContent = 'html,body{margin:0!important;overflow:hidden!important}body{width:1920px;height:1080px;transform-origin:0 0}' +
      '.aura-shim-off{display:none!important}[data-edit]{cursor:text;border-radius:8px;transition:outline-color .2s}' +
      '[data-edit]:hover{outline:4px solid var(--lilac);outline-offset:8px}';
    doc.head.append(st);
    const fitShim = () => { try { doc.body.style.transform = `scale(${frame.clientWidth / 1920})`; } catch (e) { /* gone */ } };
    const show = n => slides.forEach((s, i) => s.classList.toggle('aura-shim-off', i !== n - 1));
    doc.addEventListener('click', ev => {
      const t = ev.target && ev.target.closest && ev.target.closest('[data-edit]');
      ev.preventDefault();
      if (!t || t.getAttribute('data-edit') === 'no') return;
      const n = slides.findIndex(s => s.contains(t)) + 1;
      openEdit(t.getAttribute('data-edit'), t.textContent.trim(), n || cur);
    }, true);
    shim = { go: n => show(n), fit: fitShim, slides };
    count = slides.length;
    cur = Math.min(Math.max(1, cur), count || 1);
    fitShim(); show(cur);
    veil.hidden = true;
    paintAll();
  }
  function go(n, { sound = true } = {}) {
    if (!count) return;
    n = Math.min(Math.max(1, n), count);
    if (n === cur) return;
    cur = n;
    if (sound) sfx('slide');
    if (shim) shim.go(n);
    else try { frame.contentWindow.postMessage({ aura: 'go', index: n - 1 }, location.origin); } catch (e) { /* not ready */ }
    changed();
  }
  function changed() {
    closeEdit();
    page = Math.floor((cur - 1) / PER_PAGE);
    paintAll();
    if (chat) chat.setSlide(cur);
    if (blc) blc.setSlide(cur);
  }
  const ro = new ResizeObserver(() => { if (shim) shim.fit(); });
  ro.observe(frame);

  function slideTitle(n) {
    const t = thumbs.find(x => x.n === n);
    if (t && t.title) return t.title;
    if (shim && shim.slides[n - 1]) { const hh = shim.slides[n - 1].querySelector('h1,h2,h3'); if (hh) return hh.textContent.trim(); }
    return '';
  }
  function paintStrip() {
    const n = count || thumbs.length;
    const pages = Math.max(1, Math.ceil(n / PER_PAGE));
    page = Math.min(Math.max(0, page), pages - 1);
    const items = [];
    for (let i = page * PER_PAGE + 1; i <= Math.min(n, page * PER_PAGE + PER_PAGE); i++) {
      const t = thumbs.find(x => x.n === i);
      const pic = h('span', { class: 'ed-th-pic' + (t ? '' : ' is-loading') });
      if (t) { const img = new Image(); img.alt = ''; img.decoding = 'async'; img.src = t.url; img.onerror = () => { pic.classList.add('is-loading'); img.remove(); }; pic.append(img); }
      else pic.append(h('span', { class: 'hm-shimmer' }));
      const b = h('button', { type: 'button', class: 'ed-th' + (i === cur ? ' on' : ''), role: 'option', 'aria-selected': i === cur ? 'true' : 'false',
        'data-n': i, 'data-cursor-label': `slide ${i}`, 'data-nosfx': '' }, pic, h('span', { class: 'ed-th-n' }, String(i)));
      b.addEventListener('click', () => go(i));
      items.push(b);
    }
    if (!n) for (let i = 1; i <= 4; i++) items.push(h('span', { class: 'ed-th ed-th-ghost' }, h('span', { class: 'ed-th-pic is-loading' }, h('span', { class: 'hm-shimmer' }))));
    const hadFocus = stripList.contains(document.activeElement) ? document.activeElement.dataset.n : null;
    stripList.replaceChildren(...items);
    syncTab(stripList, '.ed-th');                      // F-13: one tab stop, arrows move between the thumbnails
    if (hadFocus) { const b = stripList.querySelector(`.ed-th[data-n="${hadFocus}"]`); if (b) b.focus({ preventScroll: true }); }
    upB.disabled = page === 0; downB.disabled = page >= pages - 1;
    upB.hidden = downB.hidden = pages <= 1;
    stripPg.textContent = n ? `${n}` : '';
  }
  function paintAll() {
    paintStrip();
    posTxt.textContent = count ? `slide ${cur} of ${count}` : `slide ${cur}`;
    const st = slideTitle(cur);
    slideName.textContent = st;
    slideName.title = st;
    prevB.disabled = cur <= 1; nextB.disabled = !count || cur >= count;
    if (scene) scene.update({ editor: { count: count || thumbs.length || 5, selected: cur } });
  }
  upB.addEventListener('click', () => { page--; sfx('slide'); paintStrip(); });
  downB.addEventListener('click', () => { page++; sfx('slide'); paintStrip(); });
  prevB.addEventListener('click', () => go(cur - 1));
  nextB.addEventListener('click', () => go(cur + 1));

  async function loadThumbs(tries = 0) {
    const ver = ++thumbsVer;
    const r = await api.decks.slides(deckId);
    if (!alive || ver !== thumbsVer) return;
    if (r && r.ok && Array.isArray(r.slides)) {
      thumbs = r.slides;
      if (!count) count = r.count || thumbs.length;
      paintAll();
    } else if (tries < 2) thumbsT = setTimeout(() => loadThumbs(tries + 1), 2500);
    else paintAll();
  }

  // ---------------------------------------------------------------- direct text tweak
  function openEdit(id, text, n) {
    if (!id || id === 'no') return;
    if (n && n !== cur) { cur = n; paintAll(); if (chat) chat.setSlide(cur); }
    editing = { id, text };
    sfx('pop');
    const ta = h('textarea', { class: 'ed-pop-in', rows: '2', maxlength: '4000', 'aria-label': 'new text' });
    ta.value = text;
    const msg = h('p', { class: 'ed-pop-msg', role: 'alert' });
    const save = h('button', { type: 'button', class: 'ed-pop-save', 'data-nosfx': '', 'data-cursor-label': 'save' }, 'save');
    const cancel = h('button', { type: 'button', class: 'ed-pop-cancel', 'data-cursor-label': 'cancel' }, 'cancel');
    pop.replaceChildren(h('div', { class: 'ed-pop-head' }, h('span', { class: 'ed-pop-i', html: SVG.pen }), h('span', {}, 'change this text'),
      h('span', { class: 'ed-pop-id' }, `slide ${cur}`)), ta, msg, h('div', { class: 'ed-pop-b' }, cancel, save));
    pop.hidden = false;
    pop.classList.remove('ed-in'); void pop.offsetWidth; pop.classList.add('ed-in');
    const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 130) + 'px'; };
    fit();
    ta.addEventListener('input', () => { fit(); msg.textContent = ''; pop.classList.remove('is-bad'); });
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); save.click(); }
      if (e.key === 'Escape') { e.preventDefault(); closeEdit(); }
    });
    cancel.addEventListener('click', () => closeEdit());
    save.addEventListener('click', async () => {
      const value = ta.value.trim();
      if (!value) { msg.textContent = 'type something first (or press cancel).'; pop.classList.add('is-bad'); sfx('error'); return; }
      if (value === text.trim()) { closeEdit(); return; }
      save.disabled = true; save.textContent = 'saving…';
      for (let i = 0; i < 6 && alive; i++) {      // Claude's run may still be closing for a moment after it finished
        const st = await api.claude.status();
        if (!(st && st.running && (!st.deckId || st.deckId === deckId))) break;
        await new Promise(res => setTimeout(res, 800));
      }
      if (!alive) return;
      let r = await api.decks.text(deckId, id, value);
      // right after Claude finishes, the server can still be closing its run for a moment: try a few more times
      for (let i = 0; i < 4 && alive && r && (r.status === 409 || r.error === 'busy') && !isBusy(); i++) {
        await new Promise(res => setTimeout(res, 1200));
        r = await api.decks.text(deckId, id, value);
      }
      if (!alive) return;
      save.disabled = false; save.textContent = 'save';
      if (r && r.ok) {
        sfx('success'); closeEdit(); say('saved. the slide is updated.');
        loadFrame(r.mtime || Date.now()); thumbs = []; paintStrip(); loadThumbs();
        return;
      }
      sfx('error');
      pop.classList.add('is-bad');
      pop.animate && pop.animate([0, -8, 7, -5, 3, 0].map(x => ({ transform: `translateX(calc(-50% + ${x}px))` })), { duration: 420 });
      msg.textContent = r && r.error === 'rules' ? `${friendlyRule(r.reason)} your slide wasn’t changed.`
        : r && (r.status === 409 || r.error === 'busy') ? 'claude is working on this deck right now. try again when it’s done.'
        : r && r.error === 'no-element' ? 'that text can’t be found any more. the slide may have changed.'
        : r && r.error === 'offline' ? 'couldn’t reach lumi. is it still running?' : 'couldn’t save that. try again?';
    });
    requestAnimationFrame(() => { ta.focus({ preventScroll: true }); ta.select(); });
  }
  const friendlyRule = reason => {
    const s = String(reason || '').trim();
    return s ? s.charAt(0).toLowerCase() + s.slice(1).replace(/\.?$/, '.') : 'text on a slide must stay 26 px or bigger, so try fewer words.';
  };
  function closeEdit() { editing = null; pop.hidden = true; pop.classList.remove('is-bad'); }

  // ---------------------------------------------------------------- deck info + actions
  let deckT = 0, deckFails = 0;
  async function loadDeck() {
    clearTimeout(deckT);
    const r = await api.decks.get(deckId);
    if (!alive) return;
    if (!r || r.ok === false || !r.deck) {
      // F-19: only a real 404 means the deck is gone; an unreachable server says so and keeps trying
      if (r && r.status === 404) { title.textContent = 'deck not found'; say('this deck isn’t in your library any more.', true); veil.hidden = true; return; }
      title.textContent = 'can’t reach lumi. trying again…'; veil.hidden = false; veil.lastChild.textContent = 'can’t reach lumi. trying again…';
      deckT = setTimeout(loadDeck, pace(3000, ++deckFails, { max: 10000 }));
      return;
    }
    if (deckFails) { deckFails = 0; veil.lastChild.textContent = 'loading your slides…'; if (!build) loadFrame(); else veil.hidden = true; }
    deck = r.deck;
    title.textContent = deck.title || 'untitled deck';
    title.title = deck.title || '';
    const look = deck.look && deck.look !== 'Claude chooses' ? deck.look.toLowerCase() : 'claude’s look';
    stats.replaceChildren(...[h('span', { class: 'ed-stat' }, look), h('span', { class: 'ed-stat' }, QUALITY[deck.quality] || 'balanced'),
      deck.exists ? null : h('span', { class: 'ed-stat bad' }, 'file missing')].filter(Boolean));
    presentB.disabled = !deck.final;
    presentB.title = deck.final ? 'present the finalized deck' : 'finalize the deck first, then present it';
    finB.lastChild.textContent = deck.finalizing ? 'finalizing…' : !deck.finalized ? 'finalize' : deck.changedSinceFinalize ? 'finalize again' : 'finalized';
    finB.classList.toggle('is-due', !deck.finalized || !!deck.changedSinceFinalize);
    finB.disabled = !deck.exists;
    if (!deck.exists && !build) { veil.hidden = false; veil.lastChild.textContent = 'this deck’s file is missing'; }
    if (build) paintBuild();
  }
  presentB.addEventListener('click', async () => { if (!deck || !deck.final) return; sfx('launch'); const r = await api.openSlides(deck.final.html); if (alive && r && r.ok === false) say('couldn’t open it. try the folder.', true); });
  finB.addEventListener('click', () => { if (isBusy()) { say('wait until claude is done, then finalize.', true); return; } sfx('launch'); onFinalize && onFinalize(deckId); });
  folderB.addEventListener('click', async () => { const r = await api.openSlides(); if (alive && r && r.ok === false) say('couldn’t open the folder.', true); });
  // W-04: leaving while claude works is safe: the run lives on the server, the library shows "claude is working" on the
  // deck, and opening it again comes straight back to this page.
  homeBtn.addEventListener('click', () => { sfx('back'); onHome && onHome(); });

  const onKey = e => {
    if (!alive || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if ((modal && !modal.hidden) || !pop.hidden || document.querySelector('.ws-pop')) return;       // F-12: arrows never move the deck behind a dialog
    const t = e.target;
    if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) return;
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(cur - 1); }
    else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(cur + 1); }
  };
  addEventListener('keydown', onKey);

  function syncBusy(poke = false) {
    const now = isBusy(), was = wasBusy;
    wasBusy = now;
    work.hidden = !now;
    preview.classList.toggle('is-busy', now);
    if (now) closeEdit();
    if (build) { if (was !== now || poke) { planIdle = 0; loadPlan(); } paintBuild(); paintPlay(); }
  }
  offs.push(on('claude:state', d => { if (!d || (d.deckId && d.deckId !== deckId)) return; syncBusy(!!d.waiting); }));
  offs.push(on('claude:change', () => syncBusy()));
  // what claude is doing right now, from the same events the chat shows
  const STAGE_SAY = { ready: 'getting ready', read: 'reading your files', plan: 'planning the slide', build: 'building the slide', check: 'checking the slide', export: 'saving the copies', done: 'finishing up' };
  let nowLine = '', nowStage = '';
  offs.push(on('claude:event', d => {
    const ev = d && d.event;
    if (!build || !ev || (d.deckId && d.deckId !== deckId)) return;
    if (ev.kind === 'tool') nowLine = toolLine(ev);
    else if (ev.kind === 'stage' && STAGE_SAY[ev.stage]) nowStage = STAGE_SAY[ev.stage];
    else if (ev.kind === 'say') { const st = markersOf(ev.text, 'stage').pop(); if (st && STAGE_SAY[st.attrs.value]) nowStage = STAGE_SAY[st.attrs.value]; }
    else if (ev.kind === 'status' && ev.code === 'start') { nowLine = ''; nowStage = ''; }
    if (!d.replay) paintPlay();
  }));
  let play = null;
  function paintPlay() {
    if (!build) return;
    if (!play) play = mountPlay(playHost);
    const running = isBusy();
    const slides = planSlides();
    const target = pay && slides.find(x => x.id === pay.buildTarget);
    const ti = target ? slides.indexOf(target) + 1 : pay ? pay.built + 1 : 0;
    const rnd = !running && blc ? blc.rendering() : null;       // a full Blender render is a wait too (no next slide meanwhile)
    if (rnd) play.setStep({ head: rnd.queued ? `slide ${rnd.n} waits for another render` : `lumi is rendering slide ${rnd.n} · ${Math.round(rnd.progress * 100)}%`,
      sub: `${fmtLeft(rnd.etaS) || 'starting'}. it runs on this computer and uses no claude tokens.` });
    else play.setStep({ head: nowLine || nowStage || 'getting started', sub: ti && pay ? `slide ${ti} of ${pay.count}${pay.buildRest ? ', then the rest' : ''}` : 'claude is working' });
    play.setRunning(!!running || !!rnd);
  }

  // ---------------------------------------------------------------- the plan of the slide a question is about
  // ref: the marker's slide="" (a 1-based number or a plan id); without one, the slide being built right now
  async function slideInfo(ref) {
    const r = await api.plan.get(deckId);
    if (r && r.ok) pay = r;
    if (!pay) return null;
    const slides = planSlides();
    ref = String(ref || '').trim().toLowerCase();
    let i = /^\d+$/.test(ref) ? parseInt(ref, 10) - 1 : slides.findIndex(x => x.id === ref);
    if (!(i >= 0 && i < slides.length)) i = slides.findIndex(x => x.id === pay.buildTarget);
    if (!(i >= 0 && i < slides.length)) return null;
    const sl = slides[i], n = i + 1;
    const want = () => { const t = thumbs.find(x => x.n === n); return t && (sl.built || n <= count) ? t.url : null; };
    // the plan shows at once; the thumbnail (the server renders it) follows when it is ready
    return { info: { n, id: sl.id, title: sl.title, point: sl.point, bullets: sl.bullets || [], visual: sl.visual || {}, sources: sl.sources || [], built: !!sl.built },
      thumb: want(), later: (sl.built || n <= count) && !want() ? loadThumbs().then(want, () => null) : null };
  }

  // ---------------------------------------------------------------- mount
  // ---------------------------------------------------------------- build page
  let pay = null, planT = 0, ideasWas = false;
  const UP_PER = 3;
  const planSlides = () => (pay && pay.plan && pay.plan.slides) || [];          // F-11: one guarded way to read the slides
  async function loadPlan() {
    if (!build) return;
    clearTimeout(planT);
    const ver = ++planVer;                                                     // F-12: only the newest answer is used, an older one that lands late is dropped
    const r = await api.plan.get(deckId);
    if (!alive || ver !== planVer) return;
    if (r && r.ok) {
      loadFails = 0;
      const raw = JSON.stringify(r);
      planIdle = raw === planRaw ? planIdle + 1 : 0; planRaw = raw;
      setClaude({ running: !!r.running, deckId });
      const before = pay ? pay.built : -1;
      pay = r;
      if (before < 0 && r.exists) { loadFrame(r.mtime || Date.now()); loadThumbs(); }
      else if (before >= 0 && r.built !== before && r.exists) {      // a slide was just finished: show it
        sfx('done');
        say(r.built >= r.count ? 'every slide is built. have a last look, then finalize.' : `slide ${r.built} is ready. have a look.`);
        cur = Math.max(1, r.built); count = 0; thumbs = [];
        loadFrame(r.mtime || Date.now()); paintStrip(); loadThumbs(); loadDeck();
        if (blc) blc.setSlide(cur);
      }
      paintBuild();
      paintPlay();
      const ok = !!(pay && pay.exists && pay.built >= cur);
      if (chat && ok !== ideasWas) { ideasWas = ok; chat.setSlide(cur); }
    } else { loadFails++; if (!pay) paintBuild(); }
    // F-09: while nothing changes the poll slows down (and again in a hidden tab or with the server away); any change resets it
    const hot = isBusy() || (pay && pay.buildRest);
    planT = setTimeout(loadPlan, loadFails ? pace(3000, loadFails, { max: 10000 }) : hot ? pace(1500, planIdle, { max: 4000 }) : pace(5000, planIdle, { max: 15000, hidden: 8000 }));
  }
  function paintBuild() {
    if (!build) return;
    if (!pay) {                                                                // F-19: never a silent blank page
      bdSay.textContent = loadFails ? 'can’t reach lumi. trying again…' : 'opening your deck…';
      bdMain.disabled = true;
      return;
    }
    const n = pay.count, b = pay.built, running = isBusy() || !!pay.running, waiting = pay.waiting && !running;
    const allDone = n > 0 && b >= n;
    const slides = planSlides();
    const target = slides.find(s => s.id === pay.buildTarget);
    bdMain.querySelector('.lbl').textContent = allDone ? 'i’m happy, finalize' : b === 0 ? 'build deck' : 'make next slide';
    bdMain.classList.toggle('is-final', allDone);
    bdMain.disabled = running || acting || (waiting && !allDone);
    bdMore.hidden = allDone || b === 0;
    bdRest.hidden = allDone || b === 0 || !moreOpen;
    bdMore.setAttribute('aria-expanded', moreOpen && !bdRest.hidden ? 'true' : 'false');
    bdMore.classList.toggle('on', moreOpen && !bdRest.hidden);
    bdRest.disabled = running || acting || waiting;
    // contract section 9 + batch 3: the next slide waits until every built studio-render slide is rendered (or kept as a preview on purpose)
    const gate = blc && !allDone ? blc.gate(b) : { ok: true };
    if (!gate.ok) { bdMain.disabled = true; bdRest.disabled = true; }
    bdStop.hidden = !running;
    homeBtn.title = running ? 'claude keeps building while you look at other decks' : '';
    const ti = target ? slides.indexOf(target) + 1 : b + 1;
    bdSay.textContent = running ? `claude is building slide ${ti} of ${n}${pay.buildRest ? ', then the rest' : ''}…`
      : waiting ? 'claude has a question. answer it under the slide, one step at a time.'
      : !gate.ok ? gate.text
      : allDone ? `all ${n} slides are built. change anything you like, then finalize.`
      : b === 0 ? 'claude builds slide 1 first. it also sets up the look of the whole deck.'
      : `slide ${b} of ${n} is ready. check it, change it if you like, then make the next one.`;
    bdSay.classList.toggle('is-busy', running);
    if (!pay.exists) { veil.hidden = false; buildVeil = true; veil.lastChild.textContent = running ? 'claude is building slide 1…' : 'press “build deck” to make slide 1'; }
    else if (buildVeil) { buildVeil = false; veil.lastChild.textContent = 'loading your slides…'; loadFrame(pay.mtime || Date.now()); }     // the file is back (a repack): show it again
    paintUp();
  }
  // "coming up": the next 3 unbuilt slides, then "+N more" (a calm list of the rest in a dialog)
  const upRow = ({ s, i }) => {
    const now = (isBusy() || pay.running) && s.id === pay.buildTarget;
    const b = h('button', { type: 'button', class: 'bd-up-row' + (now ? ' is-now' : ''), 'data-cursor-label': 'open', 'data-nosfx': '' },
      h('span', { class: 'bd-up-i' }, String(i + 1)), h('span', { class: 'bd-up-rt' }, s.title || 'untitled slide'),
      h('span', { class: 'bd-up-v', html: ICON[(s.visual || {}).main] || ICON.text }));
    b.addEventListener('click', () => openCard(s));
    return b;
  };
  // W-01: a slide that is not built yet can be added, changed or removed at any time while the build goes on
  const addUp = h('button', { type: 'button', class: 'bd-up-add', 'aria-label': 'add a slide', title: 'add a slide', 'data-cursor-label': 'add', 'data-nosfx': '', html: ICON.plus });
  upCol.querySelector('.bd-up-top').append(addUp);
  addUp.addEventListener('click', () => {
    if (!pay) return;
    const taken = new Set(planSlides().map(x => x.id)); let k = taken.size + 1; while (taken.has('s' + k)) k++;
    openCard({ id: 's' + k, title: '', point: '', bullets: [], sources: [], visual: { main: 'text', companions: [], phrase: '' } }, { isNew: true });
  });
  function paintUp() {
    const left = planSlides().map((s, i) => ({ s, i })).filter(x => !x.s.built);
    upCol.querySelector('.bd-up-n').textContent = left.length ? String(left.length) : '';
    const more = left.length - UP_PER;
    const moreB = more > 0 ? h('button', { type: 'button', class: 'bd-up-more', 'data-cursor-label': 'see all', 'data-nosfx': '' }, `+${more} more`) : null;
    if (moreB) moreB.addEventListener('click', () => {
      sfx('pop');
      const rest = h('div', { class: 'bd-all' }, left.slice(UP_PER).map(upRow));
      dialog('still to build', rest, [dlgBtn('close', closeModal)], 'bd-alldlg');
    });
    upList.replaceChildren(...(left.length ? [...left.slice(0, UP_PER).map(upRow), moreB].filter(Boolean)
      : [h('p', { class: 'bd-up-none' }, 'nothing left. every slide is built.')]));
  }
  const dlgBtn = (t, fn, ink) => {
    const b = h('button', { type: 'button', class: 'pl-big pl-big-s1' + (ink ? ' pl-ink' : ''), 'data-nosfx': '' }, h('span', { class: 'pl-big-t' }, h('span', { class: 'pl-big-h' }, t)));
    b.addEventListener('click', fn); return b;
  };
  // F-06: a modal takes focus, traps Tab, hides the page behind it and hands focus back when it closes
  function dialog(head, text, buttons, extraCls = '') {
    if (modalRel) modalRel(false);
    const dlg = h('div', { class: 'pl-dlg ' + extraCls, role: 'dialog', 'aria-modal': 'true', 'aria-label': head },
      h('h2', { class: 'pl-dlg-h' }, head), text ? (text.nodeType ? text : h('p', { class: 'pl-dlg-p' }, text)) : null, h('div', { class: 'pl-dlg-b' }, ...buttons));
    modal.replaceChildren(dlg);
    modal.hidden = false;
    modalRel = openDialog(dlg, { host: modal, onEsc: closeModal });
  }
  function closeModal() { modal.hidden = true; if (modalRel) { modalRel(); modalRel = null; } }
  function openCard(s, { isNew = false } = {}) {
    if (s.built) return;
    if (!isNew && isBusy() && s.id === pay.buildTarget) { say('claude is building this slide right now. you can change it as soon as it is done.', true); sfx('error'); return; }
    sfx('pop');
    let next = s, removing = false, saving = false;
    const engineInfo = sid => pay && pay.blender ? { available: !!pay.blender.available, look: pay.look, est: (pay.blender.estimates || {})[sid] || null } : null;
    const ed = slideEditor(s, { cap: pay.wordCap, sfx, compact: true, onChange: ns => { next = ns; }, engineInfo });
    const pos = isNew ? planSlides().length + 1 : planSlides().findIndex(x => x.id === s.id) + 1;
    const write = async (mutate, done) => {
      if (saving) return;
      saving = true;
      const plan = JSON.parse(JSON.stringify(pay.plan));
      if (!mutate(plan)) { saving = false; closeModal(); return; }
      const r = await api.plan.save(deckId, plan);
      saving = false;
      if (!alive) return;
      if (r && r.ok) { closeModal(); sfx('success'); pay = r; planRaw = ''; paintBuild(); say(done); }
      else { sfx('error'); say(r && r.error === 'offline' ? 'can’t reach lumi right now. nothing was changed. try again in a moment.' : r && r.reason ? r.reason : 'couldn’t save that. try again?', true); }
    };
    const saveB = dlgBtn('save', () => write(plan => {
      const i = plan.slides.findIndex(x => x.id === s.id);
      if (i < 0 && !isNew) return false;
      if (isNew) plan.slides.push({ ...next, id: s.id }); else plan.slides[i] = { ...plan.slides[i], ...next };
      return true;
    }, isNew ? 'added. claude will build it with the others.' : 'saved. claude will build it like that.'), true);
    const buttons = [dlgBtn('cancel', closeModal), saveB];
    if (!isNew) {
      const rm = dlgBtn('remove this slide', () => {
        if (!removing) { removing = true; rm.querySelector('.pl-big-h').textContent = 'tap again to remove it'; setTimeout(() => { removing = false; rm.querySelector('.pl-big-h').textContent = 'remove this slide'; }, 3000); return; }
        write(plan => { const i = plan.slides.findIndex(x => x.id === s.id); if (i < 0) return false; plan.slides.splice(i, 1); return true; }, 'removed. the other slides are untouched.');
      });
      rm.classList.add('is-danger');
      buttons.unshift(rm);
    }
    dialog(isNew ? 'a new slide' : `slide ${pos}: the plan`, ed.el, buttons, 'bd-card');
  }
  async function act(fn, msg) {
    if (acting) return;
    acting = true; paintBuild();                      // F-12: disabled at once, so a double click can not send two builds
    let r;
    try { r = await fn(deckId); } finally { acting = false; }
    if (!alive) return;
    if (r && r.ok === false) {
      sfx('error');
      say(r.error === 'offline' ? 'can’t reach lumi. nothing was started. try again in a moment.' : r.reason || (r.error === 'busy' ? 'claude is still busy. try again in a moment.' : r.error === 'replanning' ? 'claude is still updating the plan.' : msg), true);
    } else { setClaude({ running: true, deckId }); syncBusy(); }
    planIdle = 0;
    loadPlan();
  }
  bdMain.addEventListener('click', () => {
    if (bdMain.disabled || !pay) return;
    if (pay.count && pay.built >= pay.count) { sfx('launch'); onFinalize && onFinalize(deckId); return; }
    sfx('launch'); act(api.build.next, 'couldn’t start the next slide. try again?');
  });
  bdRest.addEventListener('click', () => {
    if (bdRest.disabled) return;
    sfx('pop');
    dialog('build the rest for me?', 'not recommended. you won’t get to check each slide as it is made, and fixing several slides afterwards takes longer. claude still stops when it has a question.',
      [dlgBtn('no, one at a time', closeModal), dlgBtn('yes, build the rest', () => { closeModal(); sfx('launch'); act(api.build.rest, 'couldn’t start. try again?'); }, true)]);
  });
  bdStop.addEventListener('click', () => {
    sfx('pop');
    dialog('stop claude?', 'the slides that are finished stay as they are. the slide claude is making right now is not kept.',
      [dlgBtn('keep going', closeModal), dlgBtn('stop', async () => {
        closeModal(); await api.build.stop(deckId);
        if (alive) { say('stopped. your finished slides are safe.'); loadPlan(); }
      }, true)]);
  });
  offs.push(() => { if (modalRel) modalRel(false); });
  offs.push(() => { if (play) play.destroy(); });

  // a studio-render slide: its card docks under the shrunk preview ('open') or sits as a slim bar ('bar'); the slide stays visible
  let mediaT = 0;
  async function mediaChanged() {             // the server embeds the new picture and packs the deck again: show it once the file changed
    clearTimeout(mediaT);
    const base = (deck && deck.mtime) || (pay && pay.mtime) || 0;
    for (let i = 0; i < 12 && alive; i++) {
      await new Promise(res => { mediaT = setTimeout(res, 900); });
      const r = await api.decks.get(deckId);
      if (!alive) return;
      const m = r && r.deck && r.deck.mtime;
      if (m && m > base) { deck = { ...(deck || {}), ...r.deck }; loadFrame(m); thumbs = []; paintStrip(); loadThumbs(); if (!build) loadDeck(); return; }
    }
  }
  blc = mountBlenderCard(blDock, { deckId, build, sfx,
    onLayout: m => { el.classList.toggle('is-bl', m === 'open'); el.classList.toggle('has-blbar', m === 'bar'); },
    onMedia: () => mediaChanged(),
    onState: () => { if (build) { paintBuild(); paintPlay(); } } });
  blc.setSlide(cur);
  offs.push(() => { clearTimeout(mediaT); blc.destroy(); });

  loadDeck();
  if (!build) loadFrame();
  paintAll();
  if (!build) loadThumbs();
  if (build) loadPlan();
  if (mountScene && !build) mountScene('edit-bench', bench, sceneCtx || {}).then(s => { if (!alive) { s.destroy(); return; } scene = s; paintAll(); });
  chat = mountWorkshop(null, chatHost, {
    bus, audio, deckId, mode: 'edit', getSlide: () => cur, popupHost: build ? qdock : null, slideInfo: build ? slideInfo : null,
    onAsk: st => { el.classList.toggle('is-asking', st === 'open'); el.classList.toggle('has-ask', st !== 'none'); },
    hintsOk: () => !build || !!(pay && pay.exists && pay.built >= cur),
    onSlide: n => { if (n && n !== cur) { if (count && n > count) return; go(n); } },
    onDone: () => { if (!alive) return; say('claude’s changes are in. refreshing the preview.'); loadFrame(Date.now()); thumbs = []; paintStrip(); loadThumbs(); loadDeck(); },
  });

  if (build) {
    // the chat is just its input until it is used or Claude speaks now (earlier talk replayed on opening doesn't count)
    chatHost.classList.add('is-quiet');
    const said = () => chatHost.querySelectorAll('.ws-log .ws-msg:not(.ws-old), .ws-log .ws-card:not(.ws-old)').length;     // replayed history (a thread switch too) is not news
    let base = -1;
    const open = () => { chatHost.classList.remove('is-quiet'); mo.disconnect(); };
    const wake = () => {
      const gate = chatHost.querySelector('.ws-gate');
      if (gate && !gate.hidden) return open();
      if (base >= 0 && said() > base) open();
    };
    const mo = new MutationObserver(wake);
    mo.observe(chatHost, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    const baseT = setTimeout(() => { base = said(); if (isBusy()) open(); }, 1800);
    chatHost.addEventListener('input', open, { once: true });
    offs.push(() => { mo.disconnect(); clearTimeout(baseT); });
  }

  return {
    get slide() { return cur; },
    go,
    destroy() {
      alive = false;
      clearTimeout(loadT); clearTimeout(toastT); clearTimeout(thumbsT); clearTimeout(planT); clearTimeout(deckT);
      removeEventListener('message', onMessage); removeEventListener('keydown', onKey);
      ro.disconnect(); offs.forEach(f => f());
      if (chat) chat.destroy();
      if (scene) scene.destroy();
      frame.src = 'about:blank';
      clearLater();
      el.replaceChildren();
    },
  };
}
