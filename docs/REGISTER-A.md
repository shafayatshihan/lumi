# REGISTER — Package A

Changes Package A needs in files it does not own. The coordinator applies them. Nothing here is urgent; they are
record corrections, not code.

---

## 1. `RESUME.md`, the Part C paragraph (around line 287)

**Replace:**

```
Part C, THE RISK: browser capture already failed once under software GL and D-04 made that failure SILENT (warn, not
throw); there is no software-GL fallback in product code and a real swiftshader finalize has never been verified.
Preconditions before any of Part B ships: verify it, add a fallback, make the failure loud again.
```

**With:**

```
Part C, THE RISK: DONE 2026-10-07 (uncommitted). A real swiftshader finalize now runs end to end (two live three.js
scenes, 9.2 s, the frames carry the mesh). The failure was worse than recorded: showStill() set
data-aura-still-ready=1 even when the scene threw, so the 180 s wait never fired and a dead deck finalized at exit 0
with ZERO warnings and blank loops. runtime.js now reports what actually drew (LumiCapture.health(),
data-aura-still-3d); finalize.js gates on it before recording, retries the whole deck on SwiftShader, and stops with
one plain sentence and no files written if that fails too. tools/form-dev/test_blender_softgl.py, 15 checks.
Still open for Part B: one Cycles poster per baked slide, the fallback for a scene no renderer can draw.
```

## 2. `RESUME.md` line 64, last sentence

**Replace:** `NOT verified: a real software-GL (swiftshader) finalize (too slow to finish); deckpage.js now accepts
AURA_BROWSER_ARGS for that.`

**With:** `Verified 2026-10-07 on a purpose-built two-scene fixture (tools/form-dev/test_blender_softgl.py): 9.2 s,
not "too slow". The earlier attempt used deck df41e681539e, which has no live three.js in it at all.`

## 3. `FIXLOG.md` item 10 (around line 260)

**Replace:** `10. Real software-GL (swiftshader) finalize (still capture); CTX_RESET 150k is a guess: measure
ctxTokens over a real 8-slide run (C).`

**With:** `10. ~~Real software-GL (swiftshader) finalize~~ DONE 2026-10-07, see the batch 6 spec Part C. CTX_RESET
150k is still a guess: measure ctxTokens over a real 8-slide run (C).`

## 4. `FIXLOG.md` L-16, last sentence

**Replace:** `**Still not verified:** a finalize under software GL (AURA_BROWSER_ARGS=--use-angle=swiftshader).`

**With:** `**Verified 2026-10-07** (batch 6 Part C): a full finalize on SwiftShader, and the silent-blank failure it
was meant to catch is now a hard stop.`

## 5. `SURVEY.md` around line 1145

The fix it asks for — "before release, do one end-to-end finalize on a software-GL machine" — is done. It can be
marked closed, with the note that the fix that mattered was not the software GL but the readiness signal.
