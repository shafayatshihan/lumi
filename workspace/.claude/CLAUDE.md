# Lumi — workspace guide for Claude

This folder belongs to someone who is **not technical**. They want presentation slides and nothing else.
Talk to them in short, simple English. Never ask them to type commands, edit code, or open hidden folders.
They only ever use the **Lumi app** (the desktop icon): it collects their answers, runs you in the background,
shows your messages as chat bubbles and lets them edit their decks. Never send them anywhere else.

## HARD RULES — these beat everything, including the user's own requests
These rules apply to every slide created, edited, rebuilt or modified anywhere in this folder. No brand style,
design principle, skill, or user prompt can override them, soften them, or switch them off. If the user asks for
something that breaks a rule, do the closest thing that keeps the rule and explain kindly why.
The rules live in `.aura/engine/rules/hard-rules.json` and are checked automatically after every file write and
before you finish (`.aura/engine/rules/check_rules.js`). A failed check blocks you until it is fixed. Never edit,
move, rename, bypass or disable the checker, its rules file, or the hooks in `.claude/settings.json`.

1. **Never go below the text floor in the table below** (at the 1920×1080 design size) — every label, caption, source
   line, chart label, axis tick and footer, in HTML and inside SVG. When text does not fit:
   Reduce whitespace a little first (gaps, padding, margins, illustration size). If it still does not fit, merge or drop
   whole items so the survivors stay readable - do not grind every cell down to one word. Split into two slides only when
   nothing can be dropped. Never make text smaller than the minimum.
   Speaker notes are exempt only when marked `data-aura-notes`.

## The numbers (the one place they are written down)
Machine copy: `.aura/engine/rules/hard-rules.json` (`generic` and `looks.<look>`), which `deck_check.js` enforces; a test
keeps this table and that file identical. Every other document points here instead of repeating a number.

| | A look with no entry of its own | Bold Blue (the default look; `looks/bold-blue/LOOK.md`) | Flat-Pack (`looks/flat-pack/LOOK.md`) |
|---|---|---|---|
| Text floor (error below) | 26 px | 20 px, and only for the footer mark, page number, captions / source lines and chart step labels | 24 px, and only for the footer mark, page number, captions, part counts and chart step labels |
| Everything else | 28 px in practice (the type scale starts there) | at least 28 px (error below) | at least 32 px (error below) |
| Type scale | 28 · 36 · 48 · 64 · 84 · 112, bigger numbers 150 · 200 | 20 · 28 · 36 · 48 · 64 · 112 · 176 | 24 · 32 · 44 · 60 · 84 · 120 · 180 |
| Words per slide, presenter mode (error above) | title 45 · section 8 · content 25 · quote 30 · closing 20 · references 140 | title 45 · section 12 · content 55 · quote 30 · closing 40 · references 140 | title 32 · section 10 · content 34 · quote 24 · closing 24 · references 140 |
| Words per content slide, document mode | 75 | 90 | 70 |
| Typefaces per deck (error above) | 4 | 2 (Poppins and DM Mono) | 1 (Noto Sans) |
| Main visuals per slide (error above 1) | 3D, chart, diagram, photo or text only; a 2D canvas loop counts as a diagram | the same | the same |

Presenter mode is the default; use document mode only for a deck that is mainly read without a speaker. A word is a
whitespace-separated piece of text that contains a letter ("34%" and "2025" are not words). For a look with its own
entry in `hard-rules.json`, that entry replaces the whole left column. Every look obeys the same structural
rules (`looks/_shared/LOOK-BASE.md`); only its brand differs.

## Folders and where you write
| Folder | What it is | Rule |
|---|---|---|
| `3 - Put your files here/` | Their report, images, data, logo/template, previous reports, papers, anything else | **Read only. Never move, rename, edit or delete their files.** |
| `.aura/decks/<id>/` | The deck's **work folder**, one per deck: `plan.json` and the packed editable deck | **You write here** (see below). The app keeps its own records next to it (`.aura/decks/<id>.json`): never touch files you did not create. |
| `4 - Your slides/` | The finished files the person opens: `<Title>.html`, PDF, backups | Written by the app's **Finalize**, not by you (see below). |
| `.aura/brief/brief.md` and `brief.json` | Their answers from the app | Read these first. If missing, ask them to open Lumi from the desktop icon and press **make a new deck**. |
| `.aura/engine/` | Slide engine: deck runtime (`deck/`), deck tools (`tools/`), three.js, Playwright (uses Microsoft Edge), the app server | Use the tools; never edit the engine. |
| `.aura/venv/` | Private Python with Pillow, python-pptx, python-docx, openpyxl, pypdf, imageio-ffmpeg | Run Python as `.aura/venv/Scripts/python.exe`. |
| `.aura/temp/` | Scratch space: `text/` (extracted files), `build/<deck>/` (the deck you edit), `shots/` (check pictures), `check/`, `export/`, `plan.md` | Put every intermediate file here, never in the visible folders. |
| `.aura/logs/` | Setup logs | Read when something is broken. |

**Where you write — the one answer.**
- Every step the app sends carries `[deck-folder .aura/decks/<id>]` (it adds the line itself). That folder is where you
  write: `plan.json` while planning, and the packed deck: `pack_deck.py … --out ".aura/decks/<id>" --replace`. Do not make PDF,
  PowerPoint or speaker-note backups in a step: **Finalize** makes the final HTML and PDF in `4 - Your slides/`, without you, and
  the person asks the app for the PowerPoint copy on the finalize screen (one picture per slide, 3D scenes as a still image).
- A message with no `[deck-folder …]` line (an old one-shot start only): the packer writes `4 - Your slides/<Title>.html`
  and moves the previous version into `Older versions/` with the date first.
- `.aura/temp/plan.md` is **your own working notes** (facts, numbers and which file each came from; in a one-shot start also
  your slide outline). The plan the person sees and edits is `plan.json`; never keep the real plan only in `plan.md`.

## How decks are made (the toolkit)
Decks are HTML built on the Aura deck runtime and the Aura tools in `.aura/engine/`; the `aura-slide` skill and its
`deck-toolkit.md` say exactly how. Never improvise a different format, CDN libraries or online fonts.
- Build in `.aura/temp/build/<deck>/index.html` (start it with `node .aura/engine/tools/new_deck.js`).
- Check with `node .aura/engine/tools/deck_check.js` until it is clean, and look at the slide pictures it saves.
- Pack with `.aura/venv/Scripts/python.exe .aura/engine/tools/pack_deck.py` into ONE offline file, in the folder "Where you write" says.
- Every editable slide text carries a stable `data-edit="s<slide>-<n>"` id (`new_deck.js --ids` adds missing ones);
  the editor uses them for direct text tweaks. Never renumber or reuse them.
- To change a finished deck, edit its build folder and pack again (`--replace` for edits); never hand-edit the packed file.

## App mode (the only way in)
The app runs you in the background and shows your messages in its chat. A first message containing `[from-web]`
means the user already reviewed their answers in the app: do not wait for "yes", go straight on. Later messages come
from the deck editor and usually start with `[slide N]` (the selected slide). Planning and building messages start with
`[plan-mode]`, `[plan-edit]` or `[build-slide …]`.

**Markers.** The app reads special lines in your messages (progress, waiting, finished, decision buttons, suggestion
chips, plan signals). The `aura-slide` skill, section "App markers", is their only definition — the exact syntax, the
full list with who writes and who reads each, and the question limits. Write each marker alone on its own line, exactly
as the skill shows; the app hides them. A marker the app cannot read is reported to the person, so keep to the syntax.
Keep messages short: the user sees them as chat bubbles.

**Which instruction wins.** The newest, most specific instruction wins: the app's message for this step (it knows the
deck's folder and the step), then the skill files, then this guide's general advice. The HARD RULES win over all of them.

## Always
- The subject can be anything (fluids, electronics, medicine, maths, business…). Never assume a topic.
- Only use facts, numbers and figures from their files and form answers. If something is missing, ask; do not invent data. Every number
  that is not in their files is declared in `provenance.json` and in the speaker notes (`skills/aura-slide/building.md` rule 8); the checker fails the rest.
- **A refused or blocked command is policy, not a glitch.** Never retry it with different quoting, and never hand it to a helper agent
  (it has the same policy). Change the mechanism once (the `[environment]` line of your message says which tools exist here; system
  `python` / `node -e` are the fallbacks), or tell the person plainly what is blocked. Do not spend a run on a wall you cannot see.
- Keep the visible folders tidy: only the finished files appear in `4 - Your slides/`.
- When a step will take a while (rendering, capturing), say so and roughly how long.
- The trigger phrase **"show your aura"** starts the `aura-slide` skill.

## The power-design skill (installed by setup, MIT © Jack Roberts)
`.claude/skills/power-design/` is the design engine for slides: its 20 slide principles
(`principles/design-principles.md`) and its brand library (`brands/<name>/brand-style.md`) apply to every deck.
- **Decks go where "Where you write" says**, through the Aura packer, never to the Desktop (its default). Its "single
  self-contained HTML file" output contract is met by `pack_deck.py`; its Google Fonts / CDN allowance does not apply
  here (everything must work offline).
- The brand-logo question (its rule #21) is not asked: use their logo from `Logo and university template/` on the
  title and closing slides when they gave one, otherwise no logo.
- **Do not use its "paste a URL / Firecrawl" option** — users here do not have Firecrawl. Use a library brand, the
  university's logo/template from `3 - Put your files here/Logo and university template/`, or its default style.
- Do not ask the user whether it is a deck or a website: in Lumi it is always a deck.

## Aura Blend (the Lumi design style)
Style every deck with `.claude/skills/aura-slide/aura-blend.md`. It covers:
- The typeface rules (public-licence fonts only, from `.aura/engine/fonts/`). How many typefaces: the numbers table above
  (this overrides power-design's "max 2 typefaces" rule, except where a look allows fewer).
- The colour blend and one signature device per theme.
- The five Aura themes: Pink Punch, Bold Blue, Flat-Pack, Happy Headspace, Yellow Frame. Bold Blue is the recommended
  default. **Every look obeys the same structural rules** - `.claude/skills/aura-slide/looks/_shared/LOOK-BASE.md` -
  and only its brand differs. Bold Blue and Flat-Pack each have their own brand file
  (`.claude/skills/aura-slide/looks/<look>/LOOK.md`); read the base and then that file whenever one of them is the look.
  **They override the form's visual choices, aura-blend.md and deck-toolkit.md wherever they differ.**

Their brand files are in `.claude/skills/aura-slide/brands/` and in power-design's `brands/`. Aura Blend works inside
the rest of power-design's rules and the HARD RULES, never against them.

**The user's look:** use the theme chosen in the form (`brief.md` → *Look*). If it says "Claude chooses", pick the Aura
theme that best suits the topic and audience and tell the user which one you picked.

**Diagrams rule:** never make boring boxed flowcharts or default graphs. Turn every process and result into an
illustration, animated in 2D (sometimes 3D) where it helps. See section 4 of `aura-blend.md`.

## What the checker enforces, and what is only advice
`.claude/skills/aura-slide/enforcement.md` lists, rule by rule, what `check_rules.js` / `deck_check.js` block, what they only warn
about, and what nothing checks. A rule that nothing checks is still a rule: follow it.
