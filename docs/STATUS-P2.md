# STATUS — P2: the overnight queue

2026-10-08. All nine items of the brief are built. `tools/form-dev/test_queue_p2.py` passes, 0 failed. **Not run:**
`test_server.py` and the e2e. The brief says to ask first. Three of their checks changed (see below).

## The test that matters — passes

The test queues three animated slides (12 frames each, fake Blender) and runs the first one to frame 4+. It then kills
the server with `taskkill /F` and restarts it. After the restart:

- the frames are still on disk;
- slide 1 continues with `--resume`;
- all three render and the result is a whole 12-frame loop;
- one `render-requeued` event and one `queue-drained` event are written.

Run: `python tools/form-dev/test_queue_p2.py X:\aura-dev-p2`. It needs an ffmpeg (`AURA_FFMPEG`). The script also checks:

- **B.** The success-test bug (below).
- **C.** The store: the poison-job guard, a busy world not burning an attempt, one row per slide, pause.
- **D.** "Build the rest" is queue jobs. A question holds only its own job. A render on Blender finishes meanwhile.
  Exactly one question event is written, and answering it lets the queue finish.
- **E.** The reaper, end to end, with a 3 s idle limit. A pending render and a Claude build waiting out a usage limit
  hold the server open. Once the queue drains, it exits by itself.

## FOR THE CHANGELOG — a bug that could ship a wrong deck

`_render()` decided an animation had succeeded if **any** `frame_*.png` existed. With resume live, frames from an
earlier run are already on disk. So a resumed run that ended without rendering would be encoded as a short mp4, and
the slide would be marked `rendered`. Now the test requires `len(frames) >= job.frames`. Test B reproduces the case:
6 stale frames of 12, then a run that writes nothing. It now fails with `no-output`.

## What was built

- **Store (`engine/lumi_queue.py`, new).** `.aura/queue.json`, written atomically. One job per (deck, slide, stage).
  A job is flushed as `running` with its attempt already counted *before* launch. At startup, a job still `running`
  goes back to `pending`, or to `failed: crashed` once it reaches 3 attempts. A failed job is never removed
  automatically. Asking again for the same slide revives its row.
- **Feeder (`form_server.py`, `queue_tick`, every 2 s).**
  - Hands Claude one build at a time through `build_next(deck, sid=)`.
  - Hands Blender one queued full render at a time through `full()`, and only when Blender's full lane is empty.
    Previews and newly approved stills still cut in as before.
  - Mirrors every full render, however it was started, into the store, so it survives a restart.
  - Uses its own tick lock. The store's lock is never held while calling out.
- **`reconcile()`.** Frames are kept and the job is requeued. Frames are removed only when the frames marker
  (`frames/.lumi-frames.json`, written on a fresh run) has a different scene hash or height.
- **`--resume`.** Armed in `full()`'s animation branch. A frame cut off mid-write has no PNG end chunk; it is deleted
  so it gets rendered again.
- **`buildRest`.** The latch is gone: the continuation thread is deleted and nothing stores the field any more.
  `plan_payload.buildRest` is derived from the queue, so the page needed no change for it. `mode: rest` queues one job
  per unbuilt slide. `mode: stop` removes the deck's build jobs.
- **Questions.** A build that asks goes `asking` and emits one `queue-asking` event. Claude's side stops at an open
  question. Launching anything else would hide the question, so nothing more is started there. Blender keeps going.
  Nothing answers, skips or times out the question.
- **Busy versus bad.** `busy` / `waiting` / `replanning` and a usage limit do not burn an attempt. A usage limit
  retries 20 minutes later.
- **The reaper.** It also holds the server open while `queue_moving()` is true. A queue held only by an open question
  does not hold it. No stay-awake.
- **Drain edge.** One `queue-drained` event, for example: "3 slides built, 2 rendered. Slide 7 failed: … Slide 4 is
  waiting for your answer". `lastDrain` is saved in `queue.json`.
- **`plan_payload.queue`.** Contains `jobs`, `paused`, `moving`, `finishAt` (epoch ms) and `lastDrain`. The page
  shows `finishAt` as "done about 3:40 a.m.".
- **Route.** `POST /api/decks/<id>/queue` takes `add` / `remove` / `move` / `pause` / `resume` / `retry`. A `remove`
  on a running job goes through `BLENDER.cancel` or `RUNNER.stop`.
- **The picker.** It is the "still to build" dialog with tick boxes for unbuilt slides and approved renders, plus one
  "queue these" button. Queue rows show their state and reason, with ↑ ↓ / retry / remove buttons and pause/resume.
  Checked at 1366×768 and 1920×1080: it fits, and no text is under 14 px.
- **Retention.** One rule in `reap()`: a `blender/<sid>/frames` folder untouched for 14 days, with no queue job and
  no Blender job for that slide, is removed (`RETENTION.framesDays`).

## Where the brief is wrong or incomplete

1. **Item 4's failure path.** A run that *dies* exits with code ≠ 0, and `rc != 0` was already a failure. The real
   hole is a run that exits **0** without rendering every frame. It is fixed either way, and test B covers it.
2. **The yield path.** `--resume` is armed in `full()`, but `_yielded()` still builds its own resumed job. It has to
   carry the yield count and the shortened estimate. It uses the same `--resume` flag and `resume` meta.
3. **The reaper.** "`BLENDER.busy` counts queued jobs" is true. But queued renders now wait in `queue.json`, not in
   Blender's lane, so the reaper needed `queue_moving()` as well.
4. **A partly written frame.** After a power cut, `lumi_bpy --resume` skips any existing file, including a truncated
   PNG, which would then be encoded. The brief does not mention this. Fixed server-side (the end-chunk check).
5. **The dialog.** It is no longer at `editor.js:665-676`. P5 had already moved it into the `upAll` click handler, and
   I extended it there.
6. **More terminal codes than the brief lists.** Also terminal: `timeout` (each retry costs 3× the estimate),
   `no-output`, `out-of-memory`, `no-blender`, `bad-res`. Retried: `stalled`, `gpu-failed`, `encode-failed`, and a
   crash or restart.
7. **Three existing tests encoded the old behaviour.** I updated them:
   - `test_server.py:926` read the stored `buildRest`;
   - `test_batch_c.py:96` expected the dead field to be cleared;
   - `test_blender.py:538` expected "failed: interrupted, frames removed".

## Behaviour changes to know about

- An interactive render is now mirrored into the queue. A **stalled** or **GPU-failed** render therefore retries
  itself, up to 3 attempts in all.
- `/api/claude/stop` during a queued build marks that job `failed: stopped` and **pauses** the deck's queue.
- Queued builds go past the page-side gate "studio slides must be rendered before the next slide", as the old
  `buildRest` already did. The gate is JS-only.
- The "see all" button now also shows when the queue has jobs or a render is approved. This is one line in P5's
  `paintUp()`, listed in the register.
