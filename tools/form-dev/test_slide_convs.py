"""v0.5.2 per-slide conversations (FIXLOG "## Per-slide conversations"). Run by test_server.py (run(T) with the harness module).
Every planned slide has its own Claude conversation (deck record slideConvs[<id>]), the deck one more (top-level sessionId):
  - a build creates and stores the slide's conversation; an edit of slide N resumes slide N's, never the deck's or another's
  - questions asked during slide N's build stay in slide N's conversation
  - a whole-deck message goes to the deck conversation and leaves a note for every slide it changed
  - a lost slide conversation is rebuilt for that slide only; a too-large one is handed off (L-17 per slide)
  - a deck from v0.5.1 (one sessionId, built slides, open doubts) keeps everything; its slides get their own conversations on
    first use and the old conversation stays the deck's
  - every event carries `conv`, so the chat shows one thread per slide"""
import json, shutil, time


def raw(T, deck_id):
    return json.loads((T.AURA / 'decks' / f'{deck_id}.json').read_text(encoding='utf-8'))


def write_raw(T, deck_id, rec):
    (T.AURA / 'decks' / f'{deck_id}.json').write_text(json.dumps(rec, indent=2), encoding='utf-8')


def convs(T, deck_id):
    return raw(T, deck_id).get('slideConvs') or {}


def say_lines(evs, tag):
    return [e['text'][len(tag) + 1:] for e in evs if e['kind'] == 'say' and e['text'].startswith(tag + ' ')]


def step(T, deck_id, path, body):
    """POST, wait until this deck is idle again, return (status, json, new events)."""
    n0 = T.jget('/api/claude/status')[1].get('eventCount', 0)
    s, j = T.jpost(path, body)
    time.sleep(0.3)
    T.wait_plan_idle(deck_id)
    t0 = time.time()                            # a lost-conversation recovery is a second run that starts right after the first
    while time.time() - t0 < 30 and T.jget('/api/claude/status')[1].get('running'):
        time.sleep(0.2); T.wait_plan_idle(deck_id)
    return s, j, T.events_from(n0)


def run_one_conversation(T):
    """The contract since 2026-10-08: ONE conversation for the whole deck. form_server.ONE_DECK_CONVERSATION nulls
    `conv` in RUNNER.launch(), so a build and an edit both resume the deck's session and no slide opens its own.
    The cost of that choice is context growth, so the deck-level hand-off at CTX_RESET is part of the contract and
    is checked here too: without it a long deck runs into the wall per-slide conversations used to avoid."""
    check = T.check
    import test_batch_c
    print('\n[one conversation per deck]')
    P = test_batch_c.make_plan_deck(T, 'One conv deck')
    deck_sess = raw(T, P).get('sessionId')
    check('planning made the deck conversation', bool(deck_sess), deck_sess)

    s, j, ev1 = step(T, P, f'/api/decks/{P}/build', {'mode': 'next'})
    check('build slide 1 RESUMES the deck conversation, it does not open its own',
          s == 200 and T.flag(T.fake_argv(ev1), '--resume') == deck_sess, (T.fake_argv(ev1), deck_sess))
    # a slideConvs RECORD can still exist - it carries the slide's summary and any notes - but it must hold no
    # sessionId, because no slide has a conversation of its own any more.
    check('...and no slide gets a conversation of its own',
          not any((v or {}).get('sessionId') for v in convs(T, P).values()), convs(T, P))

    s, j, ev2 = step(T, P, f'/api/decks/{P}/build', {'mode': 'next'})
    check('build slide 2 resumes the SAME conversation, so it has seen slide 1',
          T.flag(T.fake_argv(ev2), '--resume') == deck_sess, T.fake_argv(ev2))
    check('...the deck conversation id never moved', raw(T, P).get('sessionId') == deck_sess)

    s, j, ev3 = step(T, P, '/api/claude/reply', {'deckId': P, 'slide': 1, 'text': 'make the title shorter'})
    check('an edit of slide 1 resumes the deck conversation too',
          T.flag(T.fake_argv(ev3), '--resume') == deck_sess, T.fake_argv(ev3))
    check('...and still no slide has its own conversation',
          not any((v or {}).get('sessionId') for v in convs(T, P).values()), convs(T, P))

    rec = raw(T, P); rec['ctxTokens'] = 10 ** 9; write_raw(T, P, rec)
    s, j, ev4 = step(T, P, '/api/claude/reply', {'deckId': P, 'text': 'tighten the wording everywhere'})
    check('past CTX_RESET the deck conversation hands off to a fresh one instead of resuming',
          '--resume' not in (T.fake_argv(ev4) or []), T.fake_argv(ev4))
    check('...and the deck moves to the new conversation id',
          raw(T, P).get('sessionId') != deck_sess, (raw(T, P).get('sessionId'), deck_sess))


def run(T):
    import form_server as fs
    if getattr(fs, 'ONE_DECK_CONVERSATION', False):
        # The per-slide behaviour in run_per_slide() is switched OFF in the product (owner, 2026-10-08). Its checks
        # are kept rather than deleted: the switch is one line in RUNNER.launch, and these are what would prove the
        # old path still works if it is ever flipped back.
        return run_one_conversation(T)
    return run_per_slide(T)


def run_per_slide(T):
    check, jget, jpost = T.check, T.jget, T.jpost
    import test_batch_c
    print('\n[v0.5.2 per-slide conversations]')
    P = test_batch_c.make_plan_deck(T, 'Per slide deck')
    deck_sess = raw(T, P).get('sessionId')
    check('planning made the deck conversation (top-level sessionId), no slide conversations yet', deck_sess and not convs(T, P), raw(T, P).get('slideConvs'))

    # ---- build: a fresh conversation per slide, stored on that slide
    s, j, ev1 = step(T, P, f'/api/decks/{P}/build', {'mode': 'next'})
    c = convs(T, P)
    argv = T.fake_argv(ev1)
    ctx = ' '.join(say_lines(ev1, '[fake-context]'))
    check('build slide 1: its own conversation, started fresh (no --resume of the planning one)',
          s == 200 and argv and '--resume' not in argv and (c.get('s1') or {}).get('sessionId') and c['s1']['sessionId'] != deck_sess, (argv, c))
    check('...opened with a self-contained context: slide tag, plan digest, how built slides were made',
          '[slide-conversation n=1 id=s1]' in ctx and 'digest=True' in ctx and 'notes=True' in ctx, ctx[:300])
    check('...the deck conversation is untouched', raw(T, P).get('sessionId') == deck_sess)
    check('...the slide remembers what Claude said when it was done (for later slides\' style)', 'Slide 1 is ready' in (c['s1'].get('summary') or ''), c['s1'])
    check('...and its own context size (ctxTokens) is kept on the slide', int(c['s1'].get('ctxTokens') or 0) > 0, c['s1'])
    check("every event of that build carries conv=s1 (also Lumi's own check of it, which lands later)", all(e.get('conv') == 's1' for e in ev1 if e.get('deck') == P) and ev1, {e.get('conv') for e in ev1})
    s, j, ev2 = step(T, P, f'/api/decks/{P}/build', {'mode': 'next'})
    c = convs(T, P)
    ctx2 = ' '.join(say_lines(ev2, '[fake-context]'))
    check('build slide 2: another new conversation, distinct from slide 1\'s and the deck\'s',
          (c.get('s2') or {}).get('sessionId') and len({c['s1']['sessionId'], c['s2']['sessionId'], deck_sess}) == 3, c)
    check('...and its context says how slide 1 was built', '[slide-conversation n=2 id=s2]' in ctx2, ctx2[:200])
    rec = jget(f'/api/decks/{P}')[1]['deck']
    check('deck view lists the plan\'s slide ids (the chat\'s threads)', rec.get('slideIds') and rec['slideIds'][:2] == ['s1', 's2'], rec.get('slideIds'))

    # ---- edits resume the slide's own conversation
    s1, s2 = c['s1']['sessionId'], c['s2']['sessionId']
    s, j, ev = step(T, P, '/api/claude/reply', {'deckId': P, 'slide': 1, 'text': 'make the heading shorter'})
    argv = T.fake_argv(ev)
    check('edit of slide 1 resumes slide 1\'s conversation (not the deck\'s, not slide 2\'s)', T.flag(argv, '--resume') == s1, (T.flag(argv, '--resume'), s1))
    check('...the message carries [slide 1] and its events are in the slide 1 thread',
          T.heard(ev) and T.heard(ev)[0].startswith('[slide 1] make the heading shorter') and all(e.get('conv') == 's1' for e in ev if e.get('deck') == P), T.heard(ev))
    s, j, ev = step(T, P, '/api/claude/reply', {'deckId': P, 'slide': 2, 'text': 'calmer colours'})
    check('edit of slide 2 resumes slide 2\'s conversation', T.flag(T.fake_argv(ev), '--resume') == s2, T.flag(T.fake_argv(ev), '--resume'))
    check('...and the deck conversation id never moved', raw(T, P).get('sessionId') == deck_sess)

    # ---- questions during a build stay in that slide's conversation
    pj = T.plan_of(P)
    plan = json.loads(json.dumps(pj['plan']))
    plan['slides'][2]['title'] = 'Our idea ask-me'
    T.save(P, plan)
    T.wait_plan_idle(P)
    s, j, evq = step(T, P, f'/api/decks/{P}/build', {'mode': 'next'})
    pj = T.plan_of(P)
    s3 = (convs(T, P).get('s3') or {}).get('sessionId')
    asks = [e for e in evq if e['kind'] == 'say' and '[[aura:choice' in e.get('text', '')]
    check('slide 3 asks during its build: waiting, the question is in the slide 3 thread', pj.get('waiting') and s3 and asks and
          all(e.get('conv') == 's3' for e in asks), (pj.get('waiting'), [e.get('conv') for e in asks]))
    st = jget('/api/claude/status')[1]
    check('the status names the asking conversation', st.get('conv') == 's3', st.get('conv'))
    # the page shows the last BUILT slide (2) while asking: the answer must still go to slide 3's conversation
    s, j, eva = step(T, P, '/api/claude/reply', {'deckId': P, 'slide': 2, 'text': 'q1: A cut-open engine\nq2: Detailed'})
    argv = T.fake_argv(eva)
    check('the answer resumes slide 3\'s conversation and finishes slide 3', T.flag(argv, '--resume') == s3 and T.plan_of(P).get('built') == 3,
          (T.flag(argv, '--resume'), s3, T.plan_of(P).get('built')))
    check('...the answer is tagged slide 3, in the slide 3 thread',
          any(e['kind'] == 'user' and e.get('slide') == 3 and e.get('conv') == 's3' for e in eva), [(e['kind'], e.get('slide'), e.get('conv')) for e in eva if e['kind'] == 'user'])

    # ---- whole deck: the deck conversation, then a note for each slide it changed
    s, j, evd = step(T, P, '/api/claude/reply', {'deckId': P, 'scope': 'deck', 'slide': 2, 'text': 'make every title shorter'})
    argv = T.fake_argv(evd)
    check('a whole-deck message resumes the DECK conversation', T.flag(argv, '--resume') == deck_sess, (T.flag(argv, '--resume'), deck_sess))
    check('...says [whole deck] to Claude and sits in the deck thread', T.heard(evd) and T.heard(evd)[0].startswith('[whole deck] make every title shorter')
          and all(e.get('conv') == 'deck' for e in evd if e.get('deck') == P and not str(e.get('code') or '').startswith('check-')),
          [(e['kind'], e.get('code'), e.get('conv')) for e in evd if e.get('conv') != 'deck'])
    c = convs(T, P)
    noted = [k for k in ('s1', 's2', 's3') if any('make every title shorter' in n for n in (c.get(k) or {}).get('notes') or [])]
    check('...and each slide it changed gets a note for its own conversation', noted == ['s1', 's2', 's3'], {k: (c.get(k) or {}).get('notes') for k in c})
    check('bad scope -> 400', jpost('/api/claude/reply', {'deckId': P, 'scope': 'planet', 'text': 'x'})[0] == 400)
    s, j, ev = step(T, P, '/api/claude/reply', {'deckId': P, 'slide': 1, 'text': 'and now a subtitle'})
    hd = ' '.join(T.heard(ev))
    check('the next message on slide 1 starts with that note (then the note is gone)',
          T.flag(T.fake_argv(ev), '--resume') == s1 and 'Since you last worked on this slide' in hd and 'make every title shorter' in hd
          and not (convs(T, P)['s1'].get('notes')), hd[:200])
    check('...the other slides keep theirs until they are next used', convs(T, P)['s2'].get('notes'))

    # ---- a lost slide conversation is rebuilt for that slide only
    rec = raw(T, P)
    rec['slideConvs']['s2']['sessionId'] = '00000000-dead-beef-0000-000000000000'
    write_raw(T, P, rec)
    s, j, ev = step(T, P, '/api/claude/reply', {'deckId': P, 'slide': 2, 'text': 'lost one'})
    c = convs(T, P)
    starts = [e for e in ev if e.get('code') == 'start']
    ctx = ' '.join(say_lines(ev, '[fake-context]'))
    check('lost slide 2 conversation: recovered by itself, said once, no error',
          sum(e.get('code') == 'recovered' for e in ev) == 1 and not [e for e in ev if e['kind'] == 'error'] and len(starts) == 1,
          [(e['kind'], e.get('code')) for e in ev])
    check('...in a fresh conversation for slide 2 (context-recovery + slide tag)', '[context-recovery]' in ctx and '[slide-conversation n=2 id=s2]' in ctx, ctx[:200])
    check('...slide 2 has a new id and a lostAt; slide 1, slide 3 and the deck keep theirs',
          c['s2'].get('sessionId') and 'dead-beef' not in c['s2']['sessionId'] and c['s2'].get('lostAt') and c['s1']['sessionId'] == s1
          and c['s3']['sessionId'] == s3 and raw(T, P).get('sessionId') == deck_sess and not raw(T, P).get('sessionLostAt'), c)

    # ---- L-17 per slide: a too-large slide conversation is handed off
    rec = raw(T, P)
    rec['slideConvs']['s1']['ctxTokens'] = 10 ** 9
    write_raw(T, P, rec)
    s, j, ev = step(T, P, '/api/claude/reply', {'deckId': P, 'slide': 1, 'text': 'one more tweak'})
    ctx = ' '.join(say_lines(ev, '[fake-context]'))
    c = convs(T, P)
    check('slide 1 past CTX_RESET: a fresh hand-off conversation for slide 1 only', '--resume' not in (T.fake_argv(ev) or ['--resume'])
          and '[context-handoff]' in ctx and any(e.get('code') == 'handoff' for e in ev) and c['s1']['sessionId'] != s1
          and c['s2']['sessionId'] and raw(T, P).get('sessionId') == deck_sess, (ctx[:120], c['s1']))

    # ---- migration from a v0.5.1-shaped deck
    M = 'b0b0b0b0b0b1'
    old = raw(T, P)
    shutil.copytree(T.AURA / 'decks' / P, T.AURA / 'decks' / M)
    for x in (T.AURA / 'decks' / M).glob('session.json'): x.unlink()
    legacy = {k: v for k, v in old.items() if k not in ('slideConvs',)}
    legacy.update(id=M, title='Legacy deck', sessionId='11111111-2222-3333-4444-555555555555', ctxTokens=380000, buildTarget=None, buildRest=False)
    legacy['file'] = str(legacy.get('file') or '').replace(f'.aura/decks/{P}/', f'.aura/decks/{M}/')
    plan = legacy['plan']
    for i, sl in enumerate(plan['slides']): sl['built'] = i < 2; sl.pop('status', None); sl['title'] = str(sl.get('title') or '').replace(' ask-me', '')
    plan['doubts'] = [d for d in plan.get('doubts') or [] if isinstance(d, dict)]
    plan['doubts'].append({'id': 'qz', 'question': 'Which accent colour?', 'options': ['Blue', 'Orange'], 'default': ['Blue'], 'scope': 'deck'})
    legacy['planState'] = 'building'
    write_raw(T, M, legacy)
    (T.AURA / 'decks' / M / 'plan.json').write_text(json.dumps({'slides': plan['slides']}, indent=2), encoding='utf-8')
    before = raw(T, M)
    s, j, ev = step(T, M, '/api/claude/reply', {'deckId': M, 'slide': 2, 'text': 'migrated edit'})
    after = raw(T, M)
    argv = T.fake_argv(ev)
    ctx = ' '.join(say_lines(ev, '[fake-context]'))
    check('migration: the first edit of an old built slide does NOT resume the old deck conversation',
          s == 200 and argv and '--resume' not in argv, (s, j, argv))
    check('...it opens slide 2\'s own conversation from the digest and says so once (quietly)',
          '[slide-conversation n=2 id=s2]' in ctx and 'digest=True' in ctx and sum(e.get('code') == 'slide-conv' for e in ev) == 1, ctx[:200])
    check('...stored on slide 2; the old id stays the deck conversation',
          (after.get('slideConvs') or {}).get('s2', {}).get('sessionId') and after['slideConvs']['s2']['sessionId'] != before['sessionId']
          and after.get('sessionId') == before['sessionId'], (after.get('slideConvs'), after.get('sessionId')))
    keep = lambda r: [(x['id'], x.get('title'), bool(x.get('built')), x.get('point')) for x in r['plan']['slides']]
    check('...nothing in the deck was lost or rebuilt: same slides, built flags, open question, deck file',
          keep(after) == keep(before) and [d.get('id') for d in after['plan']['doubts']] == [d.get('id') for d in before['plan']['doubts']]
          and not [d for d in after['plan']['doubts'] if d.get('id') == 'qz' and d.get('answer')] and after.get('file') == before.get('file')
          and after.get('planState') == 'building' and T.plan_of(M).get('built') == 2, (keep(after), after.get('planState')))
    # Post-mortem problem 5. This legacy deck conversation holds 380,000 tokens, well past CTX_RESET: until 0.5.5 the
    # threshold was read on exactly ONE code path (the interview launcher), so the deck conversation was the one
    # conversation nothing ever reset - it grew until the model refused it, mid-turn. A whole-deck message now hands off
    # to a fresh conversation that is given the plan and the built slides instead.
    s, j, ev = step(T, M, '/api/claude/reply', {'deckId': M, 'scope': 'deck', 'text': 'whole deck on the old one'})
    ctx = ' '.join(say_lines(ev, '[fake-context]'))
    check('...a whole-deck message past CTX_RESET hands the DECK conversation off instead of resuming for ever (P5)',
          '--resume' not in (T.fake_argv(ev) or ['--resume']) and any(e.get('code') == 'handoff' for e in ev),
          (T.fake_argv(ev), [e.get('code') for e in ev]))
    check('...and it says so once, naming the deck rather than a slide',
          sum(e.get('code') == 'handoff' for e in ev) == 1
          and any('for this deck' in str(e.get('text') or '') for e in ev if e.get('code') == 'handoff'),
          [(e.get('code'), str(e.get('text'))[:80]) for e in ev if e.get('kind') == 'status'])
    # below the threshold it resumes exactly as it always did
    small = raw(T, M)
    small['ctxTokens'] = 1000
    write_raw(T, M, small)
    s, j, ev = step(T, M, '/api/claude/reply', {'deckId': M, 'scope': 'deck', 'text': 'another whole-deck note'})
    check('...a whole-deck message under the threshold still resumes the deck conversation',
          T.flag(T.fake_argv(ev), '--resume') == raw(T, M)['sessionId'], T.flag(T.fake_argv(ev), '--resume'))
    s, j, ev = step(T, M, '/api/claude/reply', {'deckId': M, 'slide': 2, 'text': 'second edit'})
    check('...and the second edit of slide 2 resumes slide 2\'s new conversation', T.flag(T.fake_argv(ev), '--resume') == raw(T, M)['slideConvs']['s2']['sessionId'])
    s, j, ev = step(T, M, f'/api/decks/{M}/build', {'mode': 'next'})
    c = raw(T, M).get('slideConvs') or {}
    check('...building its next slide uses a new conversation for that slide', T.plan_of(M).get('built') == 3 and (c.get('s3') or {}).get('sessionId')
          and '--resume' not in (T.fake_argv(ev) or ['--resume']), c.get('s3'))
    # a deck made in one go (no plan) keeps one conversation
    hurry = [d for d in jget('/api/decks')[1]['decks'] if d.get('flow') == 'hurry' and d.get('sessionId')]
    if hurry:
        H = hurry[0]['id']
        s, j, ev = step(T, H, '/api/claude/reply', {'deckId': H, 'slide': 2, 'text': 'hurry deck edit'})
        check('a deck without a plan still talks in its one deck conversation', T.flag(T.fake_argv(ev), '--resume') == hurry[0]['sessionId']
              and all(e.get('conv') == 'deck' for e in ev if e.get('deck') == H), T.flag(T.fake_argv(ev), '--resume'))
