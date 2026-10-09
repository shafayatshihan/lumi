# Red Gallery — the brand layer

> **Read `../_shared/LOOK-BASE.md` first.** It holds the structural rules every Lumi look obeys: the slide skeleton,
> the archetype catalogue, the clash matrix, subject-first staging (4.0, including S4 sequences climb and S5
> comparisons side by side), fidelity, the capture contract, data honesty, the writing voice, speaker notes and the
> pre-flight checklist. **This file adds only what makes a deck look like Red Gallery**: palette, type, frames, motion
> feel and figure idiom. The two together override `aura-blend.md`, the form's style answers and `deck-toolkit.md`.
> **Every size, budget and count is in `engine/rules/hard-rules.json` under `looks.red-gallery`** - this file names
> roles, never numbers.

Red Gallery is the **exhibition catalogue**. Warm paper, signal-red condensed capitals, and every picture hung as a
black-and-white photograph: a white print border, a soft shadow, and one solid red block offset behind a corner. A thin
strip runs down the left edge with the deck's name turned on its side; a red badge in the lower right carries the page.
Its promise to the audience is that the subject has been *curated*: chosen, framed, and given room.

It is subject-free. A print can show a gearbox, a protein, a supply chain or a proof - the subject is always the
person's own, with its real parts and real counts.

Files you will use (all under `.aura/engine/deck/`):

| file | what it gives you |
|---|---|
| `themes/red-gallery.css` | tokens, type, the 12-column grid, the strip footer, the page badge, the print frame (`.rg-stage`), stat stack, labels, the dark band, the motion |
| `looks/red-gallery/template.html` | the starting deck (cover + closing); `new_deck.js --theme red-gallery` uses it |
| `looks/red-gallery/archetypes/*.html` | one ready slide per archetype: Read `.aura/engine/deck/looks/red-gallery/archetypes/<name>.html` |
| `looks/red-gallery/red-gallery.js` | page badge numbers, `RGChart.line`, `RGChart.bars` |
| `looks/red-gallery/rg3d.js` | `RG3D`: the live gallery studio - monochrome materials, neutral light, contact shadows, satellites, labels |
| `runtime.js` (top comment) | the **capture contract**: loop periods, `?capture`, recorded loops, `?still=n` |

**3D engine policy: Red Gallery is a live three.js look and never uses Blender.** The rule is in code as
`form_server.LOOK_3D['red-gallery'] = 'threejs'`. What makes a picture read as a photograph here is the frame, the
crop and the monochrome, not the renderer: a Cycles render would cost minutes a slide and look the same once it is
grey and framed. Every 3D slide, still or moving, is an `RG3D` scene inside a `.rg-stage` print.

---

## 1. Tokens

**The page.** Every slide is `--bg` `#ECEBE4`: warm paper. The strip is a lighter paper (`--strip` `#F6F5F0`) with a
hairline on its right. White `#FFFFFF` (`--surface`) only for the print border, a chart print, a label tag, a map.
Ink `#111111`, `#2A2A2A` secondary, `#555555` muted, `#66645F` labels. The dark band (`--band` `#1A1A1A`) appears
once, under a process film.

**One red, and it owns the type.** Signal red `--red` `#E31B23` is the colour of every headline and title, the block
behind every print, the page badge, the key label, the key bar, the key chart series. Nothing else is coloured.
- Red at display sizes only. `--red` on the page is 3.95:1: it passes as large text and fails as body text. **Red as
  small text is `--red-ink` `#B5121B`** (the strip label, a `close-line` key word, the visited goal).
- **White on red** for the badge, the key tag, the key chip, the zone squares (4.7:1). Never ink on red.
- **The emphasis phrase is the same capitals in INK** (`.em`): a red headline with its key words black. Exactly one
  per headline. Put it at the start or the end of the line, so the colour change opens or closes the headline
  rather than breaking it in two.
- No second accent colour, ever. A failing thing is shown by *being* the dark part of the picture, not by turning red.

**Type.** Anton (display: headlines, the title, big numbers, band numbers - **always uppercase**, set tight) and
Poppins (400 text, 600 labels, 700 the bold black sub-head and step names). Two typefaces, nothing else - no mono.
Sizes come from the scale in `hard-rules.json`, by role:

| token | used for |
|---|---|
| `--t-close` | a one-line closing statement (`.rg-thanks`); a longer one uses `--t-title` (`.rg-msg`) |
| `--t-title` | the cover title (`.title`) |
| `--t-head` | headlines (`.headline`), big stats (`.rg-stat`), `.big-num` |
| `--t-sub` | medium stats (`.rg-stat.md`), step numbers (`.rg-n`), the band's numbers |
| `--t-lead` | the bold sub-head under a cover, step / zone / goal names, `.rg-q` |
| `--t-body` | everything else: body, the kicker, stat captions, chips, tag titles, map nodes, chart end labels |
| `--t-micro` | **only** for: the strip (deck mark and label), the page badge, captions / source lines, tag descriptions, chart ticks and axis titles, the title / closing field labels |

**The kicker** is not a small label here: it is the reference's bold black sub-head, Poppins 700 at body size,
directly under the red headline ("The post-war mindset") or above it ("01 · The problem").

**Space.** `.safe` is inset further on the left than the base, because the left 80 px belong to the strip. 12
columns, 48 px gutters: `.rg-l` 5 + `.rg-r` 7 (default), `w4 / w8` (chart slides), `w6 / w6`, `w7 / w5` (closing).
`.rg-main.flip` puts the picture on the left and the words on the right - use it on about one slide in three so the
deck alternates like a catalogue. The cover is `.rg-cover`: print left, title right, the sub-line right-aligned at
the foot.

**The print** (`.rg-stage`). Every picture lives in one: a grey photographic ground, a white border, a soft shadow,
and a red block behind one corner - `.tr` (default), `.tl`, `.bl`, `.br`, or `.bare` for none. The block's offset
stays inside the gutter, so it never reaches a text column; use a bottom corner only when nothing sits under the print
(the cover, a closing) - a source line under a `.bl` print lands on red. Vary the corner from slide to slide; never two
blocks on one slide. The block is decoration and carries no meaning. **Never animate the
`.rg-stage` element itself** (an animated print becomes a stacking context and its block jumps in front of the
picture); the theme fades the picture inside it.

**Chrome.** Every slide ends with the strip footer:
`<footer class="rg-foot" data-nonclaim><span class="rg-mark">Deck mark</span><span class="rg-label">Deck label</span><span class="rg-pageno"></span></footer>`.
The mark (a place, an author, a course) runs up the top of the strip in ink, a small red square follows, then the
label ("Exhibition deck") in red. **Each is at most 3 words and about 22 characters**: at the smallest size the two
together just fit the slide's height, and a longer one runs off the bottom edge and fails the checker. Keep both
identical on every slide; they count toward each slide's words. `red-gallery.js` writes the badge number ("03"). The runtime draws a thin red progress line.

**Motion feel: prints are hung.** Words rise a short way and settle (`rgRise`), a headline first, then its sub-head,
then the list rows in turn; the picture fades up inside its frame (`rgFade`); bars grow along their track; labels fade
in last. **Nothing bounces, nothing spins, nothing slides in from off-screen.** In 3D: a locked, slow camera that
sways a few degrees per loop, like a photographer leaning; satellites drift; a part that arrives uses `RG3D.land`.

**Word budgets** are hard caps in `hard-rules.json` (`looks.red-gallery.wordBudget`), and the checker counts them,
the strip included. In this look the picture does the explaining; if the words do not fit, the idea becomes another
print or another slide.
The numbers, copied from `hard-rules.json`: presenter mode title 34, section 14, content 44, quote 26, closing 32, references 140; in document mode a content slide may
hold 84. Scale: **24 / 30 / 40 / 56 / 88 / 140 / 200**.

---

## 2. The archetypes in Red Gallery

The catalogue, the order and the closing-slide rules are in the base, section 2. Red Gallery's layouts:

| # | archetype | main visual | layout | engine |
|---|---|---|---|---|
| 1 | `title-hero` | the subject as a big print, red block bottom left | `.rg-cover`: print left, red title right, sub-line at the foot | live `RG3D` |
| 2 | `problem-stats` | the subject with the failing part as THE dark thing | 5 / 7 | live `RG3D` |
| 3 | `what-it-is` | the object whole, its parts floating out as satellites | 5 / 7 | live `RG3D` |
| 4 | `process-film` | one model, each part landing in turn | stack: headline, wide print, the dark numbered band | live `RG3D` (drives the band) |
| 5 | `comparison-twin` | both objects whole, side by side, ONE scene | 5 / 7 | live `RG3D` |
| 6 | `annotated-photo` | the user's real photo, printed black and white, red numbered squares | `flip`: photo left | - |
| 7 | `system-tour` | a slow glide from part to part | stack | live `RG3D` (drives the map) |
| 8 | `result-chart` | one FLAT chart on a white print | 4 / 8 | - |
| 9 | `objectives-tour` | the goals as a staircase that climbs (S4) | 5 / 7 | live `RG3D` (drives the checklist) |
| 10 | `closing` | designed per deck; variant A is a big red statement ending on a full stop | one of 4 variants | live `RG3D` |

The reference's collages (three prints in a row, a 2 x 3 wall) are **not** available as several holders: the base
allows ONE main visual per slide. Get the same effect inside one scene - several of the subject's parts spaced on
one floor, or a camera far enough back that the print is a wall of parts - never by adding holders.

DOM skeleton shared by every content archetype:

```html
<section class="slide" data-kind="content" data-minutes="1.5" data-title="Short title">
  <div class="safe">
    <div class="rg-main">                                   <!-- .flip for picture-left; .stack with a .rg-head row -->
      <div class="rg-l w5"> kicker · headline · companions </div>
      <div class="rg-r w7"><div class="rg-stage"> main visual </div></div>
    </div>
    <footer class="rg-foot" data-nonclaim><span class="rg-mark">Deck mark</span><span class="rg-label">Deck label</span><span class="rg-pageno"></span></footer>
  </div>
  <aside class="notes" data-aura-notes> … </aside>
</section>
```

Companion parts: `ul.rg-stats > li` (`.rg-stat`, `.rg-stat.md`, `.rg-bar` with `--v`: a flat red bar on a pale track;
`.rg-bar.grey` for "the other one"), numbered `ul.rg-steps` with `.rg-n` numbers in Anton (`.on` = red), `ul.rg-zones`
(red squares), `ul.rg-chips` (`.rg-chip.key` is the red one), `ul.rg-goals` (`.on` a filled red square with a tick,
`.wip` grey, plain = an empty ink outline, `.no` a red cross), `.rg-tag` labels (`.key` = the reference's red name
tag, white words) and `.rg-pill` / `.rg-pill.plain` callouts on a figure, `.rg-pin` red squares on a photo,
`ol.rg-band` (process film; `--n` = its column count, the `.on` column's number goes red), `.rg-map` (system map),
`.close-line` (one sentence, its key words in `<b>`).

---

## 3. The figure idiom: a black-and-white print

> Base section 4.0 decides *what* to show and where it lives. This section says *how it is made*.

### 3.1 The five rules - what separates "a grey render" from "a gallery photograph"
1. **No hue in the picture, ever.** `RG3D` materials are greys only - `ink` (the hero tone, the default), `black`,
   `graphite`, `grey`, `stone`, `white`. The red belongs to the page, not the print. A coloured part is a bug.
2. **One dark hero against pale surroundings.** The thing the slide is about is the darkest mass in the frame, like
   the brush stroke on the reference's cover; the rest of the object is stone and white. If two masses are equally
   dark, the eye has nowhere to land.
3. **Hard light from one side, deep shadows kept.** A neutral key from the upper left and only a weak fill: a gallery
   photograph keeps its shadow side dark. A contact shadow under everything that stands.
4. **Crop like a photographer.** The subject may run close to the frame edge or be cut by it when its whole shape is
   already known; vary the camera between slides (close, three-quarter, high) inside one world. Never a new world per
   slide.
5. **Satellites are the subject's own parts**, pulled out along the axis they came out of, in a paler grey than the
   hero. Never decorative confetti.

### 3.2 The material
- **Matte plaster and stone**, not plastic: high roughness, no clearcoat, a fine grain bump. `RG3D.clay(THREE, 'ink' |
  'black' | 'graphite' | 'grey' | 'stone' | 'white')`, which every `RG3D` shape uses by default.
- Glass or metal only where the subject has them - and then still grey. Never more than one non-plaster surface
  family on a figure.

### 3.3 Live (`RG3D`)
```js
Aura.scene('s3-scene', (ctx) => {                        // ctx: THREE, el (the holder), renderer, width, height, period
  const { THREE } = ctx;
  const S = RG3D.studio(ctx, { target: [0, 1, 0], distance: 10 });          // shadow floor, neutral key upper left
  const body = S.add(RG3D.block(THREE, 2.4, 1.6, 1.4, { color: 'ink' })); body.position.y = 0.8;
  S.contact(body, 1.6);                                                     // the soft shadow it sits in
  const lid = S.add(RG3D.puck(THREE, 0.6, 0.3, { color: 'stone' })); lid.position.set(0, 2.4, 0);
  S.float(lid, { amp: 0.1 });                                               // a satellite: it drifts, never lands
  RG3D.tags(S, ctx.el, { lid: lid });                                       // .rg-tag with data-follow="lid"
  return S.api({ update(t) { S.sway(t); } });
}, { period: 12 });
```

The holder is `<div class="aura-3d rg-3d" data-scene="…" data-period="…" aria-hidden="true">` inside a
`.rg-stage`. `RG3D` has the same calls as Clay Pop's `CP3D`: `studio` (`add`, `sway`, `contact`, `float`, `place`,
`api`; `floor: 'none'`, `shift`), `clay`, `block / puck / ball / pill / ring / cable / part`, `climb` (**S4**), `pair`
(**S5**), `tags` (labels in clear space with a leader, **never over the figure**, LOOK-BASE 4.4), `steps` / `land`.

### 3.4 Fidelity, in this look's terms
Base 4.2 sets the counts. What they mean here:
- **"Surface families"**: the greys count as ONE family. A second family is a genuinely different material the
  subject has (glass, rubber, metal).
- **"Micro-detail"**: seams, screw heads, buttons, a grille, a cable, an engraved edge - three kinds for detailed,
  five for showpiece.
- **"Grounding"**: the contact shadow; floating parts get their own soft shadow far below.
- **Scale cue:** a `~40 mm`-style tag, or a known object modelled in the same grey (a coin, a hand).
- **Real counts** (base 4.1): six keys means six keys. Ask, never invent.

### 3.5 What never to do in Red Gallery
No colour inside a picture. No picture without its print frame. No second red block on a slide. No red text below
display size except in `--red-ink`. No ink letters on red. No lowercase Anton. No third typeface, no mono. No texture
image, no stock or generated picture. No meaningful text baked into a render or a canvas - labels are HTML (`.rg-tag`).
No Blender: this look is live three.js only. No second main visual to imitate the reference's collages.

---

## 3A. The illustration idiom: the print, drawn

> Base 4.12 and `illustration.md` say what a drawn picture is. This section is only Red Gallery's surface.

A Red Gallery drawing is a **printed plate**: flat ink and greys on white paper, with the red used once.

| | Red Gallery |
|---|---|
| line | a confident ink keyline, 3 px; hairlines in `--hairline` for guides |
| fills | hero `--ink`, body white, context `--groove`, signal `--red` (once per drawing) |
| corners | square. A catalogue plate has no rounded corners |
| lift | none inside the drawing; the plate itself sits in a `.rg-stage` print |
| labels | Poppins at 30 px; captions, dimensions and ticks in Poppins at 24 px |
| notation | arrows and flows in ink; the one thing the slide is about in red |
| texture | none, except hatching on a cut surface |

---

## 4. The chart idiom (`RGChart`)

**Flat, on a white print** (base 5.1: a value read aloud is never read off a 3D picture). Square, printed marks: no
gradients, no rounded bars, **no legend**. The first series is the red one - make it the result the slide is about;
then ink, then grey. End labels sit in flat tags (white words on red for the first series). Ticks and axis titles in
Poppins with units; a pale red wash (`band`) for the region the slide is about; one marked moment (`event`) as an ink
tag. `RGChart.bars` lays flat bars on pale tracks against one flat value axis, and exactly one bar is `key` (red).

```js
RGChart.line('#s8-chart', {
  x: { min: 0, max: 60, ticks: [0, 20, 40, 60], title: 'time elapsed, min' },
  y: { min: 0, max: 100, ticks: [0, 50, 100], title: 'load held, %' },
  series: [{ name: 'new', points: [[0, 92], …], markers: true }, { name: 'old', points: […] }],
  band: { from: 40, to: 60 }, event: { x: 41, y: 60, label: 'old design lets go' },
  source: 'Source: Author et al., Journal 2021, Fig. 3',     // real data always carries its source
  // illustrative: true                                       // no data: a shape, labelled, no y numbers
});
RGChart.bars('#s8-chart', { bars: [{ name: 'after', value: 72, key: true }, { name: 'before', value: 41 }],
  max: 100, ticks: [0, 50, 100], unit: '%', title: 'share recovered, %', source: '…' });
```

---

## 5. The voice, in this look

The base's voice rules apply, and Red Gallery makes them **curatorial: declarative, short, a little grand - never
fussy.** Headlines are statements in capitals, often with a full stop. The sub-head under them says plainly what the
slide is.

| do | don't |
|---|---|
| Three parts, **one job.** | The System Architecture and Its Components |
| **Half the parts.** Same job. | A Comparison of the Original and Revised Designs |
| Unveiling **the result.** | Results: Load Capacity Over Time |
| Modelled here, **built there.** | Experimental Validation of the Schematic Model |

---

## 6. Before the checker (Red Gallery's own lines)

The full pre-flight list is in the base, section 10. On top of it:

- [ ] The paper colour on every slide; the strip footer (mark, label, badge) on every slide, identical text.
- [ ] Headlines red Anton capitals; exactly one ink `.em` phrase, at the start or the end. Red as small text only in
      `--red-ink`; white, never ink, on red.
- [ ] Anton + Poppins only; sizes from `hard-rules.json`; the micro size only for the roles in section 1.
- [ ] Every picture a monochrome `RG3D` scene (or the user's photo) inside a `.rg-stage` / `.rg-photo` print; one
      red block per slide; the corner varies across the deck; the print itself never animated.
- [ ] One dark hero per picture, pale surroundings, shadows kept.
- [ ] Sequences with `RG3D.climb`; comparisons with `RG3D.pair`; collages as ONE scene, never several holders.
- [ ] Charts flat on a white print; the red series is the result the slide is about.
- [ ] Tell the user once that Red Gallery keeps its own colours and type (base section 9).
