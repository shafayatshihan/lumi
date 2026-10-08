# P1 — Real renders: stop baking, go back to Cycles

You are in **`X:\aura-slide-by-shafayat`**, the source for **Lumi**, a Windows app that builds presentation decks
with headless Claude Code. v0.6.1 is published. **Three other Claude sessions are working in this repo right
now** — read the ownership section.

Owner: S. M. Shafayat Islam. Short, plain replies. Not a beginner.

**`engine/node_modules` is gitignored and the repo was re-cloned, so it is missing.** Run `npm install` in
`engine/`.

---

## Why this exists

Building a real deck, the owner noticed the figure on the slide looked flatter than the picture he had just
approved. He was right, and the cause is that they are **two different renderers**:

- the approval card shows `bake/draft/poster.png` — *"one Cycles frame of the baked materials in the real
  studio"* (`lumi_bake.py:601`), path-traced through AgX;
- the slide plays the baked GLB in **three.js**, which has no global illumination.

So the person approves one picture and the deck ships another. **The owner's decision: quality wins, pay the
cost overnight.** Baking is dropped; animations go back to per-frame Cycles.

Know what that costs, because it is the whole reason P2 exists: measured on his MX350, one 120-frame loop is
**117 minutes** of Cycles against 396 s baked.

## What to do

**1. Stop baking.** `rec['bake']` is written in exactly **one place** — `form_server.py:994`, pinned at deck
creation and assigned nowhere else. Flip it. Then `bl_baked()` (`:4928`) returns `False` everywhere and
`BlenderRenderer.full()` (`:5419`) takes the per-frame `--anim` path.

**The per-frame machinery is fully intact — you are re-enabling it, not building it.** `full()` already builds
`['--anim', '--height', res, '--fps', …, '--samples', …]`; `_render()` (`:5655`) already encodes
`frame_*.png` → `final.mp4` via ffmpeg; `--resume` already exists (`lumi_bpy.py:1505`).

Three consequences you get for free, worth verifying rather than assuming:
- `bl_estimates()` branches on `bl_baked` at `:5064`, so animation ETAs revert to the Cycles model at `:5073`
  with no change.
- `_ask_yield` (`:5311`) refuses to preempt a job with `meta['baked']`. With baking off every animation becomes
  yieldable again — which is what keeps a queue of two-hour jobs responsive to a newly approved still.
- The glass escape hatch (`bl_glass` `:4934`, which forced Cycles when a scene used `trans=`) becomes
  irrelevant. Note it in the code rather than deleting it.

**2. Retire the bake path, do not delete it.** Leave `lumi_bake.py`, `engine/deck/lib/bake-player.js` and the
packer's baked branch (`pack_deck.py:194-232`) in the tree, unreferenced, each with a header saying why it is
dormant and what would revive it. **Decks already carrying `bake: True` must keep working** — their finished
renders are the owner's real work and `bl_view:5164` still serves `bake/final/model.glb`. Ripping the path out is
a release's worth of risk for no gain.

**3. Guard the still path.** A 3D still on **Bold Blue or Clay Pop** must never silently become three.js. The
owner's rule: fall back **and say so plainly**. `slide_engine()` (`:4964`) already returns a `note`
(`blender-missing`, `look-no-blender`) — it is computed and then not surfaced. Make the card say it.

Stills on **Flat-Pack, Pink Punch and Happy Headspace stay three.js** and that is deliberate: an assembly
drawing, a screen print and a soft-lit form are not photographs. Do not "improve" them into Cycles.

**4. One fix of mine is already in your file.** `bake-player.js` now sets `ACESFilmicToneMapping` — it had **no
tone mapping at all**, which is why baked slides rendered grey (`lumi_bpy.py:31` says in as many words that
untone-mapped AgX "is washed out and grey on this high-key studio"). Keep it for dormant decks. It is recorded in
`docs/REGISTER-P1.md`.

## What you own

`engine/form_server.py` **only** the Blender routing/estimates region (≈`4700-5230`, `5900-6300`),
`engine/deck/blender/lumi_bake.py`, `engine/deck/lib/bake-player.js`, the bake branches of
`engine/tools/pack_deck.py`, `tools/form-dev/test_blender*.py`.

**Do not touch:** `BlenderRenderer` itself (`:5227-5849`), `Runner`, `after_run`, `reconcile_interrupted`, the
reaper — all **P2**. The camera action and `blender.js` — **P3**. `runtime.js`, the look engines, `LOOK-BASE.md`,
`deck_check.js` — **P4**. `RESUME.md`, `BACKLOG.md`, `FIXLOG.md`, the rest of `docs/`.

Yours in docs: `docs/CLAIM-P1.md`, `docs/STATUS-P1.md`, `docs/REGISTER-P1.md`.

## Sequencing — you are first

**Land the `bake` flip as one small, revertible commit and tell P2 it is done.** P2's durable resume depends on
animations being per-frame again, and until P2 lands, an interrupted 117-minute render loses every frame. Do not
go quiet between those two points.

## Rules

1. **Never commit to main, push, tag, publish or bump the version.** The coordinating session owns git.
2. **Never touch `C:\Lumi`** except to read — the owner's live install with his real decks.
3. **Ask before running `test_server.py` or the e2e.** Several sessions are live; two suites at once give
   phantom failures that have already cost hours. `test_blender_*.py` are yours — they need a sandbox with an
   `.aura\engine` junction, or you get four false failures.
4. **Sandboxes at `X:\aura-dev-p1\`**, never inside the repo.
5. Write files with the Write tool, not bash heredocs.
6. **Render it and look at it.** This part is about whether a picture is right.

## Report

10 lines to the owner: what a still looks like now, what an animation produces, what happens with Blender
uninstalled. `docs/STATUS-P1.md` as you go. Say plainly anything in this brief that is wrong when you read the
code — four agents have already found real errors in these documents.

Claim it first: `docs/CLAIM-P1.md`.
