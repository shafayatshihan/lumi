// The interview screen: Claude reads the person's files and then asks them about their talk, one round at a time,
// until it understands it well enough to plan. This replaces the 40-field form, which assumed everyone has a
// supervisor and an institution and never asked the things that actually decide a deck.
//
// It is its OWN scene - a single centred column, nothing competing - because unlike a build question there is no slide
// preview to dock under yet. The card itself is the shared one (markers.choiceCard), so a round may freely mix a
// multiple choice and a question in the person's own words.
//
// There is deliberately NO progress bar and no "3 of 8": Claude decides when it has enough, so any countdown would be
// a lie. Instead the screen shows what is BANKED - the round number, and a list of settled facts that grows every
// round, so the person can see the conversation going somewhere.
//
// interviewScene(host, { sfx, onAsk(text), onStart(), onRetry() }) -> { update(payload), destroy() }
import { h } from './dom.js';
import { choiceCard } from './markers.js';

const LABEL = { audience: 'audience', formality: 'tone', language: 'language', density: 'how much detail',
  duration: 'length', include: 'in', exclude: 'left out', topics: 'topics', notes: 'note' };
const IDENTITY = { presenter: 'presenter', presenters: 'presenter', supervisor: 'supervisor', institution: 'institution',
  department: 'department', event: 'event', date: 'date' };
const short = (v, n = 44) => { const s = String(v).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// conclusions + identity -> the chips. Only what has a real value; a field Claude has not settled is simply not there.
export function settledChips(iv) {
  const c = (iv && iv.conclusions) || {}, id = (iv && iv.identity) || {}, out = [];
  for (const k of ['audience', 'formality', 'duration', 'density', 'language', 'topics', 'include', 'exclude', 'notes']) {
    const v = c[k];
    if (Array.isArray(v)) { if (v.length) out.push(`${LABEL[k]}: ${short(v.join(', '))}`); }
    else if (v != null && String(v).trim()) out.push(`${LABEL[k] || k}: ${short(v)}`);
  }
  for (const f of Array.isArray(id.established) ? id.established : []) {
    const v = id[f], name = Array.isArray(v) ? v.map(x => (x && typeof x === 'object' ? x.name : x)).filter(Boolean).join(', ') : v;
    if (name != null && String(name).trim()) out.push(`${IDENTITY[f] || f}: ${short(name)}`);
  }
  return out;
}

// the server's open questions -> what choiceCard takes. Its kind is 'choice'; the card's is 'pick'.
export function toChoices(openAll) {
  return (openAll || []).filter(q => q && q.id && q.question).map(q => ({
    id: q.id, key: q.when ? `${q.id}@${q.when}` : q.id,
    kind: q.kind === 'text' ? 'text' : 'pick',
    question: q.question, options: Array.isArray(q.options) ? q.options : [],
    multi: !!q.multi, defaults: Array.isArray(q.default) ? q.default : [],
    placeholder: q.placeholder || '', lines: q.lines || 3,
    when: q.when || '', conds: [], depends: [],
  }));
}

export function interviewScene(host, { sfx = () => {}, onAsk, onStart, onRetry } = {}) {
  let card = null, cardSig = '';
  const roundLine = h('p', { class: 'iv-round' });
  const chips = h('div', { class: 'iv-chips', 'aria-label': 'what claude has understood so far' });
  const chipsWrap = h('div', { class: 'iv-settled', hidden: true }, h('p', { class: 'iv-settled-h' }, 'so far'), chips);
  const slot = h('div', { class: 'iv-slot' });
  const el = h('div', { class: 'iv' },
    h('div', { class: 'iv-col' }, h('h1', { class: 'iv-h' }, 'lumi wants to know more'), roundLine, slot, chipsWrap));
  host.replaceChildren(el);

  const busyCard = (title, note) => h('div', { class: 'iv-wait' }, h('div', { class: 'iv-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    h('h2', { class: 'iv-wait-h' }, title), note ? h('p', { class: 'iv-wait-p' }, note) : null);
  const bigBtn = (label, fn) => { const b = h('button', { type: 'button', class: 'pl-big pl-ink pl-big-s1', 'data-nosfx': '' }, h('span', { class: 'pl-big-t' }, h('span', { class: 'pl-big-h' }, label))); b.addEventListener('click', () => { b.disabled = true; Promise.resolve(fn()).then(() => { b.disabled = false; }, () => { b.disabled = false; }); }); return b; };

  function dropCard() { card = null; cardSig = ''; }

  function update(p) {
    const st = p.interviewState, iv = p.interview || null, running = !!p.running;
    const round = Math.max(1, (iv && iv.round) || 1);
    roundLine.textContent = `round ${round}`;
    roundLine.hidden = st === 'error';
    const list = settledChips(iv);
    chipsWrap.hidden = !list.length;
    if (list.length && chips.dataset.sig !== list.join('|')) {
      chips.dataset.sig = list.join('|');
      chips.replaceChildren(...list.map(t => h('span', { class: 'iv-chip' }, t)));
    }
    if (st === 'error') {
      dropCard();
      slot.replaceChildren(h('div', { class: 'iv-wait' }, h('h2', { class: 'iv-wait-h' }, 'that round didn’t come through'),
        h('p', { class: 'iv-wait-p' }, String((p.interviewError || 'something went wrong.')).toLowerCase()),
        h('div', { class: 'pl-bigs' }, bigBtn('carry on', () => onRetry && onRetry()))));
      return;
    }
    if (st === 'waiting' && iv && (iv.openAll || []).length) {
      const qs = toChoices(iv.openAll);
      const sig = JSON.stringify([round, qs.map(q => [q.key, q.kind, q.question, q.options])]);
      if (sig !== cardSig) {
        cardSig = sig;
        card = choiceCard(qs, { sfx, sendLabel: 'send my answers', freeLabel: 'anything else? (optional)',
          onSend: t => { if (card) card.lock(t); if (onAsk) onAsk(t); } });
        slot.replaceChildren(card.el);
      }
      if (card) card.setEnabled(!running);
      return;
    }
    dropCard();
    if (running) {
      slot.replaceChildren(busyCard(round > 1 ? 'lumi is thinking about your answers' : 'lumi is reading your files',
        round > 1 ? 'the next question is on its way.' : 'it only asks what your files don’t say.'));
      return;
    }
    if (st === 'ready') { slot.replaceChildren(busyCard('claude has what it needs', 'moving on to your plan.')); return; }
    slot.replaceChildren(h('div', { class: 'iv-wait' }, h('h2', { class: 'iv-wait-h' }, 'ready when you are'),
      h('p', { class: 'iv-wait-p' }, 'claude reads your files, then asks a few things.'),
      h('div', { class: 'pl-bigs' }, bigBtn('start', () => onStart && onStart()))));
  }
  return { el, update, destroy() { dropCard(); host.replaceChildren(); } };
}
