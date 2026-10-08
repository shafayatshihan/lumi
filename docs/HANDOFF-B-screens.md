# Part B — the two screens before building: the quality picker and the plan page

You are in **`X:\aura-slide-by-shafayat`**, the source for **Lumi**, a Windows app that builds presentation decks
with headless Claude Code. v0.5.10 is published. **Four other sessions are working in this repo right now** — read
the ownership section.

Owner: S. M. Shafayat Islam. Short, plain replies. Not a beginner. Everything below comes from screenshots of the
running app, so it is all real, not theoretical.

**First: `engine/node_modules` is gitignored and the repo was just re-cloned, so it is missing.** Run
`npm install` in `engine/` before anything that needs three.js, or `node_modules` will simply not be there.

---

## B1. The quality picker: three tiers, not four, and the ticks are invisible

The look screen's "how hard claude thinks" column currently offers **best quality / maximum / balanced / fast**,
and under "choose the model yourself" it shows MODEL (Opus · Sonnet · Haiku) and EFFORT (low · medium · high).

Two faults in the screenshot:
1. **The selected ticks cannot be seen.** The mascot image sits on top of the model/effort row, so which model and
   which effort are selected is hidden behind it. (The mascot is Part A's; **do not move or restyle it** — fix this
   by giving the controls their own space and stacking context, not by shrinking the character.)
2. **There are four tiers and the owner wants three.**

**The tiers the owner asked for, exactly:**

| tier | model + effort | note |
|---|---|---|
| **maximum** | Opus · high | the slowest, most thorough |
| **balanced** | Sonnet · high | |
| **recommended / default** | **Opus · medium** | **this is what a new deck starts on, and it carries the "recommended" badge** |

Drop the fourth. "best quality" is gone as a name — Opus+medium is the default and the recommendation. Name the
three in the owner's house voice (lowercase, two to four words); their words were "opus high goes max, then sonnet
high goes balanced. only 3."

Where this lives: `engine/form/js/quality.js`, the tier table in `engine/form_server.py` (search `PLAN_QUALITY`
and the v0.5.1 tier comment near `DECK_FIELDS`), and the advanced model/effort pair (`LOOK_OVERRIDES`, the
"advanced pair" comment around `form_server.py:480`). **The named tier and the explicit (model, effort) pair are
THE SAME SETTING seen two ways** — that is already documented in the server; keep it true, so picking Opus+medium
by hand lights up the recommended tier.

Check the default really changes for a **new** deck, not just in the UI: `new_deck` seeds the record.

---

## B2. The plan page: the type is overflowing and the question card collides with the heading

Screenshot evidence, "plan your deck":
- The open question card ("Which equations should appear on the slides?") is drawn **over the heading and the
  sub-line**, so "plan your deck", "9 slides · 4 questions for you" and the time estimate are all unreadable
  underneath it.
- The question text itself wraps into a narrow column and overflows its own card.
- The answer chips ("Only the performance formula", "That plus heat and friction factors", "None on the slides",
  a clipped "someth…") and the "use this" button are crammed on one row, with one chip visibly cut off.

**The owner's instruction: "plan your deck ui font overflowing, cluttering, you have permission to use a bit
smaller font size."** So you may reduce the type scale on this screen — but reducing type is the last resort, not
the first. Fix the layout first (the card should sit *below* the heading or push it, never cover it; the chips
should wrap instead of clipping), then take the type down only as far as it needs to go.

**The floor is 14 stage px** (12 only for micro-labels) and it is a hard rule — `engine/rules/hard-rules.json`
`minFontPx`. Nothing may overflow the stage at **1366x768 or 1920x1080**; check both.

Where: `engine/form/js/plan.js`, `engine/form/css/plan.css`, and the question card itself in
`engine/form/js/markers.js` (`choiceCard`).

---

## What you own

- `engine/form/js/{quality,plan,markers}.js`, `engine/form/css/plan.css`
- the quality/tier definitions in `engine/form_server.py` — **you own this file for this part**; coordinate through
  `docs/REGISTER-B.md` only if another part reports needing it
- `tools/form-dev/` tests covering what you change

**Do not touch:** `engine/form/js/{lumi-art,home,looks,loading,lumi-play}.js` and the mascot CSS (**Part A**);
`engine/form/js/{editor,workshop}.js` and the chat (**Part C**); `engine/tools/extract_text.py` and uploads
(**Part D**); `engine/deck/**`, `workspace/.claude/skills/**` (**Part E**); `RESUME.md`, `BACKLOG.md`, `FIXLOG.md`,
anything in `docs/` except your three files.

Yours in docs: `docs/CLAIM-B.md`, `docs/STATUS-B.md`, `docs/REGISTER-B.md`.

---

## Rules

1. **Never commit, push, tag, publish, or bump the version.** The coordinating session owns git.
2. **Never touch `C:\Lumi`** except to read — the owner's live install.
3. **You may run** `test_server.py` and `test_frontend.py --e2e`, but **ask first**: another session may be
   testing, and two at once produce phantom failures that have already cost hours.
4. **Sandboxes go in `X:\aura-dev-b\`**, never inside the repo.
5. Write files with the Write tool, not bash heredocs — backslashes get mangled on Windows. PowerShell files stay
   ASCII + CRLF.
6. Copy standard: a control says what it does in two to four words, lowercase. Errors are exempt and must stay
   actionable.
7. **Render it and look at it, at both sizes.** The two faults above shipped because nobody looked at the real
   screen. `test_frontend.py --e2e` leaves screenshots in `%TEMP%\lumi-e2e\`.

## Report

To the owner in 10 lines. To `docs/STATUS-B.md` as you go (done / in progress / blocked / files / what you
rendered), because the coordinating session cannot see your messages. Say plainly anything in this brief that
turns out to be wrong when you read the code.

Claim it first: `docs/CLAIM-B.md`.
