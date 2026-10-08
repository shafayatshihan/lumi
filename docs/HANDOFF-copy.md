# Brief for a Claude account: the app-wide copy pass (Package D)

You are in **`X:\aura-slide-by-shafayat`**, the source for **Lumi** — a Windows app that builds presentation decks
with headless Claude Code. **Four other Claude sessions are working in this repo right now**, so the file-ownership
section is binding, not advisory.

Owner: S. M. Shafayat Islam. Short, plain replies, no wasted tokens. Not a beginner.

---

## 1. The job, in the owner's own words

> *"Some buttons explain too much, too much text — make the UX/UI as if you are Steve Jobs. I want a quality
> product."*

Lumi works. It reads like a manual. **Your job is every user-visible string in the app**, and nothing else.

The measured baseline, counting only prose-like strings in the front-end JS (`engine/form/js/**`):

| screen | words | strings |
|---|---:|---:|
| `plan.js` — the plan page | 283 | 73 |
| `workshop.js` (both) — the build page | 328 | 75 |
| `talk.js` — the talk scene | 215 | 43 |
| `edit-bench.js` — the editor | 192 | 39 |
| `blender.js` — render cards | 167 | 44 |
| `editor.js` — the build shell | 156 | 36 |
| `home.js` — home and library | 129 | 29 |
| `finalizing.js` | 125 | 24 |
| everything else (17 files) | ~1,370 | ~330 |
| **total** | **~2,970** | **~690** |

That is a rough count from a script, not gospel — it misses `index.html` and anything in CSS `content:`, and it
over-counts a few non-prose strings. **Produce your own exact count per screen before you start**, because the
before/after number per screen is the deliverable that makes this judgeable instead of arguable.

**One screen is already done**, as the worked example: the look step went from ~150 words to ~50, and its button is
now just `plan my slides`. Read `engine/form/js/looks.js` to see the target register. Every other screen is
untouched.

---

## 2. The standard

1. **A control says what it does in two to four words.** `plan my slides`. `pause`. `play while you wait`.
   **Never a sentence inside a button.**
2. **No pre-emptive explanation.** Do not explain a control before the person has tried it, do not explain what
   will happen on the next screen, and do not reassure. If a thing needs a paragraph to be understandable, the
   thing is wrong — note it and move on; you are not redesigning it.
3. **Lowercase, plain, confident.** That is the house voice already (`hide`, `pause`, `play while you wait`). No
   exclamation marks, no "simply", no "just", no "please", no "oops".
4. **One idea per string.** If a line does two jobs, it is two lines or it is one job.
5. **Cut adjectives before nouns, and whole sentences before words.** The biggest wins are deletions, not rewrites.
6. **The reader is not technical.** Never "render engine", "token", "context", "session". A real name may appear
   **once with its explanation** — *"a photo-real picture, made with Blender"* — so a curious person can look it up
   and a technical person is not patronised.

### The one exception, and it is absolute

**Error text is exempt.** The owner's standing rule is that errors are **never raw and always actionable**, and
that beats brevity every time. An error says what happened, in plain words, and what the person can do about it.
If an error needs twenty words to be actionable, it gets twenty words.

The same latitude covers **empty states** (a person seeing nothing needs to know why) and the **one-time
disclosure** that a deck takes 10–60 minutes to build. Do not cut those to the bone and call it Jobs.

### What "Steve Jobs" actually means here

Not terse. Not cold. **Confident** — text that assumes the person is intelligent and does not need hand-holding.
The failure mode you must avoid is cutting a 20-word explanation to a 6-word one that is *cryptic*. If a cut makes
a control harder to understand, it is a bad cut, however short it is. When in doubt: delete the sentence entirely
rather than compress it into a riddle.

---

## 3. Method

Work **screen by screen**, not string by string across the app. One screen at a time, finish it, look at it, move
on. For each screen:

1. Count the words before.
2. Cut.
3. **Render it and look at it.** A change you have not seen is not finished.
4. Count the words after.
5. Record both in `docs/STATUS-COPY.md`.

Screens, roughly in order of how much the owner looks at them:

- **home and the library** (`home.js`) — the first thing seen, every time
- **the build page** (`workshop.js`, `scenes/workshop.js`, `editor.js`) — the screen watched for 10–60 minutes
- **the plan page** (`plan.js`) — the biggest single block of prose in the app
- **the interview** (`interview.js`, `markers.js` question cards)
- **the editor** (`scenes/edit-bench.js`)
- **finalize** (`finalizing.js`)
- **uploads and files** (`uploads.js`, `scenes/files.js`)
- **loading, sign-in, start** (`loading.js`, `start.js`, `app.js`)
- **render cards** (`blender.js`), **quality** (`quality.js`), **usage** (`usage.js`), **audio** (`audio.js`)
- **the remaining scenes** (`scenes/*.js`)
- **every error and every empty state** — audited for *actionability*, not for length

**Keep a kill list.** Any string you think should not exist at all — a whole tooltip, a whole explanatory
paragraph, a whole confirmation step — goes in `docs/STATUS-COPY.md` under "recommend deleting", for the owner to
approve. Do not silently delete a control; do silently delete its excess words.

---

## 4. FILE OWNERSHIP — four other sessions are live in this repo

**Yours:**
- `engine/form/js/**` and `engine/form/js/scenes/**` — **strings only**
- `engine/form/css/**` — only where copy lives (`content:` strings, and spacing a shorter line needs)
- `engine/form/index.html`

**Carved out of yours — do not touch:**
- `engine/form/js/lumi-play*.js` and `engine/form/css/theme.css` **lines 277–324** — the waiting game, handed to
  its own account (`docs/HANDOFF-game.md`). Its strings (`pause`, `hide`, `play while you wait`, `space to flap`)
  are theirs.
- `engine/form/js/looks.js` **copy** — already done; leave it as the reference. You may still cut the look
  *descriptions* if they are long, but do not undo that screen's work.

**Do not edit at all — someone else is in them:**
- `engine/form_server.py` — Package A and the clay look. **Server-side strings are common**; when you find one,
  put the exact before/after into `docs/REGISTER-COPY.md` and the coordinator applies it.
- `engine/deck/**`, `engine/tools/**`, `engine/rules/**`
- `installer/Lumi.cs`, `engine/form.ps1`
- `RESUME.md`, `BACKLOG.md`, `FIXLOG.md`, `CLAUDE.md`, everything in `docs/` except your three files

**Yours in `docs/`, and only these:** `docs/CLAIM-COPY.md`, `docs/STATUS-COPY.md`, `docs/REGISTER-COPY.md`.

### Two traps specific to this package

- **A string may be asserted in a test.** `tools/form-dev/test_frontend.py` and `test_server.py` find elements by
  their text. You are told not to run the suites (rule 3 below) — so **grep for the string before you change it**,
  and when a test names it, put the test's required edit in `docs/REGISTER-COPY.md` rather than editing the test.
- **Accessible names are copy too, and they are not the same as visible copy.** `aria-label`, `title` and
  `alt` should stay *descriptive* even where the visible label gets shorter. Cutting an `aria-label` to two words
  makes the app worse for someone who cannot see the icon next to it. Check each one deliberately.

---

## 5. Rules that apply without exception

1. **Never commit, push, tag or publish. Never bump the version.** v0.5.5 is live; the coordinating session owns
   all git. Safety commit `564a273`; full backup at `X:\lumi-backup-20261007-212954\`.
2. **Never touch `C:\Lumi`** except to read. That is the owner's live install with their real decks in it.
3. **Do not run the full test suites** (`test_server.py`, `test_frontend.py --e2e`, `test_permissions_real.py`).
   Two sessions testing on one machine produce phantom failures — this already cost hours: 1288/1295 on one run, a
   different five on the next, none of them real, plus a crashed browser. **`node --check` is expected.**
4. **Never create a sandbox inside the repo.** One was committed by accident. Use `X:\aura-dev-copy\`.
5. Write files with the **Write tool**, not bash heredocs — backslashes get mangled on Windows.
6. **Do not change behaviour.** No renamed functions, no restructured components, no "while I was in there". If a
   cut requires a code change beyond the string, stop and note it. This package is uniquely safe precisely because
   it touches nothing that can break a build — keep it that way.

---

## 6. How to see your work

```
python tools/form-dev/static_server.py 8790
```

- `http://127.0.0.1:8790/dev/scenes2d.html` — the 2D scenes with a "fill sample" button: talk, people, audience,
  work, results, files, extras, review. Most of the app's prose is reachable here with no server and no Claude run.
- `http://127.0.0.1:8790/dev/components.html` — the shared components.
- `http://127.0.0.1:8790/dev/play.html` — the build page states.

**`file://` will not work.** Screenshot at 1600x900 **and at 1366x768** — a shorter line sometimes re-flows a
layout that was tuned around the longer one, and that only shows at the small size.

---

## 7. Report back, in two places

**To the owner:** 10 lines or fewer. The before/after word count **total and per screen**, the three cuts you are
proudest of, anything you recommend deleting outright, and — worth the most — **anything in this brief that turned
out to be wrong when you read the code.** Four agents have already found real errors in these handoff documents;
saying so plainly beats working around it quietly.

**To a file, because the coordinating session cannot see your messages:**

```
X:\aura-slide-by-shafayat\docs\STATUS-COPY.md
```

Overwrite it as you go: screens done with before/after counts, screens left, the kill list, anything blocked on a
file you do not own. That file plus `docs/REGISTER-COPY.md` are the entire handover — write them for someone who
has never spoken to you.

**Claim it first.** Before your first edit, create `docs/CLAIM-COPY.md` with the time you started and one line on
your plan, so the other four sessions know this is taken.
