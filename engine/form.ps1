# Opens the Lumi web app. Starts the small local server first if it is not running.
# Fallback launcher: the Desktop icon runs .aura\Lumi.exe, which does the same.
# The server only listens on this PC (127.0.0.1), saves answers into .aura\brief and runs Claude in the background.
# The server needs plain Python only (no extra packages), so if Aura's private Python (.aura\venv) was made by another
# Windows account and no longer works here, any working Python on this account is used instead.
$ErrorActionPreference = 'Stop'
$Aura = Split-Path -Parent $PSScriptRoot
$cfg  = Get-Content (Join-Path $Aura 'aura.config.json') -Raw | ConvertFrom-Json
$port = [int]$cfg.formPort
$portFile = Join-Path $Aura 'temp\port'      # the port the server really bound (it moves on when the configured one is taken)
function Use-Port([int]$p) { $script:port = $p; $script:url = "http://127.0.0.1:$p/" }
Use-Port $port
$active = 0
if ((Test-Path $portFile) -and [int]::TryParse((Get-Content $portFile -Raw).Trim(), [ref]$active) -and $active -gt 1023 -and $active -ne $port) {
  Use-Port $active
  if (-not (try { Invoke-RestMethod ($url + 'api/ping') -TimeoutSec 2 } catch { $null })) { Use-Port ([int]$cfg.formPort) }
}
function Ping { try { Invoke-RestMethod ($url + 'api/ping') -TimeoutSec 2 } catch { $null } }
function Alive { $null -ne (Ping) }
function Venv-Ok {   # a venv only works while the Python it was made from still exists for this account
  $cfgFile = Join-Path $Aura 'venv\pyvenv.cfg'
  if (-not (Test-Path (Join-Path $Aura 'venv\Scripts\pythonw.exe')) -or -not (Test-Path $cfgFile)) { return $false }
  $pyHome = (Get-Content $cfgFile | Where-Object { $_ -match '^\s*home\s*=' } | Select-Object -First 1) -replace '^\s*home\s*=\s*', ''
  return ($pyHome -and (Test-Path (Join-Path $pyHome.Trim() 'python.exe')))
}
function Find-Pythonw {
  if (Venv-Ok) { return (Join-Path $Aura 'venv\Scripts\pythonw.exe') }
  $c = @(Get-ChildItem "$env:LOCALAPPDATA\Programs\Python\Python3*\pythonw.exe", "$env:ProgramFiles\Python3*\pythonw.exe" -ErrorAction SilentlyContinue |
         Sort-Object FullName -Descending | ForEach-Object { $_.FullName })
  foreach ($n in 'pythonw.exe', 'pyw.exe') { $g = Get-Command $n -ErrorAction SilentlyContinue; if ($g) { $c += $g.Source } }
  foreach ($p in $c) {
    if ($p -match 'WindowsApps') { continue }                       # the Microsoft Store placeholder, not a real Python
    $exe = $p -replace 'pythonw\.exe$', 'python.exe' -replace 'pyw\.exe$', 'py.exe'
    if (Test-Path $exe) { & $env:ComSpec /d /c ('"' + $exe + '" -c "import http.server" >nul 2>nul'); if ($LASTEXITCODE -eq 0) { return $p } }
  }
  return $null
}
function Stop-OldServer {
  # An older form server (from before the web app) answers ping without an api version: replace it.
  $owner = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess
  if (-not $owner) { return }
  $proc = Get-Process -Id $owner -ErrorAction SilentlyContinue
  if ($proc -and $proc.ProcessName -match '^(python|pythonw|py|pyw)$') {
    Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue
    for ($i = 0; $i -lt 20 -and (Alive); $i++) { Start-Sleep -Milliseconds 250 }
  }
}

$ping = Ping
if ($ping -and -not $ping.api) { Stop-OldServer; $ping = Ping }
if (-not $ping) {
  $pyw = Find-Pythonw
  if (-not $pyw) {
    $app = Join-Path $Aura 'Lumi.exe'
    if (Test-Path $app) { Start-Process -FilePath $app -ArgumentList '--repair'; exit 1 }   # the app explains and repairs
    Add-Type -AssemblyName PresentationFramework
    [void][Windows.MessageBox]::Show('Lumi needs a quick repair on this Windows account. Please download Lumi again and run it - your files and slides are kept.', 'Lumi', 'OK', 'Warning'); exit 1
  }
  Remove-Item $portFile -ErrorAction SilentlyContinue
  $srv = Start-Process -FilePath $pyw -ArgumentList ('"' + (Join-Path $PSScriptRoot 'form_server.py') + '"') -WindowStyle Hidden -PassThru
  for ($i = 0; $i -lt 40 -and -not (Alive); $i++) {
    Start-Sleep -Milliseconds 250
    $np = 0
    if ((Test-Path $portFile) -and [int]::TryParse((Get-Content $portFile -Raw).Trim(), [ref]$np) -and $np -gt 1023) { Use-Port $np }
    if ($srv.HasExited) { break }
  }
  if (-not (Alive)) {
    Add-Type -AssemblyName PresentationFramework
    [void][Windows.MessageBox]::Show('Lumi could not start its small helper on this PC (the port may be in use by another program). Please restart the PC and try again, or double-click "Send problem report".', 'Lumi', 'OK', 'Warning'); exit 1
  }
}

# Open as an app window in Edge (no tabs or address bar) when available, otherwise in the default browser.
# Fullscreen, not maximized (maximized keeps the title bar and the taskbar). --start-fullscreen, not --kiosk: kiosk
# takes the ways out away, and nobody may be shut in. F11 gives the window back, Alt+F4 closes it, and the page shows
# a "close lumi" control while the window has no title bar. installer/Lumi.cs OpenWindow is the same decision.
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
          "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe") | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
# --user-data-dir is required, not a nicety: Chromium only applies these flags to a browser PROCESS it starts,
# so when Edge is already open a new --app window joins it and --start-fullscreen is dropped (you get a title
# bar). Our own profile forces a separate process, and keeps Lumi out of the person's browsing profile.
$prof = Join-Path (Join-Path $Aura 'temp') 'browser'
if (-not (Test-Path $prof)) { New-Item -ItemType Directory -Force $prof | Out-Null }
if ($edge) { Start-Process -FilePath $edge -ArgumentList @("--app=$url", '--start-fullscreen', "--user-data-dir=$prof", '--no-first-run', '--no-default-browser-check') }
else { Start-Process $url }
