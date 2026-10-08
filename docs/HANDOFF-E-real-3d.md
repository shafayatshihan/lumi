# Part E — the 3D must be real, and the camera must move like a camera

You are in **`X:\aura-slide-by-shafayat`**, the source for **Lumi**, a Windows app that builds presentation decks
with headless Claude Code. v0.5.10 is published. **Four other sessions are working in this repo right now** — read
the ownership section.

Owner: S. M. Shafayat Islam. Short, plain replies. Not a beginner. **This is the most important of the five
parts** — it decides whether a Lumi slide looks like a research figure or like clip art.

**First: `engine/node_modules` is gitignored and the repo was just re-cloned, so it is missing.** Run
`npm install` in `engine/` — you will need three.js.

---

> ## THIS IS SYSTEM-WIDE. ALL FIVE LOOKS.
>
> The owner saw the bad figure in a **Clay Pop** deck, so the screenshots are Clay Pop - but the instruction is
> not: *"the changes that I told you to make are for all the themes, not only clay pop, mind it, its system
> wide."*
>
> Everything below applies to **Bold Blue, Pink Punch, Flat-Pack, Happy Headspace and Clay Pop**. The realism
> doctrine, the camera moves, the camera sway, the real materials: every look, every 3D figure, every
> illustration.
>
> **The home for a system-wide rule is `looks/_shared/LOOK-BASE.md`**, which every look inherits - not a single
> look's `LOOK.md`. Then each `LOOK.md` says only how its own aesthetic expresses the rule. If you find yourself
> writing the same paragraph into five files, it belongs in the base.
>
> **Realistic in STRUCTURE, thematic in SURFACE.** That is the whole reconciliation. A finned heat exchanger has
> the real fin count and the real pitch in all five looks; it is a Cycles aluminium render in Bold Blue, matte
> clay in Clay Pop, a flat axonometric sheet in Flat-Pack, a two-pass screen print in Pink Punch, and a soft-lit
> form in Happy Headspace. The geometry is the truth; the surface is the brand. **No look gets to be vague
> because it is stylised.**
>
> **A correction you need, because I got this wrong first time.** The picture-mix numbers in
> `hard-rules.json` -> `pictureMix` used to be named `blenderAnimatedPct` / `blenderStillPct`, which made them
> meaningless for three of the five looks: `LOOK_3D` has Flat-Pack, Pink Punch and Happy Headspace as **threejs,
> never Blender**, by design. They are now `animated3dPct` / `still3dPct` / `illustrationPct` /
> `opening3dAnimatedSlides` - the share of slides carrying a 3D figure, with **the look choosing the engine**.
> Same counts in every look. `planning.md` is reworded to match. Keep it that way.

## E1. The complaint, and the standard

Building a real thesis deck, Lumi produced a 3D figure the owner called *"unrealistic 3d models, totally out of
contexts"*. In the screenshot it is a bright orange block with cartoon cloud puffs floating around it, standing in
for a finned heat exchanger in a rear-door AI server cooler. It is a toy of the thing, not the thing.

The owner's standard, in their words:

> *"make a rule so that every 3d model, illustration is real, real material, no cartoonish, no analogy, depth,
> layered in detail, complex geometric overlays to mimic real life models, but real experimental, scientific
> model, that follows real equations and rule just like bold blue but thematic, aesthetic of their own."*

Unpack that into rules a building Claude can actually follow:

- **The real object, at its real proportions.** A finned heat exchanger has a countable number of fins at a real
  pitch, real tube diameters, a real header. If the brief gives dimensions, the model uses them.
- **Real materials.** Aluminium is aluminium — `lumi_bpy.PRESETS` already has steel, aluminium, cast iron,
  titanium, copper, brass, chrome, glass, ceramic, rubber, plastic, paint and now clay. Use them.
- **No analogy, no mascot, no cartoon stand-in.** Clouds for airflow is an analogy. Arrows, streamlines, a
  particle field driven by the real flow direction are not — they are notation.
- **Depth and layered detail.** Fillets, bevels, fasteners, a section cut, a cutaway showing what is inside. The
  existing helpers do this: `bevel()`, `cutaway()`, `section()`, the cavity and edge-wear terms.
- **It follows the real equations.** Where motion or a field is shown, it comes from the physics the deck is
  about, not from a sine wave that looks lively. LOOK-BASE already has `motion: "simulation"` for exactly this.
- **Each look keeps its own aesthetic.** Bold Blue is the benchmark for *rigour*, not for appearance. Clay Pop
  stays matte clay; Pink Punch stays a screen print. **Realistic in structure, thematic in surface.**

Bold Blue's `LOOK.md` section 4 and `LOOK-BASE.md` 4.1/4.2 ("Use the REAL counts and the REAL dimensions", the
fidelity rules) already say much of this — **the gap is that it is not binding on the other looks and not
enforced anywhere.** Your job is to make it a rule every look inherits, with teeth.

**Where to put it:** `workspace/.claude/skills/aura-slide/looks/_shared/LOOK-BASE.md` is the shared base every
look obeys — that is the right home. **Additive edits only**: other sessions are reading this file, so add a
section, do not renumber existing ones. Consider what `deck_check.js` could realistically check (a 3D slide whose
scene uses no real material preset? a figure with no dimensions traced to the brief?) — a rule nobody checks is
a suggestion, and the owner has now been let down twice by suggestions.

## E2. Camera sway, and many camera setups

The owner: *"every 3d shall have camera sway and many camera setups."*

Today a 3D slide is mostly one static or gently orbiting camera. What they want is a camera that behaves like a
real one — a slow drift on a still, and a named repertoire of moves to choose from per slide.

The owner wants **all 17 skills from `kevinbadi/blender-skills` integrated**. Their copy is at
**`C:\Users\shafa\Downloads\blender-skills-main\blender-skills-main`**; a clone is also at
`X:\lumi-refs\blender-skills`. Read them there.

**I classified all 17 against what Lumi can actually run.** Lumi drives Blender **headless**
(`blender -b -P scene.py`, gated by `permit.js`); these skills were written for a **GUI Blender driven over
MCP/WebSocket**, which Lumi does not have and `permit.js` would refuse.

| skill | verdict |
|---|---|
| `crane-shot`, `dolly-rotate`, `slow-zoom`, `perfect-loop`, `dynamic-full-loop` | **Port these.** Plain `bpy`: an empty as target, `camera_add`, a `TRACK_TO` constraint, `lens = 45`, keyframed height and distance. Standard Blender, and `lumi_bpy` already has the pieces. |
| `turntable` | **Port.** `lumi_bpy.turntable()` exists; take their easing and framing defaults as a cross-check. |
| `threejs-export` | **Already built, better.** Lumi has `lumi_bake.py` + `bake-player.js` + the GLB/meshopt path. Read theirs, keep ours. |
| `product-polish` | **Partly.** The glossy studio-look recipe is portable; its Meshy import is not. |
| the five `polyhaven-*` | **Do these — the owner has granted network access for them (see E3).** Real HDRI lighting and real PBR textures are the single biggest lever on E1's realism. They fetch through the blender-mcp addon we do not have, so Lumi fetches them its own way. |
| `blender-toolkit` | **Cannot.** WebSocket to a running GUI Blender. |
| `image-to-3d`, `multi-image-to-3d` | **Cannot.** Paid Meshy API key and a network service. |

So "integrate all of them" lands as: **port the six camera moves and the polish recipe, make a decision on
PolyHaven, and write down why four cannot run.** Put that verdict in `docs/STATUS-E.md` so nobody re-litigates it.

**On the licence, once - then it is the owner's call, and they have made it.** The repo has no `LICENSE` file:
not in the clone, not in the owner's download, and GitHub's own licence detection returns `NO LICENSE`. The owner
believes it is MIT; I could not find that anywhere. In practice this barely matters for the work: a `TRACK_TO`
constraint and a keyframed camera rise are standard Blender boilerplate, not authored IP, and you are writing
Lumi's own implementations against `lumi_bpy` rather than copying files. **Do not copy their files into the
repo.** Credit them in a comment wherever you take a technique or a default - that is right regardless of licence.

Two constraints that are absolute:

1. **Determinism.** `finalize.js` screenshots one frame per `seek(t)` and needs `seek(t)` twice to give identical
   pixels. Camera sway must be a pure function of `t` — **no `performance.now()`, no `Math.random()`, no frame
   counter**. `engine/deck/lib/post.js`'s header explains the contract and why `AfterimagePass` is refused by
   name; read it. A loop must also close: `seek(0)` and `seek(period)` identical.
2. **Sway is seasoning.** A camera that wanders makes a measured figure hard to read and makes text swim. Small,
   slow, and off by default on anything carrying numbers — the same honesty gate that governs post
   (`post-policy.js`, LOOK-BASE 4.7) should govern camera motion.

There is already a camera-continuation system (slide N+1 can start where slide N ended, declared in markup as
`data-camera` / `data-camera-from`) — `docs/STATUS-CINEMATIC.md` describes it. **Build on it, do not duplicate
it.**

## E3. Internet access — scoped, because the gate it replaces is a real one

The owner has asked for Lumi to be given internet access so PolyHaven assets can be fetched. **Do not implement
that by loosening `engine/rules/permit.js`.**

Line 51 of that file denies `curl`, `wget`, `Invoke-WebRequest`, `scp`, `ssh`, `nc`, `certutil` and the rest, with
the reason *"Lumi keeps decks offline: Claude has no network commands here."* That rule is what stops a Claude
that has been confused, or prompt-injected by a downloaded file, from uploading the person's unpublished thesis
or pulling down something executable. It runs with `--permission-mode acceptEdits` on the owner's own machine.
Widening it to make asset fetching convenient is exactly the failure the brief for every other part warns about.

**Build it as a narrow Lumi toolkit fetcher instead.** `permit.js:303` already allows node/python running a
script that lives in the toolkit folder, so this needs **no change to the gate at all**:

- `engine/tools/fetch_asset.py` (new, yours). Claude may call it; Claude still has no network commands.
- It talks to a **hardcoded allowlist of hosts** — PolyHaven's API and its CDN, nothing else. The host list is in
  the script, not in an argument, so a prompt cannot redirect it.
- It takes an **asset id and a type**, validates them against a strict pattern, and refuses anything else. No
  free-form URLs as input.
- It writes into a **local cache** (`.aura/temp/assets/`), checks the content type and magic bytes, and accepts
  only images and `.hdr`/`.exr`. Never an archive, never anything executable.
- **Upload is impossible by construction**: the script only GETs.
- Offline is normal, not an error: a cache miss with no network falls back to the built-in materials in
  `lumi_bpy.PRESETS` and says so in one plain line.

**The packed deck stays offline, and this is the part not to get wrong.** The fetch happens at **build time**;
the assets end up baked into textures and the GLB by `lumi_bake.py`. A finished deck is still one offline HTML
file with no CDN and no network — that contract (`LOOK-BASE 4.5`, and the reason `post.js` re-implemented
EffectComposer by hand) does not change. If a slide would need a live fetch to render, the design is wrong.

Write the policy you implement into `docs/STATUS-E.md`, and put any `permit.js` change you believe is genuinely
unavoidable into `docs/REGISTER-E.md` with its reasoning — do not make it yourself.

## Where it lives

- `engine/deck/blender/lumi_bpy.py` — `camera()` (`:858`), `studio()` (`:734`), `PRESETS`/`mat()` (`:502`),
  `loop()`, `spin()`, `turntable()`, `animate()`
- `engine/deck/looks/bold-blue/studio3d.js`, `engine/deck/looks/<look>/*3d.js` — the per-look figure engines
- `workspace/.claude/skills/aura-slide/looks/_shared/LOOK-BASE.md` and each look's `LOOK.md`
- `workspace/.claude/skills/aura-slide/looks/bold-blue/BLENDER.md` — the Blender guidance Claude reads

---

## What you own

- `engine/deck/**` (blender, lib, looks)
- `workspace/.claude/skills/aura-slide/**` — **LOOK-BASE.md additively only**
- `tools/form-dev/test_blender*.py`, `tools/form-dev/test_post.mjs`

**Do not touch:** `engine/form/**` (**Parts A, B, C**), `engine/form_server.py` (**Part B** — use
`docs/REGISTER-E.md`), `engine/tools/extract_text.py` (**Part D**), `RESUME.md`, `BACKLOG.md`, `FIXLOG.md`, the
rest of `docs/`.

Yours in docs: `docs/CLAIM-E.md`, `docs/STATUS-E.md`, `docs/REGISTER-E.md`.

---

## Rules

1. **Never commit, push, tag, publish, or bump the version.**
2. **Never touch `C:\Lumi`** except to read.
3. **Do not vendor `blender-skills`** — no licence. Reference only; write our own.
4. **No new runtime dependency reaches a deck.** A packed deck is one offline HTML file: no CDN, no network, no
   add-on ES modules (they are not packed — that is why `post.js` re-implemented EffectComposer by hand).
5. **Ask before running `test_server.py`**. `test_blender_*.py` are yours; they need a sandbox with an
   `.aura\engine` junction — an empty folder gives false failures.
6. **Sandboxes in `X:\aura-dev-e\`**, never inside the repo.
7. **Render it and look at it.** This part is *entirely* about whether a picture is convincing, and no test can
   tell you that. Build the owner's actual case — a finned heat exchanger for AI server cooling — and compare it
   honestly with the orange block it replaces.

## Report

10 lines to the owner, with before/after pictures of one real figure. `docs/STATUS-E.md` as you go, including the
rule text you added to LOOK-BASE and what, if anything, the checker now enforces. Say plainly anything in this
brief that turns out to be wrong when you read the code.

Claim it first: `docs/CLAIM-E.md`.
