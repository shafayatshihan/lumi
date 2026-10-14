"""Choosing Node.js: the fixes behind "Node.js needs a hand".

That card was the most common first-run failure, and `node_exe()` being `shutil.which('node')` was why. Three
machines failed it while holding a perfectly good Node:

  1. a STALE ENVIRONMENT - the installer put Node on PATH, but Windows never pushes an environment change into a
     process that is already running, Explorer included;
  2. a PLACE PATH DOES NOT COVER - a non-admin winget install, nvm, fnm, scoop;
  3. THE WRONG NODE FIRST - an old Node 18 on PATH shadowing a newer one, after which `winget install` reports
     "already installed" and changes nothing.

These lock in the answers. They never touch the machine's real Node: `node_places` and `node_version_of` are
replaced, so the table below IS the machine under test.
"""
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / 'engine'))


def run(T):
    check = T.check
    import form_server as fs

    real_places, real_version = fs.node_places, fs.node_version_of

    def with_machine(table):
        """Pretend the machine holds exactly `table` ([(path, version|None)], PATH order)."""
        fs.node_places = lambda: [Path(p) for p, _ in table]
        fs.node_version_of = lambda q, d=dict(table): d[str(q)]
        fs._node_cache.update(at=0.0, exe=None, v=None)

    try:
        # 3. the wrong Node first: an old one on PATH must not shadow a good one beside it
        with_machine([(r'C:\old\node.exe', (18, 20, 4)), (r'C:\Program Files\nodejs\node.exe', (22, 11, 0))])
        check('an old Node on PATH does not shadow a newer one installed beside it',
              fs.node_exe() == r'C:\Program Files\nodejs\node.exe', fs.node_exe())
        check('...and the health check passes', fs.check_node()['ok'] is True, fs.check_node())

        # the floor itself, both sides of it
        with_machine([(r'C:\n\node.exe', (20, 19, 0))])
        check('v20.19.0 is on the right side of the floor', fs.check_node()['ok'] is True, fs.check_node())
        with_machine([(r'C:\n\node.exe', (20, 18, 9))])
        c = fs.check_node()
        check('v20.18.9 is not', c['ok'] is False, c)
        check('...and the message names the version the person actually has',
              'v20.18.9' in c['detail'], c['detail'])

        # the newest wins, not the first
        with_machine([(r'C:\a\node.exe', (22, 1, 0)), (r'C:\b\node.exe', (24, 4, 0))])
        check('the newest Node wins, not the first on PATH', fs.node_exe() == r'C:\b\node.exe', fs.node_exe())

        # a binary that will not run is skipped when there is a working one...
        with_machine([(r'C:\broken\node.exe', None), (r'C:\good\node.exe', (22, 5, 0))])
        check('a node.exe that will not run is passed over', fs.node_exe() == r'C:\good\node.exe', fs.node_exe())

        # ...but is still handed back when it is all there is. Being unable to READ a version is not evidence that
        # Node is missing, and "Node.js is missing" sends someone to install what they already have. This is also
        # what stops a slow machine under load from reporting no Node at all.
        with_machine([(r'C:\slow\node.exe', None)])
        check('a node.exe whose version cannot be read is still returned',
              fs.node_exe() == r'C:\slow\node.exe', fs.node_exe())
        c = fs.check_node()
        check('...and it is reported as not working, never as missing',
              c['ok'] is False and 'missing' not in c['label'].lower(), c)

        # genuinely nothing
        with_machine([])
        check('an empty machine does report Node missing', fs.node_exe() is None and fs.check_node()['ok'] is False)

        # 1 + 2. the stale environment: PATH gives nothing, the file is on disk anyway
        fs.node_places = lambda: [Path(r'C:\Program Files\nodejs\node.exe')]
        fs.node_version_of = lambda q: (22, 11, 0)
        fs._node_cache.update(at=0.0, exe=None, v=None)
        check('Node off PATH but on disk is still found (the stale-environment case)',
              fs.node_exe() == r'C:\Program Files\nodejs\node.exe', fs.node_exe())

        # children must get the SAME Node, or a hook running bare `node` picks the one we rejected
        env = fs.child_env()
        key = next((k for k in env if k.upper() == 'PATH'), 'PATH')
        check('child_env puts the chosen Node first on the child PATH',
              (env.get(key) or '').split(';')[0] == r'C:\Program Files\nodejs', (env.get(key) or '')[:80])

        # child_env runs on EVERY spawn. Resolving there once put a `node --version` in front of every subprocess
        # Lumi makes - F-05 caught it by counting spawns, which is the only reason it was noticed. It must read the
        # cache and nothing else, warm or cold.
        spawned, real_run = [], fs.subprocess.run
        fs.subprocess.run = lambda cmd, *a, **k: spawned.append(cmd)
        try:
            fs._node_cache.update(at=0.0, exe=None, v=None)
            fs.child_env()
            check('child_env spawns nothing on a cold cache', not spawned, spawned)
            fs._node_cache.update(at=9e9, exe=r'C:\Program Files\nodejs\node.exe', v=(22, 11, 0))
            fs.child_env()
            check('child_env spawns nothing on a warm cache either', not spawned, spawned)
        finally:
            fs.subprocess.run = real_run
    finally:
        fs.node_places, fs.node_version_of = real_places, real_version
        fs._node_cache.update(at=0.0, exe=None, v=None)
