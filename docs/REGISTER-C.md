# Register — Part C's requests to other parts

## For Part B — `engine/form_server.py`

### C-R1. `reply_conv()` was not switched over to one conversation (bug, not a request for a feature)

**Where:** `reply_conv()` at `form_server.py:4404`, used at `form_server.py:7018`.

`ONE_DECK_CONVERSATION = True` nulls `conv` inside `RUNNER.launch()`, which is the right place for
the run itself. But `/api/claude/reply` computes `conv = reply_conv(...)` *before* calling `launch()`
and then branches on it:

```python
conv = reply_conv(deck_id, slide, scope)        # still returns a slide id
if conv:
    slide = ids.index(conv) + 1
    mine = conv_of(rec, conv)
    handoff = bool(mine.get('sessionId')) and int(mine.get('ctxTokens') or 0) >= SLIDE_CTX_RESET and not RUNNER.waiting
else:
    handoff = deck_handoff(rec)                 # <- never reached for a slide-scoped message
```

Consequences, all for a slide-scoped message (which, after Part C's change, is the common case —
most messages are now inferred as being about the open slide):

1. **The deck conversation is never context-reset.** `handoff` is decided from that *slide*
   conversation's `ctxTokens`, which no longer grows, because no slide conversation ever runs again.
   `deck_handoff(rec)` — the L-17 reset that keeps the one conversation bounded — is skipped. On a
   long deck this is the conversation growing without a ceiling.
2. **`meta['scope']` is recorded as `'slide'`** for a run that in fact happened on the deck
   conversation, so `after_run()` and anything reading run history get the wrong scope.
3. A stale per-slide `sessionId` on an old deck record can still make `handoff` true for the wrong
   reason.

**Suggested fix** (yours to make or to reject — one line, same shape as `launch()`'s):

```python
conv = None if ONE_DECK_CONVERSATION else reply_conv(deck_id, slide, scope)
```

`slide` is still resolved by `reply_slide()` above it, so the `[slide n]` prefix at
`form_server.py:7032` is unaffected — which Part C depends on, see below.

### C-R2. The `[slide n]` / `[whole deck]` prefix must stay

`form_server.py:7032` is now the *only* channel carrying which slide a message is about. Part C's
whole UI rests on it. Please keep it, and keep `/api/claude/reply` accepting `slide` and `scope`
with the current meaning (`scope: 'deck'` → `slide = None`). No change wanted — recorded so it is
not removed as dead weight along with the toggle.

### C-R3. (optional, not blocking) a slide on Claude's own events

`say` and `tool` events carry no slide, so Part C attributes a turn to the slide of the `user` event
that opened it. That is correct for chat turns but guesses for a build run that moves slide to
slide. If `RUNNER.add()` ever stamps its events with `self.slide`, Part C will use it and drop the
inference. Nothing needed now.
