# The five parts — who has what (2026-10-08)

Split of the owner's batch after v0.5.10. **One account per part; claim before editing.**

| part | job | brief | owner |
|---|---|---|---|
| **A** | the character and the words | *(coordinating session)* | **this session** |
| **B** | quality picker + plan page layout | `docs/HANDOFF-B-screens.md` | |
| **C** | one chat, no slide ambiguity | `docs/HANDOFF-C-slide-context.md` | |
| **D** | read every file, scans included | `docs/HANDOFF-D-read-everything.md` | |
| **E** | real 3D + camera moves | `docs/HANDOFF-E-real-3d.md` | |

## File ownership at a glance

| file / area | part |
|---|---|
| `engine/form/js/{lumi-art,home,looks,loading}.js`, mascot CSS, chat avatar | **A** |
| `engine/form/js/{quality,plan,markers}.js`, `plan.css`, `engine/form_server.py` | **B** |
| `engine/form/js/{editor,workshop}.js`, `scenes/workshop.js`, strip + chat CSS | **C** |
| `engine/tools/extract_text.py`, the research tool, `uploads.js`, `aura.config.json` packages | **D** |
| **network policy** - ONE for the whole app: D's research fetch + E's asset fetch must agree | **D + E together** |
| `engine/deck/**`, `workspace/.claude/skills/**` | **E** |
| `RESUME.md`, `BACKLOG.md`, `FIXLOG.md`, git, the release | **A (coordinator)** |

`engine/form_server.py` is **B's**. Everyone else routes changes to it through their own
`docs/REGISTER-<letter>.md`.

## System-wide, not Clay Pop

The owner's screenshots came from a Clay Pop deck; **the instructions are for all five looks** - Bold Blue, Pink
Punch, Flat-Pack, Happy Headspace, Clay Pop. Realism, camera moves and the picture mix are **E**'s, and they go in
`looks/_shared/LOOK-BASE.md`, which every look inherits, not in one look's `LOOK.md`.

Rule of thumb: **realistic in structure, thematic in surface.** The real fin count in every look; aluminium in
Bold Blue, matte clay in Clay Pop, a flat sheet in Flat-Pack.

Corrected 2026-10-08: `hard-rules.json` -> `pictureMix` was named after Blender and so could not apply to the
three looks that are `threejs` by design. The keys are now engine-neutral (`animated3dPct`, `still3dPct`,
`illustrationPct`, `opening3dAnimatedSlides`) and the look picks the engine.

## Everyone, without exception

1. **Never commit, push, tag, publish or bump the version.** A only.
2. **Never touch `C:\Lumi`** except to read — the owner's live install.
3. **`engine/node_modules` is missing** (gitignored, repo was re-cloned): `npm install` in `engine/`.
4. **Ask before running `test_server.py` or the e2e** — two sessions testing at once give phantom failures.
5. **Sandboxes at `X:\aura-dev-<letter>\`**, never inside the repo.
6. Write with the Write tool, not bash heredocs. PowerShell stays ASCII + CRLF.
7. Copy: two to four words per control, lowercase. Errors exempt and actionable.
8. **Render it and look at it**, 1366x768 and 1920x1080.
9. Keep `docs/STATUS-<letter>.md` current — the coordinator cannot see your messages.

## The owner's batch, mapped

- "tell claude about your talk" → "Lumi wants to know more" — **A**
- "claude is reading your files and planning" → "Lumi is reading" — **A**
- home screen logo did not change — **A**
- Lumi's body is cropped (red-marked) — **A**
- the Claude logo in the chat box -> the real orange one - **A, DONE**. `engine/form/assets/claude-mark.png`
  (owner-supplied). **Part C: `AVATAR` in `workshop.js` is A's one-line edit - keep it through your rewrite.**
  The split is: Claude's mark on the chat (that panel IS Claude); Lumi's plush on Lumi's own surfaces - the
  icon, loading screen, home card, waiting game, look step.
- model selection ticks hidden behind the mascot — **B** (space for the controls; A owns the mascot)
- default Opus + medium, recommended; only 3 tiers (Opus high = max, Sonnet high = balanced) — **B**
- "plan your deck" type overflowing and cluttered; smaller type allowed — **B**
- is the slide 1 / whole deck toggle still needed on one chat — **C**
- clicking or opening a slide implies that slide; no ambiguity either way — **C**
- image-based documents cannot be read - **D**
- Claude researches the topic on the web while reading the files, for context and ideas - **D**
  (understanding only: never a slide asset, never a number without a real citation, and **never the person's
  own text in a search query**)
- unrealistic 3D, out of context; realism doctrine — **E**
- integrate all 17 `blender-skills`, in Lumi's own idiom; camera sway and many camera setups - **E** (per-skill
  verdict table in the brief: 6 camera moves ported, PolyHaven in, 4 cannot run)
- **Lumi granted internet access** for PolyHaven assets - **E**, as a narrow toolkit fetcher with a hardcoded
  host allowlist. **`permit.js` is not loosened**, and a packed deck stays offline: assets are fetched at build
  time and baked in.
- *(superseded)* `kevinbadi/blender-skills` — **E** (reference at
  `X:\lumi-refs\blender-skills`; **no licence file, do not vendor it**)
