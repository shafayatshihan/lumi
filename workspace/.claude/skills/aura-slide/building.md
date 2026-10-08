# Building the deck one slide at a time (the app's "Build my deck" page)

After planning (`planning.md`), the person builds the deck slide by slide and checks each one before the next.
**Every build step is self-contained.** Its message carries this slide's plan entry, the list of slides already built, the look
and where the already-extracted source text is (this deck's own corpus, named in the message). So: do not open `plan.json` or run `extract_text.py` again,
do not re-read the brief or the original files; read only the part of an extracted text you need for this slide.
**Every slide has its own conversation.** A slide's first message begins `[slide-conversation n=<n> id=<id>]` and hands you
the plan in short, the text now on the built slides and how they were built: that conversation is about slide n **only**, now
and for every later change to it. Other slides have their own conversations and the whole deck has one more, so leave other
slides alone unless the message asks for them (then say which you changed). A note starting `Since you last worked on this
slide:` tells you about a whole-deck change made elsewhere: look at the slide as it is now before you touch it. If the slide's
conversation grew too large or was lost, the message begins `[context-handoff]` or `[context-recovery]`: everything you need
is then in the message and on disk. Read the deck file once to match the style of the slides already built, and nothing else
about them.

A build step starts with `[build-slide id=<id> n=<n> of=<total>]`. Messages also carry a `[deck-folder .aura/decks/<id>]`
line: that is where this deck's files live and where the deck is packed (`CLAUDE.md`, "Where you write"; in a build step Lumi packs).

## The step card
The app pastes this card into **every** build step, word for word (it is read from this file), because both real runs skipped
rules that were only written in the skill. Everything between the two comment lines is the card; the sections below explain it.

<!-- step-card -->
STEP CARD (the same in every build step)
1. ASK FIRST. Before you build, ask this slide's REAL design decisions as [[aura:choice ...]] lines: `slide="<n>"` on each, a recommended default, 2-4 concrete options. Cover what changes how this slide looks and feels: the real subject or scene of a 3D figure (name 2-4 concrete scenes), camera angle and framing, realism and detail, materials and colour mood, motion type and what moves, layout, which numbers lead, 2-3 written-out headline wordings, chart style, photo crop, accent word, the closing message. 3-6 questions for a 3D slide, fewer for a text slide, 1-2 for a plain closing, never more than 8 in a message. Skip only what plan.json or an earlier answer already settled. Specific to this slide, never generic. When a later question's options follow from an earlier answer (headline -> words to highlight, 3D subject -> camera and props, chart type -> series to emphasise), write one variant per answer with the same id and when="q1=<option number or text>". Reveals default to: elements arrive one at a time, by themselves, the moment the slide appears. Do not offer "all at once, no motion" and do not make the person click a reveal forward - ask instead *what* comes in and in what order. A 3D scene's own ambient motion is still a real question. Then [[aura:ask]] as the last line and end the turn.
2. A REAL DOUBT WHILE BUILDING: stop, keep what you have in the build folder, say what you found in one sentence, ask the same way, and finish this slide from the answer. Nothing answers for the person.
3. BUILD ONLY THIS SLIDE, strictly to plan.json (its title, point, bullets, ONE main picture and listed companions, 3D detail and motion, sources). Touch another slide only to repair what this one broke, and say so. A 3D figure shows its real subject in its own setting (LOOK.md 4.0), never a lab bench with a wooden base, gauge, vial or stand unless the subject is that.
4. BEFORE YOU END THE TURN: deck_check is clean (it now checks numbers, props, empty columns, title-slide fields and contrast too) and you looked at this slide's picture; EVERY NUMBER on the slide is in the user's files or has an entry in `.aura/temp/build/<slug>/provenance.json` (kind source, published with cite, computed with from, figure with figure + readFrom, scan with file + page, or illustrative) and the speaker notes say where it comes from - a number you read off a figure by eye is kind figure, and you never crop away the part of the figure it was read from; a number you read off a SCANNED page whose machine-read text got it wrong is kind scan with its file and page, and the notes say "read off scanned page N"; where a result has an uncertainty, the uncertainty is drawn at true size beside the result it belongs to - never a corner note, never a side note, never a zoomed axis that flatters it; every warning you leave is named in your reply in one plain sentence; the title and closing meta lists are built from the brief's `identity` list and nothing else - one `li` per field it names, every other `data-optional="identity"` item DELETED, and never a role the interview did not establish (no supervisor in the list means no "With thanks" line at all); a closing slide is designed for this deck, with nothing empty and nothing pasted unchanged; every text has its data-edit id; speaker notes are written.
5. END with 1-3 `[[aura:hint slide=<n> text="..."]]` lines for this slide - `slide=<n>` is REQUIRED, and a hint without it is thrown away and shows the person no chip at all - then [[aura:built slide="<id>"]] as the last line. Lumi packs the deck into the deck folder and runs its own check after the step: do not run pack_deck.py, and make no PDF, PowerPoint or notes backups. Read archetype snippets and other engine files with the Read tool; run only Lumi's own tools (node / the venv python on .aura/engine/tools) - other shell commands are refused.
6. TEXT IDS: every `data-edit` id on this slide starts `s<n>-` - the slide's POSITION in the deck (this slide is number <n>), never the plan id `<id>`. The two differ whenever the plan ids have gaps, and two slides sharing one prefix makes the editor retype the wrong text.
7. SHELL SHAPES THAT ARE ALWAYS REFUSED, and what to use instead: `python -c` / `node -e` / `python - <<EOF` -> write and change files with the Write and Edit tools; a script you wrote into `.aura/temp` -> only scripts in `.aura/engine/tools` may run; PowerShell `$vars`, `[IO.File]::...`, `New-Object Text.UTF8Encoding`, `{ script blocks }` -> none of them are analysed, so all are refused; `< file` input redirection -> pass the path as an argument. `cd <folder inside Lumi> && <allowed command>` IS allowed: when a line with a `cd` is refused, it is the other half of the line that is the problem.
<!-- /step-card -->

## Ask the real design questions first
The questions are not small talk: each one changes the picture, the layout, the words or the mood. Write them in plain
language; the app docks them under the slide preview, one question at a time with the slide's plan beside them, and shows
"continue" only on the last one. The answers come back as `q1: <option>` lines (plus `note: …` if they added words) and you
build then. Put `slide="<n>"` on every question (the plan id `slide="s3"` works too): the app shows that slide's plan
(number, title, point, bullets, picture, files, and its thumbnail if built) beside the questions. Without `slide`, the slide
being built is used.

Cover what actually matters here, for example:
- **3D figure:** which real subject or scene it shows (e.g. "the whole scramjet in flight", "a cut-open combustor", "one fuel
  injector close-up"), the camera angle and framing, realism and detail, materials and colour mood, the motion type
  (still / timed animation / physics-like / real simulation) and what exactly moves;
- **layout:** figure left or right, figure size, how much text, which numbers or claims lead, and the **headline**: offer 2-3
  actual headline wordings, written out in full;
- **chart:** the chart style and which series gets the highlight; **photo:** the crop and the annotation style;
  **accent:** which word or number gets the colour emphasis;
- **closing slide:** the message and the style (a thank-you, a one-line takeaway, a call to action, a question).
Never ask about hidden mechanics (fonts, file names, code), never ask the same thing twice. The limits on question and option
length are in SKILL.md ("Asking questions").

## Questions that depend on an earlier answer: `when` and `depends`
The person sees the questions one at a time, and a later question must **follow from the earlier answer**. Never offer
options for question 2 that only made sense for a different answer to question 1. When the options of a later question
depend on an earlier one, write **one variant of that later question per possible answer**, all with the same `id`, each
with a `when` attribute:
```
[[aura:choice id="q1" slide="3" question="Which headline fits best?" options="Pulses make the flame hold|Why the jet pulses|Fuel in, thrust out" multi="no" default="Why the jet pulses"]]
[[aura:choice id="q2" slide="3" when="q1=1" question="Which words should be highlighted?" options="Pulses|flame|hold" multi="yes" default="Pulses"]]
[[aura:choice id="q2" slide="3" when="q1=2" question="Which words should be highlighted?" options="jet|pulses|why" multi="yes" default="pulses"]]
[[aura:choice id="q2" slide="3" when="q1=3" question="Which words should be highlighted?" options="Fuel|thrust|out" multi="yes" default="thrust"]]
```
- `when="q1=2"` means: show this variant only when the answer to `q1` is its option number 2 (1-based) or the option's
  exact text (`when="q1=Why the jet pulses"`). Several answers: `when="q1=1|2"`; several conditions: `when="q1=2 & q3=1"`.
- The app shows only the variant that matches the answers so far. If the person goes back and changes `q1`, the matching
  variant of `q2` is swapped in and the answer they had given to the old variant is cleared. In the reply you get
  only one `q2:` line (the one they saw).
- Write a variant for **every** answer of the earlier question (a missing one leaves the person with no question 2).
  Variants of a question sit right after the question they depend on; they count as one question, not several.
- `depends="q1"` (optional, a comma list) on a single question without variants: the question is reset to its default
  whenever `q1` changes. Use it when the options stay the same but the right pick would change.
- **Use this whenever a later question's options come from an earlier answer.** Typical cases: headline -> which words to
  highlight (only words of that headline); 3D subject -> camera angle and props (only those that suit the subject);
  chart type -> which series or bars to emphasise; photo choice -> crop and annotation; closing style -> its wording.

## Doubts in the middle of the build: stop and ask
The questions above are not only for the start. While you build (drawing the figure, writing the text, checking the
result, looking at a screenshot), if you hit **any genuine doubt about a design choice** (the scene reads wrong at this
angle, two headlines both work, a number will not fit, the first render looks odd and there are two ways to fix it),
**stop**. Do not guess and do not finish the slide with a coin flip. Keep what you have in the build folder, write one
short sentence about what you found, emit the choice markers (each with a default, 2-4 options, concrete wording),
`[[aura:ask]]` last, and end the turn. The app keeps "make next slide" locked while a question is open, shows the
panel under the preview, and sends the answers back as `q1: <option>` lines into this same conversation. Then **continue
the same slide from where you stopped**, using the answers (do not restart the deck, do not ask the same thing again),
and finish it with the built and done lines. You can stop more than once for a slide if a new doubt really appears.
Nothing answers for the person: the app never fills in a default by itself while you wait.

## The rules
1. **Build only the slide named in the message.** Never build ahead, never touch other slides except to fix
   something this slide broke (a shared style, the slide count in the footer).
2. **Build strictly to the plan** in `.aura/decks/<id>/plan.json`: its title, its point, its bullets (the words may
   be polished, not changed in meaning), its **one** main picture with exactly the companions listed, its 3D detail
   and motion, and its sources. The plan is what the person approved. Do not add a second main picture, extra
   charts, extra text, or a different kind of picture.
3. **When the plan cannot be done well, ask instead of improvising** (same markers as above, at any point in the build): a
   number that is not in the files, a photo you need them to pick, a 3D object you cannot make believable, text that will
   not fit the look's word budget. Their answer comes back as a normal reply; continue the slide then.
4. **The deck shell**: Lumi makes it before slide 1 when the look is known (the step message names
   `.aura/temp/build/<slug>/index.html`); build into that folder and do not start another. When the message does not name one,
   slide 1 sets it up (SKILL.md steps 3–5: theme or look, fonts, runtime, footer). Later steps add their slide to the same folder.
   Archetypes: Read `.aura/engine/deck/looks/<look>/archetypes/<name>.html` directly (LOOK-BASE section 2).
5. Every build step follows the normal quality loop for **its** slide: HARD RULES, the look's rules
   (`looks/_shared/LOOK-BASE.md` plus `looks/<look>/LOOK.md`), `deck-toolkit.md`, data-edit ids on every text, speaker notes for the
   slide (presentation time is only used to pace the notes), then `deck_check.js` until the slide is clean, and look
   at its picture.
5a. **Look at it, fix it, look again - and keep going until it is right.** A clean `deck_check.js` means nothing
   broke a rule; it does not mean the slide is good. So render it and LOOK at the picture, with your own eyes, and
   ask the plain questions a person would: does the subject read instantly, is anything colliding or cut off, is
   the figure the right size on the stage, is the text legible over it, does it look like the look it claims to be?
   **Then fix what you saw and look again.** Repeat until a pass finds nothing worth changing, and say in your
   reply what you changed between passes. One look is not the loop - the loop is look, fix, look.
   Two failures this exists to stop, both of which shipped: Flat-Pack went out with its title sitting on top of its
   own figure, and a dead 3D scene went out as a blank picture - in both cases every automated check passed and
   nobody looked. Stop when the slide is right, not when the checker goes quiet.
6. **Do not pack in a build step.** After the step Lumi adds missing text ids, packs the build folder into the deck's work
   folder (the `[deck-folder]` line) and runs its own deck check, then shows the result in the chat. Do not make PDF /
   PowerPoint backups either: Lumi's **Finalize** makes the final file, the 3D videos and the PDF later, without you.
7. End with the hints and the `built` line the step card names, last. The full hint form is
   `[[aura:hint slide=<n> text="…"]]`: **`slide=` is required**. A hint without it is reported as `missing-slide` and dropped,
   so the person sees an empty "ideas for changes" row and loses the three best next edits for that slide.
8. **Provenance** (SURVEY B-05 / L-05). Numbers that appear in the extracted text of the user's files need nothing. Every other number
   needs a line in `provenance.json` next to the build folder's `index.html`:
   `{"claims":[{"slide":3,"text":"Mach 2.9","kind":"published","cite":"Etheridge et al. 2019"}, {"slide":4,"text":"158 Pa to 355 kPa","kind":"figure","figure":"fig6.png","readFrom":[0.9,0.1,0.08,0.8]}]}`
   Put `data-figure="fig6.png"` (and `data-crop="x,y,w,h"`, fractions of the picture, when you crop) on the `<img>`. The checker fails a
   number that is in no file and no entry, a "source" claim the files do not contain, a figure-read number whose region the crop hides,
   and a declaration missing from the speaker notes. Bare counts 1-10 need nothing. When in doubt, leave the number out.

## Changes during the build
The person can change the current slide or any built slide from the Claude box (`[slide N] …`, see `editing.md`) or
with direct text tweaks. Change only that slide, re-check, re-pack into `.aura/decks/<id>/` with `--replace`, then the
done line (no `built` line: it was built already). If they change a slide that is not built yet, that edit is in
`plan.json` and you build it when its turn comes.

"Build the rest for me" simply sends the next `[build-slide …]` message after each finished slide; it pauses whenever
you end a turn with `[[aura:ask]]`. "Stop" ends your run; slides already packed stay.

## After the last slide
The person checks everything and presses "I'm happy — finalize". That runs locally (no Claude). Edits after that work
as normal editor requests; Lumi marks the deck "changed since finalizing" until they finalize again.
