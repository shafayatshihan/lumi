# STATUS — the new looks (three-looks session)

**Updated 2026-10-07 23:40. Written for someone who has never spoken to this session.**

**Pink Punch: DONE. Happy Headspace: DONE. Yellow Frame: CANCELLED by the owner, deleted again by this session.**

- **Pink Punch** — figure language: a **screen print**, rendered in two passes (whole scene as a flat black
  silhouette through a camera offset down-right, then the real colours over it with depth cleared), near-frontal
  orthographic, rounded forms, 5 px black outline, pop fills. **3D policy: `threejs`, never Blender** — a print has
  no light and no blur, so Cycles renders the opposite picture at 100x the cost.
- **Happy Headspace** — figure language: a **soft volume in warm light**, the only one of these looks with lights:
  one warm key plus a wide hemisphere fill, matte Lambert, no outline, no cast shadow (grounding is a soft tinted
  contact disc), everything round or bevelled, no faces. **3D policy: `threejs`, never Blender** — Cycles spends its
  whole budget on the contact shadows, specular and material realism this brand removes.

Both rendered as full ten-slide decks at 1920 × 1080 and **looked at**, four times each, in a sandbox at
`X:\aura-dev-looks\` (never inside the repo). Shots: `X:\aura-dev-looks\shots\<look>\`, contact sheets in
`sheets\`. A backup of all 30 files is at `X:\aura-dev-looks\backup\`.

**Files created (30):** `engine/deck/themes/{pink-punch,happy-headspace}.css`;
`engine/deck/looks/<look>/{template.html, <look>.js, pp3d.js|hs3d.js, archetypes/*.html ×10}`;
`workspace/.claude/skills/aura-slide/looks/<look>/LOOK.md`. `node --check` clean, all HTML balanced, every
`font-size` verified on the look's own scale.

**Blocked on files this session does not own → `docs/new-looks-registration.md`.** One section per file with exact
text: `new_deck.js` (`LOOK_HEAD`, `LOOK_SPEC` — **without this a new deck in either look has blank 3D slides**),
`form_server.py` (`LOOK_SPECS`, `LOOK_3D`), `hard-rules.json` (both looks' measured numbers), the `CLAUDE.md`
numbers table, and optional `post-policy.js` entries. `THEMES` and `SHELL_THEMES` already list both.

**Four defects found by rendering, fixed here, and still present in Flat-Pack** (not owned by this session; the
fixes are described in section 7 of the registration file): the title figure collides with the title text (fixed by
a new `shift` camera option); `problem-stats` with three stats *and* a close line overflows the footer; the callout
tag covers its own numbered pin; and `.fp-q` is a `<p>` whose bare selector loses to `.slide p { margin: 0 }`, so
the gap above the closing line is silently dropped.

**Yellow Frame:** was built complete and rendering before the cancellation at 23:10. This session's restore at 23:08
re-created it by accident mid-write; all of it has now been deleted again and nothing under a `yellow-frame` path
remains except the coordinator's own `docs/STOP-yellow-frame.md`. It is **not** in the registration file.

**Left to do:** nothing in files this session owns. Apply `docs/new-looks-registration.md`, then build one real deck
per look and look at it.
