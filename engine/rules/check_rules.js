#!/usr/bin/env node
// Lumi HARD RULES checker. Claude Code runs it through hooks in .claude/settings.json:
//   PostToolUse (Write|Edit|MultiEdit) --hook : checks the HTML file that was just written (text size + did the 3D start)
//   Stop                                --stop : runs the FULL deck check (tools/deck_check.js) on the deck being built in this run,
//                                                and on nothing else (B-01, B-04)
// A violation exits with code 2, which Claude Code treats as blocking: the message goes back to Claude, who must fix it.
// The rules come from hard-rules.json next to this file. Both files are protected by deny rules in .claude/settings.json.
//
// Rule 1 - minimum text size: every piece of text (HTML and SVG <text>) is measured in a real browser (Microsoft Edge)
// at the 1920x1080 design size, including the effect of CSS transforms and SVG viewBox scaling.
// Speaker notes are not slide text and are skipped when marked with data-aura-notes, .notes or .pnotes.
// Aura deck runtime chrome (slide counter, buttons) is marked data-aura-ui and skipped too; it never shows text below
// the minimum anyway. Every file is opened with ?aura=all so an Aura deck shows ALL its slides, unscaled, in their
// final state. Text that is not rendered (display:none) is still measured.
//
// Looks: a deck styled with a look listed in hard-rules.json -> looks (today: Bold Blue) is held to that look's own
// measured minimum instead of the generic one. The look is read from the page itself: the theme stylesheet sets the
// --aura-look token (inlined in packed decks too) and <html data-look> must agree. Checking never switches off.
//
// usage (manual): node check_rules.js <file.html> [...]
//
// Studio renders (Blender slides): the --stop pass runs deck_check.js, which also checks each .bb-blender holder (tools/lib/blender_check.js:
// render present and readable, size, background = the slide colour at the edges, not black / blank, seamless loop, file budget). While a slide is
// still being built the missing / draft render is only a warning; the hook never blocks on it.
// B-01: the app writes .aura/temp/current-run.json when it starts a Claude run (deck id, work folder, start time). --stop checks
// exactly the HTML files this run wrote: the deck's work folder, the build folder it touched, or a fresh file in "4 - Your
// slides". Nothing written in this run = nothing checked (a "do not use any tools" turn stays untouched), and Older versions /
// other decks are never looked at.
// B-02: every deck is served over http from a private local server (three.js cannot load from file://) and the page is probed
// afterwards: if it did not finish drawing, or a 3D scene fell back, that is reported, never passed. If the browser or the server
// cannot start, the checker says so loudly (exit 2 in a hook = blocking) instead of passing a deck it never saw.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const dp = require('../tools/lib/deckpage');
const RULES = JSON.parse(fs.readFileSync(path.join(__dirname, 'hard-rules.json'), 'utf8'));
const MIN = RULES.minFontPx;
const LOOKS = RULES.looks || {};
const ROOT = process.env.CLAUDE_PROJECT_DIR || dp.findAuraRoot(process.cwd()) || path.resolve(__dirname, '..', '..', '..');
const SLIDES = path.join(ROOT, '4 - Your slides');
const RUNFILE = path.join(ROOT, '.aura', 'temp', 'current-run.json');

const mode = ['--hook', '--stop'].includes(process.argv[2]) ? process.argv[2] : null;
let input = {};
if (mode === '--hook' || mode === '--stop') { try { input = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, '').trim() || '{}'); } catch (e) { input = {}; } }

const skipDir = n => /^(Older versions|_deleted|node_modules|assets)$/i.test(n);
function walk(dir, out = [], depth = 0) {
  if (!fs.existsSync(dir) || depth > 4) return out;
  for (const n of fs.readdirSync(dir)) { const p = path.join(dir, n); let s; try { s = fs.statSync(p); } catch (e) { continue; }
    if (s.isDirectory()) { if (!skipDir(n)) walk(p, out, depth + 1); } else if (/\.html?$/i.test(n)) out.push(p); }
  return out;
}
// the files THIS run wrote (B-01)
function runFiles() {
  let run; try { run = JSON.parse(fs.readFileSync(RUNFILE, 'utf8')); } catch (e) { return []; }
  const since = (Number(run.startedAt) || 0) * 1000 - 3000;
  const fresh = f => { try { return fs.statSync(f).mtimeMs >= since; } catch (e) { return false; } };
  const out = [];
  if (run.workDir) out.push(...walk(path.resolve(ROOT, run.workDir)).filter(f => !/[\\/]final\.html?$/i.test(f)));
  out.push(...walk(path.join(ROOT, '.aura', 'temp', 'build')));
  out.push(...(fs.existsSync(SLIDES) ? fs.readdirSync(SLIDES).filter(n => /\.html?$/i.test(n)).map(n => path.join(SLIDES, n)) : []));
  return [...new Set(out)].filter(fresh).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}
let files;
if (mode === '--hook') {
  const t = input.tool_input || {}; const p = t.file_path || t.path || t.notebook_path;
  files = p ? [path.resolve(ROOT, p)] : [];
} else if (mode === '--stop') {
  if (input.stop_hook_active) process.exit(0);          // already sent back once this turn: do not loop forever
  files = runFiles();
} else files = process.argv.slice(2).map(p => path.resolve(p));
const engineDir = path.resolve(__dirname, '..') + path.sep;
files = files.filter(f => /\.html?$/i.test(f) && fs.existsSync(f) && !f.startsWith(engineDir) && !/[\\/]Older versions[\\/]/i.test(f));
if (!files.length) process.exit(0);

// --stop: the full deck check, on the newest build folder deck and the newest packed deck of this run (at most two page loads)
function stopMain() {
  const isBuild = f => /[\\/]temp[\\/]build[\\/]/i.test(f);
  const pick = [files.find(isBuild), files.find(f => !isBuild(f))].filter(Boolean);
  const lines = [];
  // L-15: the deck being built in this run has an interview.json naming the people the interview actually established.
  // A build folder does not carry the deck id, so the server puts that file's path in LUMI_INTERVIEW when it starts
  // Claude. Without it the checker reads the old library brief, exactly as it always did.
  const ivFile = process.env.LUMI_INTERVIEW || '';
  const ivArgs = ivFile && fs.existsSync(ivFile) ? ['--interview', ivFile] : [];
  for (const f of pick) {
    const r = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'deck_check.js'), f, '--no-shots', ...ivArgs],
      { cwd: ROOT, encoding: 'utf8', timeout: 150000, env: Object.assign({}, process.env, { CLAUDE_PROJECT_DIR: ROOT }) });
    const out = ((r.stdout || '') + (r.stderr || '')).split(/\r?\n/);
    if (r.status === 0) continue;
    const name = path.relative(ROOT, f);
    const errs = out.filter(l => /^\s*ERROR /.test(l));
    if (r.status === 1) {
      lines.push(`LUMI DECK CHECK FAILED - ${name}. These errors cannot be left in a finished slide.`);
      errs.slice(0, 25).forEach(l => lines.push(l));
      if (errs.length > 25) lines.push(`  ...and ${errs.length - 25} more`);
      if (errs.some(l => /HARD RULE:/.test(l))) lines.push('LUMI HARD RULE 1 VIOLATED - text below the minimum size cannot be overridden, not even by the user.');
    } else {
      lines.push(`LUMI CHECKER COULD NOT RUN on ${name} (exit ${r.status === null ? 'timeout' : r.status}): ${out.filter(Boolean).slice(-3).join(' | ').slice(0, 400)}`);
      lines.push('The deck was NOT verified. Say so plainly to the person; do not claim it passed.');
    }
  }
  if (!lines.length) process.exit(0);
  lines.push('Fix the listed problems, then run: node .aura/engine/tools/deck_check.js <build folder> and repeat until it prints RESULT: clean.');
  console.error(lines.join('\n'));
  process.exit(2);
}
if (mode === '--stop') stopMain();

(async () => {
  const browser = await dp.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const report = [], passed = [], fallbacks = [], unverified = [];
  for (const f of files) {
    const server = await dp.serve(dp.serveRootFor(f));
    try {
    await dp.openDeck(page, server.url(f));
    const probe = await dp.probeRender(page);
    if (probe.problem) { unverified.push(`${path.relative(ROOT, f) || f}: ${probe.problem}`); continue; }
    if (probe.fallback) fallbacks.push({ file: path.relative(ROOT, f) || f, n: probe.fallback, of: probe.holders });
    const look = await page.evaluate(() => {
      const h = document.documentElement;
      const token = getComputedStyle(h).getPropertyValue('--aura-look').trim().toLowerCase();
      const declared = (h.getAttribute('data-look') || '').trim().toLowerCase();
      return { token, declared };
    });
    const prof = look.token && LOOKS[look.token] && (!look.declared || look.declared === look.token) ? LOOKS[look.token] : null;
    const min = prof ? prof.minFontPx : MIN, tol = prof ? (prof.svgTolerancePx || 0) : 0;
    // a look may allow its smallest size only in named places (Bold Blue: 20 px for the footer, page number, captions and
    // chart step labels) and hold every other text to a body minimum (28 px)
    const body = prof && prof.bodyMinIsError ? (prof.bodyMinPx || 0) : 0, exempt = prof && prof.bodyMinExempt || '';
    const bad = await page.evaluate(({ MIN, TOL, BODY, EXEMPT }) => {
      const skip = el => el.closest('[data-aura-notes], .notes, .pnotes, [data-aura-ui], script, style, template, noscript, head');
      const seen = new Set(), out = [];
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n; (n = w.nextNode());) {
        const t = n.textContent.trim(); if (!t) continue;
        const el = n.parentElement; if (!el || skip(el) || seen.has(el)) continue; seen.add(el);
        const fs = parseFloat(getComputedStyle(el).fontSize); let eff = fs;
        if (el.closest('svg')) {
          let k = null; try { const m = el.getScreenCTM(); if (m) k = Math.hypot(m.a, m.b); } catch (e) {}
          if (!k) { const svg = el.closest('svg'), vb = svg.viewBox && svg.viewBox.baseVal;
            k = vb && vb.width ? (svg.width.baseVal.value || vb.width) / vb.width : 1; }
          eff = fs * k;
        } else if (el.offsetWidth > 0) {
          const k = el.getBoundingClientRect().width / el.offsetWidth; if (Math.abs(k - 1) > 0.02) eff = fs * k;   // CSS transforms (scale) shrink text too
        }
        if (eff < MIN - Math.max(0.01, TOL)) out.push({ text: t.slice(0, 50), px: Math.round(eff * 10) / 10 });
        else if (BODY && eff < BODY - 0.5 && !(EXEMPT && el.closest(EXEMPT))) out.push({ text: t.slice(0, 50), px: Math.round(eff * 10) / 10, body: BODY });
      }
      return out;
    }, { MIN: min, TOL: tol, BODY: body, EXEMPT: exempt });
    if (bad.length) report.push({ file: path.relative(ROOT, f) || f, bad, min, look: prof ? prof.name : null });
    else passed.push({ min, look: prof ? prof.name : null, scenes: probe.holders, drawn: probe.drawn });
    } finally { await server.close(); }
  }
  await browser.close();
  if (unverified.length) {
    console.error('LUMI CHECKER COULD NOT VERIFY THE DECK (it was not measured, so it did NOT pass):\n  ' + unverified.join('\n  '));
    process.exit(mode ? 2 : 3);
  }
  if (fallbacks.length) {
    const L = ['LUMI CHECK FAILED - a 3D scene did not start, so the slide shows no 3D (and the text-size pass cannot be fully trusted):'];
    fallbacks.forEach(x => L.push(`  ${x.file}: ${x.n} of ${x.of} 3D scene(s) fell back. Run node .aura/engine/tools/deck_check.js <build folder> for the browser message, fix the scene code, or make it a 2D illustration.`));
    console.error(L.join('\n')); process.exit(mode ? 2 : 1);
  }
  if (!report.length) {
    if (!mode) {
      const looks = [...new Set(passed.map(p => p.look ? `${p.look} >= ${p.min}px` : `>= ${p.min}px`))].join(', ');
      console.log(`Aura hard rules: all ${files.length} file(s) pass (smallest text ${looks}; rendered over http, ${passed.reduce((a, p) => a + p.drawn, 0)} of ${passed.reduce((a, p) => a + p.scenes, 0)} 3D scene(s) drawn).`);
    }
    process.exit(0);
  }
  const lowest = Math.min(...report.map(r => r.min));
  const which = [...new Set(report.map(r => r.look ? `the ${r.look} minimum, measured from its reference deck` : 'the Lumi minimum'))].join(' / ');
  const lines = [`LUMI HARD RULE 1 VIOLATED - text smaller than ${lowest}px (${which}). This rule cannot be overridden, not even by the user.`];
  for (const r of report) {
    lines.push(`  ${r.file}${r.look ? ` (${r.look} look, minimum ${r.min}px)` : ''}:`);
    r.bad.slice(0, 12).forEach(b => lines.push(`    ${b.px}px  "${b.text}"` + (b.body ? `  (only the footer, page number, captions and chart step labels may be under ${b.body}px)` : '')));
    if (r.bad.length > 12) lines.push(`    ...and ${r.bad.length - 12} more`);
  }
  lines.push(`Fix it now: raise every listed text to at least ${lowest}px. ${RULES.rules[0].whenTextDoesNotFit}`);
  lines.push('If the user asked for smaller text, explain kindly that Lumi keeps all text readable from the back of the room.');
  console.error(lines.join('\n'));
  process.exit(mode ? 2 : 1);
})().catch(e => { console.error('Lumi hard-rule checker failed: ' + e.message); process.exit(mode ? 2 : 3); });
