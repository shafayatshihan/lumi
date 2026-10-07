# Owner preferences, extracted from deck b45622aef312

What this is: every build-step question Claude asked while making "Plain vs Wavy Fins for AI Server Cooling",
sorted into rules worth keeping and choices that must stay questions. Sources: the 15 conversations in
`C:\Users\shafa\.claude\projects\C--Lumi\<sessionId>.jsonl`, `C:\Lumi\.aura\decks\b45622aef312.json`,
`C:\Lumi\.aura\decks\b45622aef312\plan.json`, and `docs/deck-b45622-postmortem.md`.

**Status: PROPOSAL. Nothing here is applied.** The owner approves rule by rule.

**Coverage.** 76 unique question markers found; 74 answered and classified; 2 never answered (deck `q1` logo,
deck `q2` 7-vs-8 minutes — asked, no answer in any transcript; the plan kept `minutes: 8` and "logo space top
corner", inferred, low confidence). The earlier deck `93a68b191a2a` (sessions `701857dc`, `8ec571b5`,
`9894990c`) **does not survive** in `C:\Users\shafa\.claude\projects\C--Lumi\`, so **no preference here is
confirmed on a second deck**; every "2-3 sightings" below is within this one deck.

**Buckets: STANDING 5 · THIS-DECK 58 · UNCLEAR 11 · unmatched 2.**

---

## 1. STANDING PREFERENCES (5)

### S1 - A reveal plays itself once when the slide arrives. Never "all at once", never a click.
* s3 `q3 "How should the table appear when the slide opens?"` -> `Rows slide in one by one` (rejected "Everything shows at once")
* s4 `q5 "How should the steps appear?"` -> `Light up on their own, one after another` (**rejected the default** "Light up one by one as you click", rejected "All shown at once, no motion")
* s7 `q4 "How should the lines appear when the slide opens?"` -> `Draw in one by one: Wang, plain, wavy` (rejected "All shown at once")
* s9 `q4 "How should the bars come on screen?"` -> `Grow speed by speed, left to right` (rejected "All at once, no motion")
* s11 `q4 "What should move on the slide?"` -> `Heat dots slow down at the air side` (rejected "Nothing moves, keep it still")
* s12 `q4 "How should the icons move?"` -> `Each icon plays once as you arrive on the slide` (**rejected the default** "Gentle loop...", rejected "Barely any motion, a soft fade in")

Six sightings, no counter-example. The still option was offered five times and refused five times; the
click-advanced and endless-loop options were each offered and refused once. **Scope limit, stated because it
matters:** this is about *element reveals*. Ambient 3D motion stays a question - s5 `q3` chose a continuous
"Air streaks and water glow" and s14 `q4` chose a "Slow turn of both fin sheets".

### S2 - Uncertainty is shown at its true size, next to the result, never shrunk or sent to a corner.
* s6 `q3 "How should the uncertainty show?"` -> `A +/- band under the PEC equation` (rejected "A small note in the corner")
* s7 `q3 "Should the charts show Wang's scatter as a shaded band around its line?"` -> `Yes, a soft shaded band` (rejected "No, just the three lines")
* s10 `q2 "How should the uncertainty show on the chart?"` -> `True-size error bars crossing 1.0` (rejected "Zoomed PEC line, bars as a side note")
* s9 `q3` -> `Add pressure drop +27-28% too`, the option with more numbers rather than fewer

Three direct sightings plus one supporting. Note the deliberate split with the headline (see C3): the words may
claim the win, the picture must not hide the error bar.

### S3 - When content will not fit, merge or cut it on the one slide. Splitting is a last resort.
* s3 `q4 "The table is over the 25-word limit for this look. How should I fit it?"` -> `3 rows: Cho and Busby merged, Wang, ours` (**rejected the default** "Keep 5 rows, one or two words per cell", rejected "Split the table over two slides")
* s6 `q4 "The full equations won't fit. Which fix should I use?"` -> `PEC in full, j and f as named cards` (rejected "Split into two slides", rejected "Shorter headline...")

Two sightings. Both refused the split; both also refused shrinking content to telegraphic stubs - he merges
whole items away and keeps the survivors readable.

### S4 - A sequence of steps is drawn as a rising path, not a flat row.
* s4 `q1 "What picture should carry the five objectives?"` -> `A staircase climbing to the answer` (**rejected the default** "Stepping stones across a stream")
* s12 `q2 "How should the three ideas be laid out?"` -> `Three icons along a path: from rack, to fan, to recycling` (**rejected the default** "Three panels side by side, each with its moving icon")
* s14 `q2 "How should the road look?"` -> `A road that climbs up steps toward the next goals` (**rejected the default** "One flat road left to right")

Three sightings, the recommended default refused all three times.

### S5 - An A-vs-B figure shows two whole objects side by side. No morph, no ghost, no half-and-half.
* s5 `q1 "What should the 3D picture show?"` -> `Two fin cells side by side` (rejected "One cell that turns from flat to wavy", "Wavy cell cut open, flat one ghosted")
* s8 `q1 "What should the 3D scene show?"` -> `Plain and wavy cells side by side` (rejected "One big wavy cell, plain one faded behind", "One cell: half plain, half wavy")

Two sightings. *Inferred generalisation, medium confidence:* the evidenced preference is "two fin cells side by
side"; the leap to "any A-vs-B comparison" is the analyst's. It is a safe leap because it only shapes the options
Claude writes, not which one is chosen - but a third sighting on a non-fin subject would make it certain.

---

## 2. THIS-DECK CHOICES - do not promote (58)

About fins, racks, PEC and this exam, and nothing else. Baking any in would make every future deck wrong the
same way.

**3D subject and scene (6):** s1 `q1` `Rack with door coil and both fin sheets`; s2 `q1`; s5 `q1`; s8 `q1`;
s14 `q4` `Slow turn of both fin sheets`; s5 `q3` `Air streaks and water glow`.
**Camera (4):** s1 `q2` `Three-quarter view from behind`; s2 `q2`; s5 `q2` `Low angle along the airflow`
(default refused); s8 `q4` `Tilted three-quarter, like your Fig. 4`.
**Materials and colour (4):** s1 `q3` `Flat-Pack colour blocks, toy-like` (default refused); s5 `q4`
`Real metal: silver fin, copper tube`; s2 `q3` `Warm red air in, cool blue air out`; s8 `q2`.
**Headline wording (14):** s1/s2/s3/s4/s5/s6/s7/s8/s9/s10/s11/s12/s14/s16 `q1`-`q5` variants, plus deck `q5`
`Wavy fins beat plain fins`.
**Which number leads (7):** s2 `q4`; s5 `q5`; s8 `q6`; s9 `q3`; s10 `q3` `PEC 1.027 -> 1.018`; s11 `q3`; s12 `q3`.
**Layout of this slide (5):** s1 `q4`; s2 `q6`; s7 `q1`; s14/closing `q5`; s6 `q1`.
**Content scope for this subject (7):** s3 `q2`; s4 `q2`; s4 `q4`; s11 `q2`; s13 `q3`; deck `q3`; deck `q4`.
**Identity and admin (5):** s1 `q7` `Yes, show ME 400`; s14 `q3`; s16 `q2`; s13 `q4`; s1 `q6`.
**Residual conditional variants and re-asks (6).**

---

## 3. UNCLEAR - one sighting, could go either way (11)

| # | Question and answer | What would settle it |
|---|---|---|
| U1 | Big picture over a split layout: s2 `q6` and s14 `q5` both refused a half-and-half default, but s1 `q4` accepted `Title left, picture right`. | One more deck. If full-bleed wins again on a non-title slide, promote. |
| U2 | Three-quarter camera: chosen on s1, s2, s8; refused on s5. | Whether the s5 refusal was about the wave being invisible from above (subject-specific) or a dislike of high angles. |
| U3 | Realism: toy-like Flat-Pack blocks on s1, real metal on s5, **same deck**. | Direct contradiction already. Keep asking; do not promote in either direction. |
| U4 | Numeric headlines: s7 and s11 both refused a qualitative default. | A third slide offering both. If numeric wins again, promote as an option-writing rule only. |
| U5 | s4 `q2` `Five, one per objective in your report`. | Contradicted the same week by s3 `q4` merging five rows into three. Needs a case with no word-budget pressure. |
| U6 | s3 `q2` `Solid accent band across the row` to mark his own work. | Whether "my row gets the loudest treatment" holds on a non-table slide. |
| U7-U11 | s8 `q3`; s12 `q4`; s9 `q2`; s7 `q1`; s11 `q4`. | Each one sighting of a chart/motion idiom with an equally plausible this-deck reading. |

---

## 4. Where each rule belongs (one home per fact), in that file's voice

**S1 -> `workspace/.claude/skills/aura-slide/building.md`, the step card, appended to line 1.**
> Reveals default to: elements arrive one at a time, by themselves, the moment the slide appears. Do not offer
> "all at once, no motion" and do not make the person click a reveal forward - ask instead *what* comes in and in
> what order. A 3D scene's own ambient motion is still a real question.

**S2 -> `building.md`, the step card, appended to line 4 before "; every warning you leave is named".**
> ; where a result has an uncertainty, the uncertainty is drawn at true size beside the result it belongs to -
> never a corner note, never a side note, never a zoomed axis that flatters it

**S3 -> `engine/rules/hard-rules.json`, `rules[0].whenTextDoesNotFit`, AND the identical sentence in
`CLAUDE.md` lines 17-19** (the test keeps them in step - both must change in one edit).
> `"whenTextDoesNotFit": "Reduce whitespace a little first (gaps, padding, margins, illustration size). If it
> still does not fit, merge or drop whole items so the survivors stay readable - do not grind every cell down to
> one word. Split into two slides only when nothing can be dropped. Never make text smaller than the minimum."`

**S4 -> `workspace/.claude/skills/aura-slide/aura-blend.md`, section 4 (Diagrams).**
*Note: `looks/flat-pack/LOOK.md` does not exist - only `looks/bold-blue/`. Until a Flat-Pack look file exists,
aura-blend.md section 4 is the only "one home" a look-neutral visual rule has.*
> A sequence - objectives, a method, a roadmap, a set of next steps - is drawn as a path that climbs: a
> staircase, a rising road, a route with a goal at the top. Not a row of equal panels, not a level line of
> stepping stones. Offer two climbing shapes and let them pick between those.

**S5 -> `workspace/.claude/skills/aura-slide/looks/bold-blue/LOOK.md`, section 4.0, as a row under the
subject-family table.**
> | two things compared | both objects, whole and side by side, identical in everything but the one difference | same staging for both, one light | the difference called out by a label, never by fading one out |
>
> Never show a comparison as a morph between A and B, as B with A ghosted behind it, or as one object that is
> half A and half B: the person cannot see what is the same.

---

## 5. Enforceable vs advice

| Rule | Checker | The rule a check would apply |
|---|---|---|
| S1 | **`deck_check.js`, partly enforceable (warn).** | A slide planned with `motion` other than `still` whose HTML has no `@keyframes`, no `animation:` and no reveal hook -> warn "slide N was planned to move but nothing animates". The click-vs-arrival half cannot be checked without running the event loop; that half is advice. |
| S2 | **Advice only.** | The checker traces numerals, not meaning. It cannot tell an error bar from a bar. A proxy would be noisy; not recommended. |
| S3 | **Already enforceable, wording change only.** | The word-budget error already fires; this changes what Claude does next, not what is measured. No new check. |
| S4 | **Advice only.** | Nothing can see a metaphor. |
| S5 | **`blender_check.js`, weakly.** | Could warn when a plan `phrase` contains "vs"/"compared" and the render has one connected blob rather than two. Noisy on cutaways. Advice recommended. |

One rule (S3) rides an existing check, one (S1) could gain a cheap warn, three are advice. `CLAUDE.md` already
says a rule nothing checks is still a rule.

---

## 6. Conflicts and duplicates

**C1 - S3 contradicts the current hard rule.** `hard-rules.json` `whenTextDoesNotFit` and `CLAUDE.md` rule 1
both end "...shorten the words or split into two slides". The owner refused the split twice and refused one-word
cells once. The proposed wording reorders the remedies; **it must change in both places in the same edit or
`test_instructions.py` fails.**

**C2 - The identity answers duplicate the interview and must NOT become rules.** s1 `q7` (`Yes, show ME 400`),
s14 `q3`, deck `q1` (logo), deck `q2` (minutes) are all now covered by `interviewing.md`. A rule here would be
worse than useless: it would freeze one student's course code into every deck *and* leave the interview asking.

**C3 - The caution preference is now an interview question and the evidence is split.** Deck `q5` overrode
"Net gain is small next to the uncertainty" with "Wavy fins beat plain fins", while s10 `q2` chose true-size
error bars. `interviewing.md` now asks "how cautious the claims must be", so only the *visual* half (S2) is
proposable; the headline half stays with the interview.

**C4 - S1 already half-exists and is being ignored.** `building.md` lists "the motion type ... and what exactly
moves" as a thing to ask. The proposal narrows it: keep asking *what* moves, stop offering *whether* it moves.

**C5 - s13 `q4` "Drop the signpost" should not become a new rule.** `CLAUDE.md` -> "Always" already says
"Only use facts, numbers and figures from their files... do not invent data." The question should never have
been asked. Possibly one line in the step card: *a claim with no support in their files is dropped, not asked
about.*

---

## 7. Recommended shortlist

| Rank | Rule | File | Questions saved per deck |
|---|---|---|---|
| 1 | S1 reveal motion | `building.md` step card, line 1 | ~5 (6 of 14 slides asked it here) |
| 2 | S2 uncertainty at true size | `building.md` step card, line 4 | ~2 |
| 3 | S3 merge, do not split | `hard-rules.json` + `CLAUDE.md` | ~2 (both were mid-build doubts - the expensive kind, each ended a run) |
| 4 | S4 sequences climb | `aura-blend.md` section 4 | ~1 |
| 5 | S5 comparisons side by side | `looks/bold-blue/LOOK.md` 4.0 | ~1 |

Eleven of 74 questions, about 15%. With C5 that is roughly 12 - close to the post-mortem's estimate that a
3-question cap would remove 20, but these come off without taking away a decision the owner wanted to make.

---

## 8. The finding that matters most

**The owner rejected Claude's recommended default on 17 of 74 questions (23%).** The defaults are good, but the
asking is earning its keep - a blanket cap on questions would have silently imposed the wrong answer roughly
one time in four. Promote the five above; keep asking the rest.
