"""Blender batch 1 (docs/blender-contract.md). Run by test_server.py (run(T) with the harness module); starts its own server
with AURA_BLENDER=tools/form-dev/fake_blender.py, so no real Blender is needed:
  - the locator order (env > bundled > system, highest version > PATH; 'none' = no Blender), health + /api/blender
  - visual.engine in plan.json (lenient repairs, strict problems), effective engines (auto: Bold Blue still 3D -> blender)
  - a Blender slide's build: the build message's Blender block, Claude writes scene.py, the SERVER previews it
  - preview -> change (resumes the slide's own conversation) -> re-preview -> no-edit change -> approve -> full still
  - an animation: full render at 720p -> final.mp4 + poster; cancel of a slow full render; GPU -> CPU fallback
  - failure reasons (script-error, no-scene), estimates (time + tokens), files route, restart reconcile"""
import json, os, re, shutil, subprocess, sys, tempfile, time
from pathlib import Path

FAKE_BLENDER = Path(__file__).resolve().parent / 'fake_blender.py'


def bl(T, P, sid=None):
    return T.jget(f'/api/decks/{P}/blender' + (f'/{sid}' if sid else ''))[1]


def wait_status(T, P, sid, want, timeout=40):
    t0 = time.time()
    while time.time() - t0 < timeout:
        v = bl(T, P, sid)
        if v.get('status') in want and not v.get('job'): return v
        time.sleep(0.15)
    return bl(T, P, sid)


def wait_job(T, P, sid, timeout=20):
    t0 = time.time()
    while time.time() - t0 < timeout:
        v = bl(T, P, sid)
        if (v.get('job') or {}).get('state') == 'running': return v
        time.sleep(0.05)
    return bl(T, P, sid)


def pin_cycles(T, P):
    """Make P a deck from before baking (batch 6 B.9: rec['bake'] is pinned at creation), so its animations take the
    per-frame Cycles path these checks were written for. That path still exists: old decks, and any scene with glass."""
    f = T.AURA / 'decks' / f'{P}.json'
    rec = json.loads(f.read_text(encoding='utf-8'))
    rec['bake'] = False
    f.write_text(json.dumps(rec, indent=2), encoding='utf-8')


def baked_suite(T, blog):
    """Batch 6 Part B on the fake blender: a NEW deck bakes an animated studio render. Routing (B.2), the draft bake as
    the preview, the final bake following by itself (B.5), the files (B.6), and glass staying on Cycles."""
    import test_batch_c
    check, jget, jpost = T.check, T.jget, T.jpost
    print('\n[batch 6 Part B: the baked path]')
    P = test_batch_c.make_plan_deck(T, 'Baked deck')
    rec = json.loads((T.AURA / 'decks' / f'{P}.json').read_text(encoding='utf-8'))
    check('B.9: a new deck is pinned to bake its animations', rec.get('bake') is True, rec.get('bake'))
    plan = json.loads(json.dumps(T.plan_of(P)['plan']))
    plan['slides'][0].update(title='Gear pair', visual={'main': '3d', 'companions': [], 'detail': 'detailed', 'motion': 'timed', 'phrase': 'gears'})
    T.save(P, plan)
    T.wait_plan_idle(P)
    pj = T.plan_of(P)
    sid = pj['plan']['slides'][0]['id']
    e = (pj.get('engines') or {}).get(sid, {})
    check('B.2: an animated 3D slide on a Blender look goes to Blender by itself (not chosen)',
          e.get('engine') == 'blender' and e.get('kind') == 'animation' and not e.get('chosen'), e)
    est = ((pj.get('blender') or {}).get('estimates') or {}).get(sid) or {}
    check('B.5: the plan page gets ONE baked time, not a resolution choice', est.get('baked') is True and est.get('720') == est.get('1080'), est)
    n0 = len(blog.read_text(encoding='utf-8').splitlines()) if blog.is_file() else 0
    jpost(f'/api/decks/{P}/build', {'mode': 'next'})
    T.wait_plan_idle(P)
    v = wait_status(T, P, sid, ('rendered', 'failed'), timeout=60)
    calls = [json.loads(x) for x in blog.read_text(encoding='utf-8').splitlines()[n0:]]
    bakes = [c[c.index('--bake') + 1] for c in calls if '--bake' in c]
    check('the draft bake ran, then the final bake by itself - no approval, no resolution', bakes[:2] == ['draft', 'final'], bakes)
    pv = (v.get('previews') or [{}])[-1]
    fin = v.get('final') or {}
    d = T.AURA / 'decks' / P / 'blender' / sid
    check('the preview is the draft bake, with its poster kept in previews/', pv.get('baked') and (d / 'previews' / f'preview-{pv.get("n")}.png').is_file()
          and (d / 'bake' / 'draft' / 'model.glb').is_file(), pv)
    check('B.6: the final is the model, kept with its manifest and poster', v.get('status') == 'rendered' and fin.get('baked')
          and all((d / 'bake' / 'final' / f).is_file() for f in ('model.glb', 'bake.json', 'poster.png')), (v.get('status'), fin))
    check('the view says baked, and estimates are baked', v.get('baked') is True and (v.get('estimates') or {}).get('baked') is True, v.get('estimates'))
    s_, h_, d_ = T.req('GET', fin.get('url', '/x'))
    check('the model is served as model/gltf-binary', s_ == 200 and h_.get('content-type', '').startswith('model/gltf-binary') and d_[:4] == b'glTF', (s_, h_.get('content-type')))
    s_, h_, d_ = T.req('GET', fin.get('posterUrl', '/x'))
    check('its poster is served', s_ == 200 and d_[:4] == b'\x89PNG', s_)
    j = jget(f'/api/decks/{P}/blender')[1]
    deck = T.AURA / 'temp' / 'build'
    metas = list(deck.glob(f'*/assets/blender/{sid}.json'))
    meta = json.loads(metas[0].read_text(encoding='utf-8')) if metas else {}
    check('embedded for the packer: <sid>.glb + poster + a baked meta', meta.get('baked') and (metas[0].parent / f'{sid}.glb').is_file()
          and (metas[0].parent / f'{sid}-poster.png').is_file() and not meta.get('draft'), meta.get('source'))
    sc = d / 'scene.py'
    sc.write_text(sc.read_text(encoding='utf-8') + "\nglass = L.mat('glass')\n", encoding='utf-8')
    v = bl(T, P, sid)
    check('B.2: a scene with glass leaves the baked path (per-frame Cycles)', v.get('baked') is False, v.get('baked'))


def bl_events(T, n0, P, sid=None):
    return [e for e in T.events_from(n0) if e.get('kind') == 'blender' and e.get('deck') == P and (sid is None or e.get('conv') == sid)]


def locator_suite(T):
    check = T.check
    sys.path.insert(0, str(T.REPO / 'engine'))
    sys.dont_write_bytecode = True
    import form_server as fs
    tmp = Path(tempfile.mkdtemp(prefix='lumi-bl-'))
    try:
        aura, pf, pf86, la, pathd = tmp / 'Lumi' / '.aura', tmp / 'PF', tmp / 'PF86', tmp / 'LA', tmp / 'bin'
        for p in (aura / 'blender' / 'blender.exe', pf / 'Blender Foundation' / 'Blender 4.2' / 'blender.exe',
                  pf / 'Blender Foundation' / 'Blender 5.2' / 'blender.exe', pf86 / 'Blender Foundation' / 'Blender 3.6' / 'blender.exe',
                  la / 'Programs' / 'Blender Foundation' / 'Blender 5.0' / 'blender.exe', pathd / 'blender.exe', tmp / 'mine.py'):
            p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(b'')
        env = {'ProgramFiles': str(pf), 'ProgramFiles(x86)': str(pf86), 'LOCALAPPDATA': str(la), 'PATH': str(pathd), 'PATHEXT': '.EXE'}
        cands = [(s, str(p)) for s, p in fs.blender_candidates(aura, env)]
        order = [s for s, _ in cands]
        check('locator: candidate order is bundled, system, then PATH', order.index('bundled') < order.index('system') < order.index('path'), order)
        sysc = [p for s, p in cands if s == 'system' and Path(p).is_file()]
        check('locator: system installs highest version first (5.2 before 4.2), then x86, then LOCALAPPDATA',
              ['Blender 5.2' in sysc[0], 'Blender 4.2' in sysc[1], 'Blender 3.6' in sysc[2], 'Blender 5.0' in sysc[3]] == [True] * 4, sysc)
        hit = fs.find_blender(aura=aura, env=env)
        check('locator: the bundled .aura\\blender\\blender.exe wins', hit and hit['source'] == 'bundled' and hit['exe'].endswith(r'blender\blender.exe'), hit)
        (aura / 'blender' / 'blender.exe').unlink()
        (aura / 'blender' / 'blender-5.2.2-windows-x64').mkdir()
        (aura / 'blender' / 'blender-5.2.2-windows-x64' / 'blender.exe').write_bytes(b'')
        hit = fs.find_blender(aura=aura, env=env)
        check('locator: a bundled zip that was not flattened (.aura\\blender\\<folder>\\blender.exe) is found too',
              hit and hit['source'] == 'bundled' and 'windows-x64' in hit['exe'], hit)
        shutil.rmtree(aura / 'blender')
        hit = fs.find_blender(aura=aura, env=env)
        check('locator: without the bundled one, the newest system install', hit and hit['source'] == 'system' and 'Blender 5.2' in hit['exe'], hit)
        shutil.rmtree(pf); shutil.rmtree(pf86); shutil.rmtree(la)
        hit = fs.find_blender(aura=aura, env=env)
        check('locator: then blender on PATH', hit and hit['source'] == 'path', hit)
        hit = fs.find_blender(aura=aura, env=dict(env, AURA_BLENDER=str(tmp / 'mine.py')))
        check('locator: AURA_BLENDER (dev/tests) comes first', hit and hit['source'] == 'env', hit)
        check('locator: AURA_BLENDER=none means no Blender at all (tests)', fs.find_blender(aura=aura, env=dict(env, AURA_BLENDER='none')) is None)
        check('locator: nothing anywhere -> None', fs.find_blender(aura=aura, env={'PATH': str(tmp / 'nowhere')}) is None)
        check('locator: a .py stand-in runs with this Python', fs.blender_argv('x.py')[0] == sys.executable and fs.blender_argv('b.exe') == ['b.exe'])
        # plan.json engine field (contract section 2)
        old = {'slides': []}
        mk = lambda e, main='3d': {'slides': [{'id': 's1', 'title': 'T', 'visual': {'main': main, 'motion': 'still', 'detail': 'simple', 'engine': e}}]}
        p, _, rep = fs.normalize_plan(mk('Studio'), old)
        check('plan: engine "Studio" (lenient) -> blender', p['slides'][0]['visual'].get('engine') == 'blender', p['slides'][0]['visual'])
        p, _, rep = fs.normalize_plan(mk('bogus'), old)
        check('plan: unknown engine (lenient) dropped and noted in repairs', 'engine' not in p['slides'][0]['visual'] and any('engine' in r for r in rep), rep)
        p, probs, _ = fs.normalize_plan(mk('bogus'), old, strict=True)
        check('plan: unknown engine (strict, the page) -> problem bad-engine', any(x.get('error') == 'bad-engine' for x in probs), probs)
        p, _, _ = fs.normalize_plan(mk('blender', 'chart'), old)
        check('plan: engine is dropped for a non-3D picture', 'engine' not in p['slides'][0]['visual'], p['slides'][0]['visual'])
        p, _, _ = fs.normalize_plan(mk(None), old)
        check('plan: no engine stays absent (auto)', 'engine' not in p['slides'][0]['visual'])
        rec = {'look': 'Bold Blue'}
        se = lambda vis, avail, look='Bold Blue': fs.slide_engine({'look': look}, {'visual': vis}, avail)
        check('engine: Bold Blue still 3D + Blender -> blender (auto)', se({'main': '3d', 'motion': 'still'}, True)['engine'] == 'blender')
        check('engine: Bold Blue moving 3D stays three.js unless chosen', se({'main': '3d', 'motion': 'timed'}, True)['engine'] == 'threejs'
              and se({'main': '3d', 'motion': 'timed', 'engine': 'blender'}, True) == {'engine': 'blender', 'kind': 'animation', 'note': None, 'chosen': True})
        check('engine: no Blender -> three.js (a chosen blender says blender-missing)', se({'main': '3d', 'motion': 'still'}, False)['engine'] == 'threejs'
              and se({'main': '3d', 'motion': 'still', 'engine': 'blender'}, False)['note'] == 'blender-missing')
        check('engine: other looks never auto-pick Blender', se({'main': '3d', 'motion': 'still'}, True, 'Pink Punch')['engine'] == 'threejs')
        check('engine: no 3D -> no engine', se({'main': 'chart'}, True)['engine'] is None)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


PROBE = Path(__file__).resolve().parent / 'blender_parta_probe.py'


def real_blender(T):
    """A real blender.exe to run the Part A probe with, or None. AURA_REAL_BLENDER overrides; otherwise a system
    install. The source and documentation checks run either way -- only the probe is skipped."""
    cand = []
    if os.environ.get('AURA_REAL_BLENDER'):
        cand.append(Path(os.environ['AURA_REAL_BLENDER']))
    for root in (os.environ.get('ProgramFiles'), os.environ.get('ProgramW6432')):
        if root:
            d = Path(root) / 'Blender Foundation'
            if d.is_dir():
                cand += sorted(d.glob('*/blender.exe'), reverse=True)
    return next((c for c in cand if c.is_file()), None)


def parta_suite(T):
    """Batch 6 Part A: cavity dirt + edge wear, L.inspect(), real part counts in the docs, lumi_mech."""
    check = T.check
    bl_dir = T.REPO / 'engine' / 'deck' / 'blender'
    bpy_src = (bl_dir / 'lumi_bpy.py').read_text(encoding='utf-8')
    mech = bl_dir / 'lumi_mech.py'
    mech_src = mech.read_text(encoding='utf-8') if mech.is_file() else ''
    skill = T.REPO / 'workspace' / '.claude' / 'skills' / 'aura-slide' / 'looks' / 'bold-blue'
    blender_md = (skill / 'BLENDER.md').read_text(encoding='utf-8')
    look_md = ((skill.parent / '_shared' / 'LOOK-BASE.md').read_text(encoding='utf-8')
               + (skill / 'LOOK.md').read_text(encoding='utf-8'))   # the base + the brand file are one authority

    # ---- item 1: the two geometry-driven node helpers
    check('item 1: _cavity_to uses an only-local AO node', '_cavity_to' in bpy_src
          and 'ShaderNodeAmbientOcclusion' in bpy_src and 'only_local' in bpy_src)
    check('item 1: _edgewear_to uses a Bevel node', '_edgewear_to' in bpy_src and 'ShaderNodeBevel' in bpy_src)
    check('item 1: the ray-traced sample counts are small and named', 'CAVITY_SAMPLES, WEAR_SAMPLES = 3, 3' in bpy_src)
    check('item 1: mat() takes cavity / wear / hero',
          'def mat(kind, color=None, name=None, cavity=None, wear=None, hero=False' in bpy_src)
    check('item 1: studio() takes the global cavity / wear dials', 'cavity=1.0, wear=1.0' in bpy_src)
    check('item 1: --preview skips both ray-traced nodes', "if not bpy.context.scene.get('lumi_preview'):" in bpy_src)
    check('item 1: cavity stays plumbed for the bake path', '--cavity' in bpy_src and "'lumi_cavity'" in bpy_src)
    pre = re.search(r'PRESETS = \{(.*?)\n\}', bpy_src, re.S).group(1)
    rows = [l for l in pre.splitlines() if l.strip().startswith("'")]
    check('item 1: all 14 presets carry a cavity and a wear value', len(rows) == 14, len(rows))
    check('item 1: glass and glow get neither', 'ior=1.5), None, 0.0, 0.0)' in bpy_src and 'emit=1.2), None, 0.0, 0.0)' in bpy_src)
    check('item 1: BLENDER.md section 7 holds MEASURED numbers, not an estimate',
          '89 s' in blender_md and '+9 %' in blender_md and 'shader-raytracing feature set' in blender_md)

    # ---- item 2: inspect
    check('item 2: --inspect is a real flag', "p.add_argument('--inspect', action='store_true')" in bpy_src)
    check('item 2: render() short-circuits to inspect and exits non-zero',
          "if s.get('lumi_inspect'):" in bpy_src and "sys.exit(0 if res['ok'] else 3)" in bpy_src)
    check('item 2: it prints ONE [lumi] inspect JSON line', "'[lumi] inspect '" in bpy_src)
    for code in ('no-camera', 'no-world', 'nothing-in-frame', 'hidden', 'clipped', 'inward-normals',
                 'no-material', 'flat-material', 'triangles', 'vanished'):
        check('item 2: finding "%s" exists and names a section 8 row' % code,
              ("'%s'" % code) in bpy_src and code in blender_md, code)
    check('item 2: section 8 has an "inspect says" column', '| symptom | inspect says | cause and fix |' in blender_md)
    check('item 2: section 6 step 1 is inspect, fix, then one --preview', 'Inspect, fix, then ONE `--preview`' in blender_md)
    check('item 2: section 1 documents the --inspect command', '-- --inspect' in blender_md)

    # ---- item 3: real counts (documentation only)
    check('item 3: BLENDER.md section 4 demands real counts and dimensions', 'Real counts and real dimensions' in blender_md)
    check('item 3: an unknown count is ASKED, never invented',
          'Never invent a plausible one' in blender_md and 'never invent a plausible one' in look_md)
    check('item 3: every moving part is its own object at its real pivot',
          'own object, at its real pivot' in blender_md and 'own object with its origin on its pivot' in look_md)
    check('item 3: LOOK.md carries the matching line', 'REAL counts and the REAL dimensions' in look_md)

    # ---- item 4: lumi_mech
    check('item 4: lumi_mech.py sits beside lumi_bpy.py', mech.is_file())
    for fn in ('gear', 'bevel_gear', 'spring', 'bolt', 'nut', 'blade_ring', 'shaft', 'bearing', 'oring'):
        check('item 4: %s() exists' % fn, ('def %s(' % fn) in mech_src, fn)
    check('item 4: a true involute profile, not a polygon',
          'def involute_profile' in mech_src and 'math.tan(a) - a' in mech_src)
    check('item 4: multi-body parts stay separate for the EXACT solver', 'LIST of separate objects' in mech_src)
    check('item 4: BLENDER.md section 4 points at it', 'lumi_mech' in blender_md)

    # ---- the probe: a real Blender confirms the geometry and the material gating
    exe = real_blender(T)
    if not exe:
        print('    (skipped: the Part A Blender probe needs a real Blender; set AURA_REAL_BLENDER)')
        return
    env = dict(os.environ, LUMI_BPY=str(bl_dir), PYTHONDONTWRITEBYTECODE='1')
    for case, want in (('parts', 0), ('materials', 0), ('inspect-ok', 0), ('inspect-fatal', 3)):
        r = subprocess.run([str(exe), '-b', '-P', str(PROBE), '--', '--case', case],
                           env=env, capture_output=True, text=True, timeout=1200)
        out = (r.stdout or '') + (r.stderr or '')
        bad = [l for l in out.splitlines() if l.startswith('[probe]') and ' FAIL' in l]
        check('probe %s: every check passed in a real Blender' % case,
              '[probe] RESULT ALL PASSED' in out and not bad, ('; '.join(bad) or out[-200:])[:220])
        check('probe %s: exit code %d' % (case, want), r.returncode == want, r.returncode)


def caps_suite(T):
    """Batch 6 section 0 item 8: 20 fps globally, pinned per deck at creation so existing decks are untouched."""
    check = T.check
    sys.path.insert(0, str(T.REPO / 'engine'))
    sys.dont_write_bytecode = True
    import form_server as fs
    fin = (T.REPO / 'engine' / 'tools' / 'finalize.js').read_text(encoding='utf-8')
    srv = (T.REPO / 'engine' / 'form_server.py').read_text(encoding='utf-8')
    check('20 fps is the finalize.js default', "parseInt(arg('--fps', '20'), 10) || 20" in fin)
    check('--light no longer drops the frame rate too', "LIGHT ? '24' : '30'" not in fin)
    check('a new deck pins fps 20 and its engine',
          fs.DECK_CAPS['fps'] == 20 and fs.DECK_CAPS['v'] == 1 and bool(fs.DECK_CAPS['engine']), fs.DECK_CAPS)
    check('a deck made before the pin keeps 30 / 24', fs.deck_fps({}) == 30 and fs.deck_fps({}, light=True) == 24)
    check('a pinned deck is 20 either way', fs.deck_fps({'caps': dict(fs.DECK_CAPS)}) == 20
          and fs.deck_fps({'caps': dict(fs.DECK_CAPS)}, light=True) == 20)
    check('a half-written pin falls back and never crashes',
          fs.deck_fps({'caps': {'v': 1}}) == 20 and fs.deck_fps({'caps': None}) == 30)
    check("a deck's own pin wins over today's default", fs.deck_fps({'caps': {'v': 1, 'fps': 30}}) == 30)
    check('caps is a stored deck field', 'caps' in fs.DECK_FIELDS)
    check('a deck adopted from disk is treated as pre-pin', 'caps=dict(DECK_CAPS_LEGACY)' in srv)
    check('the finalize command always passes the pinned fps', 'deck_fps(rec, light)' in srv)
    check('AURA_FINAL_FPS still overrides it', "os.environ.get('AURA_FINAL_FPS') or deck_fps" in srv)
    check('Blender loops are unaffected (always 20 fps)', fs.BLENDER_DEFAULTS['fps'] == 20)


def run(T):
    check, jget, jpost = T.check, T.jget, T.jpost
    print('\n[Blender batch 6 Part A: cavity + edge wear, inspect, real counts, lumi_mech]')
    parta_suite(T)
    print('\n[Blender batch 6: 20 fps global, pinned per deck]')
    caps_suite(T)
    print('\n[Blender batch 1: locator, plan engine field]')
    locator_suite(T)
    print('\n[Blender batch 1: render pipeline with the fake blender]')
    blog = T.AURA / 'temp' / 'fake-blender-calls.jsonl'
    srv = T.start_server(AURA_BLENDER=str(FAKE_BLENDER), AURA_FAKE_BLENDER_LOG=str(blog))
    try:
        s, h = jget('/api/health')
        c = next((x for x in h.get('checks') or [] if x['id'] == 'blender'), {})
        check('health: a non-blocking blender check with version and GPU', c.get('ok') and c.get('blocking') is False and '5.2.2' in c.get('detail', '')
              and 'OPTIX' in c.get('detail', ''), c)
        check('health: top-level blender info (source env, available)', (h.get('blender') or {}).get('available') and h['blender'].get('source') == 'env', h.get('blender'))
        s, b = jget('/api/blender')
        check('/api/blender: version, gpu, defaults (20 fps, 720p animations)', s == 200 and b.get('version', '').startswith('5.2.2') and b.get('gpu', '').startswith('OPTIX')
              and b.get('defaults', {}).get('fps') == 20 and b['defaults'].get('animHeight') == 720, b)
        import test_batch_c
        P = test_batch_c.make_plan_deck(T, 'Blender deck')
        pj = T.plan_of(P)
        plan = json.loads(json.dumps(pj['plan']))
        S = plan['slides']
        S[0].update(title='Pump studio', visual={'main': '3d', 'companions': [], 'detail': 'detailed', 'motion': 'still', 'phrase': 'a pump'})
        S[1].update(title='Spinning rotor bl-slow', visual={'main': '3d', 'companions': [], 'detail': 'detailed', 'motion': 'timed', 'phrase': 'a rotor', 'engine': 'blender'})
        S[2].update(title='Turbine bl-gpu', visual={'main': '3d', 'companions': [], 'detail': 'simple', 'motion': 'still', 'phrase': 'a turbine'})
        S[3].update(title='Broken bl-fail', visual={'main': '3d', 'companions': [], 'detail': 'simple', 'motion': 'still', 'phrase': 'x'})
        S[4].update(title='Nothing bl-noscene', visual={'main': '3d', 'companions': [], 'detail': 'simple', 'motion': 'still', 'phrase': 'x'})
        s, j = T.save(P, plan)
        T.wait_plan_idle(P)
        pin_cycles(T, P)
        pj = T.plan_of(P)
        eng = pj.get('engines') or {}
        ids = [x['id'] for x in pj['plan']['slides']]
        s1, s2, s3, s4, s5 = ids[:5]
        check('plan payload: effective engines (s1 auto blender still, s2 chosen blender animation) + blender.available',
              eng.get(s1, {}).get('engine') == 'blender' and eng[s1].get('kind') == 'still' and not eng[s1].get('chosen')
              and eng.get(s2, {}).get('engine') == 'blender' and eng[s2].get('kind') == 'animation' and eng[s2].get('chosen')
              and (pj.get('blender') or {}).get('available'), (eng, pj.get('blender')))
        check('plan.json (Claude\'s view) keeps visual.engine', json.loads((T.AURA / 'decks' / P / 'plan.json').read_text(encoding='utf-8'))['slides'][1]['visual'].get('engine') == 'blender')

        # ---- build slide 1: Claude writes the scene, the SERVER previews it
        n0 = jget('/api/claude/status')[1].get('eventCount', 0)
        s, j = jpost(f'/api/decks/{P}/build', {'mode': 'next'})
        T.wait_plan_idle(P)
        ev = T.events_from(n0)
        tools = [e.get('detail') or '' for e in ev if e['kind'] == 'tool']
        check('build: Claude was told the ONE plain check command (and used it)',
              any(t.startswith(f'blender -b -P .aura/decks/{P}/blender/{s1}/scene.py -- --out') for t in tools), tools)
        scene = T.AURA / 'decks' / P / 'blender' / s1 / 'scene.py'
        check('build: scene.py written in the deck work folder', scene.is_file(), scene)
        v = wait_status(T, P, s1, ('preview', 'failed'))
        pv = (v.get('previews') or [{}])[-1]
        check('preview 1 rendered by the server after the build step', v.get('status') == 'preview' and pv.get('n') == 1 and
              (T.SANDBOX / pv.get('png', 'x')).is_file(), v.get('status'))
        check('preview record: res 30, 16 spp, render_s, device, sceneHash, build tokens', pv.get('res') == 30 and pv.get('samples') == 16
              and pv.get('render_s', 0) > 0 and str(pv.get('device', '')).startswith('OPTIX') and pv.get('sceneHash')
              and pv.get('tokensRun', 0) > 0 and pv.get('est_s', 0) > 0 and pv.get('est_basis'), pv)
        calls = [json.loads(x) for x in blog.read_text(encoding='utf-8').splitlines()] if blog.is_file() else []
        pc = next((c for c in calls if '--preview' in c), [])
        check('server command: -b --factory-startup --python-exit-code 1 --log render -P scene.py -- --out ... --preview',
              pc[:1] == ['-b'] and '--factory-startup' in pc and pc[pc.index('--python-exit-code') + 1] == '1' and pc[pc.index('-P') + 1].endswith('scene.py')
              and pc.index('-P') < pc.index('--') < pc.index('--out'), pc)
        evb = bl_events(T, n0, P, s1)
        codes = [e.get('code') for e in evb]
        check('events: preview-requested, -started, -done in the slide 1 thread', all(c in codes for c in ('preview-requested', 'preview-started', 'preview-done'))
              and all(e.get('slide') == 1 for e in evb), codes)
        done = next((e for e in evb if e.get('code') == 'preview-done'), {})
        s_, h_, d_ = T.req('GET', done.get('png', '/x'))
        check('the preview PNG is served (files route)', s_ == 200 and d_[:8] == b'\x89PNG\r\n\x1a\n' and h_.get('content-type') == 'image/png', (s_, done.get('png')))
        for bad in ('scene.py', '..%2F..%2Fx.json', 'logs/x.log', 'previews/../scene.py'):
            check(f'files route refuses {bad}', T.req('GET', f'/api/decks/{P}/blender/{s1}/files/{bad}')[0] == 404)
        est = v.get('estimates') or {}
        check('estimates: preview + full still (seconds, low/high, basis slide) + iteration tokens',
              est.get('preview', {}).get('seconds', 0) > 0 and est.get('full', {}).get('still', {}).get('basis') == 'slide'
              and est['full']['still']['low'] <= est['full']['still']['seconds'] <= est['full']['still']['high']
              and est.get('iteration', {}).get('tokensRun', 0) > 0 and est.get('queue', {}).get('ahead') is not None, est)
        argv_build = T.fake_argv(ev)
        sess = (json.loads((T.AURA / 'decks' / f'{P}.json').read_text(encoding='utf-8')).get('slideConvs') or {}).get(s1, {}).get('sessionId')

        # ---- render before approval, change, re-preview
        s, j = jpost(f'/api/decks/{P}/blender/{s1}/render', {})
        check('full render before approval -> 409 not-approved', s == 409 and j.get('error') == 'not-approved', (s, j))
        n0 = jget('/api/claude/status')[1].get('eventCount', 0)
        s, j = jpost(f'/api/decks/{P}/blender/{s1}/change', {'text': 'make the casing darker'})
        check('change request accepted (Claude starts)', s == 200 and j.get('queued') is False, (s, j))
        T.wait_plan_idle(P)
        v = wait_status(T, P, s1, ('preview', 'failed'))
        ev = T.events_from(n0)
        argv = T.fake_argv(ev)
        check('change resumes slide 1\'s OWN conversation', T.flag(argv, '--resume') == sess and sess, (T.flag(argv, '--resume'), sess))
        heard = ' '.join(T.heard(ev))
        check('...with the [blender-change] message and the user\'s text, told not to render', '[blender-change slide=' + s1 in heard and 'make the casing darker' in heard, heard[:200])
        pv = (v.get('previews') or [{}])[-1]
        check('a new preview (n=2) follows the edit, carrying the change text and its tokens', len(v.get('previews') or []) == 2 and pv.get('change') == 'make the casing darker'
              and pv.get('tokensRun', 0) > 0, pv)
        ch = (v.get('changes') or [{}])[-1]
        check('change history: tokens recorded, edited=True; iteration estimate now basis slide', ch.get('tokensRun', 0) > 0 and ch.get('edited') is True
              and v['estimates']['iteration']['basis'] == 'slide', (ch, v['estimates']['iteration']))
        check('change events: change-requested then preview-done', [e.get('code') for e in bl_events(T, n0, P, s1) if e.get('code') in ('change-requested', 'preview-done')]
              == ['change-requested', 'preview-done'], [e.get('code') for e in bl_events(T, n0, P, s1)])
        n0 = jget('/api/claude/status')[1].get('eventCount', 0)
        jpost(f'/api/decks/{P}/blender/{s1}/change', {'text': 'no-edit: just looking'})
        T.wait_plan_idle(P)
        v = wait_status(T, P, s1, ('preview', 'failed'))
        check('a change that does not edit the scene: change-no-edit, no new preview', len(v.get('previews') or []) == 2 and v.get('status') == 'preview'
              and any(e.get('code') == 'change-no-edit' for e in bl_events(T, n0, P, s1)), [e.get('code') for e in bl_events(T, n0, P, s1)])
        s, j = jpost(f'/api/decks/{P}/blender/{s1}/change', {'text': '   '})
        check('empty change -> 400', s == 400)

        # ---- approve, full still
        s, j = jpost(f'/api/decks/{P}/blender/{s1}/approve', {'preview': 1})
        check('approving the OLD preview (scene changed since) -> 409 preview-outdated', s == 409 and j.get('error') == 'preview-outdated', (s, j))
        s, j = jpost(f'/api/decks/{P}/blender/{s1}/approve', {})
        check('approve the latest preview', s == 200 and (j.get('view') or {}).get('status') == 'approved' and j['view']['approved'].get('preview') == 2, (s, j))
        n0 = jget('/api/claude/status')[1].get('eventCount', 0)
        s, j = jpost(f'/api/decks/{P}/blender/{s1}/render', {'res': 720})
        check('full render starts (a still is always 1080p, whatever res says)', s == 200 and (j.get('job') or {}).get('res') == 1080, (s, j))
        v = wait_status(T, P, s1, ('rendered', 'failed'))
        fin = v.get('final') or {}
        check('full still: final.png 1920x1080, render_s, device, sceneHash, not stale', v.get('status') == 'rendered' and fin.get('kind') == 'still'
              and fin.get('width') == 1920 and fin.get('height') == 1080 and fin.get('render_s', 0) > 0 and fin.get('device') and not fin.get('stale')
              and (T.SANDBOX / fin.get('file', 'x')).is_file() and fin['file'].endswith(f'blender/{s1}/final.png'), fin)
        check('render events: render-started, render-done', all(c in [e.get('code') for e in bl_events(T, n0, P, s1)] for c in ('render-started', 'render-done')))
        s_, h_, d_ = T.req('GET', fin.get('url', '/x'))
        check('final.png is served', s_ == 200 and d_[:4] == b'\x89PNG')
        check('the full render ran with --height 1080 --samples 128 (no --preview)', any('--height' in c and c[c.index('--height') + 1] == '1080' and '--preview' not in c
              and c[c.index('--samples') + 1] == '128' for c in [json.loads(x) for x in blog.read_text(encoding='utf-8').splitlines()]))

        # ---- a change after the final render: approval cleared, final kept but stale
        jpost(f'/api/decks/{P}/blender/{s1}/change', {'text': 'a bit more light'})
        T.wait_plan_idle(P)
        v = wait_status(T, P, s1, ('preview', 'failed'))
        check('a change after rendering clears the approval and marks the final stale (kept until replaced)',
              not v.get('approved') and (v.get('final') or {}).get('stale') is True and (T.SANDBOX / v['final']['file']).is_file(), (v.get('approved'), v.get('final')))

        # ---- slide 2: animation (slow), cancel, then a real 720p loop
        jpost(f'/api/decks/{P}/build', {'mode': 'next'})
        T.wait_plan_idle(P)
        v = wait_status(T, P, s2, ('preview', 'failed'))
        pv = (v.get('previews') or [{}])[-1]
        check('animation slide: the preview is ONE poster frame and records the loop length (3 frames, 20 fps)', v.get('status') == 'preview' and v.get('kind') == 'animation'
              and pv.get('frames') == 3 and pv.get('fps') == 20, (v.get('status'), pv))
        est = v.get('estimates', {}).get('full', {})
        check('animation estimates offer 720 and 1080 (1080 slower), 20 fps', est.get('720', {}).get('fps') == 20 and est.get('1080', {}).get('seconds', 0) > est.get('720', {}).get('seconds', 0), est)
        jpost(f'/api/decks/{P}/blender/{s2}/approve', {})
        s, j = jpost(f'/api/decks/{P}/blender/{s2}/render', {'res': 480})
        check('animation res must be 720 or 1080', s == 400, (s, j))
        n0 = jget('/api/claude/status')[1].get('eventCount', 0)
        s, j = jpost(f'/api/decks/{P}/blender/{s2}/render', {'res': 1080})
        v = wait_job(T, P, s2)
        check('slow animation render is running with live progress fields', (v.get('job') or {}).get('state') == 'running' and v['job'].get('kind') == 'full', v.get('job'))
        s, j = jpost(f'/api/decks/{P}/blender/{s2}', {})
        check('POST on the slide itself (no action) -> 404', s == 404)
        s, j = jpost(f'/api/decks/{P}/blender/{s2}/render', {'res': 720})
        check('a second full render of the same slide -> 409 rendering', s == 409 and j.get('error') == 'rendering', (s, j))
        s, j = jpost(f'/api/decks/{P}/blender/{s2}/cancel', {'job': 'full'})
        v = wait_status(T, P, s2, ('approved', 'failed', 'rendered'))
        check('cancel: the job stops, status back to approved, no final, frames removed', s == 200 and j.get('cancelled') == 1 and v.get('status') == 'approved'
              and not v.get('final') and not (T.AURA / 'decks' / P / 'blender' / s2 / 'frames').exists(), (j, v.get('status'), v.get('final')))
        check('render-cancelled event', any(e.get('code') == 'render-cancelled' for e in bl_events(T, n0, P, s2)))
        jpost(f'/api/decks/{P}/blender/{s2}/change', {'text': 'fast-again please'})
        T.wait_plan_idle(P)
        wait_status(T, P, s2, ('preview', 'failed'))
        jpost(f'/api/decks/{P}/blender/{s2}/approve', {})
        s, j = jpost(f'/api/decks/{P}/blender/{s2}/render', {})
        v = wait_status(T, P, s2, ('rendered', 'failed'), timeout=90)
        fin = v.get('final') or {}
        import form_server as fs
        if fs.ffmpeg_exe():
            check('animation: final.mp4 (720p default, 20 fps, 3 frames) + final-poster.png, frames folder removed',
                  v.get('status') == 'rendered' and fin.get('kind') == 'animation' and fin.get('res') == 720 and fin.get('fps') == 20 and fin.get('frames') == 3
                  and (T.SANDBOX / fin.get('file', 'x')).is_file() and fin['file'].endswith('final.mp4') and (T.SANDBOX / fin.get('poster', 'x')).is_file()
                  and not (T.AURA / 'decks' / P / 'blender' / s2 / 'frames').exists(), (v.get('status'), v.get('error'), fin))
            s_, h_, d_ = T.req('GET', fin.get('url', '/x'))
            check('final.mp4 is served as video/mp4', s_ == 200 and h_.get('content-type') == 'video/mp4' and b'ftyp' in d_[:64], (s_, h_.get('content-type')))
        else:
            check('animation without ffmpeg -> failed ffmpeg-missing', (v.get('error') or {}).get('code') == 'ffmpeg-missing', v.get('error'))

        # ---- GPU -> CPU fallback, failures
        jpost(f'/api/decks/{P}/build', {'mode': 'next'})
        T.wait_plan_idle(P)
        v = wait_status(T, P, s3, ('preview', 'failed'))
        pv = (v.get('previews') or [{}])[-1]
        check('GPU failure: the preview is retried on the CPU and succeeds', v.get('status') == 'preview' and str(pv.get('device', '')).upper().startswith('CPU'), (v.get('status'), pv, v.get('error')))
        jpost(f'/api/decks/{P}/blender/{s3}/approve', {})
        jpost(f'/api/decks/{P}/blender/{s3}/render', {})
        v = wait_status(T, P, s3, ('rendered', 'failed'))
        check('GPU failure on the full render: final.fallback = true', (v.get('final') or {}).get('fallback') is True, v.get('final'))
        logs = list((T.AURA / 'decks' / P / 'blender' / s3 / 'logs').glob('full-*.log'))
        check('the job log keeps both runs (GPU error, then the CPU retry)', logs and 'trying again on the CPU' in logs[0].read_text(encoding='utf-8')
              and 'OptiX error' in logs[0].read_text(encoding='utf-8'), [l.name for l in logs])
        jpost(f'/api/decks/{P}/build', {'mode': 'next'})
        T.wait_plan_idle(P)
        v = wait_status(T, P, s4, ('preview', 'failed'))
        err = v.get('error') or {}
        check('a scene with a Python error: failed, code script-error, the error line in the reason, a log path',
              v.get('status') == 'failed' and err.get('code') == 'script-error' and 'boom in the scene' in err.get('reason', '') and err.get('log'), err)
        jpost(f'/api/decks/{P}/build', {'mode': 'next'})
        T.wait_plan_idle(P)
        v = wait_status(T, P, s5, ('preview', 'failed'))
        check('Claude wrote no scene: failed, code no-scene', v.get('status') == 'failed' and (v.get('error') or {}).get('code') == 'no-scene', v.get('error'))
        s, j = jpost(f'/api/decks/{P}/blender/{s5}/preview', {})
        check('preview without a scene -> 404 no-scene', s == 404 and j.get('error') == 'no-scene', (s, j))
        s, j = jpost(f'/api/decks/{P}/blender/{s5}/change', {'text': 'x'})
        check('change without a scene -> 409 no-scene', s == 409, (s, j))
        allv = bl(T, P)
        check('deck view lists the Blender slides with their state', all(x in (allv.get('slides') or {}) for x in (s1, s2, s3, s4, s5)), list((allv.get('slides') or {}).keys()))
        t0 = time.time()
        while time.time() - t0 < 30 and (jget('/api/blender')[1].get('bench') or {}).get('basis') != 'benchmark': time.sleep(0.3)
        bb = jget('/api/blender')[1].get('bench') or {}
        check('the calibration ran once in the background and is cached (bench basis)', bb.get('basis') == 'benchmark' and (T.AURA / 'temp' / 'blender-bench.json').is_file(), bb)

        # ---- a change while Claude is busy waits, then starts by itself
        (T.AURA / 'decks' / P / 'blender' / s1 / 'scene.py').write_text((T.AURA / 'decks' / P / 'blender' / s1 / 'scene.py').read_text(encoding='utf-8') + '\n# test\n', encoding='utf-8')
        jpost('/api/claude/reply', {'deckId': P, 'slide': 6, 'text': 'take-your-time tidy this slide'})
        time.sleep(0.4)
        s, j = jpost(f'/api/decks/{P}/blender/{s1}/change', {'text': 'queued change'})
        check('a change while Claude works is queued (pendingChange)', s == 200 and j.get('queued') is True and bl(T, P, s1).get('pendingChange') == 'queued change', (s, j))
        jpost('/api/claude/stop', {})
        time.sleep(1.0)
        jpost('/api/claude/reply', {'deckId': P, 'slide': 6, 'text': 'quick one'})
        T.wait_plan_idle(P)
        t0 = time.time()
        while time.time() - t0 < 20 and (bl(T, P, s1).get('pendingChange') or jget('/api/claude/status')[1].get('running')): time.sleep(0.2)
        T.wait_plan_idle(P)
        v = wait_status(T, P, s1, ('preview', 'failed'))
        check('...and starts when Claude is free, then previews', not v.get('pendingChange') and (v.get('previews') or [{}])[-1].get('change') == 'queued change', (v.get('pendingChange'), (v.get('previews') or [{}])[-1].get('change')))

        # ---- restart during a render -> interrupted, approval kept
        sc2 = T.AURA / 'decks' / P / 'blender' / s2 / 'scene.py'
        sc2.write_text(sc2.read_text(encoding='utf-8') + '\n# FAKE_SLOW=3\n', encoding='utf-8')
        jpost(f'/api/decks/{P}/blender/{s2}/preview', {})
        wait_status(T, P, s2, ('preview', 'failed'), timeout=30)
        jpost(f'/api/decks/{P}/blender/{s2}/approve', {})
        jpost(f'/api/decks/{P}/blender/{s2}/render', {})
        wait_job(T, P, s2)
        T.stop_server(srv)
        srv = T.start_server(AURA_BLENDER=str(FAKE_BLENDER))
        v = bl(T, P, s2)
        restart_ok = (v.get('status') == 'failed' and (v.get('error') or {}).get('code') == 'interrupted' and v.get('approved')
                      and not (T.AURA / 'decks' / P / 'blender' / s2 / 'frames').exists(), (v.get('status'), v.get('error'), bool(v.get('approved'))))
        T.stop_server(srv)
        srv = T.start_server(AURA_BLENDER=str(FAKE_BLENDER), AURA_FAKE_BLENDER_LOG=str(blog))
        baked_suite(T, blog)
    finally:
        T.stop_server(srv)
    check('restart during a render: failed "interrupted", approval kept, frames removed', restart_ok[0], restart_ok[1])
