# STATUS — Package B (cinematic)

Updated: 2026-10-08 00:40 BST. State: **DONE, verified. Nothing committed** (coordinating session owns git).

## Camera continuation — design and reasoning
Continuity is DECLARED data in the HTML, never state handed from the slide drawn before (that would make slide N+1
depend on render order and break seek(t), the same reason post.js refuses AfterimagePass).
- `data-camera='{"azimuth","elevation","distance","target":[x,y,z],"fov"}'` on a holder = its rest pose; it wins over
  the scene's JS options (one source). `data-camera-from="prev"` = start from the previous `.slide`'s `data-camera`,
  read from MARKUP, so a slide opened cold renders the same as one reached from slide 1 (tested).
- Periodic: ease in from the previous pose over the first 20 % of the period, hold own pose (orbit on top) 60 %, ease
  back 20 %. seek(0) == seek(period); the loop seam is the previous pose; the still frame (0.35 P) is in the hold.
- No build step, no runtime hook, no new state; survives packing and slide reordering. Bad data = console warning,
  own pose, never a throw. Cost: the ease-back is visible if a presenter stays longer than one period.

## Volumetric light
`shafts` in post.js: screen-space radial march toward the key light's projection, half res, 40 fixed taps, no dither,
occlusion from depth (nearer than subject + 1.5 blocks). Glow falls off from where the light enters the frame (studio
keys project screens off-frame). First rung of LADDER. On only in the `cinematic` preset; Bold Blue tiers stay
`clinical`, so no shipped deck changes. Link failure is read from three's program diagnostics after the first draw:
the pass drops itself (`post.shaftsOff` says why), no throw.
Honest limit: on a light cyclorama it is a soft warm light from the key side, not visible beams. Strength 0.12; at 0.22
it erased the horizon band (the wash trap post.js describes).

## Verified (sandbox X:\aura-dev-cine, probe.js / regress.js / e2e\)
- seek(t) -> seek(t') -> seek(t): byte-identical, shafts on and continuation slides; loops close.
- Cold slide 3 == slide 3 after slides 1, 2. Seam pose == previous slide's declared pose; hold == own pose (1e-5).
- A/B `post.state.shafts=false` differs; `clinical` pixels identical with and without the change.
- Honesty gate: measured slide with data-post="cinematic" gets no post. Broken-GL test (link refused): shafts drop,
  health() drawn 1/1, frame deterministic.
- finalize.js on a 4-slide deck: exit 0, 3 loops + PDF; frames pulled from the MP4s and looked at.
- `node --check` on all three JS files. `tools/form-dev/test_post.mjs` 40/41: the one fail is LOOK-BASE vs the
  gitignored `aura-dev-rel/` copy, which lacks 4.8/4.9 (REGISTER item 0).
Found and fixed while verifying: `slerpQuaternions(a, b)` aliasing left the camera on the previous slide's orientation.

## Files touched
engine/deck/lib/post.js, engine/deck/lib/post-policy.js, engine/deck/looks/bold-blue/studio3d.js,
LOOK-BASE.md (added 4.8, 4.9 only), docs/{CLAIM,STATUS,REGISTER}-CINEMATIC.md.
Blocked: nothing. Two requests for runtime.js in REGISTER-CINEMATIC.md.
