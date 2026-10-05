"""lumi_mech - real mechanical parts for the Bold Blue Blender studio (batch 6 Part A item 4).

Import it exactly like lumi_bpy, from the same folder (the scene template's `_lumi()` already put that folder on
sys.path, so one more import line is all it takes):

    import lumi_bpy as L
    import lumi_mech as M

    ring = M.gear(teeth=41, module=0.006, width=0.022, bore=0.030, material=L.mat('cast_iron'))
    pin  = M.gear(teeth=11, module=0.006, width=0.026, bore=0.018, material=L.mat('steel'))
    pin.location = (0, (41 + 11) * 0.006 / 2, 0)          # centre distance = m (z1 + z2) / 2

WHY IT EXISTS. BLENDER.md section 4 asks for REAL counts and REAL dimensions, because that is most of why a studio
render reads as a photograph of a thing rather than a drawing of one. Writing an involute tooth flank by hand in
every scene.py is how a 41-tooth ring gear quietly becomes a 41-sided cog. These are the parts that keep coming
back, built once, correctly.

WHAT EVERY FUNCTION GUARANTEES
- A named object whose ORIGIN IS THE REAL PIVOT: a gear's origin is its axis, a blade's origin is the ring axis it
  turns about, a nut's origin is its thread axis. L.spin / L.wave / L.animate key the object transform, so a wrong
  origin is a wrong motion.
- A CLOSED, MANIFOLD, non-self-intersecting mesh, built as one lofted surface with proper caps. That is what
  L.cutaway()'s EXACT boolean solver needs (BLENDER.md section 5), and it is why nothing here is ever joined into
  a neighbouring part.
- Pre-bevelled (L.bevel) and L.smooth-ed, so there are no razor edges and flat caps stay flat (LOOK.md 4.12).
- Metres, Z up, the axis of rotation along local Z unless the docstring says otherwise -- the same convention as
  L.lathe, so the brushed-metal streaks follow the axis.

MULTI-BODY PARTS. bearing() and blade_ring() return a LIST of separate objects, not one joined mesh. Joining them
would hand cutaway() a self-intersecting mesh and the EXACT solver would fail; keeping them apart is also what lets
a single blade or the inner race animate on its own.

SIZES ARE REAL. Module and pitch are the actual standards: a 41T ring on an 11T pinion really is 3.73:1, an M8
bolt really has a 13 mm across-flats head and a 1.25 mm thread pitch. If a count or a dimension for the subject is
not known, ASK in the build question (BLENDER.md section 4) -- a plausible invented number is the one thing this
module cannot supply.
"""
import bpy, bmesh, math
from mathutils import Vector, Matrix

import lumi_bpy as L

TAU = 2 * math.pi

# ISO metric coarse: nominal d -> (across flats of the hex, head height, thread pitch, nut height), all in mm
ISO_HEX = {
    3: (5.5, 2.0, 0.5, 2.4), 4: (7.0, 2.8, 0.7, 3.2), 5: (8.0, 3.5, 0.8, 4.7), 6: (10.0, 4.0, 1.0, 5.2),
    8: (13.0, 5.3, 1.25, 6.8), 10: (16.0, 6.4, 1.5, 8.4), 12: (18.0, 7.5, 1.75, 10.8), 14: (21.0, 8.8, 2.0, 12.8),
    16: (24.0, 10.0, 2.0, 14.8), 20: (30.0, 12.5, 2.5, 18.0), 24: (36.0, 15.0, 3.0, 21.5),
}


# ---------------------------------------------------------------- mesh plumbing
def _obj(name, verts, faces, material=None, bevel_w=None, angle=30):
    """One closed mesh -> a linked, bevelled, smooth-shaded object. Normals are recalculated outward, so a flipped
    loft never ships (BLENDER.md section 8 "dark or faceted surfaces")."""
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    if material:
        me.materials.append(material)
    if bevel_w:
        L.bevel(o, width=bevel_w, segments=2)
    return L.smooth(o, angle)


def _tube(outer, inner=None, closed=False):
    """Loft equal-length rings into a closed solid. outer/inner are lists of rings, each ring a list of (x,y,z) in
    the same winding and the same length. With `inner` the ends are annular (a bore); without, each end is a
    triangle fan to the ring's own centroid, which is manifold for any profile that is star-shaped about its axis
    (every profile in this module is). closed=True joins the last ring back to the first and adds no caps at all
    (a torus). Returns (verts, faces)."""
    nr, nv = len(outer), len(outer[0])
    verts, faces = [], []
    for ring in outer:
        verts += list(ring)

    def wall(base, rings, flip):
        last = rings if closed else rings - 1
        for i in range(last):
            a, b = base + (i % rings) * nv, base + ((i + 1) % rings) * nv
            for k in range(nv):
                k2 = (k + 1) % nv
                q = (a + k, a + k2, b + k2, b + k)
                faces.append(q[::-1] if flip else q)

    wall(0, nr, False)
    if closed:
        return verts, faces
    if inner is None:
        for end, ring in ((0, outer[0]), (nr - 1, outer[-1])):
            c = Vector((0, 0, 0))
            for p in ring: c += Vector(p)
            c /= nv
            ci = len(verts); verts.append(tuple(c))
            base = end * nv
            for k in range(nv):
                k2 = (k + 1) % nv
                faces.append((ci, base + k2, base + k) if end == 0 else (ci, base + k, base + k2))
        return verts, faces
    ibase = len(verts)
    for ring in inner:
        verts += list(ring)
    wall(ibase, nr, True)
    for end in (0, nr - 1):
        ob, ib = end * nv, ibase + end * nv
        for k in range(nv):
            k2 = (k + 1) % nv
            q = (ob + k, ob + k2, ib + k2, ib + k)
            faces.append(q if end == 0 else q[::-1])
    return verts, faces


def _ring(radius_fn, z, n, twist=0.0, scale=1.0):
    """One closed ring of n points: radius_fn(theta) metres, rotated by `twist` radians and scaled about the axis."""
    out = []
    for k in range(n):
        th = TAU * k / n
        r = radius_fn(th) * scale
        a = th + twist
        out.append((r * math.cos(a), r * math.sin(a), z))
    return out


def _circle(r):
    return lambda th: r


def _hex_r(across_flats):
    """Radius of a hexagon as a function of angle (across-flats = the spanner size)."""
    a = across_flats / 2.0
    return lambda th: a / math.cos(((th + math.pi / 6) % (math.pi / 3)) - math.pi / 6)


# ---------------------------------------------------------------- gears
def _inv(a):
    return math.tan(a) - a


def involute_profile(teeth, module, pressure=20.0, samples=10, backlash=0.0):
    """The real involute outline of a spur gear as [(x, y)] counter-clockwise, one closed loop, centred on the axis.
    Standard full-depth proportions: addendum = m, dedendum = 1.25 m, base circle = pitch x cos(pressure angle).
    Below the base circle the flank becomes a radial line, which is what a hobbed root actually looks like."""
    z = max(5, int(teeth))
    m = float(module)
    a = math.radians(pressure)
    rp = m * z / 2.0
    rb = rp * math.cos(a)
    ra = rp + m
    rf = max(rp - 1.25 * m, 0.25 * rp)
    half = math.pi / (2 * z) - backlash / (2 * rp) + _inv(a)      # tooth half-angle at the base circle datum

    def theta(r):
        if r <= rb: return half - _inv(math.acos(min(1.0, rb / max(rb, rb))))
        return half - _inv(math.acos(min(1.0, rb / r)))

    th_tip = theta(ra)
    if th_tip <= 0.004:                       # a pointed tooth: lower the tip until there is a land left
        while th_tip <= 0.004 and ra > rp:
            ra -= 0.02 * m
            th_tip = theta(ra)
    th_root = theta(max(rf, rb))
    pitch_half = math.pi / z
    pts = []
    for i in range(z):
        c = TAU * i / z
        for j in range(3):                                           # root arc up to the flank
            t = j / 3.0
            ang = -pitch_half + t * (pitch_half - th_root)
            pts.append((rf * math.cos(c + ang), rf * math.sin(c + ang)))
        if rf < rb:                                                  # radial run from root to base circle
            pts.append((rf * math.cos(c - th_root), rf * math.sin(c - th_root)))
        for j in range(samples + 1):                                 # left flank, root -> tip
            r = max(rb, rf) + (ra - max(rb, rf)) * j / samples
            ang = -theta(r)
            pts.append((r * math.cos(c + ang), r * math.sin(c + ang)))
        for j in range(1, 3):                                        # tip land
            t = j / 3.0
            ang = -th_tip + 2 * th_tip * t
            pts.append((ra * math.cos(c + ang), ra * math.sin(c + ang)))
        for j in range(samples, -1, -1):                             # right flank, tip -> root
            r = max(rb, rf) + (ra - max(rb, rf)) * j / samples
            ang = theta(r)
            pts.append((r * math.cos(c + ang), r * math.sin(c + ang)))
        if rf < rb:
            pts.append((rf * math.cos(c + th_root), rf * math.sin(c + th_root)))
        for j in range(1, 3):                                        # root arc to the next tooth
            t = j / 3.0
            ang = th_root + t * (pitch_half - th_root)
            pts.append((rf * math.cos(c + ang), rf * math.sin(c + ang)))
    return pts


def gear(teeth, module=0.005, width=0.02, helix=0.0, bore=0.0, pressure=20.0, name='gear', material=None,
         layers=None, samples=10):
    """A real involute SPUR or HELICAL gear. Axis = local Z, origin ON THE AXIS at mid-face (its real pivot).

    teeth    the real tooth count. State it in the scene file and in the caption; never invent one
    module   metres per tooth of pitch diameter: pitch diameter = module * teeth (ISO module in mm / 1000)
    width    face width in metres
    helix    helix angle in degrees (0 = spur). The twist over the face is width * tan(helix) / pitch radius
    bore     bore diameter in metres (0 = solid blank)

    A pair meshes when both share `module`: centre distance = module * (z1 + z2) / 2, ratio = z2 / z1."""
    prof = involute_profile(teeth, module, pressure, samples)
    n = len(prof)
    rp = module * teeth / 2.0
    total_twist = (width * math.tan(math.radians(helix)) / rp) if helix else 0.0
    nl = int(layers or (max(2, int(abs(math.degrees(total_twist)) / 6) + 2) if helix else 2))
    outer, inner = [], ([] if bore > 0 else None)
    for i in range(nl):
        t = i / (nl - 1)
        z = -width / 2 + width * t
        tw = total_twist * (t - 0.5)
        ca, sa = math.cos(tw), math.sin(tw)
        outer.append([(x * ca - y * sa, x * sa + y * ca, z) for x, y in prof])
        if inner is not None:
            inner.append([(bore / 2 * math.cos(TAU * k / n + tw), bore / 2 * math.sin(TAU * k / n + tw), z)
                          for k in range(n)])
    v, f = _tube(outer, inner)
    return _obj(name, v, f, material, bevel_w=min(0.12 * module, 0.08 * width))


def bevel_gear(teeth, module=0.005, face=0.015, cone=45.0, bore=0.0, pressure=20.0, name='bevel_gear',
               material=None, samples=8):
    """A straight-cut BEVEL gear (Tredgold's approximation: the spur profile swept along the pitch cone, which is
    how a bevel tooth is laid out on paper). Axis = local Z, origin on the axis at the BACK face, which is the
    pivot a differential case or a pinion shaft turns it about.

    cone  pitch cone angle in degrees. A 90-degree pair has cone1 + cone2 = 90 (a 10T/41T crown-wheel pair is
          atan(10/41) = 13.7 and 76.3 degrees)."""
    prof = involute_profile(teeth, module, pressure, samples)
    n = len(prof)
    g = math.radians(cone)
    rp = module * teeth / 2.0
    Re = rp / max(math.sin(g), 1e-3)                 # outer cone distance
    face = min(float(face), 0.33 * Re)
    outer, inner = [], ([] if bore > 0 else None)
    nl = 6
    for i in range(nl):
        t = i / (nl - 1)
        s = 1.0 - t * face / Re                      # the whole tooth shrinks toward the apex
        z = t * face * math.cos(g)
        outer.append([(x * s, y * s, z) for x, y in prof])
        if inner is not None:
            inner.append([(bore / 2 * math.cos(TAU * k / n), bore / 2 * math.sin(TAU * k / n), z) for k in range(n)])
    v, f = _tube(outer, inner)
    return _obj(name, v, f, material, bevel_w=min(0.12 * module, 0.06 * face))


# ---------------------------------------------------------------- spring
def spring(coils=6.0, wire_d=0.013, free_length=0.234, od=0.09, name='spring', material=None, sides=14, steps=24,
           ends='closed'):
    """A helical compression SPRING swept along its real helix. Axis = local Z, origin at the centre of the spring
    (its real pivot: it compresses about its own middle).

    coils        number of active coils (the F1 brief's spring is 6 coils of 13 mm wire, 234 mm free length)
    wire_d       wire diameter in metres
    free_length  uncompressed length in metres
    od           outside diameter in metres
    ends         'closed' squares and grinds the last half coil flat, as a real compression spring is

    L.wave(spring, 'scale', 2, amplitude=0.08, cycles=1) breathes it; keep the amplitude small or the wire
    self-intersects, which cutaway() would then refuse."""
    r = (od - wire_d) / 2.0
    n = max(8, int(coils * steps))
    pitch = (free_length - wire_d) / max(coils, 0.5)
    span = free_length - wire_d
    # the axial run must be MONOTONIC or the wire doubles back on itself and the mesh stops being manifold, so a
    # squared end is the integral of a rate that falls to zero over the first and last half coil, then normalised
    rate = []
    for i in range(n + 1):
        t = i / n
        e = min(1.0, (t * coils) / 0.5) * min(1.0, ((1 - t) * coils) / 0.5) if ends == 'closed' else 1.0
        rate.append(0.06 + 0.94 * max(0.0, e))
    cum, acc = [], 0.0
    for v_ in rate:
        cum.append(acc); acc += v_
    zs = [-free_length / 2 + wire_d / 2 + span * (c_ / acc) for c_ in cum]
    rings = []
    for i in range(n + 1):
        t = i / n
        ang = TAU * coils * t
        z = zs[i]
        dz = (zs[min(i + 1, n)] - zs[max(i - 1, 0)]) / (2.0 / n)
        c = Vector((r * math.cos(ang), r * math.sin(ang), z))
        tan = Vector((-r * math.sin(ang) * TAU * coils, r * math.cos(ang) * TAU * coils, dz)).normalized()
        up = Vector((0, 0, 1))
        u = tan.cross(up)
        u = u.normalized() if u.length > 1e-6 else Vector((1, 0, 0))
        v2 = tan.cross(u).normalized()
        rings.append([tuple(c + u * (wire_d / 2 * math.cos(TAU * k / sides))
                            + v2 * (wire_d / 2 * math.sin(TAU * k / sides))) for k in range(sides)])
    v, f = _tube(rings)
    return _obj(name, v, f, material, bevel_w=None, angle=60)


# ---------------------------------------------------------------- threaded fasteners
def _thread_r(minor, major, pitch, phase_sign=1.0):
    """r(theta, z) of a real single-start V thread: a 60-degree triangular profile whose phase advances one pitch
    per turn. Because it is single-valued in (theta, z) the loft stays a clean manifold, unlike a swept rib."""
    def fn(th, z):
        u = ((z / pitch) - phase_sign * th / TAU) % 1.0
        d = abs(u - 0.5) * 2.0                       # 1 at the crest, 0 at the root
        return minor + (major - minor) * d
    return fn


def bolt(size=8, length=0.030, name='bolt', material=None, thread=True, head='hex', nth=48):
    """An ISO metric hex-head BOLT with a real cut thread. Axis = local Z pointing UP out of the joint; the ORIGIN
    IS UNDER THE HEAD, on the axis, which is where a bolt actually pivots as it is turned.

    size    nominal diameter in mm (3-24: the ISO table above gives the real across-flats, head height and pitch)
    length  shank length in metres, under the head
    thread  True cuts the real 60-degree V thread (one lofted surface, still manifold); False leaves a plain shank
            for a part that is buried in a joint anyway

    An M8 bolt really is 13 mm across the flats with a 1.25 mm pitch -- state the size in the caption, not "a bolt"."""
    d = float(size) / 1000.0
    af, hh, pitch, _ = ISO_HEX.get(int(size), (1.6 * size, 0.65 * size, 0.15 * size, 0.8 * size))
    af, hh, pitch = af / 1000.0, hh / 1000.0, pitch / 1000.0
    major, minor = d / 2.0, d / 2.0 - 0.613 * pitch
    hexr = _hex_r(af)
    thr = _thread_r(minor, major, pitch) if thread else (lambda th, z: major)
    rings = []
    nz = max(6, int(length / pitch * 10)) if thread else 3
    for i in range(nz + 1):                                   # shank, from the tip up to under the head
        z = -length + length * i / nz
        rings.append([(thr(TAU * k / nth, z) * math.cos(TAU * k / nth),
                       thr(TAU * k / nth, z) * math.sin(TAU * k / nth), z) for k in range(nth)])
    if head == 'hex':
        rings.append(_ring(hexr, 0.0, nth))
        rings.append(_ring(hexr, hh, nth))
        rings.append(_ring(lambda th: hexr(th) * 0.93, hh + 0.08 * hh, nth))      # the chamfer on the head top
    else:                                                      # a plain cap head
        rings.append(_ring(_circle(0.8 * d), 0.0, nth))
        rings.append(_ring(_circle(0.8 * d), hh, nth))
        rings.append(_ring(_circle(0.72 * d), hh + 0.1 * hh, nth))
    v, f = _tube(rings)
    return _obj(name, v, f, material, bevel_w=0.012 * d, angle=35)


def nut(size=8, name='nut', material=None, thread=True, nth=48):
    """An ISO metric hex NUT with the matching real thread. Axis = local Z, origin on the axis at its mid-height
    (the pivot it is spun about). Pair it with bolt(size) of the same size and the pitches match."""
    d = float(size) / 1000.0
    af, _, pitch, nh = ISO_HEX.get(int(size), (1.6 * size, 0.65 * size, 0.15 * size, 0.8 * size))
    af, pitch, nh = af / 1000.0, pitch / 1000.0, nh / 1000.0
    major, minor = d / 2.0, d / 2.0 - 0.613 * pitch
    hexr = _hex_r(af)
    thr = _thread_r(minor, major, pitch) if thread else (lambda th, z: major)
    nz = max(4, int(nh / pitch * 10)) if thread else 2
    outer, inner = [], []
    for i in range(nz + 1):
        z = -nh / 2 + nh * i / nz
        outer.append(_ring(hexr, z, nth))
        inner.append([(thr(TAU * k / nth, z) * math.cos(TAU * k / nth),
                       thr(TAU * k / nth, z) * math.sin(TAU * k / nth), z) for k in range(nth)])
    v, f = _tube(outer, inner)
    return _obj(name, v, f, material, bevel_w=0.012 * d, angle=35)


# ---------------------------------------------------------------- rotating assemblies
def blade_ring(count, radius=0.12, chord=0.045, thickness=0.14, curve=35.0, root=0.35, name='blade',
               material=None, hub=True, sections=6):
    """A ring of `count` aerofoil BLADES (a torque-converter stator, an impeller, a fan, a turbine stage).
    EVERY BLADE IS ITS OWN OBJECT with its ORIGIN ON THE RING AXIS, so L.spin(blade, turns=1) turns it about the
    shaft exactly as the real one turns, and cutaway() can cut each blade separately.

    count      the REAL blade count. A torque converter is 31 / 29 / 15; a diaphragm spring has 18 fingers. Ask
               if it is unknown (BLENDER.md section 4): a wrong count is the first thing an engineer sees
    radius     tip radius in metres; root = the hub radius as a fraction of it
    chord      blade chord in metres; thickness = max thickness as a fraction of the chord
    curve      total twist from root to tip in degrees

    Returns a list: [blade_01 ... blade_<count>] (+ the hub last when hub=True)."""
    out = []
    nseg = max(3, int(sections))

    def aerofoil(c, t, m=0.03, n=16):
        """A cambered NACA-4-style section as a closed loop of 2n points (chordwise x, thickness y)."""
        pts = []
        for side in (1, -1):
            rng = range(n + 1) if side == 1 else range(n - 1, 0, -1)
            for i in rng:
                xx = i / n
                yt = 5 * t * c * (0.2969 * math.sqrt(xx) - 0.1260 * xx - 0.3516 * xx ** 2 + 0.2843 * xx ** 3
                                  - 0.1015 * xx ** 4)
                yc = m * c * (2 * xx - xx ** 2) * 4
                pts.append(((xx - 0.35) * c, yc + side * yt))
        return pts

    for b in range(int(count)):
        base = TAU * b / count
        rings = []
        for i in range(nseg + 1):
            t = i / nseg
            rr = radius * (root + (1 - root) * t)
            tw = math.radians(curve) * (t - 0.5)
            sec = aerofoil(chord * (1.0 - 0.25 * t), thickness)
            ring = []
            for x, y in sec:
                xr = x * math.cos(tw) - y * math.sin(tw)
                yr = x * math.sin(tw) + y * math.cos(tw)
                ring.append((rr * math.cos(base) - yr * math.sin(base),
                             rr * math.sin(base) + yr * math.cos(base), xr))
            rings.append(ring)
        v, f = _tube(rings)
        o = _obj('%s_%02d' % (name, b + 1), v, f, material, bevel_w=0.004 * chord, angle=50)
        o.location = (0, 0, 0)                 # the origin is already the ring axis: the real pivot
        out.append(o)
    if hub:
        nth = 48
        rings = [_ring(_circle(radius * root * 1.02), -0.6 * chord, nth), _ring(_circle(radius * root * 1.02), 0.6 * chord, nth)]
        v, f = _tube(rings)
        out.append(_obj(name + '_hub', v, f, material, bevel_w=0.01 * chord))
    return out


def shaft(spline_teeth=0, d=0.030, length=0.18, spline_depth=0.08, name='shaft', material=None, nth=72):
    """A SHAFT, splined when spline_teeth > 0 (straight-sided involute-spline look: the real way torque leaves a
    gearbox). Axis = local Z, origin at the centre of the shaft, on the axis.

    spline_teeth   the real spline count (0 = a plain shaft)
    spline_depth   tooth depth as a fraction of the radius"""
    r = d / 2.0
    if spline_teeth > 0:
        z_t = int(spline_teeth)
        dep = r * float(spline_depth)

        def rfn(th):
            u = (th * z_t / TAU) % 1.0
            # a trapezoidal tooth: 40% land, 20% flank, 40% root -- what a straight-sided spline looks like
            if u < 0.40: return r
            if u < 0.50: return r - dep * (u - 0.40) / 0.10
            if u < 0.90: return r - dep
            return r - dep * (1.0 - (u - 0.90) / 0.10)
        nth = max(nth, z_t * 10)
    else:
        rfn = _circle(r)
    rings = [_ring(rfn, -length / 2, nth), _ring(rfn, length / 2, nth)]
    v, f = _tube(rings)
    return _obj(name, v, f, material, bevel_w=0.02 * r, angle=35)


def bearing(bore=0.030, od=0.062, width=0.016, balls=9, name='bearing', material=None, ball_material=None, nth=64):
    """A deep-groove ball BEARING, as real bearings are counted: a 6206 is 30 mm bore, 62 mm OD, 16 mm wide, 9 balls.
    Returns a LIST of separate objects -- [inner race, outer race, ball_01 ... ball_<balls>] -- because a joined
    bearing is self-intersecting and cutaway() would refuse it, and because the races and the balls move apart.
    The races' origins are on the axis; EACH BALL'S ORIGIN IS ITS OWN CENTRE, so L.spin(ball) spins the ball while
    the cage carries it round."""
    ri, ro = bore / 2.0, od / 2.0
    pcd = (ri + ro)                                     # pitch circle DIAMETER of the ball set
    br = 0.28 * (ro - ri)                               # ball radius
    out = []

    def race(r_in, r_out, groove, nm):
        rings_o, rings_i = [], []
        nz = 14
        for i in range(nz + 1):
            t = i / nz
            z = -width / 2 + width * t
            g = groove * max(0.0, 1.0 - ((t - 0.5) * 2.5) ** 2)     # the ball track, cut into the facing surface
            rings_o.append(_ring(_circle(r_out - (g if groove > 0 else 0)), z, nth))
            rings_i.append(_ring(_circle(r_in + (0 if groove > 0 else -groove)), z, nth))
        v, f = _tube(rings_o, rings_i)
        return _obj(nm, v, f, material, bevel_w=0.02 * (ro - ri), angle=35)

    out.append(race(ri, pcd / 2 - br * 0.75, br * 0.55, name + '_inner'))
    out.append(race(pcd / 2 + br * 0.75, ro, -br * 0.55, name + '_outer'))
    for i in range(int(balls)):
        a = TAU * i / balls
        rings = []
        ns = 16
        for j in range(ns + 1):
            ph = math.pi * j / ns
            rr = br * math.sin(ph)
            zz = -br * math.cos(ph)
            rings.append([(rr * math.cos(TAU * k / 24), rr * math.sin(TAU * k / 24), zz) for k in range(24)])
        v, f = _tube(rings)
        b = _obj('%s_ball_%02d' % (name, i + 1), v, f, ball_material or material, bevel_w=None, angle=180)
        b.location = (pcd / 2 * math.cos(a), pcd / 2 * math.sin(a), 0.0)    # origin = the ball's own centre
        out.append(b)
    return out


def oring(bore=0.030, section=0.0035, name='oring', material=None, nth=96, ns=20):
    """An O-RING (a torus) of the real cord section. Axis = local Z, origin on the axis in the groove's plane.
    bore = the inside diameter it seals on; section = the cord diameter (a BS1806 -214 is 24.99 x 3.53 mm)."""
    rc = bore / 2.0 + section / 2.0
    rings = []
    for i in range(nth):
        a = TAU * i / nth
        ca, sa = math.cos(a), math.sin(a)
        ring = []
        for k in range(ns):
            p = TAU * k / ns
            rr = rc + section / 2 * math.cos(p)
            ring.append((rr * ca, rr * sa, section / 2 * math.sin(p)))
        rings.append(ring)
    v, f = _tube(rings, closed=True)
    return _obj(name, v, f, material, bevel_w=None, angle=180)
