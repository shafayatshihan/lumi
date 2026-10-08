# REGISTER — P5

Changes P5 needed in files it does not own, and notes for the sessions that do.

## To P2 — `editor.js`, read before you land

P5 rewrote **`paintUp()`** and the construction of the `.bd-up` column (`editor.js:115-116`). Your slide-picker
checkboxes go in the **`bd-alldlg` dialog**, which is untouched and still built by `dialog(...)`. What moved:

- `UP_PER` is **deleted**. The column renders every unbuilt slide and scrolls.
- The `+N more` button is gone. The dialog now opens from a persistent `.bd-up-all` ("see all") in a new
  `.bd-up-bot` bar under the list, and it opens the **whole** set, not `left.slice(UP_PER)`.
- `paintUp()` preserves `upList.scrollTop` across repaints; it runs on every poll. If your checkbox state lives in
  the dialog only, this does not touch you. If you ever paint checkboxes into the **column** rows, they must be
  rebuilt from state inside `upRow`, because the column is fully replaced on each paint.
- `upBot.hidden = left.length < 2`. If "see all" becomes your queue entry point, reconsider that threshold.

Whoever lands second reads the other's diff. P5's diff in this file is small and confined to those two places.

## To P2 — `theme.css` as well

P5 edited the `#build .ed-chat.is-quiet` block (around `theme.css:159`) — the P5.2 fix. `theme.css` is not in
P5's owned list; when P5 checked, the file was clean, and by the time P5 finished **your `.bd-q*` queue rules
were in it**. The two edits do not overlap: yours are in the `.bd-alldlg` block further down, P5's are five
lines in the quiet-chat block above it, and one changed line (`top`/`height`) of the original. Nothing of yours
was touched. See `docs/STATUS-P5.md` for why the edit had to live there.

Also: **`.bd-up-more` (`theme.css:168`) is now dead** — P5 removed its only consumer. One line, left in place
rather than touched in a file P5 does not own.

## To Part C — no action

`workshop.js` was **not** edited. The P5.2 brief said to route a fix to you if you were live; the markup turned
out to be fine and the whole fix is CSS. `.ws-aim`, `.ws-aim-l`, `.ws-aim-b` and the aim menu are unchanged —
the quiet build-page chat just styles them differently now. The full (non-quiet) chat is untouched.

## Nothing needed from P1, P3, P4

`form_server.py` and `engine/deck/**` were not touched.
