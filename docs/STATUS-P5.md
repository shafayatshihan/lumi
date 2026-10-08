# STATUS — P5: build-page polish and the home illustration

Owner session: the coordinating one. 2026-10-08. **All four items done and looked at**, 1366×768 and 1920×1080,
against the real deck (`42a8d8b6c8cd`) in a sandbox at `X:\aura-dev-p5`.

## Two corrections to the brief

I wrote HANDOFF-P5 from a grep. Two of its four diagnoses were wrong, and anyone reading the brief later should
know the shipped fix does not match it.

**P5.2 — "there is no `.ws-aim` rule in `components.css`".** True, and irrelevant: the rule is in
`studio.css:320`, and it was never the bug. The real one is `theme.css`. The quiet build-page chat hides
`.ws-head`, `.ws-body`, `.ws-hints`, `.ws-clip` and `.ws-jump` — but not `.ws-aim`, which Part C added after that
list was written. So with a slide in scope the panel carried **two** captions: a `::before` on `.ed-chat` floating
30 px *above* the panel at `left:8`, and `.ws-aim` just inside it at `left:14`. Two sentences, 23 px apart, on
two different left edges, one of them outside the card it belonged to. That is the "misplaced" the owner marked.

**P5.3 — "`.pl-big-s1`".** The button in the screenshot is "make next slide" = **`.bd-main`** (`plan.css:261`).
`.pl-big-s1` is the *dialog* button — `dlgBtn()`, "save", "close", "keep planning", the sign-in card. Shrinking it
would have resized every dialog in the app and left the button the owner pointed at untouched.

## What changed

**P5.1 — "coming up" scrolls** (`plan.css`, `editor.js`)

`paintUp()` renders every unbuilt slide; `UP_PER = 3` and the `+N more` button are gone. `.bd-up-list` scrolls on
the `.ed-strip-list` pattern (`overflow-y:auto`, `overscroll-behavior:contain`, thin thumb) — the wheel never
reaches the page behind it. Four things worth knowing:

- The box **shrink-wraps** (`height:auto` + `max-height`), so two slides left does not leave 300 px of empty pill.
- It is **430 px only while the chat is folded**: `#build:has(.ed-chat.is-quiet) .bd-up{max-height:430px}`, else
  252. `.ed-chat` opens at `top:272`, inside this column's strip; without the guard four rows would spend the
  whole build behind the chat panel.
- `paintUp()` runs on every poll, so it now **preserves `scrollTop`** across repaints.
- The `bd-alldlg` dialog is kept, as P2 needs it, reached from a quiet "see all" under the list. It no longer
  slices the list — it opens the whole set, and is hidden below two slides.

**P5.2 — one caption, not two** (`theme.css`)

If `.ws-aim` is showing it carries the caption (`.ws-aim-l` "about" hidden, caption as its `::before`) and the
floating `::before` is suppressed via `:has()`. If it is not (no slide in scope) the floater is the caption, as
before. Either way: one line above the input, starting at 26 px — `.ws-box`'s 10 px margin plus its 16 px padding,
so it lines up with the input's own text. Quiet panel 74 → 94 px, `top` 792 → 772.

**P5.3 — `.bd-main` 64 px/23 px → 56 px/21 px**, icon 24 → 22, padding tightened. It now matches `.bd-rest` and
`.bd-more` beside it and is primary by being the only filled accent control in the bar, not by being a banner.

**P5.4 — one character, and the card gets its own picture** (`studio.css`, `home.js`)

- The giant plush was **`#stage[data-mode=home] #char`** (`studio.css:11`), not `.hm-empty-lumi` as the brief
  said — `.hm-empty-lumi` only renders in the no-decks state, and the screenshot had a deck. It was `left:0`,
  480 wide: flush into the corner, so the page edge cut Lumi down her side and she read as a sticker. Now
  `left:96px` (the page gutter `#brand` uses), `400×225` (the size the editor already uses), still bottom-aligned
  on the stage floor, still 16:9 so `object-fit:cover` crops nothing.
- The **card's picture is its own again**: the slide-on-a-stand with the pencil and sparkles, restored from
  `8cbfa1d^`. The `.hm-sheet` / `.hm-pencil` / `.hm-spark` rules were left inert in `studio.css` through the round
  the character photo sat there, so the animations came back with it. `.hm-new-art` back to 228×134 and the
  whole-element bob dropped (the sheet does its own, so it was doubled).
- The rule I settled on, since the brief left it open: **the character appears once on home, in the corner; the
  card shows the thing the card makes.** This is not a drawing of the character and never stands in for one — it
  is the same flat token geometry as `EMPTY_ART`, which survived the 2026-10-08 cut precisely because it draws
  objects, not Lumi.

## Files touched

`engine/form/css/plan.css`, `engine/form/css/studio.css`, `engine/form/css/theme.css`,
`engine/form/js/editor.js` (`paintUp()` and the column's construction only), `engine/form/js/home.js`,
`docs/CLAIM-P5.md`, `docs/STATUS-P5.md`, `docs/REGISTER-P5.md`.

`theme.css` is **not** in P5's owned list — the `#build .ed-chat.is-quiet` block lives only there. It was clean
when P5 started and P2's `.bd-q*` queue rules had landed in it by the time P5 finished; the two edits are in
different blocks and neither touched the other. Noted in the register.

## Verified

- Real `form_server.py` on the sandbox, real deck, Edge via Playwright, both viewports.
- **No console errors and no failed requests** on either render.
- Measured (stage units): `.bd-up` 348 wide, 252 → 430 cap and shrink-wrapping; 6 rows, no `+N more`;
  `.bd-main` 232×56; quiet chat 348×94 at y 772 with `.ws-aim` visible on one line; `#char` clear of the left edge.
- 16-row stress: `scrollHeight` 830 vs `clientHeight` 336, `overflow-y:auto`, box honours the cap, "see all"
  stays pinned below the list rather than scrolling away with it.
- `#char`'s plate against the page background measured at 2–3/255 — within what the existing edge mask handles.

## Not done

- `test_server.py` and the e2e were not run (brief rule 3 — ask first).
- `.bd-up-more` in `theme.css:168` is now dead CSS. One line, left in place; `theme.css` is not mine and P2 may
  be in it — P2's queue rules landed there mid-task. Safe to delete whenever that file is quiet. (Part C left
  `.ws-thread` / `.ws-th-b` in `components.css` the same way.)
