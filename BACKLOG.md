# Lumi backlog — everything planned, found or asked for, not yet done

Written 2026-10-06. v0.5.4 is the live release. Ordered by **value per unit of effort**, not by when it was
asked for. Each item says what it is, the evidence, and where the spec lives if there is one.

Nothing here is in progress unless marked. The in-flight batch is tracked in `RESUME.md`.

---

## P0 — a promise the product does not keep

### B1. Four of the five looks do not exist
`engine/form/js/looks.js:9-14` offers **Bold Blue, Pink Punch, Flat-Pack, Happy Headspace, Yellow Frame**.
`engine/deck/looks/` contains **`bold-blue` only**, and `skills/aura-slide/looks/` has **one** `LOOK.md`.

A person who picks Flat-Pack gets a name, a one-line description and an icon — then Claude improvises with no
structural rules. The owner's deck `b45622aef312` was built this way.

Consequences already observed:
- the 3D engine auto-default is gated on `look == BOLD_BLUE` (`form_server.py:4039`), so **every non-Bold-Blue
  deck leaves 3D slides without an engine** — the root cause of the slide-14 finalize failure;
- preference rule S4 had no home, because there is no Flat-Pack `LOOK.md`
  (`docs/owner-preferences-proposal.md` section 4);
- nothing enforces word budgets, type scale or composition for four of five looks.

**Owner's rule (2026-10-06): every look follows the same structural rules as Bold Blue; only brand style and
aesthetics differ.** So the work is: factor the look-neutral rules out of `looks/bold-blue/LOOK.md` into a
shared base, then give each look a short file carrying only its palette, type, motion feel and figure idiom.
Either ship the four looks properly or stop offering them — offering a look with no definition is the worst of
the three options.

---

## P1 — cheap, measured, high return

### B2. Stop re-reading the same files (worth $3–5 per deck)
Evidence: `docs/conversation-topology-study.md` section 6. **61% of tool calls are read/search; 90.6% of
characters read were repeats.** `index.html` was read **22 times across 14 conversations** ≈ 415K tokens ≈
**$3.3** — larger than the entire per-slide-vs-shared difference.
1. Give the slide agent a section read (`read_slide_section(id)`) or a per-slide scratch file, instead of the
   whole packed deck.
2. Inline the static skill text (`building.md`, `SKILL.md`, `BLENDER.md`) into the preamble or a pinned prefix
   rather than letting Claude Read it mid-conversation — ~135K tokens of redundant static reads.
3. Cap Part A of `build_message` ("how the slides already built were made") at the last 2–3 slides. It grows
   5,855 → 11,800 chars; 40,659 repeated tokens per deck, and it grows with deck size.

### B3. The slide list does not scroll
No `overflow` rule for the slide list in `plan.css` / `studio.css`. A long deck cannot be navigated.
Owner asked 2026-10-06.

### B4. True fullscreen
Already **maximized** (`installer/Lumi.cs:709`, `engine/form.ps1:76` both pass `--start-maximized`). The owner
asked for *fullscreen*, which is not the same thing — maximized keeps the title bar and taskbar. Decide between
kiosk mode (`--kiosk`) and a fullscreen toggle, and whether it applies to the app shell, the presenting view, or
both.

---

## P2 — specced, not started

### B5. Parallel slide building — `docs/parallel-slides-spec.md`
Claude works on up to 3 slides at once while renders stay strictly one-at-a-time. Measured prize: slide 5's
render was **2,717 s — 38% of all machine time** — with Claude idle throughout, and the build was
**8 h 33 m elapsed at 23% machine time**.
Confirmed safe by `docs/conversation-topology-study.md` section 4(b): lanes work *because* each resumes its own
`slideConvs[id]`. **The spec's biggest hazard: `current-run.json` is one shared file, so three lanes would
overwrite each other's record of what each run wrote, and the checker would silently validate the wrong slide.**

### B6. Baked motion pipeline — `docs/blender-batch6-spec.md` Part B
Bake Cycles detail once, play it through the existing capture pipeline, instead of path-tracing every frame.
A throwaway probe measured **draft bake 10.5 s, final bake 61.3 s** against the spec's guessed 20–30 s and
~2 min, so the case is stronger than written. Part C's preconditions (verify a real software-GL finalize, add a
fallback, make capture failure loud) must land first.

---

## P3 — asked for, needs a decision before it is work

### B7. Remotion, or another animation tool
The owner asked whether Remotion could make better in-slide animations. **Evaluate before adopting.** Today
Lumi animates with CSS/SVG, three.js, and Blender for photoreal work, and it already has a deterministic
seek-based capture pipeline that turns any of those into video. Remotion is a React video renderer — it would
be a fourth engine with its own toolchain, and much of what it provides (frame-accurate capture, encode) Lumi
already has. The honest question is whether it buys *authoring* expressiveness that CSS/SVG lacks. Answer that
with a prototype of one real slide before committing.

### B8. The "avant-garde designer" bar
The owner wants every deck to read as the work of the best designer in the world. That is a standard, not a
ticket. Where it becomes concrete: B1 (four looks with no rules cannot meet any standard), the figure idioms in
`LOOK.md` section 4, and the five preference rules now being applied. Worth turning into a short written
standard each look file must satisfy, so it can be checked rather than hoped for.

### B9. The default quality tier
`quality` only selects the model; `BLENDER_DEFAULTS` is fixed, so `fast` would have produced **pixel-identical
renders and saved ~$17 of $22.99** (`docs/deck-b45622-postmortem.md` section 3.1). Default deliberately
unchanged — it trades cost against how well slides are written. Being surfaced in the look step with the saving
in plain words; the explicit model + effort control is in the current batch.

### B10. Reload mid-interview lands on the library
`afterLoading()` only reopens a deck while Claude is *running*, so a reload mid-interview shows the library
instead of the question. Nothing is lost — the question is in `interview.json`, and the e2e proves it. Changing
it alters where the app lands on **every** launch, so it is the owner's call.

---

## P4 — known, unfixed, low urgency

- **The animation took 98 min against the contract's "10–60 min"**, and the estimate shown before committing
  drifted 1 h 04 → 2 h 17. Users decide on a number wrong by 2×. `docs/blender-contract.md` section 8.
- `timing.blender.version/gpu` and `app.version` are null in the timing record.
- The clean s1 still re-measure owed for batch 6's A/B: partial passes gave 176–200 s render against the
  contaminated 281.5 s.
- ~18 dead wizard selectors in `app.css` (harmless; pruning risks the font-floor allow-list check).
- Transcripts for deck `93a68b191a2a` were already deleted, which made its post-mortem impossible and left every
  preference rule resting on a single deck. Consider retaining something cheap and durable.
- Pre-existing owner decisions: git-history exposure (commits `20fe2f0`, `d5cbdde`, `9e18103` carry names and
  IDs), accent `#005AE0`, the 25-word cap for non-Bold-Blue looks, retention policy, the bin, checker strictness.
- Sandboxes awaiting manual deletion (the protected-path guard refused): `X:\aura-dev-b3-ts`,
  `X:\aura-dev-pa-ts`, `X:\aura-dev-pa-setup`, `X:\aura-dev-pa-install` (386 MB), `X:\aura-dev-iv-ts{,2,3}`,
  `X:\aura-dev-b5-real`.

---

## Already covered — do not re-add

- **Asking the user about language, formality and density.** `interviewing.md:55-56` already asks "formal or
  casual" and "text-heavy or equation-heavy: how much maths the room can take", after Claude has read the files.
- **One conversation per slide.** Settled by measurement, not opinion:
  `docs/conversation-topology-study.md` — per-slide is cheapest at 4, 14 and 30 slides with no crossover, and
  the money is the least important of four reasons.

---

## P0 — added 2026-10-07: the copy is too long, everywhere

The owner, looking at the look step: *"some buttons explain too much, too much text — make the UX/UI as if you
are Steve Jobs. I want a quality product."*

Evidence in one screenshot (`lumi-e2e/1920x1080/07-theme-step.png`): the primary button contains a paragraph —
**"use this look, plan my slides / claude reads everything once more and suggests the slides. you check them
before"** — above it a three-line intro, four quality options each with a two-line description, and two further
paragraphs of reassurance. The page apologises for itself. The layout overflow that blocked the release was a
*symptom* of this, not the disease.

### The standard, to apply app-wide
1. **A button says what it does in two to four words.** Never a sentence inside a control, never a second line.
2. **Delete reassurance.** Text that exists to calm the designer, not to inform the person, goes. Keep the one
   fact that matters at the moment of choosing.
3. **Explain at the point of doubt, not in advance.** Pre-emptive explanation is noise until someone is stuck.
4. **One idea per element.** A name and a few words of difference beats a description per option.
5. **If the UI needs a paragraph to be understood, the UI is wrong** — change the control, not the wording.
6. **Shorter, not vaguer.** Someone who has never seen the screen must still know what pressing the button does.

### Scope
Being applied now to the look step (in flight). Still to audit, every user-visible string: the home and library,
loading and sign-in, the interview screen, the plan page, the build page and its question cards, the editor,
finalize, and every error and empty state. Error text is exempt from brevity where clarity costs words — rule 12
(never raw, always actionable) wins over rule 1 there.

Worth doing as one pass with a written before/after word count per screen, so it can be judged rather than
argued about. This is also what B8 ("the avant-garde bar") actually means in practice — restraint is the
visible part of quality.

---

## P0 — added 2026-10-07: every deck needs its own folder (this is a correctness bug, not tidiness)

Owner: *"separate folders for each deck, because each deck has separate reports, files, images."*

Today there is **one shared upload area for every deck**: `FILES = ROOT / '3 - Put your files here'`
(`engine/form_server.py:29`) with seven type subfolders (`FOLDERS`, `engine/form/js/uploads.js:9`), and one
shared extracted-text corpus in `.aura/temp/text/` with a single `manifest.json`.

Why this is worse than untidy:
1. **The provenance checker can validate a number against the wrong deck's document.** B-05
   (`engine/tools/lib/claims.js`) traces every number on a slide against the extracted corpus. With one shared
   corpus, a figure from deck A's report can silently "verify" a number on deck B's slide — the check passes and
   nobody learns the number was never in *this* deck's sources. That is the exact failure the provenance system
   exists to prevent.
2. Every deck's Claude reads a manifest containing every other deck's files — paying for the context and
   risking the wrong source.
3. The person cannot tell which files belong to which deck, and deleting a finished deck's files is guesswork.
4. `stale_sources` / `ensure_extracted` re-extract across the whole shared pile.

**The work:** per-deck source folders and a per-deck corpus and manifest, with the type subfolders kept inside
each deck's folder. Decide what the person sees on disk — the current numbered top-level folders are part of
how Lumi explains itself, so a deck folder probably wants a readable name (the deck title), not an id.
**Migration matters:** published 0.5.3/0.5.4 installs have real files in the shared area and real decks that
reference them — the owner has three. Adopt rather than orphan, and never move a person's files without saying so.

---

## P2 — added 2026-10-07: replace the waiting game with a flappy game

Owner: replace "catch the sparks" (`engine/form/js/lumi-play.js`) with a flappy-style game.
- **Space bar plays it**, and a **pause / resume** control.
- The play area **expands to cover the lower half of the screen while playing, and shrinks when not.**
- Keep what already works in `lumi-play.js`: it runs only while visible, the pointer is inside and the window
  is focused; it is hidden while Claude is waiting on a question; the real current step shows beside it; and
  "hide" is remembered in `localStorage`.
- It exists to make a long render bearable — the 100-frame loop in the owner's deck took 45 minutes — so it must
  never steal a key the page needs, must pause itself when a render finishes or a question arrives, and must
  cost nothing when hidden.
- Name it generically in the UI (a flappy game), not after the commercial title.

---

## P1 — added 2026-10-07: editor.js saves from a stale plan copy

Found by the look-layout agent while fixing something else; **left unfixed on purpose**, reported rather than
patched mid-batch.

`engine/form/js/editor.js` saves from a stale copy of the plan, so **removing a slide after slide 1 has
finished building can return 409 "built"**. The editor is acting on a plan snapshot taken before the build
changed it.

This is almost certainly the same family as the owner's reported bug *"after a deck gets generated it doesn't
update instantly on the left"* and the "slide 7 of 7" / "slide 7 of 13" disagreement: several places hold their
own copy of the plan and none of them re-reads after a build step. Fix the source of truth once rather than
patching each symptom.

---

## Note on verification, learned the hard way 2026-10-07

**Suites are not reliable while the machine is loaded.** Running a second agent during verification produced
`test_server` 1288/1295 on one run and a different 5 failures on another — all in migration, fake-claude plan
generation and morph/pivot checks, none in anything either agent had changed, and one reproduced with code from
*before* the change. The e2e browser also crashed with "Target crashed" and AudioContext errors. 14 sandboxes
and 8 node/python processes were live at the time.

**Rule: run the release suites on a quiet machine, with no other agent working and no leftover sandboxes.**
A green run under contention proves nothing, and a red one wastes hours chasing a regression that is not there.

---

## P1 — added 2026-10-07: add and delete slides during "build your deck"

Owner: *"allow deleting and adding slides at the build your deck stage."*

**Partly there already, and partly broken.** `engine/form/js/editor.js` has a "coming up" column of unbuilt
slides; tapping one opens a small plan card with Save (`editor.js:8`, `:89-101`, `:597`), which is W-01
mid-build editing. What is missing or broken:
- **Adding** a new slide mid-build. `editor.js:477` already constructs a blank slide object for a new card, so
  the shape exists; the flow around it does not.
- **Deleting** a slide after the build has started returns **409 "built"**, because `editor.js` saves from a
  stale copy of the plan — the same defect logged above. A slide that is still unbuilt should be removable at
  any time; a built one should be removable with a clear warning that its work is discarded.
- The counts go stale with it: the owner saw the left list holding 7 thumbnails and the nav reading
  "slide 7 of 7" beside "slide 7 of 13 is ready".

So this is one job with the stale-plan fix, not two. **Fix the source of truth first** — one place owns the
plan, everything re-reads after a build step — then add and delete become small. Doing them on top of the
stale copy would just add two more ways to get a 409.

Note the ordering constraint: a deck mid-build has built slides, a current slide and unbuilt ones. Inserting or
removing changes every later slide's **position**, which is what `data-edit` prefixes and the checker's
`lib/edit_ids.js` key off. Renumbering has to be part of the operation, not an afterthought.
