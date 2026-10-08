# The look base — the structural rules every Lumi look obeys

Read this file **before** the chosen look's own `LOOK.md`, and read both before writing a slide. Together they are the
look's authority: they override `aura-blend.md`, the form's style answers and `deck-toolkit.md` wherever they disagree.

**The split.** This file holds everything that is *not* brand: composition, the clash matrix, how a subject becomes a
picture, grounding and fidelity, data honesty, the shape of a headline, speaker notes, and the checklist. A look's own
`looks/<slug>/LOOK.md` holds only **palette, type, motion feel and figure idiom** — what makes it look like itself.
Nothing here mentions a colour, a typeface or a px size.

**Where the numbers live.** Every hard number — type scale, minimum sizes, word budgets, whitespace, typeface count,
contrast floors — is in `engine/rules/hard-rules.json` under `looks.<slug>` (or `generic` for a look with no entry).
`deck_check.js` reads that file. A look file may restate its own numbers so they can be read in one place; a test keeps
the two equal. **Never invent a number that is not in `hard-rules.json`.**

This file is subject-free. It works for molecular biology, chemical engineering, nanotech, electrical engineering,
economics or anything else.

---

## 1. Slide skeleton

Every slide is 1920 × 1080 with a safe zone (`.safe`), carries `data-kind` (`title|section|content|quote|closing`),
`data-minutes`, `data-title`, a stable `data-edit` id on every text, and speaker notes in
`<aside class="notes" data-aura-notes>`. Every look provides a footer line with a deck mark and a page number.

```html
<section class="slide" data-kind="content" data-minutes="1.5" data-title="Short title">
  <div class="safe">
    <div class="…main">
      <div class="…left"> kicker · headline · companions </div>
      <div class="…right"> the ONE main visual </div>
    </div>
    <footer class="…foot"><span class="…mark">Deck mark</span><span class="…pageno"></span></footer>
  </div>
  <aside class="notes" data-aura-notes> 60–300 words </aside>
</section>
```

The class names differ per look; the parts do not. **Exactly one emphasis phrase per headline**, in whatever the look
calls emphasis. One idea per slide; when it does not fit, split the slide — never shrink the type.

---

## 2. The archetype catalogue

Ten archetypes, the same ten in every look, in the order that is the default story arc. A look ships one ready slide per
archetype at `.aura/engine/deck/looks/<slug>/archetypes/<name>.html`; open it with the **Read** tool, replace `{{N}}`
with the slide number, replace every word, and paste it before the closing slide.
(`node .aura/engine/tools/new_deck.js --snippet <name> --slide <n>` prints the same, filled in.)

| # | archetype | main visual | companions | words |
|---|---|---|---|---|
| 1 | `title-hero` | the subject, full bleed | kicker, names | fewest |
| 2 | `problem-stats` | the subject showing the pain | ≤ 3 stats (one with a bar), one close line | short |
| 3 | `what-it-is` | the object itself | ≤ 3 facts, 2–4 projected tags | short |
| 4 | `process-film` | one picture through N states | a cycling card + a progress rail | fewest on slide; the card text cycles |
| 5 | `comparison-twin` | two versions in ONE scene | 2 numbered stats, 2 pills, close line | short |
| 6 | `annotated-photo` | the user's real photo + overlay marks | ≤ 3 zone rows, one inset with caption | short |
| 7 | `system-tour` | a tour of a system's parts | one label that follows the visited part, a small map | fewest |
| 8 | `result-chart` | one chart | ≤ 3 finding chips | short |
| 9 | `objectives-tour` | a tour visiting each goal | checklist ≤ 4 rows, lit in step (`Aura.sync`) | short |
| 10 | `closing` | designed per deck | names / contact, one short line | fewest |

**The closing slide is designed for each deck, never pasted.** The snippet is a skeleton with four layout variants
(A message-left / visual-right, B centred big question, C next-steps rail, D contact card). Rules:
1. **The message fits the talk.** One of: the key takeaway in a sentence, a final question, next steps (≤ 3), or
   contact details. "Thank you." is one option among four, never the default pair with "Open for questions".
2. **The visual is about this subject** — a small drawing of the subject's own shape or key quantity. Never a drawing
   carried over from another deck.
3. **Vary the composition.** Two decks must never end with an identical closing. If you remember the last closing you
   made, do something different.
4. Keep the look's tokens: its palette, its type scale, its word budget, exactly one emphasis phrase.

Word budgets are hard caps and the checker counts them. Words are tokens that contain a letter.

---

## 3. The clash matrix — one main visual per slide

Every slide has exactly ONE main visual: **3D · chart · diagram · photo · text-only**. A 2D canvas loop
(`.aura-canvas`) counts as the **diagram**, so it never sits beside a 3D scene, a chart or a photo.

| main visual | companions it supports | never with |
|---|---|---|
| 3D | ≤ 3 stats / facts, a checklist (≤ 4), projected labels (2–4), a small map | a chart, a photo, a second 3D holder, chips |
| chart | ≤ 3 annotation chips | 3D, a photo, insets, stat stacks |
| photo | ≤ 3 zone rows, one inset, overlay marks | 3D, a chart, chips |
| diagram (`data-visual="diagram"`) | short numbered steps | 3D, a chart, a photo |
| text only | one big claim or quote | anything else |

If the plan asks for two main visuals, **swap** one or **put it on its own slide** right after. `deck_check.js` fails a
slide with two main visuals, more than 3 stats or chips, chips without a chart, an inset without a photo, more than
3 zone rows or 4 checklist rows. Two objects to compare go in ONE scene (`comparison-twin`), never two holders.

---

## 4. From subject to picture

### 4.0 First decide what the subject really is, then show IT

Before any code, ask: **what is this slide about in the real world, and what would a photographer or a documentary
shoot to show it?** Draw that thing, in the place it lives. Not a lab rig, not a stand with a gauge.

| subject family | show this | staging | typical props / cues |
|---|---|---|---|
| aerospace, vehicles | the vehicle or its engine cutaway, in flight or on its pad / track | open sky for flight; runway or road for ground vehicles | shock waves, streaklines, exhaust glow, a scale silhouette |
| machines, mechanisms | the machine running, parts that move as they do | workshop floor, or no floor for an exploded / cutaway view | gears, shafts, belts, a cut-away quarter |
| electronics, circuits | the board, chip or device, current shown as moving light | a desk, or the board hovering magnified | traces, packages, connectors, glow along tracks |
| molecules, cells, biology | the molecule, cell or tissue, magnified, in its own medium | the interior of a cell / a fluid medium, soft depth | membranes, organelles, receptors, diffusion |
| chemistry, process plants | the reactor, column, pipework, or the reaction in its vessel | plant floor, or no floor for a molecular view | vessels, pipes, valves, level glass, bubbles |
| civil, architecture | the building, bridge, dam or road on its site | terrain slab, open sky for a landmark | load arrows, sections, people for scale |
| energy systems | turbine, panel array, grid, battery pack, in the landscape or cut open | landscape, or no floor for a cell cutaway | blades, cells, lines, energy as light |
| materials, nano | the lattice, grain structure or surface, magnified | no floor, shallow depth | atoms and bonds, cracks, layers |
| medical | the organ, device or drug acting inside the body | tissue / organ medium, no floor | vessels, tissue, a capsule dissolving, flow |
| software, abstract systems | a physical metaphor honest about being one (a network, a stack, a pipeline) | a clean neutral backdrop is fine here | nodes, links, packets along edges |
| a sequence | a path that climbs: a staircase, a rising road, a route with the goal at the top | the climb reads left-to-right and upward | numbered stations on the path, the goal marked |
| two things compared | both objects, whole and side by side, identical in everything but the one difference | the same staging for both, one light | the difference called out by a label, never by fading one out |

**S4 — a sequence climbs.** Objectives, a method, a roadmap, a set of next steps: drawn as a path that rises, not a row
of equal panels and not a level line of stepping stones. Offer two climbing shapes and let the person pick between them.
<!-- PROVISIONAL (0.5.5). Evidence is ONE deck (b45622aef312): three sightings - s4 q1, s12 q2, s14 q2 - and the flat
     default was refused all three times. One deck is one person on one subject. Re-check after the next deck; if a
     sequence is ever wanted flat, this comes out again. Also written in aura-blend.md section 4 for looks with no
     LOOK.md of their own. -->

**S5 — a comparison shows both whole.** Never show a comparison as a morph between A and B, as B with A
ghosted behind it, or as one object that is half A and half B: the person cannot see what is the same.
<!-- PROVISIONAL (0.5.5). Evidence is ONE deck (b45622aef312) and TWO sightings of the SAME object: s5 q1 and s8 q1,
     each "two fin cells side by side". The leap from "two fin cells" to "any A-vs-B comparison" is the analyst's own
     inference, not something the owner said. It is a safe leap because it shapes only the options Claude writes, never
     which one is chosen - but a third sighting on a non-fin subject is what would make it certain. -->

Staging is chosen **per subject**. Whatever the staging, the look's own light and canvas feel stays (its `LOOK.md`
says what that is).

**Props you must not default to: a wooden base or plinth, a gauge or dial, a vial or flask, a stand with a pole, a
nameplate** — unless the subject IS that (a titration setup, a test rig the talk is about). `deck_check.js` fails a
scene that uses one on a slide that is not about it.

**Variety.** Neighbouring slides in one deck must not repeat the same props, composition or camera angle. Two decks on
different subjects must not look alike.

### 4.1 Turning any subject into geometry

Work from the real object's anatomy: list its 3–6 visible parts, give each a primitive, a material family and a size
ratio; one part is the hero. **Use the REAL counts and the REAL dimensions, and give every moving part its own object at
its real pivot.** A ring gear has the number of teeth it has; a torque converter has 31 / 29 / 15 blades; a diaphragm
spring has 18 fingers. Accuracy is realism and it costs nothing to render: state each count in a comment and in the
caption where it helps. **If a count or a size is not known, ASK it in the build question - never invent a plausible one.**
A part merged into its neighbour cannot move, and a part whose origin is off its real axis moves wrongly, so each one
is its own object with its origin on its pivot.

### 4.2 Fidelity (required at detail = detailed and showpiece)

The failure mode is pastel shapes on a flat field. Before writing the scene, list the parts; after rendering, look at
the screenshot against every line below. What "grounding", "material" and "micro-detail" look like is the look's own
business (`LOOK.md`); the counts are not.

| | simple | detailed | showpiece (one per deck) |
|---|---|---|---|
| distinct parts (not counting instanced copies) | 3–6 | 8–15 | 15–30 |
| material / surface families | ≥ 2 | ≥ 3 | ≥ 4 |
| grounding | whatever the subject really sits on or moves through — or nothing | the same, plus crisp contact where parts meet | the subject's own setting + a context object of known size |
| micro-detail (bevels, fasteners, rims, threads, labels) | the look's smallest unit of detail | ≥ 3 kinds | ≥ 5 kinds |

1. **Grounded appropriately.** What it rests on or moves through is what it really rests on or moves through.
2. **Context and scale cues.** A person or car beside a building, a runway line under an aircraft, a coin or hand beside
   a device, a scale bar, or a projected `~100 nm`-style tag. Magnified things carry a scale tag, never a made-up lab
   object.
3. **Dense assembly.** Real objects have clamps, fittings, caps, seals, wires, screws, labels.
4. **Surface contrast.** Put unlike surfaces next to each other, as the subject allows.
5. **Composition.** The assembly fills 40–55 % of the frame height; it never bleeds off the frame edge.
6. **Check the still.** Look at `?still=<n>` at 100 %. If any part reads as a flat blob, add detail.

### 4.3 Motion, and the capture contract

| motion | what it is |
|---|---|
| **still** | nothing moves; one perfect frame (`{ period: 0 }`) |
| **timed animation** | closed-form functions of t, every sin/cos on a whole harmonic of the period |
| **physics-like** | scripted to look physical, still closed-form: eased keyframes, damped oscillation, objects on curves |
| **real simulation** | a fixed-step integrator — only when the user picks it |

Every animated scene **declares its loop period** (`Aura.scene(id, setup, { period })` or `data-period`), makes every
motion periodic in it, and never reads the clock, `Math.random()` or the previous frame inside `update(t)`.
`deck_check.js` fails a 3D slide with no capture entry, and one whose frame at `t = period` differs from `t = 0`.

A **real simulation** is honest physics: fixed `dt`, counter-based random numbers, a warm-up past the start-up
transient, and a cross-fade so `sample(period) === sample(0)`. Say "simulation" in a caption with the method. Never call
a scripted animation a simulation.

### 4.4 Projected labels

Label tags live **inside** the picture's holder with `data-follow="name"`, so they are recorded into the loop video with
the picture. 2–4 per slide, 1–3 words + a short description. DOM *outside* the holder that must follow the scene
(a checklist row, a map node) uses `Aura.sync(sceneId, t => …)`.

**A label never covers the figure.** This is a universal rule, the same in all five looks. A label sits in **clear space
outside the subject's silhouette** and is joined to its part by a short **leader line** — never on the part, never on
another label. It is not clamped onto the picture to keep it on screen; "clamp inward" was exactly the bug that put two
tags on top of a server rack.

Nothing in a slide has to implement this. `data-follow` (live scenes, every look) and `data-anchor` (Blender renders)
both go through one placer, `LumiLabel` in `engine/deck/runtime.js`: it reads where the subject actually is, puts each
label in the nearest clear space, and draws the leader. `data-align` / `data-dx` / `data-dy` still say which way the
label *wants* to sit and that direction wins every tie — they are a hint now, not a hard offset.

What an author still owns: **anchor the point on the part, not in the air**, and keep to 2–4 labels. When the figure
fills the frame there may be no clear space at all; the placer then falls back to the least-covered slot and marks the
holder `data-labels-crowded`, and `deck_check.js` fails the slide with *a label covers the figure*. The fix belongs to
the slide — fewer labels, or a smaller figure — not to the placement.

**No text inside WebGL or inside a texture ever carries meaning.** Meaningful words are HTML.

### 4.5 Never, in any look

No default untextured material. No floating object without grounding. No second holder for a comparison. No
`Math.random()` or `performance.now()` in `update`. No camera spin faster than one sway per period. No GLTF downloads,
no CDN, no add-on imports (they will not be packed).

### 4.6 Cinematic weight — the hero rule

**Contrast creates impact. If every slide is spectacular, none is.** Spend the effects budget on the opening and let
the middle be calm; that is the same principle that makes a film's opening shot land. So the amount of cinematic effort
a slide gets is decided by **where it sits in the deck**, not slide by slide:

| tier | which slides | what they get |
|---|---|---|
| **hero** | the first two | the deck's best figure, the longest bake, the fullest post stack the look allows |
| **body** | everything between | clean 3D, no post beyond what the look already gives every slide |
| **closing** | the last slide (or `data-kind="closing"`) | echoes the hero tier, so the deck frames itself |

This is a rule of the base, not a per-deck decision, and it is **enforced in code**: a look registers its three tiers in
`engine/deck/lib/post-policy.js`, the policy reads the slide's position and picks one, and `engine/deck/lib/post.js` is
the one stack that renders it. A slide overrides with `data-post="<preset>"` on its `<section>`; a scene overrides with
`BB3D.studio(ctx, { post: … })`. **An unregistered look gets no post at all** — nothing is on by default.

Three things constrain it, and none is negotiable:

- **Post is drawn inside the 3D holder's own canvas and nowhere else.** Slide text is HTML above that canvas, so its
  measured contrast cannot change. Never reach for a whole-slide filter: it would move every text ratio at once, and
  `deck_check.js` fails a slide below its contrast floor.
- **Every effect is a pure function of `t`** (4.3). An effect that blends the previous frame, jitters across frames or
  reads the clock breaks `seek(t)`, so it is refused by name, not quietly dropped.
- **Honesty outranks impact.** See 4.7.

### 4.7 Never post on a slide that carries measured values

Bloom blows out an error bar. Depth of field hides the part of a figure a number was read from. A slide whose numbers
are traced to the user's files or declared in `provenance.json` (kind `source`, `published`, `computed` or `figure`)
therefore gets **no post**, whatever tier it sits in, unless the look states in its policy that it allows it. This is
the same record `deck_check.js` judges numbers against, so the gate cannot drift from the claim.

`illustrative` is not a measured value: a slide that says on its face that its shape is illustrative has nothing to
blow out.

A deck that looks like a film trailer is a worse deck for anything that has to be believed. When in doubt, the body
stays calm.

### 4.8 Camera continuation — one space, declared

Slide N+1's camera can start where slide N's ended, so the deck reads as one space instead of a pile of renders. Use it
between consecutive 3D slides about the same subject or the same world; not between unrelated ones.

**It is declared in the markup, never handed over at run time.** Each slide must stay a pure function of `t` (4.3): a
deck opened on slide 7 shows what the video shows. So:

```html
<div class="aura-3d" data-scene="s1" data-period="20"
     data-camera='{"azimuth":-16,"elevation":5,"distance":16,"target":[0,1.4,0],"fov":24}'></div>
...
<div class="aura-3d" data-scene="s2" data-period="20" data-camera-from="prev"
     data-camera='{"azimuth":30,"elevation":12,"distance":12,"target":[0,1.2,0],"fov":30}'></div>
```

- `data-camera` is the slide's **rest pose** and wins over the same options in the scene's JS — write the pose once, here.
  "Where slide N ended" means this pose.
- `data-camera-from="prev"` starts the loop on the previous slide's `data-camera`. Over one period the camera eases in
  over the first 20 %, holds its own pose (orbit included) for 60 %, and eases back over the last 20 %, so the loop
  still closes. The still frame (0.35 × period) is in the hold.
- Drive the camera with `S.orbit(t)` (or not at all). A scene that places the camera with numbers of its own will not
  match the pose it declares.
- Never pass a camera between slides through a global, `sessionStorage` or the previous frame. It looks right in a
  browser and breaks `seek(t)`, the recording and the PDF.

### 4.9 Volumetric light — atmosphere for an establishing shot

Light shafts from the key light (`shafts` in `engine/deck/lib/post.js`) are part of the `cinematic` preset only, so a
slide gets them by asking: `data-post="cinematic"` on a hero or closing slide. They are the first effect the adaptive
ladder drops, they decline quietly on a GPU that cannot run them, and the 4.7 gate removes them from any slide carrying
measured values — a light shaft across a chart is the same crime as bloom on an error bar.

On a light plate (a Bold Blue cyclorama) they read as a soft warm light from the key's side, not as visible beams;
visible beams need a darker plate. Never raise their strength to make up for that: it washes the plate to white.

### 4.10 The real thing, never a likeness — binding on every look

Every 3D model and every illustration shows **the real object, built from real numbers, in real materials.** A
person in the audience who works with the thing should recognise it, count its parts and find them right. This rule
outranks any look's figure idiom: **realistic in structure, thematic in surface.** Bold Blue is the benchmark for
rigour, not for appearance: Clay Pop stays matte clay, Pink Punch stays a screen print, Flat-Pack stays a drawing, but
in every one of them the fins are the real number of fins at the real pitch.

1. **The real object at its real proportions.** Model what the subject is (4.0) with the real counts and the real
   dimensions (4.1): a finned coil has its real fin pitch, tube diameter, tube rows and header; a gear has its teeth.
   If the brief or the files give a size, use it. If a size you need is not known, ASK it in the build question.
2. **Enough of it to be it.** A slice so small that it stops reading as the object (24 fins standing for a coil of
   hundreds) is a likeness. Show the whole object, or a cutaway / section of the whole, or a magnified detail that
   is **placed inside** the whole so the viewer sees where it sits.
3. **Real materials.** Every part is made of what it is made of: in Blender `L.mat(kind)` (steel, aluminium, cast
   iron, titanium, copper, brass, chrome, glass, ceramic, rubber, plastic, paint, clay), a scanned PolyHaven surface
   `L.pbr(id)`, or a `lumi_mech` part; live, the look's named materials. A look whose surface is not photographic
   (clay, print, flat fill) keeps its surface - but the *structure* is still the real one.
4. **No analogy, no mascot, no cartoon stand-in.** Clouds for airflow, a heart for health, sparkles for "clean", a
   smiling part: never. What is invisible in reality is drawn as **notation** - arrows, streamlines, particles moving
   along the real flow direction, a colour field mapped to the real quantity with its scale. Notation is honest about
   being notation; a cartoon pretends to be the medium.
5. **Depth and layered detail.** Real objects have bevels, fillets, fasteners, seals, headers, return bends, frames
   and labels. Show the inside with a cutaway or a section (`L.cutaway`, `L.section`) instead of a ghosted shell. The
   counts in 4.2 are the floor.
6. **It follows the real equations.** Motion or a field on the figure comes from the physics the deck is about: the
   real flow direction and the real rotation sense; speeds in the right ratio (air faster through the free area than
   at the face, a pinion faster than its ring by the tooth ratio). A sine wave that merely looks lively is not motion
   of the thing. Real simulation is in 4.3.
7. **A liberty is written down, or it is a mistake.** Some departures are needed - a 0.15 mm fin drawn thicker so it
   shows at 1080p, a look's "chunky" bevel. Name each one where the numbers are declared (`L.real(..., liberties=)`)
   and in the speaker notes, and keep it from changing what the picture claims: counts, pitch, ratios and the
   order of parts stay real.

**What is checked.** In Blender every scene declares its numbers with `L.real('<source>', **dims)`. `--inspect` is
fatal without it (`no-real`), on a part named as a stand-in (`analogy`), and when no part uses a real material
(`no-preset`). `deck_check.js` reads each studio render's `scene.py` and fails the slide on the same three; a render
the person already approved before this rule existed gets a warning instead. Live three.js figures are held to the
same rule by the checklist (section 10) and by the screenshot: no code can count fins in a picture.

### 4.11 Camera setups and sway — a camera that moves like a camera

Every animated 3D figure moves its camera, slowly, the way a camera operator would: a drift on a held shot, or one
named move chosen for the slide. Choose a **different** setup on neighbouring 3D slides (the variety rule in 4.0).

| setup | what the camera does | good for |
|---|---|---|
| `sway` | a slow handheld drift about the framed pose (about a degree) | any shot that should feel alive but hold still |
| `push` | a slow push in, the lens lengthening slightly, and back | drawing the eye to one part |
| `crane` | rises over the subject and comes back | showing a layout from above, a stack, a flow path |
| `dolly` | arcs round one side while closing in, and back | revealing depth and the side of an assembly |
| `orbit` | whole turns at constant speed | an object that reads from every side |
| `whip` | one turn that lingers on four faces | a showpiece hero object (one per deck) |
| `still` | holds the framed pose | a slide carrying measured values |

In Blender: `L.move('<setup>', amount=1.0, sway=None)` after `L.loop()` (BLENDER.md 2c). Live in Bold Blue:
`S.shot(t, '<setup>', { amount, sway })` in `update(t)` (the same names and the same offsets). The other looks keep
their own idiom's motion (`CP3D` `S.sway`, `HS3D` `S.breathe`, `FP3D` / `PP3D` `S.turn`), which is already a
periodic drift.

1. **A pure function of `t`, and the loop closes.** Every setup is periodic in the slide's period; a one-way move goes
   there and back on `(1 - cos 2πt) / 2`. `t = 0` is the framed rest pose, so the poster, the PDF page and the still
   are the composed picture. No clock, no random, no previous frame (4.3).
2. **Sway is seasoning.** Small and slow: the defaults are tuned so slide text never seems to swim. Raise `amount`
   only on a hero slide with no numbers on the figure.
3. **The honesty gate (4.7) governs camera motion too.** On a slide whose values are measured, the camera holds its
   rest pose: `LumiPostPolicy.cameraMotion(el)` decides it from the same record as post, and both the live engine and
   the baked player obey it. A per-frame Cycles render cannot be held after the fact, so its `scene.py` must use
   `L.move('still')` - `deck_check.js` fails it otherwise. `data-camera-move="still"` or `"allow"` on the holder
   overrides the record when the person says so.
4. **Continuation (4.8) still applies** on Bold Blue: `S.shot` drives the camera like `S.orbit`, and the declared
   pose blends in and out around it.

### 4.12 The other picture — illustration, and it is drawn

Roughly a third of a deck's pictures are neither an animated nor a still 3D figure (`hard-rules.json` →
`pictureMix.illustrationPct`). Those slides get a **drawing**, and a drawing here means **inline SVG written in
code** — `engine/deck/lib/illus.js`, `LumiIllus`. It packs into the one offline HTML file, stays crisp at any
stage size and in the PDF, and its `<text>` is real text, so `deck_check.js` measures its size, its contrast and
its words exactly as it measures a headline. **No raster, no generated image, no icon set, no CDN.** Lumi has no
image model and a deck must work with no network; an invented picture of the subject is the same failure as an
invented number.

Everything else in section 4 still binds it. In particular:

1. **4.10 is the whole of it.** The real object, real counts, real proportions, real structure: *realistic in
   structure, thematic in surface*. A drawing simplifies the **surface**, never the subject. The fins are the real
   number of fins at the real pitch in a line drawing exactly as they are in a render.
2. **It is the slide's ONE main visual**, counted as `diagram` in the clash matrix (section 3).
   `LumiIllus.figure` sets `data-visual="diagram"` on the holder.
3. **It is still.** No scene, no period, no clock — so the capture contract (4.3) has nothing to hold it to, and the
   still frame, the PDF page and the recording are the frame the audience sees. Something that must move is a 3D
   figure or an `Aura.canvas` loop, not this.
4. **The layout comes from what the slide says**: comparison, progression (it climbs — S4), hierarchy, matrix,
   cycle, part-to-whole, hub, breakdown. A comparison shows both things whole in one frame (S5).
5. **Invisible things are notation, never cartoons** (4.10 rule 4), and **every liberty is written down** on the
   drawing and in the notes (4.10 rule 7).
6. **Text and numbers inside the picture are text and numbers on the slide.** They obey the look's minimum size and
   contrast, they count against the word budget, and every number goes through `F.value(…, { kind })` and is traced
   in `provenance.json` like any other (section 6). The old "a number baked into a picture cannot be checked" hole
   is closed for drawings: SVG text is checkable, so an untraced number in one has no excuse.
7. **Post (4.6) does not apply.** There is no holder canvas to put it on, and a filter over a drawing would move
   every text ratio on it at once.

The drawing surface — line weight, fills, outlines, what a shadow is — is the look's own: its `LOOK.md`, section
"The illustration idiom". How to write one, and the layout vocabulary: `illustration.md`.

---

## 5. Charts

One chart per slide, on the look's own card. ≤ 3 series, direct end labels in the series colour, **no legend**, axis
titles in lowercase with units, honest scales. Real data always carries a source line on the slide and the full
reference in the notes. No data → draw an **illustrative** shape (`illustrative: true`: the chart prints "illustrative"
and drops the y numbers) and say so in the notes. Up to 3 chips beside it name what to see, in the order the eye should
travel.

### 5.1 Cinematic to establish, flat to measure

**3D for impact and metaphor; never 3D for reading a value.** A perspective-projected bar chart distorts the comparison
it exists to make — the far bar is smaller because it is far, not because it is less — and that is a misread waiting to
happen, not a style. It also cuts straight against the honesty rules in 6.

Four patterns that are genuinely striking and stay honest:

1. **Data as physical objects in a real scene** — the actual parts, sized by the measured value, in the setting they
   belong to. The viewer compares objects, not projected lengths.
2. **Extruded ribbons over a flat baseline**, read against a 2D axis that stays true. The depth is decoration; the
   measurement happens against the flat axis.
3. **Particle or flow fields** for a process — heat, air, current, traffic — where the point is behaviour, not
   magnitude. Nothing here is read off.
4. **A 3D establishing figure that resolves into a clean 2D chart** for the actual numbers. This is the one worth
   standardising, and it is where the name comes from.

If a viewer will say a number out loud from the picture, the picture is flat.

---

## 6. Content rules

- **Data honesty.** Numbers come from the user's files or from published values, with a source line on the slide and the
  reference in the notes. **Never invent data, values, names, citations or quotes.** If you are not sure of a number,
  leave it out. Enforced: `deck_check` traces every number to the user's files or to `provenance.json`
  (`building.md` rule 8). A number read off a figure is declared as such, and the part of the figure it came from stays
  visible on the slide.
- **Photos.** Ask the user every time a slide wants a photo; never stand in a stock, generated or placeholder picture.
  No photo → choose another archetype.
- **Text caps.** The word budgets are hard caps; headlines 3–9 words; stat captions ≤ 6 words; tags ≤ 4 words.
- **Models are schematics.** Say in the notes what is drawn to scale and what is not.

---

## 7. The writing voice

Short, confident declaratives. Headlines are **claims of 3–9 words, often in two parts**, with the second part as the
emphasis phrase. Kickers are nouns. Stats are a number plus a few plain words. No hedging, no jargon without a picture
beside it, no exclamation marks, no questions as headlines (except "Open for questions").

| do | don't |
|---|---|
| Heat has **outrun the old fix** | An Overview of Thermal Management Challenges |
| A bubble of fat, **carrying a message** | Lipid Nanoparticle Structure and Composition |
| Smooth, then **suddenly jagged** | Results: Temperature vs. Time Graph |
| Four goals, **three delivered** | Project Objectives and Current Status |
| We need cooling that moves heat **without pumping it**. | In conclusion, there is a need for further research. |

A look may sharpen this voice (shorter, louder, drier). None may loosen it.

---

## 8. Speaker notes

Always written, **60–300 words per slide**, as 2–4 `<p>` in `<aside class="notes" data-aura-notes>`. Coaching voice,
second person, present tense: tell the presenter what to do and say, never repeat the slide.
- Open with an action: "Point at…", "Start with…", "Walk the tags bottom to top.", "Read the axes first."
- `<strong>` the beat names so the eye finds them mid-talk.
- Give the real-world scale, the source of every number, and one **honesty caveat**.
- Prepare the likely question. The closing slide's notes list 2–3 likely questions with short answers.
- Presentation time lives in the notes and `data-minutes`, never on a slide.

---

## 9. When the look overrides the user

Every Lumi look is a complete design. Once one is chosen:
- It **overrides every visual preference** from the form (amount of illustration, 2D/3D switches, colours, fonts, "more
  text", decorative extras). Content choices still come from the user: what to cover, the order, the facts, the photos,
  the motion type per slide, the number of slides.
- Text is strictly capped. A request for denser slides becomes more slides or fuller speaker notes.
- The checker stays on; a user request never lowers a size or lifts a cap.
- Tell the user once, kindly: "<Look> keeps its own colours and type so the deck stays consistent; tell me what to change
  about the content."

A look without a `LOOK.md` of its own follows `aura-blend.md` plus this base.

---

## 10. Checklist before `deck_check.js`

- [ ] Every slide: one main visual, companions within the matrix, kicker + headline with exactly one emphasis phrase,
      footer.
- [ ] Every scene starts from 4.0: the real subject in its own setting, no prop from the "must not default to" list
      unless the subject is that. Neighbouring slides differ in props, composition and camera.
- [ ] Sequences climb (S4); comparisons show both objects whole, side by side (S5).
- [ ] Every animated scene declares a period, every motion is periodic, labels live inside the holder.
- [ ] Detailed and showpiece scenes pass 4.2: part count, surface families, grounding, a scale cue, micro-detail,
      nothing off the frame edge.
- [ ] Every chart: real data with a source line, or `illustrative: true`; ≤ 3 series; ≤ 3 chips.
- [ ] Text sizes from the look's scale; word budgets met; notes 60–300 words on every slide; `data-minutes` set;
      `data-edit` ids added (`--ids`).
- [ ] The look's own checklist (its `LOOK.md` section "Before the checker") is also clean.
- [ ] `deck_check.js` is clean, then look at the screenshots.
- [ ] Every 3D figure passes 4.10: the real object, real counts and sizes declared with their source, real materials,
      no stand-in, invisible things as notation, every liberty written down. Would an engineer who builds it nod?
- [ ] Every animated 3D figure has a camera setup (4.11), different from its neighbours'; measured slides hold still.
- [ ] Every drawn figure passes 4.12: inline SVG, still, the real object with its real counts, a layout that matches
      what the slide says, notation never cartoon, every liberty in `F.note` and the notes, every number through
      `F.value` with a kind, and no colour or stroke width hard-coded past the look's roles.
