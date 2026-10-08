# CLAIM — Part P2: the overnight queue

Claimed 2026-10-08. Brief: `docs/HANDOFF-P2-overnight-queue.md`.

Owns: `BlenderRenderer` (`form_server.py` ≈`5227-5849`), `Runner` / `after_run` / `buildRest`,
`reconcile_interrupted`, `reaper`, `plan_payload`, the new queue module + `POST /api/decks/<id>/queue`,
the slide-picker dialog in `engine/form/js/editor.js` (≈`665-676`).
Docs: `docs/CLAIM-P2.md`, `docs/STATUS-P2.md`, `docs/REGISTER-P2.md`.

Does not touch: P1's `≈4700-5230`, `5900-6300`, `lumi_bake.py`, `bake-player.js`; P3's `blender.js`;
P4's `runtime.js` / looks; P5's `paintUp()`.

Sandboxes: `X:\aura-dev-p2\`.
