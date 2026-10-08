"""Batch 6 Part B: bake Cycles detail into textures once, export one glTF, and let three.js play it.

DORMANT since batch 2 P1 (2026-10-08). New decks pin rec['bake'] = False, so their animations are per-frame Cycles
(lumi_bpy.py --anim). The approval card showed a Cycles poster while the slide played the GLB in three.js, which has
no GI - the person approved one picture and the deck shipped a flatter one. Kept, not deleted: decks already pinned
bake=True still route here (form_server.bl_baked) and their finished renders must keep working. To revive it, pin
'bake': True again in form_server.new_deck.

Why this exists. A Cycles frame of a real mechanical scene is 89-130 s on the reference laptop. An animated slide is
100-320 frames. The owner wants ~70 % of slides 3D and ~70 % of those animated, which is 11.4 hours of GPU on the
per-frame path. Baking moves the path tracing out of the frame loop: it runs once, and the frames come from three.js
through the deterministic seek-based capture that already exists. Nothing here is a new capture path -
`engine/tools/finalize.js` is untouched by it.

What it bakes, and what it deliberately does not.
  base colour   DIFFUSE / COLOR   - albedo only, no lighting in it
  roughness     ROUGHNESS
  metallic      EMIT, rewired     - there is no metallic pass; the edge-wear node varies it per pixel, so a constant
                                    would throw away exactly the detail Part A item 1 added
  occlusion     AO                - the one map that genuinely cannot be computed at run time: three.js has no GI,
                                    which is why `--cavity` exists and why Part A kept the node for this path
Lighting is NOT baked. A baked highlight rotates with the part and reads as dirt, the same mistake as a baked hatch
(B.4). The three.js side relights with `BB3D.studio()`, whose key / fill / rim are already calibrated against
`L.studio()` - the comment in `lumi_bpy.studio()` names studio3d.js's 2.3 warm key for exactly this reason.

Atlases are per MATERIAL GROUP, not per object. The spec measured 61 s on a two-object scene and warned that bake
time scales with object count; a real gear reducer has about forty objects but only a handful of materials, and nine
identical bearing balls have no business owning nine atlases. Objects that share a material set share one atlas and
one bake call.

Run it through the scene file that already exists - no scene.py changes:
    blender -b -P scene.py -- --bake draft --out <folder>      256 px atlases, what the user judges
    blender -b -P scene.py -- --bake final --out <folder>      1024 px atlases, on approval
`L.render()` short-circuits on it, exactly as `--inspect` does.

Writes into <folder>:
    model.glb     geometry + UVs + the baked textures + the node animation
    bake.json     camera, loop period and fps, the slide background, anchors, which materials are section faces
    atlas/*.png   the raw atlases, kept for a re-export without a re-bake (B.3: a motion or camera change is free)
"""
import hashlib
import json
import math
import os
import sys
import time

import bpy

RESOLUTIONS = {'draft': 256, 'final': 1024, 'hero': 2048}      # B.8: 2048 is a per-slide escalation, never the default
MARGIN_PX = {'draft': 4, 'final': 6, 'hero': 8}
UV_ANGLE = 55.0
SAMPLES = {'colour': 32, 'ao': 64}                             # B.1, measured: AO is the larger half of a final bake
POSTER = {'draft': (30, 16), 'final': (50, 32), 'hero': (50, 32)}   # resolution %, samples


def _say(msg):
    print('[lumi] ' + msg, flush=True)


def _subject(scene):
    """The meshes that are the subject: everything the camera sees that the studio did not put there.
    `lumi_flag*`, `lumi_floor` and `lumi_cove` are studio furniture - the floor is a shadow catcher and three.js draws
    its own contact shadow, so baking it would double the shadow."""
    out = []
    for o in scene.objects:
        if o.type != 'MESH' or o.name.startswith('lumi_flag') or o.name in ('lumi_floor', 'lumi_cove'):
            continue
        if o.hide_render or not o.visible_camera:
            continue
        if not o.data.polygons:
            continue
        out.append(o)
    return out


def _groups(objs):
    """Objects grouped by their material set. One group = one atlas = one bake call for each map."""
    g = {}
    for o in objs:
        key = tuple(sorted(m.name for m in o.data.materials if m))
        g.setdefault(key or ('__none__',), []).append(o)
    return g


def _select(objs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or (objs[0] if objs else None)


def _apply_modifiers(objs):
    """Bevels and the cutaway boolean must be real geometry before a UV unwrap: a modifier is not in the mesh the
    unwrapper sees, and it is not in the glTF either."""
    for o in objs:
        if not o.modifiers:
            continue
        _select([o], o)
        for md in list(o.modifiers):
            try:
                bpy.ops.object.modifier_apply(modifier=md.name)
            except RuntimeError as e:
                _say(f'bake: could not apply {md.name} on {o.name} ({e}); leaving it')


def _join_static(groups):
    """Merge the meshes that are the same material, hang off the same parent and never move on their own.

    Measured, and it is the whole story of what a bake costs. On the real gear reducer (48 objects, 4 materials) a
    256 px bake took 160 s and a 1024 px bake 407 s - 16x the texels for 2.5x the time - and cutting 16 bake calls to
    4 changed nothing. So the cost is neither texels nor calls: it is paid **per object per map**, about 0.85 s each
    at 256 px. Nine identical bearing balls on one static empty are nine times that cost for one picture of a ball.

    `lumi_mech.bearing()` and `blade_ring()` return separate objects on purpose - cutaway() needs closed manifolds and
    a single ball must be able to move on its own - and that is still right for the SOURCE scene. It stops being
    right once modifiers are applied and the thing is on its way to a texture, so the join happens here and only for
    objects that carry no animation of their own.
    """
    out = []
    for g in groups:
        buckets = {}
        for o in g:
            animated = bool(o.animation_data and o.animation_data.action)
            key = (o.parent.name if o.parent else '', animated)
            buckets.setdefault(key, []).append(o)
        kept = []
        for (parent, animated), objs in buckets.items():
            if animated or len(objs) < 2:
                kept += objs
                continue
            _select(objs, objs[0])
            try:
                bpy.ops.object.join()
                kept.append(objs[0])
            except RuntimeError as e:
                _say(f'bake: could not join {len(objs)} objects under {parent or "world"} ({e})')
                kept += objs
        out.append(kept)
    return out


def _unwrap(objs, margin):
    """One shared UV layout across the group. smart_project packs every selected object into the same 0-1 space, so
    the group's objects share an atlas without anything having to be joined (joining would hand cutaway() a
    self-intersecting mesh and would stop a single ball from moving on its own)."""
    for o in objs:
        if 'lumi_bake' not in o.data.uv_layers:
            o.data.uv_layers.new(name='lumi_bake')
        o.data.uv_layers['lumi_bake'].active = True
        o.data.uv_layers.active = o.data.uv_layers['lumi_bake']
    _select(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(UV_ANGLE), island_margin=margin, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')


def _image(name, size, colour_data, fill=(0.0, 0.0, 0.0, 1.0)):
    img = bpy.data.images.new(name, width=size, height=size, alpha=False, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color' if colour_data else 'sRGB'
    img.generated_color = fill
    return img


def _target_nodes(mats, img):
    """Point every material in the group at one image: the bake writes into whichever Image Texture node is active."""
    nodes = []
    for m in mats:
        nt = m.node_tree
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = img
        n.select = True
        nt.nodes.active = n
        nodes.append((nt, n))
    return nodes


def _drop_nodes(nodes):
    for nt, n in nodes:
        nt.nodes.remove(n)


def _bake(kind, samples, margin):
    s = bpy.context.scene
    s.cycles.samples = samples
    s.render.bake.margin = margin
    s.render.bake.use_clear = True
    s.render.bake.use_selected_to_active = False
    if kind == 'DIFFUSE':
        s.render.bake.use_pass_direct = False
        s.render.bake.use_pass_indirect = False
        s.render.bake.use_pass_color = True
        bpy.ops.object.bake(type='DIFFUSE')
    else:
        bpy.ops.object.bake(type=kind)


def _emit_rewire(mats, socket):
    """Drive Emission from whatever drives one Principled input and bake EMIT. Returns what to put back.

    Why base colour does NOT use the DIFFUSE pass, which is the obvious choice and is wrong: Blender's diffuse colour
    is base_colour x (1 - metallic), so for steel or chrome it is exactly **zero**. Measured - every base atlas came
    out solid black until this went through EMIT instead. glTF's baseColorFactor for a metal is its reflectance tint,
    not its diffuse albedo, so the two conventions disagree and the pass has to be bypassed.
    """
    undo = []
    for m in mats:
        nt = m.node_tree
        b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not b or socket not in b.inputs:
            continue
        # Find the output THROUGH THE LINK, never by taking the first OUTPUT_MATERIAL node. A Lumi material carries
        # more than one output node, so picking the first one found no Surface link at all: `was` was None, restore
        # put nothing back, and every pass after the first baked an Emission material. Roughness and metallic both
        # came out 1.0 and the player drew a black silhouette. Read the driving socket BEFORE relinking as well -
        # a replaced link is a dangling reference.
        link = next((l for l in nt.links if l.to_node.type == 'OUTPUT_MATERIAL' and l.to_socket.name == 'Surface'), None)
        out = link.to_node if link else next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None)
        if not out:
            continue
        was = link.from_socket if link else None
        em = nt.nodes.new('ShaderNodeEmission')
        src = b.inputs[socket]
        if src.is_linked:
            nt.links.new(src.links[0].from_socket, em.inputs['Color'])
        elif hasattr(src.default_value, '__len__'):
            em.inputs['Color'].default_value = tuple(src.default_value)
        else:
            v = float(src.default_value)
            em.inputs['Color'].default_value = (v, v, v, 1.0)
        nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
        undo.append((nt, em, out, was))
    return undo


def _emit_restore(undo):
    for nt, em, out, from_socket in undo:
        nt.nodes.remove(em)
        if from_socket is not None:
            nt.links.new(from_socket, out.inputs['Surface'])


def _ao_only(scene, size):
    """Hide the studio and give AO a finite reach, for the length of the AO bake.

    Measured: without this every AO atlas bakes solid black. `L.studio()` puts a 30x-subject floor, a cove and a back
    wall around the part, and an AO bake with the default unlimited distance sees them in nearly every direction, so
    the whole subject reads as fully occluded. What the map is for is crevice darkening - gear roots, bolt recesses -
    which is a local effect; the reach here is the same order as the cavity node's (Part A item 1), scaled to this
    subject.
    """
    hidden = [o for o in scene.objects
              if o.name.startswith('lumi_flag') or o.name in ('lumi_floor', 'lumi_cove')]
    was = [(o, o.hide_render) for o in hidden]
    for o, _ in was:
        o.hide_render = True
    ls = scene.world.light_settings if scene.world else None
    old = getattr(ls, 'distance', None) if ls else None
    if old is not None:
        ls.distance = max(1e-4, 0.08 * size)
    return was, ls, old


def _ao_restore(state):
    was, ls, old = state
    for o, h in was:
        o.hide_render = h
    if ls is not None and old is not None:
        ls.distance = old


def _pack_orm(ao, rough, metal, size, name):
    """glTF's one texture for three channels: R = occlusion, G = roughness, B = metallic. Packing them here means one
    image in the GLB instead of three, and it is the arrangement three.js reads without any help."""
    orm = _image(name, size, colour_data=True)
    n = size * size
    a, r, m = list(ao.pixels), list(rough.pixels), list(metal.pixels)
    px = [0.0] * (n * 4)
    for i in range(n):
        px[i * 4 + 0] = a[i * 4]
        px[i * 4 + 1] = r[i * 4]
        px[i * 4 + 2] = m[i * 4]
        px[i * 4 + 3] = 1.0
    orm.pixels = px
    return orm


def _rebuild(mat, base_img, orm_img):
    """Replace the procedural graph with the two baked textures, in the exact shape Blender's glTF exporter maps to a
    glTF PBR material. Everything the node graph did is now in the pixels."""
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    uv = nt.nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'lumi_bake'
    tb = nt.nodes.new('ShaderNodeTexImage')
    tb.image = base_img
    nt.links.new(uv.outputs['UV'], tb.inputs['Vector'])
    nt.links.new(tb.outputs['Color'], b.inputs['Base Color'])
    to = nt.nodes.new('ShaderNodeTexImage')
    to.image = orm_img
    to.image.colorspace_settings.name = 'Non-Color'
    nt.links.new(uv.outputs['UV'], to.inputs['Vector'])
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(to.outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], b.inputs['Roughness'])
    nt.links.new(sep.outputs['Blue'], b.inputs['Metallic'])
    # occlusion: the glTF exporter picks R up through the "glTF Material Output" group if it is there, and ignores it
    # harmlessly if the add-on did not register it. The player reads it from the ORM map either way.
    return mat


def _animated(o):
    return bool(o.animation_data and o.animation_data.action)


def _anchors():
    """L.anchor() points, in a form three.js can follow without Blender (B.6: labels on a baked slide). Taken BEFORE
    the statics are joined, because a joined object's name is gone from the glTF. An anchor under something that moves
    is stored as a point local to its nearest ANIMATED ancestor (those are never joined, so the node survives under its
    own name); an anchor on nothing that moves is a fixed world point. Both are Blender Z-up; the player converts."""
    L = sys.modules.get('lumi_bpy')
    out = {}
    for name, (where, off) in (getattr(L, '_ANCHORS', None) or {}).items():
        if hasattr(where, 'matrix_world'):
            p = where.matrix_world.translation + off
            a = where
            while a is not None and not _animated(a):
                a = a.parent
            if a is not None:
                out[name] = {'node': a.name, 'local': [round(v, 6) for v in a.matrix_world.inverted() @ p]}
                continue
        else:
            p = [w + o for w, o in zip(where, off)]
        out[name] = {'point': [round(v, 6) for v in p]}
    return out


def _geo_hash(objs, size):
    """B.3: what a bake depends on - each subject's shape, where a part that does not move sits, and its materials.
    Motion, timing and camera are deliberately NOT in it: a re-time keeps the atlases and costs one export."""
    h = hashlib.sha1(str(size).encode())
    for o in sorted(objs, key=lambda x: x.name):
        h.update(o.name.encode())
        me = o.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
        try:
            for v in me.vertices:
                h.update(('%.5f,%.5f,%.5f;' % tuple(v.co)).encode())
            h.update(str(len(me.polygons)).encode())
        finally:
            o.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh_clear()
        if not _animated(o):
            h.update(';'.join('%.5f' % x for row in o.matrix_world for x in row).encode())
        for m in o.data.materials:
            if not m:
                continue
            h.update(m.name.encode())
            for n in (m.node_tree.nodes if m.node_tree else []):
                h.update((n.bl_idname + n.name).encode())
                for i in n.inputs:
                    dv = getattr(i, 'default_value', None)
                    try:
                        h.update(repr(tuple(dv) if hasattr(dv, '__len__') else dv).encode())
                    except TypeError:
                        pass
            for lk in (m.node_tree.links if m.node_tree else []):
                h.update((lk.from_node.name + lk.from_socket.identifier + lk.to_node.name + lk.to_socket.identifier).encode())
    return h.hexdigest()[:16]


def _previous(out_dir):
    try:
        with open(os.path.join(out_dir, 'bake.json'), encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _subject_bounds(objs):
    """The subject's world-space box, so the player can aim the camera the way L.camera() did and size its floor."""
    from mathutils import Vector
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            p = o.matrix_world @ Vector(c)
            lo = Vector((min(lo.x, p.x), min(lo.y, p.y), min(lo.z, p.z)))
            hi = Vector((max(hi.x, p.x), max(hi.y, p.y), max(hi.z, p.z)))
    return lo, hi


def _camera(scene, cam, ctr):
    """Blender's camera exactly as it framed the render, so three.js frames the same picture: the WORLD rotation (not a
    lookAt - L.camera(frame_right=True) aims at the subject and then moves the frame with a lens SHIFT), both angles
    from the real sensor fit (L.camera() fits VERTICAL), and the shift in the units Blender measures it in."""
    if not cam:
        return {'target': [round(v, 6) for v in ctr], 'up': 'Z'}
    d = cam.data
    aspect = scene.render.resolution_x / float(scene.render.resolution_y or 1)
    fit = d.sensor_fit if d.sensor_fit != 'AUTO' else ('HORIZONTAL' if aspect >= 1 else 'VERTICAL')
    if fit == 'VERTICAL':
        ty = 0.5 * d.sensor_height / d.lens
        tx = ty * aspect
    else:
        tx = 0.5 * d.sensor_width / d.lens
        ty = tx / aspect
    q = cam.matrix_world.to_quaternion()
    return {
        'position': [round(v, 6) for v in cam.matrix_world.translation],
        'quaternion': [round(v, 7) for v in (q.w, q.x, q.y, q.z)],
        'target': [round(v, 6) for v in ctr],
        'fovY': round(math.degrees(2 * math.atan(ty)), 4),
        'fovX': round(math.degrees(2 * math.atan(tx)), 4),
        'aspect': round(aspect, 6),
        'shift': [round(d.shift_x, 6), round(d.shift_y, 6)],
        'shiftUnit': 'height' if fit == 'VERTICAL' else 'width',
        'clip': [round(d.clip_start, 6), round(d.clip_end, 6)],
        'up': 'Z',
    }


def _camera_track(scene, cam, ctr):
    """Part E: L.move() keys the camera on every frame 1..N+1, so the player needs every frame's pose, not one. One row
    per frame: position (3), quaternion w x y z (4), fovY, fovX - in the same frame and units as _camera(). Row N equals
    row 0 (the loop closes), and the player interpolates between rows by t, so seek(t) stays a pure function of t."""
    if not cam or not scene.get('lumi_move'):
        return None
    n = int(scene.get('lumi_loop', 0) or 0)
    if n < 2:
        return None
    rows = []
    for f in range(scene.frame_start, scene.frame_start + n + 1):
        scene.frame_set(f)
        c = _camera(scene, cam, ctr)
        rows.append(c['position'] + c['quaternion'] + [c['fovY'], c['fovX']])
    scene.frame_set(scene.frame_start)
    return {'move': scene['lumi_move'], 'frames': n, 'rows': rows}


def _manifest(scene, groups, mode, size, seconds, objs):
    cam = scene.camera
    lo, hi = _subject_bounds(objs)
    ctr = (lo + hi) / 2
    period = float(scene.get('lumi_period', 0.0) or 0.0)
    if not period:
        total = int(scene.get('lumi_frames', scene.frame_end - scene.frame_start + 1))
        period = total / float(scene.render.fps or 20)
    sections = sorted({m.name for g in groups for o in g for m in o.data.materials
                       if m and m.get('lumi_recipe') == 'section'})
    return {
        'schema': 'lumi-bake/1',
        'mode': mode,
        'atlas': size,
        'bakeSeconds': round(seconds, 2),
        'period': round(period, 4),
        'fps': int(scene.render.fps or 20),
        'frames': int(scene.get('lumi_frames', scene.frame_end - scene.frame_start + 1)),
        'background': scene.get('lumi_bg', '#F9F4F2'),
        'transparent': bool(scene.get('lumi_transparent', False)),
        # Blender is Z-up and the glTF came out Y-up (export_yup), so the player maps (x, y, z) -> (x, z, -y). The
        # camera is given as a position and the point it looks at rather than a rotation: L.camera() uses
        # to_track_quat, so there is no roll to preserve, and a lookAt reproduces it exactly without a quaternion
        # basis change that is easy to get subtly wrong.
        'camera': _camera(scene, cam, ctr),
        'cameraTrack': _camera_track(scene, cam, ctr),
        'real': (sys.modules['lumi_bpy']._REAL or None) if 'lumi_bpy' in sys.modules else None,
        'bounds': {'min': [round(v, 6) for v in lo], 'max': [round(v, 6) for v in hi],
                   'size': round((hi - lo).length, 6)},
        # B.4: the hatch is screen-space and must NOT be in a texture. The player injects it per fragment on these
        # materials; the baked fill underneath is the flat grey the drafting convention wants.
        'sectionMaterials': sections,
        'groups': [{'materials': sorted({m.name for o in g for m in o.data.materials if m}),
                    'objects': [o.name for o in g]} for g in groups],
    }


def run(out_dir, mode=None):
    """The whole bake. Called by L.render() when --bake was passed; returns the manifest it wrote."""
    scene = bpy.context.scene
    mode = mode or scene.get('lumi_bake') or 'draft'
    size = RESOLUTIONS.get(mode, RESOLUTIONS['final'])
    margin = MARGIN_PX.get(mode, 6)
    out_dir = os.path.abspath(out_dir if not out_dir.lower().endswith('.png') else os.path.dirname(out_dir))
    atlas_dir = os.path.join(out_dir, 'atlas')
    os.makedirs(atlas_dir, exist_ok=True)

    scene.render.engine = 'CYCLES'
    scene.render.bake.target = 'IMAGE_TEXTURES'
    t0 = time.time()

    objs = _subject(scene)
    if not objs:
        raise RuntimeError('bake: nothing to bake - no visible subject mesh (did studio() run before render()?)')
    if bpy.context.object is None or bpy.context.object.mode != 'OBJECT':
        try:
            bpy.ops.object.mode_set(mode='OBJECT')
        except RuntimeError:
            pass
    _apply_modifiers(objs)
    anchors = _anchors()
    geo = _geo_hash(objs, size)
    prev = _previous(out_dir)
    reuse = (prev.get('geoHash') == geo and prev.get('atlas') == size
             and all(os.path.isfile(os.path.join(atlas_dir, f'g{i}_{k}.png'))
                     for i in range(1, len(prev.get('groups') or []) + 1) for k in ('base', 'orm')))
    groups = _join_static(list(_groups(objs).values()))
    objs = [o for g in groups for o in g]
    _say(f'bake: {len(objs)} objects (after joining statics) in {len(groups)} material group(s), '
         f'{size} px atlases, mode={mode}')

    t_uv = time.time()
    for g in groups:
        _unwrap(g, margin / float(size))
    uv_s = time.time() - t_uv

    # ONE bake call per map, not one per group. Measured on the real gear scene (48 objects, 4 groups): 256 px took
    # 160.4 s and 1024 px 406.9 s, which solves to about **9 s of fixed cost per bake call** and only ~16 s of actual
    # texel work at 256 px. The cost is Cycles syncing the scene and rebuilding the BVH, and it is paid again on every
    # call whatever the resolution. Blender bakes every SELECTED object in one call, each into the image that is
    # active in its own material - so all four atlases fill at once and 16 calls become 4.
    mats_of = []
    for i, g in enumerate(groups, 1):
        mats = list({m.name: m for o in g for m in o.data.materials if m}.values())
        mats_of.append((f'g{i}', g, mats))
    bake_s = {'base': 0.0, 'rough': 0.0, 'metal': 0.0, 'ao': 0.0}
    atlases = {}                           # tag -> {key: image}
    span = (_subject_bounds(objs)[1] - _subject_bounds(objs)[0]).length
    if reuse and len(prev.get('groups') or []) != len(groups):
        reuse = False
    if reuse:
        # B.3: same shape, same materials, same atlas size - only the motion, timing or camera changed. The pixels
        # from last time are still right (smart-UV is deterministic on the same mesh), so skip every bake call.
        _say('bake: geometry and materials unchanged - reusing the atlases, export only')
        for tag, g, mats in mats_of:
            base = bpy.data.images.load(os.path.join(atlas_dir, f'{tag}_base.png'), check_existing=False)
            orm = bpy.data.images.load(os.path.join(atlas_dir, f'{tag}_orm.png'), check_existing=False)
            orm.colorspace_settings.name = 'Non-Color'
            for m in mats:
                _rebuild(m, base, orm)
    for key, kind, sample, rewire in (() if reuse else (('base', 'EMIT', SAMPLES['colour'], 'Base Color'),
                                      ('rough', 'ROUGHNESS', SAMPLES['colour'], None),
                                      ('metal', 'EMIT', SAMPLES['colour'], 'Metallic'),
                                      ('ao', 'AO', SAMPLES['ao'], None))):
        nodes, undo = [], []
        for tag, g, mats in mats_of:
            if not mats:
                continue
            img = _image(f'lumi_{tag}_{key}', size, colour_data=(key != 'base'))
            atlases.setdefault(tag, {})[key] = img
            nodes += _target_nodes(mats, img)
            if rewire:
                undo += _emit_rewire(mats, rewire)
        ao_state = _ao_only(scene, span) if key == 'ao' else None
        _select(objs)
        t = time.time()
        _bake(kind, sample, MARGIN_PX.get(mode, 6))
        bake_s[key] += time.time() - t
        if ao_state:
            _ao_restore(ao_state)
        if undo:
            _emit_restore(undo)
        _drop_nodes(nodes)
        _say(f'bake: {key} done for {len(atlases)} atlas(es) in {bake_s[key]:.1f} s')

    for tag, g, mats in (() if reuse else mats_of):
        if not mats:
            continue
        imgs = atlases[tag]
        orm = _pack_orm(imgs['ao'], imgs['rough'], imgs['metal'], size, f'lumi_{tag}_orm')
        # the single maps are kept beside the packed one: when a baked slide looks wrong it is almost always one
        # channel, and without them the only way to find out which is another bake
        for key, im in (('base', imgs['base']), ('rough', imgs['rough']), ('metal', imgs['metal']),
                        ('ao', imgs['ao']), ('orm', orm)):
            im.filepath_raw = os.path.join(atlas_dir, f'{tag}_{key}.png')
            im.file_format = 'PNG'
            im.save()
        for m in mats:
            _rebuild(m, imgs['base'], orm)

    # ---- export. WebP keeps the atlas small; the geometry is left uncompressed because a Draco or meshopt decoder is
    # another file in a deck that has to stay one offline file, and the atlases are the larger half of the bytes anyway.
    # use_selection: the studio is NOT in the model. lumi_floor is a shadow catcher and lumi_flag* are black cards that
    # exist only to put a dark edge on chrome; three.js draws its own floor shadow and its own environment, so exporting
    # them would put a second floor and two black rectangles into the slide.
    glb = os.path.join(out_dir, 'model.glb')
    # every empty the subject hangs from goes too, WHATEVER its name: L.turntable() / L.spin() move the parts through a
    # `lumi_*` parent, and leaving it out exported a turning scene with no motion at all
    above = set()
    for o in objs:
        p = o.parent
        while p is not None:
            above.add(p.name); p = p.parent
    _select(objs + [o for o in scene.objects if o.type == 'EMPTY' and (o.name in above or not o.name.startswith('lumi_'))])
    t_exp = time.time()
    kw = dict(filepath=glb, export_format='GLB', use_selection=True, export_apply=False,
              export_animations=True, export_frame_range=True, export_optimize_animation_size=True,
              export_cameras=False, export_lights=False, export_yup=True)
    try:
        bpy.ops.export_scene.gltf(export_image_format='WEBP', **kw)
    except TypeError:                       # an older exporter without WebP: PNG still works, it is just larger
        bpy.ops.export_scene.gltf(**kw)
    export_s = time.time() - t_exp

    # ---- the poster: one Cycles frame of the BAKED materials in the real studio, at the loop's first frame. It is the
    # approval card's picture, the checker's "a poster exists" (B.7), and the fallback for a scene no browser can draw.
    t_po = time.time()
    poster = os.path.join(out_dir, 'poster.png')
    pct, spp = POSTER.get(mode, POSTER['final'])
    scene.render.resolution_percentage = pct
    scene.cycles.samples = spp
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = poster
    scene.frame_set(scene.frame_start)
    bpy.ops.render.render(write_still=True)
    L = sys.modules.get('lumi_bpy')
    if L and not scene.get('lumi_transparent', False):      # the film is transparent: put it on the slide colour, as render() does
        L._composite(poster, scene.get('lumi_bg', L.C['canvas']))
    poster_s = time.time() - t_po

    total = time.time() - t0
    man = _manifest(scene, groups, mode, size, total, objs)
    man['poster'] = os.path.basename(poster) if os.path.isfile(poster) else None
    man['timing'] = {'uvS': round(uv_s, 2), 'exportS': round(export_s, 2), 'posterS': round(poster_s, 2),
                     'bakeS': {k: round(v, 2) for k, v in bake_s.items()}, 'totalS': round(total, 2)}
    man['glb'] = os.path.basename(glb)
    man['geoHash'] = geo
    man['reused'] = reuse
    man['anchors'] = anchors
    man['glbBytes'] = os.path.getsize(glb) if os.path.isfile(glb) else None
    with open(os.path.join(out_dir, 'bake.json'), 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1)
    _say(f'bake: wrote {glb} ({man["glbBytes"]} bytes) in {total:.1f} s '
         f'(uv {uv_s:.1f}, base {bake_s["base"]:.1f}, rough {bake_s["rough"]:.1f}, '
         f'metal {bake_s["metal"]:.1f}, ao {bake_s["ao"]:.1f}, export {export_s:.1f})')
    _say(f'done: bake {mode} {size}px, {len(groups)} atlas(es), total {total:.1f} s')
    return man
