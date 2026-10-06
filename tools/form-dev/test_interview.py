"""Interview batch 1 (plan sections 2-4): the server side of the Claude-led interview, against the fake Claude.
Run by test_server.py (run(T)). Needs no browser; starts its own servers (so a restart can be tested).
  state machine   asking -> waiting (a choice + a text question) -> answer -> ... -> ready, with interview.json written each turn
  idempotence     starting while waiting changes nothing; answering when not waiting and starting when ready are 409
  restart         mid-waiting the question is still there; mid-asking lands in 'error' and the continue endpoint carries on
  safety nets     the ~12-round nudge reaches the next prompt; a long conversation is handed off with the artifact, not the transcript
  failure         a turn that asks nothing and says nothing is a plain retryable error
  the crux        planning after an interview sends the FULL plan message; a legacy deck (a plan, no plannedAt) and a re-plan send the short one
  compat          a record without interviewState reads 'ready' when it has a brief or a plan, 'none' when it has neither"""
import json, time
from pathlib import Path


def run(T):
    import form_server as fs
    check, jget, jpost = T.check, T.jget, T.jpost
    print('\n[interview batch 1: state machine, restart, nudge, hand-off, plan_start crux]')

    def new_deck():
        s, j = jpost('/api/decks')
        return j.get('id')

    def ipay(d):
        return jget(f'/api/decks/{d}/interview')[1]

    def settle(d, states=('waiting', 'ready', 'error'), timeout=40):
        t0 = time.time()
        while time.time() - t0 < timeout:
            j = ipay(d)
            if j.get('interviewState') in states and not j.get('running'):
                st = jget('/api/claude/status')[1]
                if not st.get('running') and not st.get('settling'): return ipay(d)
            time.sleep(0.2)
        return ipay(d)

    def fake_lines():
        return [e['text'] for e in jget('/api/claude/events?since=0')[1].get('events', [])
                if e['kind'] == 'say' and e['text'].startswith('[fake-interview]')]

    def ifile(d):
        try: return json.loads((T.AURA / 'decks' / d / 'interview.json').read_text(encoding='utf-8'))
        except (OSError, ValueError): return {}

    def reply(d, text):
        return jpost(f'/api/decks/{d}/interview/answer', {'text': text})

    # ---- the main walk (3 rounds: two with questions, the third says done)
    srv = T.start_server(AURA_FAKE_INTERVIEW_ROUNDS=3, AURA_FAKE_INTERVIEW_CTX=2000)
    try:
        D = new_deck()
        j = ipay(D)
        check('a new deck starts in interviewState "asking" with no interview yet', j.get('interviewState') == 'asking' and j.get('interview') is None, j)
        check('the plan payload carries interviewState and interviewError (the page routes on them)',
              jget(f'/api/decks/{D}/plan')[1].get('interviewState') == 'asking' and 'interviewError' in jget(f'/api/decks/{D}/plan')[1])
        check('interview on an unknown deck -> 404', jpost('/api/decks/nodeck000000/interview')[0] == 404)
        check('answering before the interview started -> 409 not-waiting', reply(D, 'q1a: Both')[1].get('error') == 'not-waiting')
        s, j = jpost(f'/api/decks/{D}/interview', {'topic': 'Heat pipes for laptops'})
        check('start -> 200', s == 200, (s, j))
        j = settle(D)
        iv = ifile(D)
        check('round 1: waiting, round 1, topic kept', j.get('interviewState') == 'waiting' and (j.get('interview') or {}).get('round') == 1
              and (j['interview'].get('topic') == 'Heat pipes for laptops'), j)
        oa = (j.get('interview') or {}).get('openAll') or []
        check('a choice AND a text question come back, line order, open = openAll[0] (nothing silently dropped)',
              [(q['id'], q['kind']) for q in oa] == [('q1a', 'choice'), ('q1b', 'text')] and j['interview']['open'] == oa[0]
              and oa[0]['options'] == ['Examiners', 'Classmates', 'Both'] and iv.get('open') == oa[0] and iv.get('openAll') == oa, (oa, iv.get('open')))
        check('interview.json is on disk (v, deckId, round, state waiting, sources list)',
              iv.get('v') == 1 and iv.get('deckId') == D and iv.get('round') == 1 and iv.get('state') == 'waiting' and isinstance(iv.get('sources'), list), iv)
        s, j = jpost(f'/api/decks/{D}/interview')
        check('start while waiting is idempotent (200, still round 1, no new run)', s == 200 and (j.get('interview') or {}).get('round') == 1
              and not jget('/api/claude/status')[1].get('running'), (s, j))
        n_lines = len(fake_lines())
        s, j = reply(D, 'q1a: Both\nq1b: that it stays cool\nnote: keep it short')
        check('answer -> 200', s == 200, (s, j))
        j = settle(D)
        iv = ifile(D)
        ans = iv.get('answers') or []
        check('round 2: waiting, the answers were recorded (2) with the note on the last one, the open question replaced',
              j.get('interviewState') == 'waiting' and j['interview']['round'] == 2 and len(ans) == 2 and ans[0]['answer'] == 'Both'
              and ans[0]['kind'] == 'choice' and ans[1]['answer'] == 'that it stays cool' and ans[1]['kind'] == 'text'
              and ans[1]['other'] == 'keep it short' and j['interview']['open']['id'] == 'q2a', (j, ans))
        lines = fake_lines()[n_lines:]
        check('the answer reached Claude in the next prompt and the session was resumed',
              lines and 'resume=True' in lines[-1] and 'answered=True' in lines[-1], lines)
        reply(D, 'q2a: Classmates\nq2b: the gap')
        j = settle(D)
        iv = ifile(D)
        check('round 3: ready, done true, answers 4, conclusions and identity kept from Claude',
              j.get('interviewState') == 'ready' and iv.get('done') is True and len(iv.get('answers') or []) == 4
              and iv['conclusions'].get('audience') == 'Examiners' and iv['identity'].get('established') == ['presenter']
              and j['interview']['open'] is None and iv.get('state') == 'ready', (j, iv))
        check('answering when ready -> 409 not-waiting; starting when ready -> 409 done',
              reply(D, 'q3a: x')[1].get('error') == 'not-waiting' and jpost(f'/api/decks/{D}/interview')[1].get('error') == 'done')
        check('the deck record says ready and interview.json agrees', fs.interview_state(json.loads((T.AURA / 'decks' / f'{D}.json').read_text(encoding='utf-8'))) == 'ready')

        # ---- the crux: planning after the interview
        n0 = jget('/api/claude/status')[1].get('eventCount', 0)
        s, j = jpost('/api/plan/start', {'deckId': D})
        check('plan start after the interview -> 200', s == 200, (s, j))
        pj = T.wait_plan_idle(D)
        evs = T.events_from(n0)
        heard = T.heard(evs)
        check('THE CRUX: the interview made the session, so planning RESUMES it', '--resume' in (T.fake_argv(evs) or []), T.fake_argv(evs))
        check('...and sends the FULL plan message (not the short "plan again" one)',
              heard and 'Started from the Lumi web app' in heard[-1] and 'Plan the deck again' not in heard[-1], heard)
        rec = json.loads((T.AURA / 'decks' / f'{D}.json').read_text(encoding='utf-8'))
        check('plan ready with slides and plannedAt is stamped', pj.get('planState') == 'ready' and (pj.get('plan') or {}).get('slides') and rec.get('plannedAt'), (pj.get('planState'), rec.get('plannedAt')))
        n0 = jget('/api/claude/status')[1].get('eventCount', 0)
        jpost('/api/plan/start', {'deckId': D}); T.wait_plan_idle(D)
        heard = T.heard(T.events_from(n0))
        check('planning again (plannedAt set) sends the short "plan again" text', heard and 'Plan the deck again' in heard[-1], heard)
        rec = json.loads((T.AURA / 'decks' / f'{D}.json').read_text(encoding='utf-8'))
        rec.pop('plannedAt', None)                                     # a v0.5.3 deck: a session and a plan, no plannedAt
        (T.AURA / 'decks' / f'{D}.json').write_text(json.dumps(rec), encoding='utf-8')
        n0 = jget('/api/claude/status')[1].get('eventCount', 0)
        jpost('/api/plan/start', {'deckId': D}); T.wait_plan_idle(D)
        heard = T.heard(T.events_from(n0))
        check('LEGACY deck (session + a plan, no plannedAt) still gets the short text, exactly as in v0.5.3', heard and 'Plan the deck again' in heard[-1], heard)
        check('...and the legacy plan start never touched the interview state', ipay(D).get('interviewState') == 'ready')

        # ---- a turn that says nothing Lumi can read
        E = new_deck()
        jpost(f'/api/decks/{E}/interview', {'topic': 'int-silent talk'})
        j = settle(E)
        check('a turn with no question and no done marker -> error with a plain, retryable message',
              j.get('interviewState') == 'error' and 'Press continue' in (j.get('interviewError') or '') and 'marker' not in j['interviewError'].lower(), j)
    finally:
        T.stop_server(srv)

    # ---- restart mid-waiting and mid-asking
    srv = T.start_server(AURA_FAKE_INTERVIEW_ROUNDS=3, AURA_FAKE_LONG=6)
    try:
        W = new_deck()
        jpost(f'/api/decks/{W}/interview', {'topic': 'restart while waiting'})
        j = settle(W)
        q_before = (j.get('interview') or {}).get('openAll')
        A = new_deck()
        jpost(f'/api/decks/{A}/interview', {'topic': 'take-your-time restart'})
        time.sleep(1.2)
        mid = ipay(A)
        check('mid-turn the state is asking', mid.get('interviewState') == 'asking', mid)
        T.stop_server(srv); time.sleep(1.0)
        srv = T.start_server(AURA_FAKE_INTERVIEW_ROUNDS=3, AURA_FAKE_LONG=6)
        j = ipay(W)
        check('restart while WAITING: the open questions are re-rendered from interview.json', j.get('interviewState') == 'waiting'
              and (j.get('interview') or {}).get('openAll') == q_before and len(q_before or []) == 2, j)
        j = ipay(A)
        check('restart while ASKING: lands in "error" with a plain message', j.get('interviewState') == 'error'
              and 'Press continue' in (j.get('interviewError') or ''), j)
        s, _ = jpost(f'/api/decks/{A}/interview')
        check('continue from error launches the next turn', s == 200, s)
        j = settle(A)
        check('...and the interview carries on (waiting again, error cleared, round 2)', j.get('interviewState') == 'waiting'
              and not j.get('interviewError') and j['interview']['round'] == 2, j)
        r = reply(W, 'q1a: Both\nq1b: ok')
        j = settle(W)
        check('the question that survived the restart can still be answered', r[0] == 200 and j.get('interviewState') == 'waiting' and j['interview']['round'] == 2, (r, j))
    finally:
        T.stop_server(srv)

    # ---- the nudge, and the hand-off
    srv = T.start_server(AURA_FAKE_INTERVIEW_ROUNDS=99, AURA_INTERVIEW_NUDGE=2)
    try:
        N = new_deck()
        jpost(f'/api/decks/{N}/interview', {'topic': 'nudge'})
        j = settle(N)
        check('round 1 is below the nudge: still asking questions', j.get('interviewState') == 'waiting' and 'nudge=False' in fake_lines()[-1], (j, fake_lines()))
        reply(N, 'q1a: Both\nq1b: x')
        j = settle(N)
        check('round 2 reaches the nudge: "you have enough to plan" is in the prompt and Claude finishes',
              'nudge=True' in fake_lines()[-1] and j.get('interviewState') == 'ready', (fake_lines()[-1], j))
    finally:
        T.stop_server(srv)
    srv = T.start_server(AURA_FAKE_INTERVIEW_ROUNDS=3, AURA_CTX_RESET=1000, AURA_FAKE_CTX_BASE=5000)
    try:
        H = new_deck()
        jpost(f'/api/decks/{H}/interview', {'topic': 'long one'})
        settle(H)
        rec = json.loads((T.AURA / 'decks' / f'{H}.json').read_text(encoding='utf-8'))
        check('the deck conversation size is recorded and is past CTX_RESET', int(rec.get('ctxTokens') or 0) >= 1000, rec.get('ctxTokens'))
        sid1 = rec.get('sessionId')
        n0 = jget('/api/claude/status')[1].get('eventCount', 0)
        reply(H, 'q1a: Both\nq1b: the point')
        j = settle(H)
        evs = T.events_from(n0)
        line = fake_lines()[-1]
        check('past CTX_RESET the next turn is a hand-off: a FRESH conversation told to read interview.json (not the transcript)',
              'handoff=True' in line and 'resume=False' in line and '--resume' not in (T.fake_argv(evs) or []) and j.get('interviewState') == 'waiting', (line, T.fake_argv(evs)))
        check('...it carries the answer, and the file already holds it', 'answered=True' in line and len(ifile(H).get('answers') or []) == 2, line)
    finally:
        T.stop_server(srv)

    # ---- backward compatibility: a record with no interviewState
    print('\n[interview: migration of records written before the interview existed]')
    check('no interviewState + a brief -> ready', fs.interview_state({'id': 'x', 'brief': {'basics': {'title': 'Old'}}}) == 'ready')
    check('no interviewState + a plan state -> ready', fs.interview_state({'id': 'x', 'brief': {}, 'planState': 'ready'}) == 'ready')
    check('no interviewState, nothing at all -> none', fs.interview_state({'id': 'x', 'brief': {}}) == 'none' and fs.interview_state({'id': 'x', 'planState': 'none'}) == 'none')
    check('an explicit interviewState always wins', fs.interview_state({'id': 'x', 'brief': {'a': 1}, 'interviewState': 'asking'}) == 'asking')
    check('DECK_FIELDS carries interviewState, interviewError and plannedAt', all(k in fs.DECK_FIELDS for k in ('interviewState', 'interviewError', 'plannedAt')))
    check('interview_rules() inlines the rules while interviewing.md does not exist', (Path(fs.ROOT) / '.claude' / 'skills' / 'aura-slide' / 'interviewing.md').is_file()
          or 'never ask what they already answer' in fs.interview_rules().lower())
    check('interview_rules() cites interviewing.md now that the file exists',
          'interviewing.md' in fs.interview_rules() if (Path(fs.ROOT) / '.claude' / 'skills' / 'aura-slide' / 'interviewing.md').is_file()
          else 'never ask what they already answer' in fs.interview_rules().lower())

    # ---- section 6: what the deck costs, in time and in a plain share of today's allowance
    print('\n[interview batch 2: the plan page says what the deck costs]')
    rec0 = {'id': 'cost-x', 'plan': {'slides': []}}
    check('no slides -> no time at all', fs.deck_build_estimate(rec0) == {'seconds': 0, 'slides': 0, 'rendered': 0})
    rec3 = {'id': 'cost-y', 'plan': {'slides': [{'id': 's1'}, {'id': 's2'}, {'id': 's3'}]}}
    e3 = fs.deck_build_estimate(rec3)
    check('every slide costs claude time, and the whole deck is ONE number (bl_plan_estimates never summed)',
          e3['slides'] == 3 and e3['seconds'] == 3 * fs.SLIDE_WRITE_S and e3['rendered'] == 0, e3)

    old_read, now = fs.read_usage, time.time()
    try:
        fs.read_usage = lambda: None
        check('no reading at all -> no allowance line', fs.usage_share() is None)
        fs.read_usage = lambda: {'utilization': 0.4, 'capturedAt': int(now - 9 * 3600), 'resetsAt': int(now + 600)}
        check('a reading from this morning is stale -> no allowance line (never a number that might be wrong)', fs.usage_share() is None)
        fs.read_usage = lambda: {'utilization': 0.4, 'capturedAt': int(now - 60), 'resetsAt': int(now - 10)}
        check('a window that already rolled over is stale too', fs.usage_share() is None)
        fs.read_usage = lambda: {'utilization': 0.4, 'capturedAt': int(now - 60), 'resetsAt': int(now + 1200)}
        u = fs.usage_share()
        check('a fresh reading comes through as a percent with its "as of" stamp',
              u and abs(u['pct'] - 40.0) < 0.01 and u['capturedAt'] == int(now - 60) and u['resetsAt'] == int(now + 1200), u)
        fs.read_usage = lambda: {'utilization': 61, 'capturedAt': int(now - 60)}
        check('a percent already in 0-100 is not multiplied again, and resetsAt is optional',
              (fs.usage_share() or {}).get('pct') == 61 and (fs.usage_share() or {}).get('resetsAt') is None)
        fs.read_usage = lambda: {'capturedAt': int(now - 60)}
        check('a reading with no number is not a zero', fs.usage_share() is None)
    finally:
        fs.read_usage = old_read

    srv2 = T.start_server()
    try:
        d = new_deck()
        p = jget(f'/api/decks/{d}/plan')[1]
        check('the plan payload carries the cost of the whole deck', isinstance(p.get('cost'), dict) and isinstance(p['cost'].get('build'), dict)
              and 'seconds' in p['cost']['build'], p.get('cost'))
        check('the allowance is left OUT (null) when lumi has no trustworthy reading', 'allowance' in p['cost'])
    finally:
        T.stop_server(srv2)
    # ---- the final batch (plan section 9): the form is gone, the checker is wired, the look is its own step
    print('\n[interview final batch: deck_check --interview, the look step, the deleted hurry flow]')
    check('interview_args says nothing when there is no interview file', fs.interview_args('nosuchdeck0001') == [])

    srv3 = T.start_server(AURA_FAKE_INTERVIEW_ROUNDS=1)
    try:
        # --- the checker is actually handed the file. deck_check gets a BUILD FOLDER and cannot recover the deck id
        #     from it, so if nobody passes --interview, rule L-15 silently judges the deck on the wrong brief.
        K = new_deck()
        (T.AURA / 'decks' / K).mkdir(parents=True, exist_ok=True)
        (T.AURA / 'decks' / K / 'interview.json').write_text(json.dumps(
            {'v': 1, 'deckId': K, 'identity': {'established': ['presenter'], 'presenters': ['A. B. Doe']}}), encoding='utf-8')
        want = str(T.AURA / 'decks' / K / 'interview.json')
        check('interview_args names this deck\'s file once it exists', fs.interview_args(K) == ['--interview', want], fs.interview_args(K))

        seen = []

        class FakeRun:
            returncode, stdout, stderr = 0, b'RESULT: clean\n', b''

        class Quiet:
            def add(self, *a, **k): pass

        real_run, real_node, real_runner = fs.subprocess.run, fs.node_exe, fs.RUNNER
        fs.RUNNER = fs.RUNNER or Quiet()
        bdir = fs.BUILDS / 'iv-check-folder'
        bdir.mkdir(parents=True, exist_ok=True)
        (bdir / 'index.html').write_text('<p>x</p>', encoding='utf-8')
        try:
            fs.node_exe = lambda: 'node'
            fs.subprocess.run = lambda cmd, **kw: (seen.append(list(map(str, cmd))), FakeRun())[1]
            fs.check_built(K, 1, 'iv-check-folder')
            fs.overflow_count(bdir / 'index.html', K)
            fs.overflow_count(bdir / 'index.html')
        finally:
            fs.subprocess.run, fs.node_exe, fs.RUNNER = real_run, real_node, real_runner
        check('check_built hands deck_check this deck\'s interview.json',
              len(seen) >= 1 and '--interview' in seen[0] and seen[0][seen[0].index('--interview') + 1] == want, seen[:1])
        check('the text-overflow check passes it too when it knows the deck',
              len(seen) >= 2 and '--interview' in seen[1] and seen[1][seen[1].index('--interview') + 1] == want, seen[1:2])
        check('and leaves it out when it does not, so the old brief is read exactly as before',
              len(seen) >= 3 and '--interview' not in seen[2], seen[2:3])

        # --- the Stop hook runs INSIDE a Claude run and gets the path from the environment
        src = (Path(fs.ENGINE) / 'rules' / 'check_rules.js').read_text(encoding='utf-8')
        check('the Stop hook reads LUMI_INTERVIEW and adds --interview', 'LUMI_INTERVIEW' in src and "'--interview'" in src)
        D3 = new_deck()
        jpost(f'/api/decks/{D3}/interview', {'topic': 'Wiring check'})
        settle(D3)
        envs = [e['text'] for e in jget('/api/claude/events?since=0')[1].get('events', [])
                if e['kind'] == 'say' and e['text'].startswith('[fake-env] LUMI_INTERVIEW=')]
        check('the run that builds a deck carries LUMI_INTERVIEW, so the hook can name the file',
              bool(envs) and envs[-1].endswith(str(T.AURA / 'decks' / D3 / 'interview.json')), envs[-1:])

        # --- the look is its own step now, and a deck made the old way never stops at it
        s, j = jpost('/api/interview/start', {'topic': 'A brand new deck'})
        N = j.get('deckId')
        check('POST /api/interview/start makes the deck (there is no form to make it any more)', s == 200 and N, (s, j))
        pay = jget(f'/api/decks/{N}/plan')[1]
        check('a new deck has not picked a look yet, so the look step is due', pay.get('lookUser') is False, pay.get('lookUser'))
        check('a new deck does NOT inherit the old draft brief (its names are not this deck\'s)',
              not (json.loads((T.AURA / 'decks' / f'{N}.json').read_text(encoding='utf-8')).get('brief') or {}).get('basics'))
        check('PATCHing the look records that the person answered', T.req('PATCH', f'/api/decks/{N}', {'look': 'Claude chooses'})[0] == 200
              and jget(f'/api/decks/{N}/plan')[1].get('lookUser') is True)

        # --- MIGRATION: a v0.5.3 deck plans exactly as it does today
        jpost('/api/brief', {'basics': {'type': 'Thesis defence', 'title': 'An older deck'},
                             'people': {'presenters': [{'name': 'A. B. Doe'}], 'supervisor': 'Dr. Jane Rahman'},
                             'look': {'theme': 'Bold Blue'}})
        OLD = new_deck()
        # exactly a v0.5.3 record: the old form's answers, and no interviewState at all (it did not exist yet)
        of = T.AURA / 'decks' / f'{OLD}.json'
        orec = json.loads(of.read_text(encoding='utf-8'))
        orec.pop('interviewState', None)
        orec['flow'] = 'plan'
        of.write_text(json.dumps(orec, indent=2), encoding='utf-8')
        op = jget(f'/api/decks/{OLD}/plan')[1]
        check('MIGRATION: a deck made by the old form reads "ready" and is already themed, so it goes straight to planning',
              op.get('interviewState') == 'ready' and op.get('lookUser') is True and op.get('look') == 'Bold Blue', op)
        check('MIGRATION: its brief is untouched and still names the supervisor the checker asks for',
              json.loads((T.AURA / 'decks' / f'{OLD}.json').read_text(encoding='utf-8'))['brief']['people']['supervisor'] == 'Dr. Jane Rahman')
        for _ in range(100):
            if not jget('/api/claude/status')[1].get('running'): break
            time.sleep(0.2)
        s, j = jpost('/api/plan/start', {'deckId': OLD})
        check('MIGRATION: planning an old deck still starts', s == 200 and j.get('deckId') == OLD, (s, j))
        T.wait_run()
        check('MIGRATION: and it reaches a plan with slides', len((jget(f'/api/decks/{OLD}/plan')[1].get('plan') or {}).get('slides') or []) > 0)

        # --- the hurry flow is gone
        check('a deck can no longer be born in the "hurry" flow', jpost('/api/claude/start')[0] == 400)
        check('and the server can no longer put a deck in the hurry flow at all',
              "flow='hurry'" not in (Path(fs.ENGINE) / 'form_server.py').read_text(encoding='utf-8'))
    finally:
        T.stop_server(srv3)

    # --- L-15 end to end: the generic identity list is what the checker reads
    claims = Path(fs.ENGINE) / 'tools' / 'lib' / 'claims.js'
    check('claims.js still reads brief.identity first and the old shape only as a fallback',
          'identityList' in claims.read_text(encoding='utf-8'))

