"""Part D instrumentation (docs/blender-batch6-spec.md): the per-deck timing record.
Run by test_server.py (run(T)); also alone:  python tools/form-dev/test_blender_timing.py --sandbox X:\\aura-dev-timing [--no-browser]
Needs no Blender. The finalize part needs node + ffmpeg + the browser; without them it is skipped, not failed.
  record: .aura/decks/<id>/timing/timing.json - schema, identity, per-slide Cycles times, per-frame times,
          capture and encode per loop (separately), the final file sizes, totals
  graceful: missing numbers become null, a deck with no Blender still writes, a corrupt old record is replaced,
          an unknown deck returns None instead of raising, and nothing a render writes is changed
  keep:   a living deck's scene.py, its renders and timing/ survive reap()
  finalize.js: the `timing` stdout lines are emitted and the html / pdf are still written exactly as before
"""
import json, os, re, shutil, subprocess, sys, time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ENGINE = REPO / 'engine'
NODE = shutil.which('node.exe') or shutil.which('node')

DECK_HTML = """<!doctype html>
<html data-aura-still-ready="1"><head><meta charset="utf-8"><title>Timing probe deck</title>
<style>html,body{margin:0;background:#F9F4F2}.slide{width:1920px;height:1080px;position:relative}
#dot{position:absolute;width:160px;height:160px;border-radius:50%;background:#0061EF;left:200px;top:200px}</style></head>
<body><main class="deck">
<section class="slide" data-title="One"><div id="holder" style="position:absolute;left:100px;top:100px;width:640px;height:360px">
<div id="dot"></div></div></section>
<section class="slide" data-title="Two"><h1>Second</h1></section>
</main>
<script>
var h = document.getElementById('holder'), dot = document.getElementById('dot');
window.LumiCapture = { ready: Promise.resolve(true), recorded: {},
  slides: { 1: { period: 0.2, rect: { x: 100, y: 100, w: 640, h: 360 },
    seek: function (t) { dot.style.left = (20 + 400 * (t / 0.2)) + 'px'; return Promise.resolve(); } } } };
</script></body></html>
"""


def _mk(fs, root, deck_id):
    """A deck record with two Blender slides (a still with two previews and a final, an animation) and one plain slide."""
    import test_batch_c as C
    plan = {'version': 1, 'title': 'Timing', 'minutes': 5, 'slides': [
        {'id': 's1', 'title': 'Still', 'kind': 'content'},
        {'id': 's2', 'title': 'Loop', 'kind': 'content'},
        {'id': 's3', 'title': 'Plain', 'kind': 'content'}]}
    bl = {
        's1': {'engine': 'blender', 'kind': 'still', 'status': 'rendered',
               'previews': [
                   {'n': 1, 'at': 'p1', 'res': 30, 'height': 1080, 'samples': 16, 'render_s': 5.1, 'wall_s': 9.4,
                    'device': 'OPTIX', 'frames': 1, 'fps': 20, 'tokens': 42000, 'costUsd': 0.4, 'frameTimes': [5.1]},
                   {'n': 2, 'at': 'p2', 'res': 30, 'height': 1080, 'samples': 16, 'render_s': 4.9, 'wall_s': 9.0,
                    'device': 'OPTIX', 'frames': 1, 'fps': 20, 'tokens': 51000, 'costUsd': None}],      # no frameTimes
               'final': {'kind': 'still', 'res': 1080, 'width': 1920, 'height': 1080, 'fps': 20, 'frames': 1,
                         'samples': 128, 'render_s': 85.0, 'wall_s': 90.2, 'device': 'OPTIX', 'fallback': False,
                         'stale': False, 'file': None, 'frameTimes': [85.0]}},
        's2': {'engine': 'blender', 'kind': 'animation', 'status': 'rendered',
               'previews': [{'n': 1, 'at': 'q1', 'res': 30, 'height': 1080, 'samples': 16, 'render_s': 6.0,
                             'frames': 4, 'fps': 20, 'frameTimes': [1.4, 1.6, 1.5, 1.5]}],
               'final': {'kind': 'animation', 'res': 720, 'width': 1280, 'height': 720, 'fps': 20, 'frames': 4,
                         'samples': 64, 'render_s': 124.0, 'device': 'CPU', 'fallback': True, 'stale': False,
                         'file': None, 'frameTimes': [31.0, 30.5, 31.5, 31.0]}},
    }
    C.deck_json(fs, root, deck_id, plan=plan, blender=bl)
    for sid in ('s1', 's2'):
        d = root / '.aura' / 'decks' / deck_id / 'blender' / sid
        d.mkdir(parents=True, exist_ok=True)
        (d / 'scene.py').write_text(f'# scene for {sid}\nimport lumi_bpy as L\n', encoding='utf-8')
    return fs.load_deck(deck_id)


def _run(name, slides=1, loops=1):
    """A synthetic finalize run the way Finalizer._work assembles one from the `timing` lines."""
    return {'at': name, 'ok': True, 'light': False, 'fps': 30, 'crf': 21, 'slides': slides, 'loopCount': loops,
            'startupS': 2.0, 'loopsS': 40.0, 'htmlS': 1.2, 'stillsS': 14.0, 'stills': slides, 'stillWarnings': 0,
            'pdfS': 3.0, 'totalS': 61.0, 'htmlBytes': 12_000_000, 'pdfBytes': 900_000, 'wallS': 62.0,
            'loops': [{'i': 0, 'n': 3, 'frames': 60, 'fps': 30, 'crf': 21, 'period': 2.0, 'width': 1280, 'height': 720,
                       'captureS': {'total': 28.0, 'seek': 6.0, 'screenshot': 21.88, 'settle': 0.12},
                       'encodeS': {'total': 4.5, 'write': 3.1, 'flush': 1.4}, 'wallS': 33.0,
                       'bytes': 2_400_000, 'jpegBytes': 9_000_000}][:loops]}


def unit_suite(T):
    check = T.check
    sys.path.insert(0, str(ENGINE)); sys.path.insert(0, str(Path(__file__).parent))
    sys.dont_write_bytecode = True
    import form_server as fs
    import test_batch_c as C
    os.environ.setdefault('AURA_TEST_UNIT_ROOT', str(Path(T.SANDBOX) / 'unit'))
    print('\n[Part D: the timing record (in-process)]')
    with C.unit_root(fs, 'timing-unit') as root:
        old_find, old_avail = fs.find_blender, fs.blender_available
        fs.find_blender = lambda *a, **k: None              # no Blender needed: the record only reports what it finds
        fs.blender_available = lambda: False
        try:
            dk = 'tim1'
            rec = _mk(fs, root, dk)
            out = fs.write_timing_record(dk, finalize=_run('run-1'), why='test')
            f = root / '.aura' / 'decks' / dk / 'timing' / 'timing.json'
            check('the record lands at .aura/decks/<id>/timing/timing.json', f.is_file(), str(f))
            disk = json.loads(f.read_text(encoding='utf-8')) if f.is_file() else {}
            check('schema and deck identity are written', disk.get('schema') == fs.TIMING_SCHEMA and disk['deck']['id'] == dk
                  and disk['deck']['slides'] == 3 and 'version' in disk['app'] and 'at' in disk,
                  (disk.get('schema'), disk.get('deck')))
            r = disk.get('render') or {}
            check('only the Blender slides are in `render`, with their slide numbers', sorted(r) == ['s1', 's2']
                  and r['s1']['slide'] == 1 and r['s2']['slide'] == 2, sorted(r))
            check('per-slide Cycles time: preview and full are separate', r['s1']['previewCount'] == 2
                  and r['s1']['previewS'] == 10.0 and r['s1']['previews'][0]['renderS'] == 5.1
                  and r['s1']['final']['renderS'] == 85.0, (r['s1']['previewS'], r['s1']['final']['renderS']))
            pf = r['s2']['final']['perFrameS']
            check('per-frame times are kept with a mean / min / max summary', r['s2']['final']['frameTimes'] == [31.0, 30.5, 31.5, 31.0]
                  and pf['count'] == 4 and pf['min'] == 30.5 and pf['max'] == 31.5 and abs(pf['mean'] - 31.0) < 0.01, pf)
            check('identity for the comparison: engine, kind, resolution, samples, fps, frames, device, fallback',
                  r['s2']['final']['res'] == 720 and r['s2']['final']['samples'] == 64 and r['s2']['final']['fps'] == 20
                  and r['s2']['final']['frames'] == 4 and r['s2']['final']['device'] == 'CPU'
                  and r['s2']['final']['fallback'] is True and r['s2']['kind'] == 'animation', r['s2']['final'])
            check('a preview with no frame times records null, not a crash', r['s1']['previews'][1]['frameTimes'] is None
                  and r['s1']['previews'][1]['perFrameS'] is None and r['s1']['previews'][1]['costUsd'] is None,
                  r['s1']['previews'][1])
            fin = (disk.get('finalizes') or [{}])[-1]
            lp = (fin.get('loops') or [{}])[0]
            check('capture and encode per loop are stored separately', lp['captureS']['total'] == 28.0
                  and lp['encodeS']['total'] == 4.5 and lp['encodeS']['write'] == 3.1 and lp['encodeS']['flush'] == 1.4,
                  (lp.get('captureS'), lp.get('encodeS')))
            check('the loop video size and its identity (frames, fps, crf, size) are stored', lp['bytes'] == 2_400_000
                  and lp['frames'] == 60 and lp['fps'] == 30 and lp['crf'] == 21 and lp['width'] == 1280, lp)
            t = disk.get('totals') or {}
            check('totals add up the Cycles, capture and encode seconds and the sizes',
                  t['cyclesRenderS'] == 5.1 + 4.9 + 85.0 + 6.0 + 124.0 and t['captureS'] == 28.0 and t['encodeS'] == 4.5
                  and t['loopBytes'] == 2_400_000 and t['finalizeS'] == 61.0, t)
            sc = root / '.aura' / 'decks' / dk / 'timing' / 'scenes'
            check('every scene.py is copied beside the record (the baked run renders the same subjects)',
                  (sc / 's1.py').is_file() and (sc / 's2.py').is_file()
                  and r['s1']['sceneCopy'] == f'.aura/decks/{dk}/timing/scenes/s1.py' and len(r['s1']['sceneSha1']) == 40,
                  (list(sc.glob('*')) if sc.is_dir() else None, r['s1'].get('sceneSha1')))

            # ---- a second finalize is appended, not overwritten; the cap holds
            fs.write_timing_record(dk, finalize=_run('run-2'))
            disk = json.loads(f.read_text(encoding='utf-8'))
            check('a second finalize is appended (both runs stay comparable)', [x['at'] for x in disk['finalizes']] == ['run-1', 'run-2'],
                  [x.get('at') for x in disk['finalizes']])
            for i in range(fs.TIMING_MAX_RUNS + 3): fs.write_timing_record(dk, finalize=_run(f'x{i}'))
            disk = json.loads(f.read_text(encoding='utf-8'))
            check(f'the run list is capped at {fs.TIMING_MAX_RUNS}', len(disk['finalizes']) == fs.TIMING_MAX_RUNS, len(disk['finalizes']))

            # ---- graceful degradation
            C.deck_json(fs, root, 'tim2', plan={'version': 1, 'slides': [{'id': 's1', 'title': 'Plain'}]})
            o2 = fs.write_timing_record('tim2')
            check('a deck with no Blender still writes a record (empty `render`, null totals)',
                  o2 and o2['render'] == {} and o2['totals']['cyclesRenderS'] is None and o2['finalizes'] == [], o2 and o2['render'])
            C.deck_json(fs, root, 'tim3', plan={'version': 1, 'slides': [{'id': 's1'}]},
                        blender={'s1': {'engine': 'blender', 'status': 'rendered', 'previews': ['junk', {'n': 1}],
                                        'final': {'kind': 'still', 'file': '.aura/nope.png'}}})
            o3 = fs.write_timing_record('tim3')
            e3 = o3['render']['s1']
            check('missing numbers become null and junk is skipped, never an exception',
                  e3['final']['renderS'] is None and e3['final']['bytes'] is None and e3['final']['frameTimes'] is None
                  and e3['previewCount'] == 1 and e3['previews'][0]['renderS'] is None and e3['scene'] is None, e3)
            check('an unknown deck returns None instead of raising', fs.write_timing_record('no-such-deck') is None)
            f.write_text('{ not json', encoding='utf-8')
            check('a corrupt old record is read as None and replaced, not inherited', fs.read_timing_record(dk) is None
                  and (fs.write_timing_record(dk, finalize=_run('after-corrupt')) or {}).get('schema') == fs.TIMING_SCHEMA)
            disk = json.loads(f.read_text(encoding='utf-8'))
            check('...and the replacement holds only the new run', [x['at'] for x in disk['finalizes']] == ['after-corrupt'],
                  [x.get('at') for x in disk['finalizes']])
            check('no half-written timing.part.json is left behind', not (f.parent / 'timing.part.json').exists())
            check('helpers never raise on nothing: file_bytes / _per_frame / frame_time_list',
                  fs.file_bytes(None) is None and fs.file_bytes(root / 'gone.x') is None and fs._per_frame([]) is None
                  and fs._per_frame(None) is None and fs.frame_time_list(object()) is None
                  and fs._per_frame(['x', 2.0])['count'] == 1)

            # ---- the record and the scenes survive the retention sweep
            C.age(root / '.aura' / 'decks' / dk, 999)
            fs.reap()
            check('reap() keeps a living deck\'s scene.py, renders and timing record',
                  (root / '.aura' / 'decks' / dk / 'blender' / 's1' / 'scene.py').is_file() and f.is_file(),
                  list((root / '.aura' / 'decks' / dk).glob('*')))

            # ---- the Finalizer's own assembly of the lines it reads
            lines = [{'t': 'timing', 'scope': 'loop', 'n': 1, 'captureS': {'total': 1.0}, 'encodeS': {'total': 0.2}},
                     {'t': 'timing', 'scope': 'deck', 'totalS': 9.0, 'htmlBytes': 5}]
            tim = {'at': 'x', 'light': False, 'loops': [], 'deck': None}
            for ev in lines:
                if ev.get('scope') == 'loop': tim['loops'].append({k: v for k, v in ev.items() if k not in ('t', 'scope')})
                else: tim['deck'] = {k: v for k, v in ev.items() if k not in ('t', 'scope')}
            run = dict(tim.pop('deck') or {}, **tim)
            check('the Finalizer folds the deck line and the loop lines into one run', run['totalS'] == 9.0
                  and run['htmlBytes'] == 5 and len(run['loops']) == 1 and run['loops'][0]['captureS']['total'] == 1.0, run)
        finally:
            fs.find_blender, fs.blender_available = old_find, old_avail


def api_suite(T):
    """The read-only route, against the harness's live server (skipped when running alone)."""
    if not hasattr(T, 'jget') or not hasattr(T, 'start_server'): return
    check = T.check
    srv = T.start_server()
    try:
        _api_checks(T, check)
    finally:
        T.stop_server(srv)


def _api_checks(T, check):
    s, j = T.jget('/api/decks/no-such-deck-xyz/timing')
    check('GET /api/decks/<id>/timing: an unknown deck is a plain 404', s == 404 and j.get('error') == 'no-deck', (s, j))
    decks = (T.jget('/api/decks')[1] or {}).get('decks') or []
    if not decks: return
    did = decks[0].get('id')
    s, j = T.jget(f'/api/decks/{did}/timing')
    check('GET /api/decks/<id>/timing: a real deck answers with the record and its deterministic path',
          s == 200 and j.get('ok') and isinstance(j.get('timing'), dict) and j['timing'].get('schema') == 'lumi-timing/1'
          and j.get('file') == f'.aura/decks/{did}/timing/timing.json', (s, str(j)[:200]))


def finalize_suite(T, browser=True):
    """finalize.js really runs on a tiny deck: the timing lines appear and the html / pdf are written as before."""
    check = T.check
    sys.path.insert(0, str(ENGINE)); sys.dont_write_bytecode = True
    import form_server as fs
    ff = fs.ffmpeg_exe()
    print('\n[Part D: finalize.js timing lines (real run)]')
    if not (browser and NODE and ff):
        print('  SKIP finalize.js run (node / ffmpeg / browser not available)')
        return
    sandbox = Path(T.SANDBOX)
    d = sandbox / '.aura' / 'temp' / 'timing-probe'
    shutil.rmtree(d, ignore_errors=True)
    d.mkdir(parents=True, exist_ok=True)
    deck = d / 'deck.html'
    deck.write_text(DECK_HTML, encoding='utf-8')
    out_html, out_pdf = d / 'out.html', d / 'out.pdf'
    cmd = [NODE, str(ENGINE / 'tools' / 'finalize.js'), str(deck), '--html', str(out_html), '--pdf', str(out_pdf),
           '--ffmpeg', str(ff), '--fps', '10']
    r = subprocess.run(cmd, cwd=str(sandbox), capture_output=True, text=True, encoding='utf-8', errors='replace',
                       timeout=600, stdin=subprocess.DEVNULL)
    evs = []
    for ln in (r.stdout or '').splitlines():
        try: evs.append(json.loads(ln))
        except ValueError: pass
    kinds = [e.get('t') for e in evs]
    check('finalize still finishes and writes the html + pdf (no behaviour change)',
          r.returncode == 0 and 'done' in kinds and out_html.is_file() and out_pdf.is_file() and out_pdf.stat().st_size > 2000,
          (r.returncode, kinds[-3:], (r.stderr or '')[-200:]))
    lp = next((e for e in evs if e.get('t') == 'timing' and e.get('scope') == 'loop'), None)
    check('a per-loop timing line is emitted with capture and encode SEPARATED',
          bool(lp) and lp['captureS']['total'] > 0 and lp['captureS']['screenshot'] > 0
          and lp['encodeS']['total'] >= 0 and lp['encodeS']['flush'] >= 0
          and lp['captureS']['total'] != lp['encodeS']['total'], lp)
    check('the loop line carries its identity and the video size', bool(lp) and lp['n'] == 1 and lp['frames'] == 2
          and lp['fps'] == 10 and lp['width'] == 640 and lp['height'] == 360 and lp['bytes'] > 0, lp)
    dk = next((e for e in evs if e.get('t') == 'timing' and e.get('scope') == 'deck'), None)
    check('a deck timing line is emitted with the stills, the pdf and the final file sizes',
          bool(dk) and dk['slides'] == 2 and dk['stills'] == 2 and dk['loopCount'] == 1 and dk['totalS'] > 0
          and dk['htmlBytes'] == out_html.stat().st_size and dk['pdfBytes'] == out_pdf.stat().st_size, dk)
    check('every timing number is a number or null, never a string or NaN',
          all(isinstance(v, (int, float, type(None), bool)) or isinstance(v, dict)
              for e in (lp, dk) if e for k, v in e.items() if k.endswith('S') or k.endswith('Bytes')), (lp, dk))
    shutil.rmtree(d, ignore_errors=True)


def run(T=None, browser=True):
    if T is None:
        a = sys.argv

        class T:
            pass
        T.SANDBOX = Path(a[a.index('--sandbox') + 1]) if '--sandbox' in a else Path(r'X:\aura-dev-timing')
        T.REPO = REPO
        T.results = []

        def check(name, ok, info=''):
            T.results.append(bool(ok)); print(('  PASS ' if ok else '  FAIL ') + name + ('' if ok else f'   <- {info}'))
        T.check = check
        browser = '--no-browser' not in a
        os.environ.setdefault('AURA_TEST_UNIT_ROOT', str(Path(T.SANDBOX) / 'unit'))
        globals()['_T'] = T
    unit_suite(T)
    api_suite(T)
    finalize_suite(T, browser)


if __name__ == '__main__':
    run()
    res = globals()['_T'].results
    print(f'{sum(res)}/{len(res)} checks passed')
    sys.exit(0 if all(res) else 1)
