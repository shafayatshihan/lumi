"""Developer-only automated tests for engine/form_server.py against a throwaway sandbox (never a real installation).
  python tools/form-dev/test_server.py [--port 8767] [--sandbox X:\\aura-dev-server]
Makes the sandbox with sandbox.py --reset, runs the real server with AURA_HOME/--port/AURA_FAKE_CLAUDE and checks:
host/origin rejection, path traversal, MIME types and byte ranges, uploads, removes, the brief round trip, a full fake
Claude run (start, events, question, reply with --resume, stop), events surviving a restart, and the idle shutdown.
v0.3: quality flags on the command line, deck records (create / list / migrate / patch), deck-tied start and reply
(session switching, [slide N] prefix), /deck/<id>/ serving, slide pictures (real render with Edge), direct text tweaks
(patched in packed + build, 26 px rule rejection reverts both), usage capture, choice / hint markers, health checks and
fixes (simulated failures, fake fix commands).
v0.5: quality picker flags, the clash matrix (strict page saves, lenient repairs of Claude plans), planning (one session,
sonnet/high), quick re-plans (queued, neighbours flagged, doubts), slide-by-slide build (locks, questions, build the rest,
stop), finalize (MP4 loops embedded, PDF stills + notes, cancel, changed since finalizing, older decks)."""
import http.client, json, os, re, socket, subprocess, sys, time, traceback
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace'); sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
from pathlib import Path
from urllib.parse import quote

REPO = Path(__file__).resolve().parents[2]
args = sys.argv[1:]
PORT = int(args[args.index('--port') + 1]) if '--port' in args else 8767
SANDBOX = Path(args[args.index('--sandbox') + 1]) if '--sandbox' in args else Path(r'X:\aura-dev-server')
AURA = SANDBOX / '.aura'
FILES = SANDBOX / '3 - Put your files here'
# Every deck keeps its own folder under FILES. A file uploaded with no ?deck= (no deck exists yet) goes to the draft
# folder, which the deck adopts when the interview makes it; the returned `path` stays relative to the deck folder.
DRAFT = FILES / 'New deck'
HOST = f'127.0.0.1:{PORT}'
SERVER = REPO / 'engine' / 'form_server.py'
FAKE = REPO / 'tools' / 'form-dev' / 'fake_claude.py'
results = []


def check(name, cond, info=''):
    results.append((name, bool(cond)))
    print(('  PASS ' if cond else '  FAIL ') + name + ('' if cond else f'   -> {info}'), flush=True)


def req(method, path, body=None, headers=None, host=None):
    # the Host header follows PORT at CALL time: it used to be a default argument bound at import, so another tool that
    # reuses these helpers on its own port (finalize_probe.py) sent the wrong Host and the server answered 403
    c = http.client.HTTPConnection('127.0.0.1', PORT, timeout=30)
    h = {'Host': host or f'127.0.0.1:{PORT}'}
    h.update(headers or {})
    if isinstance(body, (dict, list)):
        body = json.dumps(body).encode(); h.setdefault('Content-Type', 'application/json')
    c.putrequest(method, path, skip_host=True, skip_accept_encoding=True)
    for k, v in h.items(): c.putheader(k, v)
    if body is not None: c.putheader('Content-Length', str(len(body)))
    c.endheaders(body)
    r = c.getresponse()
    data = r.read()
    c.close()
    return r.status, dict((k.lower(), v) for k, v in r.getheaders()), data


def jget(path, **kw):
    s, h, d = req('GET', path, **kw)
    try: return s, json.loads(d or b'{}')
    except ValueError: return s, {}


def jpost(path, body=None, **kw):
    s, h, d = req('POST', path, body if body is not None else {}, **kw)
    try: return s, json.loads(d or b'{}')
    except ValueError: return s, {}


def raw(lines):
    """Send raw request bytes (no body) and return the status line."""
    s = socket.create_connection(('127.0.0.1', PORT), timeout=10)
    s.sendall(('\r\n'.join(lines) + '\r\n\r\n').encode())
    data = b''
    try:
        while b'\r\n' not in data:
            chunk = s.recv(4096)
            if not chunk: break
            data += chunk
    finally:
        s.close()
    return data.split(b'\r\n')[0].decode(errors='replace')


def start_server(**env_extra):
    env = dict(os.environ, AURA_HOME=str(AURA), AURA_FAKE_CLAUDE=str(FAKE), AURA_NO_LAUNCH='1', AURA_FAKE_DELAY='0.03',
               AURA_NO_NETWORK='1', AURA_FAKE_FIX='1', AURA_BLENDER='none')     # no Blender unless a suite asks (test_blender)
    for k in ('AURA_LATEST_VERSION', 'AURA_HEALTH_FAIL', 'AURA_FAKE_PLAN', 'AURA_FAKE_FIX_FAIL', 'AURA_FAKE_AUTH_FILE',
              'AURA_FAKE_HELP_FAIL', 'AURA_FAKE_LOGGED_IN', 'AURA_FAKE_EMAIL', 'AURA_FAKE_AUTH_METHOD', 'AURA_FAKE_CALL_LOG',
              'AURA_FAKE_EDGE', 'AURA_FAKE_LOGIN_SECONDS', 'BROWSER'): env.pop(k, None)
    for k in ('CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT'): env.pop(k, None)
    env.update({k: str(v) for k, v in env_extra.items()})
    p = subprocess.Popen([sys.executable, str(SERVER), '--port', str(PORT)], env=env, stdout=subprocess.DEVNULL,
                         stderr=subprocess.PIPE, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    for _ in range(80):
        try:
            if jget('/api/ping')[0] == 200: return p
        except OSError:
            time.sleep(0.1)
    raise SystemExit('server did not start: ' + (p.stderr.read().decode(errors='replace') if p.poll() is not None else 'timeout'))


def stop_server(p):
    if p.poll() is None:
        p.kill(); p.wait(10)


def python_cmdlines():
    return subprocess.run(['powershell', '-NoProfile', '-Command',
                           "Get-CimInstance Win32_Process -Filter \"name='python.exe'\" | ForEach-Object { $_.CommandLine }"],
                          capture_output=True, text=True).stdout


def wait_run(timeout=40):
    t0 = time.time()
    while time.time() - t0 < timeout:
        s, j = jget('/api/claude/events?since=0')
        if not j.get('running'): return j
        time.sleep(0.2)
    return jget('/api/claude/events?since=0')[1]


def main():
    print(f'sandbox {SANDBOX}, port {PORT}')
    subprocess.run([sys.executable, str(REPO / 'tools' / 'form-dev' / 'sandbox.py'), str(SANDBOX), '--reset', '--no-venv'], check=True,
                   stdout=subprocess.DEVNULL)
    srv = start_server()
    try:
        run_main_suite()
        run_v3_suite()
        run_v5_suite()
        run_q8_suite()
        import test_batch_c                 # FIXLOG batch C: retention, reconcile, recovery, pptx, finalize options
        test_batch_c.run(sys.modules[__name__])
        import test_batch_d                 # FIXLOG batch D: bin / archive, brief backup, uploads list, mid-build edits
        test_batch_d.run(sys.modules[__name__])
        import test_batch_e                 # FIXLOG batch E: stages, walls, pre-extraction, run file, hooks + checker in a browser
        test_batch_e.run(sys.modules[__name__])
        import test_slide_convs             # v0.5.2: one Claude conversation per slide + one for the deck (+ migration)
        test_slide_convs.run(sys.modules[__name__])
        import test_deck_folders            # per-deck source folders: isolation, the draft, legacy decks, renames, provenance
        test_deck_folders.run(sys.modules[__name__])
        import test_permissions_real        # v0.5.1: the PreToolUse permission gate + shipped allow rules (no Claude; --real is separate)
        test_permissions_real.run(sys.modules[__name__])
        import test_update_keep             # v0.5.1: an update keeps the user's work and replaces settings.json (real setup.ps1)
        test_update_keep.run(sys.modules[__name__])
        print('\n[restart: events survive]')
        n_before = jget('/api/claude/status')[1].get('eventCount')
        sid_before = jget('/api/claude/status')[1].get('sessionId')
        stop_server(srv)
        srv = start_server()
        st = jget('/api/claude/status')[1]
        ev = jget('/api/claude/events?since=0')[1]
        check('event count kept after restart', st.get('eventCount') == n_before and len(ev['events']) == n_before,
              (st.get('eventCount'), n_before))
        check('session id kept after restart', st.get('sessionId') == sid_before, (st.get('sessionId'), sid_before))
        check('event indexes contiguous', [e['i'] for e in ev['events']] == list(range(n_before)))
        s, j = jpost('/api/claude/reply', {'text': 'Thanks, one more tweak please'})
        j = wait_run()
        check('resume works after restart', j['events'][-1]['kind'] == 'done' and j['events'][-1].get('ok') and
              j.get('sessionId') == sid_before, j['events'][-1])
        print('\n[server dies during a run]')
        jpost('/api/claude/reply', {'text': 'take-your-time once more'})
        time.sleep(1.0)
        stop_server(srv)
        time.sleep(1.0)
        check('Claude tree dies with the server (job object)', 'fake_claude.py' not in python_cmdlines(), 'orphan alive')
        srv = start_server()
        j = jget('/api/claude/events?since=0')[1]
        check('interrupted run reported after restart', j['events'][-1]['kind'] == 'error' and
              j['events'][-1].get('code') == 'interrupted' and not j['running'], j['events'][-1])
    finally:
        stop_server(srv)
    print('\n[health checks and fixes]')
    run_health_suite()
    import test_interview               # interview batch 1: state machine, restart, nudge, hand-off, the plan_start crux
    test_interview.run(sys.modules[__name__])
    import test_blender                 # Blender batch 1: locator, render pipeline (fake blender), estimates, failures
    test_blender.run(sys.modules[__name__])
    import test_blender_deck            # Blender batch 2: renders in the deck (embed, pack, runtime, finalize) + the checker rules
    test_blender_deck.run(sys.modules[__name__])
    import test_blender_ui              # Blender batch 3: plan chips + estimates, defer, change on a finalized deck, finalize 409
    test_blender_ui.run(sys.modules[__name__])
    import test_blender_install         # Blender batch 4: the installer downloads, verifies and flattens the pinned portable Blender
    test_blender_install.run(sys.modules[__name__])
    import test_blender_timing          # batch 6 Part D: the per-deck timing record (Cycles, capture, encode, sizes)
    test_blender_timing.run(sys.modules[__name__])
    import test_postmortem_a            # post-mortem batch A: pack tracebacks, render queue, orphan holder, edit ids, markers, permits
    test_postmortem_a.run(sys.modules[__name__])
    import test_postmortem_b            # post-mortem batch B: the quality pair, the deck hand-off, token/cost scope, three.js, estimates
    test_postmortem_b.run(sys.modules[__name__])
    print('\n[idle shutdown]')
    run_idle_suite()
    import test_instructions            # the instruction surface (markers, plan.json schema, step card, numbers): no server needed
    test_instructions.run(check)
    passed = sum(1 for _, ok in results if ok)
    print(f'\n{passed}/{len(results)} checks passed')
    return 0 if passed == len(results) else 1


def run_main_suite():
    print('\n[host and origin]')
    check('good host 127.0.0.1', req('GET', '/api/ping')[0] == 200)
    check('good host localhost', req('GET', '/api/ping', host=f'localhost:{PORT}')[0] == 200)
    for h in ('evil.example:%d' % PORT, 'evil.example', f'127.0.0.1:{PORT + 1}', '127.0.0.1', f'LOCALHOST.evil:{PORT}'):
        check(f'bad host rejected ({h})', req('GET', '/', host=h)[0] == 403)
    check('bad host rejected on POST', req('POST', '/api/brief', {}, host='attacker.test')[0] == 403)
    check('missing host rejected', raw(['GET /api/ping HTTP/1.1']).split(' ')[1:2] == ['403'])
    check('foreign origin rejected', jpost('/api/brief', {'x': 1}, headers={'Origin': 'http://evil.example'})[0] == 403)
    check('null origin rejected', jpost('/api/brief', {'x': 1}, headers={'Origin': 'null'})[0] == 403)
    check('wrong-port origin rejected', jpost('/api/brief', {'x': 1}, headers={'Origin': f'http://127.0.0.1:{PORT + 1}'})[0] == 403)
    check('own origin accepted', jpost('/api/brief', {'x': 1}, headers={'Origin': f'http://localhost:{PORT}'})[0] == 200)
    check('no origin accepted', jpost('/api/brief', {'x': 1})[0] == 200)

    print('\n[path traversal and whitelist]')
    for p in ('/js/../../form_server.py', '/js/%2e%2e/%2e%2e/form_server.py', '/css/..%5c..%5cform_server.py',
              '/fonts/../form_server.py', '/fonts/%2e%2e%2fform_server.py', '/js/scenes/../../../aura.config.json',
              '/themes/../../form_server.py', '/assets/..%2f..%2f..%2faura.config.json', '/js/%00api.js',
              '/vendor/three/three.cjs', '/vendor/three/../../package.json', '/assets/character.mp4::$DATA',
              '/js/api.js:stream', '/css/../index.html', '/form_server.py', '/../aura.config.json', '/js/',
              '/js/.hidden.js', '//etc/passwd', '/C:/Windows/win.ini'):
        s, h, d = req('GET', p)
        check(f'blocked {p}', s == 404 and b'import' not in d, s)
    sys.path.insert(0, str(REPO / 'engine'))
    sys.dont_write_bytecode = True     # no __pycache__ inside the repo engine
    os.environ['AURA_HOME'] = str(AURA)
    import form_server as fs
    check('whitelist refuses .py', fs.static_path('/js/x.py') is None)
    check('whitelist refuses .html outside /', fs.static_path('/css/x.html') is None)
    check('whitelist allows .js', fs.static_path('/js/api.js') is not None)

    print('\n[MIME types and ranges]')
    for p, mime in (('/', 'text/html'), ('/js/api.js', 'text/javascript'), ('/assets/gaze-frames.json', 'application/json'),
                    ('/assets/character.mp4', 'video/mp4'), ('/fonts/DMSans-Regular.woff2', 'font/woff2'),
                    ('/themes/1-pink-punch-1.jpg', 'image/jpeg'), ('/themes/2-bold-blue-4.jpg', 'image/jpeg'),
                    ('/vendor/three/three.module.js', 'text/javascript'), ('/vendor/three/three.core.js', 'text/javascript')):
        s, h, d = req('HEAD', p)
        check(f'{p} -> {mime}', s == 200 and h.get('content-type', '').startswith(mime), (s, h.get('content-type')))
    video = REPO / 'engine' / 'form' / 'assets' / 'character.mp4'
    size, blob = video.stat().st_size, video.read_bytes()
    s, h, d = req('GET', '/assets/character.mp4', headers={'Range': 'bytes=1000-1999'})
    check('range 206 + exact bytes', s == 206 and d == blob[1000:2000] and h.get('content-range') == f'bytes 1000-1999/{size}', (s, h.get('content-range')))
    s, h, d = req('GET', '/assets/character.mp4', headers={'Range': f'bytes={size - 4096}-'})
    check('open-ended range (seek near end)', s == 206 and d == blob[-4096:])
    s, h, d = req('GET', '/assets/character.mp4', headers={'Range': 'bytes=-500'})
    check('suffix range', s == 206 and d == blob[-500:])
    s, h, d = req('GET', '/assets/character.mp4', headers={'Range': f'bytes={size + 10}-'})
    check('unsatisfiable range 416', s == 416 and h.get('content-range') == f'bytes */{size}', s)
    s, h, d = req('GET', '/assets/character.mp4')
    check('full video 200 with Accept-Ranges', s == 200 and len(d) == size and h.get('accept-ranges') == 'bytes')
    s2, h2, _ = req('GET', '/js/api.js')
    s3, _, _ = req('GET', '/js/api.js', headers={'If-Modified-Since': h2.get('last-modified', '')})
    check('304 when unchanged', s3 == 304, s3)
    check('nosniff header', h2.get('x-content-type-options') == 'nosniff')

    print('\n[uploads]')
    def up(folder, name, data=b'hello'):
        s, h, d = req('POST', f'/api/upload?folder={quote(folder, safe="")}&name={quote(name, safe="")}', data,
                      headers={'Content-Type': 'application/octet-stream'})
        return s, json.loads(d or b'{}')
    s, j = up('Report', 'hello.txt')
    check('upload ok', s == 200 and j.get('path') == 'Report/hello.txt' and j.get('size') == 5 and
          (DRAFT / 'Report' / 'hello.txt').read_bytes() == b'hello', j)
    s, j = up('Report', 'hello.txt', b'second')
    check('duplicate gets " (2)"', j.get('path') == 'Report/hello (2).txt' and (DRAFT / 'Report' / 'hello.txt').read_bytes() == b'hello', j)
    s, j = up('Report', 'hello.txt', b'third')
    check('third copy gets " (3)"', j.get('path') == 'Report/hello (3).txt', j)
    for name, want in (('../../evil.txt', 'evil.txt'), ('..\\..\\.aura\\brief\\brief.json', 'brief.json'),
                       ('CON.txt', '_CON.txt'), ('nul', '_nul'), ('com1.tar.gz', '_com1.tar.gz'),
                       ('a<b>c:d|e?f*.pdf', 'a_b_c_d_e_f_.pdf'), ('  .hidden. ', 'hidden'), ('desktop.ini', '_desktop.ini'),
                       ('\u099b\u09ac\u09bf \u09a8\u09ae\u09c1\u09a8\u09be.png', '\u099b\u09ac\u09bf \u09a8\u09ae\u09c1\u09a8\u09be.png'),
                       ('x' * 300 + '.docx', 'x' * 115 + '.docx'), ('', 'file'), ('tab\there.csv', 'tab_here.csv')):
        s, j = up('Images and photos', name)
        check(f'name {name[:30]!r} -> {want[:30]!r}', s == 200 and j.get('name') == want and
              (DRAFT / 'Images and photos' / want).is_file(), j)
    check('nothing escaped the folder', not (SANDBOX / 'evil.txt').exists() and not (FILES / 'evil.txt').exists()
          and not (DRAFT / 'evil.txt').exists())
    for folder in ('Secret', '../.aura', 'Report/../..', ''):
        check(f'bad folder {folder!r} rejected', up(folder, 'x.txt')[0] == 400)
    huge = 3 * 1024 ** 3
    st = raw([f'POST /api/upload?folder=Report&name=big.bin HTTP/1.1', f'Host: {HOST}', f'Content-Length: {huge}'])
    check('oversize rejected by Content-Length (413)', ' 413 ' in st + ' ', st)
    st = raw([f'POST /api/upload?folder=Report&name=nolen.bin HTTP/1.1', f'Host: {HOST}'])
    check('missing Content-Length rejected (411)', ' 411 ' in st + ' ', st)
    check('no partial files left', not list(FILES.rglob('*.part')) and not (DRAFT / 'Report' / 'big.bin').exists())
    s, j = up('Report', 'cross.txt', b'x')
    s2, _, _ = req('POST', '/api/upload?folder=Report&name=cross2.txt', b'x', headers={'Origin': 'http://evil.example'})
    check('upload with foreign origin rejected', s2 == 403 and not (DRAFT / 'Report' / 'cross2.txt').exists())
    big = os.urandom(3 * 1024 * 1024 + 17)
    s, j = up('Data (csv, excel, graphs)', 'big.bin', big)
    check('multi-chunk upload intact', s == 200 and (DRAFT / 'Data (csv, excel, graphs)' / 'big.bin').read_bytes() == big)
    files = jget('/api/files')[1]
    rep = next(g for g in files if g['folder'] == 'Report')
    check('/api/files lists uploads', 'Report/hello (2).txt' in rep['files'], rep)

    print('\n[remove]')
    (DRAFT / 'Report' / 'mine-before.pdf').write_bytes(b'%PDF-1.4 pre-existing')
    check('remove session upload', jpost('/api/remove', {'path': 'Report/hello (3).txt'})[0] == 200 and
          not (DRAFT / 'Report' / 'hello (3).txt').exists())
    s, j = jpost('/api/remove', {'path': 'Report/mine-before.pdf'})
    check('pre-existing file protected', s == 403 and (DRAFT / 'Report' / 'mine-before.pdf').exists(), s)
    for bad in ('../.aura/brief/brief.json', 'Report/../../.aura/aura.config.json', 'C:/Windows/win.ini', '', None, 5):
        check(f'remove {bad!r} refused', jpost('/api/remove', {'path': bad})[0] in (400, 403))
    check('remove twice refused', jpost('/api/remove', {'path': 'Report/hello (3).txt'})[0] == 403)
    check('config untouched', (AURA / 'aura.config.json').exists())

    print('\n[brief round trip]')
    brief = {'basics': {'type': 'Thesis defence', 'title': 'Pulsating heat pipes', 'subtitle': 'Under vacuum'},
             'people': {'presenters': [{'name': 'A. B. Doe', 'id': 1000001, 'role': 'Presenter'}]},
             'audience': {'who': ['Teachers', 'Students'], 'level': 'Some background', 'minutes': 12},
             'work': {'results': [{'what': 'R_th drop', 'value': 38}]},
             'look': {'theme': 'Pink Punch'}, 'style': {'threeD': 'yes', 'twoD': 'no', 'amount': 75},
             'extra': {'notes': 'ask-me please'}, 'unknown': {'kept': True}}
    s, j = jpost('/api/brief', brief)
    s2, back = jget('/api/brief')
    check('brief saved', s == 200 and j.get('savedAt'))
    check('brief round trip', back.get('style') == brief['style'] and back.get('unknown') == {'kept': True} and back.get('_savedAt'))
    md = (AURA / 'brief' / 'brief.md').read_text(encoding='utf-8')
    # Pink Punch has its own LOOK.md now, so the look OVERRIDES the style answers and the brief says so, keeping
    # what the person answered on a separate "they had also answered" row. A look with no spec still reports the
    # raw answers - that case is covered by the 'Claude chooses' post below.
    for want in ('## Look and motion', '- **Theme:** Pink Punch', '- **3D simulations:** Pink Punch decides',
                 '- **2D animations:** Pink Punch decides',
                 '- **Amount of illustration and animation:** Pink Punch decides',
                 'overridden by Pink Punch', 'A. B. Doe - 1000001 - Presenter',
                 'R_th drop - 38'):
        check(f'brief.md has {want!r}', want in md, md[:400])
    jpost('/api/brief', dict(brief, look={'theme': 'Claude chooses'}, style={'amount': 10}))
    md2 = (AURA / 'brief' / 'brief.md').read_text(encoding='utf-8')
    check('amount label derived (Minimal) and Claude chooses text', '10 / 100 (Minimal)' in md2 and 'Claude chooses (pick' in md2)
    check('bad JSON -> 400', req('POST', '/api/brief', b'{nope', headers={'Content-Type': 'application/json'})[0] == 400)
    check('non-object JSON -> 400', req('POST', '/api/brief', b'[1,2]')[0] == 400)
    jpost('/api/brief', brief)   # leave the ask-me note in for the run below

    print('\n[open-slides / login (no launch)]')
    (SANDBOX / '4 - Your slides' / 'x.html').write_text('<p>x</p>', encoding='utf-8')
    check('open slides folder', jpost('/api/open-slides', {})[0] == 200)
    check('open deck inside slides', jpost('/api/open-slides', {'path': '4 - Your slides/x.html'})[0] == 200)
    check('open deck relative to slides', jpost('/api/open-slides', {'path': 'x.html'})[0] == 200)
    for bad in ('../3 - Put your files here/Report/hello.txt', '4 - Your slides/../.aura/aura.config.json',
                str(SANDBOX / '.aura' / 'aura.config.json'), 'C:/Windows/notepad.exe', '4 - Your slides/../../x.html'):
        check(f'open-slides {bad[:40]!r} refused', jpost('/api/open-slides', {'path': bad})[0] in (403, 404))
    check('open-vscode is gone (404)', jpost('/api/open-vscode')[0] == 404)
    check('login answers (no window in tests)', jpost('/api/claude/login')[0] == 200)

    print('\n[fake Claude run]')
    s, st = jget('/api/claude/status?refresh=1')
    check('status: cli + signed in', st.get('cli') is True and st.get('signedIn') is True and st.get('running') is False, st)
    check('reply without a session refused', jpost('/api/claude/reply', {'text': 'hi'})[0] == 409)
    # The "skip, i'm in a hurry" flow is gone (interview plan section 9): a brand-new deck is never born here any
    # more, so this route only carries on a deck that already exists.
    check('start without a deckId is refused now that the hurry flow is gone', jpost('/api/claude/start')[0] == 400)
    H = legacy_one_go(jpost('/api/decks')[1].get('id'))
    s, j = jpost('/api/claude/start', {'deckId': H})
    check('start ok', s == 200 and j.get('ok'), (s, j))
    s2, _ = jpost('/api/claude/start', {'deckId': H})
    check('second start while running -> 409', s2 == 409, s2)
    j = wait_run()
    kinds = [e['kind'] for e in j['events']]
    check('events: status, say, tool, tool-error, done', all(k in kinds for k in ('status', 'say', 'tool', 'tool-error', 'done')), kinds)
    check('waiting after [[aura:ask]]', j.get('waiting') is True, j.get('waiting'))
    sid = j.get('sessionId')
    check('session id recorded', bool(sid))
    tools = [e for e in j['events'] if e['kind'] == 'tool']
    check('tool detail is short and human', any(e.get('detail') == '.aura/brief/brief.md' and e.get('tool') == 'Read' for e in tools) and
          any(e.get('detail') == 'node --version' for e in tools), tools[:3])
    check('non-JSON warning ignored', not any('Ignoring' in (e.get('text') or '') for e in j['events']))
    check('events have i, t, kind, text', all({'i', 't', 'kind', 'text'} <= set(e) for e in j['events']))
    s, part = jget(f"/api/claude/events?since={j['next'] - 2}")
    check('events?since=n pages', len(part['events']) == 2 and part['next'] == j['next'])
    s, j2 = jpost('/api/claude/reply', {'text': 'Only on the title slide, please.'})
    check('reply ok', s == 200 and j2.get('ok'), j2)
    j = wait_run()
    tail = j['events'][j['events'].index(next(e for e in j['events'] if e['kind'] == 'user')):]
    check('user event recorded', tail[0]['text'] == 'Only on the title slide, please.')
    check('resume kept the session (--resume)', j.get('sessionId') == sid and any(sid[:8] in (e.get('text') or '') for e in tail), sid)
    check('finished ok with lastDeck', tail[-1]['kind'] == 'done' and tail[-1].get('ok') is True and
          str(j.get('lastDeck')).endswith('/Pulsating heat pipes.html') and not j.get('waiting'), (tail[-1], j.get('lastDeck')))
    check('v0.5: a one-go deck packs into its work folder, not 4 - Your slides',
          str(j.get('lastDeck')).startswith('.aura/decks/') and (SANDBOX / j['lastDeck']).is_file() and
          not (SANDBOX / '4 - Your slides' / 'Pulsating heat pipes.html').exists(), j.get('lastDeck'))
    check('the editable deck cannot be opened from 4 - Your slides', jpost('/api/open-slides', {'path': j['lastDeck']})[0] in (403, 404))

    print('\n[stop]')
    s, _ = jpost('/api/claude/reply', {'text': 'take-your-time please'})
    time.sleep(1.0)
    check('long run is running', jget('/api/claude/status')[1].get('running') is True)
    t0 = time.time()
    s, j = jpost('/api/claude/stop')
    check('stop returns quickly and not running', s == 200 and j.get('running') is False and time.time() - t0 < 10, (s, j))
    ev = jget('/api/claude/events?since=0')[1]
    check('stopped event', ev['events'][-1]['kind'] == 'done' and ev['events'][-1].get('code') == 'stopped', ev['events'][-1])
    n = ev['next']; time.sleep(1.5)
    check('no events after stop (process tree gone)', jget('/api/claude/events?since=0')[1]['next'] == n)
    check('fake process killed', 'fake_claude.py' not in python_cmdlines(), 'fake still alive')

    print('\n[errors: sign-in, usage limit, crash]')
    jpost('/api/claude/reply', {'text': 'auth-fail'}); j = wait_run()
    check('sign-in problem -> error code auth', j['events'][-1]['kind'] == 'error' and j['events'][-1].get('code') == 'auth', j['events'][-1])
    check('status shows signed out after auth error', jget('/api/claude/status')[1].get('signedIn') is False)
    jpost('/api/claude/reply', {'text': 'rate-limit'}); j = wait_run()
    lim = [e for e in j['events'][-4:] if e['kind'] == 'limit']
    check('rate limit -> limit event with resetsAt', lim and lim[0].get('resetsAt') and 'resets at' in lim[0]['text'], j['events'][-3:])
    jpost('/api/claude/reply', {'text': 'crash'}); j = wait_run()
    check('crash -> error failed', j['events'][-1]['kind'] == 'error' and j['events'][-1].get('code') == 'failed', j['events'][-1])
    check('state file under .aura/temp', (AURA / 'temp' / 'claude-state.json').is_file() and (AURA / 'temp' / 'claude-events.jsonl').is_file())


def run_and_wait(path, body):
    """POST a start/reply, wait for the run, return (status, response, the new events)."""
    n = jget('/api/claude/status')[1].get('eventCount', 0)
    s, j = jpost(path, body)
    ev = wait_run(60)['events'][n:] if s == 200 else []
    return s, j, ev


def legacy_one_go(deck_id):
    """Turn a fresh record into exactly a v0.5.3 "skip, i'm in a hurry" deck: in the one-go flow and from before the
    interview existed. Lumi cannot make one of these any more (the hurry flow is deleted), but published installs are
    full of them, so the build path they use has to keep working."""
    f = AURA / 'decks' / f'{deck_id}.json'
    rec = json.loads(f.read_text(encoding='utf-8'))
    rec['flow'] = 'hurry'
    rec.pop('interviewState', None)
    f.write_text(json.dumps(rec, indent=2), encoding='utf-8')
    return deck_id


def fake_argv(evs):
    for e in evs:
        if e['kind'] == 'say' and e['text'].startswith('[fake-argv] '):
            return json.loads(e['text'][len('[fake-argv] '):])
    return None


def raw_sess(deck_id):
    """The deck's one conversation id, straight off its record."""
    return json.loads((AURA / 'decks' / f'{deck_id}.json').read_text(encoding='utf-8')).get('sessionId')


def flag(argv, name):
    return argv[argv.index(name) + 1] if argv and name in argv and argv.index(name) + 1 < len(argv) else None


def run_v3_suite():
    sys.path.insert(0, str(REPO / 'engine'))
    sys.dont_write_bytecode = True
    import form_server as fs
    SLIDES = SANDBOX / '4 - Your slides'

    print('\n[quality flags]')
    check('just-right (the default) -> opus/medium + sonnet fallback',
          fs.quality_flags('just-right') == ['--model', 'opus', '--effort', 'medium', '--fallback-model', 'sonnet'])
    check('maximum -> opus/high + fallback', fs.quality_flags('maximum') == ['--model', 'opus', '--effort', 'high', '--fallback-model', 'sonnet'])
    check('balanced -> sonnet/high', fs.quality_flags('balanced') == ['--model', 'sonnet', '--effort', 'high'])
    check('the picker offers exactly three tiers', set(fs.QUALITIES) == {'just-right', 'maximum', 'balanced'} and len(fs.QUALITIES) == 3)
    check('"best quality" is gone as a name, and an old deck saved with it still runs opus/high',
          'best' not in fs.QUALITIES and fs.quality_flags('best') == fs.quality_flags('maximum'))
    check('"even better" and "fast" are gone too, and keep the pair they meant',
          fs.quality_flags('better') == fs.quality_flags('maximum')
          and fs.quality_flags('fast') == ['--model', 'sonnet', '--effort', 'medium'])
    check('unknown -> just-right (the default)', fs.quality_flags('ultra') == fs.quality_flags(None) == fs.quality_flags('just-right'))
    check('planning quality is sonnet/high', fs.quality_flags(fs.PLAN_QUALITY) == ['--model', 'sonnet', '--effort', 'high'])
    brief = {'basics': {'title': 'Heat pipes v3'}, 'look': {'theme': 'Bold Blue'}, 'style': {'quality': 'just-right', 'amount': 60}}
    jpost('/api/brief', brief)
    md = (AURA / 'brief' / 'brief.md').read_text(encoding='utf-8')
    check('brief.md has the Quality row', '- **Quality:** Just right' in md, md[:600])
    s, j = jpost('/api/decks')
    A = j.get('id')
    rec = json.loads((AURA / 'decks' / f'{A}.json').read_text(encoding='utf-8')) if A else {}
    check('POST /api/decks makes a record from the draft', s == 200 and rec.get('title') == 'Heat pipes v3' and
          rec.get('quality') == 'just-right' and rec.get('look') == 'Bold Blue' and rec.get('brief', {}).get('basics') == brief['basics'] and
          rec.get('file') is None and j.get('deck', {}).get('status') == 'draft', (s, j))
    check('record has every field', all(k in rec for k in ('id', 'title', 'file', 'look', 'quality', 'createdAt', 'updatedAt',
                                                          'sessionId', 'brief')), list(rec))
    s, j, ev = run_and_wait('/api/claude/start', {'deckId': A})
    argv = fake_argv(ev)
    check('start for a deck ok', s == 200 and j.get('deckId') == A and j.get('quality') == 'just-right', j)
    check('start uses the default tier (just right: opus / medium)',
          flag(argv, '--model') == 'opus' and flag(argv, '--effort') == 'medium' and
          flag(argv, '--fallback-model') == 'sonnet' and '--resume' not in argv and '--settings' in argv, argv)
    rec = jget(f'/api/decks/{A}')[1].get('deck', {})
    check('record learned session, file and build', rec.get('sessionId') and rec.get('file') == '4 - Your slides/Heat pipes v3.html' and
          rec.get('build') == 'heat-pipes-v3' and rec.get('status') == 'ready' and rec.get('url') == f'/deck/{A}/', rec)
    sessA = rec.get('sessionId')
    check('events are tagged with the deck', ev and all(e.get('deck') == A for e in ev), [e.get('deck') for e in ev][:5])
    done = [e for e in ev if e['kind'] == 'done']
    hint_say = [e for e in ev if e['kind'] == 'say' and '[[aura:hint slide=3 text="add a simple diagram of the method"]]' in e['text']]
    check('hint markers pass through untouched', hint_say and done and done[-1]['text'].count('[[aura:hint ') == 3, done[-1:] )

    s, j = req('PATCH', f'/api/decks/{A}', {'quality': 'balanced', 'title': 'Renamed deck'})[0], None
    rec = jget(f'/api/decks/{A}')[1].get('deck', {})
    check('PATCH quality + title', s == 200 and rec.get('quality') == 'balanced' and rec.get('title') == 'Renamed deck', (s, rec))
    check('PATCH bad quality -> 400', req('PATCH', f'/api/decks/{A}', {'quality': 'turbo'})[0] == 400)
    check('PATCH unknown deck -> 404', req('PATCH', '/api/decks/nope123', {'title': 'x'})[0] == 404)
    check('PATCH foreign origin -> 403', req('PATCH', f'/api/decks/{A}', {'title': 'x'}, headers={'Origin': 'http://evil.example'})[0] == 403)

    s, j, ev = run_and_wait('/api/claude/reply', {'deckId': A, 'text': 'make it pop', 'slide': 3})
    argv = fake_argv(ev)
    heard = next((e['text'] for e in ev if e['kind'] == 'say' and e['text'].startswith('[fake-heard] ')), '')
    user = next((e for e in ev if e['kind'] == 'user'), {})
    check('reply uses the deck quality (balanced)', flag(argv, '--model') == 'sonnet' and flag(argv, '--effort') == 'high' and
          '--fallback-model' not in argv, argv)
    check('reply resumes the deck session', flag(argv, '--resume') == sessA, (flag(argv, '--resume'), sessA))
    check('slide prefix reaches Claude, user event keeps plain text', heard == '[fake-heard] [slide 3] make it pop' and
          user.get('text') == 'make it pop' and user.get('slide') == 3, (heard, user))
    check('reply bad slide -> 400', jpost('/api/claude/reply', {'deckId': A, 'text': 'x', 'slide': 0})[0] == 400)
    check('reply unknown deck -> 404', jpost('/api/claude/reply', {'deckId': 'nope123', 'text': 'x'})[0] == 404)
    check('reply bad deck id -> 400', jpost('/api/claude/reply', {'deckId': '../x', 'text': 'x'})[0] == 400)

    print('\n[new deck from start + choice marker]')
    jpost('/api/brief', {'basics': {'title': 'Ask deck'}, 'extra': {'notes': 'ask-me please'}})
    B = legacy_one_go(jpost('/api/decks')[1].get('id'))
    s, j, ev = run_and_wait('/api/claude/start', {'deckId': B})
    argv = fake_argv(ev)
    check('a record made from the draft brief can still be built in one go', s == 200 and B and B != A and (AURA / 'decks' / f'{B}.json').is_file(), j)
    check('default quality is just right (opus/medium)', flag(argv, '--model') == 'opus' and flag(argv, '--effort') == 'medium', argv)
    choice = '[[aura:choice id="q1" question="Which look?" options="Bold Blue|Flat-Pack|Claude chooses"]]'
    check('choice marker passes through untouched', any(e['kind'] == 'say' and choice in e['text'] for e in ev) and
          jget('/api/claude/status')[1].get('waiting') is True, [e['text'][:80] for e in ev if e['kind'] == 'say'])
    recB = jget(f'/api/decks/{B}')[1].get('deck', {})
    check('asking deck has a session but no file yet', recB.get('sessionId') and recB.get('status') == 'draft', recB)
    s, j, ev = run_and_wait('/api/claude/reply', {'deckId': B, 'text': 'Bold Blue'})
    recB = jget(f'/api/decks/{B}')[1].get('deck', {})
    check('answer finishes the deck', recB.get('file') == f'.aura/decks/{B}/Ask deck.html' and recB.get('status') == 'ready' and
          recB.get('flow') == 'hurry' and not recB.get('finalized'), recB)
    s, j, ev = run_and_wait('/api/claude/reply', {'deckId': A, 'text': 'back to the first deck'})
    check('switching decks resumes the right session', flag(fake_argv(ev), '--resume') == sessA and
          jget('/api/claude/status')[1].get('deckId') == A, flag(fake_argv(ev), '--resume'))

    print('\n[deck library]')
    (SLIDES / 'Old talk.html').write_text('<!doctype html><html><head><title>Old talk</title><style>.slide{width:1920px;height:1080px;'
                                          'font-size:60px}</style></head><body><section class="slide"><h1>Old talk</h1></section>'
                                          '</body></html>', encoding='utf-8')
    s, j = jget('/api/decks')
    decks = j.get('decks') or []
    ids = [d['id'] for d in decks]
    old = [d for d in decks if d.get('file') == '4 - Your slides/Old talk.html']
    check('GET /api/decks lists A and B', s == 200 and A in ids and B in ids, ids)
    check('loose deck migrated into a record', len(old) == 1 and old[0].get('migrated') and old[0].get('title') == 'Old talk' and
          old[0].get('status') == 'ready', old)
    check('migration does not duplicate', len([d for d in jget('/api/decks')[1]['decks'] if d.get('file') == '4 - Your slides/Old talk.html']) == 1)
    check('newest first', [d['updatedAt'] for d in decks] == sorted([d['updatedAt'] for d in decks], reverse=True))
    check('deck view has thumb url', next(d for d in decks if d['id'] == A).get('thumb', '').startswith(f'/api/decks/{A}/thumb.png?v='))
    check('unknown deck -> 404', jget('/api/decks/nope123')[0] == 404 and jget('/api/decks/..%2f..%2fx')[0] == 404)
    s, h, d = req('GET', f'/deck/{A}/')
    check('/deck/<id>/ serves the packed deck', s == 200 and h.get('content-type', '').startswith('text/html') and b'data-edit="s1-t1"' in d, s)
    s, h, d = req('GET', f'/deck/{A}')
    check('/deck/<id> redirects to the slash form', s == 301 and h.get('location') == f'/deck/{A}/', (s, h.get('location')))
    (SLIDES / 'pic.png').write_bytes(b'\x89PNG\r\n\x1a\nfake')
    check('/deck/<id>/<asset> serves a relative file', req('GET', f'/deck/{A}/pic.png')[0] == 200)
    for bad in ('/deck/nope123/', f'/deck/{A}/../../.aura/aura.config.json', f'/deck/{A}/%2e%2e/%2e%2e/.aura/aura.config.json',
                f'/deck/{A}/..%5c..%5c.aura%5caura.config.json', f'/deck/{A}/x.py', f'/deck/{A}/Old%20talk.html', f'/deck/{B}/.hidden.png'):
        check(f'blocked {bad[:50]}', req('GET', bad)[0] == 404)
    check('POST to /deck refused', req('POST', f'/deck/{A}/', {})[0] == 404)

    print('\n[thumbnails (real render with Edge)]')
    t0 = time.time()
    s, h, d = req('GET', f'/api/decks/{A}/thumb.png')
    check('thumb.png renders', s == 200 and h.get('content-type') == 'image/png' and d[:8] == b'\x89PNG\r\n\x1a\n', (s, d[:80]))
    print(f'    (first render {time.time() - t0:.1f}s)')
    t0 = time.time()
    s, j = jget(f'/api/decks/{A}/slides')
    check('slides list from cache', s == 200 and j.get('count') == 5 and len(j['slides']) == 5 and time.time() - t0 < 2, (s, j))
    check('slides have titles and urls', j.get('slides') and j['slides'][2]['n'] == 3 and
          j['slides'][2]['url'].startswith(f'/api/decks/{A}/slides/3.png?v=') and j['slides'][1]['title'] == 'The problem', j.get('slides'))
    s, h, d = req('GET', j['slides'][4]['url']) if j.get('slides') else (0, {}, b'')
    check('slide 5 png', s == 200 and d[:4] == b'\x89PNG')
    check('slide 9 -> 404', req('GET', f'/api/decks/{A}/slides/9.png')[0] == 404)
    check('PNG cached under .aura/temp/thumbs', (AURA / 'temp' / 'thumbs' / A / 'slide-01.png').is_file())
    jpost('/api/brief', {'basics': {'title': 'Draft only'}})
    D = jpost('/api/decks')[1].get('id')
    check('thumb of a draft deck -> 404', req('GET', f'/api/decks/{D}/thumb.png')[0] == 404)

    print('\n[direct text tweaks]')
    check('patch_text nested same tag', fs.patch_text('<div data-edit="a"><div>x</div></div><div>y</div>', 'a', 'Z') ==
          '<div data-edit="a">Z</div><div>y</div>')
    check('patch_text exact id only', fs.patch_text('<p data-edit="ab">1</p><p data-edit="a">2</p>', 'a', 'Q') ==
          '<p data-edit="ab">1</p><p data-edit="a">Q</p>')
    check('patch_text quotes, escaping, line breaks', fs.patch_text("<h2 class=t data-edit='s1'>old</h2>", 's1', 'a<b>&\nc') ==
          "<h2 class=t data-edit='s1'>a&lt;b&gt;&amp;<br>c</h2>")
    check('patch_text unquoted id', fs.patch_text('<span data-edit=s9 x>old</span>', 's9', 'n') == '<span data-edit=s9 x>n</span>')
    check('patch_text missing -> None', fs.patch_text('<p data-edit="b">x</p>', 'a', 'Z') is None)
    check('patch_text skips script text', fs.patch_text('<p data-edit="a">x<script>var s="</p>"</script>y</p>z', 'a', 'Q') == '<p data-edit="a">Q</p>z')
    packed = SLIDES / 'Heat pipes v3.html'
    build = AURA / 'temp' / 'build' / 'heat-pipes-v3' / 'index.html'
    s, j = jpost(f'/api/decks/{A}/text', {'editId': 's1-t2', 'text': 'Hello <b>world</b> & co'})
    want = 'data-edit="s1-t2">Hello &lt;b&gt;world&lt;/b&gt; &amp; co</p>'
    check('text tweak ok in packed + build', s == 200 and j.get('ok') and len(j.get('patched', [])) == 2 and
          want in packed.read_text(encoding='utf-8') and want in build.read_text(encoding='utf-8'), (s, j))
    before_p, before_b = packed.read_bytes(), build.read_bytes()
    s, j = jpost(f'/api/decks/{A}/text', {'editId': 's2-t1', 'text': 'A very long title ' * 8})
    check('too-small text rejected by the 26 px rule', s == 200 and j.get('ok') is False and j.get('error') == 'rules' and
          '26 px' in j.get('reason', ''), j)
    check('rejected tweak reverted both files', packed.read_bytes() == before_p and build.read_bytes() == before_b)
    check('unknown edit id -> 404', jpost(f'/api/decks/{A}/text', {'editId': 's9-t9', 'text': 'x'})[0] == 404)
    check('bad edit id -> 400', jpost(f'/api/decks/{A}/text', {'editId': '"><x', 'text': 'x'})[0] == 400)
    check('non-string text -> 400', jpost(f'/api/decks/{A}/text', {'editId': 's1-t1', 'text': 5})[0] == 400)
    check('text tweak on a draft -> 404', jpost(f'/api/decks/{D}/text', {'editId': 's1-t1', 'text': 'x'})[0] == 404)
    check('text tweak foreign origin -> 403', req('POST', f'/api/decks/{A}/text', {'editId': 's1-t1', 'text': 'x'},
                                                  headers={'Origin': 'http://evil.example'})[0] == 403)
    s, j = jget(f'/api/decks/{A}/slides')
    check('slide pictures re-rendered after a tweak', s == 200 and j.get('count') == 5 and
          json.loads((AURA / 'temp' / 'thumbs' / A / 'stamp.json').read_text(encoding='utf-8'))['mtime'] == packed.stat().st_mtime)

    print('\n[usage]')
    s, j = jget('/api/usage')
    u = j.get('usage') or {}
    check('usage from the last rate_limit_event', s == 200 and u.get('utilization') == 0.42 and u.get('status') == 'allowed' and
          isinstance(u.get('resetsAt'), int) and u.get('type') == 'five_hour' and u.get('capturedAt'), j)
    check('usage has subscriptionType', j.get('subscriptionType') == 'max', j)
    run_and_wait('/api/claude/reply', {'deckId': A, 'text': 'usage-windows check'})
    u = jget('/api/usage')[1].get('usage') or {}
    check('unifiedWindows.five_hour utilization read', u.get('utilization') == 0.81 and u.get('status') == 'allowed_warning' and
          u.get('resetsAt'), u)
    check('usage.json under .aura/temp', (AURA / 'temp' / 'usage.json').is_file())
    check('status has deckId + subscriptionType', jget('/api/claude/status')[1].get('subscriptionType') == 'max')


def plan_of(deck_id):
    return jget(f'/api/decks/{deck_id}/plan')[1]


def wait_plan_idle(deck_id, timeout=60):
    """Until Claude is done with this deck and nothing is queued or re-planning."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        j = plan_of(deck_id)
        busy = j.get('running') or j.get('queued') or any(x.get('status') in ('queued', 'replanning')
                                                          for x in (j.get('plan') or {}).get('slides') or [])
        st = jget('/api/claude/status')[1]
        if not busy and not st.get('running') and not st.get('settling'): return plan_of(deck_id)   # after_run done (S-03)
        time.sleep(0.25)
    return plan_of(deck_id)


def heard(evs):
    return [e['text'][len('[fake-heard] '):] for e in evs if e['kind'] == 'say' and e['text'].startswith('[fake-heard] ')]


def events_from(n):
    return jget(f'/api/claude/events?since={n}')[1].get('events', [])


def save(deck_id, plan, replan=None):
    return jpost(f'/api/decks/{deck_id}/plan', {'plan': plan, **({'replan': replan} if replan else {})})


def run_v5_suite():
    import form_server as fs
    SLIDES = SANDBOX / '4 - Your slides'

    print('\n[v0.5 clash matrix and word caps]')
    check('3d + labels is fine', fs.clash_reason('3d', 'labels') == '')
    check('chart + labels clashes with a plain reason', 'only works with a 3D model' in fs.clash_reason('chart', 'labels'))
    check('two main pictures clash', 'one main picture' in fs.clash_reason('3d', 'chart'))
    plan, probs, _ = fs.normalize_plan({'slides': [{'id': 's1', 'title': 'A', 'visual': {'main': 'chart', 'companions': ['labels']}}]}, strict=True)
    check('strict save reports the clash', probs and probs[0]['error'] == 'clash' and probs[0]['item'] == 'labels', probs)
    plan, probs, rep = fs.normalize_plan({'slides': [{'id': 's1', 'title': 'A', 'visual': {'main': ['3d', 'chart'], 'companions': ['labels', 'notes']}}]})
    sl = plan['slides']
    check('lenient: the second main picture gets its own slide', len(sl) == 2 and sl[0]['visual']['main'] == '3d' and
          sl[1]['visual']['main'] == 'chart' and sl[0]['visual']['companions'] == ['labels'] and len(rep) == 2, (sl, rep))
    check('3d gets detail + motion, others none', sl[0]['visual']['detail'] == 'detailed' and sl[0]['visual']['motion'] == 'timed' and
          sl[1]['visual']['detail'] is None, sl)
    check('word cap from hard-rules (per look, and the default for a look with no entry)',
          fs.word_cap('Bold Blue') == 55 and fs.word_cap('Pink Punch') == 30 and fs.word_cap('Clay Pop') == 40
          and fs.word_cap('No Such Look') == fs.DEFAULT_WORD_CAP)

    print('\n[v0.5 planning]')
    jpost('/api/brief', {'basics': {'title': 'Plan deck'}, 'look': {'theme': 'Bold Blue'}, 'style': {'quality': 'just-right'}})
    n0 = jget('/api/claude/status')[1].get('eventCount', 0)
    s, j = jpost('/api/plan/start', {})
    P = j.get('deckId')
    check('plan start makes a plan-flow deck', s == 200 and P and jget(f'/api/decks/{P}')[1]['deck'].get('flow') == 'plan', (s, j))
    check('second start while planning -> 409', jpost('/api/plan/start', {})[0] == 409)
    pj = wait_plan_idle(P)
    argv = fake_argv(events_from(n0))
    check('planning runs on sonnet/high, a new session', flag(argv, '--model') == 'sonnet' and flag(argv, '--effort') == 'high' and
          '--resume' not in argv and '--fallback-model' not in argv, argv)
    plan = pj.get('plan') or {}
    ids = [x['id'] for x in plan.get('slides') or []]
    check('plan ready with 11 slides (10 + one split)', pj.get('planState') == 'ready' and len(ids) == 11, (pj.get('planState'), ids))
    s5 = next((x for x in plan['slides'] if x['id'] == 's5'), {})
    check('Claude clash repaired: labels left out of the chart slide', s5.get('visual', {}).get('companions') == ['notes'], s5)
    i6 = ids.index('s6')
    check('Claude two mains split onto their own slides', plan['slides'][i6]['visual']['main'] == '3d' and
          plan['slides'][i6 + 1]['visual']['main'] == 'chart' and plan.get('repairs'), plan['slides'][i6:i6 + 2])
    doubts = plan.get('doubts') or []
    check('doubts: one deck-wide, one for slide s3, each with a default', len(doubts) == 2 and
          {d['scope'] for d in doubts} == {'deck', 'slide'} and any(d['slide'] == 's3' for d in doubts) and
          all(d['default'] for d in doubts), doubts)
    check('slide with a doubt is marked', next(x for x in plan['slides'] if x['id'] == 's3').get('status') == 'doubt')
    check('word cap of the look in the payload', pj.get('wordCap') == 55, pj.get('wordCap'))
    f = AURA / 'decks' / P / 'plan.json'
    check('plan.json kept in the work folder', f.is_file() and len(json.loads(f.read_text(encoding='utf-8'))['slides']) == 11)
    sessP = jget(f'/api/decks/{P}')[1]['deck'].get('sessionId')
    check('planning session saved on the deck', bool(sessP))

    bad = json.loads(json.dumps(plan)); bad['slides'][0]['visual'] = {'main': 'text', 'companions': ['labels']}
    s, j = save(P, bad)
    check('page save with a clash -> 400 + reason', s == 400 and j.get('error') == 'clash' and 'only works with' in j.get('reason', ''), j)
    bad = json.loads(json.dumps(plan)); bad['slides'][0]['visual'] = {'main': '3d', 'companions': ['chart'], 'detail': 'simple', 'motion': 'still'}
    s, j = save(P, bad)
    check('page save with two main pictures -> 400', s == 400 and j.get('error') == 'clash', j)

    print('\n[v0.5 quick re-plan]')
    edit = json.loads(json.dumps(plan))
    edit['slides'][1]['title'] = 'Problem neighbour'
    n0 = jget('/api/claude/status')[1].get('eventCount', 0)
    s, j = save(P, edit, ['s2'])
    check('save + replan accepted', s == 200 and j.get('ok'), j)
    pj = wait_plan_idle(P)
    ev = events_from(n0)
    argv = fake_argv(ev)
    check('re-plan resumes the same session on sonnet/high', flag(argv, '--resume') == sessP and flag(argv, '--model') == 'sonnet', argv)
    msg = ' '.join(heard(ev))
    check('re-plan message names only that slide', '[plan-edit]' in msg and 's2 ("Problem neighbour")' in msg, msg[:300])
    lc = pj['plan'].get('lastChange') or {}
    s2 = next(x for x in pj['plan']['slides'] if x['id'] == 's2')
    check('re-planned slide is all clear', s2.get('status') == 'clear' and s2.get('title') == 'Problem neighbour', s2)
    check('affected neighbour flagged to flash', lc.get('targets') == ['s2'] and 's3' in lc.get('flash', []), lc)

    plan = pj['plan']
    n0 = jget('/api/claude/status')[1].get('eventCount', 0)
    e1 = json.loads(json.dumps(plan)); e1['slides'][3]['point'] = 'first quick edit'
    save(P, e1, ['s4'])
    e2 = json.loads(json.dumps(e1)); e2['slides'][7]['point'] = 'second quick edit'
    save(P, e2, [e2['slides'][7]['id']])
    e3 = json.loads(json.dumps(e2)); e3['slides'][8]['point'] = 'third quick edit'
    s, j = save(P, e3, [e3['slides'][8]['id']])
    check('edits while Claude runs are queued', bool(j.get('queued')) or j.get('running'), (j.get('queued'), j.get('running')))
    pj = wait_plan_idle(P)
    users = [e['text'] for e in events_from(n0) if e['kind'] == 'user']
    check('quick edits go together in one queued re-plan', len(users) <= 2 and any('2 slides' in u for u in users), users)
    check('the user words survived the re-plan', [x['point'] for x in pj['plan']['slides']][7] == 'second quick edit', pj['plan']['slides'][7])

    dk = next(d for d in pj['plan']['doubts'] if d['scope'] == 'deck')
    n0 = jget('/api/claude/status')[1].get('eventCount', 0)
    s, j = jpost(f'/api/decks/{P}/plan/answer', {'id': dk['id'], 'answer': 'Both', 'other': 'mostly examiners'})
    pj = wait_plan_idle(P)
    msg = ' '.join(heard(events_from(n0)))
    dk2 = next(d for d in pj['plan']['doubts'] if d['id'] == dk['id'])
    check('deck-wide answer goes to Claude', s == 200 and 'the whole deck' in msg and 'Both' in msg and 'mostly examiners' in msg, msg[:300])
    check('answered doubt kept as answered', dk2.get('answer') == 'Both' and dk2.get('applied'), dk2)
    check('bad answer -> 400', jpost(f'/api/decks/{P}/plan/answer', {'id': dk['id'], 'answer': 'Nope'})[0] == 400)

    e = json.loads(json.dumps(pj['plan'])); e['slides'][9]['title'] = 'Limits doubt'
    sid9 = e['slides'][9]['id']
    save(P, e, [sid9])
    pj = wait_plan_idle(P)
    s9 = next(x for x in pj['plan']['slides'] if x['id'] == sid9)
    check('a re-plan can come back with a new doubt card', s9.get('status') == 'doubt' and
          any(d.get('slide') == sid9 and not d.get('answer') for d in pj['plan']['doubts']), s9)

    s, j = jpost(f'/api/decks/{P}/plan/suggest', {'after': 's2'})
    nid = j.get('newId')
    pj = wait_plan_idle(P)
    ids = [x['id'] for x in pj['plan']['slides']]
    sg = next((x for x in pj['plan']['slides'] if x['id'] == nid), {})
    check('"Claude, suggest one here" fills a new slide after s2', s == 200 and nid and ids.index(nid) == ids.index('s2') + 1 and
          sg.get('title') == 'Suggested slide' and sg.get('status') == 'clear', (ids, sg))

    e = json.loads(json.dumps(pj['plan']))
    last = e['slides'].pop(); e['slides'].insert(1, last)                       # drag the last slide to place 2
    dup = json.loads(json.dumps(e['slides'][2])); dup['id'] = 'copy-1'; e['slides'].insert(3, dup)   # duplicate
    e['slides'] = [x for x in e['slides'] if x['id'] != 's10']                  # remove
    s, j = save(P, e)
    ids2 = [x['id'] for x in j.get('plan', {}).get('slides') or []]
    check('reorder, duplicate and remove are saved', s == 200 and ids2[1] == last['id'] and 'copy-1' in ids2 and 's10' not in ids2, ids2)
    check('no re-plan without replan ids', not j.get('queued') and not j.get('running'), j.get('queued'))

    check('file name: colon becomes a dash, no underscore in words', fs.title_to_filename('Pulsating jets: a scramjet? "x"/y') == 'Pulsating jets - a scramjet x-y')
    check('plan title beats the brief title', fs.deck_display_title({'title': 'Brief title', 'plan': {'title': 'Plan title', 'slides': []}}) == 'Plan title')
    check('slide 1 title is the fallback', fs.deck_display_title({'title': 'Brief title', 'plan': {'slides': [{'title': 'First slide'}]}}) == 'First slide')
    check('a title the user typed wins', fs.deck_display_title({'title': 'Mine', 'titleUser': True, 'plan': {'title': 'Plan title'}}) == 'Mine')
    check('the deck record follows the plan title', jget(f'/api/decks/{P}')[1]['deck'].get('title') == plan.get('title'),
          (jget(f'/api/decks/{P}')[1]['deck'].get('title'), plan.get('title')))
    bm = fs.build_message({'id': P, 'plan': plan}, plan['slides'][0], 1, 3)
    check('build message carries the step card: real design decisions, 3-6 for a 3D slide, stop mid-build on a doubt',
          'STEP CARD' in bm and 'REAL design decisions' in bm and 'camera angle' in bm and 'written-out headline wordings' in bm and 'A REAL DOUBT WHILE BUILDING' in bm and 'ONLY where' not in bm)

    print('\n[v0.5 build one slide at a time]')
    e = json.loads(json.dumps(j['plan']))
    e['slides'][1]['title'] = 'Problem ask-me'
    e['slides'][2]['title'] = 'Results ask-deep'
    save(P, e)
    stale_plan = json.loads(json.dumps(plan_of(P)['plan']))      # 0.5.5: what a page holds the moment the build starts
    n0 = jget('/api/claude/status')[1].get('eventCount', 0)
    s, j = jpost(f'/api/decks/{P}/build', {'mode': 'next'})
    check('build next starts slide 1', s == 200 and j.get('n') == 1 and j.get('slide') == e['slides'][0]['id'], (s, j))
    s2, j2 = jpost(f'/api/decks/{P}/build', {'mode': 'next'})
    check('next is locked while Claude runs -> 409', s2 == 409 and j2.get('error') == 'busy', (s2, j2))
    pj = wait_plan_idle(P)
    ev = events_from(n0)
    argv = fake_argv(ev)
    sc1 = (json.loads((AURA / 'decks' / f'{P}.json').read_text(encoding='utf-8')).get('slideConvs') or {}).get('s1') or {}
    # 2026-10-08: one conversation for the whole deck (form_server.ONE_DECK_CONVERSATION). Slide 1 is built by the
    # Claude that planned the deck, so the plan and the look are already in context and no slide opens its own.
    check('slide 1 is built in the deck conversation, with the deck quality',
          flag(argv, '--resume') == sessP and not sc1.get('sessionId') and
          flag(argv, '--model') == 'opus' and flag(argv, '--effort') == 'medium', (argv, sc1))
    check('build message is per slide and per plan', any('[build-slide id=' in h and 'n=1 of=' in h and 'deck shell' in h for h in heard(ev)), heard(ev)[:1])
    shells = list((AURA / 'temp' / 'build').glob(f'*-{P[:6]}/index.html'))
    check('v0.5.1: Lumi made the deck shell itself before slide 1 (Claude needs no shell command for it)', bool(shells), shells)
    check('v0.5.1: the build message names that shell, says Lumi packs, and points at the archetype files',
          any('Lumi already made the deck shell' in h for h in heard(ev)) and all(x in fs.build_message({'id': P, 'plan': pj['plan'], 'look': 'Bold Blue'},
          pj['plan']['slides'][0], 1, 3, shell='x-1') for x in ('`.aura/temp/build/x-1/index.html`', 'you do not run pack_deck.py', 'archetypes/<name>.html')), heard(ev)[:1])
    check('v0.5.1: the step card no longer asks Claude to pack (the built marker is last)',
          not any('[[aura:done path="<packed file>"]]' in h for h in heard(ev)))
    rec = jget(f'/api/decks/{P}')[1]['deck']
    check('slide 1 built, editable deck in the work folder', pj.get('built') == 1 and pj['plan']['slides'][0].get('built') and
          str(rec.get('file')).startswith(f'.aura/decks/{P}/') and rec.get('status') == 'ready' and not rec.get('finalized'), rec.get('file'))
    check('nothing went to 4 - Your slides', not (SLIDES / 'Plan deck.html').exists())
    e = json.loads(json.dumps(pj['plan'])); e['slides'][0]['title'] = 'changed after building'
    s, j = save(P, e)
    check('a built slide cannot change on the plan -> 409', s == 409 and j.get('error') == 'built', (s, j))
    e = json.loads(json.dumps(pj['plan'])); e['slides'][5]['point'] = 'tweaked in the coming-up popup'
    s, j = save(P, e, [e['slides'][5]['id']])
    check('an unbuilt slide can be saved, the plan is binding (no re-plan)', s == 200 and not j.get('queued') and not j.get('running') and
          j['plan']['slides'][5]['point'] == 'tweaked in the coming-up popup', (s, j.get('queued')))
    # W-01: a new slide may be suggested after the build started, anywhere after the built slides; the person can remove it again
    s, j = jpost(f'/api/decks/{P}/plan/suggest', {'after': 's2'})
    check('suggest after the build started is allowed behind the built slides (W-01)', s == 200 and j.get('newId'), (s, j.get('error')))
    pj = wait_plan_idle(P)
    e = json.loads(json.dumps(pj['plan'])); e['slides'] = [x for x in e['slides'] if x['id'] != j.get('newId')]
    s2_, j2_ = save(P, e)
    check('...and removed again; the built slide and the rest are untouched', s2_ == 200 and len(j2_['plan']['slides']) == len(pj['plan']['slides']) - 1, (s2_, j2_.get('error')))

    # ---- 0.5.5: one slide at a time (plan/slide/add | save | remove). THE BUG: the page saved the WHOLE plan, and the
    # copy it held stopped being true the moment a build step finished - that step writes visual.builtAs (and
    # visual.engine for a 3D slide) into the slide it built, which is exactly what content_of compares. Removing an
    # UNBUILT slide from such a copy was refused as an edit to a BUILT one (409 "built"), and the build page's dialog
    # then sat there eating the next click.
    print('\n[0.5.5 add / remove a slide mid-build]')
    s, j = save(P, stale_plan)
    check('root cause: a plan copied before a build step is refused afterwards (409 built)',
          s == 409 and j.get('error') == 'built', (s, j.get('error')))
    before = plan_of(P)
    s, j = jpost(f'/api/decks/{P}/plan/slide/add', {'slide': {'title': 'added mid build', 'visual': {'main': 'text'}}})
    check('a slide can be added mid-build; the server mints the id and puts it last',
          s == 200 and j.get('newId') and j['count'] == before['count'] + 1 and j['plan']['slides'][-1]['title'] == 'added mid build'
          and j['plan']['slides'][-1]['id'] == j['newId'] and not j['plan']['slides'][-1].get('built'), (s, j.get('error')))
    added = j.get('newId')
    s, j = jpost(f'/api/decks/{P}/plan/slide/add', {'slide': {'title': 'after s2'}, 'after': 's2'})
    ids_ = [x['id'] for x in (j.get('plan') or {}).get('slides') or []]
    check('...or straight after a named slide, as long as that is behind the built ones',
          s == 200 and j.get('newId') and ids_.index(j['newId']) == ids_.index('s2') + 1, (s, j.get('error'), ids_))
    mid = j.get('newId')
    s, j = jpost(f'/api/decks/{P}/plan/slide/save', {'slide': {'id': added, 'title': 'renamed mid build'}})
    check('an unbuilt slide is renamed mid-build without sending a plan',
          s == 200 and next(x for x in j['plan']['slides'] if x['id'] == added)['title'] == 'renamed mid build', (s, j.get('error')))
    s, j = jpost(f'/api/decks/{P}/plan/slide/save', {'slide': {'id': plan_of(P)['plan']['slides'][0]['id'], 'title': 'nope'}})
    check('a BUILT slide is still not changed here (change it on the slide itself)', s == 409 and j.get('error') == 'built', (s, j.get('error')))
    n_before = plan_of(P)['count']
    s, j = jpost(f'/api/decks/{P}/plan/slide/remove', {'slide': mid})
    check('an unbuilt slide is removed with no warning at all, and the count follows',
          s == 200 and j.get('ok') and j.get('wasBuilt') is False and j['count'] == n_before - 1
          and not any(x['id'] == mid for x in j['plan']['slides']), (s, j.get('error')))
    s, j = jpost(f'/api/decks/{P}/plan/slide/remove', {'slide': added})
    check('and the one added mid-build goes the same way (the walk\'s removedGone)',
          s == 200 and not any(x['id'] == added for x in j['plan']['slides']), (s, j.get('error')))
    s, j = jpost(f'/api/decks/{P}/plan/slide/remove', {'slide': 'nosuchslide'})
    check('removing a slide that is not there -> 404', s == 404 and j.get('error') == 'no-slide', (s, j))
    s, j = jpost(f'/api/decks/{P}/plan/slide/add', {'slide': {'title': 'clash'}, 'after': 'nosuchslide'})
    check('adding after a slide that is not there -> 404', s == 404, (s, j))
    s, j = jpost(f'/api/decks/{P}/plan/slide/add', {'slide': {'title': 'bad', 'visual': {'main': 'chart', 'companions': ['labels']}}})
    check('a clash in a new slide is still refused with its plain reason', s == 400 and j.get('error') == 'clash', (s, j.get('error')))
    check('the plan is back to the length it had before all of that', plan_of(P)['count'] == before['count'], plan_of(P)['count'])
    # backward compatibility: a deck published by 0.5.3 / 0.5.4 has no plan at all. The new routes answer it plainly, the
    # old whole-plan save still works on it, and nothing it already does has changed.
    L = legacy_one_go(jpost('/api/decks')[1].get('id'))
    s, j = jpost(f'/api/decks/{L}/plan/slide/remove', {'slide': 's1'})
    check('0.5.3/0.5.4 deck with no plan: remove says so plainly and breaks nothing', s == 404 and j.get('error') == 'no-slide', (s, j))
    s, j = jpost(f'/api/decks/{L}/plan/slide/add', {'slide': {'title': 'first ever slide'}})
    check('...a slide can still be added to it, becoming the first in its plan', s == 200 and j['count'] == 1
          and j['plan']['slides'][0]['title'] == 'first ever slide', (s, j.get('error')))
    check('...and the old whole-plan save still works on it exactly as before', save(L, j.get('plan') or {'slides': []})[0] == 200)

    s, j = jpost(f'/api/decks/{P}/build', {'mode': 'next'})
    pj = wait_plan_idle(P)
    check('Claude asks during a build step: slide stays unbuilt', pj.get('built') == 1 and pj.get('waiting') and
          pj.get('buildTarget') == pj['plan']['slides'][1]['id'], (pj.get('built'), pj.get('waiting'), pj.get('buildTarget')))
    evq = ' '.join(str(e.get('text', '')) for e in jget('/api/claude/events?since=0')[1]['events'])
    check('the build-time question offers a 3D scene choice and a detail choice, then ends the turn with ask',
          'Which real thing should the 3D picture' in evq and 'id="q2"' in evq.split('Which real thing')[1] and '[[aura:ask]]' in evq.split('Which real thing')[1])
    s, j = jpost('/api/claude/reply', {'deckId': P, 'text': 'q1: The whole vehicle in flight'})
    # (answer text goes back as plain lines)
    pj = wait_plan_idle(P)
    check('the answer finishes that slide', pj.get('built') == 2 and not pj.get('buildTarget'), (pj.get('built'), pj.get('buildTarget')))
    t_ = time.time()
    last_check = lambda: (json.loads((AURA / 'decks' / f'{P}.json').read_text(encoding='utf-8')).get('lastCheck') or {})
    while time.time() - t_ < 150 and last_check().get('slide') != 2: time.sleep(0.5)
    check('v0.5.1: a step that asked first is still packed + checked by Lumi when the reply finishes it (e2e found this gap)',
          last_check().get('slide') == 2, last_check())

    # four design questions up front, one more midway, answers resume the same run to completion
    n_ev = len(jget('/api/claude/events?since=0')[1]['events'])
    s, j = jpost(f'/api/decks/{P}/build', {'mode': 'next'})
    pj = wait_plan_idle(P)
    deep = pj['plan']['slides'][2]['id']
    allev = jget('/api/claude/events?since=0')[1]['events'][n_ev:]
    evt = ' '.join(str(x.get('text', '')) for x in allev if x.get('kind') == 'say')
    check('deep slide: four questions up front, waiting, slide unbuilt', pj.get('waiting') and pj.get('built') == 2 and pj.get('buildTarget') == deep and
          all(f'id="q{i}"' in evt for i in (1, 2, 3, 4)) and evt.count('[[aura:choice') == 4, (pj.get('waiting'), pj.get('built'), evt.count('[[aura:choice')))
    s409, j409 = jpost(f'/api/decks/{P}/build', {'mode': 'next'})
    check('make next slide stays locked while questions are open', s409 == 409 and pj.get('waiting'), (s409, j409))
    sess_before = jget('/api/claude/status')[1].get('sessionId')
    n_ev2 = len(jget('/api/claude/events?since=0')[1]['events'])
    jpost('/api/claude/reply', {'deckId': P, 'text': 'q1: A cut-open combustor\nq2: Why the jet pulses\nq3: A timed fuel pulse\nq4: Right, large'})
    pj = wait_plan_idle(P)
    ev2 = jget('/api/claude/events?since=0')[1]['events'][n_ev2:]
    evt2 = ' '.join(str(x.get('text', '')) for x in ev2 if x.get('kind') == 'say')
    check('midway doubt: the slide started, then stopped again with one question (still unbuilt, still locked)',
          pj.get('waiting') and pj.get('built') == 2 and pj.get('buildTarget') == deep and 'Raise the camera' in evt2 and evt2.count('[[aura:choice') == 1 and
          '[[aura:built' not in evt2 and jpost(f'/api/decks/{P}/build', {'mode': 'next'})[0] == 409, (pj.get('waiting'), pj.get('built'), evt2[:200]))
    argv2 = fake_argv(ev2)
    own = ((json.loads((AURA / 'decks' / f'{P}.json').read_text(encoding='utf-8')).get('slideConvs') or {}).get(deep) or {}).get('sessionId')
    check('the answers resume the deck conversation (--resume), the one the whole deck is built in',
          flag(argv2, '--resume') and flag(argv2, '--resume') == raw_sess(P) and not own, (argv2, own))
    time.sleep(1.5)
    check('no default timer answers the question', plan_of(P).get('waiting') and plan_of(P).get('built') == 2)
    jpost('/api/claude/reply', {'deckId': P, 'text': 'q1: Add a rim light'})
    pj = wait_plan_idle(P)
    check('the midway answer finishes the same slide', pj.get('built') == 3 and not pj.get('buildTarget') and not pj.get('waiting'), (pj.get('built'), pj.get('waiting')))

    s, j = jpost(f'/api/decks/{P}/build', {'mode': 'rest'})
    check('build the rest starts', s == 200 and jget(f'/api/decks/{P}')[1]['deck'].get('buildRest') is True, (s, j))
    t0 = time.time()
    while plan_of(P).get('built', 0) < 4 and time.time() - t0 < 30: time.sleep(0.1)
    s, j = jpost(f'/api/decks/{P}/build', {'mode': 'stop'})
    pj = wait_plan_idle(P)
    kept = pj.get('built')
    time.sleep(1.5)
    check('stop ends "build the rest" and keeps the finished slides', s == 200 and not pj.get('buildRest') and kept >= 4 and
          plan_of(P).get('built') == kept and not jget('/api/claude/status')[1].get('running'), (kept, pj.get('buildRest')))
    s, j = jpost(f'/api/decks/{P}/build', {'mode': 'rest'})
    t0 = time.time()
    while plan_of(P).get('planState') != 'built' and time.time() - t0 < 90: time.sleep(0.3)
    pj = wait_plan_idle(P)
    check('build the rest finishes every slide by itself', pj.get('planState') == 'built' and pj.get('built') == pj.get('count') and
          not pj.get('buildRest'), (pj.get('planState'), pj.get('built'), pj.get('count')))
    check('build next when all built -> 409', jpost(f'/api/decks/{P}/build', {'mode': 'next'})[1].get('error') == 'all-built')
    check('bad build mode -> 400', jpost(f'/api/decks/{P}/build', {'mode': 'turbo'})[0] == 400)

    # 0.5.5, the owner's ask: a BUILT slide can be removed too. The plan entry is only half of it - the section has to
    # leave the deck file as well, or the plan and the deck drift apart (post-mortem problem 2).
    print('\n[0.5.5 removing a slide that is already built]')
    sections = lambda: len(re.findall(r'<section\b[^>]*class="[^"]*\bslide\b',
                                      (SANDBOX / jget(f'/api/decks/{P}')[1]['deck']['file']).read_text(encoding='utf-8')))
    pj = plan_of(P)
    secs0, n0_ = sections(), pj['count']
    gone = pj['plan']['slides'][1]
    s, j = jpost(f'/api/decks/{P}/plan/slide/remove', {'slide': gone['id']})
    check('removing a built slide without saying so is refused, and says what would be lost',
          s == 409 and j.get('error') == 'confirm' and j.get('built') is True and 'thrown away' in (j.get('reason') or ''), (s, j))
    check('...and nothing was removed', plan_of(P)['count'] == n0_ and sections() == secs0, (plan_of(P)['count'], sections()))
    s, j = jpost(f'/api/decks/{P}/plan/slide/remove', {'slide': gone['id'], 'discard': True})
    check('with discard it goes: out of the plan AND out of the deck file',
          s == 200 and j.get('wasBuilt') is True and j['count'] == n0_ - 1 and j['built'] == n0_ - 1
          and not any(x['id'] == gone['id'] for x in j['plan']['slides']) and sections() == secs0 - 1,
          (s, j.get('error'), j.get('count'), sections(), secs0))
    check('every slide is still built, so the deck is still finished', plan_of(P).get('planState') == 'built'
          and plan_of(P)['built'] == plan_of(P)['count'], (plan_of(P).get('planState'), plan_of(P)['built'], plan_of(P)['count']))
    html = '<main>\n  <section class="slide" id="a"><div><section class="inner">x</section></div></section>\n  <section class="slide" id="b">b</section>\n</main>'
    check('cut_slide_section counts nesting and keeps what follows', fs.cut_slide_section(html, 1) ==
          '<main>\n  <section class="slide" id="b">b</section>\n</main>', fs.cut_slide_section(html, 1))
    check('cut_slide_section can take the last one without eating the page', '</main>' in (fs.cut_slide_section(html, 2) or '')
          and 'id="a"' in (fs.cut_slide_section(html, 2) or '') and 'id="b"' not in (fs.cut_slide_section(html, 2) or ''))
    check('cut_slide_section says no to a section that is not there', fs.cut_slide_section(html, 3) is None and fs.cut_slide_section(html, 0) is None)
    pj = plan_of(P)                      # the deck is one slide shorter now: what follows finalizes THIS deck

    print('\n[v0.5 finalize]')
    s, j = jpost(f'/api/decks/{P}/finalize', {})
    check('finalize starts', s == 200 and j.get('started'), (s, j))
    check('a second finalize while one runs -> 409', jpost(f'/api/decks/{P}/finalize', {})[0] == 409)
    seen = set()
    t0 = time.time()
    while time.time() - t0 < 180:
        st = jget('/api/finalize')[1]
        seen.add(st.get('phase'))
        if not st.get('running'): break
        time.sleep(0.2)
    check('finalize reports progress (recording, pdf)', {'record', 'pdf'} & seen, seen)
    check('finalize finished ok', st.get('ok') is True and st.get('final'), st)
    rec = jget(f'/api/decks/{P}')[1]['deck']
    fin = rec.get('final') or {}
    html_f, pdf_f = SANDBOX / fin.get('html', 'x'), SANDBOX / fin.get('pdf', 'x')
    check('final HTML + PDF in 4 - Your slides, editable stays in .aura', html_f.is_file() and pdf_f.is_file() and
          html_f.parent == SLIDES and str(rec.get('file')).startswith('.aura/decks/'), (fin, rec.get('file')))
    import base64, re as _re
    txt = html_f.read_text(encoding='utf-8') if html_f.is_file() else ''
    blobs = _re.findall(r'<script type="text/plain" id="lumi-loop-(\d+)" data-mime="video/mp4" data-period="([0-9.]+)">([A-Za-z0-9+/=]+)</script>', txt)
    mp4 = base64.b64decode(blobs[0][2]) if blobs else b''
    check('every loop carries its period', blobs and all(float(b[1]) == 0.5 for b in blobs), [b[:2] for b in blobs])
    n3d = sum(1 for x in pj['plan']['slides'] if x['visual']['main'] == '3d')
    check('every 3D slide is embedded as an MP4 loop', len(blobs) == n3d and n3d > 0 and mp4[4:8] == b'ftyp', (len(blobs), n3d))
    check('the MP4 is H.264 with faststart (moov before mdat)', b'avc1' in mp4[:4000] and 0 <= mp4.find(b'moov') < mp4.find(b'mdat'), mp4[:64])
    import struct
    i = mp4.find(b'tkhd')
    wh = (struct.unpack('>I', mp4[i + 80:i + 84])[0] >> 16, struct.unpack('>I', mp4[i + 84:i + 88])[0] >> 16) if i > 0 else None
    check('the loop is recorded at the holder rect (640x300), not the full slide', wh == (640, 300), wh)
    pages = len(_re.findall(rb'/Type\s*/Page(?![s\w])', pdf_f.read_bytes())) if pdf_f.is_file() else 0
    check('PDF: one page per slide + one notes page per slide', pages == 2 * pj.get('count'), (pages, pj.get('count')))
    check('deck shows as finalized, not changed', rec.get('finalized') and not rec.get('changedSinceFinalize'), rec)
    lst = [d for d in jget('/api/decks')[1]['decks'] if d.get('file') == fin.get('html')]
    check('the final file is not adopted as a new deck', not lst, lst)

    t = rec.get('file')
    s, j = jpost(f'/api/decks/{P}/text', {'editId': 's1-t2', 'text': 'Edited after finalize'})
    rec = jget(f'/api/decks/{P}')[1]['deck']
    check('a change after finalizing marks the deck "changed since finalizing"', s == 200 and j.get('ok') and rec.get('changedSinceFinalize'), (j, rec.get('changedSinceFinalize')))
    old_bytes = html_f.read_bytes()
    jpost(f'/api/decks/{P}/finalize', {})
    time.sleep(0.4)
    s, j = jpost('/api/finalize/cancel', {})
    t0 = time.time()
    while jget('/api/finalize')[1].get('running') and time.time() - t0 < 30: time.sleep(0.2)
    st = jget('/api/finalize')[1]
    check('cancel stops finalize and keeps the old final', st.get('phase') == 'cancelled' and html_f.read_bytes() == old_bytes and
          not list((AURA / 'decks' / P).glob('final.part.*')), st)
    jpost(f'/api/decks/{P}/finalize', {})
    t0 = time.time()
    while jget('/api/finalize')[1].get('running') and time.time() - t0 < 180: time.sleep(0.3)
    rec = jget(f'/api/decks/{P}')[1]['deck']
    check('finalize again: new final in place, changed flag cleared', jget('/api/finalize')[1].get('ok') and
          'Edited after finalize' in html_f.read_text(encoding='utf-8') and not rec.get('changedSinceFinalize'), rec.get('final'))

    print('\n[v0.5 finalize an older deck]')
    legacy = next((d for d in jget('/api/decks')[1]['decks'] if str(d.get('file') or '').startswith('4 - Your slides/') and d.get('exists')), None)
    if legacy:
        lf = legacy['file']
        jpost(f"/api/decks/{legacy['id']}/finalize", {})
        t0 = time.time()
        while jget('/api/finalize')[1].get('running') and time.time() - t0 < 180: time.sleep(0.3)
        rec = jget(f"/api/decks/{legacy['id']}")[1]['deck']
        check('older deck: editable copy moves to its work folder, final takes its name', jget('/api/finalize')[1].get('ok') and
              str(rec.get('file')).startswith(f".aura/decks/{legacy['id']}/") and
              (rec.get('final') or {}).get('html') == f"4 - Your slides/{rec.get('title')}.html", (rec.get('file'), rec.get('final')))
        check('its old editable copy left 4 - Your slides (or became the final)', not (SANDBOX / lf).is_file() or
              (rec.get('final') or {}).get('html') == lf, lf)
        n = len(jget('/api/decks')[1]['decks'])
        check('no deck record is made for the final file', len(jget('/api/decks')[1]['decks']) == n and
              not any(d.get('migrated') and d.get('file') == (rec.get('final') or {}).get('html') for d in jget('/api/decks')[1]['decks']))
        check('older deck now packs into its work folder on the next Claude run', fs.uses_work_folder(rec) or str(rec.get('file')).startswith('.aura/decks/'))
    else:
        check('an older deck exists to finalize', False, 'none')
    check('finalize unknown deck -> 404', jpost('/api/decks/nope123/finalize', {})[0] == 404)


def run_q8_suite():
    """Question windows: dependent variants (when / depends), the slide context of a question, Enter never submits, no ideas or
    chat while Claude works. The page's own behaviour (steps, docking, the game) is walked with Playwright, see RESUME.md."""
    import form_server as fs
    print('\n[questions: variants, slide context, no auto-submit, ideas gating]')
    # markers.js (the page's parser) under node: attributes, variants and the when evaluation
    js = REPO / 'engine' / 'form' / 'js' / 'markers.js'
    probe = (f"import {{ parseMarkers, parseWhen, whenMatches }} from {json.dumps(js.as_uri())};"
             "const t = [`[[aura:choice id=\"q1\" slide=3 question=\"H?\" options=\"A one|B two|C three\" default=\"B two\"]]`,"
             "`[[aura:choice id=\"q2\" slide=\"3\" when=\"q1=1\" depends=\"q1\" question=\"W1?\" options=\"a|b\" multi=\"yes\" default=\"a\"]]`,"
             "`[[aura:choice id=\"q2\" slide=\"3\" when=\"q1=B two\" question=\"W2?\" options=\"c|d\"]]`,"
             "`[[aura:choice id=\"q3\" question=\"Plain?\" options=\"x|y|z|1|2|3|4|5\" default=\"x\"]]`].join('\\n');"
             "const m = parseMarkers(t);"
             "const ans = (id, sel, opts) => ({ [id]: { selected: sel, options: opts } });"
             "console.log(JSON.stringify({ n: m.choices.length, ids: [...new Set(m.choices.map(c => c.id))], slide: m.choices[0].slide, opts8: m.choices[3].options.length,"
             " dep: m.choices[1].depends, when2: m.choices[2].when, byNum: whenMatches(parseWhen('q1=1'), ans('q1', ['A one'], ['A one','B two','C three'])),"
             " byText: whenMatches(parseWhen('q1=B two'), ans('q1', ['B two'], ['A one','B two','C three'])),"
             " no: whenMatches(parseWhen('q1=3'), ans('q1', ['B two'], ['A one','B two','C three'])),"
             " two: whenMatches(parseWhen('q1=1|2 & q3=x'), { ...ans('q1', ['B two'], ['A one','B two','C three']), ...ans('q3', ['x'], ['x','y']) }),"
             " unanswered: whenMatches(parseWhen('q9=1'), {}) }));")
    r = subprocess.run(['node', '--no-warnings', '--input-type=module', '-e', probe], capture_output=True, text=True, timeout=30)
    try: o = json.loads(r.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError): o = {'err': r.stderr[-300:]}
    check('markers.js: variants share an id and are told apart by their when', o.get('n') == 4 and o.get('ids') == ['q1', 'q2', 'q3'] and o.get('when2') == 'q1=B two', o)
    check('markers.js: slide and depends are read, up to 8 options', o.get('slide') == '3' and o.get('dep') == ['q1'] and o.get('opts8') == 8, o)
    check('when matches by 1-based number, by option text, with alternatives and conditions; wrong or missing answers do not',
          o.get('byNum') is True and o.get('byText') is True and o.get('no') is False and o.get('two') is True and o.get('unanswered') is False, o)
    free = (REPO / 'engine' / 'form' / 'js' / 'markers.js').read_text(encoding='utf-8')
    plan_js = (REPO / 'engine' / 'form' / 'js' / 'plan.js').read_text(encoding='utf-8')
    ws_js = (REPO / 'engine' / 'form' / 'js' / 'workshop.js').read_text(encoding='utf-8')
    check('no question text box submits on Enter (markers.js, plan.js doubt card)',
          "free.addEventListener('keydown', e => { if (e.key === 'Enter') e.stopPropagation(); })" in free and 'send.click()' not in free and
          "free.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); })" in plan_js and 'send.click()' not in plan_js)
    check('ideas are gated on idle (workshop.js), the chat box waits while claude works or a question is open',
          'const ideasOk = () => !running && !elsewhere && !pendingCard()' in ws_js and 'hintRow.hidden = !ok' in ws_js and
          "if (running || elsewhere || pendingCard()) { sfx('error'); return; }" in ws_js and 'const canReply = open && (hasRun() || EDIT) && !asking' in ws_js)

    print('\n[plan doubts with variants]')
    jpost('/api/brief', {'basics': {'title': 'Doubt deck'}, 'look': {'theme': 'Bold Blue'}, 'style': {'quality': 'just-right'}, 'extra': {'notes': 'many-doubts'}})
    s, j = jpost('/api/plan/start', {})
    Q = j.get('deckId')
    pj = wait_plan_idle(Q)
    ds = pj['plan'].get('doubts') or []
    q4 = [d for d in ds if d.get('key') == 'q4']
    check('plan doubts keep key, when and depends; variants get their own ids', len(q4) == 3 and len({d['id'] for d in q4}) == 3 and
          [d['when'] for d in q4] == ['q3=1', 'q3=Friendly', 'q3=3'] and all(d['depends'] == ['q3'] for d in q4), q4)
    check('a plain doubt has an empty when', all(d.get('when') == '' for d in ds if d.get('key') in ('q1', 'q2', 'q3')), [(d.get('key'), d.get('when')) for d in ds])
    q3 = next(d for d in ds if d.get('key') == 'q3')
    s, j = jpost(f'/api/decks/{Q}/plan/answer', {'id': q3['id'], 'answer': 'Friendly'})
    pj = wait_plan_idle(Q)
    left = [d for d in pj['plan']['doubts'] if d.get('key') == 'q4']
    check('answering q3 keeps only the variant that matches (Friendly) and drops the others', s == 200 and [d['when'] for d in left] == ['q3=Friendly'], left)
    check('when_holds / parse_when (server side)', fs.parse_when('q1=2 & q3=Left|Right') == [('q1', ['2']), ('q3', ['Left', 'Right'])] and
          fs.when_holds([('q1', ['2'])], {'q1': (['B'], ['A', 'B'])}) and not fs.when_holds([('q1', ['1'])], {'q1': (['B'], ['A', 'B'])}) and
          not fs.when_holds([('q1', ['1'])], {}))

    print('\n[build-time questions: seven with variants, slide context]')
    e = json.loads(json.dumps(pj['plan']))
    e['slides'][2]['title'] = 'Results ask-seven'
    e['slides'][3]['title'] = 'Slow slide take-your-time'
    save(Q, e)
    for _ in range(2):
        jpost(f'/api/decks/{Q}/build', {'mode': 'next'}); wait_plan_idle(Q)
    n0 = jget('/api/claude/status')[1].get('eventCount', 0)
    jpost(f'/api/decks/{Q}/build', {'mode': 'next'})
    pj = wait_plan_idle(Q)
    txt = ' '.join(str(x.get('text', '')) for x in events_from(n0) if x.get('kind') == 'say')
    check('seven questions, three variants of q2 and of q4, ask last', pj.get('waiting') and txt.count('[[aura:choice') == 11 and
          txt.count('id="q2"') == 3 and txt.count('id="q4"') == 3 and 'when="q1=2"' in txt and 'slide="3"' in txt and txt.rstrip().endswith('[[aura:ask]]'),
          (txt.count('[[aura:choice'), txt[-80:]))
    tg = pj.get('target') or {}
    sl3 = pj['plan']['slides'][2]
    check('the plan payload carries the slide the question is about (number, title, point, bullets, picture, files, built)',
          tg.get('n') == 3 and tg.get('id') == sl3['id'] and tg.get('title') == 'Results ask-seven' and tg.get('point') == sl3.get('point') and
          tg.get('bullets') == sl3.get('bullets') and (tg.get('visual') or {}).get('main') == sl3['visual']['main'] and
          tg.get('sources') == sl3.get('sources') and tg.get('built') is False, tg)
    s409, _ = jpost(f'/api/decks/{Q}/build', {'mode': 'next'})
    check('next slide stays locked while the questions are open', s409 == 409)
    s, j = jpost('/api/claude/reply', {'deckId': Q, 'text': 'q1: Fuel in, thrust out\nq2: Fuel\nq3: One injector close-up\nq4: Macro close-up\nq5: Nothing, a still\nq6: Left, large\nq7: Orange'})
    pj = wait_plan_idle(Q)
    check('the answers finish the slide (one line per active question)', pj.get('built') == 3 and not pj.get('waiting') and
          not pj.get('target'), (pj.get('built'), pj.get('waiting')))
    s, j = jpost(f'/api/decks/{Q}/build', {'mode': 'next'})
    time.sleep(0.8)
    sr, jr = jpost('/api/claude/reply', {'deckId': Q, 'text': 'make the title shorter'})
    check('a chat message while claude works is refused, not queued -> 409 busy', s == 200 and sr == 409 and jr.get('error') == 'busy', (s, sr, jr))
    jpost(f'/api/decks/{Q}/build', {'mode': 'stop'})
    wait_plan_idle(Q)


def run_health_suite():
    srv = start_server()
    try:
        s, j = jget('/api/health')
        checks = {c['id']: c for c in j.get('checks') or []}
        check('health lists every check', s == 200 and set(checks) >= {'engine', 'node', 'modules', 'edge', 'python', 'claude',
                                                                     'signin', 'disk', 'version'}, list(checks))
        check('every check has id/ok/label/detail', all({'id', 'ok', 'label', 'detail'} <= set(c) for c in checks.values()))
        for k in ('engine', 'node', 'modules', 'edge', 'claude', 'signin', 'disk'):
            check(f'{k} ok on this PC', checks.get(k, {}).get('ok'), checks.get(k))
        check('sandbox has no venv -> python check fails with pip fix', checks['python']['ok'] is False and checks['python'].get('fix') == 'pip',
              checks['python'])
        check('version check offline is fine', checks['version']['ok'] and checks['version'].get('blocking') is False, checks['version'])
        check('subscriptionType reported', j.get('subscriptionType') == 'max' and j.get('version'), j.get('subscriptionType'))
        print('  [fixes, fake commands]')
        s, j = jpost('/api/fix/npm')
        check('npm fix starts', s == 200 and j.get('started'), (s, j))
        check('second fix while running -> 409', jpost('/api/fix/pip')[0] == 409)
        t0 = time.time()
        while jget('/api/fix/status')[1].get('running') and time.time() - t0 < 20: time.sleep(0.2)
        st = jget('/api/fix/status')[1]
        check('npm fix finished ok with log', st.get('ok') is True and st.get('name') == 'npm' and
              any('fake npm step' in x for x in st.get('log', [])), st)
        s, j = jpost('/api/fix/update')
        check('update without the launcher -> friendly 404', s == 404 and j.get('error') == 'launcher-missing' and j.get('message'), j)
        (AURA / 'Lumi.exe').write_bytes(b'MZ not really')
        s, j = jpost('/api/fix/update')
        check('update with the launcher (no launch in tests)', s == 200 and j.get('ok'), j)
        (AURA / 'Lumi.exe').unlink()
        check('signin fix answers', jpost('/api/fix/signin')[0] == 200)
        check('unknown fix -> 404', jpost('/api/fix/bogus')[0] == 404)
        check('fix foreign origin -> 403', jpost('/api/fix/npm', headers={'Origin': 'http://evil.example'})[0] == 403)
    finally:
        stop_server(srv)
    srv = start_server(AURA_LATEST_VERSION='v9.9.0', AURA_HEALTH_FAIL='modules', AURA_FAKE_PLAN='free', AURA_FAKE_FIX_FAIL='pip')
    try:
        j = jget('/api/health')[1]
        checks = {c['id']: c for c in j.get('checks') or []}
        check('free plan is allowed with a gentle note', checks['signin']['ok'] is True and checks['signin'].get('free') is True
              and 'pro or higher works best' in checks['signin'].get('note', ''), checks['signin'])
        check('newer release -> update offered', checks['version']['ok'] is False and checks['version'].get('fix') == 'update' and
              '9.9.0' in checks['version']['label'], checks['version'])
        check('simulated failure gets its fix', checks['modules']['ok'] is False and checks['modules'].get('fix') == 'npm', checks['modules'])
        check('overall not ok', j.get('ok') is False)
        jpost('/api/fix/pip')
        t0 = time.time()
        while jget('/api/fix/status')[1].get('running') and time.time() - t0 < 20: time.sleep(0.2)
        st = jget('/api/fix/status')[1]
        check('failing fix reported', st.get('ok') is False and st.get('name') == 'pip' and st.get('message'), st)
    finally:
        stop_server(srv)
    print('  [claude first: sign-in, switch account]')
    auth = AURA / 'temp' / 'fake-auth.txt'
    auth.parent.mkdir(parents=True, exist_ok=True)
    auth.write_text('0')
    srv = start_server(AURA_FAKE_AUTH_FILE=auth)
    try:
        s, j = jget('/api/health?part=claude')
        checks = {c['id']: c for c in j.get('checks') or []}
        check('part=claude asks only claude + sign-in', s == 200 and set(checks) == {'claude', 'signin'}, list(checks))
        check('signed out -> blocking sign-in with its fix', checks['signin']['ok'] is False and checks['signin'].get('fix') == 'signin'
              and checks['signin'].get('blocking') is True and not checks['signin'].get('free'), checks['signin'])
        check('sign-in starts', jpost('/api/fix/signin')[0] == 200)
        t0, ok = time.time(), False
        while time.time() - t0 < 20 and not ok:
            time.sleep(0.5)
            ok = any(c['id'] == 'signin' and c['ok'] for c in jget('/api/health?part=claude')[1].get('checks') or [])
        check('polling sees the sign-in finish', ok)
        s, j = jpost('/api/claude/logout')
        check('switch account: logout signs out', s == 200 and j.get('ok') and j.get('signedIn') is False, j)
        check('status says signed out after logout', jget('/api/claude/status?refresh=1')[1].get('signedIn') is False)
        check('logout foreign origin -> 403', jpost('/api/claude/logout', headers={'Origin': 'http://evil.example'})[0] == 403)
    finally:
        stop_server(srv)
        auth.unlink(missing_ok=True)
    import test_signin                      # sign-in fix: private window, confirmation per install, every plan allowed
    test_signin.run(sys.modules[__name__])
    print('  [claude fixes and explains a failing check]')
    def help_run(body):
        s, j = jpost('/api/fix/claude', body)
        t0 = time.time()
        while jget('/api/fix/status')[1].get('running') and time.time() - t0 < 30: time.sleep(0.2)
        return s, j, jget('/api/fix/status')[1]
    srv = start_server(AURA_HEALTH_FAIL='modules')
    try:
        bad = {'check': 'modules', 'label': 'Slide tools need installing', 'detail': 'Missing: three'}
        check('claude fix without a check -> 400', jpost('/api/fix/claude', {})[0] == 400)
        s, j, st = help_run(bad)
        check('claude fix starts', s == 200 and j.get('name') == 'claude-fix', j)
        check('claude fix ran, check still failing -> not ok with its reason', st.get('name') == 'claude-fix' and st.get('ran') is True
              and st.get('ok') is False and 'NOT FIXED' in st.get('message', '') and st.get('check') == 'modules', st)
        s, j, st = help_run(dict(bad, mode='explain', tried='npm install failed'))
        check('claude explains in plain words', st.get('name') == 'claude-explain' and st.get('ok') is True and
              'Repair' in st.get('message', '') and chr(10) not in st.get('message', ''), st)
        s, j = jpost('/api/fix/repair')
        check('repair without the launcher -> friendly 404', s == 404 and j.get('error') == 'launcher-missing', j)
        (AURA / 'Lumi.exe').write_bytes(b'MZ not really')
        check('repair with the launcher (no launch in tests)', jpost('/api/fix/repair')[0] == 200)
        (AURA / 'Lumi.exe').unlink()
    finally:
        stop_server(srv)
    srv = start_server(AURA_HEALTH_FAIL='modules', AURA_FAKE_HELP_FAIL='1')
    try:
        s, j, st = help_run({'check': 'modules', 'mode': 'explain'})
        check('claude cannot run -> reported, so the page shows repair', st.get('ran') is False and st.get('ok') is False and
              st.get('message'), st)
    finally:
        stop_server(srv)


def run_idle_suite():
    srv = start_server(AURA_IDLE_SECONDS=2, AURA_FAKE_LONG=12)
    try:
        jpost('/api/claude/reply', {'text': 'take-your-time again'})
        time.sleep(6)      # no requests for 3x the idle limit while Claude works
        check('server alive while Claude runs', srv.poll() is None)
        check('run still active', jget('/api/claude/status')[1].get('running') is True)
        jpost('/api/claude/stop')
        t0 = time.time()
        while srv.poll() is None and time.time() - t0 < 15: time.sleep(0.25)
        check('server shuts down when idle after the run', srv.poll() is not None, 'still running')
    finally:
        stop_server(srv)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc(); sys.exit(1)
