"""Batch 6 Part C: the two preconditions that must hold before any of the baked pipeline ships.

  1. A real software-GL (swiftshader) finalize runs end to end and produces a deck with its 3D in it.
  2. A deck whose 3D cannot draw stops finalize LOUDLY and writes nothing.

Why this file exists. Before it, a scene that threw was invisible to every check: `renderSlideAt()` skips a failed
holder, `showStill()` set `data-aura-still-ready="1"` anyway, and finalize recorded 40 frames of the slide background,
embedded them, and exited 0 with `stillWarnings: 0`. The spec said the 180 s still timeout had merely stopped throwing;
measured, that timeout is never reached at all. See `docs/STATUS-A.md`.

It also pins the thing nobody could test before: the b5 deck `df41e681539e` has NO live three.js (its slides are
Blender holders and 2D canvases), so it could never have proved anything about WebGL. The fixture here has two real
`Aura.scene()` holders and finalizes in about ten seconds.

  python tools/form-dev/test_blender_softgl.py [--sandbox X:\\aura-dev-softgl] [--keep]

Prints PASS / FAIL lines and exits non-zero on any failure. Needs a browser and ffmpeg; it says so and skips if either
is missing. Safe to run beside other work: no fixed port, no server, its own sandbox.
"""
import base64
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
a = sys.argv[1:]
SANDBOX = Path(a[a.index('--sandbox') + 1]) if '--sandbox' in a else Path(r'X:\aura-dev-softgl')
KEEP = '--keep' in a
SOFT_GL = '--use-angle=swiftshader --enable-unsafe-swiftshader --disable-gpu-sandbox'

results = []


def check(name, ok, info=''):
    results.append(bool(ok))
    print(('  PASS ' if ok else '  FAIL ') + name + ('' if ok else '   <- ' + str(info)[:400]))


# Two real three.js scenes, both pure functions of t, so frame k and frame k + period*fps are identical. Nothing here
# reads a clock: a slow software GL changes how long a frame takes, never what is in it.
DECK = """<!doctype html>
<html lang="en" data-look="bold-blue">
<head>
<meta charset="utf-8">
<title>Software GL finalize fixture</title>
<link rel="stylesheet" href="../.aura/engine/deck/runtime.css">
<script type="importmap">{"imports":{"three":"../.aura/engine/node_modules/three/build/three.module.js"}}</script>
<script src="../.aura/engine/deck/runtime.js"></script>
<style>
  html, body { margin: 0; background: #F9F4F2; }
  .slide { background: #F9F4F2; color: #111; }
  .safe { padding: 96px; }
  h1 { font: 700 84px/1.1 'Segoe UI', system-ui, sans-serif; margin: 0 0 24px; }
  .stage { position: absolute; left: 480px; top: 300px; width: 960px; height: 640px; }
</style>
</head>
<body>
<main class="deck" data-mode="presenter">
  <section class="slide" data-kind="title" data-title="Live three.js, slide one">
    <div class="safe"><h1 data-edit="s1-1">A lit mesh, turning</h1></div>
    <div class="aura-3d stage" data-scene="turner" data-period="2"></div>
    <aside class="notes" data-aura-notes><p>A real WebGL scene, so capture has something to fail at.</p></aside>
  </section>
  <section class="slide" data-kind="content" data-title="Live three.js, slide two">
    <div class="safe"><h1 data-edit="s2-1">A second scene</h1></div>
    <div class="aura-3d stage" data-scene="bars" data-period="1"></div>
    <aside class="notes" data-aura-notes><p>A second holder, so the capture loop runs more than once.</p></aside>
  </section>
</main>
<script>
  Aura.scene('turner', ({ THREE, width, height }) => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    camera.position.set(0, 1.4, 6); camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.0));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 5, 4); scene.add(key);
    const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(1.1, 0.34, 128, 24),
      new THREE.MeshStandardMaterial({ color: 0x0061EF, roughness: 0.35, metalness: 0.2 }));
    scene.add(mesh);
    return { scene, camera, update(t) { mesh.rotation.y = 2 * Math.PI * t / 2; mesh.rotation.x = Math.PI * t / 2; } };
  }, { period: 2 });

  Aura.scene('bars', ({ THREE, width, height }) => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 2.5, 7); camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x99aabb, 2.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(2, 6, 5); scene.add(key);
    const bars = [];
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1, 0.6),
        new THREE.MeshStandardMaterial({ color: 0x3355aa, roughness: 0.6 }));
      m.position.x = (i - 3) * 0.9;
      scene.add(m); bars.push(m);
    }
    return { scene, camera, update(t) {
      bars.forEach((m, i) => { const h = 1 + 1.6 * (0.5 + 0.5 * Math.sin(2 * Math.PI * t + i * 0.7));
        m.scale.y = h; m.position.y = h / 2; });
    } };
  }, { period: 1 });
</script>
</body>
</html>
"""


def ffmpeg_exe():
    if os.environ.get('AURA_FFMPEG') and Path(os.environ['AURA_FFMPEG']).is_file():
        return os.environ['AURA_FFMPEG']
    try:
        r = subprocess.run([sys.executable, '-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'],
                           capture_output=True, timeout=60, stdin=subprocess.DEVNULL)
        lines = r.stdout.decode('utf-8', 'replace').strip().splitlines() if r.returncode == 0 else []
        if lines and Path(lines[-1]).is_file():
            return lines[-1]
    except (OSError, subprocess.TimeoutExpired):
        pass
    return shutil.which('ffmpeg')


def run_finalize(deck, out_html, out_pdf, ff, soft_gl):
    env = dict(os.environ)
    if soft_gl:
        env['AURA_BROWSER_ARGS'] = SOFT_GL
    else:
        env.pop('AURA_BROWSER_ARGS', None)
    p = subprocess.run(['node', str(REPO / 'engine' / 'tools' / 'finalize.js'), str(deck),
                        '--html', str(out_html), '--pdf', str(out_pdf), '--ffmpeg', ff, '--fps', '20'],
                       capture_output=True, timeout=1800, env=env, stdin=subprocess.DEVNULL)
    out = p.stdout.decode('utf-8', 'replace')
    events = []
    for line in out.splitlines():
        try:
            events.append(json.loads(line))
        except ValueError:
            pass
    return p.returncode, events, p.stderr.decode('utf-8', 'replace').strip()


def loop_frame(html, n, ff, work):
    """Pull loop n back out of the finalized deck and decode one frame of it, so the test looks at a picture."""
    m = re.search(r'id="lumi-loop-%d"[^>]*>([A-Za-z0-9+/=]+)</script>' % n, html)
    if not m:
        return None
    mp4 = work / ('loop-%d.mp4' % n)
    mp4.write_bytes(base64.b64decode(m.group(1)))
    png = work / ('loop-%d.png' % n)
    r = subprocess.run([ff, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(mp4),
                        '-vf', 'select=eq(n\\,5)', '-vframes', '1', str(png)],
                       capture_output=True, timeout=300, stdin=subprocess.DEVNULL)
    return png if r.returncode == 0 and png.is_file() else None


def colours(png):
    """How many distinct colours the frame has. A dead scene leaves the flat slide background and the soft radial
    gradient of .aura-3d[data-fallback]::after - a handful of tones. A drawn scene has hundreds."""
    try:
        from PIL import Image
    except ImportError:
        return None
    im = Image.open(png).convert('RGB')
    got = im.getcolors(999999)
    return len(got) if got else None


def main():
    ff = ffmpeg_exe()
    if not ff:
        print('SKIP: no ffmpeg on this machine (pip install imageio-ffmpeg)')
        return 0
    if not shutil.which('node'):
        print('SKIP: no node on this machine')
        return 0
    print('sandbox %s' % SANDBOX)
    subprocess.run([sys.executable, str(REPO / 'tools' / 'form-dev' / 'sandbox.py'), str(SANDBOX), '--reset', '--no-venv'],
                   check=True, stdout=subprocess.DEVNULL)
    decks = SANDBOX / 'deck'
    decks.mkdir(parents=True, exist_ok=True)
    good = decks / 'softgl.html'
    good.write_text(DECK, encoding='utf-8')
    # the same deck with three.js out of reach: the cheapest honest stand-in for a machine whose WebGL cannot start
    broken = decks / 'softgl-nothree.html'
    broken.write_text(DECK.replace('three.module.js', 'three.MISSING.js'), encoding='utf-8')

    # ---- 1. precondition one: a real software-GL finalize, end to end
    print('precondition 1: finalize under swiftshader')
    code, events, err = run_finalize(good, SANDBOX / 'out-sw.html', SANDBOX / 'out-sw.pdf', ff, soft_gl=True)
    kinds = [e.get('t') for e in events]
    done = next((e for e in events if e.get('t') == 'done'), None)
    deck_timing = next((e for e in events if e.get('t') == 'timing' and e.get('scope') == 'deck'), {})
    check('finalize succeeded under a software GL', code == 0 and done is not None, (code, err[-300:]))
    check('both loops were recorded', (done or {}).get('loops') == 2, done)
    check('both files were written',
          (SANDBOX / 'out-sw.html').is_file() and (SANDBOX / 'out-sw.pdf').is_file())
    check('no still warnings', deck_timing.get('stillWarnings') == 0, deck_timing)
    check('nothing warned', 'warn' not in kinds, [e for e in events if e.get('t') == 'warn'])

    html = (SANDBOX / 'out-sw.html').read_text(encoding='utf-8') if (SANDBOX / 'out-sw.html').is_file() else ''
    png = loop_frame(html, 1, ff, SANDBOX) if html else None
    check('the embedded loop decodes to a frame', png is not None)
    if png is not None:
        c = colours(png)
        if c is None:
            print('  (skipped the pixel check: Pillow is not installed)')
        else:
            # a dead scene leaves well under 150 tones; the lit mesh gives thousands
            check('the frame really has the 3D in it (%s distinct colours)' % c, c > 400, c)

    # ---- 2. preconditions two and three: a capture failure is loud, and nothing is written
    print('preconditions 2 and 3: a deck whose 3D cannot draw')
    out_html, out_pdf = SANDBOX / 'out-broken.html', SANDBOX / 'out-broken.pdf'
    code, events, err = run_finalize(broken, out_html, out_pdf, ff, soft_gl=False)
    warns = [e for e in events if e.get('t') == 'warn']
    detail = next((e for e in events if e.get('t') == 'detail' and e.get('scope') == 'capture'), None)
    check('finalize stopped instead of shipping a blank slide', code != 0, code)
    check('no deck and no PDF were written', not out_html.exists() and not out_pdf.exists())
    check('it said so while it was happening (the software-GL retry)',
          any('software renderer' in str(w.get('message')) for w in warns), warns)
    check('it retried under the software GL before giving up', (detail or {}).get('softGl') is True, detail)
    check('the technical cause went to the log, not to the person',
          detail is not None and 'three.MISSING' in str(detail.get('reason')), detail)
    last = err.strip().splitlines()[-1] if err.strip() else ''
    check('the person got one plain sentence naming the slides', last.startswith('Could not finalize: ')
          and 'slides 1 and 2' in last and 'Error' not in last and 'http' not in last, last)
    check('short enough to survive the server cutting it at 200 characters', 0 < len(last) <= 200, len(last))
    check('it never reported done', not any(e.get('t') == 'done' for e in events))

    print('\n%d/%d checks passed' % (sum(results), len(results)))
    if not KEEP and all(results):
        try:
            os.rmdir(SANDBOX / '.aura' / 'engine')      # the junction itself, never what it points to
            shutil.rmtree(SANDBOX, ignore_errors=True)
        except OSError:
            pass
    return 0 if all(results) else 1


if __name__ == '__main__':
    sys.exit(main())
