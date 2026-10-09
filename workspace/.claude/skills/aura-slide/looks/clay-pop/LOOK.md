# Clay Pop — the brand layer

> **Read `../_shared/LOOK-BASE.md` first.** It holds the structural rules every Lumi look obeys: the slide skeleton,
> the archetype catalogue, the clash matrix, subject-first staging (4.0, including S4 sequences climb and S5
> comparisons side by side), fidelity, the capture contract, data honesty, the writing voice, speaker notes and the
> pre-flight checklist. **This file adds only what makes a deck look like Clay Pop**: palette, type, motion feel and
> figure idiom. The two together override `aura-blend.md`, the form's style answers and `deck-toolkit.md`.
> **Every size, budget and count is in `engine/rules/hard-rules.json` under `looks.clay-pop`** - this file names
> roles, never numbers.

Clay Pop is the **claymation studio**. One cool near-white set, one subject modelled in matte clay under a soft
studio light, its own parts floating beside it as if it had just come apart, and one vibrant orange doing almost all
the work. Its promise to the audience is that the thing is *touchable*: chunky, bevelled, lit, real enough to pick up.

It is subject-free. Clay can model a gearbox, a protein, a supply chain or a proof - the subject is always the
person's own, with its real parts and real counts. Aesthetic DNA: `../../brands/clay-pop/brand-style.md`.

Files you will use (all under `.aura/engine/deck/`):

| file | what it gives you |
|---|---|
| `themes/clay-pop.css` | tokens, type, the 12-column grid, the footer, the clay key, stat pills, beads, label tags, the landing motion |
| `looks/clay-pop/template.html` | the starting deck (title + closing); `new_deck.js --theme clay-pop` uses it |
| `looks/clay-pop/archetypes/*.html` | one ready slide per archetype: Read `.aura/engine/deck/looks/clay-pop/archetypes/<name>.html` |
| `looks/clay-pop/clay-pop.js` | page numbers, `CPChart.line`, `CPChart.bars` |
| `looks/clay-pop/cp3d.js` | `CP3D`: the live clay studio - material, chunky shapes, contact shadows, floating satellites, labels |
| `blender/lumi_bpy.py` | the Blender helper; Clay Pop's material is its `clay` preset |
| `runtime.js` (top comment) | the **capture contract**: loop periods, `?capture`, recorded loops, `?still=n` |

**3D engine policy: Clay Pop is a render look, so a STILL figure is a Blender render.** Matte clay with light coming
back out of the surface, soft studio shadows and ambient occlusion in every crease are exactly what Cycles computes
and what a real-time canvas can only imitate. The rule is in code as `form_server.LOOK_3D['clay-pop'] = 'blender'`:
a still 3D slide renders in Blender when Blender is installed, and in live three.js (`CP3D`) when it is not.
**Animated figures, camera tours and timed stories are live `CP3D` - for now.** A per-frame Cycles animation costs
hours for a deck (`docs/cinematic-direction.md` section 1); the baked pipeline that will bring Cycles detail to moving
figures is not finished. Until it is, do not design a Clay Pop slide around a per-frame Cycles animation: a figure
that must move is a `CP3D` scene, and it should still read as the same clay.

---

## 1. Tokens

**The studio.** Every slide is `--bg` `#F0F0F5`: a cool near-white, measured on the reference. It is cool on
purpose - it is what makes the orange look hot. White `#FFFFFF` (`--surface`) only for tiles: a chart card, a label
tag, a process card, a map. A pressed channel (`--groove` `#E3E3EB`) is the track a bar or the rail lies in.
Ink `#15151C` (cool near-black), `#2B2B33` secondary, `#5A5A66` muted, `#6C6C78` labels.

**One primary, as a dominance, not a palette.** Clay orange `--clay` `#FF6A13` does almost all the work: the hero
part, the satellites, the one emphasis key, the one key bar, the one key chip. Its light side goes *yellow*
(`--clay-top` `#FDB23B`), its shadow side goes *red* (`--clay-lo` `#C93A05`) - never toward white or brown; that shift
is what makes it read as lit clay. Black clay `#2A2724`, grey clay `#B9B6B3`, white clay `#F4F2EE` and cream
`#F2C29A` are **punctuation only**: a screen, a key, a cable, a sticker.
- Orange **as text** is rare and always `--clay-ink` `#B93D07` (the bright orange fails contrast on the studio).
- **The emphasis phrase is an orange clay KEY with ink letters** (`.em`): lit from above, pressed into the line. White
  letters on orange fail contrast; the letters are always ink. Exactly one per headline. `.em.text` is orange words
  without the key, for a closing line or a sub-line that must stay quiet.
- **The key takes the START or the END of the headline, never the middle.** The key is a solid block the width of its
  words, so wherever it sits it sets that line's length. At the start or the end it either opens or closes the
  headline and the lines stay even; in the middle it splits the sentence, and the tail that follows wraps to the next
  line with no key on it - two ragged lines with a block floating between them. Measured on a real ten-slide deck:
  seven of eight headlines put the key at an edge and read clean (`Export to / **PowerPoint and PDF**`,
  `**Real 3D** / not clip art`); the one that put it in the middle (`Say what **the talk** is about`) is the one that
  looks broken. If the phrase you want to key is genuinely mid-sentence, rewrite the headline so it moves to an edge -
  `Say what **the talk is about**` - rather than keying it where it falls.
- No second accent colour, ever. A failing thing is shown by *being* the orange part, not by turning red.

**Type.** Plus Jakarta Sans (800 display, 700 labels and numbers, 500 text) and DM Mono (the small retro-terminal
labels: kicker, footer, captions, chart ticks, tag descriptions). Two typefaces, nothing else. Display is tight and
heavy; the mono is spaced and uppercase. Sizes come from the scale in `hard-rules.json`, by role:

| token | used for |
|---|---|
| `--t-close` | the closing word at most; a longer closing message uses `--t-title` |
| `--t-title` | the title slide headline (`.title`) |
| `--t-head` | headlines (`.headline`), big stats (`.cp-stat`), `.big-num` |
| `--t-sub` | medium stats (`.cp-stat.md`), the process card's step name |
| `--t-lead` | sub-lines, step / zone / goal names, `.cp-q` |
| `--t-body` | everything else: body, stat captions, chips, tag titles, map nodes, chart end labels |
| `--t-micro` | **only** in DM Mono: the kicker, footer mark, page number, captions / source lines, tag descriptions, chart ticks and axis titles, the process step counter and rail beads, the title / closing field labels |

**Space.** The base's safe zone, 12 columns with generous gutters. Columns: `.cp-l` 5 + `.cp-r` 7 (default),
`w4 / w8` (chart slides), `w6 / w6`, `w7 / w5` (closing). The title text sits in `.cp-hero` on the left; the figure
owns the right. `.cp-hero` ends exactly where `L.camera(frame_right=True)` starts the subject, so a full-bleed title
render and its headline never meet - do not widen it, and if a title does not fit, shorten it. Every figure stands straight on the studio colour - **never inside a card**, because a Blender render
is composited onto exactly `#F0F0F5` and a card would show its edge.

**Chrome.** Every slide ends with `<footer class="cp-foot">`: an orange bead + a short deck mark (uppercase mono)
left, `<span class="cp-pageno"></span>` right ("03/12"). The kicker is a bead + "NN · TOPIC" in mono
(`.kicker.prompt` swaps the bead for a `>` prompt when the subject is software). The runtime draws an orange
progress pill.

**Motion feel: clay lands.** A part drops a short way and settles with ONE soft squash (`--cp-pop`), staggered:
text lands (`cpLand`), chips, cards and beads squish in (`cpSquish`), the emphasis key presses once (`cpPress`), bars
grow along their groove. **Nothing spins, nothing slides in from off-screen, nothing bounces twice.** Labels that
follow a figure squish through the `scale` property only (`cpSquishScale`), because the figure moves them through
`transform` every frame. In 3D: a locked, slow camera that sways a few degrees per loop; satellites drift and tip and
never land; a part that arrives uses `CP3D.land` (a drop and one squash).

**Word budgets** are hard caps in `hard-rules.json` (`looks.clay-pop.wordBudget`), and the checker counts them. They
are tighter than Bold Blue's: in this look the picture does the explaining. If the words do not fit, the idea becomes
a figure or another slide.
The numbers, copied from `hard-rules.json`: presenter mode title 32, section 10, content 40, quote 24, closing 30, references 140; in document mode a content slide may
hold 80. Scale: **24 / 30 / 40 / 56 / 80 / 120 / 168**.

---

## 2. The archetypes in Clay Pop

The catalogue, the order and the closing-slide rules are in the base, section 2. Clay Pop's layouts and engines:

| # | archetype | main visual | layout | engine |
|---|---|---|---|---|
| 1 | `title-hero` | the subject in clay, full bleed, right of frame | `.cp-hero` text left, figure right | **Blender still** (`cp-full`) |
| 2 | `problem-stats` | the subject with the failing part as THE orange thing | 5 / 7 | **Blender still** |
| 3 | `what-it-is` | the object whole, its parts floating out as satellites | 5 / 7 | **Blender still** |
| 4 | `process-film` | one model, each part landing in turn | stack: head row + wide stage | live `CP3D` (drives the card) |
| 5 | `comparison-twin` | both objects whole, side by side, ONE scene | 5 / 7 | live `CP3D` (or one Blender still with both) |
| 6 | `annotated-photo` | the user's real photo on a clay tile, numbered beads | 5 / 7 | - |
| 7 | `system-tour` | a slow glide from part to part | stack | live `CP3D` (drives the map) |
| 8 | `result-chart` | one FLAT chart on a white tile | 4 / 8 | - |
| 9 | `objectives-tour` | the goals as a clay staircase that climbs (S4) | 5 / 7 | live `CP3D` (drives the checklist) |
| 10 | `closing` | designed per deck, echoing the title figure | one of 4 variants | Blender still or live |

The archetype files ship with live `CP3D` placeholders so every one renders anywhere; each still archetype carries
the one-line swap to its Blender holder at the top of the file.

DOM skeleton shared by every content archetype:

```html
<section class="slide" data-kind="content" data-minutes="1.5" data-title="Short title">
  <div class="safe">
    <div class="cp-main">                                   <!-- or .cp-main.stack with a .cp-head row on top -->
      <div class="cp-l w5"> kicker · headline · companions </div>
      <div class="cp-r w7"><div class="cp-stage"> main visual </div></div>
    </div>
    <footer class="cp-foot"><span class="cp-mark">Deck mark</span><span class="cp-pageno"></span></footer>
  </div>
  <aside class="notes" data-aura-notes> … </aside>
</section>
```

Companion parts: `ul.cp-stats > li` (`.cp-stat`, `.cp-stat.md`, `.cp-bar` with `--v`: a clay pill in a groove;
`.cp-bar.grey` for "the other one"), numbered `ul.cp-steps` with `.cp-n` beads (`.on` = orange), `ul.cp-zones`,
`ul.cp-chips` (`.cp-chip.key` is the orange one), `ul.cp-goals` (`.on` a pressed orange button with a tick, `.wip` a
half-pressed grey one, plain = an empty socket, `.no` an orange cross), `.cp-tag` labels (`.key` = orange) and
`.cp-pill` / `.cp-pill.plain` callouts on a figure, `.cp-pin` numbered beads on a photo, `.cp-cyc` + `.cp-rail`
(process film), `.cp-map` (system map), `.close-line` (one sentence, its key words in `<b>`).

---

## 3. The figure idiom: a claymation set

> Base section 4.0 decides *what* to show and where it lives. This section says *how it is made*.

### 3.1 The six rules - what separates "clay-coloured" from "clay"
1. **One vibrant primary doing almost all the work**, on near-white. Not a palette - a *dominance*. The hero part
   and the satellites are orange; black and grey are punctuation (a screen, a key, a cable), white clay is "the
   rest of the object". If you count three colours fighting for attention, two are wrong.
2. **Chunky, blocky, generously bevelled. No thin parts.** Every edge is rounded wide enough to catch a highlight.
   A part that would be thin in reality (a wire, a blade, a membrane) is modelled thick and says so in the notes.
   **Thick, never fewer or wider apart** (LOOK-BASE 4.10): thickening keeps the real count and the real pitch, and
   leaves at least half of each real gap open, so a fin pack still reads as a fin pack and air still has its passage.
   Write the liberty in `L.real(..., liberties=)`. Satellites (rule 6) are parts of the object, never a stand-in for
   what flows through it: air, heat and current are drawn as notation (arrows, streamlines) in the primary colour.
3. **A soft contact shadow directly under the subject**, grounding it; everything that is not standing on something
   floats, with its own soft shadow far below it.
4. **Micro-detail at the scale of a thumbnail press**: a seam, a screw head, a tiny sticker, a slightly wrong key,
   the grain of the clay itself. Detail is small and tactile, never a texture image.
5. **Exactly ONE wink of personality per figure, never two.** A plaster stuck on a corner, a crooked sticker, a
   key that is pressed when the others are not. The joke works only because nothing else is joking. **This is the
   rule most likely to be broken** - the second wink turns the look into a toy shop. If in doubt, no wink: the
   figure is still right without one.
6. **Floating satellite elements repeat the primary colour** and read as ONE object that came apart: its own lens
   elements, its own keys, its own lid - pulled out along the axis they came out of. Never decorative confetti and
   never a part the subject does not have.

And the light, which never changes: **a warm key from the upper LEFT**, a cool, weak fill from the right, a bright
overhead softbox; top faces go warm-yellow, undersides go cool, creases go dark.

### 3.2 The material
- **Clay, not plastic.** High roughness, **no clearcoat**, a small amount of light going into the surface and coming
  back out tinted to the hue (subsurface), a soft sheen at grazing angles, and a fine thumbed bump. The small, crisp
  highlights come from the light and the bevel, never from gloss.
- In Blender it is `L.mat('clay', color='#hex')` (the preset carries all of the above; edge wear is never on - clay
  is soft, not scuffed). Live it is `CP3D.clay(THREE, 'clay' | 'black' | 'grey' | 'white' | 'cream' | '#hex')`,
  which every `CP3D` shape uses by default.
- Glass is allowed where the subject has glass (a lens, a window); metal only where the subject is metal - and then
  still bevelled and chunky. Never more than one non-clay surface family on a figure.

### 3.3 A still, in Blender
Follow `bold-blue/BLENDER.md` (look-neutral: running, the template, inspect, anchors, timings) with these changes to
the SUBJECT block and the two lines around it:

```python
a = L.args(); L.reset(a); L.gpu(a); L.cycles(a.samples, view='Standard')   # Clay Pop's tone map: see below
body = ...; L.bevel(body, <generous>, 8)                 # every part: a wide bevel, smooth (L.smooth)
L.assign(body, L.mat('clay', color='#FF6A13'))           # punctuation: '#2A2724' black, '#B9B6B3' grey, '#F4F2EE' white
L.studio(fit=parts, bg='#F0F0F5', wear=0)                # the studio colour; no edge wear on clay
L.camera(parts, view='three-quarter', frame_right=True)  # 'hero' for the title; vary the view slide to slide
L.render(a.out)
```

- **Tone map: `Standard`, not AgX.** AgX is built to desaturate bright colour, and the orange comes out salmon (tried
  and looked at, with three AgX looks and Khronos Neutral, see `docs/REGISTER-CLAY.md`). `Standard` keeps the orange
  hot and lets its lit side drift to yellow, as the reference does. Clay is matte, so Standard's clipping of bright
  highlights does not bite.
- **Holder:** `<div class="bb-blender cp-3d" data-blender="<slide id>" data-kind="still" role="img" aria-label="...">`
  inside `.cp-stage` (`cp-full` instead of `cp-3d` for the full-bleed title). Leave it empty: Lumi fills it.
- **Labels:** `L.anchor('name', part)` in the scene, and `<div class="cp-tag" data-anchor="name"><b>..</b><span>..</span></div>`
  inside the holder.
- **Judge the material on a full render, never on a `--preview`.** At preview samples the subsurface and the grain
  are noise. The preview is for composition.

### 3.4 Moving, live (`CP3D`)
```js
Aura.scene('s3-scene', (ctx) => {                        // ctx: THREE, el (the holder), renderer, width, height, period
  const { THREE } = ctx;
  const S = CP3D.studio(ctx, { target: [0, 1, 0], distance: 10 });          // shadow floor, softbox, warm key upper left
  const body = S.add(CP3D.block(THREE, 2.4, 1.6, 1.4, { color: 'clay' })); body.position.y = 0.8;
  S.contact(body, 1.6);                                                     // the soft shadow it sits in
  const lid = S.add(CP3D.puck(THREE, 0.6, 0.3, { color: 'black' })); lid.position.set(0, 2.4, 0);
  S.float(lid, { amp: 0.1 });                                               // a satellite: it drifts, never lands
  CP3D.tags(S, ctx.el, { lid: lid });                                       // .cp-tag with data-follow="lid"
  return S.api({ update(t) { S.sway(t); } });
}, { period: 12 });
```

| call | what it makes |
|---|---|
| `studio(ctx, o)` | the clay set: `add`, `sway(t)`, `contact(obj, r)`, `float(obj, o)`, `place`, `api`; `floor: 'none'` for a floating subject; `shift` moves the subject off centre |
| `clay(THREE, color, o)` | the clay material (cached per colour) |
| `block / puck / ball / pill / ring / cable / part` | chunky shapes, generously rounded, in clay; `cable` is a soft tube along points |
| `climb(THREE, n, o)` | **S4**: clay blocks rising left to right, the goal block orange; `{ group, tops, blocks }` |
| `pair(THREE, a, b, gap)` | **S5**: two objects, whole, side by side, one light, one scale |
| `tags(S, el, anchors)` | labels inside the holder that follow their part every frame. **Never over the figure** (LOOK-BASE 4.4): each lands in clear space with a leader back to the part |
| `steps(t, P, n, move)` / `land(k)` | the rhythm: a state holds, then one part moves; a part arriving drops and squashes once |

Crease AO comes from the shared post stack when `engine/deck/lib/post-policy.js` registers Clay Pop. Never post on a
slide that carries measured values (base 4.7).

### 3.5 Fidelity, in this look's terms
Base 4.2 sets the counts. What they mean here:
- **"Surface families"**: the clay colours count as ONE family. A second family is a genuinely different material
  the subject has (glass, rubber, metal). Detailed figures reach the count through the subject's real materials,
  never by inventing one.
- **"Micro-detail"**: seams, screw heads, buttons, a sticker, a grille, a cable, the clay grain - three kinds for
  detailed, five for showpiece. Bevels alone do not count; in this look every part has them.
- **"Grounding"**: the contact shadow under the subject; floating parts get their own soft shadow far below.
- **Scale cue:** a projected `~40 mm`-style tag, or a known object modelled in the same clay (a coin, a hand).
- **Real counts** (base 4.1): clay rounds edges, it never rounds numbers. Six keys means six clay keys. Ask, never
  invent.

### 3.6 What never to do in Clay Pop
No thin parts. No gloss, no clearcoat, no chrome-mirror finish. No second wink. No second accent colour. No
confetti satellites that are not the subject's own parts. No texture image, no stock or generated picture, no
outline pen (that is Flat-Pack). No figure inside a card. No meaningful text baked into a render or a canvas - labels
are HTML (`.cp-tag`). No per-frame Cycles animation until the bake path ships. No white letters on orange.

---

## 3A. The illustration idiom: the clay set, seen flat on

> Base 4.12 and `illustration.md` say what a drawn picture is. This section is only Clay Pop's surface.

A Clay Pop drawing is the same set as its renders, photographed straight on: **lit clay on a cool studio tile**.
It is flat only in projection — every solid still has a light side and a shadow side, from the one upper-left key.

| | Clay Pop |
|---|---|
| line | none. Clay has no keyline; a form is read from its light |
| fills | hero and signal take the clay gradient (`--clay-hi` → `--clay` → `--clay-lo`, top to bottom); body white tile, context `--groove`, mark `--clay-top` |
| corners | 28 px, 16 px on a small part. Nothing is sharp; clay cannot be sharp |
| lift | the tile shadow — soft, low, slightly offset down, plus the key shadow under a pressed part |
| labels | Plus Jakarta Sans at 30 px; captions, dimensions and ticks in DM Mono at 24 px |
| notation | a flow or a field is clay in a lighter tone, or a channel pressed into the tile (`--groove`), never a coloured overlay |
| texture | the gradient itself. No dots, no grain, no hatching except a cut surface |

1. **Lit from one place.** Every gradient runs light at the top and `--clay-lo` at the bottom, because one key
   light is above and to the left. Two shapes lit from two directions destroy the set in a single glance.
2. **Pressed, not drawn.** A track, a rail or a slot is a groove in the tile — `role: 'context'` — and the moving
   part sits in it. That is this look's equivalent of a guide line; it does not use dashes.
3. **Orange as text is rare and it is `--clay-ink`**, never `--clay`. Text on a clay part is white and
   `F.text({ on: … })` picks it.
4. **Never** a keyline, a sharp corner, a flat untextured orange, a second light direction, a grey that is not
   `--groove` or `--clay-grey`, or clay used for something that is not a solid.

---

## 4. The chart idiom (`CPChart`)

**Flat, on a white clay tile** (base 5.1: a value read aloud is never read off a 3D picture). The clay lives only in
the details: round heavy strokes, data points as small lit beads, end labels in clay pills, **no legend**. The first
series is the orange one - make it the result the slide is about; then ink, then grey. Ticks and axis titles in
lowercase mono with units; a soft orange wash (`band`) for the region the slide is about; one marked moment
(`event`) as an ink pill. `CPChart.bars` lays clay pills in pressed grooves against one flat value axis: the
length is the value, the light is decoration, and exactly one bar is `key` (orange).

```js
CPChart.line('#s8-chart', {
  x: { min: 0, max: 60, ticks: [0, 20, 40, 60], title: 'time elapsed, min' },
  y: { min: 0, max: 100, ticks: [0, 50, 100], title: 'load held, %' },
  series: [{ name: 'new', points: [[0, 92], …], markers: true }, { name: 'old', points: […] }],
  band: { from: 40, to: 60 }, event: { x: 41, y: 60, label: 'old design lets go' },
  source: 'Source: Author et al., Journal 2021, Fig. 3',     // real data always carries its source
  // illustrative: true                                       // no data: a shape, labelled, no y numbers
});
CPChart.bars('#s8-chart', { bars: [{ name: 'after', value: 72, key: true }, { name: 'before', value: 41 }],
  max: 100, ticks: [0, 50, 100], unit: '%', title: 'share recovered, %', source: '…' });
```

---

## 5. The voice, in this look

The base's voice rules apply, and Clay Pop makes them **warmer and a little cheeky - in the picture, never in the
words.** Headlines are confident and plain; the wink belongs to the figure. Short, concrete, physical words: things
you could hold.

| do | don't |
|---|---|
| Three parts, **one job** | The System Architecture and Its Components |
| Same job, **half the parts** | A Comparison of the Original and Revised Designs |
| Smooth, then **suddenly not** | Results: Load Capacity Over Time (and never "Oops! It broke!") |
| Modelled here, **built there** | Experimental Validation of the Schematic Model |

---

## 6. Before the checker (Clay Pop's own lines)

The full pre-flight list is in the base, section 10. On top of it:

- [ ] The studio colour on every slide; figures straight on it, never in a card; white only for tiles.
- [ ] One orange dominance per slide; black, grey, white and cream only as punctuation. No second accent.
- [ ] Exactly one `.em` clay key per headline, ink letters, **at the start or the end of the headline, never mid-sentence**.
      Orange as text only in `--clay-ink`.
- [ ] Plus Jakarta Sans + DM Mono only; sizes from `hard-rules.json`; the micro size only in DM Mono and only for
      the roles in section 1.
- [ ] Every figure: chunky and bevelled, a contact shadow under it, satellites that are its own parts, **exactly one
      wink or none**.
- [ ] A still is a Blender render (`L.mat('clay')`, `bg='#F0F0F5'`, `wear=0`, `view='Standard'`) when Blender is
      present; anything that moves is `CP3D`, not a per-frame Cycles animation.
- [ ] Sequences with `CP3D.climb`; comparisons with `CP3D.pair` (or both objects in one render).
- [ ] Charts flat on a white tile; the orange series is the result the slide is about.
- [ ] Tell the user once that Clay Pop keeps its own colours and type (base section 9).
