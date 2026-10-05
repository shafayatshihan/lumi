# What is enforced, and what is only advice

One table for every rule Claude is given: who actually enforces it, and what happens when it is broken. It lives next to the
skill because the skill is what Claude reads, and next to `deck_check.js` / `check_rules.js` so whoever changes a checker
changes this file in the same edit. **A test (`tools/form-dev/test_instructions.py`) fails when a message named below
disappears from the checker source**, so the table cannot quietly go stale. Numbers are not repeated here: they are in the
table in `.claude/CLAUDE.md` and in `.aura/engine/rules/hard-rules.json`.

**Three kinds of enforcement exist, and they are not equal** (Batch E made the first one real):
1. **Hook (automatic, blocking).** `check_rules.js` runs after every HTML file Claude writes (`PostToolUse`: text size, and did the 3D
   scenes start) and before it finishes (`Stop`: the FULL `deck_check.js` on the deck being built in this run). A failure is sent back to
   Claude. `Stop` checks exactly the files this run wrote (the app writes `.aura/temp/current-run.json`); nothing written = nothing
   checked, and other decks and `Older versions/` are never looked at. Both hooks serve the deck over http (three.js cannot load from
   `file://`) and probe the page after it loads; a deck that could not be rendered is reported as "could not verify", never passed.
   The `Stop` pass is skipped once per turn (`stop_hook_active`) so a stubborn failure cannot loop forever.
2. **Server check (automatic, advisory).** After every build step the Lumi server runs `deck_check.js` on that deck and puts the result in
   the chat ("Lumi checked slide 3: clean" / "2 problems left"), and compares the other slides before and after the step ("Claude also
   changed slide 2").
3. **App (server and page).** The Lumi server and page refuse or repair things on their side (plan clashes, locked steps).

**Honest limits of the automatic checks.** They can only see what a headless Edge renders at 1920x1080: no software-GL difference, no
second monitor, no Firefox, no real projector. Contrast is measured on the deck's own frozen still frame (deterministic: three runs
give identical numbers), against the picture behind the text; text on a DOM-painted pill is measured against the pill only when it sits
on the page background. The number check traces numerals, not meaning (see "Never invent data" below).

## Checked by `deck_check.js` (ERROR = must fix; warn = advice)

| Rule | Level | Notes |
|---|---|---|
| Text under the floor (`HARD RULE: text is …px`) | error, also by the hook | the hook is the only automatic one |
| Bold Blue body text under its body minimum (`keeps text at`) | error, also by the hook | exemptions: footer, page number, captions, chart step labels |
| More than one main visual (`main visuals`) | error | a 2D canvas loop counts as a diagram; on a slide that already has a 3D scene, a canvas is part of the 3D, not a second visual |
| More than 3 stats / facts (`stats / facts`) | error | |
| Chips: more than 3 (`chips`), or chips without a chart | error | |
| Insets: more than 1, or an inset without a photo (`inset`) | error | a picture over 15 % of the slide counts as a photo (a logo in `.bb-mark` / `.bb-logo` / `[data-logo]` does not) |
| More than 3 zone rows (`zone rows`) / 4 checklist rows (`checklist rows`) | error | |
| More than 4 projected labels (`projected labels`) | warn | |
| Text inside the 96 px edge band (`edge safe zone`), text cut off (`cut off`) | error | |
| A picture that did not load (`did not load`) | error | |
| Too many words for the slide kind (`words; a`) | error | numbers in the `CLAUDE.md` table; presenter mode by default |
| Contrast 4 to 4.5:1 (`aim for 4.5:1`) | warn | measured on the deck's frozen still frame; the number does not move between runs |
| More typefaces than the look allows (`typefaces`) | error | |
| A font that failed to load (`failed to load`) | error | |
| A 3D scene that did not start (`did not start`) | error | also in the hook (B-02) |
| A 3D slide without a loop period, or a loop with a seam (`seamless`) | error | the capture contract the Finalize step needs |
| A studio render (Blender) missing from the slide (`is not in the deck yet`), or only a draft preview (`shows a preview, not the approved render`) | warn while building; error with `--finalize` | the user has not approved / rendered it yet. Finalize itself also stops (see below) |
| A studio render that cannot be read (`could not be read`): picture does not decode, loop video missing or does not open | error | |
| A studio render of the wrong size (`a still must be`, `a loop must be`) | error | 1920 x 1080 still; 1280 x 720 or 1920 x 1080 loop |
| A loop at the wrong frame rate (`loop runs at`) | error | 20 fps |
| A studio render whose edges are not the slide's canvas colour (`background is not the slide colour`) | error | corners, left and top edge within 3 levels of the slide's own colour; `lumi_bpy` composites to the exact colour and fades the floor shadow out at the frame edge |
| A black render (`looks black`) or a blank one (`is blank`) | error | pixel statistics: mean brightness, black fraction, share of pixels that are not the background; a video is measured on its first, middle and last frame |
| A loop that jumps when it restarts (`loop is not seamless`) | error | the step from the last frame to the first against the normal frame-to-frame step |
| A studio render over its file budget (`stays under`) | error | still 6 MB; 720p loop 14 MB; 1080p loop 30 MB (hard-rules.json -> blender) |
| A label with no anchor point in the render (`no anchor point`) | warn | the label stays hidden until `L.anchor('<name>', ...)` gives it a place |
| Text outside any slide (`text outside any slide`) | error | |
| Anything that needs the internet | error | blocked network request |
| A slide that is not 1920 x 1080 (`1920 x 1080`) | error | |
| A number that is in no file and no provenance entry (`has no provenance entry`) | error | B-05 / L-05: traced against the extracted text of the user's files and `provenance.json` |
| A "source" number the extracted files do not contain (`does not contain it`) | error | the Figure 6 colour-bar case, when mislabelled |
| A figure-read number with no figure or no region (`gives no readFrom region`) or whose region is cropped away (`crops that region away`) | error | never crop out the part of a figure a number came from |
| A published number with no citation (`has no citation`), a computed one from untraced inputs (`is computed from`) | error | |
| An illustrative number the slide does not mark (`does not say so`), or not declared in the speaker notes (`speaker notes must`) | error | |
| A number read off a figure by eye (`read off`) | warn | listed so the person can check it |
| A banned default prop in a 3D scene (`default prop`) | error | wooden base, plinth, stand, gauge, vial, beaker, lab bench unless the slide's own text is about it |
| An empty half-column with no other visual (`half-column`) | error | L-15: the closing slide's empty right column |
| More than one accent phrase in a headline (`accent phrases`) | error | |
| Speaker notes outside 60-300 words (`speaker notes are`) | warn; error under 30 or over 450 | |
| The title slide misses a name or detail the brief gives (`title slide is missing`) | error | presenters, supervisor, institution, event, date (year) |
| More than 5 process steps (`steps; a numbered`) | error | `.bb-steps` has its own cap now, no longer counted as stats |
| Contrast 3 to 4:1 (`contrast`), large text (48 px+) under 3:1 | error | L-04: no longer a warning; the message names the measured colours and a colour that clears 4.5:1 |
| More sizes than allowed on a slide or in the deck (`text sizes`) | warn | |
| Sizes off the type scale (`not on the type scale`) | warn | |
| Not enough empty space (`empty space`) | warn | |
| Overlapping texts (`texts overlap`) | warn | |
| A font that is not embedded (`not an embedded font`) | warn | |
| Gradient text (`gradient text`) | warn | contrast not measured there |
| Missing speaker notes (`no speaker notes`) | warn | only with `--notes`; length is checked whenever notes exist |

**Studio renders (Blender slides) and Finalize.** The Lumi server refuses to finalize (409 `blender-pending`) while a Blender slide has no full render, and asks (409 `blender-stale`) when a render is older than its scene; `finalize.js` itself stops with a plain message if a holder is empty or still shows a draft preview, and never records or re-renders a Blender slide (it is already a picture or a recorded loop). The checks above run on every slide that has a `.bb-blender` holder; `--finalize` turns "not in the deck yet" and "shows a preview" into errors.

`deck_check.js` exits 0 whenever there is no ERROR: warnings never block; exit 2 = it could not render the deck (never a pass). It
renders over http, so 3D slides are measured WITH their 3D (the report line `rendered: http, n of n 3D scene(s) drawn` says so).
`--stills` (and any slide with a contrast problem) also tries 7 candidate frames for the PDF still and names the best `data-still`.

## Checked by the app

| Rule | Where | What happens |
|---|---|---|
| One main picture per slide, companions its layout supports | server `normalize_plan`, plan page | strict on a page save (refused), lenient on Claude's file (repaired, logged) |
| Marker grammar | server `aura_markers`, page `markers.js` | a marker that cannot be read is reported to the person and logged, never dropped |
| `plan.json` ownership | server `claude_view`, `plan_drift` | the app's fields are not in Claude's copy and are restored if written; drift is logged |
| A question open on the slide being built | server `build_next` | the next step is refused (409) until it is answered |
| Word meter on the plan page | page | advice only; the same number `deck_check` enforces |
| Pack refuses a deck that needs the internet or is missing a file | `pack_deck.py` | blocks the pack |

## Advice only: nothing checks these

Each is still a rule Claude must follow. The last column says whether a checker rule would be cheap and worth adding.

| Rule | Stated in | Checker idea |
|---|---|---|
| Never invent names, citations or quotes; numbers with no digits ("twice as fast") | `CLAUDE.md` | numerals are traced (see above); the rest is advice. **Cannot catch:** a made-up number declared falsely as published or computed; a number that coincides with an unrelated one in the files; a number baked into a picture or 3D texture; whether a cited paper says what is cited |
| Subject-first 3D: show the real subject in its own setting | LOOK.md 4.0, step card | the banned props are checked (above); whether the subject is the right one is not |
| Variety between neighbouring slides and between decks (props, camera, composition) | LOOK.md 4.0 | hard |
| Showpiece fidelity checklist | LOOK.md 4.12 | partly: count material families, texture, shadows |
| The closing slide is designed per deck | LOOK.md section 2, step card | the empty column is checked (above); "designed" is not |
| No boxed flowcharts or default graphs | `CLAUDE.md`, `aura-blend.md` | hard |
| Build ONLY the named slide | `building.md`, step card | server side since Batch E: the other slides are hashed before and after the step and a change is reported in the chat (not undone) |
| Ask this slide's real design questions before building | step card | cheap, server side: a build step that ends with no `ask` and no earlier question on that slide is logged |
| A warning left unfixed is named in the reply | `SKILL.md` step 7 | not checkable |
| Question limits (5 doubts, 8 per message, 3 elsewhere) | `SKILL.md` "Asking questions" | the app shows any number; counting is cheap |

<!-- checks: deck_check.js = is not in the deck yet | shows a preview, not the approved render | could not be read | a still must be | a loop must be | loop runs at | background is not the slide colour | looks black | is blank | loop is not seamless | stays under | no anchor point | has no provenance entry | does not contain it | gives no readFrom region | crops that region away | has no citation | is computed from | does not say so | speaker notes must | read off | default prop | half-column | accent phrases | speaker notes are | title slide is missing | steps; a numbered | aim for 4.5:1 | HARD RULE: text is | keeps text at | main visuals | stats / facts | chips | inset | zone rows | checklist rows | projected labels | edge safe zone | cut off | did not load | words; a | contrast | typefaces | failed to load | did not start | seamless | text outside any slide | 1920 x 1080 | text sizes | not on the type scale | empty space | texts overlap | not an embedded font | gradient text | no speaker notes -->
<!-- checks: check_rules.js = LUMI HARD RULE 1 VIOLATED | LUMI CHECKER COULD NOT VERIFY THE DECK | LUMI DECK CHECK FAILED | a 3D scene did not start -->
