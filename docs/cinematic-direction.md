# Cinematic direction — what the owner wants, and what has to be true first

Written 2026-10-07 from the owner's brief. **A direction document, not a spec to implement yet.** Every number
here is measured from the owner's real deck (`docs/deck-b45622-postmortem.md`) or from probes in this repo.

## The brief

- **Slides 1 and 2 carry the most effort** — the opening is where attention is highest.
- **~70% of slides have 3D; ~70% of those are animated.**
- **Charts, data and graphs described creatively in 3D**, not as flat plots.
- **Movie-like transitions and cinematics.**
- Import whatever tools help (Remotion was named; Pinterest for idea extraction).

---

## 1. The arithmetic decides the architecture

A 14-slide deck at 70% 3D is 10 3D slides; 70% animated is **7 animated slides**.

| path | cost for those 7 |
|---|---|
| per-frame Cycles (what ships today) | **11.4 hours of GPU** |
| bake once, play in three.js, capture | **9.3 minutes** |
| | **74x** |

Measured inputs: a 100-frame 720p 64 spp Cycles loop took **5,873.7 s** on the owner's deck; the bake probe
measured **61.3 s** for a final bake; finalize captured a 200-frame loop in **18.24 s**.

**Conclusion: the baked motion pipeline (`docs/blender-batch6-spec.md` Part B) stops being an optimisation and
becomes the thing that makes this brief possible at all.** Nothing else on the backlog unlocks as much. Stills
are fine either way — a Cycles still is ~90 s, so 3 stills cost 4.5 minutes — it is animation that explodes.

**Blocked on:** Part C's preconditions (verify a real software-GL finalize, add a fallback, make capture failure
loud) and the one open design problem — `L.section()`'s screen-aligned hatch, which bakes glued to the surface.
The `threejs-shaders` / `threejs-postprocessing` references (MIT, see section 6) are exactly that knowledge.

---

## 2. What is already bundled and unused

`engine/node_modules/three` is at **0.186.1** — the release that added **built-in Gaussian Splatting** — and the
full post-processing suite is present and wired to nothing: `EffectComposer`, `BloomPass`, `BokehPass`,
`FXAAPass`, `AfterimagePass`, `DotScreenPass`.

So the first cinematic step costs no new dependency: a per-look post stack of bloom -> depth of field -> tone
map -> FXAA. Research consensus is that bloom alone is the highest-impact single effect for 3D on the web.

---

## 3. Slides 1 and 2 as the hero pair

Formalise what the owner asked for, and keep it honest about *why* it works: **contrast creates impact.** If
every slide is spectacular, none is. Spending the effects budget on the opening and letting the middle be calm
is the same principle that makes a film's opening shot land.

Concretely: slides 1-2 get the full stack (volumetric light, depth of field, a longer bake, the deck's best
figure); the body gets clean 3D without post; the closing echoes slide 1 so the deck frames itself.

This should be a rule in the shared look base, not a per-deck decision — and it needs the interview to know
whether this is a thesis defence or a product launch, because the answer changes.

---

## 4. 3D charts — the one place to be careful

**3D for impact and metaphor; never 3D for reading a value.** A perspective-projected bar chart distorts the
comparison it exists to make — the far bar is smaller because it is far, not because it is less. On a thesis
slide that is not style, it is a misread waiting to happen, and it cuts against the B-05 provenance system that
exists to keep numbers honest.

What works instead, and is genuinely striking:
- data as **physical objects** in a real scene (the actual fins, sized by the measured value);
- **extruded ribbons** over a flat baseline, read against a 2D axis that stays true;
- **particle or flow fields** for processes (heat, air, current) where the point is behaviour, not magnitude;
- a 3D **establishing** figure that then resolves into a clean 2D chart for the actual numbers.

The last one is the pattern worth standardising: **cinematic to establish, flat to measure.**

---

## 5. Movie-like transitions

Lumi has no inter-slide transition system today. What the research calls "directed motion" is the goal:
transitions that carry meaning, not decoration. Candidates that fit the existing architecture:
- **match cut** — the subject holds position across a slide change while everything else swaps;
- **camera continuation** — slide 2's camera starts where slide 1's ended, so the deck feels like one space;
- **reveal by light** rather than by opacity;
- shared-element morphs for the one object a deck keeps returning to.

Camera continuation is the strongest and the cheapest: it needs the look base to record where each 3D slide's
camera ended, nothing more.

---

## 6. Tools — verdicts

| tool | verdict |
|---|---|
| **three.js post-processing** | **Adopt now.** Already bundled, unused, no new dependency. |
| **Gaussian splatting** (r186 built-in) | **Adopt for the user's OWN photos.** A phone video of their real rig becomes a photoreal orbitable scene. No presentation tool does this. Caution: raw captures are 80-400 MB, `.ksplat` streams much smaller — measure before committing, decks are ~2 MB today. |
| **`CloudAI-X/threejs-skills`** (MIT, no keys) | **Adopt selectively, on the DEVELOPER side only** — `threejs-shaders`, `threejs-postprocessing`, `threejs-loaders`. Do **not** put them in `workspace/.claude/skills/aura-slide/`: the deck-building Claude is deliberately given a narrow curated API (`BB3D`, `FP3D`) and told not to read `studio3d.js`. General three.js knowledge there would erode that on purpose. |
| **`kevinbadi/blender-skills`** | **Reject.** Drives a GUI Blender over MCP/WebSocket, which tears through the headless `permit.js` gate; needs a paid Meshy key; **licence unspecified**, so it cannot be bundled. The one good idea in it — photo to 3D — is better served by splatting. |
| **Remotion** | **Prototype before adopting.** It is a React video renderer, and Lumi already has deterministic seek-based capture that does the same job. Its declarative time-to-frame model suits *transitions* well, but it is a heavy dependency for something the existing pipeline may already cover. One real slide decides it. |
| **Pinterest for idea extraction** | **Use as reference, never as asset.** Mining visual references to shape a look's figure idioms is legitimate and useful (this project already has a `design-inspiration` skill). Pulling images into a deck is a copyright and provenance problem, and the same objection applies to any web-fetched photo: it is unattributed content landing in a thesis. Restrict deck assets to the user's own uploads. |

---

## 7. The tension that needs an owner decision

Everything above makes a **product launch** stunning and can make a **thesis figure dishonest**. Bloom blows out
an error bar; depth of field hides the part of a figure a number was read from; a 3D bar chart distorts the
comparison. Lumi's B-05 provenance system exists precisely to stop numbers being presented as more certain than
they are.

The resolution is almost certainly **per look, chosen from what the interview already learns**: a cinematic look
with the full stack, Bold Blue staying clinical, Flat-Pack staying diagrammatic. The interview already asks how
cautious the claims must be and what the audience must do afterwards — that is enough to pick.

**Do not make the effects global.** A thesis deck that looks like a film trailer is a worse thesis deck.

---

## 8. Order of work

1. **The post stack** — bloom, DOF, tone map, FXAA, per look. A day on code already shipped. Biggest visible gain per hour.
2. **Baked motion (batch 6 Part B + C preconditions)** — the thing that makes 70% animated possible at all.
3. **Camera continuation between slides** — cheap, and it is what makes a deck feel authored.
4. **Hero rule for slides 1-2** in the look base.
5. **3D chart idioms** — "cinematic to establish, flat to measure" written into the shared base.
6. **Gaussian splatting** of the user's own rig — the genuinely novel one.
7. Remotion prototype, only if 3 and 5 leave a gap.
