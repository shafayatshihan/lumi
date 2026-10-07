"""Permission tests: can Claude inside Lumi run Lumi's own toolkit WITHOUT an approval prompt, and only that?

Why: Lumi runs Claude headless (`claude -p`), where every command that needs approval is simply refused. v0.5.0 shipped
`Bash(node .aura/engine/tools/:*)`-style rules that never match (a `:*` prefix must end on a word boundary), so the user's
first slide could not be built. Measured with the real `claude -p` (2.1.x, FIXLOG "## Permission fix"):
  * `Bash(node .aura/engine/tools/new_deck.js:*)` (one script) and `Bash(node .aura/engine/tools/*)` (a glob) match;
    `Bash(node .aura/engine/tools/:*)` never does; PowerShell rules behave the same; `\\` and `/` spellings are different rules.
  * a PreToolUse hook's "allow" lets compound commands (`;`, `&&`, `|`, `cd X && ...`) through in headless mode;
    settings deny rules still win over it; PowerShell refuses file redirection (`>`) whatever the hook says.

  python tools/form-dev/test_permissions_real.py            unit tests, no Claude needed (also run by test_server.py)
  python tools/form-dev/test_permissions_real.py --real     + real `claude -p --model haiku` probes against the SHIPPED
                                                            workspace/.claude/settings.json (publish.ps1 requires this)
"""
import json, os, re, shutil, subprocess, sys, tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ENGINE = REPO / 'engine'
SETTINGS = REPO / 'workspace' / '.claude' / 'settings.json'
NODE = shutil.which('node.exe') or shutil.which('node')

# ---------------------------------------------------------------------------------------------------------------- corpus
# {W} = the install as C:\Lumi, {M} = C:/Lumi, {U} = /c/Lumi (Git Bash). Taken from real Lumi transcripts (C:\Lumi and the
# X:\aura-dev-* sandboxes); the first block are the exact commands v0.5.0 refused.
A, D, N = 'allow', 'deny', 'defer'
CASES = [
    # --- refused by v0.5.0 (transcript 6b0cc786 and the aura-dev-real / aura-dev-take runs): must now be allowed
    ('Bash', 'node .aura/engine/tools/new_deck.js --snippet list', A),
    ('Bash', 'node .aura/engine/tools/new_deck.js "Shock-Induced Hydrogen Mixing in a Dual Parabolic-Cavity Scramjet" --theme bold-blue', A),
    ('Bash', 'node .aura/engine/tools/new_deck.js --snippet title-hero --slide 1 | head -300; ls .aura/engine/deck/looks/bold-blue/ .aura/temp/build 2>&1', A),
    ('PowerShell', 'node .aura/engine/tools/new_deck.js --snippet title-hero --slide 1', A),
    ('PowerShell', '.aura/venv/Scripts/python.exe .aura/engine/tools/extract_text.py', A),
    ('PowerShell', '& "{W}\\.aura\\venv\\Scripts\\python.exe" "{W}\\.aura\\engine\\tools\\extract_text.py"', A),
    ('PowerShell', '{W}\\.aura\\venv\\Scripts\\python.exe {W}\\.aura\\engine\\tools\\extract_text.py', A),
    ('PowerShell', '& ".\\.aura\\venv\\Scripts\\python.exe" ".\\.aura\\engine\\tools\\extract_text.py"', A),
    ('PowerShell', '& ".\\.aura\\venv\\Scripts\\python.exe" ".\\.aura\\engine\\tools\\extract_text.py"; Get-ChildItem .aura\\temp\\text -Recurse | Select-Object FullName,Length', A),
    ('PowerShell', '.\\.aura\\venv\\Scripts\\python.exe .\\.aura\\engine\\tools\\extract_text.py', A),
    ('PowerShell', 'Get-ChildItem -Recurse -File "{W}\\3 - Put your files here" | Select-Object FullName,Length | Format-Table -AutoSize | Out-String -Width 250; & "{W}\\.aura\\venv\\Scripts\\python.exe" "{W}\\.aura\\engine\\tools\\extract_text.py"', A),
    ('PowerShell', 'node .aura/engine/tools/new_deck.js --snippet what-it-is --slide 3 | Select-Object -First 40; node .aura/engine/tools/new_deck.js --snippet process-film --slide 4 | Select-String -Pattern "Aura.sync|cap|simulation"', A),
    ('Bash', 'ls .aura/engine/deck/themes; node .aura/engine/tools/new_deck.js "Why heat pipes work" --theme bold-blue 2>&1 | tail -5', A),
    ('Bash', 'cat .aura/engine/deck/themes/bold-blue.css | head -80', A),
    ('Bash', 'cd {U}/.aura/temp/build/closed-loop-pulsating-heat-pipe && cat index.html; cp "{U}/3 - Put your files here/Images and photos/photo_2026-09-16_03-48-07.jpg" assets/rig.jpg; ls assets', A),
    # --- other real spellings that ran (must stay allowed)
    ('PowerShell', 'node {W}\\.aura\\engine\\tools\\new_deck.js --snippet list', A),
    ('PowerShell', 'node {W}\\.aura\\engine\\tools\\new_deck.js "Pulsating jets in a scramjet combustor" --theme bold-blue', A),
    ('PowerShell', 'node {W}\\.aura\\engine\\tools\\new_deck.js --ids {W}\\.aura\\temp\\build\\pulsating-jets; node {W}\\.aura\\engine\\tools\\deck_check.js {W}\\.aura\\temp\\build\\pulsating-jets --notes', A),
    ('PowerShell', 'python {W}\\.aura\\engine\\tools\\pack_deck.py {W}\\.aura\\temp\\build\\pulsating-jets --title "Pulsating jets" --out {W}\\.aura\\decks\\a54236b61bf6 --replace', A),
    ('PowerShell', '.aura/venv/Scripts/python.exe .aura/engine/tools/pack_deck.py .aura/temp/build/pulsating-hydrogen-jets --title "Pulsating hydrogen jets" --out ".aura/decks/472e46f2f44a" --replace', A),
    ('PowerShell', 'Write-Output "[[aura:stage=read]]"; Get-ChildItem -Recurse "{W}\\3 - Put your files here" | Select-Object FullName,Length; .aura/venv/Scripts/python.exe .aura/engine/tools/extract_text.py', A),
    ('PowerShell', 'Set-Location {W}; & ".\\.aura\\venv\\Scripts\\python.exe" ".\\.aura\\engine\\tools\\extract_text.py"; Get-ChildItem .aura\\temp\\text -Recurse | Select-Object FullName', A),
    ('PowerShell', 'New-Item -ItemType Directory -Force {W}\\.aura\\temp\\build\\pulsating-jets\\assets; Copy-Item {W}\\.aura\\temp\\fig6_crop.png {W}\\.aura\\temp\\build\\pulsating-jets\\assets\\fig6.png', A),
    ('PowerShell', "Copy-Item -LiteralPath '{W}\\3 - Put your files here\\Report\\Report.docx' -Destination '{W}\\.aura\\temp\\report.zip'", A),
    ('PowerShell', 'Get-ChildItem {W}\\.aura\\engine\\deck -Recurse -File | Select-Object FullName,Length | Format-Table -AutoSize | Out-String -Width 200', A),
    ('PowerShell', 'node .aura\\engine\\tools\\deck_check.js .aura\\temp\\build\\x --notes', A),
    ('PowerShell', '& .aura/venv/Scripts/python.exe .aura/engine/tools/pack_deck.py .aura/temp/build/x --title "X"', A),
    ('PowerShell', 'New-Item -ItemType Directory -Force -Path {W}\\.aura\\temp\\report_x | Out-Null', A),
    ('PowerShell', 'node .aura/engine/tools/deck_check.js .aura/temp/build/x 2>&1 | Select-Object -Last 20', A),
    ('Bash', 'cat .aura/brief/brief.md; ls -R "3 - Put your files here" | head -50', A),
    ('Bash', '[[ 1 ]]; echo "[[aura:stage=read]]" >/dev/null; .aura/venv/Scripts/python.exe .aura/engine/tools/extract_text.py 2>&1 | tail -5; ls .aura/temp/text; head -c 1500 "3 - Put your files here/Data (csv, excel, graphs)/RawLog.csv"', A),
    ('Bash', 'ls .aura/temp/text/Report/*.images; cat .claude/skills/aura-slide/brands/bold-blue/brand-style.md 2>/dev/null | head -60; ls .aura/engine/deck/themes', A),
    ('Bash', 'cp "{M}/3 - Put your files here/Images and photos/photo.jpg" {M}/.aura/temp/build/closed-loop/assets/rig.jpg', A),
    ('Bash', 'grep -n "safe" .aura/engine/deck/runtime.css | head; ls .aura/temp/text/Report/*.images | head -0', A),
    ('Bash', 'node .aura/engine/tools/new_deck.js --ids .aura/temp/build/closed-loop && node .aura/engine/tools/deck_check.js .aura/temp/build/closed-loop 2>&1 | tail -60', A),
    ('Bash', 'node .aura/engine/tools/deck_check.js .aura/temp/build/closed-loop 2>&1 | tail -3 && .aura/venv/Scripts/python.exe .aura/engine/tools/pack_deck.py .aura/temp/build/closed-loop --title "Closed Loop" --out ".aura/decks/abc123" --replace 2>&1 | tail -4', A),
    ('Bash', 'find "3 - Put your files here" -type f | head -50', A),
    ('Bash', 'node .aura/engine/tools/export_pdf.js "4 - Your slides/Why heat pipes work.html" 2>&1 | tail -3', A),
    ('Bash', './.aura/venv/Scripts/python.exe ./.aura/engine/tools/extract_text.py', A),
    ('Bash', '{U}/.aura/venv/Scripts/python.exe {U}/.aura/engine/tools/extract_text.py 2>&1 | tail -3', A),
    ('Bash', 'node "{M}/.aura/engine/tools/deck_check.js" "{M}/.aura/temp/build/x" --no-shots', A),
    ('Bash', 'cd .aura/temp/build/x && node ../../../engine/tools/deck_check.js . 2>&1 | tail -5', A),
    ('Bash', 'mkdir -p .aura/temp/build/x/assets && cp "3 - Put your files here/Images and photos/a.png" .aura/temp/build/x/assets/', A),
    ('Bash', 'node .aura/engine/rules/check_rules.js .aura/temp/build/x/index.html', A),
    ('Bash', 'node --version', A),
    # --- general code execution / outside the toolkit: no allow (headless = refused)
    ('Bash', 'node -e "console.log(1)"', N),
    ('PowerShell', 'node -e "console.log(1)"', N),
    ('Bash', ".aura/venv/Scripts/python.exe -c \"import csv; print(1)\"", N),
    ('PowerShell', 'python {W}\\.aura\\temp\\extract_imgs.py', N),
    ('PowerShell', 'node {W}\\.aura\\temp\\docx_text.js "{W}\\3 - Put your files here\\Report\\Report.docx"', N),
    ('Bash', 'node .aura/engine/tools/../../temp/evil.js', N),
    ('Bash', "cd {U}/.aura/temp/build/x && python3 - <<'EOF'\nprint(1)\nEOF", N),
    ('Bash', "cd {U}/.aura/temp/build/x && sed -i 's/a/b/' index.html", N),
    ('PowerShell', "Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead('{W}\\a.docx')", D),
    ('PowerShell', "$f='{W}\\.aura\\temp\\build\\x\\index.html'; $c=Get-Content -LiteralPath $f -Raw", N),
    ('PowerShell', 'tar -xf "{W}\\3 - Put your files here\\Report\\Report.docx" -C "{W}\\.aura\\temp" word', N),
    ('PowerShell', 'node {W}\\.aura\\temp\\docx_text.js "{W}\\x.docx" > {W}\\.aura\\temp\\report.txt', N),
    ('Bash', 'cat /etc/passwd', N),
    ('Bash', 'cat .env', N),
    ('PowerShell', 'Get-Content C:\\Windows\\win.ini', N),
    ('Bash', 'cp .aura/temp/a.png /c/Users/Public/a.png', N),
    ('Bash', 'node .aura/engine/tools/deck_check.js x; echo $(whoami)', N),
    ('PowerShell', 'Get-ChildItem | Where-Object { $_.Length -gt 0 }', N),
    ('Bash', 'C:\\Python\\python.exe .aura/engine/tools/pack_deck.py x', N),
    ('Bash', 'cd /c/Windows && ls', N),
    # --- destructive / network / protected: deny with a reason
    ('Bash', 'rm .aura/temp/build/x/old.png', D),
    ('Bash', 'node .aura/engine/tools/deck_check.js x && rm -rf .aura/temp', D),
    ('PowerShell', 'Remove-Item .aura\\temp\\x -Recurse -Force', D),
    ('PowerShell', 'ri .aura\\temp\\x', D),
    ('Bash', 'git status', D),
    ('PowerShell', 'git log', D),
    ('Bash', 'curl https://example.com -o x.html', D),
    ('PowerShell', 'Invoke-WebRequest https://example.com -OutFile x.html', D),
    ('PowerShell', 'iwr https://example.com', D),
    ('PowerShell', 'Invoke-Expression "Get-ChildItem"', D),
    ('PowerShell', 'iex (Get-Content x.ps1 -Raw)', D),
    ('Bash', 'pip install requests', D),
    ('PowerShell', '.aura/venv/Scripts/python.exe -m pip install requests', D),
    ('Bash', 'npx vite build', D),
    ('PowerShell', 'powershell -Command "Remove-Item x"', D),
    ('Bash', 'bash -c "rm x"', D),
    ('Bash', 'cp .aura/temp/evil.js .aura/engine/tools/deck_check.js', D),
    ('PowerShell', 'Copy-Item .aura\\temp\\evil.js .aura\\engine\\rules\\permit.js', D),
    ('Bash', 'mv .aura/engine/rules/hard-rules.json .aura/temp/', D),
    ('PowerShell', 'Set-Content .claude\\settings.json "{}"', D),
    ('Bash', 'echo {} > .claude/settings.json', D),
    ('Bash', 'mkdir .aura/engine/extra', D),
    ('Bash', "sed -i 's/26/12/' .aura/engine/rules/hard-rules.json", D),
    ('PowerShell', 'Start-Process notepad', D),
    ('PowerShell', 'Stop-Process -Name node', D),
    # --- Blender (docs/blender-contract.md section 11): every spelling of the ONE allowed form, everything else denied
    ('Bash', 'blender -b -P .aura/decks/abc/blender/s1/scene.py -- --out .aura/decks/abc/blender/s1/scratch/check.png --preview', A),
    ('PowerShell', 'blender -b -P .aura/decks/abc/blender/s1/scene.py -- --out .aura/decks/abc/blender/s1/scratch/check.png --preview', A),
    ('Bash', 'blender.exe -b -P .aura/decks/abc/blender/s1/scene.py -- --out .aura/decks/abc/blender/s1/scratch/check.png --res 30 --samples 16', A),
    ('PowerShell', 'blender.exe -b -P .aura\\decks\\abc\\blender\\s1\\scene.py -- --out .aura\\decks\\abc\\blender\\s1\\scratch\\check.png --preview', A),
    ('PowerShell', '& "{W}\\.aura\\blender\\blender.exe" -b -P "{W}\\.aura\\decks\\abc\\blender\\s1\\scene.py" -- --out "{W}\\.aura\\decks\\abc\\blender\\s1\\scratch\\check.png" --preview', A),
    ('PowerShell', '& "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" -b -P .aura\\decks\\abc\\blender\\s1\\scene.py -- --out .aura\\decks\\abc\\blender\\s1\\scratch\\check.png --preview', A),
    ('PowerShell', '"C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" -b -P .aura/decks/abc/blender/s1/scene.py -- --out .aura/decks/abc/blender/s1/scratch/c.png', A),
    ('Bash', '"/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P .aura/decks/abc/blender/s1/scene.py -- --out .aura/decks/abc/blender/s1/scratch/check.png', A),
    ('Bash', '"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P {M}/.aura/temp/scratch/t.py -- --out={M}/.aura/temp/scratch/t.png', A),
    ('Bash', '.aura/blender/blender.exe -b -P .aura/temp/x/scene.py -- --out .aura/temp/x/a.png --height 720 --anim --cpu', A),
    ('Bash', '{U}/.aura/blender/blender.exe --background --python {U}/.aura/decks/abc/blender/s1/scene.py -- --out {U}/.aura/decks/abc/blender/s1/scratch/c.png', A),
    ('Bash', 'blender --version', A),
    ('Bash', 'cat .aura/decks/abc/blender/s1/scene.py | head -40', A),
    ('Bash', 'blender -b --python-expr "import os; os.remove(1)"', D),
    ('PowerShell', 'blender -b --python-expr "print(1)"', D),
    ('Bash', 'blender -b -P /c/Users/Public/evil.py', D),
    ('Bash', 'blender -b -P .aura/engine/deck/blender/bench_scene.py -- --out .aura/temp/b.png', D),
    ('Bash', 'blender -P .aura/decks/abc/blender/s1/scene.py -b', D),
    ('Bash', 'blender -b .aura/decks/abc/x.blend -P .aura/decks/abc/blender/s1/scene.py', D),
    ('Bash', 'blender -b -P .aura/decks/abc/blender/s1/scene.py -- --out /c/Users/Public/out.png', D),
    ('Bash', 'blender -b -P .aura/decks/abc/blender/s1/scene.py -- --out .aura/decks/abc/blender/s1/scratch/check.png 2>&1 | grep lumi', D),
    ('Bash', 'cd .aura/decks/abc && blender -b -P blender/s1/scene.py', D),
    ('Bash', 'blender -b -P .aura/decks/abc/blender/s1/scene.py > .aura/temp/log.txt', D),
    ('Bash', 'blender -b -P .aura/decks/abc/blender/s1/scene.py &', D),
    ('Bash', 'echo $(blender -b -P .aura/decks/abc/blender/s1/scene.py)', D),
    ('PowerShell', '& "C:\\Users\\Public\\blender.exe" -b -P .aura\\decks\\abc\\blender\\s1\\scene.py', D),
    ('Bash', '/c/Users/Public/tools/blender -b -P .aura/decks/abc/blender/s1/scene.py', D),
    ('Bash', 'cp .aura/temp/evil.py .aura/blender/5.2/scripts/startup/evil.py', D),
    # --- batch 4: the BUNDLED copy the installer puts in .aura\blender, in the spellings it makes possible
    ('Bash', '.aura/blender/blender.exe --version', A),
    ('PowerShell', '& "{W}\\.aura\\blender\\blender.exe" --version', A),
    ('PowerShell', '{W}\\.aura\\blender\\blender.exe -b -P {W}\\.aura\\decks\\abc\\blender\\s1\\scene.py -- --out {W}\\.aura\\decks\\abc\\blender\\s1\\scratch\\c.png --preview', A),
    ('Bash', '{U}/.aura/blender/blender.exe -b --factory-startup --python-exit-code 1 -P .aura/temp/x/scene.py -- --out .aura/temp/x/a.png', A),
    ('Bash', './.aura/blender/blender.exe -b -P .aura/decks/abc/blender/s1/scene.py -- --out .aura/decks/abc/blender/s1/scratch/c.png', A),
    ('Bash', 'cat .aura/blender/BLENDER-SOURCE.txt', A),
    ('Bash', 'cat .aura/blender/lumi-blender.json', A),
    ('PowerShell', 'Get-Content {W}\\.aura\\blender\\COPYING-GPL-3.0.txt -TotalCount 5', A),
    ('Bash', 'echo broken > .aura/blender/lumi-blender.json', D),
    ('PowerShell', 'Set-Content {W}\\.aura\\blender\\lumi-blender.json "x"', D),
    ('Bash', 'rm -rf .aura/blender', D),
    ('PowerShell', 'Remove-Item {W}\\.aura\\blender -Recurse -Force', D),
    ('Bash', 'curl -L https://download.blender.org/release/Blender5.2/blender-5.2.2-windows-x64.zip -o .aura/temp/b.zip', D),
    ('Bash', 'mv .aura/temp/x.exe .aura/blender/blender.exe', D),
    ('Bash', '.aura/blender/blender.exe -b --python-expr "print(1)"', D),
    # --- batch 5, from the real end-to-end run: a FOLDER called blender is not Blender running. Every deck has
    # .aura/decks/<id>/blender/<sid>, and an ordinary line that mentioned it came back with the Blender refusal
    # ("Blender cannot run inside $(...)"), which said nothing about the real line and cost Claude a round trip.
    ('Bash', 'cd {M} && ls "3 - Put your files here" 2>/dev/null | head; mkdir -p .aura/decks/abc/blender', A),
    ('Bash', 'mkdir -p .aura/decks/abc/blender/s1/scratch && ls .aura/decks/abc/blender', A),
    ('Bash', 'ls -la .aura/decks/abc/blender | head', A),
    ('Bash', 'cat .aura/decks/abc/blender/s1/scene.py | head -40', A),
    ('Bash', 'blender -b -P .aura/decks/abc/blender/s1/scene.py -- --inspect', A),   # Part A's text check, used in the real run
    # --- post-mortem problem 10 (deck b45622aef312, permissions.log Oct 6): 10 deferrals in four shapes. `< file` only
    # READS a file, and tr / tac / rev / fold / base64 are pure text filters that write nothing, so both are allowed
    # inside the Lumi folder now. The other shapes are arbitrary code and stay refused ON PURPOSE; building.md names
    # them with the way round each. The exact lines from that log are below, allowed and refused.
    ('Bash', "cd {M}/.aura/temp/text && tr -s ' \\n' ' ' < w.txt | grep -o -i 'central' | head -8", A),
    ('Bash', "tr -s ' \\n' ' ' < .aura/temp/text/w.txt", A),
    ('Bash', 'cat < .aura/temp/text/w.txt | head -20', A),
    ('Bash', 'tac .aura/temp/text/w.txt | head -5', A),
    ('Bash', 'rev .aura/temp/text/w.txt', A),
    ('Bash', 'fold -w 100 .aura/temp/text/w.txt | head', A),
    ('Bash', 'sha256sum .aura/temp/text/w.txt', A),
    ('Bash', 'base64 .aura/temp/text/w.txt | head -2', A),
    ('Bash', 'cat < /etc/passwd', N),                                # outside the install: still no allow
    ('Bash', 'tr a b < .aura/temp/text/w.txt > .aura/engine/tools/x.js', D),   # what it WRITES still decides it
    ('Bash', ".aura/venv/Scripts/python.exe - <<'EOF'", N),          # a heredoc is a program, not a file
    ('Bash', 'cat <(ls)', N),                                        # process substitution is a nested shell
    ('Bash', 'node .aura/temp/check/s7_chart.js', N),                # a script Claude wrote: only .aura/engine/tools runs
    ('PowerShell', 'node .aura/temp/check/s7_chart.js', N),
    ('Bash', '{M}/.aura/venv/Scripts/python.exe -c "import re;print(1)"', N),
    ('PowerShell', 'New-Object System.Text.UTF8Encoding $false', N),
]


def make_install(base, venv=False):
    """A throwaway Lumi folder shaped like a client install: real .aura/engine (tools + rules copied), venv python, user folders."""
    root = Path(base) / 'Lumi'
    for d in ['.aura/temp/build/x/assets', '.aura/temp/text', '.aura/decks', '.aura/brief', '.aura/logs', '.aura/venv/Scripts',
              '3 - Put your files here/Report', '3 - Put your files here/Images and photos', '4 - Your slides']:
        (root / d).mkdir(parents=True, exist_ok=True)
    for sub in ('tools', 'rules'):
        shutil.copytree(ENGINE / sub, root / '.aura' / 'engine' / sub, dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns('__pycache__', 'node_modules'))
    shutil.copytree(ENGINE / 'deck', root / '.aura' / 'engine' / 'deck', dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns('__pycache__', 'node_modules', '*.glb', '*.hdr', '*.mp4', 'fonts'))
    shutil.copytree(REPO / 'workspace' / '.claude', root / '.claude', dirs_exist_ok=True)
    (root / '.aura' / 'brief' / 'brief.md').write_text('# brief\n', encoding='utf-8')
    (root / '.aura' / 'temp' / 'probe.txt').write_text('probe\n', encoding='utf-8')
    if venv:
        subprocess.run([sys.executable, '-m', 'venv', '--without-pip', str(root / '.aura' / 'venv')], check=True, capture_output=True)
    else:
        (root / '.aura' / 'venv' / 'Scripts' / 'python.exe').write_bytes(b'')
    return root


def fill(cmd, root):
    w = str(root)
    return cmd.replace('{W}', w).replace('{M}', w.replace('\\', '/')).replace('{U}', '/' + w[0].lower() + w[2:].replace('\\', '/'))


def decide_all(root, items):
    """Run engine/rules/permit.js decide() over [(tool, command)] in one node process."""
    code = ("const p=require(process.argv[1]);let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);"
            "process.stdout.write(JSON.stringify(j.items.map(([t,c])=>p.decide(t,c,{root:j.root,cwd:j.root}))));});")
    r = subprocess.run([NODE, '-e', code, str(root / '.aura' / 'engine' / 'rules' / 'permit.js')], input=json.dumps(
        {'root': str(root), 'items': items}), capture_output=True, text=True, encoding='utf-8', timeout=60)
    if r.returncode: raise RuntimeError(r.stderr)
    return json.loads(r.stdout)


def hook_command(name):
    s = json.loads(SETTINGS.read_text(encoding='utf-8'))
    for h in s['hooks'][name]:
        for x in h['hooks']: return h.get('matcher'), x['command']


def run_unit(check):
    tmp = Path(tempfile.mkdtemp(prefix='lumi-perm-'))
    try:
        root = make_install(tmp)
        items = [(t, fill(c, root)) for t, c, _ in CASES]
        got = decide_all(root, items)
        bad = []
        for (t, c, want), r in zip(CASES, got):
            have = r['decision'] or 'defer'
            if have != want: bad.append(f'{t}: {c[:90]!r} -> {have} ({r["reason"][:80]}), want {want}')
        check(f'permit.js: {len(CASES)} real command spellings decided as expected', not bad, '\n      '.join([''] + bad[:20]))
        check('permit.js: every deny carries a reason Claude can act on',
              all(len(r['reason']) > 30 for (_, _, w), r in zip(CASES, got) if w == D))

        # the exact hook command string from the shipped settings.json, run from a SUB-folder (Claude may have cd'ed)
        matcher, cmd = hook_command('PreToolUse')
        check('settings: PreToolUse hook covers Bash and PowerShell', set((matcher or '').split('|')) >= {'Bash', 'PowerShell'}, matcher)
        env = dict(os.environ, CLAUDE_PROJECT_DIR=str(root))
        sub = root / '.aura' / 'temp' / 'build' / 'x'
        def hook(tool, command, cwd):
            r = subprocess.run(cmd, shell=True, cwd=str(cwd), env=env, capture_output=True, text=True, encoding='utf-8', timeout=60,
                               input=json.dumps({'tool_name': tool, 'tool_input': {'command': command}, 'cwd': str(cwd),
                                                 'hook_event_name': 'PreToolUse'}))
            try: return json.loads(r.stdout)['hookSpecificOutput']['permissionDecision']
            except Exception: return 'defer:' + (r.stdout + r.stderr)[-200:]
        check('hook command (as shipped) allows the toolkit from a sub-folder',
              hook('PowerShell', '& "..\\..\\..\\venv\\Scripts\\python.exe" "..\\..\\..\\engine\\tools\\pack_deck.py" .', sub) == 'allow')
        check('hook command (as shipped) denies rm', hook('Bash', 'rm index.html', sub) == 'deny')
        check('hook command (as shipped) defers on node -e', hook('Bash', 'node -e "1"', root) .startswith('defer'))
        check('hook command (as shipped) ignores other tools', hook('Write', 'x', root).startswith('defer'))
        for name in ('PostToolUse', 'Stop'):
            _, c = hook_command(name)
            check(f'settings: {name} hook finds check_rules.js from any folder (CLAUDE_PROJECT_DIR)', 'CLAUDE_PROJECT_DIR' in c and 'check_rules.js' in c, c)
        # static rules: every toolkit script has its proven per-script spelling; nothing uses the dead `dir/:*` form
        s = json.loads(SETTINGS.read_text(encoding='utf-8'))
        allow, deny = s['permissions']['allow'], s['permissions']['deny']
        dead = [a for a in allow if a.rstrip(')').endswith(('/:*', '\\:*'))]
        check('settings: no `dir/:*` rules (they never match)', not dead, dead)
        missing = []
        for sub_ in ('tools', 'rules'):
            for f in (ENGINE / sub_).iterdir():
                if f.name == 'permit.js' or f.suffix not in ('.js', '.py'): continue
                want = ([f'Bash(node .aura/engine/{sub_}/{f.name}:*)', f'PowerShell(node .aura/engine/{sub_}/{f.name}:*)'] if f.suffix == '.js' else
                        [f'Bash(.aura/venv/Scripts/python.exe .aura/engine/{sub_}/{f.name}:*)',
                         f'PowerShell(.aura/venv/Scripts/python.exe .aura/engine/{sub_}/{f.name}:*)'])
                missing += [w for w in want if w not in allow]
        check('settings: every toolkit script has its Bash + PowerShell allow rule', not missing, missing)
        check('settings: no general interpreter rules (node:*, python:*, -c)', not [a for a in allow if re.fullmatch(r'(Bash|PowerShell)\((node|python3?|py)(\.exe)?(:\*| \*)?\)', a) or ' -c' in a or ' -e' in a])
        check('settings: deny rm / Remove-Item / git / network / engine + .claude writes',
              all(x in deny for x in ('Bash(rm:*)', 'PowerShell(Remove-Item:*)', 'Bash(git:*)', 'Bash(curl:*)', 'PowerShell(Invoke-WebRequest:*)',
                                      'Edit(.aura/engine/**)', 'Write(.claude/**)')))
        # Blender (docs/blender-contract.md section 11): the HOOK decides every spelling. A static Bash(blender:*) rule
        # would let --python-expr through whenever the hook could not run, so there must be none; and the bundled copy
        # the batch-4 installer writes into .aura/blender is read-only to Claude, exactly like .aura/engine.
        blrules = [a for a in allow if re.search(r'\bblender', a, re.I)]
        check('settings: no static Blender allow rule (the hook decides every spelling)', not blrules, blrules)
        check('settings: writes into .aura/blender are denied like .aura/engine',
              'Edit(.aura/blender/**)' in deny and 'Write(.aura/blender/**)' in deny)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ---------------------------------------------------------------------------------------------------------------- real probes
def git_bash():
    for p in (os.environ.get('CLAUDE_CODE_GIT_BASH_PATH'), r'C:\Program Files\Git\bin\bash.exe', r'X:\CLPHP_Project\Git\bin\bash.exe',
              shutil.which('bash')):
        if p and Path(p).is_file() and 'system32' not in p.lower(): return p
    return None


def probe(root, tool, cmds):
    """Ask haiku to run each command verbatim with `tool`; return [(command it ran, verdict, text)]."""
    claude = shutil.which('claude')
    lst = '\n'.join(f'{i + 1}. {c}' for i, c in enumerate(cmds))
    prompt = (f'Test harness. Make exactly {len(cmds)} separate {tool} tool calls, one per line below, in order, each command copied '
              f'character-for-character (do not change, combine or fix anything; never use any other tool). Then reply DONE.\n{lst}')
    env = {k: v for k, v in os.environ.items() if not (k.startswith('CLAUDE_CODE') or k in ('CLAUDECODE', 'ELECTRON_RUN_AS_NODE'))}
    if tool == 'Bash' and git_bash(): env['CLAUDE_CODE_GIT_BASH_PATH'] = git_bash()
    args = [claude, '-p', '--model', 'haiku', '--permission-mode', 'acceptEdits', '--settings', '.claude/settings.json',
            '--setting-sources', 'project', '--output-format', 'stream-json', '--verbose', '--max-turns', str(len(cmds) + 3)]
    p = subprocess.run(args, cwd=str(root), input=prompt, env=env, capture_output=True, text=True, encoding='utf-8', timeout=600)
    uses, order = {}, []
    for line in p.stdout.splitlines():
        try: d = json.loads(line)
        except ValueError: continue
        m = d.get('message')
        if not isinstance(m, dict) or not isinstance(m.get('content'), list): continue
        for b in m['content']:
            if b.get('type') == 'tool_use': uses[b['id']] = [b['name'], (b.get('input') or {}).get('command'), None]; order.append(b['id'])
            if b.get('type') == 'tool_result' and b.get('tool_use_id') in uses:
                t = b.get('content')
                if isinstance(t, list): t = ' '.join(x.get('text', '') for x in t if isinstance(x, dict))
                uses[b['tool_use_id']][2] = (bool(b.get('is_error')), str(t))
    out = []
    for k in order:
        name, c, res = uses[k]
        err, text = res or (True, '(no result)')
        refused = err and any(s in text for s in ('requires approval', 'has been denied', 'Lumi:', 'was blocked', 'require approval'))
        out.append((name, c, 'refused' if refused else 'ran', text.replace('\n', ' ')[:160]))
    return out


def run_real(check):
    if not shutil.which('claude'):
        check('--real: claude is on PATH', False, 'install Claude Code and sign in'); return
    tmp = Path(tempfile.mkdtemp(prefix='lumi-perm-real-'))
    try:
        root = make_install(tmp, venv=True)
        W = str(root)
        ps = [('node .aura/engine/tools/new_deck.js --snippet list', 'ran'),
              (f'& "{W}\\.aura\\venv\\Scripts\\python.exe" "{W}\\.aura\\engine\\tools\\extract_text.py"', 'ran'),
              ('.\\.aura\\venv\\Scripts\\python.exe .\\.aura\\engine\\tools\\extract_text.py', 'ran'),
              (f'Get-ChildItem -Recurse "{W}\\3 - Put your files here" | Select-Object FullName; node .aura\\engine\\tools\\new_deck.js --snippet list | Select-Object -First 3', 'ran'),
              ('Remove-Item .aura\\temp\\probe.txt', 'refused'),
              ('node -e "console.log(1)"', 'refused')]
        sets = [('PowerShell', ps)]
        if git_bash():
            U = '/' + W[0].lower() + W[2:].replace('\\', '/')
            sets.append(('Bash', [('node .aura/engine/tools/new_deck.js --snippet list', 'ran'),
                                  ('node .aura/engine/tools/new_deck.js --snippet title-hero --slide 1 | head -5; ls .aura/engine/deck 2>&1', 'ran'),
                                  (f'cd {U}/.aura/temp && ls && cat probe.txt', 'ran'),
                                  ('.aura/venv/Scripts/python.exe .aura/engine/tools/extract_text.py 2>&1 | tail -3', 'ran'),
                                  ('rm .aura/temp/probe.txt', 'refused'),
                                  ('node -e "console.log(1)"', 'refused')]))
        else:
            print('  (no Git Bash found: only the PowerShell probe runs, like a machine without Git)')
        for tool, cmds in sets:
            res = probe(root, tool, [c for c, _ in cmds])
            got = {c: (v, t) for _, c, v, t in res}
            for c, want in cmds:
                v, t = got.get(c, ('not-run', 'Claude did not run it verbatim'))
                check(f'--real {tool}: {c[:70]} -> {want}', v == want, f'{v}: {t}')
        check('--real: the probe file still exists (nothing was deleted)', (root / '.aura' / 'temp' / 'probe.txt').is_file())
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def run(T=None, real=False):
    fails = []
    def check(name, ok, info=''):
        if T is not None and hasattr(T, 'check'): T.check(name, ok, info); return
        print(('  PASS ' if ok else '  FAIL ') + name + ('' if ok else f'   -> {info}'), flush=True)
        if not ok: fails.append(name)
    print('\n[permissions: hook + settings, no Claude]')
    run_unit(check)
    if real:
        print('\n[permissions: real claude -p --model haiku against the shipped settings.json]')
        run_real(check)
    return fails


if __name__ == '__main__':
    f = run(real='--real' in sys.argv)
    print(f'\n{"ALL PASSED" if not f else str(len(f)) + " FAILED"}')
    sys.exit(1 if f else 0)
