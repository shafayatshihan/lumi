"""An update (the app's Update button = Lumi.exe --update = setup\\setup.ps1 -Json -NoLaunch over the install) must keep every
piece of the user's work and must replace Claude's project settings with the new release's.

Runs the REAL Step-Folder / Copy-OldFiles functions of setup/setup.ps1 (extracted with the PowerShell parser, no installs, no
network) over a fake v0.5.0 install that is mid-project: a deck record, its work folder (plan.json, packed deck), a build folder
with built slides, the brief, uploads and finished slides. Then checks byte for byte.
  python tools/form-dev/test_update_keep.py          (also run by test_server.py)"""
import hashlib, json, os, shutil, subprocess, sys, tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SETUP = REPO / 'setup' / 'setup.ps1'
NEW_SETTINGS = REPO / 'workspace' / '.claude' / 'settings.json'

HARNESS = r'''
$ErrorActionPreference = 'Stop'
$Root = $env:T_ROOT; $Aura = Join-Path $Root '.aura'; $Repo = $env:T_REPO; $SetupDir = Join-Path $Repo 'setup'; $Legacy = $null
function Log([string]$t) { }
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $SetupDir 'setup.ps1'), [ref]$null, [ref]$null)
$fns = $ast.FindAll({ param($a) $a -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                      @('Step-Folder', 'Copy-OldFiles') -contains $a.Name }, $true)
foreach ($f in $fns) { . ([scriptblock]::Create(($f.Extent.Text -replace '\$PSScriptRoot', '$SetupDir'))) }
if (@($fns).Count -ne 2) { throw 'setup.ps1 no longer has Step-Folder / Copy-OldFiles' }
Write-Output ('RESULT ' + (Step-Folder))
'''

USER_FILES = {
    '.aura/decks/abc123def456.json': '{"id": "abc123def456", "title": "Scramjet", "flow": "plan", "build": "scramjet-abc123"}',
    '.aura/decks/abc123def456/plan.json': '{"title": "Scramjet", "slides": [{"id": "s1", "built": true}, {"id": "s2"}]}',
    '.aura/decks/abc123def456/Scramjet.html': '<html>packed deck, slide 1 built</html>',
    '.aura/temp/build/scramjet-abc123/index.html': '<section class="slide">slide 1</section>',
    '.aura/temp/build/scramjet-abc123/assets/rig.jpg': 'JPEGDATA',
    '.aura/temp/build/scramjet-abc123/provenance.json': '{"claims": []}',
    '.aura/temp/text/Report/Report.docx.txt': 'extracted text',
    '.aura/temp/claude-events.jsonl': '{"i": 0}\n',
    '.aura/brief/brief.json': '{"basics": {"title": "Scramjet"}}',
    '.aura/brief/brief.md': '# Brief\n',
    '.aura/logs/server.log': 'log line\n',
    '.aura/venv/Scripts/python.exe': 'venv',
    '3 - Put your files here/Report/Report.docx': 'DOCX',
    '3 - Put your files here/Images and photos/photo 1.jpg': 'JPG',
    '4 - Your slides/Old deck.html': '<html>finished</html>',
    '4 - Your slides/Older versions/2026-09-01 Old deck.html': '<html>older</html>',
    '.claude/settings.local.json': '{"permissions": {"allow": ["Bash(echo:*)"]}}',
    '.aura/engine/node_modules/three/package.json': '{"name": "three"}',
    # the bundled Blender (docs/blender-contract.md section 12): an update must NEVER re-download or delete it
    '.aura/blender/blender.exe': 'MZ fake blender',
    '.aura/blender/lumi-blender.json': '{"version": "5.2.2", "sha256": "abc"}',
    '.aura/blender/COPYING-GPL-3.0.txt': 'GNU GENERAL PUBLIC LICENSE',
    '.aura/blender/BLENDER-SOURCE.txt': 'https://download.blender.org/source/',
    '.aura/blender/5.2/scripts/modules/bpy.py': '# bpy',
}


def sha(p):
    return hashlib.sha1(Path(p).read_bytes()).hexdigest()


def run(T=None):
    fails = []
    def check(name, ok, info=''):
        if T is not None and hasattr(T, 'check'): T.check(name, ok, info); return
        print(('  PASS ' if ok else '  FAIL ') + name + ('' if ok else f'   -> {info}'), flush=True)
        if not ok: fails.append(name)
    print('\n[update keeps the user\'s work and replaces the settings (real setup.ps1 Step-Folder)]')
    tmp = Path(tempfile.mkdtemp(prefix='lumi-update-'))
    try:
        root = tmp / 'Lumi'
        for rel, text in USER_FILES.items():
            p = root / rel; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(text, encoding='utf-8')
        # the v0.5.0 project files and an engine file that no longer exists in the new release
        old = subprocess.run(['git', 'show', '8f45933:workspace/.claude/settings.json'], cwd=str(REPO), capture_output=True, text=True)
        old_settings = old.stdout if old.returncode == 0 else '{"permissions": {"allow": ["Bash(node .aura/engine/tools/:*)"]}}'
        (root / '.claude').mkdir(exist_ok=True); (root / '.claude' / 'settings.json').write_text(old_settings, encoding='utf-8')
        (root / '.claude' / 'skills' / 'old-skill').mkdir(parents=True); (root / '.claude' / 'skills' / 'old-skill' / 'SKILL.md').write_text('old')
        (root / '.aura' / 'engine' / 'tools').mkdir(parents=True, exist_ok=True); (root / '.aura' / 'engine' / 'tools' / 'retired.js').write_text('old')
        before = {rel: sha(root / rel) for rel in USER_FILES}
        env = dict(os.environ, T_ROOT=str(root), T_REPO=str(REPO))
        r = subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', HARNESS], env=env,
                           capture_output=True, text=True, timeout=300)
        check('setup.ps1 Step-Folder ran over a mid-project install', r.returncode == 0 and 'RESULT ' in r.stdout, (r.stdout + r.stderr)[-500:])
        lost = [rel for rel in USER_FILES if not (root / rel).is_file() or sha(root / rel) != before[rel]]
        check('every user file is kept byte for byte (deck record, plan.json, packed deck, build folder, brief, uploads, '
              '4 - Your slides, venv, node_modules, settings.local.json)', not lost, lost)
        blost = [rel for rel in USER_FILES if rel.startswith('.aura/blender/')
                 and (not (root / rel).is_file() or sha(root / rel) != before[rel])]
        check('update_keep: the bundled Blender (.aura/blender) survives an update untouched - no re-download', not blost, blost)
        new = root / '.claude' / 'settings.json'
        check('the new release\'s settings.json replaces the old one', new.is_file() and sha(new) == sha(NEW_SETTINGS))
        s = json.loads(new.read_text(encoding='utf-8')) if new.is_file() else {}
        check('the updated settings carry the permission hook', 'PreToolUse' in (s.get('hooks') or {}))
        check('the updated engine has the permission gate', (root / '.aura' / 'engine' / 'rules' / 'permit.js').is_file())
        check('old engine files and old skills are removed (clean replace)', not (root / '.aura' / 'engine' / 'tools' / 'retired.js').exists()
              and not (root / '.claude' / 'skills' / 'old-skill').exists())
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return fails


if __name__ == '__main__':
    f = run()
    print(f'\n{"ALL PASSED" if not f else str(len(f)) + " FAILED"}')
    sys.exit(1 if f else 0)
