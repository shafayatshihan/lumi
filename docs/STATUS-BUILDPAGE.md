# STATUS — build page (2026-10-08)

## Done
- **"New slide not shown at once" (owner's bug).** The cause is not the add dialog. Adding or removing an *unbuilt*
  slide already repaints at once, because the save's answer goes through plan-store `land()` → `onPlan()`. The lag is
  when a slide **finishes building**: the server clears `RUNNER.run` *before* `after_run()` marks the slide built
  (the settling window). The page's plan read on the running→idle edge can land inside that window, see no new slide,
  and the next read is the idle poll (5–15 s). On a slow machine this happens more often.
  Fix (editor.js):
  - poll every 500 ms for up to 10 s after a run ends, until `built` changes or Claude asks;
  - on a built change, set `count = built` (it used to be 0, which greyed every slide until thumbnails rendered) and
    `paintAll()`;
  - a *drop* in built (a built slide removed) no longer says "slide N is ready", and no longer reloads the frame
    twice. The remove button now relies on `onPlan()`.
- **W-01 test now checks what the person sees.** Two new checks in e2e_walk.js: the strip's total rises the moment an
  added slide is saved, and a finished slide is in the strip (made, not greyed) and in "slide n of m" within 2 s of
  Claude stopping.
- **"the slide being built right now says so".** This was a test race: the check ran after the fake had already
  finished slide 1, so no row was marked "now". It now runs the moment the build page opens. The page was fine.
- **"claude's questions lock the build and take focus".** workshop.js `takeFocus` gave up after 10 × 150 ms, but the
  options only become enabled once the page learns the run ended (a poll later). It now keeps trying for as long as
  the card waits (up to about 20 s), and never takes focus from a control the person has moved to. This was timing,
  not layout: in my baseline it failed at 1366 as well.
- **Baked animation surface (blender.js).** Plan chip: `animation ≈ 4 min`, which used to be a bare `≈ 4 min`. While a
  baked slide makes its rough look, the build-page card says `a rough look, then the final loop, on this computer.
  ≈ X in all.`, because no approval step follows where the cost could be shown. The rendering bar still shows % and
  time left. No resolution row is shown, which is correct for a bake.
- **e2e_blender.js.** The plan check accepts both forms. Slide 2 branches on `view(s2).baked`. Baked: it bakes on its
  own, says its time, lands in slide 2, then "make next slide", then finalize. Non-baked: the old 720/1080 path,
  kept unchanged as the else-branch.

## e2e
- before (brief): walk 36/37 · blender 26/29, at both sizes
- after: **walk 39/39 at 1366 and 1920** (2 new checks) · **blender 40/40 at 1366 and 1920**
- One flake was seen once and not reproduced: blender 1920, slide 1 "do you like the design?" timed out at 90 s. The
  rerun passed. That code path was not touched.

## Files touched
engine/form/js/editor.js · engine/form/js/workshop.js · engine/form/js/blender.js ·
tools/form-dev/e2e_walk.js · tools/form-dev/e2e_blender.js · docs/{CLAIM,STATUS,REGISTER}-BUILDPAGE.md

## Blocked / for the coordinating session
See REGISTER-BUILDPAGE.md. There are two items:
- an optional `plan_payload` running/settling fix;
- the non-baked blender path is no longer exercised by any fake deck.
Not run: test_server.py (per rule 3).
