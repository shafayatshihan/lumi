"""Runs INSIDE a real Blender (batch 6 Part A). test_blender.py calls it as

    <blender> -b -P tools/form-dev/blender_parta_probe.py -- --case parts|inspect-ok|inspect-fatal

and reads the `[probe] <name> PASS|FAIL <detail>` lines. It needs LUMI_BPY set to the helper folder.
  parts         every lumi_mech part is a closed manifold mesh, survives cutaway()'s EXACT solver, pivots are right
  inspect-ok    a complete scene: inspect() finds nothing fatal and render() exits 0 under --inspect
  inspect-fatal a scene with no camera and no studio: inspect() reports both and render() exits 3
"""
import os, sys, math

sys.path.insert(0, os.environ['LUMI_BPY'])
import bmesh, bpy                                                   # noqa: E402
import lumi_bpy as L                                                # noqa: E402
import lumi_mech as M                                               # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
CASE = argv[argv.index('--case') + 1] if '--case' in argv else 'parts'
fails = []


def check(name, ok, detail=''):
    print('[probe] %s %s %s' % (name, 'PASS' if ok else 'FAIL', detail), flush=True)
    if not ok:
        fails.append(name)


def manifold(o):
    bm = bmesh.new(); bm.from_mesh(o.data)
    bad = len([e for e in bm.edges if not e.is_manifold]) + len([v for v in bm.verts if not v.is_manifold])
    bm.free()
    return bad == 0, '%d non-manifold' % bad


class A:
    out = os.path.join(os.environ.get('TEMP', '.'), 'lumi-probe.png')
    res, height, samples, preview, anim, frame = 100, 1080, 16, False, False, None
    fps, frames, cpu, inspect, cavity = 20, None, True, False, False


if CASE == 'parts':
    L.reset(A); L.gpu(A); L.cycles(16)
    steel = L.mat('steel')
    parts = [
        ('gear', M.gear(teeth=41, module=0.006, width=0.022, bore=0.030, material=steel)),
        ('gear_helical', M.gear(teeth=11, module=0.006, width=0.026, helix=20, bore=0.018, name='pinion', material=steel)),
        ('gear_solid', M.gear(teeth=10, module=0.006, width=0.014, name='spider', material=steel)),
        ('bevel_gear', M.bevel_gear(teeth=16, module=0.006, face=0.014, cone=35, bore=0.020, material=steel)),
        ('spring', M.spring(coils=6, wire_d=0.013, free_length=0.234, od=0.09, material=steel)),
        ('bolt', M.bolt(size=8, length=0.030, material=steel)),
        ('nut', M.nut(size=8, material=steel)),
        ('shaft', M.shaft(spline_teeth=18, d=0.030, length=0.18, material=steel)),
        ('oring', M.oring(bore=0.030, section=0.0035, material=L.mat('rubber'))),
    ]
    blades = M.blade_ring(count=31, radius=0.12, chord=0.045, material=steel)
    check('blade_ring: 31 blades + hub, each its own object', len(blades) == 32, str(len(blades)))
    check('blade_ring: a blade pivots on the ring axis', blades[0].location.length < 1e-9)
    brg = M.bearing(bore=0.030, od=0.062, balls=9, material=steel)
    check('bearing: inner + outer + 9 balls, kept separate', len(brg) == 11, str(len(brg)))
    check('bearing: a ball pivots on its own centre', abs(brg[2].location.length - 0.023) < 0.004, str(brg[2].location.length))
    parts += [('blade', blades[0]), ('blade_hub', blades[-1]), ('race_inner', brg[0]), ('race_outer', brg[1]), ('ball', brg[2])]
    for nm, o in parts:
        ok, d = manifold(o)
        check('closed manifold: ' + nm, ok, d)
    cut = 0
    for nm, o in parts:
        try:
            L.cutaway(o, normal=(0, -1, 0), point=tuple(o.matrix_world.translation))
            cut += 1
        except Exception as e:                                       # noqa: BLE001
            check('cutaway EXACT: ' + nm, False, str(e)[:80])
    check('cutaway EXACT solver survives every part', cut == len(parts), '%d/%d' % (cut, len(parts)))
    # a real involute gear is not a polygon: 41 teeth must give far more than 41 outline points
    prof = M.involute_profile(41, 0.006)
    check('involute profile has a real tooth flank', len(prof) > 41 * 20, str(len(prof)))

elif CASE == 'inspect-ok':
    L.reset(A); L.gpu(A); L.cycles(16)
    g = M.gear(teeth=17, module=0.006, width=0.02, bore=0.02, material=L.mat('steel'))
    L.real('probe', teeth=17, module_mm=6, width_mm=20, bore_mm=20)         # Part E: a scene declares its numbers
    L.studio(fit=[g]); L.camera([g])
    r = L.inspect()
    check('inspect: a complete scene has nothing fatal', r['ok'], str([f['code'] for f in r['fatal']]))
    check('inspect: stats carry triangles, fps and the background', r['stats']['triangles'] > 0
          and r['stats']['fps'] == 20 and r['stats']['bg'] == '#F9F4F2', str(r['stats'])[:120])
    check('inspect: every finding names a section 8 row', all(w.get('row') is not None for w in r['warn']))
    print('[probe] RESULT ' + ('ALL PASSED' if not fails else 'FAILED'), flush=True)
    bpy.context.scene['lumi_inspect'] = True
    L.render(A.out)                                                  # must exit 0

elif CASE == 'inspect-fatal':
    L.reset(A); L.gpu(A); L.cycles(16)
    M.gear(teeth=12, module=0.006, width=0.02, material=L.mat('steel'))   # no studio(), no camera()
    r = L.inspect()
    codes = [f['code'] for f in r['fatal']]
    check('inspect: a scene with no camera is fatal', 'no-camera' in codes, str(codes))
    check('inspect: a scene with no studio is fatal', 'no-world' in codes, str(codes))
    check('inspect: ok is false', r['ok'] is False)
    print('[probe] RESULT ' + ('ALL PASSED' if not fails else 'FAILED'), flush=True)
    bpy.context.scene['lumi_inspect'] = True
    L.render(A.out)                                                  # must exit 3

elif CASE == 'materials':
    L.reset(A); L.gpu(A); L.cycles(16)

    def nodes(m):
        return {n.bl_idname for n in m.node_tree.nodes}

    steel = L.mat('steel')
    check('a metal carries edge wear by default', 'ShaderNodeBevel' in nodes(steel))
    check('cavity is OFF for Cycles by default', 'ShaderNodeAmbientOcclusion' not in nodes(steel))
    paint = L.mat('paint', name='p1')
    check('a non-metal has no edge wear unless it is the hero', 'ShaderNodeBevel' not in nodes(paint))
    hero = L.mat('paint', name='p2', hero=True)
    check('hero=True opts a non-metal into edge wear', 'ShaderNodeBevel' in nodes(hero))
    glass = L.mat('glass')
    check('glass gets neither', not ({'ShaderNodeBevel', 'ShaderNodeAmbientOcclusion'} & nodes(glass)))
    glow = L.mat('glow')
    check('glow gets neither', not ({'ShaderNodeBevel', 'ShaderNodeAmbientOcclusion'} & nodes(glow)))
    off = L.mat('steel', name='s_off', wear=0)
    check('mat(wear=0) switches edge wear off', 'ShaderNodeBevel' not in nodes(off))
    on = L.mat('steel', name='s_cav', cavity=0.4)
    check('mat(cavity=) switches cavity on explicitly', 'ShaderNodeAmbientOcclusion' in nodes(on))
    bpy.context.scene['lumi_cavity'] = True
    bake = L.mat('steel', name='s_bake')
    check('the bake path (--cavity) brings cavity back', 'ShaderNodeAmbientOcclusion' in nodes(bake))
    bpy.context.scene['lumi_cavity'] = False
    bpy.context.scene['lumi_preview'] = True
    prev = L.mat('steel', name='s_prev')
    check('--preview skips both ray-traced nodes',
          not ({'ShaderNodeBevel', 'ShaderNodeAmbientOcclusion'} & nodes(prev)))
    bpy.context.scene['lumi_preview'] = False
    g = M.gear(teeth=12, module=0.006, width=0.02, material=steel)
    amt = [n for n in steel.node_tree.nodes if n.name == 'lumi_wear_amount'][0]
    before = amt.outputs[0].default_value
    L.studio(fit=[g], wear=0)
    check('studio(wear=0) turns every edge wear down after the fact',
          before > 0 and amt.outputs[0].default_value == 0, '%s -> %s' % (before, amt.outputs[0].default_value))

print('[probe] RESULT ' + ('ALL PASSED' if not fails else 'FAILED: ' + '; '.join(fails)), flush=True)
sys.exit(0 if not fails else 1)
