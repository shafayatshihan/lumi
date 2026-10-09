# STATUS — Violet Lime, Lumi's eighth look

2026-10-09, a Claude Code session (Opus 5). Brief: `docs/HANDOFF-violet-lime.md`.
Claim: `docs/CLAIM-VIOLET-LIME.md` · Register: `docs/REGISTER-VIOLET-LIME.md`.

**Done, and looked at.** `test_instructions.py` 117/117 with six new Violet Lime assertions. A real ten-slide deck
built from a real paper renders **clean** through `deck_check.js` at 1920 × 1080 over `http://`, with one warning
(the corpus note, see §4).

---

## 1. The answer to the question in section 2 of the brief

**What a Violet Lime slide becomes when there is no photograph.**

The brief proposed: every photo-carrying archetype gets a no-photo form that is a deliberate composition — a colour
field with the slide's one number in it. That is right, and it is built. But it is **two thirds of the answer**, and
shipping only that would have made the look worse than it needs to be.

The frame is the constant. `<figure class="vl-frame">` — a rounded rectangle with one corner at the small radius —
never changes size, position or role. There is no hole to fill because the layout was never built around the
photograph. What fills it has **three** forms, in this order:

1. **The photograph**, when the person gave one *for that slide*.
2. **The drawing** — a `LumiIllus` figure or a `VL3D` scene in the same frame, on the opposite ground. Not a
   fallback: `hard-rules.json → pictureMix.illustrationPct` already expects ~30 % of any deck's pictures to be
   drawn, in every look. A Violet Lime frame holding a flat drawing of the real object, with its real counts and
   proportions, **is** a Violet Lime picture.
3. **The plate** — a solid field on the opposite ground carrying the slide's one number and at most six words.
   For the slides where there is genuinely nothing honest to draw: people, an occasion, a place, a feeling.

The brief's framing — "a card that would have held a photograph becomes a colour field with the slide's one number"
— is form 3, and it is the *last* resort, not the only one. **Reaching for the plate before the drawing was the
mistake available here**, and it would have produced decks of typography where the other seven looks would have
drawn the subject.

The two disciplines the brief asked for are both in `LOOK.md` §2A and both are enforced by hand, not by the checker:

- **Decide once, per slide.** Photographs are allocated to *whole slides* in story order (title first, closing
  second, then slides whose subject the photograph actually shows). A slide that cannot have photographs in **all**
  its frames gets form 2 or form 3 in all of them. A photograph beside a drawing is not just ugly, it is **two main
  visuals**, which `deck_check.js:373` fails outright.
- **Say it early.** `LOOK.md` tells Claude to ask for photographs by name in the *first* build question, with the
  trade stated plainly, and to report afterwards which slides got photographs and which got plates. It also says
  never to hold the deck waiting for one.

**Several frames on one slide are one main visual.** They go in a `.vl-pics` group (`display: contents`) carrying a
single `data-visual`. Without it two `<img>` over 15 % of the slide each count as a photo and the slide errors. A
group of plates declares nothing at all — a plate is type on a colour field, so an all-plate slide is **text-only**
in the clash matrix, which is why `problem-stats` and `objectives-tour` are built that way by design.

**Is the look usable with no photographs at all?** Yes, and that is not a theoretical answer: the deck in §3 was
built from a 1991 numerical paper that contains no photographs, and **not one of its ten slides has a photograph**.
Six carry drawn `VL3D` figures, two carry plates, two are text and chart. It is a deck I would put in front of a
room.

---

## 2. What was built

- `engine/rules/hard-rules.json` → `looks.violet-lime` (scale 24/30/36/48/72/104/144, `maxTypefaces: 1`,
  `safeZonePx: 96`, content budget 44)
- `workspace/.claude/skills/aura-slide/looks/violet-lime/LOOK.md`
- `engine/deck/themes/violet-lime.css`
- `engine/deck/looks/violet-lime/` — `template.html`, `violet-lime.js` (page numbers, `VL.grounds()`,
  `VLChart.line / .bars / .dials / .years`), `vl3d.js` (`window.VL3D`), and **ten** archetypes
- `engine/form/themes/9-violet-lime-1..4.jpg` — four stills cut from real rendered slides of the §3 deck
- all the registries, listed in `REGISTER-VIOLET-LIME.md`

---

## 3. The deck that proves it

`.aura/temp/build/carotid-angle/` — ten slides on Perktold, Peter, Resch & Lang, *Pulsatile non-Newtonian blood flow
in three-dimensional carotid bifurcation models*, J Biomed Eng 1991, 13(6) 507–515. `deck_check.js`: **clean**.

Every number on it is declared in `provenance.json` as `published` with the citation (28 entries), and every slide's
notes name the paper — which is what `claims.js:157-163` requires of a `published` claim. The `VL3D` carotid is
built from the paper's own ratios (common D = 6.2 mm, internal 0.70 D, external 0.59 D, sinus 1.06 D) with its two
liberties written into the scene comment and the notes.

---

## 4. What I found wrong, and what I changed about the brief

**4.1 The ten archetype names in the brief would have broken deck building.** This is the one that mattered.

The brief's §4 names ten new archetypes (`title-split`, `about-pair`, `year-line`, `team-grid`, `service-stack`,
`numbered-blocks`, `voices`, `dial-row`, `step-arrows`, `closing-thanks`). But `LOOK-BASE.md` §2 says *"Ten
archetypes, **the same ten in every look**"* and tells Claude to open `archetypes/<name>.html` **by the catalogue
name**; all seven shipped looks use those ten filenames. Ship the brief's names and `--snippet title-hero` fails,
and Claude building a Violet Lime deck looks for a file that is not there.

Only the **count** is asserted (`test_instructions.py:283-286`), so this would have failed silently, in the deck
builder, long after the tests went green.

**What I did:** kept the ten catalogue filenames and built the brief's measured compositions inside them, mapping
each one. Both names are in the `<!-- archetype: -->` header and in `LOOK.md` §2, so `--snippet list` prints
"title-hero · title-split: the headline and ONE lime CTA pill…". Nothing measured off the reference was lost.

Three of the brief's compositions have no catalogue slot (`team-grid` → people, `voices` → quotes, and the fourth
`service-stack` slot). `year-line` became `objectives-tour`'s composition, `service-stack` became `system-tour`'s;
`team-grid` and `voices` ship as documented composition **variants** with their own CSS (`.vl-people-grid`,
`.vl-voices`) in `LOOK.md` §2, not as files, so the count stays ten.

**4.2 "One lime thing per slide" collides with the brief's own violet compositions.** On a violet ground the `.em`
is lime, so it *is* that slide's lime thing — and then `about-pair`'s lime stat pill, `dial-row`'s lime segment and
`closing-thanks`'s lime tab are all a **second** lime thing. The brief asks for all of them.

Resolved with `.inv`: on a violet slide whose lime is spent elsewhere, the headline is set in `--on-violet-muted`
(5.2:1) with the emphasis phrase in solid white (7.7:1). One emphasis, one lime thing. Four of the five violet
archetypes invert; only a slide with no other lime element keeps the lime `.em`.

**I broke this rule myself on five slides of the first real deck** — a lime figure part *and* a lime pill, card or
tab. It is the rule `LOOK.md` §6 predicts you will break, and the prediction is from experience, not rhetoric.

**4.3 The brief's §4 says each archetype "must declare which `LOOK-BASE` §4 role it serves".** §4 is *From subject
to picture*; the roles are in §2. Read as §2.

**4.4 `safeZonePx: 96` was the right call and the brief was right to insist.** `deck_check.js:94` hardcodes
`L < 94 || T < 94 || R > 1826 || B > 986` and ignores the profile key — Candy Grid's `safeZonePx: 56` is therefore
decorative. Violet Lime's decoration frames bleed off the canvas, but they carry no text, so nothing needed
changing and `deck_check.js` was not touched.

**4.5 The corpus warning on the proof deck is a path quirk, not a defect.** `deck_check.js:423` reads this deck's
text from `<auraRoot>/.aura/temp/text`, and in this dev checkout `auraRoot` resolves through the `X:\.aura`
junction to the repo itself, so the folder it looks in is not the one `form_server.py` writes to. Every number is
declared in `provenance.json` instead, which is the stronger mechanism for a deck built from a published paper.
Worth a look by whoever owns the dev layout; it will not appear in a real install.

---

## 5. Defects I found by rendering, that no test would have caught

Each cost a render cycle and each is now fixed in the theme.

1. **Frames collapsed to zero height.** A `.vl-frame` with `aspect-ratio` and only absolutely-positioned children
   is a flex item with no content, so the aspect ratio never resolves and the box collapses — clipping its tab and
   its labels onto the ground, where the checker reported them as 2.37:1 contrast failures rather than as a
   collapsed box. A frame that is a column's main visual now **fills the column**, which is what the reference does
   anyway; `aspect-ratio` is only for a frame inside a grid.
2. **`max-height: 100%` was being ignored**, because `align-items: center` leaves the grid item auto-height and a
   percentage against an indefinite height is dropped. The columns stretch now and centre their own content.
3. **The footer ran under the picture.** `.safe` is a flex column and the footer is in flow; `.safe`'s
   `position: absolute` was left alone (overriding it collapses every slide — `HANDOFF-look-craft.md` §2.1).
4. **Ground qualifiers out-ranked variant classes.** `.slide.on-violet .vl-frame.is-plate` (4 classes) beat
   `.vl-frame.is-plate.deep` (3), so the `deep` and `is-drawn` variants silently did nothing. Every ground
   qualifier is now `:where(...)`, which contributes no specificity.
5. **Two lime things, three ways.** A lime zone square *and* a lime pin; a lime tick *and* a lime year pill; a lime
   `.em` *and* a lime card. Fixed deliberately rather than left to specificity accident: zones and goals are the
   ground's own solid, and `.key` is the opt-in for the one lime one.
6. **The CTA arrow was a 22 px `▶` glyph** — below the 24 px floor and off the type scale. Both arrows are inline
   SVG now; they are decoration, so they should never have been text.
7. **Year pills were 24 px SVG text with no exempt class**, so they errored. They carry `.vl-tick` now, which is in
   `bodyMinExempt`.
8. **Three archetypes shipped over their own word budget** (66, 47 and 58 against 44). A shipped archetype that
   fails the look's own checker on first paste is a trap for every deck made from it. Trimmed.
9. **Decoration read as stray lines.** A frame bleeding off one edge shows a straight line, which looks like a
   rendering glitch. All three now bleed off a **corner**, so what shows is a rounded corner.
10. **`pack_deck.py` parses `<img>` inside HTML comments.** The template and two archetypes showed the photograph
    form as a literal `<figure class="vl-frame"><img src="assets/<their file>"></figure>` in a comment, and the
    packer refused the whole deck with *"&lt;img&gt; points to a missing file"*. It would have hit **every** Violet
    Lime deck at the last step. The comments now describe the markup in prose instead of writing a parseable tag.
11. **The dial arc cannot use `data-anim="draw"`** — the runtime sets `stroke-dasharray: 1` there, and on a dial the
    dasharray *is* the value. It sweeps on its own `stroke-dashoffset` (`vlSweep`) instead.

---

## 6. Left undone

- **`test_server.py` and the e2e were not run** — the brief says to ask the owner first. `test_instructions.py` is
  green. `test_server.py:664` does not name Violet Lime; adding `fs.word_cap('Violet Lime') == 44` is a one-line
  change I did not make because I have not run the suite.
- **No `team-grid` or `voices` slide has been built and looked at.** Their CSS ships and is documented, but the
  rendered proof covers the ten archetypes only.
- **No deck has been built *with* photographs.** The brief asks for both builds; I have the all-plate/all-drawn one
  (the stronger test, and the common case), but nobody has yet put a real photograph in a `.vl-frame` at 1920.
  Everything about that path is ordinary `object-fit: cover`, but it is untested and I am not going to claim
  otherwise.
- **1366 × 768 was not separately judged.** The runtime scales a fixed 1920 × 1080 stage with a uniform
  `transform: scale`, so the composition cannot break — only legibility can, and that is what the 24 px floor is
  for. I did not get a clean second-viewport screenshot out of the harness and did not spend more cycles on it.
- `looks.js` and `review.js` carry dead swatches and draw functions for the three looks another session removed
  (`REGISTER-VIOLET-LIME.md`). Not mine.
