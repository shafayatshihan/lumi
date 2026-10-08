# STATUS — Package D (app-wide copy pass)

Updated 2026-10-08. Strings only. No commits. `node --check` passes on every touched file.

## How the counts were made
A script extracts every string literal from `engine/form/js/**/*.js` (plus text and aria/title/placeholder attributes in `index.html`) and counts the words in strings of 2+ words. It drops console lines, CSS-like strings (transforms, px, fonts, url()) and class-name lists. A few class-name strings still get through, but they're the same before and after, so the deltas are exact. The script's figures include error text, which is exempt and was barely cut, so the percentage under-states how much the prose shrank.

## Done — words before → after
| screen | file | before | after | cut |
|---|---|---:|---:|---:|
| plan page | plan.js | 983 | 836 | −147 |
| build page shell / editor | editor.js | 677 | 537 | −140 |
| render cards | blender.js | 489 | 427 | −62 |
| finalize | finalizing.js | 436 | 378 | −58 |
| uploads | uploads.js | 264 | 217 | −47 |
| build chat | workshop.js | 598 | 559 | −39 |
| home + library | home.js | 243 | 205 | −38 |
| start | start.js | 139 | 101 | −38 |
| interview | interview.js | 107 | 83 | −24 |
| loading / sign-in | loading.js | 308 | 293 | −15 |
| usage | usage.js | 34 | 29 | −5 |
| narrow-screen notice | index.html | 50 | 47 | −3 |
| build scene, edit bench, work scene | scenes/*.js | — | — | "!" removed only |
| **total** | | **5206** | **4590** | **−616 (−12%)** |

Reviewed with nothing to cut: scenes/talk, people, audience, results, review, extras, files; quality.js, update.js, app.js, markers.js. Those are already 2–4-word labels or exempt error/empty text.

## What changed, in kind
- Second sentences that explained the next step or reassured are gone: "have a look", "change anything you like, then finalize", "claude will build it with the others", "your finished slides are safe", "this page notices by itself", "copy them anywhere you like".
- Picture/extra/motion descriptions (plan.js, editor.js) cut to their noun phrase: "your numbers drawn as bars or lines, so the pattern jumps out" → "your numbers as bars or lines".
- "tokens" and "Claude Code usage" removed from visible text (blender render lines, free-plan note), except `iterLine` (see REGISTER §3).
- Blender named once with its explanation, as the brief asks: "a photo-real picture, made with Blender."
- Exclamation marks removed (`your slides are ready`, `all done`, `signed in`, `all set`, `slide 3 updated`, `bright idea, ready`). "please" removed from the narrow-screen notice and the usage-limit error.
- Two text-only elements were removed outright, not shortened: the home lead line ("open one to change it with claude, or start something new.") and the plan intro's lead and button subline. Both were pure text leaves. `.pl-intro-l` in plan.css is now unused (left in place).
- aria-labels deliberately left descriptive: `mouse pointer: switch between…`, `more: rename, archive or delete`, `message to claude`, `what claude is doing`. Only the visible `title` tooltips were shortened.
- Errors were left as they were apart from dropping "please". All of them already say what happened and what to do.

## Not verified visually — needs a look on the real app
The static dev server can't get past the loading screen ("lumi's helper stopped running"), so home, plan, build, editor and finalize can't be seen without `form_server.py`. `dev/play.html` is the waiting-game harness, not the build-page states. `dev/scenes2d.html`, `components.html` and `play.html` load with no script errors. Most cuts make lines shorter, so re-flow risk is low. **Check at 1366×768:** the plan intro without its lead line, the home left column without its lead, and the finalize "done" note.

## Kill list — recommend deleting (owner to approve)
1. **Home: the "your library" badge** above the "your decks" heading. It says the same thing twice.
2. **Build-the-rest confirmation** (editor.js): the dialog opens with "not recommended". If it's not recommended, consider hiding the button until slide 1 is approved rather than warning after the click.
3. **Finalize note during recording** ("lumi records each moving slide as video and makes a pdf backup."): the progress line already says "recording slide 3 of 9".
4. **`iterLine` token count** on render cards (REGISTER §3).

## Blocked on files I don't own
See `docs/REGISTER-COPY.md`: 4 test regexes (e2e_blender.js, test_frontend.mjs) and `FREE_NOTE` in form_server.py, plus 2 optional server strings.

## Left
Nothing in scope is unreviewed. The open item is the visual check above.
