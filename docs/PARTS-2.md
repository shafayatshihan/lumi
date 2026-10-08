# Batch 2 — the five parts (2026-10-08, after v0.6.1)

**One account per part. Claim before editing.** The previous batch (A–E, `docs/PARTS.md`) is finished and
shipped; this is the new split.

| part | job | brief | who |
|---|---|---|---|
| **P1** | real renders — stop baking, go back to Cycles | `docs/HANDOFF-P1-real-renders.md` | |
| **P2** | the overnight queue — durable, resumable, many slides | `docs/HANDOFF-P2-overnight-queue.md` | |
| **P3** | camera angles chosen from real renders | `docs/HANDOFF-P3-camera-chooser.md` | |
| **P4** | a label never covers the figure | `docs/HANDOFF-P4-labels.md` | |
| **P5** | build-page polish + the home illustration | `docs/HANDOFF-P5-ui-polish.md` | **coordinating session** |

Full reasoning, measurements and the decisions behind all five:
`C:\Users\shafa\.claude-profiles\acc72\plans\four-things-still-open-typed-perlis.md`.

## The owner's decisions behind this batch (do not re-open)

| | |
|---|---|
| Baking | **Dropped.** Animations go back to per-frame Cycles. |
| Animation preview | A Cycles still; on confirm, the full Cycles animation **whatever it costs**. |
| Stills | Cycles on **Bold Blue and Clay Pop only** — the other three looks are not photographs. |
| Blender missing / failed | Fall back to three.js **and say so**. Never silently. |
| Overnight | A worker inside Lumi's server. Lumi stays open, machine awake. No service, no `schtasks`. |
| Multi-slide | Pick several, queue them all; one at a time. |
| Camera chooser | **Every 3D slide**, four real candidate renders. |
| Labels | Leader line out to clear space, never over the silhouette. |

## The number that drives all of it

Measured on the owner's MX350, from his own deck record: one 120-frame loop is **396 s baked** and
**~117 minutes** per-frame in Cycles. Two animated slides ≈ 3.3 hours. That is why P1 needs P2.

## File ownership at a glance

| file / area | part |
|---|---|
| `form_server.py` Blender routing/estimates (≈`4700-5230`, `5900-6300`), `lumi_bake.py`, `bake-player.js` | **P1** |
| `BlenderRenderer` (`:5227-5849`), `Runner`/`after_run`/`buildRest`, `reconcile_interrupted`, `reaper`, `plan_payload`, the queue route, the slide-picker dialog in `editor.js` | **P2** |
| `lumi_bpy.py` camera code, the camera action, `blender.js` | **P3** |
| `runtime.js` labels, the five `*3d.js` label functions, `illus.js`, `LOOK-BASE.md` §4.4, `deck_check.js`, `enforcement.md` | **P4** |
| `plan.css` (`.bd-up*`, `.pl-big-s1`), `editor.js` `paintUp()`, `home.js`, the mascot rules, `assets/` | **P5** |
| git, the release, `RESUME.md`, `BACKLOG.md`, `FIXLOG.md` | **P5 (coordinator)** |

**Three parts share `form_server.py`** — split by region, every cross-boundary edit via
`docs/REGISTER-P<n>.md`. This is the main coordination risk.
**Two parts share `editor.js`** — P2's picker dialog sits right beside P5's `paintUp()`. Read the other's diff.

## Order

1. **P1** flips the `bake` flag and proves per-frame rendering works. One small revertible commit, then tell P2.
2. **P2** fixes the resume success test and `reconcile()` — useful on their own — then builds the queue.
3. **P3**, **P4**, **P5** are independent of everything and of each other. Start immediately.

## Everyone, without exception

1. **Never commit to main, push, tag, publish or bump the version.** The coordinator owns git.
2. **Never touch `C:\Lumi`** except to read — the owner's live install, with his real decks in it.
3. **Never weaken `engine/rules/permit.js`.**
4. **`engine/node_modules` is missing** (gitignored, repo re-cloned): `npm install` in `engine/`.
5. **Ask before running `test_server.py` or the e2e.** Two suites at once give phantom failures that have
   already cost this project hours. `test_blender_*.py` need a sandbox with an `.aura\engine` junction.
6. **Sandboxes at `X:\aura-dev-p<n>\`**, never inside the repo.
7. Write files with the Write tool, not bash heredocs. PowerShell stays ASCII + CRLF.
8. **No new runtime dependency reaches a deck** — one offline HTML file, no CDN, no add-on ES modules.
9. **Render it and look at it**, 1366×768 and 1920×1080.
10. Keep `docs/STATUS-P<n>.md` current — the coordinator cannot see your messages.
11. Say plainly anything in your brief that turns out to be wrong. Agents on this project have already found
    several real errors in these documents, including one brief written to correct an earlier one.
