# Part C — status

**Done and verified.** The toggle is gone, the chat is one log again, and every place that could disagree about
which slide a message is about now reads from one value.

---

## C1. The decision, and why

**The `slide 1 | whole deck` toggle is replaced, not deleted: scope becomes inferred-by-default, overridable, and
always shown.** One continuous chat log, and one *target* chip in the composer that states, at every moment, which
slide the next message is about.

### What the toggle actually did (read of the code, 2026-10-08)

Two jobs were riding on one control, and only one of them is dead.

1. **Dead — which conversation.** `ONE_DECK_CONVERSATION = True` nulls `conv` in `RUNNER.launch()`
   (`form_server.py:2131`). There is one session per deck now, so there is nothing left to switch.
2. **Alive — which slide the message is about.** `/api/claude/reply` still builds the prompt as
   `'[slide {n}] ' + text`, or `'[whole deck] ' + text` for `scope == 'deck'` (`form_server.py:7032`). That prefix
   is the *only* thing telling Claude what a message refers to. Delete the control without replacing the signal and
   every message becomes ambiguous — the opposite of what C2 asks for.

So the signal stays. What changes is that the person no longer operates it as a mode; it follows what they are
looking at, and shows them what it concluded.

### The live bug this uncovered — the chat was blank on new decks

`renderThread()` filtered the log to one thread: `own.filter(e => (e.conv || 'deck') === key)`, with `key` the open
slide's id. Since `conv` is always null now, **every event files under `'deck'`**, so on any deck built after
2026-10-08 the editor chat rendered an **empty log on every slide** — the whole conversation present, filtered out.
It only looked right while a run was live (the run pinned the view to `'deck'`), or on an older deck whose stored
events still carry real `conv` values. That settles the shape of the fix on its own: one conversation, one log.

### The decision

- **One log.** `renderThread` / `threadKey` / `view` / `pinned` / `evThread` are gone. The chat shows the deck's
  whole conversation, in order, unfiltered.
- **Scope is inferred.** The target defaults to the open slide and follows navigation. Click slide 4, type "make the
  title shorter", and it means slide 4 — nothing to operate.
- **Override is a declaration about one message.** The chip opens a two-item menu (`this slide` / `whole deck`). An
  override lasts until that message is sent, then the target goes back to following. A sticky "whole deck" mode is
  invisible the moment you look away from it, and fails expensively. It does **survive navigation**, because it is
  on the chip the whole time: keeping it is the visible choice, dropping it would be the silent one.
- **Bound at send time**, onto the request *and* onto the bubble. Navigating afterwards cannot retarget a message
  already on its way, and the sent bubble keeps saying which slide it was about.
- **An open question owns the target.** `say`/`tool` events carry no slide, so a turn's slide is the slide of the
  `user` event that opened it; a question's own `slide=` attribute beats that. While a question is open the chip is
  pinned to *its* slide and cannot be overridden — there is nowhere else for an answer to go. This closed a real
  ambiguity: an answer to slide 2's question, sent while standing on slide 7, used to be tagged slide 7.
- **Claude's side is labelled.** Replies and question cards carry the slide tag; when that is not the slide now on
  screen the tag is a button that goes there. This is the case the brief says bites.
- **One truth in four places.** Strip, header, chip and the composing message all read the same target. When the
  chat is about a slide the person is not looking at, the strip marks that thumbnail (`in chat`, dashed outline).

### Rejected

- *Just delete it* — loses the `[slide n]` prefix; every message becomes ambiguous.
- *Keep it as an explicit mode* — it is the thing the owner asked about: furniture to operate, stale the moment you
  navigate.
- *Infer with no override* — "change this everywhere" has nowhere to go.

---

## What changed

| file | what |
|---|---|
| `engine/form/js/workshop.js` | the thread switch and the filtered log removed; the target model, the chip and its menu, slide tags on both sides, binding at send time, the question-owns-target rule |
| `engine/form/js/editor.js` | `onTarget` wired; the strip marks the slide the chat is on when it is not the open one |
| `engine/form/css/studio.css` | `.ws-aim*`, `.ws-slidetag` (now a button, with an `is-away` state), `.ws-chcol`, `.ws-head-aim`, `.ed-th.is-aimed` |
| `tools/form-dev/test_frontend.mjs` | 7 checks that defend the contract above |
| `tools/form-dev/c_chat.html` | **new** dev harness (alongside `components.html` / `play.html`): mounts the real chat in edit mode and answers `/api/*` from the page, so the behaviour can be driven without a server holding a real deck. `?ask=1` stops with a question still open. |

Part A's `AVATAR` line in `workshop.js` was left untouched, as `docs/PARTS.md` asks.

## Verified

- `node tools/form-dev/test_frontend.mjs` — **92/92** (85 before, +7 mine).
- The real chat driven in Edge through the harness at **1366x768 and 1920x1080** — **21/21** at each, no console
  errors, screenshots in `X:\aura-dev-c\shots\`. Covered: the whole conversation shows; the toggle is gone; the chip
  states the inference; opening a slide retargets; a sent message keeps its slide and offers to go back; the
  override sends once then reverts; a whole-deck message sends as one; Claude's question says its slide, takes you
  there, and owns the target until answered; the strip agrees.
- The repo's e2e and server tests were **not** run (they need asking first, per the brief). Nothing in
  `e2e_walk.js`, `test_server.py` or `test_slide_convs.py` refers to the toggle, so none of them should be affected.

## Found wrong / left for others

- **`reply_conv()` was not switched over** (`form_server.py:4404`, **Part B's file**). It still returns a slide id,
  so a slide-scoped message takes the per-slide branch at `form_server.py:7021`: the L-17 context hand-off is
  decided from that slide conversation's `ctxTokens` — which never grows now, since no slide conversation ever runs
  — instead of `deck_handoff(rec)`. Net effect: **a deck whose chat is all slide-scoped messages never gets its
  context reset**, and that is now the common case. The run itself is fine (`launch()` nulls `conv`), but
  `meta['scope']` is recorded as `'slide'` for a run that happened on the deck conversation. Written up with a
  one-line fix in `docs/REGISTER-C.md`.
- **Dead CSS left in place:** `.ws-thread` / `.ws-th-b` in `engine/form/css/components.css` style the toggle I
  removed and now match nothing. `components.css` is not Part C's file and another session has it open, so I left
  them rather than risk a conflict. Seven lines, safe to delete whenever that file is quiet.
