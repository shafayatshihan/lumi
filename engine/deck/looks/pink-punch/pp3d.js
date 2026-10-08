/* Pink Punch 3D: the print-bed engine (classic script, no imports; uses the THREE that Aura.scene passes in).
   Subject-free.

   WHY THIS EXISTS, AND WHY IT IS NEITHER BOLD BLUE'S STUDIO NOR FLAT-PACK'S DRAWING SHEET
   Gumroad's pictures are SCREEN PRINTS: a flat saturated shape, a thick black outline, and a solid black copy of the
   same shape offset about 10 px behind it. There is no light in a screen print and there is no blur - the "shadow" is
   a second pass of ink. So Pink Punch's figures are real 3D geometry, but they are PRINTED, in two passes:

       pass 1   the whole scene, every material overridden to flat black, drawn through a camera whose view is
                offset down and right by a few pixels          -> the hard shadow, pixel-exact and never blurred
       pass 2   the same scene in its real flat colours, drawn over it with the depth buffer cleared

   That two-pass print is the whole look. It is why this engine exists rather than a palette swap of FP3D:
   - the camera is NEAR-FRONTAL (turn -18 deg, tilt 14 deg), because a poster faces you; an assembly manual does not;
   - every solid is a ROUNDED form (rounded-rect extrusions, capsules, coins, stars), never a raw box;
   - the outline is 5 px, not 4, and it is on everything including the shadow pass;
   - parts POP with a small overshoot instead of clicking into place;
   - fills come from the six Gumroad pops, not from a four-colour technical palette.

   3D ENGINE POLICY: Pink Punch is 'threejs' and never Blender, and that is deliberate. Cycles path tracing
   (lumi_bpy: AgX, soft shadows, PBR) renders exactly the picture this look refuses - a photograph, with soft light
   and a blurred shadow. The policy is written down as form_server.LOOK_3D['pink-punch'] = 'threejs', so a 3D slide
   here always resolves to an engine. Do not write a scene.py for a Pink Punch deck.

     Aura.scene('s3-scene', (ctx) => {
       const S = PP3D.bed(ctx, { target: [0, 1, 0], size: 4 });
       const a = S.add(PP3D.block(ctx.THREE, 3, 2, .6, { fill: 'paper' }));
       const b = S.add(PP3D.coin(ctx.THREE, .9, .5, { fill: 'pink' }));  b.position.y = 1.4;
       S.popApart([b], [0, 1.1, 0]);
       PP3D.pins(S, ctx.el, { hero: b });
       return S.api({ update(t) { S.turn(t); } });
     }, { period: 12 });

   Everything is a pure function of t, so seek(t) in the capture contract and the recorded loop agree. */
(function () {
  'use strict';
  if (window.PP3D) return;
  var TAU = Math.PI * 2;

  /* ---------------------------------------------------------------- the fills.
     Pink is the voice; the other five are the pops, and they live ONLY inside a drawing. */
  var FILL = { paper: 0xFFFFFF, cream: 0xF4F4F0, pink: 0xFF90E8, yellow: 0xFFC900, orange: 0xF3A642,
               red: 0xDC341E, teal: 0x23A094, peri: 0x90A8ED, ink: 0x000000 };
  var INK = 0x000000;

  /* ---------------------------------------------------------------- loop maths (closed form, so every loop is seamless) */
  function wrap(t, P) { P = P || 1; return ((t % P) + P) % P; }
  function phase(t, P) { return TAU * wrap(t, P) / (P || 1); }
  function easeStep(x) { return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); }
  /* the look's own easing: a short, cheerful overshoot. easeBack(0) === 0 and easeBack(1) === 1 exactly, so a loop
     built on it is still seamless. */
  function easeBack(x) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    var c1 = 1.70158, c3 = c1 + 1, u = x - 1;
    return 1 + c3 * u * u * u + c1 * u * u;
  }
  /* n beats per loop, each held then popped: { i, next, k } with k in [0,1] across the pop (overshooting). */
  function beats(t, P, n, move) {
    move = move == null ? 0.3 : move;
    var u = wrap(t, P) / P * n, i = Math.floor(u), f = u - i;
    var k = f < 1 - move ? 0 : easeBack((f - (1 - move)) / move);
    return { i: i % n, next: (i + 1) % n, k: k };
  }

  /* ---------------------------------------------------------------- a part: a flat fill plus its own 5 px black outline.
     Same inverted-hull-plus-hard-edges trick as the other looks, at this look's heavier weight. */
  function part(THREE, geometry, o) {
    o = o || {};
    var hex = typeof o.fill === 'string' ? (FILL[o.fill] != null ? FILL[o.fill] : FILL.paper) : (o.fill != null ? o.fill : FILL.paper);
    var g = new THREE.Group();
    var mat = new THREE.MeshBasicMaterial({ color: hex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    var mesh = new THREE.Mesh(geometry, mat);
    g.add(mesh);
    if (o.outline !== false) {
      var hull = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide, toneMapped: false }));
      hull.scale.setScalar(1 + (o.weight != null ? o.weight : 0.018));     // heavier than Flat-Pack: 5 px, not 4
      g.add(hull);
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, o.edgeAngle != null ? o.edgeAngle : 26),
        new THREE.LineBasicMaterial({ color: INK, toneMapped: false })));
    }
    g.userData.pp = { mesh: mesh, material: mat };
    return g;
  }
  function fill(group, name) {
    var d = group && group.userData && group.userData.pp;
    if (d) d.material.color.setHex(typeof name === 'string' ? (FILL[name] != null ? FILL[name] : FILL.paper) : name);
    return group;
  }

  /* ---------------------------------------------------------------- the shapes. Everything here is ROUNDED: this look
     has no sharp 3D corner except the one sharp corner on a card, which is HTML. */
  function roundedShape(THREE, w, h, r) {
    var s = new THREE.Shape();
    r = Math.max(0.001, Math.min(r, w / 2 - 0.001, h / 2 - 0.001));
    var x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  /* a standing slab, facing the camera: the poster's own unit */
  function slab(THREE, w, h, d, o) {
    o = o || {};
    var geo = new THREE.ExtrudeGeometry(roundedShape(THREE, w, h, o.r != null ? o.r : 0.22),
      { depth: d, bevelEnabled: false, curveSegments: 10 });
    geo.translate(0, 0, -d / 2);
    return part(THREE, geo, o);
  }
  /* a chunky block standing on the ground: footprint w x d, height h, origin at its base */
  function block(THREE, w, d, h, o) {
    o = o || {};
    var geo = new THREE.ExtrudeGeometry(roundedShape(THREE, w, d, o.r != null ? o.r : 0.2),
      { depth: h, bevelEnabled: false, curveSegments: 10 });
    geo.rotateX(-Math.PI / 2);                 // extrude along +Y, base at y = 0
    return part(THREE, geo, o);
  }
  function coin(THREE, r, h, o) { return part(THREE, new THREE.CylinderGeometry(r, r, h, (o && o.segs) || 40), o); }
  function pill(THREE, r, len, o) { return part(THREE, new THREE.CapsuleGeometry(r, Math.max(0.01, len), 8, (o && o.segs) || 24), o); }
  function ball(THREE, r, o) { return part(THREE, new THREE.SphereGeometry(r, (o && o.segs) || 32, (o && o.segs2) || 24), o); }
  /* the sparkle: Gumroad's own punctuation. Use it once per deck, on the thing that matters. */
  function star(THREE, points, rOuter, rInner, depth, o) {
    var s = new THREE.Shape(), n = points || 5;
    for (var i = 0; i < n * 2; i++) {
      var a = Math.PI / 2 + i * Math.PI / n, R = i % 2 ? rInner : rOuter;
      var x = Math.cos(a) * R, y = Math.sin(a) * R;
      if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
    }
    s.closePath();
    var geo = new THREE.ExtrudeGeometry(s, { depth: depth || 0.3, bevelEnabled: false, curveSegments: 4 });
    geo.translate(0, 0, -(depth || 0.3) / 2);
    return part(THREE, geo, o);
  }
  /* the only way this look says "move this": a fat shaft and a fat head, both outlined */
  function arrow(THREE, from, to, o) {
    o = o || {};
    var a = new THREE.Vector3(from[0], from[1], from[2] || 0), b = new THREE.Vector3(to[0], to[1], to[2] || 0);
    var dir = b.clone().sub(a), len = dir.length() || 1e-6; dir.normalize();
    var head = o.head != null ? o.head : Math.min(0.5, len * 0.34), r = o.r != null ? o.r : 0.1;
    var g = new THREE.Group();
    var shaft = part(THREE, new THREE.CylinderGeometry(r, r, Math.max(0.001, len - head), 16), { fill: o.fill || 'ink', weight: 0.02 });
    shaft.position.copy(a).addScaledVector(dir, (len - head) / 2);
    var tip = part(THREE, new THREE.ConeGeometry(head * 0.55, head, 18), { fill: o.fill || 'ink', weight: 0.02 });
    tip.position.copy(b).addScaledVector(dir, -head / 2);
    var q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    shaft.quaternion.copy(q); tip.quaternion.copy(q);
    g.add(shaft, tip);
    return g;
  }
  /* a guide line. Pink Punch draws few of these - it prefers an arrow - but a dashed one marks "where it goes". */
  function line(THREE, pts, o) {
    o = o || {};
    var v = pts.map(function (p) { return p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2] || 0); });
    var g = new THREE.BufferGeometry().setFromPoints(v);
    var m = o.dashed
      ? new THREE.LineDashedMaterial({ color: o.color != null ? o.color : INK, dashSize: o.dash != null ? o.dash : 0.2, gapSize: o.gap != null ? o.gap : 0.16, toneMapped: false })
      : new THREE.LineBasicMaterial({ color: o.color != null ? o.color : INK, toneMapped: false });
    var l = new THREE.Line(g, m);
    if (o.dashed) l.computeLineDistances();
    return l;
  }

  /* S4 in geometry: a sequence CLIMBS. Chunky rounded blocks rising left to right, a star on the top one.
     Returns { group, tops: [Vector3], blocks: [] }. */
  function climb(THREE, n, o) {
    o = o || {};
    var w = o.tread != null ? o.tread : 1.3, h = o.rise != null ? o.rise : 0.6, d = o.depth != null ? o.depth : 1.1;
    var pops = o.pops || ['peri', 'teal', 'yellow', 'pink'];
    var g = new THREE.Group(), tops = [], blocks = [];
    for (var i = 0; i < n; i++) {
      var hgt = h * (i + 1);
      var p = block(THREE, w, d, hgt, { fill: i === n - 1 ? (o.goalFill || 'pink') : pops[i % pops.length], r: 0.18 });
      p.position.set((i - (n - 1) / 2) * w * 1.04, 0, 0);
      g.add(p); blocks.push(p);
      tops.push(new THREE.Vector3((i - (n - 1) / 2) * w * 1.04, hgt, 0));
    }
    if (o.star !== false) {
      var s = star(THREE, 5, 0.42, 0.18, 0.26, { fill: 'yellow' });
      s.position.copy(tops[n - 1]).add(new THREE.Vector3(0, 0.55, 0));
      g.add(s); g.userData.star = s;
    }
    return { group: g, tops: tops, blocks: blocks };
  }
  /* S5 in geometry: two objects, whole, side by side, same camera, same scale. Never a morph, never a ghost. */
  function pair(THREE, a, b, gap) {
    gap = gap == null ? 3.4 : gap;
    var g = new THREE.Group();
    a.position.x -= gap / 2; b.position.x += gap / 2;
    g.add(a, b);
    return g;
  }

  /* ---------------------------------------------------------------- the print bed.
     An orthographic camera facing the subject nearly head on, no lights at all, and the TWO-PASS print described at
     the top of this file.

     NO POST-PROCESSING, EVER. post-policy registers pink-punch with every tier off, and the bed refuses a `post`
     option by name rather than quietly ignoring it. This is the look, not caution: bloom spreads light out of flat
     ink that emits none, depth of field blurs an outline whose whole job is to be the same 5 px everywhere, and
     ambient occlusion puts shading back into a screen print. A slide that needs a photograph needs a different look. */
  function bed(ctx, o) {
    o = o || {};
    if (o.post) throw new Error('PP3D.bed: Pink Punch has no post-processing - it is a screen print, not a photograph. Use the Bold Blue look for a photographic slide.');
    var THREE = ctx.THREE, renderer = ctx.renderer, width = ctx.width, height = ctx.height;
    var opt = Object.assign({
      target: [0, 1, 0],
      size: 4.6,                    // half-height of the view in world units
      turn: -18,                    // near-frontal: a poster faces you
      tilt: 14,
      background: null,             // null = transparent, so the slide's own paper shows through
      sway: 5,                      // degrees of turntable per loop; 0 = a perfectly still print
      shadow: 13,                   // the hard offset, in holder pixels. 0 turns the print's second pass off.
      shift: 0,                     // world units to pan the subject right in the frame (see place())
    }, o);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = false;
    renderer.setClearColor(opt.background == null ? 0x000000 : opt.background, opt.background == null ? 0 : 1);
    var scene = new THREE.Scene();
    if (opt.background != null) scene.background = new THREE.Color(opt.background);
    var blackMat = new THREE.MeshBasicMaterial({ color: INK, toneMapped: false });

    var aspect = width / height, W = width, H = height;
    var camera = new THREE.OrthographicCamera(-opt.size * aspect, opt.size * aspect, opt.size, -opt.size, -200, 400);
    var target = new THREE.Vector3(opt.target[0], opt.target[1], opt.target[2]);

    function place(turn, tilt) {
      var a = turn * Math.PI / 180, e = tilt * Math.PI / 180, R = 100;
      camera.position.set(target.x + R * Math.cos(e) * Math.sin(a), target.y + R * Math.sin(e), target.z + R * Math.cos(e) * Math.cos(a));
      /* shift: pan the camera sideways WITHOUT re-aiming it, so the subject sits off-centre in the frame.
         This is how a full-bleed title slide keeps its picture clear of its own headline. Positive = the
         subject moves right. */
      camera.lookAt(target);
      if (opt.shift) camera.translateX(-opt.shift);
    }
    place(opt.turn, opt.tilt);

    var poppers = [], labelSets = [];
    var S = {
      THREE: THREE, scene: scene, camera: camera, target: target, renderer: renderer, period: ctx.period, FILL: FILL,
      add: function () { for (var i = 0; i < arguments.length; i++) scene.add(arguments[i]); return arguments[0]; },
      place: place,
      /* the only camera motion this look allows: a small, exactly periodic turntable. A poster does not swoop. */
      turn: function (t, s) {
        s = s || {};
        var P = s.period || ctx.period || 12, w = TAU * wrap(t, P) / P;
        place((s.turn != null ? s.turn : opt.turn) + (s.sway != null ? s.sway : opt.sway) * Math.sin(w),
          (s.tilt != null ? s.tilt : opt.tilt) + (s.swayTilt != null ? s.swayTilt : 1.5) * Math.sin(2 * w));
      },
      /* the signature loop: parts POP apart with an overshoot, hold, and drop back. Exactly periodic. */
      popApart: function (parts, offset, o2) {
        o2 = o2 || {};
        var rec = { parts: parts, off: new THREE.Vector3(offset[0], offset[1], offset[2] || 0),
          spin: o2.spin != null ? o2.spin : 0,
          home: parts.map(function (p) { return p.position.clone(); }) };
        poppers.push(rec);
        return rec;
      },
      run: function (t) {
        var P = ctx.period || 12, u = wrap(t, P) / P;
        poppers.forEach(function (r) {
          var k = u < 0.32 ? easeBack(u / 0.32) : u < 0.66 ? 1 : 1 - easeBack((u - 0.66) / 0.34);
          r.parts.forEach(function (p, i) {
            p.position.copy(r.home[i]).addScaledVector(r.off, k);
            if (r.spin) p.rotation.y = TAU * r.spin * k;
          });
        });
      },
      labels: function (set) { labelSets.push(set); return set; },
      api: function (o2) {
        o2 = o2 || {};
        return Object.assign({ scene: scene, camera: camera }, o2, {
          update: function (t, dt) {
            if (o2.update) o2.update(t, dt);
            S.run(t);
            camera.updateMatrixWorld();
            labelSets.forEach(function (l) { l.time(t); l.update(); });
          },
          /* THE PRINT: pass 1 the black silhouette, offset down and right; pass 2 the colours over it. */
          render: function (t, dt) {
            renderer.setRenderTarget(null);
            var auto = renderer.autoClear;
            renderer.autoClear = false;
            renderer.clear();
            if (opt.shadow > 0) {
              // a negative view offset moves the frustum left and up, so the IMAGE moves right and down
              camera.setViewOffset(W, H, -opt.shadow, -opt.shadow, W, H);
              scene.overrideMaterial = blackMat;
              renderer.render(scene, camera);
              scene.overrideMaterial = null;
              camera.clearViewOffset();
              renderer.clearDepth();
            }
            renderer.render(scene, camera);
            renderer.autoClear = auto;
            if (o2.render) o2.render(t, dt);
          },
          resize: function (w, h) {
            var a = w / h;
            W = w; H = h;
            camera.left = -opt.size * a; camera.right = opt.size * a; camera.top = opt.size; camera.bottom = -opt.size;
            camera.clearViewOffset();
            camera.updateProjectionMatrix();
            labelSets.forEach(function (l) { l.update(); });
            if (o2.resize) o2.resize(w, h);
          },
          dispose: function () { try { blackMat.dispose(); if (o2.dispose) o2.dispose(); } catch (e) { /* ignore */ } },
        });
      },
    };
    return S;
  }

  /* ---------------------------------------------------------------- numbered pins and callout pills.
     Same contract as the other looks: every element inside the holder with data-follow="name" is moved each frame, so
     it is recorded into the loop video with the picture. Here they are .pp-pin discs, .pp-tag cards and .pp-pill tags. */
  function pins(S, holder, anchors) {
    var THREE = S.THREE, v = new THREE.Vector3();
    var els = Array.prototype.slice.call(holder.querySelectorAll('[data-follow]'));
    els.forEach(function (el) { el.style.left = '0px'; el.style.top = '0px'; });
    var time = 0;
    var set = {
      time: function (t) { time = t; },
      update: function () {
        var w = holder.offsetWidth, h = holder.offsetHeight, slide = holder.closest('.slide');
        var ox = 0, oy = 0;
        if (slide) { for (var e = holder; e && e !== slide && slide.contains(e); e = e.offsetParent) { ox += e.offsetLeft; oy += e.offsetTop; } }
        els.forEach(function (el) {
          var a = anchors[el.dataset.follow]; if (!a) return;
          if (Array.isArray(a)) v.set(a[0], a[1], a[2] || 0);
          else if (typeof a === 'function') { var p = a(time); v.set(p[0], p[1], p[2] || 0); }
          else if (a.isObject3D) a.getWorldPosition(v);
          v.project(S.camera);
          var hidden = v.z > 1 || v.z < -1;
          var align = el.dataset.align || 'left', dx = parseFloat(el.dataset.dx || '26'), dy = parseFloat(el.dataset.dy || '0');
          var ew = el.offsetWidth, eh = el.offsetHeight;
          var x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
          x = align === 'right' ? x - dx - ew : align === 'center' ? x - ew / 2 : x + dx;
          y = y + dy - eh / 2;
          x = Math.max(Math.max(0, 96 - ox), Math.min(x, Math.min(w, 1824 - ox) - ew));
          y = Math.max(Math.max(0, 96 - oy), Math.min(y, Math.min(h, 984 - oy) - eh));
          el.style.transform = 'translate(' + x.toFixed(1) + 'px, ' + y.toFixed(1) + 'px)';
          el.style.setProperty('visibility', hidden ? 'hidden' : '', hidden ? 'important' : '');
        });
      },
    };
    return S.labels(set);
  }

  window.PP3D = {
    version: '1.0', FILL: FILL, INK: INK,
    wrap: wrap, phase: phase, easeStep: easeStep, easeBack: easeBack, beats: beats, steps: beats,
    bed: bed, part: part, fill: fill, line: line, arrow: arrow, climb: climb, pair: pair, pins: pins,
    roundedShape: roundedShape, slab: slab, block: block, coin: coin, pill: pill, ball: ball, star: star,
  };
})();
