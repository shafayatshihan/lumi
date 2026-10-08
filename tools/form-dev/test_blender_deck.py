"""Blender batch 2 (docs/blender-contract.md sections 4 and 10): Blender renders in the deck + the checker rules.
Run by test_server.py (run(T)); also alone:  python tools/form-dev/test_blender_deck.py --sandbox X:\\aura-dev-blender2 [--no-browser]
(alone it needs a sandbox with an .aura/engine junction). Needs no real Blender: the pictures are drawn with Pillow, the loops encoded with ffmpeg.
  server: embedding (preview = draft, final replaces it, labels, stale), finalize gate (blender-pending / blender-stale)
  packer: holders filled, lossless (the background stays the exact slide colour), videos inlined, draft tag, idempotent
  runtime: presenter mode plays the loop muted + looping only while current, poster only for still / all / capture / reduced motion
  finalize: Blender slides are listed as recorded (never recorded or re-rendered), embedded media stays, a draft stops it
  checker: each rule fires on one deliberately bad sample and passes on a good one"""
import contextlib, json, os, random, re, shutil, subprocess, sys, tempfile, time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ENGINE = REPO / 'engine'
NODE = shutil.which('node.exe') or shutil.which('node')
CANVAS = (249, 244, 242)


def node(args, cwd, env=None, timeout=300):
    e = dict(os.environ); e.update(env or {})
    r = subprocess.run([NODE] + [str(a) for a in args], cwd=str(cwd), capture_output=True, timeout=timeout, env=e,
                       stdin=subprocess.DEVNULL, text=True, encoding='utf-8', errors='replace')
    return r.returncode, (r.stdout or '') + (r.stderr or '')


# ---------------------------------------------------------------- pictures and loops (Pillow + ffmpeg)
def disc_frame(w, h, k, n, bg=CANVAS, period=True, sweep=1.0, size=0.16, fade=True):
    """One frame: a blue disc with a grey shadow circling in the right half on a flat background. The edge margin stays exactly bg."""
    from PIL import Image, ImageDraw
    import math
    im = Image.new('RGB', (w, h), bg)
    d = ImageDraw.Draw(im)
    ang = 2 * math.pi * sweep * (k / n if period else k / max(1, n - 1))
    cx, cy, r = w * 0.68 + w * 0.08 * math.cos(ang), h * 0.5 + h * 0.10 * math.sin(ang), h * size
    d.ellipse([cx - r * 1.1, cy + r * 0.8, cx + r * 1.1, cy + r * 1.25], fill=tuple(max(0, c - 22) for c in bg))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(0, 97, 239))
    d.ellipse([cx - r * 0.5, cy - r * 0.7, cx - r * 0.1, cy - r * 0.3], fill=(190, 215, 250))
    return im


def mk_still(path, w=1920, h=1080, kind='good'):
    from PIL import Image
    if kind == 'bg': im = disc_frame(w, h, 0, 1, bg=(255, 255, 255))                    # a white background on a warm canvas slide
    elif kind == 'black': im = Image.new('RGB', (w, h), (14, 14, 16))
    elif kind == 'blank': im = Image.new('RGB', (w, h), CANVAS)
    elif kind == 'noise':
        random.seed(3); im = Image.frombytes('RGB', (w, h), random.randbytes(w * h * 3))
        im = im.convert('RGBA'); im.putalpha(Image.frombytes('L', (w, h), random.randbytes(w * h)).point(lambda v: 200 + v // 5))
    else: im = disc_frame(w, h, 0, 1)
    im.save(path, 'PNG')


def mk_loop(path, w=1280, h=720, fps=20, n=20, kind='good', ffmpeg=None):
    tmp = Path(tempfile.mkdtemp(prefix='lumi-loop-'))
    try:
        for k in range(n):
            disc_frame(w, h, k, n, period=(kind != 'seam'), sweep=(1.0 if kind != 'seam' else 0.75)).save(tmp / f'f{k:04d}.png')
        subprocess.run([ffmpeg, '-y', '-loglevel', 'error', '-framerate', str(fps), '-i', str(tmp / 'f%04d.png'), '-c:v', 'libx264', '-crf', '18',
                        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(path)], check=True, capture_output=True)
        disc_frame(w, h, 0, n).save(str(path)[:-4] + '-poster.png')
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def put_render(adir, sid, kind, still_kind='good', loop_kind='good', size=None, fps=20, draft=False, labels=None, ffmpeg=None):
    """Write assets/blender/<sid>.* the way the server's bl_embed does."""
    adir.mkdir(parents=True, exist_ok=True)
    if kind == 'animation':
        w, h = size or (1280, 720)
        mk_loop(adir / f'{sid}.mp4', w, h, fps=fps, kind=loop_kind, ffmpeg=ffmpeg)
        os.replace(adir / f'{sid}-poster.png', adir / f'{sid}-poster.png')
    else:
        w, h = size or ((576, 324) if draft else (1920, 1080))
        mk_still(adir / f'{sid}.png', w, h, still_kind)
    meta = {'sid': sid, 'kind': kind, 'draft': draft, 'source': 'preview' if draft else 'final', 'width': w, 'height': h, 'fps': fps if kind == 'animation' else None,
            'labels': {'w': w, 'h': h, 'fps': 20, 'frames': 1, 'anchors': labels} if labels else None}
    (adir / f'{sid}.json').write_text(json.dumps(meta), encoding='utf-8')


def deck_html(cases):
    """A Bold Blue deck (the scaffold's head) with one slide per case: (sid, kind, extra holder html, slide class)."""
    notes = '<aside class="notes" data-aura-notes><p>' + ' '.join(['words'] * 70) + '</p></aside>'
    slides = ''
    for i, (sid, kind, inner, cls) in enumerate(cases, 1):
        slides += (f'<section class="slide{(" " + cls) if cls else ""}" data-kind="content" data-minutes="1" data-title="Case {i}"><div class="safe"><div class="bb-main stack">'
                   f'<div class="bb-stage"><div class="bb-blender bb-3d" data-blender="{sid}" data-kind="{kind}" role="img" aria-label="case {i}">{inner}</div></div></div>'
                   f'<footer class="bb-foot"><span class="bb-mark" data-edit="x{i}">Mark</span><span class="bb-pageno"></span></footer></div>{notes}</section>\n')
    return slides


def scaffold(sandbox, slug, slides_html):
    """new_deck.js scaffold, its slides replaced by slides_html."""
    code, out = node([sandbox / '.aura' / 'engine' / 'tools' / 'new_deck.js', 'Blender deck test', '--theme', 'bold-blue', '--slug', slug, '--force'], sandbox)
    b = sandbox / '.aura' / 'temp' / 'build' / slug
    h = (b / 'index.html').read_text(encoding='utf-8')
    h = re.sub(r'<main class="deck"[^>]*>.*</main>', lambda m: '<main class="deck" data-mode="presenter">\n' + slides_html + '</main>', h, flags=re.S)
    h = re.sub(r'<script>\s*/\* ---- slide 1.*?</script>', '', h, flags=re.S)
    (b / 'index.html').write_text(h, encoding='utf-8')
    return b


def pack(build, out_dir, title='Blender deck test'):
    r = subprocess.run([sys.executable, str(ENGINE / 'tools' / 'pack_deck.py'), str(build), '--title', title, '--out', str(out_dir), '--replace'],
                       capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=600, stdin=subprocess.DEVNULL)
    m = re.search(r'^Packed: (.+)$', r.stdout, re.M)
    root = next((d for d in [Path(build).resolve()] + list(Path(build).resolve().parents) if (d / '.aura').is_dir()), Path.cwd())
    p = Path(m.group(1)) if m else None
    return r.returncode, r.stdout + r.stderr, (p if p is None or p.is_absolute() else root / p)


def run(T=None, browser=True):
    if T is None:
        class T: pass
        a = sys.argv
        T.SANDBOX = Path(a[a.index('--sandbox') + 1]) if '--sandbox' in a else Path(r'X:\aura-dev-blender2')
        T.REPO = REPO
        T.results = []
        globals()['_T'] = T
        def check(name, ok, info=''):
            T.results.append(bool(ok)); print(('  PASS ' if ok else '  FAIL ') + name + ('' if ok else f'   <- {info}'))
        T.check = check
        browser = '--no-browser' not in a
        os.environ.setdefault('AURA_TEST_UNIT_ROOT', str(Path(T.SANDBOX) / 'unit'))
    check = T.check
    sandbox = Path(T.SANDBOX)
    sys.path.insert(0, str(ENGINE)); sys.path.insert(0, str(Path(__file__).parent)); sys.dont_write_bytecode = True
    import form_server as fs
    import test_batch_c as C
    os.environ.setdefault('AURA_TEST_UNIT_ROOT', str(sandbox / 'unit'))
    ff = fs.ffmpeg_exe()
    print('\n[Blender batch 2: embedding, packing, finalize gate (in-process)]')
    check('tools: ffmpeg and node are available', bool(ff and NODE), (ff, NODE))
    if not (ff and NODE): return
    from PIL import Image
    import io, base64

    with C.unit_root(fs, 'bl2-unit') as root:
        old_py, old_av = fs.VENV_PY, fs.blender_available
        fs.VENV_PY, fs.blender_available = Path(sys.executable), (lambda: True)
        old_runner = fs.RUNNER
        said = []
        fs.RUNNER = type('R', (), {'add': lambda self, *a, **k: said.append((a, k)), 'busy': False, 'deck_id': None, 'assign_job': None})()
        try:
            dk = 'dkblend2'
            plan = {'version': 1, 'title': 'T', 'slides': [
                {'id': 's1', 'title': 'Pump', 'visual': {'main': '3d', 'motion': 'still', 'engine': 'blender'}},
                {'id': 's2', 'title': 'Rotor', 'visual': {'main': '3d', 'motion': 'timed', 'engine': 'blender'}},
                {'id': 's3', 'title': 'Live', 'visual': {'main': '3d', 'motion': 'timed', 'engine': 'threejs'}}]}
            build = root / '.aura' / 'temp' / 'build' / 'bl2'
            (build / 'assets').mkdir(parents=True)
            (build / 'index.html').write_text(
                '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Unit</title></head><body><main class="deck">'
                '<section class="slide"><div class="bb-blender bb-full" data-blender="s1" data-kind="still"><div class="bb-tag" data-anchor="top"><b>Top</b></div><div class="bb-tag" data-anchor="gone"><b>Gone</b></div></div></section>'
                '<section class="slide"><div class="bb-blender bb-3d" data-blender="s2" data-kind="animation"></div></section></main></body></html>', encoding='utf-8')
            C.deck_json(fs, root, dk, build='bl2', plan=plan, flow='plan')
            wd = fs.work_dir(dk); (wd / 'blender' / 's1' / 'previews').mkdir(parents=True); (wd / 'blender' / 's2' / 'previews').mkdir(parents=True)
            # slide 1: one preview (with a label file) and nothing else
            pv = wd / 'blender' / 's1' / 'previews' / 'preview-1.png'; mk_still(pv, 576, 324)
            pv.with_suffix('.labels.json').write_text(json.dumps({'w': 576, 'h': 324, 'fps': 20, 'frames': 1, 'anchors': {'top': [[61.5, 22.25]]}}), encoding='utf-8')
            fs.set_bl(dk, 's1', engine='blender', kind='still', status='preview', previews=[{'n': 1, 'png': fs.rel_root(pv), 'sceneHash': 'x'}])
            meta = fs.bl_embed(dk, 's1')
            ad = build / 'assets' / 'blender'
            check('embed: a preview becomes a DRAFT in assets/blender (png + json), with the label anchors', meta and meta['draft'] is True and meta['source'] == 'preview'
                  and (ad / 's1.png').is_file() and json.loads((ad / 's1.json').read_text(encoding='utf-8'))['labels']['anchors']['top'] == [[61.5, 22.25]], meta)
            check('embed: index.html is never touched (Claude owns it)', 'data-filled' not in (build / 'index.html').read_text(encoding='utf-8'))
            check('embed: a slide with no render at all embeds nothing', fs.bl_embed(dk, 's2') is None and not (ad / 's2.json').exists())
            rc, out, packed = pack(build, wd)
            check('pack: runs and reports the Blender render', rc == 0 and 'Blender render(s)' in out and packed and packed.is_file(), out[-300:])
            h = packed.read_text(encoding='utf-8')
            check('pack: the holder is filled (img + draft tag) and data-draft is set; no <video> for a still', 'data-filled="1"' in h and 'data-draft="1"' in h and 'class="bb-blender-img"' in h
                  and 'bb-blender-tag' in h and '>preview</span>' in h and '<video' not in h.split('data-blender="s1"')[1].split('</section>')[0], h[:100])
            check('pack: the anchors travel on the holder (data-anchors) and the unfilled slide is marked pending', 'data-anchors="{&quot;top&quot;:[[61.5,22.25]]}"' in h
                  and 'data-blender="s2" data-kind="animation" data-pending="1"' in h)
            check('pack: still offline (no external reference) and the assets folder is not referenced any more', 'assets/blender' not in h.split('<main')[1] and not re.search(r'(src|href)="https?:', h))
            # slide 1: the final render replaces the draft; a loop for slide 2
            fp = wd / 'blender' / 's1' / 'final.png'; mk_still(fp, 1920, 1080)
            fp.with_name('final.labels.json').write_text(json.dumps({'w': 1920, 'h': 1080, 'fps': 20, 'frames': 1, 'anchors': {'top': [[70.0, 30.0]]}}), encoding='utf-8')
            lp = wd / 'blender' / 's2' / 'final.mp4'; mk_loop(lp, ffmpeg=ff); os.replace(str(lp)[:-4] + '-poster.png', wd / 'blender' / 's2' / 'final-poster.png')
            fs.set_bl(dk, 's1', status='rendered', final={'kind': 'still', 'res': 1080, 'width': 1920, 'height': 1080, 'fps': 20, 'frames': 1, 'file': fs.rel_root(fp), 'stale': False})
            fs.set_bl(dk, 's2', engine='blender', kind='animation', status='rendered',
                      final={'kind': 'animation', 'res': 720, 'width': 1280, 'height': 720, 'fps': 20, 'frames': 20, 'file': fs.rel_root(lp), 'poster': fs.rel_root(wd / 'blender' / 's2' / 'final-poster.png'), 'stale': False})
            check('pick: the final render wins over a newer preview', fs.bl_pick(dk, 's1')['source'] == 'final' and not fs.bl_pick(dk, 's1')['draft'])
            ok = fs.bl_embed_pack(dk)
            if not ok: print('   pack said:', said[-1:] )
            rec = fs.load_deck(dk)
            packed2 = fs.ROOT / rec['file']
            h2 = packed2.read_text(encoding='utf-8')
            check('embed + pack: bl_embed_pack puts both finals into the editable deck and records it', ok and packed2.is_file() and h2.count('data-filled="1"') == 2
                  and 'data-draft' not in h2.split('<main')[1] and 'bb-blender-tag' not in h2.split('<main')[1], (ok, rec.get('file')))
            check('pack: a loop is an <img> (the poster) + a muted looping <video> with inlined mp4 data, preload metadata', re.search(r'<video class="bb-blender-video" src="data:video/mp4;base64,', h2)
                  and ' muted loop playsinline preload="metadata"' in h2 and 'poster="data:image/' in h2)
            m = re.search(r'data-blender="s1"[^>]*>.*?<img class="bb-blender-img" src="data:image/(\w+);base64,([^"]+)"', h2, re.S)
            im = Image.open(io.BytesIO(base64.b64decode(m.group(2)))).convert('RGB') if m else None
            src = Image.open(fp).convert('RGB')
            check('pack: the still is inlined LOSSLESS (pixel for pixel equal, so the background stays the exact slide colour)', im is not None and im.size == (1920, 1080)
                  and list(im.getdata()) == list(src.getdata()) and im.getpixel((0, 0)) == CANVAS, (m.group(1) if m else None))
            check('pack: the final replaced the draft labels (anchors 70/30)', '[[70.0,30.0]]' in h2.replace('&quot;', '"'))
            before = h2
            check('pack twice: the same input gives the same Blender markup (idempotent fill)', fs.bl_embed_pack(dk) and (fs.ROOT / fs.load_deck(dk)['file']).read_text(encoding='utf-8').count('data-filled="1"') == 2)
            # a change after the final: stale, kept
            fs.set_bl(dk, 's1', final=dict(fs.bl_state(fs.load_deck(dk), 's1')['final'], stale=True), status='preview', approved=None)
            check('a stale final stays embedded until a new render replaces it (not the newer preview)', fs.bl_pick(dk, 's1')['source'] == 'final' and fs.bl_pick(dk, 's1')['stale'] is True)
            # finalize gate
            rec = fs.load_deck(dk)
            g = fs.bl_finalize_gate(rec)
            check('gate: a stale final asks (409 blender-stale, slide 1)', g and g[0] == 409 and g[1]['error'] == 'blender-stale' and g[1]['slides'] == [1], g)
            check('gate: ...and goes on when the user accepts the older render', fs.bl_finalize_gate(rec, accept_stale=True) is None)
            fs.set_bl(dk, 's2', final=None)
            g = fs.bl_finalize_gate(fs.load_deck(dk), accept_stale=True)
            check('gate: a Blender slide with no final render -> 409 blender-pending listing slide 2 (the live three.js slide 3 is not asked)',
                  g and g[0] == 409 and g[1]['error'] == 'blender-pending' and g[1]['slides'] == [2] and 'not finished' in g[1]['reason'] and 'studio render' in g[1]['reason'], g)
            fs.set_bl(dk, 's2', final={'kind': 'animation', 'file': 'missing.mp4'})
            check('gate: a final whose file is gone counts as no render', fs.bl_finalize_gate(fs.load_deck(dk), accept_stale=True)[1]['slides'] == [2])
            st, body = fs.FINALIZER.start(dk)
            check('Finalizer.start refuses with the gate before it touches anything (no finalize ran)', st == 409 and body['error'] == 'blender-pending' and not fs.FINALIZER.status().get('running'), (st, body))
        finally:
            fs.VENV_PY, fs.blender_available, fs.RUNNER = old_py, old_av, old_runner

    # ---------------------------------------------------------------- the engine mismatch of 0.5.3 / 0.5.4 (FIXLOG: finalize engine-mismatch)
    # The owner's deck: a Flat-Pack (NOT Bold Blue) deck whose 3D slides carry no explicit engine. slide_engine resolved them to
    # three.js, so the server made no Blender job, but the build wrote a .bb-blender holder on one of them anyway. finalize.js
    # only found that at the very end of a long run ("slide 14 still shows no render"); the gate had never looked at the slide,
    # because its engine was not blender.
    print('\n[finalize engine mismatch: a 3D slide with no engine on a look that is not Bold Blue]')
    with C.unit_root(fs, 'bl2-mismatch') as root:
        old_av = fs.blender_available
        fs.blender_available = lambda: True
        try:
            check('engine: a 3D STILL slide with no engine on a look that is not Bold Blue is live 3D',
                  fs.slide_engine({'look': 'Flat-Pack'}, {'visual': {'main': '3d', 'motion': 'still'}}, True)['engine'] == 'threejs')
            check('engine: a 3D ANIMATION with no engine is live 3D on every look (auto never picks a 10-60 min render)',
                  fs.slide_engine({'look': 'Bold Blue'}, {'visual': {'main': '3d', 'motion': 'timed'}}, True)['engine'] == 'threejs')
            dk = 'dkmismatch'
            plan = {'version': 1, 'title': 'T', 'slides': [
                {'id': 's1', 'title': 'Live still', 'visual': {'main': '3d', 'motion': 'still'}},       # 3D, no engine, NO holder
                {'id': 's16', 'title': 'Fin sheets', 'visual': {'main': '3d', 'motion': 'timed'}},      # 3D, no engine, WITH a holder
                {'id': 's3', 'title': 'Words', 'visual': {'main': 'text'}}]}
            C.deck_json(fs, root, dk, look='Flat-Pack', plan=plan, flow='plan')
            eng = fs.plan_engines(fs.load_deck(dk))
            check('the deck that broke: both 3D slides resolve to three.js, so Lumi makes no Blender job for either',
                  eng['s1']['engine'] == 'threejs' and eng['s16']['engine'] == 'threejs', eng)
            wd = fs.work_dir(dk); wd.mkdir(parents=True, exist_ok=True)
            html = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Unit</title></head><body><main class="deck">'
                    '<section class="slide"><div class="aura-3d" data-scene="s1"></div></section>'
                    '<section class="slide"><div class="bb-blender bb-3d" data-blender="s16" data-kind="animation"></div></section>'
                    '<section class="slide"><h1>Words</h1></section></main></body></html>')
            (wd / 'deck.html').write_text(html, encoding='utf-8')
            rec = fs.update_deck(dk, file=fs.rel_root(wd / 'deck.html'))
            check('holders: the built deck is read back, and the unfilled holder on slide 2 is seen',
                  fs.bl_holders(rec) == {'s16': False}, fs.bl_holders(rec))
            g = fs.bl_finalize_gate(rec)
            check('gate: a Blender holder no render will ever fill -> 409 blender-pending naming slide 2, whatever its engine says',
                  g and g[0] == 409 and g[1]['error'] == 'blender-pending' and g[1]['slides'] == [2] and g[1]['orphans'] == [2]
                  and not g[1]['pending'] and 'live 3D' in g[1]['reason'], g)
            check('gate: slide 1 is 3D with no engine and no holder, so it is NOT asked about (it finalizes as live 3D)',
                  1 not in (g[1]['slides'] if g else []), g)
            old_runner, old_pptx = fs.RUNNER, fs.PPTX
            fs.RUNNER = type('R', (), {'busy': False, 'deck_id': None, 'assign_job': None})()
            fs.PPTX = type('X', (), {'status': lambda self: {}})()
            try:
                st, body = fs.FINALIZER.start(dk)
                check('Finalizer.start refuses the orphan holder BEFORE any finalize work starts (409, nothing running)',
                      st == 409 and body['error'] == 'blender-pending' and body['slides'] == [2] and not fs.FINALIZER.status().get('running'), (st, body))
                # the same deck once the holder is gone: a live 3D slide with no render finalizes, as it should
                (wd / 'deck.html').write_text(html.replace('<div class="bb-blender bb-3d" data-blender="s16" data-kind="animation"></div>',
                                                           '<div class="aura-3d" data-scene="s16"></div>'), encoding='utf-8')
                check('gate: with the holder replaced by a live scene the gate lets the deck through',
                      fs.bl_finalize_gate(fs.load_deck(dk)) is None, fs.bl_finalize_gate(fs.load_deck(dk)))
            finally:
                fs.RUNNER, fs.PPTX = old_runner, old_pptx
            # the engine is pinned into the plan at build time, so the deck and the server can never drift apart again
            rec = fs.load_deck(dk)
            rec = fs.pin_engine(rec, 's16', fs.slide_engine(rec, plan['slides'][1]))
            v = [s for s in fs.plan_slides(rec) if s['id'] == 's16'][0]['visual']
            check('pin: building a 3D slide writes the engine Lumi chose into the plan (never auto twice)', v.get('engine') == 'threejs', v)
            pj = json.loads((fs.work_dir(dk) / 'plan.json').read_text(encoding='utf-8'))
            check('pin: Claude\'s own plan.json carries it too', pj['slides'][1]['visual'].get('engine') == 'threejs', pj['slides'][1]['visual'])
            rec2 = fs.pin_engine(fs.load_deck(dk), 's16', {'engine': 'blender', 'kind': 'animation', 'chosen': False})
            v2 = [s for s in fs.plan_slides(rec2) if s['id'] == 's16'][0]['visual']
            check('pin: an engine that is already written is never overwritten', v2.get('engine') == 'threejs', v2)
            # the build step now TELLS Claude which engine the slide uses, and forbids the wrong holder
            msg = fs.build_message(fs.load_deck(dk), plan['slides'][1], 2, 3)
            check('build message: a live 3D slide is told so, and told not to write a .bb-blender holder',
                  'LIVE 3D SLIDE' in msg and 'bb-blender' in msg and 'data-blender' in msg, msg[-400:])
            check('build message: it still never says that to a text slide', 'LIVE 3D SLIDE' not in fs.build_message(fs.load_deck(dk), plan['slides'][2], 3, 3))
            # the list the build check is given: only the slides the server really renders
            check('check args: a deck with no Blender slide passes an empty --blender-slides list (the checker then knows)',
                  fs.blender_args(dk) == ['--blender-slides', ''], fs.blender_args(dk))
            fs.set_bl(dk, 's1', engine='blender', kind='still', status='writing')
            check('check args: a slide that holds Blender state is listed even if its engine moved on',
                  fs.blender_args(dk) == ['--blender-slides', 's1'], fs.blender_args(dk))
            check('check args: no deck at all -> no flag, so a hand-run check behaves as before', fs.blender_args('nosuchdeck') == [])
        finally:
            fs.blender_available = old_av

    # ---------------------------------------------------------------- the live server, with the fake blender
    print('\n[Blender batch 2: embedding through the live server (fake blender)]')
    import test_blender as TB
    fake = Path(__file__).resolve().parent / 'fake_blender.py'
    srv = T.start_server(AURA_BLENDER=str(fake)) if hasattr(T, 'start_server') else None
    try:
        if srv is None: raise StopIteration
        P = C.make_plan_deck(T, 'Blender deck two')
        plan = json.loads(json.dumps(T.plan_of(P)['plan'])); S = plan['slides']
        S[0].update(title='Pump studio', visual={'main': '3d', 'companions': [], 'detail': 'detailed', 'motion': 'still', 'phrase': 'a pump'})
        S[1].update(title='Spinning rotor', visual={'main': '3d', 'companions': [], 'detail': 'detailed', 'motion': 'timed', 'phrase': 'a rotor', 'engine': 'blender'})
        T.save(P, plan); T.wait_plan_idle(P)
        TB.pin_cycles(T, P)        # the per-frame loop path (a deck from before baking); the baked path is in test_blender
        s1, s2 = [x['id'] for x in T.plan_of(P)['plan']['slides'][:2]]
        T.jpost(f'/api/decks/{P}/build', {'mode': 'next'}); T.wait_plan_idle(P)
        v = TB.wait_status(T, P, s1, ('preview', 'failed'))
        rec = T.jget(f'/api/decks/{P}')[1]['deck']
        bdir = T.SANDBOX / '.aura' / 'temp' / 'build' / rec['build'] / 'assets' / 'blender'
        t0 = time.time()
        while time.time() - t0 < 15 and not (bdir / f'{s1}.json').is_file(): time.sleep(0.2)
        mj = json.loads((bdir / f'{s1}.json').read_text(encoding='utf-8')) if (bdir / f'{s1}.json').is_file() else {}
        check('server: the preview is embedded as a draft after preview-done (assets/blender/<sid>.png + .json)', (bdir / f'{s1}.png').is_file() and mj.get('draft') is True and mj.get('source') == 'preview', mj)
        # a scene with an anchor: the next preview carries labels
        scene = T.SANDBOX / '.aura' / 'decks' / P / 'blender' / s1 / 'scene.py'
        scene.write_text(scene.read_text(encoding='utf-8') + "\n# L.anchor('top', None)\n", encoding='utf-8')
        T.jpost(f'/api/decks/{P}/blender/{s1}/preview', {})
        v = TB.wait_status(T, P, s1, ('preview', 'failed'))
        time.sleep(1.5)
        mj = json.loads((bdir / f'{s1}.json').read_text(encoding='utf-8'))
        check('server: label anchors recorded with the render reach the embed (percent of the frame)', mj.get('labels') and 'top' in mj['labels']['anchors'] and len(mj['labels']['anchors']['top'][0]) == 2, mj.get('labels'))
        s, j = T.jpost(f'/api/decks/{P}/finalize', {})
        check('finalize is refused while slide 1 has no full render (409 blender-pending, slide numbers named)', s == 409 and j.get('error') == 'blender-pending' and 1 in j.get('slides', []), (s, j))
        T.jpost(f'/api/decks/{P}/blender/{s1}/approve', {})
        s, j = T.jpost(f'/api/decks/{P}/blender/{s1}/render', {}); v = TB.wait_status(T, P, s1, ('rendered', 'failed'))
        t0 = time.time()
        while time.time() - t0 < 15 and json.loads((bdir / f'{s1}.json').read_text(encoding='utf-8')).get('draft'): time.sleep(0.2)
        mj = json.loads((bdir / f'{s1}.json').read_text(encoding='utf-8'))
        im = Image.open(bdir / f'{s1}.png')
        check('server: the full render replaces the draft in the embed (final, 1920x1080, labels from final.labels.json)', mj.get('draft') is False and mj.get('source') == 'final'
              and im.size == (1920, 1080) and 'top' in (mj.get('labels') or {}).get('anchors', {}), (mj, im.size))
        s, j = T.jpost(f'/api/decks/{P}/finalize', {})
        check('finalize still refused while the animation slide 2 has no full render', s == 409 and j.get('error') == 'blender-pending' and 2 in j.get('slides', []) and 1 not in j['slides'], (s, j))
        T.jpost(f'/api/decks/{P}/build', {'mode': 'next'}); T.wait_plan_idle(P)
        TB.wait_status(T, P, s2, ('preview', 'failed'))
        T.jpost(f'/api/decks/{P}/blender/{s2}/approve', {}); T.jpost(f'/api/decks/{P}/blender/{s2}/render', {'res': 720})
        TB.wait_status(T, P, s2, ('rendered', 'failed'), timeout=60)
        t0 = time.time()
        while time.time() - t0 < 20 and not (bdir / f'{s2}.mp4').is_file(): time.sleep(0.2)
        mj2 = json.loads((bdir / f'{s2}.json').read_text(encoding='utf-8')) if (bdir / f'{s2}.json').is_file() else {}
        check('server: an animation embeds its loop (mp4) and its poster, 20 fps, 1280x720', (bdir / f'{s2}.mp4').is_file() and (bdir / f'{s2}-poster.png').is_file()
              and mj2.get('fps') == 20 and mj2.get('height') == 720 and mj2.get('draft') is False, mj2)
    except StopIteration:
        print('  (standalone: the live-server part runs from test_server.py)')
    finally:
        if srv is not None: T.stop_server(srv)

    if not browser:
        return
    # ---------------------------------------------------------------- checker, runtime, finalize in Edge
    print('\n[Blender batch 2: checker rules on good and deliberately bad samples]')
    env = {'AURA_FFMPEG': str(ff), 'CLAUDE_PROJECT_DIR': str(sandbox)}
    cases = [('g1', 'still', '', ''), ('g2', 'animation', '', ''), ('wsz', 'still', '', ''), ('wlp', 'animation', '', ''), ('fps', 'animation', '', ''), ('bgc', 'still', '', ''),
             ('blk', 'still', '', ''), ('blank', 'still', '', ''), ('seam', 'animation', '', ''), ('big', 'still', '', ''), ('bad', 'still', '', ''), ('drf', 'still', '', ''),
             ('none', 'still', '', ''), ('lab', 'still', '<div class="bb-tag" data-anchor="nowhere"><b>Where</b></div>', ''), ('nov', 'animation', '', '')]
    sandbox_build = scaffold(sandbox, 'bl2-checks', deck_html(cases))
    ad = sandbox_build / 'assets' / 'blender'
    shutil.rmtree(ad, ignore_errors=True)
    put_render(ad, 'g1', 'still', ffmpeg=ff, labels=None)
    put_render(ad, 'g2', 'animation', ffmpeg=ff)
    put_render(ad, 'wsz', 'still', size=(1280, 720), ffmpeg=ff)
    put_render(ad, 'wlp', 'animation', size=(960, 540), ffmpeg=ff)
    put_render(ad, 'fps', 'animation', fps=30, ffmpeg=ff)
    put_render(ad, 'bgc', 'still', still_kind='bg', ffmpeg=ff)
    put_render(ad, 'blk', 'still', still_kind='black', ffmpeg=ff)
    put_render(ad, 'blank', 'still', still_kind='blank', ffmpeg=ff)
    put_render(ad, 'seam', 'animation', loop_kind='seam', ffmpeg=ff)
    put_render(ad, 'big', 'still', still_kind='noise', ffmpeg=ff)
    put_render(ad, 'bad', 'still', ffmpeg=ff); (ad / 'bad.png').write_bytes(b'\x89PNG\r\n\x1a\nthis is not a picture')
    put_render(ad, 'drf', 'still', draft=True, ffmpeg=ff)
    put_render(ad, 'lab', 'still', ffmpeg=ff, labels={'other': [[50.0, 50.0]]})
    put_render(ad, 'nov', 'animation', ffmpeg=ff); (ad / 'nov.mp4').unlink(); shutil.copyfile(ad / 'nov-poster.png', ad / 'nov.png'); (ad / 'nov-poster.png').unlink()   # an animation slide whose loop video is missing
    packed_dir = sandbox / '.aura' / 'temp' / 'bl2-packed'; shutil.rmtree(packed_dir, ignore_errors=True)
    rc, out, packed = pack(sandbox_build, packed_dir, 'Blender checks')
    check('samples: the 15-slide sample deck packs', rc == 0 and packed and packed.is_file(), out[-300:])
    code, out = node([ENGINE / 'tools' / 'deck_check.js', packed, '--no-shots'], sandbox, env)
    lines = [l for l in out.splitlines() if re.search(r'studio render', l)]
    on = lambda slide: [l for l in lines if f'slide {slide} ' in l]
    has = lambda slide, level, text: any(l.strip().startswith(level) and text in l for l in on(slide))
    check('GOOD still (slide 1): no studio-render error and no warning', not on(1), on(1))
    check('GOOD loop (slide 2): no studio-render error or warning, and the loop is reported (20 fps, seam measured)', not [l for l in on(2) if 'ERROR' in l or 'warn' in l]
          and any('slide 2 loop: 20 frames, 1280x720 20 fps' in l for l in lines), on(2))
    check('RULE size, still: 1280 x 720 still -> a still must be 1920 x 1080', has(3, 'ERROR', 'a still must be 1920 x 1080'), on(3))
    check('RULE size, loop: a 960 x 540 loop -> a loop must be 1280 x 720 or 1920 x 1080', has(4, 'ERROR', 'a loop must be 1280 x 720 or 1920 x 1080'), on(4))
    check('RULE frame rate: a 30 fps loop -> loop runs at 30 fps', has(5, 'ERROR', 'loop runs at 30 fps'), on(5))
    check('RULE edge colour: a white background on the warm canvas -> background is not the slide colour', has(6, 'ERROR', 'background is not the slide colour'), on(6))
    check('RULE not black: a near-black picture -> looks black', has(7, 'ERROR', 'looks black'), on(7))
    check('RULE not blank: only background -> is blank', has(8, 'ERROR', 'is blank'), on(8))
    check('RULE seamless: a loop that does not close -> loop is not seamless', has(9, 'ERROR', 'loop is not seamless'), on(9))
    check('RULE file budget: an 8 MB still -> stays under 6 MB', has(10, 'ERROR', 'a still stays under 6 MB'), on(10))
    check('RULE readable: a corrupt picture -> could not be read', has(11, 'ERROR', 'could not be read (the picture did not decode)'), on(11))
    check('RULE draft: a preview is not the approved render -> a WARNING while building', has(12, 'warn', 'shows a preview, not the approved render'), on(12))
    check('RULE present: no render in the deck yet -> a WARNING while building', has(13, 'warn', 'is not in the deck yet'), on(13))
    check('RULE labels: a label with no anchor point in the render -> warn', has(14, 'warn', 'no anchor point'), on(14))
    check('RULE readable: an animation slide without its loop video -> could not be read', has(15, 'ERROR', 'loop video is missing') or has(15, 'ERROR', 'could not be read'), on(15))
    check('the bad samples make the check fail (exit 1) while the good ones add nothing', code == 1, code)
    code2, out2 = node([ENGINE / 'tools' / 'deck_check.js', packed, '--no-shots', '--finalize'], sandbox, env)
    l2 = [l for l in out2.splitlines() if 'studio render' in l]
    check('--finalize: the draft preview and the missing render become ERRORS', any(l.strip().startswith('ERROR slide 12') and 'shows a preview, not the approved render' in l for l in l2)
          and any(l.strip().startswith('ERROR slide 13') and 'is not in the deck yet' in l for l in l2), l2[-6:])
    # the unpacked build folder (what Claude's Stop hook sees while building) never errors for a missing render
    plain = scaffold(sandbox, 'bl2-building', deck_html([('g1', 'still', '', ''), ('g2', 'animation', '', '')]))
    code3, out3 = node([ENGINE / 'tools' / 'deck_check.js', plain, '--no-shots'], sandbox, env)
    ls = [l for l in out3.splitlines() if 'studio render' in l]
    check('while Claude builds (no render yet) the check only warns, so the Stop hook never blocks on it', len(ls) == 2 and all(l.strip().startswith('warn') for l in ls) and 'ERROR' not in ' '.join(ls), ls)
    # FIXLOG "finalize engine-mismatch": the server names the slides it really renders, so a holder on any OTHER slide is an
    # orphan - no render is ever made for it - and that is an ERROR at once, on that slide, not a finalize that dies at the end.
    code4, out4 = node([ENGINE / 'tools' / 'deck_check.js', plain, '--no-shots', '--blender-slides', 'g1'], sandbox, env)
    l4 = [l for l in out4.splitlines() if 'studio render' in l]
    check('build check: a .bb-blender holder on a slide the server does not render is an ERROR right after the build step',
          any(l.strip().startswith('ERROR slide 2') and 'NOT a studio render slide' in l for l in l4) and code4 == 1, l4)
    check('build check: the real Blender slide in the same deck still only warns that its render is not there yet',
          any(l.strip().startswith('warn') and ' slide 1 ' in l and 'is not in the deck yet' in l for l in l4), l4)

    # batch 6 B.7: the baked rules, on synthetic measurements (the browser side is covered by a real bake in the sandbox walk)
    js = ("const B = require(process.argv[1]); const R = require(process.argv[2]).blender;"
          "const ok = { n: 1, sid: 'b', kind: 'animation', baked: true, filled: true, period: 5, hasPoster: true, drawn: true, bg: [249, 244, 242], labels: [], anchors: [],"
          " px: { nonBg: 0.2, black: 0, luma: 200, patches: { tl: [249, 244, 242], tr: [249, 244, 242], bl: [249, 244, 242], br: [249, 244, 242] } } };"
          "const run = x => B.judge([Object.assign({}, ok, x)], { rules: R, deckDir: '.', finalize: true }).errors.map(e => e.msg);"
          "console.log(JSON.stringify({ good: run({}), poster: run({ hasPoster: false }), period: run({ period: 0 }), dead: run({ drawn: false, failed: true }),"
          " blank: run({ px: Object.assign({}, ok.px, { nonBg: 0 }) }), edge: run({ px: Object.assign({}, ok.px, { patches: { tl: [0, 0, 0], tr: [249, 244, 242], bl: [249, 244, 242], br: [249, 244, 242] } }) }) }));")
    code5, out5 = node(['-e', js, ENGINE / 'tools' / 'lib' / 'blender_check.js', ENGINE / 'rules' / 'hard-rules.json'], sandbox)
    try: bk = json.loads(out5.strip().splitlines()[-1])
    except (ValueError, IndexError): bk = {}
    check('B.7 baked: a good baked holder passes', bk.get('good') == [], out5[-300:])
    check('B.7 baked: no poster, no loop period, a model that did not draw, blank, wrong edge colour - each is an ERROR',
          all(len(bk.get(k) or []) >= 1 for k in ('poster', 'period', 'dead', 'blank', 'edge'))
          and 'poster' in ' '.join(bk['poster']) and 'period' in ' '.join(bk['period']) and 'did not draw' in ' '.join(bk['dead']), bk)

    print('\n[Blender batch 2: presenter mode, PDF still, finalize skipping the render]')
    good = scaffold(sandbox, 'bl2-run', deck_html([('g1', 'still', '', ''), ('g2', 'animation',
                    '<div class="bb-tag blue" data-anchor="body" data-align="left" data-edit="no"><b>Body</b></div><div class="bb-tag hot" data-anchor="ring" data-edit="no"><b>Ring</b></div>', ''),
                    ('drf', 'still', '', '')]))
    ad = good / 'assets' / 'blender'; shutil.rmtree(ad, ignore_errors=True)
    anchors = {'body': [[60.0 + k, 40.0] for k in range(20)], 'ring': [[75.0, 50.0 + k * 0.5] for k in range(20)]}
    put_render(ad, 'g1', 'still', ffmpeg=ff)
    put_render(ad, 'g2', 'animation', ffmpeg=ff, labels=anchors)
    put_render(ad, 'drf', 'still', draft=True, ffmpeg=ff)
    # a deck with the draft slide removed for the "finished" runs
    rc, out, packed_all = pack(good, sandbox / '.aura' / 'temp' / 'bl2-run-packed', 'Blender run')
    run_html = packed_all.read_text(encoding='utf-8')
    done_html = re.sub(r'<section class="slide"[^>]*data-title="Case 3".*?</section>', '', run_html, flags=re.S)
    done_path = packed_all.with_name('Blender done.html'); done_path.write_text(done_html, encoding='utf-8')
    code, out = node([Path(__file__).parent / 't_blender_runtime.js', done_path], sandbox, {'ENGINE': str(ENGINE)}, timeout=240)
    m = re.search(r'RESULT (\{.*\})', out)
    r = json.loads(m.group(1)) if m else {}
    check('runtime: the browser test ran without a page error', m and not r.get('errors') and not r.get('fatal'), (r.get('errors'), r.get('fatal'), out[-300:]))
    check('runtime: a still is an image only (1920 x 1080, filled), no video', (r.get('s1') or {}) == {'kind': 'still', 'w': 1920, 'h': 1080, 'video': False, 'filled': True}, r.get('s1'))
    check('runtime: the loop does NOT play while its slide is not current', (r.get('onS1') or {}).get('paused') is True and r['onS1']['src'].startswith('data:video/mp4'), r.get('onS1'))
    o2, o2l = r.get('onS2') or {}, r.get('onS2later') or {}
    check('presenter mode: on its slide the loop plays, muted and looping (time advances)', o2.get('paused') is False and o2.get('muted') is True and o2.get('loop') is True
          and o2l.get('t', 0) > o2.get('t', 0) >= 0, (o2, o2l))
    check('presenter mode: leaving the slide pauses the loop and rewinds it', (r.get('backS1') or {}).get('paused') is True and (r['backS1'].get('t') == 0), r.get('backS1'))
    lab = {x['n']: x for x in r.get('labels') or []}
    check('labels: [data-anchor] children sit at the recorded percentages (body ~60-80 %, ring 75 %), visible', lab.get('body', {}).get('shown') and 59 <= float(lab['body']['l'].rstrip('%')) <= 80
          and lab.get('ring', {}).get('l') == '75%', lab)
    st = r.get('still2') or {}
    check('?still=2 (the PDF page): the video is hidden and the poster image is what shows', st.get('videoDisplay') == 'none' and st.get('paused') is True and st.get('img') == 1280 and st.get('imgVisible'), st)
    al = r.get('all') or {}
    check('?aura=all: videos hidden and paused, every render decoded', all(x.startswith('none/') for x in al.get('videos', ['x'])) and al.get('imgs') == [1920, 1280], al)
    cp = r.get('capture') or {}
    check('capture contract: Blender slides are LumiCapture.recorded (still + animation), and NOT in LumiCapture.slides (never recorded again)',
          cp.get('slides') == [] and (cp.get('recorded') or {}).get('1', {}).get('kind') == 'still' and cp['recorded']['2']['kind'] == 'animation' and cp['recorded']['2']['filled'] and not cp['recorded']['2']['draft'], cp)
    check('reduced motion: the loop does not play (poster only)', (r.get('reduced') or {}).get('paused') is True and r['reduced'].get('display') == 'none', r.get('reduced'))

    out_html, out_pdf = sandbox / '.aura' / 'temp' / 'bl2-final.html', sandbox / '.aura' / 'temp' / 'bl2-final.pdf'
    calls = sandbox / '.aura' / 'temp' / 'bl2-blender-calls.log'; calls.write_text('', encoding='utf-8')
    code, out = node([ENGINE / 'tools' / 'finalize.js', done_path, '--html', out_html, '--pdf', out_pdf, '--ffmpeg', ff], sandbox, {'AURA_FAKE_BLENDER_LOG': str(calls)}, timeout=300)
    plan_ev = next((json.loads(l) for l in out.splitlines() if l.startswith('{') and '"t":"plan"' in l), {})
    check('finalize: Blender slides are listed as recorded and NOTHING is recorded or re-rendered (loops: [])', code == 0 and plan_ev.get('recorded') == [1, 2] and plan_ev.get('loops') == [], (code, plan_ev, out[-200:]))
    fh = out_html.read_text(encoding='utf-8') if out_html.is_file() else ''
    check('finalize: the embedded media is kept as it was (same video bytes, no lumi-loop script, no re-encode)', fh.count('<video class="bb-blender-video" src="data:') == 1 and re.search(r'<script type="text/plain" id="lumi-loop-\d+"', fh) is None
          and re.search(r'<video class="bb-blender-video" src="(data:video/mp4;base64,[^"]+)"', fh).group(1) == re.search(r'<video class="bb-blender-video" src="(data:video/mp4;base64,[^"]+)"', done_html).group(1))
    check('finalize: Blender was never started (no blender call logged) and the PDF exists with a page per slide + notes', calls.read_text(encoding='utf-8') == '' and out_pdf.is_file() and out_pdf.stat().st_size > 5000, out_pdf.exists())
    code, out = node([ENGINE / 'tools' / 'finalize.js', packed_all, '--html', out_html.with_name('bl2-draft.html'), '--pdf', out_pdf.with_name('bl2-draft.pdf'), '--ffmpeg', ff], sandbox, timeout=300)
    check('finalize: a slide that still shows a draft preview stops it with a plain message (exit 1, nothing written)', code == 1 and 'still shows a preview, not the approved render' in out
          and not out_html.with_name('bl2-draft.html').exists(), (code, out[-200:]))


if __name__ == '__main__':
    run()
    res = globals()['_T'].results
    print(f'{sum(res)}/{len(res)} checks passed')
    sys.exit(0 if all(res) else 1)
