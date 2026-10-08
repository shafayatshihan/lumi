# Part F — the slides that are NOT 3D: real vector illustration

You are in **`X:\aura-slide-by-shafayat`**, the source for **Lumi**, a Windows app that builds presentation decks
with headless Claude Code. v0.5.10 is published. **Five other sessions are working in this repo right now** — read
the ownership section.

Owner: S. M. Shafayat Islam. Short, plain replies. Not a beginner.

**First: `engine/node_modules` is gitignored and the repo was just re-cloned, so it is missing.** Run
`npm install` in `engine/`.

---

## Why this part exists

The picture mix (`hard-rules.json` -> `pictureMix`) is **30% animated 3D / 40% still 3D / 30% illustration**.
Part E owns the 3D. **Nobody owns the other 30%**, and the owner said plainly: *"not all slides will use 3d."*

Right now "illustration" in Lumi means a chart or whatever 2D the building Claude improvises into the slide's
canvas. There is no illustration *system*: no vocabulary of layouts, no house drawing style per look, nothing
that makes a non-3D slide look as considered as a rendered one. That is the gap.

## F1. What the owner asked to install, and what it actually is

The owner asked for:

```
npx -y skills add NousResearch/hermes-agent --skill baoyu-article-illustrator --agent claude-code
```

I looked into it. Three facts worth having before you start:

1. **`NousResearch/hermes-agent` is MIT** (confirmed via GitHub's licence field). Unlike `blender-skills`, this
   one **can** be used and shipped **with credit**. The repo is **1.1 GB**, which is why a plain clone hangs —
   fetch single files over `raw.githubusercontent.com` instead.
2. **There is no `baoyu-article-illustrator` skill.** The nearest is **`skills/creative/baoyu-infographic`**.
3. **`baoyu-infographic` is the wrong tool for Lumi, and you should say so rather than wire it in.** It is a
   prompt-builder for a *raster image generator*: it assembles a text prompt and calls an `image_generate` tool,
   producing `infographic.png`. That fails Lumi four ways — it is **not vector** (the owner asked for vector), it
   needs an **image model Lumi does not have and cannot reach offline**, its port notes say **Linux/macOS only**,
   and an invented picture of a heat exchanger is exactly the "unrealistic, totally out of context" complaint
   that created Part E. **Do not ship a diffusion model into a thesis deck.**

   **What IS worth taking from it:** its **45 MIT reference files — 21 layouts × 21 styles**. The layout taxonomy
   is real information-design knowledge and maps straight onto Lumi's slides: `binary-comparison` is the owner's
   plain-vs-wavy-fins slide, `linear-progression` is "four steps, three climbed", plus
   `comparison-matrix`, `hierarchical-layers` and the rest. Port the **taxonomy as composition guidance** for
   Lumi's own SVG drawing. Credit 宝玉 (JimLiu), `JimLiu/baoyu-skills`, MIT.

4. **The one to actually model yourself on is `skills/creative/architecture-diagram`** (MIT, Cocoon AI). Its own
   description: *"No external tools, no API keys, no rendering libraries — just write the HTML file."* It emits
   **inline SVG inside HTML**, which is precisely what a Lumi slide already is. Its dark tech aesthetic is wrong
   for us, but its shape is exactly right.

Both are saved at **`X:\lumi-refs\hermes\`**.

## F2. What to build

**A Lumi-native vector illustration system**, in the same spirit as Part E's 3D doctrine, and bound by the same
rule: **realistic in structure, thematic in surface.**

- **Inline SVG, drawn in code.** It packs into the one offline HTML file, scales at any stage size, stays crisp
  in the PDF, and can be inspected and corrected. No raster, no generated images, no network.
- **A layout vocabulary**, adapted from the baoyu taxonomy: comparison, progression, hierarchy, matrix, cycle,
  part-to-whole. Claude picks the layout from what the slide has to say.
- **Per-look drawing style, one shared structure.** Flat-Pack already proves the idea with `FP3D` — an
  orthographic assembly sheet with flat fills and inverted-hull outlines, because an instruction manual *is*
  that. Each look needs the same for 2D: Bold Blue clean and clinical, Pink Punch a hard-outlined screen print,
  Happy Headspace soft and round, Clay Pop tactile. **The shared rules go in
  `looks/_shared/LOOK-BASE.md`; only the surface goes in each `LOOK.md`.**
- **It must obey the same honesty rules as everything else.** An illustration that carries numbers is bound by
  B-05: every number traced in `provenance.json`, no invented quantities, no decorative axis. Read
  `engine/tools/lib/claims.js` before you draw anything with a value on it.
- **Text in an SVG is still text**: the 14 stage-px floor and the contrast rules apply inside the drawing, and
  `deck_check.js` must still be able to see it.

**Coordinate with Part E.** You own the 2D half of the same question E owns the 3D half of. Agree one shared
section in LOOK-BASE rather than two that drift — talk through `docs/REGISTER-F.md` and `docs/STATUS-E.md`.

## What you own

- new files under `engine/deck/lib/` for the SVG illustration helpers (do not collide with E's `*3d.js`)
- the 2D/illustration sections of each look's `LOOK.md`, and **additive** edits to `LOOK-BASE.md`
- `workspace/.claude/skills/aura-slide/` illustration guidance, including a credited port of the layout taxonomy

**Do not touch:** `engine/form/**` (Parts A, B, C), `engine/form_server.py` (B), `engine/tools/extract_text.py`
(D), `engine/deck/blender/**` and the `*3d.js` figure engines (E), `RESUME.md`, `BACKLOG.md`, `FIXLOG.md`, the
rest of `docs/`.

Yours in docs: `docs/CLAIM-F.md`, `docs/STATUS-F.md`, `docs/REGISTER-F.md`.

## Rules

1. **Never commit, push, tag, publish or bump the version.**
2. **Never touch `C:\Lumi`** except to read.
3. **No new runtime dependency reaches a deck.** One offline HTML file, no CDN, no add-on ES modules.
4. **Ask before running `test_server.py` or the e2e** — several sessions are live.
5. **Sandboxes in `X:\aura-dev-f\`**, never inside the repo.
6. **Credit what you port.** MIT needs the notice kept: 宝玉 (JimLiu) for the layout taxonomy, Cocoon AI for the
   SVG-in-HTML pattern. A comment at the top of the file is enough, and it is not optional.
7. **Render it and look at it.** Draw the owner's real case — plain versus wavy fins — and judge it beside a
   Bold Blue 3D slide. If the illustration looks like filler next to the renders, it is not done.

## Report

10 lines to the owner, with one real illustrated slide. `docs/STATUS-F.md` as you go. Say plainly anything in
this brief that turns out to be wrong when you read the code.

Claim it first: `docs/CLAIM-F.md`.
