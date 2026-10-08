# Brief for a Claude account: photo-to-3D of the user's own apparatus (Package C)

You are in **`X:\aura-slide-by-shafayat`**, the source for **Lumi** — a Windows app that builds presentation decks
with headless Claude Code. **Six other Claude sessions are working in this repo right now**, so the file-ownership
section is binding, not advisory.

Owner: S. M. Shafayat Islam. Short, plain replies, no wasted tokens. Not a beginner.

---

## 1. Read this before anything else: the premise of this package is broken

`docs/cinematic-direction.md` §6 and `docs/HANDOFF-work-queue.md` Package C both say:

> *"`engine/node_modules/three` is **0.186.1** — the release that added **built-in Gaussian Splatting**... Adopt for
> the user's OWN photos. No presentation tool does this."*

**That is half true, and the false half kills the plan as written.** Verified in this repo on 2026-10-07:

| claim | reality |
|---|---|
| three 0.186.1 is installed | **True.** |
| It ships Gaussian splatting | **True.** `examples/jsm/objects/GaussianSplat.js` (1039 lines), `loaders/{KSPLATLoader,SPLATLoader,GaussianSplatPLYLoader}.js`, `utils/GaussianSplatUtils.js`. |
| Lumi can use it | **No.** `GaussianSplat.js:14` imports from **`three/webgpu`** and `:43` from **`three/tsl`**. It is a WebGPU + node-material implementation. |
| Lumi's renderer | **`THREE.WebGLRenderer`** — `engine/deck/runtime.js:184`. Not WebGPU. |
| "no new dependency" | **False.** `engine/tools/pack_deck.py:346-364` inlines exactly two modules as data URLs: `three.module.js` and `three.core.js`. Not `three.webgpu.js`, not TSL, not any `examples/jsm` add-on. LOOK-BASE 4.5 states the rule outright: *"no add-on imports (they will not be packed)"* — and that is precisely why `post.js` re-implemented EffectComposer's maths inline rather than importing it. |

**And there is a second blocker the direction document never mentions at all.** Those loaders *load* a splat
file. Nothing in three produces one. Turning a phone video into a `.splat` / `.ksplat` means camera-pose recovery
(COLMAP or equivalent) plus training a Gaussian splat model — an external toolchain, typically GPU-hours per
scene, that would have to ship inside a Windows installer alongside Blender. **The conversion step, not the
renderer, is probably the real wall.**

**I wrote those documents and I got this wrong. Do not work around it quietly — that is the whole point of this
brief.**

---

## 2. So what the job actually is

**Decide, with evidence, whether Lumi should do photo-to-3D at all — and build it only if the answer is yes.**

A well-evidenced **"no, and here is why, and here is what to do instead"** is a complete and valuable outcome of
this package. It is not a failure. What is a failure is three days of work on a path that was never going to pack,
render, or capture.

Produce the verdict **first**, in `docs/STATUS-SPLAT.md`, before writing production code. Prototype freely in
`X:\aura-dev-splat\` to get the measurements — but measure, do not estimate.

### The four questions the verdict must answer, with numbers

1. **Can it render in a packed deck?** A packed Lumi deck is **one offline HTML file**. Three routes, pick one and
   justify it:
   - **(a) Pack the WebGPU build.** Extend the import map to carry `three.webgpu.js` + TSL + the add-on graph, and
     run that one holder on a `WebGPURenderer`. Measure the added bytes — the whole deck is ~2 MB today.
   - **(b) Write a WebGL splat renderer inline**, the way `post.js` re-implemented EffectComposer. Precedented in
     this repo, and the maths is public, but it is real work: sorted alpha-blended billboards with a per-frame
     depth sort.
   - **(c) Reject splatting**, and say what replaces it (photogrammetry to a conventional mesh is the obvious
     candidate — it packs as glTF, which Lumi already handles).
2. **Can it survive capture?** This is where it most likely dies, so test it early. `finalize.js` screenshots one
   frame per `seek(t)` in headless Chromium and needs `seek(t)` twice to produce **identical pixels**. Two
   specific hazards:
   - **Sorting.** Splats must be depth-sorted every frame. three's implementation uses a GPU `CountingSort` (no
     web worker, which is good news — a worker-based sorter would be asynchronous and therefore non-deterministic
     under seek). Verify the sort is deterministic for a given camera. **Byte-identical screenshots or it fails.**
   - **WebGPU in headless, and the software fallback.** Package A landed a capture-health gate today: if a 3D
     holder does not draw, finalize relaunches the whole deck on **SwiftShader** (software GL) and, if that fails
     too, **stops at exit 1 with no HTML and no PDF**. If your slide needs WebGPU, it will most likely fail on
     exactly the fallback path that exists to rescue it — turning one fancy slide into a dead build. Test
     `finalize.js` on SwiftShader with a splat slide **before** you commit to route (a).
3. **Can a person actually produce the input?** Walk the whole path a real student would: phone video → poses →
   training → `.ksplat`. What software, how long, on what hardware, and can it be bundled or scripted at all? If
   the honest answer is "they must install COLMAP and run a trainer for two hours", say so — that is a product
   decision for the owner, not something to hide in a README.
4. **Does it fit?** Raw captures are **80–400 MB**; decks are ~2 MB. `.ksplat` is much smaller — **measure it**,
   on a real scene, at a quality that still looks good. Give the owner a number per slide.

### The hard limit that is not negotiable

**Only the user's own uploads.** A web-fetched or AI-generated image is unattributed, possibly licensed, and would
land in someone's thesis. The whole B-05 provenance system exists to stop figures claiming more than they can
support. If this ships, it ships as *"your rig, filmed by you"* and nothing else.

---

## 3. Why the owner wants it anyway

Worth holding onto while you evaluate: this is the one genuinely novel thing on the list. A student presenting a
thesis currently gets a *guessed* model of their apparatus. A photoreal, orbitable capture of the **real rig**
shows what was actually there — which is both more honest and more impressive than anything a modelling pass can
invent. No presentation tool does it.

That is why it is worth a careful verdict rather than a quick no. But it is not worth a dead build.

---

## 4. FILE OWNERSHIP — six other sessions are live in this repo

**Yours:**
- new files under `engine/deck/lib/splat*`
- new files you create under `engine/tools/` (new files only — **not** existing ones)
- `docs/CLAIM-SPLAT.md`, `docs/STATUS-SPLAT.md`, `docs/REGISTER-SPLAT.md` — the only files in `docs/` you may write

**Do not edit — someone else is in them. Route every change through `docs/REGISTER-SPLAT.md`:**
- `engine/tools/pack_deck.py` — **you will almost certainly need the import map changed. This is the big one.**
  Write the exact diff into the register file.
- `engine/tools/finalize.js`, `engine/tools/lib/deckpage.js`, `engine/deck/runtime.js`, `engine/deck/blender/**`,
  `engine/deck/lib/bake*` — **Package A** (`docs/CLAIM-A.md`), actively changing
- `engine/deck/lib/post.js`, `post-policy.js`, `engine/deck/looks/bold-blue/studio3d.js`,
  `workspace/.claude/skills/aura-slide/looks/_shared/LOOK-BASE.md` — **Package B** (`docs/CLAIM-CINEMATIC.md`)
- `engine/form_server.py` — Package A and the clay look. **The upload/type handling for a video input lives here**,
  so that part of your work is register-only too.
- `engine/form/**` — the copy pass and the waiting game
- `engine/deck/looks/**`, `engine/deck/themes/**`, `engine/rules/**`
- `installer/Lumi.cs`, `engine/form.ps1`
- `RESUME.md`, `BACKLOG.md`, `FIXLOG.md`, `CLAUDE.md`, everything else in `docs/`

This package is unusually register-heavy. That is expected: nearly everything it needs lives in a file someone
else owns. **Write precise snippets with the file and the exact location** — the coordinator applies them.

---

## 5. Rules that apply without exception

1. **Never commit, push, tag or publish. Never bump the version.** v0.5.5 is live; the coordinating session owns
   all git. Safety commit `564a273`; full backup at `X:\lumi-backup-20261007-212954\`.
2. **Never touch `C:\Lumi`** except to read. That is the owner's live install with their real decks in it.
3. **Never weaken `engine/rules/permit.js`.** It is the security gate around headless Claude. Widening it to make
   something convenient is a failure, not a fix. If your conversion step needs to run a binary, that is a design
   question for the owner, not a hole to open.
4. **Do not run the full test suites** (`test_server.py`, `test_frontend.py --e2e`, `test_permissions_real.py`).
   Two sessions testing on one machine produce phantom failures — this already cost hours: 1288/1295 on one run, a
   different five on the next, none of them real. **`node --check` and real renders are expected.**
5. **Never create a sandbox inside the repo.** One was committed by accident. Use `X:\aura-dev-splat\`.
6. Write files with the **Write tool**, not bash heredocs — backslashes get mangled on Windows.
7. **No new runtime dependency reaches a deck.** A packed deck is one offline HTML file with no CDN and no
   network. A build-time tool is a separate conversation — raise it, do not assume it.
8. **Measure, never estimate.** Every number in your verdict comes from something you actually ran. The document
   you are correcting is proof of what estimates are worth here.

---

## 6. Report back, in two places

**To the owner:** 10 lines or fewer, and lead with the verdict — **adopt, adopt-with-caveats, or reject** — then
the four numbers (deck bytes, capture result, input path, file size per slide), then what you built, if anything.
If you reject it, say what to do instead.

**To a file, because the coordinating session cannot see your messages:**

```
X:\aura-slide-by-shafayat\docs\STATUS-SPLAT.md
```

The verdict goes here first, before any production code, with the measurements behind it. Then keep it current:
done, in progress, blocked, files created. That file plus `docs/REGISTER-SPLAT.md` are the entire handover — write
them for someone who has never spoken to you.

And — worth more than the code — **anything else in these documents that turns out to be wrong when you read the
repo.** Six agents have found real errors in them already, including the one this brief exists to correct.

**Claim it first.** Before your first edit, create `docs/CLAIM-SPLAT.md` with the time you started and one line on
your plan, so the other six sessions know this is taken.
