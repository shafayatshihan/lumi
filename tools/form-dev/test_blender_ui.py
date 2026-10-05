"""Blender batch 3 (docs/blender-contract.md sections 2, 3, 7): what the plan / build / editor / finalize pages rely on.
Run by test_server.py (run(T)); starts its own server with the fake blender. The page itself is walked by e2e_blender.js
(test_frontend.py --e2e); this file checks the server side of every UI step:
  - plan payload blender.estimates (still, 720p, 1080p, iteration tokens) for every 3D slide; none without Blender
  - the engine chip writes visual.engine (strict page save): the default, a choice that sticks, the effective engine
  - defer ("skip for now, keep the preview"): stored, cleared by a change and by the full render, refused for a non-Blender slide
  - a design change on a FINALIZED deck marks it changed since finalizing
  - finalize 409 blender-pending lists the slides; blender-stale until acceptStale"""
import json, time
from pathlib import Path

FAKE_BLENDER = Path(__file__).resolve().parent / 'fake_blender.py'


def run(T):
    import test_blender as TB, test_batch_c
    check, jget, jpost = T.check, T.jget, T.jpost
    print('\n[Blender batch 3: plan chips, estimates, defer, finalize 409 (fake blender)]')
    # without Blender (the default test server): no estimates, the engine still reported
    srv = T.start_server()
    try:
        P0 = test_batch_c.make_plan_deck(T, 'No blender deck')
        pj = T.plan_of(P0)
        check('no Blender: plan payload blender.available false and no estimates', (pj.get('blender') or {}).get('available') is False
              and (pj['blender'].get('estimates') or {}) == {}, pj.get('blender'))
    finally:
        T.stop_server(srv)
    srv = T.start_server(AURA_BLENDER=str(FAKE_BLENDER))
    try:
        P = test_batch_c.make_plan_deck(T, 'Batch 3 deck')
        plan = json.loads(json.dumps(T.plan_of(P)['plan']))
        S = plan['slides']
        S[0].update(title='Still pump', visual={'main': '3d', 'companions': [], 'detail': 'detailed', 'motion': 'still', 'phrase': 'a pump'})
        S[1].update(title='Turning rotor', visual={'main': '3d', 'companions': [], 'detail': 'detailed', 'motion': 'timed', 'phrase': 'a rotor'})
        S[2].update(title='A chart', visual={'main': 'chart', 'companions': [], 'phrase': 'bars'})
        T.save(P, plan); T.wait_plan_idle(P)
        pj = T.plan_of(P)
        ids = [x['id'] for x in pj['plan']['slides']]
        s1, s2, s3 = ids[:3]
        est = (pj.get('blender') or {}).get('estimates') or {}
        e1 = est.get(s1) or {}
        check('plan payload: blender.estimates for every 3D slide (still, 720, 1080 seconds + basis + iteration tokens), none for a chart',
              s1 in est and s2 in est and s3 not in est and e1.get('still', 0) > 0 and 0 < e1.get('720', 0) < e1.get('1080', 0)
              and e1.get('basis') in ('default', 'benchmark', 'slide') and (e1.get('iteration') or {}).get('tokens', 0) > 0, est)
        eng = pj.get('engines') or {}
        check('engine chips default: Bold Blue still 3D -> blender (not chosen), turning 3D -> three.js', eng[s1]['engine'] == 'blender' and not eng[s1]['chosen']
              and eng[s2]['engine'] == 'threejs', eng)
        # the chips: the page saves the whole plan strictly
        plan = json.loads(json.dumps(pj['plan']))
        plan['slides'][0]['visual']['engine'] = 'threejs'
        plan['slides'][1]['visual']['engine'] = 'blender'
        s, j = T.save(P, plan)
        T.wait_plan_idle(P)
        pj = T.plan_of(P); eng = pj.get('engines') or {}
        check('engine chip persists: still slide switched to live 3D, turning slide to a studio render (chosen, animation)',
              s == 200 and eng[s1] == {'engine': 'threejs', 'kind': 'still', 'note': None, 'chosen': True}
              and eng[s2]['engine'] == 'blender' and eng[s2]['kind'] == 'animation' and eng[s2]['chosen'], (s, eng))
        pf = json.loads((T.AURA / 'decks' / P / 'plan.json').read_text(encoding='utf-8'))
        check('...and plan.json keeps visual.engine (the slide editor round-trips it)', pf['slides'][0]['visual'].get('engine') == 'threejs'
              and pf['slides'][1]['visual'].get('engine') == 'blender')
        bad = json.loads(json.dumps(pj['plan'])); bad['slides'][0]['visual']['engine'] = 'povray'
        s, j = T.save(P, bad)
        check('a bad engine from the page is refused (bad-engine), the stored one is kept', s != 200 and T.plan_of(P)['engines'][s1]['engine'] == 'threejs', (s, j))
        plan = json.loads(json.dumps(T.plan_of(P)['plan'])); plan['slides'][0]['visual']['engine'] = 'blender'
        for x in plan['slides'][1:]:                          # from here on slide 1 is the deck's only studio render
            if (x.get('visual') or {}).get('main') == '3d': x['visual']['engine'] = 'threejs'
        T.save(P, plan); T.wait_plan_idle(P)
        check('(set-up) slide 1 is the only studio render', [k for k, e in T.plan_of(P)['engines'].items() if e.get('engine') == 'blender'] == [s1])

        # build slide 1 (studio render still): preview -> defer -> change clears it
        jpost(f'/api/decks/{P}/build', {'mode': 'next'})
        T.wait_plan_idle(P)
        v = TB.wait_status(T, P, s1, ('preview', 'failed'))
        check('build: slide 1 previewed; view has estimates the card shows (preview s, iteration tokens, full still)', v.get('status') == 'preview'
              and v['estimates']['preview']['seconds'] > 0 and v['estimates']['iteration']['tokens'] > 0 and v['estimates']['full']['still']['seconds'] > 0, v.get('status'))
        s, j = jpost(f'/api/decks/{P}/blender/{s1}/defer', {'on': True})
        check('defer ("skip for now, keep the preview"): stored on the slide', s == 200 and (j.get('view') or {}).get('deferred', {}).get('at'), (s, j))
        s, j = jpost(f'/api/decks/{P}/blender/{s3}/defer', {'on': True})
        check('defer on a slide that is not a studio render -> 409', s == 409, (s, j))
        s, j = jpost(f'/api/finalize/cancel', {})
        s, j = jpost(f'/api/decks/{P}/finalize', {})
        check('finalize with a deferred (unrendered) studio render -> 409 blender-pending with its slide number', s == 409 and j.get('error') == 'blender-pending'
              and j.get('slides') == [1] and 'slide 1' in (j.get('reason') or '').lower(), (s, j))
        jpost(f'/api/decks/{P}/blender/{s1}/change', {'text': 'a warmer light'})
        T.wait_plan_idle(P)
        v = TB.wait_status(T, P, s1, ('preview', 'failed'))
        check('a design change clears "skip for now" (the new preview needs a look)', not v.get('deferred') and len(v.get('previews') or []) == 2, (v.get('deferred'), len(v.get('previews') or [])))
        jpost(f'/api/decks/{P}/blender/{s1}/defer', {'on': True})
        s, j = jpost(f'/api/decks/{P}/blender/{s1}/defer', {'on': False})
        check('defer off clears it', s == 200 and not (j.get('view') or {}).get('deferred'), j.get('view', {}).get('deferred'))
        jpost(f'/api/decks/{P}/blender/{s1}/defer', {'on': True})
        jpost(f'/api/decks/{P}/blender/{s1}/approve', {})
        jpost(f'/api/decks/{P}/blender/{s1}/render', {})
        v = TB.wait_status(T, P, s1, ('rendered', 'failed'))
        check('the full render clears "skip for now"', v.get('status') == 'rendered' and not v.get('deferred'), (v.get('status'), v.get('deferred')))

        # a finalized deck: a design change marks it changed since finalizing (the editor's "change design")
        recp = T.AURA / 'decks' / f'{P}.json'
        rec = json.loads(recp.read_text(encoding='utf-8'))
        fin = T.SANDBOX / '4 - Your slides' / 'Batch 3 deck.html'
        fin.parent.mkdir(parents=True, exist_ok=True); fin.write_text('<!doctype html><title>x</title>', encoding='utf-8')
        rec['final'] = {'html': '4 - Your slides/Batch 3 deck.html', 'at': 'x'}; rec['changedSinceFinalize'] = False
        recp.write_text(json.dumps(rec), encoding='utf-8')
        d = jget(f'/api/decks/{P}')[1].get('deck') or {}
        check('(set-up) the deck reads as finalized and unchanged', d.get('finalized') and not d.get('changedSinceFinalize'), (d.get('finalized'), d.get('changedSinceFinalize')))
        jpost(f'/api/decks/{P}/blender/{s1}/change', {'text': 'make the base wider'})
        T.wait_plan_idle(P)
        v = TB.wait_status(T, P, s1, ('preview', 'failed'))
        d = jget(f'/api/decks/{P}')[1].get('deck') or {}
        check('editor "change design" on a finalized deck: changed since finalizing, final kept but stale', d.get('changedSinceFinalize') is True
              and (v.get('final') or {}).get('stale') is True, (d.get('changedSinceFinalize'), (v.get('final') or {}).get('stale')))
        s, j = jpost(f'/api/decks/{P}/finalize', {})
        check('finalize with a stale render -> 409 blender-stale (slides + reason)', s == 409 and j.get('error') == 'blender-stale' and j.get('slides') == [1] and j.get('reason'), (s, j))
        t0 = time.time()
        s, j = jpost(f'/api/decks/{P}/finalize', {'acceptStale': True})
        check('finalize {acceptStale: true} goes past the stale question (no blender-* refusal)', not (s == 409 and str(j.get('error', '')).startswith('blender')), (s, j))
        while time.time() - t0 < 60 and (jget('/api/finalize')[1] or {}).get('running'): time.sleep(0.3)
    finally:
        T.stop_server(srv)
