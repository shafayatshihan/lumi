# Lumi (formerly Aura-Slide Studio): build contract, form v2, updated for v0.5

> **Status.** Sections 0-9 below are the v0.2/v0.3 contract and are still accurate for the screens, stage, theme,
> module layout, upload/Claude-run plumbing and the `choice` / `hint` / `done` markers. **Section 10 (v0.5) is newer
> and wins wherever it disagrees with anything above.** For exact behaviour the code is the authority:
> `engine/form_server.py` (routes, `DECK_ROUTE`), `engine/aura_markers.py` + `engine/rules/markers.json` + `engine/form/js/markers.js` (markers),
> `engine/deck/runtime.js` (header comment: the capture contract) and, for what Claude is told,
> `workspace/.claude/CLAUDE.md` plus `workspace/.claude/skills/aura-slide/{SKILL,planning,building}.md`.
> The product has been called **Lumi** since v0.4 (the repo and some filenames still say aura).

## 0. What the owner asked for (verbatim intent)

- The "form" is really an interactive web app that collects the brief. **Laptop landscape, no vertical scrolling
  anywhere** (the page never scrolls; panels may not scroll either, except the chat log in the workshop screen).
- **Interactive animations everywhere** so nobody gets bored. Live, playful, **highly detailed 2D and 3D
  illustrations** that react to what the user types and picks.
- **Drag-and-drop or upload files inside the app, sequentially** (one folder per screen).
- Ask whether the user wants **3D simulations** in the slides (yes/no) and **2D animations** (yes/no), plus a
  **slider for how much illustration and animation** they want. **Always pre-pick the most common answer** to save time.
- **Sounds and music: uplifting, happy lo-fi chill.**
- **Custom mouse cursor.**
- **Closing the page must ask for confirmation** (no accidental closing).
- **A button in the app does the whole job**: no VS Code, no typing "show your aura". Claude runs in the background
  and the page shows **live progress and a chat** for Claude's questions.
- **Theme: the creative-studio footer look** (section 3): pale lavender, the lavender character video whose eyes
  follow the cursor, Epilogue Black headlines, DM Sans text, pill badges, a spacious left / centre / right layout.
- "Use your own intelligence to make it as good as ever." Quality bar: delightful, polished, calm, professional.

Constraints: works **offline** (no CDN, no network at runtime), on **low-end Windows laptops** (Intel UHD graphics),
in current **Edge/Chrome**. **No build step**: plain HTML/CSS + native ES modules served by `engine/form_server.py`
(Python standard library only). Users are not technical: short, friendly, simple English. Never mention Truus.

## 1. Files and ownership

| Role | Owns (create/edit only these) |
|---|---|
| **core** | `engine/form/index.html`, `engine/form/css/app.css`, `engine/form/js/app.js`, `engine/form/js/start.js` |
| **gaze** | `engine/form/js/gaze.js`, `engine/form/js/cursor.js`, `engine/form/css/cursor.css`, `tools/form-dev/gaze.html` |
| **audio** | `engine/form/js/audio.js`, `tools/form-dev/audio.html` |
| **scenes3d** | `engine/form/js/scenes/three-kit.js`, `engine/form/js/scenes/welcome.js`, `.../style.js`, `.../workshop.js`, `tools/form-dev/scenes.html` |
| **scenes2d** | `engine/form/js/scenes/talk.js`, `people.js`, `audience.js`, `work.js`, `results.js`, `files.js`, `extras.js`, `review.js`, `tools/form-dev/scenes2d.html` |
| **components** | `engine/form/js/uploads.js`, `engine/form/js/looks.js`, `engine/form/js/workshop.js`, `engine/form/css/components.css`, `tools/form-dev/components.html` |
| **server** | `engine/form_server.py`, `engine/form.ps1`, `engine/start.ps1`, `tools/form-dev/fake_claude.py`, `tools/form-dev/test_server.py` |
| **skill** | `workspace/.claude/skills/aura-slide/SKILL.md` (+ new reference files beside it), `workspace/.claude/CLAUDE.md`, `engine/deck/**`, `engine/tools/**`, `engine/rules/check_rules.js` (minimal changes only, see 8), `setup/aura.config.json` (only `pythonPackages`) |
| shared (already written, do not edit) | `engine/form/js/bus.js`, `engine/form/js/api.js`, `engine/form/js/scenes/index.js`, `engine/form/assets/*`, fonts, this contract |

## 2. Serving, URLs and local dev

| URL | Source |
|---|---|
| `/` | `engine/form/index.html` |
| `/css/*`, `/js/**`, `/assets/**`, `/themes/*` | `engine/form/...` (static, **byte ranges** for media) |
| `/fonts/*` | `engine/fonts/*` |
| `/vendor/three/three.module.js`, `/vendor/three/three.core.js` | `<engine>/node_modules/three/build/` (404 if absent → 3D falls back to 2D) |
| `/api/*` | section 7 |

`index.html` must contain this import map so scenes can `import * as THREE from 'three'`:
`<script type="importmap">{"imports":{"three":"/vendor/three/three.module.js"}}</script>`

**Dev testing.** Front-end roles: `python tools/form-dev/static_server.py` serves everything on
`http://127.0.0.1:8790/` with **mock APIs** (files list, brief, uploads, a scripted fake Claude run), and serves
`tools/form-dev/*` at `/dev/` for your harness pages. Real server: `python tools/form-dev/sandbox.py` makes
`X:\aura-dev` (a throwaway Aura folder whose `.aura\engine` is a junction to the repo engine), then
`set AURA_HOME=X:\aura-dev\.aura && python engine/form_server.py --port 8766`.
Browser tests: `const { chromium } = require('X:/CLPHP_Project/frontend/node_modules/playwright'); await chromium.launch({channel:'msedge'})`.
Never touch the real installation `C:\Aura-Slide by Shafayat` or port 8765.

## 3. Theme (from the studio-footer spec; exact tokens)

- Fonts (local, OFL): `@font-face{font-family:'DM Sans';src:url('/fonts/DMSans-Regular.woff2') format('woff2');font-weight:400;font-style:normal;font-display:swap}`
  and `@font-face{font-family:Epilogue;src:url('/fonts/Epilogue-Black.woff2') format('woff2');font-weight:900;font-style:normal;font-display:swap}`.
  **Headlines: Epilogue 900. Everything else: DM Sans 400.** `font-synthesis:none`. Never fake bold.
- Colours: text and logo `--ink:#080909`; pill/badge/input surface `--pill:#f7f8fa`; page background and letterbox
  `--bg:#EEEDF9` (sampled from the character video so the letterbox and the video edges are seamless; the integration
  step fine-tunes it against a browser screenshot). Accent for selection: invert (ink background, pill-colour text).
  Optional single soft accent for focus/progress: `--lilac:#c9c3ef` (sampled from the character's fur family).
- No text shadows, no gradients on UI, no drop shadows, no decorative borders. Shapes are flat pills and soft
  rounded rectangles in `--pill`. Badges: inline-flex, pill radius 100px, small DM Sans text.
- Copy style: lower-case playful headlines like the footer ("imagination meets craft", "let’s team up!"), curly
  apostrophes (’), short sentences.
- The original footer copy may be reused on the welcome screen: badge "have a fresh idea?", headline
  "imagination / meets craft", badge "say hey", headline "let’s team up! / bring us your idea*", note
  "*good things start with one spark. let’s make yours." No social icons, no links.

## 4. Stage and layout (design space 1600 × 900)

The whole app is a fixed **1600 × 900 px stage** (`#stage`), centred and scaled with
`transform: scale(s)`, `s = min(innerWidth/1600, innerHeight/900)`; `html, body {overflow:hidden; background:var(--bg)}`.
All sizes below are design pixels inside the stage. This guarantees no scrolling at any laptop size.

Footer-spec values converted to this space (1vw = 16 px): left margin 138 px, left block width 400 px, top padding
105 px, badge height 30 px / padding 6 px 10 px / font 14 px, footer headline 27 px, nav gap 15 px / font 17 px,
logo left 645 px / top 123 px / width 272 px, right block left 1189 px / top 105 px, note 12 px. For the form use
the same *proportions* but larger readable sizes: question headline Epilogue 46 px (line-height 1.1, max 3 lines),
lead 19 px (line-height 1.45), labels 15 px, inputs 20 px, badges 15 px, group nav 17 px.

**Character video box** `#char` (contains `<video id="charVideo" muted playsinline preload="auto" src="/assets/character.mp4">`, `object-fit:cover`):
- `full` mode (welcome, finale): `left:0; top:0; width:1600px; height:900px`.
- `stage` mode (all question screens and the workshop): `left:300px; top:337px; width:1000px; height:563px`
  (bottom-aligned). The character's head top is then at y ≈ 479, eyes ≈ 555; its body spans x ≈ 460–1150 at the
  bottom. Animate between modes (≈ 700 ms ease). The box has no visible edge because the page background equals the
  video background.

**Regions in stage mode** (keep content inside; nothing may overlap the character's head/face):
- Brand top-left (96, 44): wordmark "aura-slide" (Epilogue 900, 26 px) + DM Sans "by Shafayat".
- Top-right (right edge 1504, y 44): sound pill (music on/off) and a quiet step counter.
- **Left column** x 96–440: step badge, question headline, lead, then the **group nav** (vertical list of the 8
  group names, current one marked, completed ones clickable) at the bottom (y 640–850, keep x < 330 there).
- **Illustration zone** `#illus` x 470–1130, y 70–460 (660 × 390): the step's live scene, floating above the
  character's head. Transparent background.
- **Right column** x 1160–1504 (344 wide), y 120–790: the fields; **Back / Next pills** at y 800–850 (Next =
  ink pill with pill-colour text; Back = pill surface). Keyboard: Enter = Next (not in textareas), Alt+← = Back.

**Welcome screen** (full mode) follows the footer composition: left block (badge, headline, the 4 phase labels),
centre-top wordmark at the footer logo position, right block (badge, two headline lines, note, then a big
"let’s begin" pill and a tiny line "works with any Claude plan · Pro recommended"). The first click starts the music.

## 5. Screens, groups and data keys

Groups (left nav labels): **The talk · People · Audience · Your work · The look · Your files · Extras · Make it**.
Screens in order (`id` — group — fields — scene). Required fields marked *.

1. `welcome` — (none) — scene `welcome` — full mode.
2. `type` — The talk — `basics.type`* (single choice cards with drawn icons: Thesis defence / Thesis progress /
   Project / Class presentation / Seminar / Conference talk / Proposal / Lecture / Other → `basics.typeOther`) — `talk`.
3. `title` — The talk — `basics.title`*, `basics.subtitle` — `talk` (the scene shows the title live on a mini slide).
4. `when` — The talk — `basics.date`, `basics.event` — `talk`.
5. `presenters` — People — `people.presenters[{name*,id,role}]` (1–8) — `people`.
6. `supervisor` — People — `people.supervisor`, `people.supervisorTitle`, `people.institution`, `people.department` — `people`.
7. `audience` — Audience — `audience.who[]` (multi), `audience.level` (default "Some background") — `audience`.
8. `time` — Audience — `audience.minutes`* (stepper), `audience.qa`, `audience.slides` (empty = Claude decides) — `audience`.
9. `work` — Your work — `work.field`, `work.summary` — `work`.
10. `why` — Your work — `work.problem`, `work.method` — `work`.
11. `results` — Your work — `work.results[{what,value}]` (1–5), `work.message` — `results`.
12. `status` — Your work — `work.status` (Finished / Still going), `work.next` — `results`.
13. `look` — The look — `look.theme` (default "Claude chooses"; options Pink Punch, Bold Blue, Flat-Pack,
    Happy Headspace, Yellow Frame, Claude chooses) — component `looks` (the big preview video plays in `#illus`).
14. `style` — The look — `style.threeD` ("yes"/"no", **default "yes"**), `style.twoD` ("yes"/"no", **default
    "yes"**), `style.amount` (0–100 slider, **default 60**), derived `style.amountLabel` (0–20 Minimal, 21–45 Light,
    46–70 Balanced, 71–90 Rich, 91–100 Maximum) — scene `style` (a live preview that reacts to all three).
15. `plan` — The look — `plan.auto` (default true) or `plan.slides[{title,covers,file}]` (paged list, no scroll) — `review`.
16–22. `files-<n>` — Your files — one screen per folder, component `uploads`, scene `files`:
    `Report` (also sets `files.mainReport`: first PDF/DOCX, user can change), `Images and photos`,
    `Data (csv, excel, graphs)`, `Logo and university template`, `Previous year reports`, `Journal papers`,
    `Anything else` (also `files.avoid`). Each screen has "skip".
23. `content` — Extras — `content.include[]` (default ["References slide","Thank you and questions slide"]), `content.citations` — `extras`.
24. `where` — Extras — `delivery.where[]` (default ["Projector in a room"]), `delivery.offline` (default "No internet - must work offline") — `extras`.
25. `help` — Extras — `delivery.backups[]` (default ["PDF"]), `delivery.help[]` (default ["Speaker notes"]), `delivery.clicker` (default "Not sure") — `extras`.
26. `extra` — Extras — `extra.avoid`, `extra.deadline`, `extra.notes` — `extras`.
27. `review` — Make it — summary + **"make my slides"** — scene `review` (a live mini title slide in the chosen look).
28. `workshop` — Make it — component `workshop` (live progress + chat) — scene `workshop`.

Pre-picked defaults are visibly selected with a tiny "suggested" tag until the user touches them. Keep every key
name exactly as above (the server's brief writer and the skill read them). State persists to
`localStorage['aura-studio-v2']` and autosaves to `POST /api/brief` (debounced, and on every Next).

v0.3 adds `style.quality` on the `style` screen: `best | balanced | fast`, **default `balanced`** ("suggested"),
labels "best quality / balanced / fast" with one-line costs. Server mapping: best = `--model opus --effort high
--fallback-model sonnet`, balanced = `--model sonnet --effort high`, fast = `--model sonnet --effort low`. The skill
also reads it (fast = fewer check rounds, simpler art).

## 5a. v0.3 screens: loading, home, editor

Route order: `loading` → `home` → (new deck) the brief wizard `welcome … review` → `workshop` → back to `home`, or
`home` → `editor` for an existing deck.
- `loading` — character in full mode + animated check list from `GET /api/health`; each failed check shows a friendly
  fix button (`POST /api/fix/<name>`); all green → `home`.
- `home` — "Canva-like" library: a big "make a new deck" card (→ the wizard, using the new-deck draft brief) and one
  card per deck from `GET /api/decks` (thumbnail `/api/decks/<id>/thumb.png`, title, date, look badge, buttons
  **edit · present · PDF · folder**); usage pill in the top bar.
- `editor` — inside the 1600 × 900 stage: left = slide thumbnail strip; centre = live preview iframe of
  `/deck/<id>/?aura=edit#<n>` (runtime edit mode, section 8); right = Claude panel (workshop chat reused, the deck's
  `sessionId` resumed). Messages are sent as `[slide N] <text>`. Choice markers → option buttons + free-text box;
  hint markers → clickable chips that fill the text box (generic per-slide hints when there are none); folder icon
  → upload into "Anything else" and append `use the file <name>` to the message; click a text with a `data-edit` id
  → direct text tweak (`POST /api/decks/<id>/text`, no Claude). Small character corner mode; editing illustration
  `scenes/edit-bench.js` above the chat (the factory scene stays for first builds only).

## 6. Front-end module interfaces

All modules are ES modules in `engine/form/js/`. Shared (already written): `bus.js` (`export const bus`,
`emit(type, detail)`, `on(type, fn)` → unsubscribe), `api.js` (`getJSON`, `postJSON`, `upload`, `claude`), and
`scenes/index.js` (`mountScene(name, el, ctx)` with a safe fallback).

**Bus events** (`emit(type, detail)`): `step:change {from,to,step}`, `state:change {key,value,state}`,
`ui:hover {el}`, `ui:press {el}`, `files:dragover`, `files:dragleave`, `files:drop {folder,count}`,
`files:uploaded {folder,name,size}`, `look:change {theme}`, `claude:event {event}`, `claude:state {running,waiting,done}`,
`audio:change {music,sfx}`, `char:mode {mode}`.

**gaze.js** — `export function initGaze(video, {framesUrl:'/assets/gaze-frames.json'})` →
`{ lookAt(x, y), release(), setPaused(bool), destroy() }`. Implements the footer spec **exactly**: source eye
midpoint (948,418) in 1920×1080; cover scale `max(w/1920,h/1080)` from the video's *current* `getBoundingClientRect()`
(works for any box size, including the animated mode change); ignore within 8 px; `atan2` normalised to [0,2π);
nearest row by circular difference; time + 1/240 s; seek only if |Δ| > 1/48 s, `readyState ≥ 2`, not seeking;
clamp to duration − 1/24; coalesce with requestAnimationFrame; on `seeked` apply the newest target; video starts
paused at 0 and never plays/loops on desktop; recompute on resize, scroll and during `char:mode` transitions.
Extra for the app: `lookAt(x,y)` points the gaze at a screen point (the focused field or caret while typing) until
the next real pointer move. Below 700 px wide: muted looping playback (respect reduced motion), like the spec.

**cursor.js** — `export function initCursor()` → `{ setState(name, label?), destroy() }`. A custom cursor (ink dot +
soft lilac ring with spring lag), grows and shows a short label over interactive elements
(`button, [role=button], label, .choice, [data-cursor]`, `data-cursor-label` text), "drop" state while files are
dragged over the window, I-beam over text inputs (keep native caret usable), hidden when the pointer leaves.
Disabled on coarse pointers; reduced motion → no lag. Must never block clicks (`pointer-events:none`).

**audio.js** — `export const audio = { start(), setMusic(on), setSfx(on), setVolume(v), sfx(name), state() }`.
`start()` is called from the first user click (autoplay rules). **Music: original, procedurally generated, uplifting
happy lo-fi chill** in Web Audio (no audio files, no licensing): ~76–84 BPM swung beat (soft kick, brushy snare,
hats), warm electric-piano major-7th chord progressions, round sub bass, gentle pentatonic melody fragments, vinyl
crackle, tape wow, lowpass warmth, sidechain-style ducking, evolving sections so it doesn't loop obviously.
**SFX names**: `hover, click, select, deselect, next, back, whoosh, type, drop, upload, success, error, toggle,
slide, launch, done, pop, tick`. Defaults: music on at low volume, sfx on; persisted in
`localStorage['aura-audio']`. Never throws if Web Audio is unavailable. Emits `audio:change`.

**scenes** — `scenes/index.js` loads `scenes/<name>.js`, whose default export is
`{ mount(el, ctx) { ...; return { update(state), destroy() } } }`.
`ctx = { bus, audio, getState(), reducedMotion, amount /*0-100, from style.amount, default 60*/, three() /*→ import('three'), may reject*/ }`.
Scene names: `welcome, talk, people, audience, work, results, style, files, extras, review, workshop`.
Rules: fill the container (ResizeObserver), transparent background, pause when `document.hidden` or not mounted,
destroy everything on `destroy()` (dispose WebGL renderer, geometries, materials, textures; cancel RAF; remove
listeners), **at most one WebGL context alive at a time**, cap devicePixelRatio at 1.5, lazy-load three via
`ctx.three()`, fall back to a 2D version if it rejects, idle CPU low. React live to state (e.g. `talk` shows the
typed title on a mini slide; `people` adds a figure per presenter; `audience` fills seats per audience type and
turns a clock to the minutes; `style` shows/hides its 3D object for `threeD`, animates 2D for `twoD`, scales
richness with `amount`; `files` swallows dropped files; `workshop` builds slide cards as Claude works via
`claude:event`). Highly detailed, playful, flat-colour illustration in the theme palette (lavender, pink heart
tones, ink, pale pills), no text smaller than 13 px.

**uploads.js** — `export function mountUploads(el, { folder, title, hint, accept, setKey, getState, bus, audio })` →
`{ destroy() }`. Drop zone + "choose files" button (multiple), uploads one by one with a progress bar per file
(`api.upload`), lists files already in that folder (`GET /api/files`), removes files uploaded in this session
(`POST /api/remove`), emits `files:*` events. For `Report` it also offers the main-report choice
(`files.mainReport`, via `setKey`). Fits the 344 × 640 right column without scrolling (collapse long lists:
"and 6 more").

**looks.js** — `export function mountLooks(el, illusEl, { getState, setKey, bus, audio })` → `{ destroy() }`.
Six options in the right column (name + one-line description); the selected/hovered look's demo video
(`/themes/<n>-<slug>.mp4`, poster `.jpg`) plays large in `illusEl`; "Claude chooses" shows a playful shuffle of the
five. Sets `look.theme`.

**workshop.js** — `export function mountWorkshop(leftEl, rightEl, { getState, bus, audio })` → `{ destroy() }`.
Left: stage tracker (Getting ready → Reading → Planning → Building → Checking → Exporting → Done), Stop button,
"open my slides" (when done), "open slides folder". Right: chat with Claude
(assistant messages as plain friendly text with markers stripped, tool steps as tiny progress lines, user replies;
input box enabled when Claude is waiting). Handles: CLI missing, not signed in (big "sign in to Claude" button →
`POST /api/claude/login`, then polls status), usage limit, errors, reconnect after reload (events are stored
server-side). Polls `GET /api/claude/events?since=n` every ~700 ms while open. Emits `claude:event`/`claude:state`.

**core** (app.js/start.js/index.html/app.css) wires everything: stage scaling; screen transitions
(animated, with `whoosh`); left nav; validation (friendly messages, shake + `error` sound); field renderers
(choice cards, multi pills, text, textarea, stepper, date, repeaters with paging, toggles, slider, file select);
autosave; `beforeunload` confirmation **always on after the first interaction** (stronger while Claude runs);
mounts gaze/cursor/audio/scenes/components; keeps the gaze on focused fields while typing (`gaze.lookAt`);
micro-interactions on every control (hover/press feedback, typing sparkle, selection pop) with sounds.
Review screen: friendly summary + "make my slides" (calls `api.claude.start()` after a final save, then goes to the
workshop). If the brief already has a finished run, the workshop shows its history.

## 7. Server API (engine/form_server.py)

Keep the existing endpoints (`/api/ping`, `/api/files`, `GET/POST /api/brief`, `/api/open-files`, `/themes/*`) and
the brief writer, extended for `look.*` and `style.*`. **Security**: bind 127.0.0.1; reject any request whose `Host`
is not `127.0.0.1:<port>` or `localhost:<port>` (DNS-rebinding); POSTs require `Origin` absent or one of those
origins; static paths resolved and confined to their base folder; extension whitelist; uploads confined to the 7
folders; **never pass user text on a command line** (Claude prompts go through stdin).

- `POST /api/upload?folder=<one of the 7 names>&name=<file name>` — raw body (no multipart), `Content-Length`
  required, streamed to disk in 1 MB chunks, max 2 GiB, name sanitised (no path parts, Windows-reserved
  characters/names), never overwrites (adds " (2)"), returns `{ok, path, name, size}`; path is relative to
  "3 - Put your files here" with `/` separators.
- `POST /api/remove {path}` — deletes only files uploaded by this server process.
- `GET /api/claude/status[?refresh=1]` → `{cli: bool, signedIn: bool|null, running, waiting, sessionId, lastDeck, eventCount}`
  (`signedIn` from `claude auth status` JSON `loggedIn`, cached, refreshed on request).
- `POST /api/claude/login` → opens a visible console window running `claude auth login`.
- `POST /api/claude/start` → saves nothing itself (the page saved the brief); starts
  `claude -p --settings .claude/settings.json --output-format stream-json --verbose --permission-mode acceptEdits --append-system-prompt <WEB_PROMPT>`
  in the Aura root with **stdin** = `show your aura\n\n[from-web] ...` (see 8). One run at a time (409 otherwise).
  **Why `--settings`**: in `-p` mode Claude ignores the project's allow-list until the folder is trusted; passing the
  same settings file on the command line applies the permissions and the hard-rule hooks (verified on this PC).
- `POST /api/claude/reply {text}` → same command plus `--resume <sessionId>`, stdin = the user's text.
- `POST /api/claude/stop` → kills the process tree (`taskkill /T /F`).
- `GET /api/claude/events?since=n` → `{events, next, running, waiting}`. Normalised events
  `{i, t, kind, text, tool?, detail?, ok?, code?}` with kinds `status, say, tool, tool-error, user, limit, error,
  done`. Parse stream-json lines: `system/init` (session id), `assistant` text → `say`, `tool_use` → `tool` with a
  short human detail (file name, command head), failed `tool_result` → `tool-error`, `rate_limit_event` with a
  non-allowed status → `limit`, `result` → `done` (`ok = !is_error`; `waiting = the text has [[aura:ask]] alone on a line`).
  Ignore non-JSON lines unless the process fails; detect sign-in problems → `error` with `code:'auth'`.
  Persist events + session id under `.aura/temp/` so a reload or server restart shows the history and can resume.
- `POST /api/open-slides {path?}` → opens a deck (must be inside "4 - Your slides") in the default browser, or the folder.
- Executable lookup: `%USERPROFILE%\.local\bin\claude.exe`, `shutil.which('claude.exe')`, the npm package exe
  (`%APPDATA%\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe`), then `claude.cmd` only as a last resort
  (still prompt via stdin). Windows: `CREATE_NO_WINDOW` for background runs.
- Dev/test: env `AURA_HOME` (the `.aura` folder; default = parent of the engine folder), `--port`, env
  `AURA_NODE_MODULES` (fallback for three.js), env `AURA_FAKE_CLAUDE=<script.py>` (run that instead of Claude; it
  emits realistic stream-json).
- The idle shutdown must never stop the server while a Claude run is active.
- The server passes every marker through untouched in `say` events (the front end parses them; section 8).

## 7a. v0.3 routes

| Route | Does |
|---|---|
| `GET /api/health` | readiness checks: engine files, fonts, assets; Node + `engine/node_modules` (three, playwright-core); Edge; venv Python packages; Claude CLI; `claude auth status` (`loggedIn`, `subscriptionType`, `email`; every plan is allowed, Free gets a gentle note, an unknown type is labelled; `confirmed` = this install's "yes, that's me" in `.aura/account.json`). Sign-in: `POST /api/fix/signin {browser: private|normal}` runs `claude auth login` with `BROWSER=engine/tools/signin-url.cmd` and opens the captured URL in `msedge --inprivate` (default) or the default browser; `GET /api/claude/signin` = what was opened; `POST /api/claude/confirm {email}`; free disk; app version vs latest GitHub release (cached, network optional) |
| `POST /api/fix/<name>` | `npm` (npm install), `pip` (pip install), `signin` (`claude auth login` in a visible window, then poll), `update` (runs `AuraSlide.exe --update`), `claude` (reinstall via update) |
| `GET /api/decks` | deck records from `.aura/decks/<id>.json`: `{id, title, file, look, quality, createdAt, updatedAt, sessionId, briefSavedAt, ...}` (existing decks in "4 - Your slides" are migrated into records). The list never carries `brief` or `plan` (F-02); `GET /api/decks/<id>` does. |
| `POST /api/decks` | new deck from the current draft brief |
| `GET /api/decks/<id>/thumb.png` | first slide picture (cached in `.aura/temp/thumbs/`, made with `engine/tools/shoot_slides.js`) |
| `GET /deck/<id>/` | that deck's packed HTML, read-only (preview iframes; `?aura=edit` turns on the runtime edit mode) |
| `POST /api/decks/<id>/text {editId, text}` | direct text tweak: patches the element with `data-edit="<editId>"` in the build source (`.aura/temp/build/<deck>/index.html`) and the packed file, then runs `engine/rules/check_rules.js`; reverts with a friendly message on failure |
| `GET /api/usage` | latest `rate_limit_event` (`status`, `utilization`, `resetsAt`, window) stored in `.aura/temp/usage.json` with its capture time, plus `subscriptionType` |
| `POST /api/open-slides {path?}` | reused for "present" |

Removed in v0.3: `POST /api/open-vscode` and every other VS Code path.

## 8. Slide pipeline (skill v0.3) and markers

`show your aura` builds the deck end to end. When the first message contains `[from-web]`, Claude skips the
"is this right?" confirmation and goes straight on, asking only decisions that are really unclear (choice markers).
Later messages in the same session (`--resume`) come from the editor.

**Markers.** The grammar, the full inventory (who writes each marker and who reads it), the `choice` / `hint` attributes
and the question limits are defined once, in the "App markers" and "Asking questions" sections of
`workspace/.claude/skills/aura-slide/SKILL.md`; the machine-readable definition is `engine/rules/markers.json`. The server
reads markers with `engine/aura_markers.py`, the page with `engine/form/js/markers.js`; both are run against
`tools/form-dev/marker_cases.json` by `tools/form-dev/test_instructions.py`, so they cannot differ. In short: a marker is one
whole line, values are `"quoted"` or bare tokens, attribute order is free, and a line that mentions `[[aura:` but cannot be
used is **reported** (a `marker-problem` event in the chat and a line in `form_server.log`), never dropped silently.
Answers go back as `q1: <option>` lines (several answers joined with ` | `), then `note: <their own words>`; the
`[slide N]` header on a reply is the slide the questions were about (the slide being built, while a step waits).

**Editor messages.** `[slide N] <request>` (N = 1-based slide selected in the editor; no prefix = whole deck), with
`use the file <name>` appended when the user attached a file to "3 - Put your files here/Anything else". Claude
edits only what was asked in `.aura/temp/build/<deck>/`, keeps `data-edit` ids stable, re-runs `deck_check`, packs
**in place** with `pack_deck.py … --replace` (only full rebuilds move the previous deck to "Older versions"), remakes
PDF / PPTX / notes only if they already exist, emits `build → check → export → done` stage markers, 3–5 new hints and
the `done` line with the same file. Non-trivial edits start with choice markers.

**`data-edit` text ids.** Every editable slide text element (titles, kickers, headlines, body, list items, labels
incl. SVG `<text>`, captions, big numbers, sources) carries `data-edit="s<slide>-<n>"`, e.g. `data-edit="s3-2"`;
unique per deck, never nested, never renumbered (they are names, not positions: after slides are inserted, `s3-2`
may sit on slide 4). Not on speaker notes or runtime chrome; `data-edit="no"` opts out. `new_deck.js` / the template
produce them, `node engine/tools/new_deck.js --ids <build folder>` adds missing ones and renames duplicates,
`pack_deck.py` keeps all attributes and reports the count. The direct text tweak replaces the element's text
content (inline emphasis inside it may be lost; that is acceptable for a tweak).

**Runtime edit mode** (`engine/deck/runtime.js` 0.3.0, inside every packed deck). In a frame, the deck posts
`{aura:'slide', index /*1-based*/, count}` to its parent on every slide change. With `?aura=edit` clicks never change
slides; a click on a `[data-edit]` element posts `{aura:'edit', id, slide /*1-based*/, text}` to the parent (and
fires `aura:edit` on `document`), and `[data-edit]` elements show a hover outline. The parent may post
`{aura:'go', index /*0-based*/}` to navigate, or set the URL hash `#<n>`. Elements with `contenteditable` are treated
as interactive (no click navigation), so the editor can edit them in place (same-origin iframe).

Toolkit (owned by **skill**): a deck runtime (`engine/deck/`: 1920×1080 slides, fit-to-screen, keyboard/click/swipe,
progress, speaker notes view, fullscreen, print mode for PDF, slide-enter animation hooks, lazy 3D canvases,
reduced motion), helper scripts (`engine/tools/`: text extraction from PDF/DOCX/PPTX/XLSX/CSV, deck check +
per-slide screenshots, single-file packer that inlines fonts/images/runtime/three.js, PDF export, PowerPoint
export with notes). Decks must obey the HARD RULES (26 px minimum), power-design (vendored, with Aura's 4-typeface
override), Aura Blend (incl. "diagrams are illustrations"), the chosen look, and `style.*` (3D / 2D / amount).
`check_rules.js` may be changed only to skip runtime chrome marked `[data-aura-ui]` and text that is not rendered
(`display:none`) — never to weaken the 26 px rule for slide content.

## 9. Acceptance (every role tests its own part in Edge)

No console errors; no page scroll at 1280×720, 1366×768, 1536×864, 1920×1080 (and the stage letterboxes cleanly on
other aspect ratios); 60 fps-ish on the welcome screen; gaze cardinal checks (right → 2.54167 s, down → 0.33333 s,
left → 1.0 s, up → 1.70833 s, before the 1/240 offset); every screen reachable with keyboard; reduced motion
respected; music starts only after a click and can be muted; closing asks for confirmation; uploads land in the
right folder; a fake Claude run shows stages, tool lines, a question, a reply and the finished state.

## 10. v0.5: plan, build slide by slide, finalize

A deck is no longer made by one long Claude run. It goes **home -> plan -> build -> finalize**, all in ONE Claude
conversation per deck (the deck's `sessionId`; every re-plan and build step `--resume`s it).

**Screens (app routes, `setRoute(name, {deckId})` in `app.js`).** `loading` (readiness + Claude sign-in first,
silent fixes), `home` (deck library, account pill, update note), `plan` (`js/plan.js`), `build` (`js/editor.js`,
mounted with `build: true`), `finalize` (`js/finalizing.js`), `editor` (the v0.3 editor for finished decks), and
`start` (`js/start.js`: what the talk is about, then the files). The 40-field `wizard` and its `steps.js` / `fields.js`
are DELETED - Claude interviews the person instead. Nothing scrolls; the stage is still 1600 x 900.

**Work folders.** Each deck keeps its editable files in `.aura/decks/<id>/` (`plan.json`, the packed editable deck)
and its record in `.aura/decks/<id>.json` (fields in `DECK_FIELDS`: id, title, file, look, quality, createdAt,
updatedAt, sessionId, brief, build, flow, planState, buildRest, buildTarget). The build source is still
`.aura/temp/build/<deck>/`. **Only Finalize writes into `4 - Your slides/`.** `.aura/temp/plan.md` is Claude's own
scratch notes, not the plan.

**Quality picker** (`QUALITIES` in `form_server.py`, v0.5.1): `best` (Opus / high, default, recommended), `maximum`
(Opus / max), `balanced` (Opus / medium), `fast` (Sonnet / medium); the Opus tiers pass `--fallback-model sonnet`. "Even
better" (Opus / xhigh) was removed; a deck saved with it runs as `best`. Planning always runs `PLAN_QUALITY` (Sonnet / high)
whatever the deck's quality.

**Routes added since v0.3** (localhost only, same Host/Origin rules as section 7):

| Route | Does |
|---|---|
| `POST /api/plan/start` | new deck + planning run from the current draft brief |
| `GET /api/decks/<id>/plan` | `plan_payload`: `{plan, planState, planError, wordCap, running, runKind, waiting, queued, buildStarted, buildRest, buildTarget, count, built, target, exists, mtime, final, changedSinceFinalize}` |
| `POST /api/decks/<id>/plan` | save the person's edits `{plan, replan?: [slide ids]}`; `replan` queues those slides for Claude |
| `POST /api/decks/<id>/plan/answer` | answer a doubt `{id, answer, other}` |
| `POST /api/decks/<id>/plan/suggest` | "Claude, suggest one here" `{after}` |
| `POST /api/decks/<id>/finalize {light?}` | record the 3D loops and write the final HTML + PDF; `light: true` = a lighter copy (CRF 27, 24 fps). The `final` record carries `htmlBytes`, `pdfBytes`, `light` and `warnings` (a PDF page whose 3D still was not ready is reported here, it no longer aborts the run). |
| `POST /api/decks/<id>/pptx`, `GET /api/decks/<id>/pptx` | the explicit PowerPoint copy (`engine/tools/export_pptx.py`): one picture per slide (3D = its still image), speaker notes in the notes pane; background job, one at a time, never beside a finalize. Result `<Title>.pptx` in "4 - Your slides", recorded as `pptx` on the deck. |
| `POST /api/cleanup {dry?}` | bounded retention (`reap()`, the policy is the comment above `RETENTION` in `form_server.py`): returns `{freed, removed:[{path, why, bytes}]}`; also runs by itself at startup and every 6 hours. |
| `PATCH /api/decks/<id>` | `title`, `look`, `quality`; a different `look` once slides are built, or a different `quality` while Claude works on the deck, is refused with 409 `look-locked` / `quality-locked` (S-08). |
| `POST /api/decks/<id>/build` | build actions (next slide, the rest, a target slide, stop) |
| `POST /api/decks/<id>/finalize`, `POST /api/finalize/cancel`, `GET /api/finalize` | final export (packed HTML + PDF) through `engine/tools/finalize.js`; the only thing that writes to `4 - Your slides/` |
| `GET /api/decks/<id>/slides`, `GET /api/decks/<id>/slides/<n>.png` | per-slide pictures |
| `GET /api/health?part=claude` | only the Claude + sign-in checks (the loading screen asks this first) |
| `GET /api/fix/status`, `POST /api/fix/<name>` | readiness fixes: `npm`, `pip`, `signin`, `update`, `repair` (runs `Lumi.exe --repair --from-app`), `claude` (body `{check, mode: fix or explain}`) |
| `POST /api/claude/logout` | sign out (account switch) |

`POST /api/decks` (create from a draft brief) still exists but only the server's own `new_deck()` uses it; the page does not.
`POST /api/open-vscode` is gone for good.

**Markers added in v0.5**: `plan` (the last line of a planning run; `path` optional), `plan-ok slide="s3"`, `built slide="s3"`
and the extended `choice` (`slide`, `scope="deck"`, `when="q1=2"`, `depends="q1"`). All are in the SKILL.md inventory and in
`markers.json`; `when` makes a question a *variant* (several markers may share one `id`, only the one whose condition holds for
the answers so far is shown, changing an earlier answer swaps it and clears the answer it had; the value is an option's 1-based
number or its exact text, `|` for alternatives, `&` for several conditions) and `depends` resets a question to its default.
Do not use `[[aura:ask]]` while planning: doubts are answered on the page and come back as a `[plan-edit]` message; a planning
run that still ends with an ask and no plan file gets a readable error (the question is quoted), and the answers to doubts of a
plan that was never written bring a message asking Claude to write the whole plan.

**`plan.json`** (Claude writes the content, the page edits it, the app keeps its own bookkeeping). The schema, who owns each
field and the limits are in `workspace/.claude/skills/aura-slide/planning.md` ("The plan file"); the code is `form_server.py`
(`PLAN_*` constants, `claude_view`, `plan_drift`, `normalize_plan`). The file Claude reads and writes is `claude_view(plan)`:
it leaves out the app's fields (`doubts`, `seq`, `lastChange`, `repairs`, `builtAt`, `status`, `editedAt`), which are always
restored from the deck record; whatever else Claude writes that the app ignores is logged (`plan.json from Claude: ...`). The
per-slide word cap in the plan payload (`wordCap`) is the `hard-rules.json` number for the look (Bold Blue 55, others 25).

**Runtime capture contract** (`engine/deck/runtime.js`; its header comment is exact). With `?capture` the deck sets
`window.LumiCapture = { ready: Promise, slides: { <1-based n>: { period, seek: async t => {}, rect, holder } } }`.
`seek(t)` makes slide *n* current, renders a deterministic frame of every `.aura-3d` / `.aura-canvas` piece at time
`t` (not wrapped: seek(0) equals seek(period)) and resolves when the frame is on screen. Slide text is hidden during
a seek so it is never baked into the video; projected labels inside the holder are baked in. `rect` is the main
holder in slide pixels (1920 x 1080). A deck may embed recorded loops as
`<script type="text/plain" id="lumi-loop-<n>" data-mime="video/mp4" data-period="12">BASE64</script>`; that slide
then plays the video instead of the live scene. `?still=n` renders slide n as one calm still frame. Finalize
(`finalize.js`) records each loop through `LumiCapture` and encodes limited-range BT.709 H.264.

**Rules that changed.** The 26 px minimum text size is the default (`workspace/.claude/CLAUDE.md`), but the Bold Blue
look allows 20 px for footer, page number, captions and step labels only; the checker enforces the active look's
limits. Which commands Claude may run is decided by `workspace/.claude/settings.json`, not by this file.
