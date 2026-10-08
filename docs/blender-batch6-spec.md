# Blender batch 6: the baked motion pipeline (SPEC — Part A built, Parts B/C/D are the rest)

Status: **Part A is BUILT and measured (2026-10-05, uncommitted). Parts B and C are NOT started and still run only
after batch 5.** Written 2026-10-05, revised the same day after a full design interview with the owner, and revised
again when Part A's measurements came in. Nothing is committed.

Origin: `RENDER-PIPELINE.md`, the F1 "Real part" pipeline, which bakes Cycles detail into textures once and plays the
result live instead of path-tracing every frame. This spec adapts that idea to Lumi, and records the owner's decisions
so a later agent does not re-open them.

---

## 0. The decisions (settled with the owner, 2026-10-05)

| # | decision |
|---|---|
| 1 | **Ray tracing is not dropped — it is relocated.** A bake *is* a Cycles bake. Per-frame path tracing goes away for animations; Cycles stays for stills, for glass and as the cutaway fallback |
| 2 | **This is not a third engine.** It is a bake step feeding the capture pipeline that already exists (`LumiCapture` / `finalize.js`) |
| 3 | **Stills stay Cycles.** A Cycles still is 90 s and is the best thing Lumi makes; a bake would cost more and look worse |
| 4 | **Glass stays per-frame Cycles**, detected automatically. Prefer a cutaway over a transparent vessel where the slide allows |
| 5 | **Baked replaces live three.js** as a user-visible engine. No slide ships unbaked |
| 6 | **20 fps globally** for captured loops (was 30, 24 with `--light`) |
| 7 | **No user-facing engine choice.** Lumi picks from the slide's content and states what it picked |
| 8 | **Existing decks are untouched** — fps and engine pin per deck at creation |
| 9 | **Batch 5 runs first, unchanged and instrumented**, as the Cycles baseline for an A/B |

**Item 1 below is a prerequisite, not an enhancement.** If baked replaces live three.js, the cavity and edge-wear
nodes are the only thing making a baked texture look like anything. Without them this trades path-traced slides for
flat ones.

**What Lumi already has — do NOT rebuild any of it:** the procedural studio world with its two black reflection flags,
AgX Medium High Contrast, per-preset procedural roughness (`_noise_to`, `_bump`), geometric bevels, cutaways with
drafting hatch, OptiX -> CUDA -> CPU fallback, adaptive sampling with OIDN, `use_persistent_data`, exact sRGB
compositing onto the slide colour, the preview simplify path, labels as HTML, and the **entire deterministic
seek-based capture pipeline** (`finalize.js` screenshots one frame per `seek(t)`, `t = k/fps`, and pipes JPEGs to
ffmpeg — scenes are pure functions of `t`, which is why loops close seamlessly).

---

## Part A — prerequisites — **DONE 2026-10-05 (uncommitted)**

Built in one pass together with the first real Blender install on this machine. What the measurements changed is
recorded under each item; the rest of this part is as specified. Files: `engine/deck/blender/lumi_bpy.py`, the new `engine/deck/blender/lumi_mech.py`, `BLENDER.md` sections 1/4/6/7/8, the
`LOOK.md` 4.11 line, the new `tools/form-dev/blender_parta_probe.py`, and `parta_suite` + `caps_suite` in
`tools/form-dev/test_blender.py`.

### Item 1 — cavity dirt and edge wear in the materials (PREREQUISITE) — **DONE, with one design change**

**Today.** `engine/deck/blender/lumi_bpy.py`: `_noise_to()` (~line 252) drives Roughness from noise,
`_bump()` (~270) adds a cast bump, `PRESETS` (~283) gives each kind one recipe. Nothing varies a material by its
**geometry**, so every crevice is as bright as every face.

**Why it matters more here than in the F1 pipeline.** Those images are dark-background product photography; their form
reads because a cool rim separates a dark part from a dark field. Lumi composites onto `#F9F4F2` or `#EFEBE6`, where
there is no rim separation to be had. On a light background the form comes from cavity darkening, edge highlights, the
contact shadow and a graded floor. Lumi has the last two and nothing for the first two.

**Build.** Two node helpers beside `_noise_to`, wired in `mat()` (~303):

| helper | node | effect |
|---|---|---|
| `_cavity_to(nt, b, strength)` | `ShaderNodeAmbientOcclusion` (`only_local=True`, ~8 samples, distance ~5 cm scaled to subject) | darkens Base Color and lifts Roughness in crevices, gear roots, bolt recesses |
| `_edgewear_to(nt, b, amount)` | `ShaderNodeBevel` (~6 samples, radius ~2.5 mm) + a normal compare | convex edges go lighter, smoother, more metallic; on `paint`, bare metal through the coat |

Extend each `PRESETS` entry with `cavity` and `wear`. Starting values to be **tuned against real renders, not guessed**:
metals wear 0.5-0.8 / cavity 0.4; `cast_iron` cavity 0.7 / wear 0.3; `paint` wear 0.35 with bare metal beneath;
`rubber` and `ceramic` cavity only; `glass` and `glow` neither.

**Cost — MEASURED, and the measurement changed the design.** Reference laptop (MX350 2 GB, OptiX, i5-1135G7), the
`BLENDER.md` cutaway test scene and a mechanical scene (41T + 11T gears, M8 bolt + nut), 1920x1080, 128 spp, on
`#F9F4F2`, with the bundled Blender 5.2.2:

| configuration | cutaway scene | mechanical scene |
|---|---|---|
| baseline, neither node | **89 s** | **130 s** |
| **edge wear only, Bevel 3 samples, hero + metals (SHIPPED)** | **97 s (+9%)** | **133 s (+3%)** |
| edge wear + cavity, both at 3 samples | 93 s (+5%) | 147 s (+13%) |
| both at full strength (AO 8 / Bevel 6, every material) | 102 s (+15%) | — |

Visible difference against the baseline, same scene, same seed: edge wear changes **0.10%** of pixels by more than
2 levels on the cutaway scene and **1.14%** on the mechanical one; adding cavity takes that to **4.34%**. The
background still lands on exactly 249,244,242 in every render, and `--preview` is untouched because both nodes are
skipped there.

**The flagged +10-30% guess was right; an early +247% reading was not.** That reading was the first render of a
scene using the AO or Bevel node, which makes OptiX compile a new kernel for the shader-raytracing feature set —
about 4 minutes, once per Blender install, not a per-render cost. Anyone re-measuring this must warm the kernel
cache first.

**What shipped, and why it differs from the spec above.**
- **Edge wear is ON by default** for the hero material and the metals, at 3 Bevel samples. It is a *material*
  variation that no renderer computes for you, and it costs 3-9%.
- **Cavity dirt is OFF for per-frame Cycles.** Cycles already path-traces crevice darkening — global illumination
  *is* cavity darkening — so the AO node buys a few percent of pixels for another ~10% of render time. The F1
  pipeline bakes AO because its target is three.js, which has no GI and genuinely cannot compute it. It is kept,
  fully plumbed and tested, for exactly that: `--cavity`, `scene['lumi_cavity']` (what Part B's bake sets),
  `L.mat(kind, cavity=0.4)` or `L.studio(cavity=...)`.
- `L.mat(kind, cavity=, wear=, hero=)` and `L.studio(..., cavity=, wear=)` are exposed as specified; `hero=True`
  opts a non-metal into edge wear. `studio()` also scales both to the subject's real size.

**Part B must revisit this:** with no GI in three.js, cavity moves from "a few percent of pixels" to load-bearing,
and its strengths should be tuned against a baked frame, not a Cycles one.

### Item 2 — `L.inspect()`: a text check before any image check — **DONE**

F1's `view.mjs` prints nodes, triangles, missing maps and bbox as JSON and catches most failures with no render.
Lumi's whole `BLENDER.md` section 8 table is checkable the same way; today Claude's only check is a render it must
then look at, to discover things like a missing camera.

`L.inspect()` prints one `[lumi] inspect {...}` line and exits non-zero on a fatal finding. Run via
`blender -b -P <scene.py> -- --inspect` (add to `args()` ~line 89; document the command in `BLENDER.md` section 1).

| finding | severity | section 8 row |
|---|---|---|
| `scene.camera` unset | fatal | black frame |
| no world / `studio()` never called | fatal | black frame |
| objects outside the frustum, or none inside | fatal | all background, no subject |
| `hide_render`, or a collection not linked | fatal | all background, no subject |
| geometry in front of clip start | warn | cut-off geometry |
| inward normals (ratio per object) | warn | dark or faceted surfaces |
| mesh with no material, or material with no texture recipe | warn | flat surfaces (LOOK.md 4.1) |
| triangles over budget (1 M still / 300 k animation) | warn | section 7 |
| a `cutaway()` part entirely inside the removed half-space | warn | silently vanished part |

**Built as specified.** Every row above is a finding code (`no-camera`, `no-world`, `nothing-in-frame`, `hidden`,
`clipped`, `inward-normals`, `no-material`, `flat-material`, `triangles`, `vanished`) that carries its section 8 row
in the JSON. `render()` short-circuits on `scene['lumi_inspect']`, so no existing `scene.py` needs changing, and it
exits 3 on a fatal finding. `BLENDER.md` section 8 gained an "inspect says" column and section 6 step 1 is now
"inspect, fix, then one `--preview`".

### Item 3 — demand real numbers (documentation only) — **DONE**

The F1 brief asked for **real part counts**, and that is most of why those models read as real: ring 41T on an 11T
pinion (3.73:1), 10T spiders, 16T side gears, a 124T flywheel ring, 31/29/15 converter blades, an 18-finger diaphragm,
a 6-coil 13 mm-wire 234 mm spring. Accuracy is realism and costs nothing at render time.

Add to `BLENDER.md` section 4 and the matching `LOOK.md` line: model real counts and real dimensions, state them as
comments in the scene file, put them in the caption where they help. If a count is unknown, **ask in the build
question** rather than inventing a plausible one. Also: name every moving part as its own object at its real pivot —
`L.spin` / `L.wave` / `L.animate` need it and item 4 depends on it.

### Item 4 — a mechanical parts library — **DONE**

`engine/deck/blender/lumi_mech.py`, imported the same self-locating way as `lumi_bpy`:
`gear(teeth, module, width, helix=0)` with a true involute profile; `bevel_gear(...)`; `spring(coils, wire_d,
free_length)`; `bolt(size, length)` / `nut(size)`; `blade_ring(count, profile, curve, radius)`; `shaft(spline_teeth)`;
`bearing(bore, od, balls)`; `oring(bore, section)`. Each returns a named object with its origin at the real pivot,
pre-bevelled and `L.smooth`-ed. Keep parts as separate objects — `cutaway()`'s EXACT solver needs closed manifold
meshes.

**Built, and verified in a real Blender** (`blender_parta_probe.py --case parts`): every part is a closed manifold
mesh (0 non-manifold edges or vertices) and all 14 survive the EXACT solver. Two notes for a later reader:
`blade_ring()` and `bearing()` return a **list** of separate objects, because joining them would hand `cutaway()` a
self-intersecting mesh — and because a single blade or a single ball has to be able to move on its own. The bolt and
nut threads are a real single-start 60-degree V profile expressed as a single-valued `r(theta, z)` loft, which is
what keeps a thread manifold; a swept rib would not be.

---

## Part B — the baked motion pipeline

### B.1 The shape

```
scene.py (authored ONCE, Blender Python)
   |
   +-- Cycles --preview ............ Claude's own self-check only (~10 s, exists today)
   |
   +-- draft bake (256 px atlas) ... what the USER judges (MEASURED: 10 s for the 2-part cutaway scene)
   |
   +-- final bake (1024 px atlas) .. on approval (MEASURED: 61 s for the same scene)
            |
            v
       glTF + meshopt + WebP  ->  three.js  ->  existing capture pipeline  ->  lumi-loop-n video
       base colour, roughness,      studio env,     seek(t), one screenshot
       metallic via EMIT (32 spp)   ACES, key/rim,  per frame, ffmpeg
       AO at 64 spp -> ORM          shadow map      20 fps
```

Smart-UV at 55 degrees, 6-8 px margin, one atlas per model, positions left float32 so pivots do not move.

**Bake times, measured 2026-10-05** (a throwaway probe, not the pipeline: the pipeline is not built). Reference
laptop, bundled Blender 5.2.2, OptiX on the MX350, the `BLENDER.md` cutaway test scene with the cavity node ON,
smart-UV at 55 degrees with a 6 px margin, one atlas per object:

| atlas | base colour / roughness / metallic, EMIT 32 spp | AO 64 spp | scene build + UV | **total** |
|---|---|---|---|---|
| 256 px (draft) | 5.2 s | 4.7 s | 0.6 s | **10.5 s** |
| 1024 px (final) | 22.0 s | 38.8 s | 0.5 s | **61.3 s** |

So the flagged "~20-30 s draft bake" guess was **pessimistic**: a draft bake is about 10 s, and a final bake about
1 minute, against 89-130 s for ONE Cycles frame. That is the whole case for Part B in one line. Two cautions before
anyone treats these as the answer: this scene has **two** objects and bake time scales with the object count (each
object gets its own atlas and its own bake call), and AO at 64 spp is the larger half of the 1024 px bake, so B.8's
per-slide 2048 px escalation is the expensive one, not the default.

### B.1a The real pipeline, measured on a real slide (2026-10-07, `engine/deck/blender/lumi_bake.py`)

The probe above is a two-object test scene. The pipeline now exists and was run on a **real deck slide**: the gear
reducer `df41e681539e` slide 2 (`blender/s2/scene.py`) - an 11T pinion on a 41T wheel, two shafts, four 6205
bearings with nine balls each, 48 objects over 4 materials, a 100-frame 5 s loop. Same reference laptop, same
bundled Blender 5.2.2, OptiX, the cavity node on, smart-UV at 55 degrees, one atlas per **material group**.

| | draft 256 px | final 1024 px |
|---|---|---|
| one atlas per object, 16 bake calls | 160.4 s | 406.9 s |
| 4 bake calls instead of 16 | 168.5 s | — |
| **statics joined first (12 objects), 4 calls — SHIPPED** | **50.1 s** | **103-111 s** |

**The cost model in the spec is wrong, and the correction is the whole optimisation.** Bake time is not paid per
texel and not per bake call - 16x the texels cost 2.5x the time, and cutting the calls from 16 to 4 changed nothing
at all. It is paid **per object per map**, about 0.85 s each at 256 px. Nine identical bearing balls on one static
empty cost nine times that for one picture of a ball. `lumi_bake._join_static()` merges the meshes that share a
material, share a parent and carry no animation of their own - 48 objects become 12 - and that single change is
3.2x. Atlas size is the cheap dimension here, not the expensive one.

**Against the real baseline.** The same slide's Cycles record in `timing/timing.json`: **5873.7 s for 100 frames**,
58.7 s a frame. Baked: ~110 s plus the three.js capture of 100 frames (~15 s at the rates `finalize.js` already
records). **About 47x**, measured end to end on real work rather than on a test scene - and B.3's free re-time is on
top of it.

**Three bugs found building it, each of which silently produced a wrong picture rather than an error.** They are
written into the code comments at the lines that fix them, and anyone re-implementing this will hit all three:
1. **Base colour cannot use the DIFFUSE pass.** Blender's diffuse colour is `base x (1 - metallic)`, which is
   exactly **zero** for steel or chrome; glTF's baseColorFactor for a metal is its reflectance tint. Every base
   atlas baked solid black until it went through an EMIT rewire instead.
2. **AO bakes solid black** unless the studio is hidden for that pass and the reach is finite. `L.studio()` puts a
   30x-subject floor and a cove around the part; an AO bake at the default unlimited distance sees them in nearly
   every direction and calls the whole subject occluded.
3. **Finding the material output by taking the first `OUTPUT_MATERIAL` node finds the wrong one** - a Lumi material
   carries more than one - so the EMIT rewire could not be undone, and every pass after the first baked an Emission
   shader. Roughness and metallic both came back as 1.0 and the first render was a black silhouette.

And one on the three.js side: **a metal with no environment map is black**, because it has no diffuse to light and
nothing to reflect. `bake-player.js` builds one from the same ramp stops as `lumi_bpy.studio()`'s world. The first
attempt made it 8 x 128 - structurally a vertical gradient, but PMREM reads an equirectangular panorama, so it
packed an 8-pixel cube and everything stayed black. It is 256 x 128 now.

**Verified by looking at it**, as the rules require: the baked GLB loads in three.js and renders the reducer with
ground-steel gears, chrome races and blued shafts (`X:\aura-dev-partc\bake-t1.25.png`); 3.58 % of pixels change
between t = 0 and t = 1.25; and **t = 0 and t = period differ by zero pixels**, which is the seamless loop the
capture contract needs.

**Why not a flat unbaked GLB for the draft:** glTF carries texture maps and PBR scalars, not Blender node trees. Every
procedural material in `lumi_bpy` — including item 1's AO and bevel nodes — exists only as a node graph and vanishes
on export. An unbaked GLB previews a different slide.

**Why not Cycles `--preview` for the user's draft:** it is a different renderer from the final, so the user would
approve a path-traced look and receive a baked one. That is exactly the mismatch the approval loop exists to prevent.
It stays as Claude's self-check, where "does the subject read, is the title zone clear" is all that is being asked.

### B.2 Routing — Lumi decides, the user does not choose

| slide content | path |
|---|---|
| still | **Cycles**, per-frame, as today |
| any glass (`L.mat('glass')` or `trans > 0`) | **Cycles**, per-frame — detected automatically |
| cutaway, if the hatch shader (B.4) does not work out | **Cycles**, per-frame |
| everything else that animates | **baked** |

The plan-page engine chips from batch 3 go away; the picture line says `· studio render` whichever ran, and an
override lives behind the "⋯" menu. `BLENDER.md` tells Claude that choosing glass commits the slide to a long render,
so the cost is visible where the decision is made.

### B.3 Staleness — this is where the win lives

Hash the **geometry and materials** in `scene.py`. A motion, timing or camera change does **not** invalidate the bake,
so re-timing or re-posing is free; only a geometry or material change triggers a re-bake. Extend batch 2's existing
other-slide hash and `blender-stale` concept rather than inventing a mechanism.

This is the real prize. The headline 13x is nice; "a change request costs nothing" is what changes the build loop.

### B.4 The hatch problem (must be solved or routed around)

`L.section()` draws its hatch **screen-aligned** — fixed relative to the viewer, per drafting convention. Baked into a
texture it glues to the surface and rotates with the part. Reimplement it as a **screen-space shader pass in three.js**
applied per captured frame: a 45-degree line pattern masked to section faces. If it fights, cutaway slides stay on
Cycles. Do **not** bake the hatch — a rotating hatch reads as a texture, not a section.

**DECIDED 2026-10-07 (Package A): a per-material injection in three.js. Not a post pass, and cutaways do not go
back to Cycles.** Read `lumi_bpy.section()` (line 537) before arguing with this — the answer is in what the node
graph actually does.

*Why it is tractable.* The hatch carries **no lighting**. `section()` sets the fill flat and matte (rough 0.9,
metal 0) and then does one thing on top: `ShaderNodeTexCoord.Window` -> `u = (x * ±16/9 + y) * spacing` ->
`fract(u) < width` -> mix two constant colours into Base Color. Window coordinates are normalised screen position,
which is exactly `gl_FragCoord.xy / resolution`. So the material splits cleanly in two: the **fill bakes** like
every other surface, and the **stripe is a four-line screen-space function** reproduced in GLSL with no inputs the
bake could have destroyed. That is the whole reason this works; it would not if the hatch were lit.

*Where it goes.* `material.onBeforeCompile`, injected into the diffuse term of the section material only. The
section faces need no mask buffer: `cutaway()` already assigns them their own material, so they arrive in the glTF
as their own material and the injection is scoped by construction.

*Why not a full-screen post pass.* It needs a section mask the renderer does not have — an extra MRT or a second
depth-only pass, more machinery and more VRAM on a 2 GB MX350 — and it must composite **before** bloom and DOF or
the drafting hatch blooms. Material injection lands at the right point in the pipeline for free.

*Why not route cutaways to Cycles.* That exempts the most common animated mechanical slide from the entire batch.
Section decision 4 says to prefer a cutaway over a transparent vessel wherever the slide allows, so cutaways are
the house style for mechanical explanation, not a rare case. At 89-130 s **per frame**, a 10-second cutaway loop is
5-7 hours. If anything is worth baking it is this one.

*Two things to get right, both improvements on the Cycles version.*
- **Spacing is "lines across the frame width", and the captured region is the holder rect, not the window.** Scale
  the GLSL `spacing` by `slideWidth / rect.w` (B.1 keeps the rect; `finalize.js` already reads it) or the hatch
  comes out finer than the still it is matched against. This is the one number to check against a Cycles render.
- **Use `fwidth` and `smoothstep`, not a hard step.** The Blender graph uses `LESS_THAN`, a hard edge that 128 spp
  of Cycles AA happens to soften. A hard step in a fragment shader crawls badly on a rotating face. A
  screen-space-derivative-width edge is deterministic under `seek(t)` (it depends on position, never on a clock)
  and is cleaner than what Cycles produces.

Not built — this is the decision Part B's first commit depends on, recorded before any bake code exists, as the
handoff asked.

### B.5 What gets deleted, and what survives

Delete **for baked slides only** (the Cycles paths keep all of it): the preview-then-approve *cost* gate, `nextGate`
blocking the next slide, defer / "skip for now", the ETA, the benchmark and estimate model (contract section 8 and its
UI strings), the 720p-vs-1080p choice, cancel, and the 409 `blender-pending` finalize gate.

Keep: the approval card itself — "do you like the design?" is a *design* question and still worth asking; it is only
"is this worth 25 minutes?" that stops making sense. Keep **progress reporting** too: `BlenderRenderer._parse` already
emits throttled progress events, and two minutes of a frozen card reads as a crash. Keep the two-lane queue, GPU->CPU
fallback, timeouts and `blender-stale`.

### B.6 Artifacts

Per slide, a `bake/` folder beside the existing `previews/`, with `draft/` and `final/` inside. **Keep the atlas and
the GLB** — discarding them throws away B.3's win. Captured frames are discarded after encode; they regenerate from
the GLB in seconds.

### B.7 Checker

Extend `tools/lib/blender_check.js` with baked-slide rules: the loop is present, its period matches the scene, a
poster frame exists, the corner pixel still matches the slide background, and the captured loop's dimensions are
right. The corner-pixel check is what catches a transparent-composite mistake, and that failure does not disappear
because the output became a video.

### B.8 Atlas budget

1024 px default; 2048 px for a hero or a dense cutaway, as a per-slide escalation when the checker or the user says a
surface looks soft. 2048 everywhere quadruples bake time and VRAM on a 2 GB MX350 for detail most slides never show.

### B.9 Naming and migration

One name in the UI: **"studio render"**, whichever path ran. Baking is an implementation detail and no user should
have to learn the word.

New decks only. Pin fps and engine per deck at creation so an existing deck — including the owner's scramjet deck
`93a68b191a2a` — keeps rendering the way it was built. v0.5.2 is public, so other decks may exist.

---

## Part C — the risk that could sink this — **PRECONDITIONS DONE 2026-10-07 (uncommitted)**

All three preconditions are met; what each one became is recorded under it, and one claim in this part turned out
to be wrong — see **What the measurement changed** at the end. Files: `engine/deck/runtime.js` (capture contract
section 5, `healthOf()`, `LumiCapture.health()`, `data-aura-still-3d`), `engine/tools/finalize.js` (the health gate,
the software-GL retry, the loud stop), `engine/tools/lib/deckpage.js` (`SOFT_GL_ARGS`, `launch({args})`), and the
new `tools/form-dev/test_blender_softgl.py` (15 checks, all passing).

**Browser capture has already failed once, in production, and its failure is now silent.**

- `RESUME.md`: a `?still=n` screenshot under software GL rendered **no 3D at all**.
- Current mitigation: `finalize.js` waits for `data-aura-still-ready`, default 180 s. But fix D-04 made the timeout
  **stop throwing** — it screenshots the page as-is and emits a `warn`. So a slide whose 3D never initialises ships
  blank with a warning in a log.
- There is **no software-GL fallback in product code**. `probeRender` reports a problem; it does not switch renderers.
  The only swiftshader hook is `AURA_BROWSER_ARGS`, a test switch.
- A real software-GL finalize has **never been verified end to end** — open in `RESUME.md`, twice in `FIXLOG.md`, and
  in `SURVEY.md`, since 2026-10-03.

Today this is survivable because Cycles produces a real PNG and capture is a secondary path. Under this spec it
becomes the **only** path to an animated image, and a silently blank slide reaching a client violates the standing
rule that errors must never reach clients raw.

**Preconditions before any of Part B ships:**
1. Run and pass a real software-GL (swiftshader) finalize end to end. This is the test that was skipped.
   **DONE.** SwiftShader confirmed active (`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader
   driver)`), a two-scene three.js deck finalized in **9.2 s** — 2 loops, 40 + 20 frames, 346 KB HTML, 126 KB PDF,
   exit 0 — and a frame pulled back out of the embedded MP4 carries the lit mesh. Software GL is not the cliff it
   was assumed to be: on this fixture it is within noise of the Intel Iris Xe (loop 1: 4.0 s capture software,
   ~4 s hardware). A heavy scene will differ; the path works.
2. Give the baked path a fallback — either Cycles automatically on a capture failure, or one Cycles poster frame per
   baked slide so something always exists.
   **DONE at the browser level, which is the cheaper half.** `finalize.js` draws one frame of every loop slide and
   asks `LumiCapture.health()` what drew *before* it records anything; if a slide's 3D did not draw it closes the
   browser, relaunches on SwiftShader (`SOFT_GL_ARGS` in `deckpage.js`) and starts the deck again. A GPU-less or
   driver-broken machine now produces a deck instead of a blank one. **Still open for Part B:** the Cycles poster
   per baked slide, which is the fallback for a scene that no renderer can draw. The hook is there — the gate knows
   exactly which slides are blank — and it belongs with the bake artifacts (B.6), not here.
3. Make the capture failure loud again for baked slides. A `warn` is not enough when there is no second source.
   **DONE.** With no second source finalize now **stops**: exit 1, no HTML, no PDF, nothing half-written, and one
   plain sentence naming the slides ("the 3D pictures on slides 1 and 2 did not draw, even with Lumi's software
   renderer. Nothing was written. Check those slides, then finalize again."). The technical cause goes to a
   `{t:'detail',scope:'capture'}` stdout line, never into the sentence. The PDF still path keeps D-04's behaviour —
   one slow slide must not lose every recorded loop — but now warns on the truth (`data-aura-still-3d`) instead of
   on a timeout that never fires.

### What the measurement changed

**The mechanism described above is wrong, and it matters.** This part says fix D-04 made the still timeout stop
throwing, so a dead scene "ships blank with a warning in a log". Measured on a deck with two real `Aura.scene()`
holders and three.js made unreachable: the 180 s wait is **never reached**. `showStill()` set
`data-aura-still-ready="1"` unconditionally, because `renderSlideAt()` does `if (!rec || rec.failed) continue` — a
holder whose scene threw is skipped and the page then reports ready in milliseconds. The run came back **exit 0,
`{"t":"done"}`, `stillWarnings: 0`, and not one `warn` line**, with both loops encoded blank (27 KB and 22 KB
against 232 KB and 25 KB for the same deck working) and both PDF pages blank. So it was never "a `warn` is not
enough" — **there was no warn**, and the loop path had no readiness check of any kind; only the still path had one,
and that one was being lied to. Anyone who had trusted the `warn` would have shipped blank decks indefinitely.

Also: **the b5 deck `df41e681539e` has no live three.js at all** — slides 1-2 are Blender holders, 3-4 are
`.aura-canvas` 2D. A software-GL check run against it proves nothing about WebGL, which is probably why the first
attempt was abandoned as "too slow to finish" and never replaced. `test_blender_softgl.py` carries its own fixture.
That deck was still finalized end to end with the gate in place (4 slides, 2 loops, 0 warnings, 35.9 s, exit 0): a
deck packed before this change has no `health()`, the gate sees `{}` and nothing is gated, so the check can only
ever add a failure that was already there.

---

## Part D — batch 5 must be instrumented, or the A/B is impossible

Nothing in the repo measures per-loop capture or encode time. The only datum anywhere is "finalize 2.6 min (3 loops,
12 MB html + pdf)" for a 6-slide deck. If batch 5 runs uninstrumented there is no baseline and everything runs twice.

**Add before batch 5 runs:** per-slide Cycles render time, per-frame time, capture time per loop, encode time per
loop, and final file sizes, written to a JSON beside the deck. **Keep the deck and its `scene.py` files** so the baked
version renders the same subjects later.

### D.1 What was built (2026-10-05, uncommitted) — the timing record

**Where.** One file per deck, at a fixed path inside the deck work folder (contract section 4):

```
.aura/decks/<id>/timing/timing.json      the record (written atomically through timing.part.json)
.aura/decks/<id>/timing/scenes/<sid>.py  a copy of every Blender scene.py as it was when the record was written
```

`GET /api/decks/<id>/timing` returns `{ok, stored, file, timing}` (read-only; with no stored file it builds the
record in memory and answers `stored: false`).

**When it is written.** After every full render (`render-done`, in the background) so the Cycles numbers survive even
if the deck is never finalized, and at the end of every finalize — successful or not. Each finalize is **appended** to
`finalizes[]` (the newest 20 are kept), so a re-run never erases the earlier measurement.

**Schema** (`schema: "lumi-timing/1"`; every number may be `null`):

```jsonc
{ "schema": "lumi-timing/1", "at": "<iso>",
  "deck":    { "id", "title", "slides", "createdAt", "light" },
  "app":     { "version", "host", "os" },
  "blender": { "available", "exe", "source", "version", "gpu" },
  "bench":   { ...the calibration model, contract section 8... },
  "render": {                                     // one entry per Blender slide: the CYCLES cost
    "<sid>": { "slide": 3, "title", "engine", "kind", "status",
               "scene", "sceneSha1", "sceneBytes", "sceneCopy",
               "previewCount", "previewS",
               "previews": [ { "n", "at", "res", "height", "samples", "renderS", "wallS", "device",
                               "frames", "fps", "tokens", "costUsd",
                               "frameTimes": [ <s per frame> ],
                               "perFrameS": { "count", "mean", "min", "max", "total" } } ],
               "final":    { "at", "kind", "res", "width", "height", "fps", "frames", "samples",
                             "renderS", "wallS", "device", "fallback", "stale", "file", "bytes",
                             "posterBytes", "frameTimes", "perFrameS" } } },
  "finalizes": [                                  // one per finalize run, newest last
    { "at", "ok", "light", "fps", "crf", "slides", "loopCount", "stills", "stillWarnings",
      "startupS", "loopsS", "htmlS", "stillsS", "pdfS", "totalS", "wallS", "htmlBytes", "pdfBytes",
      "loops": [ { "i", "n", "frames", "fps", "crf", "period", "width", "height",
                   "captureS": { "total", "seek", "screenshot", "settle" },
                   "encodeS":  { "total", "write", "flush" },
                   "wallS", "bytes", "jpegBytes" } ] } ],
  "output":  { "html", "htmlBytes", "pdf", "pdfBytes", "at" },
  "totals":  { "cyclesRenderS", "captureS", "encodeS", "finalizeS", "loopBytes", "htmlBytes", "pdfBytes" } }
```

**Capture and encode overlap** — frames are piped to ffmpeg while the next one is taken — so `encodeS.write` is the
time the capture loop was *blocked* by the encoder and `encodeS.flush` is the wait after the last frame. That pair is
the encode cost that is visible from the capture side; it is not ffmpeg's own CPU time, and the A/B must compare it
against the same quantity on the baked side, not against a wall clock.

**Per-frame Cycles times** were not stored anywhere before: `BlenderJob.frame_s` (parsed from the helper's
`[lumi] frame i/n <secs>` lines) was summed into `render_s` and dropped. It is now kept as `frameTimes` on each
preview and on the final (the first 2000 frames), together with `bytes` on the final.

**Preserving the deck.** Nothing in the repo deletes a `scene.py`. `reap()` only removes a work folder whose deck no
longer exists, and a deleted deck's folder is **moved to the bin** rather than erased; its per-file leftover rule now
skips `blender/` and `timing/` explicitly, and a test ages a deck 999 days and asserts both survive. The scene copies
under `timing/scenes/` are a second guarantee: a later change request rewrites `scene.py` in place, so the record
keeps the version the measurement belongs to, with its sha1.

**Constraints kept.** Measurement only: no render, no output file and no UI behaviour changes. Every writer is
wrapped — a failure is logged, never raised — and a missing number is `null`. `finalize.js` reports through two new
stdout lines (`{t:'timing',scope:'loop'|'deck'}`); an older reader ignores an unknown `t`, so the two sides can move
independently. Cost is a handful of `hrtime` reads per frame and one JSON write per render or finalize.

**Tests.** `tools/form-dev/test_blender_timing.py` (27 checks; run by `test_server.py`, or alone with
`--sandbox X:\aura-dev-...`): the record's fields, per-frame summaries, capture/encode separation, graceful nulls on
missing data, a corrupt record replaced, an unknown deck returning `None`, the run-list cap, `reap()` keeping the
scenes, and a real `finalize.js` run proving the timing lines appear and the html + pdf are still written as before.

**Pass criterion, fixed in advance:** baked wins if total build time drops by **>= 5x** *and* the owner judges the
stills visually acceptable side by side on the light background. If the time win is real but the look is not, item 1's
cavity and wear strengths get tuned and the comparison re-runs before any decision. A first bake that looks flat
almost certainly means untuned item 1, not that baking failed.

---

## Order, tests, rules

1. **Batch 5 first**, unchanged and instrumented (Part D).
2. ~~**Part A** items 1-4~~ — **DONE 2026-10-05**, ahead of batch 5, because none of it depends on batch 5. It also
   carried the first real install of the pinned Blender zip on this machine (FIXLOG "## Part A + real install"), and
   the global 20 fps change with a per-deck pin (section 0 item 8).
3. **Part C preconditions** — the software-GL verification and the fallback. Nothing in Part B ships before these.
4. **Part B** — the baked pipeline.
5. The A/B comparison and the owner's decision.

Tests to extend: `tools/form-dev/test_blender.py` (inspect findings, material overrides, preview skips wear),
`test_blender_deck.py` (a fixture deck renders and passes `blender_check.js`), `test_frontend.py --e2e` (the draft/
final bake card states), and `test_server.py` run **ALONE** — its "fake process killed" checks see any `fake_claude.py`
on the machine. `test_instructions.py` covers the `BLENDER.md` / `LOOK.md` changes.

Standing rules unchanged: never commit, push, tag, publish or bump the version; never touch `C:\Lumi` except to read;
never ports 8765/8766; sandboxes are `X:\aura-dev-*` and the `.aura\engine` **junction** comes out before the folder;
PowerShell stays ASCII + CRLF; scripts via the Write tool, not heredocs.

**Every item that touches render cost updates the `BLENDER.md` section 7 table with a measured number on the reference
laptop (MX350 2 GB / i5-1135G7). No estimates in that table.** The two numbers that were flagged as guesses have both
been **measured** (2026-10-05): the draft bake is **10.5 s**, not 20-30 s (B.1), and item 1 costs **+3 to +9%** as
shipped, +15% at full strength (Part A item 1) -- the guessed +10-30% band was right, and an early +247% reading was
an OptiX kernel compile, not the nodes.

A measurement rule learned the hard way, for whoever measures Part B: **warm the OptiX kernel cache before timing
anything.** The first render or bake that uses a new shader feature set compiles a kernel, once per Blender install,
and it can take minutes. Time the second run, not the first, and say which you timed.
