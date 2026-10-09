# Making a look that isn't ugly — the craft handoff

**Read `docs/HANDOFF-new-look.md` first.** That one is the plumbing: which files, which registries, which tests,
which silent failures. This one is the part it does not cover — how the thing actually *looks* when it renders,
and the specific ways a new Lumi look comes out cheap.

Everything below was measured in this repo during a look build that was cut. The look is gone; the failures were
real, each one cost a render cycle, and none of them is obvious from reading CSS. Where a line number is given it
was verified against the file.

---

## 0. The rule that outranks every other rule

**Render it at 1920×1080 and look at it. Not the CSS, not the tests — the picture.**

A look can pass every check in `deck_check.js` and still be ugly, because the checks measure contrast, sizes,
budgets and clipping. None of them measures whether a background reads as a place or as a smear. Your taste is the
only instrument for that, and it only works on pixels.

Three corollaries, all of which cost me a cycle:

- **Screenshot the slide AFTER its entrance animation finishes.** Slides stagger their content in. A shot taken
  2 seconds in shows a half-built slide, and you will diagnose a layout bug that does not exist. Wait 6+ seconds,
  or set the `aura-still` class that the entrance rules are already guarded on
  (`html:not(.aura-still) .slide.is-entering …`).
- **Test over `http://`, never `file://`.** `three.js` is loaded as an ES module through an import map; a
  `file://` origin blocks it on CORS, every 3D scene silently fails, and the slide renders with holes where the
  pictures should be. `python -m http.server` from the Lumi root is enough.
- **Check the page's console.** A 404 on a look script means your `LOOK_HEAD` entry is wrong and every 3D slide
  of that look will be blank in production.

---

## 1. The five ways a look comes out ugly

### 1.1 A background that is a gradient pretending to be a scene

If your look has an environment behind the content, the obvious first implementation is a big plane with some
vertex displacement and fog. **It will render as a gradient.** A smooth surface with a smooth fade has no detail
at any scale, so the eye reads a wash, not a place.

What actually makes it read as somewhere:

- **Scatter.** Hundreds to thousands of small instanced objects, denser near the camera. This is what gives the
  eye something to resolve. One rippled plane has nothing.
- **A clump is not a cone.** A single cone at ground scale reads as a traffic cone no matter what colour it is.
  Four or five thin blades leaning off one point read as something growing. This single change was the difference
  between "field of shapes" and "meadow".
- **Haze in small doses.** Enough to dissolve the horizon, not enough to flatten the foreground. Too much and you
  are back to a gradient with extra render time.

### 1.2 Light with no modelling

A key light high overhead (≈58°) lights the top of everything and casts almost nothing. Every object becomes a
flat silhouette of its own colour and the ground's shape disappears.

**Drop the sun low.** A raking light lays a shadow off every object down the slope, and the terrain's form becomes
readable. This is the single highest-leverage change in any 3D look, and it costs nothing.

Related: **a place is lit far softer than a subject.** Reusing a subject's key intensity on an environment blows
out the ground at grazing angles near the horizon, so the horizon becomes a band of glare instead of a horizon.
Roughly half the key, a third of the environment light.

### 1.3 The accent colour used for both scenery and meaning

If the look's dominant accent is, say, green, and the environment is also made of that green, then every
accent-coloured label, step number and chart series laid over it is **invisible by construction**. I shipped a
four-slide deck before noticing the step numbers had vanished into the grass.

**Scenery is a desaturated, darkened version of the accent — never the accent itself.** Mix it most of the way
toward the look's ground colour. The accent belongs to things that carry meaning.

### 1.4 A scrim that became a vignette

If type sits over imagery, you need a gradient plate behind it. Two mistakes make it look cheap:

- **Reaching full opacity at the canvas edge.** That reads as a dark bar down the side, not as light falling off.
  Start below full (~.88) and the edge stays soft.
- **Running it too far across.** Fade out by the middle, so the far half of the picture is untouched. A gradient
  that covers 60%+ of the slide is just a filter, and `LOOK-BASE` §4.6 forbids whole-slide filters for exactly
  this reason.

Anchor it to the side the type is on, and nothing else.

### 1.5 A backdrop plane, added to fake distance

The intuitive way to suggest depth behind terrain is a large pale plane further back. **Lit by the same key it
goes almost white**, it sits in front of the haze's useful range, and it renders as a glowing blob with the ground
in silhouette against it. Delete it; let the haze do the work.

---

## 2. Engine traps that will cost you a render

### 2.1 `.safe` — do not touch its `position`

`engine/deck/runtime.css:41`:

```css
.slide > .safe { position: absolute; inset: 96px; }
```

**That `position: absolute` is what gives the content column its height.** Override it to `relative` in your theme
— which is tempting, because you want a positioning context for a decorative layer — and every slide collapses to
its content, piling against the top edge with the footer floating underneath. It looks like a flex bug and it is
not. Use a different element for your positioning context.

### 2.2 The safe zone is a constant, not a setting

Every look's profile in `hard-rules.json` declares `safeZonePx`, and **`deck_check.js:94` ignores it**, hardcoding
`L < 94 || T < 94 || R > 1826 || B > 986`. If your look's signature is type bleeding past the canvas edge, it will
error on every slide and the profile key will not save you. Wiring the key through is a four-line change and is
backward-compatible (96 reproduces the constants exactly, tolerance included) — but it is a change to a shared
checker, so agree it with the owner rather than slipping it in.

### 2.3 `maxTypefaces` is a hard error, counted on what actually rendered

`deck_check.js:454` errors if the deck's rendered first-families exceed the look's `maxTypefaces`. It counts the
**rendered** family, so a fallback that actually gets used counts as a typeface. Name your faces exactly.

### 2.4 Fonts are inlined whole, with no subsetting

`pack_deck.py:91` base64-encodes the entire font file into every packed deck (+33%). A 351 KB variable `.ttf`
becomes ~467 KB in every deck that look makes, forever. **Prefer a single static `woff2` weight** if the face is
only used at one weight; a variable file is only worth it if you genuinely use the range. An external font URL is
not an option — it hard-blocks packing.

---

## 3. Blender traps, if your look renders stills

### 3.1 A World volume is infinite, and volume bounces default to 0

Adding a `Volume Scatter` to the World for atmosphere renders **a completely black frame**. The world volume is
unbounded, Cycles' `volume_bounces` defaults to 0, so every camera ray scatters once and the path terminates. It
costs you a full render to discover.

Put the haze in a **bounded box** around the set and set `scene.cycles.volume_bounces = 2`.

### 3.2 `lumi_bpy` builds subjects, not environments

`lumi_bpy` forces `film_transparent = True` and composites the result onto the slide's flat colour, including a
ramp that fades the outer ~12% of the frame to that exact colour. That is correct for a subject and wrong for an
environment, which must fill the frame and be opaque. If you need an environment, write a standalone `bpy` script
rather than fighting the library.

### 3.3 An environment must not go in a `.bb-blender` holder

Two global checks assume a Blender render is a subject floating on the slide colour:

- `blender_check.js` errors if the render's edge patches differ from the slide background by more than
  `edgeTolerance: 3` (`hard-rules.json:374`). A full-frame scene fails on every slide.
- `LumiLabel` derives the subject's silhouette by **taking the median of the frame's border ring as the background
  colour**. Fill the frame and the whole grid reads as occupied, the label placer runs out of candidate slots, the
  holder gets stamped `data-labels-crowded`, and that is a hard error.

**The workaround costs nothing:** put the environment in its own slide-level layer *behind* the `.bb-blender`
holder, and keep the subject in the holder on top. Neither check is weakened and the label placer still sees clear
space.

### 3.4 Know the cost before you design around it

A still is fixed at 1080p and takes minutes. An animation is ~80 frames — in the codebase's own words, *"a still
is minutes, an animation is most of an hour."* A full environment at 1920×1080 and 72 samples measured ~5 minutes
on this machine. That is fine **per deck** (one world, several camera framings) and ruinous **per slide**.

---

## 4. Type at display scale

- **Tight or it reads as words, not as an object.** Display sizes want roughly `letter-spacing: -.045em` and
  `line-height: ~.92`. If a headline wraps badly, **shorten the headline** — do not loosen the tracking to fix it.
- **Where the emphasis sits matters more than what it looks like.** An emphasis phrase at the *start* or *end* of
  a headline opens or closes the line and the lines stay even. Mid-sentence it splits the headline and the tail
  wraps with no emphasis on it: two ragged lines with a block floating between them. Measured across a real
  ten-slide deck: 7 of 8 headlines put it at an edge and read clean; the one in the middle is the one that looks
  broken. Write the rule into your `LOOK.md`.
- **A boxed emphasis inside very large type reads as a button.** At display scale, emphasise with weight and
  colour instead, and keep the boxed form for the one case where the headline lies on busy imagery.

---

## 5. Colour: owned or derived

Most looks **own** their palette — that is what makes a look a look. If you are asked to derive colour per deck
from the subject, the dangerous axis is not hue, it is **lightness**.

Derive hue and keep the lightness ladder fixed, and a timber deck comes out amber-and-bark while a cooling deck
comes out steel-and-cyan, both legible, both unmistakably the same look. Derive lightness too and every deck
re-rolls its own legibility, the contrast maths has to hold for colours you have never seen, and a run of slides
stops looking like one family.

If the owner insists on full derivation, say plainly what it costs and build it — but write the trade into the
spec so the next person knows it was a decision, not an accident.

---

## 6. Before you show anyone

- [ ] Rendered at 1920×1080, over `http://`, **after** the entrance animation, and looked at.
- [ ] Also at 1366×768. The stage scales; the composition should not break.
- [ ] Browser console clean — no 404s, no failed fonts, nothing needing the internet.
- [ ] Every 3D slide actually drew something (a missing `LOOK_HEAD` entry makes them silently blank).
- [ ] No accent-coloured text sitting on an accent-coloured field.
- [ ] Type at display size is tight, and the emphasis is at an edge.
- [ ] If there is an environment: it has scatter, a low sun, and haze you can see through.
- [ ] `python tools/form-dev/test_instructions.py` green.
- [ ] You would put this slide in front of a room without apologising for it.

That last one is the real test. Everything above is just the list of ways I failed it.
