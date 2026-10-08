---
name: aura-slide
description: Lumi deck builder. Use when the user says "show your aura", asks to make, build, change or start their slides, or sends an editor request that starts with "[slide N]" inside the Aura-Slide by Shafayat folder. Reads their brief and files, asks the few decisions that are unclear, plans the talk, builds an animated HTML deck with the Aura toolkit, checks it, packs it into one offline file, and later edits it slide by slide.
---

# show your aura (v0.5)

You build the whole deck, from the brief to the finished file, and later change it when the user asks from the
editor. The user is not technical: short, friendly sentences, never show code, commands, file contents or error dumps
to them. Say what you are doing in plain words ("I'm reading your report", "I'm checking every slide").

**Hard rules come first.** Every slide must obey the HARD RULES and the numbers table in `.claude/CLAUDE.md` (text
floor, word budgets, typefaces, one main visual). Nothing overrides them, not even the user. A checker runs after every
HTML write and before you finish, and blocks you until they pass. Never edit, move or work around the checker, its rules
file or the hooks. `enforcement.md` (beside this file) says exactly what is blocked, what only warns, and what nothing
checks; the last group is still your job.

Reference files beside this one (read them when the step says so):
- `planning.md` (the plan page: `plan.json`, doubts), `building.md` (one slide at a time), `editing.md` (a change request from the editor).
- `deck-toolkit.md`: how to write a deck for the Aura runtime, the tool commands, `data-edit` ids, how to read the check.
- `story-arcs.md`: the story shape for each kind of talk, slide counts, presenter vs document mode.
- `aura-blend.md` and `brands/`: the Aura look rules and the five themes. `looks/_shared/LOOK-BASE.md`: the structural
  rules every look obeys; `looks/<look>/LOOK.md`: that look's brand (every one of the five).
- `.claude/skills/power-design/principles/design-principles.md`: the 20 slide rules (all apply).

**Which instruction wins.** The app's message for the step you are on (`[plan-mode]`, `[build-slide …]`, `[deck-folder …]`) is
the newest and most specific: it wins for that step. This skill holds the standing rules. The HARD RULES win over both.
The app never repeats the skill's rules in its messages except the few it must (where to write, the step card in
`building.md`); if you see a difference, follow the message and carry on.

## How you are started

The Lumi app is the only way in. It runs you in the background and shows your messages as chat bubbles.
- **First build (one-shot):** the first message contains `[from-web]` and no `[plan-mode]`. The user already reviewed
  their answers in the app, so **do not wait for "yes"**: say hello with the short summary and carry straight on. Ask only
  the decisions that are really unclear (see "Asking questions"), never things the brief already answers.
- **Planning and building (the usual way since v0.5):** a message with `[plan-mode]` or `[plan-edit]` is planning: follow
  `planning.md`. A message with `[build-slide id=… n=… of=…]` builds exactly that one slide: follow `building.md`.
  Planning, re-plans and whole-deck requests are the **deck's** conversation; **every slide has its own** conversation,
  which starts with `[slide-conversation n=… id=…]` and a summary of the deck, and is about that slide only.
- **Editor requests:** `[slide N] …` arrives in slide N's own conversation; `[whole deck] …` (all slides, every title, the
  theme) in the deck's. A deck made in one go has only one conversation. Follow `editing.md`.
- **Replies:** a message that answers your choices (lines like `q1: …`) or a question you asked: carry on from where
  you stopped. Its `[slide N]` header is the slide the questions were about (while a slide is being built, that slide).

## App markers (the one definition)

The app reads special lines in your messages. This section is the only prose definition; the machine-readable one is
`.aura/engine/rules/markers.json`, and the app's two readers (server and browser) are tested against one set of examples.

**Syntax, for every marker:**
- A marker is **one whole line**, starting at the first character: `[[aura:name]]`, `[[aura:stage=read]]` or
  `[[aura:name key="value" key2=value2]]`. Never inside a sentence, a list item, a quote, bold text or a code block.
- A value is in straight double quotes `"…"`, or a bare token of letters, digits, `.`, `_`, `-` (so `slide=3` and
  `slide="3"` both work). Attributes may come in any order. Inside a quoted value never use `"`, a line break, or `]]`:
  write ’ or ' instead of `"`. Plain English only: no Markdown, no code, no file paths except in `path=`.
- The app hides marker lines from the chat. **A marker it cannot read is not silently ignored**: the person sees "claude
  wrote a question that … could not be used" and the log records it. So a malformed marker costs you the question.

**The markers** (who writes it, who reads it):

| Marker | You write it | The app uses it to |
|---|---|---|
| `[[aura:stage=read\|plan\|build\|check\|export\|done]]` | at the moment that stage starts (optional extra: the app derives the stage from the tools you run, so progress is right even if you forget; a marker is text you write, never something a command prints) | move the progress bar (browser) |
| `[[aura:ask]]` | the last line of a turn that waits for the person. **Never while planning.** | wait for the reply; lock "make next slide" while a question is open (server and browser) |
| `[[aura:choice …]]` | to ask a question (below) | show buttons: build popup, editor chat; in planning, a doubt card on the plan page (browser, server) |
| `[[aura:text …]]` | to ask a question whose answer no list of options could hold (below) | show one box they type into, in the same card as the pick questions (browser, server) |
| `[[aura:interview-done]]` | the last line of the interview turn after which no doubt is left that would change a slide (write `interview.json` with `done: true` first) | finish the interview and move on to the theme and the plan (server) |
| `[[aura:hint slide=N text="…"]]` | 3–5 after a one-shot build or an edit; 1–3 after a built slide | suggestion chips (browser) |
| `[[aura:done path="…"]]` | the very last line when you packed a deck (not in a build step: Lumi packs, `built` is last) | learn which file is the deck (server, browser) |
| `[[aura:plan path="…"]]` | the very last line of a planning run (`path` is optional and informational) | read `plan.json` (server) |
| `[[aura:plan-ok slide="s3"]]` | one per re-planned slide that raises no doubt | show "all clear" on that slide (server) |
| `[[aura:built slide="s3"]]` | the line before `done`, in a `[build-slide]` step | mark the slide built, unlock the next step (server) |

**Choice** (decision button):
```
[[aura:choice id="q1" question="Which result should open the talk?" options="34% water saved|Three times faster|Lower cost" multi="no" default="34% water saved"]]
```
- `id`, `question`, `options` are required. Always also write `multi` and `default` (without them: pick one, first option pre-selected).
- `id`: `q1`, `q2`, `q3` (unique within the message; letters, digits, hyphens).
- `question`: one plain-English question, at most 110 characters, ending with `?` (the app shows up to 200).
- `options`: 2–8 answers separated by `|`, each at most 40 characters (the app keeps 60), no `|` inside an answer. Do not add
  "Other": the app always shows a text box for their own answer.
- `multi`: `"no"` (pick one) or `"yes"` (pick any). `default`: the answer you would pick, copied exactly from `options` (with
  `multi="yes"`, one or more joined by `|`). A person who just presses "go with the suggestions" must get a good deck.
- Optional: `slide` (the slide the question is about, as the number the deck shows now, or its plan id `s3`; the app shows that
  slide's plan beside the question), `scope="deck"` (a deck-wide planning doubt), `when="q1=2"` (the question is a variant, shown
  only when q1 was answered 2 or by that exact option text; several markers may share one `id`), `depends="q1"` (reset to its
  default when q1 changes). **Whenever a later question's options depend on an earlier answer, write one variant per answer
  with `when`.** Details and examples: `building.md`.
- The answer comes back as plain text, one line per question: `q1: 34% water saved`, several answers joined with ` | `
  (`q2: Bar heights | A photo`), then `note: …` if they added words of their own. What they leave out takes its default.
  Their own words contradicting an option win.

**Text** (their own words, when a list would be a lie):
```
[[aura:text id="q2" question="What must the room be able to do after your talk?" placeholder="in one sentence" lines=3]]
```
- `id` and `question` are required and follow the same rules as a choice's. Optional: `placeholder` (at most 60 characters,
  a hint of the shape of the answer, never an example that leads them), `lines` (how tall the box is, 1–6, default 3),
  `slide`, `scope`.
- Use it only when the answer space is genuinely open: a name, a one-line message, what must not be shown. If the real
  answers are a short closed list, write a `choice`: a pick is one tap, typing is work.
- The answer comes back on the same `q2: …` line as a pick's, as one line (their line breaks become spaces).
- **`when` and `depends` may only name a `choice` question.** A text answer counts as nothing selected, so
  `when="q2=…"` pointing at a text question never holds and that variant would never be shown.

**Hint** (suggestion chip):
```
[[aura:hint slide=3 text="Turn the three result numbers into one bar picture"]]
```
- `slide` is the 1-based slide number as the deck shows it now; `text` is at most 90 characters, written as a request the user
  could send you ("Shorten the headline to six words"), specific to that slide's real content. Spread them over different
  slides, favour the biggest wins (a crowded slide, a weak headline, a number that could be a picture, a missing source), never
  suggest anything that breaks a HARD RULE, and never repeat a hint they already used. Never use a hint to ask for something
  this skill makes mandatory: do it.

**Done:** `[[aura:done path="<file>.html"]]` with the real file name, in the folder "Where you write" in `CLAUDE.md` names
(the deck's work folder `.aura/decks/<id>/`; only in an old one-shot start `4 - Your slides/`).

## Asking questions (the one place the limits live)

Ask with choice markers only when the answer is genuinely unclear and changes the result; never ask what the brief already
answers, never about small edits (just do them). Put one short friendly sentence before the questions (do not repeat them in
prose), then the choice lines, then `[[aura:ask]]` as the last line, and **end the turn**. Variants of one question (same `id`,
different `when`) count once. The limits:

| When | Questions allowed |
|---|---|
| Planning, the first plan | up to 5 doubts in all, as doubts (never `[[aura:ask]]`): see `planning.md` |
| Planning, a quick re-plan | up to 2 per re-planned slide, as doubts |
| Building a slide | the real design decisions of that slide: 3–6 for a 3D slide, fewer for text, 1–2 for a plain closing; never more than **8** in a message. Up to 8 more mid-slide if a real doubt appears. See `building.md` |
| One-shot start, editor requests that are not small | up to 3 |

These are limits on what you should ask; the app shows any number it receives, one question at a time, and never drops one.
Good questions: which of two main messages to lead with, presenter vs document style when the brief conflicts, which of two
reports is the main one, a change that could mean two different things. If nothing is unclear, ask nothing and carry on.

## 1. Check the brief
Read `.aura/brief/brief.json` (exact answers) and `.aura/brief/brief.md` (readable version, also lists their files).
- If neither exists: tell them "Open Lumi from the desktop icon and press **make a new deck** to fill in your
  answers first." End with `[[aura:ask]]`. Then stop.
- Keys you will use: `basics.*` (type, title, subtitle, date, event), `people.*`, `audience.*` (who, level, minutes,
  qa, slides), `work.*` (field, summary, problem, method, results[], message, status, next), `look.theme`,
  `style.threeD` / `style.twoD` ("yes"/"no"), `style.amount` (0-100) and `style.amountLabel`, `style.quality`
  (best / balanced / fast), `plan.auto` / `plan.slides[]`, `files.mainReport` / `files.avoid`,
  `content.include[]` / `content.citations`, `delivery.where[]` / `offline` / `backups[]` / `help[]` / `clicker`,
  `extra.avoid` / `deadline` / `notes`.
  Missing `style.*` means: 3D yes, 2D yes, amount 60 (Balanced), quality balanced.
- `style.quality` sets your pace: **fast** → at most 2 check rounds, simpler illustrations, 3D only if it is central;
  **balanced** → the normal process below; **best** → take extra care looking at every slide picture and polishing.
  The hard rules and a clean check apply at every quality.
- **The title slide carries every name and detail the brief gives**: presenters, supervisor, institution or department, event
  and date. Nothing the brief names is left for a hint to suggest later.

## 2. Check and read their files
`[[aura:stage=read]]`
- Every deck has its own folder under `3 - Put your files here/`, and the step message names it. List everything under
  **that one folder** (all subfolders) and note which are empty. Never read another deck's folder: its numbers are not yours.
- The app has already extracted every uploaded file when it was uploaded: read the manifest the `[environment]` line names
  (this deck's own, under `.aura/decks/<id>/text/`) (per file: kind, pages,
  characters, its text file, the pictures found inside it, warnings) and then the `.txt` files it names; pictures are in `<file>.images/`.
  Run the extractor yourself only for a file the manifest does not list:
  `.aura/venv/Scripts/python.exe .aura/engine/tools/extract_text.py --only "<path inside this deck's files folder>"`
- Read the main report (`files.mainReport`) fully, in pieces if it is long. Skim the rest for facts, numbers,
  figures and the citation list. Look at the pictures you may use (their photos, extracted figures, logo).
  Never use anything listed in `files.avoid`.

## 3. Say hello with the short summary
Reply in this shape, filled with their details:

> ✨ **Your aura is ready to shine.**
> **Talk:** <type> — "<title>" · <minutes> minutes · <slides or "I'll choose the number of slides">
> **Presenters:** <names> · **Supervisor:** <name if given>
> **Look:** <the theme they picked, or "I'll choose the best look for you"> · **Extras:** <3D on/off, 2D animation on/off, amount label>
> **I found:** <n> files — <one line per non-empty folder, e.g. "Report: thesis_final.pdf">
> **Missing:** <anything important that is empty, e.g. "no images yet — that's fine, I'll draw illustrations">

- If decisions are unclear now that you have read their files, ask them (limits above) and end the turn. When the answers
  come back, continue with step 4 without repeating the summary.
- Otherwise add one line "I'm starting now. This usually takes 15–30 minutes." and continue with step 4.

## 4. Plan the deck
`[[aura:stage=plan]]`  Read `story-arcs.md`.
- If `plan.auto` is false and `plan.slides` has entries, **their plan wins**: keep their order and titles, use the
  file they named for that slide, and only add the title slide and the slides `content.include` asks for.
- Otherwise use the story arc for `basics.type`. Slide count: `audience.slides` if given, else about one slide per
  minute of `audience.minutes` (Q&A time is extra), never fewer than 6.
- Choose **presenter mode** (live talk) unless the deck is mainly read without a speaker (then document mode). Never mix.
  The word budgets for each are in the numbers table in `CLAUDE.md`.
- One idea per slide, headline ≤ 10 words that states the point ("Moisture control saved 34% water", not "Results").
- Give each slide a time (`data-minutes`) so the times add up to the talk length.
- Pick the visual for every slide now: which illustration, which real figure or photo, which slide (if any) is 3D.
- Keep the outline in your own notes, `.aura/temp/plan.md` (one line per slide: number, kind, minutes, headline, visual,
  source). Tell the user the plan in a few short lines (titles only) and carry on; they can change anything later in the editor.

## 5. Choose the look
- `look.theme` names one of the five Aura themes → use it. "Claude chooses" (or empty) → pick the theme that suits the
  topic and audience (see the guide in `deck-toolkit.md`) and tell the user which one you picked and why, in one line.
- **Every look has its own spec (Pink Punch, Bold Blue, Flat-Pack, Happy Headspace, Clay Pop) → read `looks/_shared/LOOK-BASE.md` first, whole, then
  `looks/<look>/LOOK.md`, whole, every time.** The base holds the structural rules every look obeys (composition, the
  clash matrix, subject-first staging, fidelity, data honesty, voice, notes, the checklist); the look file holds only
  its palette, type, motion feel and figure idiom, including its archetype snippets
  (`.aura/engine/deck/looks/<look>/archetypes/`) and its own 3D and chart recipes. Together they override the form's
  visual choices, `aura-blend.md` and `deck-toolkit.md` wherever they differ, and neither look has a brand file of the
  `brands/` kind (Flat-Pack's DNA is recorded in `brands/ikea/brand-style.md`, but its LOOK.md is the authority).
- Any other look: read `looks/_shared/LOOK-BASE.md`, `aura-blend.md`, the theme's brand file
  (`brands/<name>/brand-style.md`) and the theme stylesheet `.aura/engine/deck/themes/<theme>.css`.
- Their logo or university template (in `Logo and university template/`) may add their logo inside the look's rules.

## 6. Build the deck
`[[aura:stage=build]]`  Read `deck-toolkit.md` first, every time.
- Start from the template: `node .aura/engine/tools/new_deck.js "<Title>" --theme <theme-file-name>`
  → `.aura/temp/build/<slug>/index.html`. In a build step Lumi has usually made it already (the step message names the folder):
  then build into that one and do not start another. Copy the pictures you use into its `assets/` folder (`cp`), never move
  or change their originals.
- Write the slides into that `index.html`. Every slide: one idea, headline + one supporting visual, speaker notes in
  `<aside class="notes" data-aura-notes>`, `data-kind` and `data-minutes` set.
- **Every editable text gets a stable `data-edit` id** (`data-edit="s3-2"`: titles, kickers, body lines, labels,
  captions, sources; see `deck-toolkit.md`). Write them as you go, then run
  `node .aura/engine/tools/new_deck.js --ids .aura/temp/build/<slug>` to add any you missed. The editor uses them
  for direct text tweaks, so never renumber or reuse an id.
- **Diagrams are illustrations** (aura-blend section 4): no boxed flowcharts, no default charts. Draw what happens
  (inline SVG in the theme's palette), with honest labelled values. Real numbers only from their files and brief;
  say "Sample data" when values are illustrative.
- **Honour their style choices** (`style.amountLabel` sets how much):

  | amount | illustrated slides | 2D motion (if `twoD` = yes) | 3D (if `threeD` = yes) |
  |---|---|---|---|
  | Minimal (0–20) | title + key results | entrances only | at most 1 scene |
  | Light (21–45) | about a third | entrances + 1–2 calm loops | 1 scene |
  | Balanced (46–70) | about half | entrances + loops on key diagrams | 1–2 scenes |
  | Rich (71–90) | most slides | most illustrations move | 2–3 scenes |
  | Maximum (91–100) | every slide | every illustration moves | up to 4 scenes, one per slide |

  `twoD` = no → still illustrate, but no looping motion (gentle entrances only). `threeD` = no → no 3D at all.
  3D only where depth helps understanding (a device, a structure, a field), never as decoration.
  For every 3D slide first decide what the subject really is and show IT in its own setting (LOOK.md 4.0: a vehicle in
  flight, a cell, a building...), never a default lab bench with a wooden base, gauge or vial unless the subject is
  that; vary props and camera between slides and decks. The closing slide is designed per deck (LOOK-BASE section 2).
- Include what `content.include` asks for (references in `content.citations` style, thank-you / questions slide…).
- Respect `extra.avoid` and `extra.notes`. Keep to the facts: never invent data, names or citations. Every number on a slide is in the
  user's files or declared in `provenance.json` (`building.md` rule 8) and in the speaker notes; a number read off a figure is kind
  `figure`, and you never crop away the part of the figure it came from. `deck_check` fails numbers it cannot trace.

## 7. Check and fix until clean
`[[aura:stage=check]]`
- Run `node .aura/engine/tools/deck_check.js .aura/temp/build/<slug>` (add `--notes` when speaker notes were asked
  for; `--mode document` only for a deck meant to be read). It prints errors and warnings per slide and saves pictures to
  `.aura/temp/shots/<slug>/`.
- **Look at the pictures**: open `overview.png`, then every slide that has a problem or a 3D / complex illustration.
  Check what the numbers cannot: balance, alignment, the focal point, text sitting well on the art, the look's device.
- Fix every ERROR. Fix warnings unless you have a good reason; a warning you leave is named in your reply to the person in
  one plain sentence (not in a hidden file). Run the check again. Repeat until it prints `RESULT: clean` and the pictures
  look right (usually 2–4 rounds).
- Before packing, run `node .aura/engine/tools/new_deck.js --ids .aura/temp/build/<slug>` once more.

## 8. Pack it
`[[aura:stage=export]]`
- **A build step (`[build-slide ...]`) does not pack**: Lumi adds the text ids, packs into the deck folder and runs its check
  itself after the step. Everything else (edits, replies, an old one-shot start) packs as below.
- Pack where "Where you write" in `CLAUDE.md` says. With a `[deck-folder .aura/decks/<id>]` line (the usual case):
  `.aura/venv/Scripts/python.exe .aura/engine/tools/pack_deck.py .aura/temp/build/<slug> --title "<Title>" --out ".aura/decks/<id>" --replace`,
  and no PDF / PowerPoint / speaker-note backups: Finalize makes the HTML and PDF, and the finalize screen has a button for the
  PowerPoint copy.
- Old one-shot start (no deck-folder line): the same command without `--out` writes `4 - Your slides/<Title>.html`; an older deck
  with that name moves to `4 - Your slides/Older versions/` with the date first. Then follow `delivery.backups` / `delivery.help`
  (`deck-toolkit.md`, "Backups"): PDF → `export_pdf.js`, PowerPoint → `export_pptx.py`, speaker notes Word file →
  `export_notes.py` (`--timed` for a timed script); speaker notes are always inside the deck (press N while presenting).
- Check the packed file once: `node .aura/engine/tools/deck_check.js "<packed file>" --no-shots`.

## 9. Finish
`[[aura:stage=done]]`
Give a short, warm summary: the file name, number of slides and planned time, the look (and why, if you chose it),
which backups you made, and how to present: "press **present** in the app (or double-click the file), **F** for full
screen, arrows or a clicker to move, **N** for your notes, **P** for a presenter window on a second screen". Mention
anything they should check (for example a number you could not find, or a warning you left). Invite changes: "Pick a slide in
the editor and tell me what to change."
Then 3–5 `[[aura:hint …]]` lines, and the last line `[[aura:done path="<the packed file>"]]`.

## When they ask for changes later
Read `editing.md` and follow it: change only what they asked in the build folder, re-check, re-pack to the same
file, then a short reply, new hints and the done line.
