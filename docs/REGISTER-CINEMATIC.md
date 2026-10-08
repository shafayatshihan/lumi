# REGISTER — Package B requests for files it does not own

Item 0 is for the coordinating session; items 1 and 2 are for Package A (`engine/deck/runtime.js`). None blocks
Package B.

## 1. Live deck: restart a continuation slide's clock on entry (runtime.js ~line 295, startPieces)

Now: `if (!rec.t0) rec.t0 = performance.now();` - t0 is set on the FIRST entry only, so a slide revisited in a live
(unfinalized) deck resumes mid-loop. For `data-camera-from` slides that means the camera only starts on the previous
slide's pose the first time. Finalized decks are already right (`playLoop` sets `currentTime = 0`). Proposed:

```js
      if (!rec.t0 || el.hasAttribute('data-camera-from')) rec.t0 = performance.now();
```

Pure live-playback change: seek(t), capture and stills are untouched.

## 0. test_post.mjs: 40/41 - the one fail is a copy check against a gitignored sandbox (coordinating session)

`tools/form-dev/test_post.mjs:210-212` requires `aura-dev-rel/.claude/.../LOOK-BASE.md` (the gitignored sandbox inside
the repo, RESUME.md 2026-10-07) to equal the workspace LOOK-BASE.md. The only difference is Package B's new 4.8 and
4.9. Not edited here (not Package B's file). Either re-copy the workspace file over the sandbox copy, or point the
check at whatever the release build actually ships. All other 40 checks pass with Package B's changes.

## 2. health() does not check pixels, though its comment says it does (runtime.js holderDrawn, ~line 416)

The comment says "a canvas with real pixels"; the code checks `c.width > 0 && c.height > 0`. A scene that sets up
without throwing but draws nothing (a program that links but outputs zero alpha, a camera pointed at empty space)
still counts as drawn. Package B's own effect cannot cause this - a shaft shader that fails to link is detected and
the pass drops itself - but the gate is weaker than its description. Either fix the comment, or sample the canvas
(e.g. drawImage into a 16x9 2D canvas and require one pixel with alpha > 0). Owner's call; not done here.
