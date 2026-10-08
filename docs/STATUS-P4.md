# STATUS — P4, a label never covers the figure

2026-10-08. Done and verified in a sandbox. Nothing committed; the changes are in the working tree.

## What was built

One placer, `window.LumiLabel` in `engine/deck/runtime.js` (~200 lines), used by all five look engines, by the
Blender path in the same file, and by `bake-player.js`. It takes the holder, each label's anchor point in holder
pixels, and an **occupancy grid** saying where the subject is; it puts each label in clear space outside the subject
and draws a leader back to the part. It went into `runtime.js` rather than a new `lib/` file because every deck
already loads `runtime.js`: no `new_deck.js` wiring, nothing new for the packer, rule 6 untouched.

Two ways to know where the figure is, one placer on top:

- **live scenes** — the screen-space box of every mesh that is part of the subject. Excluded: `auraFigure === false`,
  the floors and fake-shadow sprites the looks already mark `userData.shadow === false`, shadow-catcher materials,
  anything straddling the camera plane, and anything filling more than 62 % of the frame (that is scenery).
- **Blender renders** — the real silhouette, read from the picture: every pixel far enough from the background,
  where the background is the median of the frame's border ring. Refreshed a few times a second, not every frame.

Placement: ring slots around the anchor, then rail slots in the free margin, every candidate **clamped into the safe
box before it is scored**. Cost = coverage of the figure, overlap with labels already placed, how much of the leader
runs over the figure, leader length, the author's direction, outward from the subject.

## Three things the brief did not have

1. **The occupancy was empty on the first frames.** three.js only refreshes world matrices inside
   `renderer.render()`, and the label pass runs *before* the render, so every mesh read as if it were at the origin.
   The grid then reported clear space exactly where the figure was about to be drawn, and the first version of this
   work put both tags straight back on the rack. `sceneGrid` now forces `updateMatrixWorld(true)`.
2. **Clamping after scoring is the bug itself.** Scoring a candidate where it wanted to sit and *then* clamping it
   into the safe box is how a label lands on the subject — the clamp is a push inward, which is a push onto the
   figure. Candidates are clamped first and scored where they will actually be.
3. **Determinism cost stability, and had to be bought back with weights.** The capture contract forbids reading the
   previous frame, so there is no hysteresis. With leader length weighted near the direction hint, a label whose
   anchor sat near the middle flipped side to side **twice per loop, a 650 px jump**. The hint now outweighs length
   by a wide margin: length only orders slots on the chosen side. Measured over 24 points of a 12 s loop, both
   labels are now steady to the pixel, and `seek(0)`, `seek(period)` and `seek(0)` again agree exactly.

## The checker

`deck_check.js` takes a **third screenshot** of each labelled slide with the labels and leaders hidden, and measures
how much of each label's box sits on the picture rather than on the background. Over 12 % is an error,
`a label covers the figure`, registered in `enforcement.md` (both the table row and the `<!-- checks: -->` list;
`test_instructions.py` passes 117/117). It is renderer-agnostic: a live scene, a Blender still and a loop poster are
judged the same way. Slides with no projected label pay nothing. The runtime also raises
`data-labels-crowded` when its own best slot is still over 12 % covered, which the checker reports as the same error.

## Where there was nowhere to go

The ladder is ring → rail → least-covered slot plus `data-labels-crowded`, and the checker fails the slide. The fix
is the slide's (fewer labels, smaller figure), not the placer's; a placer that silently gave up would be the original
bug again. Shrinking a label was considered and not built — it changes the look's type scale, which is not P4's.

## Verified

- The owner's case rebuilt — a rack with "Hot exhaust" and "Coil door" both anchored on the cabinet. Before: both on
  the rack and on each other. After: both clear, stacked in the right margin, each with its own leader.
  The owner's own deck was not on this machine (`C:\Lumi\4 - Your slides` is empty), so this is a reconstruction.
- All five looks, a labelled slide each: **no label error in any of them**. Clay Pop was clean from the first run.
- The Blender path, with a render-shaped picture and `data-anchors` as `lumi_bpy` writes them: tags above and below
  the cabinet with leaders.
- 1366 × 768 and 1920 × 1080: same result (the slide scales, the geometry does not change).
- Loop seam: label transforms at `t = 0` and `t = period` identical, and repeatable.
- `test_instructions.py` 117/117. `test_server.py` and the e2e were **not** run — rule 3.

## Known limits, honestly

- **A behind-camera anchor still cannot be told apart on the Blender path.** `_project_anchors`
  (`lumi_bpy.py:1096`) drops `v.z`, so such a point arrives as a plausible percentage. Anchors outside −5…105 % are
  hidden, which catches off-frame but not behind-camera. Recording `z` is P3's file.
- **Occlusion is still not tested anywhere**, as the brief said. A label can point at a part hidden behind the model.
  The leader crossing the figure is penalised, which helps a little; it is not a fix.
- A projected mesh box is coarser than a silhouette on the live path. It errs towards pushing labels further out,
  which is the right side to err on, but a long thin diagonal part claims more clear space than it deserves.

## Two places the brief is wrong

- *"Only `studio3d.js:623` tests the frustum."* All five engines tested it — `fp3d.js:250`, `pp3d.js:334`,
  `hs3d.js:315`, `cp3d.js:353`. The five label functions were byte-identical apart from the default `dx`. The real
  gap is occlusion, which the brief also names.
- The brief does not mention that the Blender anchors were being written out as percentages of the **holder** while
  the picture is `object-fit: contain`, so they were already in the wrong place whenever the render's aspect was not
  the holder's. They now map through the letterbox box.

Also worth knowing: `bold-blue.css` reads `data-align` the **opposite** way round to the look engines — there
`"left"` puts the text to the LEFT of the point, in the engines it puts it to the RIGHT. The engines' sense is the
one the placer honours; the two CSS rules are now scoped to labels the placer has not reached yet.

## Sandbox

`X:\aura-dev-p4\` — six decks under `.aura/temp/build/` (`p4` the rack, `blen` the Blender path, one per other look),
plus `probe.js`, `seam.js` and `shoot.js`. Nothing was written inside the repo.
