# Planning the deck (the app's "Plan your deck" page)

The Lumi app now plans a deck **before** anything is built. You write a plan file, the person checks it on a big,
simple page (drag to reorder, edit words, pick pictures, answer your questions), and only then are the slides built one at
a time (`building.md`). Planning and building are **one conversation**: you read the brief and the user's files once, here,
and every later message resumes this same session. Do not read the files again later unless a message asks you to.

You are planning when the message contains `[plan-mode]` (first plan, or "plan again from the start") or
`[plan-edit]` (a quick re-plan of a few slides). Never build or pack a slide while planning.

## The planning rule about questions (read this once)
**You may have questions while planning, and the plan page is where they are answered, as doubts. You never stop to ask.**
- Write `plan.json` first, with your best choice everywhere you are unsure. Then raise each real doubt as a
  `[[aura:choice …]]` line (below), each with a `default`. The page shows them; the answers come back to you as a
  `[plan-edit]` message.
- Never write `[[aura:ask]]` while planning and never end a planning turn without the plan file: the page cannot answer an
  `ask`, and the run would end with "the plan didn't come through" after you already spent the time reading the files.
- If your first plan turn ends without `plan.json`, the app tells the person Claude asked instead of planning; if it ends
  with doubts but no file, their answers bring a message asking you to write the whole plan then.

## First plan (`[plan-mode]`)
1. `[[aura:stage=read]]`. Read `.aura/brief/brief.md` and the user's files (`3 - Put your files here/`) the way
   SKILL.md step 1 says. Take notes for yourself in `.aura/temp/plan.md` (facts, numbers with their source, which file
   each comes from) so the build steps never need to re-read the files. Those notes are yours: the plan itself is `plan.json`.
2. `[[aura:stage=plan]]`. Pick the story arc (`story-arcs.md`). Suggest **10–16 slides** unless the brief asks for
   another number or the talk time clearly needs fewer or more. For Bold Blue, the look's slide types are the menu
   and its reference order is the default arc (`looks/bold-blue/LOOK.md`).
3. Write the plan file named in the message, `.aura/decks/<id>/plan.json`, in the shape below.
4. End your message with your doubts (below), then the plan marker as the very last line:
   `[[aura:plan path=".aura/decks/<id>/plan.json"]]`.

## The plan file
```json
{
  "title": "Deck title",
  "minutes": 10,
  "slides": [
    {
      "id": "s1",
      "title": "Short slide title",
      "point": "The one thing this slide must make the audience understand.",
      "bullets": ["2 to 4 short lines that will be on the slide", "..."],
      "visual": {
        "main": "3d",
        "companions": ["labels", "stats"],
        "detail": "detailed",
        "motion": "timed",
        "phrase": "a cut-away of the pump with water moving through it"
      },
      "sources": ["Report/thesis.pdf"],
      "notes": "optional: what the presenter should say (the build step writes the real speaker notes)"
    }
  ]
}
```
**Who owns which field.** You write only the fields in the first column group. The app owns the rest: it recomputes or
restores them from its own record every time it reads your file, so writing them changes nothing (and the app logs it).

| Field | Owner | Rule |
|---|---|---|
| `title`, `minutes` | you | `minutes`: whole number 1–600 (kept, not shown on the page yet) |
| `slides` | you | at most **40**; a longer list is cut and the cut is noted |
| `slides[].id` | you | `^[a-z0-9][a-z0-9-]{0,23}$`: lowercase letters, digits, dashes, at most 24 characters, unique. **Stable**: a new slide gets a new id, never reuse one; keep ids when you reorder. An unusable id is replaced and noted |
| `slides[].title` | you | ≤ 8 words (kept to 200 characters) |
| `slides[].point` | you | one sentence |
| `slides[].bullets` | you | **2–4** short lines, the words that will really be on the slide |
| `slides[].visual` | you | `main`, `companions`, `detail`, `motion`, `phrase`, optional `engine` (below); `phrase` is kept to 160 characters |
| `slides[].sources` | you | paths relative to `3 - Put your files here/` (empty if none); at most 6 kept (the page shows its picker for up to 3) |
| `slides[].notes` | you | optional; kept so you can re-read it, never shown on the page |
| `version`, `slides[].words` | app (derived) | `words` is counted from title + bullets; leave it out (an estimate you write is replaced). `version` is always 1 |
| `slides[].built` | app | `true` once the slide is built. You see it; you never set or clear it |
| `slides[].builtAt`, `status`, `editedAt`, and top-level `doubts`, `seq`, `lastChange`, `repairs` | app | not in the file you read; never write them. `status` (`queued`, `replanning`, `clear`, `doubt`) drives the page's pills |

Anything else you see in the file that this table does not describe is the app's: **leave it exactly as it is, never remove
it**. Doubts are never read from the file: they go only in `[[aura:choice]]` markers (below).
- The words on the slides stay inside the content-slide budget in the numbers table (`CLAUDE.md`); the page shows a word
  meter against it. Fewer is better.
- When the app asked you to fill an empty "suggested" slide and you leave its title empty, the slide is deleted again.
- No visuals are designed yet: `visual` only says **what kind** of picture, in plain words.

### One main picture per slide (the clash rules)
`visual.main` is exactly **one** of `3d`, `chart`, `diagram`, `photo`, `text` (text only: one big claim or quote).
A 2D canvas animation is a `diagram` (an illustrated, moving process; never a plain boxed flowchart).
`companions` may only be what that main picture's layout supports:

| main | allowed companions |
|---|---|
| `3d` | `stats` (≤ 3 numbers or facts), `checklist`, `labels` (projected labels on the model), `map` (a small map) |
| `chart` | `notes` (≤ 3 annotation chips) |
| `photo` | `zones` (rows of zones), `inset` (one inset picture), `marks` (overlay marks) |
| `diagram` | `steps` (short steps) |
| `text` | `quote` (one big claim or quote) |

Never put two main pictures on one slide (no `"main": ["3d", "chart"]`, no `chart` inside `companions`): make it two
slides. Lumi checks this too and will move a second main picture to its own slide and drop unsupported companions,
so get it right first time.
- `detail` (`simple` | `detailed` | `showpiece`) and `motion` (`still` | `timed` | `physics-like` | `simulation`)
  are only for `3d` (use `null` otherwise). Suggest `showpiece` for one or two slides at most; `simulation` only when
  real equations drive the motion. The person changes these on the page.
- `engine` (only for `3d`, optional): `"blender"` = a photoreal studio render (a still takes 1-2 min, an animation
  10-60 min, no live interaction) or `"threejs"` = live 3D (instant, animated, editable). Leave it out to let Lumi
  choose: in Bold Blue a still 3D figure becomes a Blender render when Blender is installed. Set it only when the brief
  clearly asks for one; the person picks it on the page.
- `photo`: only suggest it when the user has photos, or when a real photo is clearly the right picture; the build
  asks which photo each time.
- `chart`: only from the user's data, or textbook / published values with a source; otherwise say "illustrative" in
  the phrase. Never invent numbers.

## Doubts (question cards)
Ask about things you really cannot decide from the brief and files: which result opens the talk, which photo, a
missing number, how technical to be. Each doubt is the normal choice marker (syntax and limits: SKILL.md "App markers" and
"Asking questions") with **one extra attribute**:
- `scope="deck"` for a deck-wide question (it shows in a strip at the top of the page), or
- `slide="s3"` (the plan id) for a question about one slide (it shows as a badge on that slide).

```
[[aura:choice id="q1" scope="deck" question="Who will be in the room?" options="Examiners|Classmates|Both" multi="no" default="Examiners"]]
[[aura:choice id="q2" slide="s3" question="Which result should slide 3 lead with?" options="34% less water|Three times faster" multi="no" default="34% less water"]]
```
Every doubt has a sensible `default` (it is pre-selected, and used if the person never answers). At most 5 doubts in the first
plan, at most 2 per re-planned slide. Never ask what the brief already answers.

The person goes through several doubts one at a time ("next question"); only the last one has the button that sends
them all, and Enter in the text box never sends. **A later doubt whose options depend on an earlier answer must be
written as variants with `when`**, one per answer, all with the same `id`: `when="q1=2"` (the option's 1-based number or
its exact text; `q1=1|2` for several answers, `q1=2 & q3=1` for several conditions). Only the variant that matches shows,
and changing the earlier answer swaps it. Example: after "Who is in the room?" (`q1`), ask "How technical?" with its
own options for each audience:
```
[[aura:choice id="q2" scope="deck" when="q1=1" question="How technical should it be?" options="Full detail|Key equations only" multi="no" default="Full detail"]]
[[aura:choice id="q2" scope="deck" when="q1=2" question="How technical should it be?" options="Plain words|A little maths" multi="no" default="Plain words"]]
```
`depends="q1"` (optional) resets a question to its default when `q1` changes. Give a variant for every answer.

## Quick re-plan (`[plan-edit]`)
The person edited the plan on the page (their edits are already in `plan.json`), answered a question, or tapped
"Claude, suggest one here". The message lists exactly which slides to look at. Fast and small:
1. Read `plan.json` again (it changed). Do not re-read the user's files unless the edit needs a fact you did not note.
2. Re-plan **only** the listed slides: keep the words the person wrote unless they break a rule (word budget, one main
   picture, 2–4 bullets), fill what is missing, and apply their answers. For a suggested slide, fill the empty slide
   with the given id so the talk flows at that point.
3. Change another slide **only** if the edit really affects it (a point now repeated, an order that no longer makes
   sense). Lumi flashes every other slide you change, so do not touch slides for style.
4. Write the whole file back: same ids, same order unless the edit was about order, and every field you were not asked to
   change exactly as you read it (including any you do not recognise).
5. End with one line per re-planned slide: either `[[aura:plan-ok slide="s3"]]` (the page shows "✓ all clear") or
   new doubt markers with `slide="s3"`; then, last, the `[[aura:plan path="…"]]` line.

Keep your chat text to one short friendly sentence: the person is looking at the plan page, not a chat.
