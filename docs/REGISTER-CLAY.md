# REGISTER — Clay Pop: every change to a file the Clay session does not own

Written for the coordinating session. Apply in any order; each block says the file, the exact place and the exact
text. Every block below was applied to a **sandbox copy** of the engine (`X:\aura-dev-clay\lumi\.aura\engine`, made by
`X:\aura-dev-clay\patch_sandbox.py`) and a deck was built and rendered from it, so the text is tested, not drafted.
Nothing here touches the repo until you apply it. Status and what was looked at: `docs/STATUS-CLAY.md`.

The look's own files (already in the repo, owned by this session, nothing to apply):
`engine/deck/themes/clay-pop.css`, `engine/deck/looks/clay-pop/**`, `workspace/.claude/skills/aura-slide/looks/clay-pop/LOOK.md`,
`workspace/.claude/skills/aura-slide/brands/clay-pop/brand-style.md`, `engine/form/themes/5-clay-pop.{mp4,jpg}`.

---

## 1. `engine/deck/blender/lumi_bpy.py` — the `clay` preset, and `cycles(view=)` (Package A's file)

**What and why.** There was no clay material. `plastic` and `rubber` both read as plastic, because clay is light going
a short way into the surface and coming back out, which neither does. The preset: high roughness, **no clearcoat**,
subsurface 0.2 with its radius derived from the colour (so the light comes back tinted to the hue, never grey), a soft
sheen, and a thumbed bump (broad presses + fine grain through one Bump node). Edge wear and cavity stay 0: clay is soft,
not scuffed, and the edge highlight comes from `bevel()`.

**Checked, not assumed (the brief asked):** `_set(b, **kw)` did **not** silently drop unknown keywords - it **raised
`KeyError`** (`names[k]`), so `L.mat('plastic', subsurface=0.1)` crashed the scene. It knew no subsurface input at
all. The diff adds `sss`, `sss_radius`, `sss_scale`, `sheen_rough`.

**Tone map.** `cycles()` hard-coded AgX. Measured on the same clay scene: AgX (Medium High Contrast, Punchy, Base
Contrast) all turn `#FF6A13` salmon or dull red; Khronos PBR Neutral is accurate but flat; **Standard** keeps it hot and
lets the lit faces drift to yellow - the reference's own colour shift (sampled: tops `#FDB23B`, mids `#D96D07`). Clay is
matte, so Standard's highlight clipping does not bite. The diff adds `view='AgX'` (default unchanged for every other
look); Clay Pop scenes call `L.cycles(a.samples, view='Standard')`.

Unified diff against the file as it was at 2026-10-07 23:40 (the repo copy was unchanged when this was written; a copy
of the patched file is `X:\aura-dev-clay\lumi_bpy.py`, and the diff alone is `X:\aura-dev-clay\clay-preset.diff`):

```diff
--- a/engine/deck/blender/lumi_bpy.py
+++ b/engine/deck/blender/lumi_bpy.py
@@ -217,9 +217,11 @@
     return 'CPU'
 
 
-def cycles(samples=128, denoise=True, look='AgX - Medium High Contrast', exposure=0.0):
+def cycles(samples=128, denoise=True, look='AgX - Medium High Contrast', exposure=0.0, view='AgX'):
     """Cycles quality preset: adaptive sampling, OIDN denoise (albedo+normal, on GPU when possible), light paths
-    sized for metal/glass, indirect clamp against fireflies, no caustics, AgX + contrast look (see module doc)."""
+    sized for metal/glass, indirect clamp against fireflies, no caustics, AgX + contrast look (see module doc).
+    view: the view transform. 'Standard' for Clay Pop: AgX desaturates a vivid primary toward salmon (measured), and
+    matte clay has no highlight for Standard to clip. Any view other than AgX drops the AgX look."""
     s = bpy.context.scene
     s.render.engine = 'CYCLES'
     c = s.cycles
@@ -242,9 +244,9 @@
     c.film_transparent_glass = True
     s.render.use_persistent_data = True       # faster frame sequences
     vs = s.view_settings
-    vs.view_transform = 'AgX'
+    vs.view_transform = view
     try:
-        vs.look = look or 'None'
+        vs.look = (look or 'None') if view == 'AgX' else 'None'
     except TypeError:
         vs.look = 'None'
     vs.exposure, vs.gamma = exposure, 1.0
@@ -271,7 +273,8 @@
     names = {'color': 'Base Color', 'metal': 'Metallic', 'rough': 'Roughness', 'ior': 'IOR', 'coat': 'Coat Weight',
              'coat_rough': 'Coat Roughness', 'sheen': 'Sheen Weight', 'trans': 'Transmission Weight',
              'emit_color': 'Emission Color', 'emit': 'Emission Strength', 'aniso': 'Anisotropic',
-             'spec': 'Specular IOR Level'}
+             'spec': 'Specular IOR Level', 'sss': 'Subsurface Weight', 'sss_radius': 'Subsurface Radius',
+             'sss_scale': 'Subsurface Scale', 'sheen_rough': 'Sheen Roughness'}
     for k, v in kw.items():
         if v is None:
             continue
@@ -448,6 +451,34 @@
     return bv
 
 
+def _clay_to(nt, b, lo, hi):
+    """Hand-made clay surface (Clay Pop): two noise layers in object space through ONE bump -- broad, shallow thumb
+    presses (about 1/7 of a 1 m subject) and a fine grain -- plus a small roughness drift. Written for a subject 1 m
+    across; studio() rescales the mapping and the bump distance to the real one (_fx_scale)."""
+    n, lk = nt.nodes, nt.links
+    tc = n.new('ShaderNodeTexCoord')
+    mp = n.new('ShaderNodeMapping'); mp.name = mp.label = 'lumi_clay_map'
+    lk.new(tc.outputs['Object'], mp.inputs['Vector'])
+    press = n.new('ShaderNodeTexNoise')
+    press.inputs['Scale'].default_value, press.inputs['Detail'].default_value = 7.0, 1.5
+    grain = n.new('ShaderNodeTexNoise')
+    grain.inputs['Scale'].default_value, grain.inputs['Detail'].default_value = 140.0, 4.0
+    for nz in (press, grain):
+        lk.new(mp.outputs['Vector'], nz.inputs['Vector'])
+    mix = n.new('ShaderNodeMath'); mix.operation = 'MULTIPLY_ADD'      # press + 0.25 * grain
+    lk.new(grain.outputs['Fac'], mix.inputs[0]); mix.inputs[1].default_value = 0.25
+    lk.new(press.outputs['Fac'], mix.inputs[2])
+    bp = n.new('ShaderNodeBump'); bp.name = bp.label = 'lumi_clay_bump'
+    bp.inputs['Strength'].default_value = 0.6
+    bp.inputs['Distance'].default_value = 0.004
+    lk.new(mix.outputs[0], bp.inputs['Height'])
+    lk.new(bp.outputs['Normal'], b.inputs['Normal'])
+    mr = n.new('ShaderNodeMapRange')
+    mr.inputs['To Min'].default_value, mr.inputs['To Max'].default_value = lo, hi
+    lk.new(press.outputs['Fac'], mr.inputs['Value'])
+    lk.new(mr.outputs['Result'], b.inputs['Roughness'])
+
+
 def _fx_scale(size):
     """Scale every cavity distance and bevel radius already built to a subject `size` metres across (the presets are
     written for a subject about 1 m across: ~5 cm cavity reach, ~2.5 mm edge radius). studio() calls this once."""
@@ -461,6 +492,12 @@
                 nd.inputs['Distance'].default_value *= k; nd['lumi_scaled'] = 1
             elif nd.name == 'lumi_wear_bevel':
                 nd.inputs['Radius'].default_value *= k; nd['lumi_scaled'] = 1
+            elif nd.name == 'lumi_clay_bump':                 # the thumbed surface keeps its size relative to the subject
+                nd.inputs['Distance'].default_value *= k; nd['lumi_scaled'] = 1
+            elif nd.name == 'lumi_clay_map':
+                nd.inputs['Scale'].default_value = [v / k for v in nd.inputs['Scale'].default_value]; nd['lumi_scaled'] = 1
+            elif nd.type == 'BSDF_PRINCIPLED' and m.get('lumi_recipe') == 'clay':   # SSS reach: ~1.5 % of the subject
+                nd.inputs['Subsurface Scale'].default_value *= k; nd['lumi_scaled'] = 1
 
 
 def wear_amount(cavity=None, wear=None):
@@ -493,6 +530,11 @@
     'paint':     (dict(color=C['blue'], rough=0.4, coat=0.4, coat_rough=0.25), ('speckle', 0.32, 0.5), 0.35, 0.35),
     # AgX walks bright emission toward white: 1.0-1.5 keeps a hot orange, 3.5 already reads pale salmon (measured)
     'glow':      (dict(color='#2A1208', rough=0.45, metal=0.3, emit_color=C['hot'], emit=1.2), None, 0.0, 0.0),
+    # Clay Pop: matte, NO coat, a little subsurface tinted to the hue (radius derived from the colour in mat()), a
+    # soft sheen for the velvet rim, a thumbed bump. No edge wear ever: clay is soft, not scuffed -- edges come from
+    # bevel(). Tuned on 1080p renders against #F0F0F5, see docs/REGISTER-CLAY.md.
+    'clay':      (dict(color='#FF6A13', rough=0.45, spec=0.4, coat=0, sss=0.2, sss_scale=0.015, sheen=0.25,
+                       sheen_rough=0.45), ('clay', 0.34, 0.46), 0.0, 0.0),
 }
 # a worn edge shows the material underneath, not just a lighter version of the coat
 WEAR_TINT = {'paint': '#CFD2D6', 'plastic': '#E4E1DC', 'cast_iron': '#B8B2AA'}
@@ -501,7 +543,7 @@
 
 def mat(kind, color=None, name=None, cavity=None, wear=None, hero=False, **kw):
     """PBR preset -> bpy material (cached by name). kinds: steel aluminium cast_iron titanium copper brass chrome
-    glass ceramic rubber plastic paint glow section. color='#hex' recolours (paint/plastic: any palette colour;
+    glass ceramic rubber plastic paint glow clay section. color='#hex' recolours (paint/plastic/clay: any palette colour;
     glow: the emission colour). Extra kw override principled inputs: rough, metal, coat, emit, ior, trans ...
     cavity / wear override the preset's geometry-driven pair (0 switches one off, 1.0 is strong).
     hero=True opts a non-metal (paint, plastic, ceramic) into edge wear: by default only the metals carry it.
@@ -517,6 +559,8 @@
     if color:
         base['emit_color' if kind == 'glow' else 'color'] = color
     base.update(kw)
+    if kind == 'clay' and 'sss_radius' not in base:      # light comes back out tinted toward the hue, never grey
+        base['sss_radius'] = tuple(0.15 + 0.85 * c for c in lin(base['color'])[:3])
     m, nt, b = _bsdf(name)
     _set(b, **base)
     if tex:
@@ -528,6 +572,8 @@
         elif t == 'cast':
             _noise_to(nt, b, 'Roughness', 8.0, lo, hi)
             _bump(nt, b, 40.0, 0.25)
+        elif t == 'clay':
+            _clay_to(nt, b, lo, hi)
     # geometry-driven pair, after the texture recipe so it chains onto it instead of replacing it
     default_on = (kind in METALS) or hero
     cav = cavity if cavity is not None else (p_cav if (default_on and bpy.context.scene.get('lumi_cavity')) else 0)
```

**Measured settings** (bundled Blender 5.2.2, OptiX on the MX350, another session's render sharing the GPU):

| setting | value | why |
|---|---|---|
| roughness | 0.34 – 0.46, driven by the press noise | below 0.3 reads as vinyl gloss; above 0.55 the bevel highlight disappears and it reads as felt |
| coat | 0 | the clearcoat is exactly what makes `plastic` read as plastic |
| subsurface | weight 0.2, scale 1.5 % of the subject, radius = 0.15 + 0.85 x linear colour | lower than 0.12 is invisible; the hue-tinted radius stops grey edges |
| sheen | 0.25, roughness 0.45 | the soft velvet rim at grazing angles |
| bump | strength 0.6, distance 0.4 % of the subject; presses at 1/7 of a 1 m subject + grain x0.25 | visible at 1080p, invisible at preview size |
| studio | `bg='#F0F0F5'`, `wear=0`; key / fill / rim unchanged | the existing sweep studio already gives the soft contact shadow |
| `--preview` 576x324 16 spp | 10 s | composition only: SSS and grain are noise at 16 spp |
| 960x540, 64 spp | 22 s | |
| **1920x1080, 128 spp, the clay-camera proof scene** | **129 s** | |
| 1280x720, 48 spp, per animation frame | ~30 s (GPU shared) | 80 frames = ~40 min: the reason animated figures wait for the bake path |

**For Package A (bake path), two things to know:** (1) subsurface does not bake into a glTF material - the baked
version will read as `plastic`-ish unless the bake lifts the base colour toward the SSS tint; (2) `mat()` only builds
the cavity node for metals and `hero=True`, so a baked clay figure gets **no AO** unless the bake path turns cavity on for
`clay` too. Crease AO is half of what makes clay read as clay, so it should.

Optional, same owner: `workspace/.claude/skills/aura-slide/looks/bold-blue/BLENDER.md` section 4, the list of kinds
(`steel aluminium ... glow section`) → add `clay` and the line "`clay` is Clay Pop's material - see
`looks/clay-pop/LOOK.md` 3.3".

---

## 2. `engine/form_server.py`

**2a.** `LOOK_SPECS` (line ~602): add an entry after `'flat-pack'`:
```python
    'clay-pop': '.claude/skills/aura-slide/looks/clay-pop/LOOK.md',
```

**2b.** `LOOK_3D` (line ~614):
```python
LOOK_3D = {'bold-blue': 'blender', 'flat-pack': 'threejs', 'clay-pop': 'blender'}
```

**2c.** `SHELL_THEMES` (line ~1735):
```python
SHELL_THEMES = ('pink-punch', 'bold-blue', 'flat-pack', 'happy-headspace', 'clay-pop')     # new_deck.js THEMES
```

**2d.** `bl_build_block()` (line ~5617) - its text is written for Bold Blue (`bb-3d`, `.bb-stage`, `bg` keys `canvas` /
`stage` / ..., `bb-tag`), so a Clay Pop Blender slide would be told to composite onto Bold Blue's `#F9F4F2` and the
checker would then fail its edges against `#F0F0F5`. Add one look-aware line. Replace the final `])` of the list with:
```python
    ] + ([
        '- CLAY POP: follow `.claude/skills/aura-slide/looks/clay-pop/LOOK.md` section 3.3 where it differs from BLENDER.md: '
        '`L.cycles(a.samples, view=\'Standard\')`, every part `L.mat(\'clay\', color=...)` with a generous `L.bevel`, '
        '`L.studio(fit=parts, bg=\'#F0F0F5\', wear=0)`. The holder is `<div class="bb-blender cp-3d" ...>` inside `.cp-stage` '
        '(`cp-full` for the title); labels are `<div class="cp-tag" data-anchor="name">`. Exactly one wink of personality per figure.'
    ] if look_slug(rec.get('look')) == 'clay-pop' else []))
```

---

## 3. `engine/rules/hard-rules.json` — `looks['clay-pop']`

Add beside `bold-blue` and `flat-pack` (the same object is in `X:\aura-dev-clay\clay-pop-rules.json`):
```json
"clay-pop": {
  "name": "Clay Pop",
  "source": "Built from the owner's claymation / vinyl-toy reference (workspace/.claude/skills/aura-slide/brands/clay-pop/brand-style.md, measured 2026-10-07): body 30 px, sub-lines, step and goal names 40 px, medium stats and the process card's step name 56 px, headline and big stats 80 px, title 120 px, closing word 168 px; kicker, footer mark, page number, captions, source lines, label-tag descriptions, chart ticks and axis titles 24 px DM Mono. Two typefaces (Plus Jakarta Sans, DM Mono). Type scale 24/30/40/56/80/120/168.",
  "minFontPx": 24,
  "svgTolerancePx": 0.3,
  "bodyMinPx": 30,
  "bodyMinExempt": ".cp-foot, .cp-mark, .cp-pageno, .kicker, .cap, .source, figcaption, .cp-tag span, .cp-tick, .cp-cap, .cp-cyc .step, .cp-rail .tr b, .cp-meta .lb, .cp-people .lb",
  "typeScale": [24, 30, 40, 56, 80, 120, 168],
  "wordBudget": { "title": 32, "section": 10, "content": 40, "quote": 24, "closing": 30, "references": 140, "document": 80 },
  "whitespace": { "title": 0.45, "section": 0.65, "quote": 0.65, "closing": 0.6, "content": 0.4, "references": 0.3 },
  "maxTypefaces": 2,
  "maxSizesPerSlide": 5,
  "maxSizesPerDeck": 7,
  "safeZonePx": 96,
  "bodyMinIsError": true,
  "bodyMinExemptNote": "24 px (DM Mono) is allowed only for the kicker, the footer mark, the page number, captions / source lines, the description line of a label tag, chart ticks and axis titles, the process card's step counter and rail beads, and the small uppercase labels on the title and closing slides. Everything else is at least 30 px."
}
```
**Apply together with 9a** - a test keeps the `CLAUDE.md` numbers table and this file identical.

---

## 4. `engine/tools/new_deck.js`

```js
const THEMES = { 'pink-punch': 'Pink Punch', 'bold-blue': 'Bold Blue', 'flat-pack': 'Flat-Pack',
  'happy-headspace': 'Happy Headspace', 'clay-pop': 'Clay Pop' };
```
Usage line: `--theme pink-punch|bold-blue|flat-pack|happy-headspace|clay-pop`.
`LOOK_HEAD`, after the `'flat-pack'` entry:
```js
  'clay-pop': SHARED_HEAD +
               '<script src="{{ENGINE}}/deck/looks/clay-pop/clay-pop.js"></script>\n' +
               '<script src="{{ENGINE}}/deck/looks/clay-pop/cp3d.js"></script>\n',
```
```js
const LOOK_SPEC = { 'bold-blue': 'Bold Blue', 'flat-pack': 'Flat-Pack', 'clay-pop': 'Clay Pop' };
```

---

## 5. `engine/deck/lib/post-policy.js` — the look's post tiers

After the `register('flat-pack', ...)` line:
```js
  /* Clay Pop is a RENDER look: crease AO is half of what makes clay read as clay, so every tier keeps it (clinical).
     The opening gets `showpiece` (adds FXAA; the bloom threshold stays 3.2, and matte clay emits nothing, so bloom stays
     dark). Never depth of field: a clay set is shot sharp, and the measured-values gate stays closed. */
  register('clay-pop', { hero: 'showpiece', body: 'clinical', closing: 'hero', heroSlides: 2, allowOnMeasured: false });
```
Without it the live `CP3D` scenes still render, just without crease AO (an unregistered look gets no post).

---

## 6. `engine/form/js/looks.js`

In `LOOKS`, before `'Claude chooses'`:
```js
  { name: 'Clay Pop', slug: '5-clay-pop', desc: 'tactile 3D: chunky clay models in one hot orange, soft studio light' },
```
In `SWATCH`:
```js
  'Clay Pop': '<rect x="4" y="4" width="36" height="36" rx="8" fill="#f0f0f5"/><ellipse cx="20" cy="35.5" rx="11" ry="2" fill="#15151c" opacity=".16"/><rect x="9" y="16" width="22" height="19" rx="6" fill="#c93a05"/><rect x="9" y="14" width="22" height="18" rx="6" fill="#ff6a13"/><rect x="12" y="16" width="16" height="4" rx="2" fill="#ff9a3d"/><circle cx="33" cy="10.5" r="3.6" fill="#ff6a13"/><rect x="21" y="23" width="7" height="4" rx="1" fill="#f2c29a" transform="rotate(-18 24.5 25)"/>',
```
Header comment (lines 1-2): "five looks in the right column" stays true only if "Claude chooses" is counted; make it
"six entries in the right column (five looks + Claude chooses)" and "a playful shuffle through the five looks".

---

## 7. `engine/form/js/home.js` (line 36)

```js
const LOOK_DOT = { 'Pink Punch': '#e46fa0', 'Bold Blue': '#2f5cf5', 'Flat-Pack': 'var(--orange)', 'Happy Headspace': '#f6c445', 'Clay Pop': '#ff6a13' };
```

---

## 8. `engine/form/js/scenes/review.js`

**8a.** Line 9: `const LOOKS = ['Pink Punch', 'Bold Blue', 'Flat-Pack', 'Happy Headspace', 'Clay Pop'];`
and the header comment: "(Pink Punch, Bold Blue, Flat-Pack, Happy Headspace, Clay Pop); "Claude chooses" gently cycles
through all five". Comment above the drawings: "the five looks".

**8b.** After `function headspace(d) { ... }`, add:
```js
function clayPop(d) {
  const g = h('g');
  const t = fitF(d.title, { sizes: [28, 25, 22, 19, 17, 15], fam: 'jak', weight: 800, width: 236, lines: 4 });
  const lh = Math.round(t.size * 1.1), ty = 66 + t.size * 0.8;            // a 4-line title keeps its key clear of the names
  const lastY = ty + lh * (t.lines.length - 1);
  const keyW = Math.min(244, tw(t.lines[t.lines.length - 1] || '', t.size, 'jak', 800) + 12);
  g.append(
    h('rect', { width: W, height: H, fill: '#f0f0f5' }),
    h('ellipse', { cx: 352, cy: 197, rx: 66, ry: 9, fill: '#15151c', opacity: 0.12 }),            // the contact shadow
    h('rect', { x: 296, y: 104, width: 112, height: 92, rx: 22, fill: '#c93a05' }),                 // a clay block: shadow side
    h('rect', { x: 296, y: 98, width: 112, height: 88, rx: 22, fill: '#ff6a13' }),
    h('rect', { x: 306, y: 104, width: 92, height: 14, rx: 7, fill: '#ff9a3d' }),                    // its lit top edge
    h('rect', { x: 318, y: 84, width: 40, height: 18, rx: 9, fill: '#2a2724' }),
    h('rect', { x: 368, y: 150, width: 26, height: 16, rx: 3, fill: '#f2c29a', transform: 'rotate(-18 381 158)' }),   // the one wink
    h('g', { transform: 'translate(298,56)' }, [h('g', { class: 'bob' }, [h('circle', { r: 11, fill: '#ff6a13' })])]),
    h('g', { transform: 'translate(392,44)' }, [h('g', { class: 'bob', style: { animationDelay: '-1.2s' } }, [h('circle', { r: 7, fill: '#b9b6b3' })])]),
    h('circle', { cx: 30, cy: 36, r: 5, fill: '#ff6a13' }),
    textF(42, 40.5, [short(d.kicker.toUpperCase(), 12, 220)], { size: 12, fam: 'jak', weight: 700, fill: '#2b2b33', spacing: '0.12em' }));
  if (!d.empty && t.lines.length > 1)                                                                  // the emphasis: an orange clay key
    g.append(h('rect', { x: 20, y: lastY - t.size * 0.82, width: keyW, height: t.size * 1.08, rx: t.size * 0.22, fill: '#ff6a13' }));
  g.append(
    textF(24, ty, t.lines, { size: t.size, fam: 'jak', weight: 800, fill: d.empty ? '#b9b9c4' : '#15151c', lh: 1.1 }),
    textF(24, 212, [short(namesLine(d), 14, 240)], { size: 14, fam: 'jak', weight: 600, fill: '#15151c' }),
    textF(24, 232, [short(d.foot, 13, 240)], { size: 13, fam: 'jak', weight: 400, fill: '#5a5a66' }));
  return g;
}
```
(`jak` = Plus Jakarta Sans, already in `FONT_CSS`. This drawing was not rendered in the app - `engine/form/js` was
off limits - so look at it once on the "Make it" screen.)

**8c.** `const DRAW = { 'Pink Punch': pinkPunch, 'Bold Blue': boldBlue, 'Flat-Pack': flatPack, 'Happy Headspace': headspace, 'Clay Pop': clayPop };`

**8d.** Line ~236, the shuffle dots: `cx: (i - 2) * 14` was centred for five dots, not four - with Clay Pop it is right
by accident. Prefer `cx: (i - (LOOKS.length - 1) / 2) * 14`.

---

## 9. Workspace documents (`workspace/.claude/`)

**9a. `CLAUDE.md`, the numbers table** - add a fourth column `Clay Pop (`looks/clay-pop/LOOK.md`)` with, row by row:
- Text floor: `24 px, and only in DM Mono for the kicker, footer mark, page number, captions / source lines, label-tag descriptions, chart ticks and axis titles`
- Everything else: `at least 30 px (error below)`
- Type scale: `24 · 30 · 40 · 56 · 80 · 120 · 168`
- Words per slide, presenter: `title 32 · section 10 · content 40 · quote 24 · closing 30 · references 140`
- Words per content slide, document mode: `80`
- Typefaces: `2 (Plus Jakarta Sans and DM Mono)`
- Main visuals: `the same`

**9b. `CLAUDE.md` line ~117:** "The **five** Aura themes: Pink Punch, Bold Blue, Flat-Pack, Happy Headspace, Clay Pop."
and "Bold Blue, Flat-Pack and Clay Pop each have their own brand file".

**9c. `skills/aura-slide/SKILL.md` lines ~198-199:** "one of the **five** Aura themes"; "A look with its own spec
(Bold Blue, Flat-Pack, Clay Pop)".

**9d. `skills/aura-slide/aura-blend.md`:** heading "## The **five** Aura themes" and a row 5:
```
| 5 | **Clay Pop** | the owner's claymation / vinyl-toy reference (aesthetic only, no brand) | Plus Jakarta Sans (800 display, 500 text) + DM Mono (small labels) | cool near-white `#F0F0F5` · ink `#15151C` · ONE hot clay orange `#FF6A13` doing almost all the work · black and grey as punctuation | chunky bevelled clay models rendered in Blender (soft studio light, contact shadow, the subject's own parts floating beside it, exactly one wink per figure); the emphasis phrase is an orange clay key. **Its own authority: `looks/clay-pop/LOOK.md`** |
```
and under "Brand files": "Bold Blue, Flat-Pack and Clay Pop follow `looks/_shared/LOOK-BASE.md` plus their own
`looks/<look>/LOOK.md` ... Clay Pop's DNA is `brands/clay-pop`, but its LOOK.md wins." and add `brands/clay-pop` to the
list of brand folders.

**9e. `skills/aura-slide/deck-toolkit.md`, the Themes table:**
```
| Clay Pop | `clay-pop` | product and device talks, engineering builds, anything physical you want the room to want to touch. **Follow `looks/_shared/LOOK-BASE.md` then `looks/clay-pop/LOOK.md`** |
```

Nothing here resurrects Yellow Frame; none of these lines mention it.

---

## 10. Found while checking - not Clay Pop's to fix, worth a look

- **`engine/tools/deck_check.js` line ~151** exempts only Bold Blue's chrome from the number check
  (`.bb-foot, .bb-pageno, .bb-mark, [data-nonclaim]`). Any other look's page number ("03 / 12") is reported as an
  unexplained number "12" on every slide - Flat-Pack's `.fp-foot` included. Clay Pop sidesteps it by marking its footer
  `data-nonclaim`; the general fix is to add `.cp-foot, .fp-foot` (or every look's footer class) to that selector.
- `deck_check.js` measures a CSS-scaled element's type at its scaled size (`getBoundingClientRect / offsetWidth`), so
  an "active" state done with `transform: scale()` reads as an off-scale type size. Clay Pop grows its active bead by
  width instead. Flat-Pack's `fpSnap` (scale .82) on text-holding tiles may hit the same warning mid-entrance.
- The `?still=<n>` view renders the stage at scale 1 from the window's top-left, so at 1366x768 it is a crop, not a
  scaled slide. Overflow at small windows has to be checked in presenter mode (that is how Clay Pop was checked).

---

## 11. How to check it after applying (light checks only)

```
node --check engine/tools/new_deck.js && node --check engine/deck/lib/post-policy.js && node --check engine/form/js/looks.js
node --check engine/form/js/home.js && node --check engine/form/js/scenes/review.js
python -c "import ast; ast.parse(open('engine/form_server.py', encoding='utf-8').read()); ast.parse(open('engine/deck/blender/lumi_bpy.py', encoding='utf-8').read())"
python -c "import json; json.load(open('engine/rules/hard-rules.json', encoding='utf-8'))['looks']['clay-pop']"
```
Then, from a sandbox install (not the repo): `node .aura/engine/tools/new_deck.js "Test" --theme clay-pop`, serve over
HTTP, open it, and open the look picker to see the fifth tile play `5-clay-pop.mp4`.
