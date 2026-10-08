# REGISTER — build page → coordinating session

Asks for files the build-page session may not edit. Newest first.

## 2026-10-08 · form_server.py: `plan_payload()['running']` is false while after_run() is still settling

**What.** `plan_payload` reports `'running': busy` where `busy = RUNNER.running` (= `self.run is not None`). The runner
clears `self.run` and sets `self.settling` *before* `after_run()` marks the finished slide `built` (form_server.py
~2440). So during settling a GET `/plan` says "not running" **and** still shows the old `built` count.

**Why it matters.** It is the root of the owner's bug "a new slide is not shown on the strip or the preview at once":
the build page re-reads the plan on the running→idle edge, that read lands in the settling window, sees nothing new,
and the next poll is the idle one (5–15 s). Slower machine → longer after_run → bug more often.

**Done on the page (no server change needed for the fix):** editor.js now polls every 500 ms for up to 10 s after a run
ends, until `built` changes or Claude asks (`waiting`).

**Ask (optional, belt and braces).** Report `'running': RUNNER.busy` (or add `'settling': RUNNER.settling is not None`)
in `plan_payload`, so the page's "is it done" and "is it built" can never disagree. Nothing breaks if you leave it.

## 2026-10-08 · fyi: tools/form-dev/fake_claude.py not touched

The blender walk now takes the baked path for slide 2 (every new deck bakes). The old per-resolution path (720/1080,
cancel, skip for now, the finalize 409 for it) is kept as the else-branch but no longer runs, because no fake deck is
non-baked. If you want it covered again, a title directive in fake_claude.py that writes a glass line into scene.py
(`GLASS_RE` in form_server.py) would make slide 2 non-baked. I did not edit fake_claude.py (not in my file list).
