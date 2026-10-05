"""Sign-in fix (FIXLOG "## Sign-in fix"). Run by test_server.py (run(T) with the harness module); no real Claude, no windows.
  - `claude auth login` runs with BROWSER = engine/tools/signin-url.cmd: the URL comes back to Lumi, which builds
    `msedge --inprivate <url>` (default) or uses the default browser ("normal", or Edge missing) - command only, never opened
  - every plan is allowed: pro/max/team/enterprise ok without a note, free ok with the gentle note, no type (Console/API key
    or unknown) ok and labelled
  - the confirmation: unconfirmed after a sign-in, remembered per install (.aura/account.json), asked again when the email
    changes; "use a different account" = logout, then login (fake call log)"""
import importlib.util, json, os, time
from pathlib import Path


def load_server(T):
    os.environ['AURA_HOME'] = str(T.AURA)
    spec = importlib.util.spec_from_file_location('lumi_form_server_unit', T.SERVER)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


def signin_of(T):
    return {c['id']: c for c in T.jget('/api/health?part=claude')[1].get('checks') or []}.get('signin') or {}


def wait(fn, secs=20):
    t0 = time.time()
    while time.time() - t0 < secs:
        v = fn()
        if v: return v
        time.sleep(0.3)
    return fn()


def run(T):
    check = T.check
    print('\n[sign-in fix: private window command (unit)]')
    m = load_server(T)
    url = 'https://claude.com/cai/oauth/authorize?code=true&client_id=x&redirect_uri=http%3A%2F%2Flocalhost%3A5%2Fcallback&state=s'
    edge = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
    check('private + edge -> msedge --inprivate <url> (one argv, URL untouched)', m.signin_open_cmd(url, 'private', edge) == [edge, '--inprivate', url])
    check('normal browser -> None (default browser)', m.signin_open_cmd(url, 'normal', edge) is None)
    check('edge missing -> None (falls back to the default browser)', m.signin_open_cmd(url, 'private', None) is None)
    check('helper output: quoted URL is unquoted', m.signin_url('"' + url + '" \r\n') == url)
    check('helper output: junk / http / empty refused', m.signin_url('ECHO is off.') is None and m.signin_url('http://x') is None and m.signin_url('') is None)
    check('plan labels', [m.plan_label(p) for p in ('pro', 'max', 'team', 'enterprise', 'free')] ==
          ['Pro plan', 'Max plan', 'Team plan', 'Enterprise plan', 'Free plan'])
    check('no type: console/api key labelled, unknown labelled', m.plan_label(None, 'console_api_key') == 'Anthropic Console (API key)'
          and m.plan_label(None, 'claude.ai') == 'plan not shown')
    helper = T.REPO / 'engine' / 'tools' / 'signin-url.cmd'
    check('signin-url.cmd exists with CRLF', helper.is_file() and b'\r\n' in helper.read_bytes())

    auth = T.AURA / 'temp' / 'fake-auth-signin.json'
    calls = T.AURA / 'temp' / 'fake-calls.txt'
    acct = T.AURA / 'account.json'
    auth.parent.mkdir(parents=True, exist_ok=True)

    print('\n[sign-in fix: every plan is allowed]')
    for plan, label in (('pro', 'Pro plan'), ('max', 'Max plan'), ('team', 'Team plan'), ('enterprise', 'Enterprise plan'),
                        ('free', 'Free plan'), ('none', 'plan not shown')):
        auth.write_text(json.dumps({'loggedIn': True, 'email': 'a@example.com', 'plan': plan}), encoding='utf-8')
        srv = T.start_server(AURA_FAKE_AUTH_FILE=auth)
        try:
            h = T.jget('/api/health')[1]
            si = {c['id']: c for c in h.get('checks') or []}['signin']
            ok = si['ok'] is True and si.get('planLabel') == label and not si.get('fix')
            if plan == 'free': ok = ok and si.get('free') is True and 'Pro or higher is recommended' in si.get('note', '') and 'Free plan' in si['note']
            else: ok = ok and not si.get('free') and not si.get('note')
            check(f'{plan}: signed in, allowed, label "{label}"' + (' + gentle note' if plan == 'free' else ', no note'), ok, si)
            check(f'{plan}: no "Pro, Max or Team" wording', 'Max or Team' not in json.dumps(h), si)
        finally:
            T.stop_server(srv)
    auth.write_text(json.dumps({'loggedIn': True, 'email': '', 'plan': 'none', 'method': 'console_api_key'}), encoding='utf-8')
    srv = T.start_server(AURA_FAKE_AUTH_FILE=auth)
    try:
        si = signin_of(T)
        check('Console / API-key login (no plan, no email) allowed + labelled', si.get('ok') is True and si.get('planLabel') == 'Anthropic Console (API key)', si)
    finally:
        T.stop_server(srv)

    print('\n[sign-in fix: private window, confirmation, different account]')
    acct.unlink(missing_ok=True); calls.unlink(missing_ok=True)
    auth.write_text(json.dumps({'loggedIn': False, 'email': 'me@example.com', 'plan': 'pro'}), encoding='utf-8')
    fake_edge = r'C:\fake\msedge.exe'
    srv = T.start_server(AURA_FAKE_AUTH_FILE=auth, AURA_FAKE_CALL_LOG=calls, AURA_FAKE_EDGE=fake_edge)
    try:
        si = signin_of(T)
        check('signed out -> blocking, any plan wording', si.get('ok') is False and si.get('blocking') is True and si.get('fix') == 'signin'
              and 'Any Claude plan' in si.get('detail', ''), si)
        s, j = T.jpost('/api/fix/signin', {'browser': 'private'})
        check('sign-in starts in private mode by default', s == 200 and j.get('mode') == 'private', j)
        st = wait(lambda: (lambda x: x if x.get('captured') else None)(T.jget('/api/claude/signin')[1]))
        cmd = (st or {}).get('command') or []
        check('URL captured through BROWSER -> msedge --inprivate <url> (not opened in tests)',
              st and cmd[:2] == [fake_edge, '--inprivate'] and cmd[2].startswith('https://claude.com/cai/oauth/authorize?')
              and '&state=fake' in cmd[2] and st.get('opened') is False and st.get('browser') == 'edge-private', st)
        si = wait(lambda: (lambda c: c if c.get('ok') else None)(signin_of(T)))
        check('after the sign-in: shown for confirmation (email + plan, not yet confirmed)',
              si and si.get('email') == 'me@example.com' and si.get('planLabel') == 'Pro plan' and si.get('confirmed') is False, si)
        st = T.jget('/api/claude/status?refresh=1')[1]
        check('status carries email, planLabel, confirmed=false', st.get('email') == 'me@example.com' and st.get('planLabel') == 'Pro plan'
              and st.get('confirmed') is False, st)
        s, j = T.jpost('/api/claude/confirm', {'email': 'someone.else@example.com'})
        check('confirming a different email than the signed-in one -> 409 account-changed', s == 409 and j.get('error') == 'account-changed', j)
        s, j = T.jpost('/api/claude/confirm', {'email': 'me@example.com'})
        check('"yes, that\'s me" -> saved', s == 200 and j.get('confirmed') and json.loads(acct.read_text(encoding='utf-8')).get('account') == 'me@example.com', j)
        check('confirm foreign origin -> 403', T.jpost('/api/claude/confirm', {}, headers={'Origin': 'http://evil.example'})[0] == 403)
        check('now confirmed', signin_of(T).get('confirmed') is True)
    finally:
        T.stop_server(srv)
    srv = T.start_server(AURA_FAKE_AUTH_FILE=auth, AURA_FAKE_CALL_LOG=calls, AURA_FAKE_EDGE=fake_edge)
    try:
        check('remembered per install: a restart does not ask again', signin_of(T).get('confirmed') is True)
        d = json.loads(auth.read_text(encoding='utf-8')); d['email'] = 'other@example.com'; auth.write_text(json.dumps(d), encoding='utf-8')
        time.sleep(3.2)                         # auth status is cached for 3 s
        si = signin_of(T)
        check('the email changed -> asked again', si.get('ok') is True and si.get('confirmed') is False and si.get('email') == 'other@example.com', si)
        # "use a different account": logout, then the private sign-in again; the browser signs in as someone new
        calls.write_text('', encoding='utf-8')
        d = json.loads(auth.read_text(encoding='utf-8')); d['next'] = {'email': 'mine@example.com', 'plan': 'free'}; auth.write_text(json.dumps(d), encoding='utf-8')
        s, j = T.jpost('/api/claude/logout')
        check('different account: logout ok', s == 200 and j.get('signedIn') is False, j)
        s, j = T.jpost('/api/fix/signin', {'browser': 'private'})
        si = wait(lambda: (lambda c: c if c.get('ok') else None)(signin_of(T)))
        log = [x for x in calls.read_text(encoding='utf-8').splitlines() if x in ('auth logout', 'auth login')]
        check('different account: logout, then login (in that order)', log[:2] == ['auth logout', 'auth login'], log)
        check('the new account is offered for confirmation, Free with the note', si and si.get('email') == 'mine@example.com' and si.get('confirmed') is False
              and si.get('free') is True and si.get('note'), si)
        s, j = T.jpost('/api/fix/signin', {'browser': 'normal'})
        st = wait(lambda: (lambda x: x if x.get('captured') else None)(T.jget('/api/claude/signin')[1]))
        check('"use my normal browser" -> default browser (no command)', s == 200 and j.get('mode') == 'normal' and st and st.get('command') is None
              and st.get('browser') == 'default', st)
        wait(lambda: signin_of(T).get('ok'))
    finally:
        T.stop_server(srv)
    srv = T.start_server(AURA_FAKE_AUTH_FILE=auth, AURA_FAKE_EDGE='none')
    try:
        T.jpost('/api/claude/logout')
        T.jpost('/api/fix/signin', {})
        st = wait(lambda: (lambda x: x if x.get('captured') else None)(T.jget('/api/claude/signin')[1]))
        check('Edge missing -> private request falls back to the default browser', st and st.get('command') is None and st.get('fallback') == 'no-edge', st)
        wait(lambda: signin_of(T).get('ok'))
    finally:
        T.stop_server(srv)
        for f in (auth, calls, acct): f.unlink(missing_ok=True)
