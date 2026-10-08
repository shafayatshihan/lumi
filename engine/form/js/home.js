// Home: the deck library. A big "make a new deck" card on the left, then one card per deck from GET /api/decks
// (thumbnail, title, date, look badge, status, edit · present · folder), six to a page so nothing ever scrolls.
// mountHome(el, { audio, onNew, onResume, onOpen(deck), onFinalize(deck), draft() -> {step}|null, update }) -> { destroy(), refresh() }
// v0.5: "present" plays only the finalized file; a deck never finalized says "not finalized yet · finalize", one changed
// since then "changed since finalizing · finalize again" (both are buttons). Plan-flow decks show planning / building.
import * as api from './api.js';
import { startUpdate } from './update.js';
import { openDialog, roving, syncTab } from './a11y.js';

const PER_PAGE = 6;
import { h } from './dom.js';
import { ICON } from './dom.js';
const SVG = { plus: ICON.plus, play: ICON.play, folder: ICON.folder, pen: ICON.pen, left: ICON.left, right: ICON.rright,
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.6" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M5 19.5c1.2-3.4 3.8-5 7-5s5.8 1.6 7 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>' };
// The new-deck card's little drawing: a blank slide on a stand, a pencil and sparkles.
// The real Lumi, not a drawing of a document. The hand-drawn SVG that used to sit here was the last
// me-designed picture on the home screen, and the owner cut those (2026-10-08).
const NEW_ART = '<img class="hm-new-art" src="/assets/lumi-mascot.png" alt="" aria-hidden="true" draggable="false">';
const EMPTY_ART = `<svg viewBox="0 0 300 180" aria-hidden="true">
  <rect x="40" y="40" width="150" height="92" rx="14" fill="var(--fur1)" transform="rotate(-6 115 86)"/>
  <rect x="96" y="28" width="160" height="98" rx="14" fill="var(--pill)"/>
  <rect x="114" y="48" width="70" height="10" rx="5" fill="var(--fur3)"/><rect x="114" y="66" width="104" height="7" rx="3.5" fill="var(--fur1)"/>
  <rect x="114" y="80" width="84" height="7" rx="3.5" fill="var(--fur1)"/><circle cx="226" cy="100" r="13" fill="var(--lilac)"/>
  <path d="M60 150h200" stroke="var(--lilac)" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 12"/>
  <circle cx="270" cy="34" r="6" fill="var(--pink)"/><circle cx="34" cy="120" r="4" fill="var(--orange)"/>
</svg>`;
const LOOK_DOT = { 'Pink Punch': '#e46fa0', 'Bold Blue': '#2f5cf5', 'Flat-Pack': 'var(--orange)', 'Happy Headspace': '#f6c445', 'Clay Pop': '#ff6a13' };

function when(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const now = new Date(), day = 864e5;
  const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()), b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((a - b) / day);
  if (diff === 0) return `today, ${t}`;
  if (diff === 1) return `yesterday, ${t}`;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) }).toLowerCase();
}

export function mountHome(el, { audio, onNew, onResume, onOpen, onFinalize, onSignin, draft, update } = {}) {
  const sfx = n => { try { audio && audio.sfx && audio.sfx(n); } catch (e) { /* optional */ } };
  let alive = true, decks = [], page = 0, loaded = false, pollT = 0, idle = 0, fails = 0, showArchived = false, menuOpen = null, undoT = 0;

  const d = draft ? draft() : null;
  // "make a new deck" is always the main card; an unfinished draft only adds a smaller "continue" card under it.
  const newCard = h('button', { type: 'button', class: 'hm-new', 'data-cursor-label': 'new deck', 'data-nosfx': '' },
    h('span', { class: 'hm-new-top', html: NEW_ART }),
    h('span', { class: 'hm-new-row' }, h('span', { class: 'hm-new-plus', html: SVG.plus }),
      h('span', { class: 'hm-new-t' }, h('span', { class: 'hm-new-h' }, 'make a new deck'),
        h('span', { class: 'hm-new-s' }, 'tell me about your talk'))));
  newCard.addEventListener('click', () => { sfx('launch'); onNew && onNew(); });
  const contCard = d ? h('button', { type: 'button', class: 'hm-cont', 'data-cursor-label': 'continue', 'data-nosfx': '' },
    h('span', { class: 'hm-cont-h' }, 'continue your draft'),
    h('span', { class: 'hm-cont-s' }, `step ${d.step}`)) : null;
  if (contCard) contCard.addEventListener('click', () => { sfx('launch'); onResume && onResume(); });
  // the Claude account: email + plan and "switch account". Switching signs Lumi's Claude out, then goes back to the
  // loading screen, which runs the private-window sign-in and the "is this you?" confirmation (never a silent bind).
  const acctT = h('span', { class: 'hm-acct-t' }, 'claude account');
  const acctGo = h('button', { type: 'button', class: 'hm-acct-go', 'data-cursor-label': 'switch', 'data-nosfx': '' }, 'switch account');
  const acct = h('div', { class: 'hm-acct', hidden: true }, h('span', { class: 'hm-acct-dot', html: SVG.user }), acctT, acctGo);
  function paintAcct(st) {
    if (!st || st.cli === false) { acct.hidden = true; return; }
    const plan = String(st.subscriptionType || '').toLowerCase();
    acct.hidden = false;
    acct.classList.toggle('is-free', plan === 'free');
    acct.title = plan === 'free' ? 'the free plan may stop a build early. pro or higher works best.' : '';
    const label = String(st.planLabel || (plan ? plan + ' plan' : 'signed in')).toLowerCase();
    acctT.replaceChildren(...(st.signedIn ? [...(st.email ? [h('b', {}, st.email), ' · '] : []), h('b', {}, label)] : ['not signed in']));
    acctSignedIn = !!st.signedIn;                      // the TRUTH: never re-derive this from the button label
    if (!acctArm) acctGo.textContent = st.signedIn ? 'switch account' : 'sign in';   // don't clobber 'tap again'
  }
  const toSignin = () => { if (onSignin) onSignin(); };
  let acctArm = 0, acctSignedIn = false;
  acctGo.addEventListener('click', async () => {
    if (acctGo.disabled) return;
    // NOT acctGo.textContent: the first tap rewrites it to 'tap again to switch', so the second tap used to read
    // signedIn === false and skip the sign-out entirely (the 'second tap never signs out' launch blocker).
    const signedIn = acctSignedIn;
    if (signedIn && !acctArm) { sfx('pop'); acctGo.textContent = 'tap again to switch'; acctArm = setTimeout(() => { acctArm = 0; acctGo.textContent = 'switch account'; }, 3000); return; }
    clearTimeout(acctArm); acctArm = 0;
    acctGo.disabled = true; sfx('launch');
    if (signedIn) {
      const r = await api.claude.logout();
      if (!alive) return;
      if (r && r.ok === false) { acctGo.disabled = false; acctGo.textContent = 'switch account'; say(r.error === 'busy' ? 'claude is busy right now. try again when it’s done.' : 'couldn’t sign out. try again?'); return; }
    }
    toSignin();
  });
  // a different account appeared while Lumi was open (or it was never confirmed): ask again on the loading screen
  api.claude.status(true).then(st => { if (!alive) return; paintAcct(st); if (st && st.signedIn && st.confirmed === false) toSignin(); });
  const runUpdate = b => startUpdate('update', { say, sfx, alive: () => alive, button: b });
  // F-15: the soft custom pointer can be switched off for the normal Windows pointer (remembered on this computer)
  const pointerB = h('button', { type: 'button', class: 'hm-pointer', 'data-nosfx': '', 'aria-pressed': 'false', title: 'mouse pointer style', 'aria-label': 'mouse pointer: switch between lumi’s soft pointer and the normal one' });
  const paintPointer = native => { pointerB.textContent = native ? 'soft pointer' : 'normal pointer'; pointerB.setAttribute('aria-pressed', native ? 'true' : 'false'); };
  import('./cursor.js').then(m => { if (!alive || !m.nativePointer) return; paintPointer(m.nativePointer()); pointerB.hidden = false;
    pointerB.addEventListener('click', () => { const on = !m.nativePointer(); m.setNativePointer(on); paintPointer(on); }); }, () => { pointerB.hidden = true; });
  pointerB.hidden = true;
  const left = h('div', { class: 'hm-left' },
    h('h1', { class: 'q hm-head' }, 'your decks'),
    update ? h('button', { type: 'button', class: 'hm-upd', 'data-cursor-label': 'update', onclick: e => runUpdate(e.currentTarget) },
      h('span', { class: 'hm-upd-dot' }), `update to ${String(update.latest).replace(/^v/, '')}`) : null,
    acct, newCard, contCard);
  const grid = h('div', { class: 'hm-grid', role: 'list', 'aria-label': 'your decks' });
  const count = h('span', { class: 'hm-count' });
  const prev = h('button', { type: 'button', class: 'pg', 'aria-label': 'previous page', html: SVG.left });
  const nxt = h('button', { type: 'button', class: 'pg', 'aria-label': 'next page', html: SVG.right });
  const pgLabel = h('span', { class: 'pg-label' });
  const pager = h('div', { class: 'pager hm-pager' }, prev, pgLabel, nxt);
  const toast = h('p', { class: 'hm-toast', role: 'status' });
  const undoB = h('button', { type: 'button', class: 'hm-undo', hidden: true, 'data-nosfx': '' }, 'undo');
  const archB = h('button', { type: 'button', class: 'hm-arch', hidden: true, 'data-nosfx': '', 'aria-pressed': 'false' });
  archB.addEventListener('click', () => { showArchived = !showArchived; page = 0; sfx('slide'); closeMenu(); paint(); });
  const foot = h('div', { class: 'hm-foot' }, count, archB, toast, undoB, pointerB, pager);
  const right = h('div', { class: 'hm-right' }, grid, foot);
  el.replaceChildren(left, right);

  prev.addEventListener('click', () => { if (page > 0) { page--; sfx('slide'); paint(-1); } });
  nxt.addEventListener('click', () => { if ((page + 1) * PER_PAGE < decks.filter(x => !!x.archived === showArchived).length) { page++; sfx('slide'); paint(1); } });

  let toastT = 0;
  const say = (t, undo = null) => {
    toast.textContent = t; toast.classList.add('show'); clearTimeout(toastT); clearTimeout(undoT);
    toastT = setTimeout(() => toast.classList.remove('show'), undo ? 9000 : 3200);
    undoB.hidden = !undo;
    if (undo) { undoB.onclick = async () => { undoB.hidden = true; await undo(); }; undoT = setTimeout(() => { undoB.hidden = true; }, 9000); }
  };
  // W-02: rename / archive / delete a deck from the library. Delete moves it to the bin (nothing is erased, the finished files
  // in "4 - Your slides" are untouched) and the toast offers "undo"; it takes two taps, like the other destructive actions.
  function closeMenu(restore = false) {
    if (!menuOpen) return;
    const m = menuOpen; menuOpen = null;
    m.rel(restore); m.el.remove(); m.btn.setAttribute('aria-expanded', 'false');
    if (restore) try { m.btn.focus({ preventScroll: true }); } catch (e) { /* gone */ }
  }
  function renameDeck(dk, card) {
    const t = card.querySelector('.hm-title');
    const inp = h('input', { class: 'hm-rename', type: 'text', maxlength: '200', 'aria-label': 'deck name' });
    inp.value = dk.title || '';
    t.replaceWith(inp);
    inp.focus(); inp.select();
    let done = false;
    const finish = async save => {
      if (done) return; done = true;
      inp.blur();
      const v = inp.value.trim();
      if (save && v && v !== dk.title) {
        const r = await api.decks.rename(dk.id, v);
        if (!alive) return;
        if (r && r.ok) { sfx('success'); say('renamed.'); } else { sfx('error'); say(r && r.error === 'offline' ? 'can’t reach lumi, so the name was not changed.' : 'couldn’t rename it. try again?'); }
      }
      refresh.sig = ''; refresh();
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); } });
    inp.addEventListener('blur', () => finish(true));
  }
  function openMenu(dk, card, btn) {
    if (menuOpen && menuOpen.btn === btn) { closeMenu(true); return; }
    closeMenu();
    sfx('pop');
    let armed = 0;
    const item = (label, fn, cls = '') => { const b = h('button', { type: 'button', role: 'menuitem', class: 'hm-mi ' + cls, 'data-nosfx': '' }, label); b.addEventListener('click', fn); return b; };
    const ren = item('rename', () => { closeMenu(); renameDeck(dk, card); });
    const arc = item(dk.archived ? 'move back to the library' : 'archive', async () => {
      closeMenu();
      const r = await api.decks.archive(dk.id, !dk.archived);
      if (!alive) return;
      if (r && r.ok) { sfx('done'); say(dk.archived ? 'back in the library.' : 'archived.'); refresh.sig = ''; refresh(); }
      else { sfx('error'); say('couldn’t do that. try again?'); }
    });
    const del = item('delete', async () => {
      if (!armed) { armed = 1; del.textContent = 'tap again to delete'; del.classList.add('is-armed'); setTimeout(() => { if (menuOpen && menuOpen.el.contains(del)) { armed = 0; del.textContent = 'delete'; del.classList.remove('is-armed'); } }, 3500); return; }
      closeMenu();
      const r = await api.decks.remove(dk.id);
      if (!alive) return;
      if (r && r.ok) {
        sfx('deselect'); refresh.sig = ''; refresh();
        say(`“${dk.title || 'untitled deck'}” moved to the bin.${r.keptFinal ? ' your finished slides are kept.' : ''}`, async () => {
          const b = await api.decks.restore(r.binned);
          if (!alive) return;
          if (b && b.ok) { sfx('success'); say('brought back.'); refresh.sig = ''; refresh(); } else { sfx('error'); say('couldn’t bring it back. it is still in the folder “.aura/decks/_deleted”.'); }
        });
      } else { sfx('error'); say(r && r.reason ? r.reason : r && r.error === 'offline' ? 'can’t reach lumi, so nothing was deleted.' : 'couldn’t delete it. try again?'); }
    }, 'is-danger');
    const el = h('div', { class: 'hm-menu', role: 'menu', 'aria-label': `${dk.title || 'deck'}: more` }, ren, arc, del);
    card.append(el);
    roving(el, '[role=menuitem]', { select: false, orientation: 'vertical' });
    for (const b of el.querySelectorAll('[role=menuitem]')) b.tabIndex = -1;
    el.firstChild.tabIndex = 0;
    const rel = openDialog(el, { onEsc: () => closeMenu(true) });
    btn.setAttribute('aria-expanded', 'true');
    menuOpen = { el, btn, rel };
  }
  const onDocDown = e => { if (menuOpen && !menuOpen.el.contains(e.target) && !menuOpen.btn.contains(e.target)) closeMenu(); };
  document.addEventListener('pointerdown', onDocDown, true);

  function thumb(dk) {
    const box = h('div', { class: 'hm-thumb' });
    if (dk.status === 'building') {
      box.classList.add('is-building');
      box.append(h('span', { class: 'hm-build' }, h('i'), h('i'), h('i')), h('span', { class: 'hm-tlabel' }, 'building…'));
      return box;
    }
    if (!dk.thumb) {
      box.classList.add('is-empty');
      box.append(h('span', { class: 'hm-tlabel' }, dk.status === 'missing' ? 'the file was moved or deleted' : 'not built yet'));
      return box;
    }
    box.classList.add('is-loading');
    box.append(h('span', { class: 'hm-shimmer' }), h('span', { class: 'hm-tlabel' }, 'drawing a preview…'));
    const img = new Image();
    img.alt = '';
    img.decoding = 'async';
    img.onload = () => { if (!alive) return; box.classList.remove('is-loading'); box.replaceChildren(img); };
    img.onerror = () => { if (!alive) return; box.classList.remove('is-loading'); box.classList.add('is-empty');
      box.replaceChildren(h('span', { class: 'hm-tlabel' }, 'no preview yet')); };
    img.src = dk.thumb;
    return box;
  }
  function statusPill(dk) {
    if (dk.finalizing) return h('span', { class: 'hm-status', 'data-k': 'run' }, h('i'), 'finalizing…');
    if (dk.status === 'building') return h('span', { class: 'hm-status', 'data-k': 'run' }, h('i'), dk.flow === 'plan' && dk.planState === 'planning' ? 'planning' : 'claude is working');
    if (dk.flow === 'plan' && dk.planCount && dk.builtCount < dk.planCount)
      return h('span', { class: 'hm-status', 'data-k': 'wait' }, h('i'), dk.builtCount ? `built ${dk.builtCount} of ${dk.planCount}` : 'planned, not built');
    if (dk.flow === 'plan' && !dk.planCount && !dk.exists) return h('span', { class: 'hm-status', 'data-k': 'wait' }, h('i'), 'planning');
    if (dk.exists && (!dk.finalized || dk.changedSinceFinalize)) {
      const b = h('button', { type: 'button', class: 'hm-status hm-fin', 'data-k': 'wait', 'data-cursor-label': 'finalize', 'data-nosfx': '' }, h('i'),
        dk.finalized ? 'changed · ' : 'not finalized yet · ', h('span', { class: 'hm-fin-go' }, dk.finalized ? 'finalize again' : 'finalize'));
      b.addEventListener('click', e => { e.stopPropagation(); sfx('launch'); onFinalize && onFinalize(dk); });
      return b;
    }
    const map = { ready: ['finalized', 'ok'], missing: ['file missing', 'bad'], draft: ['not finished', 'wait'] };
    const [t, k] = map[dk.status] || [dk.status, 'wait'];
    return h('span', { class: 'hm-status', 'data-k': k }, h('i'), t);
  }
  function deckCard(dk, i) {
    const pill = statusPill(dk);
    const look = dk.look && dk.look !== 'Claude chooses' ? dk.look : null;
    const editB = h('button', { type: 'button', class: 'hm-b hm-edit', 'data-cursor-label': dk.exists ? 'edit' : 'open', 'data-nosfx': '' },
      h('span', { html: SVG.pen }), dk.flow === 'plan' && dk.planCount > dk.builtCount ? (dk.builtCount ? 'build' : 'plan') : dk.exists ? 'edit' : dk.status === 'building' ? 'watch' : 'open');
    const presentB = h('button', { type: 'button', class: 'hm-b hm-ico', 'aria-label': 'present', title: 'present', html: SVG.play, 'data-cursor-label': 'present' });
    const folderB = h('button', { type: 'button', class: 'hm-b hm-ico', 'aria-label': 'open the folder', title: 'open the folder', html: SVG.folder, 'data-cursor-label': 'folder' });
    presentB.disabled = !dk.final;
    presentB.title = dk.final ? 'present' : 'finalize it first';
    const moreB = h('button', { type: 'button', class: 'hm-b hm-ico hm-more', 'aria-label': 'more: rename, archive or delete', title: 'rename, archive or delete', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'data-cursor-label': 'more',
      html: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><circle cx="6" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="18" cy="12" r="2"/></g></svg>' });
    const card = h('div', { class: 'hm-card', role: 'listitem', style: `--i:${i}`, 'data-id': dk.id },
      h('button', { type: 'button', class: 'hm-tbtn', 'aria-label': `open ${dk.title}`, 'data-cursor-label': 'open', 'data-nosfx': '' }, thumb(dk)),
      h('div', { class: 'hm-meta' },
        h('p', { class: 'hm-title', title: dk.title }, dk.title || 'untitled deck'),
        h('p', { class: 'hm-sub' }, h('span', {}, when(dk.updatedAt || dk.createdAt)), look ? h('span', { class: 'hm-look' }, h('i', { style: `background:${LOOK_DOT[look] || 'var(--fur3)'}` }), look.toLowerCase()) : null, pill.tagName === 'BUTTON' ? null : pill), pill.tagName === 'BUTTON' ? pill : null),
      h('div', { class: 'hm-acts' }, editB, presentB, folderB, moreB));
    moreB.addEventListener('click', () => openMenu(dk, card, moreB));
    const open = () => { sfx('launch'); onOpen && onOpen(dk); };
    editB.addEventListener('click', open);
    card.querySelector('.hm-tbtn').addEventListener('click', open);
    presentB.addEventListener('click', async () => { if (!dk.final) return; sfx('launch'); const r = await api.openSlides(dk.final.html); if (alive && r && r.ok === false) say('couldn’t open it. try the folder.'); });
    folderB.addEventListener('click', async () => { const r = await api.openSlides(); if (alive && r && r.ok === false) say('couldn’t open the folder.'); });
    return card;
  }
  function paint(dir = 0) {
    closeMenu();
    const nArch = decks.filter(x => x.archived).length;
    if (!nArch) showArchived = false;
    const shown = decks.filter(x => !!x.archived === showArchived);
    archB.hidden = !nArch;
    archB.textContent = showArchived ? 'back to my decks' : `archived (${nArch})`;
    archB.setAttribute('aria-pressed', showArchived ? 'true' : 'false');
    const pages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
    page = Math.min(page, pages - 1);
    const items = shown.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
    if (!loaded) {
      grid.replaceChildren(...Array.from({ length: 3 }, (_, i) => h('div', { class: 'hm-card hm-ghost', style: `--i:${i}` }, h('div', { class: 'hm-thumb is-loading' }, h('span', { class: 'hm-shimmer' })))));
    } else if (loaded === 'offline') {
      // F-19: not "no decks yet" and not a vanished account pill: say what is wrong and offer the retry
      const again = h('button', { type: 'button', class: 'hm-retry', 'data-nosfx': '' }, 'try again now');
      again.addEventListener('click', () => { again.disabled = true; idle = 0; refresh().then(() => { again.disabled = false; }); });
      grid.replaceChildren(h('div', { class: 'hm-empty' }, h('div', { class: 'hm-empty-art', html: EMPTY_ART }, h('img', { class: 'hm-empty-lumi', src: '/assets/lumi-cutout.png', alt: '', 'aria-hidden': 'true' })),
        h('p', { class: 'hm-empty-t' }, 'can’t reach lumi'), h('p', { class: 'hm-empty-x' }, 'is its window still open? your decks are safe. lumi keeps trying.'), again));
    } else if (!shown.length) {
      grid.replaceChildren(h('div', { class: 'hm-empty' }, h('div', { class: 'hm-empty-art', html: EMPTY_ART }, h('img', { class: 'hm-empty-lumi', src: '/assets/lumi-cutout.png', alt: '', 'aria-hidden': 'true' })),
        h('p', { class: 'hm-empty-t' }, showArchived ? 'nothing archived' : 'no decks yet'), h('p', { class: 'hm-empty-x' }, showArchived ? 'decks you archive wait here.' : 'your first one appears here.')));
    } else grid.replaceChildren(...items.map(deckCard));
    grid.dataset.dir = dir;
    count.textContent = loaded === true && shown.length ? `${shown.length} deck${shown.length === 1 ? '' : 's'}` : '';
    pager.hidden = pages <= 1;
    prev.disabled = page === 0; nxt.disabled = page >= pages - 1;
    pgLabel.textContent = `${page + 1} / ${pages}`;
  }
  async function refresh() {
    const r = await api.decks.list();
    if (!alive) return;
    let changed = false;
    if (r && Array.isArray(r.decks)) {
      fails = 0;
      const sig = JSON.stringify(r.decks.map(x => [x.id, x.status, x.updatedAt, x.thumb, x.title, x.finalized, x.changedSinceFinalize, x.finalizing, x.builtCount, !!x.archived]));
      changed = sig !== refresh.sig; refresh.sig = sig;
      decks = r.decks; loaded = true;
      if (changed && !(menuOpen || grid.querySelector('.hm-rename:focus'))) paint(); else if (changed) refresh.sig = '';
    } else {
      fails++;
      if (loaded !== true) { loaded = 'offline'; paint(); }
    }
    idle = changed ? 0 : idle + 1;
    clearTimeout(pollT);
    // keep an eye on decks that are being built; F-09: everything slows down while nothing changes, in a hidden tab, or with the server away
    const hot = decks.some(x => x.status === 'building' || x.finalizing);
    pollT = setTimeout(refresh, fails ? api.pace(3000, fails, { max: 10000 }) : hot ? api.pace(3000, idle, { max: 8000 }) : api.pace(15000, idle, { max: 30000, hidden: 30000 }));
  }
  paint(); refresh();
  return { refresh, destroy() { alive = false; clearTimeout(pollT); clearTimeout(toastT); clearTimeout(undoT); clearTimeout(acctArm); closeMenu(); document.removeEventListener('pointerdown', onDocDown, true); el.replaceChildren(); } };
}
