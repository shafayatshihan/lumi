# Brief for a second Claude: build the missing looks

> **2026-10-07: Yellow Frame is CANCELLED** — the owner cut it ("it looks ugly"). This brief now
> covers **Pink Punch and Happy Headspace only**. See `docs/STOP-yellow-frame.md`. Every mention of
> Yellow Frame below is struck out and left in place so the change is visible.

You are working in **`X:\aura-slide-by-shafayat`**, the source repo for **Lumi** — a Windows app that builds
presentation decks with headless Claude Code. Another Claude session is working in this same repo at the same
time. **Read the file-ownership section before you touch anything.**

Owner: S. M. Shafayat Islam. They want short, plain replies and no wasted tokens. They are not a beginner.

---

## 1. The job

`engine/form/js/looks.js` offered **five looks**; one is now cancelled and only **two of the remaining four exist**:

| look | theme CSS today | status |
|---|---|---|
| Bold Blue | 285 lines | real |
| Flat-Pack | 250 lines | real |
| **Pink Punch** | **25 lines** | **a name and an icon, nothing behind it** |
| **Happy Headspace** | **29 lines** | **ditto** |
| ~~Yellow Frame~~ | — | **CANCELLED 2026-10-07, deleted from the product** |

Someone who picks Pink Punch gets a one-line description and then Claude improvises with no rules. That has
already caused a real bug. **Your job is to build the two remaining ones properly.**

The owner's rule: *every look follows the same structural rules as Bold Blue; only brand style and aesthetics
differ.* The shared rules already exist, so you are only writing brand.

Their quality bar, in their words: *"show everyone via the slides that you are an avant-garde designer, and the
best in the world at making these."* These must not be Bold Blue with the colours swapped.

---

## 2. Read these first, in this order

1. `workspace/.claude/skills/aura-slide/looks/_shared/LOOK-BASE.md` — **the look-neutral base.** Everything
   structural lives here: slide skeleton, archetype catalogue, composition, subject-first staging, capture
   contract, charts, data honesty, voice, checklist. Your looks inherit all of it. Do not repeat any of it.
2. `workspace/.claude/skills/aura-slide/looks/bold-blue/LOOK.md` (~334 lines) and
   `workspace/.claude/skills/aura-slide/looks/flat-pack/LOOK.md` — the two worked examples of a brand-only look
   file. **Flat-Pack is the better model**: it was built on the base, Bold Blue was retro-fitted.
3. `engine/deck/looks/flat-pack/` — the complete file set for one look: `template.html`, `flat-pack.js`
   (its chart helper `FPChart`), `fp3d.js` (its figure engine `FP3D`), `archetypes/*.html` (ten of them).
4. `engine/deck/themes/flat-pack.css` (250 lines) versus `engine/deck/themes/pink-punch.css` (25) — the gap you
   are closing.
5. `engine/rules/hard-rules.json` — **all numbers live here**, per look. Word budgets, type scale, floors.
   Never put a number in a LOOK.md.

---

## 3. The three looks, and the brand DNA already in the repo

`workspace/.claude/skills/aura-slide/brands/` holds research for each. Use it.

| look | `looks.js` description | brand DNA folder |
|---|---|---|
| **Pink Punch** | "loud and playful: bold outlines, hard shadows, hot pink" | `brands/gumroad/brand-style.md` |
| **Happy Headspace** | "warm and calm: soft round shapes, orange first" | `brands/headspace/brand-style.md` |
| ~~Yellow Frame~~ | ~~cancelled~~ | ~~`brands/national-geographic/`~~ (both deleted) |

(`brands/ikea` was the source for Flat-Pack — read it alongside `flat-pack/LOOK.md` to see how DNA became a look.)

Each look needs its own **figure language**, not just a palette. Flat-Pack's `FP3D` is an orthographic
assembly-drawing sheet with no lights, flat fills and inverted-hull outlines — because an instruction manual
*is* that. Ask the same question for each of yours: what does a figure in this visual language actually look
like, and does it want 3D at all?

**That last question must be answered explicitly in code.** Every look declares a 3D policy. Flat-Pack is
`threejs` and never Blender. A look that silently has no 3D path caused a deck to refuse to finish — do not
repeat it.

---

## 4. What each look needs (copy Flat-Pack's shape)

- `workspace/.claude/skills/aura-slide/looks/<slug>/LOOK.md` — brand only, on the base. Palette, type, motion
  feel, figure idiom, the look's own staging rules. No numbers, no structural rules.
- `engine/deck/themes/<slug>.css` — the real theme (Flat-Pack is 250 lines; the stubs are ~25).
- `engine/deck/looks/<slug>/template.html`
- `engine/deck/looks/<slug>/<slug>.js` — the chart/helper for this look (cf. `FPChart`)
- `engine/deck/looks/<slug>/<figure>.js` — the figure engine, **or** an explicit, documented "2D only" policy
- `engine/deck/looks/<slug>/archetypes/*.html` — the ten archetypes named in the base's catalogue

---

## 5. FILE OWNERSHIP — read this, another session is live in the repo

**Yours, exclusively:**
- `engine/deck/themes/{pink-punch,happy-headspace}.css`
- `engine/deck/looks/{pink-punch,happy-headspace}/**` (new)
- `workspace/.claude/skills/aura-slide/looks/{pink-punch,happy-headspace}/**` (new)

**DO NOT EDIT — another session is in them right now.** Edits here will be lost or will collide:
- `engine/form_server.py`
- `engine/form/js/` (anything)
- `engine/form/css/` (anything)
- `engine/deck/lib/`, `engine/deck/looks/bold-blue/studio3d.js`, `engine/deck/looks/flat-pack/fp3d.js`
- `workspace/.claude/skills/aura-slide/looks/_shared/LOOK-BASE.md` (read it, never write it)
- `installer/Lumi.cs`, `engine/form.ps1`
- `RESUME.md`, `BACKLOG.md`, `FIXLOG.md`, anything else in `docs/`

**Shared registration points — DO NOT EDIT THEM EITHER.** A new look has to be registered in several shared
files (`form_server.py`'s `LOOK_3D` / `LOOK_SPECS`, `engine/tools/new_deck.js`, `engine/rules/hard-rules.json`,
the `CLAUDE.md` numbers table, and the skill-doc pointers). Those files belong to the other session.

**Instead: write the exact snippets you need applied into a new file**
`docs/new-looks-registration.md` — one section per file, each with the precise text to insert and where. The
coordinating session will apply them once the other work lands. **That file is yours to create; nothing else in
`docs/` is.**

---

## 6. Rules you must not break

1. **Never commit, push, tag or publish. Never bump the version.** v0.5.5 is the live release; the coordinating
   session handles all git.
2. **Never touch `C:\Lumi`** except to read. That is the owner's live install with their real decks in it.
3. **Do not run the test suites** (`test_server.py`, `test_frontend.py`, `test_permissions_real.py`). The owner
   has paused testing while they evaluate, and the suites are unreliable when two sessions load the machine.
   **Do** syntax-check everything: `node --check` for JS, and open each HTML to confirm it parses.
4. **Never create a sandbox inside the repo.** One was accidentally committed today. Put any scratch work under
   `X:\aura-dev-*` or a temp folder.
5. Write files with the Write tool, not bash heredocs — backslashes get mangled on Windows.
6. **Numbers go in `hard-rules.json` only** (via your registration file), never in a LOOK.md.
7. Text floor is 14 stage px, 12 for micro-labels only. Nothing may overflow the stage at 1366x768 or 1920x1080.
8. Keep the copy standard: any user-visible string says what it does in as few words as possible. A button is
   two to four words, never a sentence.
9. At most 4 typefaces per deck, and **only public-licence fonts ship** — Work Sans, Quicksand OFL, Reno Mono
   CC BY, plus what is already in `engine/fonts/`. Check `engine/fonts/licenses/` before naming a face.

---

## 7. How to tell it works, without the suites

Build a deck shell and render it. From a sandbox copy of the install (not the repo):

```
node .aura/engine/tools/new_deck.js --theme pink-punch
```

then serve the folder over HTTP (`python -m http.server 8878`) and open the built `index.html` in a browser —
**`file://` will not work**, three.js is blocked by CORS. Screenshot it at 1600x900 and **look at it**. A look
that has never been rendered is not finished; Flat-Pack shipped with its title colliding with its own figure
because nobody looked.

---

## 8. What to report back

Keep it to 10 lines or fewer, for each look:
- its figure language in one sentence, and its 3D policy with the reason;
- what you created;
- confirmation you rendered it and looked at it, and anything that looked wrong;
- anything you could not do because a file was owned by the other session.

Plus: the path to `docs/new-looks-registration.md` and a one-line summary of what it asks to be applied.


---

## 9. You are on a separate Claude account, with your own budget

You have your own 5-hour usage window, independent of the coordinating session's. Two consequences:

**Do both looks properly rather than rushing one.** You are not competing for budget. A look is roughly
15 files; two is a real afternoon's work. Quality beats speed here — the owner's bar is "the best in the
world at making these", and a thin look is worse than no look because it ships a promise the product cannot
keep.

**But you ARE sharing one machine**, so two things still apply:
- **File conflicts are real.** Section 5 is binding. The other session is actively editing `form_server.py`,
  everything under `engine/form/`, `engine/deck/lib/`, `studio3d.js`, `fp3d.js`, `Lumi.cs` and `form.ps1`.
- **Test suites fight each other.** Running `test_server.py` or the Playwright e2e while the other session is
  also testing produces phantom failures — this already cost hours today: 1288/1295 on one run and a different
  5 failures on another, none of them real, plus a crashed browser. **Light checks are fine and encouraged**
  (`node --check`, rendering a deck and looking at it, opening an HTML). **Do not run the full suites** unless
  the owner tells you the other session has stopped.

## 10. Report progress to a file, not just to the owner

The coordinating session cannot see your messages. So that it can pick up your work without the owner relaying
everything by hand, keep a short status file at:

```
X:\aura-slide-by-shafayat\docs\STATUS-three-looks.md
```

Overwrite it as you go. Keep it to ~15 lines: which looks are done, which files you created, your 3D policy and
figure language for each, whether you rendered and looked at each one, anything blocked on a file you do not
own, and what is left. That file plus `docs/new-looks-registration.md` are the whole handover — write them as
if the reader has never spoken to you, because they have not.
