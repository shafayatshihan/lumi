// B-05 / L-05 "never invent data", made checkable. Node-side logic for deck_check.js (the page side only collects each slide's text).
//
// Every number on a slide must be traceable to one of:
//   1. the user's own files   - the extracted text in .aura/temp/text/** plus the brief (auto-traced, nothing to write);
//   2. a provenance entry     - .aura/temp/build/<slug>/provenance.json, one entry per number that is NOT in the files:
//        { "claims": [ { "slide": 3, "text": "158 Pa to 355 kPa", "kind": "figure", "figure": "fig6.png", "readFrom": [0.9, 0.1, 0.08, 0.8],
//                        "note": "colour bar of Report Figure 6" },
//                      { "slide": 4, "text": "Mach 2.9", "kind": "published", "cite": "Etheridge et al. 2019, Journal of Fluids" },
//                      { "slide": 5, "text": "31 kPa", "kind": "computed", "from": ["200", "40", "8"] },
//                      { "slide": 2, "text": "42 %", "kind": "illustrative" },
//                      { "slide": 3, "text": "4-64 kHz", "kind": "source", "from": "Report section 3" },
//                      { "slide": 6, "text": "3.0059 mm", "kind": "scan", "file": "Report/thesis.pdf", "page": 5 } ] }
//   3. a visible "illustrative" mark - kind illustrative needs the slide to SAY so (illustrative / schematic / not to scale).
//   "scan" (D1) is a number read by eye off a SCANNED page of the user's own file, whose machine-read text got it wrong: the
//   manifest must list that page as scanned, and the check prints what the machine reading has nearby so a person can compare.
//
// What it catches: a number that is in no source and no declaration; a "source" claim the extracted text does not contain; a
// figure-read number whose evidence region (the colour bar) is not visible on the slide because the picture was cropped; a
// declaration missing from the speaker notes; a "computed" number built from numbers that are themselves untraced; a "scan"
// claim on a file or page that is not scanned (a page with real text is checked against its text).
// What it CANNOT catch (be honest about it): a made-up number that Claude also declares falsely as "published", "computed" or "scan"; a number
// that happens to coincide with an unrelated number in the files (matching is on the numeral, not its meaning); a claim with no digits
// ("twice as fast"); a number baked into a picture or a 3D texture; whether a cited paper really says what is cited.
'use strict';
const fs = require('fs'), path = require('path');

const UNITS = '%|°\\s?C|°\\s?F|°|K|Pa|kPa|MPa|GPa|bar|Hz|kHz|MHz|GHz|mm|cm|µm|um|nm|km|m|W|kW|MW|V|kV|A|mA|s|ms|min|h|kg|g|mg|mL|L|J|kJ|N|kN|rpm|dB|ppm|nodes|cells|years?';
const NUM_RE = new RegExp('(?<![\\w.,])(Mach\\s?)?[-−–+]?(\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.(\\d+))?(?:\\s?(' + UNITS + ')(?![A-Za-z]))?', 'g');

const clean = t => { let s = String(t || '').replace(/[−–—]/g, '-').replace(/[   ]/g, ' '), p; do { p = s; s = s.replace(/(\d),(\d{3})(?!\d)/g, '$1$2'); } while (s !== p); return s; };

// the numerals on a slide that are worth tracing: a unit, a decimal, 3+ digits or 11-99. Bare 0-10 are counts and ordinals
// ("3 stages", "step 2") and would make the check cry wolf (documented limit).
function numerals(text) {
  const out = [], seen = new Set(), t = clean(text);
  for (const m of t.matchAll(NUM_RE)) {
    const whole = m[2].replace(/,/g, ''), dec = m[3] || '', unit = m[4] || m[5] || '', mach = !!m[1];
    const value = dec ? whole + '.' + dec : whole;
    const bare = !dec && !unit && !mach;
    if (bare && whole.length <= 2 && Number(whole) <= 10) continue;
    if (bare && /^\d$/.test(whole)) continue;
    if (seen.has(value + unit)) continue; seen.add(value + unit);
    out.push({ value, unit, raw: (m[0] || '').trim() });
  }
  return out;
}

function readTree(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const n of fs.readdirSync(dir)) { const p = path.join(dir, n); let st; try { st = fs.statSync(p); } catch (e) { continue; }
    if (st.isDirectory()) { if (!/\.images$/i.test(n)) readTree(p, out); } else if (/\.txt$|\.md$/i.test(n)) out.push(p); }
  return out;
}

// the user's own words and numbers: the extracted text of their files, and the brief.
// textDir is THIS deck's own extracted text (.aura/decks/<id>/text). It matters: with one corpus for the whole library a
// number from another deck's report traces here, the check passes, and nobody learns the number is in no source of THIS
// deck. Without it, the shared .aura/temp/text of a deck made before per-deck folders, which is what those decks have.
function loadCorpus(auraRoot, textDir) {
  if (!auraRoot) return { text: '', files: 0 };
  const files = readTree(textDir || path.join(auraRoot, '.aura', 'temp', 'text'));
  let text = '';
  for (const f of files) { try { text += '\n' + fs.readFileSync(f, 'utf8'); } catch (e) { /* skip */ } }
  for (const f of ['brief.md']) { try { text += '\n' + fs.readFileSync(path.join(auraRoot, '.aura', 'brief', f), 'utf8'); } catch (e) { /* none */ } }
  return { text: clean(text), files: files.length, scans: loadScans(textDir || path.join(auraRoot, '.aura', 'temp', 'text')) };
}

// D1: the scanned pages of this deck's files, from the extractor's manifest: { 'report/thesis.pdf': { file, pages: Set, text: {5: '...'} } }.
// The page text is the machine reading, cut out of <file>.txt by its "--- page N ..." markers.
function loadScans(dir) {
  const out = {};
  let man; try { man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).files || {}; } catch (e) { return out; }
  for (const [rel, e] of Object.entries(man)) {
    if (!e || !Array.isArray(e.scanned) || !e.scanned.length) continue;
    const text = {};
    try {
      const parts = fs.readFileSync(path.join(dir, rel + '.txt'), 'utf8').split(/^--- page (\d+)[^\n]*---$/m);
      for (let i = 1; i < parts.length; i += 2) text[Number(parts[i])] = parts[i + 1] || '';
    } catch (er) { /* no text: nothing machine-read */ }
    out[rel.toLowerCase()] = { file: rel, pages: new Set(e.scanned.map(Number)), text };
  }
  return out;
}

const scanOf = (corpus, file) => {
  const s = (corpus && corpus.scans) || {}, f = String(file || '').replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
  return s[f] || Object.values(s).find(x => f && (x.file.toLowerCase().endsWith('/' + f) || f.endsWith('/' + x.file.toLowerCase()))) || null;
};

// what the machine reading has on that page that is one slip away from the number: a dropped decimal point (30329 for 3.0329),
// or one digit misread (3.0039 for 3.0059). Shown in the warning, so the presenter sees both and compares them on the page.
function nearMiss(value, text) {
  const want = value.replace(/\D/g, ''), toks = new Set();
  for (const t of [text || '', String(text || '').replace(/(\d) (?=\d)/g, '$1')]) for (const m of t.matchAll(/\d[\d.,]*\d|\d/g)) toks.add(m[0]);
  for (const t of toks) {
    const d = t.replace(/\D/g, '');
    if (d === want) return t;
    if (d.length === want.length && [...d].filter((c, i) => c !== want[i]).length === 1) return t;
  }
  return '';
}

const inCorpus = (corpus, value) => {
  const esc = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(?<![\\d.])' + esc + '(?![\\d]|\\.\\d)').test(corpus.text);
};

function loadProvenance(deckPath, auraRoot) {
  const dir = path.dirname(deckPath), tried = [path.join(dir, path.basename(deckPath).replace(/\.html?$/i, '') + '.provenance.json'), path.join(dir, 'provenance.json')];
  const f = tried.find(x => fs.existsSync(x));
  if (!f) return { claims: [], file: null, error: null };
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
    const claims = Array.isArray(j) ? j : (Array.isArray(j.claims) ? j.claims : []);
    return { claims, file: f, error: null };
  } catch (e) { return { claims: [], file: f, error: 'provenance.json is not valid JSON: ' + String(e.message).slice(0, 100) }; }
}

const DECLARES = {
  published: /cited|published|reference|source|paper|et al|literature/i,
  illustrative: /illustrative|schematic|not to scale|placeholder|conceptual|sketch/i,
  computed: /calculated|computed|derived|worked out|estimated/i,
  figure: /figure|fig\.|read (off|from)|chart|plot/i,
  scan: /scanned|read (off|from) (the )?page|page \d+/i,
};

// slides: [{ n, text, notes, visibleIllustrative, figures: [{ src, figure, crop }] }]. Returns { errors: [{slide,msg}], warnings, traced, declared, figureRead }
function judge({ slides, corpus, prov, brief }) {
  const errors = [], warnings = [], err = (n, m) => errors.push({ slide: n, msg: m }), warn = (n, m) => warnings.push({ slide: n, msg: m });
  const stat = { numbers: 0, traced: 0, declared: 0, figureRead: 0 };
  if (prov.error) err(0, prov.error);
  const claims = prov.claims.map(c => Object.assign({}, c, { _norm: clean(c.text || c.value || ''), _used: false }));
  const claimed = new Set();           // numerals already accepted through a claim (for "computed" lineage)
  const find = (n, v) => claims.filter(c => (c.slide == null || c.slide === 0 || Number(c.slide) === n) && new RegExp('(?<![\\d.])' + v.replace(/\./g, '\\.') + '(?![\\d]|\\.\\d)').test(c._norm));
  for (const s of slides) {
    for (const x of numerals(s.text)) {
      stat.numbers++;
      if (inCorpus(corpus, x.value)) { stat.traced++; continue; }
      const cs = find(s.n, x.value);
      const label = `"${x.raw}"`;
      if (!cs.length) { err(s.n, `number ${label} is not in your files and has no provenance entry. Remove it, or add it to provenance.json with its kind (source / published / computed / figure / scan / illustrative) - never leave an unexplained number on a slide.`); continue; }
      stat.declared++;
      for (const c of cs) {
      c._used = true;
      const kind = String(c.kind || '').toLowerCase();
      const notesOk = k => DECLARES[k] && DECLARES[k].test(s.notes || '');
      if (kind === 'source') err(s.n, `number ${label} is claimed to come from your files (${c.from || c.ref || '?'}) but the extracted text of your files does not contain it. If it was read off a figure, say kind "figure"; off a scanned page, kind "scan"; if it is not in your files, it is not a source number.`);
      else if (kind === 'scan') {
        const page = Number(c.page), sc = scanOf(corpus, c.file);
        if (!c.file || !(page >= 1)) { err(s.n, `number ${label} was read off a scanned page but names no file and page (file: "Report/thesis.pdf", page: 5).`); continue; }
        if (!sc) { err(s.n, `number ${label} cites ${c.file}, which is not a scanned file of this deck (its manifest lists no scanned pages). A file with real text is checked against its text.`); continue; }
        if (!sc.pages.has(page)) { err(s.n, `number ${label} cites page ${page} of ${sc.file}, which is not a scanned page (scanned: ${[...sc.pages].join(', ')}).`); continue; }
        if (!notesOk('scan')) err(s.n, `number ${label} was read off scanned page ${page}: the speaker notes must say so ("read off scanned page ${page} of ...") so the presenter can defend it.`);
        const near = nearMiss(x.value, sc.text[page]);
        warn(s.n, `number ${label} was read by eye off scanned page ${page} of ${sc.file}; ` + (near ? `the machine reading there says "${near}".` : 'the machine reading has nothing close to it on that page.') + ' Check it against the page.');
      }
      else if (kind === 'published') {
        const cite = String(c.cite || '');
        if (cite.length < 8) err(s.n, `number ${label} is marked published but has no citation (cite: "Author year, venue").`);
        else {
          const word = (cite.match(/[A-Za-z]{4,}/) || [''])[0].toLowerCase();
          if (word && !(s.text + ' ' + (s.notes || '')).toLowerCase().includes(word)) err(s.n, `number ${label} cites "${cite}" but neither the slide nor its speaker notes show that citation.`);
          if (!notesOk('published')) err(s.n, `number ${label} is a published value: the speaker notes must say where it comes from.`);
        }
      } else if (kind === 'computed') {
        const from = Array.isArray(c.from) ? c.from.map(v => clean(v).replace(/[^\d.]/g, '')).filter(Boolean) : [];
        if (!from.length) err(s.n, `number ${label} is marked computed but lists no inputs (from: ["200", "40"]).`);
        for (const v of from) if (!inCorpus(corpus, v) && !claims.some(o => o !== c && new RegExp('(?<![\\d.])' + v.replace(/\./g, '\\.') + '(?!\\d)').test(o._norm))) err(s.n, `number ${label} is computed from ${v}, which is itself not in your files or in provenance.json.`);
        if (!notesOk('computed')) err(s.n, `number ${label} is a calculated value: the speaker notes must say how it was worked out.`);
      } else if (kind === 'illustrative') {
        if (!s.visibleIllustrative) err(s.n, `number ${label} is declared illustrative but the slide does not say so. Write "illustrative" / "schematic" / "not to scale" on the slide where the number is.`);
        if (!notesOk('illustrative')) err(s.n, `number ${label} is illustrative: the speaker notes must declare it, so the presenter does not present it as data.`);
      } else if (kind === 'figure') {
        stat.figureRead++;
        const fig = String(c.figure || '');
        if (!fig) { err(s.n, `number ${label} was read off a figure but names no figure (figure: "fig6.png"). A figure-derived number needs its figure cited.`); continue; }
        const rf = Array.isArray(c.readFrom) && c.readFrom.length === 4 ? c.readFrom.map(Number) : null;
        if (!rf || rf.some(v => !(v >= 0 && v <= 1))) { err(s.n, `number ${label} was read off ${fig} but gives no readFrom region [x, y, w, h] (fractions 0-1 of the picture) where the evidence is. The audience must be able to see that part of the figure.`); continue; }
        const shown = s.figures.filter(f => f.src.toLowerCase().includes(fig.toLowerCase().replace(/\.[a-z]+$/, '')) || (f.figure || '').toLowerCase() === fig.toLowerCase());
        if (!shown.length) err(s.n, `number ${label} was read off ${fig}, but that picture is not on this slide, so nobody can check it.`);
        else {
          const ok = shown.some(f => {
            if (!f.crop) return true;                                       // no crop declared: the whole picture shows
            const [cx, cy, cw, ch] = f.crop; const [x, y, w, h] = rf, e = 0.01;
            return x >= cx - e && y >= cy - e && x + w <= cx + cw + e && y + h <= cy + ch + e;
          });
          if (!ok) err(s.n, `number ${label} was read from region [${rf.join(', ')}] of ${fig}, but this slide crops that region away (data-crop). Never crop out the part of a figure that the slide's own number or caption cites.`);
        }
        if (!notesOk('figure')) err(s.n, `number ${label} was read off a figure: the speaker notes must say "read off figure ..." so the presenter can defend it.`);
        warn(s.n, `number ${label} is not in the text of your files; it was read off ${fig} by eye. Check it against the figure.`);
      } else err(s.n, `number ${label}: unknown provenance kind "${c.kind}" (use source / published / computed / figure / scan / illustrative).`);
      }
    }
  }
  claims.filter(c => !c._used).forEach(c => warn(c.slide || 0, `provenance.json lists "${c.text || c.value}" but no such number is on the slides (remove the entry).`));
  return { errors, warnings, stat };
}

// L-15: the title slide must carry the identity the BRIEF ESTABLISHED - nothing more.
// `brief.identity` is the contract the interview writes: [{label, value}, ...], built only from the fields Claude
// actually asked about AND got a value for. An absent or empty list means nobody was named, so a deck with no
// supervisor, no institution and no event is legal - which is the point of replacing the 40-field form.
// The old people.* / basics.* shape is kept for ONE release so a deck made with v0.5.3 still fails exactly where it
// did before; it is read only when `identity` is missing entirely (an explicit empty list wins over it).
function identityList(brief) {
  if (!brief) return [];
  if (Array.isArray(brief.identity)) {
    return brief.identity
      .map(x => (x && typeof x === 'object' ? [String(x.label || '').trim() || 'name', x.value] : null))
      .filter(x => x && x[1] != null && String(x[1]).trim());
  }
  const want = [];                                               // ---- one-release fallback: the v0.5.3 brief shape ----
  const P = (brief.people || {});
  (Array.isArray(P.presenters) ? P.presenters : []).forEach(p => p && p.name && want.push(['presenter', p.name]));
  ['supervisor:supervisor', 'institution:institution', 'department:department'].forEach(k => { const [f, l] = k.split(':'); if (P[f]) want.push([l, P[f]]); });
  const B = brief.basics || {};
  if (B.event) want.push(['event', B.event]);
  if (B.date) { const y = String(B.date).match(/\b(19|20)\d\d\b/); if (y) want.push(['date', y[0]]); }
  return want;
}

function titleFields(brief, text) {
  const want = identityList(brief);
  if (!want.length) return [];
  const words = v => clean(v).toLowerCase().split(/[^a-z0-9À-￿]+/).filter(w => w.length >= 3 && !/^(the|and|dept|department|university|prof|professor|dr)$/.test(w));
  const T = clean(text).toLowerCase();
  const missing = [];
  for (const [label, v] of want) {
    const ws = words(v); if (!ws.length) continue;
    const hit = ws.filter(w => T.includes(w)).length;
    if (hit / ws.length < 0.6) missing.push(`${label} "${String(v).slice(0, 50)}"`);
  }
  return missing;
}

module.exports = { DECLARES, numerals, loadCorpus, loadProvenance, judge, titleFields, identityList, clean, inCorpus };
