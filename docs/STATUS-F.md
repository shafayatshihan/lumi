# STATUS — Part F: vector illustration (the non-3D 30 %)

2026-10-08. Brief: `docs/HANDOFF-F-illustration.md`. Claim: `docs/CLAIM-F.md`. Sandbox: `X:\aura-dev-f\`.

## Done

- **`engine/deck/lib/illus.js`** — `LumiIllus`, the illustration engine. Inline SVG, drawn in code, **still**
  (no scene, no period, no clock), so the capture contract has nothing to hold it to and `?still` / the PDF /
  the recorder all get the frame the audience sees. Loaded by every look through `SHARED_HEAD` in
  `new_deck.js`; it registers nothing and draws nothing until a slide calls `LumiIllus.draw`.
  - `figure(holder)` sets `data-visual="diagram"`, so the clash matrix counts it as the slide's one main visual,
    and gives a viewBox in **stage px** — a `font-size` written in the drawing is the size `deck_check.js`
    measures.
  - a look's drawing surface (line weight, fills, corners, lift, floor, texture) is a table keyed on
    `data-look`, resolved from the theme's own CSS variables, so a theme edit reaches the drawing with it.
    A slide never names a colour or a weight; it names a **role** (`hero · body · context · signal · paper · mark`).
  - layout vocabulary: `compare · progression · layers · matrix · cycle · whole · hub · breakdown`, each
    returning its slots and drawing only its own furniture. Adapted from the baoyu layout taxonomy (credited).
  - marks: `part · text · value · line · arrow · dim · callout · hatch · scaleBar · note`, plus raw `el` into
    five z-layers.
  - honesty built in: `F.text` raises anything below the look's own `bodyMinPx` and warns; `F.text({ on })`
    picks ink or white by **measured** contrast; `F.value(…, { kind })` demands the provenance kind the number
    will be declared under and records it on `F.claims`, erroring in the console when there is none.
- **Guidance.** `workspace/.claude/skills/aura-slide/illustration.md` (new): what a drawing is, when to draw
  rather than render, the layout vocabulary, drawing the subject, text and numbers inside a drawing, the API,
  and a checklist. Registered in `SKILL.md`'s reference list.
- **`LOOK-BASE.md` 4.12** (additive) — the rule itself, tied back to 4.10 (the real object), 3 (clash matrix),
  4.3 (why a drawing needs no capture entry), 6 (numbers) and 4.6 (post does not apply). One new checklist line
  in section 10.
- **Five `LOOK.md` sections 3A, "The illustration idiom"** — Bold Blue a clinical technical section on studio
  paper; Flat-Pack the same manual flat on the page; Pink Punch a screen print with the hard offset copy and
  halftone; Happy Headspace soft shapes with no outline at all; Clay Pop lit clay on the cool tile. Each is a
  surface table plus four rules and a "never" line. Nothing structural is in any of them.
- **Rendered and looked at** (sandbox, never in the repo): the owner's real case, plain fin against wavy fin,
  as a section along the air path — nine fins edge-on, the tube cut lengthwise and hatched, fin collars, the
  air arrows, and the thermal boundary layer as notation, thickening down a plain fin and scrubbed off at every
  crest of a wavy one. Built in Bold Blue (`fins`), then the same drawing in Pink Punch (`kitpp`) and Clay Pop
  (`kitcp`) to prove the surface swaps and the structure does not. `deck_check.js` clean on Bold Blue and Clay
  Pop; Pink Punch slide 2 clean (its slide 3 is the untouched closing template, over its word budget).
  Packed with `pack_deck.py`: 8 scripts inlined, one 1.27 MB offline file, the drawing identical in it.

## What the checker turned out to enforce for free, and it matters

SVG `<text>` is walked like any other DOM: effective stage size through the CTM, fill for contrast, words
against the slide's budget, the safe zone, and overlap. So a drawing's labels are **not** a loophole —

- a label below the look's floor is an error, exactly like a headline;
- a label's contrast is measured against the rendered frame, so a word over a hatch or a leader line fails (it
  did, twice, in the sandbox — the engine now breaks the hatch under a label and routes the callout's word to
  the side its leader does not come from);
- **a drawing's words come out of the slide's word budget.** Pink Punch allows 30 words on a content slide and
  the drawing's labels ate a third of it. In a tight look, name three parts and put the rest in the notes.

This closes, for drawings, the hole `claims.js` documents as "a number baked into a picture cannot be caught".
It stays open for a 3D texture and for a Blender render; only SVG is checkable.

## Where the brief was wrong

1. **"the 14 stage-px floor".** There is no 14 px floor anywhere. `hard-rules.json` has `minFontPx: 26`
   generic, and per look 20 (Bold Blue), 24 (Flat-Pack, Clay Pop) and 28 (Pink Punch, Happy Headspace) as the
   absolute minimum, with `bodyMinPx` of 28 / 32 / 30 / 36 / 36 above that. The engine reads the look's own
   numbers, not 14.
2. **`X:\lumi-refs\hermes\` holds two files, not 45.** Only `baoyu-infographic.md` and
   `architecture-diagram.md` are saved there; the 21 layout and 21 style reference files were never fetched.
   The taxonomy was therefore ported from the layout gallery in `baoyu-infographic.md` (names and "best for"),
   which is enough — the layout definitions themselves are prompt text for an image generator and would not
   have survived the port anyway. The credit is unaffected and is in the file.
3. **The brief's reading of `baoyu-infographic` is right** and I agree with it: it is a prompt builder for a
   raster image generator, it needs a model Lumi does not have and cannot reach offline, and an invented
   picture of a heat exchanger is the complaint that created Part E. Nothing of it was wired in.
4. Nothing else in the brief turned out wrong. `architecture-diagram` is indeed the right shape and the wrong
   aesthetic; its pattern (inline SVG in the HTML, no library, no key) is what `illus.js` does.

## Not done / next

- No archetype snippet yet for a drawn slide. `comparison-twin` and the rest still ship a 3D holder; a builder
  has to swap the holder by hand. A `--snippet` variant per look would be the obvious next step and is a
  `new_deck.js` change, which is shared — registered, not taken.
- `deck_check.js` does not yet cross-check `F.claims` against `provenance.json`; the numbers are caught by the
  existing text pass, so this would only improve the message.
- Happy Headspace and Flat-Pack were not rendered. Their surface tables follow the same shape as the three that
  were, but nobody has looked at them.
