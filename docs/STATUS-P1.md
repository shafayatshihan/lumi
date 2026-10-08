# STATUS — P1 real renders (2026-10-08)

## Done (uncommitted in the tree, for the coordinator to commit)

- `form_server.py`
  - `new_deck`: `'bake': False`.
  - `slide_engine` auto rule: an animation on a Blender look goes to Blender when the deck **has** a `bake` key (`'bake' in rec`),
    not when it is True. True = baked (old decks), False = per-frame Cycles (new decks). No key (pre-batch-6) = three.js as before.
  - `slide_engine` auto path now returns `note: 'blender-missing'` when the look wants Blender and it is absent (was `None`).
  - `pin_engine`: on `blender-missing` emits a `blender` event: "Slide N: Blender is not installed, so this figure is drawn in
    live 3D (three.js) instead of a studio render. Repair Lumi from the loading screen to get it." -> shown in the workshop chat
    (`workshop.js:478`). Fires once for an auto slide (it is then pinned to threejs), each build for an explicitly chosen one.
  - `plan_payload` `bakes` -> `'bake' in rec` (see REGISTER-P1).
  - comments on `GLASS_RE`/`bl_glass` (irrelevant for new decks).
- DORMANT headers: `lumi_bake.py`, `bake-player.js`, `pack_deck.py` `baked_fill`.
- `tools/form-dev/test_blender.py` `baked_suite`: a new deck is pinned False and its animation is per-frame; the baked checks
  now run on a deck explicitly re-pinned True. `pin_cycles` docstring.

## Verified

- `py_compile` clean.
- `X:\aura-dev-p1\check_engine.py`: all 16 combinations (new / batch-6 / pre-batch-6 / Pink Punch x still/anim x Blender yes/no)
  resolve as intended; the fallback event text fires.
- Real Blender 5.2.2, the owner's Clay Pop heat-exchanger scene (copied read-only from C:\Lumi to `X:\aura-dev-p1\s1`):
  1080p still at 128 spp in 151 s - clean path-traced metal and copper, AgX, not grey. `--anim --frames 4` at 540p/32 spp wrote
  frame_0001..0004 in 69 s; `--anim --resume --frames 6` printed "resume: 4 frame(s) already rendered, 2 to go" and wrote only
  0005-0006 (39 s). The per-frame path and its resume work as they are.
- Read: `full()` builds `--anim` when not baked (:5435); `_ask_yield` then can preempt; `bl_estimates` uses the Cycles model.

## Not yet run

- `test_server.py` (runs `test_blender.py`) - waiting for the owner's go-ahead (rule 5).

## Errors found in the brief

1. **Flipping `bake` alone breaks animations.** `slide_engine` auto-routes an animation to Blender only when `rec['bake']` is
   truthy, so `False` would have sent every new animation to **three.js**, not Cycles. Fixed with `'bake' in rec`.
2. `docs/REGISTER-P1.md` did not exist; the tone-mapping fix was recorded nowhere.
3. "Make the card say it": the plan card already says it (the Blender chip greys out with "blender isn't installed").
   The silent spot was the **build**: `slide_engine`'s auto path returned `note: None`, and `pin_engine` then pinned threejs
   into the plan for good.
4. "Leave them unreferenced": they cannot be - decks pinned `bake: True` still route through all three. Headers say so.
5. "Land one commit" vs "never commit": shared working tree, so no commit and no branch switch; left for the coordinator.

## Tell P2

Per-frame animations are back for new decks as soon as this is committed. Your resume work applies to every new animation.
