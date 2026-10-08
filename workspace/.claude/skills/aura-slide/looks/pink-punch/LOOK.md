# Pink Punch — the brand layer

> **Read `../_shared/LOOK-BASE.md` first.** It holds the structural rules every Lumi look obeys: the slide skeleton,
> the archetype catalogue, the clash matrix, subject-first staging (4.0, including S4 sequences climb and S5
> comparisons side by side), fidelity, the capture contract, data honesty, the writing voice, speaker notes and the
> pre-flight checklist. **This file adds only what makes a deck look like Pink Punch**: palette, type, motion feel and
> figure idiom. The two together override `aura-blend.md`, the form's style answers and `deck-toolkit.md`.
>
> **Every hard number is in `engine/rules/hard-rules.json` under `looks.pink-punch`** — the type scale, the text
> floor, the word budgets, the whitespace targets, the typeface count. This file names what each size is *for*; it
> never repeats the value. `deck_check.js` reads that file and nothing else.

Pink Punch is the **screen-printed poster**. Warm grey-cream paper, flat saturated blocks, a black outline on every
shape, and a solid black copy of each shape sitting 8 px behind it as its shadow. Nothing here is rendered: it is
printed. Its promise to the audience is that the talk is not precious about itself — it says the loud thing first, in
the fewest words, and then shows you.

It is subject-free. A poster can print a gearbox, a protein, a market or a proof. Brand DNA:
`../../brands/gumroad/brand-style.md`.

Files you will use (all under `.aura/engine/deck/`):

| file | what it gives you |
|---|---|
| `themes/pink-punch.css` | tokens, type, the 12-column grid, the footer, step discs, printed cards, callout pills, punch-into-place motion |
| `looks/pink-punch/template.html` | the starting deck (title + closing); `new_deck.js --theme pink-punch` uses it |
| `looks/pink-punch/archetypes/*.html` | one ready slide per archetype: Read `.aura/engine/deck/looks/pink-punch/archetypes/<name>.html` |
| `looks/pink-punch/pink-punch.js` | page numbers, `PPChart.bar` (this look's own chart), `PPChart.line` |
| `looks/pink-punch/pp3d.js` | `PP3D`: the print bed, rounded forms, the two-pass hard-shadow print, pops, climbs, pins |
| `runtime.js` (top comment) | the **capture contract**: loop periods, `?capture`, recorded loops, `?still=n` |

**3D engine policy: Pink Punch never uses Blender, and that is deliberate — not an omission.**
A screen print has no light in it and no blur. Cycles path tracing (`lumi_bpy`: AgX, soft shadows, PBR materials)
renders the exact picture this look refuses, at a hundred times the cost. So Pink Punch has a full three.js path —
`PP3D.bed`, the two-pass print — and it is the only one. The rule is written in code as
`form_server.LOOK_3D['pink-punch'] = 'threejs'`, so a 3D slide here always resolves to an engine, and an explicit
`engine: blender` on the plan is downgraded to three.js with the note `look-no-blender` rather than silently leaving
the slide with nothing. **Do not write a `scene.py` for a Pink Punch deck.**

---

## 1. Tokens

**Paper and ink.** Background `#F4F4F0` on every slide — warm grey-cream, and it never changes. `#FFFFFF` is the only
other surface, and it is what a card, a chip, a tag and a callout are made of. Ink `#000000` for every letter and every
outline; `#242423` muted, and nothing between them. There is no grey scale in this look: a thing is black, white, cream
or a pop.

**One outline weight, and one shadow.** `--line-w: 5px` on every border, every drawn edge, every bar, every pill. The
shadow is `--shadow: 8px 8px 0 #000` on a card and `--shadow-sm: 5px 5px 0 #000` on a small object. **Never blurred,
never tinted, never soft** — it is a second pass of ink, not a light effect. Corners: a card has three round corners
and **one sharp one** (`--radius: 48px 48px 48px 8px`); a chip, a pill, the kicker and a counter are fully round.

**One voice, five pops.**
- Pink `#FF90E8` is the ONE voice colour: the highlighter behind the single `.em` phrase per headline, the one number
  that matters (`.pp-stat.hit`), the hero object in a picture, the "this one" fill. Always with `#000000` text.
- `#FFC900` yellow · `#F3A642` orange · `#DC341E` red · `#23A094` teal · `#90A8ED` periwinkle are **illustration fills
  only** — inside a drawing, a chart bar or a counter tag. **Never a field behind a sentence, never a type colour.**
- `#DC341E` red doubles as the one thing that goes wrong (`.pp-goal.no`, a failing series).

**Exactly one pink object per picture.** Pink is how the audience finds the subject. A second pink part means the slide
has two subjects, which means it is two slides.

**Type.** Two typefaces and no more: **Anton** for display (one weight, always uppercase — headlines, titles, stat
numbers, step names, the closing word) and **Work Sans** for everything that is read (400 body, 500 captions, 600
labels, 700 numbers and the footer). Anton is condensed, so a headline fits more characters than its width suggests —
use that for a blunt claim, not for a longer one. The scale and the floor are in `hard-rules.json`; what each step is
for:

| role | used for |
|---|---|
| closing | the closing word at most; a longer message drops to the title size |
| title | the title-slide headline (`.title`) and the closing message (`.pp-thanks.pp-msg`) |
| headline | headlines (`.headline`), the big stat (`.pp-stat`), `.big-num` |
| sub | medium stats (`.pp-stat.md`), the process card's step name |
| lead | sub-lines, step names, goal names, the step-disc digit, `.pp-q` |
| body | everything else: body, kicker, stat captions, chips, callouts, map nodes, chart ticks and titles |
| caption | **only** the footer mark, the page number, captions / source lines (`.cap`, `.source`, `figcaption`), count tags (`.pp-count`) and the chart's step labels, bar names and event badge |

The checker enforces it: the caption size anywhere else is an error, and nothing is ever below it.

**Space.** 1920 × 1080, 96 px safe zone (`.safe`), 12 columns with 56 px gutters. Columns: `.pp-l` 5 + `.pp-r` 7
(default), `w4/w8` (chart slides), `w6/w6`, `w7/w5` (closing). This look fills its page more than Flat-Pack does —
blocks are big and few — but the whitespace floor in `hard-rules.json` still holds.

**Chrome.** Every slide ends with `<footer class="pp-foot">`: a pink outlined dot + a short deck mark (≤ 4 words,
uppercase) left, `<span class="pp-pageno"></span>` right ("03 / 12"). The kicker is a **white pill** with a 3 px black
border and a pink dot reading "NN · TOPIC"; the title slide uses `.kicker.dot`, the same pill with a yellow dot, for
the course or event. The runtime draws a 10 px pink progress line under a black rule.

**Motion feel: a sticker punches off the page.** Everything starts flat *on* its own shadow — offset by the shadow
distance, with no shadow showing — and pops up into place, so the hard shadow **appears**. Curve
`cubic-bezier(.34, 1.3, .64, 1)` as `--pp-ease`: one short, cheerful overshoot and no second bounce. Cards punch
(`ppPunch`), rows slide in from the left (`ppSlotX`), chips and discs pop (`ppPop`), the bar sweeps. **No drift, no
float, no fade up from nowhere, no blur, no easing longer than it needs.** 3D loops are 12–21 s: the view turns ±5° at
most, and the real motion is parts popping apart and dropping back, or one beat at a time.

**Word budgets are tighter than Bold Blue and about level with Flat-Pack** (the values are in `hard-rules.json`), and
for a different reason: a poster that needs a paragraph has already failed. If it does not fit, it becomes a block,
a bar or another slide.
The numbers, copied from `hard-rules.json`: presenter mode title 30, section 8, content 30, quote 22, closing 22, references 140; in document mode a content slide may
hold 65. Scale: **28 / 36 / 48 / 64 / 84 / 112 / 160**.

---

## 2. The archetypes in Pink Punch

The catalogue, the order and the closing-slide rules are in the base, section 2. Pink Punch's layouts:

| # | archetype | main visual | layout | words |
|---|---|---|---|---|
| 1 | `title-hero` | the subject printed and popped apart, full bleed | text left 980 px, print right | fewest |
| 2 | `problem-stats` | the subject with the failing part in pink | 5 / 7 | short |
| 3 | `what-it-is` | the object popped apart, numbered discs | 5 / 7 | short |
| 4 | `process-film` | one print assembling itself, beat by beat | stack: head row + wide stage | fewest on slide |
| 5 | `comparison-twin` | both objects whole, side by side, ONE scene | 5 / 7 | short |
| 6 | `annotated-photo` | the user's real photo in a printed frame, numbered discs | 5 / 7 | short |
| 7 | `system-tour` | the view steps from part to part; only the visited part is pink | stack | fewest |
| 8 | `result-chart` | **one bar chart** (a line chart only for a trend over time) | 4 / 8 | short |
| 9 | `objectives-tour` | the goals as blocks that **climb**, a star on the top (S4) | 5 / 7 | short |
| 10 | `closing` | designed per deck (base section 2) | one of 4 variants | fewest |

DOM skeleton shared by every content archetype:

```html
<section class="slide" data-kind="content" data-minutes="1.5" data-title="Short title">
  <div class="safe">
    <div class="pp-main">                                   <!-- or .pp-main.stack with a .pp-head row on top -->
      <div class="pp-l w5"> kicker · headline · companions </div>
      <div class="pp-r w7"><div class="pp-stage"> main visual </div></div>
    </div>
    <footer class="pp-foot"><span class="pp-mark">Deck mark</span><span class="pp-pageno"></span></footer>
  </div>
  <aside class="notes" data-aura-notes> 60–300 words </aside>
</section>
```

Companion parts: `ul.pp-stats > li` (`.pp-stat`, `.pp-stat.md`, **`.pp-stat.hit`** = the one number printed on pink,
`.pp-bar` with `--v`), numbered `ol.pp-steps` with `.pp-n` discs (`.on` = pink), `.pp-count` tags ("6x"),
`ul.pp-zones` (photo zones), `ul.pp-chips` (printed pills; `.key` is pink), `ul.pp-goals` (`.on` pink tick, `.wip`
yellow, `.no` red cross), `.pp-pin` numbered discs and `.pp-tag` / `.pp-pill` callouts on a print, `.pp-cyc` +
`.pp-rail` (process film), `.pp-map` (parts list), `.close-line` (one sentence, its key words in `<b>`, which prints
them on pink).

---

## 3. The figure idiom: a screen print

> Base section 4.0 decides *what* to show and where it lives. This section says *how it is printed*.

### 3.1 The five rules of the print
1. **Two passes, always.** `PP3D.bed` renders the whole scene twice: once with every material overridden to flat
   black, through a camera offset down and right by about 13 px — that is the shadow — and then again in colour with
   the depth buffer cleared. The shadow is pixel-exact and never blurred, because it is ink.
2. **Near-frontal, orthographic.** 18° round and 14° down. A poster faces you. (An assembly manual does not — that is
   Flat-Pack, and the angle is the quickest way to tell the two apart.)
3. **Everything is rounded.** `PP3D.block`, `slab`, `coin`, `pill`, `ball`, `star` — rounded-rect extrusions, capsules
   and discs. The only sharp corner in this look is the one sharp corner on a card, and that is HTML.
4. **Flat fills, one black outline.** `MeshBasicMaterial` and an inverted-hull outline at this look's heavier weight.
   **No lights exist in the scene.** If you are adding a light, you are building the wrong look.
5. **One pink object, and a star at most once per deck.** The sparkle (`PP3D.star`) is punctuation. Used twice it is
   decoration.

### 3.2 The bed
```js
Aura.scene('s3-scene', (ctx) => {                        // ctx: THREE, el (the holder), renderer, width, height, period
  const { THREE } = ctx;
  const S = PP3D.bed(ctx, { target: [0, 1.5, 0], size: 3.6, turn: -18, tilt: 15, shadow: 13 });
  const body = S.add(PP3D.block(THREE, 3.4, 2.4, 0.6, { fill: 'peri' }));     // footprint w x d, height h, base at y = 0
  const core = S.add(PP3D.coin(THREE, 1.0, 0.7, { fill: 'pink' }));           // the ONE pink thing
  core.position.y = 1.3;
  S.add(PP3D.arrow(THREE, [2.6, 3.1, 0], [1.5, 2.3, 0]));                     // the only way this look says "move this"
  S.popApart([core], [0, 1.15, 0]);                      // pop apart with an overshoot, hold, drop back
  PP3D.pins(S, ctx.el, { core: core });                  // .pp-pin / .pp-tag with data-follow="core"
  return S.api({ update(t) { S.turn(t); } });
}, { period: 12 });
```
`size` is the half-height of the view in world units (an orthographic camera has no distance). `sway: 0` gives a
perfectly still print — the right answer for a still slide. `shadow: 0` turns the second pass off; do that only for a
scene that is already one silhouette.

### 3.3 The toolkit (`PP3D.*`)

| call | what it draws |
|---|---|
| `bed(ctx, o)` | the print bed: `add`, `turn(t)`, `popApart(parts, offset, { spin })`, `place`, `api` |
| `part(THREE, geometry, { fill, weight, edgeAngle })` | any geometry as a flat-filled, black-outlined printed part |
| `block / slab / coin / pill / ball` | the rounded forms a poster keeps needing; `block` stands on the ground |
| `star(THREE, points, rOuter, rInner, depth, o)` | the sparkle. Once per deck, on the thing that matters |
| `fill(part, 'pink')` | recolour a part (a step lighting up, a tour arriving) |
| `arrow(THREE, from, to)` | a fat shaft and a fat head: "move this" |
| `line(THREE, pts, { dashed })` | a guide. Use sparingly — this look prefers an arrow |
| `climb(THREE, n, o)` | **S4**: `n` rising blocks, a star on the top; returns `{ group, tops, blocks }` |
| `pair(THREE, a, b, gap)` | **S5**: two objects, whole, side by side, same camera, same scale |
| `pins(S, el, anchors)` | numbered discs and callout cards that follow their part every frame |
| `beats(t, P, n, move)` | the poster's rhythm: `n` states per loop, each **still, then one pop** (overshooting) |
| `easeBack(x)` | the look's easing. `easeBack(0) === 0` and `easeBack(1) === 1`, so a loop stays seamless |

### 3.4 Motion in the print
The pop-apart is the signature loop: parts spring out over the first third of the period with a small overshoot, hold,
and drop back over the last third. It is exactly periodic, so it satisfies the capture contract with nothing extra.
A process film uses `PP3D.beats`: a beat is still, then one thing pops, then it is still again. A climb uses a hop
whose height is `sin(π·k)` — zero at both ends, so the loop never jumps. **Nothing drifts, nothing orbits, nothing
breathes.** Camera sway is ≤ 5° and may be zero.

### 3.5 Fidelity, in this look's terms
Base 4.2 sets the counts. What they mean here:
- **"Surface families"** are the pops plus white: a detailed print uses at least three fills meaningfully (a body
  colour, a context colour, pink for the hero), a showpiece four or more plus a black arrow or guide.
- **"Micro-detail"** is printed detail, not shading: a fastener as a small coin, a seam as a pill, a count tag, a
  numbered disc, a sparkle, a chamfer read as a rounded corner. Three kinds for detailed, five for showpiece.
- **"Grounding"** is a flat block the object stands on, or nothing at all — **never a cast shadow on the floor**,
  because the only shadow in this look is the hard offset copy.
- **Scale cue:** a labelled object of known size beside the subject, or a projected `~100 nm`-style tag. Never a
  made-up lab prop (base 4.0).
- Real counts still rule (base 4.1). A poster is allowed to be bold about proportion and is **not** allowed to be
  wrong about how many there are. **Ask; never invent a count.**

### 3.6 What never to do in Pink Punch
No blur, no gradient, no soft or coloured shadow, no glass, no bevel highlight, no light of any kind, no perspective
camera, no texture image, no photoreal material, no Blender. No second outline weight. No pop colour behind a
sentence. No more than one pink `.em` per headline and no more than one pink object per picture. No label text baked
into WebGL — callouts are HTML (`.pp-pin`, `.pp-tag`, `.pp-pill`).

---

## 3A. The illustration idiom: a screen print, pulled flat

> Base 4.12 and `illustration.md` say what a drawn picture is. This section is only Pink Punch's surface.

A Pink Punch drawing is a **print**: heavy black keyline, flat spot colours, a hard copy of the shape sitting
behind it where the press was out of register, and halftone dots where a tone is needed. Nothing is soft.

| | Pink Punch |
|---|---|
| line | 5 px black (`--line-w`) around **every** shape, closed, even weight |
| fills | hero `--brand` pink, body white, context `--bg-paper`, mark `--pop-yellow`, signal `--signal` red |
| corners | 48 px, and the look's one sharp corner where a card shape is used |
| lift | the hard offset copy, 8 px right and down, pure black, **never blurred** (`F.part` draws it) |
| labels | Work Sans at 36 px; captions and dimensions at 28 px |
| notation | arrows in black with the same 5 px weight; a field or a flow in a pop colour at full strength, never faded |
| texture | halftone dots over a context shape — the look's one tone. `F.part({ role: 'context' })` applies it |

1. **Spot colours, not shades.** Every fill is one of the pops at full strength. No tint, no gradient, no
   opacity below 1 except the halftone. A thing that needs "a bit lighter" becomes white with a keyline.
2. **One pink.** Pink is the voice: the hero part and nothing else. Yellow, teal, periwinkle and orange are for
   the rest of the drawing, and red is reserved for the one thing that goes wrong.
3. **The print still obeys the object.** Loud surface, real structure: the counts, the pitch and the order of
   parts are the real ones (base 4.10). A print is a style of ink, not a licence to draw a cartoon.
4. **Fewer parts, fatter parts.** A 5 px keyline swallows anything thinner than about 24 px, so a dense
   fine-detail section — a stack of nine fins, a row of twenty teeth — comes out as a grey mat in this look.
   Draw fewer of them, larger, or magnify the detail; a section that needs that density belongs in Bold Blue or
   Flat-Pack.
5. **Never** a blurred shadow, a gradient, a glow, a thin line, an open shape, type over a pop colour at caption
   size, or a pop colour as a field behind words.

---

## 4. The chart idiom (`PPChart.bar` first, `PPChart.line` for a trend)

**A bar chart is this look's native figure** and the first thing to reach for: chunky outlined blocks with a hard black
copy behind each one, the value printed on top in Anton, every block measured from one fat black baseline.
`PPChart.bar` **refuses a non-zero `y.min`** — a truncated bar axis lies about the ratio the chart exists to show, and
that is not a style question (base 5.1, base 6).

`PPChart.line` is for a trend over time: an 8 px stroke with its own black copy 6 px behind it, direct end labels in
printed pills, **no legend**, a dotted grid, fat black axes with solid triangular heads, optional dashed step lines, a
flat **pink** band for the region the slide is about, and one marked moment as a printed pink pill with a dashed drop
line. Series colours: ink `#000000`, then pink `#FF90E8`, then teal `#23A094`; never more than three.

```js
PPChart.bar('#s8-chart', {
  y: { min: 0, max: 100, ticks: [0, 50, 100], title: 'load held, kg' },   // y.min must be 0
  bars: [{ name: 'before', value: 48, color: '#FFFFFF' }, { name: 'after', value: 91, color: '#FF90E8' }],
  unit: 'kg',
  source: 'Source: Author et al., Journal 2021, Table 2',    // real data always carries its source
  // illustrative: true                                       // no data: shapes, labelled, no y numbers
});
```

---

## 5. The voice, in this look

The base's voice rules apply and Pink Punch sharpens them: **say the blunt thing, then stop.** Gumroad's own copy is
"Go from 0 to $1" and "Sell anything" — four words, no adjectives, no hedge. Headlines are 3–6 words. A caption is a
noun phrase. Numbers are written the short way. **No exclamation marks** — the look is already loud, and an exclamation
mark on top of it reads as a shout rather than confidence.

| do | don't |
|---|---|
| Four parts, **one job** | The System Architecture and Its Components |
| Same job, **half the parts** | A Comparison of the Original and Revised Designs |
| One block **beats the rest** | Results: Comparative Load Capacity by Configuration |
| It costs **nothing extra** | The proposed approach is highly cost-effective! |

---

## 6. Before the checker (Pink Punch's own lines)

The full pre-flight list is in the base, section 10. On top of it:

- [ ] `#F4F4F0` paper on every slide; `#FFFFFF` only as a card, chip, tag or callout. No blur, no gradient, no soft
      shadow anywhere — every shadow is a solid black offset copy.
- [ ] One outline weight on every border, bar, pill and drawn edge. Cards have exactly one sharp corner.
- [ ] Anton and Work Sans only. Sizes from the scale in `hard-rules.json`; the caption size only in the footer, page
      number, captions, count tags and the chart's step labels, bar names and event badge.
- [ ] Exactly one pink `.em` per headline, and exactly one pink object per picture. Pops appear only inside drawings,
      charts and count tags — never behind a sentence.
- [ ] Every 3D scene: `PP3D.bed`, orthographic, near-frontal, no lights, every solid rounded and outlined, the
      two-pass print on.
- [ ] No `scene.py` anywhere: this look does not use Blender.
- [ ] Sequences are drawn with `PP3D.climb`; comparisons with `PP3D.pair`.
- [ ] A chart is `PPChart.bar` unless the x axis is time; every bar chart starts at zero.
- [ ] Word budgets met. No exclamation marks.
- [ ] Tell the user once that Pink Punch keeps its own colours and type (base section 9).
