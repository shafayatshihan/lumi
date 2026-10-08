# Bold Blue — the brand layer

> **Read `../_shared/LOOK-BASE.md` first.** It holds the structural rules every Lumi look obeys: the slide skeleton,
> the archetype catalogue, the clash matrix, subject-first staging (4.0, including S4 sequences climb and S5
> comparisons side by side), fidelity, the capture contract, data honesty, the writing voice, speaker notes and the
> pre-flight checklist. **This file adds only what makes a deck look like Bold Blue**: palette, type, motion feel and
> figure idiom. The two together override `aura-blend.md`, the form's style answers and `deck-toolkit.md`.

Bold Blue is subject-free: it works for molecular biology, chemical engineering, nanotech, electrical engineering,
economics or anything else. It was measured from one reference deck (a 16-slide engineering thesis talk, 1920 × 1080);
none of its subject matter belongs in your decks.

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
| `blender/` | the look-neutral Blender helper (`lumi_bpy`, `lumi_mech`); Bold Blue's studio renders use it — `BLENDER.md` |
| `runtime.js` (top comment) | the **capture contract**: loop periods, `?capture`, recorded loops, `?still=n` |

**3D engine policy: Bold Blue is a photoreal look.** A still 3D figure defaults to a **Blender** studio render when
Blender is installed; animations, tours and timed stories stay live three.js. Either way the slide gets an engine —
never neither. (`form_server.LOOK_3D['bold-blue']`.)

---

## 1. Tokens

**Canvas and ink.** Canvas `#F9F4F2` (warm off-white, never `#FFF`), with four slide backgrounds:
`.bb-stage-bg #EFEBE6` (stat + 3D), `.bb-blueprint-bg #EEF0F2` + `.bb-grid-bg` (what-it-is, 48 px drawing grid),
`.bb-title-bg #EEEBE7`, `.bb-close-bg #F7F5F2`. Ink `#2D2C2B` (never `#000`), secondary `#44423F`, muted `#5C5751`,
label `#6E6861`, hairline `#E2DED9`. White `#FFFFFF` only for cards, chips and the chart card.

**One accent.** Blue is the ONLY emphasis colour (text blue `--accent` `#005AE0`, the reference `#0061EF` darkened until
it clears 4.5:1 on every canvas; the 3D art keeps `#0061EF`): exactly one `.em` phrase per headline (blue + soft 24 %
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

**Motion feel.** Calm and weighty. Entrance curve `cubic-bezier(.16,.84,.30,1)` (`--bb-ease`, `BBTime.ease.bb`). Rise
40 px, lift 26 px + scale .985, pop 18 px + scale .9; 0.7–1.05 s; staggered 0.42 / 0.56 / 0.70 / 0.84 s. The theme
applies them automatically (kicker, headline, sub, stat rows, chips, goals, cards, tags fade in at 1 s). Count-ups:
`<span data-bb-count>45</span>` (final value in PDF / check / editor). Loops are calm: 12–40 s periods, a full camera
sway of ±5–7° azimuth, objects drift, nothing flashes. Process films: ~8 s per state.

**Word budgets** (hard caps, the checker counts; the same numbers are in `hard-rules.json` and `.claude/CLAUDE.md`, and
a test keeps them equal): presenter mode title 45, section 12, content 55, quote 30, closing 40, references 140; in
document mode a content slide may hold 90. Measured reference: content slides 21–53 words. Fewer is better.

---

## 2. The archetypes in Bold Blue

The catalogue, the order and the closing-slide rules are in the base, section 2. Bold Blue's layouts:

| # | archetype | main visual | layout | words |
|---|---|---|---|---|
| 1 | `title-hero` | full-bleed 3D hero on a studio cyclorama | text left 860 px, object right half | ≤ 40 |
| 2 | `problem-stats` | 3D object showing the pain | 5 / 7 | 30–55 |
| 3 | `what-it-is` | the object in 3D | 5 / 7 on the blueprint grid | 30–55 |
| 4 | `process-film` | one 3D "film" through N states | stack: head row + wide studio stage | 10–20 on slide |
| 5 | `comparison-twin` | two versions in ONE 3D scene | 5 / 7 | 25–45 |
| 6 | `annotated-photo` | the user's real photo + overlay marks | 5 / 7 | 25–45 |
| 7 | `system-tour` | camera tour of a system's parts | stack | 10–20 |
| 8 | `result-chart` | one 2D line chart on a white card | 4 / 8 | 20–35 |
| 9 | `objectives-tour` | 3D tour visiting each goal | 5 / 7, soft colour blobs behind | 25–45 |
| 10 | `closing` | designed per deck (base section 2) | one of 4 variants | ≤ 40 |

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

Companion parts: stat stack `ul.bb-stats > li` (colour the 6 px rule with `.copper .hot .ink .sky`; `.bb-stat`,
`.bb-stat.md`, `.bb-bar` with `--v`), numbered `ol.bb-steps` with `.bb-n` discs, `ul.bb-zones` (photo zones),
`ul.bb-chips`, `ol.bb-goals` (`.on`, `.wip`), projected `.bb-tag` (`.cold .hot .blue`) and `.bb-pill`, `.bb-cyc` +
`.bb-rail` (process film), `.bb-map` (system map), `.close-line` (one sentence, its key words in `<b>` blue).

---

## 3. The figure idiom: a photographed object in a studio

Bold Blue's pictures are **photoreal**. The reference reads as a physical object photographed in a soft-lit studio, not
as shapes on a backdrop. Base section 4.0 decides *what* to show and where it lives; this section says *how it looks*.

> A slide's 3D picture may be a Blender studio render instead of live three.js (the plan's engine choice): same boxes,
> same labels, same clash matrix. `BLENDER.md` section 9 says how it sits in the archetypes (stills: title-hero,
> problem-stats, what-it-is; short loops: what-it-is, problem-stats; tours and timed stories stay three.js).

### 3.1 Mandatory, every time
1. **Shadows** — `BB3D.studio` (VSM soft shadows, radius 14, blurSamples 20) and `S.add()` (casts and receives).
2. **Textures** — at least one procedural texture in the scene (wood grain, brushed metal, noise, bumps, speckle);
   the material families already carry them (`metal` brushed, `plastic` speckle, `soft` bump normals, `wood` grain).
3. **Reflections** — the softbox environment (`scene.environment`, PMREM) is always on; use physical materials.
4. **Recordable** — the capture contract (base 4.3): declare the period, keep every motion periodic in it.

### 3.2 Studio setup
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
  BB3D.labels(S, ctx.el, { name: [x, y, z] });          // projected tags (3.8)
  return S.api({ update(t) { const w = BBTime.phase(t, P); S.orbit(t); /* pose everything from w */ } });
}, { period: 16 });
```
Staging options are all optional and neutral: `floor: 'none'` (no ground, for flight, cells, molecules), `sky: true`
(or `{ top, bottom }`: the flight / open-air gradient backdrop, light only) — the gradient fills the whole holder, so use
it on a full-bleed (`bb-full`) holder, or on a side holder that is a soft rounded panel, `cyc: true` (clean cyclorama).
The `stage` default is just a soft shadow-catching floor under a transparent canvas; use it only when something stands
on a floor. Two presets, both measured from the reference deck's own render code:

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
behind the object. ACES tone mapping (exposure 1.0) and sRGB output are set for you. The Bold Blue light and cream feel
stays whatever the staging: soft warm key, light backdrop, **no dark scenes**.

### 3.3 Materials library (`BB3D.mat.*` factories; `BB3D.materials(THREE)` presets)

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

**Colours read as materials, not candy.** Large surfaces stay below ~60 % saturation and between 20 % and 85 %
lightness (ivory, terracotta, walnut, steel grey, frosted white). Only the hero detail carries a saturated colour (the
one blue, a hot glow). Never pure primaries, never pastel-on-pastel; colours come from what the thing is made of
(lipids are ivory, wood is walnut `#5B3A24`, suspensions are off-white, copper is `#C97B3C`).

### 3.4 Procedural textures (`BB3D.textures.*`, all CanvasTexture, no image files)
`wood` (sine-perturbed grain + pores, colour map) · `brushed` (streaks, roughness map) · `noise` (multi-octave value
noise; with `tint: [r,g,b]` a mottled colour map) · `speckle` (fine grain) · `bumps` (round-bump **normal map**: skin,
membranes, cast metal) · `glow` (sprites) · `contact` (soft contact shadow) · `printed(THREE, w, h, draw)` (draw a
dial, a chip marking, a screen, a label with the 2D canvas API — decoration only; meaningful words are HTML tags).

### 3.5 Shader injection (`BB3D.shaders.*`, chainable `onBeforeCompile`)
- `stripes(THREE, mat, { count, width, color })` — bands along a tube's length (uv.x): nucleotides, current pulses,
  flow markers, conveyor items. Animate with `u.uStripePhase.value = k * BBTime.wrap(t, P) / P` (k whole bands per loop).
- `heatGlow(THREE, mat, { axis, from, to, color })` — emissive ramp along an axis; set `u.uHeat.value` (0..1).
- `rim(THREE, mat, { color, power, strength })` — Fresnel rim light that lifts soft or glass objects off the pale canvas.
- `displace(THREE, mat, glsl)` — vertex displacement (edit `transformed`; `uT` uniform): menisci, membranes breathing,
  ripples. It does not reach the shadow map, so keep it small.
- `inject(mat, { uniforms, vertex, emissive, fragment })` — your own; `vBBUv` (uv) and `vBBPos` (local position) exist.

### 3.6 Lights, environment, post
One warm key `DirectionalLight` (upper left front, soft VSM shadow), a hemisphere fill (white sky, warm ground), on the
title studio a cool fill from the right, and the softbox environment with **black flags** — the flags are what put the
dark edge lines on metal and glass that make them read as real. Add a practical light only when the subject has one:
`flicker: { at, color, intensity }` and `S.flicker(t)` (periodic). Never coloured stage lighting, never a dark scene,
never a visible light source floating in space. Use `BB3D.contactShadow` under objects that need weight.

The environment is a softbox room (bright emissive panels) prefiltered with PMREM: it is what makes metal look like
metal. Post-processing is self-contained (no add-ons, so a packed deck stays one offline file):
- **ambient occlusion** (on by default): a crease AO from the depth buffer, so parts darken where they meet each other
  and the floor. `aoRadius` (world units, ~0.3), `aoIntensity` (~0.9);
- **bloom** (bright pass over `threshold`, dual-filter mip chain) — emissive parts only; default threshold 3.2;
- **depth of field** (`dof: true, focus, aperture`) — for tours, to push background objects back;
- **adaptive quality**: during the live talk, if frames take > 24 ms the studio drops AO, then DoF, then bloom, then the
  shadow-map size, then the pixel ratio. Capture and still frames always render at full quality.

### 3.7 Camera choreography
- Default: `S.orbit(t)` — azimuth sways on harmonics 1 and 3, elevation on 2, distance breathes on 1: irregular to the
  eye, exactly periodic. Tune `swayAz` (4–7°), `swayEl` (≤ 2°).
- Tours: `const tour = BBTime.tour({ shots: [{ pos, target, hold: 4.5, move: 1.5 }, …] })` then `S.tour(tour(t))`,
  `{ period: tour.period }`. End on a pull-back to the whole. `tour(t).focus` says which shot is on screen.
- Keep the object's silhouette inside the holder; never cut the hero at the frame edge, never fly through objects.

### 3.8 Projected labels
HTML tags (`.bb-tag`, `.bb-pill`) live **inside** the `.aura-3d` holder with `data-follow="name"`;
`BB3D.labels(S, ctx.el, { name: anchor })` moves them every frame. Anchor: `[x, y, z]` world point (a point on a
sphere's surface stays on the surface however it turns), an `Object3D`, or `t => [x, y, z]`. `data-align="left|right|
center"` puts the text right of / left of / centred on the point; `data-dx`, `data-dy` offset it. Labels are clamped to
the holder and the 96 px safe zone. 2–4 per slide, 28 px, 1–3 words + ≤ 4-word description.

### 3.9 Geometry helpers
`lathe` (anything round in profile: vials, beakers, flasks, bearings), `tube` + `path2d` + `curve` (pipes, wires,
strands, vessels, tracks), `helix` / `coil` (springs, DNA, windings, threads), `roundedBox` (devices, chips, boards,
battery cells), `blob` (cells, organs, droplets, rocks), `instanced` (lipids, atoms, fins, bolts, crowds), `along`
(things riding a path), `glowSprite` (light, heat, fluorescence). Micro-detail: `BB3D.bolt`, `BB3D.ridged` (crimp caps,
knurls, threads, collars), `BB3D.wrapLabel` (printed labels with a barcode), `BB3D.chamferCylinder` and `roundedBox`
(no razor-sharp edges anywhere), thin `tube`s for wires and hoses.

Base section 4.1 is the rule that governs them: **use the REAL counts and the REAL dimensions**, and give every moving
part its own object at its real pivot. In Blender the standard parts are already written (`lumi_mech`: involute gears,
springs, ISO bolts and nuts, blade rings, shafts, bearings, O-rings) — see `BLENDER.md` section 4.

*The four recipes below are worked examples, each right for its own subject. Do not reuse their bases, stands or props
for a different subject; start from the base's section 4.0.*

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
`w * 3`; heating jacket: `heatGlow` on the outer wall; bubbles: `instanced` spheres rising on `BBTime.wrap` paths.
```js
const shell = BB3D.lathe(THREE, [[0, 0], [1.1, .15], [1.2, .5], [1.2, 2.6], [1.3, 2.6]], M.steel, 64);
shell.geometry = new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(...p)), 64, 0, Math.PI * 1.5);   // cut-away
BB3D.shaders.displace(THREE, M.water, 'float r = length(transformed.xz); transformed.y -= 0.25 * exp(-r * r * 3.0);');
impeller.rotation.y = 3 * w;                                              // whole turns per loop: seamless
```

**Electrical engineering — a step-down transformer.** Core: three `roundedBox` limbs + two yokes in `darkSteel` with
`brushed` laminations; windings: `coil` on two limbs in `copper` (the secondary with fewer, thicker turns); flux: a
`tube` loop through the core with `stripes` in sky blue; current: `stripes` on the leads in phase with the flux; the
load: an `emissive` lamp whose intensity follows `sin²(w)`.
```js
const primary = BB3D.coil(THREE, { x: -1, y0: .4, y1: 2.2, r: .42, turns: 24, wire: .035 }, M.copper);
const flux = BB3D.tube(THREE, BB3D.path2d(THREE, [-1, .3], [['L', 1, .3], ['L', 1, 2.3], ['L', -1, 2.3], ['L', -1, .3]], 0), .05, M.led);
const f = BB3D.shaders.stripes(THREE, flux.material, { count: 16, color: 0x00A4FF, glow: .6 }); // f.uStripePhase.value = 2 * BBTime.wrap(t, P) / P
```

**Nanotech — a carbon nanotube.** `instanced` small spheres (atoms) on a rolled hexagonal lattice, bonds as thin
`instanced` cylinders; `metal` dark grey with `rim`; an AFM tip as a `lathe` cone in `aluminium` scanning along
`BBTime.track` keyframes.

### 3.10 Simulation (`BBPhys`)
`BBPhys.particles / springs / diffusion / flow` wrapped in `BBPhys.loop(make, { period, warm, blend })`. Only when the
user picks "real simulation"; the honesty rules are in the base, 4.3.

### 3.11 What never to do in Bold Blue 3D
No black or coloured backgrounds, no fog, no gradients behind the object (the slide is the background). No default grey
`MeshStandardMaterial` with no texture. Plus the base's section 4.5.

---

## 3A. The illustration idiom: a technical drawing on the studio paper

> Base 4.12 says a drawn picture is inline SVG and still, and `illustration.md` says how to write one. This
> section is only Bold Blue's surface. `LumiIllus` reads it from the theme; do not restate a colour in a slide.

Bold Blue draws the way its renders photograph: **clean, clinical, exact**. The drawing is a technical section on
the same warm paper the studio sits on, not a sketch.

| | Bold Blue |
|---|---|
| line | 3 px, `--ink`, on the hero and the cut only; a body shape may carry none |
| fills | hero `--accent`, body `--surface` white, context `--bg-stage`, signal `--hot`, paper `--bg` |
| corners | 16 px — the same family as the cards, never square, never a pill |
| lift | one soft shadow under a solid (`--shadow-card`'s weight), never an outline drawn as a shadow |
| labels | Poppins at 28 px; captions, dimensions and the foot note in DM Mono at 20 px (`.bb-cap`) |
| notation | arrows and streamlines in `--accent`; a field, a film or anything thermal in `--hot` at 0.2 opacity |
| texture | none. Bold Blue has no halftone, no grain and no hatching except on a **cut surface** (`F.hatch`) |

1. **One hero part.** Exactly one shape in the drawing is `role: 'hero'` and it is the thing the headline is
   about. Everything else is white or the stage grey. Blue is the emphasis colour here as it is in the type: a
   drawing with four blue parts has no emphasis at all.
2. **Draw the section, not the outline.** Bold Blue's strength is the inside of things: hatch the cut, show the
   wall thickness, show the collar, show the clearance. A hollow outline reads as a wireframe and looks unfinished
   beside a studio render.
3. **Dimensions are drafting, not decoration.** `F.dim` only where the number is the point, and the number is a
   claim like any other (`F.value`, a kind, `provenance.json`).
4. **Never** a gradient fill, a glow, a drop shadow you can see as a blur, a second blue, yellow type, a dashed
   line used for emphasis rather than for a guide, or a label below 20 px.

---

## 4. The chart idiom (`BBChart.line`)

Hand-drawn SVG on a white rounded card (`.bb-chart`), drawn at the card's real pixel size so every label is exactly its
size: 3 px lines, **direct end labels in the series colour, no legend**, faint grid (ink at 8 %), the y axis an ink
arrow, the x axis an **aurora-gradient arrow** (blue → violet → blue, with a soft glow), **lowercase axis titles with
units** ("time elapsed, min"), 28 px ticks. Optional: dashed step lines with 20 px step labels across the top and one
highlighted in a yellow pill; a **yellow highlight zone** (`band`); one marked moment (`event`): a vertical ink line, a
dark pill with a 20 px label, a dark dot with a **breathing yellow halo**.
```js
BBChart.line('#s8-chart', {
  x: { min: 0, max: 60, ticks: [0, 10, 20, 30, 40, 50, 60], title: 'time, min' },
  y: { min: 20, max: 110, ticks: [40, 60, 80, 100], title: 'temperature, °C' },
  series: [{ name: 'inlet', color: '#E23B00', points: [[0, 35], …] }, { name: 'outlet', color: '#0061EF', points: […] }],
  steps: { at: [0, 10, 20], labels: ['low', 'mid', 'high'], highlight: 2 },
  band: { from: 47, to: 60 }, event: { x: 47, y: 78, label: 'the turning point' },
  source: 'Source: Author et al., Journal 2021, Fig. 3',           // real data always carries its source
  // illustrative: true                                             // no data: a shape, labelled, no y numbers
});
```
Colours: hot/warm series `#E23B00`, cool `#0061EF`, a third `#5431A5`; never more than three series. The "illustrative"
and source captions are 20 px.

---

## 5. Before the checker (Bold Blue's own lines)

The full pre-flight list is in the base, section 10. On top of it:

- [ ] Exactly one `.em` phrase per headline; blue is the only emphasis colour; orange only as the identity dot.
- [ ] Poppins + DM Mono, nothing else. Sizes from 20 / 28 / 36 / 48 / 64 / 112 / 176; 20 px only in the footer, page
      number, captions and chart step labels.
- [ ] Every 3D scene: `BB3D.studio`, shadows on, ≥ 1 procedural texture, physical materials, the softbox environment.
- [ ] Detailed and showpiece scenes: ≥ 3 / ≥ 4 material families, material colours (not candy), micro-detail.
- [ ] Nothing dark: no black backgrounds, no fog, no coloured stage lighting.
- [ ] Tell the user once that Bold Blue keeps its own colours and type (base section 9).
