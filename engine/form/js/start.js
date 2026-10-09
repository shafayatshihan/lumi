// Starting a deck, after the 40-field form was deleted. Two short steps and nothing else:
//   1. "what's your talk about?" - one box, in the person's own words.
//   2. "drop in your files" - the seven folders, same panel as before.
// Then Claude reads the files and the interview takes over (interview.js on the plan page). Nothing here asks who your
// supervisor is, what your department is called, or any of the other things the old form demanded whether or not they
// existed: the interview asks only what it turns out to need.
//
// mountStart(host, { audio, setMode, onScene(name|null), onStarted(deckId), onHome }) -> { destroy() }
import * as api from './api.js';
import { h, ICON } from './dom.js';
import { announce } from './a11y.js';
import { on, emit } from './bus.js';

const MAX_TOPIC = 600;

export function mountStart(host, { audio, setMode, onScene, onStarted, onHome } = {}) {
  const sfx = n => { try { audio && audio.sfx && audio.sfx(n); } catch (e) { /* optional */ } };
  let alive = true, step = 'topic', panel = null, folder = null, FOLDERS = [], counts = {};
  const store = { files: {} };                       // the only thing the upload panel keeps: which file is the main one
  const getState = () => store;
  const setKey = (k, v) => { if (k === 'files.mainReport') store.files.mainReport = v; };

  const homeB = h('button', { type: 'button', class: 'ed-home pl-home', 'data-cursor-label': 'library' }, h('span', { html: ICON.back }), 'my decks');
  homeB.addEventListener('click', () => { sfx('back'); onHome && onHome(); });
  const head = h('h1', { class: 'st-h' });
  const lead = h('p', { class: 'st-lead' });
  const body = h('div', { class: 'st-body' });
  const actions = h('div', { class: 'st-actions' });
  const note = h('p', { class: 'st-note', role: 'status' });
  const left = h('div', { class: 'st-left' }, head, lead, body, actions, note);
  const panelHost = h('div', { class: 'st-panel', hidden: true });
  const el = h('div', { class: 'st' }, homeB, left, panelHost);
  host.replaceChildren(el);

  const say = (t, bad) => { note.textContent = t || ''; note.classList.toggle('bad', !!bad); };
  const bigBtn = (label, sub, fn, strong = true) => {
    const b = h('button', { type: 'button', class: `pl-big${strong ? ' pl-ink' : ''} pl-big-s1`, 'data-nosfx': '' },
      h('span', { class: 'pl-big-t' }, h('span', { class: 'pl-big-h' }, label), sub ? h('span', { class: 'pl-big-s' }, sub) : null));
    b.addEventListener('click', () => { b.disabled = true; Promise.resolve(fn()).then(() => { if (alive) b.disabled = false; }, () => { if (alive) b.disabled = false; }); });
    return b;
  };

  // ---------------------------------------------------------------- step 1: what the talk is about
  const topicBox = h('textarea', { class: 'st-in', rows: '6', maxlength: String(MAX_TOPIC), 'aria-label': 'what your talk is about',
    placeholder: 'e.g. my final-year project on a cheap soil sensor for farmers. 12 minutes, two examiners.' });
  function showTopic() {
    step = 'topic';
    el.dataset.step = 'topic';
    panelHost.hidden = true;
    head.textContent = 'what’s your talk about?';
    lead.textContent = 'a sentence or two. claude asks the rest.';
    onScene && onScene(null);
    body.replaceChildren(topicBox);
    actions.replaceChildren(bigBtn('next: my files', 'drop in your report, photos and data', () => {
      if (!topicBox.value.trim()) { say('tell claude what the talk is about first — even roughly.', true); topicBox.focus(); sfx('error'); return; }
      say(''); sfx('next'); showFiles();
    }));
    setTimeout(() => { if (alive && step === 'topic') topicBox.focus({ preventScroll: true }); }, 120);
  }

  // ---------------------------------------------------------------- step 2: the files
  const folderList = h('div', { class: 'st-folders', role: 'radiogroup', 'aria-label': 'your folders' });
  function paintFolders() {
    folderList.replaceChildren(...FOLDERS.map(f => {
      const n = counts[f.name] | 0;
      const b = h('button', { type: 'button', class: `st-folder${f === folder ? ' is-on' : ''}`, role: 'radio',
        'aria-checked': f === folder ? 'true' : 'false', 'data-nosfx': '', 'data-cursor-label': 'open' },
        h('span', { class: 'st-folder-n' }, f.title), h('span', { class: 'st-folder-c' }, n ? `${n} file${n > 1 ? 's' : ''}` : 'empty'));
      b.addEventListener('click', () => { if (f !== folder) { sfx('select'); folder = f; paintFolders(); mountPanel(); } });
      return b;
    }));
  }
  function mountPanel() {
    if (panel) { try { panel.destroy(); } catch (e) { /* fine */ } panel = null; }
    panelHost.replaceChildren();
    lead.textContent = folder ? folder.blurb : '';
    // the quiet picture behind this step follows the folder you are in
    if (folder) emit('step:change', { from: null, to: 'files', step: { folder: { name: folder.name } } });
    import('./uploads.js').then(m => {
      if (!alive || step !== 'files' || !m || !m.mountUploads) return;
      panel = m.mountUploads(panelHost, { folder: folder.name, title: folder.title, hint: folder.hint, accept: folder.accept, setKey, getState, audio });
    }, e => {
      console.warn('[aura] uploads.js is not available', e);
      panelHost.replaceChildren(h('p', { class: 'st-note' }, 'put your files in the “3 - Put your files here” folder on your computer, then carry on.'));
    });
  }
  async function showFiles() {
    step = 'files';
    el.dataset.step = 'files';
    panelHost.hidden = false;
    head.textContent = 'drop in your files';
    lead.textContent = '';
    onScene && onScene('files');
    body.replaceChildren(folderList);
    actions.replaceChildren(
      bigBtn('claude, read my files', '', begin),
      bigBtn('back', '', () => { sfx('back'); showTopic(); }, false));
    if (!FOLDERS.length) {
      const m = await import('./uploads.js').catch(() => null);
      if (!alive) return;
      FOLDERS = (m && m.FOLDERS) || [];
      folder = FOLDERS[0] || null;
    }
    paintFolders();
    if (folder) mountPanel();
    refreshCounts();
  }
  function refreshCounts() {
    api.files().then(g => {
      if (!alive || !Array.isArray(g)) return;
      counts = Object.fromEntries(g.map(x => [x.folder, (x.files || []).length]));
      if (step === 'files') paintFolders();
    });
  }
  const offUploaded = on('files:uploaded', () => refreshCounts());

  // ---------------------------------------------------------------- off we go
  async function begin() {
    say('');
    sfx('launch');
    const r = await api.interview.create(topicBox.value.trim(), store.files.mainReport || '');
    if (!alive) return;
    if (!r || r.ok === false) {
      sfx('error');
      say(r && r.error === 'busy' ? 'claude is still busy with another deck. try again when it’s done.'
        : r && r.error === 'cli-missing' ? 'claude isn’t installed on this computer yet.'
        : 'claude couldn’t start. try again in a moment.', true);
      return;
    }
    // The look (and the quality that travels with it) was chosen on the page before this one, when no deck existed
    // yet. Apply it the moment it does. A failure here is not fatal - the deck keeps "Claude chooses" and the plan
    // page's own look step offers it again - so it never blocks the flow.
    try {
      const pick = (await import('./lookpick.js')).takePick();
      if (pick && (pick.look || pick.quality)) {
        await api.decks.patch(r.deckId, pick.quality ? { look: pick.look || 'Claude chooses', quality: pick.quality }
          : { look: pick.look || 'Claude chooses' });
      }
    } catch (e) { console.warn('[aura] could not apply the picked look', e); }
    announce('claude is reading your files');
    onStarted && onStarted(r.deckId);
  }

  setMode && setMode('home');
  showTopic();
  return {
    el,
    destroy() {
      alive = false;
      try { offUploaded(); } catch (e) { /* fine */ }
      if (panel) { try { panel.destroy(); } catch (e) { /* fine */ } panel = null; }
      onScene && onScene(null);
      host.replaceChildren();
    },
  };
}
