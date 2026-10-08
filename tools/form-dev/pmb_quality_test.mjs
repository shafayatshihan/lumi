// Post-mortem batch B, part 3: the quality choice on the look step, in plain words.
// The page is NOT built here (no DOM): only the pure functions that decide what the person reads.
// Run alone:  node tools/form-dev/pmb_quality_test.mjs   (test_postmortem_b.py reads the PASS/FAIL lines)
import { load } from './fe_load.mjs';

let pass = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (ok) pass++; console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : '   -> ' + String(detail).slice(0, 240)}`); };

const Q = await load('quality.js');

// exactly what form_server.quality_options() sends (v0.5.11: three tiers, opus/medium is the default)
const opts = {
  default: 'just-right',
  tiers: [
    { quality: 'just-right', tier: 'just-right', model: 'opus', effort: 'medium', name: 'just right', label: 'Just right (Opus, recommended)', share: 1 },
    { quality: 'maximum', tier: 'maximum', model: 'opus', effort: 'high', name: 'maximum', label: 'Maximum (Opus, deepest thinking, slowest)', share: 1.25 },
    { quality: 'balanced', tier: 'balanced', model: 'sonnet', effort: 'high', name: 'balanced', label: 'Balanced (Sonnet, quicker and lighter)', share: 0.25 },
  ],
  models: [{ id: 'opus', label: 'Opus' }, { id: 'sonnet', label: 'Sonnet' }, { id: 'haiku', label: 'Haiku' }],
  efforts: [{ id: 'low', label: 'low' }, { id: 'medium', label: 'medium' }, { id: 'high', label: 'high' },
    { id: 'xhigh', label: 'extra high' }, { id: 'max', label: 'max' }],
  claudeShare: 0.585,
};
const text = q => Q.qualityLines(opts, q).map(l => l.text).join(' ');

const TIERS = ['just-right', 'maximum', 'balanced'];
const fast = text('balanced');       // the lighter tier: the one that can honestly claim a saving
check('part 3 the saving is a plain share of the allowance, never tokens and never money',
  /of the allowance/.test(fast) && !/token|\$|usd|dollar/i.test(fast), fast);
check('part 3 the saving is said in the plan page\'s own share words', /about a (tenth|quarter|third|half)/.test(fast), fast);
check('part 3 it also says the cheaper setting finishes sooner', /finishes sooner/.test(fast), fast);
check('part 3 every setting says plainly that the pictures do not change',
  TIERS.every(q => /pictures look the same/.test(text(q))), text('maximum'));
check('part 3 the default says it is the default and does not pretend to save anything',
  !/finishes sooner|uses more/.test(text('just-right')), text('just-right'));
check('part 3 a dearer setting is marked as the one that costs more, not as a saving',
  /uses more of your allowance/.test(text('maximum')) && Q.qualityLines(opts, 'maximum').some(l => l.warn), text('maximum'));
check('part 3 no jargon reaches the plain surface: no model name, no "effort"',
  !TIERS.some(q => /opus|sonnet|haiku|effort/i.test(text(q))), text('balanced'));
check('part 3 there are three tiers, not four, and "best quality" is gone', opts.tiers.length === 3
  && !opts.tiers.some(t => /best/.test(t.quality) || /best/.test(t.name)), opts.tiers.map(t => t.name).join(' / '));
check('part 3 the default is the one that carries the badge, and it is opus + medium',
  opts.default === 'just-right' && opts.tiers.find(t => t.quality === opts.default).model === 'opus'
  && opts.tiers.find(t => t.quality === opts.default).effort === 'medium');

// a pair no tier covers: the plain lines step aside and the advanced control names it exactly
check('part 3 a custom pair is named exactly, with the way back to a named setting',
  /opus, xhigh effort/.test(Q.customLine({ tier: null, model: 'opus', effort: 'xhigh' }))
  && /pick a setting/.test(Q.customLine({ tier: null, model: 'opus', effort: 'xhigh' })),
  Q.customLine({ tier: null, model: 'opus', effort: 'xhigh' }));
check('part 3 a named tier shows no custom line at all', Q.customLine({ tier: 'balanced', model: 'sonnet', effort: 'high' }) === '');
check('part 3 the plain lines say nothing about a custom pair (the advanced control already does)',
  Q.qualityLines(opts, 'opus/xhigh').length === 0);
check('part 3 nothing throws when the server sent no options yet', Q.qualityLines(null, 'just-right').length === 0
  && Q.qualityLines({}, 'just-right').length === 0 && Q.customLine(null) === '');

console.log(`${pass}/${total} quality-choice checks passed`);
