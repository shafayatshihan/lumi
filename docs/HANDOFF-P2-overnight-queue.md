# P2 — The overnight queue: durable, resumable, many slides at once

You are in **`X:\aura-slide-by-shafayat`**, the source for **Lumi**, a Windows app that builds presentation decks
with headless Claude Code. v0.6.1 is published. **Three other Claude sessions are working in this repo right
now** — read the ownership section.

Owner: S. M. Shafayat Islam. Short, plain replies. Not a beginner. **This is the biggest of the four parts.**

**`engine/node_modules` is gitignored and the repo was re-cloned.** Run `npm install` in `engine/`.

---

## Why this exists

P1 drops baking, so an animated slide goes from 396 s to **117 minutes** of Cycles (measured, the owner's MX350,
120 frames). Two animated slides is 3.3 hours. That is only acceptable if it finishes while he sleeps — and
today nothing survives being left alone:

- `BlenderRenderer.reconcile()` (`form_server.py:5841`) marks interrupted work `failed` and **deletes
  `frames/`**. A 79-of-80 frame animation loses everything.
- Building many slides is not a queue. `buildRest` is a latched boolean re-read in `after_run()` (`:4690`) by a
  one-shot daemon thread. It dies silently on **a question, an error, a usage limit, or a restart**.

The owner has been bitten by that last one. Treat "it stopped and said nothing" as the headline bug.

## What already works — do not rewrite it

`BlenderRenderer` (`:5227-5849`) is a good queue: two lanes, shortest-job-first with 20-minute fairness
(`_rank` `:5300`), animation-yields-to-still preemption (`_ask_yield` `:5305`, `_yielded` `:5768`), per-job
timeouts (`_limit` `:5483`), a stall watchdog, GPU→CPU fallback, cancel, queue-position text (`queue_info`
`:5261`). **It is only missing persistence.** Keep all of it. One Blender job on the GPU at a time stays the rule
(2 GB VRAM — two jobs thrash).

## What to build

**1. `queue.json` at the `.aura` root** — a sibling of `decks/`, deliberately **not** under `TEMP`: `reap()`
(`:7415`) never walks the root, so it is safe by construction rather than by promise. One global file, because
both executors (`RUNNER` `:1992`, `BLENDER` `:5227`) are process-wide singletons with one slot each.

Follow the precedent the codebase names for itself (`:223-228`): *"`interview.json` is the ONLY memory … never in
memory like PLANQ, which does not survive a restart"*, written with `write_atomic` (`:216`).

A job needs: deck, slide, `stage` (`build` needs RUNNER / `render` needs Blender), `state`, `res`, an `order`
sort key, `attempts`, `notBefore`, `lastError`, and the live executor's job id.

**Flush a job as `running` with its attempt already counted, BEFORE launching it.** That ordering is the
poison-job guard: a job that hard-crashes the process is then bounded at N restarts instead of looping forever.

**2. A feeder, not a second scheduler.** Hand `BlenderRenderer` **at most one `full` job at a time** through the
existing `full()` → `submit()` path, so interactive previews and a newly approved still still cut in exactly as
they do today. Lock order matters: take the queue lock **last**, and release it before any `set_bl` /
`load_deck` / `RUNNER.launch` (`set_bl` takes `BLENDER_LOCK, DECK_LOCK`; `build_next` takes `PLAN_LOCK`).

**3. Rewrite `reconcile()` (`:5841`).** Keep the frames, record how many exist, requeue. **One exception:** if
`scene.py`'s hash moved while the server was down, `rmtree` is correct — half-old, half-new frames are worse
than none. Arm `--resume` in **`full()`'s animation branch (`:5424`)**, not in reconcile, so the yield path and
the restart path share one code path. Cap resume attempts at 3 — three crashes on the same frame is the scene,
not the power cut.

**4. Fix the latent bug this exposes — do not skip this.** `_render()`'s success test (`:5624`) is
`any(glob('frame_*.png'))`. Safe today only because a non-resume run wipes `frames/` first. With resume live, a
resumed run that dies in its first second leaves 79 stale frames, the test says **success**, and `:5657`
**encodes a 79-frame mp4 of an 80-frame loop and marks the slide `rendered`**. Require
`len(frames) >= job.frames` before encoding. This is the class of bug that silently ships a wrong deck — put it
in your status note so it reaches the changelog.

**5. Replace the `buildRest` latch, do not wrap it** — wrapping keeps all four death modes. Enqueue one build job
per unbuilt slide; delete the continuation thread at `:4690`; stop clearing `buildRest` in
`reconcile_interrupted` (`:2091`); report `buildRest` in `plan_payload` (`:3516`) as **derived** from the queue,
so the three existing UI reads (`editor.js:543, 610, 642`) keep working with **zero JS change** on release day.

`build_next` (`:4505`) currently hard-picks the first unbuilt slide; it needs to accept a specific slide id.

**6. The question case — the one the owner has been bitten by.** A build job that hits a question goes `asking`,
**stays in the queue**, and the worker **skips to any job needing the other executor**. Slide 7's open question
must never stop slide 3's two-hour render — that is the whole point of two executors behind one queue. Emit
**one** event into `claude-events.jsonl` (`:1993`); it survives the server exiting and replays on the morning's
first page load. **Never auto-answer, auto-skip, or time it out.** An unanswered question means one stuck job and
everything else drained, visible in the queue — that is the honest outcome.

Distinguish "the world is busy" from "this job is bad": `409 busy / waiting / replanning / rendering` and a
usage limit must **not** burn an attempt. `no-scene`, `script-error`, `ffmpeg-missing`, `not-approved`,
`preview-outdated` are terminal — retrying a scene with a traceback in it three times is three wasted hours.

**7. The reaper.** `BlenderRenderer.busy` (`:5245`) already counts **queued** jobs, and `reaper()` (`:7494`)
holds the server open while busy — so a pending Blender queue already survives the 45-minute idle shutdown.
**Verify that end to end**, then add the same protection for the Claude side, which has none.

**When the queue drains at 3 a.m., let the server exit normally.** Do not add a stay-awake mode, and do not reach
for `SetThreadExecutionState` or `powercfg` — it silently does nothing under several power plans and buys false
confidence. The owner has accepted that the machine stays awake. On the drain edge, record the outcome and emit
one event: **that event is the entire "what happened overnight" feature.**

**8. What the person sees.** `plan_payload` gains a queue block. Show a **wall-clock finish time** ("done about
3:40 a.m."), not a duration — that is what overnight means to a person. One new `POST /api/decks/<id>/queue`
(add / remove / move / pause / resume / retry); `remove` on a running job maps to the existing cancel/stop paths.
For picking several slides, **reuse the "still to build" dialog that already exists** (`editor.js:665-676`) — add
checkboxes and one button. **Never delete a failed job**; the morning's value is seeing what died and why.

**9. Retention.** Frames are no longer deleted eagerly, so abandoned 1080p animations accumulate forever. Add one
rule to `reap()` (`:7449`).

## What you own

`BlenderRenderer` (`form_server.py:5227-5849`), `Runner` / `after_run` / `buildRest` (`:1992`, `:4592`, `:4690`),
`reconcile_interrupted` (`:2083`), `reaper` (`:7489`), `plan_payload` (`:3516`), the new queue module and route,
and the slide-picker dialog in `engine/form/js/editor.js`.

**Do not touch:** the Blender routing/estimates region ≈`4700-5230`, `5900-6300`, `lumi_bake.py`,
`bake-player.js` — **P1**. `blender.js` and the camera action — **P3**. `runtime.js`, the look engines,
`LOOK-BASE.md`, `deck_check.js` — **P4**.

Yours in docs: `docs/CLAIM-P2.md`, `docs/STATUS-P2.md`, `docs/REGISTER-P2.md`.

## Sequencing

**P1 flips the `bake` flag first.** Start on (4) the success test and (3) reconcile immediately — they are
useful on their own. Then the queue, Blender stage first, Claude stage second.

## Rules

1. **Never commit to main, push, tag, publish or bump the version.**
2. **Never touch `C:\Lumi`** except to read.
3. **Never weaken `engine/rules/permit.js`.** It denies `schtasks` (`:52`) and that stays — a worker inside the
   server is the right design, not a Windows service.
4. **Ask before running `test_server.py` or the e2e.**
5. **Sandboxes at `X:\aura-dev-p2\`**, never inside the repo.
6. Write files with the Write tool, not bash heredocs.

## Report

10 lines to the owner. The test that matters: **queue three animated slides, kill the server mid-render,
restart — the queue resumes and the part-rendered frames are still there.** `docs/STATUS-P2.md` as you go. Say
plainly anything here that turns out to be wrong in the code.

Claim it first: `docs/CLAIM-P2.md`.
