# CLAIM — Package A (baked motion pipeline)

- **Package:** A
- **Started:** 2026-10-07
- **Session:** Claude Opus 5 (account 2110091@me.buet.ac.bd)

## Plan

Part C preconditions first and in order: verify a real software-GL (swiftshader) `finalize` end to end,
add a fallback when browser capture fails, and make that failure loud. Only then Part B: bake Cycles
detail to textures once, export meshopt/WebP glTF, play in three.js, and drive it through the **existing**
deterministic `seek(t)` capture in `engine/tools/finalize.js` — no new capture path.

Open design problem (screen-aligned `L.section()` hatching vs. baked textures) to be decided and justified
in `docs/STATUS-A.md` before any bake code is written.

Owns: `engine/deck/blender/**`, `engine/deck/lib/bake*`, the Blender section of `engine/form_server.py`,
`workspace/.claude/skills/aura-slide/looks/bold-blue/BLENDER.md`, `tools/form-dev/test_blender*`.
