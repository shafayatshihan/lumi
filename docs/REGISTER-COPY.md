# REGISTER — Package D (copy pass): changes needed in files this package does not own

The coordinator applies these. Each one is exact.

## 1. Tests that assert strings this pass changed (front-end already changed; tests will fail until updated)

### `tools/form-dev/test_frontend.mjs:145`
`blender.js` `fullLine()` no longer says "0 tokens" (the reader is not technical).
- before: `/≈ 25 min · 0 tokens/.test(B.fullLine(est, 'animation', 720))`
- after:  `/≈ 25 min · runs on this computer/.test(B.fullLine(est, 'animation', 720))`
- also rename the check label `'blender: full render line per resolution, 0 tokens'` → `'blender: full render line per resolution'`

### `tools/form-dev/e2e_blender.js:92`
`ENGINE.blender.note` is now `'photo-real'` (was `'ray-traced, photoreal'`).
- before: `/ray-traced, photoreal; still ≈ (\d+ min|under a minute)/`
- after:  `/photo-real; still ≈ (\d+ min|under a minute)/`

### `tools/form-dev/e2e_blender.js:97`
`ENGINE.blender.why` is now `'a photo-real picture, made with Blender. you approve a quick preview first.'`
- before: `/studio render: traced light, like a photo studio/`
- after:  `/studio render: a photo-real picture, made with Blender/`

### `tools/form-dev/e2e_blender.js:123`
- before: `/^full render ≈ .+ · 0 tokens/`
- after:  `/^full render ≈ .+ · runs on this computer/`
- the check label mentions "0 tokens" too; suggest `'build: estimates before committing: full render time, and one more preview (time + cost)'`

Nothing in `test_frontend.py` or `test_server.py` matched any changed string (grepped every one before changing it).

## 2. Server-side strings (`engine/form_server.py`)

### `FREE_NOTE` (line ~2662) — shown on the loading screen's "is this you?" card for Free-plan accounts
The front end's fallback copies of this text (home.js, loading.js) are already changed. The server's version wins when present, so change it to match:
- before: `'Lumi works, but Claude’s Free plan has very little Claude Code usage, so builds may stop early; Pro or higher is recommended.'` (continues on the next line)
- after:  `'the free plan may stop a build early. pro or higher works best.'`

### `clash_reason()` (line ~3164) — optional, for consistency with plan.js
plan.js `clashReason()` now says `one main picture per slide. this one already has a chart.` The server's version reaches the person only through plan-check errors. Suggested:
- before: `f'one slide has room for one main picture, so {MAIN_NAMES[main]} and {MAIN_NAMES[item]} would fight for the space'`
- after:  `f'one main picture per slide. this one already has {MAIN_NAMES[main]}'`

### `bl_event(... 'change-queued', ...)` (line ~5794) — optional
- before: `'Claude is busy; your change starts as soon as it is free.'`
- after:  `'claude is busy. your change starts when it’s free.'` (matches the toast in blender.js)

## 3. Flag, not a string swap
`blender.js` `iterLine()` still shows "one more preview ≈ 2 min · ≈ 60k tokens (≈ $0.15)". "Tokens" breaks rule 6, but the number is the only per-preview cost signal when there's no dollar figure, so removing it changes what the person can judge. **Owner decision:** show only the $ figure, or a share of the allowance ("about a tenth of today's allowance", as plan.js `costLines` already does).
