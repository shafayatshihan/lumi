# P4 — A label never covers the figure

You are in **`X:\aura-slide-by-shafayat`**, the source for **Lumi**, a Windows app that builds presentation decks
with headless Claude Code. v0.6.1 is published. **Three other Claude sessions are working in this repo right
now** — read the ownership section.

Owner: S. M. Shafayat Islam. Short, plain replies. Not a beginner.

**`engine/node_modules` is gitignored and the repo was re-cloned.** Run `npm install` in `engine/`.

---

## Why this exists

On a real slide — "AI racks have outgrown room air cooling" — two callout tags, **"Hot exhaust"** and **"Coil
door"**, landed on top of the server rack and on top of each other. The owner's rule, and he means it
system-wide:

> *"a universal rule: no label overlapping the figure, rather show it with arrows / or other means."*

**This is a universal rule for all five looks**, not a fix for one slide.

## Why it happens — read this before planning

Three separate causes, and the middle one is counter-intuitive:

1. **The Blender path has no placement logic at all.** `placeBlenderLabels` (`runtime.js:372`) sets
   `el.style.left = p[0]+'%'; el.style.top = p[1]+'%'` straight from the projected anchor. No clamp, no
   collision test, nothing. `_project_anchors` (`lumi_bpy.py:1096`) even **discards `v.z`**, so it does not know
   whether a point is behind the camera. The same is true of the baked player (`bake-player.js:263`).
2. **The live path's clamp makes it worse.** The five engines clamp labels to the holder and the 96 px safe zone
   (e.g. `studio3d.js:629-630`). "Clamp" here means *push inward into the frame* — which is precisely a push
   **onto the subject**. The rule meant to keep labels on screen is what puts them over the figure.
3. **Nothing checks it.** `deck_check.js:120` has a text-vs-text overlap test, and it is only a **warn**
   (`enforcement.md:74`). There is no text-over-figure check anywhere — in fact the contrast pass has a `dom`
   flag (`:113-118`) whose only job is to *excuse* text over a picture from being judged.

The only placement guidance that exists today is one docstring — `anchor()` (`lumi_bpy.py:1085`): *"Lift the
point above the part so the label sits beside it, not on it"* — which nothing enforces.

## What to build

**1. The rule, in `LOOK-BASE.md` §4.4** (lines 193-199), which today says only *"clamped to the holder and the
safe zone"*. Replace with: a label sits in **clear space outside the figure's silhouette**, joined to its part
by a short leader line. This is the shared base every look inherits — **additive edit, do not renumber**; other
sessions read this file.

**2. Implement it once, use it five times.** The five engines already share one contract (`data-follow`,
`data-align`, `data-dx/dy`): `studio3d.js:606`, `fp3d.js:231`, `pp3d.js:315`, `hs3d.js:296`, `cp3d.js:339`. Put
placement and the leader in **one shared helper**, not five copies.

`illus.js:253 F.callout` — *"a leader from the part to a disc and a word"* — is the existing precedent and the
only leader-line mechanism in the repo. It is 2D-only today; reuse its idea for 3D.

**3. Fix the Blender path too**, or the owner's own screenshot stays broken: `runtime.js:372` and
`bake-player.js:263` need the same placement, not raw percentages.

**4. Give the checker teeth.** Add label-over-figure as an **error** in `deck_check.js`, and register its message
in `enforcement.md`'s `<!-- checks: deck_check.js = … -->` list — `test_instructions.py` asserts that list
exists and matches, so an unregistered message fails the suite. Note the timing trap: Blender-path labels are
positioned at playback, and a holder that is not yet `[data-filled]` is `display:none` (`runtime.css:162`), so a
still frame captured too early sees no labels at all.

**5. Two known traps.**
- **Anchor behind the camera.** Only `studio3d.js:623` tests the frustum (`v.z > 1 || v.z < -1`), and nothing
  anywhere tests occlusion — a label can point at a part hidden behind the model.
- **Nowhere to go.** On a tight slide there may be no clear space. Decide what happens then — shrink, stack,
  fall back to numbered pins with a legend — and write the decision down rather than letting it clamp back over
  the figure.

**6. Count still matters.** `deck_check.js:318` warns above 4 projected labels; LOOK-BASE says 2–4. Leaders make
clutter easier, not harder — keep the limit.

## What you own

`engine/deck/runtime.js` label placement (`:366-393`), the five look engines' label functions,
`engine/deck/lib/illus.js`, `engine/deck/runtime.css` and the `.bb-tag`-family rules in the look themes,
`workspace/.claude/skills/aura-slide/looks/_shared/LOOK-BASE.md` §4.4 (**additive**), the per-look `LOOK.md`
label sections, `engine/tools/deck_check.js`, `workspace/.claude/skills/aura-slide/enforcement.md`.

**Do not touch:** `engine/form_server.py` at all (**P1 / P2 / P3** — use `docs/REGISTER-P4.md`),
`lumi_bake.py` and `bake-player.js`'s render setup (**P1** — the label block inside it is yours, coordinate),
`BlenderRenderer` and the queue (**P2**), `blender.js` and `lumi_bpy.py`'s camera code (**P3**).

Yours in docs: `docs/CLAIM-P4.md`, `docs/STATUS-P4.md`, `docs/REGISTER-P4.md`.

**You are independent of the other three** — nothing you need waits on them. Start immediately.

## Rules

1. **Never commit to main, push, tag, publish or bump the version.**
2. **Never touch `C:\Lumi`** except to read — the owner's live install.
3. **Ask before running `test_server.py` or the e2e.** `deck_check` work is easy to verify in a sandbox deck.
4. **Sandboxes at `X:\aura-dev-p4\`**, never inside the repo.
5. Write files with the Write tool, not bash heredocs.
6. **No new runtime dependency reaches a deck** — one offline HTML file, no CDN, no add-on ES modules.
7. **Render it and look at it**, in all five looks, at 1366×768 and 1920×1080.

## Report

10 lines to the owner. The test that matters: **rebuild his slide 2 and show the two tags that collided over the
rack now sitting clear of it, with leaders.** `docs/STATUS-P4.md` as you go. Say plainly anything in this brief
that turns out to be wrong when you read the code.

Claim it first: `docs/CLAIM-P4.md`.
