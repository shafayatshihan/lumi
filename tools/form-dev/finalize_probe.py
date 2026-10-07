"""N6: prove finalize really produces a deck, on a REAL previously-built deck, through the REAL server.

Finalize had not produced a deck since a long run of changes landed (the orphan-holder gate, `bl_holders`, the render
queue's yielding, `friendly_tool_error`, the `browser-missing` 503, `Packer.needs_three()`, the per-run token rename and
the deck hand-off), and the owner's last three attempts all failed. Unit tests cannot settle that: finalize drives a real
browser over the real packed HTML. So this copies the preserved deck `df41e681539e` (4 slides, a 1080p Blender still and
a 100-frame 720p loop, previously finalized) into a throwaway sandbox, stands the server up, and finalizes it for real.

  python tools/form-dev/finalize_probe.py [--sandbox X:\\aura-dev-fin] [--port 8896] [--keep]
  python tools/form-dev/finalize_probe.py --fixture        (the same end-to-end run on a deck that travels with the repo)

`--fixture` is the regression form: it builds a tiny two-slide deck with a FILLED studio-render holder and one live
loop, so the whole path - the gate, the browser, the recording, the encode, the PDF, the `final` block and a second
finalize - is exercised on any machine. `test_postmortem_b.py` runs exactly that and reads these PASS/FAIL lines.

It prints what it finds and exits non-zero if finalize did not produce both files.
"""
import json, os, re, shutil, subprocess, sys, time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ARCHIVE = Path(r'X:\aura-dev-shots\b5')
DECK_ID = 'df41e681539e'      # the archived deck; --fixture uses its own id below

a = sys.argv[1:]
FIXTURE = '--fixture' in a
SANDBOX = Path(a[a.index('--sandbox') + 1]) if '--sandbox' in a else Path(r'X:\aura-dev-fin' + ('-fx' if FIXTURE else ''))
KEEP = '--keep' in a


def free_port():
    """A port nothing is on. Never 8765/8766 (the real app) and never 8884, whatever the OS offers."""
    import socket as _s
    for _ in range(40):
        with _s.socket() as k:
            k.bind(('127.0.0.1', 0))
            q = k.getsockname()[1]
        if q not in (8765, 8766, 8884) and q > 1024: return q
    raise SystemExit('no free port')


PORT = int(a[a.index('--port') + 1]) if '--port' in a else (free_port() if FIXTURE else 8896)
if FIXTURE: DECK_ID = 'fixt0000fin1'
AURA = SANDBOX / '.aura'
sys.path.insert(0, str(Path(__file__).parent))
import test_server as T                                    # req/jget/jpost against PORT

results = []

# A 1x1 png: a filled studio-render holder the browser can really paint and the PDF can really print.
PNG_1PX = ('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
FIXTURE_HTML = """<!doctype html>
<html data-aura-still-ready="1"><head><meta charset="utf-8"><title>Finalize fixture deck</title>
<style>html,body{margin:0;background:#F9F4F2}.slide{width:1920px;height:1080px;position:relative}
h1{font:700 90px/1.1 system-ui,sans-serif;margin:60px}
#dot{position:absolute;width:160px;height:160px;border-radius:50%;background:#0061EF;left:20px;top:20px}
.bb-blender{position:absolute;left:1000px;top:200px;width:600px;height:400px;background:#ddd}
.bb-blender-img{width:100%;height:100%;object-fit:cover;display:block}</style></head>
<body><main class="deck">
<section class="slide" data-title="One"><h1>The studio render</h1>
<div class="bb-blender bb-3d" data-blender="s1" data-kind="still" data-filled="1"><img class="bb-blender-img" alt="" src="data:image/png;base64,__PNG__"></div>
</section>
<section class="slide" data-title="Two"><h1>The live loop</h1>
<div id="holder" style="position:absolute;left:100px;top:400px;width:640px;height:360px;background:#fff"><div id="dot"></div></div>
</section>
</main>
<script>
// slide 1 is an already-made studio render: `recorded` is keyed by the slide NUMBER and holds {kind, draft, filled},
// which is exactly what finalize.js reads. slide 2 is a live loop finalize must record into a video.
var dot = document.getElementById('dot');
window.LumiCapture = { ready: Promise.resolve(true), recorded: { 1: { kind: 'still', draft: false, filled: true } },
  slides: { 2: { period: 0.2, rect: { x: 100, y: 400, w: 640, h: 360 },
    seek: function (t) { dot.style.left = (20 + 400 * (t / 0.2)) + 'px'; return Promise.resolve(); } } } };
</script></body></html>
""".replace('__PNG__', PNG_1PX)


def make_fixture():
    """A deck that travels with the repo: two slides, one FILLED studio-render holder, one live loop, already built."""
    import base64
    subprocess.run([sys.executable, str(REPO / 'tools' / 'form-dev' / 'sandbox.py'), str(SANDBOX), '--reset', '--no-venv'],
                   check=True, stdout=subprocess.DEVNULL)
    d = AURA / 'decks' / DECK_ID
    (d / 'blender' / 's1').mkdir(parents=True, exist_ok=True)
    (d / 'blender' / 's1' / 'final.png').write_bytes(base64.b64decode(PNG_1PX))
    (d / 'Finalize fixture.html').write_text(FIXTURE_HTML, encoding='utf-8')
    rec = {'id': DECK_ID, 'title': 'Finalize fixture', 'file': f'.aura/decks/{DECK_ID}/Finalize fixture.html',
           'look': 'Bold Blue', 'quality': 'balanced', 'createdAt': '2026-10-07T00:00:00+06:00',
           'updatedAt': '2026-10-07T00:00:00+06:00', 'sessionId': None, 'brief': {}, 'build': None, 'flow': 'plan',
           'planState': 'built', 'buildRest': False, 'buildTarget': None, 'final': None,
           'plan': {'version': 1, 'title': 'Finalize fixture', 'minutes': 3, 'doubts': [], 'slides': [
               {'id': 's1', 'title': 'One', 'point': 'one', 'bullets': [], 'sources': [], 'built': True,
                'visual': {'main': '3d', 'companions': [], 'detail': 'detailed', 'motion': 'still', 'phrase': '', 'engine': 'blender'}},
               {'id': 's2', 'title': 'Two', 'point': 'two', 'bullets': [], 'sources': [], 'built': True,
                'visual': {'main': 'text', 'companions': [], 'detail': None, 'motion': None, 'phrase': ''}}]},
           'blender': {'s1': {'engine': 'blender', 'kind': 'still', 'status': 'rendered',
                              'final': {'kind': 'still', 'res': 1080, 'frames': 1, 'stale': False,
                                        'at': '2026-10-07T00:00:00+06:00',
                                        'file': f'.aura/decks/{DECK_ID}/blender/s1/final.png'}}}}
    (AURA / 'decks' / f'{DECK_ID}.json').write_text(json.dumps(rec, indent=1), encoding='utf-8')
    return rec


def check(name, ok, info=''):
    results.append(bool(ok))
    print(('  PASS ' if ok else '  FAIL ') + name + ('' if ok else f'   <- {str(info)[:300]}'))


def make_sandbox():
    subprocess.run([sys.executable, str(REPO / 'tools' / 'form-dev' / 'sandbox.py'), str(SANDBOX), '--reset', '--no-venv'],
                   check=True, stdout=subprocess.DEVNULL)
    src = ARCHIVE / 'deck' / DECK_ID
    dst = AURA / 'decks' / DECK_ID
    shutil.copytree(src, dst)
    # The archive keeps the API VIEW of the record (deck.json is {"ok":…, "deck":{…}}). Turn it back into a stored record:
    # the stored fields only, plus the Blender state rebuilt from the timing record (the view never carries it).
    view = json.loads((ARCHIVE / 'deck.json').read_text(encoding='utf-8'))['deck']
    keep = ('id', 'title', 'file', 'look', 'quality', 'createdAt', 'updatedAt', 'sessionId', 'brief', 'build', 'flow',
            'planState', 'plannedAt', 'buildRest', 'buildTarget', 'caps', 'plan', 'ctxTokens')
    rec = {k: view[k] for k in keep if k in view}
    rec['final'] = None                      # finalize it again from scratch: this is the thing being proved
    rec['blender'] = {}
    timing = json.loads((dst / 'timing' / 'timing.json').read_text(encoding='utf-8'))
    for sid, e in (timing.get('render') or {}).items():
        f = e.get('final') or {}
        rec['blender'][sid] = {
            'engine': 'blender', 'kind': e.get('kind'), 'status': 'rendered',
            'scene': f".aura/decks/{DECK_ID}/blender/{sid}/scene.py",
            'final': {'kind': f.get('kind'), 'res': f.get('res'), 'width': f.get('width'), 'height': f.get('height'),
                      'fps': f.get('fps'), 'frames': f.get('frames'), 'samples': f.get('samples'),
                      'file': f.get('file'), 'at': f.get('at'), 'render_s': f.get('renderS'),
                      'sceneHash': e.get('sceneSha1'), 'stale': False,
                      'poster': f".aura/decks/{DECK_ID}/blender/{sid}/final-poster.png"
                                if (dst / 'blender' / sid / 'final-poster.png').is_file() else None}}
    (AURA / 'decks' / f'{DECK_ID}.json').write_text(json.dumps(rec, indent=1), encoding='utf-8')
    return rec


def sizes():
    out = {}
    for p in sorted((SANDBOX / '4 - Your slides').glob('*')):
        if p.is_file(): out[p.name] = p.stat().st_size
    return out


def main():
    if not FIXTURE and not (ARCHIVE / 'deck' / DECK_ID).is_dir():
        print(f'the archived deck is not at {ARCHIVE / "deck" / DECK_ID}'); return 2
    print(f'sandbox {SANDBOX}, port {PORT}{" (fixture)" if FIXTURE else ""}')
    T.PORT = PORT
    T.SANDBOX = SANDBOX
    T.AURA = AURA
    (make_fixture if FIXTURE else make_sandbox)()
    base = dict(AURA_HOME=str(AURA), AURA_NO_LAUNCH='1', AURA_NO_NETWORK='1', AURA_BLENDER='none')
    # N6 bullet 5 first, in its own short-lived server: with no browser on the machine the refusal must be a plain
    # sentence BEFORE the deck is copied and a run is started (it used to fail at the very end, after all the work).
    g = subprocess.Popen([sys.executable, str(REPO / 'engine' / 'form_server.py'), '--port', str(PORT)],
                         env=dict(os.environ, **base, AURA_FAKE_EDGE='none'), stdout=subprocess.DEVNULL,
                         stderr=subprocess.PIPE, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    try:
        for _ in range(120):
            try:
                if T.jget('/api/ping')[0] == 200: break
            except OSError:
                time.sleep(0.1)
        s0, j0 = T.jpost(f'/api/decks/{DECK_ID}/finalize', {})
        check('with no browser installed, finalize refuses up front with a plain sentence',
              s0 == 503 and j0.get('error') == 'browser-missing' and 'edge' in str(j0.get('reason', '')).lower()
              and 'Traceback' not in str(j0), (s0, j0))
        check('...and it refused before doing any work (nothing in "4 - Your slides", still finalized: none)',
              not sizes() and (json.loads((AURA / 'decks' / f'{DECK_ID}.json').read_text(encoding='utf-8')).get('final') is None),
              sizes())
    finally:
        if g.poll() is None: g.kill(); g.wait(10)
    if FIXTURE:                      # a port the kernel has just released can still be in TIME_WAIT: take a fresh one
        globals()['PORT'] = free_port()
        T.PORT = PORT
    env = base
    for k in ('AURA_FAKE_CLAUDE', 'AURA_FAKE_EDGE', 'AURA_FAKE_DELAY'): os.environ.pop(k, None)
    p = subprocess.Popen([sys.executable, str(REPO / 'engine' / 'form_server.py'), '--port', str(PORT)],
                         env=dict(os.environ, **env), stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                         creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    try:
        for _ in range(120):
            try:
                if T.jget('/api/ping')[0] == 200: break
            except OSError:
                time.sleep(0.1)
        else:
            check('the server came up', False, (p.stderr.read() or b'').decode('utf-8', 'replace')[-800:])
            return 2

        want = 2 if FIXTURE else 4
        s, deck = T.jget(f'/api/decks/{DECK_ID}')
        check(f'the deck loads and is complete ({want} slides, all built, not finalized yet)',
              s == 200 and deck.get('deck', {}).get('planCount') == want and deck['deck'].get('builtCount') == want
              and deck['deck'].get('exists') is True and deck['deck'].get('final') is None, (s, str(deck)[:200]))

        t0 = time.time()
        s, j = T.jpost(f'/api/decks/{DECK_ID}/finalize', {})
        check('finalize starts (no 409, no 503)', s == 200 and j.get('started'), (s, j))
        if s != 200:
            print('  server stderr:', (p.stderr.read() or b'').decode('utf-8', 'replace')[-1200:] if p.poll() else '(still running)')
            return 1
        last = ''
        while time.time() - t0 < 900:
            time.sleep(2)
            st = T.jget('/api/finalize')[1]
            line = f"{st.get('phase')} slide {st.get('slide')}/{st.get('of')} frame {st.get('frame')}/{st.get('frames')}"
            if line != last: print('   ', line); last = line
            if not st.get('running'): break
        st = T.jget('/api/finalize')[1]
        took = round(time.time() - t0, 1)
        check(f'finalize finished and says it worked (in {took} s)', st.get('ok') is True, st.get('message') or st)
        f = sizes()
        html = {k: v for k, v in f.items() if k.endswith('.html')}
        pdf = {k: v for k, v in f.items() if k.endswith('.pdf')}
        # the fixture is deliberately tiny (a 1x1 png and one short loop), so its floors are small - what matters is
        # that both files exist, carry both slides and are not empty
        floor_html, floor_pdf = (1_000, 5_000) if FIXTURE else (1_000_000, 100_000)
        check('the HTML is in "4 - Your slides" and is a plausible size', bool(html) and max(html.values(), default=0) > floor_html, f)
        check('the PDF is there too', bool(pdf) and max(pdf.values(), default=0) > floor_pdf, f)
        rec = json.loads((AURA / 'decks' / f'{DECK_ID}.json').read_text(encoding='utf-8'))
        fin = rec.get('final') or {}
        check('the deck record got its `final` block (the owner\'s three failures all left final: none)',
              bool(fin.get('html')) and bool(fin.get('pdf')) and fin.get('htmlBytes'), fin)
        out = (SANDBOX / '4 - Your slides' / Path(fin.get('html') or 'x').name)
        text = out.read_text(encoding='utf-8', errors='replace') if out.is_file() else ''
        tags = re.findall(r'<div[^>]*\bbb-blender\b[^>]*>', text)
        filled = [t for t in tags if 'data-filled' in t]
        check('every studio render survived into the output, still filled, never re-rendered',
              len(filled) == (1 if FIXTURE else 2) and 'bb-blender-img' in text, [t[:90] for t in tags])
        check('the live loop was recorded into the file as a video, not dropped or left live',
              'lumi-loop' in text or 'data:video/mp4;base64' in text or 'bb-blender-video' in text, 'no video found')
        if FIXTURE:
            check('both slides are in the output and the studio render is still the embedded image',
                  text.count('<section') == 2 and 'The studio render' in text and 'The live loop' in text
                  and PNG_1PX[:40] in text, text.count('<section'))
        if not FIXTURE:
            check('the 100-frame Blender loop is in there as video',
                  'bb-blender-video' in text, 'no bb-blender-video')
            check('nothing re-rendered: the blender logs folder gained no new full render',
                  len(list((AURA / 'decks' / DECK_ID / 'blender' / 's2' / 'logs').glob('full-*.log'))) == 1,
                  [x.name for x in (AURA / 'decks' / DECK_ID / 'blender' / 's2' / 'logs').glob('*.log')])
        print('   output:', json.dumps(f, indent=1))

        # a second finalize: the older copy is kept, nothing is overwritten by surprise
        before = dict(sizes())
        t1 = time.time()
        s, j = T.jpost(f'/api/decks/{DECK_ID}/finalize', {})
        check('a second finalize starts', s == 200, (s, j))
        while time.time() - t1 < 900:
            time.sleep(2)
            if not T.jget('/api/finalize')[1].get('running'): break
        st2 = T.jget('/api/finalize')[1]
        check('the second finalize also worked', st2.get('ok') is True, st2.get('message') or st2)
        # By design (form_server.Finalizer._work): the previous final goes to "Older versions" only when the deck's NAME
        # changed. Finalizing the same deck again replaces its own file - and safely, because the html and the pdf are
        # written to temp files and only moved into place at the very end, so a failed run cannot destroy a good deck.
        old = sorted((SANDBOX / '4 - Your slides' / 'Older versions').glob('*'))
        check('finalizing the same deck again replaces its own file and keeps no stray copies (by design)',
              not old and len([x for x in sizes() if x.endswith('.html')]) == 1, (sizes(), [x.name for x in old]))
        check('the current file is still there and still plausible', bool(sizes()) and set(before) <= set(sizes()) | {x.name for x in old},
              (before, sizes()))
        print('   after the second run:', json.dumps(sizes(), indent=1))
        return 0 if all(results) else 1
    finally:
        if p.poll() is None:
            p.kill(); p.wait(10)
        err = (p.stderr.read() or b'').decode('utf-8', 'replace')
        if err.strip(): print('--- server stderr (tail) ---\n' + err[-2000:])
        if not KEEP:
            link = AURA / 'engine'
            try:
                if link.exists(): os.rmdir(link)        # the junction FIRST: never delete what it points at
            except OSError:
                pass


if __name__ == '__main__':
    rc = main()
    print(f'{sum(results)}/{len(results)} finalize checks passed')
    sys.exit(rc)
