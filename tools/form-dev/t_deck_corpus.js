// Developer-only probe: ONE deck's extracted text is the only corpus its numbers are traced against.
//
// This is the correctness hole per-deck source folders exist to close. Before them every deck shared
// `.aura/temp/text`, so a number that appears only in deck A's report traced cleanly on deck B's slide:
// the check passed and nobody ever learned the number is in no source of deck B.
//
// Run:  node tools/form-dev/t_deck_corpus.js <scratch folder>
// Prints "PASS <name>" / "FAIL <name> <info>" lines and exits 1 on any failure.
'use strict';
const fs = require('fs'), path = require('path');
const ENGINE = path.resolve(__dirname, '..', '..', 'engine');
const claims = require(path.join(ENGINE, 'tools', 'lib', 'claims.js'));

const root = process.argv[2] || path.join(process.env.TEMP || '.', 'aura-deck-corpus');
let bad = 0;
const check = (name, ok, info) => { if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '   <- ' + JSON.stringify(info || null))); };

fs.rmSync(root, { recursive: true, force: true });
const textDir = id => path.join(root, '.aura', 'decks', id, 'text', 'Report');
for (const id of ['deckA', 'deckB']) fs.mkdirSync(textDir(id), { recursive: true });
fs.mkdirSync(path.join(root, '.aura', 'brief'), { recursive: true });

// deck A's report carries the number. deck B's report is a different study and never mentions it.
fs.writeFileSync(path.join(textDir('deckA'), 'a.docx.txt'), '# a.docx\nThe rig peaked at 355 kPa in the third run.\n', 'utf8');
fs.writeFileSync(path.join(textDir('deckB'), 'b.docx.txt'), '# b.docx\nA survey of lattice cooling, no pressures measured.\n', 'utf8');

const corpusOf = id => claims.loadCorpus(root, path.join(root, '.aura', 'decks', id, 'text'));
const slides = [{ n: 2, text: 'Pressure peaks at 355 kPa.', notes: 'say it plainly', visibleIllustrative: false, figures: [] }];
const judge = id => claims.judge({ slides, corpus: corpusOf(id), prov: { claims: [], file: null, error: null }, brief: null });

const a = judge('deckA'), b = judge('deckB');
check("the number in THIS deck's report traces (deck A, no provenance needed)",
  a.errors.length === 0 && a.stat.traced === 1, a.errors.map(e => e.msg));
check("the SAME number does NOT trace on another deck's slide (deck B)",
  b.errors.length === 1 && /355 kPa/.test(b.errors[0].msg) && /no provenance entry/.test(b.errors[0].msg) && b.stat.traced === 0,
  b.errors.map(e => e.msg));
check('the two corpora really are different files on disk', corpusOf('deckA').files === 1 && corpusOf('deckB').files === 1 &&
  !corpusOf('deckB').text.includes('355'), [corpusOf('deckA').files, corpusOf('deckB').files]);

// the shared corpus of a deck made before per-deck folders: no textDir, so .aura/temp/text is read, exactly as before.
const shared = path.join(root, '.aura', 'temp', 'text', 'Report');
fs.mkdirSync(shared, { recursive: true });
fs.writeFileSync(path.join(shared, 'legacy.docx.txt'), '# legacy.docx\nLegacy rig, 777 kPa peak.\n', 'utf8');
const legacy = claims.loadCorpus(root, null);
check('a deck with no per-deck text folder still reads the shared .aura/temp/text',
  claims.inCorpus(legacy, '777') && !claims.inCorpus(legacy, '355'), legacy.files);
check('the shared corpus is NOT mixed into a per-deck one', !claims.inCorpus(corpusOf('deckB'), '777'), corpusOf('deckB').files);

fs.rmSync(root, { recursive: true, force: true });
console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
