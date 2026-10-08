# Brief for a Claude account: camera continuation and volumetric light (Package B)

You are in **`X:\aura-slide-by-shafayat`**, the source for **Lumi** — a Windows app that builds presentation decks
with headless Claude Code. **Five other Claude sessions are working in this repo right now**, so the file-ownership
section is binding, not advisory.

Owner: S. M. Shafayat Islam. Short, plain replies, no wasted tokens. Not a beginner.

---

## 1. Correction first: the work queue is out of date about this package

`docs/HANDOFF-work-queue.md` describes Package B as three jobs and implies the post stack is unfinished. **Read
the code before you believe it.** As of 2026-10-07:

| the queue says | what is actually true |
|---|---|
| "the hero pair — partly written into the LOOK base as 4.6/4.7; finish it" | **Built.** `post-policy.js` implements the three tiers (`hero` / `body` / `closing`), `tierOf()` resolves them, and LOOK-BASE 4.6 documents it. |
| "`post.js` and `post-policy.js` already exist — extend them" | True, and they are **mature**: 331 + 210 lines, bloom + DOF + crease AO + FXAA + tone map, a documented determinism proof, and an honesty gate that refuses post on any slide carrying measured values (LOOK-BASE 4.7). |
| "volumetric light / god rays via raymarched post" | **Does not exist.** Zero hits in the repo. Genuinely new. |
| "camera continuation between slides" | **Does not exist.** Zero hits. Genuinely new, and the harder of the two — see section 3. |

It is also wired, not shelved: `studio3d.js:318-326` resolves a policy and builds the chain, and `fp3d.js:138`
registers Flat-Pack with every tier off because a drawing is not a photograph.

**So your package is two things: camera continuation, and volumetric light.** Both are additions to a working
system. Do not rewrite `post.js`; its header comment explains every choice in it, including the ones that look
odd, and most of them are load-bearing.

---

## 2. Read these first

1. `engine/deck/lib/post.js` — **the whole header, lines 1–45.** It states the capture contract, why
   `EffectComposer` is refused (a packed deck is one offline HTML file; add-on ES modules will not pack), why
   `AfterimagePass` is refused **by name**, and three measured traps.
2. `engine/deck/lib/post-policy.js` — the tiers and the honesty gate.
3. `engine/deck/runtime.js` **section 2 (the capture contract) and section 5 (health)** — section 5 is new,
   added by Package A today. Read it before you write a line; see section 4 below for why it now matters more.
4. `workspace/.claude/skills/aura-slide/looks/_shared/LOOK-BASE.md` sections **4.3, 4.5, 4.6, 4.7**.
5. `docs/cinematic-direction.md` sections **3, 5, 7** — the rationale and the owner's brief.

### The three traps already measured and written into `post.js`

Read them in place before you start; each cost someone real time:

- **A three.js render target is neither tone mapped nor colour encoded.** Values are pre-tone-map and a light
  backdrop clips to white, reading exactly like bloom turned up far too high. The buffer is **half float** for
  this reason — 8 bits cannot hold it. If post ever seems to wash the plate out, suspect this first.
- **Bloom radius compounds roughly 4x through the up-chain.** `radius` is deliberately left at the clinical value
  in every tier. Raising it is almost never what you actually want.
- **A fixed depth-of-field focus drifts off the subject under orbit.** The `focus: 'auto'` path exists for this.

---

## 3. Camera continuation — and the design problem that decides it

The goal (cinematic-direction §5): **slide 2's camera starts where slide 1's ended**, so a deck feels like one
space rather than a pile of unrelated renders. The owner wants it; it is the cheapest thing that makes a deck feel
*authored*.

**The trap, and it is the whole job.** The obvious implementation is runtime state: slide 1 finishes, writes its
final camera somewhere, slide 2 reads it on mount. **That breaks the capture contract outright.**
`finalize.js` screenshots one frame per `seek(t)` and requires `seek(t)` twice to produce identical pixels. If
slide 2's camera depends on slide 1 having been rendered first, then:

- `seek(5)` after `seek(4)` differs from `seek(5)` after `seek(9)`;
- a person who opens the deck on slide 7 sees a different picture from the one the video shows;
- the slide stops being a pure function of `t`, which is the one property the whole pipeline rests on.

This is the same reason `AfterimagePass` is **refused by name** in `post.js` rather than merely left out. Read
that note; it is the precedent for your decision.

**So continuation has to be declared, not accumulated.** The camera a slide starts from must be a static value
the slide carries — authored into the slide, or derived by a build step that runs once before capture — never
runtime state inherited from whichever slide happened to render before it. Each slide stays independently
reproducible; the *continuity* is data, not history.

Work out the honest design, write it down with its reasoning **before you build it**, and put it in
`docs/STATUS-CINEMATIC.md`. If you conclude a different approach is right, say so and justify it — but a design
that quietly makes slide N depend on slide N-1 having rendered will be rejected, however good it looks in a
browser.

Keep it cheap. The queue's own note is right: *"the look base records where each 3D slide's camera ended, nothing
more."*

---

## 4. Volumetric light — and the new reason a bug here is loud

God rays by raymarched post are the cheapest route to atmosphere, and the reference look the owner is chasing is
built on soft studio light. Follow `post.js`'s existing patterns exactly:

- **No `performance.now()`, no `Date`, no `Math.random()`, no frame counter** in any uniform.
- **Every sampling pattern is a fixed constant baked into the shader** — the existing effects use a golden-angle
  spiral. Do the same. A dithered or rotated-per-frame sample pattern is the classic way to make raymarching cheap
  and the classic way to destroy determinism.
- **Nothing accumulates across frames.** Targets are written before they are read, every frame, in the same order.
- It goes in the **existing chain and the existing `LADDER`** (the adaptive quality drop-down at `post.js:87`), not
  in a parallel composer.
- It is gated by **`post-policy.js`**, and the honesty gate still applies: no atmosphere on a slide carrying
  measured values. Bloom blows out an error bar; a light shaft across a chart is the same crime.

**What changed today, and why it raises the stakes.** Package A landed the capture-health gate. Until this
morning, a 3D holder whose scene threw produced a **blank slide at exit 0 with zero warnings** — decks shipped
blank and nobody knew. Now `finalize.js` asks `LumiCapture.health()` what actually drew before recording, retries
the whole deck on software GL, and if that fails too it **stops: exit 1, no HTML, no PDF.**

So: an exception thrown from your shader compile or your pass setup is no longer a quiet degradation — it fails
the build. That is the correct behaviour and you should not work around it. It does mean **you must test the
failure path**: make your effect degrade cleanly (fall off the `LADDER`, or decline to install) rather than throw,
on a machine or a context where it cannot run.

---

## 5. FILE OWNERSHIP — five other sessions are live in this repo

**Yours:**
- `engine/deck/lib/post.js`, `engine/deck/lib/post-policy.js`
- new files you create in `engine/deck/lib/` (not named `bake*` — those are Package A's)
- `engine/deck/looks/bold-blue/studio3d.js`

**Yours, but additive only — two accounts are building looks against it right now:**
- `workspace/.claude/skills/aura-slide/looks/_shared/LOOK-BASE.md`

  **Add sections; do not restructure, renumber or rewrite existing ones.** Pink Punch, Happy Headspace and a new
  Clay Pop look are being written against this file as it stands. Renumbering 4.6 would silently invalidate the
  cross-references in three LOOK.md files being authored this afternoon.

**Do not edit — someone else is in them:**
- `engine/deck/blender/**`, `engine/deck/lib/bake*`, `engine/tools/finalize.js`, `engine/tools/lib/deckpage.js`,
  `engine/deck/runtime.js` — **Package A** (`docs/CLAIM-A.md`). Read `runtime.js`; never write it.
- `engine/form_server.py`, `engine/tools/**`, `engine/rules/**`
- `engine/form/**` — the copy pass and the waiting game
- `engine/deck/looks/{flat-pack,pink-punch,happy-headspace,clay-pop}/**`, `engine/deck/themes/**`
- `installer/Lumi.cs`, `engine/form.ps1`
- `RESUME.md`, `BACKLOG.md`, `FIXLOG.md`, `CLAUDE.md`, everything in `docs/` except your three files

**Yours in `docs/`, and only these:** `docs/CLAIM-CINEMATIC.md`, `docs/STATUS-CINEMATIC.md`,
`docs/REGISTER-CINEMATIC.md`.

**If you need something from `runtime.js` or `finalize.js`** — a hook, a value, a lifecycle call — write the exact
snippet into `docs/REGISTER-CINEMATIC.md`. Package A owns those files and is actively changing them; an edit you
make there will be lost or will collide.

---

## 6. Rules that apply without exception

1. **Never commit, push, tag or publish. Never bump the version.** v0.5.5 is live; the coordinating session owns
   all git. Safety commit `564a273`; full backup at `X:\lumi-backup-20261007-212954\`.
2. **Never touch `C:\Lumi`** except to read. That is the owner's live install with their real decks in it.
3. **Do not run the full test suites** (`test_server.py`, `test_frontend.py --e2e`, `test_permissions_real.py`).
   Two sessions testing on one machine produce phantom failures — this already cost hours: 1288/1295 on one run, a
   different five on the next, none of them real. **`node --check` and rendering a deck are expected.**
4. **Never create a sandbox inside the repo.** One was committed by accident. Use `X:\aura-dev-cine\`.
5. Write files with the **Write tool**, not bash heredocs — backslashes get mangled on Windows.
6. **One implementation, always.** There is one post stack, one surface builder, one FFT in the sibling project —
   this repo's standing rule is that a second implementation of anything is a defect. Extend `post.js`; never add
   a second composer.
7. **No new dependency.** A packed deck is one offline HTML file. No add-on ES modules; they will not pack.

---

## 7. How to prove it works

```
python tools/form-dev/static_server.py 8790
```
Serve over HTTP — **`file://` fails on CORS** for three.js. Then:

- [ ] **The determinism test, and it is not optional.** `seek(t)` → screenshot → `seek(t')` → `seek(t)` →
      screenshot. **The two images must be byte-identical.** Do this for both new features. If they differ, the
      feature is wrong, no matter how good it looks live.
- [ ] A/B every effect with `P.state.<effect> = false` — the live toggle exists precisely to make this trivial.
- [ ] A slide carrying measured values gets **no** atmosphere and **no** bloom. Verify the gate still closes.
- [ ] Your effect **degrades without throwing** when it cannot run. Confirm `LumiCapture.health()` still reports
      the holder as drawn.
- [ ] A real deck finalizes end to end, exit 0, and you **looked at a frame out of the video**.
- [ ] `node --check` on every file you touched.

---

## 8. Report back, in two places

**To the owner:** 10 lines or fewer. What you built, the camera-continuation design and its one-line
justification, confirmation the determinism test passed, what you looked at, anything blocked on a file you do not
own, and — worth the most — **anything in this brief that turned out to be wrong when you read the code.** Five
agents have already found real errors in these handoff documents, including in this package's own description;
saying so plainly beats working around it quietly.

**To a file, because the coordinating session cannot see your messages:**

```
X:\aura-slide-by-shafayat\docs\STATUS-CINEMATIC.md
```

Overwrite it as you go, ~15 lines: done, in progress, blocked, files touched, the camera design and its reasoning,
what you verified. That file plus `docs/REGISTER-CINEMATIC.md` are the entire handover — write them for someone
who has never spoken to you.

**Claim it first.** Before your first edit, create `docs/CLAIM-CINEMATIC.md` with the time you started and one
line on your plan, so the other five sessions know this is taken.
