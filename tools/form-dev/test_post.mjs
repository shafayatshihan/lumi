// Unit tests for the shared post-processing stack: engine/deck/lib/post.js (the one composer) and
// engine/deck/lib/post-policy.js (who is allowed to have it).
//   node tools/form-dev/test_post.mjs
// tools/form-dev/test_frontend.py runs this with the other unit layers.
//
// What it pins down:
//   - post is OFF by default: a look nobody registered gets nothing, whatever the slide says;
//   - the hero rule lives in the base, not in a deck: slide position picks the tier;
//   - the honesty gate closes over a slide that carries measured values, even when the scene asks explicitly;
//   - the determinism contract: no clock, no randomness, no frame accumulation anywhere in the chain, and the
//     effects that cannot satisfy it are refused BY NAME rather than quietly dropped;
//   - the degrade ladder ends in `bypass`, because dropping effects one at a time does not buy back a frame.
// The pixel-level proofs (seek(t) twice is byte-identical, text contrast, measured frame cost) need a GPU and live in
// the A/B probe described in FIXLOG; this file is the logic that decides what that probe renders.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.join(HERE, '..', '..', 'engine', 'deck', 'lib');

let pass = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (ok) pass++; console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : '   -> ' + String(detail).slice(0, 260)}`); };

const postSrc = fs.readFileSync(path.join(LIB, 'post.js'), 'utf8');
const policySrc = fs.readFileSync(path.join(LIB, 'post-policy.js'), 'utf8');

/* ---------------------------------------------------------------- a DOM small enough to reason about.
   post-policy.js touches exactly this much of one: closest, querySelectorAll, dataset, getElementById, ownerDocument. */
function makeDom(slides, measuredTag) {
  const doc = {
    _slides: [], _byId: {},
    querySelectorAll(sel) {
      if (sel === '.slide') return doc._slides;
      if (sel === '.slide[data-measured]') return doc._slides.filter(s => 'measured' in s.dataset);
      return [];
    },
    getElementById(id) { return doc._byId[id] || null; },
    documentElement: { dataset: { look: 'bold-blue' } },
  };
  doc._slides = slides.map(s => {
    const slide = { dataset: Object.assign({}, s), ownerDocument: doc, closest(sel) { return sel === '.slide' ? slide : null; } };
    slide.holder = { dataset: {}, ownerDocument: doc, closest(sel) { return sel === '.slide' ? slide : null; } };
    return slide;
  });
  if (measuredTag) doc._byId['lumi-measured'] = { textContent: JSON.stringify(measuredTag) };
  return doc;
}

function loadPolicy(doc) {
  const win = { document: doc, console: { warn() {} } };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(policySrc, win);
  win.LumiPostPolicy.forget();
  return win.LumiPostPolicy;
}

/* ================================================================ post.js: the contract, not the pixels */
{
  const win = { window: null, console: { warn() {} } };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(postSrc, win);
  const P = win.LumiPost;

  check('post.js exposes one create()', typeof P.create === 'function' && P.deterministic === true);

  // DETERMINISM, statically: nothing in the chain may read the clock, roll a die or count frames.
  const body = postSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('post.js never reads the clock or rolls a die (seek(t) must be reproducible)',
        !/Math\.random|performance\.now|Date\.now|new Date|requestAnimationFrame/.test(body),
        (body.match(/Math\.random|performance\.now|Date\.now|new Date|requestAnimationFrame/g) || []).join(','));
  check('post.js imports no three.js add-on (a packed deck is one offline file)',
        !/\bimport\b|\brequire\(|EffectComposer|UnrealBloomPass|BokehPass|FXAAPass|AfterimagePass\s*\(/.test(body));
  check('no effect carries a time uniform into a shader', !/uTime|uFrame|iTime/.test(body));

  // ...and the effects that cannot satisfy it are refused BY NAME. A deck that thought it had motion blur and
  // quietly did not is worse than one that failed at build time.
  check('AfterimagePass and friends are refused by name, with a reason',
        Object.keys(P.REJECT).includes('afterimage') && /seek/.test(P.REJECT.afterimage));
  const dummyTHREE = {};                                   // the refusal happens before any THREE call
  let threw = null;
  try { P.create(dummyTHREE, {}, {}, {}, { afterimage: true }); } catch (e) { threw = e.message; }
  check('asking for an accumulating effect throws', !!threw && /afterimage/.test(threw), threw);
  let ok2 = null;
  try { P.create(dummyTHREE, {}, {}, {}, { afterimage: false }); } catch (e) { ok2 = e.message; }
  check('...but only when it is actually switched on', ok2 === null || !/afterimage/.test(ok2), ok2);

  // the degrade ladder: bypass last, because the composer costs more than everything in it
  check('the degrade ladder ends in bypass', P.LADDER[P.LADDER.length - 1] === 'bypass');
  check('the ladder drops depth of field before bloom', P.LADDER.indexOf('dof') < P.LADDER.indexOf('bloom'));
  check('bloom defaults to a threshold well above paper white, so text backgrounds do not move',
        P.DEFAULTS.threshold >= 3);
  check('depth of field and FXAA are OFF in the defaults', P.DEFAULTS.dof === false && P.DEFAULTS.fxaa === false);
}

/* ================================================================ post-policy.js: who is allowed to have it */
{
  const doc = makeDom([{ kind: 'title' }, {}, {}, {}, { kind: 'closing' }]);
  const PP = loadPolicy(doc);

  // 1. OFF BY DEFAULT: a look nobody registered gets nothing, whatever the slide asks for.
  doc.documentElement.dataset.look = 'no-such-look';
  doc._slides[0].dataset.post = 'cinematic';
  let r = PP.resolve({ el: doc._slides[0].holder });
  check('an unregistered look gets no post, even when the slide asks for it', r.enabled === false, r.reason);
  check('...and says why in a plain sentence', /registers no post policy/.test(r.reason), r.reason);
  delete doc._slides[0].dataset.post;
  doc.documentElement.dataset.look = 'bold-blue';

  // 2. the hero rule is a rule of the base: position picks the tier
  const pol = PP.policyFor('bold-blue');
  check('slides 1 and 2 are the hero pair', PP.tierOf(doc._slides[0], pol) === 'hero' && PP.tierOf(doc._slides[1], pol) === 'hero');
  check('the body between them is body', PP.tierOf(doc._slides[2], pol) === 'body' && PP.tierOf(doc._slides[3], pol) === 'body');
  check('the closing echoes the hero tier', PP.tierOf(doc._slides[4], pol) === 'closing' && pol.closing === 'hero');
  check('the last slide is the closing even without data-kind', PP.tierOf(makeDom([{}, {}, {}])._slides[2], pol) === 'closing');

  // 3. Bold Blue stays clinical - registering the policy changed no pixel of any existing deck
  r = PP.resolve({ el: doc._slides[0].holder });
  check('Bold Blue\'s hero tier is the configuration that already shipped (clinical)',
        r.enabled && r.cfg.dof === false && r.cfg.fxaa === false && r.cfg.threshold === 3.2 && r.cfg.strength === 0.5 && r.cfg.ao === true,
        JSON.stringify(r.cfg));
  check('...and so is its body tier', PP.resolve({ el: doc._slides[2].holder }).cfg.dof === false);

  // 4. Flat-Pack is a drawing: no post in any tier
  doc.documentElement.dataset.look = 'flat-pack';
  check('Flat-Pack refuses post in every tier',
        [0, 2, 4].every(i => PP.resolve({ el: doc._slides[i].holder }).enabled === false));
  doc.documentElement.dataset.look = 'bold-blue';

  // 5. precedence: scene > slide > look
  doc._slides[2].dataset.post = 'cinematic';
  r = PP.resolve({ el: doc._slides[2].holder });
  check('a slide overrides the look\'s tier', r.enabled && r.cfg.dof === true, JSON.stringify(r.cfg));
  r = PP.resolve({ el: doc._slides[2].holder, scenePost: false });
  check('the scene overrides the slide', r.enabled === false, r.reason);
  doc._slides[2].holder.dataset.post = 'off';
  check('the holder can turn it off too', PP.resolve({ el: doc._slides[2].holder }).enabled === false);
  delete doc._slides[2].holder.dataset.post;
  delete doc._slides[2].dataset.post;
}

/* 6. the honesty gate - wired to the B-05 provenance record, not to a guess */
{
  const doc = makeDom([{ kind: 'title' }, {}, {}, { kind: 'closing' }], { slides: [2], source: 'provenance.json' });
  const PP = loadPolicy(doc);
  let r = PP.resolve({ el: doc._slides[1].holder });
  check('a slide carrying measured values gets no post', r.enabled === false && r.measured === 'yes', r.reason);
  check('...and the refusal names the figure, not a vague policy', /measured values/.test(r.reason) && /traced numbers/.test(r.reason), r.reason);
  r = PP.resolve({ el: doc._slides[1].holder, scenePost: 'cinematic' });
  check('the gate outranks the scene asking explicitly', r.enabled === false, r.reason);
  r = PP.resolve({ el: doc._slides[0].holder });
  check('a slide with no measured value is unaffected', r.enabled === true && r.measured === 'no', r.reason);

  PP.register('loud-look', { hero: 'cinematic', body: 'cinematic', closing: 'hero', allowOnMeasured: true });
  doc.documentElement.dataset.look = 'loud-look';
  PP.forget();
  r = PP.resolve({ el: doc._slides[1].holder });
  check('a look may opt in explicitly, and only explicitly', r.enabled === true && r.measured === 'yes', r.reason);
}
{
  // an UNPACKED build folder has no record: the answer is "unknown", said out loud, never a silent "nothing is measured"
  const doc = makeDom([{ kind: 'title' }, {}, { kind: 'closing' }]);
  const PP = loadPolicy(doc);
  const r = PP.resolve({ el: doc._slides[1].holder });
  check('with no provenance record the gate reports "unknown" rather than guessing',
        r.measured === 'unknown' && /no provenance record/.test(r.reason), r.reason);
}
{
  // data-measured says the same thing by hand (an unpacked deck, or a slide the author knows carries a reading)
  const doc = makeDom([{ kind: 'title' }, { measured: '' }, { kind: 'closing' }]);
  const PP = loadPolicy(doc);
  check('data-measured on a slide closes the gate', PP.resolve({ el: doc._slides[1].holder }).enabled === false);
}

/* ================================================================ the wiring the looks and the packer must carry */
{
  const studio = fs.readFileSync(path.join(LIB, '..', 'looks', 'bold-blue', 'studio3d.js'), 'utf8');
  check('Bold Blue has no second composer: it delegates to LumiPost',
        !/function makePost\(THREE/.test(studio) && /LumiPostPolicy\.resolve/.test(studio) && /LumiPostPolicy\.make/.test(studio));
  check('Bold Blue degrades through LumiPost\'s ladder, not its own', /post\.degrade\(\)/.test(studio));
  check('a deck built before the libraries existed renders without post instead of failing',
        /if \(!window\.LumiPost \|\| !window\.LumiPostPolicy\)/.test(studio) && /console\.warn/.test(studio));

  const fp = fs.readFileSync(path.join(LIB, '..', 'looks', 'flat-pack', 'fp3d.js'), 'utf8');
  check('Flat-Pack refuses a post option by name rather than ignoring it', /if \(o\.post\) throw new Error/.test(fp));

  const nd = fs.readFileSync(path.join(LIB, '..', '..', 'tools', 'new_deck.js'), 'utf8');
  check('every look loads the shared libraries, and loads them before its own scripts',
        /deck\/lib\/post\.js/.test(nd) && /deck\/lib\/post-policy\.js/.test(nd)
        && nd.indexOf('deck/lib/post-policy.js') < nd.indexOf('looks/bold-blue/bold-blue.js'));

  const pk = fs.readFileSync(path.join(LIB, '..', '..', 'tools', 'pack_deck.py'), 'utf8');
  check('the packer writes the measured-values record into every packed deck',
        /lumi-measured/.test(pk) && /MEASURED_KINDS/.test(pk) && /def measured_record/.test(pk));
  check('...and an illustrative claim is not treated as a measured value',
        /MEASURED_KINDS = \('figure', 'source', 'published', 'computed'\)/.test(pk));

  const base = fs.readFileSync(path.join(LIB, '..', '..', '..', 'workspace', '.claude', 'skills', 'aura-slide',
                                         'looks', '_shared', 'LOOK-BASE.md'), 'utf8');
  check('the hero rule is in the shared look base, not in a deck',
        /hero rule/i.test(base) && /If every slide is spectacular, none is/.test(base) && /\bclosing\b/.test(base));
  check('the base says post never applies to a slide carrying measured values',
        /Never post on a slide that carries measured values/.test(base) && /provenance\.json/.test(base));
  check('the base carries the chart idiom: cinematic to establish, flat to measure',
        /Cinematic to establish, flat to measure/i.test(base) && /extruded ribbons/i.test(base)
        && /particle or flow fields/i.test(base) && /physical objects/i.test(base));
}

console.log(`\n${pass}/${total} post-stack checks passed`);
process.exit(pass === total ? 0 : 1);
