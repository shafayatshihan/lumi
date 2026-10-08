# Flat-Pack — the brand layer

> **Read `../_shared/LOOK-BASE.md` first.** It holds the structural rules every Lumi look obeys: the slide skeleton,
> the archetype catalogue, the clash matrix, subject-first staging (4.0, including S4 sequences climb and S5
> comparisons side by side), fidelity, the capture contract, data honesty, the writing voice, speaker notes and the
> pre-flight checklist. **This file adds only what makes a deck look like Flat-Pack**: palette, type, motion feel and
> figure idiom. The two together override `aura-blend.md`, the form's style answers and `deck-toolkit.md`.

Flat-Pack is the **wordless assembly manual**. One sheet of white paper, one 4 px pen, numbered steps, part counts,
dashed guides saying where a thing goes, a yellow price tag and one blue phrase. Its promise to the audience is that
nothing is hidden: every object comes apart on the page so you can see how it goes together.

It is subject-free. A manual can draw a gearbox, a protein, a supply chain or a proof. Brand DNA:
`../../brands/ikea/brand-style.md`.

Files you will use (all under `.aura/engine/deck/`):

| file | what it gives you |
|---|---|
| `themes/flat-pack.css` | tokens, type, the 12-column grid, the footer, step discs, part counts, callouts, click-into-place motion |
| `looks/flat-pack/template.html` | the starting deck (title + closing); `new_deck.js --theme flat-pack` uses it |
| `looks/flat-pack/archetypes/*.html` | one ready slide per archetype: Read `.aura/engine/deck/looks/flat-pack/archetypes/<name>.html` |
| `looks/flat-pack/flat-pack.js` | page numbers, `FPChart.line` |
| `looks/flat-pack/fp3d.js` | `FP3D`: the orthographic drawing sheet, parts, outlines, guides, arrows, exploded views, pins |
| `runtime.js` (top comment) | the **capture contract**: loop periods, `?capture`, recorded loops, `?still=n` |

**3D engine policy: Flat-Pack never uses Blender, and that is deliberate — not an omission.**
An assembly-manual drawing *is* a 3D model: orthographic projection, flat fills, a constant-weight outline. So this
look has a full 3D path — `FP3D.sheet`, live three.js — and it is the only one. Cycles path tracing (`lumi_bpy`: AgX,
soft shadows, PBR materials) renders the opposite picture at a hundred times the cost; a photoreal render in this deck
would look like a mistake. The rule is written in code as `form_server.LOOK_3D['flat-pack'] = 'threejs'`, so a 3D slide
here always resolves to an engine, and an explicit `engine: blender` on the plan is downgraded to three.js with the
note `look-no-blender` rather than silently leaving the slide with nothing. **Do not write a `scene.py` for a
Flat-Pack deck.**

---

## 1. Tokens

**Paper and ink.** Background `#FFFFFF` on every slide — it is one sheet of paper and it never changes colour.
`#F5F5F5` is the only other surface, and only for "the other one" (a part shown as context, a ghosted card). Ink
`#111111` for the pen and all body text, `#484848` muted, `#6B6B6B` labels, `#D8D8D8` hairline.
**No shadows and no gradients, anywhere.** Depth comes from axonometry and line weight.

**One line weight.** `--line-w: 4px`. Every drawn edge, every box border, every rule, every arrow. A second weight
reads as a mistake. Corners: 8 px on a box, 4 px on a tag, round joins on a drawn path.

**Two signals.**
- Blue `#0058A3` is the ONE emphasis colour: exactly one `.em` phrase per headline (blue, with a flat square-ended
  8 px bar under it), the hero part in a drawing, and the "do this" fill. 7:1 on white.
- Yellow `#FFDB00` is a label colour only: the kicker tag, the `.fp-count` part pill, a highlighted chart region, the
  `.em.mark` highlighter. **Always with `#111111` text, never large yellow type.**
- Orange `#CA5008` is rare: the one thing that goes wrong (`.fp-goal.no`, a failing series).
Never blue and yellow on the same mark. Never a third signal.

**Type.** Noto Sans and nothing else — **one typeface** (800 display, 700 labels and numbers, 400 text).
Scale: **24 / 32 / 44 / 60 / 84 / 120 / 180** (the same numbers are in `hard-rules.json`).

| size | used for |
|---|---|
| 180 | the closing headline at most; a longer message uses 120 |
| 120 | the title slide headline (`.title`, 800, max 18 ch) |
| 84 | headlines (`.headline`, 800, −0.022 em, max 14 ch), big stats (`.fp-stat`), `.big-num` |
| 60 | medium stats (`.fp-stat.md`), the process card's step name |
| 44 | sub-lines, step names, goal names, the step-disc number, `.fp-q` |
| 32 | everything else: body, kicker, stat captions, chips, callouts, map nodes, chart ticks and titles |
| 24 | **only** the footer mark, the page number, captions / source lines (`.cap`, `.source`, `figcaption`), part counts (`.fp-count`) and the chart's step labels and event badge |

The checker enforces it: 24 px anywhere else is an error; nothing is ever below 24 px.

**Space.** 1920 × 1080, 96 px safe zone (`.safe`), 12 columns with **48 px gutters** (wider than Bold Blue — this look
breathes, and the checker wants about 45 % of a content slide empty). Columns: `.fp-l` 5 + `.fp-r` 7 (default),
`w4/w8` (chart slides), `w6/w6`, `w7/w5` (closing).

**Chrome.** Every slide ends with `<footer class="fp-foot">`: a yellow square + a short deck mark (≤ 4 words,
uppercase, 24 px) left, `<span class="fp-pageno"></span>` right ("03 / 12"). The kicker is a **price tag** — a yellow
rectangle with the ink outline reading "NN · TOPIC"; the title slide uses `.kicker.dot` (white tag, blue dot) with the
course or event instead of a number. The runtime draws a 6 px blue progress line.

**Motion feel: parts click into place.** Short, decisive, along one axis. Curve `cubic-bezier(.2,.9,.25,1)`
(`--fp-ease`), 0.30–0.52 s, staggered 0.26 / 0.36 / 0.46 / 0.56 s. Text slots in (`fpSlotY` 40 px, `fpSlotX` 40 px),
boxes snap (`fpSnap`, scale .82 → 1), lines draw themselves (`fpDraw` on a path with `--len` and a matching
`stroke-dasharray`). **No drift, no float, no fade-up-from-nowhere, no bounce.** 3D loops are 12–24 s: the view turns
±4° at most, and the real motion is parts moving apart and back, or one step at a time.

**Word budgets** (hard caps, the checker counts; the same numbers are in `hard-rules.json`): presenter mode
title 32, section 10, content 34, quote 24, closing 24, references 140; in document mode a content slide may hold 70.
**These are tighter than Bold Blue on purpose** — a manual's text is a label, not a paragraph. If it does not fit, it
becomes a drawing or another slide.

---

## 2. The archetypes in Flat-Pack

The catalogue, the order and the closing-slide rules are in the base, section 2. Flat-Pack's layouts:

| # | archetype | main visual | layout | words |
|---|---|---|---|---|
| 1 | `title-hero` | the subject exploded, full bleed | text left 900 px, drawing right | ≤ 24 |
| 2 | `problem-stats` | the subject with the failing part in blue | 5 / 7 | 20–34 |
| 3 | `what-it-is` | the object exploded, numbered pins | 5 / 7 on the graph-paper grid | 20–34 |
| 4 | `process-film` | one drawing assembling itself, step by step | stack: head row + wide sheet | 10–18 on slide |
| 5 | `comparison-twin` | both objects whole, side by side, ONE scene | 5 / 7 | 18–30 |
| 6 | `annotated-photo` | the user's real photo, outlined, numbered pins | 5 / 7 | 18–30 |
| 7 | `system-tour` | the view steps from part to part | stack | 10–18 |
| 8 | `result-chart` | one drawn line chart | 4 / 8 | 16–28 |
| 9 | `objectives-tour` | the goals as a **staircase that climbs** (S4) | 5 / 7 | 18–30 |
| 10 | `closing` | designed per deck (base section 2) | one of 4 variants | ≤ 24 |

DOM skeleton shared by every content archetype:

```html
<section class="slide" data-kind="content" data-minutes="1.5" data-title="Short title">
  <div class="safe">
    <div class="fp-main">                                   <!-- or .fp-main.stack with a .fp-head row on top -->
      <div class="fp-l w5"> kicker · headline · companions </div>
      <div class="fp-r w7"><div class="fp-stage"> main visual </div></div>
    </div>
    <footer class="fp-foot"><span class="fp-mark">Deck mark</span><span class="fp-pageno"></span></footer>
  </div>
  <aside class="notes" data-aura-notes> 60–300 words </aside>
</section>
```

Companion parts: `ul.fp-stats > li` (a 4 px dimension line over each number; `.blue` / `.signal` colour it;
`.fp-stat`, `.fp-stat.md`, `.fp-bar` with `--v`), numbered `ol.fp-steps` with `.fp-n` discs (`.on` = yellow),
`.fp-count` part pills ("6x"), `ul.fp-zones` (photo zones with numbered discs), `ul.fp-chips` (outlined; `.key` is
yellow), `ul.fp-goals` (`.on` blue tick, `.wip` yellow, `.no` orange cross), `.fp-pin` numbered discs and `.fp-tag` /
`.fp-pill` callouts on a drawing, `.fp-cyc` + `.fp-rail` (process film), `.fp-map` (parts list), `.close-line`
(one sentence, its key words in `<b>` blue).

---

## 3. The figure idiom: an assembly-manual drawing

> Base section 4.0 decides *what* to show and where it lives. This section says *how it is drawn*.

### 3.1 The five rules of the drawing
1. **Orthographic, axonometric.** `FP3D.sheet` defaults to 35° round and 30° down — the manual's standard view.
   No perspective: parallel edges stay parallel, so a reader can compare two parts across the page.
2. **Flat fills, four of them.** `paper` white, `grey` for context, `blue` for the hero part, `yellow` for the part a
   callout is about. Nothing else. A part with no fill named is paper.
3. **Every solid carries its own outline.** `FP3D.part` draws the fill, an inverted-hull shell and the geometry's hard
   edges together, so one even pen line reads at 1920 × 1080.
4. **No lights exist in the scene.** `MeshBasicMaterial` needs none. If you find yourself adding a light, you are
   building Bold Blue's studio in the wrong look.
5. **Nothing is hidden.** If a part is inside another, explode it (`S.exploded`) or cut it; never leave the audience
   guessing what is under the lid.

### 3.2 The sheet
```js
Aura.scene('s3-scene', (ctx) => {                        // ctx: THREE, el (the holder), renderer, width, height, period
  const { THREE } = ctx;
  const S = FP3D.sheet(ctx, { target: [0, 1.1, 0], size: 4.0, turn: -35, tilt: 30, sway: 4 });
  const base = S.add(FP3D.panel(THREE, 3.4, 0.24, 2.4, { fill: 'paper' }));
  const core = S.add(FP3D.disc(THREE, 0.9, 0.6, { fill: 'blue' }));   core.position.y = 1.0;
  S.add(FP3D.line(THREE, [[0, .3, 0], [0, 2.6, 0]], { dashed: true }));      // where it goes
  S.add(FP3D.arrow(THREE, [0, 2.4, 0], [0, 1.4, 0]));                        // and which way
  S.exploded([core], [0, 0.9, 0]);                       // lift apart over the first third, hold, settle back
  FP3D.pins(S, ctx.el, { core: core });                  // .fp-pin / .fp-tag with data-follow="core"
  return S.api({ update(t) { S.turn(t); } });
}, { period: 14 });
```
`size` is the half-height of the view in world units (an orthographic camera has no distance). `sway: 0` gives a
perfectly still drawing — the right answer for a still slide.

### 3.3 The toolkit (`FP3D.*`)

| call | what it draws |
|---|---|
| `sheet(ctx, o)` | the orthographic drawing sheet: `add`, `turn(t)`, `exploded(parts, offset)`, `place`, `api` |
| `part(THREE, geometry, { fill, weight, edgeAngle })` | any geometry as a filled, outlined manual part |
| `panel / rod / disc / dowel` | the four shapes a manual keeps needing; `dowel` is its fastener |
| `fill(part, 'blue')` | recolour a part (a step lighting up) |
| `line(THREE, pts, { dashed })` | a real edge, or a dashed guide: "this goes there" |
| `arrow(THREE, from, to)` | the only way this look says "move this": a shaft and a solid head |
| `climb(THREE, n, o)` | **S4**: a staircase of `n` rising treads, goal on top; returns `{ group, tops }` |
| `pair(THREE, a, b, gap)` | **S5**: two objects, whole, side by side, same camera, same scale |
| `pins(S, el, anchors)` | numbered discs and callout boxes that follow their part every frame |
| `steps(t, P, n, move)` | the manual's rhythm: `n` states per loop, each **still, then one move** |

### 3.4 Motion in the drawing
The exploded view is the look's signature loop: parts lift apart over the first 35 % of the period, hold, and settle
back over the last 35 %. It is exactly periodic, so it satisfies the capture contract with nothing extra.
A process film uses `FP3D.steps`: a step is still, then one thing moves, then it is still again. **Nothing drifts,
nothing orbits, nothing breathes.** Camera sway is ≤ 4° and may be zero.

### 3.5 Fidelity, in this look's terms
Base 4.2 sets the counts. What they mean here:
- **"Surface families"** are the four fills plus the outline: a detailed drawing uses at least three of them
  meaningfully (paper body, grey context, blue hero), a showpiece all four plus a dashed guide.
- **"Micro-detail"** is drawn detail, not shading: chamfers, fastener holes, a dowel, a part number, a "6x" pill, a
  dimension line, a section hatch. Three kinds for detailed, five for showpiece.
- **"Grounding"** is a single 4 px ground line or a grey base panel — never a shadow, because this look has none.
- **Scale cue:** a drawn dimension line with its number, or a hand / coin / person outline beside the object.
- The real counts rule (base 4.1) matters more here than anywhere: a manual that draws five screws when there are six
  is simply wrong. **Ask; never invent a count.**

### 3.6 What never to do in Flat-Pack
No shadows, no gradients, no blur, no glass, no bevel highlight, no second line weight, no perspective camera, no
texture image, no photoreal material, no Blender. No yellow text larger than 32 px. No more than one blue `.em` per
headline. No label text baked into WebGL — callouts are HTML (`.fp-pin`, `.fp-tag`).

---

## 3A. The illustration idiom: the same manual, flat on the page

> Base 4.12 and `illustration.md` say what a drawn picture is. This section is only Flat-Pack's surface.

Flat-Pack is the one look whose 3D already *is* a drawing, so its 2D is the same pen on the same sheet — a page of
the manual that happens not to need an axonometric view. A reader must not be able to tell which engine drew it.

| | Flat-Pack |
|---|---|
| line | 4 px `--ink` on **every** solid, one weight, no exceptions — the look's whole identity |
| fills | hero `--brand` blue, body white, context `--bg-grey`, mark `--accent` yellow, signal `--signal` |
| corners | 8 px; a tag 4 px |
| lift | none. Flat-Pack has no shadows; depth is overlap and the dashed guide |
| labels | Noto Sans at 32 px; captions, dimensions and part numbers at 24 px |
| notation | `F.arrow` only — the manual says "move this" with an arrow and with nothing else. Dashed line = "this goes there" |
| texture | hatching on a cut surface; nothing else, ever |

1. **Four fills and the pen.** Paper, grey, blue, yellow. A part with no fill named is paper. A drawing that
   needs a fifth colour needs a second slide.
2. **Nothing is hidden.** If a part sits inside another, use `F.breakdown` to pull them apart along the axis
   with the dashed guide between, or cut it open. Never leave the audience guessing what is under the lid.
3. **Counts are the point.** A manual that draws five screws where there are six is simply wrong: the "6x" pill,
   the part number and the dimension line are this look's micro-detail. **Ask a count; never invent one.**
4. **Never** a gradient, a blur, a glow, a second line weight, a soft shape, yellow type above 32 px, or an arrow
   drawn as a curve.

---

## 4. The chart idiom (`FPChart.line`)

A drawn figure, not a widget: one pen and flat fills. 6 px series strokes, **direct end labels in an outlined box, no
legend**, a dotted grid, both axes ink lines with solid triangular heads, 32 px ticks and lowercase axis titles with
units ("time elapsed, min"). Optional: dashed step lines with 24 px labels across the top, one in a yellow tag; a
**flat yellow region** (`band`) for the part the slide is about; one marked moment (`event`): a dashed ink line and a
square yellow badge with a 24 px label. Series colours: ink `#111111`, then blue `#0058A3`, then orange `#CA5008`;
never more than three.
```js
FPChart.line('#s8-chart', {
  x: { min: 0, max: 60, ticks: [0, 20, 40, 60], title: 'time elapsed, min' },
  y: { min: 0, max: 100, ticks: [0, 50, 100], title: 'load held, kg' },
  series: [{ name: 'before', color: '#111111', points: [[0, 82], …] }, { name: 'after', color: '#0058A3', points: […] }],
  band: { from: 40, to: 60 }, event: { x: 40, y: 74, label: 'where it lets go' },
  source: 'Source: Author et al., Journal 2021, Fig. 3',     // real data always carries its source
  // illustrative: true                                       // no data: a shape, labelled, no y numbers
});
```

---

## 5. The voice, in this look

The base's voice rules apply and Flat-Pack sharpens them: **a manual labels, it does not narrate.** Headlines are 3–7
words. Captions are a noun phrase, not a sentence. Counts are written the manual's way (`6x`, not "six of them").

| do | don't |
|---|---|
| Four parts, **one job** | The System Architecture and Its Components |
| Same job, **half the parts** | A Comparison of the Original and Revised Designs |
| It holds, **then it does not** | Results: Load Capacity Over Time |
| Drawn here, **built there** | Experimental Validation of the Schematic Model |

---

## 6. Before the checker (Flat-Pack's own lines)

The full pre-flight list is in the base, section 10. On top of it:

- [ ] White paper on every slide; `#F5F5F5` only as "the other one". No shadow, no gradient, no blur anywhere.
- [ ] One line weight (4 px) on every drawn edge, border, rule and arrow.
- [ ] Noto Sans only. Sizes from 24 / 32 / 44 / 60 / 84 / 120 / 180; 24 px only in the footer, page number, captions,
      part counts and chart step labels.
- [ ] Exactly one blue `.em` per headline. Yellow is a label colour only, always with `#111111` text.
- [ ] Every 3D scene: `FP3D.sheet`, orthographic, no lights, every solid outlined, nothing hidden (exploded or cut).
- [ ] No `scene.py` anywhere: this look does not use Blender.
- [ ] Sequences are drawn with `FP3D.climb`; comparisons with `FP3D.pair`.
- [ ] Word budgets met — they are tighter here than in any other look.
- [ ] Tell the user once that Flat-Pack keeps its own colours and type (base section 9).
