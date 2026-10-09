# Brief for a Claude account: build the "Violet Lime" look

You are building Lumi's eighth look. Lumi is a Windows app that turns a person's own material into a finished
slide deck; a *look* is a brand layer — palette, type, picture idiom, motion — that every deck in it obeys.

The owner supplied one reference: a 28-slide education/marketing template, sixteen slides visible. Everything in
section 3 is read off that reference, not invented. Where it says "measured", it was.

---

## 1. The job

Build **Violet Lime** (`violet-lime`): one saturated violet-blue and one acid lime, rounded-rectangle geometry,
and **real photographs as the main picture**. Grounds alternate — white slides and full-violet slides — and that
alternation is the deck's rhythm.

Deliverables, all of them:

- `engine/rules/hard-rules.json` → `looks.violet-lime`, and a matching `LOOK.md`
- `engine/deck/themes/violet-lime.css`
- `engine/deck/looks/violet-lime/` — `template.html`, `violet-lime.js` (chrome + charts), `vl3d.js`, and
  **exactly ten** files in `archetypes/`
- the registry wiring (section 6), the four chooser stills, and a real deck you have looked at

**Read first, in this order:**

1. `docs/HANDOFF-new-look.md` — the registration surface: every file and registry, and the three that fail
   *silently* if you miss them. Do not start without it.
2. `docs/HANDOFF-look-craft.md` — the ways a new look comes out ugly, measured in this repo.
3. `workspace/.claude/skills/aura-slide/looks/_shared/LOOK-BASE.md` — the rules every look obeys.
4. `workspace/.claude/skills/aura-slide/looks/clay-pop/LOOK.md` — the best model for the brand layer you will write.

---

## 2. The one real engineering problem: this look needs photographs, and Lumi may not have any

Every other Lumi look draws or renders its pictures, so it can always make one. **This look's primary visual is a
photograph** — twelve of the sixteen reference slides carry one. And `LOOK-BASE.md:442` says, without exception:

> **Photos.** Ask the user every time a slide wants a photo; never stand in a stock, generated or placeholder picture.

That rule is right and you are not allowed to break it. There is no stock library, you may not generate one, and
a grey box with "image" in it is worse than nothing. Meanwhile a person may finish the whole interview without
putting a single photograph in `Images and photos`.

**So the brief's central question is: what does a Violet Lime slide become when there is no photograph?**

Answer it in the `LOOK.md` and build it, because it is the common case, not the edge case. The shape of a good
answer:

- **Every photo-carrying archetype has a no-photo form that is a deliberate composition, not a hole.** The
  violet ground, the lime accent and the rounded geometry are strong enough to carry a slide on their own —
  prove it. A card that would have held a photograph becomes a colour field with the slide's one number or
  phrase in it.
- **Decide once, per slide, and never half-way.** A slide with three photo slots and one photograph is the worst
  outcome. If there is one picture, one slide gets it.
- **Say so out loud in the deck flow.** Lumi already asks for files; a look that depends on photographs should
  make that need visible early rather than discovering it at slide 7.

Get this wrong and the look is unusable for the decks Lumi actually makes. Get it right and it is the first look
that handles a person's own photographs properly, which none of the other seven do.

---

## 3. What the reference actually is

### 3.1 Colour — two, and only two

| role | value (measured off the reference) | job |
| :--- | :--- | :--- |
| violet | ≈ `#3D2EE6` | the ground on half the slides, and the headline colour on the other half |
| lime | ≈ `#D2F53C` | **one** thing per slide: a CTA pill, one card, one number, one donut segment |
| white | `#FFFFFF` | the other ground, and card surfaces on violet |
| ink | near-black, ≈ `#15151A` | body text on white and on lime |

**The lime never touches more than one element on a slide.** That is the whole discipline of the reference: on a
violet slide the lime is a single pill; on a white slide it is a single card. Two lime things and it stops
reading as emphasis.

**Ink on lime, never white on lime** — white on `#D2F53C` fails contrast badly. The reference always puts dark
text on the lime.

### 3.2 The two grounds, alternating

Measured across the sixteen: eight slides sit on white, eight on full violet. They alternate in runs of one or
two, and the closing is violet. This is not decoration — it is what stops a 28-slide deck feeling like one long
page. Build it as a class on the section, the way other looks carry `is-dark` variants, and make the rule
explicit in `LOOK.md`: **the ground alternates, and a run of three slides on the same ground is a fault.**

### 3.3 Geometry: rounded rectangles, at one radius

Everything is a rounded rectangle at a large, consistent radius (≈ 20–28 px at 1920): cards, photo frames, pills,
buttons, badges. Two details worth copying exactly:

- **Thin outlined rounded rectangles used as decoration**, bleeding off the canvas edge behind the content. They
  are empty frames, 2 px, in the ground's own contrast colour. They are what makes the empty space look designed.
- **Pills** — fully round-ended — for calls to action, year markers, tags and the lime accent. A pill and a card
  are the only two container shapes in this look.

### 3.4 Type

The reference uses one geometric grotesque throughout: heavy for headlines, regular for body, nothing else.

➡️ **Use Plus Jakarta Sans, `maxTypefaces: 1`.** It ships already (`PlusJakartaSans-200-800.woff2`, one variable
file, 26.7 KB), it is geometric with the right warmth, and used *alone* it is a different system from Clay Pop,
which always pairs it with DM Mono for its terminal labels. Poppins is the other candidate and is already carried
by three looks.

Headlines in the reference are large but **inside the safe zone** — this look does not bleed type off the canvas,
so leave `safeZonePx` at 96 and do not touch `deck_check.js`.

### 3.5 Pictures

- **Photographs** are the main visual, always in a rounded frame, often with one corner at a different radius.
- **No 3D.** Nothing in the reference is rendered. Set `LOOK_3D['violet-lime'] = 'threejs'` and say why in the
  `LOOK.md`: a Cycles render would produce the one picture this look never shows. `vl3d.js` still has to exist
  and export a global (a 3D slide must always resolve to an engine), but it is for the rare 3D slide, not the
  idiom.
- **Charts are flat and real**: donut dials with a figure in the middle, a simple horizontal timeline, a Gantt of
  task bars. The lime marks the one segment the slide is about.

---

## 4. The ten archetypes

Drawn from the reference's own compositions, deduplicated. Each must declare which `LOOK-BASE` §4 role it serves,
and each must have the no-photo form from section 2.

| # | name | the shape | role |
| :--- | :--- | :--- | :--- |
| 1 | `title-split` | headline and CTA pill left, photograph filling the right third | title |
| 2 | `about-pair` | violet ground, two photographs, one lime stat pill | what it is |
| 3 | `year-line` | white, a horizontal run of year pills with notes above and below | timeline |
| 4 | `team-grid` | violet, a grid of photo-and-name cards | people |
| 5 | `service-stack` | white, labelled cards stacked left, one picture right | what we do |
| 6 | `numbered-blocks` | big `01 / 02 / 03` blocks, exactly one of them lime | problems / findings |
| 7 | `voices` | violet, headline left, quote cards with small portraits right | testimony / quotes |
| 8 | `dial-row` | violet, three donut dials with a figure in each | key numbers |
| 9 | `step-arrows` | three cards with arrows between them | process / plan |
| 10 | `closing-thanks` | violet, photograph, a lime tab, the thanks and the names | closing |

---

## 5. Rules that apply without exception

- **Never stand in a photograph.** Section 2. This is the one that will tempt you at 2 a.m.
- **One lime thing per slide.** Two is a fault.
- **Ink on lime, never white on lime.**
- **One typeface.** `maxTypefaces: 1` is a hard error in `deck_check.js:454`, counted on the *rendered*
  first family, so a fallback that gets used counts.
- **The ground alternates.** Three in a row on the same ground is a fault.
- **No whole-slide filters** (`LOOK-BASE` §4.6), and no text inside a texture or a WebGL scene.
- Exactly **ten** archetype files — `test_instructions.py` asserts the count.
- Sizes, budgets and counts live in `hard-rules.json`; the `LOOK.md` quotes them and the test compares the two
  string for string. Write them once and copy.

---

## 6. File ownership — several sessions are live in this repo

Check `docs/CLAIM-*.md` before you touch anything; there were seventeen when this brief was written, and
**Red Gallery and Candy Grid both landed mid-build** while the last look was being made. Two consequences:

1. **Write `docs/CLAIM-VIOLET-LIME.md` first**, naming every file you own.
2. **Never `git checkout` a whole shared file to undo your own change.** `hard-rules.json`, `new_deck.js`,
   `looks.js`, `home.js`, `scenes/review.js` and `form_server.py` are edited by other sessions constantly. Patch
   your own hunks surgically, and re-read the file before each edit — another session may have reflowed the exact
   lines you matched on.
3. Anything you need in a file you do not own goes in `docs/REGISTER-VIOLET-LIME.md`, not into the file.

Files you will own outright: everything under `engine/deck/looks/violet-lime/`,
`engine/deck/themes/violet-lime.css`, `workspace/.claude/skills/aura-slide/looks/violet-lime/`.

---

## 7. How to tell it works, without the suites

1. `python tools/form-dev/test_instructions.py` — green. Adding the look to `hard-rules.json` creates about seven
   new assertions automatically.
2. Build a real deck: `node .aura/engine/tools/new_deck.js "..." --theme violet-lime`, paste three archetypes,
   **serve it over `http://` and look at it at 1920×1080 and 1366×768.** Not `file://` — that blocks the module
   loader and every 3D slide fails silently.
3. Screenshot *after* the entrance animation finishes, or you will diagnose a layout bug that is not there.
4. Browser console clean: no 404s, no failed fonts, nothing reaching the internet.
5. Build it twice — **once with photographs in `Images and photos`, once with none.** The second is the real
   test of this look.
6. Ask the owner before running `test_server.py` or the e2e; they are slow and touch a sandbox.

---

## 8. Report back, in two places

- `docs/STATUS-VIOLET-LIME.md` — what you built, what you found wrong in the brief (there will be something), and
  anything you left undone. Be specific: file and line.
- To the owner: one short message with the four chooser stills, and a straight answer to the question in section
  2 — what a slide looks like when there is no photograph.

If you conclude mid-build that the photo dependency makes this look unworkable inside Lumi's rules, **say so and
stop**, rather than quietly filling the gaps with placeholders. That finding would be worth more than the look.
