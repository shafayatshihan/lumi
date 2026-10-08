# REGISTER — Package C changes to files owned by other sessions

From the Package C session, 2026-10-08. Verdict and evidence: `docs/STATUS-SPLAT.md`.

**Read this first: the verdict is REJECT, so there is nothing here the coordinator must apply.**
This file is not a queue of pending edits. It is two things:

- **§A** — the `pack_deck.py` change the brief called "the big one", written out exactly, **so that
  it is on record as unnecessary**. Apply only if the owner overrules the verdict.
- **§B** — the change set the recommended replacement would need, **if** the owner says to build it.

Nothing in either section should be applied without the owner deciding first. I edited no file
belonging to another package.

---

## §A — `engine/tools/pack_deck.py`: the import-map change, and why it is not needed

**Do not apply.** Recorded because the brief asked for the exact diff and because the next session to
read `cinematic-direction.md` §6 will reach for it.

The change itself is small and works. The reason to skip it is `STATUS-SPLAT.md` §2: WebGPU does not
exist in the browser `finalize.js` launches, on either channel, under any flag, so a slide that needs
it fails the capture-health gate at `finalize.js:120-147` and the build exits 1 with no HTML and no
PDF. Packing the module correctly does not make it render.

**Location:** `engine/tools/pack_deck.py`, in `add_three()` (around line 346–364), after the
`imports['three'] = ...` line and before `return self.insert_importmap(html, imports)`.

```python
        # Gaussian splatting (three 0.186 examples/jsm/objects/GaussianSplat.js) is a WebGPU + TSL
        # implementation: it imports the bare names 'three/webgpu' and 'three/tsl', which a data URL
        # cannot resolve unless the import map carries them too.
        if self.needs_webgpu(html):
            wgpu, tsl = THREE_DIR / 'three.webgpu.js', THREE_DIR / 'three.tsl.js'
            if not (wgpu.is_file() and tsl.is_file()):
                raise PackError('this deck needs three.js WebGPU build, which is missing from .aura/engine.')
            # three.webgpu.js imports ./three.core.js by relative path, same as three.module.js does
            wgpu_src = re.sub(r'([\'"])\./three\.core\.js\1', r'\1three/core\1', wgpu.read_text(encoding='utf-8'))
            imports['three/webgpu'] = 'data:text/javascript;base64,' + b64(wgpu_src)
            tsl_src = re.sub(r'([\'"])\./three\.webgpu\.js\1', r'\1three/webgpu\1', tsl.read_text(encoding='utf-8'))
            imports['three/tsl'] = 'data:text/javascript;base64,' + b64(tsl_src)
```

plus a detector beside `needs_three()` (around line 335), following its existing discipline — strip
`<script src>` tags and comments first, so a commented-out example never pulls in a megabyte:

```python
    def needs_webgpu(self, html):
        """True when the deck's own code imports the WebGPU build or a splat object/loader."""
        live = re.sub(r'<script\b[^>]*\bsrc\s*=[^>]*>\s*</script>', '', html, flags=re.I)
        live = re.sub(r'<!--.*?-->|/\*.*?\*/', '', live, flags=re.S)
        live = re.sub(r'(?m)^\s*//.*$', '', live)
        return bool(re.search(r'[\'"]three/(webgpu|tsl)[\'"]|GaussianSplat|KSPLATLoader|SPLATLoader', live))
```

**Notes for whoever applies it, if anyone ever does:**
- `b64` and `re` are already in scope in `add_three()`; `THREE_DIR` is already imported.
- The `three.core.js` rewrite is required: `three.webgpu.js:6` imports `./three.core.js` relatively,
  exactly as `three.module.js` does, and the existing code already maps that to the bare name
  `three/core`. Reuse that entry rather than adding a second copy of core — it is 1.46 MB raw.
- `three.tsl.js:6` imports `three/webgpu`, which the map now carries, so it needs no rewrite in
  principle — the `re.sub` above is belt-and-braces for a relative spelling and is a no-op otherwise.
- **Measured cost if applied:** `three.webgpu` + TSL + `GaussianSplat` + both loaders minifies to
  1.09 MB and base64s to **1.45 MB**, against **0.94 MB** for the `three.module` decks carry today —
  **+0.51 MB**, since `three.webgpu.js` also exports `WebGLRenderer` and can replace the current
  module outright rather than sit beside it. Bytes were never the reason to reject route (a).
- `minified_three()` (line ~366) would also need a WebGPU-aware variant, or the raw path forced, or
  the minified `three` entry will shadow the WebGPU one. This is the fiddly part, not the map.

---

## §B — the photo turntable, if the owner approves it

`STATUS-SPLAT.md` §5. Same promise as splatting — the student's real apparatus, orbitable, photoreal
— at **~1.2 MB** for a 16-frame half-orbit at 960×540, with no new renderer and capture that is
deterministic by construction. **Needs the owner's yes before any of this is written.**

### B.1 `engine/form_server.py` — accept a video upload *(Package A / clay look)*

The brief flags this file as register-only, and the upload/type handling for a video input lives
here. Needed: accept `.mp4`/`.mov` for a new input kind, alongside the existing image types.

I deliberately did not write this diff. The verdict is reject-and-replace, the replacement is
unapproved, and a speculative patch to a file two other packages are actively editing is exactly
the kind of churn the ownership section exists to prevent. If the owner approves §B, I will write
it against the then-current file rather than against a snapshot that will be stale by then.

### B.2 New tool: `engine/tools/extract_orbit.py` *(mine to write — new file)*

Video → N JPEG frames at a fixed size and quality. Within my ownership (`new files you create under
engine/tools/`), so it needs no register entry; listed here only so the change set reads whole.

**One real design question for the owner, not for me:** frame extraction wants ffmpeg, and
`permit.js` allows only `node` / `python` / venv-python running toolkit scripts, plus Blender. Three
honest options, in the order I would pick them:

1. **Decode in the browser.** The deck build already drives Chromium. A page can draw a `<video>`
   into a canvas at N timestamps and hand back JPEGs — no new binary, nothing added to the permit
   gate, and it reuses the capture machinery that already exists. **Recommended.**
2. **Decode in Blender.** Blender is bundled and already permitted, and its sequencer can read video.
   It fits the existing gate, but it is a strange tool for the job and the permitted Blender form is
   narrow (`blender -b -P <scene.py> -- ...`).
3. **Bundle ffmpeg.** Cleanest technically, but it is a new binary in the installer and a new entry
   in the permit gate. **Per rule 7 this is a conversation to have, not an assumption to make** —
   and per rule 3 I am not proposing to widen `permit.js`.

Option 1 needs no permit change at all, which is why it is first.

### B.3 New slide kind: `engine/deck/lib/orbit.js` *(mine to write — new file under engine/deck/lib/)*

A drag-to-rotate `<img>` swapper that registers with `LumiCapture` like any other loop slide, with
`seek(t)` resolving to `frames[Math.floor(t * N) % N]`. No three.js, no GL context, no sorting.
It is byte-identical under repeated `seek(t)` because it draws nothing — it assigns a `src`.

Capture integration touches `engine/deck/runtime.js` (Package A). Whether a slide kind can register
with `LumiCapture` without a runtime change is the one thing I have not verified, because the verdict
made it moot. **Flagged as an open question, not an answer.**

---

## §C — for the coordinator, in one line

Nothing to apply. Package C is complete and its answer is **reject**; the only open item is the
owner's decision on §B. `docs/STATUS-SPLAT.md` is the document to read, and §6 of it lists three
further errors in `cinematic-direction.md` and `HANDOFF-work-queue.md` that outlive this package.
