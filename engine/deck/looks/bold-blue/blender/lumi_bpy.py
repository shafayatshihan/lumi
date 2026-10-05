"""lumi_bpy - the Bold Blue studio for Blender 5.x / Cycles, headless.

Usage (scene.py): copy the template in BLENDER.md section 2. It finds this folder by itself (LUMI_BPY, which Lumi
sets, else by walking up from the scene file to .aura/engine/deck/looks/bold-blue/blender), then
    a = L.args(); L.reset(a); L.gpu(a); L.cycles(a.samples)
    ... build meshes, give them L.mat('steel') etc ...
    L.cutaway(parts, normal=(0, -1, 0))          # optional
    L.studio(fit=parts)                          # backdrop sweep, lights, world (after the subject exists)
    L.camera(parts, view='three-quarter', fill=0.7, frame_right=True)
    L.loop(4.0); L.turntable(parts)              # optional: a seamless 20 fps animation (Lumi renders it with --anim)
    L.render(a.out)
Standard mechanical parts (involute gears, springs, ISO bolts and nuts, blade rings, bearings) are in lumi_mech,
beside this file: `import lumi_mech as M`. Model the REAL counts and dimensions; ask when one is unknown.
Run it as ONE plain command (no full path, no pipes, no redirection, no &, no $(...)):
    blender -b -P scene.py -- --out <work folder>/scratch/check.png --preview
Check it for free BEFORE any render -- no GPU, about a second, exits non-zero on a fatal finding:
    blender -b -P scene.py -- --inspect
Lumi's server renders the preview the user sees and, once approved, the full render
(still: --height 1080 --samples 128; animation: --anim --height 720|1080 --samples 64).

It mirrors studio3d.js (three.js) as closely as Cycles allows: Bold Blue palette, warm key from the upper LEFT
front, cool fill from the right, a rim from behind, a softbox world with two black flags (the dark edge lines on
metal), soft contact shadows on a shadow-catching floor/cove, and the background composited to the EXACT slide colour.

COLOUR MANAGEMENT (why the background is exact). The slide canvas must come out as #F9F4F2 to the byte, but any
filmic view transform (AgX, Filmic, Khronos PBR Neutral) bends every scene value, so no lit backdrop or world colour
ever lands on 249,244,242. So: Cycles renders the subject with film transparent; the floor is a SHADOW CATCHER
(writes only the soft shadow into alpha) and the cove/back wall is camera-invisible (bounce light only); render()
then alpha-overs that RGBA PNG onto the flat canvas colour in display (sRGB) space. The background is exact by
construction, independent of exposure, and the subject keeps a filmic transform. View transform default: AgX with
the 'Medium High Contrast' look -- plain AgX is washed out and grey on this high-key studio, 'Standard' clips the
softbox highlights on chrome to flat white. transparent=True in studio() skips the composite (alpha PNG for a slide).

PITFALLS (each one has cost a benchmark run):
- BLACK / BLANK render: no camera or scene.camera unset (camera() sets it); lights too weak for the scene scale
  (studio() scales power with the subject size and distance); film transparent and the PNG viewed without its
  alpha (render() composites unless transparent=True); objects in an excluded/disabled view layer collection or with
  hide_render; camera clip_start larger than the subject's distance or clip_end too short (camera() sets both).
- '//' output paths need a saved .blend; in -b mode use absolute paths (render() makes them absolute).
- PALE GLOW: AgX desaturates bright emission (strength 3.5 on #FF5A1F reads salmon). glow defaults to 1.2.
- WASHED-OUT / GREY: plain AgX on a bright studio. Keep the AgX look or lower world strength; never brighten the
  floor to fight it -- the floor is a shadow catcher and its own colour never reaches the image.
- NORMALS INSIDE-OUT: hand-built or bmesh-extruded meshes render black/odd. Call L.fix_normals(obj).
- SMOOTH SHADING: shade_smooth() alone smears flat caps; use L.smooth(obj) (set_sharp_from_angle, Blender 4.1+
  replaced auto-smooth). After a boolean the cut face stays flat because smooth() re-marks sharp edges.
- BOOLEAN FAILURES: the EXACT solver needs closed, manifold, non-self-intersecting meshes. Primitive ops are fine;
  joined/overlapping parts are not -- cut each part separately (cutaway() takes a list). cutaway() checks the
  result and falls back to the FLOAT solver, then reports a failure instead of silently returning an uncut mesh.
- FIRST OPTIX RUN compiles kernels (minutes, once per Blender version; cached after). gpu() prints the device.
- GLASS on a transparent film needs film_transparent_glass (set) or the backdrop will not show through it.
- bpy.ops.render.render inside a script blocks. Blender 5 prints no render progress by default (so a check render
  costs Claude few tokens); Lumi's server adds `--log-level info --log render` for its "Fra: 1 | ... | Sample 12/128"
  lines and reads the [lumi] lines that render() prints.
- CAVITY vs EDGE WEAR: edge wear (a Bevel node) is a MATERIAL variation and is on by default for the hero material
  and the metals, at 3 samples (+3-9%, measured). Cavity dirt (an AO node) is OFF for Cycles, which already
  path-traces crevice darkening, and is kept for the bake path: --cavity, scene['lumi_cavity'], L.mat(cavity=),
  L.studio(cavity=). The FIRST render of a scene using either node makes OptiX compile a new kernel for the
  shader-raytracing feature set -- about 4 minutes, once per Blender install. That is not the per-render cost.
- ANIMATION LOOPS: animate with loop() + spin()/wave()/turntable()/animate(). They key EVERY frame 1..N+1 with a
  periodic function, so frame N+1 equals frame 1 and the N rendered frames loop without a jump. No interpolation mode
  or F-curve API is involved (that API changed in Blender 4.4/5.0). Motion blur stays off.
"""
import bpy, bmesh, math, sys, os, time, argparse
from mathutils import Vector, Matrix

# Never call Blender by a full path: run plain `blender` (Lumi puts the bundled one on PATH). Kept for old scenes.
BLENDER = r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
FPS = 20                                   # Lumi animations: 20 fps seamless loops
PREVIEW_RES, PREVIEW_SAMPLES = 30, 16      # --preview: 576x324 (of 1080p) at 16 spp, about 10 s on a laptop GPU

# ---------------------------------------------------------------- palette (LOOK.md section 1 + studio3d.js C)
C = {
    'canvas': '#F9F4F2', 'stage': '#EFEBE6', 'blueprint': '#EEF0F2', 'title': '#EEEBE7', 'close': '#F7F5F2',
    'cyc': '#F1EEEA', 'ink': '#2D2C2B', 'muted': '#5C5751', 'hairline': '#E2DED9', 'white': '#F4F2EF',
    'blue': '#0061EF', 'orange': '#FF7E1D', 'hot': '#FF5A1F', 'red': '#E23B00', 'sky': '#00A4FF', 'green': '#02873E',
    'copper': '#C97B3C', 'brass': '#C9A15A', 'gold': '#F5B800', 'steel': '#C3C6CD', 'aluminium': '#D6D8DC',
    'rubber': '#2A2A2E', 'cast': '#5E5A56', 'titanium': '#A9A39A', 'ceramic': '#F4F1EC', 'chrome': '#ECEDEF',
}


def srgb(hexstr):
    """'#RRGGBB' -> 0..1 display values."""
    h = hexstr.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def lin(hexstr, a=1.0):
    """'#RRGGBB' -> scene-linear RGBA for shader sockets (Blender colours are linear)."""
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return tuple(f(c) for c in srgb(hexstr)) + (a,)


# ---------------------------------------------------------------- command line
class _A:
    pass


def args(argv=None):
    """Parse the args after '--':
      --out <file.png | folder>   where to write (a folder, or a path without .png, gets render.png / frame_0001.png ...)
      --res <pct>                 percentage of the base size (default 100; 30 with --preview)
      --height <px>               base size, 16:9 at this height: 1080 (default) or 720
      --samples <n>               Cycles samples (default 128; 16 with --preview)
      --preview                   cheap check: low res and samples, simplified, ONE frame (the poster) even for animations
      --inspect                   render NOTHING: print one [lumi] inspect {...} JSON line about the scene and exit
                                  non-zero on a fatal finding (BLENDER.md sections 6 and 8)
      --cavity                    switch the cavity-dirt AO node on (off for Cycles, which path-traces it already;
                                  the bake path of batch 6 Part B is what needs it)
      --anim                      render every frame of the loop (set by loop()) into the --out folder
      --frame <n>                 the frame a still or preview shows (default: the poster frame, else frame 1)
      --fps <n>                   frames per second (default 20)
      --frames <n>                legacy: render the first n frames
      --cpu                       force the CPU
    Unknown arguments are reported and ignored (a scene never dies on a flag it does not know)."""
    if argv is None:
        argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser(prog='scene.py')
    p.add_argument('--out', default=os.path.join(os.getcwd(), 'render.png'))
    p.add_argument('--res', type=int, default=None)
    p.add_argument('--height', type=int, default=1080)
    p.add_argument('--samples', type=int, default=None)
    p.add_argument('--preview', action='store_true')
    p.add_argument('--inspect', action='store_true')
    p.add_argument('--cavity', action='store_true')
    p.add_argument('--anim', action='store_true')
    p.add_argument('--frame', type=int, default=None)
    p.add_argument('--fps', type=int, default=FPS)
    p.add_argument('--frames', type=int, default=None)
    p.add_argument('--cpu', action='store_true', help='force CPU')
    a, unknown = p.parse_known_args(argv)
    if unknown: print('[lumi] ignored arguments: ' + ' '.join(unknown), flush=True)
    if a.res is None: a.res = PREVIEW_RES if a.preview else 100
    if a.samples is None: a.samples = PREVIEW_SAMPLES if a.preview else 128
    a.res = max(1, min(100, a.res))
    a.height = max(144, min(2160, a.height))
    a.fps = max(1, min(60, a.fps))
    a.out = os.path.abspath(a.out)
    return a


# ---------------------------------------------------------------- scene
def reset(a=None, res=None, fps=None):
    """Empty the startup scene (objects, meshes, materials, lights, cameras, worlds), metric units, size, fps, frame 1.
    Size: 16:9 at a.height (1080 or 720) times a.res %. An animation gets its frame range from loop()."""
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras,
                 bpy.data.curves, bpy.data.images, bpy.data.worlds):
        for d in list(coll):
            coll.remove(d)
    _fx_reset()
    _ANCHORS.clear()
    s = bpy.context.scene
    s.unit_settings.system = 'METRIC'
    s.unit_settings.scale_length = 1.0
    h = a.height if a else 1080
    s.render.resolution_x, s.render.resolution_y = res or (int(round(h * 16 / 9 / 2)) * 2, h)
    s.render.resolution_percentage = a.res if a else 100
    s.render.fps = fps or (a.fps if a else FPS)
    s.render.fps_base = 1.0
    s.render.use_motion_blur = False
    n = max(1, a.frames) if a is not None and a.frames else 1
    s.frame_start, s.frame_end = 1, n
    s.frame_set(1)
    for vl in s.view_layers:
        vl.use = True
    s['lumi_frames'] = n
    if a is not None:
        s['lumi_preview'] = bool(a.preview)
        s['lumi_inspect'] = bool(getattr(a, 'inspect', False))
        s['lumi_cavity'] = bool(getattr(a, 'cavity', False))
        s['lumi_anim'] = bool(a.anim)
        if a.frame: s['lumi_poster'] = int(a.frame)
        if a.frames: s['lumi_first_n'] = int(a.frames)
    return s


def gpu(a=None):
    """Enable the first GPU backend that has a device: OPTIX -> CUDA -> HIP -> METAL -> ONEAPI; else CPU.
    Only that backend's GPU devices are enabled (CPU+GPU hybrid is slower on a laptop). Returns e.g. 'OPTIX'."""
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    if a is not None and getattr(a, 'cpu', False):
        s.cycles.device = 'CPU'
        print('[lumi] device: CPU (forced)', flush=True)
        s['lumi_device'] = 'CPU'
        return 'CPU'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for kind in ('OPTIX', 'CUDA', 'HIP', 'METAL', 'ONEAPI'):
        try:
            prefs.compute_device_type = kind
        except TypeError:
            continue
        prefs.refresh_devices()
        found = [d for d in prefs.devices if d.type == kind]
        if not found:
            continue
        for d in prefs.devices:
            d.use = (d.type == kind)
        s.cycles.device = 'GPU'
        name = ', '.join(d.name for d in found)
        print(f'[lumi] device: GPU {kind} ({name})' + ('  -- first OptiX run compiles kernels, can take minutes' if kind == 'OPTIX' else ''), flush=True)
        s['lumi_device'] = f'{kind} {name}'
        return kind
    s.cycles.device = 'CPU'
    print('[lumi] device: CPU (no GPU backend found)', flush=True)
    s['lumi_device'] = 'CPU'
    return 'CPU'


def cycles(samples=128, denoise=True, look='AgX - Medium High Contrast', exposure=0.0):
    """Cycles quality preset: adaptive sampling, OIDN denoise (albedo+normal, on GPU when possible), light paths
    sized for metal/glass, indirect clamp against fireflies, no caustics, AgX + contrast look (see module doc)."""
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    c = s.cycles
    c.samples = samples
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.015
    c.adaptive_min_samples = 0
    c.use_denoising = denoise
    if denoise:
        c.denoiser = 'OPENIMAGEDENOISE'
        c.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
        c.denoising_prefilter = 'ACCURATE'
        c.denoising_use_gpu = True
    c.max_bounces, c.diffuse_bounces, c.glossy_bounces = 12, 3, 4
    c.transmission_bounces, c.transparent_max_bounces, c.volume_bounces = 8, 8, 0
    c.sample_clamp_direct, c.sample_clamp_indirect = 0.0, 8.0
    c.caustics_reflective = c.caustics_refractive = False
    c.blur_glossy = 1.0
    s.render.film_transparent = True          # always: render() composites onto the exact canvas colour
    c.film_transparent_glass = True
    s.render.use_persistent_data = True       # faster frame sequences
    vs = s.view_settings
    vs.view_transform = 'AgX'
    try:
        vs.look = look or 'None'
    except TypeError:
        vs.look = 'None'
    vs.exposure, vs.gamma = exposure, 1.0
    s.display_settings.display_device = 'sRGB'
    im = s.render.image_settings
    im.file_format, im.color_mode, im.color_depth = 'PNG', 'RGBA', '8'
    return c


# ---------------------------------------------------------------- materials
def _bsdf(name):
    m = bpy.data.materials.new(name)
    if hasattr(m, 'use_nodes'):
        try:
            m.use_nodes = True
        except Exception:
            pass
    nt = m.node_tree
    b = nt.nodes.get('Principled BSDF')
    return m, nt, b


def _set(b, **kw):
    names = {'color': 'Base Color', 'metal': 'Metallic', 'rough': 'Roughness', 'ior': 'IOR', 'coat': 'Coat Weight',
             'coat_rough': 'Coat Roughness', 'sheen': 'Sheen Weight', 'trans': 'Transmission Weight',
             'emit_color': 'Emission Color', 'emit': 'Emission Strength', 'aniso': 'Anisotropic',
             'spec': 'Specular IOR Level'}
    for k, v in kw.items():
        if v is None:
            continue
        sock = b.inputs[names[k]]
        sock.default_value = lin(v) if isinstance(v, str) else v


def _noise_to(nt, b, socket, scale, lo, hi, stretch=None, detail=6.0):
    """procedural texture: noise (object coords, optionally stretched = brushed streaks) -> map range -> socket."""
    n = nt.nodes
    tc = n.new('ShaderNodeTexCoord')
    mp = n.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = stretch or (1, 1, 1)
    nz = n.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = scale
    nz.inputs['Detail'].default_value = detail
    mr = n.new('ShaderNodeMapRange')
    mr.inputs['To Min'].default_value, mr.inputs['To Max'].default_value = lo, hi
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], nz.inputs['Vector'])
    nt.links.new(nz.outputs['Fac'], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], b.inputs[socket])
    return nz


def _bump(nt, b, scale, strength):
    n = nt.nodes
    tc = n.new('ShaderNodeTexCoord')
    nz = n.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value, nz.inputs['Detail'].default_value = scale, 8.0
    bp = n.new('ShaderNodeBump')
    bp.inputs['Strength'].default_value = strength
    bp.inputs['Distance'].default_value = 0.02
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    nt.links.new(nz.outputs['Fac'], bp.inputs['Height'])
    nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])


# ------------------------------------------------- geometry-driven wear: cavity dirt + edge wear (BLENDER.md 4.1)
# _noise_to and _bump vary a surface by WHERE a point is. These two vary it by WHAT SHAPE the surface has there,
# and on this look that is not a flourish: Lumi composites onto #F9F4F2, so there is no dark field for a rim light
# to separate the subject from. The form has to come from cavity darkening, edge highlights, the contact shadow and
# the graded floor -- studio() gives the last two, these give the first two.
# Both are ray-traced nodes (BLENDER.md section 7 holds the measured cost), so mat() skips them under --preview.
# MEASURED, and the measurement changed the design (BLENDER.md section 7, docs/blender-batch6-spec.md Part A):
#   * EDGE WEAR is a MATERIAL variation -- lighter, smoother, more metallic on a convex edge -- that no renderer
#     computes for you, so it is on by default, on the hero material and the metals.
#   * CAVITY DIRT is a LIGHTING effect, and Cycles already path-traces it: global illumination IS cavity darkening.
#     Measured on the cutaway test scene, adding the AO node changed 0.13% of pixels by more than 2 levels while
#     tripling the render. It is OFF for per-frame Cycles and plumbed for the BAKE path (Part B), where the target
#     is three.js, which has no GI and genuinely cannot compute it -- that is why the F1 pipeline bakes AO at all.
#     Turn it on with --cavity, scene['lumi_cavity'], L.mat(cavity=0.4) or L.studio(cavity=...).
CAVITY_SAMPLES, WEAR_SAMPLES = 3, 3        # per shading sample: these are the render cost, so they stay small
METALS = ('steel', 'aluminium', 'cast_iron', 'titanium', 'copper', 'brass', 'chrome')
_FX = {'cavity': [], 'wear': []}          # the amount Value nodes, so studio(cavity=, wear=) can scale them later


def _fx_reset():
    _FX['cavity'] = []
    _FX['wear'] = []


def _amount(nt, kind, value):
    """One Value node per effect per material: studio(cavity=, wear=) scales every one of them afterwards, which is
    why a global dial can be turned AFTER the materials were built."""
    v = nt.nodes.new('ShaderNodeValue')
    v.name = v.label = 'lumi_%s_amount' % kind
    v.outputs[0].default_value = float(value)
    _FX[kind].append(v)
    return v


def _feed(nt, b, socket):
    """What currently drives a Principled input: (from_socket or None, its default value). Lets cavity/wear chain
    onto the texture recipe instead of replacing it."""
    s = b.inputs[socket]
    return (s.links[0].from_socket if s.links else None), s.default_value


def _mix(nt, kind='RGBA'):
    """A ShaderNodeMix plus its (node, Factor, A, B, Result) sockets OF THAT TYPE. Several sockets of this node
    share the names 'A' and 'B' (float / vector / colour), so inputs['A'] alone picks the float one."""
    m = nt.nodes.new('ShaderNodeMix')
    m.data_type = kind                        # 'RGBA' or 'FLOAT' (the socket type of a float is 'VALUE')
    t = 'RGBA' if kind == 'RGBA' else 'VALUE'
    pick = lambda coll, nm: next((s for s in coll if s.name == nm and s.type == t), coll[nm])
    fac = next((s for s in m.inputs if s.name == 'Factor' and s.type == 'VALUE'), m.inputs['Factor'])
    return m, fac, pick(m.inputs, 'A'), pick(m.inputs, 'B'), pick(m.outputs, 'Result')


def _cavity_to(nt, b, strength=0.4, distance=0.05, samples=CAVITY_SAMPLES, rough_lift=0.18):
    """Cavity dirt: an only-local AO node darkens Base Color and lifts Roughness in crevices, gear roots and bolt
    recesses. only_local keeps it on the part's own shape, so a neighbouring part does not smear dirt onto it.
    distance is in metres; studio() scales it to the subject through _fx_scale(). Returns the AO node."""
    n, lk = nt.nodes, nt.links
    ao = n.new('ShaderNodeAmbientOcclusion')
    ao.only_local, ao.inside = True, False
    ao.samples = int(samples)
    ao.inputs['Distance'].default_value = float(distance)
    ao.name = ao.label = 'lumi_cavity_ao'
    inv = n.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'      # AO: 1 = open face, 0 = deep crevice
    inv.inputs[0].default_value = 1.0
    lk.new(ao.outputs['AO'], inv.inputs[1])
    amt = _amount(nt, 'cavity', strength)
    mask = n.new('ShaderNodeMath'); mask.operation = 'MULTIPLY'; mask.use_clamp = True
    lk.new(inv.outputs[0], mask.inputs[0]); lk.new(amt.outputs[0], mask.inputs[1])
    # base colour: multiplied down where the mask is high
    src, val = _feed(nt, b, 'Base Color')
    dk, dkf, dka, dkb, dkr = _mix(nt, 'RGBA'); dk.blend_type = 'MULTIPLY'; dkf.default_value = 1.0
    if src: lk.new(src, dka)
    else: dka.default_value = tuple(val)
    dkb.default_value = (0.22, 0.22, 0.22, 1.0)
    mx, mxf, mxa, mxb, mxr = _mix(nt, 'RGBA')
    lk.new(mask.outputs[0], mxf)
    if src: lk.new(src, mxa)
    else: mxa.default_value = tuple(val)
    lk.new(dkr, mxb)
    lk.new(mxr, b.inputs['Base Color'])
    # a crevice holds dust, so it is rougher than the face beside it
    if rough_lift:
        rsrc, rval = _feed(nt, b, 'Roughness')
        add = n.new('ShaderNodeMath'); add.operation = 'MULTIPLY_ADD'; add.use_clamp = True
        lk.new(mask.outputs[0], add.inputs[0])
        add.inputs[1].default_value = float(rough_lift)
        if rsrc: lk.new(rsrc, add.inputs[2])
        else: add.inputs[2].default_value = float(rval)
        lk.new(add.outputs[0], b.inputs['Roughness'])
    return ao


def _edgewear_to(nt, b, amount=0.6, radius=0.0025, samples=WEAR_SAMPLES, metal_to=None, tint='#E9E7E3'):
    """Edge wear: a Bevel node's rounded normal compared with the true geometry normal marks the convex edges, and
    those go lighter, smoother and (on paint) metallic -- the bare metal a handled part shows at its corners.
    radius is in metres; studio() scales it to the subject. metal_to lifts Metallic on the mask (paint, plastic)."""
    n, lk = nt.nodes, nt.links
    bv = n.new('ShaderNodeBevel')
    bv.samples = int(samples)
    bv.inputs['Radius'].default_value = float(radius)
    bv.name = bv.label = 'lumi_wear_bevel'
    geo = n.new('ShaderNodeNewGeometry')
    dot = n.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
    lk.new(bv.outputs['Normal'], dot.inputs[0]); lk.new(geo.outputs['Normal'], dot.inputs[1])
    mr = n.new('ShaderNodeMapRange')          # 1 = flat face; below ~0.985 = a rounded convex edge
    mr.inputs['From Min'].default_value, mr.inputs['From Max'].default_value = 0.985, 0.60
    mr.inputs['To Min'].default_value, mr.inputs['To Max'].default_value = 0.0, 1.0
    mr.clamp = True
    lk.new(dot.outputs['Value'], mr.inputs['Value'])
    amt = _amount(nt, 'wear', amount)
    mask = n.new('ShaderNodeMath'); mask.operation = 'MULTIPLY'; mask.use_clamp = True
    lk.new(mr.outputs['Result'], mask.inputs[0]); lk.new(amt.outputs[0], mask.inputs[1])
    src, val = _feed(nt, b, 'Base Color')
    mx, mxf, mxa, mxb, mxr = _mix(nt, 'RGBA')
    lk.new(mask.outputs[0], mxf)
    if src: lk.new(src, mxa)
    else: mxa.default_value = tuple(val)
    mxb.default_value = lin(tint)
    lk.new(mxr, b.inputs['Base Color'])
    # a worn edge is polished, not dull
    rsrc, rval = _feed(nt, b, 'Roughness')
    rm, rmf, rma, rmb, rmr = _mix(nt, 'FLOAT')
    lk.new(mask.outputs[0], rmf)
    if rsrc: lk.new(rsrc, rma)
    else: rma.default_value = float(rval)
    rmb.default_value = 0.08 if rsrc else max(0.02, float(rval) * 0.35)
    lk.new(rmr, b.inputs['Roughness'])
    if metal_to is not None:
        msrc, mval = _feed(nt, b, 'Metallic')
        mm, mmf, mma, mmb, mmr = _mix(nt, 'FLOAT')
        lk.new(mask.outputs[0], mmf)
        if msrc: lk.new(msrc, mma)
        else: mma.default_value = float(mval)
        mmb.default_value = float(metal_to)
        lk.new(mmr, b.inputs['Metallic'])
    return bv


def _fx_scale(size):
    """Scale every cavity distance and bevel radius already built to a subject `size` metres across (the presets are
    written for a subject about 1 m across: ~5 cm cavity reach, ~2.5 mm edge radius). studio() calls this once."""
    k = max(1e-3, float(size))
    for m in bpy.data.materials:
        nt = getattr(m, 'node_tree', None)
        if not nt: continue
        for nd in nt.nodes:
            if nd.get('lumi_scaled'): continue
            if nd.name == 'lumi_cavity_ao':
                nd.inputs['Distance'].default_value *= k; nd['lumi_scaled'] = 1
            elif nd.name == 'lumi_wear_bevel':
                nd.inputs['Radius'].default_value *= k; nd['lumi_scaled'] = 1


def wear_amount(cavity=None, wear=None):
    """Scale every cavity / edge-wear amount already built (0 switches one off). studio(cavity=, wear=) calls this,
    so the global dial works even though the materials were made before studio()."""
    for kind, v in (('cavity', cavity), ('wear', wear)):
        if v is None: continue
        for nd in _FX[kind]:
            try: nd.outputs[0].default_value = nd.outputs[0].default_value * float(v)
            except (ReferenceError, AttributeError, TypeError): pass


# kind -> (principled settings, texture recipe). Colours are the studio3d.js palette. Every metal carries a
# procedural texture (LOOK.md 4.1: textures mandatory): brushed = noise stretched along local Z (tube axis).
# cavity / wear are the geometry-driven pair (tuned against 1080p/128 spp renders on #F9F4F2, not guessed):
# cavity darkens crevices, wear lightens and polishes convex edges. glass and glow get neither -- a cavity term on
# a transmissive surface only muddies it, and emission has no form to read. paint wears through to bare metal.
PRESETS = {
    'steel':     (dict(color=C['steel'], metal=1, rough=0.22), ('brushed', 0.16, 0.30), 0.40, 0.55),
    'aluminium': (dict(color=C['aluminium'], metal=1, rough=0.32), ('brushed', 0.24, 0.42), 0.40, 0.60),
    'cast_iron': (dict(color=C['cast'], metal=0.85, rough=0.62), ('cast', 0.5, 0.75), 0.70, 0.30),
    'titanium':  (dict(color=C['titanium'], metal=1, rough=0.30), ('brushed', 0.24, 0.38), 0.40, 0.50),
    'copper':    (dict(color=C['copper'], metal=1, rough=0.27, coat=0.5, coat_rough=0.18), ('brushed', 0.2, 0.34), 0.45, 0.55),
    'brass':     (dict(color=C['brass'], metal=1, rough=0.30), ('brushed', 0.22, 0.38), 0.45, 0.55),
    'chrome':    (dict(color=C['chrome'], metal=1, rough=0.04), ('speckle', 0.03, 0.07), 0.25, 0.30),
    'glass':     (dict(color='#FFFFFF', metal=0, rough=0.02, trans=1.0, ior=1.5), None, 0.0, 0.0),
    'ceramic':   (dict(color=C['ceramic'], rough=0.35, coat=0.9, coat_rough=0.08), ('speckle', 0.3, 0.42), 0.35, 0.0),
    'rubber':    (dict(color=C['rubber'], rough=0.85), ('cast', 0.8, 0.92), 0.45, 0.0),
    'plastic':   (dict(color=C['white'], rough=0.45, coat=0.3, coat_rough=0.3), ('speckle', 0.38, 0.55), 0.30, 0.20),
    'paint':     (dict(color=C['blue'], rough=0.4, coat=0.4, coat_rough=0.25), ('speckle', 0.32, 0.5), 0.35, 0.35),
    # AgX walks bright emission toward white: 1.0-1.5 keeps a hot orange, 3.5 already reads pale salmon (measured)
    'glow':      (dict(color='#2A1208', rough=0.45, metal=0.3, emit_color=C['hot'], emit=1.2), None, 0.0, 0.0),
}
# a worn edge shows the material underneath, not just a lighter version of the coat
WEAR_TINT = {'paint': '#CFD2D6', 'plastic': '#E4E1DC', 'cast_iron': '#B8B2AA'}
WEAR_METAL = {'paint': 1.0, 'plastic': 0.5}      # bare metal through the coat


def mat(kind, color=None, name=None, cavity=None, wear=None, hero=False, **kw):
    """PBR preset -> bpy material (cached by name). kinds: steel aluminium cast_iron titanium copper brass chrome
    glass ceramic rubber plastic paint glow section. color='#hex' recolours (paint/plastic: any palette colour;
    glow: the emission colour). Extra kw override principled inputs: rough, metal, coat, emit, ior, trans ...
    cavity / wear override the preset's geometry-driven pair (0 switches one off, 1.0 is strong).
    hero=True opts a non-metal (paint, plastic, ceramic) into edge wear: by default only the metals carry it.
    Both are ray-traced, so a --preview render skips them: a preview is for composition, not surface detail.
    Cavity additionally needs the bake path or an explicit value -- see the note above CAVITY_SAMPLES."""
    if kind == 'section':
        return section(name=name or 'lumi_section', **kw)
    name = name or f'lumi_{kind}' + (f'_{color.lstrip("#")}' if color else '')
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    base, tex, p_cav, p_wear = PRESETS[kind]
    base = dict(base)
    if color:
        base['emit_color' if kind == 'glow' else 'color'] = color
    base.update(kw)
    m, nt, b = _bsdf(name)
    _set(b, **base)
    if tex:
        t, lo, hi = tex
        if t == 'brushed':
            _noise_to(nt, b, 'Roughness', 6.0, lo, hi, stretch=(40, 40, 1), detail=10)
        elif t == 'speckle':
            _noise_to(nt, b, 'Roughness', 60.0, lo, hi)
        elif t == 'cast':
            _noise_to(nt, b, 'Roughness', 8.0, lo, hi)
            _bump(nt, b, 40.0, 0.25)
    # geometry-driven pair, after the texture recipe so it chains onto it instead of replacing it
    default_on = (kind in METALS) or hero
    cav = cavity if cavity is not None else (p_cav if (default_on and bpy.context.scene.get('lumi_cavity')) else 0)
    wr = wear if wear is not None else (p_wear if default_on else 0)
    if not bpy.context.scene.get('lumi_preview'):
        if cav: _cavity_to(nt, b, strength=float(cav))
        if wr: _edgewear_to(nt, b, amount=float(wr), metal_to=WEAR_METAL.get(kind),
                            tint=WEAR_TINT.get(kind, '#E9E7E3'))
    m['lumi_recipe'] = kind                              # inspect(): this material came from a Lumi preset
    m.diffuse_color = lin(base.get('color', '#CCCCCC'))   # solid-view colour, irrelevant to the render
    return m


def section(style='hatch', fill=None, line=None, spacing=40.0, width=0.14, flip=False, name='lumi_section'):
    """SECTION-CUT face: flat matte light grey (fill = hairline #E2DED9) with screen-aligned 45-degree hatch lines in
    the Bold Blue accent (#0061EF). style='flat' drops the hatch. spacing = lines across the frame width.
    flip=True hatches at -45 degrees: give touching parts opposite hatches (drafting convention) under new names,
    e.g. L.section(flip=True, name='sec_b')."""
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m, nt, b = _bsdf(name)
    fill, line = fill or C['hairline'], line or C['blue']
    _set(b, color=fill, rough=0.9, metal=0)
    if style == 'hatch':
        n = nt.nodes
        tc = n.new('ShaderNodeTexCoord')
        sep = n.new('ShaderNodeSeparateXYZ')
        nt.links.new(tc.outputs['Window'], sep.inputs['Vector'])
        # u = (x * aspect + y) * spacing ; stripe = fract(u) < width
        ax = n.new('ShaderNodeMath'); ax.operation = 'MULTIPLY'; ax.inputs[1].default_value = (-16 if flip else 16) / 9
        nt.links.new(sep.outputs['X'], ax.inputs[0])
        add = n.new('ShaderNodeMath'); add.operation = 'ADD'
        nt.links.new(ax.outputs[0], add.inputs[0]); nt.links.new(sep.outputs['Y'], add.inputs[1])
        mul = n.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = spacing
        nt.links.new(add.outputs[0], mul.inputs[0])
        fr = n.new('ShaderNodeMath'); fr.operation = 'FRACT'
        nt.links.new(mul.outputs[0], fr.inputs[0])
        lt = n.new('ShaderNodeMath'); lt.operation = 'LESS_THAN'; lt.inputs[1].default_value = width
        nt.links.new(fr.outputs[0], lt.inputs[0])
        mix = n.new('ShaderNodeMix'); mix.data_type = 'RGBA'
        mix.inputs['A'].default_value, mix.inputs['B'].default_value = lin(fill), lin(line)
        nt.links.new(lt.outputs[0], mix.inputs['Factor'])
        nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    m['lumi_recipe'] = 'section'
    m.diffuse_color = lin(fill)
    return m


def assign(obj, material):
    """Replace all material slots of obj with one material."""
    obj.data.materials.clear()
    obj.data.materials.append(material)
    return obj


# ---------------------------------------------------------------- mesh helpers
def smooth(obj, angle=30):
    """Smooth shading that keeps flat caps flat (replaces the removed auto-smooth)."""
    me = obj.data
    me.shade_smooth()
    me.set_sharp_from_angle(angle=math.radians(angle))
    return obj


def fix_normals(obj):
    """Recalculate outward normals (inside-out meshes render dark)."""
    bm = bmesh.new(); bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data); bm.free(); obj.data.update()
    return obj


def bevel(obj, width=0.01, segments=3):
    """Bevel modifier (no razor edges: LOOK.md 4.12). Applied at render; cutaway() applies it first."""
    md = obj.modifiers.new('Lumi bevel', 'BEVEL')
    md.width, md.segments, md.limit_method = width, segments, 'ANGLE'
    md.harden_normals = False
    return obj


def lathe(profile, segments=96, name='lathe', material=None):
    """Solid of revolution about local Z from a CLOSED (r, z) profile, counter-clockwise; r = 0 points are fine.
    Manifold by construction, so it survives cutaway(). Tubes: [(ri,-h),(ro,-h),(ro,h),(ri,h)]."""
    bm = bmesh.new()
    vs = [bm.verts.new((r, 0, z)) for r, z in profile]
    edges = [bm.edges.new((vs[i], vs[(i + 1) % len(vs)])) for i in range(len(vs))]
    bmesh.ops.spin(bm, geom=vs + edges, cent=(0, 0, 0), axis=(0, 0, 1), angle=2 * math.pi, steps=segments,
                   use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    if material:
        me.materials.append(material)
    return smooth(o)


def bbox(objs):
    """World-space (min, max) Vectors over objects."""
    objs = objs if isinstance(objs, (list, tuple)) else [objs]
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in objs if o.type == 'MESH' for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def _apply_modifiers(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    old = obj.data
    obj.modifiers.clear()
    obj.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return obj


# ---------------------------------------------------------------- cutaway
_VANISHED = []          # parts a cutaway removed completely: correct now and then, a mistake most of the time


def cutaway(objs, normal=(0, -1, 0), point=(0, 0, 0), normals=None, material=None):
    """Boolean half-space cut. Removes everything on the side `normal` points to, through `point` (default: the
    front half, toward a camera at -Y). normals=[n1, n2] (orthogonal) removes the quarter where BOTH hold (classic
    quarter cutaway). Cut faces take the section material via the boolean's material TRANSFER mode. Each object's
    existing modifiers (bevel ...) are applied first; the result is checked, retried with the FLOAT solver, and a
    failure raises instead of leaving an uncut mesh. Returns the list of cut objects."""
    objs = objs if isinstance(objs, (list, tuple)) else [objs]
    material = material or section()
    ns = [Vector(n).normalized() for n in (normals or [normal])]
    if len(ns) == 1:
        a = ns[0]
        t = Vector((0, 0, 1)) if abs(a.z) < 0.9 else Vector((1, 0, 0))
        b = a.cross(t).normalized(); c = a.cross(b)
        cols, offset = (a, b, c), a
    else:
        a, b = ns[0], (ns[1] - ns[1].dot(ns[0]) * ns[0]).normalized()
        cols, offset = (a, b, a.cross(b)), a + b
    lo, hi = bbox(objs)
    B = 4 * max((hi - lo).length, 1e-3)
    me = bpy.data.meshes.new('lumi_cutter')
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bm.to_mesh(me); bm.free()
    cutter = bpy.data.objects.new('lumi_cutter', me)
    bpy.context.scene.collection.objects.link(cutter)
    rot = Matrix((cols[0], cols[1], cols[2])).transposed().to_4x4()
    cutter.matrix_world = Matrix.Translation(Vector(point) + offset * (B / 2)) @ rot @ Matrix.Diagonal((B, B, B, 1))
    me.materials.append(material)
    cutter.hide_render = True
    done = []
    for o in objs:
        if o.modifiers:
            _apply_modifiers(o)
        before = len(o.data.polygons)
        ok = False
        for solver in ('EXACT', 'FLOAT'):
            md = o.modifiers.new('Lumi cut', 'BOOLEAN')
            md.operation, md.object, md.solver = 'DIFFERENCE', cutter, solver
            md.material_mode = 'TRANSFER'
            if solver == 'EXACT':
                md.use_hole_tolerant = True
            tmp_lo = o.data.copy()
            _apply_modifiers(o)
            mats = [m.name for m in o.data.materials if m]
            n = len(o.data.polygons)
            if n == 0 or (material.name in mats and n != before):     # 0 = wholly inside the removed region
                ok = True
                if n == 0:
                    _VANISHED.append(o.name)                           # inspect() reports it: usually a mistake
                bpy.data.meshes.remove(tmp_lo)
                break
            print(f'[lumi] cutaway: {solver} solver failed on {o.name}, retrying')
            bad = o.data; o.data = tmp_lo
            if bad.users == 0:
                bpy.data.meshes.remove(bad)
        if not ok:
            raise RuntimeError(f'cutaway failed on {o.name}: mesh not manifold or cutter misses it')
        if any(p.use_smooth for p in o.data.polygons):
            o.data.set_sharp_from_angle(angle=math.radians(30))
        done.append(o)
    bpy.data.objects.remove(cutter)
    bpy.data.meshes.remove(me)
    return done


# ---------------------------------------------------------------- studio
def _area(name, loc, target, power, size, color, size_y=None, shadow=True):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.energy, ld.color = power, lin(color)[:3]
    if size_y:
        ld.shape, ld.size, ld.size_y = 'RECTANGLE', size, size_y
    else:
        ld.shape, ld.size = 'DISK', size
    ld.use_shadow = shadow
    o = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    o.visible_camera = False
    return o


def studio(fit=None, bg='canvas', transparent=False, floor='sweep', key=1.0, fill=1.0, rim=1.0, world=1.0,
           cavity=1.0, wear=1.0):
    """Bold Blue studio around the subject (call AFTER building it; fit = its objects).
    bg: palette key or '#hex' -- the exact colour render() composites behind the subject ('canvas' #F9F4F2;
        'stage' #EFEBE6 to sit on a .bb-stage-bg slide; 'cyc' #F1EEEA for the full-bleed title studio).
    transparent: True -> keep the RGBA PNG (the slide shows through); the floor shadow stays in alpha.
    floor: 'sweep' (floor + cove + back wall, one shadow-catching surface: contact shadows and cream reflections),
        'flat' (floor plane only), 'none' (a flying / floating subject: no ground, no cast shadow).
    key/fill/rim/world: multipliers on the calibrated intensities (key = studio3d.js 2.3 warm, upper LEFT front;
        fill = cool #E6EFFF from the right; rim = from behind; world = softbox room #ECEAE2 + two black flags).
    cavity/wear: global multipliers on every material's geometry-driven pair -- wear=0 for a factory-new part, a
        moulded plastic shell or a schematic subject. cavity only bites when the cavity nodes exist at all
        (--cavity / the bake path); Cycles path-traces crevice darkening by itself.
    Shadow darkness follows the lights: lower key / raise world for paler shadows."""
    s = bpy.context.scene
    fit = fit if isinstance(fit, (list, tuple)) else ([fit] if fit else [o for o in s.objects if o.type == 'MESH'])
    lo, hi = bbox(fit)
    ctr, size = (lo + hi) / 2, max((hi - lo).length, 1e-3)
    # the cavity reach and the wear radius are written for a subject about 1 m across: size them to this one
    _fx_scale(size)
    wear_amount(cavity, wear)
    s['lumi_bg'] = C.get(bg, bg)
    s['lumi_transparent'] = bool(transparent)
    # world: the softbox room (ambient + reflections); invisible to camera because the film is transparent
    w = bpy.data.worlds.new('lumi_world'); s.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    bgn = w.node_tree.nodes.get('Background')
    bgn.inputs['Strength'].default_value = 0.6 * world
    # a studio gradient by ray direction: bright softbox ceiling, a thin dark horizon line (the classic edge line
    # on chrome) and a light warm-grey floor bounce below. Metal only reads as metal when it reflects contrast; a uniform
    # cream world turns steel and aluminium into white plastic (measured).
    wn, wl = w.node_tree.nodes, w.node_tree.links
    tc, sp, ramp = wn.new('ShaderNodeTexCoord'), wn.new('ShaderNodeSeparateXYZ'), wn.new('ShaderNodeValToRGB')
    wl.new(tc.outputs['Generated'], sp.inputs['Vector'])
    mr = wn.new('ShaderNodeMapRange')            # z in -1..1 -> 0..1
    mr.inputs['From Min'].default_value, mr.inputs['From Max'].default_value = -1.0, 1.0
    wl.new(sp.outputs['Z'], mr.inputs['Value']); wl.new(mr.outputs['Result'], ramp.inputs['Fac'])
    el = ramp.color_ramp.elements
    el[0].position, el[0].color = 0.0, lin('#B9B0A7')
    el[1].position, el[1].color = 1.0, lin('#F6F3EF')
    for pos, col in ((0.45, '#CFC8C0'), (0.497, '#9A9086'), (0.53, '#D9D3CC'), (0.7, '#EEEBE6')):
        e = el.new(pos); e.color = lin(col)
    wl.new(ramp.outputs['Color'], bgn.inputs['Color'])
    # lights: power P = E * K * d^2 (calibrated: a white diffuse under E reads E/pi, same as three.js)
    K, d = 3.6, 2.2 * size
    def at(v):
        return ctr + Vector(v).normalized() * d
    _area('lumi_key', at((-5, -8, 11)), ctr, 2.3 * K * d * d * key, 0.9 * size, '#FFF4EC')
    _area('lumi_fill', at((10, -6, 6)), ctr, 0.6 * K * d * d * fill, 1.4 * size, '#E6EFFF', shadow=False)
    rim_o = _area('lumi_rim', at((4, 9, 6)), ctr, 1.6 * K * d * d * rim, 0.6 * size, '#FFF7F0')
    # top softbox (visible in reflections: the long highlight on metal) + two black flags (dark edge lines)
    top = _area('lumi_top', ctr + Vector((0, -0.2 * d, 1.1 * d)), ctr, 1.2 * K * d * d * world, 1.2 * size,
                '#FFFFFF', size_y=0.5 * size)
    flag_m = bpy.data.materials.new('lumi_flag'); flag_m.diffuse_color = (0, 0, 0, 1)
    try:
        flag_m.use_nodes = True
    except Exception:
        pass
    pb = flag_m.node_tree.nodes.get('Principled BSDF')
    pb.inputs['Base Color'].default_value = (0.004, 0.004, 0.005, 1); pb.inputs['Roughness'].default_value = 1
    for i, (v, sx, sz) in enumerate((((1.0, 0.45, 0.45), 0.5, 2.0), ((-0.8, 0.7, 0.45), 0.45, 2.0))):
        me = bpy.data.meshes.new(f'lumi_flag{i}')
        bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5); bm.to_mesh(me); bm.free()
        me.materials.append(flag_m)
        f = bpy.data.objects.new(f'lumi_flag{i}', me); s.collection.objects.link(f)
        f.location = ctr + Vector(v).normalized() * d * 1.3
        f.rotation_euler = (ctr - f.location).to_track_quat('Z', 'Y').to_euler()
        f.scale = (sx * size, sz * size, 1)
        f.visible_camera = f.visible_diffuse = f.visible_shadow = False
        f.visible_transmission = f.visible_volume_scatter = False
    if floor == 'none':
        return
    # The FLOOR is a flat shadow catcher (catches the soft contact shadow, reflects as cream). The cove + back
    # wall are a separate surface that is invisible to the camera and casts no shadow: it only bounces cream light
    # and shows up in reflections. (A single swept catcher shadows itself where the floor meets the wall, which
    # greys the whole background -- measured, do not merge them.)
    z0, R = lo.z, max(hi.z - lo.z, 0.25 * size)
    back, W, depth = hi.y + 0.6 * size, 30 * size, 20 * size
    sm, nt, b = _bsdf('lumi_sweep_mat')
    _set(b, color='#D9D3CC', rough=0.9)

    def strip(name, prof):
        me = bpy.data.meshes.new(name)
        bm = bmesh.new()
        vs = [(bm.verts.new((-W / 2, y, z)), bm.verts.new((W / 2, y, z))) for y, z in prof]
        for (a0, a1), (b0, b1) in zip(vs, vs[1:]):
            f_ = bm.faces.new((a0, a1, b1, b0))
            c = f_.calc_center_median()
            if f_.normal.z < -0.1 or f_.normal.y > 0.1:     # face the subject: up on the floor, -Y on the wall
                f_.normal_flip()
        bm.to_mesh(me); bm.free()
        for p in me.polygons:
            p.use_smooth = True
        me.materials.append(sm)
        o = bpy.data.objects.new(name, me); s.collection.objects.link(o)
        return o

    catcher = strip('lumi_floor', [(lo.y - depth, z0), (back, z0)])
    catcher.is_shadow_catcher = True
    catcher.visible_glossy = False     # like three.js ShadowMaterial: metal reflects the world's floor bounce, not cream
    # the rim (from behind) would throw a long shadow toward the camera; as in studio3d.js only the key and the
    # overhead softbox shadow the floor -> light-link the floor out of the rim
    coll = bpy.data.collections.new('lumi_rim_excluded')
    coll.objects.link(catcher)
    rim_o.light_linking.receiver_collection = coll
    coll.collection_objects[0].light_linking.link_state = 'EXCLUDE'
    if floor == 'sweep':
        prof = [(back, z0)] + [(back + R * math.sin(a), z0 + R - R * math.cos(a)) for a in
                               (i / 24 * math.pi / 2 for i in range(1, 25))] + [(back + R, z0 + 12 * size)]
        wall = strip('lumi_cove', prof)
        wall.visible_camera = wall.visible_shadow = False
    return catcher


# ---------------------------------------------------------------- camera
VIEWS = {  # azimuth (deg, negative = camera on the left), elevation (deg), vertical fov (deg)
    'three-quarter': (-22, 14, 30), 'hero': (-16, 6, 24), 'front': (0, 4, 30), 'side': (-90, 6, 30),
    'high': (-30, 35, 30), 'top': (0, 88, 30), 'low': (-25, 3, 30),
}


def camera(target, view='three-quarter', fill=0.7, frame_right=True, azimuth=None, elevation=None, fov=None):
    """Frame target (object or list). fill = fraction of frame height the subject's bounds occupy. frame_right=True
    keeps the left ~40% calm for the slide title: the subject is fitted into x 0.42..0.97 and centred at 0.695
    (studio3d.js uses the same right-hand framing via view offset). Uses lens shift, so verticals stay vertical."""
    s = bpy.context.scene
    objs = target if isinstance(target, (list, tuple)) else [target]
    az, el, fv = VIEWS[view]
    az, el, fv = azimuth if azimuth is not None else az, elevation if elevation is not None else el, fov or fv
    cd = bpy.data.cameras.new('lumi_cam')
    cd.sensor_fit, cd.sensor_height = 'VERTICAL', 24.0
    cd.lens = 12.0 / math.tan(math.radians(fv) / 2)
    cam = bpy.data.objects.new('lumi_cam', cd); s.collection.objects.link(cam); s.camera = cam
    lo, hi = bbox(objs)
    ctr, rad = (lo + hi) / 2, (hi - lo).length / 2
    a, e = math.radians(az), math.radians(el)
    dvec = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    dist = rad / math.tan(math.radians(fv) / 2) / max(fill, 0.05)
    # fit the real silhouette (sampled vertices), not the bounding-box corners, which overshoot on long parts
    corners = []
    for o in objs:
        if o.type == 'MESH':
            vs = o.data.vertices
            step = max(1, len(vs) // 1500)
            corners += [o.matrix_world @ vs[i].co for i in range(0, len(vs), step)]
    corners = corners or [Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
    from bpy_extras.object_utils import world_to_camera_view
    wmax, cx_goal = (0.55, 0.695) if frame_right else (0.9, 0.5)
    for _ in range(8):
        cam.location = ctr + dvec * dist
        cam.rotation_euler = dvec.to_track_quat('Z', 'Y').to_euler()
        cd.shift_x = cd.shift_y = 0.0
        s.view_layers[0].update()
        pr = [world_to_camera_view(s, cam, c) for c in corners]
        xs, ys = [p.x for p in pr], [p.y for p in pr]
        k = max((max(ys) - min(ys)) / fill, (max(xs) - min(xs)) / wmax)
        if abs(k - 1) < 0.01:
            break
        dist *= k ** 0.9
    W, H = s.render.resolution_x, s.render.resolution_y
    # lens shift is measured in units of the sensor-fit dimension (VERTICAL here = frame height)
    cd.shift_x = ((min(xs) + max(xs)) / 2 - cx_goal) * W / H
    cd.shift_y = (min(ys) + max(ys)) / 2 - 0.5
    cd.clip_start, cd.clip_end = max(0.001, dist * 0.01), dist * 50
    return cam


# ---------------------------------------------------------------- render
def _composite(path, bg_hex):
    """alpha-over the RGBA PNG onto the flat canvas colour in display space (exact background bytes)."""
    import numpy as np
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    a = np.clip((px[:, 3:4] - 0.006) / 0.994, 0.0, 1.0)   # drop sub-1/255 catcher noise: exact background bytes
    # the floor shadow must not reach the frame edge: a slide shows the picture on its own canvas colour, so the outer ~12 % of the
    # frame fades the SOFT shadow (alpha below ~0.5) to the exact background (a gentle ramp: a short one shows as a faint box).
    # A subject cut by the frame (alpha 1) is untouched.
    # The deck checker reads the corners and the left / top edge against the slide colour (hard-rules.json -> blender).
    m = max(2.0, 0.12 * min(w, h))
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy)).astype(np.float32) / m
    f = np.clip(d, 0.0, 1.0); f = (f * f * (3.0 - 2.0 * f)).reshape(-1, 1)
    solid = np.clip((a - 0.35) / 0.25, 0.0, 1.0)
    a = a * (1.0 - (1.0 - f) * (1.0 - solid))
    bgc = np.array(srgb(bg_hex), dtype=np.float32)
    px[:, :3] = px[:, :3] * a + bgc * (1 - a)
    px[:, 3] = 1.0
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


# ---------------------------------------------------------------- label anchors (HTML labels over a render)
_ANCHORS = {}


def anchor(name, where, offset=(0.0, 0.0, 0.0)):
    """Name a point of the scene that an HTML label of the slide follows (BLENDER.md section 9). `where` is an object
    (its origin, so it follows the object when it spins or waves), a bone-less empty, or a world point (x, y, z). render()
    projects every anchor through the final camera for EACH rendered frame and writes the result next to the output as
    percentages of the frame (x to the right, y down, 0-100), so the slide can put `<div class="bb-tag" data-anchor="name">`
    over the picture at the right place at any size. Lift the point above the part (offset=(0, 0, 0.3)) so the label sits
    beside it, not on it."""
    _ANCHORS[str(name)] = (where, Vector(offset))
    return name


def _project_anchors(frame_list):
    """{name: [[x%, y%] per frame]} through scene.camera, evaluated at each frame in frame_list."""
    if not _ANCHORS:
        return {}
    from bpy_extras.object_utils import world_to_camera_view
    s = bpy.context.scene
    out = {k: [] for k in _ANCHORS}
    for f in frame_list:
        s.frame_set(f)
        bpy.context.view_layer.update()
        for k, (where, off) in _ANCHORS.items():
            p = (where.matrix_world.translation if hasattr(where, 'matrix_world') else Vector(where)) + off
            v = world_to_camera_view(s, s.camera, p)
            out[k].append([round(v.x * 100, 2), round((1 - v.y) * 100, 2)])
    return out


def _write_labels(path_png_or_dir, is_dir, frames_done, rx, ry, fps):
    import json
    data = _project_anchors(frames_done)
    if not data:
        return
    target = os.path.join(path_png_or_dir, 'labels.json') if is_dir else path_png_or_dir[:-4] + '.labels.json'
    with open(target, 'w', encoding='utf-8') as f:
        json.dump({'w': rx, 'h': ry, 'fps': fps, 'frames': len(frames_done), 'anchors': data}, f)
    print(f'[lumi] labels: {", ".join(data)} -> {target}', flush=True)


# ---------------------------------------------------------------- seamless loops (20 fps)
def loop(seconds=4.0, fps=None, poster=None):
    """Make the scene a seamless loop of `seconds` (default 4 s) at fps (default: the command line's, 20): frames 1..N,
    N = seconds * fps. animate()/spin()/wave()/turntable() after this key frames 1..N+1 so frame N+1 equals frame 1.
    poster: the frame a preview or a still shows (default 1). Returns N."""
    s = bpy.context.scene
    if fps: s.render.fps = int(fps)
    n = max(2, int(round(seconds * s.render.fps)))
    s.frame_start, s.frame_end = 1, n
    s['lumi_frames'] = n
    s['lumi_loop'] = n
    if poster and 'lumi_poster' not in s: s['lumi_poster'] = int(poster)
    s.frame_set(1)
    print(f'[lumi] loop {n} frames at {s.render.fps} fps ({n / s.render.fps:.1f} s)', flush=True)
    return n


def _loop_n():
    n = int(bpy.context.scene.get('lumi_loop', 0))
    if not n:
        raise RuntimeError('call L.loop(seconds) before animating')
    return n


def animate(obj, path, index, fn):
    """Key obj.<path>[index] on EVERY frame 1..N+1 with fn(t), t = (frame - 1) / N in 0..1. fn must be periodic
    (fn(0) == fn(1)) for a seamless loop. Only whole frames are rendered, so the interpolation mode never matters."""
    n = _loop_n()
    for f in range(1, n + 2):
        getattr(obj, path)[index] = fn((f - 1) / n)
        obj.keyframe_insert(data_path=path, index=index, frame=f)
    bpy.context.scene.frame_set(bpy.context.scene.frame_current)
    return obj


_AXIS = {'X': 0, 'Y': 1, 'Z': 2}


def spin(obj, turns=1.0, axis='Z'):
    """Whole turns about a local axis over the loop (use 0.5 for a part that looks the same after half a turn)."""
    i = _AXIS[axis.upper()]
    base = obj.rotation_euler[i]
    return animate(obj, 'rotation_euler', i, lambda t: base + 2 * math.pi * turns * t)


def wave(obj, path='location', index=2, amplitude=0.05, cycles=1, phase=0.0):
    """A sine about the current value: base + amplitude * sin(2 pi cycles t + phase). Whole cycles loop seamlessly."""
    base = getattr(obj, path)[index]
    return animate(obj, path, index, lambda t: base + amplitude * math.sin(2 * math.pi * cycles * t + phase))


def turntable(objs, turns=1.0, axis='Z', center=None):
    """Spin a group of parts together about their common centre on the floor (an empty becomes their parent). Call
    it after camera() and frame with a smaller fill (about 0.55) so the widest angle still fits. Returns the empty."""
    objs = objs if isinstance(objs, (list, tuple)) else [objs]
    lo, hi = bbox(objs)
    c = Vector(center) if center is not None else Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, 0.0))
    e = bpy.data.objects.new('lumi_turntable', None)
    bpy.context.scene.collection.objects.link(e)
    e.location = c
    bpy.context.view_layer.update()
    for o in objs:
        mw = o.matrix_world.copy()
        o.parent = e
        o.matrix_world = mw
    return spin(e, turns, axis)


# ---------------------------------------------------------------- inspect: a text check, no render (BLENDER.md 6)
TRI_BUDGET = {'still': 1_000_000, 'anim': 300_000}
# each finding maps to a row of the BLENDER.md section 8 table, so a fix is one lookup away
INSPECT_ROWS = {
    'no-camera': 'black frame', 'no-world': 'black frame', 'nothing-in-frame': 'all background, no subject',
    'hidden': 'all background, no subject', 'clipped': 'cut-off geometry', 'inward-normals': 'dark or faceted surfaces',
    'no-material': 'flat surfaces (LOOK.md 4.1)', 'flat-material': 'flat surfaces (LOOK.md 4.1)',
    'triangles': 'section 7 (render time)', 'vanished': 'a cutaway part is gone',
}


def _tris(me):
    try:
        me.calc_loop_triangles()
        return len(me.loop_triangles)
    except (AttributeError, RuntimeError):
        return sum(max(0, len(p.vertices) - 2) for p in me.polygons)


def _inward_ratio(obj):
    """Fraction of faces whose normal points back at the object's own centre: ~0 is right, ~1 is inside-out."""
    me = obj.data
    if not len(me.polygons): return 0.0
    ctr = Vector((0, 0, 0))
    for v in me.vertices: ctr += v.co
    ctr /= len(me.vertices)
    bad = 0
    step = max(1, len(me.polygons) // 2000)
    seen = 0
    for i in range(0, len(me.polygons), step):
        p = me.polygons[i]
        seen += 1
        if p.normal.dot(Vector(p.center) - ctr) < 0: bad += 1
    return bad / max(1, seen)


def _has_recipe(m):
    """True when the material carries a texture recipe (LOOK.md 4.1: textures are mandatory). A section material
    counts: its hatch IS its recipe."""
    if m.get('lumi_recipe'): return True                  # a Lumi preset: the recipe is part of the preset
    nt = getattr(m, 'node_tree', None)
    if not nt: return False
    kinds = {n.bl_idname for n in nt.nodes}
    return bool(kinds & {'ShaderNodeTexNoise', 'ShaderNodeBump', 'ShaderNodeAmbientOcclusion', 'ShaderNodeBevel',
                         'ShaderNodeTexImage', 'ShaderNodeTexVoronoi', 'ShaderNodeTexMusgrave', 'ShaderNodeValToRGB'})


def inspect(emit=True):
    """A text check of the built scene: no render, no GPU, about a second. Prints ONE line
        [lumi] inspect {"ok":false,"fatal":[...],"warn":[...],"stats":{...}}
    and returns the dict. Every finding carries the BLENDER.md section 8 row that explains the fix. Run it with
        blender -b -P scene.py -- --inspect
    and fix everything fatal before spending a --preview on the scene."""
    import json as _json
    from bpy_extras.object_utils import world_to_camera_view
    s = bpy.context.scene
    fatal, warn = [], []

    def add(bucket, code, msg, **extra):
        bucket.append(dict(code=code, msg=msg, row=INSPECT_ROWS.get(code, ''), **extra))

    vis = [o for o in s.objects if o.type == 'MESH' and not o.name.startswith(('lumi_flag', 'lumi_cutter'))]
    studio_names = {'lumi_floor', 'lumi_cove'}
    subject = [o for o in vis if o.name not in studio_names]
    shown = [o for o in subject if not o.hide_render and o.visible_get()]
    hidden = [o.name for o in subject if o.hide_render or not o.visible_get()]
    tris = sum(_tris(o.data) for o in shown)
    anim = bool(s.get('lumi_loop')) or bool(s.get('lumi_anim'))
    stats = {'objects': len(subject), 'rendered': len(shown), 'materials': len(bpy.data.materials),
             'lights': len([o for o in s.objects if o.type == 'LIGHT']), 'triangles': tris,
             'frames': int(s.get('lumi_frames', 1)), 'fps': s.render.fps, 'anim': anim,
             'size': [s.render.resolution_x * s.render.resolution_percentage // 100,
                      s.render.resolution_y * s.render.resolution_percentage // 100],
             'samples': s.cycles.samples, 'bg': s.get('lumi_bg'), 'preview': bool(s.get('lumi_preview'))}

    if s.camera is None:
        add(fatal, 'no-camera', 'scene.camera is not set: call L.camera(parts) after building them')
    if s.world is None or stats['lights'] == 0:
        add(fatal, 'no-world', 'no world or no lights: call L.studio(fit=parts) before L.camera()')
    if not subject:
        add(fatal, 'nothing-in-frame', 'the scene has no subject mesh at all')
    if hidden:
        add(fatal, 'hidden', 'these parts never reach the render (hide_render, or a collection that is not linked '
                             'into the view layer)', objects=hidden[:20])

    inside, near = 0, []
    if s.camera and shown:
        s.view_layers[0].update()
        cd = s.camera.data
        for o in shown:
            vs = o.data.vertices
            if not len(vs): continue
            step = max(1, len(vs) // 400)
            seen_in, too_near = 0, False
            for i in range(0, len(vs), step):
                p = world_to_camera_view(s, s.camera, o.matrix_world @ vs[i].co)
                if 0.0 <= p.x <= 1.0 and 0.0 <= p.y <= 1.0 and p.z > 0: seen_in += 1
                if 0 < p.z < cd.clip_start: too_near = True
            if seen_in: inside += 1
            if too_near: near.append(o.name)
        if inside == 0:
            add(fatal, 'nothing-in-frame', 'no part of the subject falls inside the camera frustum: re-run '
                                           'L.camera(parts) after the parts are in their final place')
        elif inside < len(shown):
            add(warn, 'nothing-in-frame', f'{len(shown) - inside} of {len(shown)} parts are outside the frame',
                objects=[o.name for o in shown][:20])
        if near:
            add(warn, 'clipped', 'geometry sits in front of the camera clip start: re-run L.camera() after moving '
                                 'parts', objects=near[:20])
    stats['inFrame'] = inside

    for o in shown:
        r = _inward_ratio(o)
        if r > 0.6:
            add(warn, 'inward-normals', f'{o.name}: {int(r * 100)}% of faces point inward (L.fix_normals)',
                objects=[o.name])
    bare = [o.name for o in shown if not [m for m in o.data.materials if m]]
    if bare:
        add(warn, 'no-material', 'these meshes have no material at all (LOOK.md 4.1)', objects=bare[:20])
    flat = sorted({m.name for o in shown for m in o.data.materials if m and not _has_recipe(m)})
    if flat:
        add(warn, 'flat-material', 'these materials carry no texture recipe: use L.mat(kind) (LOOK.md 4.1)',
            materials=flat[:20])
    budget = TRI_BUDGET['anim' if anim else 'still']
    if tris > budget:
        add(warn, 'triangles', f'{tris:,} triangles is over the {budget:,} budget for '
                               f'{"an animation" if anim else "a still"} (BLENDER.md section 7)')
    if _VANISHED:
        add(warn, 'vanished', 'a cutaway removed these parts completely; leave them out of the cut, or move the '
                              'cut plane', objects=sorted(set(_VANISHED))[:20])

    out = {'ok': not fatal, 'fatal': fatal, 'warn': warn, 'stats': stats}
    if emit:
        print('[lumi] inspect ' + _json.dumps(out, separators=(',', ':')), flush=True)
        for f in fatal: print('[lumi] FATAL  ' + f['code'] + ': ' + f['msg'] + '  -> section 8 "' + f['row'] + '"', flush=True)
        for w in warn: print('[lumi] warn   ' + w['code'] + ': ' + w['msg'], flush=True)
    return out


def render(path=None, frames=None):
    """Render what the command line asked for: --preview = ONE cheap frame (the poster), --anim = every frame of the
    loop into a folder (frame_0001.png ...), else a still of --frame / the poster / frame 1. path: a .png file or a
    folder. Composites onto the exact bg colour unless studio(transparent=True). Prints the [lumi] lines Lumi's server
    reads (scene, frame i/n, done). Returns the list of written files."""
    s = bpy.context.scene
    if s.get('lumi_inspect'):
        # --inspect: the scene is built, so check it and stop. Nothing is rendered and nothing is written.
        res = inspect()
        sys.exit(0 if res['ok'] else 3)
    if s.camera is None:
        raise RuntimeError('no scene.camera: call L.camera(...) before L.render()')
    if s.world is None:
        print('[lumi] warning: no world -- call L.studio()')
    path = os.path.abspath(path or os.path.join(os.getcwd(), 'render.png'))
    total = int(s.get('lumi_frames', s.frame_end - s.frame_start + 1))
    poster = int(s.get('lumi_poster', s.frame_start))
    preview, anim = bool(s.get('lumi_preview')), bool(s.get('lumi_anim'))
    if preview:
        s.render.use_simplify = True
        s.render.simplify_subdivision_render = 1
        try:
            s.cycles.texture_limit_render = '512'
        except (AttributeError, TypeError):
            pass
    first_n = frames or int(s.get('lumi_first_n', 0) or 0)
    if first_n > 1 and not preview:
        todo = list(range(s.frame_start, s.frame_start + first_n))
    elif anim and not preview:
        todo = list(range(s.frame_start, s.frame_start + total))
    else:
        todo = [poster]
    n = len(todo)
    is_dir = not path.lower().endswith('.png')
    if is_dir:
        os.makedirs(path, exist_ok=True)
    else:
        os.makedirs(os.path.dirname(path), exist_ok=True)
    rx = s.render.resolution_x * s.render.resolution_percentage // 100
    ry = s.render.resolution_y * s.render.resolution_percentage // 100
    print(f'[lumi] scene frames={total} fps={s.render.fps} poster={poster} size={rx}x{ry} samples={s.cycles.samples} '
          f'render={n} mode={"preview" if preview else "anim" if n > 1 else "still"}', flush=True)
    out = []
    t0 = time.time()
    for i, f in enumerate(todo, 1):
        s.frame_set(f)
        if n == 1:
            fp = os.path.join(path, 'render.png') if is_dir else path
        else:
            fp = os.path.join(path, f'frame_{f:04d}.png') if is_dir else path[:-4] + f'_{f:04d}.png'
        s.render.filepath = fp
        t1 = time.time()
        bpy.ops.render.render(write_still=True)
        if not s.get('lumi_transparent', False):
            _composite(fp, s.get('lumi_bg', C['canvas']))
        dt = time.time() - t1
        print(f'[lumi] wrote {fp}  ({dt:.1f} s)', flush=True)
        print(f'[lumi] frame {i}/{n} {dt:.2f}', flush=True)
        out.append(fp)
    _write_labels(path, is_dir, todo, rx, ry, s.render.fps)
    print(f'[lumi] done: {n} frame(s) {rx}x{ry}, {s.cycles.samples} spp, device {s.get("lumi_device", s.cycles.device)}, '
          f'total {time.time() - t0:.1f} s', flush=True)
    return out
