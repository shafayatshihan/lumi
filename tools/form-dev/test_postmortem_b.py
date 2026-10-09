"""Regression tests for the post-mortem fixes, batch B (docs/deck-b45622-postmortem.md, FIXLOG "Post-mortem fixes B").
Run by test_server.py (run(T)); also alone:
  python tools/form-dev/test_postmortem_b.py --sandbox X:\\aura-dev-pmb
No server, no Claude, no real Blender - every check is in-process or one subprocess.

  Q   the quality tier and the explicit (model, effort) pair are ONE stored value read two ways; the matrix offered is
      only what `claude -p` really takes; PATCH keeps accepting a plain tier (0.5.3 / 0.5.4 compatibility)
  P5  CTX_RESET is live for the DECK conversation (plan, re-plan, whole-deck chat), never in the middle of a question,
      and the hand-off message is self-contained
  P6  `tokensRun` and `costUsdRun` are the same scope; the cumulative session total is stored under its own name and
      never reaches an estimate; a pre-0.5.5 deck keeps its per-run `tokens` and loses only its cumulative cost
  P11 three.js is packed only when the deck's own code uses it, whatever order pack() runs in, and the template's dead
      3D example is not shipped
  P12 every render records what was predicted beside what happened, and the deck gets one accuracy summary
  P2  what a slide was really BUILT with is recorded next to what the plan asked for, and a divergence is said out loud
  B4  the run ledger, the answered-doubt cap, the two raw OSError messages, and the finalize browser gate
"""
import base64, json, os, re, shutil, subprocess, sys, tempfile, time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ENGINE = REPO / 'engine'
NODE = shutil.which('node.exe') or shutil.which('node')


# ---------------------------------------------------------------- Q: the quality tier and the explicit pair
def quality_suite(check, fs):
    # The matrix is what the installed CLI really accepts: `--effort <low|medium|high|xhigh|max>` and a model alias.
    # `fable` is a real alias but needs usage credits, so it must NOT be offered.
    check('Q the effort levels offered are exactly the ones the CLI documents',
          list(fs.QUALITY_EFFORTS) == ['low', 'medium', 'high', 'xhigh', 'max'], fs.QUALITY_EFFORTS)
    check('Q the models offered are runnable ones only (no fable: it needs usage credits)',
          list(fs.QUALITY_MODELS) == ['opus', 'sonnet', 'haiku'] and 'fable' not in fs.QUALITY_MODELS, fs.QUALITY_MODELS)
    check('Q every named tier is inside the matrix it is offered from',
          all(fs.QUALITY_MODEL[t][0] in fs.QUALITY_MODELS and fs.QUALITY_MODEL[t][1] in fs.QUALITY_EFFORTS for t in fs.QUALITIES))
    # one stored value, two ways to see it
    check('Q picking a tier sets the pair', fs.quality_pair('just-right') == ('opus', 'medium')
          and fs.quality_pair('maximum') == ('opus', 'high'), fs.quality_pair('just-right'))
    check('Q setting the pair to a tier\'s combination stores and shows THAT tier, not a second setting',
          fs.pair_quality('opus', 'medium') == 'just-right' and fs.quality_tier('opus/medium') == 'just-right'
          and fs.norm_quality('opus/medium') == 'just-right', fs.pair_quality('opus', 'medium'))
    check('Q a pair no tier covers is stored as the pair and reads as Custom',
          fs.norm_quality('opus/xhigh') == 'opus/xhigh' and fs.quality_tier('opus/xhigh') is None
          and 'Custom' in fs.quality_text('opus/xhigh') and 'Opus' in fs.quality_text('opus/xhigh'), fs.quality_text('opus/xhigh'))
    check('Q the two views of one stored value can never disagree',
          all(fs.quality_pair(fs.quality_view(q)['quality']) == (fs.quality_view(q)['model'], fs.quality_view(q)['effort'])
              for q in list(fs.QUALITIES) + ['opus/xhigh', 'haiku/low', 'nonsense']))
    check('Q nonsense falls back to the default, it never becomes a command-line flag',
          fs.norm_quality('nonsense') == fs.DEFAULT_QUALITY and fs.norm_quality('opus/bogus') == fs.DEFAULT_QUALITY
          and fs.norm_quality('gpt/high') == fs.DEFAULT_QUALITY, fs.norm_quality('gpt/high'))
    for q in list(fs.QUALITIES) + ['opus/xhigh', 'haiku/max', 'plan']:
        fl = fs.quality_flags(q)
        ok = fl[0] == '--model' and fl[1] in fs.QUALITY_MODELS and fl[2] == '--effort' and fl[3] in fs.QUALITY_EFFORTS
        if not ok: break
    check('Q every stored quality becomes a real --model / --effort pair', ok, (q, fs.quality_flags(q)))
    check('Q the default is opus + medium, and it is the tier that carries "recommended"',
          fs.DEFAULT_QUALITY == 'just-right' and fs.QUALITY_MODEL['just-right'] == ('opus', 'medium'))
    check('Q three tiers, and the names mean what the owner asked: opus high is maximum, sonnet high is balanced',
          len(fs.QUALITIES) == 3 and fs.QUALITY_MODEL['maximum'] == ('opus', 'high')
          and fs.QUALITY_MODEL['balanced'] == ('sonnet', 'high'), fs.QUALITY_MODEL)
    check('Q every tier has one plain word for the page to print',
          all(fs.quality_view(t)['name'] for t in fs.QUALITIES), [fs.quality_view(t)['name'] for t in fs.QUALITIES])
    # `maximum` and `balanced` meant OTHER pairs before v0.5.11, so a record written then is rewritten once, by its
    # pair - EXCEPT `maximum`. Owner's call, 2026-10-08: an old `maximum` deck becomes the NEW maximum (opus/high),
    # so the tier keeps meaning "the most thorough one" rather than keeping its old exact pair (opus/max).
    check('Q an old record is rewritten by its pair, and old `maximum` becomes the new maximum (owner, 2026-10-08)',
          fs.quality_v2({'quality': 'maximum'})['quality'] == 'maximum'
          and fs.quality_v2({'quality': 'balanced'})['quality'] == 'just-right'
          and fs.quality_v2({'quality': 'best'})['quality'] == 'maximum'
          and fs.quality_v2({'quality': 'fast'})['quality'] == 'sonnet/medium', fs.quality_v2({'quality': 'maximum'}))
    check('Q a stamped record is left alone, so the rewrite happens once and never flips a new choice back',
          fs.quality_v2({'quality': 'balanced', 'qualityV': fs.QUALITY_V})['quality'] == 'balanced')
    check('Q the plan conversation still runs its own quality, whatever the deck chose',
          fs.quality_flags(fs.PLAN_QUALITY)[1] == 'sonnet')
    opts = fs.quality_options()
    check('Q the look step is given every tier with a share of the allowance against the default',
          len(opts['tiers']) == 3 and all('share' in t and t['label'] and t['name'] for t in opts['tiers'])
          and next(t for t in opts['tiers'] if t['quality'] == 'just-right')['share'] == 1.0
          and next(t for t in opts['tiers'] if t['quality'] == 'balanced')['share'] < 0.3
          and next(t for t in opts['tiers'] if t['quality'] == 'maximum')['share'] > 1.0, opts['tiers'])
    check('Q the advanced control is given the same matrix the flags come from',
          [m['id'] for m in opts['models']] == list(fs.QUALITY_MODELS)
          and [e['id'] for e in opts['efforts']] == list(fs.QUALITY_EFFORTS))


def quality_screen_suite(check):
    """Part 3: what the look step tells the person, in plain words. The page itself needs a DOM; these are its pure parts."""
    if not NODE:
        check('part 3 the quality-choice checks ran (node)', False); return
    r = subprocess.run([NODE, str(Path(__file__).with_name('pmb_quality_test.mjs'))], cwd=str(REPO),
                       capture_output=True, timeout=120)
    o = (r.stdout + r.stderr).decode('utf-8', 'replace')
    seen = False
    for line in o.splitlines():
        if line.startswith('  PASS ') or line.startswith('  FAIL '):
            seen = True
            check(line[7:], line.startswith('  PASS '))
    if not seen: check('part 3 the quality-choice checks ran', False, o[-300:])


def quality_api_suite(T, fs):
    """PATCH /api/decks/<id> must keep taking a plain tier exactly as 0.5.3 / 0.5.4 sent it, and also take the pair."""
    check, jpost, req = T.check, T.jpost, T.req
    r = jpost('/api/decks', {})
    did = (r or {}).get('id')
    if not did:
        check('Q PATCH: a deck could be made', False, r); return
    a = req('PATCH', f'/api/decks/{did}', {'quality': 'balanced'})
    check('Q PATCH still accepts a plain tier name',
          a.get('ok') and a['deck']['quality'] == 'balanced' and a['deck']['qualityView']['model'] == 'sonnet', a)
    b = req('PATCH', f'/api/decks/{did}', {'model': 'opus', 'effort': 'xhigh'})
    check('Q PATCH accepts the explicit pair and stores it as one value',
          b.get('ok') and b['deck']['quality'] == 'opus/xhigh' and b['deck']['qualityView']['tier'] is None, b)
    c = req('PATCH', f'/api/decks/{did}', {'model': 'opus', 'effort': 'medium'})
    check('Q changing one axis back to a tier\'s combination shows that tier again',
          c.get('ok') and c['deck']['quality'] == 'just-right' and c['deck']['qualityView']['tier'] == 'just-right', c)
    d = req('PATCH', f'/api/decks/{did}', {'quality': 'opus/high'})
    check('Q PATCH takes "<model>/<effort>" in the quality field too',
          d.get('ok') and d['deck']['quality'] == 'maximum', d)
    for bad in ({'quality': 'turbo'}, {'model': 'gpt'}, {'effort': 'insane'}, {'quality': 'fable/max'}):
        e = req('PATCH', f'/api/decks/{did}', bad)
        if e.get('ok'): break
    check('Q a model or effort the runner cannot run is refused, never stored', not e.get('ok'), (bad, e))


# ---------------------------------------------------------------- P5: the deck conversation is handed off too
def handoff_suite(check, fs, C):
    with C.unit_root(fs, 'pmb-p5') as root:
        class R:
            waiting = False
        old = fs.RUNNER
        fs.RUNNER = R()
        try:
            rec = C.deck_json(fs, root, 'h1', sessionId=None, ctxTokens=0)
            check('P5 a deck with no conversation is never handed off', fs.deck_handoff(rec) is False)
            rec = C.deck_json(fs, root, 'h2', sessionId='s-1', ctxTokens=10_000)
            check('P5 a small deck conversation carries on as it is', fs.deck_handoff(rec) is False)
            rec = C.deck_json(fs, root, 'h3', sessionId='s-1', ctxTokens=fs.CTX_RESET)
            check('P5 a deck conversation AT the threshold is handed off (this is the case 0.5.4 never checked)',
                  fs.deck_handoff(rec) is True)
            R.waiting = True
            check('P5 never in the middle of a question: the open question lives only in the transcript',
                  fs.deck_handoff(rec) is False)
            R.waiting = False
            check('P5 a missing record cannot raise', fs.deck_handoff(None) is False and fs.deck_handoff({}) is False)
        finally:
            fs.RUNNER = old
    # the hand-off message must be self-contained: everything the old conversation held that is not already on disk
    rec = {'id': 'h4', 'look': 'Clay Pop', 'quality': 'balanced',
           'plan': {'slides': [{'id': 's1', 'title': 'Why fins', 'built': True, 'visual': {'main': 'text'}},
                               {'id': 's2', 'title': 'The rig', 'visual': {'main': '3d'}}], 'doubts': []}}
    msg = fs.recovery_message(rec, 'carry on please', handoff=True)
    check('P5 the hand-off says plainly that the fresh conversation is on purpose', '[context-handoff]' in msg
          and 'grew too large' in msg, msg[:160])
    check('P5 it restates the plan file, the look, the quality and which slides are built',
          'plan.json' in msg and 'Clay Pop' in msg and 'balanced' in msg
          and 'Why fins' in msg and 'The rig' in msg, msg[:400])
    check('P5 it never asks the person to repeat anything', 'do not ask the person to repeat' in msg)
    check('P5 the original message is still the last thing in it', msg.rstrip().endswith('carry on please'))
    src = (ENGINE / 'form_server.py').read_text(encoding='utf-8')
    check('P5 the plan, the re-plan and whole-deck chat all read the threshold now',
          src.count('deck_handoff(rec)') >= 3, src.count('deck_handoff(rec)'))
    check('P5 the hand-off status line no longer says "this slide" for a deck hand-off',
          "'Starting a fresh conversation for this deck'" in src)


# ---------------------------------------------------------------- P6: one scope per name
class _Run:
    """The parts of form_server.Run the cost / token plumbing touches."""
    def __init__(self, usage=0, cost=None, prev=0.0):
        self.usage_total, self.out_tokens, self.ctx = usage, 0, 0
        self.cost, self.cost_session, self.cost_prev = None, None, prev
        self._tot = cost

    def result(self):
        if self._tot is None: return
        self.cost_session = self._tot
        self.cost = round(max(0.0, self._tot - (self.cost_prev or 0.0)), 4)


def scope_suite(check, fs, C):
    # the real sequence from deck b45622, slide 1: cost-state 0.4801 -> 1.5653 -> 1.8168 across three runs of ONE session
    runs, prev = [], 0.0
    for tot, used in ((0.4801, 2_100_000), (1.5653, 1_660_361), (1.8168, 679_015)):
        r = _Run(used, tot, prev); r.result(); prev = r.cost_session
        runs.append(r)
    check('P6 the recorded cost is this run only, like the recorded tokens',
          [r.cost for r in runs] == [0.4801, 1.0852, 0.2515], [r.cost for r in runs])
    check('P6 the session running total is kept under its own name, so the next run can subtract it',
          [r.cost_session for r in runs] == [0.4801, 1.5653, 1.8168])
    check('P6 the per-run costs add back up to the session total', abs(sum(r.cost for r in runs) - 1.8168) < 1e-6)
    check('P6 a fresh conversation (hand-off, recovery, a slide\'s first run) subtracts nothing',
          _Run(1000, 0.33, 0.0).__class__ and (lambda r: (r.result(), r.cost)[1])(_Run(1000, 0.33, 0.0)) == 0.33)
    check('P6 a total that went backwards never records a negative cost',
          (lambda r: (r.result(), r.cost)[1])(_Run(1000, 0.2, 0.9)) == 0.0)

    check('P6 the per-run token reader takes the new name first and the old one after',
          fs._run_tok({'tokensRun': 42}) == 42 and fs._run_tok({'tokens': 42}) == 42
          and fs._run_tok({'tokensRun': 42, 'tokens': 9}) == 42 and fs._run_tok({}) is None)

    with C.unit_root(fs, 'pmb-p6') as root:
        # a 0.5.5 slide: both halves per-run
        bl = {'s1': {'engine': 'blender', 'kind': 'still', 'status': 'preview',
                     'previews': [{'n': 1, 'res': 30, 'height': 1080, 'samples': 16, 'render_s': 5.0}],
                     'changes': [{'tokensRun': 500_000, 'costUsdRun': 0.25}, {'tokensRun': 700_000, 'costUsdRun': 0.35}]}}
        rec = C.deck_json(fs, root, 'c1', plan={'slides': [{'id': 's1', 'title': 'A', 'visual': {'main': '3d'}}]}, blender=bl)
        rec = fs.load_deck('c1')
        est = fs.bl_estimates(rec, 's1', None, model=fs.DEFAULT_BENCH)['iteration']
        check('P6 the estimate names both halves per-run, and both really are',
              est['tokensRun'] == 600_000 and est['costUsdRun'] == 0.3 and 'tokens' not in est and 'costUsd' not in est, est)
        # a deck saved by 0.5.4: `tokens` was per-run (keep it), `costUsd` beside it was CUMULATIVE (never use it)
        bl2 = {'s1': dict(bl['s1'], changes=[{'tokens': 1_660_361, 'costUsd': 1.5653}, {'tokens': 679_015, 'costUsd': 1.8168}])}
        C.deck_json(fs, root, 'c2', plan={'slides': [{'id': 's1', 'title': 'A', 'visual': {'main': '3d'}}]}, blender=bl2)
        old_stats = fs.bl_stats
        fs.bl_stats = lambda: {}
        try:
            est2 = fs.bl_estimates(fs.load_deck('c2'), 's1', None, model=fs.DEFAULT_BENCH)['iteration']
        finally:
            fs.bl_stats = old_stats
        check('P6 an older deck keeps its per-run token median',
              est2['tokensRun'] == (1_660_361 + 679_015) / 2, est2)
        check('P6 an older deck\'s CUMULATIVE cost is never shown as the price of one more preview',
              est2['costUsdRun'] is None, est2)
        # the stats file the history basis reads
        fs.bl_stats_add(123_456, 0.21)
        d = fs.bl_stats()
        check('P6 the shared history file records per-run names only',
              d['changes'][-1]['tokensRun'] == 123_456 and d['changes'][-1]['costUsdRun'] == 0.21
              and 'costUsd' not in d['changes'][-1], d['changes'][-1])

    js = (ENGINE / 'form' / 'js' / 'blender.js').read_text(encoding='utf-8')
    check('P6 the screen reads the per-run cost, never the cumulative one',
          'it.costUsdRun' in js and 'fmtCost(it.costUsd)' not in js)


# ---------------------------------------------------------------- P11: three.js only when a slide uses it
def three_suite(check, tmp):
    sys.path.insert(0, str(ENGINE / 'tools'))
    sys.dont_write_bytecode = True
    import pack_deck as pk
    P = pk.Packer.__new__(pk.Packer)
    P.stats = {}
    tpl = (ENGINE / 'deck' / 'template.html').read_text(encoding='utf-8')
    rt = (ENGINE / 'deck' / 'runtime.js').read_text(encoding='utf-8')
    check('P11 a deck whose only Aura.scene is the template\'s commented example does not pull in three.js',
          P.needs_three(tpl) is False)
    check('P11 a slide that really registers a scene does',
          P.needs_three(tpl.replace('</main>', '</main><script>Aura.scene("s8flow", f, {period: 8});</script>')) is True)
    check('P11 so does a slide that imports the module by name',
          P.needs_three('<script type="module">import * as T from "three";</script>') is True)
    # the bug this guards: the runtime's OWN lazy `import("three")` must never be the thing that decides
    check('P11 the deck runtime\'s own lazy import can never flip the decision, whenever it is inlined',
          "import('three')" in rt and P.needs_three(tpl.replace('</body>', f'<script>{rt}</script></body>')) is False)
    check('P11 a <script src> the packer has not inlined yet is not read as the deck\'s own code',
          P.needs_three('<script src="runtime.js"></script><main></main>') is False)
    check('P11 a line-commented example counts no more than a block-commented one',
          P.needs_three('<script>\n// Aura.scene("x", f);\n</script>') is False)
    out = P.strip_dead_examples(tpl)
    check('P11 the template\'s dead 3D example is not shipped in the packed file',
          'Aura.scene(\'orb\'' not in out and '3D example' not in out and len(out) < len(tpl))
    check('P11 stripping it leaves no empty <script></script> behind', '<script></script>' not in out
          and '<script>\n</script>' not in out)
    check('P11 a deck with no example is untouched', P.strip_dead_examples('<p>hi</p>') == '<p>hi</p>')


# ---------------------------------------------------------------- P12: predictions are kept and scored
def estimate_suite(check, fs, C):
    check('P12 the error is signed and measured against what really happened',
          fs._est_error(120, 100) == 0.2 and fs._est_error(70, 100) == -0.3)
    check('P12 a job with no estimate reports nothing rather than a made-up zero',
          fs._est_error(None, 100) is None and fs._est_error(120, None) is None and fs._est_error(120, 0) is None)
    with C.unit_root(fs, 'pmb-p12') as root:
        bl = {'s1': {'engine': 'blender', 'kind': 'still', 'status': 'rendered',
                     'previews': [{'n': 1, 'res': 30, 'height': 1080, 'samples': 16, 'render_s': 10.0,
                                   'est_s': 12.0, 'est_basis': 'benchmark'},
                                  {'n': 2, 'res': 30, 'height': 1080, 'samples': 16, 'render_s': 10.0}],
                     'final': {'kind': 'still', 'res': 1080, 'render_s': 100.0, 'est_s': 60.0, 'est_basis': 'slide',
                               'frames': 1, 'file': None}}}
        C.deck_json(fs, root, 'e1', plan={'slides': [{'id': 's1', 'title': 'A', 'visual': {'main': '3d'}}]}, blender=bl)
        old = fs.blender_available, fs.find_blender
        fs.blender_available, fs.find_blender = (lambda: False), (lambda *a, **k: None)
        try:
            rc = fs.build_timing_record(fs.load_deck('e1'), copy_scenes=False)
        finally:
            fs.blender_available, fs.find_blender = old
        p = rc['render']['s1']
        check('P12 a preview records predicted, its basis, and the error beside the measurement',
              p['previews'][0]['estS'] == 12.0 and p['previews'][0]['estBasis'] == 'benchmark'
              and p['previews'][0]['estError'] == 0.2, p['previews'][0])
        check('P12 the full render does the same', p['final']['estS'] == 60.0 and p['final']['estError'] == -0.4, p['final'])
        check('P12 a job that recorded no estimate scores nothing', p['previews'][1]['estS'] is None
              and p['previews'][1]['estError'] is None)
        acc = rc['estimateAccuracy']
        check('P12 the deck gets one line that answers "were the progress bars honest?"',
              acc['scored'] == 2 and acc['medianError'] == -0.1 and acc['worstError'] == -0.4
              and acc['withinShownBand'] == 1, acc)
        # a deck rendered by 0.5.4 recorded no estimate at all: it must report nothing, not a perfect score
        bl2 = {'s1': {'engine': 'blender', 'kind': 'still', 'status': 'rendered',
                      'previews': [{'n': 1, 'res': 30, 'height': 1080, 'samples': 16, 'render_s': 10.0}], 'final': None}}
        C.deck_json(fs, root, 'e2', plan={'slides': [{'id': 's1', 'title': 'A', 'visual': {'main': '3d'}}]}, blender=bl2)
        old = fs.blender_available, fs.find_blender
        fs.blender_available, fs.find_blender = (lambda: False), (lambda *a, **k: None)
        try:
            rc2 = fs.build_timing_record(fs.load_deck('e2'), copy_scenes=False)
        finally:
            fs.blender_available, fs.find_blender = old
        check('P12 a 0.5.4 deck reports no accuracy rather than a flattering one', rc2['estimateAccuracy'] is None)


# ---------------------------------------------------------------- P2: intent and fact, side by side
def visual_suite(check, fs, C):
    with C.unit_root(fs, 'pmb-p2') as root:
        b = 'bld'
        d = fs.BUILDS / b
        d.mkdir(parents=True, exist_ok=True)
        (d / 'index.html').write_text(
            '<main class="deck">'
            '<section class="slide"><div class="bb-blender bb-3d" data-blender="s1"></div></section>'
            '<section class="slide"><div class="aura-3d" data-scene="s2x"></div></section>'
            '<section class="slide"><svg class="stations"><circle r="4"/></svg></section>'
            '</main>', encoding='utf-8')
        check('P2 a studio-render holder reads as blender', fs.built_visual_kind(b, 1) == 'blender')
        check('P2 a live scene holder reads as threejs', fs.built_visual_kind(b, 2) == 'threejs')
        check('P2 a hand-written SVG reads as flat (deck b45622 slide 12)', fs.built_visual_kind(b, 3) == 'flat')
        check('P2 a slide number that does not exist reads as nothing, never a guess',
              fs.built_visual_kind(b, 9) is None and fs.built_visual_kind('nope', 1) is None)
        plan = {'slides': [{'id': 's1', 'title': 'A', 'visual': {'main': '3d', 'motion': 'still'}},
                           {'id': 's2', 'title': 'B', 'visual': {'main': '3d', 'motion': 'still'}},
                           {'id': 's12', 'title': 'C', 'visual': {'main': '3d', 'motion': 'still'}}], 'doubts': []}
        C.deck_json(fs, root, 'v1', plan=plan, build=b)
        why = fs.pin_built_visual('v1', 3, b)
        got = fs.load_deck('v1')['plan']['slides'][2]['visual']
        check('P2 the fact is recorded', got.get('builtAs') == 'flat', got)
        check('P2 the intent is NOT overwritten (a re-plan must still know 3D was wanted)', got.get('main') == '3d', got)
        check('P2 the divergence is said out loud, naming the slide',
              why and 'slide 3' in why and '3D' in why, why)
        check('P2 saying it twice for the same slide says it once', fs.pin_built_visual('v1', 3, b) is None)
        check('P2 a slide built the way the plan asked says nothing', fs.pin_built_visual('v1', 2, b) is None
              and fs.load_deck('v1')['plan']['slides'][1]['visual']['builtAs'] == 'threejs')
        # the fact must survive the plan sanitiser and every later re-plan
        clean, _ = fs.norm_visual({'main': '3d', 'motion': 'still', 'builtAs': 'flat'}, 'slide 3', False, [], [])
        check('P2 the record survives the plan sanitiser', clean.get('builtAs') == 'flat', clean)
        bad, _ = fs.norm_visual({'main': '3d', 'motion': 'still', 'builtAs': 'something-else'}, 'slide 3', False, [], [])
        check('P2 only the three real answers are accepted into it', 'builtAs' not in bad, bad)
    js = (ENGINE / 'form' / 'js' / 'plan.js').read_text(encoding='utf-8')
    check('P2 the page carries the record through instead of erasing it on the next edit', 'out.builtAs = v.builtAs' in js)


# ---------------------------------------------------------------- B4: what a senior engineer went looking for
def extra_suite(check, fs, C):
    with C.unit_root(fs, 'pmb-b4') as root:
        # the run ledger: the evidence that outlives a pruned transcript
        class R:
            session_id = 'sess-9'
        old = fs.RUNNER
        fs.RUNNER = R()
        try:
            C.deck_json(fs, root, 'L1')
            import time as _t
            r = _Run(1_234_567, 0.55, 0.3); r.result()
            r.deck_id, r.conv, r.kind, r.started = 'L1', 's4', 'build-slide', _t.time() - 12
            r.ok, r.stopped, r.lost, r.limited, r.asked, r.errors = True, False, False, False, False, ['x']
            fs.log_run(r)
            p = fs.work_dir('L1') / 'runs.jsonl'
            row = json.loads(p.read_text(encoding='utf-8').strip().splitlines()[-1])
            check('B4 one line per run lands in the deck\'s own folder, so a backup of the deck backs it up',
                  p.is_file() and row['kind'] == 'build-slide' and row['conv'] == 's4' and row['session'] == 'sess-9', row)
            check('B4 it holds the measurements the post-mortem had to reconstruct from the transcripts',
                  row['tokensRun'] == 1_234_567 and row['costUsdRun'] == 0.25 and row['costUsdSession'] == 0.55
                  and row['durationS'] >= 11 and row['ok'] is True and row['toolErrors'] == 1, row)
            check('B4 it holds no prompt and no reply text: it is a measurement, never a transcript',
                  not any(k in row for k in ('message', 'text', 'said', 'prompt', 'reply')), sorted(row))
            r2 = _Run(10, None, 0.0); r2.result()
            r2.deck_id, r2.conv, r2.kind, r2.started = 'L1', None, 'plan', _t.time()
            r2.ok, r2.stopped, r2.lost, r2.limited, r2.asked, r2.errors = False, True, False, False, False, []
            fs.log_run(r2)
            check('B4 it appends, it never rewrites', len(p.read_text(encoding='utf-8').strip().splitlines()) == 2)
            r3 = _Run(10, None, 0.0); r3.deck_id = None
            fs.log_run(r3)
            check('B4 a run with no deck writes nothing and raises nothing', True)
        finally:
            fs.RUNNER = old
    check('B4 the ledger is bounded, so it cannot grow for ever', fs.RUNLOG_MAX_BYTES <= 4 * 1024 * 1024)
    check('B4 the answered doubts a plan keeps are bounded too (deck b45622 answered 74 and dropped none)',
          0 < fs.MAX_ANSWERED_DOUBTS <= 1000)
    # the two raw OSError messages that still reached a person
    src = (ENGINE / 'form_server.py').read_text(encoding='utf-8')
    check('B4 the two raw OSError messages that still reached a person are gone',
          "'error': 'save-failed', 'message': str(e)" not in src and "'error': 'start-failed', 'message': str(e)" not in src
          and src.count("os_reason(e, ") >= 2)
    e = PermissionError(13, 'Permission denied')
    e.winerror = 32
    check('B4 a locked file is explained, never printed',
          'open in another program' in fs.os_reason(e, 'the sign-in record')
          and 'Errno' not in fs.os_reason(e, 'the sign-in record'), fs.os_reason(e))
    check('B4 a full disk and a missing file each get their own plain sentence',
          'disk is full' in fs.os_reason(OSError(28, 'no space')) and 'missing' in fs.os_reason(FileNotFoundError(2, 'x')))
    # the finalize gate that now fails early instead of late
    old = os.environ.get('AURA_FAKE_EDGE')
    try:
        os.environ['AURA_FAKE_EDGE'] = 'none'
        check('B4 with no browser installed, finalize knows before it copies anything', fs.find_chromium() is None)
        os.environ['AURA_FAKE_EDGE'] = r'C:\fake\msedge.exe'
        check('B4 with one installed it carries on exactly as before', fs.find_chromium() == r'C:\fake\msedge.exe')
    finally:
        if old is None: os.environ.pop('AURA_FAKE_EDGE', None)
        else: os.environ['AURA_FAKE_EDGE'] = old
    check('B4 the browser is checked beside the other missing-tool gates, before any work',
          "'browser-missing'" in src and src.index("'browser-missing'") < src.index("if self.state.get('running'): return 409, {'ok': False, 'error': 'finalizing'"))


# ---------------------------------------------------------------- the five owner preferences (S1-S5)
def prefs_suite(check):
    sk = REPO / 'workspace' / '.claude' / 'skills' / 'aura-slide'
    card = (sk / 'building.md').read_text(encoding='utf-8')
    body = re.search(r'<!-- step-card -->(.*?)<!-- /step-card -->', card, re.S)
    body = body.group(1) if body else ''
    check('S1 the step card tells Claude a reveal plays itself once, on arrival',
          'arrive one at a time, by themselves' in body and 'all at once, no motion' in body
          and 'click a reveal forward' in body, bool(body))
    check('S1 it still asks WHAT moves, and a 3D scene\'s own motion stays a real question',
          'what* comes in and in what order' in body.replace('*', '*') or 'comes in and in what order' in body)
    check('S1 ambient 3D motion is explicitly left as a question', "ambient motion is still a real question" in body)
    check('S2 uncertainty is drawn at true size, beside its result',
          'drawn at true size beside the result it belongs to' in body and 'never a zoomed axis that flatters it' in body)
    check('S2 it sits in the "before you end the turn" item, before the warnings sentence',
          body.index('drawn at true size') < body.index('every warning you leave is named'))
    # S3 must change the machine rule AND the sentence in CLAUDE.md in one edit, or they contradict each other
    rules = json.loads((ENGINE / 'rules' / 'hard-rules.json').read_text(encoding='utf-8'))
    sent = rules['rules'][0]['whenTextDoesNotFit']
    cm = (REPO / 'workspace' / '.claude' / 'CLAUDE.md').read_text(encoding='utf-8')
    norm = lambda s: re.sub(r'\s+', ' ', s.replace('\u2014', '-').replace('\u2013', '-')).strip()
    check('S3 the hard rule says merge or drop whole items, and splits only as a last resort',
          'merge or drop whole items' in sent and 'do not grind every cell down to one word' in sent
          and 'only when nothing can be dropped' in sent, sent)
    check('S3 the hard rule no longer tells Claude to shorten the words or split', 'shorten the words' not in sent)
    check('S3 CLAUDE.md carries the IDENTICAL sentence (C1: both or neither, in one edit)',
          norm(sent) in norm(cm), norm(sent))
    check('S3 CLAUDE.md does not still carry the old advice beside the new', 'shorten the words or split' not in norm(cm))
    ab = (sk / 'aura-blend.md').read_text(encoding='utf-8')
    check('S4 a sequence is drawn as a path that climbs, in the diagrams section',
          'a path that climbs' in ab and 'Not a row of equal panels' in ab)
    check('S4 it is marked PROVISIONAL with its one deck of evidence and a re-check',
          'PROVISIONAL' in ab and 'b45622aef312' in ab and 'Re-check after the next deck' in ab)
    # B1: the look's authority is the shared base plus the look's brand file; S5 lives in the base now.
    lk = ((sk / 'looks' / '_shared' / 'LOOK-BASE.md').read_text(encoding='utf-8')
          + (sk / 'looks' / 'bold-blue' / 'LOOK.md').read_text(encoding='utf-8'))
    check('S5 the subject-family table has the two-things-compared row',
          '| two things compared |' in lk and 'whole and side by side' in lk)
    check('S5 the morph, the ghost and the half-and-half are each refused by name',
          'as a morph between A and B' in lk and 'ghosted behind it' in lk and 'half A and' in lk)
    check('S5 it is marked PROVISIONAL and says the generalisation is the analyst\'s own inference',
          'PROVISIONAL' in lk and "analyst's own" in lk and 'inference' in lk and 'Re-check' in lk)
    # C2: the identity answers must NOT have become rules
    joined = body + ab + lk
    check('C2 no identity answer was baked in (the interview already asks them)',
          'ME 400' not in joined and 'ME400' not in joined, 'an identity answer leaked into a rule')



# ---------------------------------------------------------------- N1-N5: the owner's live 0.5.4 session
def live_suite(check, fs, C):
    """Four bugs the owner hit while building a 13-slide deck, plus the save-and-export action."""
    ed = (ENGINE / 'form' / 'js' / 'editor.js').read_text(encoding='utf-8')
    css = (ENGINE / 'form' / 'css' / 'studio.css').read_text(encoding='utf-8')

    # N1 - the list PAGES (it is not scrollable and never was), and the wheel now turns the page
    check('N1 the wheel turns the slide list, as the chevrons do', "strip.addEventListener('wheel'" in ed
          and 'passive: false' in ed and 'e.preventDefault()' in ed)
    check('N1 a trackpad\'s many small deltas are added up, one notch per page', 'wheelAcc' in ed and 'wheelAcc >= 40' in ed)
    check('N1 with a single page the event is left alone, so the page under it still scrolls',
          'if (pages <= 1) return;' in ed)

    # N2 - one source of truth for how many slides there are
    check('N2 the plan is what every counter reads, and the deck file only says what exists yet',
          'const total = () =>' in ed and 'const ready = () =>' in ed
          and 'posTxt.textContent = total()' in ed and 'const n = total();' in ed)
    check('N2 the nav counter no longer reads the sections in the file',
          'slide ${cur} of ${count}' not in ed)
    # Part C widened this title to also say which slide the chat is aimed at, so the old literal no longer
    # matches. What must stay true is the PROPERTY: a not-made slide is marked, says so, and cannot be clicked.
    check('N2 a planned slide that is not made yet is shown in its place, greyed and not clickable',
          'is-todo' in ed and "made ?" in ed and "'not made yet'" in ed and 'if (made) b.addEventListener' in ed
          and '.ed-th.is-todo' in css)
    check('N2 the badge says how many of how many while a deck is being built',
          'ready() < n ? `${ready()}/${n}`' in ed)

    # N3 - the preview can no longer stick on "loading your slides..."
    check('N3 every reload carries a token that always changes, so it is never a fragment-only navigation',
          'frameSeq' in ed and '&r=${++frameSeq}' in ed)
    check('N3 a spinner is never the last word: a watchdog says so and offers one useful action',
          'VEIL_WAIT_MS' in ed and 'ed-veil-retry' in ed and 'taking longer than it should' in ed
          and '.ed-veil-retry' in css)
    check('N3 the veil text is held by name, so the watchdog\'s button cannot become it',
          'veilTxt' in ed and 'veil.lastChild' not in ed)
    check('N3 every way the veil comes down also stops the watchdog', 'const veilDown = ()' in ed
          and ed.count('veilDown()') >= 4)

    # N4 - 2D <-> 3D after the build started
    with C.unit_root(fs, 'pmb-n4') as root:
        if fs.RUNNER is None:
            class _Idle:
                busy = running = waiting = False
                deck_id = None

                def add(self, *a, **k): pass
            fs.RUNNER = _Idle()
        did = 'pic1'
        plan = {'version': 1, 'title': 'T', 'minutes': 5, 'doubts': [], 'slides': [
            {'id': 's1', 'title': 'A', 'point': '', 'bullets': [], 'sources': [], 'built': True,
             'visual': {'main': 'text', 'companions': [], 'detail': None, 'motion': None, 'phrase': '', 'builtAs': 'flat'}},
            {'id': 's2', 'title': 'B', 'point': '', 'bullets': [], 'sources': [], 'built': True,
             'visual': {'main': '3d', 'companions': [], 'detail': 'detailed', 'motion': 'still', 'phrase': '', 'engine': 'blender'}},
            {'id': 's3', 'title': 'C', 'point': '', 'bullets': [], 'sources': [], 'built': False,
             'visual': {'main': 'text', 'companions': [], 'detail': None, 'motion': None, 'phrase': ''}}]}
        C.deck_json(fs, root, did, plan=plan, planState='building')
        # the old route still refuses, which is WHY this one exists
        body = {'plan': {'slides': [dict(plan['slides'][0], visual=dict(plan['slides'][0]['visual'], main='3d')),
                                    plan['slides'][1], plan['slides'][2]], 'doubts': []}}
        code, res = fs.save_plan(did, body)
        check('N4 the plan page still refuses to change a built slide (the hole this fills)',
              code == 409 and res.get('error') == 'built', (code, res))
        code, res = fs.change_picture(did, {'slide': 's1', 'main': '3d', 'rebuild': False})
        v = (fs.load_deck(did)['plan']['slides'][0]).get('visual')
        check('N4 a built 2D slide can become 3D', code == 200 and v.get('main') == '3d', (code, v))
        check('N4 the engine is NOT guessed here: slide_engine decides and pin_engine writes it at build time',
              'engine' not in v, v)
        check('N4 the slide is marked to be made again, and the old record of what was drawn is forgotten',
              fs.load_deck(did)['plan']['slides'][0].get('built') is False and 'builtAs' not in v, v)
        check('N4 nothing else moved', [x.get('built') for x in fs.load_deck(did)['plan']['slides']] == [False, True, False])
        # the slide must be left in the plain unbuilt state, NOT 'queued' - that word means "waiting for a re-plan" and
        # `build_next` refuses to start while any slide carries it, so the rebuild would never have begun
        check('N4 the slide is left ready to be built, not marked as waiting for a re-plan',
              not fs.load_deck(did)['plan']['slides'][0].get('status'), fs.load_deck(did)['plan']['slides'][0].get('status'))
        # the two things `build_next` refuses on, and which slide it would take - checked without starting Claude
        sl = fs.plan_slides(fs.load_deck(did))
        blocked = any(x.get('status') in ('queued', 'replanning') for x in sl)
        first_unbuilt = next((x['id'] for x in sl if not x.get('built')), None)
        check('N4 ...so the rebuild really can start, and on THIS slide (the first unbuilt one)',
              not blocked and first_unbuilt == 's1', (blocked, first_unbuilt))
        code, res = fs.change_picture(did, {'slide': 's2', 'main': 'chart', 'rebuild': False})
        v2 = fs.load_deck(did)['plan']['slides'][1]['visual']
        check('N4 and back again: a 3D slide becomes 2D, dropping the engine, the detail and the motion',
              code == 200 and v2.get('main') == 'chart' and 'engine' not in v2 and v2.get('motion') is None, v2)
        check('N4 ...and it keeps no studio-render state behind', not (fs.bl_state(fs.load_deck(did), 's2') or {}).get('status'),
              fs.bl_state(fs.load_deck(did), 's2'))
        for bad in ({'slide': 's1', 'main': 'hologram'}, {'slide': 'nope', 'main': '3d'},
                    {'slide': 's1', 'main': '3d', 'engine': 'unreal'}):
            code, res = fs.change_picture(did, dict(bad, rebuild=False))
            if code == 200: break
        check('N4 a picture, slide or engine Lumi does not have is refused', code != 200, (bad, code, res))
        src = (ENGINE / 'form_server.py').read_text(encoding='utf-8')
        check('N4 the route is reachable from the page', "'plan/picture'" in src and src.count("'plan/picture'") >= 2)
    js = (ENGINE / 'form' / 'js' / 'api.js').read_text(encoding='utf-8')
    check('N4 the page has the call, and the editor has the control in both modes',
          'plan/picture' in js and 'ed-pic' in ed and 'change the picture' in ed and '.ed-picopt' in css)
    check('N4 the control says the slide will be made again, in plain words',
          'make this slide again' in ed and 'the words stay' in ed)

    # N5 - one primary save-and-export, nothing removed
    fz = (ENGINE / 'form' / 'js' / 'finalizing.js').read_text(encoding='utf-8')
    check('N5 the done view leads with one action named for what the person wants',
          "btn('save and export', saveExport, true, 'folder')" in fz)
    check('N5 it makes the files first when the deck is not finalized yet',
          'if (!final || !final.html) { reset(); start({ force: true }); return; }' in fz)
    check('N5 it says what was saved and where, by file name',
          'saveLine' in fz and 'saved: ${got.join' in fz and '4 - your slides' in fz)
    for kept in ("btn('present it'", "btn('make a powerpoint copy'", "btn('smaller file'"):
        if kept not in fz: break
    check('N5 nothing that worked was removed (present it, the powerpoint copy, the smaller file)',
          all(k in fz for k in ("btn('present it'", "btn('make a powerpoint copy'", "btn('smaller file'")), kept)

    # a documentation comment must not be able to forge a studio-render holder
    with C.unit_root(fs, 'pmb-holder') as root:
        did = 'h9'
        f = root / '.aura' / 'decks' / did / 'd.html'
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text('<!-- docs: <div class="bb-blender" data-blender="s1" data-kind="still"> is how a holder looks -->'
                     '<main class="deck"><section class="slide">'
                     '<div class="bb-blender" data-blender="s2" data-kind="still" data-filled="1"></div>'
                     '</section></main>', encoding='utf-8')
        C.deck_json(fs, root, did, file='.aura/decks/' + did + '/d.html',
                    plan={'slides': [{'id': 's1', 'title': 'A'}, {'id': 's2', 'title': 'B'}], 'doubts': []})
        hold = fs.bl_holders(fs.load_deck(did))
        check('a holder written inside a comment is not a holder (finalize could never be unstuck from one)',
              hold == {'s2': True}, hold)



# ---------------------------------------------------------------- N6: finalize really produces a deck (end to end)
def finalize_suite(check):
    """N6. Finalize had not produced a deck since a long run of changes landed (the orphan-holder gate, `bl_holders`, the
    render queue's yielding, `friendly_tool_error`, the `browser-missing` 503, `Packer.needs_three()`, the per-run token
    rename, the deck hand-off), and the owner's last three attempts all failed - every one leaving `final: none`. Every
    unit test passed throughout, so unit tests are not what proves it.

    There is exactly ONE end-to-end implementation, `finalize_probe.py`, and it is run here in `--fixture` mode: a real
    server on a free port, over a real two-slide deck with a FILLED studio-render holder and one live loop, through the
    real browser and the real ffmpeg. The same script without `--fixture` runs against the preserved 4-slide deck
    `df41e681539e` (a 1080p Blender still and a 100-frame loop), which lives on one machine; the fixture travels."""
    if not NODE:
        check('N6 the end-to-end finalize ran (node)', False); return
    r = subprocess.run([sys.executable, str(Path(__file__).with_name('finalize_probe.py')), '--fixture'],
                       cwd=str(REPO), capture_output=True, timeout=1800)
    o = (r.stdout + r.stderr).decode('utf-8', 'replace')
    seen = False
    for line in o.splitlines():
        if line.startswith('  PASS ') or line.startswith('  FAIL '):
            seen = True
            check('N6 ' + line[7:], line.startswith('  PASS '))
        elif line.startswith('  SKIP '):
            seen = True
            print(line)
    if not seen: check('N6 the end-to-end finalize ran', False, o[-600:])


def run(T=None):
    if T is None:
        a = sys.argv

        class T:
            pass
        T.SANDBOX = Path(a[a.index('--sandbox') + 1]) if '--sandbox' in a else Path(tempfile.mkdtemp(prefix='lumi-pmb-'))
        T.REPO = REPO
        T.results = []

        def check(name, ok, info=''):
            T.results.append(bool(ok)); print(('  PASS ' if ok else '  FAIL ') + name + ('' if ok else f'   <- {info}'))
        T.check = check
        globals()['_T'] = T
    check = T.check
    tmp = Path(tempfile.mkdtemp(prefix='lumi-pmb-'))
    os.environ.setdefault('AURA_HOME', str(tmp / 'home' / '.aura'))
    (tmp / 'home' / '.aura').mkdir(parents=True, exist_ok=True)
    os.environ.setdefault('AURA_TEST_UNIT_ROOT', str(Path(T.SANDBOX) / 'unit'))
    sys.path.insert(0, str(ENGINE)); sys.path.insert(0, str(Path(__file__).parent))
    sys.dont_write_bytecode = True
    import form_server as fs
    import test_batch_c as C
    try:
        print('\n[post-mortem B / quality: one setting, a tier and a model+effort pair]')
        quality_suite(check, fs)
        quality_screen_suite(check)
        # the live-server half only when a server is still up (test_server stops it before the late suites)
        if getattr(T, 'jpost', None):
            try:
                quality_api_suite(T, fs)
            except (ConnectionError, OSError) as e:
                print(f'  (skipped: the test server is no longer listening - {e.__class__.__name__})')
        print('\n[post-mortem B / P5: the deck conversation is handed off too]')
        handoff_suite(check, fs, C)
        print('\n[post-mortem B / P6: one scope per name]')
        scope_suite(check, fs, C)
        print('\n[post-mortem B / P11: three.js only when a slide uses it]')
        if NODE or True: three_suite(check, tmp)
        print('\n[post-mortem B / P12: predictions are kept and scored]')
        estimate_suite(check, fs, C)
        print('\n[post-mortem B / P2: intent and fact, side by side]')
        visual_suite(check, fs, C)
        print('\n[post-mortem B / the five owner preferences]')
        prefs_suite(check)
        print('\n[post-mortem B / what else a senior engineer found]')
        extra_suite(check, fs, C)
        print('\n[N1-N5: the owner\u2019s live session: the slide list, the counters, the preview, the picture, save and export]')
        live_suite(check, fs, C)
        print('\n[N6: finalize really produces a deck (real browser, real ffmpeg)]')
        finalize_suite(check)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    run()
    res = globals()['_T'].results
    print(f'{sum(res)}/{len(res)} checks passed')
    sys.exit(0 if all(res) else 1)
