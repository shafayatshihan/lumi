# P5 — Build-page polish and the home illustration  *(the coordinating session is taking this one)*

You are in **`X:\aura-slide-by-shafayat`**, the source for **Lumi**. v0.6.1 is published. **Four other Claude
sessions are working in this repo right now** — read the ownership section.

Owner: S. M. Shafayat Islam. Short, plain replies. Not a beginner. Every item below comes from a screenshot of
the running app, so none of it is theoretical.

---

## P5.1 — "coming up" must scroll

The column shows **three slides and then "+3 more"**, which opens a dialog. The owner wants a continuously
scrollable list instead.

- `.bd-up` is a fixed box — `plan.css:276`, `height:252px`.
- `.bd-up-list` is `flex:1` with **no overflow rule at all** — `plan.css:282`.
- `paintUp()` (`editor.js:669`) slices to `UP_PER` and appends a `+N more` button that opens the `bd-alldlg`
  dialog.

Make the list scroll and show every unbuilt slide. **The precedent is already in this repo**: the left slide
strip was fixed the same way — `.ed-strip-list{overflow-y:auto}` with `overscroll-behavior:contain`, so a wheel
over the list does not scroll the page behind it. Match it.

Keep the dialog itself: **P2 is adding checkboxes to it** for queuing several slides overnight, so do not delete
`bd-alldlg` — just stop it being the only way to see slide 7. Coordinate through `docs/REGISTER-P5.md`.

## P5.2 — the chat composer labels are misplaced

Above the message box, "ask claude to change anything" and a separate `about [slide 1 ▾]` row sit awkwardly — two
stacked labels before you reach the input.

`workshop.js:193` builds it: `.ws-aim` with a `.ws-aim-l` reading "about", the slide button, and a menu.
**There is no `.ws-aim` rule in `components.css`** — grep finds none — so it is falling back to defaults, which
is very likely the whole bug.

Part C added that row for the "which slide am I talking about" work, and that information is genuinely useful —
**do not remove it**, make it read as one line. `workshop.js` is **Part C's file**: if C is still live, send the
fix through `docs/REGISTER-P5.md` rather than editing it.

## P5.3 — "make next slide" is too large

`.pl-big-s1` — `plan.css:30`, `min-height:58px`, and `plan.css:36` sets its label at `21px`. On the build page it
dominates a screen whose subject is the slide above it. Bring it down to the weight of a primary action, not a
banner. Check both 1366×768 and 1920×1080; `.pl-big` (`:24`) is shared with the plan page, so change `.pl-big-s1`
only.

## P5.4 — the home illustration

Two complaints, one screenshot:

- **The big plush at the bottom-left of the home page looks bad.** That placement is mine (`.hm-empty-lumi` and
  the look-step `.th-lumi`). At that size, on an empty page, the crop reads as a sticker rather than a character.
- **"make a new deck" needs a different illustration.** I replaced the hand-drawn document-and-pencil with the
  plush (`NEW_ART`, `home.js`), and the owner does not want the same character twice on one screen.

Pick one home for the character and give the card its own picture. Constraints that still hold from earlier
rounds: **no hand-drawn stand-ins for the character** — it is the knitted plush or nothing — and the card's
picture must not be a second copy of it.

---

## What this part owns

`engine/form/css/plan.css` (the `.bd-up*` and `.pl-big-s1` rules), `engine/form/js/editor.js` `paintUp()`,
`engine/form/js/home.js`, `engine/form/css/studio.css` (the home/mascot rules), `engine/form/assets/`.

**Route through a register, do not edit:** `engine/form/js/workshop.js` (**Part C**),
`engine/form_server.py` (**P1 / P2 / P3**), `engine/deck/**` (**P1 / P4**).

Note the overlap: **P2 also touches `editor.js`** (the slide-picker dialog) and **P5.1 touches `paintUp()` right
beside it**. Whoever lands second reads the other's diff first.

Yours in docs: `docs/CLAIM-P5.md`, `docs/STATUS-P5.md`, `docs/REGISTER-P5.md`.

## Rules

1. Never commit to main, push, tag, publish or bump the version.
2. Never touch `C:\Lumi` except to read.
3. Ask before running `test_server.py` or the e2e.
4. Sandboxes at `X:\aura-dev-p5\`, never inside the repo.
5. Copy standard: two to four words per control, lowercase. Errors exempt.
6. **Render it and look at it**, 1366×768 and 1920×1080. Every item here was found by looking, not by testing.
