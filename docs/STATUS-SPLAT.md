# STATUS — Package C: photo-to-3D of the user's own apparatus

Session: 2026-10-08. Owner of this file: the Package C session (see `docs/CLAIM-SPLAT.md`).
Every number below came from something that was run on this machine. Nothing here is estimated.

---

## VERDICT: **REJECT** Gaussian splatting for Lumi decks.

Not "not yet" — reject, on three independent grounds, each of which is on its own sufficient.
Fixing any one of them does not rescue the other two.

| # | ground | measured finding |
|---|---|---|
| 1 | **Capture** | WebGPU does not exist in the browser `finalize.js` launches. No flag turns it on. A splat slide would hard-fail the build. |
| 2 | **Input** | Producing a `.splat` needs COLMAP + a CUDA trainer. `permit.js` forbids installing either, and the owner's only CUDA GPU is a 2 GB MX350 — below the practical floor. |
| 3 | **Size** | The `.splat` format is **32 bytes per splat**, fixed. The smallest usable scene is ~16 MB raw / ~21 MB base64-inlined, against a **2 MB** deck. |

**Route (b) — writing a WebGL splat renderer inline — does not change this verdict.** It would solve
ground 1 only. Grounds 2 and 3 are upstream of the renderer and kill the feature regardless of how
the splats get drawn. That is the single most important finding in this document: the work the
direction doc treats as the hard part (the renderer) is the *only* part that was ever tractable.

**Replacement recommended: a photo turntable of the user's own orbit footage.** Same promise —
"your rig, filmed by you", photoreal, orbitable — at 0.8–2.6 MB, with no new renderer, no WebGPU,
and trivially deterministic capture. Details in §5. **Not built: it needs the owner's go-ahead and
it touches files owned by other packages.**

---

## 1. The brief's own premise, re-verified

`docs/HANDOFF-splat.md` §1 is **correct in every particular**. I re-checked each line rather than
inheriting it:

- `engine/node_modules/three` is **0.186.1** ✓
- It ships `examples/jsm/objects/GaussianSplat.js`, `gpgpu/CountingSort.js`,
  `utils/GaussianSplatUtils.js`, `loaders/{SPLAT,KSPLAT,GaussianSplatPLY}Loader.js`,
  `loaders/GLTFGaussianSplatLoaderExtension.js` ✓
- `GaussianSplat.js:14` imports from `three/webgpu`, `:43` from `three/tsl` ✓
- Lumi renders with `THREE.WebGLRenderer` — `engine/deck/runtime.js:184` ✓
- `pack_deck.py` `add_three()` inlines only `three.module.js` + `three.core.js` as data URLs ✓

The brief's self-correction stands. I found nothing wrong with it.

---

## 2. Ground 1 — it cannot be captured (and no flag fixes it)

`engine/tools/lib/deckpage.js:78` launches Chromium through `playwright-core`, channel `msedge`
then `chrome`. I probed `navigator.gpu` in that exact launcher.

**Every combination tried, on both channels:**

| launch | `navigator.gpu` | WebGL2 renderer |
|---|---|---|
| default (what `finalize.js` uses first) | **absent** | ANGLE / Intel Iris Xe / D3D11 |
| `SOFT_GL_ARGS` (the fallback at `finalize.js:133`) | **absent** | ANGLE / SwiftShader |
| `--enable-unsafe-webgpu` | **absent** | — |
| `--enable-features=WebGPU` | **absent** | — |
| `--enable-features=WebGPU,Vulkan` + `--enable-unsafe-webgpu` | **absent** | — |
| the same, on the `chrome` channel | **absent** | — |
| `--use-webgpu-adapter=swiftshader` (+ unsafe flags) | **absent** | — |
| headed, not headless | **absent** | — |
| headed, `--disable-field-trial-config` removed | **absent** | — |

Edge/Chrome **154.0.0.0**. It is not Playwright's doing: I read its switch list
(`playwright-core/lib/coreBundle.js`, `disabledFeatures`) and **WebGPU is not among the features it
disables**. Something in the automated-launch path suppresses it and no documented flag restores it.

**And the same machine's own Edge has WebGPU and works:**

```
STUDENT BROWSER (plain Edge, no automation):
   {"gpu":true,"adapter":"intel / gen-12lp","device":true}
```

So the failure mode is the worst-shaped one available: **the slide would look fine to the person who
built it and destroy the build.** `finalize.js:120-147` is explicit — a 3D holder that does not draw
triggers a full relaunch on SwiftShader, and if it still does not draw:

> `throw new Error(...did not draw, even with Lumi's software renderer. Nothing was written.)`

**No HTML, no PDF, exit 1.** One splat slide kills the whole deck. The fallback that exists to rescue
a weak GPU is precisely the path WebGPU cannot survive, exactly as the brief predicted.

Probes: `X:\aura-dev-splat\probe-webgpu.js`, `probe-headed.js`, `probe-clean.js`, `probe-enable.js`,
`probe-real-browser.js`.

### The byte cost, measured anyway, for the record

Bundled with the repo's own rolldown + minify settings (same as `engine/tools/three_min.js`),
base64'd as `pack_deck.add_three()` does:

| bundle | minified | base64, in-deck |
|---|---|---|
| `three.module` — **what decks carry today** | 0.71 MB | **0.94 MB** |
| `three.webgpu` | 1.04 MB | 1.39 MB |
| `three.webgpu` + TSL + `GaussianSplat` + both loaders | 1.09 MB | **1.45 MB** |

So route (a) is **+0.51 MB** — and `three.webgpu.js` does export `WebGLRenderer`, so it could replace
the current module rather than sit beside it. **Size was never route (a)'s problem.** I measured it
so the owner knows the cheap-looking option was rejected on capture, not on bytes.

Measured by `X:\aura-dev-splat\measure-bytes.js`. Deck baseline from the three real decks in
`C:\Lumi\.aura\decks`: **1.51, 2.01, 2.13 MB** (read-only; nothing there was touched).

---

## 3. Ground 2 — nobody can produce the input

The brief suspected this was the real wall. It is, and it is worse than suspected.

**Nothing in three produces a splat file.** The five loaders *load* one. Making a `.splat` from a
phone video is camera-pose recovery (COLMAP or equivalent) followed by training a Gaussian model —
a separate toolchain, CUDA-only in every practical implementation.

**It cannot be installed from inside Lumi, by design.** `engine/rules/permit.js` denies:
- all network fetch — `curl|wget|iwr|irm|bitsadmin|certutil|scp|ssh|ftp|nc|...` (line 51)
- all package managers — `npm|npx|pip|pipx|uv|conda|winget|choco|scoop|...` (line 54)
- all nested shells and `start-process` (lines 52–53)

and allows exactly: `node`/`python`/venv-python running a script inside the toolkit, plus Blender in
one narrow form. A splat trainer is a new binary outside that gate. **Rule 3 of the brief says not to
widen it, and widening it is not needed here — I am not asking for it.**

**And the owner's hardware cannot train one.** Measured on this machine:

```
Intel(R) Iris(R) Xe Graphics        (integrated, no CUDA)
NVIDIA GeForce MX350   AdapterRAM = 2,147,483,648   (2 GB)
```

The MX350 is CUDA-capable (Pascal) but has **2 GB of VRAM**. Reference 3DGS training wants 8–24 GB.
The one machine this was going to be demonstrated on cannot run the step the feature depends on.

So the honest answer to the brief's question 3 — *"what software, how long, on what hardware"* — is:
**COLMAP plus a CUDA trainer, neither bundleable through the permit gate, on a GPU the owner does not
have.** That is a product fact, not a README footnote, which is why it is at the top of this file.

---

## 4. Ground 3 — it does not fit, and the format says so

Not an estimate and not a guess at compression: `SPLATLoader.js:8` fixes the wire format.

```js
const ROW_SIZE_BYTES = 32;   // center, scale, color and rotation per splat
```

32 bytes per splat, exactly, and `pack_deck` must base64 it (×1.333) because a packed deck is one
offline HTML file.

| scene | splats | raw | base64, in-deck | vs a 2 MB deck |
|---|---|---|---|---|
| small object, low quality | 500 k | 16 MB | **21.3 MB** | ×10 |
| one piece of apparatus, usable | 1 M | 32 MB | **42.7 MB** | ×21 |
| apparatus + its corner of the lab | 2 M | 64 MB | **85.3 MB** | ×43 |

`.ksplat` quantizes and is genuinely smaller, but it would need to beat **10:1** merely to bring a
single 1 M-splat slide down to ~4 MB — still more than doubling the whole deck for one slide. The
brief asked for a measured `.ksplat` number on a real scene; **I could not produce one, because of
§3 — there is no way on this machine to train a scene to measure.** I am recording that as a gap
rather than quoting a figure I did not measure, which is the failure mode this package exists to
correct.

The ×10 floor is enough to decide. Even an unrealistically good `.ksplat` does not reach 2 MB.

---

## 5. What to do instead — a photo turntable of the user's own orbit

**Not built. Proposed, priced, and waiting on the owner.**

The owner's actual goal (`HANDOFF-splat.md` §3) is that a student shows **the real rig** rather than
a guessed model. Splatting is one way to get that. It is not the only way, and it is the most
expensive one by a wide margin.

**The student films one slow orbit of the rig on their phone.** Lumi takes N frames from that video
and the slide becomes a drag-to-rotate turntable. Checked against the four questions that killed
splatting:

1. **Renders in a packed deck?** It is `<img>` swapping. No three.js, no WebGPU, no renderer at all.
2. **Survives capture?** `seek(t)` picks frame `floor(t·N)` — an integer index into an array. Byte-
   identical by construction, on the GPU path and on SwiftShader alike, because nothing is drawn.
3. **Can a person produce the input?** They already did: it is the video. Frame extraction is the
   only step, and it is arithmetic on something Lumi already accepts as an upload.
4. **Does it fit?** Measured on this machine — a real JPEG re-encoded at slide sizes:

| frame size | quality | per frame | 16 frames | 24 frames | 36 frames |
|---|---|---|---|---|---|
| 1280×720 | 0.72 | 85 KB | 1.77 MB | 2.65 MB | 3.98 MB |
| 960×540 | 0.72 | 56 KB | **1.17 MB** | 1.75 MB | 2.63 MB |
| 720×405 | 0.72 | 40 KB | **0.83 MB** | 1.24 MB | 1.86 MB |

(base64-inlined, as packed. `X:\aura-dev-splat\measure-turntable.js`.)

**Honest caveat on those numbers:** the source was `engine/form/themes/2-bold-blue.jpg`, a rendered
theme image, because no photograph of a rig exists on this machine to test with. Photographic
content at the same quality usually compresses *worse* — treat these as a lower bound and re-measure
on a real orbit before committing to a frame count. **A 16-frame half-orbit at 960×540 is the config
I would start from: ~1.2 MB, one slide, roughly what one bundled font costs.**

What it gives up against splatting: no free viewpoint (an orbit ring, not a flyable camera), no
relighting, no depth compositing with the 3D scene. What it keeps: the entire honesty argument,
which was the point. It is the user's real apparatus, photographed, and it cannot claim more than it
can support — which is what B-05 provenance is for.

**It is not mine to build.** Video upload and type handling live in `engine/form_server.py`
(Package A / clay look), and frame extraction would be a new tool plus a slide kind. Both are in
`docs/REGISTER-SPLAT.md` as proposals. **I did not write a line of it, because the verdict comes
first and the verdict is the owner's call.**

---

## 6. Things in the direction documents that are wrong

Asked for explicitly by the brief. Beyond the `three/webgpu` error it already corrects:

1. **`docs/cinematic-direction.md` §6 and `HANDOFF-work-queue.md` Package C both say the conversion
   step is a detail.** It is the feature's hard wall (§3). The documents name the renderer as the
   risk and never mention COLMAP, training, CUDA or VRAM at all.
2. **"Adopt for the user's OWN photos" understates what is needed.** Splatting needs a *video orbit
   or a dense photo set with recoverable poses*, not photos. A student with six snapshots of their
   rig has nothing a trainer can use. If the turntable ships, the copy must ask for a slow orbit and
   say why.
3. **The brief's hope that `CountingSort` being GPU-side and worker-free makes capture deterministic
   is true but irrelevant.** I confirmed there is no worker in `GaussianSplat.js`'s sort path — and
   it does not matter, because the WebGPU device the sort runs on never exists under capture (§2).
   Worth recording so nobody re-derives it as a reason to retry route (a).

---

## 7. Files

**Created (mine, per `docs/CLAIM-SPLAT.md`):**
- `docs/CLAIM-SPLAT.md`
- `docs/STATUS-SPLAT.md` — this file
- `docs/REGISTER-SPLAT.md`

**Created under `X:\aura-dev-splat\` (sandbox, outside the repo, per rule 5):**
- `probe-webgpu.js`, `probe-headed.js`, `probe-clean.js`, `probe-enable.js` — the WebGPU matrix
- `probe-real-browser.js` — the student's own Edge
- `measure-bytes.js` — rolldown bundle + base64 sizes
- `measure-turntable.js` — JPEG cost per orbit frame

**Nothing was created under `engine/`.** No `engine/deck/lib/splat*` exists and none should: the
verdict is reject, and the brief is right that a well-evidenced no is the deliverable.

**Nothing owned by another package was edited.** `pack_deck.py` needed no change in the end — the
import-map work the brief flagged as "the big one" is not required by a rejection. One proposal for
it is in the register file in case the owner overrules this verdict.

**Not run:** the full test suites, per rule 4. Nothing I did needed them — no engine file changed.

**Status: complete.** Verdict delivered, measurements behind it, no production code by design.
Open item for the owner only: whether to build the §5 turntable.
