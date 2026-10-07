# Aura Blend — how Lumi styles a deck

Aura Blend sits on top of power-design. Power-design's 20 slide rules still apply, except for the one override below.
The HARD RULES in `.claude/CLAUDE.md` (the text floor and the other numbers in its table) beat everything.
Aura Blend adds three things: a type blend, a colour blend, and one signature style device per theme.

## Override of power-design's Font Pairing rule
Power-design's Font Pairing rule says "maximum 2 typefaces per deck". **In Lumi the limit is the one in the numbers table in
`.claude/CLAUDE.md`** (4; a look may allow fewer, Bold Blue 2). This is the owner's rule and it applies in this folder.

## 1. Type: up to four voices, one job each
- **Typefaces per deck: within the limit above.** Each has one fixed role for the whole deck:
  1. **display:** headline
  2. **text:** body
  3. **label (optional):** kicker, captions, numbers; usually a mono
  4. **emphasis (optional):** a second display voice for one short phrase
- Any two must clearly differ: serif vs sans vs mono, a different width, or a different weight personality.
  Two look-alike sans-serifs are not a blend.
- Sizes: the type scale of the numbers table in `.claude/CLAUDE.md`. At most 3–4 sizes per slide.
- Emphasis inside a headline goes on **one phrase of 1–3 words**, using the theme's device.
  Never more than one emphasis per slide.
- **Fonts must have a public licence:** SIL Open Font License, Apache 2.0, or CC BY with credit.
  Use only the fonts in `.aura/engine/fonts/`; their licences are in `.aura/engine/fonts/licenses/`.
  Never use a font marked "personal use", "demo", "test" or "free for personal use", and never a paid brand font.

## 2. Colour: 60 · 30 · 10, with a blended 10
- 60 % canvas, 30 % the theme's signature surface (art block, stripe, panel), 10 % accent for emphasis.
- A theme may blend **3–5 brand colours**, but only inside the illustration and the signature surface.
  Text stays one ink colour; highlights use the single accent.
- Every text colour needs ≥ 4.5:1 contrast (≥ 3:1 at 24 px and up); aim for 7:1.

## 3. Style: one signature device per theme, used everywhere
The device makes a deck feel like one piece. Use it on the art, the kicker and the emphasis; never mix devices
from two themes.

## 4. Diagrams are illustrations, never boring boxes
Do not make plain boxed flowcharts or default line and bar graphs. Show a process or a result as an illustration.
**Flowcharts** become a picture of what happens. Examples:
- a pipeline the material really travels through
- a machine the reader can see working
- a loop drawn as a cycle, not boxes joined by arrows
**Graphs** become a picture of the data. Examples:
- bottles filling to each value
- a thermometer going down a borehole
- a wing tilting while its lift arrow grows

Make illustrations move:
- Use 2D animation (flow along pipes, turning gears, rising bubbles, a marker tracing a curve), and 3D when depth
  helps understanding (three.js is in `.aura/engine`).
- Loops are seamless and calm: 3–6 s cycles, no flashing.
- The slide must still read correctly as a still frame, for the PDF and PowerPoint backups.

A sequence - objectives, a method, a roadmap, a set of next steps - is drawn as a path that climbs: a staircase, a
rising road, a route with a goal at the top. Not a row of equal panels, not a level line of stepping stones. Offer two
climbing shapes and let them pick between those.
<!-- PROVISIONAL (0.5.5). Evidence is ONE deck (b45622aef312): three sightings - s4 q1, s12 q2, s14 q2 - and the flat
     default was refused all three times. One deck is one person on one subject. Re-check after the next deck; if a
     sequence is ever wanted flat, this comes out again. -->

Real numbers still need real axes: label the values, keep the scale honest, and say "Sample data" whenever the
numbers are illustrative.

## The five Aura themes
| # | Theme | Brand DNA | Fonts (all public licence) | Colour blend | Signature device |
|---|---|---|---|---|---|
| 1 | **Pink Punch** | Gumroad | Anton (display, uppercase) + Work Sans (text) | cream canvas · pink block · yellow, orange, teal, red pops | black outlines + hard 8 px black shadow, pill kicker, pink highlighter on one phrase |
| 2 | **Bold Blue** | the owner's reference deck (measured, not a brand site) | Poppins (everything) + DM Mono (page numbers) | warm off-white `#F9F4F2` · ink `#2D2C2B` · ONE blue `#0061EF` phrase per headline · orange `#FF7E1D` identity dot | photoreal studio 3D (soft shadows, real materials, reflections) beside a stat stack; hand-drawn SVG charts. **Its own authority: `looks/bold-blue/LOOK.md`** |
| 3 | **Flat-Pack** | IKEA | Noto Sans (one typeface: 800 display, 700 labels, 400 text) | white paper · one grey · IKEA blue `#0058A3` · IKEA yellow `#FFDB00` · no shadows, no gradients | the assembly manual: 4 px ink line drawings in orthographic view, exploded parts, numbered step discs, "6x" part counts, dashed guides, yellow price-tag kicker. **Its own authority: `looks/flat-pack/LOOK.md`** |
| 4 | **Happy Headspace** | Headspace | Quicksand 700 (display) + DM Sans (text) + Reno Mono (label) | pure white · **orange first**, then gold, amber, purple, teal-navy; pink only as a rare small accent | soft round shapes and blobs, **no faces** (decks are often formal), gold pill kicker, orange squiggle underline |
| 5 | **Yellow Frame** | National Geographic | Source Serif 4 (display) + Open Sans (text, uppercase label) | pure white · the yellow border · **black as the signature ink**: black label tags with white capitals, a heavy black rule above the kicker, black pipes, arrows and data marks; **never a dark background** | a bright daylight documentary illustration inside the thick yellow rectangle; yellow-rectangle mark before the kicker |

Brand files:
- Bold Blue and Flat-Pack follow `looks/_shared/LOOK-BASE.md` plus their own `looks/<look>/LOOK.md`, which override
  this file where they differ. Bold Blue has no brand file; Flat-Pack's DNA is `brands/ikea`, but its LOOK.md wins.
- this skill folder: `brands/gumroad`, `brands/headspace`, `brands/ikea`, `brands/national-geographic`.
  IKEA and National Geographic were extracted with Firecrawl.

## Font licences (engine/fonts)
- **SIL Open Font License:** Anton, Plus Jakarta Sans, DM Sans, Noto Sans, Source Serif 4, Open Sans, Work Sans, Quicksand, Poppins, DM Mono, Epilogue.
- **CC BY 4.0:** Reno Mono. Credit "Reno Mono by Renaud Futterer" wherever the fonts are listed.

All of these may be embedded in slides and shared.
