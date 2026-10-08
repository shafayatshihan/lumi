# REGISTER — P2: edits outside P2's own regions

| file / place | owner | what P2 changed | why |
|---|---|---|---|
| `engine/form/js/editor.js`: the `upAll` click handler | P5 moved it there | The body now calls `openPick()`, the queue picker defined right below it, instead of drawing the plain list. | The brief: reuse the "still to build" dialog for picking several slides. |
| `engine/form/js/editor.js` `paintUp()`, its last line | **P5** | `upBot.hidden` is now also false when `pay.queue.jobs` is non-empty or a Blender slide is `approved`. | Otherwise the queue and the render picker can't be reached with fewer than 2 slides left to build. P5: move it if you prefer another trigger. |
| `engine/form/css/theme.css`, after `.bd-alldlg .bd-up-row` | P5 (shared) | Added: 11 `.bd-q*` rules. | Styles the queue rows and tick boxes inside the dialog. |
| `engine/form/js/api.js` | shared | Added: `export const queue = { post }`. | The new route. |
| `form_server.py` `DECK_ROUTE` + the POST dispatch | shared | Added `queue` to the regex, to the POST list and to the handler map. | The new route. |
| `form_server.py` `plan_payload` | P2; P1 also edits its `blender` block | Only the `buildRest` / `buildTarget` line changed, plus the new `queue` key. P1's block is untouched. | Items 5 and 8. |
| `form_server.py` `build_next`, `build_action` | shared (the build flow) | `build_next(deck_id, sid=None)`; `rest=` removed. `mode: rest` → queue jobs; `mode: stop` removes the deck's build jobs. | Item 5. |
| `form_server.py` `reap()` + `RETENTION` | P2 | Added `framesDays: 14` and one rule for unfinished `frames/` folders. | Item 9. |
| `tools/form-dev/test_server.py:926`, `test_batch_c.py:96`, `test_blender.py:538` | shared | These read or expected the stored `buildRest` and "interrupted + frames removed"; they now check the queue behaviour instead. | Those behaviours were removed on purpose (items 3 and 5). |
| `engine/lumi_queue.py`, `tools/form-dev/test_queue_p2.py` | P2 (new) | New files. | |
