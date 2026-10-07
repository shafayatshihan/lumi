'use strict';
// Editable-text ids (`data-edit="s<slide>-<n>"`), checked across the WHOLE deck.
//
// Post-mortem problem 8 (deck b45622aef312): slide 14 carried `data-edit="s14-1".."s14-4"` while slide 13 - the plan slide
// actually called `s14` - used `s14-...` ids of its own. The prefix is ambiguous in a deck whose plan ids have gaps
// (s1..s12, s14, s16): "slide 14" is both the 14th slide and the id `s14`. The editor finds a text by its id, so two
// sections sharing a prefix is a collision waiting to mis-route an inline edit, and two sections sharing a FULL id
// already do mis-route one.
//
// The rule, as deck-toolkit.md documents it and as new_deck.js --ids mints it: the prefix is the slide's POSITION in the
// deck, never the plan id. Ids are names, so a section keeps its prefix when the deck is reordered - which is why a
// prefix that merely disagrees with the current position is not an error. Two sections sharing one always is.
const SECTION_RE = /<section\b[^>]*\bclass\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]+)[^>]*>/gi;
const EDIT_RE = /\sdata-edit\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const OFF = new Set(['no', 'off', 'false']);

function stripInvisible(html) {
  // comments, scripts, styles and speaker notes never hold editable text
  return String(html || '').replace(/<!--[\s\S]*?-->|<(script|style|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, m => ' '.repeat(m.length));
}

/** Every `data-edit` id in the deck, grouped by the section it sits in (1-based, in document order). */
function scanEditIds(html) {
  const src = stripInvisible(html);
  const starts = [];
  SECTION_RE.lastIndex = 0;
  let m;
  while ((m = SECTION_RE.exec(src))) {
    const cls = m[2] ?? m[3] ?? m[1] ?? '';
    if (/(^|\s)slide(\s|$)/.test(cls)) starts.push(m.index);
  }
  const slides = starts.map((at, i) => ({ n: i + 1, at, end: i + 1 < starts.length ? starts[i + 1] : src.length, ids: [], prefixes: new Set() }));
  EDIT_RE.lastIndex = 0;
  while ((m = EDIT_RE.exec(src))) {
    const id = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (!id || OFF.has(id.toLowerCase())) continue;
    const s = slides.find(x => m.index > x.at && m.index < x.end);
    if (!s) continue;
    s.ids.push(id);
    const p = /^s(\d+)-\d+$/.exec(id);
    if (p) s.prefixes.add(p[1]);
  }
  return slides;
}

/**
 * errors / warnings for a deck's edit ids.
 *   shared prefix  - two sections mint ids under one `s<k>-` prefix (ERROR: the next id either side collides)
 *   duplicate id   - the same full id on two elements (ERROR: the editor retypes the wrong text)
 * A prefix that disagrees with the section's current position is NOT reported: ids are names, and a reordered deck
 * legitimately keeps them (deck-toolkit.md, "ids are names, not positions").
 */
function judgeEditIds(html) {
  const slides = scanEditIds(html);
  const errors = [], warnings = [];
  const owners = new Map();                       // prefix -> [slide numbers]
  for (const s of slides) for (const p of s.prefixes) owners.set(p, (owners.get(p) || []).concat(s.n));
  for (const [p, ns] of [...owners].sort((a, b) => +a[0] - +b[0])) {
    if (ns.length < 2) continue;
    errors.push({ slide: ns[ns.length - 1], msg: `slides ${ns.join(' and ')} both use data-edit ids starting "s${p}-". `
      + `A text id belongs to ONE slide: its prefix is the slide's position in the deck (this is slide ${ns[ns.length - 1]}, `
      + `so "s${ns[ns.length - 1]}-1", "s${ns[ns.length - 1]}-2", ...), never the plan id. Renumber this slide's ids.` });
  }
  const seen = new Map();
  for (const s of slides) for (const id of s.ids) seen.set(id, (seen.get(id) || []).concat(s.n));
  const dupes = [...seen].filter(([, ns]) => ns.length > 1);
  for (const [id, ns] of dupes.slice(0, 8)) {
    errors.push({ slide: ns[ns.length - 1], msg: `data-edit="${id}" is used ${ns.length} times (slide${ns.length > 1 ? 's' : ''} `
      + `${[...new Set(ns)].join(', ')}). The editor finds a text by this id, so two of them retype the wrong one.` });
  }
  return { slides, errors, warnings };
}

module.exports = { scanEditIds, judgeEditIds };
