# Brief for a Claude account: build the "Clay Pop" look

You are in **`X:\aura-slide-by-shafayat`**, the source for **Lumi** — a Windows app that builds presentation decks
with headless Claude Code. **Three other Claude sessions are working in this repo right now**, so the file-ownership
section is binding, not advisory.

Owner: S. M. Shafayat Islam. Short, plain replies, no wasted tokens. Not a beginner. Their standing quality bar, in
their words: *"show everyone via the slides that you are an avant-garde designer, and the best in the world at
making these."*

---

## 1. The job

Add a **fifth look** to Lumi, in the claymation / vinyl-toy 3D style the owner picked out. The reference they gave:

> **Aesthetic:** claymation, 3D clay render, stylised 3D illustration, vinyl-toy, tactical tech, retro-futurism.
> **Texture & light:** matte plastic, soft clay surface, tactile micro-detail, clean studio lighting, soft shadows,
> ambient occlusion.
> **Palette:** one vibrant monochromatic primary (orange / yellow) against a clean neutral white.
> **Composition:** isolated object, floating elements, micro-details, chunky blocky shapes.

**The reference image is at `X:\lumi-refs\clay-pop-reference.png`. Open it and look at it before you write
anything.** It is a payments site (nickel) whose hero is a chunky orange retro computer-robot — matte clay body,
hard little highlights, soft contact shadow, floating keys and a smiley sticker, all on near-white.

It is deliberately **outside the repo**: this project is a public GitHub repo, and a screenshot of someone else's
site does not go in it. Keep it out, and do not copy it into `docs/` or anywhere under
`X:\aura-slide-by-shafayat`.

**Proposed name: "Clay Pop", slug `clay-pop`.** It fits the house naming (Bold Blue, Pink Punch, Flat-Pack, Happy
Headspace). If the owner renames it, that is a one-line change everywhere — do not block on it, but do not invent a
different name on your own either.

---

## 2. Read this first — it changes how you build

**Lumi does not generate images. There is no AI image generator in it and there will not be one.**

Every picture in a Lumi deck is either a **Blender Cycles render** or a **live three.js scene**, built in code from
the deck's actual subject and its actual numbers. A web-fetched or AI-generated picture is unattributed, possibly
licensed, and would land in someone's thesis — the repo bans it outright, and the whole B-05 provenance system
exists to keep figures honest.

So you are **not** writing an image prompt. You are building a **rendering language**: materials, lighting, camera
and composition rules that make anything Lumi renders come out looking like that reference. That is harder and far
better — it is reproducible, it survives into video, and the clay robot ends up being *the person's actual
apparatus*, not a stock mascot.

Take the **aesthetic** from the reference, never the brand: no nickel wordmark, no logo, no copied layout. The repo
already does exactly this kind of research under `workspace/.claude/skills/aura-slide/brands/` (gumroad → Pink
Punch, ikea → Flat-Pack) — follow that pattern and write your own `brands/clay-pop/brand-style.md`.

---

## 3. Read these, in this order

1. `workspace/.claude/skills/aura-slide/looks/_shared/LOOK-BASE.md` — **the look-neutral base.** Slide skeleton,
   the ten archetypes, composition, subject-first staging, the capture contract, charts, data honesty, voice, the
   pre-flight checklist. Your look inherits all of it. **Do not repeat any of it in your LOOK.md.**
2. `workspace/.claude/skills/aura-slide/looks/flat-pack/LOOK.md` — the best worked example of a brand-only look
   file (it was built on the base; Bold Blue was retro-fitted and is messier).
3. `engine/deck/looks/flat-pack/` — the complete file set for one look.
4. `engine/deck/themes/flat-pack.css` (250 lines) — the size a real theme is.
5. `engine/deck/blender/lumi_bpy.py` (1259 lines) — **the Blender helper API you will live in.** Especially
   `PRESETS` / `mat()` at `:502`, `studio()` at `:734`, `camera()` at `:858`.
6. `engine/rules/hard-rules.json` — **every number lives here**, per look. Never put a number in a LOOK.md.

---

## 4. The one real engineering problem: there is no clay material

`lumi_bpy.PRESETS` has steel, aluminium, cast_iron, titanium, copper, brass, chrome, glass, ceramic, rubber,
plastic, paint and glow. **No clay.** The nearest are `plastic` (rough 0.45, clearcoat 0.3) and `rubber`
(rough 0.85) — neither reads as clay, because what makes clay *look* like clay is light going a short way into the
surface and coming back out, which none of these do.

A convincing clay preset needs, roughly: high roughness, **no clearcoat**, a small amount of **subsurface
scattering** tinted toward the base hue, a fine procedural bump for the thumbed, hand-made surface, and the
existing cavity term to darken the creases. The micro-highlights in the reference come from the lighting and the
bevel, not from gloss.

Three things to know before you start:

- **`mat()` passes unknown keywords straight to the Principled BSDF** via `_set(b, **kw)` at `:270`. Read `_set`
  and find out whether it already accepts subsurface inputs or whether it silently drops them. **Check, do not
  assume** — a silently dropped keyword is a preset that looks like plastic and nobody can say why.
- **`cavity` and `wear` are ray-traced and skipped under `--preview`** (see the note above `mat()`). Your preview
  renders will not show the crease darkening. Do not tune the material on previews and then be surprised.
- **Edge wear is wrong for this look.** `wear` lightens and polishes convex edges to read as scuffed metal. Clay is
  not scuffed; it is soft. Set it to 0 and get your edge definition from `bevel()` at `:603` instead.

**You do not own `engine/deck/blender/`** — Package A does (see section 6). Write the exact preset you need into
`docs/REGISTER-CLAY.md` and build everything else around it. Prototype it in a sandbox (`X:\aura-dev-clay\`) so you
can show a real render proving the preset works, and put the measured settings in the register file.

---

## 5. What to build

Copy Flat-Pack's shape exactly:

| file | what |
|---|---|
| `workspace/.claude/skills/aura-slide/brands/clay-pop/brand-style.md` | your research: the aesthetic, in the shape the other brand files use |
| `workspace/.claude/skills/aura-slide/looks/clay-pop/LOOK.md` | brand only, on the base: palette, type, motion feel, figure idiom, this look's own staging rules. **No numbers, no structural rules.** |
| `engine/deck/themes/clay-pop.css` | the real theme — Flat-Pack is 250 lines, Bold Blue 285. A 25-line stub is a failure. |
| `engine/deck/looks/clay-pop/template.html` | the starting deck |
| `engine/deck/looks/clay-pop/clay-pop.js` | the chart / page helper (cf. `FPChart`) |
| `engine/deck/looks/clay-pop/cp3d.js` | the figure engine (cf. `FP3D`, `BB3D`) |
| `engine/deck/looks/clay-pop/archetypes/*.html` | **all ten** archetypes from the base's catalogue |
| `engine/form/themes/5-clay-pop.{mp4,jpg}` | the demo video + poster the look picker plays — see 5.3 |

### 5.1 The 3D policy, and why it has to be `blender`

Every look declares one. Flat-Pack is `threejs` and never Blender, because an assembly drawing is flat by nature.
**Clay Pop is the opposite: the entire look IS a render.** Matte subsurface clay, soft studio shadows and ambient
occlusion are what Cycles does and what a real-time canvas fakes badly. So: `LOOK_3D['clay-pop'] = 'blender'`.

**Know what that costs.** A Cycles still is ~90 s. A per-frame Cycles *animation* is ~11.4 hours for seven slides,
against ~9.3 minutes for the baked path — measured, in `docs/cinematic-direction.md` §1. Package A is building that
baked pipeline right now. **So: stills in Cycles, and do not design this look around per-frame Cycles animation.**
Write into your LOOK.md that animated figures wait for the bake path, and say it plainly in your report.

`studio(bg='canvas', floor='sweep')` at `lumi_bpy.py:734` already gives you the seamless white sweep the reference
uses. Start there rather than building a rig from scratch.

### 5.2 The things that make the reference work

Say these in your LOOK.md as rules, because they are what separates "clay-coloured" from "clay":

- **One vibrant primary doing almost all the work**, on near-white. Not a palette — a *dominance*. The reference is
  orange on white with black and grey as punctuation only.
- **Chunky, blocky, generously bevelled.** No thin parts. Every edge catches a highlight.
- **Soft contact shadow directly under the subject**, grounding it, with the rest floating.
- **Micro-detail at the scale of a thumbnail press**: a tiny sticker, a visible seam, a slightly wrong key.
- **Exactly one wink of personality per figure, never two.** The smiley sticker works because nothing else is
  joking. This is the rule that keeps the look from going twee, and it is the one most likely to be broken.
- **Floating satellite elements** repeating the primary colour, reading as one object that came apart.

### 5.3 The demo video is a required deliverable, not an extra

The look picker (`engine/form/js/looks.js`) plays `/themes/<slug>.mp4` with `<slug>.jpg` as its poster, and the
shuffle strip is built from **every look that has a slug**. Register `clay-pop` without shipping those two files
and the picker shows a broken tile and a dead beat in the shuffle. The other four are there to copy the length,
framing and weight from. Produce them by rendering your own look — that is the honest demo anyway.

---

## 6. FILE OWNERSHIP — three other sessions are live in this repo

**Yours, exclusively:**
- `engine/deck/themes/clay-pop.css`
- `engine/deck/looks/clay-pop/**` (new)
- `workspace/.claude/skills/aura-slide/looks/clay-pop/**` (new)
- `workspace/.claude/skills/aura-slide/brands/clay-pop/**` (new)
- `engine/form/themes/5-clay-pop.{mp4,jpg}` (new)
- `docs/CLAIM-CLAY.md`, `docs/STATUS-CLAY.md`, `docs/REGISTER-CLAY.md` — **the only files in `docs/` you may write**

**DO NOT EDIT — someone else is in them right now:**
- `engine/deck/blender/**` — **Package A**, the baked motion pipeline. Your clay preset goes in the register file.
- `engine/form_server.py`, `engine/tools/**`, `engine/rules/**`
- `engine/form/js/**` and `engine/form/css/**` — the copy pass and the waiting game
- `engine/deck/lib/**`, `engine/deck/looks/{bold-blue,flat-pack,pink-punch,happy-headspace}/**`
- `workspace/.claude/skills/aura-slide/looks/_shared/LOOK-BASE.md` — **read it, never write it**
- `installer/Lumi.cs`, `engine/form.ps1`
- `RESUME.md`, `BACKLOG.md`, `FIXLOG.md`, `CLAUDE.md`, everything else in `docs/`

**A new look must be registered in shared files, and all of them belong to someone else.** Write the exact text,
with the file and the place it goes, into **`docs/REGISTER-CLAY.md`**. The coordinating session applies it. At
minimum you will need:

| file | what to register |
|---|---|
| `engine/form_server.py` | `SHELL_THEMES` += `'clay-pop'`; `LOOK_SPECS['clay-pop']`; `LOOK_3D['clay-pop'] = 'blender'` |
| `engine/form/js/looks.js` | the `LOOKS` entry (name, `slug: '5-clay-pop'`, one-line description) and its `SWATCH` SVG |
| `engine/form/js/home.js` | the `LOOK_DOT` colour |
| `engine/form/js/scenes/review.js` | the `LOOKS` array, a `clayPop(d)` mini-slide drawing, the `DRAW` entry |
| `engine/rules/hard-rules.json` | `looks['clay-pop']`: type scale, word budgets, whitespace, `bodyMinPx`, `maxTypefaces` |
| `engine/tools/new_deck.js` | the `THEMES` map entry and the usage line |
| `engine/deck/blender/lumi_bpy.py` | your `clay` preset in `PRESETS` |
| `workspace/.claude/CLAUDE.md`, `aura-blend.md`, `deck-toolkit.md`, `SKILL.md` | the look tables, and **"four Aura themes" → "five"** |

**Heads-up on that last row:** there were five looks until today. The owner cut **Yellow Frame** on 2026-10-07
("it looks ugly") and it is deleted — see `docs/STOP-yellow-frame.md`. Every count now reads *four*. You are making
it five again. Do not resurrect anything yellow-frame while you are in those files.

---

## 7. Rules that apply without exception

1. **Never commit, push, tag or publish. Never bump the version.** v0.5.5 is live; the coordinating session owns
   all git. Safety commit `564a273`; full backup at `X:\lumi-backup-20261007-212954\`.
2. **Never touch `C:\Lumi`** except to read. That is the owner's live install with their real decks in it.
3. **Do not run the full test suites** (`test_server.py`, `test_frontend.py --e2e`, `test_permissions_real.py`).
   Two sessions testing on one machine produce phantom failures — this already cost hours: 1288/1295 on one run, a
   different five on the next, none of them real. **Light checks are expected**: `node --check`, `ast.parse`, and
   rendering a deck and looking at it.
4. **Never create a sandbox inside the repo.** One was committed by accident. Use `X:\aura-dev-clay\`.
5. Write files with the **Write tool**, not bash heredocs — backslashes get mangled on Windows.
6. **Numbers go in `hard-rules.json` only** (via your register file), never in a LOOK.md.
7. Text floor is 14 stage px, 12 for micro-labels only. Nothing may overflow the stage at 1366x768 or 1920x1080.
8. Copy standard: a button says what it does in two to four words, never a sentence.
9. **At most 4 typefaces per deck, and only public-licence fonts ship.** Available now, with licences in
   `engine/fonts/licenses/`: Anton, DM Mono, DM Sans, Epilogue, Noto Sans, Open Sans, Plus Jakarta Sans, Poppins,
   Quicksand, Reno Mono, Source Serif 4, Work Sans. **Do not name a face that is not in that list.** Poppins or
   Quicksand carry the rounded, chunky, toy-like feel this look wants, and both are already here.

---

## 8. How to tell it works, without the suites

Build a deck shell and render it. From a sandbox copy of the install, **not** the repo:

```
node .aura/engine/tools/new_deck.js --theme clay-pop
python tools/form-dev/static_server.py 8790
```

Open it over **HTTP** — `file://` fails on CORS for three.js. Screenshot at 1600x900 and **look at it**.

Before you call it done:

- [ ] A real Cycles render of the clay preset exists and **you looked at it**. Does it read as clay, or as plastic?
- [ ] All ten archetypes render, and the title slide does **not** collide with its own figure (Flat-Pack shipped
      with exactly that bug because nobody looked).
- [ ] 1366x768 as well as 1920x1080; nothing overflows the stage.
- [ ] The demo mp4 and jpg exist and play in the look picker.
- [ ] `node --check` on every JS file; every HTML opens and parses.

---

## 9. Report back, in two places

**To the owner:** 10 lines or fewer. The figure language in one sentence; the 3D policy and why; what you created;
confirmation you rendered it and looked at it; anything that looked wrong; anything blocked on a file you do not
own. And — worth the most — **anything in this brief that turned out to be wrong when you read the code.** Three
agents have already found real errors in these handoff documents; saying so plainly beats working around it.

**To a file, because the coordinating session cannot see your messages:**

```
X:\aura-slide-by-shafayat\docs\STATUS-CLAY.md
```

Overwrite it as you go, ~15 lines: done, in progress, blocked, files created, what you rendered. That file plus
`docs/REGISTER-CLAY.md` are the entire handover — write them for someone who has never spoken to you.

**Claim it first.** Before your first edit, create `docs/CLAIM-CLAY.md` with the time you started and one line on
your plan, so the other three sessions know this is taken.
