# Per-slide vs shared conversation — measured on deck b45622aef312

**Verdict: keep one conversation per slide. It is cheapest at every deck size tested, and there is no
crossover.** A single shared conversation costs 6–152% more depending on how generously it is modelled, and the
gap widens with deck size. Cost is the *least* important of four reasons.

Source: the 15 transcripts at `C:\Users\shafa\.claude\projects\C--Lumi\<sessionId>.jsonl`, deduped by
`message.id`. Simulator validated against reality: replaying the current topology returns $21.69 vs $21.53
actual, +0.7%.

---

## 0. This corrects the post-mortem — it double-counts turns by 2.24x

Claude Code writes **one JSONL line per content block**, and every line of a multi-block assistant message
repeats the *same* `usage` object. Verified on s1: 33 distinct `message.id` values across 82 `type:"assistant"`
lines, all duplicates byte-identical.

| metric | post-mortem (line-level) | corrected (dedup by message.id) | factor |
|---|---:|---:|---:|
| assistant turns | 892 | **397** | 2.25x |
| cache write | 3,642,713 | **1,478,649** | 2.46x |
| cache read | 71,399,284 | **32,123,788** | 2.22x |
| output | 737,091 | **270,969** | 2.72x |
| total units | 75,780,876 | **33,874,202** | 2.24x |

**The $22.99 is correct** — it came from the CLI's own `cost-state.totalCostUSD`, not from those token sums.
Applying $4/M in, $20/M out, $0.20/M cache read and **$8/M cache write** to the deduped counts reproduces the
per-slide dollar column to the cent.

**Cache-write rate is $8/M (2x input), evidenced not assumed:** every `usage` object carries
`"cache_creation": {"ephemeral_1h_input_tokens": N, "ephemeral_5m_input_tokens": 0}` — Claude Code used the
**1-hour** cache exclusively, priced at 2x input.

---

## 1. Where the money actually goes — the post-mortem's conclusion inverts

| component | tokens | $ | share of slide cost |
|---|---:|---:|---:|
| **cache WRITE** (1h, $8/M) | 1,347,612 | **$10.78** | **50.1%** |
| cache READ ($0.20/M) | 28,285,635 | $5.66 | 26.3% |
| output ($20/M) | 254,450 | $5.09 | 23.6% |
| fresh input | 734 | $0.003 | 0.01% |

By *tokens*, 95.5% are cache reads. By *dollars*, **cache write is the single largest line item**, because 1h
writes cost 40x what reads cost. **The deck is expensive because of how much context it BUILDS (~96K new tokens
per slide), not how often it re-reads it.** That reframing is what kills the shared-conversation idea: sharing
attacks re-reads, which were never the expensive half.

Measured structure:
- **Base prefix** (system prompt + tool defs + CLAUDE.md) = **36,153 tokens**, identical across all 15
  conversations (least-squares intercept, residual sigma 549).
- **16,267 tokens of that were a free global cache hit** on every conversation's first turn, identical in all 15.
  So a new conversation's genuine cold start is only ~20K written tokens ~ **$0.16**.
- **Mean history left behind per slide (`Hfinal`) = 72,682 tokens.** That is what a shared conversation must
  carry forward 13 more times.

---

## 2. The counterfactual, modelled

| topology (14 slides) | cache read | max ctx | compactions | cost | vs actual |
|---|---:|---:|---:|---:|---:|
| **actual, 14 separate** | 28,285,635 | 140,169 | 0 | **$21.53** | — |
| shared, no context limit (physically impossible) | 187,617,070 | **1,086,062** | 0 | $51.17 | **+138%** |
| shared, compact @300k | 62,110,912 | 313,081 | 4 | $28.57 | +33% |
| shared, compact @200k | 45,019,831 | 211,202 | 6 | $26.40 | **+23%** |
| shared @200k + all duplicate reads eliminated (most generous) | — | — | 6 | $22.87 | **+6%** |

**Both effects quantified, as they pull opposite ways:**
1. **Preamble saving favours shared: $0.33.** Real, and tiny (40,659 repeated tokens x $8/M).
2. **The cache-hit rate does rise — and it does not help.** Actual 95.45% -> shared@200k **97.07%**. But the
   denominator grows faster: reads go 28.3M -> 45.0M (+59%), or 187.6M (+563%) unconstrained. **A higher hit
   rate on a 5x bigger prefix is a worse deal.**
3. 14 cold starts cost ~$2.2 total, and the 16,267-token global hit is free either way.

**TTL sensitivity — this matters for how the owner works.** The usage records show 1-hour cache only. One gap in
this build exceeded it: **s5 ends 22:16Z, s6 starts 03:15Z — 300 minutes.** Costs nothing today (s6 is a new
conversation anyway); under shared it forces a full prefix re-write, **+$3.04**, making shared@200k +37%.
**Shared is only *not* worse if a whole deck is built in one uninterrupted sitting.** This owner does not work
that way.

Compaction-summary sweep @200k: 6K -> $25.17 · 12K -> $26.40 · 20K -> $29.24 · 30K -> $31.20. Shared loses
across the whole range.

---

## 3. Scaling — no crossover

| N slides | per-slide | shared, no limit | shared @200k |
|---:|---:|---:|---:|
| 4 | **$6.00** | $8.02 (x1.34) | $7.22 (x1.20) |
| 14 | **$21.53** | $51.17 (x2.38) | $26.40 (x1.23) |
| 30 | **$46.69** | $211.22 (x4.52) | $58.11 (x1.24) |

Per-slide scales linearly at **$1.538/slide**. Shared-without-limits scales quadratically. Shared-with-compaction
looks flat only because **compaction is per-slide topology wearing a disguise** — it throws history away every
~2 slides and keeps a lossy 12K summary instead of a clean 5K preamble, paying a full-context read for the
privilege.

Cache reads would need to cost **$0.014/M instead of $0.20/M — 14x cheaper** — before shared won. That pricing
regime does not exist.

---

## 4. The three reasons that outrank the money

**(a) Shared cannot physically hold the deck.** It crosses 150,000 during slide 2, the 200,000 model window
during **slide 3**, 300,000 during slide 4, and ends at **1,086,062 tokens — 5.4x the window**. Today no slide
conversation came close: max 140,169 (s8) = **47% of `SLIDE_CTX_RESET`**. Shared needs 6–9 handoffs per deck,
each replacing ~145K of exact history with a 12K paraphrase — so "match slide 3's style" would be reading a
summary of slide 3, not slide 3.

**(b) Shared forecloses parallelism — the decisive argument.** `docs/parallel-slides-spec.md` rests on each lane
resuming its own `slideConvs[id]`. A shared conversation is strictly serial. This build ran 8 h 33 m elapsed at
**23% machine time**, the largest single block being a 2,717 s render with Claude idle. Going shared would cost
the ~23% money penalty *and* forfeit a 2–3x wall-clock win.

**(c) Blast radius.** A lost conversation today costs **one slide — at most 35 turns and $2.13**. Shared: the
whole deck, $21.53 and 397 turns. "Rebuild slide 9 only" is a first-class operation today; under shared it is
surgery on a 1M-token transcript.

---

## 5. Hybrids lose too — modelled, not assumed

| grouping | cost | vs actual |
|---|---:|---:|
| groups of 1 (today) | $21.69 (model) | baseline |
| groups of 2 | $22.39 | +4% |
| groups of 3 | $24.53 | +14% |
| text slides shared, 3D separate | $22.67 | +5% |

Even sharing two consecutive text slides loses money, because `Hfinal` is barely smaller for text slides
(s3 53,486) than for 3D ones (s8 98,824). A "cheap" slide still leaves ~70K of history behind. Not worth the
branching complexity in the runner pool.

---

## 6. Where the real money is — bigger than the whole topology question

397 turns, mean **26.1 per slide** (range 19–35). Not obviously bloated. But the tool mix is:

| tool | calls | share |
|---|---:|---:|
| Read | 167 | 34% |
| Edit | 117 | 24% |
| Grep | 110 | 22% |
| Bash / PowerShell / Glob / Write / Skill | 95 | 20% |

**61% of all tool calls (299 of 489) are read/search — re-discovery, not production.**

**90.6% of characters read were repeats**: 1,623,796 of 1,793,071. ~549,000 tokens of re-read file content.

| file | read in N convs | total reads | cost |
|---|---:|---:|---|
| `…/build/…-b45622/index.html` | **14** | **22** | 55,866 ch each ⇒ **~415K tokens** |
| `skills/aura-slide/building.md` | 13 | 13 | ~65K tokens |
| `SKILL.md` / `provenance.json` / `manifest.json` / `BLENDER.md` | 4–10 each | 33 | ~70K tokens |

### Three changes that beat the topology question outright
1. **Stop re-Reading the whole `index.html`.** 22 full reads ≈ 415K tokens ≈ **$3.3** — the largest single
   avoidable item, bigger than the entire shared-vs-separate difference. Give the slide agent a
   `read_slide_section(id)` tool, or a per-slide scratch file built in isolation before packing.
2. **Inline the static skill text into the preamble / pinned prefix** instead of letting Claude Read it.
   ~135,336 tokens of redundant static reads. Same bytes, but landing in the prefix at a known position rather
   than arriving mid-conversation after a wasted turn.
3. **Cap Part A of `build_message`.** It grows 5,855 -> 11,800 chars accumulating "how the slides already built
   were made" — 40,659 repeated tokens per deck. Cap at the last 2–3 slides so the preamble stays a fixed size
   as decks grow.

Combined, (1)+(2) are worth **$3–5 on this deck — 2 to 4x the entire shared-vs-separate delta** — and cost
nothing in context safety, parallelism or blast radius.

---

## 7. Limits of this study
- A shared conversation's **output** could not be measured; the model assumes it unchanged, which is
  conservative **in shared's favour** (longer contexts produce longer turns, and output is 23% of actual cost).
  Shared's true cost is likely higher than every figure here.
- The 12,000-token compaction summary is an estimate — no compaction occurred in this build. Swept 6K–30K.
- Prefix-invalidation-by-edit was not observed and is not priced; it can only hurt shared more.
- The deck conversation ran Sonnet-5-5; all 14 slide conversations ran Opus-5-5. Slide comparisons are pure
  Opus-vs-Opus.
