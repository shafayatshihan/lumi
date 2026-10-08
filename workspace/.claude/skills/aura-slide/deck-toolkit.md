# Aura deck toolkit

Use these tools instead of improvising. All commands run from the Aura folder (the one with `.aura/`).

| Job | Command |
|---|---|
| Read their files | `.aura/venv/Scripts/python.exe .aura/engine/tools/extract_text.py` |
| Start a deck | `node .aura/engine/tools/new_deck.js "<Title>" --theme <theme>` |
| Add missing text ids | `node .aura/engine/tools/new_deck.js --ids .aura/temp/build/<slug>` (`--check` only reports) |
| Check + screenshots | `node .aura/engine/tools/deck_check.js .aura/temp/build/<slug> [--notes] [--mode document] [--no-shots] [--interview <deck folder>/interview.json]` (`--mode document` only for a deck meant to be read; presenter is the default. Add `--interview` whenever a deck folder was named for you: it is how the title-slide check knows which people the interview actually established, so a deck with no supervisor is not failed for missing one) |
| Pack (one offline file) | `.aura/venv/Scripts/python.exe .aura/engine/tools/pack_deck.py .aura/temp/build/<slug> --title "<Title>" --out ".aura/decks/<id>" --replace` (where the file goes: "Where you write" in `CLAUDE.md`; without `--out` an old one-shot start writes `4 - Your slides/<Title>.html`) |
| Re-pack after an edit | the same command (`--replace` overwrites in place, nothing moves to Older versions) |
| PDF backup (old one-shot decks only; Finalize does it otherwise) | `node .aura/engine/tools/export_pdf.js "4 - Your slides/<Title>.html"` |
| PowerPoint backup (same) | `.aura/venv/Scripts/python.exe .aura/engine/tools/export_pptx.py "4 - Your slides/<Title>.html"` |
| Speaker notes (Word) (same) | `.aura/venv/Scripts/python.exe .aura/engine/tools/export_notes.py "4 - Your slides/<Title>.html" [--timed]` |
| Hard-rule check | `node .aura/engine/rules/check_rules.js "<file.html>"` (also runs by itself) |

Temporary files live in `.aura/temp/` only: `text/` (extracted text), `build/<slug>/` (the deck you edit),
`shots/<slug>/` (check pictures), `check/` (check reports), `export/` (pictures for backups), `plan.md`.

## Themes (file name for `--theme`)
| Theme | file | Good for |
|---|---|---|
| Pink Punch | `pink-punch` | creative work, student projects, startups, energetic class talks |
| Bold Blue | `bold-blue` | recommended default: any technical or science talk; photoreal studio 3D + clear charts. **Follow `looks/_shared/LOOK-BASE.md` then `looks/bold-blue/LOOK.md`** (its own template, archetype snippets, numbers and 3D toolkit override this file) |
| Flat-Pack | `flat-pack` | processes, methods, builds, step-by-step how-it-works stories |
| Happy Headspace | `happy-headspace` | health, education, psychology, environment, friendly public talks |
| Clay Pop | `clay-pop` | product and device talks, engineering builds, anything physical you want the room to want to touch. **Follow `looks/_shared/LOOK-BASE.md` then `looks/clay-pop/LOOK.md`** |

The theme file already sets fonts, colours and classes: `.kicker`, `.title` (112), `.headline` (84), `.sub` (48),
body 36, `.label` (28), `.big-num`, `.em` (the ONE emphasis phrase, using the theme's device), `.sig` (signature
surface), `.card`, `.source`. Tokens: `--bg --ink --muted --surface --accent` plus the theme's own colours.
Type scale, text floor, word budgets and the typeface limit: the numbers table in `CLAUDE.md` (a look's own numbers replace
the generic ones).
Extra fonts: only from `.aura/engine/fonts/` via `@font-face { src: url("../../../engine/fonts/<file>") }`, within the typeface limit.

## Deck structure
```html
<main class="deck" data-mode="presenter">              <!-- or "document" -->
  <section class="slide" data-kind="content" data-minutes="1" data-title="Short title for notes">
    <div class="safe"> ... </div>                         <!-- .safe = inset 96 px: keep ALL text inside -->
    <aside class="notes" data-aura-notes><p>What to say.</p><p>Second point.</p></aside>
  </section>
</main>
```
- Slides are exactly 1920 x 1080 and scale to any screen. Position things in px inside the slide (absolute or grid).
- `data-kind`: `title`, `section`, `content`, `quote`, `closing` or `references` (a dense list, still within the text floor);
  each kind has its own word budget (numbers table in `CLAUDE.md`). Only tokens that contain a letter count as words.
- Art may bleed off the edges; text, logos and focal points may not (96 px safe zone).
- Write your own layout CSS in the `<style>` block of `index.html`. Use 8-pt spacing (8/16/24/32/48/64/96/128).
- Pictures: copy into `assets/` and use `assets/<name>`. The packer resizes and compresses them; no need to by hand.
  Scripts that load a picture by name must use the literal string `'assets/<name>'` so the packer can inline it.
- **Never** link anything on the internet (no CDNs, Google Fonts, web images): the deck must work offline.

## Editable text ids (`data-edit`)
The app's editor lets the user click a text on a slide and retype it, without asking you. It finds the text by its
`data-edit` id in both the build source and the packed file, so every editable text needs one.
```html
<section class="slide" data-kind="content" data-minutes="1">
  <div class="safe">
    <span class="kicker" data-edit="s3-1">Results</span>
    <h2 class="headline" data-edit="s3-2">Moisture control saved <span class="em">34% water</span></h2>
    <p data-edit="s3-3">Measured over six weeks on two test beds.</p>
    <svg ...><text x="120" y="640" class="label" data-edit="s3-4">Before</text></svg>
    <p class="source" data-edit="s3-5">Source: field log, 2025</p>
  </div>
  <aside class="notes" data-aura-notes>...</aside>      <!-- notes never get ids -->
</section>
```
- Format `s<slide>-<n>`: the slide's **position in the deck** when the element was first made, then 1, 2, 3… in reading
  order. It is the position, **never the plan id** — the two differ as soon as the plan ids have gaps (a deck running
  s1…s12, s14, s16 has no slide 13 or 15, so its 13th slide is `s13-…`, not `s14-…`). Two slides may never mint ids
  under the same `s<k>-` prefix; `deck_check.js` fails the deck when they do.
- Put it on the element that holds one piece of text: titles, kickers, headlines, subtitles, body paragraphs, list
  items, labels (HTML or SVG `<text>`), captions, big numbers, quotes, table cells, source lines. Inline emphasis
  (`.em`, `<strong>`, `<br>`) stays inside its parent and does not get its own id; never nest one `data-edit` inside
  another.
- No ids on speaker notes, runtime chrome, empty boxes that a script fills, or purely decorative letters in art.
  Mark an element `data-edit="no"` to keep it out on purpose (for example text drawn letter by letter by a script).
- **Ids are names, not positions.** Never renumber them, never reuse one that was deleted, keep the id when the text
  or the slide moves. Two elements may never share an id (the tool renames the copy).
- `node .aura/engine/tools/new_deck.js --ids <build folder>` adds every missing id and fixes duplicates without
  touching existing ones. Run it after writing slides and after every edit. `pack_deck.py` keeps every attribute as
  written and reports how many editable texts the packed deck has.
- In the app's preview (`?aura=edit`) clicking an element with an id selects it for editing instead of moving to the
  next slide, so ids must sit on the visible text, not on a large wrapper.

## Motion
- **Entrances**: `data-anim="fade|fade-up|fade-down|slide-left|slide-right|zoom|pop|rise|grow-x|draw"` and
  `data-delay="<ms>"` on any element. They replay every time the slide is entered and show their final state in the
  PDF, PowerPoint and check. `rise` grows bars/liquids from the bottom, `grow-x` from the left, `draw` draws an SVG
  stroke (give the shape `pathLength="1"`). Stagger 80–150 ms; keep a slide's entrances under ~1.2 s in total.
- **Loops** (calm, 3–6 s, seamless, no flashing): your own CSS `@keyframes` on SVG parts: flow dashes along a pipe
  (`stroke-dashoffset`), turning gears, rising bubbles, a marker tracing a curve. Loops pause on hidden slides by
  themselves. **The first keyframe must be a complete, readable picture** — that frame is used for PDF / PowerPoint.
  For SVG transforms use `transform-box: fill-box; transform-origin: center;`.
- Reduced motion is handled by the runtime (everything shows its final state).

## 3D (only when `style.threeD` is yes)
```html
<div class="aura-3d" data-scene="pump" data-still="2" style="left:960px; top:120px; width:860px; height:820px"></div>
<script>
Aura.scene('pump', ({ THREE, width, height }) => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 100);
  camera.position.set(4, 3, 6); camera.lookAt(0, 0.4, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d4ea, 2.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(3, 6, 4); scene.add(sun);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.6, 48), new THREE.MeshStandardMaterial({ color: 0xff7300, roughness: 0.55 }));
  scene.add(body);
  return { scene, camera, update(t) { body.rotation.y = 2 * Math.PI * t / 12; } };   // one turn per 12 s loop
}, { period: 12 });              // REQUIRED: the loop period in seconds (0 = a still picture)
</script>
```
- **Every scene declares its loop period** (`Aura.scene(id, setup, { period })` or `data-period` on the holder) and
  is periodic in it: `update(t + period)` draws exactly what `update(t)` draws (only whole turns / whole harmonics of
  the period; never the clock or `Math.random()` inside `update`). Finalize records each 3D slide as a seamless loop
  through this (the capture contract at the top of `runtime.js`); `deck_check.js` fails a 3D slide without a period
  or with a seam. Labels that follow the 3D go inside the holder.
- The runtime loads three.js only when a 3D slide is shown, runs it only while that slide is on screen, keeps at most
  3 alive, caps the pixel ratio, and renders a still at `data-still` seconds for the PDF / PowerPoint / check.
- Use `THREE` from the setup argument (classic `<script>`, no imports, no three.js add-ons). Build shapes from
  primitives (boxes, cylinders, spheres, tori, lathe/extrude shapes), flat-shaded or `MeshStandardMaterial` in the
  theme's palette, soft hemisphere light; transparent background so the slide shows through.
- Text labels for a 3D scene are HTML on top of the canvas (≥ 28 px), not text inside WebGL.
- One 3D scene per slide. Slow, steady motion (rotation ≤ 0.6 rad/s). Return `dispose()` only if you made extra
  resources yourself; the runtime frees geometry, materials and textures in the scene.
- 2D canvas loops work the same way: `<div class="aura-canvas" data-canvas="id">` +
  `Aura.canvas('id', ({ ctx, width, height }) => (t) => { ...draw frame t... })`. Prefer SVG + CSS when you can. A canvas loop
  **is the slide's diagram** (its one main visual): it never sits next to a 3D scene, a chart or a photo on the same slide.

### Bold Blue 3D cheat sheet (`BB3D`, so you do not have to read `studio3d.js`)
`looks/bold-blue/studio3d.js` is a classic script (global `BB3D`, no imports). Do not open it unless this sheet lacks something;
the usual 3D slide needs only these calls (all from `LOOK.md` "The 3D recipe"):
- `const S = BB3D.studio(ctx, opts)` inside `Aura.scene(id, ctx => ..., { period })`. `opts`: `target [x,y,z]`, `distance`,
  `azimuth`, `elevation` (degrees), `fov`, `cyc: true` (white sweep studio), `sky: true` (open-air backdrop, never dark),
  `floor: 'none'` (no floor), `post: { bloom: true }` or `false`, `keyIntensity`, `envIntensity`, `exposure`.
- `S.add(mesh)` puts an object in the scene; `S.orbit(t)` makes a slow camera move that is periodic in the period; `S.camera`,
  `S.scene`, `S.THREE` are there. Finish with `return S.api({ update(t) { ... } })`: `update(t)` is a pure function of `t`
  (loop: only whole multiples of `1 / ctx.period`; no clock, no `Math.random()`).
- `const M = BB3D.materials(ctx.THREE)`: ready materials `copper steel aluminium gold brass darkSteel glass plastic black blue ceramic
  soft rubber water waterClear hot led wood`; `BB3D.mat.metal/plastic/glass/liquid/emissive(THREE, {...})` for a custom one;
  `BB3D.C` is the palette (`C.blue`, `C.sky`, `C.orange`, ...).
- Shapes (each returns a mesh): `roundedBox(THREE, w, h, d, r, mat)`, `lathe(THREE, profile, mat)` (revolved profile: bottles, nozzles,
  vials), `chamferCylinder(THREE, {r,h,c}, mat)`, `tube(THREE, points, radius, mat)`, `coil`, `helix`, `blob(THREE, {radius, seed}, mat)`,
  `ridged`, `bolt`, `instanced(THREE, geo, mat, count, place)`, `along(THREE, curve, count, geo, mat)`, `contactShadow(THREE, w, d)`,
  `glowSprite`. Procedural textures: `BB3D.textures.wood/brushed/...`; shader tweaks: `BB3D.inject(material, { vertex, emissive, fragment })`.
- Labels that follow the 3D: HTML `<div class="bb-tag" data-follow="name">` inside the holder, then
  `BB3D.labels(S, ctx.el, { name: [x, y, z] | object3D | t => [x,y,z] })`; `data-align="left|right|center"`, `data-dx`, `data-dy`.
- A photo with marks (`annotated-photo` archetype): the marks live in the figure's own 0-1000 x 0-800 box, not in photo pixels.
  To re-crop the photo change the image's `object-fit` / `object-position`, never the numbers in the marks.

## Speaker notes and timing
- Notes: 2–4 short paragraphs per slide in `<aside class="notes" data-aura-notes>`, in the presenter's voice, adding
  what the slide does not say (Mayer: never just repeat the slide). Last slide: likely questions with short answers.
- `data-minutes` on every slide; they should add up to `audience.minutes`. The presenter view (N / P) shows the
  planned time window, the notes and the next slide; `export_notes.py --timed` prints a timed script.

## Reading the check
`deck_check.js` renders every slide in Microsoft Edge (all slides shown, final state) and reports per slide:
- **ERROR** (must fix): text under the floor (HARD RULE; Bold Blue: also body text under 28 px outside the footer, page number,
  captions and chart step labels) · more than one main visual on a slide or companions it cannot hold (the clash
  matrix: 3D / chart / diagram / photo / text) · a 3D slide with no loop period or a loop that is not seamless · text inside the 96 px edge band · text cut off · too many words for
  the slide kind · contrast below 3:1 · a picture that did not load · a 3D scene that failed · a script error · anything
  that needs the internet · more typefaces than the look allows · a font that failed to load · a slide that is not 1920 x 1080.
  (The full list of what blocks, what only warns and what nothing checks: `enforcement.md`.)
- **warn** (fix unless there is a reason): contrast below 4.5:1 · too many sizes on a slide or in the deck ·
  sizes off the scale · less empty space than the slide kind needs · overlapping texts · a non-embedded font ·
  a slide without notes (with `--notes`).
- Fix order when text does not fit: reduce gaps / padding / illustration size a little → shorten words → split
  the slide. **Never shrink text below the floor.**
- Then **look** at `.aura/temp/shots/<slug>/overview.png` and the slides themselves (Read the PNG). The check passes
  measurable rules; only your eyes catch a cramped corner, an awkward line break or art that fights the headline.

## Packing and backups
- `pack_deck.py` writes `<Title>.html` (the `<title>` or `--title`) into `--out` (the deck's work folder) or, without it, into `4 - Your slides/`, with everything inside it:
  runtime, styles, fonts, pictures (resized to ≤ 1920 px, compressed), videos, and three.js when 3D is used. It
  refuses to pack when something is missing or online, and says what. An existing file with the same name, plus its
  `.pdf`, `.pptx` and ` - speaker notes.docx`, moves to `Older versions/` as `YYYY-MM-DD HHMM <name>`.
  With `--replace` (edits from the editor) the deck is overwritten in place and its backups stay where they are;
  then remake only the backups that exist.
- `delivery.backups`: "PDF" → `export_pdf.js` (real text, one page per slide). "PowerPoint" → `export_pptx.py` (one
  picture per slide, notes in the notes pane; tell them PowerPoint slides are pictures, so edits happen here).
- `delivery.help`: anything with "notes" → notes in the deck + `export_notes.py`; "script" or "timed" →
  `export_notes.py --timed`; other help (practice tips, likely questions) → put it in the last slide's notes.
- `delivery.clicker`: clickers send arrow / page keys, which the deck understands. Mention it in the summary.
- The deck keys: → / Space / Page Down next, ← / Page Up back, Home / End, a number + Enter jumps, F full screen,
  N notes view, P presenter window (second screen), B black screen.
