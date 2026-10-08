# Brief for a Claude account: the build page — a new slide must appear at once, and the e2e walk must pass

You are in **`X:\aura-slide-by-shafayat`**, the source for **Lumi** — a Windows app that builds presentation decks
with headless Claude Code. **v0.5.6 is published.** One other Claude session (the coordinating one) is working in
this repo at the same time, on `engine/form_server.py` and the release. **Read the ownership section.**

Owner: S. M. Shafayat Islam. Short, plain replies, no wasted tokens. Not a beginner.

---

## 1. The bug the owner just reported — do this first

> *"if a slide is created there is a bug, it is not shown on left slide bar or on the screen instantly."*

Add a slide on the build page and it saves, but the left strip and the preview do not show it until something
else happens to refresh them. **It is a real bug and the owner hit it in normal use.**

**Where to start.** The add goes through `engine/form/js/editor.js:695`:

```js
const saveB = dlgBtn('save', () => write(
  () => (isNew ? store.addSlide(next) : store.saveSlide({ ...next, id: s.id })),
  isNew ? 'added.' : 'saved.'), true);
```

Compare what *other* successful mutations do in the same file — `:571` and `:756` both finish with

```js
loadFrame(...); thumbs = []; paintStrip(); loadThumbs(); loadDeck();
```

The strip is painted by `paintStrip()` (`:223`) and the deck record is reloaded by `loadDeck()`. The suspicion is
that the add path does neither and simply waits for the next poll to notice. **Confirm that before you fix it** —
read `write()` and the polling path (`:756` is inside it) and find out what actually refreshes, because a fix
aimed at the wrong half will look right on a fast machine and still fail on a slow one.

Two things to get right while you are there:
- **Removing** a slide and **reordering** go through the same dialog. Check all three, not just add.
- The e2e already covers this and **passes** (`add / remove a slide mid-build (W-01)`), which means the test
  asserts the server state, not what the person can see. If you fix the bug, **make the test see it**: assert the
  strip and the preview, not only the API.

---

## 2. The e2e walk, which does not pass

`python tools/form-dev/test_frontend.py --e2e` is **36/37** and **26/29** at both 1366x768 and 1920x1080. v0.5.6
shipped with these known. Clearing them is the rest of your job.

### 2a. Three blender-walk misses: the baked pipeline landed and the test predates it

```
FAIL plan: a turning 3D slide shows the animation estimates at 720p and 1080p  -> "studio render · blenderphoto-real; ≈ 4 min"
FAIL build: slide 2 (animation) offers 720p and 1080p, each with its estimate, 720p first  -> null
FAIL the walk ran to the end  -> TypeError: Cannot read properties of null (reading 'textContent')
```

What changed: `est.baked` is true now, so `engineNotes()` in `engine/form/js/blender.js:52-57` returns **one**
estimate instead of `720p ≈ x, 1080p ≈ y`, and the build page no longer offers the two resolutions at all — hence
`null`, and the third failure is just the walk tripping over that null.

**This is probably correct** (a baked animation renders once, so there is no per-resolution choice) **but nobody
has looked at it.** So:
1. Build one 3D animated slide and **look at the build page**. What does it offer now? Is there anything there at
   all where the resolution choice used to be? Does the person still learn what the render will cost them?
2. Decide what that surface *should* say for a baked animation, and make it say that.
3. Then update `tools/form-dev/e2e_blender.js` (lines ~110 and ~123) to the baked reality — accepting the
   per-resolution form too, since a non-baked look still produces it.

**Do not just loosen the regex.** The test exists because the person needs to know what a render costs before they
commit to it. If the baked path tells them nothing, the fix is in the page, not in the test.

(`"blenderphoto-real"` in that output is **not** a display bug — I checked. The chip is three separate spans and
the test reads their concatenated `textContent`.)

### 2b. Two e2e misses nobody has diagnosed

```
[1366x768]  FAIL the slide being built right now says so
[1920x1080] FAIL the slide being built right now says so
[1920x1080] FAIL claude's questions lock the build and take focus
```

Both are build-page behaviours and both are squarely yours. The second failing **only at 1920x1080** is a clue —
suspect layout or focus order at that size before you suspect the logic.

---

## 3. What the coordinating session is changing underneath you

So you are not surprised by it:

- **One conversation per deck.** `form_server.RUNNER.launch()` now nulls `conv`, so every build and edit runs in
  the deck's single session instead of one conversation per slide (owner's call, 2026-10-08). The per-slide
  plumbing is still there, unused. If a build-page behaviour you are testing depends on `conv`, that is why.
- The picture mix a plan suggests is now 30% studio-render animation / 40% studio-render still / 30% illustration,
  with slides 1 and 2 always animated (`hard-rules.json` → `pictureMix`, `planning.md`).
- `lumiArt()` returns an `<img>` of the real plush now, not a drawn SVG. The waiting game's flyer is that image.

---

## 4. FILE OWNERSHIP

**Yours:**
- `engine/form/js/editor.js`, `engine/form/js/scenes/edit-bench.js`, `engine/form/js/scenes/workshop.js`,
  `engine/form/js/workshop.js`, `engine/form/js/blender.js`, `engine/form/js/plan-store.js`
- `engine/form/css/studio.css` (the build page), and the build-page parts of `engine/form/css/components.css`
- `tools/form-dev/e2e_blender.js`, `tools/form-dev/e2e_walk.js`, `tools/form-dev/test_frontend.mjs`

**Do NOT edit — the coordinating session is in them:**
- `engine/form_server.py` — put anything you need in `docs/REGISTER-BUILDPAGE.md`
- `engine/form/js/{looks,home,plan,lumi-art,lumi-play,loading}.js`, `engine/form/css/{theme,plan}.css`
- `engine/deck/**`, `engine/tools/**`, `engine/rules/**`, `setup/**`, `installer/**`
- `RESUME.md`, `BACKLOG.md`, `FIXLOG.md`, `CLAUDE.md`, everything in `docs/` except your three files

**Yours in `docs/`:** `docs/CLAIM-BUILDPAGE.md`, `docs/STATUS-BUILDPAGE.md`, `docs/REGISTER-BUILDPAGE.md`.

---

## 5. Rules

1. **Never commit, push, tag or publish. Never bump the version.** The coordinating session owns all git. v0.5.6
   is live; a backup of repo and install is at `X:\lumi-backup-20261007-212954\`.
2. **Never touch `C:\Lumi`** except to read — the owner's live install with their real decks in it.
3. **You MAY run the e2e** (`test_frontend.py --e2e`) — it is your job. Check with the owner before running
   `test_server.py`, which the other session is changing. Two sessions running suites at once produce phantom
   failures; this already cost hours.
4. **Never create a sandbox inside the repo.** Use `X:\aura-dev-build\`. Note `test_batch_e.py` needs its sandbox
   to have an `.aura\engine` junction — an empty folder gives four false failures.
5. Write files with the **Write tool**, not bash heredocs — backslashes get mangled on Windows.
6. **Render it and look at it.** Serve over HTTP (`python tools/form-dev/static_server.py 8790`); `file://` fails
   on CORS for three.js. The dev harness cannot get past the loading screen, so the build page needs a real
   `form_server.py` run with the fake Claude — `test_frontend.py --e2e` does exactly that and leaves screenshots
   in `%TEMP%\lumi-e2e\`.
7. Copy standard: a control says what it does in two to four words. Error text is exempt — it must stay
   actionable.

---

## 6. Report back

**To the owner:** 10 lines or fewer — what the slide bug actually was, what you changed, what you looked at, the
e2e numbers before and after, and anything in this brief that turned out to be wrong when you read the code.

**To `docs/STATUS-BUILDPAGE.md`**, because the coordinating session cannot see your messages: done, in progress,
blocked, files touched, e2e numbers. That file plus `docs/REGISTER-BUILDPAGE.md` are the whole handover.

**Claim it first:** `docs/CLAIM-BUILDPAGE.md` with the time and one line on your plan.
