# REGISTER — Part F

Changes Part F made outside its own files, and what it needs from other parts. 2026-10-08.

## Changes to shared files (made, small, additive)

| file | owner | what | why it could not be routed |
|---|---|---|---|
| `engine/tools/new_deck.js` | shared (E added `SHARED_HEAD`) | **one line** in `SHARED_HEAD`: `<script src="{{ENGINE}}/deck/lib/illus.js"></script>`, plus two comment lines | without it no deck can reach `LumiIllus`. It loads a file that registers nothing and draws nothing by itself, so a deck that never calls it is byte-identical in behaviour. |
| `workspace/.claude/skills/aura-slide/SKILL.md` | E | **two lines** in the "Reference files beside this one" list, pointing at `illustration.md` | a reference file nothing points at is never read. |
| `looks/_shared/LOOK-BASE.md` | E (additive only, as agreed) | new **section 4.12** after 4.11, and **one checklist line** in section 10 | the brief gives F the 2D half of the same question E owns the 3D half of. 4.12 adds only the drawn case and cites 4.10 / 3 / 4.3 / 6 / 4.6 rather than restating them. Nothing existing was edited or removed. |

## For Part E

- **4.12 is the shared section**, written so the 3D rules stay the single source: it says a drawing is bound by
  4.10 (the real object, real counts, realistic in structure / thematic in surface) and adds nothing of its own
  about realism. If you sharpen 4.10, 4.12 follows automatically — please do not fork it.
- **`engine/deck/lib/illus.js` is F's**; it is not a `*3d.js` and touches no GL. It calls no three.js, creates
  no canvas and no context, so the GL context budget is unaffected.
- Each look's `LOOK.md` now has a **section 3A, "The illustration idiom"**, sitting between your section 3
  (the figure idiom) and section 4 (the chart idiom). It describes surface only.
- **Post (4.6 / 4.9) does not reach a drawing** and 4.12 says so: there is no holder canvas to render it into,
  and a filter over inline SVG would move every measured text ratio on the slide at once.

## Asks (not taken)

1. **`new_deck.js --snippet`: a drawn variant of `comparison-twin` and `result-chart` per look.** Today every
   archetype snippet ships a 3D holder, so a builder who wants the illustration third of the picture mix has to
   replace the holder by hand. The holder is three lines; the snippets are shared, so this is registered here
   rather than taken. F will write them if whoever owns `new_deck.js` says yes.
2. **`deck_check.js`: optionally cross-check `F.claims` against `provenance.json`.** Numbers in a drawing are
   already caught by the existing slide-text pass; this would only make the message say which figure the number
   is in. Low value, listed for completeness.

## Nothing touched

`engine/form/**`, `engine/form_server.py`, `engine/tools/extract_text.py`, `engine/deck/blender/**`, any
`*3d.js`, `RESUME.md`, `BACKLOG.md`, `FIXLOG.md`, the rest of `docs/`, `C:\Lumi`, git. No commit, no tag, no
version bump. No new runtime dependency: `illus.js` is a plain classic script with no imports, and the packer
inlines it like any other (verified: 8 scripts inlined, one 1.27 MB offline file).
