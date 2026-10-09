# Violet Lime — the brand layer

> **Read `../_shared/LOOK-BASE.md` first.** It holds the structural rules every Lumi look obeys: the slide skeleton,
> the archetype catalogue, the clash matrix, subject-first staging (4.0, including S4 sequences climb and S5
> comparisons side by side), fidelity, the capture contract, data honesty, the writing voice, speaker notes and the
> pre-flight checklist. **This file adds only what makes a deck look like Violet Lime**: palette, grounds, geometry,
> type, motion feel and picture idiom. The two together override `aura-blend.md`, the form's style answers and
> `deck-toolkit.md`. **Every size, budget and count is in `engine/rules/hard-rules.json` under `looks.violet-lime`** —
> this file names roles, and quotes those numbers once at the end of section 1.

Violet Lime is the **two-colour pitch deck**. One saturated violet-blue, one acid lime, and nothing else: the ground
alternates between white and full violet slide by slide, everything on it is a rounded rectangle at one radius, and
the lime touches exactly one element per slide. Thin outlined rounded rectangles drift off the canvas edge behind the
content, which is what makes the empty space look designed rather than empty. Its promise to the audience is
**confidence**: a deck that has decided, in two colours, what matters on each slide.

It is subject-free. The violet carries a thermodynamics lecture as readily as a business case — the subject is always
the person's own.

Files you will use (all under `.aura/engine/deck/`):

| file | what it gives you |
| :--- | :--- |
| `themes/violet-lime.css` | tokens, the two grounds, type, the rounded-rectangle kit, frames, plates, pills, dials, the footer, the motion |
| `looks/violet-lime/template.html` | the starting deck (title + closing); `new_deck.js --theme violet-lime` uses it |
| `looks/violet-lime/archetypes/*.html` | one ready slide per archetype: Read `.aura/engine/deck/looks/violet-lime/archetypes/<name>.html` |
| `looks/violet-lime/violet-lime.js` | page numbers, the ground alternation check, `VLChart.line / .bars / .dials / .years` |
| `looks/violet-lime/vl3d.js` | `VL3D`: the flat-solid stage — for the rare 3D slide, not the idiom (section 3.4) |
| `lib/illus.js` | `LumiIllus`: the drawn picture, which in this look is a **first-class** picture, not a fallback (section 3.3) |
| `runtime.js` (top comment) | the **capture contract**: loop periods, `?capture`, recorded loops, `?still=n` |

**3D engine policy: Violet Lime never renders in Blender.** `form_server.LOOK_3D['violet-lime'] = 'threejs'`, so a
3D slide — still or moving — is live `VL3D`. The reason is the look itself: a Cycles render is a photoreal subject
lit on a studio floor, and **the one picture this look never shows is a photoreal render of something nobody
photographed.** Violet Lime's pictures are the person's real photographs, or flat drawn notation; a Blender still
would sit between the two and look like neither. `vl3d.js` exists and exports `window.VL3D` because a 3D slide must
always resolve to an engine, and it draws flat violet-and-lime solids on no floor — but reach for section 3.3's
drawing first. Violet Lime is **not registered** in `engine/deck/lib/post-policy.js`, so it gets no post at all:
there is no photographic depth here to deepen, and bloom on a flat fill is a mistake, not a style.

---

## 1. Tokens

**Two colours, and that is the whole discipline.**

| role | token | value | job |
| :--- | :--- | :--- | :--- |
| violet | `--violet` | `#3D2EE6` | the ground on half the slides; the headline colour on the other half |
| lime | `--lime` | `#D2F53C` | **one** thing per slide: a CTA pill, one card, one number, one dial segment |
| white | `--white` | `#FFFFFF` | the other ground, and every card surface on violet |
| ink | `--ink` | `#15151A` | body text on white and **all** text on lime |

Supporting tones, which are not a third and fourth colour — they are the four above, thinned: `--muted` `#5A5A66`
(secondary text on white), `--on-violet-muted` `#D4D0F7` (secondary text on violet, 5.2:1), `--hairline` `#E4E3EF`
and `--violet-hair` `rgba(255,255,255,.34)` (the outlined decoration on each ground), `--violet-deep` `#2B1FB0` (a
pressed or recessed surface on violet only).

**The lime never touches more than one element on a slide. Two lime things is a fault**, and it is the rule this
look dies by: the lime stops reading as emphasis the moment there are two of them. On a violet slide it is a single
pill; on a white slide it is a single card, number or bar.

**Ink on lime, never white on lime.** White on `#D2F53C` measures 1.2:1 and is illegible. Ink on lime is 14.6:1.
The reference always puts dark text on the lime and so does this look, without exception.

**Where each colour may be a letter.**
- On white: ink for body, `--violet` for the headline and the one emphasis phrase (7.7:1), `--muted` for captions.
- On violet: white for the headline and body, `--on-violet-muted` for captions, and **lime letters only at 48 px and
  above** (6.2:1) — a dial figure or a big number, never a line of text.
- **Lime is never a letter on white** (1.2:1). A lime thing on a white slide is a *field* — a card, a pill, a bar —
  with ink letters on it.

**The two grounds, alternating.** Eight of the sixteen reference slides sit on white and eight on full violet, in
runs of one or two, and the deck closes on violet. A slide declares its ground with a class on the `<section>`:
`class="slide on-violet"` or nothing for white. This is not decoration — it is what stops a long deck feeling like
one page. **A run of three slides on the same ground is a fault**, and `VL.grounds()` prints it to the console on
load so you catch it before the checker does.

**Geometry: rounded rectangles, at one radius.** `--radius` `24px` for cards, frames, plates and badges; `--radius-s`
`16px` for a small part; `999px` for a pill. Nothing in this look has a sharp corner and nothing has a second radius,
with one exception that is the look's signature: **a picture frame sets one corner to `--radius-s`** (`.vl-frame`
does it on the bottom-left), which is what keeps a rounded rectangle from reading as a blob.

**The outlined decoration** (`.vl-deco`): empty rounded rectangles, 2 px, in the ground's own contrast colour
(`--violet-hair` on violet, `--hairline` on white), bleeding off the canvas edge *behind* the content. Two per slide
at most, never overlapping a text block, never containing anything. They carry no meaning and no text, so the safe
zone does not apply to them — and they are the reason the safe zone stays 96 px for everything that does.

**Type: one typeface.** Plus Jakarta Sans, and nothing else — `maxTypefaces: 1` is a hard error at
`deck_check.js:454`, counted on the **rendered** first family, so name it exactly and never let a fallback render.
800 for display, 700 for labels, numbers and card titles, 500 for body. Display is tight: `letter-spacing: -.035em`,
`line-height: 1.04`. Sizes come from the scale in `hard-rules.json`, by role:

| token | used for |
| :--- | :--- |
| `--t-close` | the closing word at most; a longer closing message uses `--t-title` |
| `--t-title` | the title slide headline (`.title`) |
| `--t-head` | headlines (`.headline`), the big `01 / 02 / 03` numbers, `.big-num` |
| `--t-sub` | stats, the figure inside a dial, the number on a plate |
| `--t-lead` | sub-lines, card titles, step / zone / goal names, `.vl-q` |
| `--t-body` | everything else: body, stat captions, card body, tag titles, map nodes, chart end labels |
| `--t-micro` | **only** the footer mark, the page number, captions / source lines, a tag's description line, chart ticks and axis titles, the year under a year pill, and the title / closing field labels |

**The emphasis phrase takes the START or the END of the headline, never the middle** (the craft note measured across
a real ten-slide deck: seven of eight headlines put it at an edge and read clean; the one in the middle is the one
that looks broken). Exactly one `.em` per headline. On white the `.em` is violet letters; on violet it is lime
letters — and on violet that `.em` **is** the slide's one lime thing, so nothing else on it may be lime.

**On a violet slide whose lime is spent elsewhere, invert the headline instead.** Most violet compositions want
their lime on a stat pill, a dial segment, a lime card or a frame's tab, which would make a lime `.em` the second
lime thing. Add `.inv` to the headline (`class="headline inv"`, and the same on `.title` / `.vl-thanks`): the line
is set in `--on-violet-muted` (5.2:1) and the emphasis phrase is solid white (7.7:1). Still exactly one emphasis,
still exactly one lime thing. Of the five violet archetypes, four invert; only a slide with no other lime element
keeps the lime `.em`.

**Space.** The base's 96 px safe zone, 12 columns. Columns: `.vl-l w6` + `.vl-r w6` (the default split, which is the
reference's own), `w7 / w5` (title), `w5 / w7` (picture-led), `w4 / w8` (chart). The decoration frames sit in a layer
behind everything, outside the safe zone.

**Chrome.** Every slide ends with `<footer class="vl-foot">`: a small rounded square + a short deck mark left,
`<span class="vl-pageno"></span>` right ("03/12"). On violet the footer's ink turns white. The kicker is a small
rounded square + a short uppercase label. The runtime draws a lime progress bar.

**Motion feel: it slides and settles.** A card rises a short way and stops — no bounce, no spin, nothing arriving
from off-screen. The decoration frames draw themselves in (`vlDraw`), cards and plates rise (`vlRise`), pills pop
once (`vlPop`), dials sweep from zero (`vlSweep`), bars grow along their track. **Nothing moves twice.** Labels that
follow a figure move through `scale` only (`vlPopScale`), because the figure moves them through `transform` every
frame.

**Word budgets** are hard caps in `hard-rules.json` (`looks.violet-lime.wordBudget`) and the checker counts them.
The numbers, copied from `hard-rules.json`: presenter mode title 30, section 10, content 44, quote 26, closing 28,
references 140; in document mode a content slide may hold 80. Scale: **24 / 30 / 36 / 48 / 72 / 104 / 144**.

---

## 2. The archetypes in Violet Lime

The catalogue, its ten **file names**, the order and the closing-slide rules are in the base, section 2 — they are
the same ten in every look, so `--snippet <name>` and "Read `archetypes/<name>.html`" work here exactly as they do
elsewhere. What changes is the composition inside each one, and every composition below was measured off the
reference. The second column is the name the reference's own slide goes by; use it when you talk about the slide,
not when you open the file.

| # | archetype (the file) | Violet Lime's composition | ground | main visual |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `title-hero` | **title-split** — headline and a lime CTA pill left, the picture filling the right third | white | picture |
| 2 | `problem-stats` | **numbered-blocks** — big `01 / 02 / 03` blocks, exactly one of them lime | white | text |
| 3 | `what-it-is` | **about-pair** — two frames side by side, one lime stat pill across them | violet | picture |
| 4 | `process-film` | **step-arrows** — three cards with arrows between them, the live one lime | white | picture |
| 5 | `comparison-twin` | **pair-boards** — both objects whole, in two matched frames, one lime tab (S5) | violet | picture |
| 6 | `annotated-photo` | the user's real photograph, lime numbered pins, the zones on the ground | white | photo |
| 7 | `system-tour` | **service-stack** — labelled cards stacked left, the picture right, the visited card lime | violet | picture |
| 8 | `result-chart` | **dial-row** — three donut dials with a figure in each, one lime segment | violet | chart |
| 9 | `objectives-tour` | **year-line** — a horizontal run of year pills, notes above and below, lit in step (S4) | white | text |
| 10 | `closing` | **closing-thanks** — the picture, a lime tab, the thanks and the names | violet | picture |

Default ground sequence for those ten in order: white · white · violet · white · violet · white · violet · violet ·
white · violet — no run of three. When you reorder or drop slides, re-check it; `VL.grounds()` does it for you.

**Two more compositions from the reference that are not archetypes**, because the catalogue is fixed at ten. Build
them as ordinary slides when the talk calls for one, with the classes the theme already carries:

- **`team-grid`** (`ul.vl-people-grid`) — a violet slide holding a grid of portrait-and-name cards. The people
  composition of the reference. It is the one composition that is *only* worth building when the person actually
  supplied portraits; with no photographs it becomes a list of names on a violet ground, which the closing slide
  already does better. Prefer the closing slide.
- **`voices`** (`ul.vl-voices`, `data-kind="quote"`) — a violet slide, the headline left, two or three quote cards
  right, each with a small round portrait. **Never invent a quote or a name** (base section 6). With real quotes and
  no portraits, the round portrait slot becomes a lime initial disc — see section 2A.

DOM skeleton shared by every content archetype:

```html
<section class="slide on-violet" data-kind="content" data-minutes="1.5" data-title="Short title">
  <div class="vl-deco-layer" aria-hidden="true"><i class="vl-deco d1"></i><i class="vl-deco d2"></i></div>
  <div class="safe">
    <div class="vl-main">                                  <!-- or .vl-main.stack with a .vl-head row on top -->
      <div class="vl-l w6"> kicker · headline · companions </div>
      <div class="vl-r w6"> the ONE main visual </div>
    </div>
    <footer class="vl-foot"><span class="vl-mark">Deck mark</span><span class="vl-pageno"></span></footer>
  </div>
  <aside class="notes" data-aura-notes> … </aside>
</section>
```

Companion parts: `ul.vl-stats > li` (`.vl-stat`, `.vl-bar` with `--v`), `ul.vl-blocks` (the big numbered blocks;
`.lime` on exactly one), `ul.vl-cards` (the stacked labelled cards; `.on` is the lime one), `ul.vl-zones`,
`ul.vl-chips` (`.vl-chip.lime` is the one), `ul.vl-goals`, `ul.vl-years` (the year pills), `.vl-tag` labels,
`.vl-pill` / `.vl-pill.lime` callouts, `.vl-pin` numbered pins on a photo, `.vl-map`, `.close-line`.

---

## 2A. The picture, when there is no photograph — read this before you build anything

Twelve of the sixteen reference slides carry a photograph, so this is the look's defining question, and it is the
**common case, not the edge case**: a person can finish the whole interview without putting one image in
`Images and photos`.

**The rule it must not break** is base section 6: *ask the user every time a slide wants a photo; never stand in a
stock, generated or placeholder picture.* That rule is right. There is no stock library here, Lumi has no image
model, and a grey box captioned "image" is worse than nothing.

### The frame is the constant; what fills it has three forms

Every picture in this look lives in the same element — `<figure class="vl-frame">`, a rounded rectangle with one
corner at the small radius. **The frame never changes size, position or role**, so the slide's composition is
identical whichever form fills it. That is the whole trick: there is no hole to fill, because the layout was never
built around the photograph.

| form | what it is | when |
| :--- | :--- | :--- |
| **1. the photograph** | a `.vl-frame` holding an `img` whose src is `assets/<their file>` | the person gave a photograph **for this slide** |
| **2. the drawing** | `<figure class="vl-frame is-drawn">` holding a `LumiIllus` figure or a `VL3D` scene | the slide is about a **thing** — an object, a mechanism, a system, a quantity |
| **3. the plate** | `<figure class="vl-frame is-plate">` — a solid field carrying the slide's one number or phrase | the slide is about **people, an occasion, a place or a feeling**: the things Lumi must never invent |

**Form 2 is not a fallback and it is not second best.** It is what the other seven looks do on every slide, and
`hard-rules.json → pictureMix` expects roughly a third of any deck's pictures to be drawn whatever the look. A
Violet Lime frame holding a flat drawing of the real object — real counts, real proportions, notation not cartoon
(base 4.10 and 4.12) — is a Violet Lime picture, not a stand-in for one. **Reach for it before the plate.** The
plate exists for the slides where there is genuinely nothing honest to draw.

**Form 3, the plate, is a deliberate composition.** The violet ground, the lime accent and the rounded geometry are
strong enough to carry a slide on their own, and the plate is where that is proved:

- It is a **solid field on the opposite ground** — a violet plate on a white slide, a white plate on a violet slide —
  at the frame's own radius, with the same one corner squared off.
- It carries **one number and at most six words**, at `--t-sub` and `--t-body`. Not a caption describing a missing
  picture: the slide's actual figure, the one the presenter will say out loud.
- If the slide has no number, it carries **one short phrase** at `--t-lead` and nothing else.
- **At most one plate on a slide may be the lime one**, and then it is that slide's lime thing.
- A plate never carries an icon, a silhouette, a texture, a gradient, or the words "image", "photo" or "placeholder".

```html
<!-- no photograph for this slide: the frame becomes a plate. NOT a placeholder - the slide's own number. -->
<figure class="vl-frame is-plate lime">
  <p class="vl-plate-num" data-edit="s3-6">68%</p>
  <p class="vl-plate-cap" data-edit="s3-7">leaves through the fins</p>
</figure>
```

### Decide once, per slide, and never half-way

**A slide with three frames and one photograph is the worst outcome this look can produce** — it reads as a deck
that ran out of pictures. So the decision is made per slide, for all of that slide's frames at once:

1. Count the photographs the person actually gave, and read what each one is of.
2. Allocate them to **whole slides**, in story order: the title slide first, the closing second, then the slides
   whose subject the photograph actually shows. A photograph goes on a slide only if it is *of* that slide.
3. Every slide that did not get photographs for **all** of its frames uses form 2 or form 3 for **all** of them.
4. Never mix a photograph and a plate inside one slide. A photograph beside a *drawing* is also a mix — and it is
   two main visuals, which `deck_check.js:373` fails outright.

**Several frames on one slide are ONE main visual.** Wrap them in a group so the checker counts them once:
`<div class="vl-pics" data-visual="photo">` around the frames (the group is `display: contents`, so it changes no
layout). Without it, two `<img>` larger than 15 % of the slide each count as a photo and the slide errors with *2
main visuals*. A group of drawn frames uses `data-visual="diagram"`. A group of plates declares **nothing** — a
plate is type on a colour field, so a slide whose frames are all plates is a **text-only** slide in the clash
matrix, and it keeps to text-only's companions (one big claim; the numbered blocks and the year line are built this
way by design).

### Say it out loud, early

A look that depends on photographs must make that need visible at the start, not discover it at slide 7. So:

- **In the first build question of a Violet Lime deck, ask for photographs by name** — "Violet Lime puts your own
  photographs in a rounded frame on about half the slides. Anything you have of the real thing — the rig, the site,
  the team, the screen — put it in `Images and photos` now; without them these slides carry drawings and colour
  plates instead, which is a different deck, and a good one, but a different one." Ask once, early, and then build
  what you were given without asking again.
- Tell the person which slides got photographs and which got plates, in the same message that delivers the deck.
- **Never hold the deck waiting for a photograph.** A complete all-plate deck now beats a half-built deck later.

---

## 3. The picture idiom

> Base section 4.0 decides *what* to show and where it lives. This section says *how it is made here*.

### 3.1 The frame — four rules
1. **Every picture is in a frame, and every frame is the same rounded rectangle**, with the bottom-left corner at
   `--radius-s`. A picture outside a frame, or a second radius, breaks the look faster than a wrong colour.
2. **The frame crops; it never letterboxes.** `object-fit: cover`. A photograph that will not take the crop gets a
   different frame shape from the composition, not a grey bar.
3. **One frame may carry one lime tab** (`.vl-frame > .vl-tab`), a small pill laid across a corner — and then it is
   the slide's lime thing.
4. **No shadow, no border, no gradient, no filter on a frame.** The look is flat. Depth comes from the ground
   changing colour, not from lifting things off it.

### 3.2 Photographs
The person's own, and nothing else. Keep the full image: no duotone, no violet wash, no black-and-white conversion —
this look does not pretend a photograph is part of its palette, it sets a real photograph *against* two flat
colours, which is exactly why the pairing works. Caption who took it, where and when, in `--t-micro`.

### 3.3 The drawing (`LumiIllus`) — this look's second real picture
Base 4.12 is the whole of it: inline SVG written in code, still, the real object with its real counts and real
proportions, notation never cartoon, every number through `F.value` with a kind, every liberty written down. Violet
Lime's surface over it:

| | Violet Lime |
| :--- | :--- |
| line | 3 px, flat, one weight everywhere. `--ink` on white, `--white` on violet. Round caps, round joins |
| fills | body is the ground's own surface; context is `--hairline` / `--violet-deep`; **the hero part is the one lime fill**, and there is only one |
| corners | `--radius-s` on a part, `--radius` on a container. A cut face may be square |
| lift | none. Flat on the ground, no shadow |
| labels | Plus Jakarta Sans 700 at 30 px; captions, dimensions and ticks at 24 px |
| notation | arrows, streamlines and dimension lines in the line colour; a field is lime at one opacity step, with its scale |
| texture | none. No dots, no grain, no hatching except a cut surface (lime at 40 %) |

**Everything drawn inside a frame takes the FRAME's contrast colour, not the slide's.** A drawn frame stands on the
opposite ground, so on a white slide the frame is violet and every line, dimension arc, leader, arrow, label and
flow particle inside it is **white**; on a violet slide the frame is white and they are all **ink**. Dark annotation
on the violet frame is the mistake this rule exists to stop - it was the first thing that went wrong on a real deck.
The theme flips `--leader`, `--fg`, `--fg-muted` and `--rule` for you inside `.is-drawn`; a `VL3D` scene must pick
its own colours to match (`'white'` on a violet frame), and the figure still carries **no lime** unless the lime has
not been spent elsewhere on the slide.

**The drawing sits inside a `.vl-frame.is-drawn`**, on the opposite ground from the slide — so a drawing on a white
slide is white-on-violet inside its frame, and the frame keeps the picture reading as a picture.

### 3.4 Moving, live (`VL3D`) — for the rare 3D slide
Flat solids, no floor, no reflections: the same two colours as everything else, shaded only enough to read as
volume. Use it when the subject genuinely has to turn or come apart; otherwise 3.3's drawing is the better picture
in this look.

```js
Aura.scene('s5-scene', (ctx) => {
  const { THREE } = ctx;
  const S = VL3D.stage(ctx, { target: [0, 0.9, 0], distance: 9 });     // no floor, flat key, no shadow catcher
  const body = S.add(VL3D.block(THREE, 2.4, 1.6, 1.4, { color: 'white' })); body.position.y = 0.8;
  const hero = S.add(VL3D.puck(THREE, 0.5, 0.3, { color: 'lime' }));   // the ONE lime part
  hero.position.set(0, 1.9, 0);
  VL3D.tags(S, ctx.el, { hero: hero });                                 // .vl-tag with data-follow="hero"
  return S.api({ update(t) { S.turn(t); } });
}, { period: 12 });
```

| call | what it makes |
| :--- | :--- |
| `stage(ctx, o)` | the flat set: `add`, `turn(t)`, `sway(t)`, `float(obj, o)`, `place`, `api`. No floor and no shadows by design |
| `flat(THREE, color, o)` | the material (cached per colour): `violet`, `lime`, `white`, `ink`, `deep` |
| `block / puck / ball / pill / ring / cable / part` | rounded solids in the look's colours |
| `climb(THREE, n, o)` | **S4**: blocks rising left to right, the goal block lime |
| `pair(THREE, a, b, gap)` | **S5**: two objects, whole, side by side, one light, one scale |
| `tags(S, el, anchors)` | labels inside the holder that follow their part. **Never over the figure** (base 4.4) |

Every scene is a pure function of `t` and closes its loop (base 4.3). Exactly **one** lime part per figure.

### 3.5 Fidelity, in this look's terms
Base 4.2 sets the counts. Here: "surface families" are the look's flat colours, which count as **one** — a second
family is a genuinely different material the subject has, shown as a different drawn treatment (a cut face, a
hatch), never as a new hue. "Micro-detail" is drawn detail: fasteners, seams, dimension lines, a scale tag, a
section cut — three kinds for detailed, five for showpiece. "Grounding" is whatever the subject really sits on,
drawn as a line, not a shadow. Real counts, always: the lime rounds corners, it never rounds numbers.

### 3.6 What never to do in Violet Lime
No stock, generated or placeholder picture — ever, under any pressure (section 2A). No second accent colour. No two
lime things on one slide. No white text on lime. No lime text on white. No sharp corner, no second radius, no
shadow, no gradient, no filter, no texture. No picture outside a frame. No photograph recoloured to match the
palette. No Blender render. No three slides in a row on the same ground. No meaningful text baked into a canvas or
a render — labels are HTML (`.vl-tag`). No decoration frame that overlaps a text block or contains anything.

---

## 4. The chart idiom (`VLChart`)

**Flat and real, on the ground's own surface** (base 5.1: a value read aloud is never read off a 3D picture). No
card, no shadow, no gradient, no legend. The lime marks the **one** series, bar or segment the slide is about; every
other mark is ink on white, or white on violet.

```js
VLChart.dials('#s8-chart', {                      // the reference's donut row: the look's signature chart
  dials: [{ value: 77, label: 'held at load', key: true }, { value: 94, label: 'recovered' }, { value: 24, label: 'lost' }],
  unit: '%', source: 'Source: Author et al., Journal 2021, Fig. 3',
});
VLChart.years('#s9-line', {                       // the horizontal year line: pills, notes above and below
  years: [{ year: '2019', note: 'first rig', side: 'up' }, { year: '2022', note: 'field trial', side: 'down', key: true }],
});
VLChart.line('#s8-chart', {
  x: { min: 0, max: 60, ticks: [0, 20, 40, 60], title: 'time elapsed, min' },
  y: { min: 0, max: 100, ticks: [0, 50, 100], title: 'load held, %' },
  series: [{ name: 'new', points: [[0, 92]], markers: true }, { name: 'old', points: [[0, 40]] }],
  source: 'Source: …',                            // real data always carries its source
  // illustrative: true                            // no data: a shape, labelled, no y numbers
});
VLChart.bars('#s8-chart', { bars: [{ name: 'after', value: 72, key: true }, { name: 'before', value: 41 }],
  max: 100, ticks: [0, 50, 100], unit: '%', title: 'share recovered, %', source: '…' });
```

Exactly one `key: true` per chart — it is the slide's lime thing, so nothing else on that slide is lime.

---

## 5. The voice, in this look

The base's voice rules apply, and Violet Lime makes them **shorter and more certain**. This is a deck that has
decided. Headlines are claims in 3–9 words with the emphasis at an edge; no hedging, no questions as headlines, no
exclamation marks. The confidence is in the words and the colour, never in adjectives.

| do | don't |
| :--- | :--- |
| Two colours, **one decision** | A Discussion of Our Visual Approach |
| Heat has **outrun the old fix** | An Overview of Thermal Management Challenges |
| Four goals, **three delivered** | Project Objectives and Current Status Update |
| Same job, **half the parts** | A Comparison of the Original and Revised Designs |

---

## 6. Before the checker (Violet Lime's own lines)

The full pre-flight list is in the base, section 10. On top of it:

- [ ] **Exactly one lime thing per slide.** Count it. Two is a fault, and it is the one you will break.
- [ ] **No white text on lime, no lime text on white**, and lime letters on violet only at 48 px and above.
- [ ] The ground alternates; **no run of three** on the same ground. `VL.grounds()` is clean in the console.
- [ ] Plus Jakarta Sans only (`maxTypefaces: 1`); sizes from `hard-rules.json`; 24 px only for the roles in section 1.
- [ ] Exactly one `.em` per headline, at the **start or the end**, never mid-sentence.
- [ ] Every picture is in a `.vl-frame`; one radius everywhere; one corner squared; no shadow, border or filter.
- [ ] **Every frame on a slide is the same form** — all photographs, all drawings, or all plates. Never a mix (2A).
- [ ] Several frames on one slide are wrapped in `.vl-pics` with one `data-visual`, so the slide has ONE main visual.
- [ ] **No placeholder picture anywhere**, and no plate that names a missing one.
- [ ] You asked for photographs in the first build question, and said which slides got them.
- [ ] Decoration frames: at most two per slide, behind the content, overlapping no text, containing nothing.
- [ ] Charts flat, no card, no legend, exactly one `key` mark.
- [ ] Tell the user once that Violet Lime keeps its own colours and type (base section 9).
