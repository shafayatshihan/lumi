# REGISTER — Violet Lime: every line written in a file this session does not own

2026-10-09, a Claude Code session (Opus 5). Claim: `docs/CLAIM-VIOLET-LIME.md`.

Every edit below is **additive**: one key, one row or one entry for `violet-lime` / `Violet Lime`. Nothing
belonging to another look was changed, reordered or removed, and no shared file was reverted with `git checkout`.
Each anchor was re-read immediately before the edit.

## Shared files, and the one thing added to each

| file | the hunk |
| :--- | :--- |
| `engine/rules/hard-rules.json` | `looks."violet-lime"` spliced after `candy-grid`'s closing brace (line-addressed splice, no JSON reflow, so no other key's formatting moved) |
| `engine/form_server.py` | `LOOK_SPECS['violet-lime']`; `LOOK_3D['violet-lime'] = 'threejs'` + a two-line comment saying why; `'violet-lime'` appended to `SHELL_THEMES` |
| `engine/tools/new_deck.js` | `THEMES['violet-lime']`; `LOOK_HEAD['violet-lime']` (violet-lime.js + vl3d.js after `SHARED_HEAD`); `LOOK_SPEC['violet-lime']`; `violet-lime` added to the `--theme` usage line |
| `engine/form/js/looks.js` | one `LOOKS` entry (`slug: '9-violet-lime'`, placed above "Claude chooses"); one `SWATCH['Violet Lime']` |
| `engine/form/js/scenes/review.js` | `'Violet Lime'` appended to `LOOKS`; a new `violetLime(d)` draw function; `DRAW['Violet Lime']` |
| `engine/form/js/home.js` | `LOOK_DOT['Violet Lime'] = '#3d2ee6'` |
| `workspace/.claude/CLAUDE.md` | one cell appended to each of the 9 rows of "The numbers", and the theme count changed from seven to eight in two sentences |

## Collisions seen while working — another session is live in these files

**`form_server.py`, `new_deck.js`, `looks.js` and `review.js` changed under me mid-session.** Between my first read
and my first write, another session **removed `flat-pack`, `pink-punch` and `happy-headspace`** from
`LOOK_SPECS`, `LOOK_3D`, `SHELL_THEMES`, `new_deck.js` `THEMES` / `LOOK_HEAD` / `LOOK_SPEC`, `looks.js` `LOOKS`,
`review.js` `LOOKS` / `DRAW` and `hard-rules.json → looks`. My first patch attempt failed its own anchor assertions
rather than writing, I re-read every anchor, and all my edits went onto the new text.

I have **not** touched that work and have not restored those looks anywhere. Two things for whoever owns it:

1. `engine/form/js/looks.js` still carries `SWATCH` entries for `'Pink Punch'`, `'Flat-Pack'` and
   `'Happy Headspace'`, and `review.js` still defines `pinkPunch`, `flatPack` and `headspace`, now unreferenced by
   their `LOOKS` arrays. Harmless (a swatch is looked up by name), but dead.
2. `engine/form/themes/` still holds `1-pink-punch-*.jpg`, `3-flat-pack-*.jpg` and `4-happy-headspace-*.jpg`.
   I left them; `9-` is the next free image-set prefix either way (`7-` red-gallery, `8-` candy-grid).

## Asks of files I do not own

1. **`engine/tools/deck_check.js` — the companion counts are Bold Blue's class names only.**
   `deck_check.js:144-146` counts `.bb-stats > li`, `.bb-steps > li`, `.bb-chips > li`, `.bb-inset`,
   `.bb-goals > li`, `.bb-zones > li`. No look since Bold Blue uses those classes, so the caps in LOOK-BASE §3
   ("at most 3 stats", "at most 4 checklist rows", "chips go with a chart") are **enforced on bold-blue alone** and
   are honour-system everywhere else. Violet Lime keeps to them by hand; it would be a small change to match
   `[class$="-stats"] > li` or to let a look declare its prefix. Not mine to make.

2. **`engine/form/js/scenes/files.js` / `uploads.js` — the photo ask.**
   Violet Lime is the first look whose primary visual is the user's own photograph (`LOOK.md` §2A). The `LOOK.md`
   tells Claude to ask for photographs in the first build question, which is the part I can own. What I cannot: the
   **form** could say so too when Violet Lime is the chosen look — one line on the `Images and photos` card. That is
   a change in files.js/uploads.js, which I do not own.

3. **`LOOK-BASE.md` §6 "Photos" — a third option is now true.**
   The base says: *"Ask the user every time a slide wants a photo; never stand in a stock, generated or placeholder
   picture. No photo → choose another archetype."* Violet Lime obeys the prohibition exactly, but "choose another
   archetype" is not the only honest answer any more — a frame can hold a **drawing** (base 4.12, which the base
   itself already requires for ~30% of pictures) or a **colour plate** carrying the slide's own number. Suggested
   additive wording for whoever owns the base: *"No photo → choose another archetype, or give the slide a drawn
   figure (4.12) or a typographic plate, provided the slide composes around it rather than leaving a hole."*
   I did not edit the base; sessions E and F are additive-editing it.

4. **`engine/deck/lib/post-policy.js` — deliberately not registered.** Violet Lime is flat: no post in any tier.
   Unregistered already means no post, so nothing is needed; recorded here so nobody adds it "for consistency".

## Fixtures

`tools/form-dev/test_instructions.py` passes 117/117 with Violet Lime's six new assertions. Its `DOCS` list
(line 23) names only bold-blue and flat-pack `LOOK.md`s and was already stale before this session; I left it.
`tools/form-dev/test_server.py:664` hardcodes per-look `word_cap` values and does **not** yet name Violet Lime —
adding `fs.word_cap('Violet Lime') == 44` there is a one-line change I did not make, because I was asked not to run
`test_server.py` without the owner's say-so and I will not add an assertion I have not run.
