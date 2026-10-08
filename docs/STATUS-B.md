# Part B — status

Brief: `docs/HANDOFF-B-screens.md`. Claimed in `docs/CLAIM-B.md`. Last updated 2026-10-08.

## Done

**B1 — three tiers, Opus + medium by default, and ticks you can see.**

- `engine/form_server.py`: `QUALITIES` is now `('just-right', 'maximum', 'balanced')` — Opus/medium (the default and
  the one with the "recommended" badge), Opus/high, Sonnet/high. The fourth tier is gone and so is the name
  "best quality". `quality_view()` gained `name`, the one plain word the page prints, because a tier id is no longer
  a word anyone would read.
- **Two of the three names meant a different pair before**: `maximum` was Opus/max, `balanced` was Opus/medium. A
  stored name is therefore not enough to know what an old deck was given, so `load_deck()` rewrites a pre-v2 record
  once by the pair it really had (`quality_v2`, `LEGACY_QUALITY`) and stamps `qualityV: 2`. Old `maximum` becomes the
  pair `opus/max` — still exactly what was chosen, now shown as a custom pair; old `best` lands on the new `maximum`;
  old `fast` on `sonnet/medium`. Nothing silently changes what an existing deck runs.
- `engine/form/js/quality.js`: three notes, the word comes from `name`, and the two hard-coded `'best'` fallbacks are
  gone.
- `engine/form/js/plan.js` + `engine/form/css/plan.css`: `.th-qual` is **out of `.th-left`**. It was inside the 330 px
  column Lumi stands in, so the model and effort ticks — and then the "plan my slides" button — were behind her. It is
  its own band now, under the look preview and left of the look list (x 470→1130, y 492), where the three tiers sit
  across the top and the advanced pair under them. **Lumi is not touched**: no `.th-lumi` rule changed, and Part A's
  uncommitted `.th-lumi` edit is intact.

**B2 — the plan page: nothing covered, nothing clipped.**

- The page used to start at a fixed `y 160` while the header above it grew with the cost lines, so a deck with the
  over-budget warning had the question strip drawn over "plan your deck", "9 slides · 4 questions for you" and the
  cost. `plan.js` measures both bands (`remeasure()`) and sets `--pl-main-top` and `--pl-strip-h`; `plan.css` uses
  them. The numbers left in the css are only the first-paint fallback.
- The deck strip was one `nowrap` row in a band pinned to 84 px. A real question — four answers, one of them a
  sentence — ran **445 stage px off the right of the stage** with the last chip cut in half, while the question text
  was squeezed into a 360 px column that overflowed the band downwards. It is a grid now: question left, answers
  wrapping right, text box and button under them, band grows to fit.
- Type came down one step (question 19 → 17, chips and the text box 18 → 16, the compact "suggested" tag to 14) as the
  owner allowed — but only after the layout was right, and nothing is under 14 px. The 12 px micro-labels are the two
  uppercase ones (`.ql-lab`) and the "recommended" pill.
- The slide list used to page at a flat 10, or 9 when a question was open, which assumed the old fixed geometry; a
  taller strip pushed the last row off the bottom. `perPage()` measures the room it actually has.
- `engine/form/js/editor.js` — **one change in Part C's file**, registered in `docs/REGISTER-B.md`: `qualityWord()`
  prefers `qualityView.name`. Without it the editor prints "balanced" for the default tier. Three added lines, no
  behaviour of C's moved.

## Rendered and measured

`tools/form-dev/_b_screens.html` draws both screens with the real modules and the real css; `_b_shot.js` drives them
in Edge at **1366x768 and 1920x1080** and fails on anything outside the stage, anything clipped inside its own box,
any text under 14 px that is not a micro-label, and anything drawn over the heading or the controls.

```
python tools/form-dev/_b_quality.py
python tools/form-dev/static_server.py 8791
node tools/form-dev/_b_shot.js final
```

Before: 27 problems (the two faults, measured). After: **clean at both sizes**, four screens each — the plan page, the
plan page with the per-slide question popover open, the look step, the look step with the advanced control open.
Shots in `%TEMP%\lumi-b\final\`.

## Tests

Asked first, then ran (owner said go):

- `tools/form-dev/pmb_quality_test.mjs` — 13/13.
- `tools/form-dev/test_postmortem_b.py` — 151/152. All 17 `Q` (quality) checks pass, including the two new ones for
  the one-time record rewrite.
- `tools/form-dev/test_server.py` — 1391/1393.

**The two failures are not Part B's**, and both were failing before my changes:

1. `N2 a planned slide that is not made yet is shown in its place, greyed and not clickable` — the check matches a
   literal string in `editor.js` that **Part C has rewritten** in the working tree (`title: made ? null : 'not made
   yet'` is now an `aimed ? ... :` expression). Part C: either restore the substring or update that check.
2. `settings: every toolkit script has its Bash + PowerShell allow rule` — `fetch_asset.py` and `research.py`, i.e.
   **Parts D and E**.

Tests I changed to match the new tiers: `test_server.py`, `test_postmortem_b.py`, `test_batch_c.py`,
`pmb_quality_test.mjs`, `e2e_walk.js`.

## Not run

`test_frontend.py --e2e`. I updated `e2e_walk.js` (three tiers, the names, that the ticks are really on top, and two
new plan-page checks for "nothing covers the heading" and "nothing leaves the stage") and it passes `node --check`,
but I did not run the walk: it drives the whole app, and Parts C, D and E are editing the pages it walks right now.
**Coordinator: run it once the tree is quiet.**

## Where the brief is wrong

- `engine/rules/hard-rules.json` `minFontPx` is **26**, and it is the rule for the *slides Lumi builds*, not for the
  app's own UI. There is no 14 px floor recorded anywhere in code. I treated the brief's 14 px (12 for micro-labels)
  as the rule for this screen and left `hard-rules.json` alone — it would break every built deck to touch it. The
  app's own written convention is in the header of `plan.css` ("labels never under 17 px"), which the quality control
  already broke before I arrived.
- The brief says the plan page's question card is `markers.js` `choiceCard`. It is not: `choiceCard` is the
  **interview and chat** card (`interview.js`, `workshop.js` — Parts C and D). The plan page's card is `doubtCard` in
  `plan.js`, in two places: the deck strip and the per-slide popover. I changed `doubtCard`'s compact layout and left
  `markers.js` untouched, so nothing of Part C's moved.
- `engine/form/css/plan.css` is not only the plan page: it also carries the look step's `.th-*` rules, including
  `.th-lumi`, which is **Part A's**. I touched no `.th-lumi` rule.

## Open

Nothing blocked. The one thing worth another pair of eyes: `maximum` and `balanced` now mean different (model, effort)
pairs than they did in v0.5.10. The record rewrite keeps every existing deck running exactly what it was given, but if
the owner would rather an old `maximum` deck simply became the new `maximum`, that is a one-line change in
`LEGACY_QUALITY` — say so and I will make it.
