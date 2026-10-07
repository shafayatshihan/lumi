# Post-mortem: deck `b45622aef312` — "Plain vs Wavy Fins for AI Server Cooling"

14 slides · look **Flat-Pack** · quality **balanced** · Lumi 0.5.4 · built 2026-10-06, 03:06:36 → 11:40:11 (+06:00)
Analysis only. Nothing in `C:\Lumi` was modified; no product code was changed.

---

> **CORRECTION 2026-10-06 — read `docs/conversation-topology-study.md` first.**
> Two numbers in this document are wrong, and one conclusion inverts.
> 1. **Turns and tokens are double-counted by 2.24x.** Claude Code writes one JSONL line per content block and
>    every line repeats the same `usage` object. Deduped by `message.id`: **397 turns, not 892**;
>    **33.87 M token-units, not 75.78 M**. The **$22.99 is correct** — it came from the CLI's own cost state.
> 2. **"Cache reads are the cost driver" is false in dollars.** Reads are 95.5% of *tokens* but only **26% of
>    dollars**; **cache WRITE is 50%** ($10.78), because Claude Code used the 1-hour cache ($8/M = 2x input).
>    The correct sentence is: *the cost driver is how much new context each slide writes into the 1-hour cache.*
> Everything else below — the per-slide timings, the 12 problems, the render numbers — stands.

## Findings first

1. **The deck never finished.** Three finalize attempts, 20.1 s of work, zero output
   (`timing/timing.json` → `finalizes[]`, `output: null`). Two failed on slide 14, one was cancelled.
   `totals.captureS`, `encodeS`, `finalizeS`, `loopBytes`, `htmlBytes`, `pdfBytes` are all `null` — the
   capture/encode half of the cost model has **no measurement at all** for this deck.
2. **Of 7,101 s of machine time, Claude took 58.5 % and Blender 41.2 %.** But the single largest line
   item is one slide: the 80-frame animation on slide 5 burned **2,717.9 s (38.3 % of everything)** to
   produce a 107,890-byte MP4.
3. **94 % of all tokens were cache reads** — 71.40 M of 75.78 M. The cost driver is not what Claude
   wrote (737 K output tokens, 1 %), it is *how many times it re-read a growing conversation*: 892
   assistant turns × ~85 K average context.
4. **Machine time was only 23 % of the 8 h 33 m elapsed.** The other 77 % was waiting — largely on the
   **74 distinct questions** Claude asked across 15 conversations (9 on slide 5 alone).
5. **The `ctxTokens` 147,304 / `CTX_RESET` 150,000 near-miss is a false alarm** — the threshold was
   never armed on any code path this deck used (see §4, problem 5).

---

## 1. Time and tokens per slide

**How to read the columns.** `span` is the wall-clock from the first to the last transcript line of
that slide's own Claude conversation — it includes the time the user spent answering questions inside
the step, but not the idle gaps between steps. `claude` is Claude's own active seconds
(`cost-state.totalDuration`, the final cumulative value of the session). `tokens` is
input + cache-write + cache-read + output for every assistant turn in that session. `cost` is
`cost-state.totalCostUSD` — the CLI's API-equivalent price, not necessarily what the owner was billed.
`render` is Blender preview + final seconds from `timing.json` → `render.<sid>`. `html` is the slide's
own `<section>` in the packed file; `artifacts` is what that slide left in `.aura/decks/…/blender/`.

| # | id | what it is | span s | claude s | tokens | out tok | cost $ | render s | html B | artifacts B |
|--:|----|------------|-------:|---------:|-------:|--------:|-------:|---------:|-------:|------------:|
| — | *(plan)* | deck conversation: interview-free plan + 9 replans | 879 | 235 | 6,641,915 | 46,308 | 1.46 | — | *shell 1,114,896* | — |
| 1 | s1 | studio render, still (Blender) | 1,116 | 425 | 7,133,338 | 78,841 | 1.82 | 93.55 | 357,857 | 777,063 |
| 2 | s2 | studio render, still (Blender) | 401 | 334 | 7,414,830 | 60,691 | 1.82 | 83.38 | 306,125 | 596,048 |
| 3 | s3 | text (literature table) | 273 | 181 | 3,488,444 | 29,657 | 1.13 | — | 2,680 | — |
| 4 | s4 | SVG diagram (five steps) | 287 | 221 | 3,792,289 | 31,027 | 1.23 | — | 3,351 | — |
| 5 | s5 | studio render, **80-frame animation** | 393 | 303 | 5,205,489 | 54,221 | 1.64 | **2,726.58** | 396,817 | 358,415 |
| 6 | s6 | text (equations) | 492 | 225 | 4,539,287 | 36,969 | 1.42 | — | 2,798 | — |
| 7 | s7 | SVG chart (validation) | 690 | 236 | 3,701,049 | 59,231 | 1.45 | — | 8,556 | — |
| 8 | s8 | **live 3D** (three.js, `Aura.scene('s8flow')`) | 801 | 488 | 7,268,294 | 74,002 | 2.13 | — | 3,067 | *(uses the 989,963 B shared three.js)* |
| 9 | s9 | SVG chart (paired bars) | 370 | 340 | 4,647,308 | 60,672 | 1.48 | — | 5,792 | — |
| 10 | s10 | SVG chart (PEC + error bars) | 638 | 272 | 5,169,776 | 59,507 | 1.53 | — | 5,747 | — |
| 11 | s11 | SVG diagram (resistance path) | 352 | 240 | 5,050,259 | 49,501 | 1.62 | — | 6,018 | — |
| 12 | s12 | planned 3D, **built as animated SVG** | 267 | 207 | 2,908,135 | 37,388 | 1.38 | — | 7,032 | — |
| 13 | s14 | SVG diagram (road) | 263 | 224 | 3,958,550 | 28,917 | 1.37 | — | 4,292 | — |
| 14 | s16 | planned 3D, **no render at all** | 264 | 222 | 4,861,913 | 30,159 | 1.53 | — | **1,693** | — |
| | | **totals** | **7,485** | **4,152** | **75,780,876** | **737,091** | **22.99** | **2,903.51** | 2,236,229 *(file)* | 3,333,236 |

Token split across all 15 conversations: cache read **71,399,284 (94.2 %)**, cache write **3,642,713
(4.8 %)**, output **737,091 (1.0 %)**, fresh input **1,788 (0.002 %)**.

**Unknown — not estimated:**

* **Capture and encode seconds: unknown.** Finalize never got past its gate, so `captureS` and
  `encodeS` are `null` and `finalizes[].loops` is `[]` for all three attempts.
* **Per-slide share of the 1,114,896-byte shell: unknown.** Fonts, CSS, runtime and the inlined
  three.js are deck-wide; only slide 8 provably needs the three.js, but the packer does not record
  attribution.
* **Human answering time per question: unknown.** Transcripts record when a run ended and when the
  next began, not when the user looked at the screen.
* **Idle vs. thinking inside a gap: unknown.** The 4 h 57 m gap between slide 5 (04:18:59) and slide 6
  (09:15:37) contains 45 min of Blender work and ~4 h 12 m of nothing instrumented.
* **Slide 8's three.js runtime cost in the browser: unknown.** Nothing measures it.

---

## 2. Where it actually went

### Machine time (7,101 s total)

| consumer | seconds | share | evidence |
|---|---:|---:|---|
| Claude (thinking + tools), 15 conversations | 4,152 | 58.5 % | `cost-state.totalDuration` per session |
| Blender Cycles rendering | 2,903.5 | 40.9 % | `timing.json` → `totals.cyclesRenderS` |
| Blender process overhead (launch, scene build, write) | 25.7 | 0.4 % | Σ(`wallS` − `renderS`) over all 7 jobs |
| Finalize attempts (all failed) | 20.1 | 0.3 % | `finalizes[].wallS`: 6.96 + 6.224 + 6.905 |
| Capture / encode | **unknown** | — | never reached |

Within the 4,152 s of Claude time, the **API itself** accounted for 2,933.6 s
(`totalAPIDurationWithoutRetries` sums to the same order); the remaining ~1,218 s is tool execution —
file reads, `deck_check.js`, headless screenshots.

**The single biggest sink is Claude, at 58.5 %.** But that is 15 conversations; the biggest *single
thing* in the whole build is **slide 5's animation render at 2,717.9 s — 38.3 % of all machine time**,
more than slides 1, 2, 3, 4, 6, 7, 9, 10, 11, 12, 13 and 14's Claude time put together (2,679 s). Its
per-frame cost was remarkably stable: mean 33.97 s, min 33.42, max 42.40 (the first frame, which pays
for BVH build).

### Retries and dead ends

| dead end | cost | evidence |
|---|---|---|
| Slide 1 preview-1 rejected, scene changed, preview-2 rendered | 4.95 s render + one extra Claude run (679,015 tokens, ≈ $0.25 of slide 1's $1.82) | `b45622aef312.json` → `blender.s1.previews[0]`, `.changes[0]` |
| Slide 2 approved 04:18:59, final not rendered until 05:03:38 | 44.6 min of queue latency behind slide 5's animation (not CPU waste, but the user waited) | `blender.s2.approved.at` vs `blender.s2.final.at` |
| 3 finalize attempts | 20.1 s, zero output | `finalizes[]` |
| 10 permission deferrals / 5 logged permission walls | each costs a refused tool call plus a retry turn | `permissions.log` Oct-6 lines; `form_server.log:67, 71, 72, 79, 91` |
| 20 tool errors (`is_error` results) across the 15 sessions | worst: slide 8 with 4, slide 7 with 3 | transcript `tool_result.is_error` counts |
| Pack failure at 11:07:23 | one whole pack discarded; the app was restarted at 11:08 | `form_server.log:82-86` |

Retries and dead ends are a **small** share of the total — roughly 25 s of render plus a handful of
turns, well under 2 %. The money went to ordinary work.

### Wall-clock (30,815 s elapsed)

Machine time is 23 %. The rest is waiting. Three gaps dominate: 04:18:59 → 09:15:37 (4 h 57 m,
of which 45 min was rendering), 09:36:16 → 10:09:30 (33 m), 10:30:09 → 10:56:39 (26 m).

---

## 3. How to make it cheaper

Ranked by saving per unit of effort.

### 3.1 Switch quality to `fast` for the slide builds — effort: one dropdown

`quality` only selects the model and the effort level; it does **not** touch rendering
(`form_server.py:246`, `QUALITY_MODEL = {'best': ('opus','high'), 'balanced': ('opus','medium'),
'fast': ('sonnet','medium')}`; `BLENDER_DEFAULTS` at `form_server.py:3821` is a fixed dict).

* With `balanced`, the 14 slide builds ran **`claude-opus-5-5`** and cost **$21.53** of the $22.99.
  (The plan conversation already ran Sonnet — `PLAN_QUALITY` at `form_server.py:248` — and cost $1.46
  for 6.64 M tokens, against slide 1's $1.82 for a comparable 7.13 M. That is the price ratio, visible
  inside this one deck.)
* `fast` would put the slide builds on Sonnet at roughly a fifth of the per-token price:
  **≈ $17 of the $22.99 saved**, with zero change to the 2,903 s of rendering.
* `best` / `maximum` would raise only the effort level: more thinking tokens per turn, longer
  `claude s`, same renders. *Inference (medium confidence): on `best` expect the $21.53 to rise
  perhaps 30–60 %, since effort scales output and output is only 1 % of tokens but drives turn count.*
  I cannot measure this from one deck.
* **Caveat I cannot settle from the data:** nothing here shows what Sonnet would have done to slide
  quality. Slide 8's three.js scene (488 s of Claude, the most of any slide) is the kind of work most
  at risk.

### 3.2 Make the animation a still, or halve its samples — effort: one plan field

Slide 5 rendered 80 frames at 720p / 64 samples for **2,717.9 s** and packed to **107,890 bytes**.
Slides 1 and 2 are stills at 1080p / 128 samples and took **83.07 s** and **77.81 s**.

* Still instead of animation: **saves ≈ 2,635 s — 37 % of all machine time** in this deck.
* Keep the animation, drop `animSamples` 64 → 32: Cycles time is close to linear in samples above the
  fixed cost, so *inference (high confidence, from the benchmark model at `form_server.py:4133`,
  `per = c + a·mp + k·mp·spp`): ≈ 1,250–1,400 s saved*, roughly half.
* Keep the animation, drop `animFrames` 80 → 40 at 20 fps (a 2 s loop instead of 4 s): **saves
  ≈ 1,359 s**, measured directly from `perFrameS.mean = 33.974`.

### 3.3 Cut the number of questions per build step — effort: one line in `building.md`

Cost tracks **turns × context**, and the fit is tight: slide 1 is 82 turns × 86,030 mean context =
7.05 M predicted against 7.13 M measured. Every question Claude asks ends a run and starts another
that replays the whole conversation as cache reads.

* **74 distinct `[[aura:choice]]` questions** were asked. Slide 5 asked 9, slide 1 asked 7, slide 8
  asked 6. The three cheapest slides (s12 $1.38, s14 $1.37, s3 $1.13) asked 4 each and used 2 runs.
* The expensive slides are the many-run ones: s1 (3 runs, $1.82), s8 (2 runs but 75 turns, $2.13),
  s3/s6 (3 runs).
* *Inference (medium confidence): capping at 3 questions per build step would remove roughly 20 of the
  74 and bring the deck in near $18–19 on `balanced`, or near $4 combined with 3.1.*

### 3.4 Ship three.js only when a slide needs it — effort: a packer condition

The packed file is 2,236,229 bytes. **989,963 of them (44.3 %)** are the three.js module inlined into
an `<script type="importmap">` at byte 62,680. Exactly **one** slide uses it (slide 8's
`Aura.scene('s8flow')`); every other visual is SVG, a WebP still or an MP4.

* For this deck the module is genuinely needed, so the saving here is **zero** — but a deck with no
  live-3D slide is carrying a megabyte for nothing, and this deck would have dropped to **1.25 MB**
  had slide 8 been a studio render instead.
* Second-order: the shell also carries a 47,767-byte base64 font blob at byte 13,226 and a 40,391-byte
  runtime script. Those are reasonable.

### 3.5 The context-budget question, answered

**`ctxTokens` 147,304 against `CTX_RESET` 150,000 — did the deck nearly blow its budget? No, and it
could not have.**

* 147,304 is 98.2 % of the threshold, so the number *looks* alarming. It is the peak context of the
  deck conversation's last assistant turn (`b45622aef312.json` → `ctxTokens`; it matches the
  transcript's maximum exactly).
* But `CTX_RESET` is checked on exactly **one** code path: the interview
  (`form_server.py:3427`, `handoff = resume and int(rec.get('ctxTokens') or 0) >= CTX_RESET`).
  This deck has `flow: "plan"` and no interview state — it never ran one.
* The paths it *did* use never check it. `plan` launches with `resume=resume` and no handoff
  (`form_server.py:3323`); `replan` likewise (`form_server.py:3128`); a whole-deck chat message
  hard-codes `handoff = False` unless the message is scoped to a slide (`form_server.py:5862-5868`).
* The slide conversations are governed by `SLIDE_CTX_RESET = 2 × CTX_RESET = 300,000`
  (`form_server.py:3582`). The largest was slide 8 at 140,169 — **47 % of its threshold**. None was
  close.
* **What a hand-off would have cost:** a fresh conversation restates the deck state through
  `recovery_message()` / `slide_conv_message(… 'handoff')` (`form_server.py:1167, 1201`). The measured
  cost of starting a slide conversation cold in this deck is **≈ 40,000–42,800 tokens** (the first
  assistant turn of every slide session: 39,813 to 42,768). Against a session that was already
  carrying 115 K per turn, a hand-off would have **saved** roughly 70 K per subsequent turn.
* **What it would have saved here: nothing**, because the deck conversation stopped at 03:21:18 and
  never ran again. The 147,304 is a terminal value, not a ceiling that was pressed against.
* **Real finding:** the guard's coverage is the problem, not its value. Had the owner kept sending
  whole-deck chat messages after planning, nothing would ever have reset that conversation.

---

## 4. Inconsistencies and problems

**Twelve found. Four were named in the brief; eight are new.**

### Problem 1 — slide 14 (`s16`) carries a Blender holder nothing ever rendered *(known)*

**Evidence.** Packed HTML at byte offset 2,225,123:
`<div class="bb-blender bb-3d bb-full" data-blender="s16" data-kind="animation" … data-pending="1">`
— `data-pending="1"`, no `data-filled`. By contrast s1, s2 and s5 all carry `data-filled="1"` with an
embedded WebP or MP4. `form_server.log:100` and `:102`:
`finalize b45622aef312 failed Could not finalize: slide 14 still shows no render: render it in the build first.`
`timing.json` → `finalizes[0]` and `[2]` carry the same string, at 6.96 s and 6.905 s.

**Why.** `plan.slides[13].visual` is `{main: "3d", motion: "timed", detail: "detailed"}` with **no
`engine`**. `slide_engine()` (`form_server.py:4047-4059`) resolves that by the auto rule:
`auto = avail and look == BOLD_BLUE and kind == 'still'`. This deck is **Flat-Pack**, and the motion is
`timed`, so *both* conditions fail — the effective engine is three.js and the server queued no Blender
job. The build step then wrote a Blender holder anyway, because nothing told it not to.

**User impact.** Two full finalize attempts failed at the very end, with a message naming a fix the
user could not perform ("render it in the build first" — there was no render button, because the
slide was never a Blender slide). The deck still has no exported output.

**Fix — already in the tree, and it covers what the data shows.** FIXLOG "## Finalize engine-mismatch
fix" (`FIXLOG.md:1126-1181`) closes three layers:
`pin_engine()` writes the resolved engine into `visual.engine` before the step runs; `bl_live_block()`
tells a three.js slide in words that a `.bb-blender` holder is forbidden; `check_built()` now passes
`--blender-slides` so an orphan holder is an **error** immediately after the build, not a warning; and
`bl_holders()` makes the finalize gate refuse on any *unfilled holder whatever its nominal engine*,
with a friendly 409 and "go to slide 14".
**Confirmed against the data:** the gate keys on `data-filled`, and s16 is exactly the
`data-pending="1"` case the new `bl_holders()` catches, while s1/s2/s5 are the `data-filled="1"` case
it passes. **Residual gap:** the fix converts a 6.9 s failure at the end into an instant refusal at the
start — it does not produce a render. This specific deck still cannot finalize until slide 14 is
rebuilt, and `pin_engine` runs in `build_next`, so slides already built (s12, s16) keep their
engine-less plan entries until they are rebuilt.

### Problem 2 — slide 12 is a 3D slide with no engine and no holder *(known)*

**Evidence.** `plan.slides[11].visual = {main: "3d", motion: "still", detail: "detailed"}`, no
`engine`. The packed section (`<section class="slide resp-slide">`, 7,032 bytes) contains **no**
`bb-blender`, no `aura-3d`, no `<canvas>` — it is a hand-written animated `<svg class="stations">`
with three circular icons.

**Why.** Same resolution as problem 1: three.js by default. But here the build step produced SVG
instead, which is a third thing. Nothing in the pipeline reconciles the plan's claim with what was
built.

**User impact.** Mild on screen — the slide looks fine. Severe for anyone auditing: `plan.json` says
this deck has five 3D slides (s1, s2, s5, s12, s16) and the deck has two Blender renders, one three.js
scene, one SVG and one empty hole. Any report, estimate or re-render driven off the plan is wrong.

**Fix.** Two parts. (a) `pin_engine` already writes the resolved engine forward — extend it to write
back the engine *actually used* after a build, so `visual.engine` records fact, not intent. (b) After
a build, if `visual.main == "3d"` and the section has neither `aura-3d` nor a filled `.bb-blender`,
`check_built()` should downgrade `visual.main` to the truth (`diagram`) or raise a warning naming the
divergence. Today the check has no opinion.

### Problem 3 — three malformed `[[aura:hint]]` lines *(known — but the premise needs correcting)*

**Evidence.** `form_server.log:94-96`, all at 11:19:13:
```
marker could not be read reply b45622aef312 missing-slide [[aura:hint text="Make the icons loop gently instead of playing once"]]
marker could not be read reply b45622aef312 missing-slide [[aura:hint text="Use 'Greener' instead of 'Sustainable' on the third tag"]]
marker could not be read reply b45622aef312 missing-slide [[aura:hint text="Add a line about warmer chilled water saving chiller energy"]]
```

**Correction to the brief: Claude did not "keep" emitting malformed hints.** A scan of all 15
transcripts finds **29 hint markers in total; 26 carry `slide=` and 3 do not**. All three are in
slide 12's session, and they are *all* of slide 12's hints. Every other slide got it right. This is
one step going wrong, not a systemic parser fight.

**Why — and it is an instruction problem, as the brief says.** The validator requires `slide`
(`aura_markers.py:103`: `if name == 'hint' and not (re.fullmatch(r'\d+', attrs['slide']) and
int(attrs['slide']) > 0): return None, 'bad-value'`, with `missing-slide` raised earlier by the
`required` list). The full syntax `[[aura:hint slide=N text="…"]]` is documented in
`workspace/.claude/skills/aura-slide/SKILL.md:68` and `:109`. But the **step card** — which
`step_card()` (`form_server.py:3565-3575`) deliberately pastes into *every* build step precisely
because "the skill's own rules were skipped in both real runs" — says only:

> `building.md:29` — "5. END with 1-3 hints for this slide, then `[[aura:built slide="<id>"]]` as the last line."

and `building.md:109` — "End with the hints and the `built` line the step card names, last."

Neither restates the marker shape. The system prompt header (`form_server.py:68`) says the
step-specific instruction "is the newest and most specific instruction and **wins** for that step". So
the one text that wins is the one text that drops `slide=N`, while the adjacent `built` marker in the
same sentence *is* shown with its attribute. The wonder is that it worked 26 times out of 29.

**User impact.** Slide 12 produced no suggestion chips. The user saw an empty "ideas for changes" row
and lost the three best next edits for that slide.

**Fix.** Change `building.md:29` to carry the literal form:
`END with 1-3 [[aura:hint slide=<n> text="…"]] lines for this slide (slide=<n> is required; a hint without it is dropped), then [[aura:built slide="<id>"]] as the last line.`
`step_card()` already substitutes `<n>`, so the correct number is available. Second layer: make the
`marker-problem` event the chat already raises say *what was missing and what the line should have
been*, so the next turn can self-correct — today `aura_markers.describe()` is the only feedback and
the run has already ended.

### Problem 4 — two finalize failures and one cancellation *(known)*

**Evidence.** `timing.json` → `finalizes`:
`11:38:08 light:false ok:false wallS 6.96 "… slide 14 still shows no render"`;
`11:39:50 light:true ok:false wallS 6.224 "cancelled"`;
`11:40:06 light:false ok:false wallS 6.905` (same message).
Mirrored at `form_server.log:100-102`.

**Why.** Attempts 1 and 3 are problem 1. Attempt 2 is the user's own response to attempt 1: 102 s
after the first failure they tried the **light** path (`light: true`, the reduced-fps variant) to see
whether that would get round it, then cancelled 6.2 s in. The pattern — fail, try the other button,
abandon — is the signature of an error message that does not tell you what to do.

**User impact.** 20.1 s of machine time, but the real cost is the three-attempt loop at the end of an
8½-hour session, finishing with `changedSinceFinalize: true` and `output: null`.

**Fix.** Covered by the FIXLOG gate: a 409 with `slides: [14]`, `orphans: [14]` and "go to slide 14"
replaces the raw string, and it fires in `Finalizer.start` before any work. Add one thing the gate
does not do: because the orphan is *not* a Blender slide, "render it" is still the wrong advice —
the message for an `orphans` entry should say **remove the holder and rebuild the slide as live 3D**.

### Problem 5 *(new)* — `CTX_RESET` is unreachable on every path this deck used

**Evidence.** `form_server.py:3427` is the only `>= CTX_RESET` comparison in the file (the only other
constant use is `SLIDE_CTX_RESET = 2 * CTX_RESET` at 3582). It sits in the interview launcher.
`plan_deck` (`:3323`) and `replan` (`:3128`) pass `resume=resume` / `resume=True` with no `handoff`
argument at all. The chat route sets `handoff = False` at `:5862` and only overwrites it inside
`if conv:` — i.e. for slide-scoped messages.

**Why.** `handoff` grew up around the interview, where the open question lives in `interview.json` and
a reset is provably lossless (the comment at `:3425-3426` says exactly that). The same reasoning was
never extended to planning or to whole-deck chat, where a reset *would* lose context — so it was left
off rather than solved.

**User impact.** None in this deck (the deck conversation ended at 147,304 and was never resumed). The
latent impact is a deck where the owner keeps chatting at "whole deck" scope: that conversation grows
without bound until the model's real window refuses it, and the failure will land mid-turn.

**Fix.** Give `plan`/`replan`/deck-scope chat the same treatment as the slide path: compute
`handoff = resume and ctxTokens >= CTX_RESET and not RUNNER.waiting`, and use
`recovery_message(rec, message, handoff=True)` (which already exists at `:1167` and already restates
the deck state). If a lossless reset is genuinely impossible for free-form deck chat, then at minimum
surface the number: the UI should show "this conversation is at 147 K" before it becomes a failure.

### Problem 6 *(new)* — `tokens` and `costUsd` are recorded side by side with different scopes

**Evidence.** `b45622aef312.json` → `blender.s1.previews`:
preview 1 `{tokens: 1660361, costUsd: 1.5653}`, preview 2 `{tokens: 679015, costUsd: 1.8168}`.
The transcript's cumulative `cost-state` values for slide 1 are **0.4801 → 1.5653 → 1.8168**. So the
recorded `costUsd` is the **session running total** at that moment. The recorded `tokens`, by
contrast, comes from `run_tokens(run)` (`form_server.py:4074-4076`) which returns
`run.usage_total` — the `result` message's `usage`, i.e. **that one run only** (set at `:1862`).
Cumulative tokens at preview 1's timestamp were 5,331,164, nothing like 1,660,361.

**Why.** The headless CLI's final `result` event reports `usage` for the turn but `total_cost_usd` for
the resumed session. Both were read off the same object at `:1862-1866` and stored adjacently without
noticing the scope difference.

**User impact.** Any UI or estimate that divides one by the other is wrong, and it gets worse the
longer a slide conversation runs. Concretely, `bl_estimates()` (`:4151-4156`) takes the **median of
`changes[].tokens`** for its token estimate and the **median of `changes[].costUsd`** for its cost
estimate — a per-run number and a cumulative number used in the same prediction. Slide 1 would be
estimated at 679 K tokens and $1.82, when $1.82 is the whole slide.

**Fix.** Record the delta: keep the previous session total on the run and store
`costUsd = total_cost_usd - prev_total`, or store both explicitly as `costUsdRun` and
`costUsdSession`. Then make `bl_estimates` read the per-run field.

### Problem 7 *(new)* — the pack at 11:07:23 failed with a Windows file lock

**Evidence.** `form_server.log:82-86`:
```
2026-10-06 11:07:23 Lumi could not pack the deck b45622aef312 1 99, in main
    os.replace(tmp, target)
PermissionError: [WinError 5] Access is denied: '…\Plain vs Wavy Fins for AI Server Cooling.html.part'
  -> '…\Plain vs Wavy Fins for AI Server Cooling.html'
```
`Lumi on http://127.0.0.1:8765/` appears at line 89 — the app was restarted immediately after.

**Why.** `os.replace` onto a path another process holds open fails on Windows (`WinError 5`), unlike
POSIX. Most likely the packed deck was open in a browser or preview window, or an antivirus scanner
had it briefly. *Inference, medium confidence — nothing logs which handle held it.*

**User impact.** Slide 10's pack was lost and the user restarted Lumi (slide 10's step had just ended
at 11:07:17). The traceback is leaked raw into the log and, from the shape of the message, to the user.

**Fix.** Retry `os.replace` with a short backoff (3 attempts, 150 ms) before surfacing anything, and on
final failure say the human cause: "Close the deck in your browser and press pack again" — not a
Python traceback. The temporary `.part` file should also be cleaned up.

### Problem 8 *(new)* — slide 14's edit ids claim to belong to slide 13

**Evidence.** Inside the `close-slide` section (slide 14, id `s16`):
`data-edit="s14-1"`, `"s14-2"`, `"s14-3"`, `"s14-4"`. Slide 13 is the plan slide actually called `s14`
and uses `s14-…` ids of its own. Every other slide's ids match its own id (slide 12 uses `s12-1`,
slide 11 uses `s11-…`).

**Why.** *Inference, high confidence:* the plan ids are not the slide numbers (the deck runs
s1…s12, s14, s16 with s13 and s15 missing), so "slide 14" is ambiguous — it is both the 14th slide and
the id `s14`. Claude took the ordinal.

**User impact.** The editor's click-to-select posts `{aura:'edit', id, slide}`; a duplicated id prefix
across two slides is a collision waiting to mis-route an inline edit.

**Fix.** The build step already knows both values (`[build-slide id=s16 n=14 of=14]`). State the rule
explicitly in `building.md`: edit ids use the **plan id**, never the slide number. A post-build check
that every `data-edit` in a section starts with that section's plan id would catch it in one line.

### Problem 9 *(new)* — the render queue serialised a 45-minute animation in front of a 78-second still

**Evidence.** `blender.s2.approved.at = 04:18:59`; `blender.s2.final.at = 05:03:38` with
`render_s: 77.81`. Slide 5's full render ran `04:16:53 → 05:02:18`
(`blender/s5/logs/full-720-20261006-041653.log`, `renderS 2717.92`).

**Why.** One Blender worker, FIFO. Slide 5's animation was submitted 2 minutes before slide 2's still
was approved.

**User impact.** 44.6 minutes of waiting for an 78-second job, with no way to see why. It very likely
contributed to the 4 h 57 m gap that followed — the user walked away.

**Fix.** Shortest-job-first, or simply let a `still` pre-empt a queued `animation` between frames
(Blender writes frames individually, so the job is naturally interruptible at a frame boundary). At a
minimum, show the queue position and the blocking job's estimate — `bl_estimates()` already computes
one, and `/api/.../blender` already returns `queue`.

### Problem 10 *(new)* — 10 permission deferrals, all for the same four shapes

**Evidence.** `permissions.log`, Oct 6: 3 × `defer Bash: .aura/venv/Scripts/python.exe`,
2 × `defer Bash: cd`, 1 each for `node` (both shells), `$f`, `$t`, and the absolute-path python.
`form_server.log` logged 5 of these as blocking walls: `:67` (compound `cd …`), `:71`
(`node .aura/temp/check/s7_chart.js` — "script outside .aura/engine/tools"), `:72`, `:79`
(`python.exe - <<'EOF'` heredoc), `:91` (`New-Object … Text.UTF8Encoding` outside the
ConstrainedLanguage allowlist).

**Why.** Three recurring patterns that the rules forbid but the skill does not warn about: compound
`cd X && …` commands, running a generated script from `.aura/temp/`, and constructing .NET encodings
in PowerShell. Slide 7 hit the `.aura/temp/check/s7_chart.js` wall twice in a row (03:34:01Z and
03:34:08Z = 09:34 local) — it retried the same forbidden thing in the other shell.

**User impact.** Each wall costs a refused tool call plus a retry turn, and at three denials the runner
raises a "Claude keeps running into a rule" status (`form_server.py:1845-1847`). Slide 7 recorded 3
tool errors and slide 8 recorded 4 — the two worst — and slide 8 is also the most expensive at $2.13.

**Fix.** Put the three shapes in `building.md` as named negatives ("never `cd X && …`; never run a
script you wrote into `.aura/temp`; never `New-Object Text.UTF8Encoding`") with the allowed
alternative beside each. The denial text already names the rule — feed it back into the next turn
rather than only into the log.

### Problem 11 *(new)* — 44 % of the packed file is three.js for one slide

**Evidence.** `<script type="importmap">` at byte 62,680 holds a 989,963-byte
`data:text/javascript;base64` three.js module. The file is 2,236,229 bytes. Exactly one
`Aura.scene(…)` registration drives a real holder: `s8flow`, on slide 8. (A second `Aura.scene('orb', …)`
is inside a comment block — the template's example, shipped as dead text.)

**Why.** The shell is wired before the slides are built (`ensure_shell`), so the packer cannot know
whether any slide will need three.js.

**User impact.** On this deck, none — slide 8 needs it. On a deck with no live 3D (which this deck
almost was: s12 and s16 both resolved to three.js and neither used it), it is a megabyte of dead
weight in a file people email.

**Fix.** Strip the importmap at pack time when no section contains `aura-3d`, and strip the commented
`orb` example always. Both are safe textual conditions on the packed HTML.

### Problem 12 *(new)* — estimates are computed and then thrown away

**Evidence.** `bl_estimates()` (`form_server.py:4125-4156`) produces `{seconds, low, high, basis}` for
every preview and full render and attaches it to the job (`job.est`, `:4392`). `timing.json` records
`renderS`, `wallS`, `frameTimes` and `perFrameS` — and **no estimate**. The bench model is stored
(`bench: {c: 5.94, a: 5.6006, k: 0.28172, startup_s: 6.41, device: "OPTIX NVIDIA GeForce MX350"}`) but
never scored against the seven jobs it predicted.

**User impact.** Nobody can tell whether the progress bars were honest. The one thing the user stares
at for 45 minutes is the one thing with no accuracy record.

**Fix.** Write `estS` and `estBasis` next to `renderS` in each `previews[]`/`final` entry. Three
numbers per job turns the whole corpus into a calibration set.

---

## 5. What the instrumentation could not tell me

Five things I wanted and could not get, with the one-line change that would fix each.

| question I could not answer | why | record this next time |
|---|---|---|
| How long did capture and encode take, and how big is the finished deck? | Finalize never passed its gate; `totals.captureS/encodeS/finalizeS/loopBytes/htmlBytes/pdfBytes` are all `null`, `finalizes[].loops` is `[]`. | Write a `finalizes[]` entry with per-phase timings **even on failure**, including the gate check itself — a 6.9 s failure should say which 6.9 s. |
| How much of each slide's cost was the user thinking vs. Claude working? | Transcripts give run boundaries, not screen time. The 74 questions are visible; the answering latency is not. | Stamp each `[[aura:choice]]` with the time it was shown and the time the answer arrived. Two timestamps per question turn the 77 % "waiting" bucket into something actionable. |
| Were the render estimates right? | `bl_estimates()` output is never persisted (problem 12). | `estS` + `estBasis` alongside `renderS`. |
| How much of the 1,114,896-byte shell belongs to which slide? | The packer records no attribution; three.js, fonts, CSS and runtime are one undifferentiated block. | A small `packed.json` next to the deck: `{shellBytes, byComponent: {three, fonts, css, runtime}, bySlide: {s1: …}}`. |
| Which process held the HTML open at 11:07:23? | `PermissionError` is logged raw with no handle information. | On `WinError 5`, retry, and if it still fails log the retry count and (where cheap) the holding process name. |

Two smaller gaps worth closing while you are in there:

* **Per-run cost.** As problem 6 shows, `costUsd` is cumulative and `tokens` is not. Recording the
  delta would have made part 1 of this document a direct read instead of a reconstruction from
  `cost-state` records in `~/.claude/projects/C--Lumi/`.
* **A single timeline.** The story of this deck is spread across `timing.json` (renders),
  `session.json` (step boundaries), `b45622aef312.json` (approvals and changes), `form_server.log`
  (failures), `permissions.log` (walls) and fifteen `.jsonl` transcripts in a directory Lumi never
  references. One append-only `events.jsonl` per deck, with `{at, kind, sid, detail}`, would have
  replaced all of the cross-referencing above.

**On the transcripts:** they were found, in full, at
`C:\Users\shafa\.claude\projects\C--Lumi\<sessionId>.jsonl` — all 15 (the deck session from
`session.json` plus the 14 ids in `slideConvs`). Every token and cost figure in part 1 comes from
them. Nothing in this document is estimated unless it is labelled as an inference.
