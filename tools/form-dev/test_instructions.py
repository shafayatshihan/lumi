"""Developer-only tests for the instruction surface: the marker grammar shared by the server and the browser, the plan.json
schema and ownership, the step card, the question/limit prose, and the numbers table. No server process, no Claude.
  python tools/form-dev/test_instructions.py
test_server.py also runs this file (run(check)), so `python tools/form-dev/test_server.py` covers it.

What it pins down:
  - engine/aura_markers.py (server) and engine/form/js/markers.js (browser) read tools/form-dev/marker_cases.json identically,
    and the browser's copy of engine/rules/markers.json is identical to the file (C-04, C-05, C-06);
  - every marker in markers.json is in the SKILL.md inventory, and every [[aura:...]] example in the skill docs parses (C-07);
  - a malformed marker is reported (event + log), an inline [[aura:ask]] is not a wait (C-06);
  - the planning prompt forbids ask and the plan dead end gives a readable error (C-09), one question-limit table (C-14);
  - plan.json: Claude's copy hides the app's fields, the app's fields are restored, drift is reported (C-15, L-11);
  - the answer header names the slide being built (L-12); the step card is pasted from building.md (L-15);
  - CLAUDE.md's numbers table equals hard-rules.json and deck_check.js (C-02, C-03, C-10); enforcement.md names real messages (B-03).
"""
import json, os, re, subprocess, sys, tempfile, types
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ENGINE = REPO / 'engine'
SKILL = REPO / 'workspace' / '.claude' / 'skills' / 'aura-slide'
CLAUDE_MD = REPO / 'workspace' / '.claude' / 'CLAUDE.md'
DOCS = [CLAUDE_MD] + [SKILL / n for n in ('SKILL.md', 'planning.md', 'building.md', 'editing.md', 'deck-toolkit.md',
                                          'aura-blend.md', 'story-arcs.md', 'enforcement.md')] + [SKILL / 'looks' / 'bold-blue' / 'LOOK.md']


def read(p):
    return Path(p).read_text(encoding='utf-8')


def load_server():
    """form_server imported against a throwaway AURA_HOME so nothing touches a real install or the repo."""
    tmp = Path(tempfile.mkdtemp(prefix='lumi-instr-'))
    (tmp / '.aura').mkdir()
    os.environ['AURA_HOME'] = str(tmp / '.aura')
    sys.path.insert(0, str(ENGINE))
    import form_server
    return form_server, tmp


def run(check):
    rules = json.loads(read(ENGINE / 'rules' / 'hard-rules.json'))
    mk_spec = json.loads(read(ENGINE / 'rules' / 'markers.json'))

    print('\n[instructions: marker grammar]')
    sys.path.insert(0, str(ENGINE))
    import aura_markers as am
    cases = json.loads(read(Path(__file__).with_name('marker_cases.json')))['cases']
    bad = []
    for c in cases:
        r = am.scan(c['text'])
        got = [{'name': m['name'], 'attrs': m['attrs'], 'line': m['line'], **({'choice': m['choice']} if 'choice' in m else {})} for m in r['markers']]
        gp = [{'line': p['line'], 'reason': p['reason'], 'marker': p['marker']} for p in r['problems']]
        if got != c['markers'] or gp != c['problems']: bad.append(c['name'])
    check(f'Python reads all {len(cases)} shared marker cases', not bad, bad)
    try:
        r = subprocess.run(['node', str(Path(__file__).with_name('markers_test.mjs'))], capture_output=True, timeout=60, cwd=str(REPO))
        js = json.loads(r.stdout.decode('utf-8')) if r.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired, ValueError):
        js = None
    check('the browser parser ran', js is not None, r.stderr.decode('utf-8', 'replace')[:300] if js is None else '')
    if js:
        failed = [x['name'] for x in js['results'] if not x['ok']]
        check(f'the browser reads the same cases identically ({len(js["results"])} checks)', not failed, failed[:5])
        spec_js = js['spec']
        norm = {k: {'form': v.get('form'), 'required': v.get('required'), 'optional': v.get('optional')} for k, v in mk_spec['markers'].items()}
        norm_js = {k: {'form': v.get('form'), 'required': v.get('required'), 'optional': v.get('optional')} for k, v in spec_js['markers'].items()}
        check('markers.js carries an identical copy of markers.json (markers, stages, limits)',
              norm == norm_js and spec_js['stages'] == mk_spec['stages'] and spec_js['limits'] == mk_spec['limits'])
    check('Python limits: 8 options, questions cut at 200, options at 60', am.LIMITS == {'options': 8, 'questionChars': 200, 'optionChars': 60, 'whenChars': 200})

    skill = read(SKILL / 'SKILL.md')
    listed = set(re.findall(r'\[\[aura:([a-z][a-z-]*)', skill.split('## Asking questions')[0].split('**The markers**')[1]))
    check('SKILL.md inventory lists every marker in markers.json, and only those', listed == set(mk_spec['markers']), listed ^ set(mk_spec['markers']))
    names = set()
    for d in DOCS:
        names |= set(re.findall(r'\[\[aura:([a-z][a-z-]*)', read(d)))
    names.discard('name')                # the syntax description writes [[aura:name]] as a placeholder
    check('no document mentions a marker markers.json does not define', names <= set(mk_spec['markers']), names - set(mk_spec['markers']))
    badex = []
    for d in DOCS:
        for ln in read(d).splitlines():
            t = ln.strip()
            if re.fullmatch(r'\[\[aura:[^\]]*\]\]', t) and '…' not in t and '...' not in t and '<' not in t and not am.scan(t)['markers']:
                badex.append((d.name, t[:80]))
    check('every whole-line marker example in the docs is a valid marker', not badex, badex[:3])
    check('hint grammar is order-free like every other marker (C-05)', am.has('[[aura:hint text="x" slide=2]]', 'hint'))

    print('\n[instructions: server side]')
    fs, tmp = load_server()
    # parse_doubts reads through the shared grammar: bare values, any order, when/depends
    plan = {'slides': [{'id': 's1'}, {'id': 's2'}, {'id': 's3'}]}
    d = fs.parse_doubts('[[aura:choice id=q1 slide=s3 question="Which?" options="A|B" default=B]]\n'
                        '[[aura:choice question="Words?" id="q2" when="q1=2" depends="q1" options="x|y" scope="deck"]]\n'
                        'see [[aura:choice id="q3" question="x" options="a|b"]] here', plan, 4)
    check('planning doubts parse bare values and any attribute order', len(d) == 2 and d[0]['slide'] == 's3' and d[0]['default'] == ['B'])
    check('a doubt keeps when / depends', d[1]['when'] == 'q1=2' and d[1]['depends'] == ['q1'] and d[1]['scope'] == 'deck')
    rn = fs.Runner()
    run_ = fs.Run(None, deck_id=None, kind='build-slide')
    rn.run = run_
    rn._line(run_, json.dumps({'type': 'result', 'result': 'Ready when you are [[aura:ask]]\n[[aura:hint slide=2]]', 'session_id': 's-1'}))
    kinds = [e['kind'] for e in rn.events]
    check('a malformed marker becomes a visible event', kinds.count('marker-problem') == 2, kinds)
    ev = [e for e in rn.events if e['kind'] == 'marker-problem']
    check('the event says it in plain words', ev and 'could not use it' in ev[0]['text'] and ev[0]['code'] == 'not-alone', ev[:1])
    check('an ask inside a sentence is not a wait', run_.asked is False and rn.waiting is False)
    logtxt = ''
    try: logtxt = read(fs.LOGS / 'form_server.log')
    except OSError: pass
    check('the malformed marker is also in the log', 'marker could not be read' in logtxt)
    rn._line(run_, json.dumps({'type': 'assistant', 'message': {'content': [{'type': 'text', 'text': 'Ready when you are [[aura:ask]]'}]}}))
    check('the same bad line is reported once per run', len([e for e in rn.events if e['kind'] == 'marker-problem']) == 2)
    run2 = fs.Run(None, kind='build-slide'); rn.run = run2
    rn._line(run2, json.dumps({'type': 'result', 'result': 'Question\n[[aura:ask]]', 'session_id': 's-1'}))
    check('a whole-line ask is a wait', run2.asked is True and rn.waiting is True)
    run3 = fs.Run(None, kind='build-slide'); rn.run = run3
    rn._line(run3, json.dumps({'type': 'result', 'result': 'Done\n[[aura:built slide="s2"]]\n[[aura:done path=".aura/decks/abc/My deck.html"]]', 'session_id': 's-1'}))
    check('the done path is read through the grammar', run3.deck_done == '.aura/decks/abc/My deck.html')

    # the system prompt: planning never asks, everything else may (C-09, C-14, L-09)
    pp, pb = fs.web_prompt('plan'), fs.web_prompt('build-slide')
    check('planning prompt forbids [[aura:ask]] and points to doubts', 'never write [[aura:ask]]' in pp and 'doubt' in pp and fs.web_prompt('replan') == pp)
    check('other runs are told how to ask', '[[aura:ask]] as the last line' in pb and 'never write [[aura:ask]]' not in pb)
    check('the prompt names the precedence rule', 'follow the message' in pp and 'follow the message' in pb)
    check('"ask one clear question" is gone (the limits live in SKILL.md)', 'one clear question' not in pp + pb)

    # the planning dead end: a plan run that ends with a question and no file gives a readable error
    from types import SimpleNamespace as NS
    rec = fs.new_deck(flow='plan')
    did = rec['id']
    r4 = fs.Run(None, deck_id=did, kind='plan'); r4.asked = True
    r4.texts = ['Before I plan: who is the audience for this talk?\n[[aura:ask]]']
    fs.update_deck(did, planState='planning')
    fs.ingest_plan(r4, fs.load_deck(did))
    after = fs.load_deck(did)
    check('an ask-and-no-plan planning run ends with a readable error, not a bare one',
          after['planState'] == 'error' and 'stopped to ask a question' in (after.get('planError') or '') and 'who is the audience' in after['planError'], after.get('planError'))
    p = fs.plan_message(fs.load_deck(did)); q = fs.replan_message(fs.load_deck(did), {'slides': [], 'answers': [{'slide': None, 'question': 'Who?', 'answer': 'Examiners', 'other': ''}], 'suggest': [], 'deck': True})
    check('answers to a plan that never got written ask for the whole plan', '[plan-mode]' in q and 'does not exist yet' in q and 'Examiners' in q)
    # a doubt Claude wrote badly is said on the plan page (lastChange.notices), the good one still becomes a card
    rec5 = fs.new_deck(flow='plan')
    (fs.work_dir(rec5['id'])).mkdir(parents=True, exist_ok=True)
    (fs.work_dir(rec5['id']) / 'plan.json').write_text(json.dumps({'title': 'T', 'slides': [{'id': 's1', 'title': 'One', 'point': 'p', 'bullets': ['a b', 'c d'], 'visual': {'main': 'text'}}]}), encoding='utf-8')
    r5 = fs.Run(None, deck_id=rec5['id'], kind='plan')
    r5.texts = ['Plan is ready.\n[[aura:choice id="q1" scope="deck" question="Who?" options="A|B" default="A"]]\nsee [[aura:choice id="q2" question="x" options="a|b"]] here\n[[aura:plan path="x"]]']
    fs.update_deck(rec5['id'], planState='planning')
    fs.ingest_plan(r5, fs.load_deck(rec5['id']))
    pl5 = fs.load_deck(rec5['id'])['plan']
    check('a badly written doubt is reported to the plan page, the good one is kept',
          len(pl5['doubts']) == 1 and pl5['doubts'][0]['question'] == 'Who?' and len(pl5['lastChange']['notices']) == 1 and 'could not use it' in pl5['lastChange']['notices'][0], pl5.get('lastChange'))

    print('\n[instructions: plan.json schema and ownership]')
    old = {'version': 1, 'title': 'T', 'minutes': 5, 'seq': 3, 'lastChange': {'seq': 3}, 'repairs': ['x'],
           'doubts': [{'id': 'd1-q1', 'key': 'q1', 'question': 'Q?', 'options': ['a', 'b'], 'answer': 'a'}],
           'slides': [{'id': 's1', 'title': 'One', 'point': 'p', 'bullets': ['a b', 'c d'], 'visual': {'main': 'text'}, 'built': True, 'builtAt': 'now', 'editedAt': 5.0},
                      {'id': 's2', 'title': 'Two', 'point': 'p', 'bullets': ['a', 'b'], 'visual': {'main': 'text'}, 'status': 'replanning', 'editedAt': 7.0}]}
    view = fs.claude_view(old)
    check('Claude\'s copy has no doubts / seq / lastChange / repairs', not any(k in view for k in fs.PLAN_APP_TOP))
    check('Claude\'s copy has no builtAt / status / editedAt, but shows which slides are built',
          not any(k in s for s in view['slides'] for k in fs.PLAN_HIDDEN_SLIDE) and view['slides'][0].get('built') is True)
    # Claude "tidies" the file: removes what it cannot see (nothing) and what it can (built), writes app fields, a words estimate
    raw = json.loads(json.dumps(view))
    raw['slides'][0].pop('built', None)
    raw['slides'][1].update(status='clear', editedAt=1.0, words=999, built=True, mystery='x')
    raw.update(doubts=[{'question': 'sneaky'}], seq=99, version=7, extra='y')
    new, problems, repairs = fs.normalize_plan(raw, old, strict=False)
    s1, s2 = new['slides']
    check('a built flag Claude removed is restored', s1.get('built') is True and s1.get('builtAt') == 'now' and s1.get('editedAt') == 5.0)
    check('status and editedAt Claude wrote are ignored (the app\'s values stay)', s2.get('status') == 'replanning' and s2.get('editedAt') == 7.0 and not s2.get('built'))
    check('words is derived, whatever the file says', s2['words'] == 3 and new['version'] == 1)
    check('doubts and seq come from the app, never from the file', new['doubts'] == old['doubts'] and new['seq'] == 3 and new['repairs'] == ['x'])
    notes = fs.plan_drift(raw, old)
    check('every ignored field is reported (doubts, seq, extra, status, editedAt, built, mystery, removed built)',
          all(any(t in n for n in notes) for t in ('"doubts"', '"seq"', 'unknown field "extra"', '"status"', '"editedAt"', '"built"', 'unknown field "mystery"')) and
          any('was removed, restored' in n for n in notes), notes)
    check('drift in a clean file is empty', fs.plan_drift(view, old) == [])
    big = {'title': 'T', 'slides': [{'id': f's{i}', 'title': f'S{i}', 'bullets': ['a', 'b'], 'visual': {'main': 'text'}} for i in range(45)]}
    n40, _, rp = fs.normalize_plan(big, {}, strict=False)
    check('a plan longer than 40 slides is cut and the cut is noted', len(n40['slides']) == 40 and any('only the first 40' in r for r in rp), rp)
    odd = {'slides': [{'id': 'Bad Id!', 'title': 'x', 'visual': {'main': 'text'}}, {'id': 's1', 'title': 'y', 'visual': {'main': 'text'}}, {'id': 's1', 'title': 'z', 'visual': {'main': 'text'}}]}
    nn, _, rp = fs.normalize_plan(odd, {}, strict=False)
    check('an unusable or duplicate slide id is renamed and noted', len(set(s['id'] for s in nn['slides'])) == 3 and len(rp) == 3, rp)
    pl = (SKILL / 'planning.md').read_text(encoding='utf-8')
    fields = set(fs.PLAN_CLAUDE_TOP + fs.PLAN_APP_TOP + fs.PLAN_CLAUDE_SLIDE + fs.PLAN_DERIVED_SLIDE + fs.PLAN_APP_SLIDE)
    named = lambda f: f'`{f}`' in pl or f'`slides[].{f}`' in pl
    check('planning.md documents every plan.json field the app knows', all(named(f) for f in fields), [f for f in fields if not named(f)])
    check('planning.md documents the status vocabulary and the limits', all(s in pl for s in fs.SLIDE_STATUSES) and '**40**' in pl and '{0,23}' in pl)
    wf = fs.write_plan(rec, old)
    onfile = json.loads(read(fs.work_dir(did) / 'plan.json'))
    check('plan.json on disk is Claude\'s view (no app bookkeeping)', not any(k in onfile for k in fs.PLAN_APP_TOP) and not any(k in s for s in onfile['slides'] for k in fs.PLAN_HIDDEN_SLIDE))
    check('the record still holds everything', fs.load_deck(did)['plan']['doubts'] == old['doubts'] and fs.load_deck(did)['plan']['slides'][1]['status'] == 'replanning')

    print('\n[instructions: answer header, step card]')
    fs.RUNNER = NS(waiting=True, deck_id=did, running=False)
    fs.update_deck(did, buildTarget='s2')
    check('a reply while slide 2 is being built is tagged [slide 2], not the last built slide', fs.reply_slide(did, 1) == 2)
    fs.RUNNER = NS(waiting=False, deck_id=did, running=False)
    check('outside a waiting build step the page\'s slide is kept', fs.reply_slide(did, 1) == 1)
    fs.ROOT = REPO / 'workspace'
    msg = fs.build_message(fs.load_deck(did), fs.plan_slides(fs.load_deck(did))[1], 2, 2)
    check('the build message carries the step card from building.md', 'STEP CARD' in msg and 'ASK FIRST' in msg and 'slide="2"' in msg and '[[aura:built slide="s2"]]' in msg)
    check('the build message and CLAUDE.md agree on where the deck is packed', '(never into "4 - Your slides")' not in msg and f'.aura/decks/{did}/' in msg and '[deck-folder' in read(CLAUDE_MD))
    bm = read(SKILL / 'building.md')
    check('the step card is one block in building.md', bm.count('<!-- step-card -->') == 1 and bm.count('<!-- /step-card -->') == 1)
    for need in ('closing slide is designed', 'title slide carries every name', 'BUILD ONLY THIS SLIDE', 'wooden base'):
        check(f'the step card repeats a rule both real runs skipped: {need}', need in msg)

    print('\n[instructions: one statement of each fact]')
    gen, bb = rules['generic'], rules['looks']['bold-blue']
    cm = read(CLAUDE_MD)
    wb = lambda w: f"title {w['title']} · section {w['section']} · content {w['content']} · quote {w['quote']} · closing {w['closing']} · references {w['references']}"
    check('CLAUDE.md numbers table: generic word budgets equal hard-rules.json', wb(gen['wordBudget']) in cm)
    check('CLAUDE.md numbers table: Bold Blue word budgets equal hard-rules.json', wb(bb['wordBudget']) in cm)
    check('CLAUDE.md numbers table: document-mode budgets', f"| {gen['wordBudget']['document']} | {bb['wordBudget']['document']} |" in cm)
    check('CLAUDE.md numbers table: type scales', ' · '.join(map(str, gen['typeScale'][:6])) in cm and ' · '.join(map(str, bb['typeScale'])) in cm)
    check('CLAUDE.md numbers table: floors and typeface limits',
          f"| {rules['minFontPx']} px |" in cm and f"| {bb['minFontPx']} px, and only" in cm and f"| {gen['maxTypefaces']} | {bb['maxTypefaces']} (Poppins" in cm)
    ls = (SKILL / 'looks' / 'bold-blue' / 'LOOK.md').read_text(encoding='utf-8')
    check('LOOK.md lists every Bold Blue word budget', all(f'{k} {v}' in ls for k, v in bb['wordBudget'].items() if k != 'document') and f"{bb['wordBudget']['document']}" in ls)
    check('LOOK.md type scale equals hard-rules.json', ' / '.join(map(str, bb['typeScale'])) in ls.replace('**', ''))
    dc = read(ENGINE / 'tools' / 'deck_check.js')
    check('deck_check.js reads its generic numbers from hard-rules.json', 'RULES.generic' in dc and '266' not in dc)
    check('the server word cap is the checker\'s number (Bold Blue and generic)', fs.word_cap('Bold Blue') == bb['wordBudget']['content'] and fs.word_cap('Pink Punch') == gen['wordBudget']['content'])
    check('words are counted the same way on both sides (letters only)', fs.count_words('Moisture control saved 34% water', '2025') == 4)
    stale = {'1–4 typefaces': 'typeface count', 'the rulebook file says 2': 'rulebook claim', 'Smallest text is 26 px': 'old size rule',
             'at most 3 per message while planning': 'old question limit', 'never ask more than 3': 'old question limit',
             'about 60': 'old word budget', 'word cap 40': 'duplicated budget', '`[[aura:done path="4 - Your slides': 'old done path',
             'Only the packer writes here': 'old folder rule', 'type scale 20/28/36/48/64/112/176 and': 'duplicated scale'}
    found = [(w, d.name) for d in DOCS for k, w in stale.items() if k in read(d)]
    check('no document keeps a superseded statement', not found, found)
    sizes = [d.name for d in DOCS if d.name not in ('CLAUDE.md', 'enforcement.md') and re.search(r'(?:under|below|smaller than|minimum|floor)[^.\n]{0,20}\b26\s?px', read(d))]
    check('the 26 px floor is written down once (CLAUDE.md), not in the other documents', not sizes, sizes)
    check('"plan.md" has one meaning: Claude\'s own notes', 'Write the plan to `.aura/temp/plan.md`' not in skill and 'your own working notes' in cm)
    check('SKILL.md has one question-limit table; planning/building/editing point to it', '## Asking questions (the one place the limits live)' in skill and 'SKILL.md "Asking questions"' in read(SKILL / 'editing.md'))
    print('\n[instructions: batch C (self-contained steps, hand-off, 3D cheat sheet, PowerPoint)]')
    bld, tk = read(SKILL / 'building.md'), read(SKILL / 'deck-toolkit.md')
    check('building.md: a step is self-contained and a fresh conversation (hand-off / recovery) is explained',
          'Every build step is self-contained' in bld and '[context-handoff]' in bld and '[context-recovery]' in bld and 'same conversation as the planning' not in bld)
    check('deck-toolkit.md has the BB3D cheat sheet (and tells Claude not to read studio3d.js)', 'Bold Blue 3D cheat sheet' in tk and 'BB3D.studio(ctx, opts)' in tk and 'Do not open it' in tk)
    check('CLAUDE.md / SKILL.md: the PowerPoint copy is a button on the finalize screen, not something Finalize makes by itself',
          'finalize screen' in cm and 'button for the' in skill and 'Finalize makes them' not in skill)


    print('\n[instructions: enforcement table]')
    enf = read(SKILL / 'enforcement.md')
    toks = {}
    for m in re.finditer(r'<!-- checks: ([a-z_]+\.js) = (.*?) -->', enf):
        toks[m.group(1)] = [t.strip() for t in m.group(2).split('|')]
    for fn, ts in toks.items():
        src = read(ENGINE / ('tools' if fn == 'deck_check.js' else 'rules') / fn)
        if fn == 'deck_check.js': src += read(ENGINE / 'tools' / 'lib' / 'claims.js') + read(ENGINE / 'tools' / 'lib' / 'blender_check.js')
        missing = [t for t in ts if t not in src]
        check(f'every message named in enforcement.md exists in {fn}', not missing, missing)
    rows = re.findall(r'^\| .*\(`([^`]+)`\)', enf, re.M)
    check('every check in the deck_check table names its message', len(rows) >= 20 and all(any(r in t or t in r for t in toks['deck_check.js']) for r in rows), [r for r in rows if not any(r in t or t in r for t in toks['deck_check.js'])])


if __name__ == '__main__':
    results = []

    def check(name, cond, info=''):
        results.append(bool(cond))
        print(('  PASS ' if cond else '  FAIL ') + name + ('' if cond else f'   <- {info}'))
    run(check)
    print(f'\n{sum(results)}/{len(results)} passed')
    sys.exit(0 if all(results) else 1)
