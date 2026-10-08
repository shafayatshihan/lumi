"""Developer-only tests for FIXLOG "Batch E" (deck output quality, enforcement, lessons from the real runs).
Called from test_server.py with the test module as `T`; also runnable alone:  python tools/form-dev/test_batch_e.py [--no-browser]
(alone it needs a sandbox that has an .aura/engine junction: pass --sandbox X:\\aura-dev-batche).
  B-01 stop hook checks only what this run wrote   B-02/B-04 decks are rendered over http, failures are loud
  B-05/L-05 every number traceable                 L-03/L-04 contrast on a fixed frame, token >= 4.5:1
  L-07 banned props, L-15 empty column / .em / notes / title fields, C-11 steps cap and logos
  L-08 stages from tools, L-02 blocked commands recognised, L-01 pre-extraction, L-14 other slides hashed, D-02 browser notice"""
import contextlib, json, os, re, shutil, subprocess, sys, time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ENGINE = REPO / 'engine'
NODE = shutil.which('node.exe') or shutil.which('node')


def node(args, cwd, env=None, timeout=240):
    e = dict(os.environ); e.update(env or {})
    r = subprocess.run([NODE] + [str(a) for a in args], cwd=str(cwd), capture_output=True, timeout=timeout, env=e,
                       stdin=subprocess.DEVNULL, text=True, encoding='utf-8', errors='replace')
    return r.returncode, (r.stdout or '') + (r.stderr or '')


def lum(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    f = lambda v: v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])


def ratio(a, b):
    x, y = lum(a), lum(b)
    return (max(x, y) + 0.05) / (min(x, y) + 0.05)


def run(T=None, browser=True):
    if T is None:
        check = lambda name, ok, info='': print(('  PASS ' if ok else '  FAIL ') + name + ('' if ok else f'   <- {info}'))
        class T:    # standalone
            pass
        a = sys.argv
        sandbox = Path(a[a.index('--sandbox') + 1]) if '--sandbox' in a else Path(r'X:\aura-dev-batche')
        T.SANDBOX, T.REPO = sandbox, REPO
        T.check = check
        os.environ.setdefault('AURA_TEST_UNIT_ROOT', str(sandbox / 'unit'))
    check = T.check
    sandbox = Path(T.SANDBOX)
    sys.path.insert(0, str(ENGINE)); sys.path.insert(0, str(Path(__file__).parent))
    import form_server as fs
    import test_batch_c as C
    os.environ.setdefault('AURA_TEST_UNIT_ROOT', str(sandbox / 'unit'))
    print('\n[batch E: stages, blocked commands, pre-extraction, run file, other slides, tokens]')

    # ---- L-08: the stage comes from the tool Claude called
    d = fs.derive_stage
    check('L-08: deck_check = check, pack_deck = export, a write into the build folder = build, plan.json = plan, a Read = read',
          d('Bash', {'command': 'node .aura/engine/tools/deck_check.js .aura/temp/build/x'}) == 'check'
          and d('PowerShell', {'command': r'.aura\venv\Scripts\python.exe .aura\engine\tools\pack_deck.py .aura\temp\build\x --out y'}) == 'export'
          and d('Write', {'file_path': r'X:\p\.aura\temp\build\x\index.html'}) == 'build'
          and d('Edit', {'file_path': '.aura/decks/abc/plan.json'}) == 'plan' and d('Read', {'file_path': 'a.txt'}) == 'read'
          and d('Bash', {'command': 'echo hi'}) is None)
    with C.unit_root(fs, 'e-stage') as root:
        r = fs.Runner()
        r.deck_id = 'dk1'
        run_ = fs.Run(None, 'dk1', 'build-slide', {'n': 2}); run_.stage = 'build'
        def tool(name, **inp): return json.dumps({'type': 'assistant', 'message': {'content': [{'type': 'tool_use', 'id': 't' + str(time.time_ns()), 'name': name, 'input': inp}]}})
        r._line(run_, tool('Read', file_path='x.txt'))
        r._line(run_, tool('Bash', command='node .aura/engine/tools/deck_check.js .aura/temp/build/x'))
        r._line(run_, tool('Write', file_path='.aura/temp/build/x/index.html'))
        stages = [e['stage'] for e in r.events if e['kind'] == 'stage']
        check('L-08: a build step starts at "build", moves to "check" from the tool, and never goes backwards', stages == ['check'], stages)
        r._line(run_, tool('Bash', command='python pack_deck.py .aura/temp/build/x --out .aura/decks/dk1'))
        check('L-08: pack_deck moves the bar to export', [e['stage'] for e in r.events if e['kind'] == 'stage'] == ['check', 'export'])
        prun = fs.Run(None, 'dk1', 'plan', {})
        r._line(prun, tool('Read', file_path='a.txt')); r._line(prun, tool('Bash', command='node deck_check.js x')); r._line(prun, tool('Write', file_path='.aura/decks/dk1/plan.json'))
        ps = [e['stage'] for e in r.events if e['kind'] == 'stage'][2:]
        check('L-08: a planning run only shows read and plan, whatever tools it calls', ps == ['read', 'plan'], ps)

        # ---- L-02: a permission wall is recognised, counted, and said once
        def err(txt): return json.dumps({'type': 'user', 'message': {'content': [{'type': 'tool_result', 'tool_use_id': 'zz', 'is_error': True, 'content': txt}]}})
        walls = ['This command contains multiple operations and was blocked', 'Permission to use PowerShell has been denied.',
                 'Claude requested permissions to read from X:\\ but you have not granted it', "cannot read binary files (.docx)"]
        for w in walls: r._line(prun, err(w))
        blocked = [e for e in r.events if e['kind'] == 'tool-error' and e.get('code') == 'blocked']
        check('L-02: permission denials are recognised (code blocked) and a plain note is added after the third', len(blocked) == 4 and any(e['kind'] == 'status' and e.get('code') == 'blocked' for e in r.events), len(blocked))
        before = len(r.events); r._line(prun, err('ENOENT: no such file'));
        check('L-02: an ordinary error is not called a wall', r.events[-1].get('code') is None and len(r.events) == before + 1)
        env = fs.environment_line()
        check('L-02/L-01: every run is told which tools exist, that sources are extracted, and that a wall is policy',
              env.startswith('[environment]') and 'manifest.json' in env and 'policy' in env and 'helper agent' in env, env[:120])

        # ---- B-01: the run file the Stop hook reads
        fs.write_run_file(run_, {'id': 'dk1', 'flow': 'v05', 'build': 'x'})
        rf = json.loads((root / '.aura' / 'temp' / 'current-run.json').read_text(encoding='utf-8'))
        check('B-01: the run file names the deck, its work folder and the start time', rf['deckId'] == 'dk1' and rf['workDir'] == '.aura/decks/dk1' and rf['startedAt'] > 1e9, rf)
        fs.clear_run_file()
        check('B-01: it is removed when the run ends', not (root / '.aura' / 'temp' / 'current-run.json').exists())

        # ---- L-14: build ONLY this slide, hashed
        b = root / '.aura' / 'temp' / 'build' / 'x'; b.mkdir(parents=True)
        mk = lambda a, c: '<main class="deck"><section class="slide" data-title="A">%s</section>\n<section class="slide" data-title="B">%s</section></main>' % (a, c)
        (b / 'index.html').write_text(mk('<p>one</p>', '<p>two</p>'), encoding='utf-8')
        h1 = fs.slide_hashes('x')
        (b / 'index.html').write_text(mk('<p>one</p>', '<p>two!</p>'), encoding='utf-8')
        h2 = fs.slide_hashes('x')
        check('L-14: slide hashes tell which slide changed', len(h1) == 2 and h1[0] == h2[0] and h1[1] != h2[1])

        # ---- L-01: pre-extraction on upload, manifest, stale detection, forget
        # no deck record here, so this is the draft folder every upload lands in before the interview makes the deck
        files = fs.files_root(None) / 'Report'; files.mkdir(parents=True)
        (files / 'r.txt').write_text('Duct 200 x 40 mm. Mach 5 inlet.', encoding='utf-8')
        check('L-01: a new file is stale before extraction', stale_has(fs, 'Report/r.txt'))
        ok = fs.extract_sources(None, ['Report/r.txt'], timeout=120)
        man = fs.read_manifest().get('files', {})
        check('L-01: extract_sources writes the text and a manifest entry (kind, chars, text file, images, size, mtime)',
              ok and 'Report/r.txt' in man and man['Report/r.txt']['chars'] > 10 and Path(man['Report/r.txt']['text']).is_file(), man)
        check('L-01: an extracted file is no longer stale', not stale_has(fs, 'Report/r.txt'))
        (files / 'r.txt').write_text('Duct 200 x 40 mm. Mach 5 inlet. Changed.', encoding='utf-8')
        check('L-01: an edited file is stale again', stale_has(fs, 'Report/r.txt'))
        fs.ensure_extracted()
        check('L-01: ensure_extracted brings it up to date before a run', not stale_has(fs, 'Report/r.txt'))
        fs.forget_extracted('Report/r.txt')
        check('L-01: a removed upload is forgotten (text and manifest entry)', 'Report/r.txt' not in fs.read_manifest().get('files', {}) and not (fs.text_root(None) / 'Report' / 'r.txt.txt').exists())

    # ---- L-04: the accent token clears 4.5:1 on every canvas, and the numbers the checker reads exist
    css = (ENGINE / 'deck' / 'themes' / 'bold-blue.css').read_text(encoding='utf-8')
    tok = lambda n: re.search(r'--%s:\s*(#[0-9A-Fa-f]{6})' % n, css).group(1)
    accent = tok('accent')
    worst = min(ratio(accent, tok(n)) for n in ('bg', 'bg-stage', 'bg-blueprint', 'bg-title', 'bg-close', 'surface'))
    check('L-04: --accent clears 4.5:1 on every Bold Blue canvas (worst %.2f)' % worst, worst >= 4.5, accent)
    rules = json.loads((ENGINE / 'rules' / 'hard-rules.json').read_text(encoding='utf-8'))
    g = rules['generic']
    check('L-04: contrast 3-4:1 is an error now (thresholds in hard-rules.json)', g['contrastErrorBelow'] == 4 and g['contrastLargeErrorBelow'] == 3 and g['contrastWarnBelow'] == 4.5)

    # ---- B-05 unit: the numeral tracer, no browser
    code, out = node(['-e', r"""
const c = require(process.argv[1]);
const t = (s) => c.numerals(s).map(x => x.value + x.unit);
const corpus = { text: c.clean('Duct 200 x 40 mm. Pulsation 4-64 kHz. Mach 5. Re = 1,250,000.'), files: 1 };
const j = (slides, claims) => c.judge({ slides, corpus, prov: { claims, error: null }, brief: null });
const S = (text, notes, extra) => Object.assign({ n: 1, text, notes: notes || '', visibleIllustrative: false, figures: [] }, extra);
const out = {
  nums: t('Step 2 of 6, 200 x 40 mm, 95%, 4-64 kHz, 1,250,000 and 3.5'),
  inFiles: j([S('The duct is 200 x 40 mm and runs at Mach 5.')], []).errors.length,
  invented: j([S('Peak pressure 355 kPa')], []).errors.length,
  sourceLie: j([S('Peak 355 kPa')], [{ slide: 1, text: '355 kPa', kind: 'source', from: 'Report' }]).errors.length,
  figCropped: j([S('Scale 158 Pa to 355 kPa', 'read off figure 6', { figures: [{ src: 'fig6.png', figure: 'fig6.png', crop: [0, 0, 0.8, 1] }] })], [{ slide: 1, text: '158 Pa to 355 kPa', kind: 'figure', figure: 'fig6.png', readFrom: [0.9, 0.1, 0.08, 0.8] }]).errors.map(e => e.msg).join('|'),
  figVisible: j([S('Scale 158 Pa to 355 kPa', 'These were read off figure 6', { figures: [{ src: 'fig6.png', figure: 'fig6.png', crop: [0, 0, 1, 1] }] })], [{ slide: 1, text: '158 Pa to 355 kPa', kind: 'figure', figure: 'fig6.png', readFrom: [0.9, 0.1, 0.08, 0.8] }]).errors.length,
  figNoRegion: j([S('Scale 355 kPa', 'read off figure', { figures: [{ src: 'fig6.png', figure: 'fig6.png', crop: null }] })], [{ slide: 1, text: '355 kPa', kind: 'figure', figure: 'fig6.png' }]).errors.length,
  publishedOk: j([S('Mach 2.9 (Etheridge et al.)', 'Cited from Etheridge et al.')], [{ slide: 1, text: 'Mach 2.9', kind: 'published', cite: 'Etheridge et al. 2019' }]).errors.length,
  computedBad: j([S('31 kPa', 'calculated from the duct')], [{ slide: 1, text: '31 kPa', kind: 'computed', from: ['999'] }]).errors.length,
  illusNoMark: j([S('42 %', 'illustrative shape')], [{ slide: 1, text: '42 %', kind: 'illustrative' }]).errors.length,
  illusOk: j([S('42 % (illustrative)', 'illustrative shape', { visibleIllustrative: true })], [{ slide: 1, text: '42 %', kind: 'illustrative' }]).errors.length,
  title: c.titleFields({ people: { presenters: [{ name: 'Shafayat Islam' }], supervisor: 'Dr. Jane Rahman' }, basics: { date: '2026-10-05' } }, 'Shafayat Islam, 2026').length,
  // L-15 after the interview: the brief carries ONLY the identity fields the interview established.
  idNone: c.titleFields({ identity: [] }, 'A talk with nobody named on it').length,
  idMissing: c.titleFields({ identity: [{ label: 'presenter', value: 'Shafayat Islam' }, { label: 'supervisor', value: 'Dr. Jane Rahman' }] }, 'Shafayat Islam, 2026').length,
  idWins: c.titleFields({ identity: [], people: { supervisor: 'Dr. Jane Rahman' } }, 'nobody').length,
};
console.log(JSON.stringify(out));
""", str(ENGINE / 'tools' / 'lib' / 'claims.js')], REPO)
    try: u = json.loads(out.strip().splitlines()[-1])
    except Exception: u = {}
    check('B-05: bare counts 1-10 are not claims; units, decimals, ranges and thousands are', u.get('nums') == ['200', '40mm', '95%', '64kHz', '1250000', '3.5'], u.get('nums'))
    check('B-05: numbers that are in the files need nothing; an invented number is an error', u.get('inFiles') == 0 and u.get('invented') == 1, u)
    check('B-05: a "source" claim the extracted text does not contain is an error (the colour-bar case)', u.get('sourceLie', 0) >= 1, u)
    check('B-05: a figure-read number whose region is cropped away is an error; visible = ok; no region = error',
          'crops that region away' in u.get('figCropped', '') and u.get('figVisible') == 0 and u.get('figNoRegion') >= 1, u)
    check('B-05: published needs a cite shown + noted; computed needs traced inputs; illustrative needs the mark on the slide',
          u.get('publishedOk') == 0 and u.get('computedBad', 0) >= 1 and u.get('illusNoMark', 0) >= 1 and u.get('illusOk') == 0, u)
    check('L-15: title-slide fields from the brief (missing supervisor is reported)', u.get('title') == 1, u)
    check('L-15: brief.identity is the contract: an empty list demands nothing, a listed name still has to be on the slide',
          u.get('idNone') == 0 and u.get('idMissing') == 1 and u.get('idWins') == 0, u)

    if not browser:
        return
    # ---- everything below renders decks in Edge over http
    print('\n[batch E: hooks and checker in a real browser]')
    new = lambda slug: node([sandbox / '.aura' / 'engine' / 'tools' / 'new_deck.js', 'Batch E deck', '--theme', 'bold-blue', '--slug', slug, '--force'], sandbox)
    code, out = new('e-good')
    good = sandbox / '.aura' / 'temp' / 'build' / 'e-good' / 'index.html'
    check('scaffold: a Bold Blue deck with a 3D hero exists', code == 0 and good.is_file(), out[-200:])
    env = {'CLAUDE_PROJECT_DIR': str(sandbox)}
    rules_js = ENGINE / 'rules' / 'check_rules.js'

    # B-02: over http, 3D is really rendered, and it says so
    code, out = node([rules_js, good], sandbox, env)
    check('B-02: check_rules renders over http and reports the 3D scenes it saw drawn', code == 0 and re.search(r'rendered over http, 1 of 1 3D scene\(s\) drawn', out) is not None, out[-250:])
    code, out = node([rules_js, good], sandbox, {**env, 'AURA_TEST_NO_BROWSER': '1'})
    check('B-02: if the browser cannot start, the checker fails loudly (exit 3 manual) and says why', code == 3 and 'could not be started' in out, (code, out[-200:]))
    code, out = node([rules_js, '--hook'], sandbox, {**env, 'AURA_TEST_NO_BROWSER': '1'}, ) if False else (None, '')
    hook_in = json.dumps({'tool_input': {'file_path': str(good)}})
    r = subprocess.run([NODE, str(rules_js), '--hook'], cwd=str(sandbox), input=hook_in, capture_output=True, text=True, env={**os.environ, **env, 'AURA_TEST_NO_BROWSER': '1'}, timeout=120)
    check('B-02: as a PostToolUse hook an unrenderable deck BLOCKS (exit 2), it is never a silent pass', r.returncode == 2 and 'could not be started' in (r.stdout + r.stderr), (r.returncode, r.stderr[-200:]))
    # a 3D scene that fails to start must block
    broken = sandbox / '.aura' / 'temp' / 'build' / 'e-broken'
    shutil.rmtree(broken, ignore_errors=True); shutil.copytree(good.parent, broken)
    h = (broken / 'index.html').read_text(encoding='utf-8').replace("const S = BB3D.studio(", "throw new Error('boom'); const S = BB3D.studio(", 1)
    (broken / 'index.html').write_text(h, encoding='utf-8')
    code, out = node([rules_js, broken / 'index.html'], sandbox, env)
    check('B-02: a 3D scene that falls back is reported (data-fallback), not passed', code == 1 and '3D scene did not start' in out, (code, out[-250:]))

    # B-01: the Stop hook checks exactly what this run wrote
    temp = sandbox / '.aura' / 'temp'
    runf = temp / 'current-run.json'
    stop = lambda: subprocess.run([NODE, str(rules_js), '--stop'], cwd=str(sandbox), input='{}', capture_output=True, text=True, env={**os.environ, **env}, timeout=300)
    tiny = '<!doctype html><meta charset="utf-8"><main class="deck"><section class="slide" data-kind="content"><p style="font-size:12px">tiny words here</p></section></main>'
    slides_dir = sandbox / '4 - Your slides'; (slides_dir / 'Older versions').mkdir(parents=True, exist_ok=True)
    stale = slides_dir / 'old-unrelated.html'; stale.write_text(tiny, encoding='utf-8')
    old_t = time.time() - 86400 * 20; os.utime(stale, (old_t, old_t))
    older = slides_dir / 'Older versions' / 'x.html'; older.write_text(tiny, encoding='utf-8')
    runf.write_text(json.dumps({'deckId': 'zz', 'workDir': None, 'startedAt': time.time(), 'kind': 'build-slide'}), encoding='utf-8')
    for p in (temp / 'build').glob('*'):
        if p.is_dir(): os.utime(p / 'index.html', (old_t, old_t))
    t0 = time.time(); r = stop(); dt = time.time() - t0
    check('B-01/L-13: a run that wrote nothing checks nothing (an old bad deck and Older versions are not touched; no browser started)', r.returncode == 0 and dt < 5, (r.returncode, round(dt, 1), r.stderr[-200:]))
    runf.unlink()
    fresh = slides_dir / 'fresh.html'; fresh.write_text(tiny, encoding='utf-8')
    r = stop()
    check('B-01: with no run file (a turn that is not one of our runs) nothing is checked even if a fresh bad file exists', r.returncode == 0, r.stderr[-200:])
    runf.write_text(json.dumps({'deckId': 'zz', 'workDir': None, 'startedAt': time.time() - 60, 'kind': 'build-slide'}), encoding='utf-8')
    r = stop()
    check('B-04: with a run file, the file written in this run gets the FULL deck check and a failure blocks (exit 2)', r.returncode == 2 and 'LUMI DECK CHECK FAILED' in r.stderr and 'fresh.html' in r.stderr and 'old-unrelated' not in r.stderr, r.stderr[-300:])
    runf.unlink(missing_ok=True); fresh.unlink(); stale.unlink(); older.unlink()

    # the deliberately bad deck: every NEW rule must fire
    bad = sandbox / '.aura' / 'temp' / 'build' / 'e-bad'
    shutil.rmtree(bad, ignore_errors=True); shutil.copytree(good.parent, bad)
    png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    slide = f'''
  <section class="slide bb-stage-bg" data-kind="content" data-minutes="1" data-title="Results">
    <div class="safe"><div class="bb-main"><div class="bb-l w7">
      <p class="kicker">Results</p>
      <h2 class="headline" data-edit="s2-1">The <span class="em">pulse</span> is <span class="em">strong</span></h2>
      <p class="lede" style="color:#9a9a9a" data-edit="s2-2">Pressure peaks at 355 kPa and efficiency is 42 % in the cavity.</p>
      <p class="lede" data-edit="s2-3">Flow reaches Mach 2.9 in a duct 200 x 40 mm, 31 kPa.</p>
      <ol class="bb-steps"><li>a</li><li>b</li><li>c</li><li>d</li><li>e</li><li>f</li></ol></div><div class="bb-r w5"></div></div>
      <img class="bb-logo" alt="" style="position:absolute;left:1500px;top:100px;width:600px;height:400px" src="{png}">
      <img data-figure="fig6.png" data-crop="0,0,0.8,1" alt="" style="width:300px;height:200px" src="{png}"></div>
    <aside class="notes" data-aura-notes><p>Too short to speak from.</p></aside>
  </section>
'''
    h = (bad / 'index.html').read_text(encoding='utf-8')
    h = h.replace('  <!-- paste archetype slides here', slide + '\n  <!-- paste archetype slides here', 1)
    h = h.replace('const g = new THREE.Group();', 'const g = new THREE.Group(); const plinth = new THREE.Mesh(new THREE.BoxGeometry(3, .4, 3), M.wood); g.add(plinth);', 1)
    (bad / 'index.html').write_text(h, encoding='utf-8')
    (bad / 'provenance.json').write_text(json.dumps({'claims': [
        {'slide': 2, 'text': '158 Pa to 355 kPa', 'kind': 'figure', 'figure': 'fig6.png', 'readFrom': [0.9, 0.1, 0.08, 0.8]},
        {'slide': 2, 'text': 'Mach 2.9', 'kind': 'published'}, {'slide': 2, 'text': '31 kPa', 'kind': 'computed', 'from': ['999']},
        {'slide': 2, 'text': '42 %', 'kind': 'illustrative'}]}), encoding='utf-8')
    (sandbox / '.aura' / 'brief').mkdir(parents=True, exist_ok=True)
    brief_f = sandbox / '.aura' / 'brief' / 'brief.json'
    keep = brief_f.read_bytes() if brief_f.exists() else None
    brief_f.write_text(json.dumps({'basics': {'event': 'Thesis defence', 'date': '2026-10-05'}, 'people': {'presenters': [{'name': 'Shafayat Islam'}], 'supervisor': 'Dr. Jane Rahman'}}), encoding='utf-8')
    code, out = node([ENGINE / 'tools' / 'deck_check.js', bad, '--no-shots', '--stills'], sandbox, env)
    wants = {'L-07 banned props': 'default prop ("plinth"', 'L-15 empty half-column': 'half-column', 'L-15 two .em in a headline': 'accent phrases',
             'L-15 speaker notes length': 'speaker notes are', 'L-15 title-slide fields': 'title slide is missing', 'C-11 .bb-steps own cap': 'steps; a numbered',
             'L-04 contrast is an error + names the fix colour': 'Set the text colour to #', 'B-05 invented number': 'has no provenance entry',
             'B-05 figure-read number, evidence cropped away': 'crops that region away', 'B-05 figure-read must be in the notes': 'read off a figure: the speaker notes',
             'B-05 published without a citation': 'has no citation', 'B-05 computed from an untraced input': 'is computed from 999',
             'B-05 illustrative not marked on the slide': 'does not say so'}
    check('deck_check exits 1 on the bad deck and renders it over http', code == 1 and 'rendered: http' in out, (code, out[:200]))
    for name, tok_ in wants.items():
        check(f'new rule fires: {name}', tok_ in out, tok_)
    check('C-11: a big logo image (.bb-logo) is not counted as a second main visual', 'main visuals' not in out, [l for l in out.splitlines() if 'main visuals' in l])
    check('L-14: --stills tries candidate frames for the PDF page of the 3D slide', re.search(r'still slide 1: PDF still at t=', out) is not None, out[-300:])
    # contrast determinism (L-03): the same deck gives the same numbers every time
    rep = sandbox / '.aura' / 'temp' / 'check' / 'e-bad.json'
    a = json.loads(rep.read_text(encoding='utf-8'))['perSlide']
    node([ENGINE / 'tools' / 'deck_check.js', bad, '--no-shots'], sandbox, env)
    b2 = json.loads(rep.read_text(encoding='utf-8'))['perSlide']
    check('L-03: contrast numbers are identical between runs (frozen still frame, not a live frame)', [x['minContrast'] for x in a] == [x['minContrast'] for x in b2], ([x['minContrast'] for x in a], [x['minContrast'] for x in b2]))

    # B-05 in practice: a number that IS in the user's files passes with no provenance; the same deck with a stranger fails
    tdir = sandbox / '.aura' / 'temp' / 'text' / 'Report'; tdir.mkdir(parents=True, exist_ok=True)
    (tdir / 'r.docx.txt').write_text('# r.docx\nThe duct is 200 x 40 mm with a 31 kPa peak. Mach 2.9 helium case.', encoding='utf-8')
    code, out = node([ENGINE / 'tools' / 'deck_check.js', bad, '--no-shots'], sandbox, env)
    check('B-05: the numbers found in the extracted files (200 x 40 mm, 31 kPa, Mach 2.9) are traced automatically', 'number "40 mm"' not in out and 'number "31 kPa"' not in out and 'number "Mach 2.9"' not in out, [l for l in out.splitlines() if 'number "' in l][:4])
    check('B-05: the one number that is in no file (355 kPa) is still reported', '355 kPa' in out, [l for l in out.splitlines() if 'number' in l][:3])
    shutil.rmtree(tdir.parent, ignore_errors=True)
    if keep is not None: brief_f.write_bytes(keep)
    else: brief_f.unlink(missing_ok=True)

    # D-02: a browser that cannot run the live 3D says so; Edge does not
    code, out = node([Path(__file__).parent / 't_browser_notice.js', good], sandbox, {'ENGINE': str(ENGINE)})
    check('D-02: a Firefox-like browser gets the notice (Edge / Chrome path); Chromium gets none; a finalized deck (loops) gets none', code == 0 and 'firefox=1 chromium=0' in out, out[-300:])


def stale_has(fs, rel):
    return rel in fs.stale_sources()


if __name__ == '__main__':
    run(browser='--no-browser' not in sys.argv)
