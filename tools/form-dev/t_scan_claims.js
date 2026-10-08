// Developer-only probe (Part D): a number read by eye off a SCANNED page has an honest home in provenance.json (kind "scan"),
// and only there. The scanned report is real (the owner's 12-page CamScanner thesis); its machine reading misread Table 1:
// 3.0059 came out as nothing close, 3.0329 as "30329", 12.70 as "12.10".
//
// Run:  node tools/form-dev/t_scan_claims.js <scratch folder>
// Prints "PASS <name>" / "FAIL <name> <info>" lines and exits 1 on any failure.
'use strict';
const fs = require('fs'), path = require('path');
const ENGINE = path.resolve(__dirname, '..', '..', 'engine');
const claims = require(path.join(ENGINE, 'tools', 'lib', 'claims.js'));

const root = process.argv[2] || path.join(process.env.TEMP || '.', 'aura-scan-claims');
let bad = 0;
const check = (name, ok, info) => { if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '   <- ' + JSON.stringify(info || null))); };

fs.rmSync(root, { recursive: true, force: true });
const text = path.join(root, '.aura', 'decks', 'd1', 'text');
fs.mkdirSync(path.join(text, 'Report'), { recursive: true });
// what extract_text.py writes for a scanned PDF (the page 5 lines are its real output) and for a PDF with a text layer
fs.writeFileSync(path.join(text, 'Report', 'thesis.pdf.txt'), '# Report/thesis.pdf\n---\n' +
  '\n--- page 1 (scanned page, text machine-read: check every number against the page; the page itself: page-001.jpg) ---\nME 400: Project and Thesis\n' +
  '\n--- page 5 (scanned page, text machine-read: check every number against the page; the page itself: page-005.jpg) ---\n' +
  '12.10/\n30.0 i 25.0\n40.655\n2680 9\n30329\n12.70} 11.90\n---\n', 'utf8');
fs.writeFileSync(path.join(text, 'Report', 'clean.pdf.txt'), '# Report/clean.pdf\n---\n--- page 1 ---\nThe duct is 200 mm wide.\n---\n', 'utf8');
fs.writeFileSync(path.join(text, 'manifest.json'), JSON.stringify({ version: 1, files: {
  'Report/thesis.pdf': { kind: 'PDF', count: 12, scanned: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], pagePictures: { 5: 'x/page-005.jpg' } },
  'Report/clean.pdf': { kind: 'PDF', count: 1 } } }), 'utf8');

const corpus = claims.loadCorpus(root, text);
const run = (slide, list) => claims.judge({ slides: [Object.assign({ n: 4, notes: '', visibleIllustrative: false, figures: [] }, slide)],
  corpus, prov: { claims: list, file: null, error: null }, brief: null });
const NOTES = 'Read off scanned page 5 of the thesis, Table 1.';

check('the manifest\'s scanned pages and their machine reading are loaded', corpus.scans['report/thesis.pdf'] && corpus.scans['report/thesis.pdf'].pages.has(5) && /30329/.test(corpus.scans['report/thesis.pdf'].text[5]), corpus.scans);
check('a number the machine reading got right still traces with nothing to declare', run({ text: 'Area 40.655 mm²' }, []).errors.length === 0);

let v = run({ text: 'Hydraulic diameter 3.0059 mm' }, []);
check('B-05 holds: a scanned-page number with no provenance entry still FAILS', v.errors.length === 1 && /not in your files/.test(v.errors[0].msg), v.errors);

v = run({ text: 'Hydraulic diameter 3.0329 mm', notes: NOTES }, [{ slide: 4, text: '3.0329 mm', kind: 'scan', file: 'Report/thesis.pdf', page: 5 }]);
check('kind "scan" on a scanned page passes', v.errors.length === 0, v.errors);
check('... with a check-by-eye warning that shows the machine reading ("30329")', v.warnings.some(w => /by eye/.test(w.msg) && /"30329"/.test(w.msg)), v.warnings);

v = run({ text: 'Tube 12.70 mm', notes: NOTES }, [{ slide: 4, text: '12.70', kind: 'scan', file: 'thesis.pdf', page: 5 }]);
check('a file named without its folder is found', v.errors.length === 0, v.errors);

v = run({ text: 'Diameter 3.0059 mm', notes: NOTES }, [{ slide: 4, text: '3.0059', kind: 'scan', file: 'Report/thesis.pdf', page: 5 }]);
check('nothing close in the machine reading: still passes, the warning says so', v.errors.length === 0 && v.warnings.some(w => /nothing close/.test(w.msg)), [v.errors, v.warnings]);

v = run({ text: 'Diameter 3.0329 mm', notes: 'Table 1.' }, [{ slide: 4, text: '3.0329', kind: 'scan', file: 'Report/thesis.pdf', page: 5 }]);
check('the speaker notes must say it was read off a scanned page', v.errors.some(e => /speaker notes/.test(e.msg)), v.errors);

v = run({ text: 'Width 999 mm', notes: NOTES }, [{ slide: 4, text: '999', kind: 'scan', file: 'Report/clean.pdf', page: 1 }]);
check('"scan" on a file with a text layer FAILS (a text page is checked against its text)', v.errors.some(e => /not a scanned file/.test(e.msg)), v.errors);

v = run({ text: 'Width 999 mm', notes: NOTES }, [{ slide: 4, text: '999', kind: 'scan', file: 'Report/thesis.pdf', page: 40 }]);
check('"scan" on a page that is not scanned FAILS', v.errors.some(e => /not a scanned page/.test(e.msg)), v.errors);

v = run({ text: 'Width 999 mm', notes: NOTES }, [{ slide: 4, text: '999', kind: 'scan' }]);
check('"scan" with no file and page FAILS', v.errors.some(e => /names no file and page/.test(e.msg)), v.errors);

v = claims.judge({ slides: [{ n: 4, text: 'Diameter 3.0329 mm', notes: NOTES, visibleIllustrative: false, figures: [] }],
  corpus: claims.loadCorpus(root, path.join(root, 'nowhere')), prov: { claims: [{ slide: 4, text: '3.0329', kind: 'scan', file: 'Report/thesis.pdf', page: 5 }], file: null, error: null }, brief: null });
check('another deck\'s scans are not this deck\'s: no manifest, no "scan"', v.errors.some(e => /not a scanned file/.test(e.msg)), v.errors);

console.log(bad ? `${bad} FAILED` : 'all passed');
process.exit(bad ? 1 : 0);
