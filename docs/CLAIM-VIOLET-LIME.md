# CLAIM — Violet Lime, Lumi's eighth look

Claimed 2026-10-09 by a Claude Code session (Opus 5). Brief: `docs/HANDOFF-violet-lime.md`.

## Owns outright (new files, nobody else's lines)

- `engine/deck/looks/violet-lime/` — `template.html`, `violet-lime.js`, `vl3d.js`,
  `archetypes/*.html` (exactly ten)
- `engine/deck/themes/violet-lime.css`
- `workspace/.claude/skills/aura-slide/looks/violet-lime/LOOK.md`
- `engine/form/themes/9-violet-lime-1..4.jpg`
- `docs/CLAIM-VIOLET-LIME.md`, `docs/STATUS-VIOLET-LIME.md`, `docs/REGISTER-VIOLET-LIME.md`

## Shared files — additive hunks only, one key each, never a whole-file checkout

| file | the one thing added |
| :--- | :--- |
| `engine/rules/hard-rules.json` | `looks."violet-lime"` object |
| `engine/form_server.py` | one line each in `LOOK_SPECS`, `LOOK_3D`, `SHELL_THEMES` |
| `engine/tools/new_deck.js` | one entry each in `THEMES`, `LOOK_HEAD`, `LOOK_SPEC` |
| `engine/form/js/looks.js` | one `LOOKS` entry, one `SWATCH` key |
| `engine/form/js/scenes/review.js` | one `LOOKS` entry, one `DRAW` key |
| `engine/form/js/home.js` | one `LOOK_DOT` key |
| `workspace/.claude/CLAUDE.md`, `aura-dev-rel/.claude/CLAUDE.md` | one row in "The numbers" |
| `tools/form-dev/test_instructions.py`, `test_server.py`, `fake_claude.py` | the stale look lists |

Each shared-file hunk is re-read immediately before editing and logged in
`docs/REGISTER-VIOLET-LIME.md`. Nothing is reverted by `git checkout` of a shared file.

## Does not touch

`deck_check.js` (the brief leaves `safeZonePx` at 96), `runtime.js`, `runtime.css`,
`lumi_bpy.py`, `LOOK-BASE.md`, any other look's files, `pack_deck.py`.

No commits, no push: shared working tree, the coordinating session owns git.

Register: `docs/REGISTER-VIOLET-LIME.md` · Status: `docs/STATUS-VIOLET-LIME.md`
