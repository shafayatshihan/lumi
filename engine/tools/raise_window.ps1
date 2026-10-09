param([Parameter(Mandatory = $true)][string]$Target, [switch]$ReuseOnly)

# Bring the Explorer window showing $Target to the front of Lumi.
#
# Lumi's own window is a FULLSCREEN Edge app window. Windows will not let a process that does not own the
# foreground steal it, so a folder Lumi opens lands BEHIND the app and the person sees nothing happen - exactly the
# way a fullscreen game swallows everything. SetForegroundWindow on its own is ignored in that situation;
# AttachThreadInput is what makes it work, by briefly sharing the input queue with the foreground thread.
#
# The folder is matched by its real path through Shell.Application, never by window title: every deck folder is
# named after the deck, so two windows share a title often, and a title is localised besides.
#
#   -ReuseOnly   exit 0 only if a window is ALREADY showing the folder (the caller then skips opening a second
#                one). Without it, wait up to 6 s for the window that is being opened to appear.

Add-Type @"
using System; using System.Runtime.InteropServices;
public class Fg {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
  public static void Raise(IntPtr h) {
    if (h == IntPtr.Zero) return;
    if (IsIconic(h)) { ShowWindow(h, 9); }                    // SW_RESTORE
    uint mine = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
    uint its  = GetWindowThreadProcessId(h, IntPtr.Zero);
    if (mine != its) { AttachThreadInput(mine, its, true); }
    BringWindowToTop(h); SetForegroundWindow(h);
    if (mine != its) { AttachThreadInput(mine, its, false); }
  }
}
"@ -ErrorAction Stop

function Get-Normalized([string]$p) {
  try { return ([System.IO.Path]::GetFullPath($p)).TrimEnd([char]92) } catch { return $p }
}

function Find-Window([string]$path) {
  try { $shell = New-Object -ComObject Shell.Application } catch { return [IntPtr]::Zero }
  foreach ($w in @($shell.Windows())) {
    try {
      $p = $w.Document.Folder.Self.Path
      if ($p -and ((Get-Normalized $p) -ieq $path)) { return [IntPtr]$w.HWND }
    } catch { }      # a Control Panel or Edge window in the same collection has no Folder; skip it
  }
  return [IntPtr]::Zero
}

$path = Get-Normalized $Target

if ($ReuseOnly) {
  $h = Find-Window $path
  if ($h -ne [IntPtr]::Zero) { [Fg]::Raise($h); exit 0 }
  exit 1
}

$deadline = (Get-Date).AddSeconds(6)
while ((Get-Date) -lt $deadline) {
  $h = Find-Window $path
  if ($h -ne [IntPtr]::Zero) { [Fg]::Raise($h); exit 0 }
  Start-Sleep -Milliseconds 200
}
exit 1
