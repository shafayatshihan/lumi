# CLAIM-P3 — camera angles the person chooses, from real renders

Claimed 2026-10-08 by a Claude Code session (Opus 5).

Owns, exclusively:
- `engine/deck/blender/lumi_bpy.py` — the camera code (`VIEWS` ~:998, `camera()` ~:1004) and the
  preview-candidate entry point
- `engine/form_server.py` — ONE new Blender action beside `bl_post` (~:6096), its entry in
  `BLENDER_ROUTE` (~:4708), and the filename pattern it needs in `BLENDER_FILE_RE` (~:4709)
- `engine/form/js/blender.js` — the chooser card
- `engine/form/css` — the chooser's rules only

Routes out, does not edit:
- `form_server.py` routing/estimates region (~4700-5230, 5900-6300) -> **P1**
- `form_server.py` `BlenderRenderer`, `Runner`, `plan_payload` -> **P2**
- `lumi_bake.py`, `bake-player.js` -> **P1**
- `editor.js` -> **P2**;  `runtime.js`, look engines, `LOOK-BASE.md`, `deck_check.js` -> **P4**

Note: my new action sits between P1's and P2's regions in the same file. Every line I add there is
logged in `docs/REGISTER-P3.md` before it lands.

No commits, no push, no version bump: shared working tree, the coordinating session owns git.

Register: `docs/REGISTER-P3.md`  ·  Status: `docs/STATUS-P3.md`
