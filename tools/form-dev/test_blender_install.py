"""The installer always installs Blender (docs/blender-contract.md sections 5 and 12, batch 4).

Runs the REAL Blender-Pin / Blender-Ok / Blender-Fetch / Step-Blender functions of setup/setup.ps1 (pulled out with the
PowerShell parser, exactly as test_update_keep.py does) against a TINY fixture zip served by a local HTTP server that
speaks Range requests. Nothing here downloads the real 386 MB Blender.

Checked: a fresh install downloads, verifies the SHA256 and flattens the zip's single top folder so
<root>\\.aura\\blender\\blender.exe exists; the GPL licence text + source link land next to it; a second run is a no-op
with no request at all; --repair reinstalls a missing or corrupted copy; a bad hash installs nothing and says so in
plain words; an interrupted download resumes with a Range request instead of starting again.

  python tools/form-dev/test_blender_install.py            (also run by test_server.py)
  python tools/form-dev/test_blender_install.py --real     opt-in: also HEADs the real pinned URL (no download)
"""
import hashlib, http.server, json, os, shutil, socket, subprocess, sys, tempfile, threading, zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PIN = REPO / 'setup' / 'blender' / 'blender-pin.json'
DOCS = REPO / 'setup' / 'blender'

# $PSScriptRoot -> $SetupDir, and the few script-level things the Blender functions lean on.
HARNESS = r'''
$ErrorActionPreference = 'Stop'
$Root = $env:T_ROOT; $Aura = Join-Path $Root '.aura'; $Repo = $env:T_REPO; $SetupDir = Join-Path $Repo 'setup'
$Json = $false
$FULL = '#'; $EMPTY = '.'
$Steps = @(@{ n = 'Blender (studio 3D renders, free/GPL)'; f = 'Step-Blender' })
$BlenderStepNo = 1
function Log([string]$t) { }
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $SetupDir 'setup.ps1'), [ref]$null, [ref]$null)
$want = @('Bar', 'Emit', 'EmitProgress', 'Blender-Pin', 'Blender-Ok', 'Blender-Fetch', 'Step-Blender')
$fns = $ast.FindAll({ param($a) $a -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                      $want -contains $a.Name }, $true)
if (@($fns).Count -ne $want.Count) { throw ('setup.ps1 no longer has all of: ' + ($want -join ', ')) }
foreach ($f in $fns) { . ([scriptblock]::Create(($f.Extent.Text -replace '\$PSScriptRoot', '$SetupDir'))) }
try { Write-Output ('RESULT ' + (Step-Blender)) }
catch { Write-Output ('ERROR ' + $_.Exception.Message) }
'''


# ---------------------------------------------------------------- a tiny Blender-shaped zip, served with Range support
def make_zip(path: Path, top='blender-9.9.9-windows-x64', ver='9.9'):
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr(f'{top}/blender.exe', 'MZ fake blender for tests' * 40)
        z.writestr(f'{top}/blender.crt', 'cert')
        z.writestr(f'{top}/{ver}/python/bin/python.exe', 'py')
        z.writestr(f'{top}/{ver}/scripts/modules/bpy.py', '# bpy')
        z.writestr(f'{top}/{ver}/datafiles/colormanagement/config.ocio', 'ocio')
        z.writestr(f'{top}/license/GPL-license.txt', 'GPL (the copy inside the official zip)')
    return path.read_bytes()


class Serve(http.server.BaseHTTPRequestHandler):
    blob = b''
    hits = []

    def log_message(self, *a):
        pass

    def _send(self, head_only=False):
        rng = self.headers.get('Range')
        start = 0
        if rng and rng.startswith('bytes='):
            try: start = int(rng.split('=', 1)[1].split('-', 1)[0])
            except ValueError: start = 0
        Serve.hits.append({'path': self.path, 'range': start if rng else None, 'head': head_only})
        body = Serve.blob[start:]
        self.send_response(206 if rng else 200)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Accept-Ranges', 'bytes')
        if rng:
            self.send_header('Content-Range', f'bytes {start}-{len(Serve.blob) - 1}/{len(Serve.blob)}')
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def do_GET(self): self._send()
    def do_HEAD(self): self._send(True)


def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p


def start_server(blob):
    Serve.blob = blob; Serve.hits = []
    port = free_port()
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), Serve)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


def write_pin(folder: Path, url, blob, version='9.9.9', sha=None):
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'blender-pin.json').write_text(json.dumps({
        'name': 'Blender', 'version': version, 'channel': 'LTS', 'zip': 'blender.zip', 'url': url,
        'sha256': sha or hashlib.sha256(blob).hexdigest(), 'bytes': len(blob),
        'license': 'GPL-3.0-or-later', 'sourceUrl': 'https://download.blender.org/source/'}), encoding='utf-8')
    for f in ('COPYING-GPL-3.0.txt', 'BLENDER-SOURCE.txt'):
        shutil.copy2(DOCS / f, folder / f)
    return folder / 'blender-pin.json'


def run_step(root: Path, pin: Path, timeout=240):
    env = dict(os.environ, T_ROOT=str(root), T_REPO=str(REPO), AURA_BLENDER_PIN=str(pin))
    r = subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', HARNESS],
                       env=env, capture_output=True, text=True, timeout=timeout)
    out = (r.stdout or '') + (r.stderr or '')
    return r.returncode, out



# ---------------------------------------------------------------- the health check reads the installer's stamp
def health_suite(check, tmp):
    """bundled_blender() tells an installed copy from a damaged one, and the blender check then offers fix "repair"
    (docs/blender-contract.md section 12). Pure functions, no server."""
    sys.path.insert(0, str(REPO / 'engine'))
    sys.dont_write_bytecode = True
    import form_server as fs
    keep_aura, keep_env = fs.AURA, os.environ.get('AURA_BLENDER')
    os.environ['AURA_BLENDER'] = str(Path(__file__).resolve().parent / 'fake_blender.py')
    root = tmp / 'health'
    bl = root / 'blender'
    try:
        fs.AURA = root
        root.mkdir(parents=True, exist_ok=True)
        check('health: no .aura/blender at all is state "none"', fs.bundled_blender()['state'] == 'none')

        bl.mkdir()
        check('health: a folder with no stamp is "damaged"', fs.bundled_blender()['state'] == 'damaged')

        (bl / 'blender.exe').write_bytes(b'x' * 100)
        (bl / '5.2' / 'python').mkdir(parents=True)
        stamp = {'version': '5.2.2', 'sha256': 'a' * 64, 'license': 'GPL-3.0-or-later', 'exeBytes': 100,
                 'sourceUrl': 'https://download.blender.org/source/', 'must': ['blender.exe', '5.2' + chr(92) + 'python']}
        (bl / 'lumi-blender.json').write_text(json.dumps(stamp), encoding='utf-8')
        b = fs.bundled_blender()
        check('health: a complete install is "ok" and carries the version and licence',
              b['state'] == 'ok' and b['version'] == '5.2.2' and 'GPL' in b['license'], b)
        fs.find_blender(fresh=True)
        c = fs.check_blender()
        check('health: with a good bundled copy the check passes and offers no fix', c['ok'] and 'fix' not in c, c)

        (bl / 'blender.exe').write_bytes(b'x' * 7)                         # the right name, the wrong bytes
        check('health: a blender.exe that does not match the stamp is "damaged"', fs.bundled_blender()['state'] == 'damaged')
        fs.find_blender(fresh=True)
        c = fs.check_blender()
        check('health: a damaged bundled copy is a non-blocking check that offers fix "repair"',
              c['ok'] is False and c.get('fix') == 'repair' and c['blocking'] is False
              and 'repairing' in c['label'].lower() and 'damaged' in c['detail'].lower(), c)
        check('health: the check carries the bundled state for the UI', c['blender']['bundled']['state'] == 'damaged')

        (bl / 'blender.exe').write_bytes(b'x' * 100)
        shutil.rmtree(bl / '5.2')                                          # a folder the stamp lists has gone
        check('health: a missing folder from the stamp is "damaged"', fs.bundled_blender()['state'] == 'damaged')

        os.environ['AURA_BLENDER'] = 'none'
        shutil.rmtree(bl)
        fs.find_blender(fresh=True)
        c = fs.check_blender()
        check('health: no Blender anywhere offers fix "repair" and never blocks the loading screen',
              c['ok'] is False and c.get('fix') == 'repair' and c['blocking'] is False, c)
    finally:
        fs.AURA = keep_aura
        if keep_env is None: os.environ.pop('AURA_BLENDER', None)
        else: os.environ['AURA_BLENDER'] = keep_env
        fs.find_blender(fresh=True)

    # the loading screen must not try to fix this one quietly: only the installer can put Blender back
    js = (REPO / 'engine' / 'form' / 'js' / 'loading.js').read_text(encoding='utf-8')
    check('loading screen: a check asking for fix "repair" goes straight to the Repair card, never a silent fix',
          "c.fix === 'repair'" in js and "SILENT = ['npm', 'pip']" in js)
    check('loading screen: the blender check has a plain name in the details list',
          "blender: 'studio renders'" in js and "'signin', 'blender'" in js)


def run(T=None):
    fails = []

    def check(name, ok, info=''):
        if T is not None and hasattr(T, 'check'):
            T.check(name, ok, info); return
        print(('  PASS ' if ok else '  FAIL ') + name + ('' if ok else f'   -> {info}'), flush=True)
        if not ok: fails.append(name)

    print('\n[the installer always installs Blender (real setup.ps1 Step-Blender, fixture zip)]')

    # ---- the pin that ships in the repo
    pin = json.loads(PIN.read_text(encoding='utf-8'))
    check('setup/blender/blender-pin.json pins an official download.blender.org 5.2.x LTS windows-x64 zip',
          pin.get('url', '').startswith('https://download.blender.org/release/Blender5.2/')
          and pin['url'].endswith('-windows-x64.zip') and str(pin.get('version', '')).startswith('5.2')
          and pin.get('channel') == 'LTS', pin.get('url'))
    check('the pin records a full SHA256 and the file size', len(str(pin.get('sha256', ''))) == 64
          and all(c in '0123456789abcdef' for c in str(pin['sha256'])) and int(pin.get('bytes', 0)) > 100_000_000)
    check('the pin records the GPL licence and where to get the source',
          'GPL' in str(pin.get('license')) and str(pin.get('sourceUrl', '')).startswith('https://download.blender.org/source/'))
    check('the GPL licence text and the source note ship in the repo',
          (DOCS / 'COPYING-GPL-3.0.txt').stat().st_size > 30000
          and pin['sha256'] in (DOCS / 'BLENDER-SOURCE.txt').read_text(encoding='utf-8'))

    tmp = Path(tempfile.mkdtemp(prefix='lumi-bl4-'))
    srv = None
    try:
        zf = tmp / 'fixture.zip'
        blob = make_zip(zf)
        srv, port = start_server(blob)
        url = f'http://127.0.0.1:{port}/blender.zip'
        pindir = tmp / 'pin'
        pinfile = write_pin(pindir, url, blob)
        root = tmp / 'Lumi'
        (root / '.aura' / 'temp').mkdir(parents=True)

        # ---- 1. a fresh install
        code, out = run_step(root, pinfile)
        bl = root / '.aura' / 'blender'
        check('a fresh install runs and reports the version', code == 0 and 'RESULT Blender 9.9.9' in out, out[-400:])
        check('the zip is flattened: .aura\\blender\\blender.exe exists (where find_blender() looks)',
              (bl / 'blender.exe').is_file() and not (bl / 'blender-9.9.9-windows-x64').exists())
        check('the whole tree came across (9.9\\python, 9.9\\scripts, 9.9\\datafiles, license)',
              (bl / '9.9' / 'python' / 'bin' / 'python.exe').is_file() and (bl / '9.9' / 'scripts' / 'modules' / 'bpy.py').is_file()
              and (bl / '9.9' / 'datafiles').is_dir() and (bl / 'license' / 'GPL-license.txt').is_file())
        check('GPL: the licence text and the source link sit next to blender.exe',
              (bl / 'COPYING-GPL-3.0.txt').is_file() and (bl / 'BLENDER-SOURCE.txt').is_file()
              and 'download.blender.org/source' in (bl / 'BLENDER-SOURCE.txt').read_text(encoding='utf-8'))
        stamp = json.loads((bl / 'lumi-blender.json').read_text(encoding='utf-8')) if (bl / 'lumi-blender.json').is_file() else {}
        check('a stamp records version, url, sha256, licence and the files that must be there',
              stamp.get('version') == '9.9.9' and stamp.get('sha256') == hashlib.sha256(blob).hexdigest()
              and stamp.get('url') == url and 'GPL' in str(stamp.get('license')) and stamp.get('exeBytes')
              and 'blender.exe' in (stamp.get('must') or []), stamp)
        check('no download leftovers in .aura\\temp',
              not list((root / '.aura' / 'temp').glob('blender-*')), [p.name for p in (root / '.aura' / 'temp').glob('*')])

        # ---- 2. running it again changes nothing and downloads nothing
        Serve.hits = []
        code, out = run_step(root, pinfile)
        check('a second run is a no-op (HAVE) and makes no request at all',
              code == 0 and 'RESULT HAVE' in out and not Serve.hits, (out[-200:], Serve.hits))

        # ---- 3. repair: blender.exe gone
        (bl / 'blender.exe').unlink()
        Serve.hits = []
        code, out = run_step(root, pinfile)
        check('--repair reinstalls a missing blender.exe', code == 0 and 'RESULT Blender 9.9.9' in out
              and (bl / 'blender.exe').is_file() and len(Serve.hits) >= 1, out[-300:])

        # ---- 4. repair: a corrupted copy (right name, wrong bytes)
        (bl / 'blender.exe').write_text('truncated')
        code, out = run_step(root, pinfile)
        check('--repair reinstalls a corrupted copy (blender.exe size does not match the stamp)',
              code == 0 and 'RESULT Blender 9.9.9' in out and (bl / 'blender.exe').stat().st_size > 100, out[-300:])

        # ---- 5. repair: a half-unpacked copy (the version folder is gone)
        shutil.rmtree(bl / '9.9')
        code, out = run_step(root, pinfile)
        check('--repair reinstalls when a folder the stamp lists is missing',
              code == 0 and (bl / '9.9' / 'python' / 'bin' / 'python.exe').is_file(), out[-300:])

        # ---- 6. a changed pin (new version) reinstalls, an unchanged one does not
        pin2dir = tmp / 'pin2'
        blob2 = make_zip(tmp / 'fixture2.zip', top='blender-9.9.10-windows-x64', ver='9.9')
        Serve.blob = blob2
        pin2 = write_pin(pin2dir, url, blob2, version='9.9.10')
        code, out = run_step(root, pin2)
        check('a newer pinned version replaces the bundled copy',
              code == 0 and 'RESULT Blender 9.9.10' in out
              and json.loads((bl / 'lumi-blender.json').read_text())['version'] == '9.9.10', out[-300:])
        Serve.blob = blob

        # ---- 7. a bad hash installs nothing and says so in plain words
        badroot = tmp / 'Lumi-bad'
        (badroot / '.aura' / 'temp').mkdir(parents=True)
        badpin = write_pin(tmp / 'pinbad', url, blob, sha='0' * 64)
        code, out = run_step(badroot, badpin)
        check('a SHA256 mismatch refuses to install and explains it without jargon',
              'ERROR' in out and 'security check' in out and 'blender.org' in out
              and not (badroot / '.aura' / 'blender').exists(), out[-400:])
        check('a failed download leaves no half-made .aura\\blender and no .part file',
              not (badroot / '.aura' / 'blender').exists()
              and not list((badroot / '.aura' / 'temp').glob('*.part')))

        # ---- 8. an interrupted download resumes instead of starting again
        resroot = tmp / 'Lumi-resume'
        (resroot / '.aura' / 'temp').mkdir(parents=True)
        part = resroot / '.aura' / 'temp' / 'blender-9.9.9-windows-x64.zip.part'
        half = len(blob) // 2
        part.write_bytes(blob[:half])
        Serve.hits = []
        code, out = run_step(resroot, pinfile)
        ranged = [h for h in Serve.hits if h['range']]
        check('a half-downloaded file is resumed with a Range request, not downloaded again',
              code == 0 and 'RESULT Blender 9.9.9' in out and ranged and ranged[0]['range'] == half, (out[-300:], Serve.hits))
        check('the resumed install is complete and verified',
              (resroot / '.aura' / 'blender' / 'blender.exe').is_file()
              and (resroot / '.aura' / 'blender' / 'lumi-blender.json').is_file())

        # ---- 9. a leftover .part with the WRONG bytes is thrown away, not trusted
        badpart = tmp / 'Lumi-stale'
        (badpart / '.aura' / 'temp').mkdir(parents=True)
        p2 = badpart / '.aura' / 'temp' / 'blender-9.9.9-windows-x64.zip.part'
        p2.write_bytes(b'\x00' * len(blob))
        code, out = run_step(badpart, pinfile)
        check('a complete but wrong .part file is discarded and fetched again',
              code == 0 and 'RESULT Blender 9.9.9' in out
              and (badpart / '.aura' / 'blender' / 'blender.exe').is_file(), out[-300:])

        # ---- 10. the health check reads the stamp the installer wrote
        health_suite(check, tmp)

        # ---- 11. opt-in: the real pinned URL is really there (a HEAD, no download)
        if '--real' in sys.argv:
            import urllib.request
            req = urllib.request.Request(pin['url'], method='HEAD')
            with urllib.request.urlopen(req, timeout=60) as r:
                size = int(r.headers.get('Content-Length') or 0)
            check('the real pinned URL answers with exactly the recorded size', size == int(pin['bytes']), size)
    finally:
        if srv: srv.shutdown()
        shutil.rmtree(tmp, ignore_errors=True)
    return fails


if __name__ == '__main__':
    f = run()
    print(f'\n{"ALL PASSED" if not f else str(len(f)) + " FAILED"}')
    sys.exit(1 if f else 0)
