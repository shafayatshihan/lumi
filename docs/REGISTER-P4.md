# REGISTER — P4 edits outside P4's own region

| file:area | owner | change | why |
|---|---|---|---|
| `engine/deck/lib/bake-player.js` `placeLabels` (~:265) | **P1** (the file), P4 (the label block, by the brief) | the projected point now goes to `LumiLabel.place` instead of being written out as a raw percentage; falls back to the old two lines when `runtime.js` is absent | the brief gives P4 the label block inside this file and asks for the rule on the Blender path too. Decks already carrying `bake: True` keep working and get the rule. **P1: this is the only hunk P4 touched here, and it is below your tone-mapping fix — no overlap.** |
| `engine/deck/looks/happy-headspace/hs3d.js` `ground()` (~:243) | P4 (look engine), but outside the label function | one line: `m.userData.shadow = false` on the contact disc | the four other looks already mark grounding this way, and the occupancy pass reads that flag to tell the subject from the floor. Without it this look's ground disc counted as figure and pushed every label up |
| `engine/deck/themes/*.css` `:root` | P4 (`.bb-tag`-family theme rules) | two new custom properties per look, `--leader` and `--leader-w` | the leader line is drawn in `runtime.css` and has to take its colour and weight from the look |
| `engine/deck/themes/bold-blue.css` (~:180) | P4 | the two `.bb-blender > .bb-tag` transforms are now scoped `:not([data-placed])` | they were a hand-written offset that the placer replaces; left unscoped they are dead weight, and they read `data-align` the opposite way round to the look engines (noted in `STATUS-P4.md`) |

No edits to `engine/form_server.py`, `lumi_bake.py`, `BlenderRenderer`, the queue, `blender.js`, `lumi_bpy.py`,
`new_deck.js`, `pack_deck.py` or `template.html`. The shared placer went into `runtime.js`, which every deck already
loads, specifically so that no new file had to be wired into `new_deck.js` or taught to the packer — rule 6, no new
runtime dependency reaches a deck.
