# Blender in Lumi: the contract (batch 1 of 5)

This file is the single source of truth for how Blender renders flow through Lumi. Batches 2 to 5 build on it, and the
code in `engine/form_server.py` (section "Blender") implements it. When this file and the code disagree, fix one of them
in the same change.

Owner decisions (RESUME.md, 2026-10-04): every slide has an engine choice. "Studio render (Blender)" is ray-traced and
photoreal: a still takes about 1-2 min, an animation 10-60 min. "Live 3D (three.js)" is instant, animated and editable.
Bold Blue defaults its still 3D figures to Blender. Animations run at 20 fps, 720p by default and 1080p when time
allows, and stills are always 1080p. Blender always ships with Lumi. Both renders happen in the BUILD phase, so finalize
only embeds.

## 1. Who does what

| step | who | how |
|---|---|---|
| write the scene | Claude, in the slide's own conversation (slideConvs) | `scene.py` built from the template in `BLENDER.md` section 2, using `lumi_bpy` |
| one optional check render | Claude | ONE plain command: `blender -b -P <scene.py> -- --out <work>/scratch/check.png --preview` |
| preview the user sees | the SERVER | `BlenderRenderer`, which starts automatically after the build step and after every change request |
| "Do you like the design?" | the user, on the build page (batch 3) | approve, or type a change |
| a change | Claude (the same slide conversation, resumed) | it edits `scene.py`. It does not render. The server previews again |
| the full render | the SERVER, only after approval | 1080p still, or a 20 fps animation at 720p or 1080p, with progress and cancel |
| embedding in the deck | the server (batch 2) | copies the result into the deck's `assets/` and fills the holder |
| finalize | `finalize.js` (batch 2) | embeds the existing file. **Never re-renders** |

Claude never runs the full render: a render costs no tokens when the server runs it, and the server can show progress,
cancel the job and fall back to the CPU.

## 2. plan.json: the engine choice per slide

`slides[].visual.engine`: `"threejs"` | `"blender"` | absent (absent means auto).

- It only means something when `visual.main == "3d"`. `normalize_plan` drops it for other mains. A value that is not
  allowed is dropped and noted in `repairs` (lenient, when Claude wrote the plan), or reported as the problem
  `bad-engine` (strict, when the page saves the plan).
- Claude may write it while planning. The plan page (batch 3) sets it from the two named options.
- **Effective engine** (`slide_engine(rec, slide)`, which the server always uses):
  1. If `visual.engine` is given, use it. If it is `"blender"` and Blender is not available, fall back to `"threejs"`
     with `engineNote: "blender-missing"`.
  2. Auto: if the look is Bold Blue, `main == "3d"`, `motion == "still"` and Blender is available, use `"blender"`.
     Otherwise use `"threejs"`. A moving 3D slide is never switched to Blender automatically: the user chooses that.
  3. **Pinned when the slide is built** (`pin_engine`, the engine-mismatch fix). `build_next` writes the engine it just resolved into
     `visual.engine` of a 3D slide that had none, once, before the step starts. The slide is then finalized with the engine
     it was BUILT with, whatever happens later to the look or to whether Blender is installed, and `plan.json` tells Claude
     the same thing the server believes. An engine that is already written is never overwritten.
- **Render kind** (derived): `motion == "still"` gives `"still"`. Any other motion gives `"animation"`.
- `GET /api/decks/<id>/plan` carries `engines: {<slide id>: {engine, kind, note}}` and `blender: {available, status, estimates}`,
  so the plan page can show the chips and notes without a second request. `blender.estimates[<sid>]` (batch 3,
  `bl_plan_estimates`) is given for every 3D slide whatever its engine is now: `{still, 720, 1080}` (full-render seconds),
  `basis` and `iteration` (section 8). It is `{}` when Blender is not available, and the chips then show fixed text.

## 3. Per-slide Blender state (server-owned)

The state lives in the deck record (`.aura/decks/<id>.json`) as `blender[<slide id>]`. Like `slideConvs`, it is never in
plan.json, so a re-plan cannot drop it. When a slide is removed from the plan, its entry is removed too, but its files are
kept until the deck is deleted.

```jsonc
{
  "engine": "blender",
  "kind": "still" | "animation",
  "scene": ".aura/decks/<id>/blender/<sid>/scene.py",
  "status": "writing" | "previewing" | "preview" | "changing" | "approved" | "rendering" | "rendered" | "failed",
  "previews": [ { "n": 1, "png": ".aura/decks/<id>/blender/<sid>/previews/preview-1.png", "at": "<iso>",
                  "res": 30, "height": 1080, "samples": 16, "render_s": 9.8, "wall_s": 14.1,
                  "tokens": 61000, "costUsd": 0.52, "device": "OPTIX NVIDIA GeForce MX350",
                  "frames": 80, "fps": 20, "change": "make the casing darker" | null, "sceneHash": "<sha1>" } ],
  "approved": { "at": "<iso>", "preview": 3, "sceneHash": "<sha1>" } | null,
  "final": { "kind": "still" | "animation", "res": 1080 | 720, "width": 1920, "height": 1080, "fps": 20, "frames": 1,
             "samples": 128, "file": ".aura/decks/<id>/blender/<sid>/final.png" | ".../final.mp4",
             "poster": ".../final-poster.png" (animation only), "render_s": 92.4, "wall_s": 97.0, "at": "<iso>",
             "device": "OPTIX ...", "fallback": false, "sceneHash": "<sha1>", "stale": false } | null,
  "job": { "id": "<hex>", "kind": "preview" | "full" | "bench", "state": "queued" | "running", "progress": 0.0-1.0,
           "frame": 3, "frames": 80, "sample": 12, "samples": 64, "startedAt": <unix s>, "etaS": 412, "device": "..." } | null,
  "error": { "code": "<code>", "reason": "<one plain sentence>", "at": "<iso>", "job": "preview" | "full",
             "log": ".aura/decks/<id>/blender/<sid>/logs/<file>.log" } | null,
  "pendingChange": "<text>" | null,
  "deferred": { "at": "<iso>" } | null,
  "changes": [ { "text": "...", "at": "<iso>", "tokens": 52000, "costUsd": 0.4, "edited": true } ]
}
```

The status moves through these stages:

```
build step ends (scene.py written) -> previewing -> preview  --approve-->  approved --render--> rendering -> rendered
                                        ^             |                                            |
                                        |          change (text)                                  failed (error kept,
                                        +-- previewing <- changing (Claude edits scene.py)         approval kept: retry)
```

- `writing`: the build step is running and the scene does not exist yet.
- A finished build step with no `scene.py` gives `failed` with the code `no-scene`.
- A change after approval clears `approved`, and a final render that already exists gets `stale: true`. The old final
  stays usable, and stays embedded, until a new full render replaces it.
- A change that leaves `scene.py` untouched returns to `preview` with the event code `change-no-edit`. No new preview
  is made.
- Approval needs a preview of the CURRENT scene, matched through `sceneHash`. Without one, approve returns 409
  `preview-outdated`.
- `deferred` (batch 3) is set by "skip for now, keep the preview" (`POST .../defer`). It only lets the build page
  start the next slide; finalize still refuses until the slide is rendered. A change and a finished full render clear it.
- A change (`bl_launch_change`) sets the deck's `changedSinceFinalize`, and so does a finished full render when the
  deck is already finalized, so the editor's button says "finalize again".
- At server start, a state left at `previewing` or `rendering` (the process died) becomes `failed` with the code
  `interrupted`. The approval is kept, so the user only has to press render again.

## 4. Files (inside the deck work folder)

```
.aura/decks/<id>/blender/<sid>/
  scene.py                 Claude writes it (the only file Claude writes here, apart from scratch/)
  scratch/                 Claude's optional check renders (check.png); Lumi never reads or embeds these
  previews/preview-<n>.png the server's previews, n = 1, 2, ... (kept: the preview history)
  final.png                full still, 1920x1080 (written as final.part.png, then renamed)
  final.mp4                full animation, H.264 yuv420p BT.709 limited range, 20 fps, seamless loop
  final-poster.png         frame 1 of the animation (the PDF page and the <video> poster)
  frames/                  animation frames while rendering; deleted after the MP4 is encoded
  logs/<kind>-<n>-<time>.log  the full Blender output of every job
.aura/temp/blender-probe.json   cached version + GPU probe (keyed by the exe path, size and mtime)
.aura/temp/blender-bench.json   cached render-time calibration for THIS machine (keyed by exe + version + device)
.aura/temp/blender-stats.json   token history of Blender change runs (the last 50), for estimates without slide history
.aura/decks/<id>/timing/timing.json      the deck's timing record (batch 6 spec Part D: Cycles, capture, encode, sizes)
.aura/decks/<id>/timing/scenes/<sid>.py  a copy of each scene.py as it was when that record was written
```

Nothing here is thinned while the deck exists: `reap()` removes only the work folder of a deck that is gone, and
deleting a deck MOVES its folder to the bin. `scene.py`, the finals and `timing/` must still be there for the
Cycles-vs-baked comparison, so the per-file leftover sweep skips `blender/` and `timing/` explicitly.

The render state also records the **per-frame** seconds Blender printed (`frameTimes` on each preview and on `final`,
the first 2000 frames) and `final.bytes`. They are measurement only; nothing reads them to decide anything.

Label anchors: `L.anchor(name, object|point, offset)` in `scene.py`; `render()` writes the projected points as percentages of the
frame (x right, y down, one point per rendered frame) next to the output: `previews/preview-<n>.labels.json`, `final.part.labels.json`
(a still, renamed to `final.labels.json`) or `frames/labels.json` (an animation, copied to `final.labels.json`):
`{"w","h","fps","frames","anchors":{"<name>":[[x,y],...]}}`.

**Deck embedding (batch 2, implemented).** After every `preview-done` and `render-done` the server (`bl_embed_async`) copies what the deck
should show into the deck build folder, `.aura/temp/build/<slug>/assets/blender/`: `<sid>.png` (or `<sid>.mp4` + `<sid>-poster.png`)
and `<sid>.json` = `{sid, kind, draft, source: "final"|"preview", stale, width, height, fps, frames, res, preview, at, labels}`.
`bl_pick`: the final render when there is one (a stale final stays embedded until a new render replaces it), else the newest preview as a
DRAFT (`draft: true`). The server never edits `index.html` (Claude owns it): the PACKER (`pack_deck.py`) fills each
`<div class="bb-blender" data-blender="<sid>">` from those files and then packs the deck again (`bl_embed_pack`, under `BL_PACK_LOCK`, no
`new_deck.js --ids` so Claude's file is not rewritten). Filled holder: `data-filled`, `data-draft` (preview), `data-stale`, `data-kind`,
`data-fps`, `data-anchors` (the labels' JSON), an `<img class="bb-blender-img">` (the still, or the loop's poster = frame 1), for a loop
a `<video class="bb-blender-video" muted loop playsinline preload="metadata">` over it, and for a draft a calm
`<span class="bb-blender-tag">preview</span>`. No render yet: `data-pending`. Images are inlined LOSSLESS (WebP lossless, or the PNG when
smaller) because the render's background is the exact slide colour; the mp4 is inlined as it is (H.264 CRF 18). Presenter mode: the
runtime plays the video only while its slide is current (reset when it leaves); `?still`, `?aura=all`, `?aura=still`, `?capture`,
print and reduced motion show the poster. Labels (`[data-anchor]` children) are placed at the recorded percentages, following the video's
clock. The image uses `object-fit: contain`: the render fades to the slide colour at its OWN edges, so a crop would cut through the
floor shadow.

## 5. Finding Blender (`find_blender()`)

The first hit wins:
1. `AURA_BLENDER` (dev and tests only). A `.py` file is run with the server's Python. This is how
   `tools/form-dev/fake_blender.py` runs.
2. Bundled: `.aura\blender\blender.exe` (batch 4 installs it there by flattening the zip's top folder), else
   `.aura\blender\*\blender.exe`.
3. System installs, highest version first: `%ProgramFiles%\Blender Foundation\Blender *\blender.exe`, the same under
   `%ProgramW6432%` and `%ProgramFiles(x86)%`, `%LOCALAPPDATA%\Programs\Blender Foundation\Blender *\blender.exe`, and
   Steam (`...\steamapps\common\Blender\blender.exe`).
4. `blender` on PATH.

`source` is `env` | `bundled` | `system` | `path`. The result is cached for 60 s. The probe
(`probe_gpu.py` -> version and best device) is cached in `.aura/temp/blender-probe.json` and runs again only when the
exe changes.

- `/api/health` has a non-blocking check `blender`, plus a top-level
  `blender: {available, exe, source, version, gpu, devices}`.
- `GET /api/blender` returns the same, plus `bench`, the job queue and the defaults.
- The server puts the Blender folder at the FRONT of PATH for Claude's runs (`child_env`) and sets `LUMI_BPY` (the
  helper folder). That is why Claude can and must type plain `blender`.

## 6. Running Blender

Server command (Claude never sees this):

```
<blender> -b --factory-startup --python-exit-code 1 --log-level info --log render -P <scene.py> -- --out <out> <args>
```

| job | args | output |
|---|---|---|
| preview (still or animation) | `--preview` (= `--res 30 --samples 16`, simplified, one poster frame) | `previews/preview-<n>.png` |
| full still | `--height 1080 --samples 128` | `final.png` |
| full animation | `--anim --height 720` (or `1080`) `--fps 20 --samples 64` | `frames/frame_####.png`, then `final.mp4` via ffmpeg |
| resumed animation | the same plus `--resume` | only the `frame_####.png` that are missing; the rest are kept as they are |
| calibration | `bench_scene.py`, at 25 % / 16 spp, 50 % / 16 spp and 50 % / 64 spp | `.aura/temp/blender-bench/` |

- **Progress** comes from the Blender log `Fra: <f> | ... | Sample <s>/<S>` and the lumi_bpy lines
  `[lumi] scene frames=N ...`, `[lumi] frame i/n <s>` and `[lumi] device: ...`. It is computed as
  `(frames done + s/S) / frames to render`.
- **GPU to CPU fallback**: a job that failed on a GPU device (exit code not 0, or a CUDA/OptiX/out-of-memory line) runs
  once more with `--cpu`. Both runs go to the log, and `final.fallback = true`.
- **Timeouts**: preview 15 min. Full still `max(30 min, 4 x estimate)`. Animation `max(60 min, 3 x estimate)`, capped at
  24 h. A job is also stopped after 20 min with no output (`stalled`). The kill takes the whole tree
  (`taskkill /T /F`), and Blender is in a kill-on-close job object, so it never outlives the server.
- **Lanes**: one `full` lane and one `preview` lane. A preview never waits behind a long animation: while the full lane
  is busy, the preview runs on the CPU (`--cpu`), which is about 2x slower but costs seconds. The calibration runs in the
  preview lane. Exactly one job uses the GPU at a time (2 GB VRAM; two thrash) - that never changes.
- **Order in the `full` lane** (post-mortem problem 9: an approved 78 s still once waited 44.6 min behind an 80-frame
  animation). The lane is not FIFO. The next job is the one with the lowest rank: a still before an animation, then the
  shortest estimate, then arrival; a job that has waited more than 20 minutes goes first whatever its size, so nothing is
  starved. `queue_info()` reports `ahead` and `waitS` in that same order, and `render-queued` says them in words.
- **Yielding** (the same problem, for a job that is already running). Cycles writes each frame as a finished PNG, so an
  animation can stop between frames. A newly queued **still** marks the running animation `yielding`; it is stopped at the
  next frame boundary, its frames are kept, and the same job is re-queued with `--resume`, which renders only the frames
  that are not on disk and counts progress against the whole loop. `labels.json` is still projected for every frame.
  The event is `render-paused`. Never when no frame has finished yet, never on the last frame, never for a job whose own
  estimate is longer, and at most 3 times per job. The cost is the one frame that was in flight.
- **Failure codes** (`error.code`, each with a plain `reason`): `no-blender`, `no-scene`, `script-error` (the last
  Python error line is in `reason`), `gpu-failed` (only when the CPU retry failed too), `out-of-memory`, `timeout`,
  `stalled`, `no-output`, `ffmpeg-missing`, `encode-failed`, `interrupted`. `cancelled` is not a failure: the status
  returns to the previous stage.
- The idle shutdown never stops the server while a Blender job runs.

## 7. HTTP API

All routes are JSON unless noted, and refuse with `{ok:false, error, reason}`.

| method + path | body | answer |
|---|---|---|
| `GET /api/blender` | | `{ok, available, exe, source, version, gpu, devices, bench, queue: [...], defaults}` |
| `POST /api/blender/benchmark` | `{force?}` | queues the calibration. 503 `no-blender` when Blender is missing |
| `GET /api/decks/<id>/blender` | | `{ok, available, slides: {<sid>: view}}` for every slide whose effective engine is blender, or which has state |
| `GET /api/decks/<id>/blender/<sid>` | | one `view` = the state above + `engine`, `kind`, `chosen`, `note`, `n`, `estimates`, `sceneExists`, `sceneCurrent` (the latest preview shows the current scene), a live `job`, and `url` on every preview and on `final` (+ `posterUrl`) |
| `GET /api/decks/<id>/blender/<sid>/files/<name>` | | serves `previews/preview-<n>.png`, `final.png`, `final.mp4`, `final-poster.png` (no other names) |
| `POST .../<sid>/preview` | `{}` | queues a preview of the current `scene.py`. 404 `no-scene` |
| `POST .../<sid>/change` | `{text}` | resumes the slide conversation with the text. If Claude is busy it is queued as `pendingChange` (200, `queued: true`) and starts when the current run ends |
| `POST .../<sid>/approve` | `{preview?}` | `approved` (409 `no-preview` / `preview-outdated`) |
| `POST .../<sid>/render` | `{res?: 720 \| 1080}` | full render. A still is always 1080. An animation defaults to 720. 409 `not-approved`, 409 `rendering` |
| `POST .../<sid>/defer` | `{on?: bool}` | batch 3: marks the slide `deferred` (or clears it with `on: false`) and returns `{ok, view}`. 409 `no-blender-slide` |
| `POST .../<sid>/cancel` | `{job?: "preview" \| "full"}` | cancels that slide's queued or running job (both when `job` is omitted) |
| `GET /api/decks/<id>/timing` | | `{ok, stored, file, timing}` - the deck's timing record (batch 6 spec Part D). Read-only; with no stored file the record is built in memory and `stored` is false |

**Events** go into the Claude event stream (`/api/claude/events`), so the chat thread of the slide shows them:
`kind: "blender"`, `deck`, `conv: <sid>`, `slide: <n>`, `code`, `text` (one plain sentence), and the fields below.

| code | extra fields |
|---|---|
| `preview-requested`, `preview-started` | `job`, `estimate` (s) |
| `preview-progress`, `render-progress` | `job`, `progress`, `frame`, `frames`, `etaS`. Throttled to 1 per 2 s and per 1 % |
| `preview-done` | `job`, `png` (url), `n`, `render_s`, `tokens`. The page asks "Do you like the design?" now |
| `preview-failed`, `render-failed` | `job`, `error` (code), `reason` |
| `preview-cancelled`, `render-cancelled` | `job` |
| `change-requested`, `change-queued`, `change-no-edit` | `change` (the user's text) |
| `approved` | `preview` |
| `render-started` (`render-queued` while the full lane is busy) | `job`, `estimate` (s), `res`, `renderKind`, `ahead`, `waitS` |
| `render-paused` (an animation yielded the GPU to a shorter job; it resumes by itself) | `job` (the resumed job), `frame`, `frames`, `estimate` |
| `render-done` | `job`, `file` (url), `render_s`, `fallback` |
| `bench-done` | `c`, `a`, `k` |

## 8. Estimates (`view.estimates`)

```jsonc
{ "preview":   { "seconds": 14, "low": 10, "high": 22, "basis": "slide" | "benchmark" | "default" },
  "iteration": { "tokens": 55000, "low": 30000, "high": 90000, "costUsd": 0.45 | null,
                 "basis": "slide" | "history" | "default", "seconds": 120 },
  "full": { "still":  { "seconds": 95, "low": 66, "high": 152, "basis": "..." },          // a still slide
            "720":    { "seconds": 1500, ..., "frames": 80, "fps": 20 },                    // an animation slide
            "1080":   { "seconds": 3300, ..., "frames": 80, "fps": 20 } },
  "queue": { "ahead": 0, "waitS": 0 } }
```

- **Time model.** The calibration renders `bench_scene.py` three times on THIS machine (25 % / 16 spp, 50 % / 16 spp,
  50 % / 64 spp) and fits `t_frame = c + a * MP + k * MP * spp` (MP = megapixels, spp = samples). `a` is the per-pixel cost
  that does not grow with samples (denoise, composite), `k` is the sampling cost, and a plain `c + k*MP*spp` was 2x too
  high on the real laptop. It also records `startup_s` (Blender launch + scene build). The result is cached in
  `.aura/temp/blender-bench.json` and refreshed when the exe, its version or the device changes. The first successful
  preview (or the first deck view) on a machine queues the calibration in the background (about 50 s).
  - basis `slide`: the latest preview of the slide gives a complexity factor
    `f = (preview render_s) / t_frame(preview)`, so `full = startup + frames * (f * t_frame(full) + 0.3) (+ 0.05 per frame to encode)`.
  - basis `benchmark`: f = 3 (real scenes are heavier than the bench).
  - basis `default` (no calibration yet): `c = 1.5 s`, `a = 14 s/MP`, `k = 0.20 s/(MP*spp)`, `startup = 4.5 s`, fitted on the
    reference laptop (MX350).
  - Measured 2026-10-04 (MX350, the smoke scene): calibrated estimate 97 s against 85 s actual for the 1080p still, and
    136 s against 124 s for a 4-frame 720p loop.
  - The range is low = 0.7x and high = 1.6x. While another job runs, `queue.waitS` adds its remaining `etaS`.
- **Token model.** One change iteration costs the tokens of that slide's change runs: the median of its `changes[]`,
  basis `slide`. With no history, the median of `.aura/temp/blender-stats.json`, basis `history`. Otherwise 60,000
  tokens, basis `default`. Tokens are input + cache creation + cache read + output, taken from the run's `result.usage`,
  or from the last assistant message's context size plus its output when the result has none. `costUsd` comes from the
  result's `total_cost_usd` when Claude reports one. The build step's own tokens are stored on `previews[0].tokens`.
  `iteration.seconds` is about 90 s of Claude time plus the preview estimate.
- The page shows these BEFORE the user commits: "One more preview: about 1 min and 55k tokens" and "Full render: about
  25 min (720p) / 55 min (1080p)".

## 9. The build step for a Blender slide

`build_message()` adds a Blender block to the normal self-contained step (the step card still applies):

- The slide's effective engine and kind, the scene path, and the helper (`BLENDER.md`; the template's import finds
  `lumi_bpy` by itself).
- The one allowed command, spelled out:
  `blender -b -P .aura/decks/<id>/blender/<sid>/scene.py -- --out .aura/decks/<id>/blender/<sid>/scratch/check.png --preview`.
  No full path, no pipes, no redirection, no `&`, no `$(...)`. At most two check renders.
- An animation: `L.loop(seconds)` plus `spin`/`wave`/`turntable`/`animate`, a seamless 20 fps loop of 3 to 6 s.
- "Do NOT render the full image or animation: Lumi renders the preview the user sees and, after approval, the full
  render."
- The slide's holder: `<div class="bb-blender" data-blender="<sid>" data-kind="still|animation"></div>`, placed where the
  3D figure goes, with the same box as a 3D holder. Batch 2 fills it and the checker checks it.

A 3D slide whose engine is `threejs` gets the opposite block (`bl_live_block`, the engine-mismatch fix): it is named as a LIVE 3D slide, and
writing a `.bb-blender` holder, a `data-blender` attribute or a `scene.py` for it is forbidden in words. Until then a build
step said nothing at all about the engine unless it was Blender, and on a look that does not auto-pick Blender a 3D slide
could be built with a holder the server had made no job for. **A slide must never end up with a Blender holder and no Blender
job**: the engine block above, the post-build check and the finalize gate each close one side of that.

When the step ends (`after_run`, good and not waiting for answers), the server checks for `scene.py`. If it is there,
the server queues the preview (status `previewing`), and `preview-done` makes the build page ask the question. With
"build the rest", the next slide's build starts as usual. The preview loop and the full render go on in parallel, and
only change requests wait for Claude to be free (`pendingChange`).

A change request resumes the SLIDE's conversation (`conv=<sid>`, kind `blender-change`) with:
`[blender-change slide=<sid> n=<n>] The user looked at the preview and wants: "<text>". Edit <scene.py> ...; do not
render the full image; Lumi renders a new preview when you finish.` When the run ends well, the server compares the
scene hash: if it changed, it queues a new preview, else it sends `change-no-edit`. The run's tokens go into
`changes[]` and onto the next preview.

## 10. Finalize (batch 2)

- Before `finalize.js` runs, the server embeds every slide's `final` and packs the editable deck again (`bl_embed_pack`). The
  `<video>` has no `autoplay` attribute: the runtime plays it only while the slide is current. For the capture contract a Blender
  slide is NOT in `LumiCapture.slides` (no recording); it is listed in `LumiCapture.recorded = {n: {kind, period: 0, draft, filled}}`.
  `finalize.js` reports `{t: "plan", loops: [...], recorded: [n...]}`, keeps the embedded media byte for byte, and the PDF page is the
  render itself (the loop's poster). It stops with a plain message (exit 1) when a holder is empty or still a draft.
- Finalize refuses (409 `blender-pending`, `slides: [n...]`) while any slide with the effective engine blender has no `final` (or
  its file is gone). When `final.stale` is set it answers 409 `blender-stale` until the request carries `{acceptStale: true}`.
- The gate reads the built deck as well (`bl_holders`), so a slide carrying an unfilled `.bb-blender` holder is refused with the
  same 409 `blender-pending` **whatever its nominal engine is** (the body also carries `pending` and `orphans` separately). Before
  the engine-mismatch fix only slides whose engine was blender were looked at, so an orphan holder slipped through the gate and killed `finalize.js`
  at the very end of a long run with a raw message. A live 3D slide with no holder and no render still finalizes normally.
- It NEVER starts Blender.

**Checker (`deck_check.js` + `tools/lib/blender_check.js`, numbers in `hard-rules.json -> blender`).** Per `.bb-blender` holder:
the render is in the deck and readable; a still is 1920x1080, a loop 1280x720 or 1920x1080 at 20 fps; the corners and the left / top
edge equal the slide's own colour (3 levels); not black, not blank (pixel statistics); a loop's last -> first step is a normal step
(seamless); file budgets (still 6 MB, 720p loop 14 MB, 1080p loop 30 MB); a label with no anchor warns. A missing render or a draft
preview is a WARNING while building and an ERROR with `--finalize`, so the Stop hook never blocks a build step on it.
When the server runs the check after a build step it passes `--blender-slides <sid,...>` (`blender_args`): the slides it really
renders. A holder whose id is not in that list is an orphan and an ERROR at once, on that slide, while the person is still there.
Without the flag (a hand-run check) nothing changes.
`lumi_bpy._composite` fades the soft floor shadow to the exact background over the outer 12 % of the frame, which is what makes the
edge rule true.

## 11. Permissions (Claude's Bash and PowerShell, `engine/rules/permit.js`)

**Allowed:** `blender`, `blender.exe`, a quoted or plain absolute path to a `blender.exe` under `.aura\blender\` or under
`<Program Files>\Blender Foundation\` (also `%ProgramW6432%`, `%ProgramFiles(x86)%`, `%LOCALAPPDATA%\Programs\Blender
Foundation`, Git Bash `/c/...` spellings), and PowerShell's `& "...\blender.exe"`. The command must ALSO have:
- `-b` / `--background` before `-P`;
- exactly one `-P` / `--python` with a `.py` file inside `.aura/decks` or `.aura/temp`;
- in front of `--`, only `--factory-startup`, `-noaudio`, `--python-exit-code N`, `-t N` / `--threads N`,
  `--log-level X`, `--log X` or `-q`;
- after `--`, path arguments (`--out`) inside `.aura/decks` or `.aura/temp`;
- nothing chained: no `|`, `&&`, `;`, no redirection.
`blender --version` alone is also allowed.

**Denied, with the exact allowed form in the reason:** `--python-expr`, `--python-text`, `--python-console`, any other
flag, `-P` outside the work folders, a `.blend` argument, a blender.exe anywhere else, or chaining or redirection
around Blender. Writes into `.aura\blender` are denied like writes into `.aura\engine`.

No static allow rule for Blender is added to `settings.json`. The hook decides every Blender spelling (allow or deny,
never defer), and a static `Bash(blender:*)` rule would let `--python-expr` through whenever the hook could not run.

## 12. What the later batches build on this

- **Batch 2 (deck embedding + checker): DONE** (sections 4 and 10 describe what was built; `tools/form-dev/test_blender_deck.py`).
- **Batch 3 (plan / build / editor UI): DONE.** `engine/form/js/blender.js` (pure helpers + `mountBlenderCard`), used by
  plan.js, editor.js (build page and editor), workshop.js and finalizing.js; CSS in theme.css "Blender batch 3".
  - Plan page: inside the 3D box two engine cards, "studio render · blender" and "live 3D · three.js", each with its note;
    the Blender note carries `blender.estimates` (a still: `still ≈ X`; a loop: `720p ≈ X, 1080p ≈ Y`). The picture
    line on the left says `· studio render` when the slide's effective engine is Blender.
  - Build page and editor: a card docked under the shrunk slide while it needs the person (preview history with dots,
    "do you like the design?" + [yes, render it], 720p / 1080p for an animation with their estimates, a change box with
    "one more preview ≈ time · tokens", "skip for now, keep the preview"), folded to a slim bar otherwise (rendering with
    progress + cancel, "studio render ready" + "change the design", "preview kept for now").
  - Page rules: **the next slide waits** until every built Blender slide is rendered or deferred (`nextGate`); **a full
    render blocks the next slide** until it ends or is cancelled (cancel asks twice); during a full render the sparks game
    can be played; a cancelled render keeps the approval.
  - Finalize: 409 `blender-pending` lists each slide with its reason and "go to slide N" (opens the editor on it); 409
    `blender-stale` offers "use it anyway" (`acceptStale`).
  - Tests: `test_frontend.mjs` (blender helpers), `tools/form-dev/test_blender_ui.py` (server side, in test_server.py),
    `tools/form-dev/e2e_blender.js` (44 checks, `test_frontend.py --e2e [--blender-only]`).
- **Batch 4 (installer): DONE.** Lumi ALWAYS installs Blender. `setup/setup.ps1` has a step `Step-Blender`
  (`Blender (studio 3D renders, free/GPL)`), between the pip step and the shortcuts.
  - **The pin lives in the repo** so it is auditable: `setup/blender/blender-pin.json` holds the version (5.2.2 LTS),
    the exact `download.blender.org` url, the SHA256 and the byte count, plus the checksum-file, licence and source
    urls. Verified against `https://download.blender.org/release/Blender5.2/blender-5.2.2.sha256` on 2026-10-05
    (sha256 `3849d17a...31f210`, 404,453,484 bytes). Changing the version means re-reading that `.sha256` file.
  - **Download:** `Blender-Fetch` writes `<root>\.aura\temp\blender-<ver>-windows-x64.zip.part`, shows a live
    percentage, resumes a part file with an HTTP `Range` request (a server that ignores it starts again cleanly) and
    retries four times with a growing pause. The percentage reaches Lumi.exe as a new setup line,
    `{"state":"progress","detail":"168 of 386 MB","pct":43}`, which fills that one step's own bar.
  - **Verify, then install:** `Get-FileHash -Algorithm SHA256` must equal the pin. A mismatch throws the part file
    away and downloads once more; a second mismatch stops with a plain sentence and installs NOTHING. Only a verified
    zip is unpacked, into `.aura\temp\blender-unpack-<ver>`, and its single top folder is **flattened** by moving it
    to `.aura\blender`, so `.aura\blender\blender.exe` is exactly where `find_blender()` looks (section 5,
    source `bundled`). The zip and the staging folder are deleted afterwards.
  - **GPL:** `setup/blender/COPYING-GPL-3.0.txt` and `setup/blender/BLENDER-SOURCE.txt` (version, url, sha256, licence
    and the link to the matching source tarball) are copied next to `blender.exe`, alongside Blender's own `license/`
    folder from the zip. Blender is named as free software under the GNU GPL wherever Lumi lists what it installs:
    the step name, the installer's welcome text, setup's closing lines and README.md.
  - **The stamp** `.aura\blender\lumi-blender.json` records name, version, channel, url, sha256, licence, source url,
    install time, `exeBytes` and `must` (the paths that have to exist). It is what tells a good copy from a broken one.
  - **Repair:** `--repair` runs the setup again; `Step-Blender` returns `HAVE` (no request at all) when the stamp
    matches and every `must` path is there, and otherwise re-downloads and reinstalls. So a missing, truncated or
    half-unpacked `.aura\blender` is put right, and a healthy one is never downloaded twice.
  - **update_keep:** `Step-Folder` never touches `.aura\blender`, so an in-app update keeps the bundled Blender byte
    for byte (proved in `tools/form-dev/test_update_keep.py`).
  - **Health:** `bundled_blender()` reads the stamp and reports `none` | `damaged` | `ok`; the non-blocking `blender`
    check offers `fix: "repair"` when Blender is missing, or when Lumi's own copy is damaged even though a system
    Blender is being used. The loading screen lists it as "studio renders" and sends a `fix: "repair"` check straight
    to the Repair card - it is never fixed silently, because only the installer can put it back.
  - **Free space:** setup's first check now asks for 5 GB (Blender unpacks to about 1 GB).
  - **Permissions (section 11) re-checked:** `workspace/.claude/settings.json` needed no change - there is still no
    static `Bash(blender:*)` rule (the hook decides every spelling, allow or deny) and writes into `.aura/blender` are
    denied exactly like `.aura/engine`. `test_permissions_real.py` now carries 133 spellings: the original 28 plus the
    bundled-path ones batch 4 makes possible (`.aura/blender/blender.exe --version`,
    `& "<root>\.aura\blender\blender.exe" ...`, `./.aura/blender/...`, reading `BLENDER-SOURCE.txt` / `lumi-blender.json`, and the denials:
    writing the stamp, deleting `.aura\blender`, curl-ing the zip, moving a file over `blender.exe`,
    `--python-expr` from the bundled path), plus two settings assertions for the two rules above.
  - **Tests:** `tools/form-dev/test_blender_install.py` (32 checks, run by `test_server.py`) runs the REAL
    `Step-Blender` / `Blender-Fetch` / `Blender-Ok` out of `setup.ps1` against a tiny fixture zip served by a local
    Range-capable HTTP server - fresh install, flattening, GPL files, the stamp, a no-op second run with zero requests,
    repair of a missing / corrupted / half-unpacked copy, a newer pin, a refused bad hash, a resumed download, a stale
    part file, and the health states. Nothing in the suite downloads the real 386 MB; `--real` opts in to a HEAD of the
    pinned url only.
- **Batch 5 (tests + a real run): DONE 2026-10-05.** One real deck (4 slides, Bold Blue, balanced, real Claude + the
  system Blender 5.2.2 on OptiX / MX350) went plan -> build slide by slide -> finalize, with a Blender STILL on slide 1
  and a Blender ANIMATION on slide 2, both through preview -> approve -> full render. The scenes really use
  `lumi_mech` (11- and 41-tooth involute gears, four 6205 bearings, eight M8 bolts, a wave spring, the true 11/41 spin
  ratio) with edge wear on the steel hero. Finalize embedded both renders and wrote the deck and its PDF.
  Measured on the reference laptop: still 1920x1080 / 128 spp = 281.5 s Cycles (**contaminated** - other heavy jobs ran
  at the same time; a clean re-measure is owed for the batch 6 A/B, not for the release); animation 1280x720 / 64 spp,
  100 frames = 5873.7 s, 58.74 s per frame (51.11-94.21); finalize 40.2 s in all, with the two non-Blender loops
  costing 18.2 s + 13.9 s capture and 0.9 s + 0.8 s encode. Four defects were found and fixed (the usage-limit dead
  loop, the dead-end question card, a plan-card "null", and a false Blender refusal in permit.js), and three findings
  are left open for the owner. Details: FIXLOG "## Blender batch 5".
