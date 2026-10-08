# REGISTER — P1 edits outside P1's own region

| file:area | owner | change | why |
|---|---|---|---|
| `form_server.py` `new_deck` (~:994) | brief says P1 | `'bake': True` -> `'bake': False` | the flip itself |
| `form_server.py` `plan_payload`, `'blender': {'bakes': ...}` (~:3547) | **P2** | `bool(rec.get('bake'))` -> `'bake' in rec` | `bakes` feeds only `effEngine` in `blender.js` (P3), which mirrors `slide_engine`. Without this the plan card would show "live 3D" for animations the server sends to Cycles. One expression; value now means "animations on a Blender look go to Blender". |
| `engine/deck/lib/bake-player.js` | P1 | `ACESFilmicToneMapping` (the coordinator's fix, already in the tree uncommitted) + a DORMANT header | the brief said this fix was recorded here; this file did not exist until now |

No edits to `BlenderRenderer`, `Runner`, `blender.js`, `editor.js`, `plan.js`, `workshop.js`.
