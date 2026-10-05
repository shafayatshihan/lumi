# Lumi (by Shafayat, formerly Aura-Slide) - one-click setup for Windows 10/11.
# Makes C:\Lumi, installs whatever is missing (Git, Node.js, Python, Claude Code, the slide engine, Blender),
# adds the icon and shortcuts, then opens the Lumi app.
# Safe to run again: anything already installed is skipped and the user's own files are never touched.
#   -Json      no console drawing: print one JSON line per step event instead, for Lumi.exe to show:
#              {"step":n,"total":N,"name":"...","state":"start|ok|have|fail","detail":"..."}
#              The first line has state "plan" and lists every step name in "detail", separated by "|".
#              Step 0 is the quick check of this PC (Windows version, free space, internet, winget).
#   -NoLaunch  do not open the app at the end.
# Env AURA_ROOT installs somewhere else (developer tests); shortcuts then go into that folder, not the real Desktop.
# Env AURA_EXE is the Lumi.exe to install when this release has none of its own (Lumi.exe passes itself).
# Moving from Aura-Slide: an old install (C:\Aura-Slide by Shafayat) has its user folders copied into C:\Lumi (files
# already in C:\Lumi are never overwritten) and the old folder is left in place for the user to delete. An Aura-Slide
# 0.3 app that runs this as its update passes AURA_ROOT=<old folder>: that is treated as the move, not a test install.
# Env AURA_LEGACY_ROOT points a developer test install at a fake old folder to copy from.
# Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less scripts in the ANSI code page.
param([switch]$NoLaunch, [switch]$Json)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}

$Repo  = Split-Path -Parent $PSScriptRoot
$DefaultRoot = 'C:\Lumi'
$OldRoot = 'C:\Aura-Slide by Shafayat'
$Root  = if ($env:AURA_ROOT) { [IO.Path]::GetFullPath($env:AURA_ROOT).TrimEnd('\') } else { $DefaultRoot }
$FromOldApp = ($Root -eq $OldRoot)                       # an Aura-Slide 0.3 app is running this as its update
if ($FromOldApp) { $Root = $DefaultRoot }
$TestInstall = ($Root -ne $DefaultRoot)
$Legacy = if ($TestInstall) { $env:AURA_LEGACY_ROOT } else { $OldRoot }
if ($Legacy -and -not (Test-Path (Join-Path $Legacy '.aura'))) { $Legacy = $null }
$Aura  = Join-Path $Root '.aura'
$Logs  = Join-Path $Aura 'logs'
$Stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$Log   = $null
$MovedFrom = $null
$Config = Get-Content (Join-Path $PSScriptRoot 'aura.config.json') -Raw | ConvertFrom-Json

# ---------------------------------------------------------------- look & feel
$FULL = [string][char]0x2588; $EMPTY = [string][char]0x2591
function Line([string]$t = '', [string]$c = 'Gray') { if (-not $Json) { Write-Host $t -ForegroundColor $c } }
$GLYPH = @{
  'A' = @(' ### ', '#   #', '#####', '#   #', '#   #'); 'U' = @('#   #', '#   #', '#   #', '#   #', ' ### ')
  'R' = @('#### ', '#   #', '#### ', '#  # ', '#   #'); '-' = @('    ', '    ', '### ', '    ', '    ')
  'S' = @(' ####', '#    ', ' ### ', '    #', '#### '); 'L' = @('#    ', '#    ', '#    ', '#    ', '#####')
  'I' = @('###', ' # ', ' # ', ' # ', '###');           'D' = @('#### ', '#   #', '#   #', '#   #', '#### ')
  'E' = @('#####', '#    ', '#### ', '#    ', '#####'); 'M' = @('#   #', '## ##', '# # #', '#   #', '#   #')
}
function Banner {
  if ($Json) { return }
  Clear-Host
  Line ''
  $word = 'LUMI'; $cols = @('Cyan', 'Cyan', 'Magenta', 'Magenta')
  for ($r = 0; $r -lt 5; $r++) {
    Write-Host '   ' -NoNewline
    for ($c = 0; $c -lt $word.Length; $c++) { Write-Host (($GLYPH[[string]$word[$c]][$r]) -replace '#', $FULL) -ForegroundColor $cols[$c] -NoNewline; Write-Host ' ' -NoNewline }
    if ($r -eq 4) { Write-Host '  by Shafayat' -ForegroundColor Blue } else { Write-Host '' }
  }
  Line ''
  Line '  This sets up everything you need. It takes 10 to 20 minutes.' 'White'
  Line '  If Windows asks "Do you want to allow this app to make changes?", click Yes.' 'Yellow'
  Line ''
}
function Bar([int]$done, [int]$total, [int]$w = 34) {
  $n = [int][math]::Round($w * $done / [math]::Max(1, $total)); ($FULL * $n) + ($EMPTY * ($w - $n))
}
function Overall([int]$done, [int]$total) {
  if ($Json) { return }
  $pct = [int](100 * $done / [math]::Max(1, $total))
  Write-Host ('  Overall  ' + (Bar $done $total) + ('  {0,3}%  ({1} of {2} steps)' -f $pct, $done, $total)) -ForegroundColor Cyan
  Line ''
}
function Tag([string]$t, [string]$bg, [string]$msg) {
  if ($Json) { return }
  Write-Host ('  ' + $t.PadRight(6)) -ForegroundColor Black -BackgroundColor $bg -NoNewline; Write-Host (' ' + $msg)
}
function Ok([string]$m)   { Tag ' OK' 'Green' $m }
function Skip([string]$m) { Tag 'FOUND' 'DarkCyan' $m }
function Bad([string]$m)  { Tag ' FAIL' 'Red' $m }
function Log([string]$m)  { if ($Log) { Add-Content -Path $Log -Value ('[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $m) } }
# One JSON progress line for Lumi.exe (only with -Json). Written straight to stdout, flushed at once.
function Emit([int]$step, [string]$name, [string]$state, [string]$detail = '') {
  if (-not $Json) { return }
  $o = [ordered]@{ step = $step; total = $Steps.Count; name = $name; state = $state; detail = $detail }
  [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)); [Console]::Out.Flush()
}
# A long download inside one step: the same line plus "pct" (0-100), so Lumi.exe can fill that row's own little bar.
# Without -Json it redraws one console line in place. The caller throttles it.
function EmitProgress([int]$step, [string]$name, [string]$detail, [int]$pct) {
  if ($Json) {
    $o = [ordered]@{ step = $step; total = $Steps.Count; name = $name; state = 'progress'; detail = $detail; pct = $pct }
    [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)); [Console]::Out.Flush()
    return
  }
  Write-Host ("`r         " + (Bar $pct 100 24) + ('  {0,3}%  {1}          ' -f $pct, $detail)) -NoNewline -ForegroundColor DarkGray
}
function Stop-Here([int]$code) { if (-not $Json) { Read-Host '  Press Enter to close' | Out-Null }; exit $code }

# Run a program hidden, with a live spinner + elapsed time, output appended to the log. Returns the exit code.
function Run([string]$what, [string]$exe, [string]$argsLine) {
  $found = Get-Command $exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($found) { $exe = $found.Source }                      # full path: cmd mis-resolves %~dp0 in a bare "npm"
  Log ">> $exe $argsLine"
  $tmp = [IO.Path]::GetTempFileName()
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = $env:ComSpec
  $psi.Arguments = '/d /s /c ""' + $exe + '" ' + $argsLine + ' > "' + $tmp + '" 2>&1"'
  $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
  $psi.WorkingDirectory = (Get-Location).ProviderPath      # Push-Location does not move the process directory
  $p = [Diagnostics.Process]::Start($psi)
  $spin = '|/-\'; $i = 0; $t0 = Get-Date
  while (-not $p.HasExited) {
    if (-not $Json) {
      $s = [int]((Get-Date) - $t0).TotalSeconds
      $wait = if ($s -ge 15) { '  - this can take a few minutes, please do not close this window' } else { '' }
      Write-Host ("`r         {0} {1}   {2}:{3:D2}{4} " -f $spin[$i % 4], $what, [int]($s / 60), ($s % 60), $wait) -NoNewline -ForegroundColor DarkGray
    }
    Start-Sleep -Milliseconds 180; $i++
  }
  if (-not $Json) { Write-Host ("`r" + (' ' * 118) + "`r") -NoNewline }
  if ($Log) { Get-Content $tmp -ErrorAction SilentlyContinue | Add-Content -Path $Log }
  Remove-Item $tmp -ErrorAction SilentlyContinue
  Log "<< exit $($p.ExitCode)"
  return $p.ExitCode
}

function Refresh-Path {
  $m = [Environment]::GetEnvironmentVariable('Path', 'Machine'); $u = [Environment]::GetEnvironmentVariable('Path', 'User')
  $extra = @("$env:USERPROFILE\.local\bin", "$env:ProgramFiles\Git\cmd", "$env:ProgramFiles\nodejs",
             "$env:LOCALAPPDATA\Programs\Python\Python312", "$env:LOCALAPPDATA\Programs\Python\Python312\Scripts", "$env:APPDATA\npm")
  $env:Path = (@($env:Path, $m, $u) + $extra | Where-Object { $_ }) -join ';'
}
function Has([string]$cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Winget([string]$id, [string]$scope) {
  $a = "install --id $id -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity"
  if ($scope) { $a += " --scope $scope" }
  $c = Run 'downloading and installing' 'winget' $a
  Refresh-Path
  return ($c -eq 0 -or $c -eq -1978335189 -or $c -eq -1978335135)   # 0x8A15002B / 0x8A150061: already installed
}
function Base-Python {   # a real (non-venv) Python 3.10+; prints its path or $null
  foreach ($try in @(@('py', '-3.12'), @('py', '-3'), @('python', ''))) {
    if (-not (Has $try[0])) { continue }
    try {
      $out = & $try[0] $(if ($try[1]) { $try[1] }) -c "import sys;v=sys.version_info;print(getattr(sys,'_base_executable',sys.executable) if v>=(3,10) else '')" 2>$null
      if ($out -and (Test-Path $out.Trim())) { return $out.Trim() }
    } catch {}
  }
  return $null
}
function Node-Ok { if (-not (Has 'node')) { return $false }; try { $v = (& node --version) -replace '^v', ''; $p = $v.Split('.'); return ([int]$p[0] -ge 22 -or ([int]$p[0] -eq 20 -and [int]$p[1] -ge 19)) } catch { return $false } }

# ---------------------------------------------------------------- steps
$Steps = @(
  @{ n = 'Your Lumi folder';                       f = 'Step-Folder' },
  @{ n = 'Git (needed by Claude on Windows)';      f = 'Step-Git' },
  @{ n = 'Node.js (runs the 3D slide engine)';     f = 'Step-Node' },
  @{ n = 'Python (makes PDF and PowerPoint)';      f = 'Step-Python' },
  @{ n = 'Claude Code (the AI)';                   f = 'Step-Claude' },
  @{ n = 'Slide engine: 3D and video tools';       f = 'Step-Npm' },
  @{ n = 'Slide engine: PDF and PowerPoint tools'; f = 'Step-Pip' },
  @{ n = 'Blender (studio 3D renders, free/GPL)';  f = 'Step-Blender' },
  @{ n = 'Icon and shortcuts';                     f = 'Step-Shortcuts' }
)
$BlenderStepNo = 1 + [array]::IndexOf(($Steps | ForEach-Object { $_.f }), 'Step-Blender')

function Step-Folder {
  $made = -not (Test-Path $Root)
  $dirs = @('3 - Put your files here\Report', '3 - Put your files here\Images and photos', '3 - Put your files here\Data (csv, excel, graphs)',
            '3 - Put your files here\Logo and university template', '3 - Put your files here\Previous year reports',
            '3 - Put your files here\Journal papers', '3 - Put your files here\Anything else',
            '4 - Your slides\Older versions', '.aura\engine', '.aura\temp', '.aura\logs', '.aura\brief')
  foreach ($d in $dirs) { New-Item -ItemType Directory -Force -Path (Join-Path $Root $d) | Out-Null }
  # engine + Claude project files: replaced cleanly so old versions never pile up (user folders are never touched;
  # node_modules and Claude's own settings.local.json are kept)
  Get-ChildItem (Join-Path $Aura 'engine') -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'node_modules' } | Remove-Item -Recurse -Force
  Get-ChildItem (Join-Path $Root '.claude') -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'settings.local.json' } | Remove-Item -Recurse -Force
  Get-ChildItem (Join-Path $Repo 'engine') -Force | Where-Object { $_.Name -ne 'node_modules' } | Copy-Item -Destination (Join-Path $Aura 'engine') -Recurse -Force
  Copy-Item (Join-Path $Repo 'workspace\.claude') $Root -Recurse -Force   # includes the power-design skill (MIT, shipped in the repo)
  Copy-Item (Join-Path $PSScriptRoot 'icon\lumi\lumi.ico') (Join-Path $Aura 'lumi.ico') -Force
  Copy-Item (Join-Path $PSScriptRoot 'aura.config.json') $Aura -Force
  $oldGuide = Join-Path $Root '1 - Read me first.pdf'; if (Test-Path $oldGuide) { Remove-Item $oldGuide -Force }   # guide retired in 0.3
  foreach ($h in @('.aura', '.claude')) { (Get-Item (Join-Path $Root $h) -Force).Attributes = 'Directory, Hidden, System' }
  $moved = Copy-OldFiles
  if ($moved -gt 0) { return "your files were copied from $Legacy" }
  if ($made) { return 'created ' + $Root } else { return 'already there, your files are untouched' }
}
# Moving from Aura-Slide: copy the user's own folders across, never overwriting a file already in the new folder.
# The old folder is left exactly as it is (the user deletes it once they have checked their files).
function Copy-OldFiles {
  if (-not $Legacy) { return 0 }
  $n = 0
  foreach ($top in '3 - Put your files here', '4 - Your slides') {
    $from = Join-Path $Legacy $top
    if (-not (Test-Path $from)) { continue }
    $base = (Get-Item $from -Force).FullName.TrimEnd('\')
    foreach ($f in Get-ChildItem $from -Recurse -File -Force -ErrorAction SilentlyContinue) {
      $rel = $f.FullName.Substring($base.Length).TrimStart('\')
      $dest = Join-Path (Join-Path $Root $top) $rel
      if (Test-Path $dest) { continue }
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
      try { Copy-Item $f.FullName $dest; $n++ } catch { Log ('could not copy ' + $f.FullName + ': ' + $_.Exception.Message) }
    }
  }
  Log "copied $n file(s) from $Legacy"
  $script:MovedFrom = $Legacy
  return $n
}
function Step-Git {
  if (Has 'git') { return 'HAVE' }
  if (-not (Winget 'Git.Git' '')) { throw 'Git could not be installed.' }
  if (-not (Has 'git')) { throw 'Git installed but not found.' }; 'installed'
}
function Step-Node {
  if (Node-Ok) { return 'HAVE' }
  if (-not (Winget 'OpenJS.NodeJS.LTS' '')) { throw 'Node.js could not be installed.' }
  if (-not (Node-Ok)) { throw 'Node.js installed but not found.' }; 'installed'
}
function Step-Python {
  if (Base-Python) { return 'HAVE' }
  if (-not (Winget 'Python.Python.3.12' 'user')) { throw 'Python could not be installed.' }
  if (-not (Base-Python)) { throw 'Python installed but not found.' }; 'installed'
}
function Step-Claude {
  if (Has 'claude') { return 'HAVE' }
  $c = Run 'downloading Claude Code' 'powershell' '-NoProfile -ExecutionPolicy Bypass -Command "irm https://claude.ai/install.ps1 | iex"'
  Refresh-Path
  if (-not (Has 'claude')) { throw "Claude Code could not be installed (code $c)." }; 'installed'
}
function Step-Npm {
  $eng = Join-Path $Aura 'engine'
  Push-Location $eng
  try { $c = Run 'downloading three.js, Vite and Playwright' 'npm' 'install --no-audit --no-fund --loglevel=error' } finally { Pop-Location }
  if ($c -ne 0 -or -not (Test-Path (Join-Path $eng 'node_modules\three'))) { throw "The 3D tools could not be installed (code $c)." }
  'ready'
}
function Step-Pip {
  $venv = Join-Path $Aura 'venv'; $py = Join-Path $venv 'Scripts\python.exe'
  # a venv only works while the Python it was made from exists; one made by another Windows account is rebuilt here
  $vcfg = Join-Path $venv 'pyvenv.cfg'
  if (Test-Path $vcfg) {
    $pyHome = ((Get-Content $vcfg | Where-Object { $_ -match '^\s*home\s*=' } | Select-Object -First 1) -replace '^\s*home\s*=\s*', '').Trim()
    if (-not $pyHome -or -not (Test-Path (Join-Path $pyHome 'python.exe'))) { Remove-Item $venv -Recurse -Force }
  }
  if (-not (Test-Path $py)) {
    $base = Base-Python; if (-not $base) { throw 'Python is missing.' }
    $c = Run 'making a private Python' $base ('-m venv "' + $venv + '"'); if (-not (Test-Path $py)) { throw "Could not make the Python environment (code $c)." }
  }
  $c = Run 'downloading Pillow, python-pptx and ffmpeg' $py ('-m pip install --disable-pip-version-check --upgrade ' + ($Config.pythonPackages -join ' '))
  if ($c -ne 0) { throw "The PDF and PowerPoint tools could not be installed (code $c)." }
  'ready'
}
# ---------------------------------------------------------------- Blender (docs/blender-contract.md sections 5 and 12)
# Lumi ALWAYS installs Blender. It is the official portable windows-x64 zip, pinned by version + SHA256 in
# setup\blender\blender-pin.json, downloaded from download.blender.org, verified, and then flattened (the zip has one
# top folder) into <root>\.aura\blender, so .aura\blender\blender.exe is exactly where find_blender() looks.
# Blender is GPL: its licence text and a link to the matching source go in next to it.
# A developer test points AURA_BLENDER_PIN at another pin file (a small local zip served over HTTP).
function Blender-Pin {
  $f = if ($env:AURA_BLENDER_PIN) { $env:AURA_BLENDER_PIN } else { Join-Path $PSScriptRoot 'blender\blender-pin.json' }
  if (-not (Test-Path $f)) { throw 'This Lumi release is missing the Blender download details (setup\blender\blender-pin.json).' }
  $p = Get-Content $f -Raw | ConvertFrom-Json
  if (-not $p.url -or -not $p.sha256 -or -not $p.version) { throw 'The Blender download details are incomplete.' }
  $p
}
# Is the bundled copy there, complete, and the pinned version? Used by the install, by --repair and by the health check.
function Blender-Ok([string]$dir, $pin) {
  if (-not (Test-Path (Join-Path $dir 'blender.exe'))) { return $false }
  $s = Join-Path $dir 'lumi-blender.json'
  if (-not (Test-Path $s)) { return $false }
  try { $st = Get-Content $s -Raw | ConvertFrom-Json } catch { return $false }
  if ($st.version -ne $pin.version -or $st.sha256 -ne $pin.sha256) { return $false }
  try { if ([int64]$st.exeBytes -ne (Get-Item (Join-Path $dir 'blender.exe')).Length) { return $false } } catch { return $false }
  foreach ($rel in @($st.must)) { if ($rel -and -not (Test-Path (Join-Path $dir $rel))) { return $false } }
  return $true
}
# Download with a live percentage, resuming a part file with an HTTP Range request and retrying a dropped connection.
function Blender-Fetch($pin, [string]$part, [int]$stepNo, [string]$stepName) {
  $want = [int64]$pin.bytes
  $last = ''
  for ($try = 1; $try -le 4; $try++) {
    $have = if (Test-Path $part) { (Get-Item $part).Length } else { [int64]0 }
    if ($want -gt 0 -and $have -ge $want) { return }
    try {
      $req = [Net.HttpWebRequest]::Create([string]$pin.url)
      $req.UserAgent = 'Lumi-setup'
      $req.Timeout = 60000; $req.ReadWriteTimeout = 180000; $req.AllowAutoRedirect = $true
      if ($have -gt 0) { $req.AddRange([int64]$have) }
      $resp = $req.GetResponse()
      $resumed = ($have -gt 0 -and [int]$resp.StatusCode -eq 206)
      if (-not $resumed) { $have = [int64]0 }                 # the server ignored the range: start again
      $total = if ($want -gt 0) { $want } else { $have + $resp.ContentLength }
      $inS = $resp.GetResponseStream()
      $outS = New-Object IO.FileStream($part, $(if ($resumed) { [IO.FileMode]::Append } else { [IO.FileMode]::Create }), [IO.FileAccess]::Write)
      try {
        $buf = New-Object byte[] 262144
        $shown = -1; $tick = [DateTime]::UtcNow
        while ($true) {
          $n = $inS.Read($buf, 0, $buf.Length)
          if ($n -le 0) { break }
          $outS.Write($buf, 0, $n); $have += $n
          $pct = if ($total -gt 0) { [int](100 * $have / $total) } else { 0 }
          if ($pct -ne $shown -and ([DateTime]::UtcNow - $tick).TotalMilliseconds -ge 400) {
            $shown = $pct; $tick = [DateTime]::UtcNow
            EmitProgress $stepNo $stepName ('{0:0} of {1:0} MB' -f ($have / 1MB), ($total / 1MB)) $pct
          }
        }
      } finally { $outS.Dispose(); $inS.Dispose(); $resp.Close() }
      if ($want -le 0 -or (Get-Item $part).Length -ge $want) { return }
      $last = 'the download stopped early'
    } catch {
      $last = $_.Exception.Message
      Log ('blender download attempt ' + $try + ': ' + $last)
      Start-Sleep -Seconds (2 * $try)
    }
  }
  throw ('Blender could not be downloaded (' + $last + '). Check this PC''s internet connection and run the setup again.')
}
function Step-Blender {
  $pin = Blender-Pin
  $dir = Join-Path $Aura 'blender'
  if (Blender-Ok $dir $pin) { return 'HAVE' }
  $name = if ($BlenderStepNo -ge 1 -and $Steps) { $Steps[$BlenderStepNo - 1].n } else { 'Blender' }
  $tmp = Join-Path $Aura 'temp'
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  $part = Join-Path $tmp ('blender-' + $pin.version + '-windows-x64.zip.part')
  # a verified leftover from an interrupted run is reused; a file with the wrong hash is downloaded again
  for ($round = 1; $round -le 2; $round++) {
    Blender-Fetch $pin $part $BlenderStepNo $name
    EmitProgress $BlenderStepNo $name 'checking the download' 100
    $got = (Get-FileHash $part -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($got -eq ([string]$pin.sha256).ToLowerInvariant()) { break }
    Log ('blender sha256 mismatch: got ' + $got + ' want ' + $pin.sha256)
    Remove-Item $part -Force -ErrorAction SilentlyContinue
    if ($round -ge 2) {
      throw ('The Blender download did not arrive in one piece (its security check failed twice), so Lumi did not ' +
             'install it. Try again on a different network, or download Blender ' + $pin.version + ' yourself from blender.org.')
    }
  }
  if (-not $Json) { Write-Host ("`r" + (' ' * 118) + "`r") -NoNewline }
  # unpack into a staging folder, then flatten the zip's single top folder into .aura\blender
  $stage = Join-Path $tmp ('blender-unpack-' + $pin.version)
  if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $stage | Out-Null
  Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
  [IO.Compression.ZipFile]::ExtractToDirectory($part, $stage)
  $top = @(Get-ChildItem $stage -Force)
  $src = if ($top.Count -eq 1 -and $top[0].PSIsContainer) { $top[0].FullName } else { $stage }
  if (-not (Test-Path (Join-Path $src 'blender.exe'))) { throw 'The Blender download did not contain blender.exe.' }
  if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
  Move-Item $src $dir
  Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item $part -Force -ErrorAction SilentlyContinue
  # GPL: the licence text and where to get the source for exactly this build, next to the program itself
  $docs = if ($env:AURA_BLENDER_PIN) { Split-Path -Parent $env:AURA_BLENDER_PIN } else { Join-Path $PSScriptRoot 'blender' }
  foreach ($f in 'COPYING-GPL-3.0.txt', 'BLENDER-SOURCE.txt') {
    $s = Join-Path $docs $f
    if (Test-Path $s) { Copy-Item $s (Join-Path $dir $f) -Force }
  }
  # the stamp: what is installed, so --repair and the health check can tell a good copy from a broken one
  $must = @('blender.exe')
  $verDir = Get-ChildItem $dir -Directory -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^\d+\.\d+$' } | Select-Object -First 1
  if ($verDir) { foreach ($sub in 'python', 'scripts', 'datafiles') { if (Test-Path (Join-Path $verDir.FullName $sub)) { $must += ($verDir.Name + '\' + $sub) } } }
  $stamp = [ordered]@{
    name = 'Blender'; version = [string]$pin.version; channel = [string]$pin.channel
    url = [string]$pin.url; sha256 = ([string]$pin.sha256).ToLowerInvariant()
    license = [string]$pin.license; licenseFile = 'COPYING-GPL-3.0.txt'; sourceUrl = [string]$pin.sourceUrl
    installedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    exeBytes = (Get-Item (Join-Path $dir 'blender.exe')).Length
    must = $must
  }
  Set-Content -Path (Join-Path $dir 'lumi-blender.json') -Encoding ASCII -Value ($stamp | ConvertTo-Json)
  return ('Blender ' + $pin.version + ' ' + $pin.channel + ' installed (free software, GPL)')
}

function Step-Shortcuts {
  $ico = Join-Path $Aura 'lumi.ico'
  # the app itself: Lumi.exe from this release (at its root), else the one that is running this setup
  # (never an old AuraSlide.exe that is running this as its update)
  $exe = Join-Path $Aura 'Lumi.exe'
  $runner = if ($env:AURA_EXE -and ((Split-Path -Leaf $env:AURA_EXE) -notlike 'AuraSlide*')) { $env:AURA_EXE } else { $null }
  $src = @((Join-Path $Repo 'Lumi.exe'), $runner) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if ($src -and ([IO.Path]::GetFullPath($src) -ne [IO.Path]::GetFullPath($exe))) {
    try { Copy-Item $src $exe -Force } catch { Log ('could not copy Lumi.exe: ' + $_.Exception.Message) }   # in use: kept
  }
  $hasExe = Test-Path $exe
  if ($hasExe) { Unblock-File $exe -ErrorAction SilentlyContinue }   # a copy keeps the "downloaded from the internet" mark
  else { Log 'Lumi.exe is not in this release: the shortcuts open engine\start.ps1 instead' }
  # folder icon
  $ini = Join-Path $Root 'desktop.ini'
  if (Test-Path $ini) { (Get-Item $ini -Force).Attributes = 'Normal' }
  Set-Content -Path $ini -Encoding Unicode -Value "[.ShellClassInfo]`r`nIconResource=$ico,0`r`nInfoTip=Lumi`r`n"
  (Get-Item $ini -Force).Attributes = 'Hidden, System'
  (Get-Item $Root -Force).Attributes = 'Directory, ReadOnly'
  $sh = New-Object -ComObject WScript.Shell
  $ps = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  function Lnk([string]$path, [string]$target, [string]$argz, [string]$tip, [int]$style = 1) {
    $l = $sh.CreateShortcut($path); $l.TargetPath = $target; $l.Arguments = $argz; $l.IconLocation = "$ico,0"
    $l.WorkingDirectory = $Root; $l.Description = $tip; $l.WindowStyle = $style; $l.Save()
  }
  # old shortcuts from earlier versions: the desktop icon now opens, repairs and updates Lumi by itself
  foreach ($old in '2 - Start Aura-Slide.lnk', 'Start Aura-Slide.lnk', '2 - Fill in the form.lnk', 'Update Aura-Slide.lnk') {
    $o = Join-Path $Root $old; if (Test-Path $o) { Remove-Item $o -Force }
  }
  Lnk (Join-Path $Root 'Send problem report.lnk') $ps ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $Aura 'engine\report.ps1') + '"') 'Make a zip you can send to Shafayat' 7
  if ($TestInstall) {                                   # developer test install: keep the real Desktop and Start menu clean
    $desk = Join-Path $Root 'Desktop (test)'; $menuDir = Join-Path $Root 'Start menu (test)'
    foreach ($d in $desk, $menuDir) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
  } else {
    $desk = [Environment]::GetFolderPath('Desktop'); $menuDir = [Environment]::GetFolderPath('Programs')
  }
  if ($hasExe) { $tgt = $exe; $argz = ''; $style = 1 }
  else { $tgt = $ps; $argz = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $Aura 'engine\start.ps1') + '"'; $style = 7 }
  # the app was called Aura-Slide before 0.4: its Desktop and Start menu icons are replaced by the Lumi ones
  foreach ($d in $desk, $menuDir) { $o = Join-Path $d 'Aura-Slide.lnk'; if (Test-Path $o) { Remove-Item $o -Force } }
  Lnk (Join-Path $desk 'Lumi.lnk') $tgt $argz 'Open Lumi' $style
  Lnk (Join-Path $menuDir 'Lumi.lnk') $tgt $argz 'Open Lumi' $style
  'Desktop icon + Start menu'
}

# ---------------------------------------------------------------- run
$total = $Steps.Count
Emit 0 'plan' 'plan' (($Steps | ForEach-Object { $_.n }) -join '|')
Banner
Line '  Checking this PC first...' 'White'
$checkName = 'Checking this PC'
Emit 0 $checkName 'start'
function Early-Fail([string]$msg) { Bad $msg; Emit 0 $checkName 'fail' $msg; Stop-Here 1 }
$os = [Environment]::OSVersion.Version
if ($os.Major -lt 10) { Early-Fail 'Lumi needs Windows 10 or 11.' }
$drive = (Split-Path -Qualifier $Root).TrimEnd(':')
$free = [math]::Round((Get-PSDrive $drive).Free / 1GB, 1)
if ($free -lt 5) { Early-Fail "Only $free GB free on drive $drive. Please free up at least 5 GB and run this again." }
try { Invoke-WebRequest 'https://github.com' -Method Head -TimeoutSec 15 -UseBasicParsing | Out-Null }
catch { Early-Fail 'No internet connection. Connect to Wi-Fi and run this again.' }
if (-not (Has 'winget')) {
  Start-Process 'ms-windows-store://pdp/?ProductId=9NBLGGH4NNS1'
  Early-Fail 'Windows is missing "App Installer". The Microsoft Store has opened: click Get or Update there, then run this again.'
}
$gpu = (Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name) -join ', '
Refresh-Path
$winName = if ($os.Build -ge 22000) { 'Windows 11' } else { 'Windows 10' }
Emit 0 $checkName 'ok' "$winName, $free GB free"

$done = 0; $failed = @()
for ($k = 0; $k -lt $total; $k++) {
  $s = $Steps[$k]
  Banner; Overall $done $total
  for ($j = 0; $j -lt $k; $j++) { $r = $Steps[$j].r; if ($r -eq 'HAVE') { Skip $Steps[$j].n } elseif ($r -like 'FAIL*') { Bad ($Steps[$j].n + ' - ' + $r.Substring(5)) } else { Ok ($Steps[$j].n + ' - ' + $r) } }
  if (-not $Json) { Write-Host ('  ' + '>>'.PadRight(6)) -ForegroundColor Black -BackgroundColor Yellow -NoNewline; Write-Host (' ' + $s.n + ' ...') }
  Emit ($k + 1) $s.n 'start'
  try {
    $r = & $s.f
    if ($k -eq 0) { $Log = Join-Path $Logs "setup_$Stamp.log"; Log "Lumi setup $($Config.version)  Windows $os  free $drive`: $free GB  GPU: $gpu  root: $Root" }
    $s.r = [string]$r; Log ("OK  " + $s.n + ' : ' + $r)
    if ($s.r -eq 'HAVE') { Emit ($k + 1) $s.n 'have' 'already on this PC' } else { Emit ($k + 1) $s.n 'ok' $s.r }
  } catch {
    $s.r = 'FAIL ' + $_.Exception.Message; $failed += $s.n; Log ('ERR ' + $s.n + ' : ' + $_.Exception.Message)
    Emit ($k + 1) $s.n 'fail' $_.Exception.Message
    if ($k -eq 0) { Banner; Bad ('Could not make ' + $Root + ': ' + $_.Exception.Message); Stop-Here 1 }
  }
  $done++
}

Banner; Overall $done $total
foreach ($s in $Steps) { if ($s.r -eq 'HAVE') { Skip $s.n } elseif ($s.r -like 'FAIL*') { Bad ($s.n + ' - ' + $s.r.Substring(5)) } else { Ok ($s.n + ' - ' + $s.r) } }
Line ''
if ($failed.Count) {
  Line '  Some parts did not install. Run the setup again - it continues where it stopped.' 'Yellow'
  Line '  Still stuck? Open your Lumi folder and double-click "Send problem report".' 'Yellow'
  Line ''; Stop-Here 1
}
Line ('  All done!  Your folder:  ' + $Root) 'Green'
Line '  Lumi also installed Blender (free software, GNU GPL) for its studio 3D renders.' 'DarkGray'
Line ('  Its licence and source link: ' + (Join-Path $Aura 'blender\BLENDER-SOURCE.txt')) 'DarkGray'
Line '  Next time, open Lumi with the "Lumi" icon on your Desktop.' 'Green'
if ($MovedFrom) {
  Line ('  Your files were copied from ' + $MovedFrom + '.') 'Yellow'
  Line '  Once you have checked them in the new folder, you can delete that old folder.' 'Yellow'
}
Line ''
Line '  What happens now:' 'White'
Line '    1. Lumi opens in its own window. Answer the questions and drop in your files.'
Line '    2. Click   make my slides   at the end. The first time, sign in to Claude when asked.' 'Cyan'
Line '    3. Watch Claude build your slides, and answer its questions in the chat.'
Line ''
if (-not $NoLaunch) {
  $app = Join-Path $Aura 'Lumi.exe'
  if (Test-Path $app) { Start-Process -FilePath $app } else { & (Join-Path $Aura 'engine\form.ps1') }
} elseif ($FromOldApp) {
  # The old Aura-Slide app opens whatever server answers on its port once this ends, so start Lumi's server here:
  # it then opens the new app (in C:\Lumi) instead of the old one.
  $pyw = Join-Path $Aura 'venv\Scripts\pythonw.exe'; $srv = Join-Path $Aura 'engine\form_server.py'
  if ((Test-Path $pyw) -and (Test-Path $srv)) {
    try {
      Start-Process -FilePath $pyw -ArgumentList ('"' + $srv + '"') -WorkingDirectory (Join-Path $Aura 'engine') -WindowStyle Hidden
      for ($i = 0; $i -lt 60; $i++) {
        try { Invoke-WebRequest ('http://127.0.0.1:' + $Config.formPort + '/api/ping') -UseBasicParsing -TimeoutSec 2 | Out-Null; break }
        catch { Start-Sleep -Milliseconds 500 }
      }
    } catch { Log ('could not start the Lumi server: ' + $_.Exception.Message) }
  }
}
if (-not $Json) { Read-Host '  Press Enter to close this window' | Out-Null }
exit 0
