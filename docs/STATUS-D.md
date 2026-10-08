# Part D — status

## Verdict (D1, scans): neither route alone. Windows' own OCR for the text, Claude's eyes for the numbers.

- **OCR engine: Windows.Media.Ocr**, built into Windows 10/11. Not in the brief's two routes. **0 MB** added to the
  installer, offline, no binary, no licence question, no API key. Called through Windows PowerShell 5.1 by the server
  during extraction, never by Claude, so `permit.js` is not touched. Tesseract was not downloaded: it would cost tens
  of MB and a binary to find on PATH. Windows OCR does the same job for free, so there was nothing left for Tesseract
  to win.
- **Page drawing: `pypdfium2`** (new pip package, 3.9 MB wheel, Apache-2.0/BSD-3). It draws any PDF page at 2000 px,
  including JBIG2/CCITT office scans that pypdf cannot decode (today those are dropped without a word). Without it,
  the extractor falls back to the scan embedded in the page.
- **Route 2 is still needed for numbers.** Machine reading gets prose right and table digits wrong, sometimes
  *silently* wrong. So the text is the **index** (search it to find the page) and the page picture is the
  **evidence** (read the number there). Claude looks only at the pages a slide needs, about 2k tokens each.

## Measured on the owner's real scan

`C:\Lumi\...\Thesis Predefence By Parag Mollick.pdf`: 12 pages, CamScanner, 22.8 MB. A copy is in `X:\aura-dev-d\scan\`.

| | before | after |
|---|---|---|
| text extracted | 326 chars (the word "CamScanner" x12) | 22,847 chars |
| flagged as scanned | **no** (the watermark beat the threshold) | 12 of 12 pages |
| time | ~1 s | 9.9 s for 12 pages (~0.8 s/page) |
| pictures on disk | 26 MB (12 raw scans + 12 logos) | 4.7 MB (12 drawn pages) |
| page 5 spot-check, 20 values | — | 16 found; prose all right; table cells partly wrong |

Errors that matter: `12.70` read as `12.10` and `3.0059` as `3.0039` (both silently wrong); decimal points dropped
(`3.0329` became `30329`). Grayscale, autocontrast and upscaling did not fix the table. Drawing the page at 2000 px did
fix `1.2043`, which the raw camera JPEG had misread as `12043`.

## What now reads, by upload type (fixtures: `X:\aura-dev-d\make_fixtures.py`)

| type the app accepts | result |
|---|---|
| PDF with text | as before; pages with almost no text are drawn and machine-read too |
| scanned PDF | every page drawn + machine-read; manifest gains `scanned`, `pagePictures`, `ocr` |
| .docx / .pptx with pasted pictures (screenshot of a table) | pictures of 250k px and up are machine-read into the text (largest 40 first) |
| .potx | now read (was "not read (unknown kind)", without explanation) |
| photos .jpg/.png/.webp/... | machine-read if they hold text; size noted |
| .svg | its `<text>` labels pulled out (before: only "look at it directly") |
| .heic | Windows decodes it and saves a JPEG copy Claude can open. **Untested end to end**: this PC lacks the HEVC codec. The failure path is tested and gives a plain fix |
| .doc / .ppt / .xls | unchanged plain warning: ask for the new format |
| no OCR language on the PC | plain warning: look at the page pictures, or ask for the original file |

Time budget: 100 s of machine reading per extraction run (the app gives the whole run 150-300 s). Anything past it
gets a warning, never silence.

## The gate (B-05): new provenance kind `scan` (owner's choice, 2026-10-08)

Before this, a correct number read off a scanned page (`3.0059` from Table 1) **could not pass `deck_check`
honestly**:
- `source` fails, because the machine-read text does not contain it;
- `figure` requires the picture **on the slide** (`claims.js` checks `shown.length`).

The owner picked a new kind: `{"kind": "scan", "file": "Report/thesis.pdf", "page": 5}`.
- It passes only if the manifest lists that page as scanned. It fails on a text file, on a page that is not scanned,
  and with no file or page.
- The speaker notes must say "read off scanned page N".
- It always warns "read by eye", and shows what the machine reading has nearby (for example `"30329"` for `3.0329`), so
  a person can compare the two.

B-05 is not weakened: an undeclared scanned-page number still fails. `deck_check.js` is unchanged, because
`loadCorpus()` carries the scans. Tests: `t_scan_claims.js` 12/12, `t_deck_corpus.js` passes,
`test_instructions.py` 117/117.

## Verdict (D2, web research): built, narrow, and offline stays normal

`engine/tools/research.py` (Claude runs it as a toolkit script; `permit.js` allows it with no change; `WebFetch` and
`WebSearch` stay denied) with three verbs:
- `read`: Wikipedia text, 2 articles, 5,000 characters each;
- `look`: Wikimedia Commons reference pictures, 640 px with **REFERENCE ONLY - NOT FOR SLIDES** burned in;
- `papers`: OpenAlex results with author, year, venue and DOI, ready for `kind: "published"`.

No key anywhere. A general web search with no API key does not exist legitimately; scraping a search engine would
break its terms and fail unpredictably. These three cover "context, images and ideas".

**What leaves the machine** (rule 2), exactly:
- GET requests to `en.wikipedia.org`, `commons.wikimedia.org`, `upload.wikimedia.org`, `thumb.wikimedia.org` and
  `api.openalex.org`, carrying the query and nothing else;
- every request is logged whole to `.aura/temp/net-log.txt`;
- the query is refused before sending if it: is over 8 words or 80 characters; has a decimal or a run of 5+ digits;
  contains a name word from any deck's identity (presenter, supervisor, institution; generic words like
  "engineering" excepted); or shares 6 words in a row with any of the person's extracted files (this catches the
  thesis title).

**Narrow door** (rule 3): `engine/tools/lib/lumi_net.py`, proposed as the one policy for D and E (REGISTER-D D-R7).
https and GET only, hardcoded hosts, redirects off the list refused, 15 s timeout, size caps, 7-day cache.
Offline or switched off (`LUMI_RESEARCH=off` or `.aura/research-off`) prints one line and exits 0.

**Quality, measured**: search results can be junk. Wikipedia's second hit for "wavy fin heat exchanger air side" was a
cemetery. Commons for "rear door heat exchanger" returned an 1888 forestry book scan and a clan crest. A wrong picture
teaches a wrong shape, so results are now dropped unless they carry the query's words, and Commons titles must carry
one too. Commons has **no** usable RDHx picture: `look` now honestly says "nothing found". `read` is the strong verb.
For RDHx it explains the real construction (it replaces the rack's rear door; server exhaust passes the coil and
returns to the room cooler).

Tests: `test_part_d_research.py` (offline by default, `--live` adds 4 network checks): 20/20 with `--live`.

**On vs off, judged on one figure** (`X:\aura-dev-d\compare\off.svg`, `on.svg`, `on.png`, `both.png`). Two agents got
the same prompt ("draw the RDHx as this slide's main figure"), the same OCR'd thesis pages, and Read/Write only. One
also got `research.py read` and `look`.
- **Both are correct** on the basics: the coil sits in the rack's rear door, the servers' exhaust passes through it,
  and chilled water comes in and goes out. Neither is the "orange block with clouds".
- **With research it is somewhat better, not dramatically**: an inset of the coil face (copper tubes, U-bends, dense
  fins), and air shown warming as it crosses the servers. Without research, the agent said it guessed the tube layout
  and the water routing.
- **Why the gap is small**: this thesis's own introduction already explains what an RDHx is ("a chilled-water
  fin-and-tube coil directly at the cabinet outlet"). The brief's real test is a thing the file mentions but does
  NOT explain. This was not that test, and it is still owed, with a different source file.

## Wrong in the brief

1. "Lumi already renders and saves page images": it does not render anything. It saved the pictures *embedded* in a
   page; a JBIG2/CCITT scan gave nothing, and so did a page whose figure is vector-drawn.
2. "`kind: figure` ... exists for exactly this": it requires the figure to be visible on the slide (above).
3. The "scanned" warning existed but never fired on the real file: a per-page watermark defeated it.
4. Manifest paths break when a draft becomes a deck (REGISTER-D D-R1). The owner's live deck has this.

## Files

- `engine/tools/extract_text.py`: OCR, page drawing, picture OCR, .potx, .svg, .heic, per-page scan detection
- `engine/tools/lib/claims.js`: kind `scan` (owner approved)
- `engine/tools/research.py`, `engine/tools/lib/lumi_net.py`: new
- `engine/form/js/uploads.js`: the Report box's file picker now also takes photos of pages (`image/*,.heic`); its hint
  is "pdf, word or photos"
- `setup/aura.config.json`: `+ pypdfium2` (package list only)
- tests: `tools/form-dev/test_part_d_extract.py` (16), `t_scan_claims.js` (12), `test_part_d_research.py` (16, +4 live)
- `docs/REGISTER-D.md`: D-R1 manifest move fix (B), D-R2 tell Claude about scans (B), D-R5 research moments and off
  switch (B), D-R6 skill text (E), D-R7 one network policy (E)

## Not done

- `test_server.py`: not run. The brief says to ask first.
- The upload screen was not rendered at 1366x768 / 1920x1080 after the hint change (it is two words longer).
- A real `.heic` from an iPhone: untested here (no HEVC codec on this PC).
- Nothing reaches Claude until B applies D-R2 / D-R5 and E applies D-R6. Until then, scanned text is in the corpus
  and the manifest, but Claude is not told to look at the pages or to research.
