# REGISTER — P3 edits outside P3's own region

Every line P3 added or changed in somebody else's file or region. Nothing else in those files was touched.

| file:area | owner | change | why |
|---|---|---|---|
| `form_server.py` `BLENDER_FILE_RE` (~:4724) | **P1** | added the alternative `cameras/cam-[a-z0-9][a-z0-9-]{0,23}\.png` | the brief says this whitelist must learn the new filenames or the thumbnails will not serve. Pattern only; the existing alternatives are unchanged. |
| `form_server.py` `BLENDER_ROUTE` (~:4726) | **P1** | added `cameras\|camera` to the action group | the two new actions. One line inserted; the `files/(.+)` alternative is untouched. |
| `form_server.py` `bl_hash` (~:4940) | **P1** | now folds `camera.json` into the sha1 **when that file exists** | a camera choice IS a change of scene, so it must move the hash or an approval made at one angle would silently render at another (`bl_approve` `preview-outdated`, `full()` re-check). Back-compatible by construction: a slide with no chosen camera hashes byte-for-byte as before, so no finished approval anywhere goes stale on upgrade. |
| `form_server.py` `bl_view` (~:5209) | **P1** | one extra key, `cameras=bl_cam_view(...) if engine=='blender' else None` | the card has to see the chooser. Read-only; computes nothing the view did not already compute. |
| `form_server.py` `BlenderRenderer._work` (~:5363) | **P2** | one `elif job.kind == 'cameras': bl_cameras_run(self, job)`, and the matching arm in the crash handler | the only line of P3 inside `BlenderRenderer`. The job body itself is a module-level function (`bl_cameras_run`) that *borrows* `_exec` / `_open_log` / `_classify`; the queue, the lanes and the one-job-on-the-GPU rule stay entirely P2's. `BlenderJob.lane` already sends any non-`full` kind to the preview lane, so no change was needed there. |
| `form_server.py` `bl_post` (~:6621) | **P1/P2 boundary** | two dispatch lines, `cameras` and `camera` | the brief's "a new action beside `bl_post`". |
| `form_server.py` POST route table (~:7665) | shared | added `'cameras', 'camera'` to the accepted action tuple | without it `BLENDER_ROUTE` matches and the handler drops it. |
| `engine/form/js/api.js` `blender` (~:157) | shared | two methods, `cameras()` and `camera()` | the client half of the two actions. |
| `engine/form/css/theme.css` `.bl-left` (~:432) | the card (P3 by the brief) | added `position:relative` | `.bl-note` moved from the picture to the column, because the chooser takes the picture's place while it is open. Without it the note would anchor to the card. |
| `engine/form/css/theme.css` `.bl-cap` (~:455) | the card | `:empty` selector extended to `[hidden]` and `.bl-pic[hidden]` | both are hidden while the chooser is open. |

## Not mine, found in the tree, left alone

- `engine/form/js/blender.js` arrived with one uncommitted change from the coordinating session —
  `fin.res ? 'final loop · ${fin.res}p' : 'final loop'` in `paintPic`. It is correct for a baked loop that has no
  resolution. Kept as is; P3's edits are elsewhere in the file.

## For P2

`editor.js` and `plan_payload` are untouched. If P2 adds a job kind, note that `_work` now has three arms, not two.
