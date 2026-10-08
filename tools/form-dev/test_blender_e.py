"""Part E (docs/HANDOFF-E-real-3d.md): real 3D, camera setups, the PolyHaven fetcher. Standalone:
    python tools/form-dev/test_blender_e.py [--blender <blender.exe>] [--net]
Without --blender (or AURA_REAL_BLENDER) the real-Blender probe is skipped. --net also fetches one small PolyHaven
asset for real. Sandboxes go to X:\\aura-dev-e (AURA_DEV_E overrides), never inside the repo."""
import json, os, re, subprocess, sys, tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
BL = REPO / 'engine' / 'deck' / 'blender'
TOOLS = REPO / 'engine' / 'tools'
SAND = Path(os.environ.get('AURA_DEV_E', r'X:\aura-dev-e')) / 'test'
fails = []


def check(name, ok, detail=''):
    print(('  ok   ' if ok else '  FAIL ') + name + ('' if ok else f'  -- {str(detail)[:200]}'))
    if not ok: fails.append(name)


def static():
    print('[static: the rule text and the code agree]')
    base = (REPO / 'workspace/.claude/skills/aura-slide/looks/_shared/LOOK-BASE.md').read_text(encoding='utf-8')
    blmd = (REPO / 'workspace/.claude/skills/aura-slide/looks/bold-blue/BLENDER.md').read_text(encoding='utf-8')
    bpy_src = (BL / 'lumi_bpy.py').read_text(encoding='utf-8')
    heads = re.findall(r'^### (4\.\d+)', base, re.M)
    check('LOOK-BASE: 4.0..4.9 untouched and in order, 4.10 + 4.11 appended', heads[:12] == [f'4.{i}' for i in range(12)], heads)
    check('LOOK-BASE 4.10 is binding on every look', '### 4.10 The real thing, never a likeness' in base and 'binding on every look' in base)
    check('LOOK-BASE 4.11 lists every setup lumi_bpy has', all(f'`{m}`' in base for m in ('sway', 'push', 'crane', 'dolly', 'orbit', 'whip', 'still')))
    check('BLENDER.md template declares L.real', "L.real('brief" in blmd)
    check('BLENDER.md 2c documents L.move', '## 2c. Camera setups' in blmd and "L.move('crane')" in blmd)
    check('BLENDER.md no longer says the camera does not move', 'The camera does not move.' not in blmd)
    for code in ('no-real', 'analogy', 'no-preset', 'static-camera', 'move-out-of-frame'):
        check(f'inspect code {code} has a section 8 row', f"'{code}'" in bpy_src and f'`{code}`' in blmd)
    check('every move is in MOVES', all(f"'{m}':" in bpy_src for m in ('still', 'sway', 'crane', 'dolly', 'push', 'orbit', 'whip')))
    st = (REPO / 'engine/deck/looks/bold-blue/studio3d.js').read_text(encoding='utf-8')
    check('studio3d.js S.shot has the same setups', all(f'{m}:' in st for m in ('crane', 'dolly', 'push', 'orbit', 'whip')))
    for f in ('engine/deck/looks/bold-blue/studio3d.js', 'engine/deck/lib/bake-player.js', 'engine/deck/lib/post-policy.js'):
        src = (REPO / f).read_text(encoding='utf-8')
        body = re.sub(r'/\*.*?\*/|//[^\n]*', '', src, flags=re.S)
        if f.endswith('studio3d.js'):      # its adaptive-quality meter reads the clock, live only: judge the camera code
            body = body[body.index('orbit(t, s = {})'):body.index('tour(shot)')]
        check(f'{f}: no clock or random (seek(t) contract)', 'performance.now' not in body and 'Math.random' not in body and 'Date.now' not in body)
    clay = (REPO / 'workspace/.claude/skills/aura-slide/looks/clay-pop/LOOK.md').read_text(encoding='utf-8')
    check('Clay Pop: thick, never fewer or wider apart', 'Thick, never fewer or wider apart' in clay)


def fetcher():
    print('[fetch_asset.py: the narrow door]')
    sys.path.insert(0, str(TOOLS)); sys.dont_write_bytecode = True
    os.environ['LUMI_ASSETS'] = str(SAND / 'assets')
    import fetch_asset as F
    net = F.lumi_net
    check('fetches through the shared network frame (lumi_net)', 'lumi_net.get(' in (TOOLS / 'fetch_asset.py').read_text(encoding='utf-8'))
    for u in ('https://evil.example/a.hdr', 'http://dl.polyhaven.org/a.hdr', 'https://dl.polyhaven.org.evil.example/a',
              'https://u@dl.polyhaven.org/a', 'https://dl.polyhaven.org:8443/a'):
        try: net.check_url(u, F.HOSTS); check('refuses ' + u, False, 'allowed')
        except net.Refused: check('refuses ' + u, True)
    try: net.check_url('https://dl.polyhaven.org/file/x.hdr', F.HOSTS); check('allows the PolyHaven CDN', True)
    except net.Refused as e: check('allows the PolyHaven CDN', False, e)
    check('the host list is a constant, not an argument', F.HOSTS == ('api.polyhaven.com', 'dl.polyhaven.org'))
    for bad in ('../x', 'A', 'x y', 'https://evil', ''):
        check(f'refuses id {bad!r}', F.fetch('hdri', bad)['ok'] is False)
    check('refuses an unknown type', F.fetch('model', 'chair_01')['ok'] is False)
    check('refuses 8k', F.fetch('hdri', 'studio_small_09', '8k')['ok'] is False)
    r = F.fetch('hdri', 'not_cached_id', '1k', offline=True)
    check('offline is normal: ok false, offline true, says the fallback', r.get('offline') and 'PRESETS' in r['msg'], r)
    for data, url in ((b'PK\x03\x04', 'https://dl.polyhaven.org/a.zip'), (b'MZ\x90\x00', 'https://dl.polyhaven.org/a.jpg')):
        try: F._keep(data, url, None, SAND / 'x'); check('refuses ' + url, False, 'kept')
        except ValueError: check('refuses ' + url + ' (type / magic)', True)
    try: F._keep(b'\xff\xd8\xff\xe0', 'https://dl.polyhaven.org/a.jpg', '0' * 32, SAND / 'x'); check('md5 mismatch refused', False)
    except ValueError: check('md5 mismatch refused', True)
    src = (TOOLS / 'fetch_asset.py').read_text(encoding='utf-8')
    check('GET only: no POST / PUT / data= anywhere', not re.search(r"method='(POST|PUT)'|data=", src))
    if '--net' in sys.argv:
        r = F.fetch('hdri', 'studio_small_09', '1k')
        check('fetches a real HDRI into the cache', r.get('ok') and r['files']['hdri'].endswith('.hdr'), r)
        check('a second call is a cache hit', F.fetch('hdri', 'studio_small_09', '1k').get('cached') is True)


def scene_lint():
    print('[blender_check: the scene itself]')
    deck = SAND / 'lint' / '.aura' / 'temp' / 'build' / 'deck-abc123'
    sc = SAND / 'lint' / '.aura' / 'decks' / 'abc123def' / 'blender' / 's1'
    deck.mkdir(parents=True, exist_ok=True); sc.mkdir(parents=True, exist_ok=True)
    cases = {
        'clean': ("L.real('report', fins=40)\nL.assign(f, L.mat('clay'))\nL.loop(4); L.move('crane')\n", 0),
        'no-real': ("L.assign(f, L.mat('clay'))\nL.loop(4); L.move('sway')\n", 1),
        'puff': ("L.real('r', a=1)\ndef puff(n):\n  pass\nL.mat('clay')\nL.move('sway')\n", 1),
        'comment only': ("L.real('r', a=1)  # no clouds here\nL.mat('clay')\nL.move('sway')\n", 0),
        'no material': ("L.real('r', a=1)\nL.move('sway')\n", 1),
        'measured + moving video': ("L.real('r', a=1)\nL.mat('steel')\nL.move('crane')\n", 1),
    }
    lib = str(TOOLS / 'lib' / 'blender_check.js').replace('\\', '/')
    for name, (src, want) in cases.items():
        (sc / 'scene.py').write_text(src, encoding='utf-8')
        held = 'true' if name.startswith('measured') else 'false'
        js = (f"const B=require('{lib}');const v=B.judge([{{n:1,sid:'s1',kind:'animation',filled:false,labels:[],anchors:[],bg:[0,0,0],held:{held}}}],"
              f"{{rules:{{}},deckDir:{json.dumps(str(deck))},root:{json.dumps(str(SAND / 'lint'))}}});"
              "console.log(JSON.stringify(v.errors.filter(e=>/scene.py|measured/.test(e.msg)).length))")
        out = subprocess.run(['node', '-e', js], capture_output=True, text=True, timeout=60)
        got = int((out.stdout or '-1').strip() or -1)
        check(f'scene lint "{name}": {want} error(s)', got == want, out.stdout + out.stderr)


PROBE = r'''
import json, math, os, sys
sys.path.insert(0, os.environ['LUMI_BPY']); import lumi_bpy as L, lumi_bake, bpy
class A: out=os.environ['E_OUT']; res,height,samples,preview,anim,frame=100,360,4,False,False,None; fps,frames,cpu,inspect,cavity=20,None,True,False,False
res = {}
for kind in ('sway', 'crane', 'dolly', 'push', 'orbit', 'whip', 'still'):
    L.reset(A)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.5)); c = bpy.context.active_object; L.assign(c, L.mat('steel'))
    L.real('probe', side_m=1)
    L.studio(fit=[c]); cam = L.camera([c], fill=0.5)
    rest = cam.matrix_world.copy()
    n = L.loop(2.0); L.move(kind, amount=0.6 if kind == 'orbit' else 1.0)
    s = bpy.context.scene
    def M(f): s.frame_set(f); return [list(r) for r in s.camera.matrix_world], s.camera.data.lens
    m1, l1 = M(1); mN, lN = M(n + 1); mh, lh = M(1 + n // 2)
    d = lambda a, b: max(abs(x - y) for ra, rb in zip(a, b) for x, y in zip(ra, rb))
    s.frame_set(1)
    tr = lumi_bake._camera_track(s, s.camera, c.location)
    insp = L.inspect(emit=False)
    res[kind] = dict(close=d(m1, mN) + abs(l1 - lN), rest=d(m1, [list(r) for r in rest]), moved=d(m1, mh) + abs(l1 - lh),
                     rows=(len(tr['rows']) if tr else 0), n=n, trclose=(max(abs(a - b) for a, b in zip(tr['rows'][0], tr['rows'][-1])) if tr else None),
                     fatal=[f['code'] for f in insp['fatal']])
print('[probe] ' + json.dumps(res))
'''


def blender_probe():
    exe = None
    for i, a in enumerate(sys.argv):
        if a == '--blender' and i + 1 < len(sys.argv): exe = sys.argv[i + 1]
    exe = exe or os.environ.get('AURA_REAL_BLENDER')
    if not exe:
        print('[real Blender probe skipped: pass --blender <blender.exe>]'); return
    print('[real Blender: every setup closes its loop, starts at the rest pose, and bakes a track]')
    SAND.mkdir(parents=True, exist_ok=True)
    p = SAND / 'probe_moves.py'; p.write_text(PROBE, encoding='utf-8')
    env = dict(os.environ, LUMI_BPY=str(BL), E_OUT=str(SAND / 'probe.png'), PYTHONDONTWRITEBYTECODE='1')
    r = subprocess.run([exe, '-b', '-P', str(p)], env=env, capture_output=True, text=True, timeout=600)
    line = [l for l in (r.stdout or '').splitlines() if l.startswith('[probe] ')]
    if not line:
        check('probe ran', False, (r.stdout or '')[-300:] + (r.stderr or '')[-300:]); return
    res = json.loads(line[0][8:])
    for k, v in res.items():
        check(f'{k}: frame N+1 == frame 1 (the loop closes)', v['close'] < 1e-4, v['close'])
        check(f'{k}: frame 1 is the framed rest pose', v['rest'] < 1e-4, v['rest'])
        check(f'{k}: ' + ('holds still' if k == 'still' else 'actually moves at mid-loop'), (v['moved'] < 1e-6) == (k == 'still'), v['moved'])
        check(f'{k}: the bake records N+1 camera rows, last == first', v['rows'] == v['n'] + 1 and v['trclose'] < 1e-3, v)
        check(f'{k}: inspect has nothing fatal', not v['fatal'], v['fatal'])


if __name__ == '__main__':
    static(); fetcher(); scene_lint(); blender_probe()
    print('\nRESULT ' + ('ALL PASSED' if not fails else f'{len(fails)} FAILED: ' + '; '.join(fails[:8])))
    sys.exit(1 if fails else 0)
