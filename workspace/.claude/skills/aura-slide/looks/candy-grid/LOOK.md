# Candy Grid — the brand layer

> **Read `../_shared/LOOK-BASE.md` first.** It holds the structural rules every Lumi look obeys: the slide skeleton,
> the archetype catalogue, the clash matrix, subject-first staging (4.0, including S4 sequences climb and S5
> comparisons side by side), fidelity, the capture contract, data honesty, the writing voice, speaker notes and the
> pre-flight checklist. **This file adds only what makes a deck look like Candy Grid**: its boards, palette, type,
> motion and picture idiom. The two together override `aura-blend.md`, the form's style answers and `deck-toolkit.md`.
> **Every size, budget and count is in `engine/rules/hard-rules.json` under `looks.candy-grid`** - this file names
> roles, never numbers.

Candy Grid is the **creative portfolio**. It does not put a picture beside some words. Every slide is a **board**:
edge-to-edge cells - saturated colour blocks, solid black bars, white text cells - with coloured discs laid across the
seams, little dots, and a white pill tag pinned on a seam. Titles are a few short words in wide-tracked capitals,
stacked, ending on a full stop. The subject appears as glossy, candy-coloured product shots standing on the colour
blocks - one figure, or a collage of the same subject seen from several cameras. Its promise is *energy*: every slide
is a new composition, the way a portfolio turns a page.

It is subject-free: the figures are always the person's own subject, with its real parts and counts.

Files you will use (all under `.aura/engine/deck/`):

| file | what it gives you |
|---|---|
| `themes/candy-grid.css` | tokens, type, the ten boards (`.cg-board.b-*`), cells, discs, dots, the pill footer, stats, labels, the motion |
| `looks/candy-grid/template.html` | the starting deck (cover + closing); `new_deck.js --theme candy-grid` uses it |
| `looks/candy-grid/archetypes/*.html` | one ready board per archetype: Read `.aura/engine/deck/looks/candy-grid/archetypes/<name>.html` |
| `looks/candy-grid/candy-grid.js` | page numbers, `CGChart.line`, `CGChart.bars` |
| `looks/candy-grid/cg3d.js` | `CG3D`: the live product-shot studio - glossy candy materials, bright light, soft short shadows, labels |
| `blender/lumi_bpy.py` | the Blender helper the render collages are made with (section 3.4) |

**3D engine policy: Candy Grid is a live three.js look - `form_server.LOOK_3D['candy-grid'] = 'threejs'` - and adds one
Blender use of its own: the render collage.** Every holder Lumi manages is a live `CG3D` scene; nothing goes through
Lumi's Blender holder pipeline. A collage (section 3.4) is a set of still PNGs that YOU render with Blender from one
`scene.py` into the deck's `assets/` folder, before writing the slide. A figure that moves is always `CG3D`.

---

## 1. Tokens

**The page** is white `#FFFFFF`. The colour lives in the **cells**, never behind small text: yellow `#FFC72C` (the
lead colour), pale yellow `#FFE08A`, orange `#FF8A00`, pink `#F9A8C9`, cyan `#29C4E6`, sky `#9FDDF0`, violet `#9B8CF2`,
and one violet-to-pink gradient (`.grad`) for a closing. **Black bars** `#1F1F23` cut the board - at least one on most
slides. Ink `#1B1B1F`, muted `#5E5E68`.

**One accent is text: rose.** `--rose` `#EC4A7B` is the emphasis phrase (`.em`), the bars in a stat, the first chart
series and the dot in the page pill. Rose at display sizes only (3.6:1 on white); small rose text is `--rose-ink`
`#C2185B`. Exactly one `.em` per headline - normally the last words, carrying the full stop: `Three parts, **one job.**`

**Type.** Poppins only - one typeface, three weights: 700 for the tracked uppercase titles, the stats and the bold
labels; 600 for chips and sub-lines; 400 for text. Sizes come from the scale in `hard-rules.json`, by role:

| token | used for |
|---|---|
| `--t-close` | a one-line closing word; a longer closing uses `--t-title` (`.cg-msg`) |
| `--t-title` | the cover title |
| `--t-head` | headlines, `.big-num` |
| `--t-sub` | stats (`.cg-stat`) |
| `--t-lead` | step / zone / goal names, `.sub`, `.cg-q` |
| `--t-body` | body, the kicker, chips, tag titles, map nodes, step columns, chart end labels |
| `--t-micro` | **only**: the pill footer, captions / source lines, tag descriptions, chart ticks and axis titles, the title / closing field labels |

**Titles are short and stacked.** Wide tracking makes every letter expensive: two to five words, broken onto two to
four lines by the cell's width, ending on a full stop. A title that needs a sentence is a `.lede` under a short title.
**The kicker** is the reference's small bold label with a black cube in front ("Project"), at body size.

**Chrome.** The footer is the floating **pill**: `<footer class="cg-foot" data-nonclaim><span class="cg-mark">Deck
mark</span><span class="cg-pageno"></span></footer>`. Each board pins it on one of its seams. `candy-grid.js` writes
the page number; a rose dot sits in front of it. Keep the mark short and the same on every slide.

**Motion feel: the board assembles.** Colour cells wipe open from the bottom, black bars from the left, discs grow
from their centres, then the title rises, the rows follow in turn, and the pill, the dots and the labels pop on last.
In 3D: a bright product turntable - a slow sway, satellites that drift, `CG3D.land` for a part that arrives.

**Word budgets** are hard caps in `hard-rules.json` (`looks.candy-grid.wordBudget`), and the checker counts them.
The numbers, copied from `hard-rules.json`: presenter mode title 30, section 12, content 42, quote 24, closing 30, references 140; in document mode a content slide may
hold 80. Scale: **24 / 30 / 36 / 48 / 64 / 96 / 132**.

---

## 2. The boards

The catalogue, the order and the closing-slide rules are in the base, section 2. In Candy Grid each archetype has its
own board - **the composition changes on every slide**:

| # | archetype | board | main visual |
|---|---|---|---|
| 1 | `title-hero` | `b-cover`: black bar · the subject on a yellow block · the stacked title on white · an orange and a cyan block; the pill on the centre seam | 3D, or a collage over the yellow, orange and cyan blocks |
| 2 | `problem-stats` | `b-orbit`: title and a ROW of two stats on white · a black circle off the right edge · a pink disc holding the subject | 3D |
| 3 | `what-it-is` | `b-side`: a full-height yellow panel holding the object · a pink disc across its seam · a black seam · title and numbered parts | 3D, or a collage |
| 4 | `process-film` | `b-film`: title top left · three discs (the stations) with ONE model travelling disc to disc · a step column under each · black base | live `CG3D` (drives the columns) |
| 5 | `comparison-twin` | `b-split`: words on white · a black bar with a yellow disc on it · one pink cell holding both objects side by side | 3D, ONE scene (S5) |
| 6 | `annotated-photo` | `b-strips`: black bar · the user's photo full height · zones on white · a sky strip | photo |
| 7 | `system-tour` | `b-mosaic`: one big yellow cell holding the gliding scene, two small colour cells beside it · black seam · the map and the title | live `CG3D` (drives the map) |
| 8 | `result-chart` | `b-chart`: words and chips on white · a white chart card on a full-height yellow cell · black base | chart |
| 9 | `objectives-tour` | `b-tiles`: the checklist · a yellow board of four tiles with a cyan disc in which the goals climb (S4) | live `CG3D` |
| 10 | `closing` | `b-close`: the statement · a black bar · a gradient cell · a disc across the bar holding the subject | 3D |

Board skeleton (every board is the whole slide - `.safe` is the full 1920 x 1080 here; text cells pad themselves):

```html
<section class="slide" data-kind="content" data-minutes="1.5" data-title="Short title">
  <div class="safe">
    <div class="cg-board b-side">
      <div class="cg-cell yellow" style="grid-area:fig"> the figure (holder, or .cg-shot images) </div>
      <div class="cg-cell black" style="grid-area:bar"></div>
      <div class="cg-cell txt" style="grid-area:text"> headline · kicker · companions </div>
    </div>
    <footer class="cg-foot" data-nonclaim><span class="cg-mark">Deck mark</span><span class="cg-pageno"></span></footer>
  </div>
  <aside class="notes" data-aura-notes> … </aside>
</section>
```

Parts: `.cg-cell` (+ `txt` for a padded text cell, + a colour: `yellow yellow-2 orange pink cyan sky violet grad
black`), `.cg-disc` (a circle, same colours, positioned by the board or inline), `.cg-dot` (`.rose`, `.yellow`, plain =
a white ring), `ul.cg-stats` (a row of two; `.col` stacks them; `.cg-bar` with `--v`), `ul.cg-steps` with `.cg-n`,
`ol.cg-cols` (step columns with cube labels; `.on` lights one), `ul.cg-zones`, `ul.cg-chips` (`.key` yellow),
`ul.cg-goals`, `.cg-tag` (white pill; `.key` ink), `.cg-pill`, `.cg-pin`, `.cg-map`, `.cg-chart`, `.close-line`.
A deck may use a board for a slide it was not drawn for, and a slide may move a cell's colour - but never two slides
in a row on the same board, and never a cell colour behind small text.

---

## 3. The picture idiom: candy product shots

> Base section 4.0 decides *what* to show and where it lives. This section says *how it is made*.

### 3.1 The rules
1. **The subject stands on a colour block or a disc**, like a product photographed on seamless paper. The block is
   the backdrop; the figure is a bright, glossy model of the real thing.
2. **A real object keeps its real colours, materials and shading - 80 to 100 % true** (owner's rule, 2026-10-09):
   lab glass is clear glass, steel is steel, straw is straw-gold, a blue bottle cap is blue. Candy colours belong to
   the BOARD (the cells and discs) and to things with no real appearance - a schematic, a staircase of goals, an
   abstract quantity. Molecules use the standard CPK colours (carbon dark grey, oxygen red, hydrogen white).
3. **Colour against colour.** The block behind a figure is chosen to contrast with the figure's true colours (steel and
   glass on yellow, gold straw on cyan); never repaint the object to suit the block. Glass on a transparent render
   reads black - use a thin, mostly see-through glass so the block shows through it, as it would through real glass.
4. **Soft, short shadows** from a high key: the figure sits on its block, it does not float in space - except parts
   pulled out as satellites, which are the subject's own parts.
5. **One world per deck.** Every figure in a deck is the same modelled subject (or its parts), seen differently.

### 3.2 The material and the palette
`CG3D.clay(THREE, name)`: `white` (default), `stone`, `grey`, `ink`, `black`, `graphite`, `yellow`, `orange`, `pink`,
`rose`, `cyan`, `violet`, `mint`, or `'#hex'`. In Blender: `L.mat('plastic', color='#hex')` or `L.mat('paint', ...)`.

### 3.3 Live (`CG3D`)
`CG3D` has the same calls as Clay Pop's `CP3D` and Red Gallery's `RG3D`: `studio` (`add`, `sway`, `contact`, `float`,
`place`, `api`; `floor: 'none'`, `shift`), `clay`, `block / puck / ball / pill / ring / cable / part`, `climb` (**S4**),
`pair` (**S5**), `tags` (labels in clear space with a leader - never over the figure, LOOK-BASE 4.4), `steps` /
`land`. The holder is `<div class="aura-3d cg-3d" data-scene="…" data-period="…" aria-hidden="true">` inside a cell or a
disc; add `.pad` in a full-bleed cell so the labels stay off the slide edge. **A holder with labels sits on ONE
colour**: the label check reads the holder's commonest colour as the background, so a holder spread over two cells (or
a square holder around a disc) makes every label look as if it covers the figure. Inside a disc the holder is
automatically the square inscribed in the circle.

### 3.4 The render collage (Blender)
The reference's signature is **several pictures on one slide**. In Candy Grid that is ONE Blender scene of the
subject, rendered from several cameras - a whole view, a close crop, a high view, a part pulled out - each a
transparent PNG standing in its own colour cell. It is ONE main visual (base section 3): all the images sit in one
`.cg-shots` group, which the checker counts once.

```html
<div class="cg-shots" data-visual="photo" style="display:contents">
  <img class="cg-shot" src="assets/s3/shot-whole.png" alt="The column, whole" style="grid-area:fig">
  <img class="cg-shot" src="assets/s3/shot-top.png" alt="The condenser, from above" style="grid-area:orange">
</div>
```

`display: contents` lets each image take a grid area of the board, on top of that area's colour cell. Write the scene
once with `lumi_bpy` (`L.reset(a, res=(900, 900))`, `L.studio(fit=parts, transparent=True, floor='flat')`), then for each
view `L.camera(parts, azimuth=…, elevation=…, fill=…, frame_right=False)` and `L.render('<deck>/assets/sN/shot-<name>.png')`.
Run it with the Blender Lumi uses: `blender -b --factory-startup -P scene.py -- --out <folder> --samples 48`. About
half a minute per image on a laptop GPU: render a slide's set once, look at them, and only re-render what is wrong.
Two to four images per collage; every image is the deck's own subject - never a stock, generated or placeholder picture.

### 3.5 What never to do in Candy Grid
No picture beside the words in a plain two-column layout - use a board. No two slides in a row on the same board. No
small text on a colour cell. No second accent colour as text. No long titles. No second typeface. No texture image,
no stock or generated picture. No meaningful text baked into a render - labels are HTML. No collage whose images are
different subjects.

---

## 4. The chart idiom (`CGChart`)

**Flat, on a white rounded card floating on a colour cell** (base 5.1). Rounded bars and end tags, **no legend**. The
first series is rose - the result the slide is about; then ink, then grey. `CGChart.line` and `CGChart.bars` take the
same spec as the other looks' charts (`x`, `y`, `series`, `band`, `event`, `source`, `illustrative`; `bars`, `max`,
`ticks`, `unit`, `title`, `source`), and exactly one bar is `key`.

---

## 5. The voice, in this look

The base's voice rules apply, and Candy Grid makes them **short and upbeat**: titles of two to five words ending on a
full stop, a plain sentence under them, nothing grand.

| do | don't |
|---|---|
| Three parts, **one job.** | The System Architecture and Its Components |
| Half the parts. **Same job.** | A Comparison of the Original and Revised Designs |
| Our **results.** | Results: Load Capacity Over Time |

---

## 6. Before the checker (Candy Grid's own lines)

The full pre-flight list is in the base, section 10. On top of it:

- [ ] Every slide is a board; no two slides in a row on the same board; the pill footer on every slide.
- [ ] Titles: two to five tracked words, one rose `.em`, a full stop. Small rose text only in `--rose-ink`.
- [ ] Poppins only; sizes from `hard-rules.json`; the micro size only for the roles in section 1.
- [ ] No small text on a colour cell; colour cells hold figures, discs and charts.
- [ ] Every figure: the deck's own subject, glossy, on its block, a contrasting hero colour.
- [ ] A collage: one Blender scene, two to four views, all inside one `.cg-shots` group.
- [ ] Tell the user once that Candy Grid keeps its own colours and type (base section 9).
