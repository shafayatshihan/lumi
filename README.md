# Lumi

Beautiful, animated presentation slides for your thesis, project or class talk, made by Claude from your own report
and files. It works for any subject, so you don't need to know any coding. (Lumi was called Aura-Slide before v0.4.)

> Works with any Claude plan. **Pro or higher is recommended**: the Free plan has very little Claude Code usage, so builds may stop early.
> Windows 10 or 11 only.

## Get started (about 20 minutes, once)

1. **Download** [`Lumi.exe`](https://github.com/shafayatshihan/lumi/releases/latest/download/Lumi.exe) and double-click it.
   - If Windows says *"Windows protected your PC"*: click **More info** → **Run anyway**.
   - If Windows asks *"Do you want to allow this app to make changes?"*: click **Yes**.
2. Click **Install Lumi** and wait until it says **Lumi is ready**.

Lumi installs anything missing (Git, Node.js, Python, Claude Code and Blender), makes your folder at **`C:\Lumi`** and
puts a **Lumi** icon on your Desktop and in the Start menu.

Blender is [free software under the GNU GPL](https://www.blender.org/about/license/). Lumi downloads the official
portable build from `download.blender.org`, checks its SHA256 against the one pinned in `setup/blender/blender-pin.json`
and installs it in `C:\Lumi\.aura\blender`, with the licence text and a link to the matching source code next to it
(`BLENDER-SOURCE.txt`).

Coming from Aura-Slide? Your files in `C:\Aura-Slide by Shafayat` are copied into `C:\Lumi`. The old folder is left
alone; delete it yourself once you have checked your files.

## Make your slides

1. Open **Lumi** from the Desktop icon and press **make a new deck**.
2. Answer the questions and drop in your report, images, data and logo (they go into `3 - Put your files here`).
3. Press **make my slides**. Claude builds them while you watch, and asks in the chat if it needs anything.
4. Your finished slides appear in your library and in **`4 - Your slides`**. Open one to change it with Claude.

**Before presentation day:** the deck runs in Microsoft Edge or Google Chrome. Open the finished file once, in one of those two, on the computer you will present from. Firefox, Safari and very old browsers may not show the 3D scenes (the deck shows a message when it detects this). Always keep the **PDF** that Lumi makes next to it as your backup.

## Something went wrong?

- Run `Lumi.exe` again and choose **Repair Lumi**. It continues where it stopped.
- Still stuck? Open your Lumi folder and double-click **Send problem report**. Then send the ZIP that appears on
  your Desktop.

## For developers

| Path | What |
|---|---|
| `installer/Lumi.cs` | `Lumi.exe`: installer, updater and launcher (WinForms, .NET Framework 4, built by `tools/build_exe.py`) |
| `setup/setup.ps1` | Run by `Lumi.exe` (or `Setup Lumi.bat`): checks the PC, installs the tools, builds `C:\Lumi`, the icon and the shortcuts, and copies an old Aura-Slide folder across |
| `setup/aura.config.json` | Version, repo/release URLs, Python packages, app port |
| `setup/icon/lumi/` | The Lumi icon (`lumi.ico` for the exe and shortcuts, `lumi.png` for the app) |
| `engine/` | Copied to `.aura/engine`: the app server and web app, launchers, update, problem report, npm packages |
| `workspace/` | Copied to the user folder: `.claude/` (settings, CLAUDE.md, the `aura-slide` skill) |
| `tools/make_release.py` | Builds `release/Lumi-Setup.zip` (the files `Lumi.exe` downloads) |
| `Publish to GitHub.bat` → `tools/publish.ps1` | One-click commit + push (does not release; see Publishing) |

**Publishing is deliberate.** Pushing to `main` does **not** release anything. `.github/workflows/release.yml` runs only
when you push a tag `v<version>` or start it by hand (Actions, "Build release"). Before building it checks that
(1) the version in `setup/aura.config.json` is a plain `X.Y.Z` (a `-dev` version never publishes), (2) the tag equals
that version, and (3) no release of that version exists yet - it never overwrites published files (a manual run with
"overwrite" ticked is the only way, for repairs). To ship: change `version` (drop `-dev`), commit and push, then
`git tag v<version>` and `git push origin v<version>`. `Publish to GitHub.bat` only commits and pushes. The links
`releases/latest/download/Lumi.exe` and `.../Lumi-Setup.zip` serve the newest release.

## License

MIT © 2026 S. M. Shafayat Islam

Lumi ships [power-design](https://github.com/ItsssssJack/power-design) by Jack Roberts (MIT) in
`workspace/.claude/skills/power-design/`, with its LICENSE file.
