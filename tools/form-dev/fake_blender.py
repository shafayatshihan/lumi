"""Developer-only stand-in for blender.exe, so the Blender pipeline is testable without Blender (docs/blender-contract.md).
The server runs it when AURA_BLENDER points here (a .py is started with the server's own Python):
  python fake_blender.py --version
  python fake_blender.py -b [--factory-startup ...] -P <script.py> -- --out <png | folder> [--preview] [--anim] [--res N]
                         [--height 720|1080] [--samples N] [--fps N] [--frame N] [--cpu]
probe_gpu.py prints a probe line. Any other script is read for these directives, then rendered the way lumi_bpy.render()
would (same [lumi] lines, same "Fra: f | ... | Sample s/S" log lines, PNGs of the right size in the slide colour #F9F4F2):
  FAKE_FAIL          a Python traceback ("Error: Python: ... boom in the scene"), exit 1
  FAKE_GPU_FAIL      an OptiX error and exit 1 unless --cpu (the server must retry on the CPU)
  FAKE_SLOW=<s>      seconds per frame (default 0.05)
  FAKE_FRAMES=<n>    frames of an animation scene (a scene that calls L.loop(...)); default 4
  FAKE_NO_OUTPUT     exits 0 without writing anything
  L.anchor('name', ..)  a labels.json next to the output, like lumi_bpy (anchors in percent of the frame, one point per rendered frame)
Env: AURA_FAKE_BLENDER_GPU (best device, default OPTIX; CPU = no GPU), AURA_FAKE_BLENDER_LOG=<file> (one argv line per call),
AURA_FAKE_BLENDER_ART=1 (dev walks: a lit disc whose colour follows the scene text, so previews differ; tests keep the flat colour)."""
import json, os, re, struct, sys, time, zlib

argv = sys.argv[1:]
if os.environ.get('AURA_FAKE_BLENDER_LOG'):
    with open(os.environ['AURA_FAKE_BLENDER_LOG'], 'a', encoding='utf-8') as f: f.write(json.dumps(argv) + '\n')
say = lambda s: print(s, flush=True)
if argv[:1] == ['--version']:
    say('Blender 5.2.2 LTS (fake)'); sys.exit(0)
GPU = os.environ.get('AURA_FAKE_BLENDER_GPU', 'OPTIX')
pre = argv[:argv.index('--')] if '--' in argv else argv
post = argv[argv.index('--') + 1:] if '--' in argv else []
script = pre[pre.index('-P') + 1] if '-P' in pre else None
if '-b' not in pre or not script:
    say('fake blender: needs -b -P <script>'); sys.exit(2)
if os.path.basename(script) == 'probe_gpu.py':
    devs = [] if GPU == 'CPU' else [{'type': GPU, 'name': 'Fake GPU'}]
    say('[lumi] probe ' + json.dumps({'version': '5.2.2 LTS', 'best': GPU, 'devices': devs})); sys.exit(0)


def opt(name, default=None, cast=str):
    return cast(post[post.index(name) + 1]) if name in post and post.index(name) + 1 < len(post) else default


text = open(script, encoding='utf-8').read()
out = os.path.abspath(opt('--out', 'render.png'))
preview, anim, cpu = '--preview' in post, '--anim' in post, '--cpu' in post
res = opt('--res', 30 if preview else 100, int)
height = opt('--height', 1080, int)
samples = opt('--samples', 16 if preview else 128, int)
fps = opt('--fps', 20, int)
m = re.search(r'FAKE_SLOW=([\d.]+)', text)
slow = float(m.group(1)) if m else 0.05
m = re.search(r'FAKE_FRAMES=(\d+)', text)
loop_n = (int(m.group(1)) if m else 4) if 'L.loop(' in text else 1
say('Blender 5.2.2 LTS (fake)')
if cpu or GPU == 'CPU':
    say('[lumi] device: CPU (forced)' if cpu else '[lumi] device: CPU (no GPU backend found)')
else:
    say(f'[lumi] device: GPU {GPU} (Fake GPU)')
if 'FAKE_FAIL' in text:
    say('Traceback (most recent call last):')
    say(f'  File "{script}", line 12, in <module>')
    say('RuntimeError: boom in the scene')
    say('Error: Python: RuntimeError: boom in the scene')
    sys.exit(1)
if 'FAKE_GPU_FAIL' in text and not cpu and GPU != 'CPU':
    say('00:01.200  cycles           | OptiX error: OPTIX_ERROR_LAUNCH_FAILURE (fake)')
    sys.exit(1)
if 'FAKE_NO_OUTPUT' in text:
    say('[lumi] done: 0 frame(s)'); sys.exit(0)
w = (int(round(height * 16 / 9 / 2)) * 2) * res // 100
h = height * res // 100


ART = bool(os.environ.get('AURA_FAKE_BLENDER_ART'))    # dev walks only: a lit disc on a soft floor, its colour from the scene text


def art_rows(w, h, rgb):
    import hashlib
    hue = int(hashlib.sha1(text.encode('utf-8')).hexdigest()[:4], 16) / 65535
    base = [int(60 + 150 * abs(((hue * 6 + k) % 6) - 3) / 3) for k in (0, 2, 4)]
    cx, cy, r = w * 0.5, h * 0.46, h * 0.26
    out = bytearray()
    for y in range(h):
        row = bytearray(bytes(rgb) * w)
        sy = (y - h * 0.80) / (h * 0.06)                      # the floor shadow
        if abs(sy) < 1:
            half = int(r * 1.15 * (1 - sy * sy) ** 0.5)
            a, b = max(0, int(cx) - half), min(w, int(cx) + half)
            row[3 * a:3 * b] = bytes(max(0, c - 26) for c in rgb) * (b - a)
        dy = (y - cy) / r
        if abs(dy) < 1:
            half = int(r * (1 - dy * dy) ** 0.5)
            for x in range(max(0, int(cx) - half), min(w, int(cx) + half)):
                lit = max(0.0, 1 - (((x - cx + r * .35) / r) ** 2 + (dy + .35) ** 2) ** .5)
                row[3 * x:3 * x + 3] = bytes(min(255, int(c * (0.55 + 0.45 * lit) + 90 * lit)) for c in base)
        out += b'\x00' + row
    return bytes(out)


def png(path, w, h, rgb=(0xF9, 0xF4, 0xF2)):
    row = b'\x00' + bytes(rgb) * w
    data = zlib.compress(art_rows(w, h, rgb) if ART else row * h, 6)
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', data) + chunk(b'IEND', b''))


todo = list(range(1, loop_n + 1)) if anim and not preview else [opt('--frame', 1, int)]
n = len(todo)
is_dir = not out.lower().endswith('.png')
say(f'[lumi] scene frames={loop_n} fps={fps} poster=1 size={w}x{h} samples={samples} render={n} '
    f'mode={"preview" if preview else "anim" if n > 1 else "still"}')
t0 = time.time()
for i, f in enumerate(todo, 1):
    t1 = time.time()
    for s in (0, samples // 2, samples):
        say(f'00:0{i % 10}.000  render           | Fra: {f} | Mem: 1M | Sample {s}/{samples}')
        time.sleep(slow / 3)
    fp = (os.path.join(out, 'render.png' if n == 1 else f'frame_{f:04d}.png')) if is_dir else (out if n == 1 else out[:-4] + f'_{f:04d}.png')
    png(fp, max(2, w), max(2, h))
    dt = time.time() - t1
    say(f'[lumi] wrote {fp}  ({dt:.1f} s)')
    say(f'[lumi] frame {i}/{n} {dt:.2f}')
names = re.findall(r"L\.anchor\('(\w+)'", text)       # like lumi_bpy: label anchors as percent of the frame, per rendered frame
if names:
    lab = os.path.join(out, 'labels.json') if is_dir else out[:-4] + '.labels.json'
    with open(lab, 'w', encoding='utf-8') as f:
        json.dump({'w': w, 'h': h, 'fps': fps, 'frames': n, 'anchors': {k: [[60.0 + 2 * i + 5 * j, 40.0 + i] for i in range(n)] for j, k in enumerate(names)}}, f)
    say(f'[lumi] labels: {", ".join(names)} -> {lab}')
say(f'[lumi] done: {n} frame(s) {w}x{h}, {samples} spp, device {"CPU" if cpu else GPU}, total {time.time() - t0:.1f} s')
