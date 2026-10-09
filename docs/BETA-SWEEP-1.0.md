# Beta sweep before the 1.0 drop — 2026-10-09

Everything below was **measured on this machine**, against the installed app at `C:\Lumi` and the repo at
`X:\aura-slide-by-shafayat`. Where a number is given it came out of a probe, not a reading of the code. Where I
could not confirm something, it says so.

Harnesses used are throwaway and live in the session scratchpad; the two worth keeping are described in §A1.

---

## A. Fixed in this sweep

### A1. Labels thrash on every Blender loop — the one you reported

**Measured, before:** Nigerian Timber slide 4, all six species labels, over 90 samples of a playing loop:

| label | range | worst single-frame step |
| :--- | ---: | ---: |
| afara | 126.5 px | 82.7 px |
| iroko | 188.2 px | 130.1 px |
| mahogany | 163.1 px | 153.4 px |
| mansonia | 189.1 px | 164.3 px |
| opepe | 152.5 px | 152.5 px |
| teak | 146.6 px | 145.3 px |

**Cause.** `placeBlenderLabels` (`engine/deck/runtime.js`) runs on *every animation frame* and re-solves the whole
arrangement from scratch. The solver is greedy, so a few pixels of anchor movement reorders the candidate list and
two labels swap slots. With six labels that happens somewhere in the frame almost every frame. Hysteresis is not
allowed to fix it — the capture contract forbids reading the previous frame, because `seek(t)` and the recorded
loop have to agree exactly.

**Fix.** A label's box is solved **once per arrangement and held**; only the leader line follows the moving part.
That is also how a person annotates a moving figure — the callout is still, the line tracks. Slots are cached on
the holder keyed by a signature built from the holder size and *all* anchor names, so a re-solve happens only when
the arrangement genuinely changes (a resize, or a label appearing/disappearing). It lives in `LumiLabel.place()`,
so **every look inherits it** — this cannot come back one theme at a time.

**Measured, after:** every label **0.0 px** range, 0.0 px worst step, on slide 4 (6 labels) and slide 9 (3 labels).
Leaders still track: all six anchor dots move, up to 43 px over 1.5 s. `data-labels-crowded` is false, so nothing
was parked on the figure to achieve it.

A follow-up in the same place: the silhouette canvas was being re-read ~5×/s forever. It can no longer change where
anything sits once slots are held, so it is now read only while the labels are still unsolved. A resize still
refreshes it. That is pure jank removal on a weak machine mid-presentation.

> Keep the two probes if you ever touch the placer again: one samples `style.transform` of every `[data-anchor]`
> 90× during playback and reports range + worst step; the other checks the leader dots still move. A placer change
> that passes the first and fails the second has frozen the annotation, which is worse than the jumping.

### A2. The black window popping up again and again

`_usage_probe_work()` in `engine/form_server.py` spawned the Claude CLI **without `CREATE_NO_WINDOW`**, so a console
flashed over the app every time the plan pill refreshed itself (at most every 150 s, whenever `/api/usage` is being
polled — i.e. constantly while you are on the home, look, editor, plan or build screen).

This was mine, added earlier in this same session when I made the usage pill self-refresh. Fixed, and it now also
runs with `child_env()` like every other spawn.

### A3. The same defect in two tools that ship and run while you work

A console app launched from a windowless parent opens its *own* console window on Windows. Found by scanning every
`subprocess.run`/`Popen` in the tree for a missing `creationflags`:

* `engine/tools/pack_deck.py` → `three_min.js`, which runs **on every save**;
* `engine/tools/export_pptx.py` → `shoot_slides.js`, which runs **on every PowerPoint export**.

The other 50 hits are test tooling and do not ship.

### A4. Explorer windows stack up, and the raise could grab the wrong one

Two separate problems, both found by looking at the actual process list rather than the code:

1. `explorer.exe <folder>` opens a **new window every time**, even when that exact folder is already open. There
   were **three identical "4 - Your slides" windows** open on this machine when I checked.
2. The raise logic I added earlier picked "the explorer process with the newest start time". On Windows 11 the
   shell itself is an `explorer.exe` with a window handle and a blank title, so that heuristic can raise the
   **desktop** — which would hide Lumi rather than show a folder.

Rewritten as `engine/tools/raise_window.ps1`: match the window by its **real folder path** through
`Shell.Application` (never by title — every deck folder is named after the deck, and titles are localised), and
raise it with `AttachThreadInput`, which is what actually defeats Windows' foreground lock from a process that does
not own the foreground. `launch()` now looks for an existing window first and reuses it instead of stacking another.

Tested directly: exit 0 and the window raised for a folder that is open, exit 1 for one that is not.

### A5. "close lumi" was effectively invisible — 2.36:1

In fullscreen there is no title bar, so this pill is **the only way out with a mouse**. `shell.js` says in its own
header that "a person must never be shut in a window they cannot see a way out of" — and then the CSS set it to
`opacity:.35`, which measures **2.36:1** against the lavender shell, against a 4.5:1 minimum. Raised to `.72`,
which clears the bar and is still quiet; hover and keyboard focus still go to full.

Found by a contrast audit of every text node on home and the look page. After excluding elements sitting on
gradients (where this method cannot measure), **this was the only failure on either screen** — the rest of the UI
is clean.

### A6. Exporting a deck kept on another drive was broken

`serveRootFor()` in `engine/tools/lib/deckpage.js` tested containment with
`path.relative(root, deck).startsWith('..')`. On Windows, `path.relative` **across drive letters returns an absolute
path** (`C:\Users\...`), which does not start with `..` — so a deck on `D:` with Lumi on `C:` was judged "inside the
Lumi root", served from a folder that does not contain it, and **every request 404'd**. This is on the path used by
PowerPoint export, PDF export and the speaker-notes export.

Reproduced (404, blank page) and fixed with the missing `isAbsolute` half of the test; now 200.

### A7. Junk deck folders from a path used as a title

`new_deck.js` slugged whatever it was given as the title. Called with a folder — which is what happens when the
`--ids` flag is left off — it stripped the separators and created a deck named after the path. There are **four of
these** on this machine:

```
.aura/temp/build/clumiauratempbuildfire-resistance-of-nigerian-ti
.aura/temp/build/clumiauratempbuildhow-the-bifurcation-angle-shap
.aura/temp/build/clumiauratempbuildhow-to-use-lumi-ed044c
.aura/temp/build/clumiauratempbuildplain-or-wavy-fins-for-ai-serv
```

Each is an empty shell that sits there forever. `new_deck.js` now refuses a title that looks like a path and prints
the `--ids` command that was meant. Verified both ways: the path is rejected, a normal title still works.

The four folders above are **safe to delete** — I left them alone rather than deleting your files.

### A8. I broke packing mid-sweep, and the suite caught it

Adding the `NO_WINDOW` constant to `pack_deck.py` raised `NameError: subprocess` at import, because that module
imports `subprocess` lazily inside the function. **Packing failed outright** for as long as that was in. Caught by
`test_server.py`, fixed, and both tools now import-checked. Recording it because it is the clearest evidence this
session that the suite earns its runtime.

---

## B. Found, not fixed — these need your call

### B1. A packed deck freezes the runtime, and "save and export" does not refresh it ← the big one

**This corrects what I told you earlier.** I said re-exporting a deck would pick up the label fix and the export
colour fix. It does not.

`pack_deck.py` inlines `runtime.js` and `runtime.css` as text at pack time. Finalize then takes the
**already-packed** editable deck and only embeds the recorded videos into a copy of it. It never re-inlines the
engine. Measured, on a real export I ran end to end just now (25 s, 11 slides, PDF written):

| | LumiLabel | label travel | has `data-aura-rec-bg` |
| :--- | :--- | ---: | :--- |
| freshly exported via finalize | **1.0** | **189.1 px — still jumps** | no |
| repacked from the build folder | **1.1** | 0.0 px | yes |

So two consequences:

1. **Your five existing decks keep both bugs** until they are repacked.
2. **Every future runtime fix will never reach a deck that already exists.** That is the part that matters past
   tomorrow.

The good news is that a repack is safe: `edit_text()` writes every text tweak to **both** the packed deck and the
build folder, so the build folder is not stale with respect to your edits, and all five decks still have one. The
one exception the code itself notes: an edit whose id is missing from an older build folder lands only in the
packed deck, and that single edit would be lost.

* **DONE for your five decks.** Each was repacked from its build folder with Lumi's own post-build call
  (`new_deck.js --ids`, then `pack_deck.py <build> --out .aura/decks/<id> --replace`). Proved lossless: all 588
  `data-edit` texts were snapshotted before and compared after — **0 lost, 0 altered** (653 after, the extra 65
  being ids the `--ids` step added to elements that had none). All five now report LumiLabel 1.1 and carry
  `data-aura-rec-bg`, and timber slide 4 measures 0.0 px travel straight out of the deck library. A copy of the
  decks as they were is in the session scratchpad.
* **Still true for every deck made before this build, and for every runtime fix after today.** Only this instance
  was cleared; the architecture that caused it is unchanged.
* **After launch, the proper fix:** have `pack_deck` tag the inlined blocks (`<script id="lumi-runtime">`,
  `<style id="lumi-runtime-css">`) and refresh exactly those two before a finalize. Tagged blocks make it exact
  surgery instead of content-sniffing. I did not want to land that untested the night before a drop.

### B2. RESOLVED - both failures were flaky

A later clean run of `test_server.py` came back **1397/1397**, with both earlier failures passing. Recorded here
because the first run showed two:

* `MIGRATION: and it reaches a plan with slides` — the known flaky one, waits on a fake-Claude run.
* `different account: logout, then login (in that order)` — expected `['auth logout', 'auth login']`, got
  `['auth logout']`. It asserts on the order of an **asynchronous** sign-in subprocess appending to a log, so it
  looks like a race in the test rather than in the product, and it is in code I did not touch. I could not isolate
  it: `test_signin.py` is a module run by `test_server.py` and will not run standalone, so confirming it means
  another full suite run. **Unresolved — worth one more run before you ship.**

### B3. Smaller things, in descending order of how likely you are to hear about them

* **"Older versions" has no cap.** Every export retires the previous copy into it, forever. A 4 MB deck exported
  thirty times leaves ~120 MB quietly. Nothing deletes it.
* **Offline start costs up to 4 s.** The first health check of each run always asks GitHub (deliberately — it is
  what made updates show up), with a 4 s timeout, and both success and failure are cached after. Once per run, so
  it is a slow boot offline, not a hang.
* **Below ~1120 px wide the window scrolls** rather than shrinking further (`MIN_SCALE = 0.7`), and below 700 px
  there is a proper "too narrow" screen. This is a documented decision, not a defect — but now that Lumi can be
  used windowed, someone on a small laptop will meet it. At 1024×640 I measured a horizontal scrollbar and the
  top bar pushed off the right edge.
* **Four junk build folders** (A7) to delete.

---

## C. Checked and clean — so you know what is covered

* **Double-clicking an exported deck** (`file://`, no server, no network — the way anyone you send it to will open
  it): loads, `auraReady`, 13 slides, **zero page errors, zero failed requests**, renders correctly including the
  violet. This was the one I most expected to fail, because `file://` blocks ES-module loading; the packer inlines
  everything, so it holds.
* **A real export end to end**: 11 slides, 1 loop, 25 s, HTML + PDF both written, no failures.
* **Contrast** across home and the look page: one failure (A5), now fixed.
* **All five looks** have their four chooser stills; the chooser offers exactly those five plus "Claude chooses".
* **The three deleted themes** are gone from everything that ships (one stale comment in `post.js` mentions
  Flat-Pack).
* **No missing UI assets**, and no `aura` branding left anywhere a person can see.
* **Filename sanitisation** handles reserved device names (`CON`, `COM1`…), trailing dots, control characters and
  a 110-character cap.
* **Home screen geometry**: deck cards all 256 px tall, thumbnails all exactly 16:9, titles all carry a tooltip —
  I thought the grid looked ragged in a screenshot and it does not; the unevenness is inside the thumbnail images.
* `test_instructions.py` **117/117**.

---

## D. If you only do three things before dropping

1. Decide on **B1** — at minimum repack your five decks, so the first thing anyone sees is not a slide with six
   labels thrashing.
2. Run the suite once more for **B2**.
3. Publish, then re-check the plan pill for a minute: **A2** is the one a user would report within five minutes of
   opening the app, and it is the one I cannot prove is gone without watching the installed build.
