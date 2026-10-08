# CLAIM — Package C (photo-to-3D / Gaussian splatting)

Claimed: 2026-10-08, session start.

Plan: verify the three/0.186.1 splat claims against this repo, measure the three routes
(pack WebGPU build / inline WebGL splat renderer / reject in favour of photogrammetry mesh),
test capture determinism and the SwiftShader fallback, and write the verdict to
`docs/STATUS-SPLAT.md` before any production code.

Files I will write: `docs/CLAIM-SPLAT.md`, `docs/STATUS-SPLAT.md`, `docs/REGISTER-SPLAT.md`,
new files under `engine/deck/lib/splat*`, new files under `engine/tools/`.
Prototyping in `X:\aura-dev-splat\`. Everything else is register-only.
