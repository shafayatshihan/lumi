// Post-mortem problem 1 (residual): what the finalize 409 says on screen for an ORPHAN studio-render holder.
// Run alone:  node tools/form-dev/pm_notice_test.mjs   (test_postmortem_a.py reads the PASS/FAIL lines)
import { load } from './fe_load.mjs';

let pass = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (ok) pass++; console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : '   -> ' + String(detail).slice(0, 240)}`); };

const F = await load('finalizing.js');
const notice = F.blenderNotice;

// exactly the body the gate returns for deck b45622aef312: slide 14 is an orphan, nothing else is pending
const orphanOnly = { error: 'blender-pending', slides: [14], pending: [], orphans: [14] };
const o = notice(orphanOnly);
check('P1 an orphan-only 409 never says "render it" or "approve the design"',
  !/render it|approve each design|let lumi render/i.test(o.line) && !/isn.t finished/.test(o.head), JSON.stringify(o));
check('P1 it says to change that slide\'s picture', /change the picture/.test(o.line) && /needs a different picture/.test(o.head), JSON.stringify(o));
check('P1 it explains why there is nothing to render (live 3d)', /live 3d/.test(o.line) && /never make/.test(o.line), o.line);
check('P1 the orphan slide is separated from the pending ones', o.orphNums.join() === '14' && o.pendNums.length === 0);

// an ordinary unfinished studio render keeps exactly the advice it had
const pendOnly = { error: 'blender-pending', slides: [5], pending: [5], orphans: [] };
const p = notice(pendOnly);
check('P1 an ordinary pending render still says "approve the design and let lumi render it"',
  /approve each design and let lumi render it/.test(p.line) && p.head === 'one studio render isn’t finished', JSON.stringify(p));

// both kinds at once: both sentences, neither lost
const both = { error: 'blender-pending', slides: [5, 14], pending: [5], orphans: [14] };
const b = notice(both);
check('P1 a mixed 409 carries both sentences',
  /approve each design/.test(b.line) && /change the picture/.test(b.line) && b.head === '2 slides aren’t ready yet', JSON.stringify(b));

// stale is untouched
const stale = notice({ error: 'blender-stale', slides: [2], orphans: [] });
check('P1 a stale render is untouched', /older than its design/.test(stale.head) && /render again/.test(stale.line), JSON.stringify(stale));

// a server that sends no `orphans` at all (an older body) behaves exactly as before
const old = notice({ error: 'blender-pending', slides: [5] });
check('P1 a 409 body with no orphans field behaves as it always did', old.line === p.line.replace('one studio', 'one studio'), old.line);

console.log(`${pass}/${total} finalize-notice checks passed`);
process.exit(pass === total ? 0 : 1);
