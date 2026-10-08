# Brief for the FINAL Claude account: integrate, verify, release 0.5.6

You are in **`X:\aura-slide-by-shafayat`**, the source for **Lumi** — a Windows app that builds presentation decks
with headless Claude Code. Owner: S. M. Shafayat Islam. Short, plain replies, no wasted tokens. Not a beginner.

**You are the last session. Everyone else has stopped.** Six packages were built in parallel by separate accounts
and every one of them is finished and reported. Nothing they did has been committed, integrated, or run through
the full test suites. **That is your job, and you are the only session that can do it.**

---

## 1. What is different about you

Every other brief in `docs/` says *"never commit, never publish, the coordinating session owns git"* and *"do not
run the full test suites"*. **Both of those restrictions are lifted for you, and only for you.**

- **You own every file in the repo.** All `CLAIM-*.md` holders have stopped. The ownership tables in the other
  handoff files are now history — read them for context, do not obey them.
- **The machine is quiet, so you must run the full suites.** They have never been run against any of this work.
  Two sessions testing at once produced phantom failures earlier (1288/1295 on one run, a different five on the
  next, none real) — that is why nobody ran them. That reason is gone. **Before you start, confirm nothing else
  is running**: no other Claude session, no leftover `fake_claude.py`, no dev server. `test_server.py`'s
  "fake process killed" checks see any `fake_claude.py` anywhere on the machine.
- **You still do not push without the owner's explicit go-ahead.** See section 7.

Safety net: commit `564a273` is the last known-good point, and a full backup of repo *and* install is at
`X:\lumi-backup-20261007-212954\`. There are **94 uncommitted files**. Do not `git checkout` or `git stash`
anything without reading it first — every one of those files is somebody's finished work.

---

## 2. Read these first, in this order

All six sessions wrote a status file. **Read all of them before you touch anything** — they contain measurements,
bugs found, and corrections to the specs that you will otherwise rediscover the hard way.

| file | what it holds |
|---|---|
| `docs/STATUS-A.md` | baked motion: Part C done, Part B built. **47x measured on real work.** Four bugs that produced wrong pictures rather than errors |
| `docs/STATUS-CINEMATIC.md` | camera continuation + god rays, done and verified byte-identical under `seek(t)` |
| `docs/STATUS-COPY.md` | the copy pass: 5206 → 4590 words (−12%), twelve screens, plus a kill list |
| `docs/STATUS-three-looks.md` | Pink Punch + Happy Headspace done. **Four defects it found that are still in Flat-Pack** |
| `docs/STATUS-CLAY.md` | the Clay Pop look, complete including its demo video |
| `docs/STATUS-SPLAT.md` | **verdict: REJECT**, on three independent measured grounds, with a replacement proposal |

Then the five registration files you must apply: `docs/new-looks-registration.md`, `docs/REGISTER-CLAY.md`,
`docs/REGISTER-COPY.md`, `docs/REGISTER-CINEMATIC.md`, `docs/REGISTER-A.md`.

---

## 3. Apply the registrations — ORDER MATTERS, and here is why

Five files ask for edits, and **they overlap on the same shared files.** They were each written in isolation
against the repo as it looked at the time, so later ones have stale context. Apply in this order and re-verify
context at every step:

1. **`docs/REGISTER-A.md`** — prose corrections to `RESUME.md` / `FIXLOG.md` / `SURVEY.md`. No code. Safe, do it
   first to clear the deck.
2. **`docs/new-looks-registration.md`** — Pink Punch + Happy Headspace into `new_deck.js` (`LOOK_HEAD`,
   `LOOK_SPEC`), `form_server.py` (`LOOK_SPECS`, `LOOK_3D`), `hard-rules.json`, the `CLAUDE.md` numbers table,
   `post-policy.js`. **Its §1 is the critical one: without `new_deck.js`, a deck in either look has blank 3D
   slides.**
3. **`docs/REGISTER-CLAY.md`** (25 KB, ten sections) — the same five files again, **plus** `lumi_bpy.py` (the clay
   preset), `looks.js`, `home.js`, `review.js`. Because it repeats files from step 2, **its snippets will not
   match byte-for-byte any more.** Read the surrounding code, apply the intent, do not paste blindly.
4. **`docs/REGISTER-COPY.md`** — 4 test regexes (`e2e_blender.js`, `test_frontend.mjs`) and `FREE_NOTE` in
   `form_server.py`. The front-end strings are **already changed**; these tests will fail until you apply this.
5. **`docs/REGISTER-CINEMATIC.md`** — items 1 and 2 touch `runtime.js`. Item 2 needs an owner decision (section 6).

### The four collisions you will actually hit

- **`looks.js` / `home.js` / `review.js`** — Clay Pop's snippets (REGISTER-CLAY §6, §7, §8) were written against
  the *pre-copy-pass* text. Package D then rewrote strings in all three. Expect mismatches; apply by intent.
- **The "how many looks" count.** Lumi had five looks; the owner cut Yellow Frame on 2026-10-07
  (`docs/STOP-yellow-frame.md`) and every doc now reads **four**. Adding Clay Pop makes it **five** again:
  Bold Blue, Pink Punch, Flat-Pack, Happy Headspace, Clay Pop. Both step 2 and step 3 edit that same table in
  `CLAUDE.md` and `aura-blend.md`. Get it to five **once**, not twice, and never re-list Yellow Frame.
- **`lumi_bpy.py`** — Package A added `--bake` to `args()` / `reset()` / `render()`; Clay adds a preset to
  `PRESETS` and a `cycles(view=)` argument. Different regions, but both are live in the file now.
- **`runtime.js`** — Package A rewrote it today (capture contract section 5, `health()`). REGISTER-CINEMATIC's
  line references (~295, ~416) point into that **new** version. Find the code, do not trust the numbers.

**After each step: `node --check` on every JS file and `ast.parse` on every Python file you touched.** Do not
batch five steps and then discover which one broke.

---

## 4. `pack_deck.py` — the one structural problem, and it needs a decision

Three packages independently hit the same wall: **a packed deck is one offline HTML file, and nothing from
`three/examples/jsm` packs.** `pack_deck.py:346-364` inlines exactly two modules as data URLs — `three.module.js`
and `three.core.js`.

- **Package B already edited `pack_deck.py`** (+42 lines, the measured-values record feeding the post honesty
  gate). This was **outside its declared lane and not listed in its register file** — the edit looks sound and
  parses clean, but nobody reviewed it. **Review it properly as part of your integration.**
- **Package A's bake player needs `GLTFLoader`** inlined plus a `three/addons/` mapping in
  `engine/deck/template.html`. Not done. This is what stands between the measured 47x and it actually shipping.
- **Package C needed the WebGPU build** and that contributed to its rejection.

**You do not have to solve this for 0.5.6** — see the scope call below. But do not let it stay invisible: write
what you decide into `RESUME.md`, because the next person will hit it again.

---

## 5. What goes in 0.5.6 — the scope call, and my recommendation

**Recommended: ship the looks, the copy pass and the cinematic work. Hold the baked pipeline back.**

The reasoning: Package A's Part B is genuinely impressive and genuinely incomplete — B.2 routing, B.3 staleness,
B.5 UI, B.6 artifact wiring and B.7 checker are **not started**, it has **never been rendered inside a real deck**,
and it cannot pack without the `GLTFLoader` work above. Shipping a half-wired render path into a public release is
how you get a silent blank slide in somebody's thesis, which is the exact failure Part C was built to stop.

Everything else is finished, verified by its author, and additive.

**This is the owner's call, not yours.** Put the recommendation to them in one line and take their answer.

---

## 6. Four decisions only the owner can make — ask all four in one message

1. **`health()` checks dimensions, not pixels.** `runtime.js holderDrawn()` says it checks "a canvas with real
   pixels"; it actually checks `width > 0 && height > 0`. A scene that sets up without throwing but draws nothing
   still passes — the exact failure class the gate exists to catch. Fix the comment, or sample the canvas
   (`drawImage` into a 16x9 2D canvas, require one pixel with alpha > 0)? *(Found by Package B in Package A's
   day-old code. The coordinating session's view: sample it.)*
2. **The copy pass kill list** — four items recommended for outright deletion, in `docs/STATUS-COPY.md`. The
   sharpest: a confirmation dialog that opens with "not recommended" — if it is not recommended, hide the button
   until slide 1 is approved rather than warn after the click.
3. **Package C's replacement.** Splatting is rejected on measured grounds. The session proposes a **photo
   turntable of the user's own orbit footage** — same promise, 0.8–2.6 MB, no WebGPU, deterministic capture.
   Build it, or drop photo-to-3D entirely? Not built; needs a go-ahead.
4. **Release scope** (section 5).

---

## 7. Verify, then release

**Nothing has been run against the integrated whole.** In order:

1. **Light checks** after every registration step (section 3).
2. **The full suites, on the quiet machine**: `test_server.py` (run it **alone**), `test_frontend.py --e2e`,
   `test_permissions_real.py`, plus `test_blender_*.py`, `test_post.mjs`, `markers_test.mjs`,
   `test_instructions.py`, `test_interview.py`, `test_deck_folders.py`.
   - **Known failure to resolve, not to ignore:** `test_post.mjs` is 40/41 because it compares `LOOK-BASE.md`
     against the copy inside `aura-dev-rel/` — a 7.3 MB **gitignored sandbox sitting inside the repo** that lacks
     the new sections 4.8/4.9. Either delete the sandbox or fix the test to stop reading it. Do not "fix" it by
     editing the sandbox.
3. **Render and look.** A deck in each of the five looks, at 1600x900 **and 1366x768**. Serve over HTTP
   (`python tools/form-dev/static_server.py 8790`) — **`file://` fails on CORS** for three.js.
   - Package D could not visually verify its cuts because the static server cannot get past the loading screen;
     it needs `form_server.py`. **Check at 1366x768:** the plan intro without its lead line, the home left column
     without its lead, and the finalize "done" note.
   - Clay Pop's demo video has never been seen inside the real look picker (it needs registration §6 applied).
4. **One real end-to-end deck** through the app: interview → theme → plan → build → finalize. This is the only
   test that exercises the integrated whole.
5. **Then, and only then, the release.** `tools/make_release.py`. Confirm `TOP_SKIP` still excludes `tools`,
   `docs`, `release`, `installer`, `temp`, `.git`, `.github`, and that **no `aura-dev-*/` and no `temp/` reaches
   the public repo** — both have been committed by accident before.

**The push needs the owner's explicit yes.** This is a public repo and a public release; "finish the job" is not
standing authorisation to publish. Build the release, show them what is in it, get one line of approval, then
tag, commit and push. End commit messages with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## 8. Leftovers, if you have budget after the release

- **Flat-Pack has four defects** the looks session found by rendering, fixed in its own looks and described in
  `docs/new-looks-registration.md` §7: the title figure collides with the title text; `problem-stats` with three
  stats *and* a close line overflows the footer; the callout tag covers its own numbered pin; and `.fp-q` is a
  `<p>` whose bare selector loses to `.slide p { margin: 0 }`, silently dropping the gap above the closing line.
- **The waiting game was never claimed.** `docs/HANDOFF-game.md` exists, no `CLAIM-GAME.md` was ever written, no
  work was done. The game works today; it has a real bug (the best score is closure state and does not survive a
  reload, though the HUD promises it does). Fix that one thing if nothing else.
- **~20 sandboxes under `X:\aura-dev-*`** and the 7.3 MB `aura-dev-rel/` inside the repo. Clean up only what you
  are certain is dead, and never touch `X:\lumi-backup-20261007-212954\`.
- **Never touch `C:\Lumi`** except to read. That is the owner's live install with their real decks in it.

---

## 9. Report back

**To the owner:** what you integrated, every suite result with its numbers, what you rendered and looked at,
what is in 0.5.6 and what you held back, and anything in these documents that turned out to be wrong. Six agents
have found real errors in them already — including in a brief written to correct an earlier error. Saying so
plainly is worth more than working around it quietly.

Keep `RESUME.md` current as you go; it is the file the next session reads first. **It was previously reserved to
the coordinating session — it is yours now.**
