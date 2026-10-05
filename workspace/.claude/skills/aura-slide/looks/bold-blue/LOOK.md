# Bold Blue — the look's authority

Read this whole file before writing a Bold Blue slide. It overrides `aura-blend.md`, the form's style choices and
`deck-toolkit.md` wherever they disagree. It is subject-free: everything here works for molecular biology, chemical
engineering, nanotech, electrical engineering, economics or anything else. The look was measured from one reference
deck (a 16-slide engineering thesis talk, 1920 × 1080); none of its subject matter belongs in your decks.

Files you will use (all under `.aura/engine/deck/`):

| file | what it gives you |
|---|---|
| `themes/bold-blue.css` | tokens, type, layout grid, footer, stat stacks, chips, tags, cards, entrance motion |
| `looks/bold-blue/template.html` | the starting deck (title + closing); `new_deck.js --theme bold-blue` uses it |
| `looks/bold-blue/archetypes/*.html` | one ready slide per archetype: Read `.aura/engine/deck/looks/bold-blue/archetypes/<name>.html` |
| `looks/bold-blue/bold-blue.js` | page numbers, count-ups, `BBChart.line` |
| `looks/bold-blue/studio3d.js` | `BB3D`: studio, materials, textures, shader injections, labels, geometry, post-processing |
| `looks/bold-blue/timeline.js` | `BBTime`: easing, loop phase, keyframe tracks, segments, camera tours |
| `looks/bold-blue/physics.js` | `BBPhys`: fixed-step simulation (particles, springs, diffusion, flow) + seamless loop |
| `runtime.js` (top comment) | the **capture contract**: loop periods, `?capture`, recorded loops, `?still=n` |

---

## 1. Tokens

**Canvas and ink.** Canvas `#F9F4F2` (warm off-white, never `#FFF`), with four slide backgrounds:
`.bb-stage-bg #EFEBE6` (stat + 3D), `.bb-blueprint-bg #EEF0F2` + `.bb-grid-bg` (what-it-is, 48 px drawing grid),
`.bb-title-bg #EEEBE7`, `.bb-close-bg #F7F5F2`. Ink `#2D2C2B` (never `#000`), secondary `#44423F`, muted `#5C5751`,
label `#6E6861`, hairline `#E2DED9`. White `#FFFFFF` only for cards, chips and the chart card.

**One accent.** Blue is the ONLY emphasis colour (text blue `--accent` `#005AE0`, the reference `#0061EF` darkened until it clears 4.5:1 on every canvas; the 3D art keeps `#0061EF`): exactly one `.em` phrase per headline (blue + soft 24 %
underline bar; `.em.mark` is the highlighter variant; `.em.wrap` lets a long phrase wrap). Orange `#FF7E1D` is identity
only: the footer dot, the title kicker dot, the 4 px progress line. Everything else (`--hot #E23B00`, `--cold #1F6FD1`,
`--copper #C97B3C`, `--green #02873E`, `--amber #E08A00`, `--violet #5431A5`, `--yellow #FFCE00`, `--sky #00A4FF`)
lives in the art, the stat rules, the tags and the data — never in body text.

**Type.** Poppins for everything, DM Mono for page numbers only. Two typefaces, no third.
Scale: **20 / 28 / 36 / 48 / 64 / 112 / 176** (the same numbers are in the table in `.claude/CLAUDE.md` and `hard-rules.json`).

| size | used for |
|---|---|
| 176 | the closing headline at most (a short message or "Thank you."); longer messages use 112 |
| 112 | a single giant number on a section slide (rare) |
| 64 | headlines (`.headline`, `.title`), 700, −0.03 em, max 17 ch (title slide 27 ch) |
| 48 | big stats (`.bb-stat`), process-card name |
| 36 | medium stats (`.bb-stat.md`), sub-lines, goal names, "Open for questions" |
| 28 | everything else: kicker, body, stat captions, chips, tags, axis ticks and titles, names |
| 20 | **only** the footer mark, the page number, captions / source lines (`.cap`, `.source`, `figcaption`), the chart's step labels and event pill |

The checker enforces it: 20 px anywhere else is an error; nothing is ever below 20 px.

**Space.** 1920 × 1080, 96 px safe zone (`.safe`), 12-column grid with 32 px gaps (`.bb-main`), 8-pt spacing.
Columns: `.bb-l` 5 + `.bb-r` 7 (default), `w4/w8` (chart slides), `w6/w6`, `w7/w5` (closing). Radius 32 / 48 px.

**Chrome.** Every slide ends with `<footer class="bb-foot">`: orange dot + short deck mark (≤ 4 words, uppercase,
20 px) left, `<span class="bb-pageno"></span>` right (filled as "03 / 12" in DM Mono). The runtime draws the 4 px
orange progress line. The kicker is "NN · Topic" with a 48 × 6 dash (`.kicker`); NN counts sections (the title has
none); the title slide uses `.kicker.dot` (orange dot) with the course or event instead of a number.

**Motion tokens.** Entrance curve `cubic-bezier(.16,.84,.30,1)` (`--bb-ease`, `BBTime.ease.bb`). Rise 40 px,
lift 26 px + scale .985, pop 18 px + scale .9; 0.7–1.05 s; staggered 0.42 / 0.56 / 0.70 / 0.84 s. The theme applies
them automatically (kicker, headline, sub, stat rows, chips, goals, cards, tags fade in at 1 s). Count-ups:
`<span data-bb-count>45</span>` (final value in PDF / check / editor).

---

## 2. Archetype catalogue (a menu; the order is the default story arc)

Open one with the **Read** tool: `.aura/engine/deck/looks/bold-blue/archetypes/<name>.html` (no shell command needed), replace
every `{{N}}` with the slide number and the kicker's two-digit number with the slide number minus one (the title slide has
no kicker number), and paste it before the closing slide. Each comes with placeholder text, a working scene and model speaker
notes. Replace everything. (`node .aura/engine/tools/new_deck.js --snippet <name> --slide <n>` prints the same, filled in.)

| # | archetype | main visual | companions | layout | words |
|---|---|---|---|---|---|
| 1 | `title-hero` | full-bleed 3D hero on a studio cyclorama | dot kicker, names | text left 860 px, object right half | ≤ 40 |
| 2 | `problem-stats` | 3D object showing the pain | ≤ 3 stats (one with a bar), one close line | 5 / 7 | 30–55 |
| 3 | `what-it-is` | the object in 3D | ≤ 3 facts, 2–4 projected tags | 5 / 7 on the blueprint grid | 30–55 |
| 4 | `process-film` | one 3D "film" through N states | cycling glass card + heat/progress rail (inside the holder) | stack: head row + wide studio stage | 10–20 on slide; card text cycles |
| 5 | `comparison-twin` | two versions in ONE 3D scene | 2 numbered stats, 2 pills, close line | 5 / 7 | 25–45 |
| 6 | `annotated-photo` | the user's real photo + overlay marks | ≤ 3 zone rows, one inset with caption | 5 / 7 | 25–45 |
| 7 | `system-tour` | camera tour of a system's parts | one label that follows the visited part, a small map (inside the holder) | stack | 10–20 |
| 8 | `result-chart` | one 2D line chart on a white card | ≤ 3 finding chips | 4 / 8 | 20–35 |
| 9 | `objectives-tour` | 3D tour visiting each goal | checklist ≤ 4 rows, lit in step (`Aura.sync`) | 5 / 7, soft colour blobs behind | 25–45 |
| 10 | `closing` | designed per deck: a closing message that fits the talk + a subject-specific visual | names / contact, one short line | one of 4 variants (see below) | ≤ 40 |

**The closing slide is designed for each deck, never pasted.** The snippet is a skeleton with four layout variants
(A message-left / visual-right, B centred big question, C next-steps rail, D contact card), not a finished slide. Rules:
1. **The message fits the talk.** Pick one: the key takeaway in one sentence, a final question to the audience, the
   next steps (≤ 3), or contact details. "Thank you." is only **one** option, and when used it is not the headline of
   every deck; never the default "Thank you. / Open for questions" pair.
2. **The visual is about this subject**: a small SVG or 3D drawing of the subject's own shape or key quantity (the
   engine profile, the dose curve, the bridge span), animated gently if the look allows. **Never the heat-pipe copper
   path loop** or a drawing carried over from another deck.
3. **Vary the composition**: choose the layout variant, the headline size (within the 176 px ceiling), the accent word
   and the visual position to suit the message. **Two decks must never end with an identical closing composition**;
   if you remember the last closing you made, do something different.
4. Keep the tokens: palette, type scale, 20 px only for footer / page number / captions, the closing word budget, one `.em` accent.

DOM skeleton shared by every content archetype:

```html
<section class="slide bb-stage-bg" data-kind="content" data-minutes="1.5" data-title="Short title">
  <div class="safe">
    <div class="bb-main">                                   <!-- or .bb-main.stack with a .bb-head row on top -->
      <div class="bb-l w5"> kicker · headline · companions </div>
      <div class="bb-r w7"><div class="bb-stage"> main visual </div></div>
    </div>
    <footer class="bb-foot"><span class="bb-mark">Deck mark</span><span class="bb-pageno"></span></footer>
  </div>
  <aside class="notes" data-aura-notes> 60–300 words </aside>
</section>
```

Companion parts: stat stack `ul.bb-stats > li` (colour the 6 px rule with `.copper .hot .ink .sky`; `.bb-stat`, `.bb-stat.md`,
`.bb-bar` with `--v`), numbered `ol.bb-steps` with `.bb-n` discs, `ul.bb-zones` (photo zones), `ul.bb-chips`,
`ol.bb-goals` (`.on`, `.wip`), projected `.bb-tag` (`.cold .hot .blue`) and `.bb-pill`, `.bb-cyc` + `.bb-rail`
(process film), `.bb-map` (system map), `.close-line` (one sentence, its key words in `<b>` blue).

Word budgets are hard caps (the checker counts), presenter mode: title 45, section 12, content 55, quote 30, closing 40,
references 140; in document mode a content slide may hold 90. Words are tokens that contain a letter. Measured reference:
content slides 21–53 words. Fewer is better. (The same numbers are in the table in `.claude/CLAUDE.md`; a test keeps them equal.)

---

## 3. The clash matrix (one main visual per slide)

Every slide has exactly ONE main visual: **3D · chart · diagram · photo · text-only**. A 2D canvas loop (`.aura-canvas`) counts
as the **diagram**, so it never sits beside a 3D scene, a chart or a photo. Allowed companions:

| main visual | companions it supports | never with |
|---|---|---|
| 3D | ≤ 3 stats / facts, a checklist (≤ 4), projected labels (2–4), a small map | a chart, a photo, a second 3D holder, chips |
| chart | ≤ 3 annotation chips | 3D, a photo, insets, stat stacks |
| photo | ≤ 3 zone rows, one inset, overlay marks | 3D, a chart, chips |
| diagram (`data-visual="diagram"`) | short numbered steps | 3D, a chart, a photo |
| text only | one big claim or quote | anything else |

If the plan asks for two main visuals, **swap** one, or **put it on its own slide** right after. `deck_check.js` fails
a slide with two main visuals, more than 3 stats or chips, chips without a chart, an inset without a photo, more than
3 zone rows or 4 checklist rows. Two objects to compare go in ONE scene (`comparison-twin`), never two holders.

---

## 4. The 3D recipe

> A slide's 3D picture may be a Blender studio render instead of live three.js (the plan's engine choice): same boxes, same labels, same clash matrix (one main visual). `BLENDER.md` section 9 says how it sits in the archetypes (stills: title-hero, problem-stats, what-it-is; short loops: what-it-is, problem-stats; tours and timed stories stay three.js).

### 4.0 First decide what the subject really is, then show IT (every 3D slide, before any code)

Ask: **what is this slide about in the real world, and what would a photographer or a documentary shoot to show it?**
Draw that thing, in the place it lives. Not a lab rig, not a stand with a gauge. The recipes in 4.11 (vial on a wooden
base, stirred tank, transformer, nanotube) are **examples of one case each, shown because that subject really is that
kind of object**; they are never the default composition. A scramjet talk shows the vehicle or its engine cutaway in
flight with shock waves; a vaccine talk shows the cell or the particle in its world; a bridge talk shows the bridge.

| subject family | show this | staging (pick per subject) | typical props / cues |
|---|---|---|---|
| aerospace, vehicles | the real vehicle or its engine cutaway, in flight or on its pad / track | `sky: true, floor: 'none'` for flight; runway or road only for ground vehicles | shock waves (translucent cones), flow streaklines, exhaust glow, a scale silhouette |
| machines, mechanisms | the real machine running, parts that move as they do | workshop floor, or `floor: 'none'` for an exploded / cutaway view | gears, shafts, belts, housings with a cut-away quarter |
| electronics, circuits | the board, chip or device itself, current shown as moving light | a desk surface or `floor: 'none'` hovering magnified board | traces, packages, connectors, glowing flow along tracks |
| molecules, cells, biology | the molecule, cell or tissue, magnified, in its own medium | **interior of a cell** / fluid medium (`floor: 'none'`), soft depth, drifting particles | membranes, organelles, receptors, motion by diffusion |
| chemistry, process plants | the real reactor, column, pipework or the reaction in its vessel | plant floor, or `floor: 'none'` for a molecular view | vessels, pipes, valves, level glass, liquid and bubbles |
| civil, architecture | the building, bridge, dam or road in its site | terrain slab or ground plane, `sky: true` for a landmark | load arrows, sections, people-for-scale, crowd of cars |
| energy systems | turbine, panel array, grid, battery pack, in the landscape or cut open | landscape / `sky: true`, or `floor: 'none'` for a cell cutaway | blades, cells, lines, flow of energy as light |
| materials, nano | the lattice, grain structure or surface, magnified | `floor: 'none'`, shallow depth of field | atoms and bonds (`instanced`), cracks, layers |
| medical | the organ, device or drug acting inside the body | tissue / organ medium, `floor: 'none'` | vessels, tissue, a capsule dissolving, flow |
| software, abstract systems | a physical metaphor that is honest about being one (a network of nodes, layers of a stack, a pipeline) | clean cyclorama (`cyc: true`) is fine here | nodes, links, packets moving along edges |

Staging is chosen **per subject**: sky or flight environment, the inside of a cell, a workshop floor, a landscape; the
clean cyclorama (`cyc: true`) only when nothing in the subject's own world is better. Whatever the staging, the Bold
Blue light and cream feel stays (soft warm key, light backdrop, no dark scenes) and shadows, procedural textures and
reflections stay **mandatory** (4.1). A flying object still casts light and reflections; give it a soft shadow-catching
surface only if something sits below it.

**Lab apparatus, a bench, a wooden base, a vial or a gauge only when the subject IS a lab apparatus** (a titration
setup, a test rig the talk is about). **Variety rules:** neighbouring slides in one deck must not repeat the same props,
composition or camera angle (change the distance, the angle, the staging or the hero part), and two decks on different
subjects must not look alike. **Props you must not default to: a wooden base or plinth, a gauge or dial, a vial or
flask, a stand with a pole, a nameplate**, unless the subject is that.

### 4.1 Mandatory, every time
1. **Shadows** — `BB3D.studio` (VSM soft shadows, radius 14, blurSamples 20) and `S.add()` (casts and receives).
2. **Textures** — at least one procedural texture in the scene (wood grain, brushed metal, noise, bumps, speckle);
   the material families already carry them (`metal` brushed, `plastic` speckle, `soft` bump normals, `wood` grain).
3. **Reflections** — the softbox environment (`scene.environment`, PMREM) is always on; use physical materials.
4. **Recordable** — declare the loop period (`Aura.scene(id, setup, { period })` or `data-period`), make every
   motion periodic in it, and never read the clock, `Math.random()` or the previous frame inside `update(t)`.
   `deck_check.js` fails a 3D slide without a capture entry, and one whose frame at t = period differs from t = 0.

### 4.2 Studio setup
```js
Aura.scene('s3-scene', (ctx) => {                       // ctx: THREE, el (the holder), renderer, width, height, period
  const { THREE } = ctx, P = ctx.period;
  const S = BB3D.studio(ctx, {
    target: [0, 1.2, 0], distance: 12, azimuth: -22, elevation: 14,          // three-quarter view, slightly above
    // everything else defaults to the values measured from the reference renders (table below); override sparingly
    flicker: null,                                                            // { at, color, intensity }: a practical light
  });
  const M = BB3D.materials(THREE);                      // presets; or build your own with BB3D.mat.*
  S.add(/* meshes */);
  BB3D.labels(S, ctx.el, { name: [x, y, z] });          // projected tags (4.9)
  return S.api({ update(t) { const w = BBTime.phase(t, P); S.orbit(t); /* pose everything from w */ } });
}, { period: 16 });
```
Staging options are all optional and neutral: `floor: 'none'` (no ground, for flight, cells, molecules), `sky: true`
(or `{ top, bottom }`: the flight / open-air gradient backdrop, light only) - the gradient fills the whole holder, so use it on a full-bleed (`bb-full`) holder, or on a side holder that is a soft rounded panel, `cyc: true` (clean cyclorama). The `stage`
default is just a soft shadow-catching floor under a transparent canvas; use it only when something stands on a floor.
Two presets, both measured from the reference deck's own render code:

| | **stage** (default: 3D beside text) | **cyc** (`cyc: true`: the full-bleed title studio) |
|---|---|---|
| canvas | transparent; `ShadowMaterial` floor, opacity .14 | opaque photo cyclorama: one swept surface (floor → cove radius 5 → wall), colour `#EFEAE8`, self-lit .20, background `#F1EEEA`, a horizon falloff band (the wall ~13 % darker where it meets the floor, as measured) |
| lens | fov 30, distance ~12 | long lens: fov 24, distance 22–30, elevation 5–6°, azimuth −16° |
| framing | object in the right two-thirds of its holder | `shift: -0.25` (view offset): the target sits at ¾ width, clear of the title |
| key | `DirectionalLight #FFF4EC` 2.3 from the upper **left** (−5, 11, 8) | 2.6 from (−7, 13, 10) |
| fill | hemisphere `#FFFFFF`/`#D8CEC4` .55 | cool fill `#E6EFFF` .6 from the right + hemisphere .45 |
| shadow | VSM radius 12, 16 samples | VSM radius 14, 20 samples |
| environment | softbox room 40×20×40: top box ×6, warm side box ×4, two black flags | 50×26×50: top box ×7, warm box ×5, cool box ×4, two black flags, darker floor bounce |
| post | AO + bloom (threshold 3.2) | AO + bloom (+ DoF for a tour) |

Scale the cove to the subject (`cycRadius` ≈ the object's height, `cycBack` just behind it) so the horizon band shows
behind the object. ACES tone mapping (exposure 1.0) and sRGB output are set for you.

### 4.3 Materials library (`BB3D.mat.*` factories; `BB3D.materials(THREE)` presets)

| family | factory | for | presets |
|---|---|---|---|
| metal | `mat.metal({ color, roughness, clearcoat, brushed })` | copper, steel, aluminium, gold, electrodes, tools | `copper steel aluminium gold brass darkSteel` |
| glass | `mat.glass({ tint, thickness, ior, attenuation })` | vials, tubes, windows, lenses, cuvettes | `glass` |
| plastic | `mat.plastic({ color, roughness, clearcoat })` | housings, PCBs, beads, molecules, toy-like parts | `plastic black blue` |
| ceramic | `mat.ceramic({ color, glaze })` | porcelain, bone, stone, insulators, catalyst pellets | `ceramic` |
| organic / soft | `mat.soft({ color, sheen, translucency, bumps })` | cells, tissue, membranes, fruit, rubber, fabric | `soft rubber` |
| liquid | `mat.liquid({ color, clear })` | water, blood, reagents, fluids in channels | `water waterClear` |
| emissive | `mat.emissive({ color, intensity })` | hot wire, LEDs, screens, fluorescence, sparks | `hot led` |
| wood | `mat.wood({ seed })` | bases, plinths, benches | `wood` |

Rules: one hero material and at most three supporting ones per scene; colours from the palette (`BB3D.C`). A
transmissive object (glass, clear liquid, `soft` with `translucency > 0`) **cannot be seen behind or inside another
transmissive object** (a three.js limit): things inside glass are opaque. Emissive intensity above ~3.2 blooms.

### 4.4 Procedural textures (`BB3D.textures.*`, all CanvasTexture, no image files)
`wood` (sine-perturbed grain + pores, colour map) · `brushed` (streaks, roughness map) · `noise` (multi-octave value
noise; with `tint: [r,g,b]` a mottled colour map) · `speckle` (fine grain) · `bumps` (round-bump **normal map**: skin,
membranes, cast metal) · `glow` (sprites) · `contact` (soft contact shadow) · `printed(THREE, w, h, draw)` (draw a
dial, a chip marking, a screen, a label with the 2D canvas API — text drawn into a texture is decoration only and never
carries meaning; meaningful words are HTML tags).

### 4.5 Shader injection (`BB3D.shaders.*`, chainable `onBeforeCompile`)
- `stripes(THREE, mat, { count, width, color })` — bands along a tube's length (uv.x): nucleotides, current pulses,
  flow markers, conveyor items. Animate with `u.uStripePhase.value = k * BBTime.wrap(t, P) / P` (k whole bands per loop).
- `heatGlow(THREE, mat, { axis, from, to, color })` — emissive ramp along an axis; set `u.uHeat.value` (0..1):
  hot zones, active regions, charge build-up.
- `rim(THREE, mat, { color, power, strength })` — Fresnel rim light that lifts soft or glass objects off the pale canvas.
- `displace(THREE, mat, glsl)` — vertex displacement (edit `transformed`; `uT` uniform): menisci, membranes breathing,
  ripples. It does not reach the shadow map, so keep it small.
- `inject(mat, { uniforms, vertex, emissive, fragment })` — your own; `vBBUv` (uv) and `vBBPos` (local position) exist.

### 4.6 Lights and shadows
One warm key `DirectionalLight` (upper left front, soft VSM shadow), a hemisphere fill (white sky, warm ground), on the
title studio a cool fill from the right, and the softbox environment with **black flags** — the flags are what put the
dark edge lines on metal and glass that make them read as real. Add a practical light only when the subject has one (a heater, a flame, an LED):
`flicker: { at, color, intensity }` and `S.flicker(t)` (periodic). Never coloured stage lighting, never a dark scene,
never a visible light source floating in space. Use `BB3D.contactShadow` under objects that need weight.

### 4.7 Environment and post-processing
The environment is a softbox room (bright emissive panels) prefiltered with PMREM: it is what makes metal look like
metal. Post-processing is self-contained (no add-ons, so a packed deck stays one offline file):
- **ambient occlusion** (on by default): a crease AO from the depth buffer — two opposite samples both in front of a
  pixel mark a concave corner, so parts darken where they meet each other and the floor (crisp contact), while flat
  and tilted planes stay clean. On a transparent canvas it also darkens the floor under the object. `aoRadius`
  (world units, ~0.3), `aoIntensity` (~0.9). It stands in for the reference's GTAO pass;
- **bloom** (bright pass over `threshold`, dual-filter mip chain) — for emissive parts only; default threshold 3.2;
- **depth of field** (`dof: true, focus, aperture`) — for tours, to push background objects back;
- **adaptive quality**: during the live talk, if frames take > 24 ms the studio drops AO, then DoF, then bloom, then the
  shadow-map size, then the pixel ratio. Capture and still frames always render at full quality.

### 4.8 Motion types (the user picks one per slide on the planning page)

| motion | what it is | how |
|---|---|---|
| **still** | nothing moves; one perfect frame | `{ period: 0 }`; pose the camera once |
| **timed animation** | closed-form functions of t | every sin/cos uses `w = BBTime.phase(t, P)` with whole harmonics (`w`, `2w`, `3w`); `S.orbit(t)`; `BBTime.track`, `BBTime.segments`, `BBTime.tour` |
| **physics-like** | scripted to look physical, still closed-form | eased keyframes, damped oscillation built from harmonics, objects riding curves (`BB3D.along`), `BBTime.pulse` for bursts |
| **real simulation** | a fixed-step integrator — only when the user picks it | `BBPhys.particles / springs / diffusion / flow` wrapped in `BBPhys.loop(make, { period, warm, blend })` |

Loops are calm: 12–40 s periods, a full camera sway of ±5–7° azimuth, objects drift, nothing flashes. Process films:
~8 s per state. A **real simulation** is honest physics: fixed `dt`, counter-based random numbers (`BBPhys.rand`), a
warm-up past the start-up transient, and a cross-fade over the last `blend` seconds so `sample(period) === sample(0)`.
Say "simulation" in a 20 px caption under it, with the method ("Brownian random walk, fixed time step · speed scaled
for view"). Never call a scripted animation a simulation.

### 4.9 Camera choreography
- Default: `S.orbit(t)` — azimuth sways on harmonics 1 and 3, elevation on 2, distance breathes on 1: irregular to the
  eye, exactly periodic. Tune `swayAz` (4–7°), `swayEl` (≤ 2°).
- Tours: `const tour = BBTime.tour({ shots: [{ pos, target, hold: 4.5, move: 1.5 }, ...] })` then `S.tour(tour(t))`,
  `{ period: tour.period }`. End on a pull-back to the whole. `tour(t).focus` says which shot is on screen.
- Keep the object's silhouette inside the holder; never cut the hero at the frame edge, never fly through objects.

### 4.10 Projected labels
HTML tags (`.bb-tag`, `.bb-pill`) live **inside** the `.aura-3d` holder with `data-follow="name"`;
`BB3D.labels(S, ctx.el, { name: anchor })` moves them every frame. Anchor: `[x, y, z]` world point (a point on a
sphere's surface stays on the surface however it turns), an `Object3D`, or `t => [x, y, z]`. `data-align="left|right|
center"` puts the text right of / left of / centred on the point; `data-dx`, `data-dy` offset it. Labels are clamped
to the holder and the 96 px safe zone. 2–4 per slide, 28 px, 1–3 words + ≤ 4-word description. Because they live in
the holder they are recorded into the loop video with the picture. DOM *outside* the holder that must follow the scene
(a checklist row, a map node) uses `Aura.sync(sceneId, t => ...)`, which also follows a recorded loop.

### 4.11 Turning any subject into procedural geometry
Work from the real object's anatomy: list its 3–6 visible parts, give each a primitive, a material family and a size
ratio; one part is the hero. Everything is built in code: `lathe` (anything round in profile: vials, beakers, flasks,
bearings), `tube` + `path2d` + `curve` (pipes, wires, strands, vessels, tracks), `helix` / `coil` (springs, DNA, windings,
threads), `roundedBox` (devices, chips, boards, cells of a battery), `blob` (cells, organs, droplets, particles, rocks),
`instanced` (repeating units: lipids, atoms, fins, bolts, crowds), `along` (things riding a path), `glowSprite` (light,
heat, fluorescence). Real scale goes in the notes, not in the model.

**Use the REAL counts and the REAL dimensions, and give every moving part its own object at its real pivot.** A ring
gear has the number of teeth it has (41 on an 11-tooth pinion is 3.73:1), a torque converter has 31 / 29 / 15 blades, a
diaphragm spring has 18 fingers, a spring has 6 coils of 13 mm wire. Accuracy is realism and it costs nothing to
render; state each count in a comment and in the caption where it helps. **If a count or a size is not known, ASK it in
the build question -- never invent a plausible one.** A part merged into its neighbour cannot move, and a part whose
origin is off its real axis moves wrongly, so each one is its own object with its origin on its pivot. In Blender the
standard parts are already written (`lumi_mech`: involute gears, springs, ISO bolts and nuts, blade rings, shafts,
bearings, O-rings) -- see BLENDER.md section 4.

*The four recipes below are worked examples, each right for its own subject. Do not reuse their bases, stands or
props for a different subject; start from 4.0.*

**Molecular biology — a lipid nanoparticle.** Shell: `instanced` small spheres on a Fibonacci sphere (two layers,
gold `plastic` outside, salmon `soft` inside), a wedge left out so the inside shows; mRNA: `tube` through a smooth
random walk inside, `plastic` blue with `stripes` (bands flowing = the message); PEG: short wavy `tube`s on the surface.
```js
const pts = []; for (let i = 0; i < n; i++) { const y = 1 - 2 * (i + .5) / n, a = i * 2.39996, s = Math.sqrt(1 - y * y);
  const p = new THREE.Vector3(Math.cos(a) * s * R, y * R, Math.sin(a) * s * R); if (!inWedge(p)) pts.push(p); }
g.add(BB3D.instanced(THREE, new THREE.SphereGeometry(R * .075, 16, 12), M.lipid, pts.length, (i, d) => d.position.copy(pts[i])));
const rna = BB3D.tube(THREE, coilPoints, R * .06, M.rna); const band = BB3D.shaders.stripes(THREE, M.rna, { count: 140 });
```

**Chemical engineering — a stirred tank reactor.** Vessel: `lathe` profile (dished bottom, straight wall, flange) in
`steel`, a cut-away quarter (`LatheGeometry` with `phiLength = 1.5π`) so the inside shows; liquid: an inner `lathe` in
`liquid` with its free surface `displace`d into a vortex dip; impeller: `roundedBox` blades on a shaft, rotating
`w * 3` (three turns per loop); heating jacket: `heatGlow` on the outer wall; bubbles: `instanced` spheres rising on
`BBTime.wrap` paths. Tags: inlet, impeller, jacket.
```js
const shell = BB3D.lathe(THREE, [[0, 0], [1.1, .15], [1.2, .5], [1.2, 2.6], [1.3, 2.6]], M.steel, 64);
shell.geometry = new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(...p)), 64, 0, Math.PI * 1.5);   // cut-away
BB3D.shaders.displace(THREE, M.water, 'float r = length(transformed.xz); transformed.y -= 0.25 * exp(-r * r * 3.0);');
impeller.rotation.y = 3 * w;                                              // whole turns per loop: seamless
```

**Electrical engineering — a step-down transformer.** Core: three `roundedBox` limbs + two yokes in `darkSteel` with
`brushed` laminations; windings: `coil` on two limbs in `copper` (the secondary with fewer, thicker turns); flux: a
`tube` loop through the core with `stripes` in sky blue moving round once per mains-cycle-scaled period; current:
`stripes` on the leads in phase with the flux; the load: an `emissive` lamp whose intensity follows `sin²(w)`.
```js
const primary = BB3D.coil(THREE, { x: -1, y0: .4, y1: 2.2, r: .42, turns: 24, wire: .035 }, M.copper);
const flux = BB3D.tube(THREE, BB3D.path2d(THREE, [-1, .3], [['L', 1, .3], ['L', 1, 2.3], ['L', -1, 2.3], ['L', -1, .3]], 0), .05, M.led);
const f = BB3D.shaders.stripes(THREE, flux.material, { count: 16, color: 0x00A4FF, glow: .6 }); // f.uStripePhase.value = 2 * BBTime.wrap(t, P) / P
```

**Nanotech (bonus) — a carbon nanotube.** `instanced` small spheres (atoms) on a rolled hexagonal lattice (`x = R cos
(a), z = R sin(a)` per lattice point), bonds as thin `instanced` cylinders; `metal` dark grey with `rim`; an AFM tip as
a `lathe` cone in `aluminium` scanning along `BBTime.track` keyframes.

### 4.12 Showpiece fidelity checklist (required for detail = detailed and showpiece)

The reference reads as a **photographed physical object in a studio**, not as shapes on a backdrop. Pastel spheres on
a flat field are the failure mode. Before writing the scene, list the parts; after rendering, look at the screenshot
against every line below.

| | simple | detailed | showpiece (title hero, one per deck) |
|---|---|---|---|
| distinct parts (not counting instanced copies) | 3–6 | 8–15 | 15–30 |
| material families (metal / glass / plastic / ceramic / soft / liquid / emissive / wood) | ≥ 2 | **≥ 3** | **≥ 4** |
| grounding (appropriate to the subject) | soft shadow or contact, if it stands on anything | whatever the subject really sits on or moves through (ground, airframe mount, a cell's fluid, nothing) | the subject's own setting + a context object of known size |
| micro-detail (bevels, fasteners, rims, threads, labels) | bevelled edges | ≥ 3 kinds | ≥ 5 kinds |

1. **Grounded appropriately to the subject.** What it rests on or moves through is what it really rests on or moves
   through: a runway, a road, a site, a workshop floor, a cell's fluid, open sky, or nothing (a vehicle in flight, a
   molecule). Never a wooden base, stand or bench unless the subject is a lab object. Crisp contact AO where parts meet
   each other and wherever something does touch the ground.
2. **Context and scale cues.** A cue that fits the subject: a person or car silhouette beside a building, a runway
   line under an aircraft, a coin or hand beside a device, a ruler / scale bar with ticks, or a projected
   `~100 nm`-style scale tag. Magnified things carry a scale tag rather than a made-up lab object.
3. **Dense assembly.** Real objects have clamps, fittings, caps, seals, wires, screws, labels. Use `BB3D.bolt`,
   `BB3D.ridged` (crimp caps, knurls, threads, collars), `BB3D.wrapLabel` (printed labels with a barcode),
   `BB3D.chamferCylinder` and `roundedBox` (no razor-sharp edges anywhere), thin `tube`s for wires and hoses.
4. **Material contrast.** Put a metal, a glass and a matte material next to each other, as the subject allows (steel
   + glass + matte paint on a vehicle; membrane + protein + fluid in a cell). The softbox flags then draw dark edge lines on metal and glass and the
   highlights read as photographic.
5. **Colours read as materials, not candy.** Large surfaces stay below ~60 % saturation and between 20 % and 85 %
   lightness (ivory, terracotta, walnut, steel grey, frosted white). Only the hero detail carries a saturated colour
   (the one blue, a hot glow). Never pure primaries, never pastel-on-pastel; colours come from what the thing is made
   of (lipids are ivory, wood is walnut `#5B3A24`, suspensions are off-white, copper is `#C97B3C`).
6. **Composition.** The assembly fills 40–55 % of the frame height on the title (the reference: ~80 % of its half);
   it never bleeds off the frame edge; the key light rakes from the upper left so every form has a lit side, a shadow
   side and a cast shadow.
7. **Check the still.** Look at `?still=<n>` at 100 %: if any part reads as a flat colour blob, add texture, bevels or
   a rim; if the background reads as a flat field on the title, scale the cove so its horizon band shows.

### 4.13 What never to do in 3D
No text inside WebGL that carries meaning. No default grey `MeshStandardMaterial` with no texture. No black or coloured
backgrounds, no fog, no gradients behind the object (the slide is the background). No floating objects without a
shadow. No second holder for a comparison. No `Math.random()` or `performance.now()` in `update`. No camera spin faster
than one sway per period. No GLTF downloads, no CDN, no add-on imports (`three/addons` will not be packed).

---

## 5. The 2D chart recipe (`BBChart.line`)

Hand-drawn SVG on a white rounded card (`.bb-chart`), drawn at the card's real pixel size so every label is exactly
its size: 3 px lines, **direct end labels in the series colour, no legend**, faint grid (ink at 8 %), the y axis an ink
arrow, the x axis an **aurora-gradient arrow** (blue → violet → blue, with a soft glow), **lowercase axis titles with
units** ("time elapsed, min"), 28 px ticks. Optional: dashed step lines with 20 px step labels across the top and one
highlighted in a yellow pill; a **yellow highlight zone** (`band`) for the region the slide is about; one marked moment
(`event`): a vertical ink line, a dark pill with a 20 px label, a dark dot with a **breathing yellow halo**.
```js
BBChart.line('#s8-chart', {
  x: { min: 0, max: 60, ticks: [0, 10, 20, 30, 40, 50, 60], title: 'time, min' },
  y: { min: 20, max: 110, ticks: [40, 60, 80, 100], title: 'temperature, °C' },
  series: [{ name: 'inlet', color: '#E23B00', points: [[0, 35], ...] }, { name: 'outlet', color: '#0061EF', points: [...] }],
  steps: { at: [0, 10, 20], labels: ['low', 'mid', 'high'], highlight: 2 },
  band: { from: 47, to: 60 }, event: { x: 47, y: 78, label: 'the turning point' },
  source: 'Source: Author et al., Journal 2021, Fig. 3',           // real data always carries its source
  // illustrative: true                                             // no data: a shape, labelled, no y numbers
});
```
Colours: hot/warm series `#E23B00`, cool `#0061EF`, a third `#5431A5`; never more than three series. Up to 3 chips
beside it name what to see, in the order the eye should travel. The "illustrative" and source captions are 20 px.

---

## 6. Content rules

- **Data honesty.** Numbers come from the user's files or from textbook / published values, with a 20 px source line
  (`.source`) on the slide and the full reference in the notes. If there is no data, draw an **illustrative** shape
  (`illustrative: true`: the chart prints "illustrative" and drops the y numbers) and say so in the notes. **Never
  invent data, values, names, citations or quotes.** If you are not sure of a number, leave it out. Enforced: `deck_check` traces every
  number to the user's files or to `provenance.json` (`building.md` rule 8). A number read off a figure is declared as such and the part
  of the figure it came from stays visible on the slide.
- **Photos.** Ask the user every time a slide wants a photo (`annotated-photo`); never stand in a stock, generated or
  placeholder picture. No photo → choose another archetype.
- **Text caps.** The word budgets in section 2 are hard caps; headlines 3–9 words; stat captions ≤ 6 words; tags ≤ 4.
  One idea per slide; when it does not fit, split the slide.
- **Models are schematics.** Say in the notes what is drawn to scale and what is not.

---

## 7. The writing voice

Short, confident declaratives. Headlines are **claims of 3–9 words, often in two parts** with the second part as the
blue phrase. Kickers are nouns. Stats are a number + a few plain words. No hedging on slides, no jargon without a
picture next to it, no exclamation marks, no questions as headlines (except "Open for questions").

| do | don't |
|---|---|
| Heat has **outrun the old fix** | An Overview of Thermal Management Challenges |
| A bubble of fat, **carrying a message** | Lipid Nanoparticle Structure and Composition |
| Smooth, then **suddenly jagged** | Results: Temperature vs. Time Graph |
| Four goals, **three delivered** | Project Objectives and Current Status |
| 0 moving parts — *the pump is the physics* | The system does not require any mechanical pumping components |
| We need cooling that moves heat **without pumping it**. | In conclusion, there is a need for further research. |

---

## 8. Speaker notes

Always written, **60–300 words per slide**, in `<aside class="notes" data-aura-notes>` as 2–4 `<p>`. Coaching voice,
second person, present tense: tell the presenter what to do and say, never repeat the slide.
- Open with an action: "Point at…", "Start with…", "Walk the tags bottom to top.", "Read the axes first."
- `<strong>` the beat names so the eye finds them mid-talk.
- Give the real-world scale, the source of every number, and one **honesty caveat** ("the model is schematic", "the
  curve is illustrative", "if asked how many…, say it varies; don't guess").
- Prepare the likely question ("If asked …, answer …"). The closing slide's notes list 2–3 likely questions with
  short answers. Presentation time is used only in the notes and `data-minutes`, never on a slide.

---

## 9. When Bold Blue overrides the user

Bold Blue is a complete design. Once it is chosen:
- It **overrides every visual preference** from the form (amount of illustration, 2D/3D switches, colours, fonts,
  "more text", decorative extras). Content choices still come from the user: what to cover, the order, the facts, the
  photos, the motion type per slide, the number of slides.
- Text is strictly capped (section 2). A request for denser slides becomes more slides or fuller speaker notes.
- The checker stays on; a user request never lowers a size or lifts a cap.
- Tell the user once, kindly: "Bold Blue keeps its own colours and type so the deck stays consistent; tell me what to
  change about the content."

Other looks may later get their own `LOOK.md` in `looks/<look>/`; until then they follow `aura-blend.md`.

---

## 10. Mandatory checklist before `deck_check.js`

- [ ] Every slide: one main visual, companions within the matrix, kicker + headline with exactly one `.em`, footer.
- [ ] Every 3D scene: `BB3D.studio`, shadows on, at least one procedural texture, physical materials, a declared
      period, every motion periodic (`BBTime.phase`, `S.orbit`, `BBPhys.loop`), labels inside the holder.
- [ ] Every 3D slide starts from 4.0: the scene shows the real subject in its own setting (not a bench rig), and no
      prop from the "must not default to" list appears unless the subject is that. Neighbouring slides differ in props,
      composition and camera.
- [ ] Detailed and showpiece scenes pass the fidelity checklist (4.12): part count, ≥ 3 / ≥ 4 material families,
      grounding appropriate to the subject, a scale cue, micro-detail, material colours (not candy), nothing off the frame edge.
- [ ] Every chart: real data with a source line, or `illustrative: true`; ≤ 3 series; ≤ 3 chips.
- [ ] Text sizes from the scale; 20 px only in the footer, page number, captions and chart step labels.
- [ ] Word budgets met; notes 60–300 words on every slide; `data-minutes` set; `data-edit` ids added (`--ids`).
- [ ] `deck_check.js` is clean (it also verifies the capture registrations and that each loop is seamless), then look
      at the screenshots.
