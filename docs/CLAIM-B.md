# Part B — claimed

Claimed 2026-10-08 by the Part B session (account 2110091@me.buet.ac.bd, Claude Opus 5).

Scope per `docs/HANDOFF-B-screens.md`:
- B1 quality picker — three tiers, Opus+medium default, ticks visible beside the mascot
- B2 plan page — layout and type

Files: `engine/form/js/{quality,plan,markers}.js`, `engine/form/css/plan.css`,
the tier definitions in `engine/form_server.py`, `tools/form-dev/` tests.

Note: `engine/form/css/plan.css` also carries the look-screen `.th-*` rules, and Part A has an
uncommitted change to `.th-lumi` in it. Part B does not touch any `.th-lumi` rule.

Status in `docs/STATUS-B.md`.
