# REGISTER — Part E: requests to other parts' files

## permit.js — no change requested
`fetch_asset.py` runs under the existing toolkit allow (`permit.js:303`); `lumi_bpy.asset()` runs inside the already
allowed `blender` process and uses the same fetcher. Nothing in Part E needed the gate loosened.

## Part D — `engine/tools/lib/lumi_net.py`
`fetch_asset.py` now uses `lumi_net.get()` (your module said it could): one frame, one net-log. Two small asks:
1. An env override for the log path (e.g. `LUMI_NET_LOG`), so tests can log into a sandbox: run from the repo,
   `aura_root()` resolves to `<repo>/.aura` and a test creates that folder (gitignored, but inside the repo).
2. `get()` does not re-check `r.geturl()` after the redirect handler. The handler already checks each hop, so this is
   belt-and-braces only.

## Part A (coordinator)
- Files outside the brief's list that Part E touched, both because nobody else owns them and the brief asked for
  checker teeth: `engine/tools/lib/blender_check.js` (+ the scene lint) and one line of
  `tools/form-dev/blender_parta_probe.py` (its inspect-ok scene declares `L.real`, now required).
- New file for the packer's attention: none. `bake-player.js` and `post-policy.js` are already packed / loaded.
- `.aura/temp/assets/` must stay out of any future temp tidy, or an offline final render would differ from its preview.

## Part B — `engine/form_server.py`
Nothing required. Optional: the build message's Blender block could name `L.real` and `L.move` (the template in
BLENDER.md already carries both).
