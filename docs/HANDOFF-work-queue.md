# Work queue for additional Claude accounts

**Read this whole file before starting. Then claim exactly one package.**

You are in **`X:\aura-slide-by-shafayat`**, the source for **Lumi** — a Windows app that builds presentation
decks with headless Claude Code. v0.5.5 is the published release. Several Claude sessions on different accounts
work in this repo at the same time, so **file ownership is the rule that keeps the work from being lost.**

Owner: S. M. Shafayat Islam. Wants short, plain replies, no wasted tokens, and is not a beginner.

---

## Already handed to their own accounts — do NOT claim these here

| work | brief | state |
|---|---|---|
| **Package A** — baked motion | this file, Package A | **claimed** (`docs/CLAIM-A.md`); Part C **done**, Part B next |
| **Package D** — the copy pass | **`docs/HANDOFF-copy.md`** | handed off; claim via `docs/CLAIM-COPY.md` |
| the waiting game | **`docs/HANDOFF-game.md`** | handed off; claim via `docs/CLAIM-GAME.md` |
| the Clay Pop look | **`docs/HANDOFF-clay-look.md`** | handed off; claim via `docs/CLAIM-CLAY.md` |
| **Package B** — camera continuation, volumetric light | **`docs/HANDOFF-cinematic.md`** | handed off; claim via `docs/CLAIM-CINEMATIC.md`. **Package B's description below is STALE** — the post stack and hero rule are already built and wired; read the new brief, not it. |
| **Package C** — photo to 3D | **`docs/HANDOFF-splat.md`** | handed off; claim via `docs/CLAIM-SPLAT.md`. **Package C's description below is WRONG** — three r186's splatting is WebGPU/TSL only and Lumi renders WebGL; the new brief corrects it. |
| Pink Punch + Happy Headspace | `docs/HANDOFF-three-looks.md` | in progress (Yellow Frame **cancelled**, see `docs/STOP-yellow-frame.md`) |

**Still open here: Package E (small, well-defined) only.**

---

## How to claim a package

1. Pick **one** package below that is not already claimed.
2. **Immediately** create `docs/CLAIM-<package-letter>.md` containing: the package letter, the time you started,
   and one line on your plan. That file is how other sessions know not to take it. Check for existing
   `docs/CLAIM-*.md` files **first** — if yours is taken, pick another.
3. Keep `docs/STATUS-<package-letter>.md` updated as you go (~15 lines: done, in progress, blocked, files
   created). The coordinating session reads these; it cannot see your messages.
4. If you need a change in a file you do not own, **write the exact snippet into
   `docs/REGISTER-<package-letter>.md`** instead of editing it. The coordinator applies those.

---

## Rules that apply to every package, without exception

1. **Never commit, push, tag or publish. Never bump the version.** The coordinating session owns all git. A
   safety commit is at `564a273`; a full backup of repo and install is at `X:\lumi-backup-20261007-212954\`.
2. **Never touch `C:\Lumi`** except to read. That is the owner's live install, with their real decks in it.
3. **Never weaken `engine/rules/permit.js`.** It is the security gate around headless Claude. Widening it to
   make something convenient is a failure, not a fix.
4. **Do not run the full test suites** (`test_server.py`, `test_frontend.py --e2e`, `test_permissions_real.py`)
   unless the owner tells you no one else is working. Two sessions testing on one machine produce phantom
   failures — this already cost hours: 1288/1295 on one run, a different five on the next, none of them real,
   plus a crashed browser. **Light checks are expected**: `node --check`, `python -c "import ast,io;
   ast.parse(io.open(p,encoding='utf-8').read())"`, and rendering a deck and looking at it.
5. **Never create a sandbox inside the repo.** One was committed by accident. Use `X:\aura-dev-*`.
6. Write files with the **Write tool**, not bash heredocs — backslashes get mangled on Windows. PowerShell
   files stay **ASCII + CRLF**.
7. **Numbers live in `engine/rules/hard-rules.json`**, never in prose. Marker grammar lives in
   `engine/rules/markers.json` and its two mirrored copies, which a test asserts identical.
8. Copy standard: a control says what it does in **two to four words**; no sentence inside a button; no
   pre-emptive explanation. Error text is exempt where clarity costs words.
9. **Render it and look at it.** A visual change that has never been seen is not finished. Flat-Pack shipped
   with its title colliding with its own figure because nobody looked. Serve over HTTP
   (`python tools/form-dev/static_server.py 8790`) — **`file://` fails on CORS** for three.js.

---

## Package A — the baked motion pipeline  ★ highest value, hardest

**Spec: `docs/blender-batch6-spec.md` (Part B, and Part C first). Rationale: `docs/cinematic-direction.md` §1.**

The owner wants ~70% of slides 3D and ~70% of those animated. Measured on their real deck, that is
**11.4 hours of GPU** on today's per-frame Cycles path and **9.3 minutes** baked — **74x**. Nothing else on this
queue unlocks as much; every cinematic ambition depends on it.

Bake Cycles detail into textures once (~61 s measured), export meshopt/WebP glTF, play it in three.js, and let
the **existing** deterministic seek-based capture turn it into video. Do not build a new capture path — read
`engine/tools/finalize.js` first; it already screenshots one frame per `seek(t)`.

**Part C's preconditions must land first** and are non-negotiable: verify a real software-GL (swiftshader)
finalize end to end, add a fallback when browser capture fails, and make that failure loud. Browser capture has
already silently produced a blank slide once in production.

**The one open design problem:** `L.section()` draws cutaway hatching **screen-aligned** (the drafting
convention). Baked into a texture it glues to the surface and rotates with the part. Either make it a
screen-space shader pass in three.js, or route cutaway slides to Cycles. Decide and justify.

**Owns:** `engine/deck/blender/**`, `engine/deck/lib/bake*`, the Blender section of `engine/form_server.py`,
`workspace/.claude/skills/aura-slide/looks/bold-blue/BLENDER.md`, `tools/form-dev/test_blender*`.

---

## Package B — volumetric light, camera continuation, the hero pair

**Rationale: `docs/cinematic-direction.md` §3, §5.** Depends on nothing; `engine/deck/lib/post.js` and
`post-policy.js` already exist — read them, extend them, do not rewrite them.

Three things, in order of value:
1. **Camera continuation between slides** — slide 2's camera starts where slide 1's ended, so a deck feels like
   one space rather than a pile of renders. Cheapest big win here: the look base records where each 3D slide's
   camera ended, nothing more.
2. **Volumetric light / god rays** via raymarched post — the cheapest route to atmosphere. It must stay
   deterministic under `seek(t)`: no clock, no noise that changes per frame. `post.js` already proves this
   pattern; follow it.
3. **The hero pair** — slides 1-2 get the full treatment, the body stays calm, the closing echoes slide 1.
   Partly written into the LOOK base already as 4.6/4.7; finish and make it real in the engine.

**Constraints that already bit the last agent, written into `post.js`** — read its comments before you start: a
three.js render target is neither tone mapped nor colour encoded; bloom radius compounds ~4x through the
up-chain; a fixed DOF focus drifts off the subject under orbit.

**Owns:** `engine/deck/lib/post.js`, `post-policy.js`, new files in `engine/deck/lib/`,
`engine/deck/looks/bold-blue/studio3d.js`, `workspace/.claude/skills/aura-slide/looks/_shared/LOOK-BASE.md`.

---

## Package C — photo to 3D of the user's own apparatus  ★ most novel

**Rationale: `docs/cinematic-direction.md` §6.** Nobody else's presentation tool does this.

`engine/node_modules/three` is **0.186.1** — the release that added **built-in Gaussian Splatting**. A phone
video of a student's real test rig becomes a photoreal, orbitable 3D scene. Far better than a guessed mesh: it
shows what was actually there.

Work out the whole path and build what is sound: capture guidance for the person, the conversion step, the
format (`.ksplat` streams far smaller than raw `.splat`), the three.js viewer inside a slide holder, and how it
survives the existing capture contract into a video.

**Two hard limits.** Raw captures are **80-400 MB** and decks are ~2 MB today — measure before committing, and
say plainly if the sizes make this impractical. And **only the user's own uploads**: a web-fetched photo is
unattributed, possibly licensed, and would land in someone's thesis.

**Owns:** new files under `engine/deck/lib/splat*`, `engine/tools/` additions you create, and the upload/type
handling for a video input — but **coordinate through `docs/REGISTER-C.md` for anything in `form_server.py`**,
which Package A also touches.

---

## Package D — the app-wide copy pass

**Rationale: `BACKLOG.md`, the P0 section "the copy is too long, everywhere".**

The owner's words: *"some buttons explain too much, too much text — make the UX/UI as if you are Steve Jobs. I
want a quality product."* One screen has been cut so far (the look step, ~150 words to ~50, the button is now
just "plan my slides"). Every other screen is untouched.

Audit and cut **every user-visible string**: home and library, loading and sign-in, the interview screen, the
plan page, the build page and its question cards, the editor, finalize, and every error and empty state.
Produce a **before/after word count per screen** so the result can be judged rather than argued about.

The standard is in `BACKLOG.md`; rule 8 above is the short version. **Error text is the exception** — the
owner's standing rule is that errors are never raw and always actionable, and that beats brevity.

**Owns:** `engine/form/js/**`, `engine/form/css/**`, `engine/form/index.html` — **except the waiting game**,
which is handed to its own account: `engine/form/js/lumi-play*.js` and `engine/form/css/theme.css` lines 277-324
belong to `docs/HANDOFF-game.md`. Its strings (`pause`, `hide`, `play while you wait`, `space to flap`) are theirs
to cut, not yours. Do **not** touch `engine/form_server.py` (Packages A and C) — if a string lives server-side, put
it in `docs/REGISTER-D.md`.

---

## Package E — small, well-defined, good for a short session

- **The Flat-Pack title slide overlaps its own figure.** `engine/deck/looks/flat-pack/template.html` — its
  placeholder scene ignores the clear-title-zone rule that the look base states. Render it, fix it, render again.
- **`timeline.js` and `physics.js` are look-neutral maths still sitting inside `looks/bold-blue/`.** Lift them
  to `engine/deck/lib/`; `fp3d.js` currently keeps a 20-line local copy of the loop helpers to avoid the move.
  Update every reference, and keep Bold Blue byte-identical.
- **`BLENDER.md` is look-neutral prose still under `looks/bold-blue/`.** Same treatment. (Not if Package A is
  active — it owns that file.)
- **Remotion prototype.** Build *one* real slide transition with Remotion and compare it honestly with what the
  existing deterministic capture already does. Recommend adopt or reject, with the evidence. Do not integrate it.

**Owns:** only the specific files each bullet names.

---

## What to report back

Keep it to 10 lines or fewer: what you built, what you rendered and looked at, the paths to any
`docs/REGISTER-*.md` you wrote, anything blocked on a file you do not own, and — most useful of all —
**anything in the spec or this brief that turned out to be wrong when you looked at the code.** Three agents
have found real errors in these documents already; saying so plainly is worth more than working around it
quietly.
