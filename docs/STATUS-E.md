# STATUS — Part E: real 3D + camera moves

2026-10-08. Brief: `docs/HANDOFF-E-real-3d.md`. Nothing committed (rule 1).

## Done, and verified

| what | where | verified by |
|---|---|---|
| **Realism doctrine** LOOK-BASE **4.10** "The real thing, never a likeness - binding on every look" (7 rules + what is checked), **4.11** camera setups and sway; two checklist lines appended to section 10. Additive only: 4.0-4.9 unchanged and unrenumbered | `workspace/.claude/skills/aura-slide/looks/_shared/LOOK-BASE.md` | `test_blender_e.py` static |
| Clay Pop rule 2 reconciled: "thick, never fewer or wider apart", ≥ half of each real gap open, liberty written down; air / heat / current as notation | `looks/clay-pop/LOOK.md` 3.1 | static |
| `L.real(source, liberties=, **dims)` - the scene declares its numbers and their source | `lumi_bpy.py` | Blender probe |
| `--inspect` teeth: **fatal** `no-real`, `analogy` (a part named cloud / puff / sparkle / heart ...), `no-preset` (no part in a real material); **warn** `static-camera`, `move-out-of-frame` (checked at ¼, ½, ¾ of the move) | `lumi_bpy.inspect()` | ran on the owner's own scene: `no-real` fatal + `static-camera` |
| `deck_check.js` teeth (via `blender_check.js`): reads each studio render's `scene.py` - ERROR on no `L.real`, a stand-in anywhere in the code (comments stripped), no real material; ERROR on a moving per-frame render on a measured slide; warn on a locked-off loop. An already-approved render gets warnings, not errors (not failed retroactively) | `engine/tools/lib/blender_check.js` | lint unit cases; the owner's scene → 2 errors (`no L.real`, `puff`) + 1 warn |
| **Camera setups** `L.move('sway'|'push'|'crane'|'dolly'|'orbit'|'whip'|'still', amount=, sway=)` - offsets from the framed rest pose, keyed every frame 1..N+1, periodic (one-way moves there-and-back on (1-cos 2πt)/2), frame 1 = rest pose, orbit forced to whole turns | `lumi_bpy.py` (`MOVES`, `move()`) | probe: all 7 close (frame N+1 == 1), start at rest, actually move (still holds) |
| The bake carries the move: `bake.json.cameraTrack` = one pose per frame (N+1 rows, last == first); `bake.json.real` = the `L.real` record | `lumi_bake.py` | probe + real draft bake of the coil (101 rows, closes exactly) |
| `bake-player.js` replays the track by `t` (lerp / slerp between rows, lens per row through `fit()`), never by dt | `engine/deck/lib/bake-player.js` | browser (Edge): seek(0) == seek(5) pixel-identical, repeatable, camera travels 18 units mid-loop |
| **Honesty gate for camera motion**: `LumiPostPolicy.cameraMotion(el)` - same measured record as post; `data-camera-move="still"|"allow"` override | `engine/deck/lib/post-policy.js` | browser: `data-measured` slide holds the camera (`held: measured values ...`); `test_post.mjs` 40/40 still |
| Bold Blue live: `S.shot(t, '<setup>', {amount, sway})` with the same names and offsets; `S.orbit` holds its rest pose on a measured slide | `engine/deck/looks/bold-blue/studio3d.js` | syntax + parity checks only (no browser run of a live `S.shot` scene yet) |
| **PolyHaven fetcher** `engine/tools/fetch_asset.py` (policy below) on Part D's shared `lib/lumi_net.py` | new | refusals unit-tested; live fetch of an HDRI and a texture set; cache hit; offline path |
| `L.studio(hdri=, hdri_strength=, hdri_rotation=)` real captured light; `L.pbr(id, fallback=, scale=)` scanned surface (box-projected, no UVs); `L.asset()` | `lumi_bpy.py` | Cycles render: chrome reflects the real studio; tread plate textured; background exact |
| BLENDER.md: template declares `L.real`; **2c** camera setups; **2d** PolyHaven; section 8 rows for the new codes; "the camera does not move" removed | `looks/bold-blue/BLENDER.md` | static |
| Tests | `tools/form-dev/test_blender_e.py` (`--blender <exe>`, `--net`); one line in `blender_parta_probe.py` (its inspect-ok scene now declares `L.real`) | ALL PASSED |

## The owner's case, rebuilt (render it and look at it)

Deck `42a8d8b6c8cd` s1 (Clay Pop). Before: `X:\aura-dev-e\hx\before_720.png` (the owner's own scene.py, re-rendered
720p/64 spp). After: `X:\aura-dev-e\hx\after_720.png`, mid-crane frame `after_crane_mid.png`; scene
`X:\aura-dev-e\hx\scene_after.py`. Same look, same palette, same renderer.

What was actually wrong with the old scene (it HAD the real numbers, in comments): 24 fins and 3 tubes, a slice so small
it read as a block; fins drawn 1.0 mm (real 0.15) under Clay Pop's "no thin parts", so the pack was a few slabs; no
tube sheets, return bends, headers or nozzles - nothing that makes a coil a coil; air shown as six clay clouds.

The rebuild: 40 wavy fins at 2.5 mm pitch (wavelength 25 mm, 1.68 mm peak-to-valley), drawn 0.6 mm (76 % of each gap
open; liberty declared), 2 staggered rows × 6 copper tubes at 30 / 25 mm pitch, 12 return bends forming 6 hairpin
circuits, two 19 mm headers with nozzles (size assumed - declared), flanged tube sheets. Air as notation: black
streamlines along the real corrugation with arrowheads; particles accelerate inside the pack by 1/σ, σ = (1 − t/s)(1 −
D/Pt) = 0.542 (continuity, real fin thickness). Camera: `crane`, amount 0.8. Honest limits: the module is 100 × 195 mm,
not the whole door; the headers are a plausible, not a documented, arrangement; the arrows are still modest in size.

## Network policy (E's half of the ONE policy; D's half is `lib/lumi_net.py`)

- **`permit.js` is unchanged.** Claude still has no network command. `fetch_asset.py` is a toolkit script, so
  `permit.js:303` (interpreter + script inside `.aura/engine/tools`) already allows it. Line 51 still denies curl & co.
- **Hosts hardcoded in the script**: `api.polyhaven.com`, `dl.polyhaven.org`. https only, port 443, no userinfo; a
  redirect off the list is refused (lumi_net). No URL argument exists: input is `hdri|texture`, an id matching
  `^[a-z0-9][a-z0-9_]{1,63}$`, and `1k|2k|4k`.
- **GET only** (lumi_net has no request body anywhere); every request appended to `.aura/temp/net-log.txt`.
- **What is kept**: only `.hdr .exr .jpg .png`, only if the extension, the magic bytes AND PolyHaven's md5 agree; size
  cap 64 MB; written atomically into `.aura/temp/assets/<type>/<id>/<res>/`. Never an archive, never executable.
- **Offline is normal**: `ok:false, offline:true` and one line ("using the built-in materials (lumi_bpy.PRESETS)
  instead"), exit 0. `L.studio(hdri=)` falls back to the gradient world, `L.pbr()` to `L.mat(fallback)`.
  `--inspect` never touches the network.
- **Build time only; a packed deck stays offline.** Stills / per-frame renders carry the HDRI in their pixels; PBR maps
  are baked into the GLB atlases (colour, roughness, metal; the normal map is not baked - there is no normal pass).
  A baked loop relights with the gradient in three.js, so an HDRI does not reach it. Nothing at run time fetches.
- `lumi_bpy.asset()` imports the same fetcher inside Blender (so the server's own renders find the asset even if the
  preview fetched it) - same allowlist, same checks, same log.

## blender-skills: the verdict (do not re-litigate)

| skill | verdict | what happened |
|---|---|---|
| crane-shot, dolly-rotate, slow-zoom, perfect-loop, dynamic-full-loop | **ported** as `L.move('crane'|'dolly'|'push'|'orbit'|'whip')` + `S.shot` | their defaults (lens 45→35, 40→50, 35→65, uneven key spacing) became fov factors and offsets, scaled down for a loop behind slide text; credited in comments |
| turntable | **already had it** (`L.turntable`, subject turns) + `orbit` (camera turns) | cross-checked: linear, 0 → 360 at frame N+1 - what `animate()` already does |
| threejs-export | **ours is better** | `lumi_bake.py` + `bake-player.js`; theirs is a GUI export |
| product-polish | **not ported** | its recipe is a glossy clear-coat product look (rough 0.02, coat 1.0) - it would make every look Bold Blue-gloss, against "thematic in surface"; its studio light rig is what `L.studio()` already does, calibrated |
| polyhaven-hdri-showcase, -studio-setup, -texture-apply, -material-swap, -scene-builder | **in, Lumi's own way** | `fetch_asset.py` + `L.studio(hdri=)` + `L.pbr()`; the scene-builder's pedestal is banned by LOOK-BASE 4.0, so not taken |
| blender-toolkit | **cannot** | WebSocket to a running GUI Blender |
| image-to-3d, multi-image-to-3d | **cannot** | paid Meshy API + network service |

No file of theirs is in the repo (no licence).

## Where the brief was wrong, read against the code

1. *"Today a 3D slide is mostly one static or gently orbiting camera."* Every live look already sways (BB `S.orbit`,
   CP `S.sway`, HS `S.breathe`, FP / PP `S.turn`). The locked-off camera was the **Blender path**: BLENDER.md said "The
   camera does not move", and the baked player had one static pose. That is where the owner's figure was, and where
   the work went.
2. The PolyHaven skills contain **no HTTP of their own** - everything goes through the blender-mcp socket (port 9876),
   so there were no endpoints to "read there". Implemented against PolyHaven's public API directly.
3. `dynamic-full-loop` does not actually close (it keys 360° on a rendered frame); ours does (tested).
4. The owner's scene was not missing numbers - it had them in comments. The failure was the slice, the thickening
   rule, the missing coil anatomy and the clouds; the rules target those.
5. Line refs drifted (`camera()` was :904, `studio()` :780, `PRESETS` :518).

## Not done / open

- Live `S.shot` (three.js) is untested in a browser; only the baked path is.
- Other looks (`cp3d`, `hs3d`, `fp3d`, `pp3d`) keep their own motion and do not read the honesty gate for camera
  motion yet - their sway is small, but a measured Clay Pop slide still sways. Wiring `cameraMotion()` into each is a
  one-line change per engine; not done to keep this surgical.
- The checker cannot judge a live three.js figure's realism; 4.10 binds it through the checklist and the screenshot.
- `test_server.py` / the e2e were **not run** (rule 5: ask first).
- The asset cache is never pruned (nothing in Lumi tidies `.aura/temp/assets`, which is what keeps the final render
  equal to the preview offline).
