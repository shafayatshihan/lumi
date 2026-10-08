---
brand: Clay Pop (an aesthetic, not a brand)
slug: clay-pop
website: none - the owner's reference is a screenshot kept OUTSIDE this repo (X:\lumi-refs\clay-pop-reference.png)
extracted_via: the owner's written brief + pixel measurements of the reference screenshot (800 x 554, PIL, 2026-10-07)
---

# Clay Pop — Aesthetic Style

Taken from the owner's reference: the hero of a product site, a chunky orange retro computer-robot rendered as a
claymation / vinyl toy. **The aesthetic is used; the brand is not.** No wordmark, logo, copy or layout of that site
appears in Lumi, and the screenshot never enters the repo.

## Visual Theme & Atmosphere
Claymation, 3D clay render, stylised 3D illustration, vinyl toy, tactile tech, retro-futurism. One isolated object in
a clean studio, matte plastic-clay surfaces, soft studio light, soft shadows, ambient occlusion in every crease.
Chunky, blocky, generously bevelled shapes. Floating satellite pieces around the object. Tiny tactile details at the
scale of a thumbnail press: a sticker, a seam, a slightly wrong key. Light theme.

## Colors (measured on the reference)
| Role | Hex | Notes |
|---|---|---|
| Background | `#F0F0F6` | a cool near-white, slightly lavender; it is what makes the orange look hot |
| Figure orange, top faces | `#FDB23B` | the light side of the orange goes YELLOW, not white |
| Figure orange, mid | `#D96D07` – `#E9862D` | the median of every saturated orange pixel in the figure |
| Figure orange, shadow side | `#940901` – `#CC1301` | the dark side goes RED, not brown or grey |
| UI orange (button) | `#FA6724` → `#FDA064` | a soft vertical gradient: a button is a lit object too |
| Text primary | `#15151C` | a cool near-black |
| Text muted | `#727376` | |
| Punctuation greys (keys) | `#868381` – `#E5E4E6` | grey and black are punctuation only |

**Color scheme:** light. **Rule:** one vibrant primary doing almost all the work, on near-white. Not a palette - a
dominance. Black and grey appear only as small punctuation (a screen, a key, a cable).

## Typography
The reference uses a neutral geometric grotesk, bold and tight in the headline, regular in the line under it.
Lumi equivalent (public licences only): **Plus Jakarta Sans** (SIL OFL), 800 display / 500 text, tight tracking, and
**DM Mono** (SIL OFL) for the small retro-terminal labels the figure language invites (the reference prints a
`c:\...>` prompt on its screen).

| Role | Reference | Lumi |
|---|---|---|
| H1 | ~44 px on an 800 px page, bold, tight | 120 px title / 80 px headline at 1920 x 1080 |
| Sub-line | ~14 px, regular, grey | 30 px body |
| Button | ~12 px, medium, white on orange | ink on an orange clay key (white on orange fails contrast) |

## Spacing & Shape
- Soft and generous: big rounded radii (pills, 28 px cards), wide margins, one object with room around it
- Shadows: soft, low, warm-neutral - a contact shadow under the object, nothing hard
- Gradients: allowed, but only as LIGHT on a surface (top lighter, bottom darker), never as decoration

## Voice & Personality
- Tone: confident, a little cheeky, never silly. The joke is in the picture, once.
- Energy: high, but calm around the object
- Audience: people who like well-made things

## Illustration
Every picture is a lit 3D object: clay-matte material with a hint of light coming back out of the surface
(subsurface), soft key light from the upper left, a contact shadow, ambient occlusion in the creases, bevels that catch
a small highlight on every edge. The light side of a colour shifts warm and lighter, the shadow side shifts deeper and
more saturated. Exactly ONE wink of personality per figure (the reference: a smiley sticker) - everything else plays
it straight.

## Quick Reference (for Claude)
```css
:root {
  --bg: #F0F0F5;
  --fg: #15151C;
  --clay: #FF6A13;        /* the one primary: fills, 3D, the emphasis key */
  --clay-hi: #FDB23B;     /* its light side */
  --clay-lo: #C93A05;     /* its shadow side */
  --radius: 28px;
}
```
