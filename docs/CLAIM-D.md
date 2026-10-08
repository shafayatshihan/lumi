# Part D — claimed

Claimed 2026-10-08 by the Part D session (account 2110077@me.buet.ac.bd, Claude Opus 5.5).

Scope per `docs/HANDOFF-D-read-everything.md`:
- D1 read every upload, scanned pages included (OCR route vs. Claude-reads-the-page route, measured)
- D2 web research for understanding only (topic-derived queries, narrow toolkit fetcher, one network policy with E)

Files: `engine/tools/extract_text.py`, new files under `engine/tools/` (OCR path, research tool),
`engine/form/js/uploads.js`, `setup/aura.config.json` (package list only), tests under `tools/form-dev/`.

Edits to `engine/form_server.py` (B) and `workspace/.claude/skills/**` (E) go through `docs/REGISTER-D.md`.

Sandbox: `X:\aura-dev-d\`. Status in `docs/STATUS-D.md`.
