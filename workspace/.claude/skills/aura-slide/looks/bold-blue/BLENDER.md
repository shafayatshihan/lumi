# Bold Blue in Blender: the recipe

Use this when a slide's 3D figure is a Blender (Cycles) **studio render** instead of live three.js: a photoreal 1080p
still, or a seamless 20 fps animation loop. **The design rules are in `LOOK.md` section 4**, and this file does not
repeat them. It explains how to follow them in Blender without first rediscovering how Blender works. The helper
module is `.aura/engine/deck/blender/lumi_bpy.py`, and its docstrings hold the full pitfall list. The
build message of a Blender slide says where the scene goes and what the slide holder looks like.

**Who renders what.** You write `scene.py`. **Lumi renders the preview the user sees, asks them "Do you like the
design?", and makes the full render after they approve.** You never run the full render. After a change request you
edit `scene.py`, and Lumi renders the next preview by itself.

## 1. Run it: ONE plain command, nothing else

```
blender -b -P .aura/decks/<id>/blender/<slide>/scene.py -- --out .aura/decks/<id>/blender/<slide>/scratch/check.png --preview
```

- Type plain `blender`: Lumi puts its own Blender first on PATH. **Never** use a full path, a pipe (`| grep`), a
  redirection (`2>&1`, `>`), `&`, `$(...)`, `cd ... &&` or a second command on the same line. Lumi's permission gate
  refuses every other shape and tells you this one.
- `-b` comes before `-P`. The scene file must be inside the deck work folder (`.aura/decks/<id>/...`) or `.aura/temp`.
  `--python-expr` and `.blend` files are refused.
- Everything after `--` belongs to the script:
  `--out` (a `.png` file, or a folder for frames), `--preview` (a cheap check: 30 % size, 16 samples, simplified,
  and ONE frame even for an animation), `--res <pct>`, `--height 1080|720`, `--samples N`, `--anim` (every frame of
  the loop), `--frame N`, `--cpu`. Write only into `.aura/decks/<id>/blender/<slide>/scratch/`.
- The output is short: Blender 5 prints no render progress, so you only see the `[lumi]` lines (device, file written,
  seconds) and any Python error. `WARNING HIPEW initialization failed` is harmless (it is the AMD probe).
- Do at most **two** check renders per step, and Read the PNG after each. Never open the GUI, never save a `.blend`.

**Before any render, inspect.** The same command with `--inspect` instead of `--out` renders nothing, costs about a
second and no GPU, and catches most of the section 8 table as text:

```
blender -b -P .aura/decks/<id>/blender/<slide>/scene.py -- --inspect
```

It prints one `[lumi] inspect {"ok":..,"fatal":[..],"warn":[..],"stats":{..}}` line plus a readable line per finding,
and **exits non-zero when something fatal is wrong** (no camera, no studio, nothing in frame, a hidden part). Each
finding names the section 8 row that explains the fix. `--cavity` is the other flag worth knowing: it switches the
cavity-dirt AO node on, which Cycles does not need (section 7).

## 2. The scene.py template (copy it exactly, then change only the SUBJECT block)

```python
import math, os, sys
def _lumi():                       # finds lumi_bpy: LUMI_BPY (Lumi sets it), else walk up from this file to .aura
    d = os.environ.get('LUMI_BPY')
    if d and os.path.isfile(os.path.join(d, 'lumi_bpy.py')): return d
    d = os.path.dirname(os.path.abspath(__file__))
    for _ in range(12):
        for sub in ('engine/deck/blender', '.aura/engine/deck/blender',
                    'engine/deck/looks/bold-blue/blender', '.aura/engine/deck/looks/bold-blue/blender'):   # last two: decks made before 0.5.5
            if os.path.isfile(os.path.join(d, sub, 'lumi_bpy.py')): return os.path.join(d, sub)
        d = os.path.dirname(d)
    raise RuntimeError('lumi_bpy not found: keep scene.py inside the Lumi folder')
sys.path.insert(0, _lumi())
import lumi_bpy as L

a = L.args(); L.reset(a); L.gpu(a); L.cycles(a.samples)      # empty scene, GPU (OptiX>CUDA>...>CPU), AgX quality preset

# ---- SUBJECT (Blender is Z-up; the camera looks from -Y, so "front" = -Y) --------------------------------------
L.real('brief, slide 4', pipe_od_m=1.0, pipe_wall_m=0.09, pipe_length_m=3.2)   # LOOK-BASE 4.10: real numbers + source
pipe = L.lathe([(0.41, -1.6), (0.5, -1.6), (0.5, 1.6), (0.41, 1.6)], name='pipe', material=L.mat('steel'))
plug = L.lathe([(0, -0.55), (0.405, -0.55), (0.405, 0.35), (0.3, 0.45), (0, 0.45)], name='plug',
               material=L.mat('aluminium'))
parts = [pipe, plug]
for o in parts:
    o.rotation_euler = (0, math.pi / 2, 0); o.location = (0, 0, 0.5)   # lying on the floor (z = 0)
q = dict(normals=[(0, -1, 0), (0, 0, 1)], point=(0, 0, 0.5))           # quarter cutaway, front-top removed
L.cutaway(pipe, **q)
L.cutaway(plug, material=L.section(flip=True, name='sec_plug'), **q)   # touching parts: opposite hatch
# --------------------------------------------------------------------------------------------------------------

L.studio(fit=parts)                                        # floor shadow catcher, cove, key/fill/rim, softbox world
L.camera(parts, view='three-quarter', fill=0.62, frame_right=True)   # left ~40% kept empty for the title
L.render(a.out)
```

## 2b. An animation slide: a seamless 20 fps loop

Add the loop between `camera()` and `render()`. The same file then serves the preview (one poster frame), Lumi's full
render (`--anim`: every frame, 720p by default or 1080p, then an MP4) and your check renders.

```python
L.camera(parts, view='three-quarter', fill=0.55, frame_right=True)   # smaller fill: the widest angle must still fit
L.loop(4.0)                          # 4 s at 20 fps = 80 frames; 3 to 6 s is right for a slide
L.turntable(parts, turns=0.5)        # the whole subject turns half a revolution (use 1.0 if it is not symmetric)
L.move('sway')                       # the camera setup (section 2c): sway, push, crane, dolly, orbit, whip, still
# or per part:  L.spin(rotor, turns=2)  |  L.wave(piston, 'location', 2, amplitude=0.08, cycles=2)
#               L.animate(obj, 'rotation_euler', 0, lambda t: 0.3 * math.sin(2 * math.pi * t))   # any periodic fn of t in 0..1
L.render(a.out)
```

- Every helper keys frames 1..N+1 with a periodic function, so frame N+1 equals frame 1 and the loop has no jump. Use
  whole turns and whole cycles. Never key by hand with arbitrary end values.
- `loop(seconds, poster=N)` picks the frame the preview and the PDF page show. Motion blur stays off.
- Keep motion slow and readable (a half turn in 4 s). The camera moves only through `L.move()` (section 2c). Keep
  the scene light: under about 300k faces.
- **An animation is BAKED** (in a deck made with Lumi 0.5.6 or later): Lumi bakes the materials into textures once
  (about 1-2 minutes) and plays the model live, so the motion costs nothing extra and a change to the motion, timing or
  camera alone is free. **Glass commits the slide to a long render**: a scene with `L.mat('glass')` or any `trans=`
  cannot be baked, so every frame is path-traced instead (20-60 minutes). Use glass in a moving figure only when the
  slide is about the glass; a cutaway (`L.cutaway`, section 2) shows the inside without it, and bakes.

The order is fixed. Build the subject, then cut it, then call `studio()` (which sizes itself to the subject), then
`camera()`, then the loop (animations only), then `render()`. Keep `L.args()` and `L.render(a.out)` as they are: Lumi's
preview and full render pass their own `--out`, size and samples through them.

## 2c. Camera setups: a camera that moves like a camera (LOOK-BASE 4.11)

Every loop gets ONE camera setup, called after `L.loop()`. `camera()` framed the rest pose; the setup moves around it
and comes back, so frame 1 is still the framed picture and the loop closes by construction.

```python
L.camera(parts, view='three-quarter', fill=0.6, frame_right=True)
L.loop(5.0)
L.move('crane')                      # rises 18 deg over the subject and back down, the lens widening a little
# L.move('push', amount=0.7)         # smaller;  L.move('dolly', sway=0.5)  a move with the handheld drift layered on
# L.move('orbit', amount=1)          # whole turns (frame with fill ~0.55: every side must fit)
# L.move('still')                    # a slide with measured values (the gate below)
```

| setup | move | for |
|---|---|---|
| `sway` | handheld drift, about 1 degree, never a wobble | any loop that should hold still but feel alive |
| `push` | dolly in 20 % and the lens 12 % longer, there and back | one part is the point |
| `crane` | up 18 degrees, back 22 %, lens 20 % wider, there and back | a layout, a flow path, a stack |
| `dolly` | 30 degrees round one side, in 22 %, there and back | depth, the side of an assembly |
| `orbit` | `amount` whole turns, constant speed | an object that reads from every side |
| `whip` | one turn, lingering on four faces | the deck's one showpiece |
| `still` | holds the rest pose | measured values on the slide |

- Neighbouring 3D slides use **different** setups, and a different `view=` too.
- A baked loop carries the move: the bake records the camera on every frame and the player replays it by `t`, so a
  change of setup re-exports in seconds without a re-bake. On a slide with measured values the player holds the rest
  pose by itself. **A per-frame (glass) render cannot be held after the fact**: use `L.move('still')` there, or
  `deck_check.js` fails the slide.
- `--inspect` checks the subject at a quarter, a half and three quarters of the move (`move-out-of-frame`): lower
  `amount`, or frame with a smaller `fill`.
- The defaults were cross-checked against the camera skills in `kevinbadi/blender-skills` (crane-shot,
  dolly-rotate, slow-zoom, perfect-loop, dynamic-full-loop, turntable); their GUI/MCP rigs are not used.

## 2d. Real light and real surfaces from PolyHaven (optional, build time only)

`L.studio(fit=parts, hdri='studio_small_09')` lights the subject with a real captured studio (reflections and
ambient) instead of the gradient world; the background stays the exact slide colour. `L.pbr('metal_plate',
fallback='steel', scale=4)` is a real scanned surface (colour, roughness, metalness, normal). Both fetch once through
Lumi's toolkit and are cached; offline they fall back to the gradient world and to `L.mat(fallback)` and say so in one
line - never an error. To fetch ahead of time: `python .aura/engine/tools/fetch_asset.py hdri <id>` or `texture <id>`
(PolyHaven ids only; the tool cannot fetch anything else). Clean machined metal is usually best as a preset; a scanned
surface is for what really is cast, rolled, painted or weathered. A baked loop relights in three.js, so an HDRI changes
stills and per-frame renders only.

## 3. What the helper decides for you (do not re-decide)

| concern | what lumi_bpy does | override |
|---|---|---|
| background | renders on a transparent film, then composites onto the **exact** slide colour in sRGB. `#F9F4F2` comes out as 249,244,242 (verified) | `studio(bg='stage')` for `.bb-stage-bg` #EFEBE6, `'cyc'`, or any `'#hex'`. Use the colour of the slide the PNG sits on |
| transparent PNG | `studio(transparent=True)` keeps the alpha, and the floor shadow stays in the alpha | use it when the slide background is not flat |
| colour | AgX + `AgX - Medium High Contrast`. Plain AgX looks grey on this high-key studio, and Standard clips chrome highlights | `cycles(look='None', exposure=...)` |
| lights | warm key from the upper LEFT front (studio3d.js 2.3, `#FFF4EC`), cool fill from the right, a rim from behind (kept off the floor through light linking), and an overhead softbox. Power scales with subject size | `studio(key=, fill=, rim=, world=)` multipliers |
| reflections | a world gradient (bright ceiling, thin dark horizon line, light warm floor bounce) plus two black flags that only reflections see. These give metal its edge lines | `world=` |
| shadows | a soft key shadow and an overhead contact shadow on a flat shadow-catcher floor (equivalent to three.js `ShadowMaterial`) | `floor='flat'` (no cove), or `'none'` for things in flight or floating |
| GPU | OptiX first, then CUDA, then HIP/Metal/oneAPI, then CPU. Prints the device it chose | `--cpu` |
| quality | adaptive sampling, OIDN denoise (albedo+normal), indirect clamp 8, no caustics | `cycles(samples, denoise)` |

## 4. LOOK.md section 4 in Blender terms

- **Subject first (4.0).** Model the real thing in the place it really lives. `floor='none'` is for flight, cells and
  molecules. The cove backdrop is the stand-in for the clean cyclorama. **No wooden base, plinth, stand, gauge, vial or
  nameplate** unless the subject is that object. lumi_bpy has no wood preset on purpose.
- **Shadows, textures and reflections are mandatory (4.1).** `studio()` always provides shadows and reflections. Every metal,
  plastic, ceramic, rubber and cast preset carries a procedural texture: brushed streaks along the object's local Z,
  speckle, or a cast bump. So build tubes and shafts along local Z (`lathe`), and the brushing will follow the axis.
- **Materials (4.3).** `L.mat(kind, color=None, **overrides)`. The kinds are `steel aluminium cast_iron titanium copper
  brass chrome glass ceramic rubber plastic paint glow clay section`. `clay` is Clay Pop's material - see `looks/clay-pop/LOOK.md` 3.3. Use one hero material and at most three supporting ones. `paint` and
  `plastic` take any palette colour (`L.C['blue']` is the 3D blue `#0061EF`). Section faces default to hairline
  `#E2DED9` with 45-degree blue hatch lines. Use `L.section(style='flat', fill=L.C['ink'], name=...)` for rubber, and
  `flip=True` for a neighbouring part. Glass looks right in Cycles even when one glass object is inside another, unlike three.js.
- **Palette and colour (4.12, item 5).** Large surfaces should read as materials. Only the hero detail carries saturated blue
  or a `glow`. AgX turns bright emission white, so keep `glow` at 1.0 to 1.5. It defaults to 1.2.
- **Real counts and real dimensions (4.0).** Model the REAL number of teeth, blades, coils, bolts and fingers, and the
  real sizes. This is most of why a studio render reads as a photograph of a thing rather than a drawing of one, and it
  costs nothing at render time: a 41-tooth ring on an 11-tooth pinion is 3.73:1, a torque converter has 31 / 29 / 15
  blades, a diaphragm spring has 18 fingers, an M8 bolt is 13 mm across the flats with a 1.25 mm pitch. **State every
  count and dimension as a comment in `scene.py`**, and put it in the caption where it helps the point.
  **If a count or a size is unknown, ASK it in the build question. Never invent a plausible one** -- a wrong count is
  the first thing an engineer in the audience sees, and it is the one error that makes the rest look invented too.
- **Every moving part is its own object, at its real pivot (4.0).** `L.spin`, `L.wave`, `L.animate` and `L.turntable`
  key an object transform, so a part merged into its neighbour cannot move and a part whose origin is not on its real
  axis moves wrongly. It is also what `L.cutaway()`'s EXACT solver needs (section 5).
- **Micro-detail (4.12).** Use `L.bevel(obj, width)` on hard parts (cutaway applies it before cutting), `L.lathe` for anything
  turned (flanges, nozzles, shafts, O-rings as a circle profile), and `bpy.ops.mesh.primitive_*` for bolts, then
  `L.smooth(obj)`. `L.smooth` keeps flat caps flat. `shade_smooth()` alone smears them.
- **The parts that keep coming back are already written: `lumi_mech`.** `import lumi_mech as M` beside `import lumi_bpy as L`
  (same folder, same self-locating path). `M.gear(teeth, module, width, helix=, bore=)` is a TRUE involute tooth form;
  also `bevel_gear`, `spring(coils, wire_d, free_length, od)`, `bolt(size, length)` / `nut(size)` (ISO hex, with a real
  thread), `blade_ring(count, ...)`, `shaft(spline_teeth=)`, `bearing(bore, od, balls)`, `oring(bore, section)`. Every
  one returns a closed manifold mesh, pre-bevelled and smoothed, with its origin on its real pivot. `blade_ring` and
  `bearing` return a LIST of separate objects on purpose -- joining them would break the EXACT solver. Sizes are in
  metres; a gear pair meshes when both share `module`, at centre distance `module * (z1 + z2) / 2`.
- **Composition (4.12, item 6).** `camera(... frame_right=True)` fits the real silhouette into x 0.42 to 0.97 of the frame with lens
  shift, so verticals stay vertical. Views: `three-quarter` (the -22/14 deg default), `hero` (long lens, low, for the title),
  `front`, `side`, `high`, `top`, `low`. Neighbouring slides must not reuse the same view (LOOK.md variety rule).
- **No meaningful text in the render (4.13).** Labels are HTML tags on the slide, positioned over the PNG.

## 5. Cutaways

`L.cutaway(objs, normal=(0,-1,0), point=...)` removes the half-space that `normal` points to. The default removes the front
half, toward the camera. `normals=[n1, n2]` removes a quarter. Cut faces get the section material through the boolean's
material **TRANSFER** mode. Cut each part with its own call when the parts need different section materials. Pitfalls:

- The EXACT solver needs closed, manifold meshes that do not intersect themselves. `lathe` and primitives qualify, but meshes
  joined from overlapping parts do not, so keep parts as separate objects. On failure, cutaway retries with the FLOAT solver
  and then **raises** an error. It never returns an uncut part silently.
- A part that lies entirely inside the removed region disappears, which is correct. A part entirely outside is unchanged, and
  that raises the error above, so leave it out of the list.
- Cut faces are flat and smooth-shaded neighbours keep their shading (cutaway re-marks sharp edges).

## 6. Check cheaply; Lumi does the real renders

1. **Inspect, fix, then ONE `--preview`.** Run `-- --inspect` first (section 1): it is a second, it needs no GPU, and it
   catches a missing camera, a missing `studio()`, a subject outside the frame, a hidden part, inward normals, a material
   with no texture recipe and a part a cutaway swallowed -- all the things that otherwise cost a render to discover. Fix
   everything it calls fatal, and look at every warning. **Then** one check render with `--preview` (about 10 s on a laptop
   GPU): Read the PNG and check that the subject reads, the title zone (left ~40 %) is empty, the shadow sits under the
   subject, and the cut faces are visible. For an animation, check the poster frame, and once with `--frame <N/2>`
   (half-way) if the motion could leave the frame.
2. The background is exact by construction (section 3). Do not sample pixels or run other tools on the PNG.
3. Stop there. **Never** run `--res 100 --samples 128` or `--anim` yourself: Lumi renders the preview the user judges and,
   after approval, the full render (1080p 128 spp still; a baked animation's final bake follows its preview by itself;
   an animation with glass 720p or 1080p at 64 spp, 20 fps), with progress, cancel and a CPU fallback.

## 7. Timings (reference laptop: MX350 2 GB with OptiX, i5-1135G7)

| render | time |
|---|---|
| scene start (Blender launch, GPU setup, building the scene) | ~4 s |
| `--preview` (576x324, 16 spp) | ~8-12 s |
| **1920x1080, 128 spp, the cutaway test scene** | **89 s** |
| the same, with edge wear (the default: hero material + metals, Bevel 3 samples) | **97 s, +9 %** |
| the same, with edge wear AND `--cavity` (AO 3 samples) | 93 s, +5 % |
| the same, both at full strength (AO 8 / Bevel 6 samples, every material) | 102 s, +15 % |
| 1920x1080, 128 spp, a mechanical subject (41T + 11T gears, M8 bolt + nut) | 130 s |
| the same, with edge wear | **133 s, +3 %** |
| the same, with edge wear AND `--cavity` | 147 s, +13 % |
| animation, 80 frames (4 s) at 720p 64 spp (glass only) | about 20-30 min |
| a baked animation, the real gear-reducer slide (48 parts): draft bake / final bake | ~60 s / ~110 s |
| the same after a change to motion, timing or camera only (the textures are kept) | ~5 s |

**Edge wear and cavity dirt (measured 2026-10-05, bundled Blender 5.2.2, OptiX on the MX350).** Edge wear is on by
default for the hero material and the metals and costs 3-9 %. Cavity dirt is **off** for Cycles: path-traced global
illumination already darkens crevices, so the AO node changes 0.1-4 % of pixels by more than 2 levels for another
10 %, and it is kept only for the baked path (`--cavity`), whose target has no GI. **Watch out for the first render
of a scene that uses either node: OptiX compiles a new kernel for the shader-raytracing feature set, once per Blender
install, which added about 4 minutes.** That is a one-off, not the per-render cost; an early measurement that reported
+247 % was that compile, not the nodes.

Lumi measures this machine once and shows the user time and token estimates before every render. The first OptiX run
after a Blender install compiles kernels, which can add minutes. The CPU is about 2x slower than the GPU. Keep subject
meshes under about 1 M faces (300k for animations), because a laptop GPU has 2 GB of VRAM.

## 8. Black or wrong render: what to check

Run `--inspect` (section 1) BEFORE a render: the "inspect says" column is the code it prints, and everything marked
**fatal** makes it exit non-zero. The last three rows are not checkable without an image, which is what the one
`--preview` is for.

| symptom | inspect says | cause and fix |
|---|---|---|
| all background, no subject | `nothing-in-frame` (fatal) / `hidden` (fatal) | no camera, or the camera is not aimed at the parts: call `L.camera(parts)` after building them. Also check for `hide_render`, or objects linked to a collection that is not in the scene |
| black frame | `no-camera` (fatal) / `no-world` (fatal) | `scene.camera` is unset, or a hand-made world or lights replaced `studio()`. Do not add your own `bpy.ops.object.light_add` at default power |
| cut-off or missing near geometry | `clipped` (warn) | clip start is set too far. `camera()` sets it from the distance, so re-run `camera()` after moving parts |
| a part of the cutaway has vanished | `vanished` (warn) | the part lies entirely inside the half-space the cut removes: leave it out of the cut, or move the cut plane |
| flat, plasticky surfaces | `no-material` / `flat-material` (warn) | a mesh with no material, or a hand-rolled one with no texture recipe: use `L.mat(kind)` (LOOK.md 4.1) |
| a likeness, not the thing (LOOK-BASE 4.10) | `no-real` / `analogy` / `no-preset` (fatal) | no `L.real(source, **dims)` declaring the real numbers and their source; a part named as a stand-in (cloud, puff, sparkle, heart ...) - draw flow and heat as arrows or streamlines; or no part in a real material (`L.mat`, `L.pbr`, `lumi_mech`) |
| a loop with a locked-off camera, or a move that loses the subject | `static-camera` / `move-out-of-frame` (warn) | add `L.move('<setup>')` after `L.loop()` (section 2c); lower its `amount` or the camera's `fill` |
| the render takes far too long | `triangles` (warn) | over the budget (1 M for a still, 300 k for an animation): simplify, or drop a subdivision |
| dark or faceted surfaces | `inward-normals` (warn) | normals point inside (`L.fix_normals`) or smoothing is missing (`L.smooth`) |
| grey, washed-out image | - | plain AgX or a raised exposure: keep the default look |
| background a few levels off | - | the PNG was rendered with `transparent=True` and viewed without its alpha, or a second composite was applied |
| hatch lines too thick or thin | - | `L.section(spacing=, width=)`. Spacing is the number of lines across the frame width, so it does not depend on resolution |

## 9. In the deck: the holder, the slide colour, the labels

**Holder.** Where a three.js slide has `<div class="aura-3d bb-3d" ...>`, a Blender slide has
`<div class="bb-blender bb-3d" data-blender="<slide id>" data-kind="still|animation" role="img" aria-label="..."></div>`
(inside `.bb-stage`; `bb-full` for a full-bleed title render; `bb-framed` rounds the corners). Leave it empty: Lumi's packer
fills it with the approved render (an image, plus a muted looping `<video>` for an animation), and with the latest preview and a
small "preview" tag until the user approves. Do not write `<img>` or `<video>` yourself, and do not put a three.js scene on the
same slide. Presenter mode plays the loop only while the slide is on screen.

**Slide colour.** The render is composited onto one flat colour and the checker compares its edges with the slide's own
colour, so the two must match: default slide `bg='canvas'` (#F9F4F2), `bb-stage-bg` -> `'stage'`, `bb-blueprint-bg` ->
`'blueprint'`, `bb-title-bg` -> `'title'`, `bb-close-bg` -> `'close'`. Put the picture straight on the slide (`.bb-stage`), never inside a
`.bb-studio` card (its gradient would not match the flat render). The floor shadow fades out at the frame edge by itself.

**Labels.** Projected labels work as in three.js, but are anchored on the 2D render: give the scene
`L.anchor('name', part, offset=(0, 0, 0.3))` (an object, so it follows the motion, or a world point) and write
`<div class="bb-tag" data-anchor="name" data-align="left"><b>..</b><span>..</span></div>` inside the holder. Lumi records each
anchor as a percentage of the frame (per frame for a loop) next to the render, and the slide places the label there at any size.
A label with no anchor stays hidden, and the checker says so.

**Which archetypes.** A still suits `title-hero` (full-bleed, `bb-full`), `problem-stats` and `what-it-is` (labels as above).
A short loop (a turntable, one part waving) suits `what-it-is` and `problem-stats`. The camera tours and timed stories
(`system-tour`, `comparison-twin`, `objectives-tour`, `process-film`) drive HTML from the scene's clock (`Aura.sync`), which a
rendered loop cannot do: keep those on live three.js. `LOOK.md` stays the authority for layout, type and the clash matrix.

