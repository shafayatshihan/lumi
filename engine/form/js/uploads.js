// Upload panel for one "3 - Put your files here/<folder>" screen: drop zone, sequential uploads with a progress bar
// per file, the files already in the folder, remove for files added this session, and (Report only) the main-report pick.
// mountUploads(el, { folder, title, hint, accept, setKey, getState, bus, audio, deck }) -> { destroy() }
// `deck` is the deck id when the deck already exists; left out, the files go to the draft folder the new deck adopts.
import { upload, files, removeFile } from './api.js';
import { emit } from './bus.js';

// The seven folders under "3 - Put your files here", in the order they are offered. This list used to live in the
// 40-field form (steps.js), which is gone; it belongs beside the panel that actually fills the folders.
export const FOLDERS = [
  { name: 'Report', title: 'your report', hint: 'pdf or word', accept: '.pdf,.doc,.docx',
    blurb: 'your thesis, report or write-up. claude reads it first.' },
  { name: 'Images and photos', title: 'photos and pictures', hint: 'jpg, png, heic, svg', accept: 'image/*,.heic',
    blurb: 'setups, samples, prototypes, people.' },
  { name: 'Data (csv, excel, graphs)', title: 'data and graphs', hint: 'csv, excel, chart images', accept: '.csv,.tsv,.xlsx,.xls,.json,.txt,.png,.jpg,.jpeg,.svg',
    blurb: 'spreadsheets or chart images.' },
  { name: 'Logo and university template', title: 'logos and templates', hint: 'images, pptx or pdf', accept: 'image/*,.pptx,.potx,.pdf',
    blurb: 'your university logo or required template.' },
  { name: 'Previous year reports', title: 'earlier examples', hint: 'pdf, word or powerpoint', accept: '.pdf,.doc,.docx,.ppt,.pptx',
    blurb: 'past reports or slides from your department.' },
  { name: 'Journal papers', title: 'journal papers', hint: 'pdf', accept: '.pdf',
    blurb: 'the key papers you cite.' },
  { name: 'Anything else', title: 'anything else', hint: 'any file', accept: '',
    blurb: 'videos, notes, odds and ends.' },
];

const MAX_BYTES = 2 * 1024 ** 3;
const ROW_H = 46, ROW_GAP = 6;
const MAIN_RE = /\.(pdf|docx|doc)$/i;
const TONES = [
  [/\.pdf$/i, 'PDF', 'rose'], [/\.docx?$/i, 'DOC', 'plum'], [/\.(pptx?|potx|key)$/i, 'PPT', 'orange'],
  [/\.(csv|tsv|xlsx?|json|txt)$/i, 'DATA', 'orange'], [/\.(png|jpe?g|gif|webp|svg|heic|bmp|tiff?)$/i, 'IMG', 'pink'],
  [/\.(mp4|mov|avi|mkv|webm)$/i, 'VID', 'plum'],
];

import { h } from './dom.js';
const baseName = p => String(p || '').split(/[\\/]/).pop();
const ext = n => { const m = /\.([a-z0-9]{1,5})$/i.exec(n); return m ? m[1].toUpperCase() : 'FILE'; };
function kindOf(name) {
  for (const [re, label, tone] of TONES) if (re.test(name)) return { label, tone };
  return { label: ext(name).slice(0, 4), tone: 'lav' };
}
function prettySize(b) {
  if (!(b >= 0)) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${Math.max(1, Math.round(b / 1024))} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(b < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(b / 1024 ** 3).toFixed(1)} GB`;
}
function friendlyError(r) {
  if (!r || r.error === 'offline') return { msg: 'couldn’t reach lumi. is its window open?', retry: true };
  if (r.status === 413 || r.error === 'too large') return { msg: 'too big: files must be under 2 GB', retry: false };
  if (r.status === 507 || r.error === 'disk full') return { msg: 'your disk is full. free some space and retry', retry: true };
  if (r.status === 400) return { msg: 'this folder can’t take that file', retry: false };
  return { msg: 'that didn’t work. try again?', retry: true };
}

const ZONE_ART = `<svg class="up-art" viewBox="0 0 120 92" aria-hidden="true">
  <ellipse cx="60" cy="86" rx="40" ry="4" fill="var(--fur3)" opacity=".55"/>
  <path class="up-back" d="M16 26a8 8 0 0 1 8-8h22l8 8h42a8 8 0 0 1 8 8v42a8 8 0 0 1-8 8H24a8 8 0 0 1-8-8z" fill="var(--fur4)"/>
  <g class="up-sheet"><rect x="32" y="14" width="56" height="58" rx="6" fill="var(--pill)"/>
    <rect x="40" y="25" width="30" height="4" rx="2" fill="var(--pink)"/><rect x="40" y="34" width="40" height="3" rx="1.5" fill="var(--fur3)"/>
    <rect x="40" y="41" width="36" height="3" rx="1.5" fill="var(--fur3)"/><rect x="40" y="48" width="26" height="3" rx="1.5" fill="var(--fur3)"/></g>
  <g class="up-front"><path d="M12 44a8 8 0 0 1 8-8h80a8 8 0 0 1 8 8l-4 32a8 8 0 0 1-8 8H24a8 8 0 0 1-8-8z" fill="#d7c2dd"/>
    <circle cx="60" cy="60" r="11" fill="var(--ink)"/><path d="M60 66v-12m-5 5 5-5 5 5" fill="none" stroke="var(--pill)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></g>
  <circle class="up-spark s1" cx="100" cy="16" r="3" fill="var(--orange)"/><circle class="up-spark s2" cx="20" cy="12" r="2.5" fill="var(--pink)"/>
  <circle class="up-spark s3" cx="108" cy="36" r="2" fill="var(--fur5)"/>
</svg>`;
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CROSS = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 6l8 8M14 6l-8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

export function mountUploads(el, { folder, title = 'your files', hint = '', accept = '', setKey, getState, bus, audio, deck = null } = {}) {
  const isReport = folder === 'Report';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sfx = n => { try { audio && audio.sfx && audio.sfx(n); } catch (e) { /* sound is optional */ } };
  const fire = (type, detail) => {
    try { bus && bus.dispatchEvent ? bus.dispatchEvent(new CustomEvent(type, { detail })) : emit(type, detail); } catch (e) { /* optional */ }
  };
  let alive = true, uid = 0, busy = false, dragging = false, dragTimer = 0, page = -1, fit = 6;
  const items = [];   // {id, name, path, size, state: existing|queued|uploading|done|error, session, file, shown, target, row, err}
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); alive && fn(); }, ms); timers.add(t); return t; };

  // ---- DOM
  const input = h('input', { type: 'file', multiple: true, accept: accept || null, hidden: true, tabindex: '-1' });
  const choose = h('button', { type: 'button', class: 'up-choose', 'data-cursor-label': 'browse' }, 'choose files');
  const zoneTitle = h('p', { class: 'up-z-title' }, `drop ${title} here`);
  const zoneSub = h('p', { class: 'up-z-sub' }, 'or');
  const zone = h('div', { class: 'up-zone', 'data-cursor': '', 'data-cursor-label': 'browse', 'data-cursor-drop': 'drop to add' },
    h('svg', { class: 'up-outline', 'aria-hidden': 'true', html: '<rect pathLength="100"/>' }),
    h('div', { class: 'up-z-inner' }, h('div', { class: 'up-art-wrap', html: ZONE_ART }),
      h('div', { class: 'up-z-text' }, zoneTitle, h('div', { class: 'up-z-row' }, zoneSub, choose), hint ? h('span', { class: 'up-hint' }, hint) : null)));
  const count = h('span', { class: 'up-count' });
  const note = h('p', { class: 'up-note', hidden: true });
  const head = h('div', { class: 'up-head' }, h('span', { class: 'up-head-l' }, 'in this folder'), count);
  const list = h('div', { class: 'up-list', role: 'list' });
  const more = h('button', { type: 'button', class: 'up-more', hidden: true, 'data-cursor-label': 'more' });
  const empty = h('p', { class: 'up-empty' }, 'nothing here yet. you can skip this.');
  const toast = h('p', { class: 'up-toast', role: 'status', 'aria-live': 'polite' });
  const root = h('div', { class: 'up' + (reduced ? ' up-reduced' : '') }, zone, head, note, h('div', { class: 'up-list-wrap' }, list, empty), more, toast, input);
  el.append(root);

  // ---- main report (Report folder only)
  const mainOf = () => { const f = getState && getState().files; return f && f.mainReport; };
  function ensureMain() {
    if (!isReport || !setKey) return;
    const cands = items.filter(i => (i.state === 'existing' || i.state === 'done') && MAIN_RE.test(i.name));
    const cur = mainOf();
    if (cands.some(i => i.path === cur)) return;
    const next = cands.length ? cands[0].path : '';
    if ((cur || '') !== next) setKey('files.mainReport', next, { touch: false });
  }
  function pickMain(it) {
    if (!setKey || mainOf() === it.path) return;
    setKey('files.mainReport', it.path);
    sfx('select');
    items.forEach(paintRow);
    paintNote();
    it.row && it.row.classList.add('up-pop');
    later(() => it.row && it.row.classList.remove('up-pop'), 500);
  }
  function paintNote() {
    if (!isReport) return;
    const m = items.find(i => i.path === mainOf());
    note.hidden = !m;
    if (m) note.replaceChildren('claude reads ', h('b', {}, m.name), ' first. pick another with “make main”.');
  }

  // ---- rows
  function buildRow(it) {
    const k = kindOf(it.name);
    const chip = h('span', { class: `up-chip t-${k.tone}` }, h('span', { class: 'up-chip-l' }, k.label), h('span', { class: 'up-chip-ok', html: CHECK }));
    const name = h('span', { class: 'up-name', title: it.name }, it.name);
    const meta = h('span', { class: 'up-meta' });
    const bar = h('span', { class: 'up-bar' }, h('i'));
    const act = h('span', { class: 'up-act' });
    it.row = h('div', { class: 'up-row', role: 'listitem' }, chip, h('span', { class: 'up-mid' }, name, meta), act, bar);
    it.parts = { meta, bar: bar.firstChild, act };
    paintRow(it);
    return it.row;
  }
  function paintRow(it) {
    if (!it.row) return;
    const { meta, act } = it.parts;
    const main = isReport && it.path && it.path === mainOf();
    it.row.dataset.state = it.state;
    it.row.classList.toggle('is-main', !!main);
    const size = prettySize(it.size);
    meta.textContent = it.state === 'uploading' ? `adding… ${Math.round(it.shown * 100)}%`
      : it.state === 'queued' ? 'waiting its turn'
      : it.state === 'error' ? it.err.msg
      : it.state === 'done' ? `added${size ? ' · ' + size : ''}`
      : 'already here';
    const kids = [];
    if (main) kids.push(h('span', { class: 'up-badge' }, 'main'));
    else if (isReport && MAIN_RE.test(it.name) && (it.state === 'existing' || it.state === 'done'))
      kids.push(h('button', { type: 'button', class: 'up-mk', 'data-nosfx': '', 'data-cursor-label': 'main', onclick: () => pickMain(it) }, 'make main'));
    if (it.state === 'error' && it.err.retry)
      kids.push(h('button', { type: 'button', class: 'up-mk', onclick: () => retry(it) }, 'retry'));
    if (it.session && (it.state === 'done' || it.state === 'error' || it.state === 'queued'))
      kids.push(h('button', { type: 'button', class: 'up-x', 'aria-label': `remove ${it.name}`, 'data-cursor-label': 'remove', 'data-nosfx': '',
        html: CROSS, onclick: () => remove(it) }));
    act.replaceChildren(...kids);
  }

  // Which rows are visible: everything if it fits; otherwise the most relevant ones (in natural order) or a page.
  function layout() {
    if (!alive) return;
    const all = items.filter(i => !i.gone);
    const avail = Math.max(1, Math.floor((list.parentElement.clientHeight + ROW_GAP) / (ROW_H + ROW_GAP)));
    fit = avail;
    let show;
    if (all.length <= fit) { show = all; page = -1; }
    else if (page < 0) {
      const rank = i => ({ uploading: 0, error: 1, queued: 2, done: 3, existing: 4 }[i.state]);
      const pri = all.map((it, n) => ({ it, n })).sort((a, b) => rank(a.it) - rank(b.it) || a.n - b.n);
      const pick = new Set(pri.slice(0, fit - 1).map(x => x.it));
      const m = items.find(i => i.path && i.path === mainOf());
      if (m && !pick.has(m)) { pick.delete(pri[fit - 2] && pri[fit - 2].it); pick.add(m); }
      show = all.filter(i => pick.has(i));
    } else {
      const per = fit - 1;
      if (page * per >= all.length) page = 0;   // the list shrank under us
      show = all.slice(page * per, page * per + per);
    }
    const hidden = all.length - show.length;
    for (const it of all) if (!it.row) buildRow(it);
    const want = show.map(i => i.row);
    [...list.children].forEach(r => { if (!want.includes(r)) r.remove(); });
    want.forEach((r, n) => { if (list.children[n] !== r) list.insertBefore(r, list.children[n] || null); });
    more.hidden = hidden <= 0;
    if (hidden > 0) {
      const lastPage = page >= 0 && (page + 1) * (fit - 1) >= all.length;
      more.textContent = lastPage ? 'back to the first ones' : `and ${hidden} more`;
    }
    count.textContent = all.length ? String(all.length) : '';
    empty.hidden = all.length > 0;
    root.classList.toggle('has-files', all.length > 0);
  }
  more.addEventListener('click', () => {
    const all = items.filter(i => !i.gone);
    const per = Math.max(1, fit - 1);
    page = page < 0 ? 1 : (page + 1) * per >= all.length ? -1 : page + 1;
    if (page > 0 && page * per >= all.length) page = -1;
    layout();
  });

  // ---- progress tween: the shown value eases toward the real one so fast local uploads still read as motion
  let raf = 0;
  function tick() {
    raf = 0;
    if (!alive) return;
    let again = false;
    for (const it of items) {
      if (it.state !== 'uploading' && !(it.state === 'done' && it.shown < 1)) continue;
      const goal = it.state === 'done' ? 1 : Math.min(it.target, 0.97);
      const step = reduced ? 1 : 0.035 + (goal - it.shown) * 0.12;
      it.shown = Math.min(goal, it.shown + Math.max(0, step));
      it.parts.bar.style.transform = `scaleX(${it.shown.toFixed(4)})`;
      if (it.state === 'uploading') it.parts.meta.textContent = `adding… ${Math.round(it.shown * 100)}%`;
      if (it.shown < goal - 0.001) again = true;
      else if (it.state === 'done' && it.resolve) { const r = it.resolve; it.resolve = null; r(); }
    }
    if (again) raf = requestAnimationFrame(tick);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };

  // ---- queue
  function add(files) {
    const list2 = [...files].filter(f => f && f.name);
    if (!list2.length) return;
    // the new batch goes above older files, in the order it was dropped
    items.unshift(...list2.map(f => {
      const it = { id: ++uid, name: f.name, size: f.size, file: f, session: true, shown: 0, target: 0, state: 'queued' };
      if (f.size > MAX_BYTES) { it.state = 'error'; it.err = { msg: 'too big: files must be under 2 GB', retry: false }; }
      return it;
    }));
    fire('files:drop', { folder, count: list2.length });
    sfx('drop');
    page = -1;
    layout();
    pump();
  }
  async function pump() {
    if (busy) return;
    busy = true;
    let okCount = 0, failed = 0;
    for (;;) {
      if (!alive) break;
      const it = items.find(i => i.state === 'queued');
      if (!it) break;
      it.state = 'uploading'; it.shown = 0; it.target = 0;
      paintRow(it); layout();
      it.row.classList.add('is-active');
      const t0 = performance.now();
      const r = await upload(it.file, folder, p => { it.target = p; kick(); }, deck);
      if (!alive) break;
      if (r && r.ok) {
        // let the bar finish its run (at least ~450 ms) before the check pops in
        const wait = Math.max(0, 450 - (performance.now() - t0));
        if (wait) await new Promise(res => later(res, wait));
        it.state = 'done';
        await new Promise(res => { it.resolve = res; kick(); });
        if (!alive) break;
        it.path = r.path || `${folder}/${r.name || it.name}`;
        it.name = r.name || it.name;
        it.size = r.size != null ? r.size : it.size;
        it.file = null;
        it.row.classList.remove('is-active');
        it.row.classList.add('is-done', 'up-burst');
        later(() => it.row && it.row.classList.remove('up-burst'), 900);
        okCount++;
        sfx('upload');
        fire('files:uploaded', { folder, name: it.name, size: it.size, path: it.path });
        ensureMain(); paintNote();
        items.forEach(paintRow);
      } else {
        it.state = 'error';
        it.err = friendlyError(r);
        it.row.classList.remove('is-active');
        failed++;
        sfx('error');
        paintRow(it);
        if (r && r.error === 'offline') items.filter(i => i.state === 'queued').forEach(i => { i.state = 'error'; i.err = friendlyError(r); paintRow(i); });
      }
      layout();
    }
    busy = false;
    if (!alive) return;
    if (okCount && !failed) { sfx('success'); say(okCount === 1 ? 'added. claude will read it.' : `all ${okCount} files added.`); root.classList.add('up-cheer'); later(() => root.classList.remove('up-cheer'), 1200); }
    else if (okCount && failed) say(`${okCount} added, ${failed} didn’t make it.`);
  }
  function retry(it) {
    if (!it.file) return;
    it.state = 'queued'; it.err = null; it.shown = 0;
    paintRow(it); layout(); pump();
  }
  async function remove(it) {
    if (it.state === 'queued' || it.state === 'error' || !it.path) return drop(it);
    it.row.classList.add('is-busy');
    const r = await removeFile(it.path, deck);
    if (!alive) return;
    it.row.classList.remove('is-busy');
    if (r && r.ok !== false) { sfx('deselect'); drop(it); fire('files:removed', { folder, name: it.name, path: it.path }); }
    else { sfx('error'); say(r && r.error === 'offline' ? 'couldn’t reach lumi. try again in a moment.' : 'that file can’t be removed from here.'); }
  }
  function drop(it) {
    it.gone = true;
    const row = it.row;
    const finish = () => { const n = items.indexOf(it); if (n >= 0) items.splice(n, 1); row && row.remove(); ensureMain(); paintNote(); items.forEach(paintRow); layout(); };
    if (row && !reduced) { row.classList.add('is-leaving'); later(finish, 260); } else finish();
  }
  let toastT = 0;
  function say(text) {
    toast.textContent = text; toast.classList.add('show');
    clearTimeout(toastT); timers.delete(toastT);
    toastT = later(() => toast.classList.remove('show'), 3200);
  }

  // ---- existing files
  files(deck).then(g => {
    if (!alive) return;
    if (!Array.isArray(g)) { if (g && g.error === 'offline') say('couldn’t reach lumi to list this folder.'); return; }
    const grp = g.find(x => x && x.folder === folder);
    const known = new Set(items.map(i => i.path).filter(Boolean));
    for (const p of (grp && grp.files) || []) {
      if (known.has(p)) continue;
      items.push({ id: ++uid, name: p.startsWith(folder + '/') ? p.slice(folder.length + 1) : baseName(p), path: p, state: 'existing', session: false, shown: 1 });
    }
    ensureMain(); paintNote(); items.forEach(paintRow); layout();
  });

  // ---- drag and drop (anywhere on the page counts as this folder while the screen is open)
  const hasFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  function setDrag(on, over) {
    zone.classList.toggle('is-over', !!over);
    if (dragging === on) return;
    dragging = on;
    root.classList.toggle('is-drag', on);
    zoneTitle.textContent = on ? 'let go to add them' : `drop ${title} here`;
    fire(on ? 'files:dragover' : 'files:dragleave', { folder });
  }
  function onDragOver(e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDrag(true, zone.contains(e.target));
    clearTimeout(dragTimer);
    dragTimer = setTimeout(() => setDrag(false), 160);
  }
  function onDrop(e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    clearTimeout(dragTimer);
    setDrag(false);
    const dt = e.dataTransfer, files = [];
    let folders = 0;
    const its = dt.items ? [...dt.items] : [];
    if (its.length && its[0].webkitGetAsEntry) {
      its.forEach((x, n) => {
        if (x.kind !== 'file') return;
        const en = x.webkitGetAsEntry && x.webkitGetAsEntry();
        if (en && en.isDirectory) { folders++; return; }
        const f = x.getAsFile() || dt.files[n];
        if (f) files.push(f);
      });
    } else files.push(...dt.files);
    if (folders) say('folders can’t be added here. open the folder and drop the files inside.');
    add(files);
  }
  addEventListener('dragover', onDragOver);
  addEventListener('drop', onDrop);
  choose.addEventListener('click', e => { e.stopPropagation(); input.click(); });
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { add(input.files); input.value = ''; });

  const ro = new ResizeObserver(() => layout());
  ro.observe(list.parentElement);
  layout();

  return {
    destroy() {
      alive = false;
      ro.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(dragTimer);
      timers.forEach(clearTimeout); timers.clear();
      removeEventListener('dragover', onDragOver);
      removeEventListener('drop', onDrop);
      if (dragging) fire('files:dragleave', { folder });
      root.remove();
    },
  };
}
