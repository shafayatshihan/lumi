# Registration for the two new looks — Pink Punch and Happy Headspace

**Written by the three-looks session. Apply these edits; it did not touch any of these files itself.**

Everything under `engine/deck/looks/{pink-punch,happy-headspace}/`,
`engine/deck/themes/{pink-punch,happy-headspace}.css` and
`workspace/.claude/skills/aura-slide/looks/{pink-punch,happy-headspace}/` is written, rendered and checked.
What is missing is the wiring in files owned by other sessions. Each section below gives the exact text and where
it goes.

**Yellow Frame is NOT here.** It was cancelled by the owner at 23:10 (`docs/STOP-yellow-frame.md`) and every
`yellow-frame` path this session had written has been deleted again. Nothing below mentions it.

`new_deck.js`'s `THEMES` and `form_server.SHELL_THEMES` **already list both looks** — no change needed there.

---

## 1. `engine/tools/new_deck.js` — load each look's scripts, and point at its spec

Find `const LOOK_HEAD = {` (around line 200). The `flat-pack` entry ends with

```js
               '<script src="{{ENGINE}}/deck/looks/flat-pack/fp3d.js"></script>\n',
```

**Insert immediately after that line, before the closing `};`:**

```js
  'pink-punch': SHARED_HEAD +
               '<script src="{{ENGINE}}/deck/looks/pink-punch/pink-punch.js"></script>\n' +
               '<script src="{{ENGINE}}/deck/looks/pink-punch/pp3d.js"></script>\n',
  'happy-headspace': SHARED_HEAD +
               '<script src="{{ENGINE}}/deck/looks/happy-headspace/happy-headspace.js"></script>\n' +
               '<script src="{{ENGINE}}/deck/looks/happy-headspace/hs3d.js"></script>\n',
```

Then **replace** the `LOOK_SPEC` line near the bottom:

```js
const LOOK_SPEC = { 'bold-blue': 'Bold Blue', 'flat-pack': 'Flat-Pack' };
```

**with**

```js
const LOOK_SPEC = { 'bold-blue': 'Bold Blue', 'flat-pack': 'Flat-Pack',
                    'pink-punch': 'Pink Punch', 'happy-headspace': 'Happy Headspace' };
```

*Without the `LOOK_HEAD` entries a new deck in either look loads no `PP3D` / `HS3D` / chart helper and every 3D
slide is blank.* This exact patch was applied to a sandbox copy and used to build and render the test decks, so it
is known to work.

---

## 2. `engine/form_server.py` — the spec pointer and the 3D engine policy

**Replace**

```python
LOOK_SPECS = {
    'bold-blue': '.claude/skills/aura-slide/looks/bold-blue/LOOK.md',
    'flat-pack': '.claude/skills/aura-slide/looks/flat-pack/LOOK.md',
}
```

**with**

```python
LOOK_SPECS = {
    'bold-blue': '.claude/skills/aura-slide/looks/bold-blue/LOOK.md',
    'flat-pack': '.claude/skills/aura-slide/looks/flat-pack/LOOK.md',
    'pink-punch': '.claude/skills/aura-slide/looks/pink-punch/LOOK.md',
    'happy-headspace': '.claude/skills/aura-slide/looks/happy-headspace/LOOK.md',
}
```

**Replace**

```python
LOOK_3D = {'bold-blue': 'blender', 'flat-pack': 'threejs'}
```

**with**

```python
# Pink Punch is a screen print and Happy Headspace is a soft-lit form: Cycles would render the picture both looks
# refuse, at a hundred times the cost. Both are threejs, explicitly, so a 3D slide always resolves to an engine.
LOOK_3D = {'bold-blue': 'blender', 'flat-pack': 'threejs',
           'pink-punch': 'threejs', 'happy-headspace': 'threejs'}
```

`LOOK_3D_DEFAULT` is already `'threejs'`, so these two entries change no behaviour today — they are there so the
policy is written down rather than inherited by accident, which is what `BACKLOG B1` was about.

---

## 3. `engine/rules/hard-rules.json` — the numbers

Add both objects inside `"looks"`, beside `bold-blue` and `flat-pack`. **These are measured from the shipped CSS,
not estimated**: a script checked that every `font-size` in each theme is on its own scale, and the word budgets and
whitespace targets were set by rendering a full ten-slide deck per look at 1920 × 1080 and looking at it.

```json
    "pink-punch": {
      "name": "Pink Punch",
      "source": "Built from the Gumroad brand DNA (workspace/.claude/skills/aura-slide/brands/gumroad/brand-style.md, Firecrawl 2026-10-01) and the screen-print language: body 36 px, kicker 36 px, stat 48/64 px, headline 84 px, title 112 px, closing word 160 px; footer mark, page number, captions, count tags ('6x') and chart step labels 28 px. Two typefaces (Anton display, Work Sans text). Type scale 28/36/48/64/84/112/160. Measured at 1920x1080 on a ten-slide render, 2026-10-07.",
      "minFontPx": 28,
      "svgTolerancePx": 0.3,
      "bodyMinPx": 36,
      "bodyMinExempt": ".pp-foot, .pp-mark, .pp-pageno, .cap, .source, figcaption, .pp-count, .pp-cap, .pp-steplbl, .pp-cyc .step, .pp-rail .tr b, .pp-meta .lb, .pp-people .lb",
      "typeScale": [28, 36, 48, 64, 84, 112, 160],
      "wordBudget": {
        "title": 30,
        "section": 8,
        "content": 30,
        "quote": 22,
        "closing": 22,
        "references": 140,
        "document": 65
      },
      "whitespace": {
        "title": 0.5,
        "section": 0.7,
        "quote": 0.7,
        "closing": 0.6,
        "content": 0.4,
        "references": 0.3
      },
      "maxTypefaces": 2,
      "maxSizesPerSlide": 5,
      "maxSizesPerDeck": 7,
      "safeZonePx": 96,
      "bodyMinIsError": true,
      "bodyMinExemptNote": "28 px is allowed only for the footer mark, the page number, captions / source lines, the \"6x\" count tags, the process card's step line, the step rail digits, the .lb labels and the chart's step labels, bar names and event badge. Everything else is at least 36 px."
    },
    "happy-headspace": {
      "name": "Happy Headspace",
      "source": "Built from the Headspace brand DNA (workspace/.claude/skills/aura-slide/brands/headspace/brand-style.md, Firecrawl 2026-10-01) and the soft-volume language: body 36 px, stat 48/64 px, headline 88 px, title 116 px, closing word 168 px; kicker, footer mark, page number, captions, count tags and chart step labels 28 px in Reno Mono. Three typefaces (Quicksand display, DM Sans text, Reno Mono labels). Type scale 28/36/48/64/88/116/168. Measured at 1920x1080 on a ten-slide render, 2026-10-07.",
      "minFontPx": 28,
      "svgTolerancePx": 0.3,
      "bodyMinPx": 36,
      "bodyMinExempt": ".hs-foot, .hs-mark, .hs-pageno, .kicker, .cap, .source, figcaption, .hs-count, .hs-cap, .hs-steplbl, .hs-cyc .step, .hs-rail .tr b, .hs-meta .lb, .hs-people .lb",
      "typeScale": [28, 36, 48, 64, 88, 116, 168],
      "wordBudget": {
        "title": 34,
        "section": 10,
        "content": 32,
        "quote": 26,
        "closing": 22,
        "references": 140,
        "document": 70
      },
      "whitespace": {
        "title": 0.6,
        "section": 0.72,
        "quote": 0.72,
        "closing": 0.65,
        "content": 0.5,
        "references": 0.3
      },
      "maxTypefaces": 3,
      "maxSizesPerSlide": 5,
      "maxSizesPerDeck": 7,
      "safeZonePx": 96,
      "bodyMinIsError": true,
      "bodyMinExemptNote": "28 px is allowed only for the kicker (which is mono small caps in this look), the footer mark, the page number, captions / source lines, the count tags, the process card's step line, the step rail digits, the .lb labels and the chart's step labels and moment pill. Everything else is at least 36 px."
    }
```

**The one entry that differs from every other look: `happy-headspace` exempts `.kicker`.** In this look the kicker
is Reno Mono small caps at the caption size — that is the brand's own kicker, not a shrunken body line. In Pink
Punch the kicker is at the body size and is *not* exempt.

---

## 4. `workspace/.claude/CLAUDE.md` and `aura-dev-rel/.claude/CLAUDE.md` — the numbers table

Both files carry the same table under "## The numbers". It currently has four columns. **Add two more**, so the
header row and each body row gain a `Pink Punch` and a `Happy Headspace` column:

| | Pink Punch (`looks/pink-punch/LOOK.md`) | Happy Headspace (`looks/happy-headspace/LOOK.md`) |
|---|---|---|
| Text floor (error below) | 28 px, and only for the footer mark, page number, captions, count tags and chart step labels | 28 px, and only for the kicker, footer mark, page number, captions, count tags and chart step labels |
| Everything else | at least 36 px (error below) | at least 36 px (error below) |
| Type scale | 28 · 36 · 48 · 64 · 84 · 112 · 160 | 28 · 36 · 48 · 64 · 88 · 116 · 168 |
| Words per slide, presenter mode (error above) | title 30 · section 8 · content 30 · quote 22 · closing 22 · references 140 | title 34 · section 10 · content 32 · quote 26 · closing 22 · references 140 |
| Words per content slide, document mode | 65 | 70 |
| Typefaces per deck (error above) | 2 (Anton and Work Sans) | 3 (Quicksand, DM Sans and Reno Mono) |
| Main visuals per slide (error above 1) | the same | the same |

A six-column table may be wider than the owner wants to read. If so, the alternative that keeps the rule "one place
for the numbers" is to leave the table at Bold Blue and Flat-Pack and add one line under it:
*"Pink Punch and Happy Headspace have their own entries in `hard-rules.json`; their text floor is 28 px and their
body minimum is 36 px."* Either is fine — **do not let the table and `hard-rules.json` disagree**, since a test
asserts they are identical.

---

## 5. `engine/deck/lib/post-policy.js` — optional, and the default is already correct

Neither look takes post-processing. An unregistered look already gets none (`post-policy.js` header, rule 4), so
**nothing has to change for the behaviour to be right.** Register them only if you prefer the policy stated rather
than inherited:

```js
  LumiPostPolicy.register('pink-punch', { hero: 'off', body: 'off', closing: 'off', allowOnMeasured: false });
  LumiPostPolicy.register('happy-headspace', { hero: 'off', body: 'off', closing: 'off', allowOnMeasured: false });
```

Both engines already refuse a `post` option by name rather than ignoring it — `PP3D.bed` and `HS3D.room` throw with
an explanation — so a scene cannot switch it on locally either.

---

## 6. Skill-doc pointers

Wherever `SKILL.md`, `aura-blend.md` or `deck-toolkit.md` lists which looks have a `LOOK.md` of their own, the list
grows from two (Bold Blue, Flat-Pack) to four (+ Pink Punch, Happy Headspace). The sentence to keep true is the one
in `LOOK-BASE.md` section 9: *"A look without a `LOOK.md` of its own follows `aura-blend.md` plus this base."* After
this change the only look in that position is none — all four shipping looks have their own file.

---

## 7. What this session changed in files it owns, that you may want to know about

- Both engines gained a **`shift`** option (`PP3D.bed`, `HS3D.room`): it pans the camera sideways without re-aiming
  it, so a full-bleed title picture can sit clear of its own headline. This is the fix for the defect named in the
  work queue ("Flat-Pack shipped with its title colliding with its own figure"). **Flat-Pack still has that
  defect** — `FP3D.sheet` has no equivalent, and this session does not own `fp3d.js`. The three-line change is in
  `pp3d.js`'s `place()` if you want to port it.
- Three further defects were found in these archetypes and fixed here, and **all three also exist in Flat-Pack's
  own files**, which this session did not touch:
  1. `problem-stats` with three stats *and* a close line overflows the left column and runs under the footer at
     1920 × 1080. Fixed by using three stats or a close line, never both, with a comment in the archetype.
  2. The callout tag is anchored on the same side as the numbered pin, so the tag covers the pin. Fixed by putting
     pins on the left (`data-align="right"`) and tags on the right.
  3. `.fp-q` / `.pp-q` / `.hs-q` is a `<p>`, and a bare single-class selector **loses to `.slide p { margin: 0 }`**,
     so the gap above the closing line is silently dropped. Fixed here by prefixing the selector with `.slide`;
     `flat-pack.css` line with `.fp-q { margin: 44px 0 0; … }` has the same bug.
