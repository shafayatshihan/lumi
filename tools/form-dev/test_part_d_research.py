"""Part D2: the research door is narrow. No network needed unless --live.
  python tools/form-dev/test_part_d_research.py [scratch folder] [--live]      (default scratch: X:\\aura-dev-d\\t_research)
Lays the tool out as an install (<scratch>/.aura/engine/tools/research.py) so its cache and net log land in the scratch
folder, never in the repo, and gives it a deck whose extracted text the query guard must protect."""
import os, shutil, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOOLS = HERE.parent.parent / 'engine' / 'tools'
args = [a for a in sys.argv[1:] if not a.startswith('--')]
LIVE = '--live' in sys.argv
root = Path(args[0] if args else r'X:\aura-dev-d\t_research')
bad = 0


def check(name, ok, info=None):
    global bad
    bad += not ok
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'   <- {info!r}'[:400]))


shutil.rmtree(root, ignore_errors=True)
t = root / '.aura' / 'engine' / 'tools'
(t / 'lib').mkdir(parents=True)
shutil.copy(TOOLS / 'research.py', t)
shutil.copy(TOOLS / 'lib' / 'lumi_net.py', t / 'lib')
deck = root / '.aura' / 'decks' / 'd1' / 'text' / 'Report'
deck.mkdir(parents=True)
(deck / 'thesis.pdf.txt').write_text('Numerical investigation of the thermo-hydraulic performance of plain and wavy fin geometries '
                                     'in a fin-and-tube rear door heat exchanger for AI server cooling. j rose by 12.4 %.', encoding='utf-8')
(root / '.aura' / 'decks' / 'd1' / 'interview.json').write_text(
    '{"identity": {"established": [{"field": "presenter", "value": "Ada Quillfeather"}, '
    '{"field": "department", "value": "Department of Mechanical Engineering, BUET"}]}}', encoding='utf-8')
log = root / '.aura' / 'temp' / 'net-log.txt'


def run(*a, env=None):
    e = dict(os.environ, **(env or {}))
    r = subprocess.run([sys.executable, str(t / 'research.py'), *a], capture_output=True, text=True, encoding='utf-8', env=e, timeout=90)
    return r.returncode, r.stdout + r.stderr


# ---- rule 2: the person's work never goes into a query (and nothing is sent when refused)
for q, why in [('thermo hydraulic performance of plain and wavy', 'copied from'),
               ('wavy fin j rose by 12.4 percent', 'measured values'),
               ('one two three four five six seven eight nine', 'at most 8 words'),
               ('quillfeather wavy fins', 'names the person'),
               ('BUET heat exchanger research', 'names the person')]:
    code, out = run('read', q)
    check(f'refused, nothing sent: "{q}"', code == 0 and 'not sent' in out and why in out and not log.exists(), out)

# ---- offline is normal; off is normal
code, out = run('read', 'rear door heat exchanger', env={'HTTPS_PROXY': 'http://127.0.0.1:9', 'https_proxy': 'http://127.0.0.1:9'})
check('offline: one plain line, exit 0', code == 0 and 'offline' in out and "files alone" in out, out)
check('... and the attempt is in the net log, whole', log.is_file() and 'GET https://en.wikipedia.org/' in log.read_text(encoding='utf-8'))
code, out = run('read', 'mechanical engineering heat exchanger', env={'HTTPS_PROXY': 'http://127.0.0.1:9', 'https_proxy': 'http://127.0.0.1:9'})
check('a generic word of the department ("engineering") is not a name: the query goes out', 'not sent' not in out and 'offline' in out, out)
code, out = run('read', 'rear door heat exchanger', env={'LUMI_RESEARCH': 'off'})
check('switched off: says so, exit 0', code == 0 and 'switched off' in out, out)
code, out = run('fetch', 'https://example.com')
check('there is no URL verb', code == 2, out)

# ---- rule 3: the policy itself
sys.path.insert(0, str(t / 'lib'))
import lumi_net as net                                                      # noqa: E402
H = ('en.wikipedia.org',)
for url in ('http://en.wikipedia.org/x', 'https://evil.example/x', 'https://en.wikipedia.org.evil.example/x',
            'https://user@en.wikipedia.org/x', 'https://en.wikipedia.org:8443/x'):
    try:
        net.check_url(url, H); ok = False
    except net.Refused:
        ok = True
    check(f'policy refuses {url}', ok)
check('GET only: no request body anywhere in lumi_net.py', 'data=' not in (t / 'lib' / 'lumi_net.py').read_text(encoding='utf-8'))
check('research.py has no argument that becomes a host', "HOSTS = (" in (t / 'research.py').read_text(encoding='utf-8'))

if LIVE:
    code, out = run('read', 'rear door heat exchanger')
    check('live: Wikipedia text arrives, fenced', 'web reading for UNDERSTANDING' in out and '## ' in out, out[:300])
    code, out = run('papers', 'wavy fin tube heat exchanger')
    check('live: papers come with a citation and a DOI', 'doi.org' in out and ' et al.' in out, out[:300])
    code, out = run('look', 'finned tube heat exchanger')
    pics = [ln.split()[1] for ln in out.splitlines() if ln.startswith('- ') and ln.split()[1].endswith('.jpg')]
    check('live: reference pictures arrive, small and marked', pics and all(Path(p).is_file() for p in pics), out[:300])
    code, out = run('read', 'rear door heat exchanger')
    check('live: a repeat is served from the cache', '(cached)' in out, out[:200])

print(f'{bad} FAILED' if bad else 'all passed')
sys.exit(1 if bad else 0)
