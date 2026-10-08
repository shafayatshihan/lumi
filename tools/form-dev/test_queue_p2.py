"""Batch 2 P2, the overnight queue - standalone (its own server, its own sandbox; NOT part of test_server.py):
  python tools/form-dev/test_queue_p2.py [X:\\aura-dev-p2]
Uses fake_claude.py and fake_blender.py; needs an ffmpeg (AURA_FFMPEG, or imageio_ffmpeg in this Python).
  A. the headline: queue three animated slides, kill the server mid-render, restart - the queue resumes and the
     part-rendered frames are still there (and are resumed, not re-rendered)
  B. the success test: stale frames + a resumed run that writes nothing must FAIL, never encode a short loop
  C. the poison-job guard and the restart rule of the store (no server)
  D. "build the rest" is queue jobs; a question holds only its own job, a render carries on, one event each"""
import json, os, shutil, struct, subprocess, sys, tempfile, time, urllib.request, zlib
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else r'X:\aura-dev-p2')
AURA = ROOT / '.aura'
PORT = 8792
BASE = f'http://127.0.0.1:{PORT}'
FAILS = []
sys.path.insert(0, str(REPO / 'engine'))
import lumi_queue  # noqa: E402


def check(name, ok, detail=''):
    print(('  ok   ' if ok else '  FAIL ') + name + ('' if ok else f'   -> {str(detail)[:400]}'), flush=True)
    if not ok: FAILS.append(name)


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(r, timeout=30) as f: return f.status, json.loads(f.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


jget = lambda p: req('GET', p)
jpost = lambda p, b=None: req('POST', p, b or {})


def ffmpeg():
    if os.environ.get('AURA_FFMPEG'): return os.environ['AURA_FFMPEG']
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return shutil.which('ffmpeg')


SRV = {'p': None}


def start():
    env = dict(os.environ, AURA_HOME=str(AURA), AURA_FAKE_CLAUDE=str(HERE / 'fake_claude.py'), AURA_BLENDER=str(HERE / 'fake_blender.py'),
               AURA_FFMPEG=ffmpeg() or '', AURA_NO_REAP='1', AURA_NO_LAUNCH='1', AURA_FAKE_DELAY='0.03',
               AURA_FAKE_BLENDER_LOG=str(ROOT / 'blender-calls.jsonl'))
    SRV['p'] = subprocess.Popen([sys.executable, str(REPO / 'engine' / 'form_server.py'), '--port', str(PORT)], env=env,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(200):
        try:
            if jget('/api/health')[0] == 200: return
        except OSError:
            pass
        time.sleep(0.1)
    raise SystemExit('server did not start')


def kill():
    """The power cut: no clean shutdown, nothing gets to write anything."""
    subprocess.run(['taskkill', '/T', '/F', '/PID', str(SRV['p'].pid)], capture_output=True)
    SRV['p'].wait(10)


def plan_of(P): return jget(f'/api/decks/{P}/plan')[1]


def wait(fn, timeout=60, step=0.2):
    t0 = time.time()
    while time.time() - t0 < timeout:
        v = fn()
        if v: return v
        time.sleep(step)
    return fn()


def deck(P): return json.loads((AURA / 'decks' / f'{P}.json').read_text(encoding='utf-8'))


def put_deck(rec): (AURA / 'decks' / f'{rec["id"]}.json').write_text(json.dumps(rec, indent=2), encoding='utf-8')


def qjobs(): return json.loads((AURA / 'queue.json').read_text(encoding='utf-8'))['jobs']


def events():
    f = AURA / 'temp' / 'claude-events.jsonl'
    return [json.loads(x) for x in f.read_text(encoding='utf-8').splitlines() if x.strip()] if f.is_file() else []


def png():
    raw = b''.join(b'\x00' + b'\xf9\xf4\xf2' * 4 for _ in range(4))
    ch = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', 4, 4, 8, 2, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw)) + ch(b'IEND', b'')


def make_deck(title):
    jpost('/api/brief', {'basics': {'title': title}, 'look': {'theme': 'Bold Blue'}, 'style': {'quality': 'balanced'}})
    P = jpost('/api/plan/start', {})[1].get('deckId')
    wait(lambda: (lambda j: j.get('planState') not in ('planning', None) and not j.get('running'))(plan_of(P)), 60)
    return P


def blender_slide(P, sid, scene):
    import hashlib
    d = AURA / 'decks' / P / 'blender' / sid
    d.mkdir(parents=True, exist_ok=True)
    (d / 'scene.py').write_text(scene, encoding='utf-8')
    h = hashlib.sha1((d / 'scene.py').read_bytes()).hexdigest()
    rec = deck(P)
    rec.setdefault('blender', {})[sid] = {'engine': 'blender', 'kind': 'animation', 'scene': f'decks/{P}/blender/{sid}/scene.py',
                                          'status': 'approved', 'previews': [{'n': 1, 'sceneHash': h}],
                                          'approved': {'at': '2026-10-08T00:00:00', 'preview': 1, 'sceneHash': h}}
    put_deck(rec)
    return d, h


def part_c():
    print('\n[C. the store: poison-job guard, restart rule, never two rows]')
    tmp = Path(tempfile.mkdtemp(prefix='p2q-', dir=str(ROOT)))
    w = lambda p, t: p.write_text(t, encoding='utf-8')
    q = lumi_queue.Queue(tmp / 'queue.json', w, lambda *a: None)
    j = q.add('d', 's1', 'render', res=720)
    check('adding the same slide twice gives one row', q.add('d', 's1', 'render') is j and len(q.jobs) == 1)
    for i in range(lumi_queue.MAX_ATTEMPTS):
        q.start(q.next('render'))
        q = lumi_queue.Queue(tmp / 'queue.json', w, lambda *a: None)          # the process died during the launch
        q.recover()
    j = q.jobs[0]
    check(f'a job the process dies in {lumi_queue.MAX_ATTEMPTS} times is failed, not looped', j['state'] == 'failed'
          and j['lastError']['code'] == 'crashed' and q.next('render') is None, j)
    q2 = q.add('d', 's1', 'render', res=1080)
    check('asking for it again revives that row (its last error kept), not a second one', len(q.jobs) == 1 and q2['state'] == 'pending'
          and q2['attempts'] == 0 and q2['lastError'], q.jobs)
    q.start(q2); q.unstart(q2, 60)
    check('a busy world does not burn the attempt', q2['attempts'] == 0 and q2['notBefore'] > time.time() + 30, q2)
    q.update(q2, notBefore=0)
    q.pause('d', True)
    check('a paused deck feeds nothing and holds nothing', q.next('render') is None and not q.runnable())
    shutil.rmtree(tmp, ignore_errors=True)


def part_a_b():
    print('\n[A. three animated slides, the server killed mid-render, restarted]')
    start()
    P = make_deck('Queue deck')
    sids = [s['id'] for s in plan_of(P)['plan']['slides']]
    check('the fake plan has at least four slides', len(sids) >= 4, sids)
    kill()
    anim = '# fake scene\nL.loop(4)\n# FAKE_FRAMES=12\n# FAKE_SLOW=0.35\n'
    dirs = [blender_slide(P, s, anim + f'# {s}\n')[0] for s in sids[:3]]
    d4, h4 = blender_slide(P, sids[3], '# fake scene\nL.loop(4)\n# FAKE_FRAMES=12\n# FAKE_NO_OUTPUT\n')
    (d4 / 'frames').mkdir()
    for i in range(1, 7): (d4 / 'frames' / f'frame_{i:04d}.png').write_bytes(png())
    (d4 / 'frames' / '.lumi-frames.json').write_text(json.dumps({'sceneHash': h4, 'res': 720}), encoding='utf-8')
    start()
    s, j = jpost(f'/api/decks/{P}/queue', {'action': 'add', 'items': [{'slide': x, 'stage': 'render', 'res': 720} for x in sids[:3]]})
    check('POST queue add: three renders', s == 200 and len((j.get('queue') or {}).get('jobs') or []) == 3, (s, j.get('error')))
    fin = (j.get('queue') or {}).get('finishAt')
    check('the payload says WHEN it will be done (a wall-clock time), not how long', isinstance(fin, int) and fin > time.time() * 1000, fin)
    fr = dirs[0] / 'frames'
    got = wait(lambda: len(list(fr.glob('frame_*.png'))) >= 4, 40, 0.05)
    check('slide 1 is part-rendered', got, list(fr.glob('*')))
    kill()
    k = len(list(fr.glob('frame_*.png')))
    jobs = {x['slide']: x for x in qjobs()}
    check('queue.json had slide 1 running with its attempt already counted', jobs[sids[0]]['state'] == 'running' and jobs[sids[0]]['attempts'] == 1, jobs[sids[0]])
    check('the other two were waiting in queue.json', all(jobs[x]['state'] == 'pending' for x in sids[1:3]), [jobs[x]['state'] for x in sids[1:3]])
    check('the frames survive the kill', 4 <= k < 12 and (fr / '.lumi-frames.json').is_file(), k)
    n_calls = len((ROOT / 'blender-calls.jsonl').read_text(encoding='utf-8').splitlines())
    start()
    check('restart: the frames are still there (reconcile kept them)', len(list(fr.glob('frame_*.png'))) >= k)
    done = wait(lambda: all(deck(P)['blender'][x].get('status') == 'rendered' for x in sids[:3]), 120, 0.5)
    st = {x: deck(P)['blender'][x] for x in sids[:3]}
    check('the queue resumed by itself and rendered all three', done, {x: (v.get('status'), v.get('error')) for x, v in st.items()})
    calls = [json.loads(x) for x in (ROOT / 'blender-calls.jsonl').read_text(encoding='utf-8').splitlines()[n_calls:]]
    s1 = [c for c in calls if any(str(dirs[0]) in a for a in c) and '--anim' in c]
    check('slide 1 carried on with --resume (not from frame 1)', s1 and '--resume' in s1[0], s1[:1])
    check('slide 1 is a whole 12-frame loop', st[sids[0]].get('final', {}).get('frames') == 12, st[sids[0]].get('final'))
    check('its frames folder is gone after the encode', not fr.exists())
    ev = events()
    check('one "back in the queue" event for slide 1', sum(1 for e in ev if e.get('code') == 'render-requeued') == 1)
    ok = wait(lambda: all(x['state'] == 'done' for x in qjobs() if x['slide'] in sids[:3]), 10)     # settled on the next tick
    check('the three queue jobs are done', ok, [x['state'] for x in qjobs() if x['slide'] in sids[:3]])
    drained = wait(lambda: [e for e in events() if e.get('code') == 'queue-drained'], 10)
    check('the drain edge wrote ONE "what happened" event', len(drained) == 1 and 'rendered' in drained[-1].get('text', ''), drained)

    print('\n[B. the success test: stale frames + a resumed run that writes nothing]')
    s, j = jpost(f'/api/decks/{P}/queue', {'action': 'add', 'items': [{'slide': sids[3], 'stage': 'render', 'res': 720}]})
    v = wait(lambda: (lambda b: b if b.get('status') in ('rendered', 'failed') else None)(deck(P)['blender'][sids[3]]), 30)
    check('it FAILED - it did not encode a 6-of-12 loop and call the slide rendered', v.get('status') == 'failed'
          and (v.get('error') or {}).get('code') == 'no-output' and not v.get('final'), v)
    jq = wait(lambda: next((x for x in qjobs() if x['slide'] == sids[3] and x['state'] == 'failed'), None), 10)
    check('no-output is terminal in the queue (one attempt, failed, kept)', jq and jq['attempts'] == 1, jq)
    return P


def part_d(P):
    print('\n[D. build the rest: a question holds one job, a render carries on]')
    kill(); start()
    D = make_deck('Ask deck')
    plan = plan_of(D)['plan']
    plan['slides'][1]['title'] = 'Engines ask-me'
    jpost(f'/api/decks/{D}/plan', {'plan': plan})
    wait(lambda: not plan_of(D).get('running'), 30)
    s, j = jpost(f'/api/decks/{D}/build', {'mode': 'rest'})
    check('build the rest -> queued, one job per unbuilt slide', s == 200 and j.get('queued') == len(plan['slides']), (s, j))
    check('buildRest is derived from the queue', plan_of(D).get('buildRest') is True)
    asking = wait(lambda: next((x for x in qjobs() if x['deck'] == D and x['state'] == 'asking'), None), 60)
    check('slide 2 asked: its job is "asking", still in the queue', asking and asking['slide'] == plan['slides'][1]['id'], asking)
    sid1 = [s['id'] for s in plan_of(P)['plan']['slides']][0]
    jpost(f'/api/decks/{P}/queue', {'action': 'add', 'items': [{'slide': sid1, 'stage': 'render', 'res': 720}]})
    r = wait(lambda: next((x for x in qjobs() if x['deck'] == P and x['slide'] == sid1 and x['state'] == 'done'), None), 60)
    check('meanwhile a render on the other executor ran to the end', r, [x for x in qjobs() if x['slide'] == sid1])
    time.sleep(3)
    jobs = [x for x in qjobs() if x['deck'] == D]
    check('nothing answered or skipped the question, and nothing past it started', sum(1 for x in jobs if x['state'] == 'asking') == 1
          and all(x['state'] in ('done', 'pending', 'asking') for x in jobs), [(x['state'], x['attempts']) for x in jobs])
    ask_ev = [e for e in events() if e.get('code') == 'queue-asking']
    check('ONE question event', len(ask_ev) == 1, ask_ev)
    jpost('/api/claude/reply', {'text': 'The whole vehicle in flight, detailed.', 'deckId': D})
    done = wait(lambda: all(x['state'] == 'done' for x in qjobs() if x['deck'] == D), 90, 0.5)
    check('the answer finished slide 2 and the queue carried on to the end', done, [(x['state'], x['lastError']) for x in qjobs() if x['deck'] == D])
    check('buildRest is false once the queue is empty', plan_of(D).get('buildRest') is False)


def part_e(P):
    """The reaper, end to end, with a 3-second idle limit. Watched through files only: an HTTP poll would itself keep the
    server awake. Queued work - a Blender render AND a Claude build waiting out a 'usage limit' - holds it open; once the
    queue drains it exits by itself."""
    print('\n[E. the reaper: queued work holds the server open, a drained queue lets it exit]')
    kill()
    sids = [s['id'] for s in deck(P)['plan']['slides']]
    q = json.loads((AURA / 'queue.json').read_text(encoding='utf-8'))
    now = time.time()
    row = lambda i, sid, stage, nb: {'id': f'reap{i}', 'deck': P, 'slide': sid, 'stage': stage, 'state': 'pending', 'res': 720 if stage == 'render' else None,
                                     'order': 900 + i, 'attempts': 0, 'notBefore': nb, 'lastError': None, 'execId': None, 'addedAt': now,
                                     'startedAt': None, 'endedAt': None, 'est': 10, 'framesDone': None}
    q['jobs'] = [j for j in q['jobs'] if j['deck'] != P] + [row(1, sids[1], 'render', 0), row(2, sids[5], 'build', now + 9)]
    (AURA / 'queue.json').write_text(json.dumps(q), encoding='utf-8')
    os.environ['AURA_IDLE_SECONDS'] = '3'
    try:
        start()
    finally:
        os.environ.pop('AURA_IDLE_SECONDS', None)
    time.sleep(7)
    check('7 s in, with a 3 s idle limit, the server is still up (queued work)', SRV['p'].poll() is None)
    exited = wait(lambda: SRV['p'].poll() is not None, 60, 0.5)
    jobs = {j['id']: j for j in qjobs()}
    check('it exited by itself once the queue drained', exited, [(j['state'], j['lastError']) for j in jobs.values() if j['id'].startswith('reap')])
    check('...and only after both jobs were done', jobs['reap1']['state'] == 'done' and jobs['reap2']['state'] == 'done', [jobs['reap1']['state'], jobs['reap2']['state']])
    check('the drain recorded its outcome in queue.json', (json.loads((AURA / 'queue.json').read_text(encoding='utf-8')).get('lastDrain') or {}).get('built') == 1)


if __name__ == '__main__':
    if not (AURA / 'engine').exists():
        subprocess.run([sys.executable, str(HERE / 'sandbox.py'), str(ROOT), '--no-venv'], check=True)
    for p in (AURA / 'decks', AURA / 'temp'):
        shutil.rmtree(p, ignore_errors=True)
    for f in (AURA / 'queue.json', ROOT / 'blender-calls.jsonl'):
        if f.exists(): f.unlink()
    (AURA / 'temp').mkdir(parents=True, exist_ok=True)
    try:
        part_c()
        P = part_a_b()
        part_d(P)
        part_e(P)
    finally:
        if SRV['p'] and SRV['p'].poll() is None: kill()
    print(f'\n{len(FAILS)} failed' + (': ' + '; '.join(FAILS) if FAILS else ''))
    sys.exit(1 if FAILS else 0)
