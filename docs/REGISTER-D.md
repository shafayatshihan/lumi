# Part D — register (edits for other parts' files)

Part D does not edit these files. Each entry is the exact change, ready to paste, with why.

---

## D-R1 · `engine/form_server.py` (Part B) — the manifest keeps naming the draft folder after it moves  **[bug, needed]**

`rename_files_folder()` moves `.aura/temp/draft-text` to `.aura/decks/<id>/text` (around line 423), but `manifest.json`
inside it stores absolute paths (`text`, `images`, `warnings`, and now `pagePictures`). After the move every path still
names `draft-text`, which no longer exists. Seen on the owner's real deck `42a8d8b6c8cd`: its manifest points at
`C:/Lumi/.aura/temp/draft-text/Report/...images/`. Claude is told to open page pictures at a path that is gone.

After `shutil.move(str(draft_text()), str(target))`, add:

```python
                mf = target / 'manifest.json'       # its paths named the draft folder: point them at the deck's own
                if mf.is_file():
                    a, b = str(draft_text()).replace('\\', '/'), str(target).replace('\\', '/')
                    mf.write_text(mf.read_text(encoding='utf-8').replace(a, b), encoding='utf-8')
```

(Paths are not made relative instead because `tools/form-dev/test_batch_e.py:114` and possibly other readers use
`Path(entry['text'])` directly.)

## D-R2 · `engine/form_server.py` (Part B) — tell Claude which files are scanned  **[needed]**

The manifest now carries, per scanned PDF: `scanned` (page numbers), `pagePictures` ({page: path to a 2000 px JPEG})
and `ocr` (the Windows OCR language, or `unavailable`). Machine-read prose is reliable; table digits are not (measured:
`docs/STATUS-D.md`). So Claude must search the text to FIND the page, then look at that page picture for any number.
That is also the answer to "which of 40 pages does Claude look at": only the pages a slide needs, found through the text.

New helper, next to `read_manifest`:

```python
def scanned_note(rec=None, rels=None):
    """D1: which of these files are scanned, and where their page pictures are. Machine-read text gets prose right and table
    digits wrong, so a number from a scanned page is read off the page picture, never the text alone."""
    hits = []
    for rel, e in sorted(read_manifest(rec).get('files', {}).items()):
        if rels is not None and rel not in rels: continue
        if isinstance(e, dict) and e.get('scanned') and e.get('pagePictures'):
            pics = rel_root(Path(next(iter(e['pagePictures'].values()))).parent)
            hits.append(f'`{rel}` ({len(e["scanned"])} scanned page(s); pictures `{pics}/page-NNN.jpg`)')
    if not hits: return ''
    return ('Scanned: ' + '; '.join(hits) + '. Their text is machine-read: search it to find the page, then Read that page '
            'picture and take every number from the picture, not the text (table digits are often misread). Look only at '
            'the pages you need.')
```

In `environment_line()`, append it to the returned line (covers the interview, the plan and every build step):

```python
    note = scanned_note(rec)
    return line + (' ' + note if note else '')
```

In `build_message()`, after the `'Source text for this slide is already extracted: ...'` element, the same note for
just this slide's sources (more specific than the environment line):

```python
    folder, rels = (rec or {}).get('filesFolder'), set()
    for src in slide.get('sources') or []:
        r = str(src).replace(chr(92), '/').lstrip('/')
        rels.add(r[len(folder) + 1:] if folder and r.lower().startswith(folder.lower() + '/') else r)
    note = scanned_note(rec, rels)
    if note: lines.append(note)
```

## D-R3 · `setup/aura.config.json` — done by D (package list only)

`pypdfium2` added to `pythonPackages` (3.9 MB wheel, Apache-2.0 / BSD-3; PDFium is BSD-3). Pip-installed at setup,
so the installer size is unchanged. Existing installs: `check_python()` will report it missing and offer the one-click
repair; until then `extract_text.py` falls back to the picture embedded in the page, so nothing breaks.
**Coordinator: the version field is untouched.**

## D-R4 · `engine/tools/lib/claims.js` — provenance kind `"scan"`  **[done by D, owner approved 2026-10-08]**

The owner chose a new kind over "no gate change" and over "show a crop of the page". `claims.js` was unowned, and D
edited it with the owner's approval. `deck_check.js` is untouched: `loadCorpus()` now also returns `scans` from the
manifest. B-05 is not weakened. A scanned-page number with no entry still fails, and `scan` fails on a file or page that
is not scanned. Tests: `node tools/form-dev/t_scan_claims.js` (12 checks); `t_deck_corpus.js` and
`test_instructions.py` (117/117) still pass.

## D-R5 · `engine/form_server.py` (Part B) — when Claude researches, and the off switch  **[needed for D2]**

`engine/tools/research.py` is a toolkit script, so `permit.js` already allows it (checked with `decide()`); the gate is
unchanged, and `WebFetch` / `WebSearch` stay denied (line 3045). What it needs from B is the two moments and a switch.

1. **Interview** (the `How to interview: ...` string, around line 4115). Add:
   ```
   'If the files rely on something you could not explain or draw from them alone, learn it before asking: '
   '`python .aura/engine/tools/research.py read|look|papers "<the subject in your own words>"`. It is for understanding: '
   'never a slide asset, never a number unless cited as provenance kind "published", and never their text, results or '
   'names in a query (the tool refuses those). If it answers offline or off, carry on from the files and say so once. '
   ```
2. **Build step** (`build_message`, after the plan-entry line), only when the slide's `visual.main` is a figure of a
   real object:
   ```python
   lines.append('If this figure shows a real object you have not seen, look before you draw: '
                '`python .aura/engine/tools/research.py look "<the object>"`. The pictures teach the shape; they are marked '
                'REFERENCE ONLY and never go on the slide.')
   ```
3. **Off switch.** In `child_env()` for Claude runs: `env['LUMI_RESEARCH'] = 'off'` when the person turns research
   off. (A setting toggle is A's or B's to design. Default on, as the owner asked.) Without a setting,
   `.aura/research-off` (an empty file) also switches it off.

## D-R6 · `workspace/.claude/skills/aura-slide/` (Part E) — teach the two new things  **[needed]**

- `building.md` line 28, in the provenance list: after `figure with figure + readFrom,` add `scan with file + page
  (a number read by eye off a SCANNED page whose machine-read text got it wrong; notes say "read off scanned page N"),`.
  Line 125's example gains `{"slide":6,"text":"3.0059 mm","kind":"scan","file":"Report/thesis.pdf","page":5}`.
- `enforcement.md`: a table row `A number read off a scanned page with no file/page, or citing a page that is not
  scanned (`not a scanned page`) | error | cite the scanned page, or use the number the text has`, and add
  `names no file and page | not a scanned file | not a scanned page` to the `<!-- checks: deck_check.js = ... -->`
  list (`test_instructions.py` enforces that the list exists in source; it already does).
- `interviewing.md`: one paragraph, the same wording as D-R5.1.

## D-R7 · Part E — ONE network policy  **[proposal]**

`engine/tools/lib/lumi_net.py` (new, D's) is the shared door frame: https only, GET only (no body exists in it), a host
allowlist the calling script hardcodes, redirects off the list refused, a timeout, a size cap, and every request logged
whole to `.aura/temp/net-log.txt`. `fetch_asset.py` already follows the same rules. Proposal: E switches its
`urllib` calls to `lumi_net.get(url, HOSTS, MAX_BYTES, 'fetch_asset')`, so both tools log to the same file and
cannot drift apart. E keeps its own `HOSTS`, magic checks and md5. If E prefers to keep its own code, the two
policies agree today on every point except the log.
