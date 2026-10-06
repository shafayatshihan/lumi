// Runs the browser marker parser (engine/form/js/markers.js) against the shared fixtures and prints one JSON object:
//   { spec, results: [{ name, ok, detail }] }
// tools/form-dev/test_instructions.py calls this and also compares `spec` with engine/rules/markers.json.
//   node tools/form-dev/markers_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from './fe_load.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const M = await load('markers.js');         // markers.js and what it imports are loaded from a temp copy as ES modules

const cases = JSON.parse(fs.readFileSync(path.join(here, 'marker_cases.json'), 'utf8')).cases;
const results = [];
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const rec = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail: ok ? '' : String(detail).slice(0, 300) });

for (const c of cases) {
  const r = M.scanMarkers(c.text);
  const got = r.markers.map(m => { const e = { name: m.name, attrs: m.attrs, line: m.line }; if (m.choice) e.choice = m.choice; if (m.text) e.text = m.text; return e; });
  const gotP = r.problems.map(p => ({ line: p.line, reason: p.reason, marker: p.marker }));
  rec('markers: ' + c.name, eq(got, c.markers), JSON.stringify(got) + ' != ' + JSON.stringify(c.markers));
  rec('problems: ' + c.name, eq(gotP, c.problems), JSON.stringify(gotP) + ' != ' + JSON.stringify(c.problems));
}

// the cards' view of the same lines (parseMarkers): variants, defaults, no question cap, hints in any order
const many = Array.from({ length: 12 }, (_, i) => `[[aura:choice id="q${i + 1}" question="Question ${i + 1}?" options="A|B"]]`).join('\n');
rec('no question is dropped (12 arrive, 12 shown)', M.parseMarkers(many).choices.length === 12);
const pv = M.parseMarkers([
  '[[aura:choice id=q1 slide=3 question="Which?" options="A|B|C" default=B]]',
  '[[aura:choice id="q2" when="q1=2" question="Words?" options="x|y" multi="yes"]]',
  '[[aura:choice id="q2" when="q1=3" question="Words?" options="z|w"]]',
  '[[aura:hint text="Shorter" slide=2]]',
].join('\n'));
rec('parseMarkers: bare-value choice becomes a card question', pv.choices[0] && pv.choices[0].id === 'q1' && pv.choices[0].slide === '3' && eq(pv.choices[0].defaults, ['B']));
rec('parseMarkers: variants keep their own key', eq(pv.choices.map(c => c.key), ['q1', 'q2@q1=2', 'q2@q1=3']));
rec('parseMarkers: a missing default pre-selects the first option', eq(pv.choices[2].defaults, ['z']) && eq(pv.choices[1].defaults, ['x']));
rec('parseMarkers: the when condition is parsed', eq(pv.choices[1].conds, [{ id: 'q1', vals: ['2'] }]));
rec('parseMarkers: a hint in any attribute order is kept', eq(pv.hints, [{ slide: 2, text: 'Shorter' }]));
rec('parseMarkers: malformed lines are reported, not dropped silently', M.parseMarkers('see [[aura:ask]] now\n[[aura:hint slide=1]]').problems.length === 2);
// [[aura:text]]: a sibling of choice that shares the one card (section 1 of the interview plan)
const tv = M.parseMarkers([
  '[[aura:choice id="q1" question="Who is in the room?" options="Students|Examiners" default="Students"]]',
  '[[aura:text id="q2" question="What must they do afterwards?" placeholder="in one sentence" lines=3]]',
  '[[aura:text id="q3" when="q1=2" question="What will the examiners press you on?"]]',
].join('\n'));
rec('text: pick and text questions land in ONE choices array', tv.choices.length === 3 && eq(tv.choices.map(c => c.kind), ['pick', 'text', 'text']));
rec('text: a text question carries no options and no default', eq(tv.choices[1].options, []) && eq(tv.choices[1].defaults, []) && tv.choices[1].multi === false);
rec('text: placeholder and lines survive', tv.choices[1].placeholder === 'in one sentence' && tv.choices[1].lines === 3);
rec('text: lines defaults to 3', tv.choices[2].lines === 3);
rec('text: a text variant keeps its own key and condition', tv.choices[2].key === 'q3@q1=2' && eq(tv.choices[2].conds, [{ id: 'q1', vals: ['2'] }]));
rec('text: a condition naming a TEXT question can never hold (the documented limit)',
    M.whenMatches(M.parseWhen('q2=anything'), { q2: { selected: [], options: [] } }) === false);
rec('safeAnswer: newlines collapse to one space (parseAnswer is line-based)', M.safeAnswer('one\nq9: two\r\nthree') === 'one q9: two three');
rec('safeAnswer: a marker in the answer cannot be read back as ours', M.safeAnswer('say [[aura:ask]] now') === 'say [ [aura:ask]] now');
rec('safeAnswer: backticks become straight quotes', M.safeAnswer('use `code`') === "use 'code'");
rec('safeAnswer: capped at answerChars', M.safeAnswer('x'.repeat(5000)).length === M.MARKER_SPEC.limits.answerChars);
rec('parseAnswer: note lines are the person\'s own words', (() => { const a = M.parseAnswer('q1: B\nq2: A | C\nnote: and quickly'); return a.answers.length === 2 && a.text === 'and quickly'; })());
rec('hasMarker: only whole lines count', M.hasMarker('x\n[[aura:ask]]', 'ask') && !M.hasMarker('x [[aura:ask]]', 'ask'));

process.stdout.write(JSON.stringify({ spec: M.MARKER_SPEC, results }));
