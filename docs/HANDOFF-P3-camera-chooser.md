# P3 — Camera angles the person chooses, from real renders

You are in **`X:\aura-slide-by-shafayat`**, the source for **Lumi**, a Windows app that builds presentation decks
with headless Claude Code. v0.6.1 is published. **Three other Claude sessions are working in this repo right
now** — read the ownership section.

Owner: S. M. Shafayat Islam. Short, plain replies. Not a beginner.

**`engine/node_modules` is gitignored and the repo was re-cloned.** Run `npm install` in `engine/`.

---

## Why this exists

The owner asked to be **asked about camera angles, with reference images rather than only words**.

Today he is never asked. `VIEWS` (`lumi_bpy.py:998-1001`) has seven presets — `three-quarter`, `hero`, `front`,
`side`, `high`, `top`, `low` — and Claude picks one. There are **zero hits for `data-camera` anywhere under
`engine/form/`**: no UI, no setting, nothing. The only lever he has is typing a change request in free text and
hoping.

The guidance Claude works from is three lines: default `three-quarter`, `hero` for the title, don't repeat your
neighbour's angle (`LOOK-BASE.md:141`, `BLENDER.md:205`).

## What to build

**1. Four candidates, from his actual object.** Render the real model from four presets at `--preview` quality —
576×324, 16 spp, about 10 s each (`PREVIEW_RES, PREVIEW_SAMPLES`, `lumi_bpy.py:69`). The owner chose this over
generic angle diagrams, and the reason matters: a diagram tells you what "three-quarter" means, but only a render
of *your* object tells you whether three-quarter is right **for it**.

Render the four in **one Blender launch** if you can — four launches is four lots of ~4.5 s startup
(`DEFAULT_BENCH['startup_s']`), and this runs on every 3D slide.

**2. A 2×2 chooser.** None exists in the app. The three nearest things, all wrong for this:
- the look picker (`looks.js`) is a **hover preview of one image**, not a grid of options;
- question cards (`markers.js` `choiceCard` `:198`) are **text buttons** — the marker grammar has no image
  option at all;
- the Blender approval card (`blender.js`) is a **linear history flipper** (earlier/later preview), not a
  chooser.

Build the smallest honest thing: four thumbnails, click one. Show them **as they arrive** rather than making him
wait for all four, and let him **skip** and take Claude's choice.

**3. Persist the choice** two ways, because two things read it: as `data-camera` JSON on the holder (the exact
shape `studio3d.js:383` already parses — `{"azimuth","elevation","distance","target","fov"}`) and as
`view=` / `azimuth` / `elevation` in `scene.py`, so a re-render keeps it. Camera continuation (LOOK-BASE 4.8,
`data-camera-from="prev"`) reads the **previous slide's markup**, so getting this right keeps that working.

**4. Every 3D slide.** That is the owner's explicit call, made knowing the cost (~40 s and one interruption per
3D slide; on a 9-slide deck at 70% 3D, six interruptions). So make it feel cheap. If it turns out to be heavy in
practice, **say so plainly** — the fallback position is the hero pair only — rather than quietly narrowing it.

## Where it lives

- `engine/deck/blender/lumi_bpy.py` — `VIEWS` (`:998`), `camera()` (`:1004`). Note `frame_right=True` fits the
  silhouette into x 0.42–0.97 by iterating over ~1500 sampled vertices (`:1022-1041`), so each candidate is
  properly framed, not just rotated.
- A new action beside `bl_post` (`form_server.py:6096`) and its route in `BLENDER_ROUTE` (`:4708`). The file
  pattern whitelist `BLENDER_FILE_RE` (`:4709`) must learn the new filenames or the images will not serve.
- `engine/form/js/blender.js` — the card.

## What you own

`lumi_bpy.py` camera code, your new server action and its route, `engine/form/js/blender.js`,
`engine/form/css` for the chooser.

**Anything else in `form_server.py` goes through `docs/REGISTER-P3.md`** — P1 owns the routing/estimates region
(≈`4700-5230`, `5900-6300`) and P2 owns `BlenderRenderer`, `Runner` and `plan_payload`. Your action sits between
them, so coordinate rather than reaching in.

**Do not touch:** `lumi_bake.py`, `bake-player.js` (**P1**); `BlenderRenderer`, the queue, `editor.js`
(**P2**); `runtime.js`, the look engines, `LOOK-BASE.md`, `deck_check.js` (**P4**); `RESUME.md`, `BACKLOG.md`,
`FIXLOG.md`, the rest of `docs/`.

Yours in docs: `docs/CLAIM-P3.md`, `docs/STATUS-P3.md`, `docs/REGISTER-P3.md`.

## One thing to get right

A camera choice must not silently invalidate an approved render. `bl_approve` (`:6076`) refuses with
`preview-outdated` when `scene.py`'s hash has moved, and `full()` re-checks it (`:5408`). Changing the camera
**changes the scene**, so decide deliberately what happens to an existing approval and preview — and make the
card say it, rather than letting the person discover it at render time.

## Rules

1. **Never commit to main, push, tag, publish or bump the version.**
2. **Never touch `C:\Lumi`** except to read.
3. **Ask before running `test_server.py` or the e2e.** Several sessions are live.
4. **Sandboxes at `X:\aura-dev-p3\`**, never inside the repo.
5. Write files with the Write tool, not bash heredocs.
6. Copy standard: a control says what it does in two to four words, lowercase. Errors exempt.
7. **Render it and look at it**, at 1366×768 and 1920×1080.

## Report

10 lines to the owner, with a screenshot of the chooser on a real slide. `docs/STATUS-P3.md` as you go. Say
plainly anything in this brief that turns out to be wrong when you read the code.

Claim it first: `docs/CLAIM-P3.md`.
