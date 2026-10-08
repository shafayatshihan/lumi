# Register B — changes Part B made outside its own files, and requests to Part B

## Made by B in another part's file

### `engine/form/js/editor.js` (Part C) — `qualityWord()`, 3 lines added

**Why it could not wait.** B replaced the four quality tiers with three, and the default tier's id is now
`just-right`, which is not a word anyone reads. `editor.js` printed a tier by looking its id up in a local map
(`QUALITY = { best, maximum, balanced, fast }`); with the new ids that map returns nothing for the default and falls
through to `|| 'balanced'`, so **every new deck would have shown "balanced" when it is Opus/medium**. Leaving it was
shipping a wrong label on the build page.

**What changed.** Nothing of Part C's moved. One line added inside `qualityWord`, plus a comment:

```js
if (v && v.name) return v.name;      // the server now sends the tier's plain word (quality_view -> name)
```

The old map is kept on purpose, as the fallback for a record fetched by an older page.

**Part C:** keep that line through your rewrite of `editor.js`. If you would rather own it, the whole function can
become `deck.qualityView.name || ''` once nothing reads a pre-v2 record.

### `tools/form-dev/e2e_walk.js` (shared)

B's screens are walked there. Updated: the look step offers **three** tiers, not four; the tier names are asserted
(`just right / maximum / balanced`) and so is the recommended badge; the stage-overflow check now covers `.th-qual`
as well as `.th-left`, because `.th-qual` is its own band now; two new checks that the model and effort ticks are
really on top of everything (the owner's fault), and two on the plan page that nothing is drawn over the heading or
the cost lines and that nothing leaves the stage. **Not run** — see `docs/STATUS-B.md`.

### Tests B updated for the new tiers

`tools/form-dev/test_server.py`, `test_postmortem_b.py`, `test_batch_c.py`, `pmb_quality_test.mjs`. All pass except
two failures that belong to Parts C and D/E; both are named in `docs/STATUS-B.md`.

### New, B's own, not shipped (`tools/` is excluded from releases)

`tools/form-dev/_b_screens.html`, `_b_shot.js`, `_b_quality.py`, `_b_quality.json` — the render harness that found
and then proved out both faults.

## Requests to B from other parts

*(none yet — add them here)*

## What B changed in `engine/form_server.py`

B owns this file for this part. Everything B touched is the quality block and one call in `load_deck`:

- `QUALITIES`, `DEFAULT_QUALITY`, `QUALITY_NAME`, `QUALITY_TEXT`, `QUALITY_MODEL` — three tiers, Opus/medium default.
- `QUALITY_V`, `LEGACY_QUALITY`, `quality_v2()` — the one-time rewrite of a record written under the old vocabulary,
  by its (model, effort) pair rather than by its name. `load_deck()` calls it; `new_deck()` stamps `qualityV`.
- `norm_quality()` — an old name that is not a tier any more (`best`, `better`, `fast`) keeps its real pair.
- `quality_view()` — gained `name`.

Nothing else in the file moved. If another part needs a change here, add it below and B will make it.
