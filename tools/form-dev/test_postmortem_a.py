"""Regression tests for the post-mortem fixes, batch A (docs/deck-b45622-postmortem.md, FIXLOG "Post-mortem fixes A").
Run by test_server.py (run(T)); also alone:
  python tools/form-dev/test_postmortem_a.py [--sandbox X:\\aura-dev-pm]
No server, no Claude, no real Blender - every check is in-process or one subprocess.

  P7  the pack path cannot emit a Python traceback, a Windows file lock is retried and then explained
  P9  the full render lane is still-first / shortest-first, and a running animation yields to a short job at a frame
      boundary and resumes from the frame after the last one on disk
  P1  an ORPHAN studio-render holder is told to change the slide's picture, never to "render it first"
  P8  two slides may not mint data-edit ids under one `s<k>-` prefix; the minting tool and the checker both say so
  P3  the step card carries the literal `[[aura:hint slide=...]]` form, and a dropped marker says what to write
  P10 the permission gate allows `< file` input redirection and the pure text filters, inside the Lumi folder only
"""
import json, os, re, shutil, subprocess, sys, tempfile, time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ENGINE = REPO / 'engine'
NODE = shutil.which('node.exe') or shutil.which('node')

MINI_DECK = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Mini</title></head><body><main class="deck">'
             '<section class="slide"><h2 data-edit="s1-1">One</h2></section>'
             '<section class="slide"><h2 data-edit="s2-1">Two</h2></section></main></body></html>')


def node_run(args, cwd=REPO, timeout=120):
    r = subprocess.run([NODE] + [str(a) for a in args], cwd=str(cwd), capture_output=True, timeout=timeout)
    return r.returncode, (r.stdout + r.stderr).decode('utf-8', 'replace')


def py_run(args, cwd=REPO, timeout=300):
    r = subprocess.run([sys.executable] + [str(a) for a in args], cwd=str(cwd), capture_output=True, timeout=timeout)
    return r.returncode, (r.stdout + r.stderr).decode('utf-8', 'replace')


RAW = ('Traceback (most recent call last):\n'
       '  File "C:\\Lumi\\.aura\\engine\\tools\\pack_deck.py", line 99, in main\n'
       '    os.replace(tmp, target)\n'
       "PermissionError: [WinError 5] Access is denied: 'C:\\\\Lumi\\\\4 - Your slides\\\\Plain vs Wavy Fins.html.part' "
       "-> 'C:\\\\Lumi\\\\4 - Your slides\\\\Plain vs Wavy Fins.html'")
NODE_STACK = ('TypeError: Cannot read properties of undefined (reading \'x\')\n'
              '    at Object.<anonymous> (C:\\Lumi\\.aura\\engine\\tools\\finalize.js:120:5)\n'
              '    at node:internal/main/run_main_module:23:47')


def pack_suite(check, tmp):
    """P7: no traceback can leave the pack path."""
    sys.path.insert(0, str(ENGINE / 'tools'))
    sys.dont_write_bytecode = True
    import pack_deck as pk
    import form_server as fs

    check('P7 friendly_tool_error: the real 11:07:23 traceback becomes "close the deck ... and try again"',
          'Traceback' not in fs.friendly_tool_error(RAW) and 'WinError' not in fs.friendly_tool_error(RAW)
          and 'open in another program' in fs.friendly_tool_error(RAW) and '.html' in fs.friendly_tool_error(RAW),
          fs.friendly_tool_error(RAW))
    nj = fs.friendly_tool_error(NODE_STACK)
    check('P7 friendly_tool_error: a Node stack never reaches the user either',
          ' at ' not in nj and 'node:internal' not in nj and 'TypeError' in nj, nj)
    check('P7 friendly_tool_error: an ordinary last line is passed through unchanged',
          fs.friendly_tool_error('Could not pack the deck: the title is empty.') == 'Could not pack the deck: the title is empty.')
    check('P7 friendly_tool_error: no output at all still says something',
          fs.friendly_tool_error('') and fs.friendly_tool_error('   \n '))
    check('P7 file_locked knows WinError 5 / 32 and nothing else',
          fs.file_locked(PermissionError(13, 'x')) and not fs.file_locked(FileNotFoundError(2, 'x')))

    # replace_retry really retries, and gives up with the lock error rather than something else
    d = tmp / 'retry'; d.mkdir(parents=True, exist_ok=True)
    (d / 'a.part').write_text('x', encoding='utf-8')
    (d / 'a.html').mkdir(exist_ok=True)              # os.replace onto a directory = WinError 5, the same error as the deck
    t0 = time.time()
    try:
        pk.replace_retry(d / 'a.part', d / 'a.html', tries=3, wait=0.05)
        locked = False
    except OSError as e:
        locked = pk.is_locked(e)
    check('P7 pack_deck.replace_retry: retries, then raises the lock error', locked and 0.08 <= time.time() - t0 < 5, round(time.time() - t0, 3))
    (d / 'b.part').write_text('y', encoding='utf-8')
    pk.replace_retry(d / 'b.part', d / 'b.html', tries=3, wait=0.05)
    check('P7 pack_deck.replace_retry: an ordinary replace still just works', (d / 'b.html').read_text(encoding='utf-8') == 'y')
    check('P7 pack_deck.os_reason never shows a class repr for a lock or a full disk',
          'open in another program' in pk.os_reason(PermissionError(13, 'denied')) and 'disk is full' in pk.os_reason(OSError(28, 'full')))

    # end to end: pack a tiny deck, then pack it again with the target locked
    build = tmp / 'build'; build.mkdir(parents=True, exist_ok=True)
    (build / 'index.html').write_text(MINI_DECK, encoding='utf-8')
    out = tmp / 'out'; out.mkdir(exist_ok=True)
    tool = ENGINE / 'tools' / 'pack_deck.py'
    rc, o = py_run([tool, build, '--title', 'Mini deck', '--out', out, '--replace'])
    check('P7 pack: an ordinary pack still works', rc == 0 and 'Packed:' in o and (out / 'Mini deck.html').is_file(), o[-200:])
    (out / 'Mini deck.html').unlink()
    (out / 'Mini deck.html').mkdir()                 # the same WinError 5 os.replace hit at 11:07:23
    rc, o = py_run([tool, build, '--title', 'Mini deck', '--out', out, '--replace'])
    check('P7 pack: a locked target gives exit 1 and NO traceback',
          rc == 1 and 'Traceback' not in o and 'PermissionError' not in o and 'WinError' not in o, o[-300:])
    check('P7 pack: it says what the person can do about it', 'open in another program' in o and 'press pack again' in o, o[-300:])
    check('P7 pack: the leftover .part file is cleaned up', not (out / 'Mini deck.html.part').exists(),
          [p.name for p in out.iterdir()])
    rc, o = py_run([tool, build, '--title', 'Mini deck', '--out', build / 'index.html'])   # --out is a FILE: mkdir fails
    check('P7 pack: any other OSError is one plain sentence too',
          rc == 1 and 'Traceback' not in o and 'Could not pack the deck' in o, (rc, o[-200:]))
    src = (ENGINE / 'tools' / 'pack_deck.py').read_text(encoding='utf-8')
    check('P7 pack: the __main__ guard catches everything, so nothing can print a stack',
          "except BaseException" in src and "sys.exit(main())" in src)
    fin = (ENGINE / 'tools' / 'finalize.js').read_text(encoding='utf-8')
    check('P7 finalize.js: uncaught errors and rejected promises are caught too',
          "process.on('uncaughtException'" in fin and "process.on('unhandledRejection'" in fin and 'sayFail' in fin)


def queue_suite(check):
    """P9: still-first / shortest-first, and a running animation yields at a frame boundary."""
    sys.path.insert(0, str(ENGINE))
    import form_server as fs
    R = fs.BlenderRenderer()
    now = time.time()
    mk = lambda kind, est, age=0: _job(fs, kind, est, now - age)
    anim, still = mk('animation', 2718), mk('still', 78)
    check('P9 rank: a still sorts before an animation however they arrived', R._rank(still, now) < R._rank(anim, now))
    short, long_ = mk('still', 78), mk('still', 600)
    check('P9 rank: between two stills the shorter one goes first', R._rank(short, now) < R._rank(long_, now))
    waited = mk('animation', 2718, age=R.QUEUE_FAIR_S + 60)
    check('P9 rank: a job that waited past the fairness window goes first, so nothing is starved',
          R._rank(waited, now) < R._rank(still, now))
    # _kick picks by rank, not by arrival
    for j in (anim, short):
        j.queued_at = now; R.lanes['full'].append(j)
    picked = min(range(len(R.lanes['full'])), key=lambda i: R._rank(R.lanes['full'][i], now))
    check('P9 queue: the 78 s still is picked out of a FIFO queue that put the animation first',
          R.lanes['full'][picked] is short)
    R.lanes['full'].clear()

    # the yield
    run = mk('animation', 2718); run.kind = 'full'; run.frames, run.done_frames = 80, 12
    R.running['full'] = run
    s = mk('still', 78); s.kind = 'full'
    check('P9 yield: an approved still makes a running animation stop at the next frame boundary', R._ask_yield(s) and run.yielding)
    run.yielding = False
    run.done_frames = 0
    check('P9 yield: an animation with nothing saved yet is never interrupted (the frames would be lost)', not R._ask_yield(s))
    run.done_frames, run.frames = 80, 80
    check('P9 yield: an animation on its last frame is left alone', not R._ask_yield(s))
    run.done_frames, run.frames, run.yields = 12, 80, R.MAX_YIELDS
    check('P9 yield: an animation can only be asked so many times, so a stream of stills cannot starve it', not R._ask_yield(s))
    run.yields = 0
    big = mk('animation', 4000); big.kind = 'full'
    check('P9 yield: a LONGER job never interrupts a shorter one', not R._ask_yield(big))
    run.yielding = False
    R.running['full'] = None
    src = (ENGINE / 'form_server.py').read_text(encoding='utf-8')
    check('P9 resume: a resumed animation keeps the frames it already has',
          "job.meta.get('kind') == 'animation' and not job.meta.get('resume')" in src)
    check('P9 resume: the paused job is re-queued with --resume and a smaller estimate',
          "def _yielded" in src and "'--resume'" in src and "resume=True" in src)
    bpy = (ENGINE / 'deck' / 'blender' / 'lumi_bpy.py').read_text(encoding='utf-8')
    check('P9 resume: lumi_bpy skips frames already on disk and still projects the WHOLE loop for the labels',
          "'--resume'" in bpy and "lumi_resume" in bpy and "_write_labels(path, is_dir, whole" in bpy)


def resume_suite(check, tmp):
    """P9: --resume renders only the frames that are not on disk, and the labels still cover the whole loop.
    Run against fake_blender.py, which mirrors lumi_bpy.render() line for line (same [lumi] output, same file names)."""
    d = tmp / 'resume'; (d / 'frames').mkdir(parents=True, exist_ok=True)
    scene = d / 'scene.py'
    scene.write_text("# FAKE_FRAMES=6\nimport L\nL.loop(0.3)\nL.anchor('top')\nL.render()\n", encoding='utf-8')
    fake = Path(__file__).with_name('fake_blender.py')
    base = [fake, '-b', '-P', scene, '--', '--out', d / 'frames', '--anim', '--height', '720']
    rc, o = py_run(base, cwd=d)
    frames = sorted(p.name for p in (d / 'frames').glob('frame_*.png'))
    check('P9 resume: a first full animation writes every frame', rc == 0 and len(frames) == 6, (rc, frames))
    for f in frames[3:]:
        (d / 'frames' / f).unlink()                 # as if the render had been stopped after frame 3
    rc, o = py_run(base + ['--resume'], cwd=d)
    check('P9 resume: the second run renders ONLY the three missing frames', rc == 0 and 'resume: 3 frame(s) already rendered' in o
          and o.count('[lumi] wrote') == 3, o[-300:])
    check('P9 resume: the progress counter still counts the whole loop (4/6, 5/6, 6/6), so the bar does not jump back',
          '[lumi] frame 4/6' in o and '[lumi] frame 6/6' in o and '[lumi] frame 1/6' not in o, o[-300:])
    check('P9 resume: every frame of the loop is there afterwards', len(list((d / 'frames').glob('frame_*.png'))) == 6)
    lab = json.loads((d / 'frames' / 'labels.json').read_text(encoding='utf-8'))
    check('P9 resume: the label anchors still cover the whole loop, not just the resumed part',
          lab.get('frames') == 6 and len(lab['anchors']['top']) == 6, lab.get('frames'))
    rc, o = py_run(base + ['--resume'], cwd=d)
    check('P9 resume: resuming a finished render does nothing and still succeeds', rc == 0 and '[lumi] wrote' not in o, o[-200:])
    bpy = (ENGINE / 'deck' / 'blender' / 'lumi_bpy.py').read_text(encoding='utf-8')
    fkb = fake.read_text(encoding='utf-8')
    check('P9 resume: the real scene helper and the fake agree on the flag and the output names',
          "'--resume'" in bpy and "'--resume' in post" in fkb and 'done_already' in bpy and 'done_already' in fkb)


def _job(fs, kind, est, queued_at):
    j = fs.BlenderJob('d', 's1', 'full', [], None, {'kind': kind})
    j.est, j.queued_at = est, queued_at
    return j


def gate_suite(check):
    """P1 residual: the orphan message. The server already separates the two; the SCREEN did not."""
    rc, o = node_run([Path(__file__).with_name('pm_notice_test.mjs')])
    for line in o.splitlines():
        if line.startswith('  PASS ') or line.startswith('  FAIL '):
            check(line[7:], line.startswith('  PASS '))
    if rc != 0 and 'PASS' not in o:
        check('P1 the finalize-notice checks ran', False, o[-300:])


def ids_suite(check, tmp):
    """P8: one `s<k>-` prefix per slide."""
    sys.path.insert(0, str(ENGINE))
    bad = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>T</title></head><body><main class="deck">'
           + ''.join(f'<section class="slide"><h2 data-edit="s{i}-1">S{i}</h2></section>' for i in range(1, 13))
           + '<section class="slide"><h2 data-edit="s14-1">Road</h2><p data-edit="s14-2">b</p></section>'
           + '<section class="slide"><h2 data-edit="s14-3">Close</h2><p data-edit="s14-4">b</p></section>'
           + '</main></body></html>')
    d = tmp / 'ids'; d.mkdir(parents=True, exist_ok=True)
    (d / 'index.html').write_text(bad, encoding='utf-8')
    rc, o = node_run([ENGINE / 'tools' / 'new_deck.js', '--ids', '--check', d])
    check('P8 --ids --check: slide 13 and slide 14 both using "s14-" is reported and fails the gate',
          rc == 3 and 'slides 13 and 14' in o and 's14-' in o, o[-300:])
    check('P8 the message says the prefix is the POSITION, not the plan id', "never the plan id" in o, o[-200:])
    # a new text on slide 13 must not be minted under a prefix slide 14 also uses
    (d / 'index.html').write_text(bad.replace('<p data-edit="s14-2">b</p>', '<p>new text</p>'), encoding='utf-8')
    rc, o = node_run([ENGINE / 'tools' / 'new_deck.js', '--ids', d])
    after = (d / 'index.html').read_text(encoding='utf-8')
    sec13 = after.split('<section class="slide">')[13]
    check('P8 --ids: the new text on the ambiguous slide gets a prefix no other slide owns',
          re.search(r'<p data-edit="s(\d+)-\d+">new text', sec13) and
          re.search(r'<p data-edit="s(\d+)-\d+">new text', sec13).group(1) != '14', sec13[:200])
    # a clean deck is left exactly as it was
    (d / 'index.html').write_text(MINI_DECK, encoding='utf-8')
    rc, o = node_run([ENGINE / 'tools' / 'new_deck.js', '--ids', '--check', d])
    check('P8 a deck whose ids are right still passes', rc == 0 and 'problem:' not in o, o[-200:])
    # the library itself
    r = subprocess.run([NODE, '-e', 'const e=require(process.argv[1]);'
                        'const r=e.judgeEditIds(require("fs").readFileSync(process.argv[2],"utf8"));'
                        'console.log(JSON.stringify({e:r.errors.length,n:r.slides.length}))',
                        str(ENGINE / 'tools' / 'lib' / 'edit_ids.js'), str(d / 'index.html')],
                       capture_output=True, cwd=str(REPO))
    check('P8 edit_ids.judgeEditIds reads a clean deck as clean', r.stdout.decode().strip() == '{"e":0,"n":2}', r.stdout.decode())
    dup = MINI_DECK.replace('data-edit="s2-1"', 'data-edit="s1-1"')
    (d / 'dup.html').write_text(dup, encoding='utf-8')
    r = subprocess.run([NODE, '-e', 'const e=require(process.argv[1]);'
                        'console.log(JSON.stringify(e.judgeEditIds(require("fs").readFileSync(process.argv[2],"utf8")).errors.map(x=>x.msg)))',
                        str(ENGINE / 'tools' / 'lib' / 'edit_ids.js'), str(d / 'dup.html')],
                       capture_output=True, cwd=str(REPO))
    msgs = json.loads(r.stdout.decode() or '[]')
    check('P8 the same full id on two slides is an error as well', any('used 2 times' in m for m in msgs), msgs)
    chk = (ENGINE / 'tools' / 'deck_check.js').read_text(encoding='utf-8')
    check('P8 deck_check.js runs the id check after every build step', 'edit_ids' in chk and 'judgeEditIds' in chk)


def markers_suite(check):
    """P3: the step card is the text that wins, so the step card must show the marker's shape."""
    sys.path.insert(0, str(ENGINE))
    import aura_markers as am
    bm = (REPO / 'workspace' / '.claude' / 'skills' / 'aura-slide' / 'building.md').read_text(encoding='utf-8')
    card = re.search(r'<!-- step-card -->\s*(.*?)\s*<!-- /step-card -->', bm, re.S).group(1)
    check('P3 the step card shows the hint marker WITH slide=, not just the word "hints"',
          '[[aura:hint slide=' in card and 'slide=<n>' in card, card[:0])
    check('P3 the step card says what happens to a hint without it', 'REQUIRED' in card and 'thrown away' in card)
    # The omission that caused this: the card ENDED the step in words ("END with 1-3 hints") with no marker syntax at all,
    # while the step card is the text that wins. Every marker the card tells Claude to EMIT must appear literally, with
    # every attribute markers.json makes required.
    missing = []
    for name in ('hint', 'built', 'ask'):
        shown = re.findall(r'\[\[aura:' + name + r'\b([^\]]*)\]\]', card)
        if not shown: missing.append(f'{name}: not shown at all'); continue
        for a in (am.MARKERS.get(name) or {}).get('required') or []:
            if not any(a + '=' in s for s in shown): missing.append(f'{name}.{a}')
    check('P3 every marker the step card tells Claude to emit is shown with every attribute it needs', not missing, missing)
    p = am.scan('[[aura:hint text="Make the icons loop gently instead of playing once"]]')['problems'][0]
    check('P3 the dropped hint is still reported as missing-slide', p['reason'] == 'missing-slide' and p['marker'] == 'hint')
    fix = am.repair(p)
    check('P3 the feedback names what was missing AND the exact line to write',
          'slide' in fix and '[[aura:hint slide=' in fix, fix)
    check('P3 repair works for the other markers too and never crashes on an unknown one',
          am.repair({'reason': 'missing-question', 'marker': 'choice'}).startswith('Your `[[aura:choice')
          and am.repair({'reason': 'unknown', 'marker': 'nope'}) == '')


def permit_suite(check, tmp):
    """P10: the spellings the gate can safely learn."""
    root = tmp / 'lumi'
    for d in ('.aura/engine/tools', '.aura/temp/text', '.aura/decks'):
        (root / d).mkdir(parents=True, exist_ok=True)
    (root / '.aura/temp/text/w.txt').write_text('x', encoding='utf-8')
    script = ('const {decide}=require(process.argv[1]);const root=process.argv[2];'
              'const out=JSON.parse(process.argv[3]).map(([t,c])=>[c,decide(t,c,{root,cwd:root})]);'
              'console.log(JSON.stringify(out))')
    cases = [
        ['Bash', "tr -s ' \\n' ' ' < .aura/temp/text/w.txt"],
        ['Bash', "cd .aura/temp/text && tr -s ' \\n' ' ' < w.txt | grep -o -i 'central'"],
        ['Bash', 'cat < .aura/temp/text/w.txt'],
        ['Bash', 'cat < C:/Windows/win.ini'],
        ['Bash', "python.exe - <<'EOF'"],
        ['Bash', 'tac .aura/temp/text/w.txt'],
        ['Bash', 'cat .aura/temp/text/w.txt | rev'],
        ['Bash', 'node .aura/temp/check/s7_chart.js'],
        ['Bash', 'python -c "import os"'],
    ]
    r = subprocess.run([NODE, '-e', script, str(ENGINE / 'rules' / 'permit.js'), str(root), json.dumps(cases)],
                       capture_output=True, cwd=str(REPO))
    got = dict((c, d) for c, d in json.loads(r.stdout.decode() or '[]'))
    d = lambda c: (got.get(c) or {}).get('decision')
    check('P10 `tr ... < file` inside the Lumi folder is allowed', d(cases[0][1]) == 'allow', got.get(cases[0][1]))
    check('P10 the whole refused line from the deck (cd + tr + < + grep) is allowed now', d(cases[1][1]) == 'allow', got.get(cases[1][1]))
    check('P10 reading Lumi\'s own files in is fine', d(cases[2][1]) == 'allow', got.get(cases[2][1]))
    check('P10 reading a file OUTSIDE the Lumi folder in is still not allowed', d(cases[3][1]) is None, got.get(cases[3][1]))
    check('P10 a heredoc is still refused: it is a program, not a file', d(cases[4][1]) is None, got.get(cases[4][1]))
    check('P10 the pure text filters (tac, rev) are read-only helpers now',
          d(cases[5][1]) == 'allow' and d(cases[6][1]) == 'allow', (got.get(cases[5][1]), got.get(cases[6][1])))
    check('P10 arbitrary code is STILL refused: a script in .aura/temp and python -c',
          d(cases[7][1]) is None and d(cases[8][1]) is None, (got.get(cases[7][1]), got.get(cases[8][1])))
    bm = (REPO / 'workspace' / '.claude' / 'skills' / 'aura-slide' / 'building.md').read_text(encoding='utf-8')
    card = re.search(r'<!-- step-card -->\s*(.*?)\s*<!-- /step-card -->', bm, re.S).group(1)
    for need in ('python -c', 'node -e', '.aura/temp', 'UTF8Encoding'):
        check(f'P10 the step card names the refused shape "{need}" with what to use instead', need in card)
    check('P10 the step card also says a `cd X && ...` line is allowed (the gate supports it; the post-mortem said otherwise)',
          'IS allowed' in card and 'cd <folder inside Lumi>' in card)


def run(T=None):
    if T is None:
        class T: pass
        a = sys.argv
        T.SANDBOX = Path(a[a.index('--sandbox') + 1]) if '--sandbox' in a else Path(tempfile.mkdtemp(prefix='lumi-pm-'))
        T.results = []
        globals()['_T'] = T
        def check(name, ok, info=''):
            T.results.append(bool(ok)); print(('  PASS ' if ok else '  FAIL ') + name + ('' if ok else f'   <- {info}'))
        T.check = check
    check = T.check
    if not NODE:
        check('post-mortem batch A: node is available', False); return
    tmp = Path(tempfile.mkdtemp(prefix='lumi-pm-'))
    os.environ.setdefault('AURA_HOME', str(tmp / 'home' / '.aura'))
    (tmp / 'home' / '.aura').mkdir(parents=True, exist_ok=True)
    sys.path.insert(0, str(ENGINE)); sys.dont_write_bytecode = True
    try:
        print('\n[post-mortem A / P7: no traceback can leave the pack path]')
        pack_suite(check, tmp)
        print('\n[post-mortem A / P9: the render queue]')
        queue_suite(check)
        resume_suite(check, tmp)
        print('\n[post-mortem A / P1: the orphan holder is told to change the picture]')
        gate_suite(check)
        print('\n[post-mortem A / P8: one data-edit prefix per slide]')
        ids_suite(check, tmp)
        print('\n[post-mortem A / P3: the hint marker in the step card]')
        markers_suite(check)
        print('\n[post-mortem A / P10: the permission spellings]')
        permit_suite(check, tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    run()
    res = globals()['_T'].results
    print(f'{sum(res)}/{len(res)} checks passed')
    sys.exit(0 if all(res) else 1)
