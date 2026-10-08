# Happy Headspace — the brand layer

> **Read `../_shared/LOOK-BASE.md` first.** It holds the structural rules every Lumi look obeys: the slide skeleton,
> the archetype catalogue, the clash matrix, subject-first staging (4.0, including S4 sequences climb and S5
> comparisons side by side), fidelity, the capture contract, data honesty, the writing voice, speaker notes and the
> pre-flight checklist. **This file adds only what makes a deck look like Happy Headspace**: palette, type, motion feel
> and figure idiom. The two together override `aura-blend.md`, the form's style answers and `deck-toolkit.md`.
>
> **Every hard number is in `engine/rules/hard-rules.json` under `looks.happy-headspace`** — the type scale, the text
> floor, the word budgets, the whitespace targets, the typeface count. This file names what each size is *for*; it
> never repeats the value. `deck_check.js` reads that file and nothing else.

Happy Headspace is the **quiet room**. A white page, soft round volumes in warm light, orange first, and nothing in
the whole look with a corner on it. Its promise to the audience is that the talk is not going to rush them: everything
arrives slowly, nothing snaps, and the hardest number on the slide is still said kindly. It is the look to choose when
the subject is difficult and the room needs to stay with you.

It is subject-free. A quiet room can hold a kidney, a reactor, a supply chain or a proof. Brand DNA:
`../../brands/headspace/brand-style.md`.

**No faces and no characters.** Headspace's own illustration is built on a cast of smiling blobs; Lumi decks are
often shown in formal settings, so this look takes the brand's shapes and leaves its cast behind. That is written in
the brand DNA file and it is not a preference.

Files you will use (all under `.aura/engine/deck/`):

| file | what it gives you |
|---|---|
| `themes/happy-headspace.css` | tokens, type, the 12-column grid, the footer, soft discs, round cards, callout tags, breathe-in motion |
| `looks/happy-headspace/template.html` | the starting deck (title + closing); `new_deck.js --theme happy-headspace` uses it |
| `looks/happy-headspace/archetypes/*.html` | one ready slide per archetype: Read `.aura/engine/deck/looks/happy-headspace/archetypes/<name>.html` |
| `looks/happy-headspace/happy-headspace.js` | page numbers, `HSChart.line` |
| `looks/happy-headspace/hs3d.js` | `HS3D`: the quiet room, soft forms, the contact disc, breaths, climbs, pins |
| `runtime.js` (top comment) | the **capture contract**: loop periods, `?capture`, recorded loops, `?still=n` |

**3D engine policy: Happy Headspace never uses Blender, and that is deliberate — not an omission.**
This is the only one of Lumi's three light-and-flat looks that has lights in its scene at all, and that makes the
question a real one. The answer is still three.js. Cycles path tracing (`lumi_bpy`: AgX, soft shadows, PBR materials)
spends its entire budget on contact shadows, specular response and material realism — the three things this look
deliberately removes. A Cycles render here would cost a hundred times more and land further from the brand. So this
look has a full three.js path — `HS3D.room` — and it is the only one. The rule is written in code as
`form_server.LOOK_3D['happy-headspace'] = 'threejs'`, so a 3D slide here always resolves to an engine, and an explicit
`engine: blender` on the plan is downgraded to three.js with the note `look-no-blender` rather than silently leaving
the slide with nothing. **Do not write a `scene.py` for a Happy Headspace deck.**

---

## 1. Tokens

**Page and surfaces.** Background `#FFFFFF` on every slide. `#F9F4F2` warm off-white is the only other surface and it
is what a card, a chip, a track, a map and a soft section are made of; `#FDF8F6` exists for a card inside a card.
Text is warm charcoal `#2D2C2B`, **never pure black** — the brand says so and it is the single quickest way to tell
this look from Pink Punch at a glance. `#44423F` is muted body and label text.

**No outline, no hard shadow, no corner.** Nothing in this look has a border. A shape is defined by its own colour
against the page. The only shadow that exists anywhere is the soft tinted contact disc under a 3D form
(`S.ground()`), and it is part of the picture, not a UI effect. Radius: a card is `--radius: 40px`; a pill, a chip,
a disc, the kicker, a bar and a counter are fully round.

**Orange leads, five colours support.**
- Orange `#FF7300` is the lead: the `.em` squiggle, the hero form, a stat dot, a tick, the progress line, the zone
  discs. **It is never small text** — 2.9:1 on white — and it never carries a sentence. White on orange is fine for
  a short label, and charcoal on orange clears 5:1 at the sizes this look uses.
- `#FFCE00` gold is the kicker pill, the soft wash under an emphasised word, a chip that matters, the moment pill on
  a chart. `#FFA500` amber, `#3B197F` purple, `#27455C` navy and `#FFA1CC` candy pink fill forms and chart series.
  **Orange stays dominant**: if a picture has more candy pink in it than orange, it is the wrong picture.
- `#3B197F` deep purple is the one thing that needs attention (`.hs-goal.no`, a failing series). **There is no red in
  this look** — it is the wrong voice for a brand whose job is to lower a heart rate.

**Exactly one orange form per picture.** Orange is how the audience finds the subject. A second orange part means the
slide has two subjects, which means it is two slides.

**Type.** Three typefaces, each with one job: **Quicksand** 700 for display (headlines, titles, stat numbers, step
names, the closing word — rounded, like everything else here), **DM Sans** for everything that is read (400 body, 500
emphasis, 700 numbers), and **Reno Mono** for labels only (the kicker, the footer mark, the page number, count tags,
chart ticks and axis titles, the `.lb` label above a name). The label voice is what keeps the look from going soft all
the way through: a mono tick under a round shape is the brand's own contrast. The scale and the floor are in
`hard-rules.json`; what each step is for:

| role | used for |
|---|---|
| closing | the closing word at most; a longer message drops to the title size |
| title | the title-slide headline (`.title`) and the closing message (`.hs-thanks.hs-msg`) |
| headline | headlines (`.headline`), the big stat (`.hs-stat`), `.big-num` |
| sub | medium stats (`.hs-stat.md`), the process card's step name |
| lead | sub-lines, step names, goal names, the step-disc digit, `.hs-q` |
| body | everything else: body, stat captions, chips, callouts, map nodes, chart ticks and titles |
| caption | **only** the kicker, the footer mark, the page number, captions / source lines (`.cap`, `.source`, `figcaption`), count tags (`.hs-count`), `.lb` labels and the chart's step labels and moment pill |

The checker enforces it: the caption size anywhere else is an error, and nothing is ever below it. The kicker sits at
the caption size here (not the body size, as in the other looks) because it is set in mono small caps — that is the
brand's own kicker and it is listed in `bodyMinExempt`.

**Space.** 1920 × 1080, 96 px safe zone (`.safe`), 12 columns with **64 px gutters — the widest of any Lumi look**,
and the whitespace floor in `hard-rules.json` is the highest. This look breathes more than it speaks. Columns:
`.hs-l` 5 + `.hs-r` 7 (default), `w4/w8` (chart slides), `w6/w6`, `w7/w5` (closing).

**Chrome.** Every slide ends with `<footer class="hs-foot">`: a small orange dot + a short deck mark (≤ 4 words,
uppercase mono) left, `<span class="hs-pageno"></span>` right ("03 / 12"). The kicker is a **gold pill** in mono small
caps with an orange dot, reading "NN · TOPIC"; the title slide uses `.kicker.dot`, the same pill in warm off-white,
for the course or event. The runtime draws an 8 px orange progress line with a round end.

**Motion feel: everything breathes in.** Long (0.70–1.10 s), slow to start *and* slow to settle, with a generous
stagger. Curve `cubic-bezier(.33, 0, .2, 1)` as `--hs-ease`. Shapes come up from 0.94 (`hsSettle`), never from zero;
text rises a short way (`hsRise`); the bar sweeps over a full second. **No snap, no bounce, no overshoot, no
hard stop** — the opposite of Pink Punch's punch and Flat-Pack's click, and that difference is the look. 3D loops are
18–27 s, the longest of any Lumi look: the camera breathes in and out by about 2 % and turns ±4° at most, and the
real motion is forms rising and settling on the same breath.

**Word budgets** are in `hard-rules.json`. They are generous enough for a full sentence and no more: this look buys
its calm with whitespace, so text that will not fit becomes another slide or a fuller set of speaker notes, never a
smaller size.
The numbers, copied from `hard-rules.json`: presenter mode title 34, section 10, content 32, quote 26, closing 22, references 140; in document mode a content slide may
hold 70. Scale: **28 / 36 / 48 / 64 / 88 / 116 / 168**.

---

## 2. The archetypes in Happy Headspace

The catalogue, the order and the closing-slide rules are in the base, section 2. Happy Headspace's layouts:

| # | archetype | main visual | layout | words |
|---|---|---|---|---|
| 1 | `title-hero` | the subject in soft light, full bleed | text left 1000 px, figure right | fewest |
| 2 | `problem-stats` | the subject with the straining part in orange | 5 / 7 | short |
| 3 | `what-it-is` | the object eased apart, soft numbered discs | 5 / 7 | short |
| 4 | `process-film` | one figure settling into place, step by step | stack: head row + wide stage | fewest on slide |
| 5 | `comparison-twin` | both forms whole, side by side, ONE scene | 5 / 7 | short |
| 6 | `annotated-photo` | the user's real photo in a round frame, orange discs | 5 / 7 | short |
| 7 | `system-tour` | the view eases from part to part; only the visited part is orange | stack | fewest |
| 8 | `result-chart` | one soft line chart with a wash under the lead series | 4 / 8 | short |
| 9 | `objectives-tour` | the goals as soft blocks that **climb** (S4) | 5 / 7 | short |
| 10 | `closing` | designed per deck (base section 2) | one of 4 variants | fewest |

DOM skeleton shared by every content archetype:

```html
<section class="slide" data-kind="content" data-minutes="1.5" data-title="Short title">
  <div class="safe">
    <div class="hs-main">                                   <!-- or .hs-main.stack with a .hs-head row on top -->
      <div class="hs-l w5"> kicker · headline · companions </div>
      <div class="hs-r w7"><div class="hs-stage"> main visual </div></div>
    </div>
    <footer class="hs-foot"><span class="hs-mark">Deck mark</span><span class="hs-pageno"></span></footer>
  </div>
  <aside class="notes" data-aura-notes> 60–300 words </aside>
</section>
```

Companion parts: `ul.hs-stats > li` (a soft coloured dot over each number; `.gold` / `.navy` recolour it; `.hs-stat`,
`.hs-stat.md`, `.hs-bar` with `--v`), numbered `ol.hs-steps` with `.hs-n` discs (`.on` = orange), `.hs-count` tags
("6x"), `ul.hs-zones` (photo zones with orange discs), `ul.hs-chips` (soft pills; `.key` is gold), `ul.hs-goals`
(`.on` orange tick, `.wip` gold, `.no` purple), `.hs-pin` discs and `.hs-tag` / `.hs-pill` callouts on a figure,
`.hs-cyc` + `.hs-rail` (process film), `.hs-map` (parts list), `.close-line` (one sentence, its key words in `<b>`,
which gives them the soft gold wash).

---

## 3. The figure idiom: a soft volume in warm light

> Base section 4.0 decides *what* to show and where it lives. This section says *how it is lit*.

### 3.1 The five rules of the figure
1. **Light describes the form, then stops.** One warm key and a wide hemisphere fill, set so the darkest point on any
   form still reads as the same colour. There is no dark side, no rim light and no specular highlight anywhere.
   `MeshLambertMaterial` has no specular term at all, which is exactly why it is the material here.
2. **No outline.** A shape is its own colour against the white page. If you reach for an outline you are building
   Flat-Pack or Pink Punch in the wrong look.
3. **No cast shadow and no shadow map.** Grounding is `S.ground(r)` — a soft tinted contact disc, and nothing else.
   A hard shadow would be the loudest thing on the slide.
4. **Everything is round or rounded.** `blob`, `pill`, `ring`, `arc`, `rod`, `mound`, and `slab` / `block` which are
   rounded-rectangle extrusions **with a real bevel**, so even their edges are round. There is no hard edge in this
   look, so there is no hard terminator either.
5. **One orange form, no faces.** Orange marks the subject. Faces and characters are out (see the top of this file).

### 3.2 The room
```js
Aura.scene('s3-scene', (ctx) => {                        // ctx: THREE, el (the holder), renderer, width, height, period
  const { THREE } = ctx;
  const S = HS3D.room(ctx, { target: [0, 1.6, 0], distance: 10.5, turn: -22, tilt: 15 });
  const base = S.add(HS3D.block(THREE, 3.4, 2.4, 0.7, { fill: 'warm' }));         // footprint w x d, height h
  const core = S.add(HS3D.blob(THREE, 0.95, { fill: 'orange', squash: 0.9 }));    // the ONE orange form
  core.position.y = 1.6;
  S.ground(2.8);                                         // the soft contact disc: this look's only shadow
  S.sway([core], [0, 0.5, 0]);                           // rise and settle on one slow breath
  HS3D.pins(S, ctx.el, { core: core });                  // .hs-pin / .hs-tag with data-follow="core"
  return S.api({ update(t) { S.breathe(t); } });
}, { period: 22 });
```
`distance` and `fov` together set the apparent scale (unlike the orthographic looks, this camera really is at a
distance). `sway: 0, dolly: 0` gives a perfectly still figure — the right answer for a still slide.

### 3.3 The toolkit (`HS3D.*`)

| call | what it draws |
|---|---|
| `room(ctx, o)` | the quiet room: `add`, `breathe(t)`, `ground(r, o)`, `sway(parts, offset, { lag, spin })`, `place`, `api` |
| `form(THREE, geometry, { fill, opacity })` | any geometry as a matte, outline-free soft form |
| `blob / pill / ring / arc / rod / mound` | the round shapes this look keeps needing; `blob` takes `squash`, `wide`, `deep` |
| `slab / block` | rounded-rectangle extrusions with a real bevel; `block` stands on the ground |
| `fill(part, 'orange')` | recolour a form (a step arriving, a tour visiting) |
| `climb(THREE, n, o)` | **S4**: `n` rising soft blocks, the goal on top; returns `{ group, tops, blocks }` |
| `pair(THREE, a, b, gap)` | **S5**: two forms, whole, side by side, same camera, same scale |
| `pins(S, el, anchors)` | soft discs and round callout cards that follow their form every frame |
| `steps(t, P, n, move)` | the room's rhythm: `n` states per loop, each still, then one **long, soft** move |
| `breath(t, P)` | 0 → 1 → 0 across one loop, smooth at both ends. The look's whole motion vocabulary |
| `easeSoft(x)` | smoothstep applied twice: slower in, slower out, never an overshoot |

### 3.4 Motion in the room
The breath is the signature loop: forms rise over the first half of the period and settle over the second, and the
camera does the same thing a little behind them (`lag`). It is exactly periodic and still at both ends, so it
satisfies the capture contract with nothing extra. A process film uses `HS3D.steps` with a long move fraction: a step
rests, then one thing *eases*, then it rests again. A climb uses a rise of `sin(π·k)` — zero at both ends, so the loop
never jumps. **Nothing snaps, nothing bounces, nothing drifts off its path.** A spin, if you use one, is a whole
number of turns per loop (`spin: 1`), never a fraction.

### 3.5 Fidelity, in this look's terms
Base 4.2 sets the counts. What they mean here:
- **"Surface families"** are the palette's colours plus the warm off-white: a detailed figure uses at least three
  meaningfully (a body colour, a supporting colour, orange for the hero), a showpiece four or more.
- **"Micro-detail"** is formal detail, not texture: a seam read as a groove between two forms, a fastener as a small
  sphere, a port as a short pill, a count tag, a numbered disc, a change of squash. Three kinds for detailed, five for
  showpiece. **Never a bump map, a texture image or a surface pattern** — this look has no surface detail at all.
- **"Grounding"** is `S.ground()`, the soft contact disc, one per object that touches the floor — or nothing at all
  for something that genuinely floats.
- **Scale cue:** a labelled object of known size beside the subject, or a projected `~100 nm`-style tag. Never a
  made-up lab prop (base 4.0).
- Real counts still rule (base 4.1). Simplifying a shape is this look's licence; **miscounting is not**.
  **Ask; never invent a count.**

### 3.6 What never to do in Happy Headspace
No outline, no cast shadow, no shadow map, no hard edge, no sharp corner. No specular, no metal, no glass, no
reflection, no texture image. No pure black, anywhere. No red. No face, no character, no eyes, no smile. No
perspective wider than a gentle one. No Blender. No snap, bounce or overshoot in any animation. No orange smaller
than the body size, and no orange behind a sentence. No more than one `.em` per headline and no more than one orange
form per picture. No label text baked into WebGL — callouts are HTML (`.hs-pin`, `.hs-tag`, `.hs-pill`).

---

## 3A. The illustration idiom: soft shapes, no outline

> Base 4.12 and `illustration.md` say what a drawn picture is. This section is only Happy Headspace's surface.

Happy Headspace draws with **shape, not line**. Nothing is outlined; a form is read because its fill differs from
what is behind it, and because a wide soft shadow lifts it off the page. Every corner is generous.

| | Happy Headspace |
|---|---|
| line | none (`weight: 0`). An edge appears only as a change of fill, or as a 4 px `--brand` stroke used as a *mark*, not a border |
| fills | hero `--brand` orange, body `--surface`, context `--surface-2`, mark `--gold`, signal `--signal` deep purple |
| corners | 40 px, or a full pill. A right angle is a mistake in this look |
| lift | one wide soft shadow, low opacity, straight down — the look's whole sense of depth |
| labels | Quicksand at 36 px; captions and dimensions in Reno Mono at 28 px |
| notation | a flowing line in `--brand`, rounded caps, never an arrow with a hard triangular head where a tapered one will do |
| texture | none. No grain, no dots, no hatching except a cut surface |

1. **Orange is the lead and it is never small.** `--brand` fills big shapes and draws the squiggle; it is never
   caption text, because it is 2.9:1 on white. Text on an orange shape is white, and `F.text({ on: … })` picks it.
2. **Round, not cute.** Soft corners and warm light, but the object underneath is still the real object with its
   real counts (base 4.10). A rounded fin is still a fin at the real pitch; a mascot is not.
3. **Breathing room is the composition.** Fewer parts, more space, one idea. If a drawing feels crowded in this
   look it has too many parts — split the slide rather than shrink them.
4. **Never** a black outline, a sharp corner, a hard-edged shadow, a dotted or dashed emphasis, a second warm
   colour beside the orange, or a drawing that fills the frame edge to edge.

---

## 4. The chart idiom (`HSChart.line`)

A soft figure, not a widget: a 10 px round-capped stroke, a **soft tinted wash under the lead series only**, pale
round axis rules with **no arrowheads** (a calm look does not point), a grid so faint it is nearly not there, direct
end labels in round filled pills, and **no legend**. Axis numbers and axis titles are set in Reno Mono, the same label
voice as the kicker — the one piece of hard geometry in the whole picture, and that contrast is the point. Optional:
soft dotted step lines with mono labels across the top, one in a gold pill; a **warm wash region** (`band`) for the
part the slide is about; one marked moment (`event`): a pale dotted drop line and a round gold pill. Series colours:
orange `#FF7300`, then navy `#27455C`, then purple `#3B197F`; never more than three, and **orange first** — the lead
colour leads.

```js
HSChart.line('#s8-chart', {
  x: { min: 0, max: 60, ticks: [0, 20, 40, 60], title: 'time elapsed, min' },
  y: { min: 0, max: 100, ticks: [0, 50, 100], title: 'load held, kg' },
  series: [{ name: 'after', color: '#FF7300', points: [[0, 84], …] },
           { name: 'before', color: '#27455C', points: […], wash: false }],
  band: { from: 40, to: 60 }, event: { x: 40, y: 74, label: 'where it lets go' },
  source: 'Source: Author et al., Journal 2021, Fig. 3',     // real data always carries its source
  // illustrative: true                                       // no data: a shape, labelled, no y numbers
});
```

---

## 5. The voice, in this look

The base's voice rules apply and Happy Headspace bends them in one direction only: **it is allowed to be gentle, and
it is never allowed to be vague.** Headspace's own copy is warm and completely concrete. Headlines stay 3–7 words and
stay claims. What changes is the register of the connecting words and, above all, the speaker notes, which are written
to slow the presenter down.

| do | don't |
|---|---|
| Three parts, **one job** | The System Architecture and Its Components |
| It holds, **then it lets go** | Results: Load Capacity Degradation Over Time |
| Same job, **half the parts** | A Comparison of the Original and Revised Designs |
| Four steps, **three climbed** | We are pleased to report significant progress 😊 |

No exclamation marks, no emoji, no "journey", no "mindful", no second-person pep. The calm is in the spacing and the
motion; if it is also in the words, the deck is patronising.

---

## 6. Before the checker (Happy Headspace's own lines)

The full pre-flight list is in the base, section 10. On top of it:

- [ ] White page on every slide; `#F9F4F2` only as a card, chip, track or soft section. No border, no hard shadow, no
      sharp corner anywhere.
- [ ] Text is `#2D2C2B` or `#44423F` — never pure black. No red anywhere.
- [ ] Quicksand, DM Sans and Reno Mono only, each doing its own job. Sizes from the scale in `hard-rules.json`; the
      caption size only in the kicker, footer, page number, captions, count tags, `.lb` labels and the chart's step
      labels and moment pill.
- [ ] Exactly one `.em` squiggle per headline, and exactly one orange form per picture. Orange is never small text and
      never sits behind a sentence.
- [ ] Every 3D scene: `HS3D.room`, a soft key and a wide fill, no outline, no cast shadow, `S.ground()` under anything
      that touches the floor, every form round or bevelled.
- [ ] No faces, no characters.
- [ ] No `scene.py` anywhere: this look does not use Blender.
- [ ] Sequences are drawn with `HS3D.climb`; comparisons with `HS3D.pair`.
- [ ] Every animation breathes: no snap, no bounce, no overshoot. Loops are 18–27 s.
- [ ] Word budgets met; whitespace at or above this look's floor — it is the highest of any Lumi look.
- [ ] Tell the user once that Happy Headspace keeps its own colours and type (base section 9).
