# STATUS — Clay Pop (fifth look, slug `clay-pop`)

Updated: 2026-10-08 00:35. Claim: `docs/CLAIM-CLAY.md`. Shared-file changes to apply: `docs/REGISTER-CLAY.md`.

**Done (in the repo, files this session owns)**
- `engine/deck/themes/clay-pop.css`, `engine/deck/looks/clay-pop/{template.html, clay-pop.js, cp3d.js}`, all ten
  `archetypes/*.html`, `workspace/.claude/skills/aura-slide/looks/clay-pop/LOOK.md`, `.../brands/clay-pop/brand-style.md`.
- `node --check` clean on all three JS files; every HTML builds into a deck.

**Rendered and looked at** (sandbox `X:\aura-dev-clay\`, never the repo)
- Clay preset: plastic vs clay, 3 variants x 4 tone maps, then a clay-camera hero (5 passes, final 1080p/128 spp, 129 s).
- A 12-slide deck of every archetype: 1920x1080 stills and 1366x768 presenter mode - all 3D draws, nothing overflows.
- `deck_check.js` with the proposed rules: clean except the archetypes' placeholder numbers (expected in a skeleton).
- Fixed on the way: faceted live blocks, tags pinned to the corner in live mode, title text colliding with a
  full-bleed render, VSM shadow stripes, page numbers counted as claims, an off-scale bead size.

**Done:** `engine/form/themes/5-clay-pop.{mp4,jpg}` (12.03 s, 1280x720, 30 fps, like the other four). Made from 64
Cycles frames (720p, 48 spp) played forward then back: the full 80-frame loop was stopped at the owner's request to
save time. Not yet watched inside the real look picker (needs registration 6 applied); the Clay Pop mini-slide in
review.js WAS rendered on a sandbox copy and looked at.

**Blocked / needs the coordinator:** every registration (form_server, hard-rules, new_deck, post-policy, looks.js,
home.js, review.js, lumi_bpy preset, workspace docs) - exact text in REGISTER-CLAY.md, tested on a sandbox copy.
Until it is applied the look is invisible to the app.
