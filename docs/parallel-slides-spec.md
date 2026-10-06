# Parallel slide building (SPEC — not started)

Status: **designed with the owner 2026-10-06, NOT started.** Runs after the interview feature lands.
Nothing here is built. Nothing is committed.

## Context

Every planned slide already has its own Claude conversation (`slideConvs[id]`, v0.5.2). But `RUNNER` is a
**single global slot**, so only one Claude process runs at a time regardless.

That wastes real capacity. A studio render takes 20–100 minutes (the v0.5.3 run measured a 100-frame loop at
5,873 s) and during all of it the GPU is saturated while **Claude sits completely idle**. The person watches a
progress bar instead of getting slides 2, 3 and 4 written.

**Outcome:** the person may start any slide at any time, in any order, serial or not. While slide 1 renders,
slides 2–4 can be planned, written and previewed.

## Decisions settled with the owner (do not re-open)

| decision | choice |
|---|---|
| What runs in parallel | **Claude work only.** Studio renders stay strictly one-at-a-time. |
| Concurrency cap | **3 slides at once.** |
| At the 95% usage limit | **Active sessions pause and write a resume note**, so resuming costs almost no tokens. Plus a **system-wide resume button** that wakes all of them after the window resets. |
| Two slides asking at once | **One question on screen at a time**, others queue quietly with a note ("slide 3 is also waiting"). |

**Why renders stay serial:** `BLENDER.md` section 7 already states that two Blender jobs on a 2 GB MX350 thrash
VRAM and both go *slower*. Parallel rendering would be a regression, and the GPU→CPU fallback could silently
turn a 20-minute render into an hour. The win here is Claude working *during* a render, not more renders.

---

## 1. From one runner to a pool

`RUNNER` becomes a pool of at most 3 lanes, keyed by slide id. The per-slide conversation model already fits:
each lane resumes its own `slideConvs[id]` session, so lanes never share Claude context.

Everything currently reading a single global must become per-lane. Each of these is a real bug if missed:

| global today | must become |
|---|---|
| `RUNNER.waiting` | per-lane; the UI asks "is *this slide* waiting", not "is anything waiting" |
| `RUNNER.plan()` / `/api/claude/status` | a list of lanes, each with its slide, state and `ctxTokens` |
| `POST /api/claude/stop` | must name which lane; stopping everything becomes a separate explicit action |
| `build_next` 409 `'waiting'` | scoped to the slide, not the deck |
| `Runner._lost` / `lose_conv` | per-lane recovery, already per-slide in its data model |
| `reconcile_interrupted` (startup sweep) | must sweep every lane, not one |

**`SLIDE_CTX_RESET` (300k) is already per-slide** and needs no change — that is the piece of this that was
designed correctly in advance.

## 2. The render queue stays as it is

`BlenderRenderer`'s existing two-lane queue (`BlenderJob`, `form_server.py:3812+`) already serialises GPU work
with progress, cancel, timeouts and the GPU→CPU fallback. **Do not touch it.** A lane that reaches a render
simply enqueues and its Claude work for that slide is done; other lanes keep going.

`nextGate` (`engine/form/js/blender.js:66-76`) currently blocks the *next slide* until a render finishes or is
deferred. **That rule must go** — it exists only because building was serial, and it is precisely what this
feature removes.

## 3. The concurrency hazards — these are the ones that will bite

1. **`current-run.json` is singular.** `check_rules.js`'s Stop hook runs `deck_check` over "the files THIS run
   wrote", and the server writes that list to `.aura/temp/current-run.json`. Three concurrent runs would
   overwrite each other's file and check the wrong slide's output. **Must become per-run**, keyed by lane or
   run id. This is the single most likely silent corruption in the whole feature.
2. **`pack_built` writes the shared build folder** after each step. Three lanes packing at once can interleave.
   Serialise packing behind a lock even though the Claude work is parallel.
3. **`DECK_LOCK` contention.** One coarse lock around the deck record will serialise everything it guards and
   quietly undo the parallelism. Audit what it protects; hold it for the record write only, never across a
   subprocess call.
4. **`ensure_shell`** must be idempotent and run once, not once per lane.
5. **Usage burns ~3× faster.** That is the point of section 4.

## 4. Pause at the limit, and the system-wide resume

The owner's addition, and it matters more with three lanes: hitting the limit mid-build now strands three
half-built slides instead of one.

The detection already exists — `LIMIT_RE`, `limit_only()` and `run.hit_limit` were built in the v0.5.3 batch-5
fix, when Claude's real "You've hit your session limit" reply was arriving as an ordinary OK result and Lumi
logged ~170 phantom "finished" steps for 50 minutes. Build on that; do not re-detect.

On a limit hit, **every active lane**:
1. stops cleanly at its current step — never mid-write;
2. writes a **resume note** into the deck record / slide state: which slide, which step, what was already done,
   what the next step is, and its conversation id. The note must be rich enough that resuming costs **one short
   message**, not a re-explanation of the deck. Mirror `build_message`'s self-contained design and the
   `interview_handoff_message` pattern;
3. leaves the slide in a visibly paused state, not an error.

Then **one system-wide resume button**. It reads the five-hour window from `temp/usage.json` (already captured
from Claude's own stream by `save_usage()` — no credentials, nothing undocumented) and:
- before the reset, says plainly when it resets and stays disabled;
- after the reset, wakes **every paused lane** from its note, up to the cap of 3, and the rest queue.

Plain language throughout: *"Claude ran out of allowance for now. Everything is saved. Resumes at 6:19."*

## 5. The UI

- The plan/build page gains a **lane strip**: up to 3 slides building at once, each with its own state
  (writing / previewing / waiting for you / rendering / paused).
- **Any slide may be started at any time**, in any order — that is the feature. The "coming up" list becomes a
  set of start buttons rather than a queue.
- **Questions queue.** One question on screen; a quiet line underneath reads *"slide 3 is also waiting"*.
  Answering reveals the next. Reuse `choiceCard` exactly as the interview does.
- A paused lane shows the resume note's summary, not a stack trace.
- Costs stay in **time** and plain words — never tokens or dollars.

## 6. What must not regress

- A deck built one slide at a time must behave exactly as it does today. Parallelism is opt-in by starting a
  second slide, never forced.
- Published v0.5.3 and v0.5.4 decks must open, plan, build and check unchanged.
- The release gate `test_permissions_real.py --real` must still pass: three concurrent Claude processes each
  run the PreToolUse hook, so the permission corpus needs concurrent cases.

## Verification

1. New `test_parallel.py` (called from `test_server.py`): three lanes run at once; the cap holds at 3 and a
   fourth queues; `current-run.json` isolation proven by making two lanes write different files and asserting
   each check sees only its own; `pack_built` interleaving; per-lane stop.
2. Limit handling: simulate a limit hit with `fake_claude.py` mid-build on three lanes; assert every lane
   pauses, each writes a resume note, nothing is left mid-write, and the resume costs one message.
3. `test_frontend.py --e2e`: start slides 2 and 3 while 1 renders; two questions arrive and queue one at a
   time; the system-wide resume button is disabled before the reset and wakes every lane after it.
4. Serial regression: a one-slide-at-a-time build is byte-identical in behaviour to today.
5. `test_server.py` **alone**, then `test_permissions_real.py --real` last.
6. **Verification stops at a written `plan.json` and at previews** — no agent builds or finalizes a deck.
