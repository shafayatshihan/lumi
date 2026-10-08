# CLAIM — Package B (cinematic: camera continuation + volumetric light)

Started: 2026-10-07 23:57 BST.

Plan: write the camera-continuation design into STATUS-CINEMATIC.md first (declared per-slide start camera, no runtime
inheritance), then add a deterministic god-ray pass to the existing post.js chain/LADDER, gated by post-policy.js.

Files: engine/deck/lib/post.js, engine/deck/lib/post-policy.js, engine/deck/looks/bold-blue/studio3d.js,
LOOK-BASE.md (additive sections only), docs/{CLAIM,STATUS,REGISTER}-CINEMATIC.md.
