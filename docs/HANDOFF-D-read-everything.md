# Part D — Lumi must be able to read every file, including scanned ones

You are in **`X:\aura-slide-by-shafayat`**, the source for **Lumi**, a Windows app that builds presentation decks
with headless Claude Code. v0.5.10 is published. **Four other sessions are working in this repo right now** — read
the ownership section.

Owner: S. M. Shafayat Islam. Short, plain replies. Not a beginner.

**First: `engine/node_modules` is gitignored and the repo was just re-cloned, so it is missing.** Run
`npm install` in `engine/` if you touch anything needing three.js (you probably will not).

---

## The bug, in the app's own words

Building a real deck, Lumi told the owner:

> *"Your report is a scanned copy, so the check can't read its numbers. I've noted that 'ME 400' comes from the
> cover page, and I'll do the same for every number on later slides."*

The owner: *"if any document is image based claude cant read them, make sure claude can extract both text and
images from every kind of files user uploads."*

This is not a cosmetic problem. Lumi's provenance system (B-05) **fails a number that appears in no file**, so a
student whose thesis is a scanned PDF gets a deck that cannot cite its own source document. The quality gate and
the extraction gap work against each other.

## What already exists — read it before planning anything

`engine/tools/extract_text.py` (299 lines) already handles PDF, DOCX, PPTX, XLSX and loose images, and **it
already saves embedded images** to `<out>/<file>.images/`. So "extract images too" is largely done.

**The actual gap is OCR.** A scanned page is one big picture with no text layer, so `pypdf` returns almost
nothing. The shipped Python packages are `pillow, python-pptx, imageio-ffmpeg, python-docx, openpyxl, pypdf`
(`setup/aura.config.json`) — **no OCR engine of any kind**.

## Two routes. Work out which is right, with evidence, before building

**Route 1 — ship an OCR engine.** Tesseract via `pytesseract`, or `ocrmypdf`. Real text output, works offline,
no model cost. But: Tesseract is a **binary**, not a pip package — it has to be installed and found on Windows,
it is tens of MB, and the installer is already 18.8 MB. Measure what it does to install size and first-run time
before you commit. Check the licence is compatible with shipping (Tesseract is Apache 2.0; confirm for whatever
you actually bundle).

**Route 2 — let Claude read the page.** Lumi already renders and saves page images, and the Claude that builds
the deck **can see images**. Hand it the page pictures instead of OCR text. No new dependency, no binary, and it
reads tables, figures and handwriting far better than Tesseract. The provenance system already has a
first-class concept for exactly this: `kind: "figure"` with a `readFrom` region, which exists because a number
read off a picture by eye is a legitimate, citable claim.

Route 2 looks stronger to me and it fits the architecture, but **it is your call and I want the measurement, not
my guess.** Route 2's costs are real too: images are expensive in tokens, and a 40-page scanned thesis cannot all
go into context — so it needs a story for *which* pages get looked at and when.

Whatever you choose, these must hold:
- **Every upload type the app accepts** ends with usable content, or a plain warning saying what could not be read
  and what the person can do. Silence is the current failure.
- **A scanned number stays citable.** It must land somewhere `deck_check.js` accepts, so the deck passes honestly
  rather than by loosening the gate. **Do not weaken B-05** to make scans pass.
- **Offline.** Lumi runs on one machine with no service calls. Nothing may require an API key or a network round
  trip to a third party.

## D2. Let Lumi learn the subject from the web, not only from the upload

The owner: *"while reading reports, let claude go to web to find more contexts, images and idea about the topic,
that's how lumi would be able to make slides that makes sense."*

They are right about the cause. A deck built only from a thesis PDF knows the person's words but not the thing
the words are about. That is why slide figures come out wrong - the orange block with cartoon clouds that was
supposed to be a finned rear-door heat exchanger (Part E) was drawn by a Claude that had never seen one. Letting
it look first is the fix.

**Three rules decide whether this helps or ruins the deck. Build them in, do not bolt them on.**

**1. The web is for UNDERSTANDING. It is never a source of slide content.**
Reading about rear-door heat exchangers so the model has the right fin pitch, header and airflow direction: yes,
and that is the whole point. Pasting a web image onto a slide, or putting a number found online into a figure:
no. The deck's content comes from the person's files. This is not fussiness - B-05 exists because a number that
cannot be traced is a number that can embarrass someone in a viva, and an unattributed image in a thesis is a
copyright problem the owner has already ruled out once ("restrict deck assets to the user's own uploads").
A genuinely published value may still appear **if** it is cited properly: `kind: "published"` with a real `cite`,
which `claims.js` already supports. Research that reaches a slide must land in `provenance.json`, like everything
else.

**2. Do not send the person's unpublished work to a search engine.**
This is the one that can actually hurt them. Searching *"scramjet cavity hydrogen mixing"* is fine. Pasting their
abstract, their results, their measured values or their figure captions into a query publishes unpublished
research to a third party, and the person never agreed to that. **Queries are built from the TOPIC, not from the
document.** Derive short, generic search terms; never forward file contents verbatim. Write down in
`docs/STATUS-D.md` exactly what leaves the machine.

**3. Narrow tool, not a shell with the internet.**
`engine/rules/permit.js:51` denies `curl`, `wget`, `Invoke-WebRequest`, `scp`, `ssh` and the rest, because the
Claude building a deck runs with `--permission-mode acceptEdits` on the owner's own machine. That gate stops a
confused or injected Claude from uploading their files. **Do not loosen it.** `permit.js:303` already allows a
toolkit script, so build a dedicated one (`engine/tools/research.py` or similar) that performs the search and
returns text, with GET-only behaviour, a timeout, a size cap, and a cache. **Part E is building the same shape of
thing for PolyHaven assets (`fetch_asset.py`, see its §E3) - talk to them through `docs/REGISTER-D.md` so there
is ONE network policy in Lumi, not two that disagree.**

**Offline must stay a normal state, not a failure.** No network means Lumi builds from the files alone, says so
in one plain line, and carries on. The packed deck is offline regardless - research happens while building, never
at view time.

**Where it plugs in.** The interview (`interviewing.md`) is the natural first moment: Claude has just read the
files and knows what it does not understand. The build step is the second, when a figure needs to be right. Both
step messages live in `form_server.py` (**Part B's file** - route through `docs/REGISTER-D.md`), and the skill
guidance lives in `workspace/.claude/skills/aura-slide/` (**Part E's** - same route).

**Judge it the way the owner will.** Build one real deck slide about something the uploaded file mentions but does
not explain, with research on and off, and compare. If the researched version is not visibly better, say so -
that is a useful finding, not a failure.

## Where it lives

- `engine/tools/extract_text.py` — the extractor
- `engine/form_server.py` — `ensure_extracted()`, the manifest (`read_manifest`), `stale_sources`, and the step
  messages that tell Claude which extracted text to read. **`form_server.py` belongs to Part B**; put the exact
  edits you need into `docs/REGISTER-D.md` rather than editing it, unless Part B has finished.
- `setup/aura.config.json` → `pythonPackages` if you add one
- `engine/tools/lib/claims.js` and `deck_check.js` for how a figure-read number is accepted today

---

## What you own

- `engine/tools/extract_text.py`, and new files you create under `engine/tools/` (the OCR path and the
  research tool)
- the upload handling in `engine/form/js/uploads.js`
- `setup/aura.config.json` (the package list only — **not the version field**, the coordinating session owns that)
- tests you add under `tools/form-dev/`

**Do not touch:** `engine/form_server.py` (**Part B** — use `docs/REGISTER-D.md`); `engine/form/js/{editor,
workshop}.js` (**Part C**); `engine/form/js/{lumi-art,home,looks,loading}.js` (**Part A**); `engine/deck/**` and
`workspace/.claude/skills/**` (**Part E**); `RESUME.md`, `BACKLOG.md`, `FIXLOG.md`, the rest of `docs/`.

Yours in docs: `docs/CLAIM-D.md`, `docs/STATUS-D.md`, `docs/REGISTER-D.md`.

---

## Rules

1. **Never commit, push, tag, publish, or bump the version.**
2. **Never touch `C:\Lumi`** except to read. It has the owner's real decks in it.
3. **Never weaken `engine/rules/permit.js`** — it is the security gate around headless Claude. If OCR needs to run
   a binary, that is a design question to raise, not a hole to widen.
4. **Ask before running `test_server.py`** — another session may be testing.
5. **Sandboxes in `X:\aura-dev-d\`**, never inside the repo.
6. Write files with the Write tool, not bash heredocs.
7. **Test with a real scanned document**, not a clean PDF. A clean PDF proves nothing here — it is the one case
   that already worked.

## Report

10 lines to the owner, leading with the route you chose and the numbers behind it. `docs/STATUS-D.md` as you go,
with the verdict first. Say plainly anything in this brief that turns out to be wrong when you read the code.

Claim it first: `docs/CLAIM-D.md`.
