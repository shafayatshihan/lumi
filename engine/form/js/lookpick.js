// The LOOK page: the first thing after "make a new deck", and before the interview.
//
// WHY IT IS HERE AND NOT AFTER THE INTERVIEW
// The look used to be chosen between the interview and the plan. That put the dullest screen in the product -
// a list of questions - in front of the most attractive one. A person who has just decided to make a deck is at
// their most willing, and what they meet is a form. Now they meet real slides from real decks, moving, and the
// interview comes after they already want the thing.
//
// There is NO DECK YET at this point: a deck is born in start.js, from the topic. So the choice is held here and
// applied the moment the deck exists (start.js reads `takePick()` and PATCHes it). Two consequences:
//   - the quality tiers come from /api/quality, which needs no deckId;
//   - the choice survives a reload, because it is kept in localStorage rather than in a module variable.
// Once the look is applied, `lookUser` is true on the record, so plan.js's own theme step never fires - that code
// stays for decks made before this page existed, and for a deck that somehow reaches the plan without a look.
//
//   mountLookPick(el, { audio, onNext, onHome }) -> { destroy() }
import * as api from './api.js';
import { h } from './dom.js';
import { mountLooks, LOOKS } from './looks.js';

const KEY = 'lumi-pending-look';

/** Read the pending choice and clear it. Called once, by start.js, right after the deck is created. */
export function takePick() {
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' ? v : null;
  } catch (e) { return null; }
}

function savePick(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* private window */ } }

export function mountLookPick(el, { audio, onNext, onHome } = {}) {
  let alive = true, scene = null, qual = null;
  const sfx = n => { try { audio && audio.sfx && audio.sfx(n); } catch (e) { /* no audio */ } };

  let look = 'Claude chooses', quality = null;

  const listEl = h('div', { class: 'th-list' });
  const illus = h('div', { class: 'th-illus' }, h('div', { class: 'illus-slot' }));
  const qualEl = h('div', { class: 'th-qual' });
  const nextB = h('button', { type: 'button', class: 'pl-big pl-ink pl-big-s1', 'data-nosfx': '', 'data-cursor-label': 'next' },
    h('span', { class: 'pl-big-t' }, h('span', { class: 'pl-big-h' }, 'next: tell me about it')));
  const backB = h('button', { type: 'button', class: 'btn-back', 'data-nosfx': '' }, 'my decks');

  el.replaceChildren(h('div', { class: 'th' },
    h('div', { class: 'th-left' },
      h('span', { class: 'badge' }, 'the look'),
      h('h1', { class: 'th-h' }, 'pick a look'),
      h('p', { class: 'th-lead' }, 'these are real slides from real decks. hover one to see more.'),
      h('div', { class: 'pl-bigs' }, nextB),
      h('div', { style: 'margin-top:14px' }, backB),
      h('img', { class: 'th-lumi', src: '/assets/lumi-cutout.png', alt: '', 'aria-hidden': 'true' })),
    qualEl, illus, listEl));

  backB.addEventListener('click', () => { sfx('back'); onHome && onHome(); });

  // the chooser is the same component the plan page used, so the two screens cannot drift apart
  scene = mountLooks(listEl, illus.firstChild, { audio,
    getState: () => ({ look: { theme: look } }),
    setKey: (k, v) => { if (k === 'look.theme') look = v; } });

  // quality, from the deckless endpoint
  api.qualityOptions().then(r => {
    if (!alive || !r || r.ok === false || !r.options) return;
    quality = quality || r.default || null;
    return import('./quality.js').then(m => {
      if (!alive || !m || !m.mountQuality) return;
      qual = m.mountQuality(qualEl, { value: quality, options: r.options, sfx, onChange: v => { quality = v; } });
    });
  }).catch(e => console.warn('[aura] quality is not available', e));

  nextB.addEventListener('click', () => {
    sfx('launch');
    savePick({ look: look || 'Claude chooses', quality: quality || null });
    onNext && onNext();
  });

  return {
    destroy() {
      alive = false;
      try { if (qual && qual.destroy) qual.destroy(); } catch (e) { /* ignore */ }
      try { if (scene && scene.destroy) scene.destroy(); } catch (e) { /* ignore */ }
      el.replaceChildren();
    },
  };
}
