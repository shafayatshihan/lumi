# Adding a new look to Lumi — a handoff

**For a session starting cold.** You have the repo and nothing else. This tells you what a look is made of, what
will silently break if you miss a step, which parts of the system will actively fight an unusual look, and the
decisions worth settling with the owner *before* you write a file.

Everything with a `file:line` below was verified by reading that file in October 2026. Where a fact was not
verified it says so.

> **`docs/new-looks-registration.md` is the precedent for this job** — the checklist written when Pink Punch and
> Happy Headspace were added. Read it, but note it predates Clay Pop, so its "already listed, no change needed"
> notes are stale. The surface below is current.

---

## 1. Settle these with the owner before building

A look is not a stylesheet. Most of the cost and nearly all of the risk sits in decisions that are invisible in
the CSS. Ask these first, and get answers — not guesses.

1. **Sibling, mode, or new family?** A sixth look that shares the existing spine (a figure on a flat studio
   colour, type beside it) is one `LOOK.md` and one theme. A *mode* that any look can enter grows a conditional
   in every rule in the system. A new family means a second set of base rules. Build one sibling first.
2. **What is the picture *of*?** Decoration, or the subject? A look whose pictures are atmosphere generates
   wallpaper, and wallpaper behind text is the fastest way to make a deck look cheap. Lumi picks pictures
   automatically for arbitrary topics — "a forest" fits a timber deck and nothing else.
3. **Photoreal or stylised?** Lumi generates geometry procedurally in Python. Nobody procedurally generates
   convincing grass in a 90-second render. What makes a reference deck look expensive is usually composition —
   scale contrast, crop, negative space, a confident palette — not photorealism. Those are free.
4. **Typefaces.** See §4. Adding a face is a licence question with a real policy behind it.
5. **Palette: owned or derived?** Owned means the look has an identity. Derived means every deck re-rolls, and
   if *lightness* is derived too, contrast is re-rolled with it. Deriving hue alone keeps a fixed legibility
   ladder; deriving everything does not.
6. **One world per deck, or one per slide?** Varying the camera inside one world reads as designed. Changing the
   world every slide reads as a stock-photo search, and costs N times the setup.
7. **Who decides per-slide variation — a rule or Claude's judgement?** Judgement is right about seven times in
   eight. On a ten-slide deck, budget for one slide per deck where the call is wrong.
8. **Which checker rules may be broken?** "All" is not implementable — see §6.

---

## 2. The registration surface

A look `<slug>` / `<Name>`. Miss any of these and the failure is usually silent.

### Files the look ships

| Path | Note |
|---|---|
| `engine/deck/themes/<slug>.css` | **must set `--aura-look: <slug>`** on `:root` — this is how both checkers identify the look |
| `engine/deck/looks/<slug>/template.html` | first line `<html lang="en" data-look="<slug>">`; if this disagrees with the CSS token, `deck_check.js:322` warns and **drops to generic rules** |
| `engine/deck/looks/<slug>/archetypes/*.html` | **exactly 10 files** — asserted by `tools/form-dev/test_instructions.py:283-286` |
| `engine/deck/looks/<slug>/<slug>.js` | chrome and chart helpers |
| `engine/deck/looks/<slug>/<x>3d.js` | the 3D engine — see below |
| `workspace/.claude/skills/aura-slide/looks/<slug>/LOOK.md` | the brand layer — see §3 |
| `engine/form/themes/<n>-<slug>-1..4.jpg` | **four real slide stills** for the chooser |

**The 3D engine file.** It is a plain classic script that assigns **one global** — `window.BB3D`, `window.CP3D`,
`window.FP3D`, `window.HS3D`, `window.PP3D` — with a re-entry guard (`if (window.XX3D) return;`). **`runtime.js`
has no registry of look engines**; it only knows `Aura.scene(id, setup, {period})` (`engine/deck/runtime.js:1137`)
and the `.aura-3d[data-scene]` holder. The slide's own inline code calls the global. So the only wiring is the
`new_deck.js` `LOOK_HEAD` entry plus whatever the `LOOK.md` tells Claude the API is. All four three.js engines
create their renderer with a **transparent clear colour** so the slide colour shows through
(`pp3d.js:211,218-220`, `hs3d.js:178,187-189`, `fp3d.js:153,158-160`, `cp3d.js:236`).

### Registries to edit

| File | What |
|---|---|
| `engine/form_server.py:633` | `LOOK_SPECS` — slug → `LOOK.md` path |
| `engine/form_server.py:650` | `LOOK_3D` — slug → `'blender'` \| `'threejs'`. `LOOK_3D_DEFAULT` (:652) is `'threejs'`, but a test asserts `set(LOOK_3D) <= set(SHELL_THEMES)` |
| `engine/form_server.py:1809` | `SHELL_THEMES` — **miss this and Lumi silently stops making the deck shell for the look** (gates `look_theme()` :1812 → `ensure_shell()` :1828 → `new_deck.js --theme`) |
| `engine/tools/new_deck.js:20` | `THEMES` — slug → display name |
| `engine/tools/new_deck.js:203` | `LOOK_HEAD` — the `<script>` tags. **Missing entry ⇒ every 3D slide of that look renders blank** |
| `engine/tools/new_deck.js:231` | `LOOK_SPEC` — slug → name |
| `engine/rules/hard-rules.json` → `looks.<slug>` | the numbers — see §3 |
| `engine/form/js/looks.js:8` | `LOOKS` array (`slug` is `<n>-<slug>`, the numeric prefix is the image-set id) |
| `engine/form/js/looks.js:28` | `SWATCH` — inline SVG keyed by **display name**. Missing ⇒ the option renders blank |
| `engine/form/js/scenes/review.js:9,191` | `LOOKS` + `DRAW` — a hand-drawn canvas mini-render per look |
| `engine/form/js/home.js:42` | `LOOK_DOT` — the library-row colour dot, keyed by display name |
| `engine/deck/lib/post-policy.js:223` | optional `register(...)`; unregistered means *no post*, which is a safe default |
| `workspace/.claude/CLAUDE.md` + `aura-dev-rel/.claude/CLAUDE.md` | the "## The numbers" table — a test asserts it matches `hard-rules.json` word for word |

`look_slug()` (:655) and `look_of()` (:981) are generic — no change. `BOLD_BLUE` (:631) is a back-compat alias,
not an enumeration — no change.

### Stale fixtures you will have to fix

- `tools/form-dev/test_instructions.py:26` — a hardcoded list already stale against the five shipped looks.
- `tools/form-dev/test_server.py:664-665` — hardcoded `word_cap` values per look.
- `tools/form-dev/fake_claude.py:512`, `test_server.py:517` — interview fixtures listing look options.

---

## 3. `LOOK.md` and `hard-rules.json` are coupled, and tested

`hard-rules.json` lives at **`engine/rules/hard-rules.json`**. A look's entry **replaces every generic number**,
merged at `deck_check.js:319-321`. Keys (identical across all five looks): `name, source, minFontPx,
svgTolerancePx, bodyMinPx, bodyMinExempt, typeScale[], wordBudget{title,section,content,quote,closing,references,
document}, whitespace{}, maxTypefaces, maxSizesPerSlide, maxSizesPerDeck, safeZonePx, bodyMinIsError`.
`blender` and `pictureMix` are **global**, not per-look.

`LOOK.md` is a brand layer over `looks/_shared/LOOK-BASE.md`. The base is brand-free and a test forbids any hex,
px size or typeface name in it (`test_instructions.py:270-272`). Your `LOOK.md` **must**:

1. contain the literal string `_shared/LOOK-BASE.md`;
2. list **every** word budget as `"<key> <value>"` plus the `document` number, matching `hard-rules.json`;
3. render the type scale as `28 / 36 / 48 / …`, exactly equal to the JSON;
4. state the 3D-engine policy explicitly — contain `LOOK_3D` and `Blender`.

**Adding the look to `hard-rules.json` automatically creates ~7 new test assertions** it must satisfy
(`test_instructions.py:273-291` loops `for slug in sorted(rules['looks'])`). Structure to copy:
`clay-pop/LOOK.md` — §1 tokens, §2 archetypes, §3 figure idiom, §3A illustration idiom, §4 charts, §5 voice,
§6 before the checker. `bold-blue/BLENDER.md` is declared look-neutral and referenced by every Blender look.

---

## 4. Fonts

- `engine/fonts/` is flat: 18 files, licences in `engine/fonts/licenses/` — SIL OFL 1.1 for everything except
  Reno Mono (CC BY 4.0). **Every shipped family's licence is stated in the repo.**
- **There is a policy.** `docs/HANDOFF-clay-look.md:206-207`: *"only public-licence fonts ship… Do not name a
  face that is not in that list."* A new face means fetching it, adding its licence file, adding it to
  `tools/fetch_fonts.py` `FAMILIES`, and amending that list.
- **Fonts are base64-inlined whole into every deck, with no subsetting** (`pack_deck.py:88-95`). Pink Punch's
  Work Sans is a 351 KB `.ttf` → ~467 KB in *every* deck it makes. Prefer a static woff2 weight (~8–40 KB) over a
  variable font if only one weight is used.
- **An external font URL hard-blocks packing** (`pack_deck.py:72,142`): *"fonts must come from
  .aura/engine/fonts"*. This is not a check you can ignore — packing fails.
- `maxTypefaces` is per-look and a **hard error** at `deck_check.js:449`, counted on the *rendered* first family,
  so a fallback that actually gets used counts too. Current values: generic 4, flat-pack 1, bold-blue 2,
  pink-punch 2, clay-pop 2, happy-headspace 3.
- **The face never reaches PowerPoint.** `export_pptx.py` ships one full-bleed JPEG per slide — no live text, no
  fonts. `finalize.js`'s PDF is images too. Only `export_pdf.js` carries live text with embedded subsets. So the
  face only has to rasterize well at 1920×1080.
- Already shipped but used by **no look**: Epilogue Black, DM Sans Regular, Open Sans, Source Serif 4 — these are
  the app UI's fonts. A display face that is new *to the looks* can be free.

---

## 5. If the look wants a full-bleed environment, read this first

A Blender render is, by construction, **a subject floating on the flat slide colour**. Five mechanisms enforce
it, all global, none with a per-look opt-out:

1. `lumi_bpy.py:254` — `film_transparent = True` **always**; `_composite()` (:1105-1131) ramps the outer ~12% of
   every frame to the exact flat background so soft shadow never reaches the edge.
2. `blender_check.js:229-230` — samples edge patches and **hard-errors** if they differ from the slide background
   by more than `edgeTolerance: 3`. A scene filling the frame fails on every slide.
3. `blender_check.js:224` — `blackFracAbove 0.9`, `meanLumaBelow 30`: a moody environment reads as *"looks
   black — the camera, the lights or the scale are wrong"*.
4. **`LumiLabel` derives the subject silhouette by taking the median of the frame's border ring as the background
   colour** (`runtime.js:~500-512`). Fill the frame with scene and the whole grid reads as occupied, every
   candidate slot scores badly, the holder gets `data-labels-crowded`, and `deck_check.js:387` makes that a hard
   error.
5. Text over it is contrast-policed against a text-hidden screenshot (`deck_check.js:394-400`) — error below 4:1,
   3:1 at ≥48px — and `LOOK-BASE §4.6` bans the usual mitigation, a whole-slide filter.

**The workaround that costs nothing:** put the environment in its own slide-level layer *behind* `.bb-blender`,
and keep the subject in the holder on top. The Blender checker never inspects the background, and the label
placer still sees a subject with clear space around it. Nothing is weakened.

Other facts worth knowing:
- Full-bleed holders already exist — `bb-full` (`bold-blue.css:178`), `cp-full` (`clay-pop.css:194`) — and
  `title-hero` is full-bleed in all five looks.
- `runtime.css:159-160` uses `object-fit: contain`, **never cover**, deliberately: *"a crop would cut through the
  floor shadow."*
- **There is no alpha video.** The encoder is `libx264 … -pix_fmt yuv420p` (`form_server.py:5710`). An overlay
  loop would composite as an opaque rectangle. `.webm` appears in two MIME tables but nothing produces it. For
  motion over a still, use a transparent three.js canvas instead — every look engine already does this.
- `BLENDER_FILE_RE` (`form_server.py:4724`) allowlists exactly `final.png`, `final.mp4`, `final-poster.png`,
  previews and bake files per slide. A new artifact type is not servable without editing it.
- **Cost.** A still is fixed at 1080p and takes minutes. An animation is ~80 frames at 20 fps — the codebase's own
  words: *"a still is minutes, an animation is most of an hour."* An environment rendered per slide in Cycles
  makes the look an overnight job every time a word changes.

---

## 6. "Turn the checker off" is not a setting

`hard-rules.json:3` states it as an invariant — *"they override every other rule, brand style and user request,
and cannot be switched off from a prompt; the checking itself never switches off"* — and `check_rules.js:18`
repeats it. It runs as a **Claude Code hook** from `.claude/settings.json`, on Stop.

More important than the gate: `check_rules.js:103` is what tells Claude *"Fix the listed problems, then run
`deck_check.js` and repeat until it prints RESULT: clean."* **That line is Claude's definition of done for a
slide.** Remove it and the build has no completion criterion.

The three species of check, which need different answers:

1. **Taste** — one `.em` per headline, figure never inside a card, word budgets, `maxTypefaces`, type scale,
   whitespace. Break these freely; that is what a look *is*.
2. **Integrity** — text clipped off-slide, broken pictures, non-embedded fonts, anything needing the internet,
   slide not exactly 1920×1080. These are preconditions for the file existing. `export_pptx.py` screenshots at
   exactly 1920×1080; a different size crops rather than looks daring.
3. **Readability** — contrast floors, `minFontPx: 26`.

**The right mechanism for "this look has no rules" is a permissive `hard-rules.json` profile, not a disabled
hook.** Give the look its own type scale, word budgets, `maxTypefaces` and no contrast floor, and there is no
rule left for it to break — while Claude keeps "repeat until clean".

---

## 7. Build order

1. Agree §1 with the owner. Write the answers down before coding.
2. `hard-rules.json` entry + `LOOK.md` **together** — they are tested against each other, and getting them
   consistent first makes every later test failure meaningful.
3. `themes/<slug>.css` with `--aura-look`, and `looks/<slug>/template.html` with `data-look`.
4. The 3D engine (`window.XX3D`) and `<slug>.js`.
5. The ten archetypes. Build them as real slides and **look at them rendered**, at 1366×768 and 1920×1080.
6. Registries: `new_deck.js` ×3, `form_server.py` ×3, then the UI (`looks.js`, `review.js`, `home.js`).
7. Four real chooser JPEGs — render them from actual slides, not mockups.
8. `CLAUDE.md` numbers table, and the stale fixtures in §2.
9. `python tools/form-dev/test_instructions.py` (expect ~7 new assertions), then the full
   `tools/form-dev/test_server.py`. **Ask the owner before running `test_server.py` or the e2e** — they are slow
   and touch a sandbox.

---

## 8. Definition of done

- A real deck built in the look, rendered and **looked at**, not just tested.
- `test_instructions.py` green, `test_server.py` green.
- The look appears in the chooser with its swatch, its four stills and its dot.
- A 3D slide in the look renders rather than going blank (this is the `LOOK_HEAD` trap).
- Nothing in §2's "stale fixtures" still names the old set of looks.

---
