# Brief for a Claude account: the waiting game

You are in **`X:\aura-slide-by-shafayat`**, the source for **Lumi** — a Windows app that builds presentation decks
with headless Claude Code. **Two other Claude sessions are working in this repo right now**, so the file-ownership
section is binding, not advisory.

Owner: S. M. Shafayat Islam. Short, plain replies. Not a beginner. Their bar for this product is *"quality"* and
*"make the UX as if you were Steve Jobs"*.

---

## 1. What this is, and why it exists

Building a deck takes **10–60 minutes** of Claude working. The build page shows the real current step — *"lumi is
rendering slide 4 · 62%"* — and, beside it, **a small flappy game so the wait is not dead time.**

This is not filler. It is the screen the owner looks at longest, and it is the only part of Lumi that exists purely
to be enjoyable. Treat it as a product, not a toy.

**The game already exists and works.** Your job is to make it genuinely good.

| file | what it is | lines |
|---|---|---|
| `engine/form/js/lumi-play.js` | the whole game: canvas loop, physics, input, sizing, lifecycle | 282 |
| `engine/form/css/theme.css` **lines 277–324 only** | the arena, the HUD, the grow-to-half-the-stage layout | 49 |
| `tools/form-dev/play.html` | the dev harness — run the game with fake run states, no server, no Claude | — |

It is mounted by `engine/form/js/editor.js:521` and driven by three calls: `setRunning(bool)`, `setAsking(bool)`,
`setStep({head, sub})`. **Read `lumi-play.js` top to bottom before you touch it** — its header comment states the
contract, and most of what looks like an odd choice is load-bearing.

---

## 2. The four promises the current code keeps. Do not break any of them.

These were expensive to get right. Any change you make must still satisfy all four.

1. **Space is borrowed, never stolen.** The arena reads the space bar only when it is itself focused, *or* when the
   pointer is over it **and nothing at all is focused**. A text box, a question card, the chat input or a dialog
   keeps space for itself. A click on the arena never pulls the caret out of something the person is typing in
   (`isTyping()` → `preventDefault`, see `:194-200`).
2. **A question always wins, instantly.** `setAsking(true)` cuts the loop and gives the lower half of the stage back
   **on the same tick** the question opens, and leaves the game paused so nothing jumps at the person. CSS alone was
   not enough — the IntersectionObserver notices too late. See the comment at `:260`.
3. **It costs nothing when nobody is playing.** The rAF loop runs only while the arena is on screen, the window is
   focused, and the game is engaged (pointer over it or it holds focus). `playing()` at `:170` is that gate. A deck
   build is already pinning a CPU; the game must not take a share of it to animate for an empty room.
4. **The run ending stops it dead.** `setRunning(false)` clears the pipes, the score and the canvas and shrinks the
   arena back to its strip. The person's work always wins.

There is a **harness for exactly this**: `tools/form-dev/play.html` has buttons for "claude is working" and
"a question arrives". Use it. Every change gets tested against all four promises there.

---

## 3. What is actually wrong or missing today

Ordered by value. The first is a real bug; the rest are the difference between "works" and "good".

### 3.1 The best score does not survive — **a bug, fix this first**

`let best = 0` at `:31` is closure state. It is shown as `best 7` in the HUD, which is a promise that it is
remembered, and then it is silently lost the moment the page reloads or the editor remounts. Over a 40-minute
build with a reload in the middle, the person's best score vanishes with no explanation.

There is already a `store` helper at `:19-22` wrapping `localStorage` in try/catch for the `lumi.play.hidden` key —
extend that pattern (`lumi.play.best`). **Wrap every read and write**: a private window throws on access, and the
game must still run. Do not persist it per deck; it is the person's score, not the deck's.

### 3.2 It is silent

Lumi has sound elsewhere (the look picker plays a `tick` on each shuffle; `data-nosfx` exists precisely to opt
controls *out*). The game has none. A flap, a point scored, and a crash are the three that matter.

Three hard constraints:
- **Find the app's existing audio helper and use it** — do not add a second audio system, and do not ship audio
  files. Grep for `sfx(` and `data-nosfx` and follow it to the source. Everything in Lumi is synthesised.
- **Respect the mute the app already has.** If the person has muted Lumi, the game is muted.
- **Never play a sound when the game is not engaged**, and never on `setRunning`/`setAsking` transitions. A sound
  firing because a render finished, while the person is reading a question, is worse than silence.

### 3.3 The difficulty curve is one line

`vel()` at `:83` is speed scaling linearly with score, and `gapH()` narrows once at score 6. That is the whole
progression. It gets monotonous at about 15 points and is never *hard*.

Make it a curve worth playing: a gap that tightens on a real ramp with a floor it never goes below, pipe spacing
that varies instead of being constant, and something that changes at a milestone so a good run *feels* different
from a bad one. Keep it fair — the hitbox is already generous on purpose (`r * 0.78` horizontally, `r * 0.74`
vertically, `:160`); do not quietly make it strict to raise difficulty.

### 3.4 One obstacle, one background, forever

Purple rounded columns (`draw()` at `:122`) on a static lilac gradient. No parallax, no depth, no variation. The
arena is `560 x 138` in its strip and **1552 x 438** when it grows — the big state is a genuinely large canvas and
it currently shows the same sparse scene stretched.

This is the most visible place to spend effort. A quiet parallax layer, something in the distance, obstacles that
are not all the same — bearing in mind every pixel is drawn in code, there are **no image assets** and there will
not be any.

### 3.5 The bird is Lumi, and that is barely used

`lumiArt({ size: 48, mood: 'hmm' })` is the app's own mascot, and it has **moods**. Today it is the default face
while flying and `hmm` when dead. Read `engine/form/js/lumi-art.js` for the full set and use them — a flap, a near
miss, a milestone and a crash are four different faces, and that is free personality.

### 3.6 Nobody has checked it small

The stage runs at **1366x768** as well as 1920x1080, and the arena is a fixed `560px` strip in CSS. It has never
been looked at on the small stage, in the big state, or with `prefers-reduced-motion` on (the code has a `reduced`
branch at `:28` and `:83` that nobody has seen run).

---

## 4. What NOT to do

- **Do not add a dependency.** No game engine, no physics library, no sprite sheet, no sound file. It is canvas +
  SVG + synthesised audio, offline, and it stays that way. The whole app is a self-contained Windows install.
- **Do not add a leaderboard, an account, or anything that sends a score anywhere.** No network calls. Ever.
- **Do not make the game the point of the screen.** The real current step sits next to it and it is what the person
  actually came for. The game never covers it, never delays it, never animates over it.
- **Do not make it a second game.** Flappy is the owner's explicit choice. Make this one excellent.
- **Do not touch the deck, the build pipeline, the server, or anything 3D.** None of it is yours.

---

## 5. FILE OWNERSHIP — two other sessions are live in this repo

**Yours, exclusively:**
- `engine/form/js/lumi-play.js`
- `engine/form/css/theme.css` — **lines 277–324 only**, the block that starts
  `/* something to do while claude works (lumi-play.js)` and ends before
  `/* ====== batch D: zoom + scrolling`. **Nothing else in that file.** Keep your edits inside those bounds so a
  diff can be read at a glance; do not reformat or re-indent the lines around it.
- `tools/form-dev/play.html`
- new files you create under `engine/form/js/` whose name starts `lumi-play` (e.g. `lumi-play-audio.js`)

**DO NOT EDIT — someone else is in them:**
- `engine/form_server.py`, `engine/deck/**`, `engine/tools/**`, `engine/rules/**` (Package A, and the deck engine)
- `engine/form/js/**` other than `lumi-play*.js` — including **`editor.js`**, which mounts you
- `engine/form/css/**` other than your 49 lines, and `engine/form/index.html`
- `installer/Lumi.cs`, `engine/form.ps1`
- `RESUME.md`, `BACKLOG.md`, `FIXLOG.md`, `CLAUDE.md`, and everything in `docs/` except the two files named below

**If you need a change outside your files** — a new CSS variable, a call added to `editor.js`, anything in
`index.html` — **write the exact snippet into `docs/REGISTER-GAME.md`** and say which file and where. The
coordinating session applies it. Do not edit the file yourself; the edit will be lost.

`lumi-art.js` and the audio helper are **read-only for you**. If the mood you want does not exist, ask for it in
`docs/REGISTER-GAME.md` rather than editing the art file.

---

## 6. Rules that apply without exception

1. **Never commit, push, tag or publish. Never bump the version.** v0.5.5 is live; the coordinating session owns all
   git. A safety commit is at `564a273`; a full backup is at `X:\lumi-backup-20261007-212954\`.
2. **Never touch `C:\Lumi`** except to read. That is the owner's live install with their real decks in it.
3. **Do not run the full test suites** (`test_server.py`, `test_frontend.py --e2e`, `test_permissions_real.py`).
   Two sessions testing on one machine produce phantom failures — this already cost hours: 1288/1295 on one run,
   a different five on the next, none of them real. **`node --check` and the harness are expected and encouraged.**
4. **Never create a sandbox inside the repo.** One was committed by accident. Use `X:\aura-dev-*`.
5. Write files with the **Write tool**, not bash heredocs — backslashes get mangled on Windows.
6. Copy standard: a control says what it does in **two to four words**. `pause`, `hide`, `play while you wait` are
   the existing voice — all lowercase, no sentences in a button.
7. **Render it and play it.** A change you have not watched on screen is not finished.

---

## 7. How to verify, without the suites

```
python tools/form-dev/static_server.py 8790
```
then open **`http://127.0.0.1:8790/dev/play.html`**. `file://` will not work. The harness gives you the run states
without a Claude run, a deck or a 40-minute wait.

Before you call anything done, walk this list:

- [ ] Play it for two real minutes. Is it fun? Say so honestly if it is not.
- [ ] Type in a text box with the pointer over the arena — the caret stays, space types a space.
- [ ] Press "a question arrives" mid-flight — the arena shrinks and the loop stops **on that tick**.
- [ ] Press "claude is finished" mid-flight — everything clears, the strip comes back.
- [ ] Move the pointer off the arena — the loop stops (`playing()` goes false). Nothing animates for an empty room.
- [ ] Score, reload the page, confirm **best survived**.
- [ ] Both sizes: the 560x138 strip and the grown state.
- [ ] 1366x768 as well as 1600x900.
- [ ] `prefers-reduced-motion: reduce` on — it must still be playable, just calmer.
- [ ] `node --check engine/form/js/lumi-play.js`.

---

## 8. Report back, in two places

**To the owner:** 10 lines or fewer. What you changed, what you played and how it felt, anything in this brief that
turned out to be wrong when you read the code — that last one is worth the most. Three agents have already found
real errors in these handoff documents; saying so plainly beats working around it quietly.

**To a file, because the coordinating session cannot see your messages:**

```
X:\aura-slide-by-shafayat\docs\STATUS-GAME.md
```

Overwrite it as you go, ~15 lines: done, in progress, blocked, files touched, what you verified on the checklist
above. That file plus `docs/REGISTER-GAME.md` are the entire handover — write them for someone who has never
spoken to you, because they have not.

**Claim it first.** Before your first edit, create `docs/CLAIM-GAME.md` with the time you started and one line on
your plan, so the other sessions know the game is taken.
