#!/usr/bin/env node
// Start a new deck from the Aura template.
//   node .aura/engine/tools/new_deck.js "<Deck title>" --theme pink-punch [--slug my-deck] [--kicker "Thesis defence"] [--force]
// Creates .aura/temp/build/<slug>/index.html (runtime, theme, three.js import map already wired) and an assets/ folder.
// A look with its own template (Bold Blue) starts from it, with the look's helper scripts wired in.
//
// Archetype slides (Bold Blue): print a ready slide with placeholder content to paste into the deck:
//   node .aura/engine/tools/new_deck.js --snippet list
//   node .aura/engine/tools/new_deck.js --snippet what-it-is --slide 3
//
// Give every editable text a stable id (run after writing or changing slides; safe to run any number of times):
//   node .aura/engine/tools/new_deck.js --ids .aura/temp/build/<slug> [--check]
// Adds data-edit="s<slide>-<n>" to every title, kicker, body line, label and caption that has none, keeps every id that
// already exists (ids are names, not positions: they never change when slides move), and renames accidental duplicates
// (the first element keeps the id, the copy gets a new one). --check only reports and exits 3 when something is missing.
'use strict';
const fs = require('fs'), path = require('path');
const { ENGINE, findAuraRoot } = require('./lib/deckpage');

const THEMES = { 'pink-punch': 'Pink Punch', 'bold-blue': 'Bold Blue', 'flat-pack': 'Flat-Pack',
  'happy-headspace': 'Happy Headspace', 'clay-pop': 'Clay Pop' };
const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf('--' + n); return i >= 0 ? args.splice(i, 2)[1] : null; };
const flag = n => { const i = args.indexOf('--' + n); return i >= 0 ? (args.splice(i, 1), true) : false; };

/* ---------------- data-edit ids ---------------- */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
  'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'stop', 'use']);
const TEXT_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'figcaption', 'blockquote', 'td', 'th', 'dt', 'dd',
  'caption', 'text']);
const TEXT_CLASSES = /(^|\s)(kicker|title|headline|sub|subtitle|lead|label|caption|source|big-num|stat|quote|pill)(\s|$)/;
const attrOf = (attrs, name) => {
  const m = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i').exec(attrs);
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null;
};
const hasAttr = (attrs, name) => new RegExp('(?:^|\\s)' + name + '(\\s|=|$)', 'i').test(attrs);

function assignIds(html) {
  // tags in document order; comments, scripts and styles are skipped whole
  const tok = /<!--[\s\S]*?-->|<(script|style|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  const stack = [], found = [];
  let slideNo = 0, lastEnd = 0, m;
  const inside = key => stack.some(e => e[key]);
  while ((m = tok.exec(html))) {
    const [all, , closeName, openName, attrs = '', selfClose] = m;
    const between = html.slice(lastEnd, m.index);           // text between tags belongs to every open candidate
    if (between.trim()) for (const e of stack) if (e.cand) e.text += between;
    lastEnd = m.index + all.length;
    if (closeName) {
      const name = closeName.toLowerCase();
      let k = stack.length - 1;
      while (k >= 0 && stack[k].name !== name) k--;
      if (k < 0) continue;
      while (stack.length > k) { const e = stack.pop(); if (e.cand) found.push(e); }
      continue;
    }
    if (!openName) continue;
    const name = openName.toLowerCase();
    const cls = attrOf(attrs, 'class') || '';
    const existing = attrOf(attrs, 'data-edit');
    const e = { name, start: m.index, nameEnd: m.index + 1 + openName.length, text: '' };
    e.slide = name === 'section' && /(^|\s)slide(\s|$)/.test(cls);
    if (e.slide) slideNo++;
    e.skip = (name === 'aside' && (hasAttr(attrs, 'data-aura-notes') || /(^|\s)notes(\s|$)/.test(cls)))
      || name === 'defs' || hasAttr(attrs, 'data-aura-ui') || /^(no|off|false)$/i.test(existing || '');
    const inSlide = inside('slide');
    if (inSlide && !inside('skip') && !inside('cand') && !e.skip && (existing || TEXT_TAGS.has(name) || TEXT_CLASSES.test(cls))) {
      e.cand = true;
      e.id = existing;
      e.slideAt = slideNo;
      if (existing !== null) {
        const q = /(\sdata-edit\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/i.exec(attrs);
        e.idStart = e.nameEnd + q.index + q[1].length; e.idLen = q[2].length;
      }
    }
    if (selfClose || (VOID.has(name) && !TEXT_TAGS.has(name))) { if (e.cand && e.id) found.push(e); continue; }
    stack.push(e);
  }
  found.sort((a, b) => a.start - b.start);
  const used = new Set(), maxBySlide = {}, edits = [];
  let added = 0, renamed = 0, kept = 0;
  const byPrefix = {};                       // prefix -> the set of section positions that already use it
  for (const e of found) {
    const mm = e.id && /^s(\d+)-(\d+)$/.exec(e.id);
    if (!mm) continue;
    maxBySlide[mm[1]] = Math.max(maxBySlide[mm[1]] || 0, +mm[2]);
    (byPrefix[mm[1]] = byPrefix[mm[1]] || new Set()).add(e.slideAt);
  }
  // Which prefix a section mints NEW ids under (post-mortem problem 8). Normally it is the section's own position - the
  // rule deck-toolkit.md states - but ids are names, so a section that already has ids keeps the prefix they agree on,
  // even after the deck is reordered. A prefix another section already owns is never handed out twice: two sections
  // minting under one prefix is how slide 13 and slide 14 of deck b45622aef312 both came to write "s14-...".
  const ownedBy = {}, taken = new Set();
  for (const k of Object.keys(byPrefix)) {
    if (byPrefix[k].size !== 1) continue;    // a prefix two sections already share belongs to neither
    const sec = [...byPrefix[k]][0];
    if (ownedBy[sec] === undefined || Math.abs(+k - sec) < Math.abs(ownedBy[sec] - sec)) ownedBy[sec] = +k;
  }
  for (const sec of Object.keys(ownedBy)) taken.add(ownedBy[sec]);
  const prefixOf = sec => {
    if (ownedBy[sec] !== undefined) return String(ownedBy[sec]);
    let k = sec;
    while (taken.has(k) || byPrefix[String(k)]) k++;
    taken.add(k); ownedBy[sec] = k; return String(k);
  };
  const nextId = k => { let n = (maxBySlide[k] || 0) + 1, id; while (used.has(id = 's' + k + '-' + n)) n++; maxBySlide[k] = n; return id; };
  for (const e of found) {
    if (e.id && !used.has(e.id)) { used.add(e.id); kept++; continue; }
    if (!e.id && !e.text.replace(/&nbsp;|&#160;/g, ' ').trim()) continue;      // empty boxes filled by a script: leave alone
    const id = nextId(prefixOf(e.slideAt)); used.add(id);
    if (e.id) { edits.push({ at: e.idStart, len: e.idLen, str: '"' + id + '"' }); renamed++; }
    else { edits.push({ at: e.nameEnd, len: 0, str: ' data-edit="' + id + '"' }); added++; }
  }
  edits.sort((a, b) => b.at - a.at);
  let out = html;
  for (const x of edits) out = out.slice(0, x.at) + x.str + out.slice(x.at + x.len);
  let shared = [];
  try { shared = require('./lib/edit_ids').judgeEditIds(out).errors; } catch (e) { /* the check is advisory here */ }
  return { html: out, added, renamed, kept, slides: slideNo, shared };
}

if (flag('ids')) {
  const checkOnly = flag('check');
  let target = path.resolve(args[0] || '.');
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
  if (!fs.existsSync(target)) { console.error('Deck not found: ' + target); process.exit(1); }
  const src = fs.readFileSync(target, 'utf8');
  const r = assignIds(src);
  if (!checkOnly && r.html !== src) {
    const tmp = target + '.part';
    fs.writeFileSync(tmp, r.html, 'utf8');
    fs.renameSync(tmp, target);
  }
  console.log(`Editable text ids: ${r.kept} kept, ${r.added} ${checkOnly ? 'missing' : 'added'}, ` +
    `${r.renamed} duplicate${r.renamed === 1 ? '' : 's'} ${checkOnly ? 'found' : 'renamed'} (${r.slides} slides)`);
  for (const x of r.shared || []) console.log('  problem: slide ' + x.slide + ': ' + x.msg);
  // --ids writes what it can and says what it cannot fix: a shared `s<k>-` prefix needs a slide renumbered by hand, so it
  // fails the --check gate but never the write (deck_check.js reports it as an error after the build step either way).
  process.exit(checkOnly && (r.added || r.renamed || (r.shared || []).length) ? 3 : 0);
}

/* ---------------- archetype snippets (looks that have them: Bold Blue, Flat-Pack) ---------------- */
const snippet = opt('snippet');
if (snippet) {
  const look = (opt('theme') || 'bold-blue').toLowerCase();
  const n = parseInt(opt('slide') || '0', 10);
  const dirA = path.join(ENGINE, 'deck', 'looks', look, 'archetypes');
  if (!fs.existsSync(dirA)) { console.error('The ' + look + ' look has no archetype snippets.'); process.exit(1); }
  const names = fs.readdirSync(dirA).filter(f => f.endsWith('.html')).map(f => f.slice(0, -5));
  if (snippet === 'list') {
    console.log('Archetypes for ' + look + ' (default story order: title-hero, problem-stats, what-it-is, process-film, comparison-twin, ' +
      'annotated-photo, system-tour, result-chart, objectives-tour, closing):');
    names.forEach(nm => { const head = /<!--\s*archetype:\s*([^>]*?)-->/.exec(fs.readFileSync(path.join(dirA, nm + '.html'), 'utf8'));
      console.log('  ' + nm.padEnd(16) + (head ? head[1].split('|').slice(1).join('|').trim() : '')); });
    console.log('Print one with: node .aura/engine/tools/new_deck.js --snippet <name> --slide <n>');
    process.exit(0);
  }
  if (!names.includes(snippet)) { console.error('Unknown archetype "' + snippet + '". Use one of: ' + names.join(', ')); process.exit(1); }
  if (!n) { console.error('Add --slide <n>: the slide number this snippet becomes (it names its text ids and scene id).'); process.exit(1); }
  const pad = String(Math.max(1, n - 1)).padStart(2, '0');     // kickers count sections: the title slide has none
  process.stdout.write(fs.readFileSync(path.join(dirA, snippet + '.html'), 'utf8').replace(/\{\{N\}\}/g, String(n))
    .replace(/(class="kicker[^"]*"[^>]*>)\d\d ·/, '$1' + pad + ' ·'));
  process.exit(0);
}

/* ---------------- new deck ---------------- */
const force = flag('force');
let theme = (opt("theme") || "bold-blue").toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
const slugArg = opt('slug'), kicker = opt('kicker') || '';
const title = args.join(' ').trim();

if (!title) {
  console.error('usage: node new_deck.js "<Deck title>" --theme pink-punch|bold-blue|flat-pack|happy-headspace|clay-pop\n' +
    '       node new_deck.js --ids <build folder> [--check]');
  process.exit(1);
}
if (!THEMES[theme]) { console.error('Unknown theme "' + theme + '". Use one of: ' + Object.keys(THEMES).join(', ')); process.exit(1); }
const root = findAuraRoot(process.cwd());
if (!root) { console.error('Run this from the Lumi folder (the one that contains .aura).'); process.exit(1); }

const slug = (slugArg || title).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 48) || 'deck';
const dir = path.join(root, '.aura', 'temp', 'build', slug);
const file = path.join(dir, 'index.html');
const relDir = path.relative(root, dir).split(path.sep).join('/');
if (fs.existsSync(file) && !force) {
  console.log('Deck already exists (kept as it is): ' + path.relative(root, file).split(path.sep).join('/'));
  console.log('Add --force to start again from the template.');
  process.exit(0);
}
fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
const engineRel = path.relative(dir, path.join(root, '.aura', 'engine')).split(path.sep).join('/');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// a look may bring its own helpers (Bold Blue: the 3D studio, the chart and the page-number chrome) and its own
// starting slides; the deck is marked data-look so the checker applies that look's measured thresholds
// ...and every look loads the shared deck libraries FIRST: the one post stack (lib/post.js) and the policy that
// decides whether a slide may have it (lib/post-policy.js). The policy is off for any look it does not know, so
// loading them changes nothing by itself.
// ...and the illustration engine (lib/illus.js), which draws the slide's non-3D picture as inline SVG in the look's
// own drawing style. It registers nothing and draws nothing by itself; a slide uses it by calling LumiIllus.draw.
const SHARED_HEAD = '<script src="{{ENGINE}}/deck/lib/post.js"></script>\n' +
                    '<script src="{{ENGINE}}/deck/lib/post-policy.js"></script>\n' +
                    '<script src="{{ENGINE}}/deck/lib/illus.js"></script>\n';
const LOOK_HEAD = {
  'bold-blue': SHARED_HEAD +
               '<script src="{{ENGINE}}/deck/looks/bold-blue/bold-blue.js"></script>\n' +
               '<script src="{{ENGINE}}/deck/looks/bold-blue/studio3d.js"></script>\n' +
               '<script src="{{ENGINE}}/deck/looks/bold-blue/timeline.js"></script>\n' +
               '<script src="{{ENGINE}}/deck/looks/bold-blue/physics.js"></script>\n',
  'flat-pack': SHARED_HEAD +
               '<script src="{{ENGINE}}/deck/looks/flat-pack/flat-pack.js"></script>\n' +
               '<script src="{{ENGINE}}/deck/looks/flat-pack/fp3d.js"></script>\n',
  'pink-punch': SHARED_HEAD +
               '<script src="{{ENGINE}}/deck/looks/pink-punch/pink-punch.js"></script>\n' +
               '<script src="{{ENGINE}}/deck/looks/pink-punch/pp3d.js"></script>\n',
  'happy-headspace': SHARED_HEAD +
               '<script src="{{ENGINE}}/deck/looks/happy-headspace/happy-headspace.js"></script>\n' +
               '<script src="{{ENGINE}}/deck/looks/happy-headspace/hs3d.js"></script>\n',
  'clay-pop': SHARED_HEAD +
               '<script src="{{ENGINE}}/deck/looks/clay-pop/clay-pop.js"></script>\n' +
               '<script src="{{ENGINE}}/deck/looks/clay-pop/cp3d.js"></script>\n',
};
const lookTemplate = path.join(ENGINE, 'deck', 'looks', theme, 'template.html');
const html = fs.readFileSync(fs.existsSync(lookTemplate) ? lookTemplate : path.join(ENGINE, 'deck', 'template.html'), 'utf8')
  .replace(/\{\{LOOK_HEAD\}\}/g, LOOK_HEAD[theme] || '')
  .replace(/\{\{ENGINE\}\}/g, engineRel).replace(/\{\{THEME\}\}/g, theme)
  .replace(/\{\{TITLE\}\}/g, esc(title)).replace(/\{\{KICKER\}\}/g, esc(kicker || THEMES[theme]));
fs.writeFileSync(file, html, 'utf8');
console.log('New deck: ' + path.relative(root, file).split(path.sep).join('/'));
console.log('Theme: ' + THEMES[theme] + '  (rules: .aura/engine/deck/themes/' + theme + '.css)');
// a look with its own spec: the shared base first, then the look's own file (both override the form style choices)
const LOOK_SPEC = { 'bold-blue': 'Bold Blue', 'flat-pack': 'Flat-Pack',
                    'pink-punch': 'Pink Punch', 'happy-headspace': 'Happy Headspace', 'clay-pop': 'Clay Pop' };
if (LOOK_SPEC[theme]) console.log(LOOK_SPEC[theme] + ': follow .claude/skills/aura-slide/looks/_shared/LOOK-BASE.md then ' +
  '.claude/skills/aura-slide/looks/' + theme + '/LOOK.md (they override the form style choices).');
console.log('Put pictures for the deck in: ' + relDir + '/assets');
console.log('After writing the slides run: node .aura/engine/tools/new_deck.js --ids ' + relDir);
