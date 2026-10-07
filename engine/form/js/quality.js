// "how hard claude thinks": the quality choice, on the look step, in two layers.
//
// WHY TWO LAYERS. Every user-facing string in this product is written for someone who is not technical, and "Opus / high
// effort" is jargon to most people - so the plain surface keeps the four calm tiers and says what each one costs and saves
// in time and in a plain share of the claude allowance, never in tokens and never in money. But the owner is a power user on
// their own machine and wants the two real axes, so an advanced control (closed by default, clearly labelled) exposes the
// model and the effort level by their real names. That surface is for someone who wants the detail.
//
// ONE STORED VALUE. A tier and a (model, effort) pair are the SAME setting read two ways, never two settings that can
// disagree. The server stores one `quality` string: a tier's name when a tier means exactly that pair, else "<model>/<effort>".
// So picking a tier sets the pair, and setting the pair back to a tier's combination shows that tier's name again.
//
// WHAT NO TIER CHANGES: the pictures. Blender's settings are a fixed dict on the server, so a 3D render takes exactly as long
// and comes out pixel for pixel the same whichever tier is chosen. Only claude's own thinking moves. The notes below say so,
// because without it "fast" reads as "worse pictures", which it is not.
import { h } from './dom.js';
import { shareWords } from './plan.js';

const TIER_NOTE = {
  best: 'thinks hardest',
  maximum: 'thinks longest, slowest',
  balanced: 'a little quicker',
  fast: 'quickest, lighter model',
};

// -> [{ text, warn }] : what one tier costs against the default, in plain words. `opts` is the server's qualityOptions.
export function qualityLines(opts, quality) {
  const tiers = (opts && opts.tiers) || [];
  const def = tiers.find(t => t.quality === ((opts && opts.default) || 'best')) || null;
  const now = tiers.find(t => t.quality === quality) || null;
  const out = [];
  if (!now || !def) return out;                       // a custom pair: the advanced control already names it exactly
  if (now.quality === def.quality) {
    // the default needs no explanation
  } else if (now.share < 1) {
    out.push({ text: `uses ${shareWords(now.share)} of the allowance and finishes sooner.`, warn: false });
  } else if (now.share > 1) {
    out.push({ text: 'uses more of your allowance and takes longer.', warn: true });
  }
  out.push({ text: 'pictures look the same on every setting.', warn: false });
  return out;
}

const plainName = t => String((t && t.quality) || '').replace('best', 'best quality');

// -> the one line that names a custom pair, or '' for a tier
export function customLine(view) {
  if (!view || view.tier || !view.model) return '';
  return `${view.model}, ${view.effort} effort. pick a setting above to go back.`;
}

// mountQuality(el, { value, options, onChange }) -> { set(quality), destroy() }
// `value` is the stored quality string; onChange is called with a new stored quality string (never a pair object).
export function mountQuality(el, { value, options, onChange = () => {}, sfx = () => {} } = {}) {
  const opts = options || { tiers: [], models: [], efforts: [], default: 'best' };
  let q = value || opts.default || 'best';
  const pairOf = s => {
    const t = (opts.tiers || []).find(x => x.quality === s);
    if (t) return [t.model, t.effort];
    const [m, e] = String(s).split('/');
    return [m, e];
  };
  // the same canonicalisation the server does, so the two never drift: a pair a tier covers IS that tier
  const canon = (m, e) => { const t = (opts.tiers || []).find(x => x.model === m && x.effort === e); return t ? t.quality : `${m}/${e}`; };

  const rowsEl = h('div', { class: 'ql-rows', role: 'radiogroup', 'aria-label': 'how hard claude thinks' });
  const noteEl = h('p', { class: 'ql-note', 'aria-live': 'polite' });
  const advB = h('button', { type: 'button', class: 'ql-adv-b', 'aria-expanded': 'false', 'data-nosfx': '' },
    h('span', { class: 'ql-adv-dots', 'aria-hidden': 'true' }, '⋯'), 'choose the model yourself');
  const modelEl = h('div', { class: 'ql-pills', role: 'radiogroup', 'aria-label': 'model' });
  const effortEl = h('div', { class: 'ql-pills', role: 'radiogroup', 'aria-label': 'effort level' });
  const advEl = h('div', { class: 'ql-adv', hidden: true },
    h('p', { class: 'ql-adv-lead' }, 'the model and effort behind these.'),
    h('span', { class: 'ql-lab' }, 'model'), modelEl, h('span', { class: 'ql-lab' }, 'effort'), effortEl);
  advB.addEventListener('click', () => {
    const open = advB.getAttribute('aria-expanded') === 'true';
    advB.setAttribute('aria-expanded', open ? 'false' : 'true');
    advEl.hidden = open;
    sfx('select');
  });
  el.append(h('span', { class: 'ql-h' }, 'how hard claude thinks'), rowsEl, noteEl, advB, advEl);

  function paint() {
    const [m, e] = pairOf(q);
    rowsEl.replaceChildren(...(opts.tiers || []).map(t => {
      const on = t.quality === q;
      const b = h('button', { type: 'button', class: 'ql-row' + (on ? ' on' : ''), role: 'radio', 'aria-checked': on ? 'true' : 'false',
        'data-q': t.quality, 'data-nosfx': '', 'data-cursor-label': 'pick' },
        h('span', { class: 'ql-row-t' }, h('b', {}, t.quality === 'best' ? 'best quality' : t.quality),
          t.quality === opts.default ? h('span', { class: 'ql-rec' }, 'recommended') : null),
        h('span', { class: 'ql-row-n' }, TIER_NOTE[t.quality] || ''));
      b.addEventListener('click', () => set(t.quality));
      return b;
    }));
    const lines = qualityLines(opts, q);
    const custom = customLine({ tier: (opts.tiers || []).some(t => t.quality === q) ? q : null, model: m, effort: e });
    noteEl.replaceChildren(...(custom ? [h('span', {}, custom)] : lines.map(l => h('span', { class: l.warn ? 'ql-warn' : '' }, l.text))));
    const pill = (row, id, label, on, pick) => {
      const b = h('button', { type: 'button', class: 'ql-pill' + (on ? ' on' : ''), role: 'radio', 'aria-checked': on ? 'true' : 'false',
        'data-id': id, 'data-nosfx': '' }, label);
      b.addEventListener('click', pick);
      row.append(b);
    };
    modelEl.replaceChildren(); effortEl.replaceChildren();
    for (const x of opts.models || []) pill(modelEl, x.id, x.label, x.id === m, () => set(canon(x.id, e)));
    for (const x of opts.efforts || []) pill(effortEl, x.id, x.label, x.id === e, () => set(canon(m, x.id)));
  }
  function set(next) {
    if (next === q) return;
    q = next; sfx('select'); paint(); onChange(q);
  }
  paint();
  return { get value() { return q; }, set(v) { q = v || opts.default; paint(); }, destroy() { el.replaceChildren(); } };
}
