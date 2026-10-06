"""Developer-only stand-in for the Claude CLI, used by the real form server when AURA_FAKE_CLAUDE points here.
Reads the message from stdin and prints realistic stream-json (same shapes the real `claude -p --output-format
stream-json --verbose` prints on this PC), writes a small sample deck into "4 - Your slides" and honours --resume.
Also answers `auth status` / `auth login`.

Trigger words (in the message, or for the first run also in the brief's notes):
  many-doubts     (in the brief's notes) the plan also asks a deck-wide tone question with when=/depends= variants of a follow-up
  ask-me          first run asks a question with [[aura:choice ...]] + [[aura:ask]] and ends its turn
  (in a slide title during a build) ask-seven: seven questions with when=/depends= variants (q2 follows q1, q4 follows q3); ask-deep: 4 design questions before the slide, one more midway, then it finishes; ask-me: two choices first (3D scene + detail); long-hints: five long hints
  (Blender slides, docs/blender-contract.md) a build step whose message has a BLENDER SLIDE block writes the fake scene.py
                  (FAKE_* directives for tools/form-dev/fake_blender.py from the slide title: bl-fail, bl-gpu, bl-slow; bl-noscene
                  writes none) and "runs" the one allowed check command; a [blender-change ...] message edits scene.py
                  (text "no-edit": leaves it; "make-it-fail": adds FAKE_FAIL; "fast-again": drops FAKE_SLOW)
  take-your-time  works slowly for up to AURA_FAKE_LONG seconds (default 60), for stop/idle tests
  auth-fail       behaves like a signed-out CLI
  rate-limit      hits the usage limit
  usage-windows   the rate_limit_event carries unifiedWindows.five_hour (instead of a top-level utilization)
  crash           dies without a result line
  (session ids) containing dead-beef: --resume fails like the real CLI (stderr + result with errors); dead-quiet: exits 1 silently;
  fail-fresh      (in the message) a NON-resumed run exits 1 with an error on stderr
Every run first says "[fake-argv] <json list of its arguments>" so tests can check the flags (--model, --resume ...),
then "[fake-env] LUMI_INTERVIEW=<path|empty>" (what the Stop hook hands deck_check for rule L-15),
and a resumed run also says "[fake-heard] <the message>" (to check the [slide N] prefix). A slide's own fresh conversation
("[slide-conversation ..." first line) says "[fake-context] <its context>" and "[fake-heard] <the message after it>", and
behaves like a reply (it never starts a new deck).
A finished deck ends with 3 [[aura:hint slide=N text="..."]] lines. The deck is written both as a build source
(.aura/temp/build/<slug>/index.html) and as the packed file, with data-edit ids on every text; slide 2's title
(data-edit="s2-t1") shrinks to fit its box, so a very long text there breaks the 26 px rule.
Env: AURA_FAKE_DELAY seconds between lines (default 0.35), AURA_FAKE_LOGGED_IN=0 for a signed-out status,
AURA_FAKE_PLAN=<subscriptionType> (default max),
AURA_FAKE_EMAIL, AURA_FAKE_AUTH_METHOD, AURA_FAKE_LOGIN_SECONDS, AURA_FAKE_CALL_LOG=<path>,
AURA_FAKE_AUTH_FILE=<path> (signed-in state kept in a file that auth login/logout flip), AURA_FAKE_HELP_FAIL=1 (the
loading screen's [lumi-help] runs fail)."""
import html as htm, json, os, re, sys, time, uuid
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
args = sys.argv[1:]
DELAY = float(os.environ.get('AURA_FAKE_DELAY', '0.35'))


def out(obj):
    print(obj if isinstance(obj, str) else json.dumps(obj, ensure_ascii=False), flush=True)
    time.sleep(DELAY)


AUTH_FILE = os.environ.get('AURA_FAKE_AUTH_FILE')     # optional: signed-in state that login/logout change
# The auth file holds "1"/"0" or JSON {"loggedIn": bool, "email": str, "plan": str|"none", "method": str,
# "next": {"email", "plan", "method"}}: `auth login` signs in as "next" when given (a different account), else keeps
# the last identity. Every auth call is appended to AURA_FAKE_CALL_LOG when set (tests: "logout, then login").


def auth_state():
    st = {'loggedIn': os.environ.get('AURA_FAKE_LOGGED_IN', '1') != '0', 'email': os.environ.get('AURA_FAKE_EMAIL', 'tester@example.com'),
          'plan': os.environ.get('AURA_FAKE_PLAN', 'max'), 'method': os.environ.get('AURA_FAKE_AUTH_METHOD', 'claude.ai')}
    if AUTH_FILE and Path(AUTH_FILE).is_file():
        raw = Path(AUTH_FILE).read_text(encoding='utf-8').strip()
        if raw.startswith('{'): st.update(json.loads(raw))
        else: st['loggedIn'] = raw == '1'
    return st


def save_auth(st):
    if AUTH_FILE: Path(AUTH_FILE).write_text(json.dumps(st), encoding='utf-8')


if args[:1] == ['auth'] and os.environ.get('AURA_FAKE_CALL_LOG'):
    with open(os.environ['AURA_FAKE_CALL_LOG'], 'a', encoding='utf-8') as f: f.write(' '.join(args[:2]) + '\n')
if args[:2] == ['auth', 'status']:
    st = auth_state(); ok = bool(st.get('loggedIn'))
    info = {'loggedIn': ok, 'authMethod': st.get('method') or 'claude.ai' if ok else 'none', 'apiProvider': 'firstParty'}
    if ok and st.get('email'): info['email'] = st['email']
    if ok and st.get('plan') and st['plan'] != 'none': info['subscriptionType'] = st['plan']
    print(json.dumps(info, indent=2))
    sys.exit(0 if ok else 1)
if args[:2] == ['auth', 'login']:
    print('Opening browser to sign in... (fake)')
    url = ('https://claude.com/cai/oauth/authorize?code=true&client_id=fake&response_type=code'
           '&redirect_uri=http%3A%2F%2Flocalhost%3A55555%2Fcallback&state=fake')
    if os.environ.get('BROWSER'):                     # like Claude Code: BROWSER gets the URL, quoted (it holds '&')
        import subprocess
        subprocess.run(f'"{os.environ["BROWSER"]}" "{url}"', stdin=subprocess.DEVNULL)
    time.sleep(float(os.environ.get('AURA_FAKE_LOGIN_SECONDS', '2')))
    if AUTH_FILE:
        st = auth_state(); nxt = st.pop('next', None) or {}
        st.update(nxt); st['loggedIn'] = True
        save_auth(st)
    print('Login successful.'); sys.exit(0)
if args[:2] == ['auth', 'logout']:
    if AUTH_FILE:
        st = auth_state(); st['loggedIn'] = False; save_auth(st)
    print('Successfully logged out.'); sys.exit(0)

message = sys.stdin.read()
# v0.5.2: a slide's own conversation opens with a self-contained context ([slide-conversation n= id=] ... then a blank line, then the
# real message). The triggers below look at the real message only (the context lists every slide's title).
SC = '[slide-conversation' in message.split('\n', 1)[0]
FULL = message
CTX_PART, message = message.split('\n\n', 1) if SC and '\n\n' in message else ('', message)
if '[lumi-help ' in message:            # the loading screen's headless helper: fix or explain one failing check
    if os.environ.get('AURA_FAKE_HELP_FAIL') == '1': sys.exit(1)
    if '[lumi-help explain]' in message:
        text = 'Lumi could not install the slide tools it needs, maybe because the internet dropped. Check your connection, then press Repair.'
    else:
        text = 'I tried to reinstall the slide tools.' + chr(10) + 'NOT FIXED: the download did not finish.'
    print(json.dumps({'type': 'result', 'subtype': 'success', 'is_error': False, 'result': text}))
    sys.exit(0)
resume = args[args.index('--resume') + 1] if '--resume' in args else None
session = resume or str(uuid.uuid4())
cwd = Path.cwd()
brief = {}
try:
    brief = json.loads((cwd / '.aura' / 'brief' / 'brief.json').read_text(encoding='utf-8'))
except Exception:
    pass
notes = str((brief.get('extra') or {}).get('notes') or '')
trigger = lambda w: w in message or (not resume and not SC and w in notes)
n_tool = [0]
CTX = [0]        # simulated context size of this conversation (tokens), reported like the real stream's message.usage


def say(text):
    msg = {'id': 'msg_' + uuid.uuid4().hex[:12], 'type': 'message', 'role': 'assistant', 'content': [{'type': 'text', 'text': text}]}
    if CTX[0]: msg['usage'] = {'input_tokens': 6, 'cache_read_input_tokens': CTX[0] // 2, 'cache_creation_input_tokens': CTX[0] - CTX[0] // 2 - 6,
                               'output_tokens': 80}
    out({'type': 'assistant', 'message': msg, 'session_id': session})


def tool(name, inp, result, error=False):
    n_tool[0] += 1
    tid = f'toolu_fake{n_tool[0]:03d}'
    out({'type': 'assistant', 'message': {'role': 'assistant', 'content': [{'type': 'tool_use', 'id': tid, 'name': name, 'input': inp}]},
         'session_id': session})
    out({'type': 'user', 'message': {'role': 'user', 'content': [{'type': 'tool_result', 'tool_use_id': tid, 'content': result,
                                                                 'is_error': error}]}, 'session_id': session})


def result(text, error=False, sub='success'):
    out({'type': 'result', 'subtype': sub, 'is_error': error, 'duration_ms': 4200, 'num_turns': n_tool[0] + 1,
         'result': text, 'session_id': session, 'total_cost_usd': 0})


if resume and 'dead-beef' in resume:       # a conversation Claude Code no longer has: exactly what the real CLI does (checked on this PC)
    print('No conversation found with session ID: ' + resume, file=sys.stderr, flush=True)
    print(json.dumps({'type': 'result', 'subtype': 'error_during_execution', 'duration_ms': 0, 'is_error': True, 'num_turns': 0,
                      'session_id': resume, 'total_cost_usd': 0, 'errors': ['No conversation found with session ID: ' + resume]}), flush=True)
    sys.exit(1)
if resume and 'dead-quiet' in resume:      # the generic case: a resumed run dies at once and says nothing at all
    sys.exit(1)
if 'fail-fresh' in message and not resume:  # the recovery run fails as well (must stop, never loop)
    print('Error: the fresh conversation could not start (fake)', file=sys.stderr, flush=True)
    sys.exit(1)
out('Ignoring 15 permissions.allow entries from .claude/settings.json: this folder has not been trusted yet (fake)')
out({'type': 'system', 'subtype': 'hook_started', 'hook_name': 'SessionStart:startup', 'session_id': session})
out({'type': 'system', 'subtype': 'init', 'session_id': session, 'cwd': str(cwd), 'model': 'fake-claude',
     'tools': ['Read', 'Write', 'Edit', 'Bash'], 'permissionMode': 'acceptEdits'})
defang = lambda t: t.replace('[[aura:', '[[ aura:')      # an echo of the prompt must not look like markers Claude wrote
say('[fake-argv] ' + defang(json.dumps(args, ensure_ascii=False)))
# The Stop hook runs the full deck check inside this very run and needs to know which deck's interview.json to read;
# the server puts it in LUMI_INTERVIEW. Echo it so a test can prove it really arrives in the child's environment.
say('[fake-env] LUMI_INTERVIEW=' + (os.environ.get('LUMI_INTERVIEW') or ''))
if SC: say('[fake-context] ' + defang(CTX_PART[:240]) + f' ... ({len(CTX_PART)} chars; digest={"The plan in short:" in CTX_PART}; '
                 f'notes={"How the slides already built" in CTX_PART}; since={"Since you last worked" in message})')
if resume or SC: say('[fake-heard] ' + defang(message[:300]))

if 'auth-fail' in message:
    result('Invalid API key · Please run /login', error=True)
    sys.exit(1)
if 'crash' in message:
    print('Error: something went badly wrong (fake crash)', file=sys.stderr, flush=True)
    sys.exit(3)
if 'usage-windows' in message:
    out({'type': 'rate_limit_event', 'rate_limit_info': {'status': 'allowed_warning', 'rateLimitType': 'five_hour',
         'unifiedWindows': {'five_hour': {'utilization': 0.81, 'resetsAt': int(time.time()) + 1800}}}})
else:
    out({'type': 'rate_limit_event', 'rate_limit_info': {'status': 'allowed', 'resetsAt': int(time.time()) + 3600,
         'rateLimitType': 'five_hour', 'utilization': 0.42}})
if 'rate-limit' in message:
    out({'type': 'rate_limit_event', 'rate_limit_info': {'status': 'rejected', 'resetsAt': int(time.time()) + 5400,
         'rateLimitType': 'five_hour', 'utilization': 1.0}})
    result("You've hit your limit · resets 3pm", error=True)
    sys.exit(1)

title = str((brief.get('basics') or {}).get('title') or 'My talk').strip() or 'My talk'
# a resumed session keeps working on its own deck (the draft brief may belong to a newer deck by now)
memo = cwd / '.aura' / 'temp' / 'fake-sessions.json'
try:
    sessions = json.loads(memo.read_text(encoding='utf-8'))
except Exception:
    sessions = {}


def save_memo():
    memo.parent.mkdir(parents=True, exist_ok=True)
    memo.write_text(json.dumps(sessions, indent=2), encoding='utf-8')


if resume and sessions.get(session): title = sessions[session]
else:
    mp = re.search(r'(\.aura/decks/[A-Za-z0-9_-]+)/plan\.json', message) or re.search(r'\[deck-folder (\.aura/decks/[A-Za-z0-9_-]+)\]', message)
    if mp and ('[build-slide' in message or SC):           # a fresh conversation handed a deck (recovery / hand-off): the plan's title
        try: title = str(json.loads((cwd / mp.group(1) / 'plan.json').read_text(encoding='utf-8')).get('title') or title)
        except Exception: pass
    sessions[session] = title
    save_memo()
# simulated context (AURA_FAKE_CTX_BASE: a new conversation starts with the skills + plan read; _SLIDE: what one built slide adds)
CTX[0] = (sessions.get(session + ':ctx', 0) if resume else int(os.environ.get('AURA_FAKE_CTX_BASE', '60000'))) + len(FULL) // 4


def save_ctx(add):
    CTX[0] += add
    sessions[session + ':ctx'] = CTX[0]
    save_memo()
safe = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '', title)[:60].strip(' .') or 'My talk'
# v0.5: a deck with a work folder packs there ("[deck-folder .aura/decks/<id>]" or the plan path in the message)
m_folder = re.search(r'\[deck-folder (\.aura/decks/[A-Za-z0-9_-]+)\]', message) or re.search(r'(\.aura/decks/[A-Za-z0-9_-]+)/plan\.json', message)
folder = m_folder.group(1) if m_folder else None
deck_rel = f'{folder}/{safe}.html' if folder else f'4 - Your slides/{safe}.html'
slug = re.sub(r'[^a-z0-9]+', '-', safe.lower()).strip('-') or 'deck'
build_rel = f'.aura/temp/build/{slug}/index.html'
PERIOD = float(os.environ.get('AURA_FAKE_PERIOD', '0.5'))


def deck_html(deck_title, items):
    """A small deck that implements the Lumi capture contract itself (engine/deck/runtime.js header): ?capture ->
    window.LumiCapture {ready, slides: {n: {period, seek, rect, holder}}}, ?still=<n> + html[data-aura-still-ready].
    items: (heading, text, fit, loop, notes)."""
    body = ''.join(
        f'<section class="slide"{" data-period=" + chr(34) + str(PERIOD) + chr(34) if loop else ""}>'
        f'<h1 data-edit="s{i}-t1"{fit}>{htm.escape(h)}</h1><p data-edit="s{i}-t2">{htm.escape(p)}</p>'
        + (f'<canvas class="loop aura-canvas" data-period="{PERIOD}" width="640" height="300"></canvas>' if loop else '')
        + f'<aside class="notes"><p>{htm.escape(notes)}</p></aside></section>'
        for i, (h, p, fit, loop, notes) in enumerate(items, 1))
    return ('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + htm.escape(deck_title) + '</title><style>'
            'body{margin:0;background:#EEEDF9;font-family:system-ui;color:#080909}'
            '.slide{width:1920px;height:1080px;display:flex;flex-direction:column;justify-content:center;padding:0 192px;'
            'box-sizing:border-box;overflow:hidden}'
            'h1{font-size:64px;margin:0 0 16px}p{font-size:32px;margin:0}.notes{display:none}.slide{position:relative}'
            'canvas.loop{position:absolute;left:192px;top:640px;width:640px;height:300px}'
            '.fit{width:900px;white-space:nowrap;overflow:hidden}</style></head><body>' + body +
            '<script>document.querySelectorAll(".fit").forEach(function(e){var s=64;'
            'while(e.scrollWidth>e.clientWidth&&s>6){s--;e.style.fontSize=s+"px";}});'
            '(function(){var q=new URLSearchParams(location.search),S=[].slice.call(document.querySelectorAll(".slide"));'
            'function show(n){S.forEach(function(s,i){s.style.display=i===n-1?"":"none";});}'
            'function draw(c,f){var x=c.getContext("2d");x.fillStyle="#c9c3ef";x.fillRect(0,0,640,300);x.fillStyle="#2f5cf5";'
            'x.beginPath();x.arc(320+Math.cos(f*6.2832)*200,150+Math.sin(f*6.2832)*90,40,0,7);x.fill();}'
            'var loops={};S.forEach(function(s,i){var c=s.querySelector("canvas.loop");if(!c)return;var p=parseFloat(s.dataset.period)||1;'
            'loops[i+1]={period:p,holder:c,rect:{x:192,y:640,w:640,h:300},seek:function(t){show(i+1);draw(c,(t%p)/p);'
            'return new Promise(function(r){requestAnimationFrame(function(){r();});});}};draw(c,0);});'
            'var st=parseInt(q.get("still")||"0",10);if(st){show(st);var sc=S[st-1]&&S[st-1].querySelector("canvas.loop");'
            'if(sc)draw(sc,.35);document.documentElement.setAttribute("data-aura-still-ready","1");}'
            'if(q.has("capture")){show(1);var C={slides:loops};C.ready=Promise.resolve(C);window.LumiCapture=C;}'
            '})();</script></body></html>')


def write_deck(items):
    deck, build = cwd / deck_rel, cwd / build_rel
    html_text = deck_html(title, items)
    for f in (build, deck):
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(html_text, encoding='utf-8', newline='\n')
    tool('Write', {'file_path': str(build), 'content': '<!doctype html>...'}, f'File created successfully at: {build}')
    tool('Bash', {'command': f'.aura/venv/Scripts/python.exe .aura/engine/tools/pack_deck.py .aura/temp/build/{slug}'
                             + (f' --out "{folder}" --replace' if folder else '')}, f'Packed: {deck_rel}')


# ---------------------------------------------------------------- v0.5 planning
def load_plan():
    try:
        return json.loads((cwd / folder / 'plan.json').read_text(encoding='utf-8'))
    except Exception:
        return {'slides': []}


def save_plan(plan):
    (cwd / folder).mkdir(parents=True, exist_ok=True)
    (cwd / folder / 'plan.json').write_text(json.dumps(plan, indent=2, ensure_ascii=False), encoding='utf-8')
    tool('Write', {'file_path': str(cwd / folder / 'plan.json'), 'content': '{...}'}, 'File written')


def v(main, comps=(), detail=None, motion=None, phrase=''):
    return {'main': main, 'companions': list(comps), 'detail': detail, 'motion': motion, 'phrase': phrase}


plan_marker = lambda: f'[[aura:plan path="{folder}/plan.json"]]'

# ---------------------------------------------------------------- the interview (interview batch 1)
# "[interview] ..." messages: ask a choice + a text question per round and end with [[aura:ask]]; after AURA_FAKE_INTERVIEW_ROUNDS
# rounds (or when the server's "you have enough to plan" nudge is in the message) write interview.json done:true and end with
# [[aura:interview-done]]. Triggers in the message: int-silent (says nothing Lumi can read), take-your-time (a long run).
if '[interview]' in message:
    mi = re.search(r'(\.aura/decks/[A-Za-z0-9_-]+)/interview\.json', message)
    ipath = cwd / (mi.group(1) if mi else folder or '.aura/decks/none') / 'interview.json'
    try: iv = json.loads(ipath.read_text(encoding='utf-8'))
    except Exception: iv = {}
    rnd = int(iv.get('round') or 1)
    nudged = 'enough to plan' in message
    say(f'[fake-interview] round={rnd} nudge={nudged} handoff={"taking over" in message} resume={bool(resume)} '
        f'added={"arrived" in message} answered={"answered your last" in message}')
    if trigger('take-your-time'):
        end = time.time() + float(os.environ.get('AURA_FAKE_LONG', '60'))
        while time.time() < end: time.sleep(0.5)
    if trigger('int-silent'):
        t = 'I have been thinking about your talk.'
        say(t); result(t); sys.exit(0)
    save_ctx(int(os.environ.get('AURA_FAKE_INTERVIEW_CTX', '8000')))
    if nudged or rnd >= int(os.environ.get('AURA_FAKE_INTERVIEW_ROUNDS', '3')):
        iv['conclusions'] = dict(iv.get('conclusions') or {}, audience='Examiners', duration='12 min')
        iv['identity'] = {'established': ['presenter'], 'presenters': ['Fake Presenter']}
        iv['done'] = True
        ipath.parent.mkdir(parents=True, exist_ok=True)
        ipath.write_text(json.dumps(iv, indent=2, ensure_ascii=False), encoding='utf-8')
        tool('Write', {'file_path': str(ipath), 'content': '{...}'}, 'File written')
        t = 'I know enough to plan this talk.\n[[aura:interview-done]]'
        say(t); result(t); sys.exit(0)
    t = (f'Thanks, that helps (round {rnd}).\n'
         f'[[aura:choice id="q{rnd}a" question="Who is in the room (round {rnd})?" options="Examiners|Classmates|Both" multi="no" default="Examiners"]]\n'
         f'[[aura:text id="q{rnd}b" question="What must they remember (round {rnd})?" placeholder="one sentence" lines="3"]]\n'
         '[[aura:ask]]')
    say(t); result(t); sys.exit(0)

if '[plan-mode]' in message and folder:
    if not resume:
        say('[[aura:stage=read]]\nHi! I’m reading your brief and your files once, then I’ll plan the slides.')
        tool('Read', {'file_path': str(cwd / '.aura' / 'brief' / 'brief.md')}, '# Presentation brief ...')
        tool('Read', {'file_path': str(cwd / '.claude' / 'skills' / 'aura-slide' / 'planning.md')}, '# Planning ...')
    if trigger('take-your-time'):
        end = time.time() + float(os.environ.get('AURA_FAKE_LONG', '60'))
        while time.time() < end: time.sleep(0.5)
    if trigger('plan-fail'):
        t = 'I could not read your files, sorry.'
        say(t); result(t); sys.exit(0)
    say('[[aura:stage=plan]]\nPlanning the talk slide by slide.')
    rows = [('Title', 'what the talk is about', v('text', ['quote'])),
            ('The problem', 'why it matters', v('photo', ['inset'])),
            ('Our idea', 'one simple idea', v('diagram', ['steps'])),
            ('How it works', 'the model, step by step', v('3d', ['labels', 'stats'], 'showpiece', 'timed', 'a cut-away model')),
            ('What we measured', 'the key numbers', v('chart', ['notes', 'labels'])),          # labels clash: the server drops it
            ('Results', 'the main result', v(['3d', 'chart'], [], 'detailed', 'still')),         # two mains: the server splits it
            ('Why it works', 'the physics in one line', v('diagram', ['steps'])),
            ('Limits', 'what it cannot do yet', v('text')),
            ('Next steps', 'what comes next', v('text', ['quote'])),
            ('Thank you', 'questions welcome', v('text'))]
    plan = {'version': 1, 'title': title, 'minutes': 10, 'slides': [
        {'id': f's{i}', 'title': (title if i == 1 else t), 'point': p, 'bullets': [f'{t} bullet one', f'{t} bullet two'],
         'visual': vis, 'sources': ['Report/report.pdf'] if i in (2, 5) else [], 'words': 12}
        for i, (t, p, vis) in enumerate(rows, 1)]}
    save_ctx(int(os.environ.get('AURA_FAKE_PLAN_CTX', '40000')))
    save_plan(plan)
    t = ('Here is a first plan: 10 slides. Two things I am not sure about.\n'
         '[[aura:choice id="q1" scope="deck" question="Who is in the room?" options="Examiners|Classmates|Both" multi="no" default="Examiners"]]\n'
         '[[aura:choice id="q2" slide="s3" question="Which idea should slide 3 lead with?" options="The cheap sensor|The app" multi="no" default="The cheap sensor"]]\n'
         + ('[[aura:choice id="q3" scope="deck" question="Which tone?" options="Formal|Friendly|Playful" multi="no" default="Formal"]]\n'
            '[[aura:choice id="q4" scope="deck" when="q3=1" question="Which formal style?" options="Academic|Corporate" multi="no" default="Academic" depends="q3"]]\n'
            '[[aura:choice id="q4" scope="deck" when="q3=Friendly" question="Which friendly style?" options="Warm|Casual" multi="no" default="Warm" depends="q3"]]\n'
            '[[aura:choice id="q4" scope="deck" when="q3=3" question="Which playful style?" options="Witty|Silly" multi="no" default="Witty" depends="q3"]]\n'
            if trigger('many-doubts') else '')
         + plan_marker())
    say(t); result(t); sys.exit(0)

if '[plan-edit]' in message and folder:
    if trigger('take-your-time'):
        end = time.time() + float(os.environ.get('AURA_FAKE_LONG', '60'))
        while time.time() < end: time.sleep(0.5)
    plan = load_plan()
    by = {s['id']: s for s in plan.get('slides') or []}
    m = re.search(r'Re-plan ONLY these slides: (.*?)\. Keep', message)
    targets = re.findall(r'\b([a-z0-9][a-z0-9-]*) \("', m.group(1)) if m else []
    sugg = re.findall(r'Fill in the empty slide ([a-z0-9-]+) ', message)
    lines = []
    for sid in targets:
        s = by.get(sid)
        if not s: continue
        if not s.get('point'): s['point'] = f'the point of {s.get("title") or "this slide"}'
        if len(s.get('bullets') or []) < 2: s['bullets'] = (s.get('bullets') or []) + ['a short fact', 'a second fact'][:2 - len(s.get('bullets') or [])]
        s['notes'] = 're-planned by the fake Claude'
        if 'neighbour' in (s.get('title') or '').lower():         # an edit that affects the next slide
            ids = [x['id'] for x in plan['slides']]
            nxt = by.get(ids[ids.index(sid) + 1]) if ids.index(sid) + 1 < len(ids) else None
            if nxt: nxt['point'] = (nxt.get('point') or '') + ' (now follows on from the slide before)'
        if 'doubt' in (s.get('title') or '').lower():
            lines.append(f'[[aura:choice id="q1" slide="{sid}" question="Should this slide show a photo or a chart?" options="A photo|A chart" multi="no" default="A photo"]]')
        else:
            lines.append(f'[[aura:plan-ok slide="{sid}"]]')
    for sid in sugg:
        s = by.get(sid)
        if not s: continue
        s.update(title='Suggested slide', point='a step the talk was missing', bullets=['first suggested fact', 'second suggested fact'],
                 visual=v('diagram', ['steps']))
        lines.append(f'[[aura:plan-ok slide="{sid}"]]')
    save_plan(plan)
    t = 'Done, I updated the plan.\n' + '\n'.join(lines + [plan_marker()])
    say(t); result(t); sys.exit(0)

# ---------------------------------------------------------------- Blender: a change request on a slide's preview (docs/blender-contract.md)
mc = re.search(r'\[blender-change slide=([a-z0-9-]+) n=(\d+)\]', message)
if mc and folder:
    scene = cwd / folder / 'blender' / mc.group(1) / 'scene.py'
    mt = re.search(r'wants this changed: "(.*?)"\n', message, re.S)
    want = mt.group(1) if mt else ''
    save_ctx(int(os.environ.get('AURA_FAKE_CTX_CHANGE', '30000')))
    if 'no-edit' in want or not scene.is_file():
        t = 'I looked at the scene and left it as it is.'
    else:
        extra = '\n# FAKE_FAIL\n' if 'make-it-fail' in want else ''
        body = scene.read_text(encoding='utf-8')
        if 'fast-again' in want: body = re.sub(r'#\s*FAKE_SLOW=[\d.]+', '', body)
        if 'render-slowly' in want: body += '\n# FAKE_SLOW=6\n'          # dev walks: a full render slow enough to watch and cancel
        scene.write_text(body + f'\n# change: {want[:80]}\n' + extra, encoding='utf-8')
        tool('Edit', {'file_path': str(scene), 'old_string': 'a', 'new_string': 'b'}, 'The file has been updated.')
        t = f'I changed the scene: {want[:80]}.'
    say(t); result(t); sys.exit(0)

# ---------------------------------------------------------------- v0.5 building one slide at a time
mb_handoff = '[context-handoff]' in FULL or '[context-recovery]' in FULL or SC
mb = re.search(r'\[build-slide id=([a-z0-9-]+) n=(\d+) of=(\d+)\]', message)
pend_key = session + ':pending'
if not mb and resume and folder and sessions.get(pend_key):         # an answer to a question asked during a build step
    p = sessions.pop(pend_key); save_memo()
    mb = re.match(r'\[build-slide id=([a-z0-9-]+) n=(\d+) of=(\d+)\]', p)
if mb and folder:
    sid, n, of = mb.group(1), int(mb.group(2)), int(mb.group(3))
    plan = load_plan()
    slides = plan.get('slides') or []
    target = next((s for s in slides if s['id'] == sid), {'title': 'Slide'})
    if 'ask-deep' in (target.get('title') or ''):
        stage = sessions.get(session + ':deep:' + sid, 0)
        if stage == 0:                                     # four real design questions before the slide
            sessions[pend_key] = mb.group(0); sessions[session + ':deep:' + sid] = 1; save_memo()
            t = (f'Before slide {n} I need four design decisions.\n'
                 '[[aura:choice id="q1" question="Which scene should the 3D figure show?" options="The whole scramjet in flight|A cut-open combustor|One fuel injector close-up" multi="no" default="A cut-open combustor"]]\n'
                 '[[aura:choice id="q2" question="Which headline fits best?" options="Pulses make the flame hold|Why the jet pulses|Fuel in, thrust out" multi="no" default="Why the jet pulses"]]\n'
                 '[[aura:choice id="q3" question="What should move?" options="Nothing, a still|A timed fuel pulse|Real simulation" multi="no" default="A timed fuel pulse"]]\n'
                 '[[aura:choice id="q4" question="Where does the figure sit?" options="Left, large|Right, large|Centred, small" multi="no" default="Right, large"]]\n[[aura:ask]]')
            say(t); result(t); sys.exit(0)
        if stage == 1:                                     # started the slide, then hit a genuine doubt
            sessions[pend_key] = mb.group(0); sessions[session + ':deep:' + sid] = 2; save_memo()
            say(f'[[aura:stage=build]]\nBuilding slide {n}: {target.get("title")}.')
            tool('Bash', {'command': 'node .aura/engine/tools/deck_check.js .aura/temp/build/' + slug}, 'OK: first render done')
            t = ('The first render looks flat at this angle.\n'
                 '[[aura:choice id="q1" question="Raise the camera or add a rim light?" options="Raise the camera|Add a rim light" multi="no" default="Add a rim light"]]\n[[aura:ask]]')
            say(t); result(t); sys.exit(0)
    if 'ask-seven' in (target.get('title') or '') and not sessions.get(session + ':seven:' + sid):
        sessions[pend_key] = mb.group(0); sessions[session + ':seven:' + sid] = True; save_memo()
        W = {1: 'Pulses|flame|hold', 2: 'jet|pulses|why', 3: 'Fuel|thrust|out'}
        C = {1: 'Side cut-away|Top-down', 2: 'Chase view|Front three-quarter', 3: 'Macro close-up|Back-lit side'}
        L = [f'I need seven design decisions for slide {n}.',
             f'[[aura:choice id="q1" slide="{n}" question="Which headline fits best?" options="Pulses make the flame hold|Why the jet pulses|Fuel in, thrust out" multi="no" default="Why the jet pulses"]]']
        for k in (1, 2, 3):
            hl = W[k].split('|')[0]
            L.append(f'[[aura:choice id="q2" slide="{n}" when="q1={k}" question="Which words should be highlighted?" options="{W[k]}" multi="yes" default="{hl}" depends="q1"]]')
        L.append(f'[[aura:choice id="q3" slide="{n}" question="Which 3D subject?" options="A cut-open combustor|The whole scramjet|One injector close-up" multi="no" default="A cut-open combustor"]]')
        for k in (1, 2, 3):
            L.append(f'[[aura:choice id="q4" slide="{n}" when="q3={k}" question="Which camera for this subject?" options="{C[k]}" multi="no" default="{C[k].split("|")[0]}"]]')
        L += [f'[[aura:choice id="q5" slide="{n}" question="What should move?" options="Nothing, a still|A timed fuel pulse|Real simulation" multi="no" default="A timed fuel pulse"]]',
              f'[[aura:choice id="q6" slide="{n}" question="Where does the figure sit?" options="Left, large|Right, large|Centred, small" multi="no" default="Right, large"]]',
              '[[aura:choice id="q7" slide="1" question="Which accent colour should the opening slide use?" options="Blue|Orange|Violet" multi="no" default="Blue"]]', '[[aura:ask]]']
        t = chr(10).join(L)
        say(t); result(t); sys.exit(0)
    if 'ask-me' in (target.get('title') or '') and not sessions.get(session + ':asked:' + sid):
        sessions[pend_key] = mb.group(0); sessions[session + ':asked:' + sid] = True; save_memo()
        t = ('Two quick questions before I build this slide.\n'
             f'[[aura:choice id="q1" question="Which real thing should the 3D picture show on slide {n}?" options="The whole vehicle in flight|A cut-open engine|A simple lab model" multi="no" default="The whole vehicle in flight"]]\n'
             f'[[aura:choice id="q2" question="How detailed should it be?" options="Simple|Detailed" multi="no" default="Detailed"]]\n[[aura:ask]]')
        say(t); result(t); sys.exit(0)
    # the slide's own title decides (a hand-off message also lists the OTHER slides, so the message itself is not a trigger)
    if 'take-your-time' in (target.get('title') or '') or (not mb_handoff and trigger('take-your-time')):
        end = time.time() + float(os.environ.get('AURA_FAKE_LONG', '60'))
        while time.time() < end: time.sleep(0.5)
    save_ctx(int(os.environ.get('AURA_FAKE_CTX_SLIDE', '100000')))
    say(f'[[aura:stage=build]]\nBuilding slide {n} of {of}: {target.get("title")}.')
    if n == 1: tool('Bash', {'command': f'node .aura/engine/tools/new_deck.js .aura/temp/build/{slug}'}, 'Deck shell ready')
    items = [((s.get('title') or f'Slide {i}'), (s.get('point') or ''), '', (s.get('visual') or {}).get('main') == '3d',
              f'Say this about {s.get("title") or "the slide"}.') for i, s in enumerate(slides[:n], 1)]
    write_deck(items)
    tool('Bash', {'command': 'node .aura/engine/tools/deck_check.js .aura/temp/build/' + slug}, f'OK: {n} slides, 0 problems')
    if os.environ.get('AURA_FAKE_LONG_HINTS') or 'long-hints' in (target.get('title') or ''):
        hl = ''.join(f'[[aura:hint slide={n} text="{x}"]]\n' for x in (
            'make the heading shorter and put the key number in the first line',
            'add a small animation that shows the flow of the hot gas through the engine',
            'use a bigger picture and move the three facts under it', 'switch the accent colour to orange for the key words only',
            'show the result as a bar chart next to the 3D picture'))
    else:
        hl = f'[[aura:hint slide={n} text="make the heading shorter"]]\n'
    ms = re.search(r'Write the scene to `([^`]+scene\.py)`', message)        # a Blender slide (BLENDER SLIDE block)
    ttl = target.get('title') or ''
    if ms and 'bl-noscene' not in ttl:
        sp = cwd / ms.group(1)
        sp.parent.mkdir(parents=True, exist_ok=True)
        flags = ''.join(f'# {d}\n' for k, d in (('bl-fail', 'FAKE_FAIL'), ('bl-gpu', 'FAKE_GPU_FAIL'), ('bl-slow', 'FAKE_SLOW=0.6')) if k in ttl)
        anim = 'L.loop(' in message
        sp.write_text('import math, os, sys\n# a fake lumi_bpy scene (fake_claude)\n' + flags +
                      ('# FAKE_FRAMES=3\n' if anim else '') + 'import lumi_bpy as L\na = L.args(); L.reset(a)\n' +
                      ('L.loop(0.15)\n' if anim else '') + 'L.render(a.out)\n', encoding='utf-8')
        tool('Write', {'file_path': str(sp), 'content': 'import lumi_bpy as L ...'}, f'File created successfully at: {sp}')
        mcmd = re.search(r'exactly: `(blender -b -P [^`]+)`', message)
        if mcmd: tool('Bash', {'command': mcmd.group(1)}, '[lumi] wrote check.png (8.1 s)')
    t = (f'Slide {n} is ready.\n{hl}'
         f'[[aura:built slide="{sid}"]]\n[[aura:done path="{deck_rel}"]]')
    say(t); result(t); sys.exit(0)

if resume or SC:
    say(f'Thanks, got it! Picking up where we left off (session {session[:8]}).')
else:
    say('[[aura:stage=read]]\nHi! I’m reading your brief and your files first.')
    tool('Read', {'file_path': str(cwd / '.aura' / 'brief' / 'brief.md')}, '# Presentation brief ...')
    tool('Bash', {'command': 'node --version', 'description': 'Check Node'}, 'v24.21.0')
    tool('Bash', {'command': 'python .aura/engine/tools/extract_text.py "3 - Put your files here/Report"'},
         'No report found in "Report". Using the brief only.', error=True)
    if trigger('ask-me'):
        q = ('Quick question before I start.\n'
             '[[aura:choice id="q1" question="Which look?" options="Bold Blue|Flat-Pack|Claude chooses"]]\n[[aura:ask]]')
        say(q); result(q); sys.exit(0)

if trigger('take-your-time'):
    say('[[aura:stage=plan]]\nThis one needs some careful thought, give me a moment.')
    end = time.time() + float(os.environ.get('AURA_FAKE_LONG', '60'))
    while time.time() < end:
        time.sleep(0.5)

say('[[aura:stage=plan]]\nPlanning 5 slides for your talk.')
tool('TodoWrite', {'todos': [{'content': 'Build slides', 'status': 'in_progress'}]}, 'ok')
say('[[aura:stage=build]]\nBuilding the slides now.')
write_deck([(title, 'A sample deck made by the fake Claude.', '', False, 'Welcome everyone.'),
            ('The problem', 'Why this matters, in one line.', ' class="fit"', False, 'Explain the problem.'),
            ('What we did', 'Method in three simple steps.', '', True, 'Walk through the model.'),
            ('Results', 'The numbers that matter.', '', False, 'Give the headline number.'),
            ('Thank you', 'Questions?', '', False, 'Invite questions.')])
if resume or SC:
    tool('Edit', {'file_path': str(cwd / build_rel), 'old_string': 'a', 'new_string': 'b'}, 'The file has been updated.')
say('[[aura:stage=check]]\nChecking every slide: all text is 26 px or larger.')
tool('Bash', {'command': 'node .aura/engine/tools/deck_check.js .aura/temp/build/' + slug}, 'OK: 5 slides, 0 problems')
if not folder:
    say('[[aura:stage=export]]\nMaking the PDF backup.')
    tool('Bash', {'command': 'node .aura/engine/tools/export_pdf.js "' + deck_rel + '"'}, 'PDF written')
final = (f'[[aura:stage=done]]\n[[aura:done path="{deck_rel}"]]\nYour slides are ready: 5 slides'
         + (', plus a PDF backup.' if not folder else '.') + '\n'
         '[[aura:hint slide=1 text="make the title shorter"]]\n'
         '[[aura:hint slide=3 text="add a simple diagram of the method"]]\n'
         '[[aura:hint slide=4 text="show the results as a bar chart"]]')
say(final)
result(final)
