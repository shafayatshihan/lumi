# Part C — one chat, and no doubt about which slide anyone means

You are in **`X:\aura-slide-by-shafayat`**, the source for **Lumi**, a Windows app that builds presentation decks
with headless Claude Code. v0.5.10 is published. **Four other sessions are working in this repo right now** — read
the ownership section.

Owner: S. M. Shafayat Islam. Short, plain replies. Not a beginner.

**First: `engine/node_modules` is gitignored and the repo was just re-cloned, so it is missing.** Run
`npm install` in `engine/` before anything that needs three.js.

---

## The change that created this job

Until 2026-10-08 every slide had its **own** Claude conversation. It now has one conversation for the whole deck
(`form_server.ONE_DECK_CONVERSATION = True` nulls `conv` in `RUNNER.launch()`), because the owner wanted slide 7
to have seen slides 1-6.

The chat UI still carries the old world's furniture. In the screenshots there is a **`slide 1` | `whole deck`**
toggle at the top of the chat panel, which existed to pick *which conversation* a message went to. **There is only
one conversation now, so as a conversation switch it does nothing.**

The owner: *"is topslide of slide1/whole deck necessary as we are doing a single chat now."*

---

## C1. Decide what that toggle becomes — do not just delete it

It is dead as a *conversation* switch. It may still be alive as a **scope** signal: "this message is about slide
4" versus "this message is about the whole deck" is real information Claude needs, and the server still tags
messages with a slide. Removing the control without replacing the signal would make every message ambiguous —
which is the opposite of what the owner is asking for in C2.

So: work out whether scope should be **declared** (a control) or **inferred** (from what is open), write the
decision and the reasoning into `docs/STATUS-C.md` **before** you build it, and then build it. A hybrid is likely
right: infer by default, let the person override, and always *show* what was inferred.

## C2. The real request: no ambiguity, in either direction

The owner, in their words:

> *"introduce ease of use, clicking a slide, or the slide that is kept open, if a user input something assume he
> is indicating that slide, also make ui robust so that client and user has no ambiguity, which slide each is
> indicating."*

Two halves, and both matter:

**The person → Claude.** If slide 4 is open, or the person just clicked slide 4 in the left strip, then typing
"make the title shorter" means *slide 4*. They should not have to say so. That is the default; it must be
overridable.

**Claude → the person.** When Claude replies, edits, or asks a question, it must be obvious **which slide it is
talking about** — including when the person has since navigated somewhere else, which is the case that bites. A
question that arrives about slide 2 while the person is looking at slide 7 must say so and offer to take them
there.

Make the current target **visible and always true** rather than implied. The strip, the preview, the chat header
and the message being composed should all agree, at a glance, on one slide.

**The trap:** the person can move while Claude is working. A reply about slide 2 must not silently retarget
because they scrolled to slide 7, and a message typed while slide 7 is open must not be delivered as slide 2's.
Decide what the target is bound to **at send time**, show it on the sent message, and keep it there.

## C3. Where it lives

- `engine/form/js/editor.js` — the strip (`paintStrip`, `:223`), navigation (`go()`), the current slide `cur`
- `engine/form/js/workshop.js` and `engine/form/js/scenes/workshop.js` — the chat, the toggle, `getSlide: () => cur`
  (`editor.js:789`), `onSlide`
- server side: `/api/claude/reply` takes `slide` and `scope`; events carry `conv`. `scope: 'planet'` → 400 is an
  existing test. The server's slide tagging is **Part B's file** (`form_server.py`) — if you need a change there,
  write it into `docs/REGISTER-C.md` rather than editing it.

The existing e2e has checks worth reading first: *"claude's questions lock the build and take focus"*, *"a
question card is never a dead end"*, *"the counter, the strip and the build line all say the same number"*.

---

## What you own

- `engine/form/js/editor.js`, `engine/form/js/workshop.js`, `engine/form/js/scenes/workshop.js`
- the chat and strip CSS in `engine/form/css/studio.css`
- `tools/form-dev/e2e_walk.js`, `tools/form-dev/test_frontend.mjs`

**Do not touch:** `engine/form/js/{lumi-art,home,looks,loading}.js` and the mascot (**Part A** — note Part A is
also changing the chat's avatar, so leave the avatar alone); `engine/form/js/{quality,plan,markers}.js` and
`form_server.py` (**Part B**); uploads and `engine/tools/extract_text.py` (**Part D**); `engine/deck/**` and
`workspace/.claude/skills/**` (**Part E**); `RESUME.md`, `BACKLOG.md`, `FIXLOG.md`, the rest of `docs/`.

Yours in docs: `docs/CLAIM-C.md`, `docs/STATUS-C.md`, `docs/REGISTER-C.md`.

---

## Rules

1. **Never commit, push, tag, publish, or bump the version.**
2. **Never touch `C:\Lumi`** except to read.
3. **You may run the e2e**, but **ask first** — two sessions testing at once produce phantom failures.
4. **Sandboxes in `X:\aura-dev-c\`**, never inside the repo.
5. Write files with the Write tool, not bash heredocs.
6. Copy standard: two to four words per control, lowercase. Errors exempt.
7. **Render it and look at it** at 1366x768 and 1920x1080.

## Report

10 lines to the owner; `docs/STATUS-C.md` as you go, starting with the C1 decision and its reasoning. Say plainly
anything here that turns out to be wrong in the code.

Claim it first: `docs/CLAIM-C.md`.
