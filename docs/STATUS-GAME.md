# STATUS: the waiting game — 2026-10-08, done, nothing blocked

**Files touched:** `engine/form/js/lumi-play.js` (rewritten inside the same contract), `engine/form/css/theme.css`
lines 296–302 and 320 only (score pop, milestone pop, night HUD colours, reduced-motion off-switch),
`tools/form-dev/play.html`. Nothing else. No git.

**Done**
- Best score persists: `lumi.play.best`, saved the moment it is beaten, every read/write in try/catch.
- Sound via the app's `audio.js` (dynamic import, same module): flap `tick`, point `select`, every 10th `success`,
  crash `drop`. Only plays when `playing()` is true; never on setRunning/setAsking. Silent when sfx is off **or music
  is off** (music is the only switch the person can see).
- Difficulty: speed and gap ease on exponential ramps; gap floor = max(4·r, 0.34·H). Spacing varies ±18%, quick
  pairs past 8. Every 10 points: the sky moves dawn → day → dusk → night, plus drifting gaps (pink lips) from 10,
  wider columns from 20, and one easier gap right after. Hitbox unchanged. New gaps are capped to what you can climb/fall in time.
- Scene: sky gradient, sun/moon glow, stars at night, two parallax hill layers, clouds, two column looks. All code.
- Lumi: happy flying, squash on flap, `hmm` on a near miss, `wow` at milestones (see REGISTER), `sad` + tumble on crash.
- Fixed two old bugs: (1) the canvas was never sized at first mount (W/H started at 560×138, so measure() returned
  early and left a 300×150 canvas); (2) resuming with space after a pause or a question played on in the small strip.
- Canvas is backed at real screen pixels (stage scale × DPR, cap 2), and re-measured on window resize.
- Holding space no longer machine-guns flaps. A 380 ms lockout after a crash stops a mashed flap restarting.

**Verified** (Playwright on the harness, Edge headless, 1600×900, 1366×768, and 1600×900 reduced motion): text box keeps
space and caret; question shrinks the arena on the same tick, ≤1 frame after, left paused; finish clears everything;
pointer off → 0 frames, 0 sounds; no sound on run start/finish; best survives reload; 60 fps in the big state;
an autopilot played ~6 min total (best runs 33–43). `node --check` clean. Sound **not** heard by me: I can only see it fire.
