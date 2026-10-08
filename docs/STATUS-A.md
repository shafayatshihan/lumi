# STATUS — Package A (baked motion pipeline)

Updated 2026-10-07. Phase: **Part C preconditions DONE. Part B — the bake step and its three.js player are built,
measured on a real slide and looked at.** B.2 routing, B.3 staleness, B.5 UI, B.6 artifact wiring and B.7 checker
are not started.

## Done

**All three Part C preconditions are met. Nothing is committed.**

1. **A real software-GL (swiftshader) finalize ran end to end and passed.** SwiftShader confirmed active —
   `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)`. Full `finalize.js` on a deck
   with two live `Aura.scene()` holders: 2 loops (40 + 20 frames), 346 KB HTML, 126 KB PDF, exit 0, **9.2 s**. A
   frame pulled back out of the embedded MP4 shows the lit mesh. Looked at it. It is **not** "too slow": on this
   fixture software GL is within noise of the Intel Iris Xe.

2. **A capture failure now has a fallback.** `finalize.js` draws one frame of every loop slide and asks
   `LumiCapture.health()` what actually drew *before* recording anything. If a slide's 3D did not draw it closes the
   browser, relaunches on SwiftShader (`SOFT_GL_ARGS`, `launch({args})`) and starts the deck over. A machine with no
   usable GPU now produces a deck instead of a blank one.

3. **A capture failure is loud.** With no second source finalize **stops**: exit 1, no HTML, no PDF, nothing
   half-written, temp folder cleaned, and one plain sentence naming the slides — 165 characters, inside the 200 the
   server cuts at. The technical cause goes to a `{t:'detail',scope:'capture'}` line, never into the sentence.

**Also decided, as the handoff asked, before any bake code exists: the B.4 hatch problem.** A per-material
`onBeforeCompile` injection in three.js — not a post pass, not a retreat to Cycles. Written up with its reasoning
and its two gotchas in the spec at B.4. The short version: `section()`'s hatch carries **no lighting** (flat fill,
rough 0.9, then a `TexCoord.Window` stripe mixed into Base Color), so the fill bakes like any surface and the
stripe is four lines of GLSL on `gl_FragCoord`. `cutaway()` already gives section faces their own material, so no
mask buffer is needed. Routing cutaways to Cycles would exempt the most common animated mechanical slide — a
10 s cutaway loop is 5-7 hours at 89-130 s a frame.

## Files changed (all uncommitted)

| file | change |
|---|---|
| `engine/deck/runtime.js` | capture contract **section 5**; `holderDrawn()` / `healthOf()`; `LumiCapture.health()` and `slides[n].health`; `data-aura-still-3d` + `data-aura-still-failed`; the failed-scene reason kept on the holder as `data-aura-error` |
| `engine/tools/finalize.js` | `openCapture()` (re-runnable); the health gate; the software-GL retry; the loud stop; `softGl` on the plan and deck-timing lines; the still warning now reads the truth instead of a timeout that never fires |
| `engine/tools/lib/deckpage.js` | `SOFT_GL_ARGS`; `launch({ args })`, caller args last so a deliberate retry outranks `AURA_BROWSER_ARGS` |
| `tools/form-dev/test_blender_softgl.py` | **new.** 15 checks, both preconditions, its own fixture and sandbox, no fixed port, no server |
| `docs/blender-batch6-spec.md` | Part C marked done with what each precondition became and what the part got wrong; B.4 decided; four stale `looks/bold-blue/blender/` paths corrected to `engine/deck/blender/` |
| `docs/REGISTER-A.md` | the `RESUME.md` / `FIXLOG.md` / `SURVEY.md` corrections, for the coordinator |

## Verified

- `tools/form-dev/test_blender_softgl.py` — **15/15**.
- `tools/form-dev/test_blender_deck.py` — **71/71** (the whole Blender holder, presenter, still, capture-contract
  and finalize path, through a real browser). It first died on a missing `X:\aura-dev-blender2`; recreating the
  sandbox fixed it, and that failure had nothing to do with these changes.
- `tools/form-dev/test_blender_timing.py` — **28/28** (Part D's instrumentation, including a real finalize run).
- The real previously-finalized deck `df41e681539e` finalizes unchanged: 4 slides, 2 loops, 0 warnings, 35.9 s,
  exit 0, 2.8 MB HTML — and a frame out of its loop is the right picture. A deck packed before this change has no
  `health()`, the gate sees `{}` and nothing is gated, so the check can only ever report a failure that was already
  there. No false positive is possible on an old deck.
- `node --check` on all three JS files; `ast.parse` on the new Python.
- The full suites (`test_server.py`, `test_frontend.py --e2e`, `test_permissions_real.py`) were **not** run, per
  rule 4. Nothing here changes the server: `form_server.py` ignores an unknown `t`, already routes `warn` into
  `state['warnings']`, and already turns a non-zero exit into `friendly_tool_error` of the last stderr line.

## What turned out to be wrong in the brief and the spec

1. **The failure mechanism in Part C is wrong, and the correct one is worse.** Both the spec and `RESUME.md` say
   fix D-04 made the still timeout stop throwing, so a dead scene "ships blank with a warning in a log". Measured:
   the 180 s wait is **never reached**. `showStill()` set `data-aura-still-ready="1"` unconditionally, because
   `renderSlideAt()` does `if (!rec || rec.failed) continue` — a holder whose scene threw is skipped and the page
   reports ready in milliseconds. A deck with three.js unreachable finalized at **exit 0, `{"t":"done"}`,
   `stillWarnings: 0`, and not one `warn` line**, with both loops encoded blank (27 KB and 22 KB against 232 KB and
   25 KB working) and both PDF pages blank. It was never "a `warn` is not enough" — there was no warn, and the loop
   path had no readiness check at all. Anyone trusting that warn would have shipped blank decks indefinitely.

2. **The deck the original check was run against has no live three.js in it.** `df41e681539e` is 2 Blender holders
   and 2 `.aura-canvas` 2D slides. No software-GL test on it could ever have said anything about WebGL, which is
   likely why the attempt was abandoned as "too slow to finish" rather than finished. The replacement fixture
   travels with `test_blender_softgl.py`.

3. **The soft radial gradient is why this survived production.** A dead holder's only visible residue is
   `.aura-3d[data-fallback]::after`, which reads as a design element, not as an error.

4. `lumi_bpy.py` and `lumi_mech.py` are at `engine/deck/blender/`, not `engine/deck/looks/bold-blue/blender/` as the
   spec said in four places. Corrected in the spec.

## Blocked

Nothing.

## Next for whoever takes Part B

- The remaining half of precondition 2: **one Cycles poster frame per baked slide**, the fallback for a scene no
  renderer can draw. The hook exists — the gate already knows exactly which slides came back blank.
- B.4 is decided; build it as written, and check the hatch spacing against a Cycles render first (the captured
  region is the holder rect, not the window, so `spacing` must be scaled by `slideWidth / rect.w`).

---

# Part B — the bake step (added 2026-10-07, same session)

## Built

- **`engine/deck/blender/lumi_bake.py`** (new). Bakes base colour, roughness, metallic and ambient occlusion into
  per-material-group atlases, packs ORM, rebuilds each material as a plain Principled the glTF exporter maps
  cleanly, and writes `model.glb` + `bake.json` + `atlas/*.png`. Driven as
  `blender -b -P scene.py -- --bake draft|final|hero --out <folder>`; `L.render()` short-circuits on it exactly as
  `--inspect` does, so **no existing `scene.py` changes**. `--bake` implies `--cavity`, because three.js has no GI
  and the AO map is the only crevice darkening there is.
- **`engine/deck/blender/lumi_bpy.py`**: `--bake` added to `args()`, stored by `reset()`, honoured by `render()`.
- **`engine/deck/lib/bake-player.js`** (new). Loads the GLB, puts it in `BB3D.studio()` when the look is there and a
  matched three-light rig plus a generated studio environment when it is not, and drives the glTF animation with
  `mixer.setTime()` - an absolute seek, never an advance by dt. So a baked slide is just another scene under the
  capture contract and **`finalize.js` is untouched**. Carries the B.4 screen-space hatch injection.

## Measured, on the real gear-reducer slide (48 objects, 4 materials, 100-frame 5 s loop)

| | draft 256 px | final 1024 px |
|---|---|---|
| one atlas per object, 16 bake calls | 160.4 s | 406.9 s |
| 4 bake calls instead of 16 | 168.5 s | — |
| **statics joined first (12 objects) — shipped** | **50.1 s** | **103-111 s** |

Against that slide's own recorded Cycles cost (`timing/timing.json`: 5873.7 s for 100 frames, 58.7 s a frame):
**about 47x**, end to end, on real work.

## What the spec had wrong about cost

Bake time is **per object per map**, about 0.85 s each at 256 px - not per texel (16x the texels cost 2.5x the
time) and not per bake call (16 calls to 4 changed nothing). Object count is the lever. `_join_static()` merges
meshes that share a material and a parent and have no animation of their own: 48 objects become 12, which is 3.2x
on its own. Atlas size is the cheap dimension, so B.8's "2048 quadruples bake time" is not right either.

## Four bugs found, each of which produced a wrong picture rather than an error

1. Base colour via Blender's DIFFUSE pass is **zero for any metal** (`base x (1 - metallic)`). Must go through an
   EMIT rewire. Every base atlas was solid black.
2. AO bakes **solid black** unless the studio floor and cove are hidden for that pass and the reach is finite - an
   unlimited-distance AO bake inside `L.studio()` sees walls in every direction.
3. Taking the **first** `OUTPUT_MATERIAL` node finds the wrong one (a Lumi material has more than one), so the EMIT
   rewire could not be undone and every later pass baked an Emission shader. Roughness and metallic both came back
   1.0; the first render was a black silhouette.
4. In three.js, **a metal with no environment map is black**. The player generates one from the same ramp stops as
   `lumi_bpy.studio()`'s world - and it must be a wide equirectangular image: the first try was 8 x 128, which PMREM
   read as a panorama 8 pixels around and packed into an 8-pixel cube.

## Verified

- The baked GLB renders the reducer correctly in three.js - ground-steel gears, chrome races, blued shafts.
  Looked at it: `X:\aura-dev-partc\bake-t1.25.png`, and `bake-env2.png` with the environment shown.
- It moves: 3.58 % of pixels change between t = 0 and t = 1.25.
- **The loop closes exactly**: t = 0 and t = period differ by **zero** pixels, which is what the capture contract
  needs and what makes the existing `seek(t)` path work on a baked slide with no changes.
- `node --check` on the player, `ast.parse` on both Python files.

## Open, and honest about it

- **Not yet rendered inside a real deck.** The check page drives `bake-player.js` directly with `plain: true`; the
  `BB3D.studio()` path (contact shadow, post stack, labels) is written but has not been run. A deck slide is the
  next step, and after it a finalize, which is where the 47x gets its second half measured.
- **Packing.** A packed deck is one offline file, and the player needs `GLTFLoader` from `three/examples/jsm`.
  `engine/tools/pack_deck.py` inlines three.js through an import map of data URLs and would need one more entry
  (plus the `three/addons/` mapping in `engine/deck/template.html`). Neither file is owned by any package; neither
  is touched yet.
- **Size.** The GLB is **3.7 MB** for one slide, against ~2 MB for a whole deck today. Geometry, not textures
  (the four 1024 px atlases are ~1 MB). This is the same wall Package C was told to measure before committing, and
  it needs an answer - decimation, Draco, or fewer teeth - before baked slides become the default.
- **The hatch (B.4) is written but never exercised**: this scene has no cutaway. It needs a section scene.
- B.2 routing, B.3 staleness hashing, B.5 UI deletions, B.6 artifact wiring, B.7 checker rules: not started.
