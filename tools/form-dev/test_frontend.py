"""The ONE command for the front-end tests (X-03).
  python tools/form-dev/test_frontend.py                     unit tests of engine/form/js under Node (fast, no browser)
  python tools/form-dev/test_frontend.py --e2e               ... plus the Playwright walk of the real pages against a throwaway
                                                             sandbox server with the fake Claude, at 1366x768 and 1920x1080
  python tools/form-dev/test_frontend.py --e2e --viewports 1280x720,1366x768,1920x1080,zoom
  python tools/form-dev/test_frontend.py --e2e --blender-only   only the Blender batch 3 walk (e2e_blender.js, fake Blender)
Options: --no-venv (skip the sandbox venv) --port 8798 (never 8765/8766/8786)   --sandbox X:\\aura-dev-e2e   --venv-from <an existing .aura\\venv to copy; without it
sandbox.py builds one, which needs the network and a few minutes>   --out <screenshots folder>
Needs Node, Edge and the playwright package (AURA_PLAYWRIGHT=<path to it> if it is not installed beside the repo).
What the unit layer covers: tools/form-dev/test_frontend.mjs (bus, api, plan logic, structural rules), test_post.mjs (the shared
deck post-processing stack in engine/deck/lib: off by default, the hero rule, the honesty gate, the determinism contract) and
markers_test.mjs (the marker grammar fixtures shared with the server). The walk is tools/form-dev/e2e_walk.js. The server tests stay in test_server.py."""
import os, shutil, subprocess, sys, time, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
args = sys.argv[1:]
opt = lambda name, default=None: args[args.index(name) + 1] if name in args else default
PORT = int(opt('--port', 8798))
SANDBOX = Path(opt('--sandbox', r'X:\aura-dev-e2e'))
OUT = opt('--out', str(Path(os.environ.get('TEMP', '.')) / 'lumi-e2e'))
VIEWPORTS = opt('--viewports', '1366x768,1920x1080').split(',')
if PORT in (8765, 8766, 8786): sys.exit('refusing to use that port')


def node(*a, **kw):
    return subprocess.run(['node', *map(str, a)], cwd=str(REPO), **kw)


def unit():
    print('[frontend unit tests]')
    ok = True
    r = node(HERE / 'test_frontend.mjs')
    ok &= r.returncode == 0
    print('\n[deck post-processing stack: engine/deck/lib]')
    r = node(HERE / 'test_post.mjs')
    ok &= r.returncode == 0
    r = node(HERE / 'markers_test.mjs', capture_output=True, text=True)
    import json
    try:
        res = json.loads(r.stdout)['results']
        bad = [x for x in res if not x['ok']]
        print(f'  {"PASS" if not bad else "FAIL"} marker grammar fixtures: {len(res) - len(bad)}/{len(res)}')
        for b in bad[:5]: print('    ', b['name'], b['detail'])
        ok &= not bad
    except Exception as e:
        print('  FAIL marker grammar fixtures did not run:', e, r.stderr[:200]); ok = False
    return ok


def e2e():
    print('\n[frontend e2e: the real pages against a sandbox server with the fake Claude]')
    import json
    venv_from = opt('--venv-from')
    cmd = [sys.executable, str(HERE / 'sandbox.py'), str(SANDBOX), '--reset'] + ([] if not (venv_from or '--no-venv' in args) else ['--no-venv'])
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: print(r.stdout, r.stderr); return False
    if venv_from: shutil.copytree(venv_from, SANDBOX / '.aura' / 'venv', dirs_exist_ok=True)
    cfgp = SANDBOX / '.aura' / 'aura.config.json'
    cfg = json.loads(cfgp.read_text(encoding='utf-8')); cfg['formPort'] = PORT; cfgp.write_text(json.dumps(cfg, indent=2), encoding='utf-8')
    env = dict(os.environ, AURA_HOME=str(SANDBOX / '.aura'), AURA_FAKE_CLAUDE=str(HERE / 'fake_claude.py'), AURA_NO_LAUNCH='1',
               AURA_FAKE_DELAY='0.4', AURA_NO_NETWORK='1', AURA_FAKE_FIX='1', AURA_NO_REAP='1', AURA_E2E_PORT=str(PORT), AURA_E2E_OUT=OUT)
    ok = True
    walks = ([] if '--blender-only' in args else [('e2e_walk.js', {})]) +         [('e2e_blender.js', {'AURA_BLENDER': str(HERE / 'fake_blender.py'), 'AURA_FAKE_BLENDER_ART': '1'})]     # Blender batch 3 walk
    for vp in VIEWPORTS:
        for script, extra in walks:
            if script == 'e2e_blender.js' and vp == 'zoom': continue
            # a clean library for every walk: the server is restarted over an emptied decks / brief / temp
            # the server's own output is KEPT. When it stopped mid-walk the page could only say "lumi's helper stopped
            # running", and with DEVNULL there was nothing left anywhere to say why.
            Path(OUT).mkdir(parents=True, exist_ok=True)
            srv_log = Path(OUT) / f'server-{vp}-{script[:-3]}.log'
            srv_out = open(srv_log, 'w', encoding='utf-8', errors='replace')
            srv = subprocess.Popen([sys.executable, str(REPO / 'engine' / 'form_server.py'), '--port', str(PORT)], env=dict(env, **extra),
                                   stdout=srv_out, stderr=subprocess.STDOUT, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            try:
                for _ in range(60):
                    try:
                        urllib.request.urlopen(f'http://127.0.0.1:{PORT}/api/ping', timeout=2); break
                    except Exception:
                        time.sleep(0.3)
                else:
                    print('  FAIL the sandbox server did not start'); return False
                a = ['zoom'] if vp == 'zoom' else vp.split('x')
                walk = node(HERE / script, *( ['1366', '768', '1.5'] if vp == 'zoom' else a), env=dict(env, **extra))
                if walk.returncode == 2: print('  SKIP the walk needs playwright (set AURA_PLAYWRIGHT)'); return ok
                ok &= walk.returncode == 0
                if srv.poll() is not None:
                    print(f'  FAIL the sandbox server stopped during {script} (exit {srv.returncode}). Its output:')
                    srv_out.flush()
                    for line in srv_log.read_text(encoding='utf-8', errors='replace').splitlines()[-25:]: print('     ', line)
                    ok = False
            finally:
                if srv.poll() is None:
                    srv.terminate()
                    try: srv.wait(10)
                    except subprocess.TimeoutExpired: srv.kill()
                srv_out.close()
                # Every walk needs an EMPTY library: the home-page checks count cards, so one deck left behind by the
                # previous walk fails them for no reason at all. On Windows the server it just killed can still hold a
                # handle for a moment, and ignore_errors=True would swallow that silently and hand the next walk a
                # dirty library. So: retry, and if it still will not empty, say so loudly instead of pretending.
                # ...and "4 - Your slides" with them. Emptying only .aura/decks is not enough: on start the server
                # adopts every packed deck still sitting in that folder (migrate_decks), so the previous walk's slides
                # come straight back as fresh library cards and the counting checks fail for no reason at all.
                for f in SANDBOX.glob('4 - Your slides/*'):
                    try:
                        shutil.rmtree(f) if f.is_dir() else f.unlink()
                    except OSError as e:
                        print(f'  WARNING could not clear {f.name} between walks: {e}')
                for d in ('decks', 'brief', 'temp'):
                    for attempt in range(10):
                        shutil.rmtree(SANDBOX / '.aura' / d, ignore_errors=True)
                        if not (SANDBOX / '.aura' / d).exists(): break
                        time.sleep(0.4)
                    else:
                        left = [p.name for p in (SANDBOX / '.aura' / d).glob('*')][:8]
                        print(f'  WARNING could not empty .aura/{d} between walks; the next walk starts dirty: {left}')
                    (SANDBOX / '.aura' / d).mkdir(parents=True, exist_ok=True)
    print(f'  screenshots in {OUT}')
    return ok


if __name__ == '__main__':
    good = unit()
    if '--e2e' in args: good &= e2e()
    print('\nfront-end tests:', 'ALL PASSED' if good else 'FAILED')
    sys.exit(0 if good else 1)
