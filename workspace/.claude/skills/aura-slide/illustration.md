# Illustration — the slides that are not 3D

Read this when a slide's main visual is a **drawing**: the 30 % of the picture mix
(`hard-rules.json` → `pictureMix.illustrationPct`) that is neither an animated nor a still 3D figure.
`LOOK-BASE.md` section 4.12 is the rule; this file is how you do it. The look's own drawing surface —
line weight, fills, whether a shape is outlined, what a shadow is — is in its `LOOK.md`,
section "The illustration idiom".

Credits, both MIT, both required to stay in `engine/deck/lib/illus.js`:
the layout taxonomy below is adapted from **baoyu-infographic** by 宝玉 (JimLiu),
<https://github.com/JimLiu/baoyu-skills>; the "inline SVG inside the HTML, no external tools, no rendering
library" pattern is from **architecture-diagram** by **Cocoon AI**,
<https://github.com/Cocoon-AI/architecture-diagram-generator>.

---

## 1. What an illustration is here

**Inline SVG, drawn in code, by you.** It packs into the one offline HTML file, it is crisp at any stage size
and in the PDF, its `<text>` is real text that `deck_check.js` measures like a headline, and a person can read
the code and correct it.

Never: a raster image, a generated picture, an icon font, a CDN, a clip-art library, a screenshot of a drawing.
There is no image model in Lumi and a deck must work with no network. An invented picture of the subject is the
same failure as an invented number.

**An illustration is still.** It registers no scene, declares no period and never reads a clock, so the capture
contract (LOOK-BASE 4.3) has nothing to hold it to: `?still`, the PDF and the recorder get exactly the frame the
audience sees. If a picture genuinely has to move, it is a 3D figure or an `Aura.canvas` loop, not this.

**It is the slide's ONE main visual**, counted as the `diagram` row of the clash matrix (LOOK-BASE 3).
`LumiIllus.figure` sets `data-visual="diagram"` on the holder for you. It therefore never sits beside a 3D
scene, a chart or a photo.

## 2. When to draw instead of render

Draw when the point is a **relation**, not an object: a comparison of two arrangements, the order of a process,
what contains what, where a quantity goes, why one thing causes another. Draw when the honest picture is a
**section, a field or a path** — things a photograph could not show either. Draw when the subject is flat:
a layout, a map, a cycle.

Render (3D) when the point is **the object itself** — its shape, its materials, how its parts move.

A deck that draws everything looks like a textbook; a deck that renders everything looks like a showroom and
takes far longer to build. The mix in `hard-rules.json` is the balance, and it is a suggestion, never a quota.

## 3. The layout vocabulary

Pick the layout from **what the slide has to say**, not from what looks nice. Each one is a call on the figure
handle and returns its slots — `{ x, y, w, h, cx, cy }` in stage px — and draws only its own furniture (the rail,
the spokes, the arrows between states). **What goes in a slot is the subject, drawn from its real anatomy.**

| the slide says | layout | call |
|---|---|---|
| A against B, before and after, ours and theirs | binary comparison | `F.compare({ titles, captions })` |
| first, then, then — a method, a roadmap, steps | linear progression, **climbing** | `F.progression(n, { labels, done })` |
| levels, a priority order, what sits on what | hierarchical layers | `F.layers(n, { pyramid })` |
| several options against several criteria | comparison matrix | `F.matrix(rows, cols, { rowLabels, colLabels })` |
| it comes back round: a loop, a duty cycle | circular flow | `F.cycle(n)` |
| this much of the whole is that | part to whole | `F.whole([{ share, label, role }])` |
| one centre, many things attached to it | hub and spoke | `F.hub(n)` |
| what is inside it, in order | structural breakdown (exploded) | `F.breakdown(n, { axis })` |

Two rules from the base outrank the taxonomy:

- **S4 — a sequence climbs.** `F.progression` rises left to right by default; `{ climb: false }` is for a
  sequence the person has asked to be flat, and you offer the climbing shape first.
- **S5 — a comparison shows both whole.** `F.compare` gives two slots of identical size in one frame. Draw the
  same subject in both and change **one thing**. Never a morph, never A ghosted behind B, never one half of each.

## 4. Drawing the subject

LOOK-BASE 4.10 binds a drawing exactly as it binds a render: **the real object, from real numbers, in real
materials — realistic in structure, thematic in surface.** A drawing is not a licence to simplify the subject,
only to simplify its surface.

1. **Work from anatomy.** List the parts, give each a shape, a size ratio and a role; one part is the hero
   (`role: 'hero'`). Real counts: a coil with nine fins in the cut has nine, not "some".
2. **Show enough of it to be it.** A section, a cutaway or a magnified detail placed inside the whole. A fragment
   so small that it stops reading as the object is a likeness.
3. **Invisible things are notation, never cartoons.** Air is an arrow along the real flow direction; a boundary
   layer is a band that grows the way it really grows; heat is a colour field with a scale. No clouds, no
   sparkles, no smiling parts.
4. **Micro-detail is drawn detail**: a collar, a weld, a fastener, a dimension line, a section hatch
   (`F.hatch` — a cut surface is hatched, as a drawing does it), a scale bar (`F.scaleBar`). LOOK-BASE 4.2 sets
   how many kinds a detailed or showpiece figure needs.
5. **Write every liberty down**, in `F.note(...)` on the drawing and in the speaker notes: "fin pitch drawn
   wider than real", "not to scale". A liberty that is not written down is a mistake.
6. **Neighbouring slides differ.** Two drawings in one deck must not share a layout and a composition.

## 5. Text and numbers inside the drawing

`deck_check.js` walks the SVG like any other DOM: it measures each `<text>` at its effective stage size, reads
its fill for contrast, counts its words against the slide's budget and fails it outside the safe zone.

- **Real `<text>`, never lettering drawn as paths.** `F.text` and `F.value` size everything from the look's own
  floor (`bodyMinPx` in `hard-rules.json`: 28 px in Bold Blue, 36 in Pink Punch and Happy Headspace, 32 in
  Flat-Pack, 30 in Clay Pop) and raise anything smaller, with a console warning. `role: 'cap'` gets the look's
  caption size, the only size below the floor and only where the look exempts it.
- **Contrast is measured, not guessed.** Pass `on: <the fill the text sits on>` and `F.text` picks whichever of
  the look's ink and white reads better on it. Over a hatch or a texture, break the pattern with a clean
  rectangle behind the word, the way a drawing does.
- **Words count.** The drawing's labels come out of the same word budget as the headline. Keep them to the few
  that name parts; everything else belongs in the speaker notes.
- **Every number is traced.** Use `F.value(x, y, text, { kind })` with the provenance kind it will be declared
  under — `source | published | computed | figure | scan | illustrative` (`engine/tools/lib/claims.js`). It is
  recorded on `F.claims` and an undeclared one is an error in the console. A number with no entry in
  `provenance.json` fails the check exactly as it would in a headline. **Never put a number in a drawing to make
  it look technical.**

## 6. Writing one

```js
LumiIllus.draw('#s4-fig', (F) => {
  const [A, B] = F.compare({ titles: ['plain fin', 'wavy fin'] });
  [A, B].forEach((s, i) => channel(F, s, i === 1));      // the SUBJECT, drawn into each slot
  F.note('schematic section · fin pitch drawn wider than real');
});
```

The holder is an empty `<div>` inside the look's picture area, with an `aria-label` that says what the drawing
shows. The viewBox is in **stage px**, so a `font-size` you write is the size the checker measures, and the
figure is as wide as its column at 1920 × 1080.

| on the handle | what it is |
|---|---|
| `F.W`, `F.H`, `F.pad`, `F.look` | the drawing area in stage px, and the look's resolved drawing surface |
| `F.part(shape, { role, into, dashed, outline, lift })` | a drawn solid. `shape`: `{ rect:[x,y,w,h,r] }`, `{ circle:[cx,cy,r] }`, `{ poly:[[x,y]…] }`, `{ path:'M…' }`. `role`: `hero · body · context · signal · paper · mark` |
| `F.text(x, y, str, { role, on, anchor, rotate, mono })` | a word, never below the look's floor |
| `F.value(x, y, str, { kind })` | a number, with the provenance kind it is declared under |
| `F.line(a, b, { dashed })`, `F.arrow(a, b, { both })` | a guide, and the only way to say "this moves there" |
| `F.dim(a, b, str, { side })` | a dimension line with its number |
| `F.callout(from, at, n, str, { anchor })` | a numbered disc on a short leader, naming a part |
| `F.hatch(shape)` | a cut surface |
| `F.scaleBar(x, y, len, str)` | a scale cue |
| `F.note(str)` | the one caption at the foot: "illustrative", a source, a liberty |
| `F.el(tag, attrs, parent)`, `F.layer(name)` | raw SVG, into `back · link · body · front · label` |

Everything the engine draws takes its surface from the look, so the same code gives a clinical Bold Blue
diagram, a hard-outlined Pink Punch print and a soft Happy Headspace shape. **Do not hard-code a colour, a
stroke width or a radius in a slide**; use a role, or a theme variable (`var(--accent)`, `var(--hot)`) when the
subject genuinely needs one — a hot thing is hot in every look.

## 7. Before the checker

- [ ] The layout matches what the slide says; a sequence climbs; a comparison shows both whole, same frame, one
      difference.
- [ ] The subject is the real object with its real counts, drawn from anatomy — not a likeness.
- [ ] Invisible quantities are notation, with a direction that is the real direction.
- [ ] Every liberty is in `F.note` and in the speaker notes.
- [ ] Every number went through `F.value` with a kind, and is in `provenance.json`.
- [ ] No hard-coded colour, weight or radius; the look's roles did the drawing.
- [ ] `deck_check.js` clean, then look at the screenshot at 100 %: beside a rendered slide, does it look
      considered, or does it look like filler?
