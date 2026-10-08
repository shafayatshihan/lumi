/* Flat-Pack 3D: the assembly-manual drawing engine (classic script, no imports; uses the THREE that Aura.scene passes in).
   Subject-free.

   WHY THIS EXISTS AND WHY IT IS NOT BOLD BLUE'S STUDIO
   An IKEA-style assembly manual is not a photograph and it is not a cartoon: it is a 3D model drawn in ORTHOGRAPHIC
   projection with flat fills and a constant-weight outline. So Flat-Pack's figures really are 3D geometry - but they
   are DRAWN, not LIT. That is why this look's 3D engine is live three.js and never Blender: Cycles path tracing
   (lumi_bpy: AgX, soft shadows, PBR) produces exactly the wrong picture for this look, at a hundred times the cost.
   The policy is written down in form_server.LOOK_3D['flat-pack'] = 'threejs', so a Flat-Pack 3D slide always resolves
   to an engine instead of silently getting none.

   The rules: an orthographic camera, NO lights, MeshBasicMaterial flat fills from a four-colour palette, every solid
   wrapped in its own ink outline, dashed guides and arrows for "this goes there", numbered pins for the callouts.

     Aura.scene('s3-scene', (ctx) => {
       const S = FP3D.sheet(ctx, { target: [0, 1, 0], size: 6 });          // axonometric by default
       const leg = S.add(FP3D.part(ctx.THREE, new ctx.THREE.BoxGeometry(.4, 3, .4), { fill: 'paper' }));
       const top = S.add(FP3D.part(ctx.THREE, new ctx.THREE.BoxGeometry(4, .3, 2.4), { fill: 'blue' }));
       S.exploded([top], [0, 1.6, 0]);                                     // the manual's exploded view
       S.add(FP3D.arrow(ctx.THREE, [0, 3.2, 0], [0, 1.9, 0]));
       FP3D.pins(S, ctx.el, { seat: top, leg: [1.6, 0, 1] });
       return S.api({ update(t) { S.turn(t); } });
     }, { period: 12 });

   Everything is a pure function of t, so seek(t) in the capture contract and the recorded loop agree. */
(function () {
  'use strict';
  if (window.FP3D) return;
  var TAU = Math.PI * 2;

  /* ---------------------------------------------------------------- the four fills, and nothing else.
     Depth comes from the outline and the axonometry, so a part is one of these flat colours or it is wrong. */
  var FILL = { paper: 0xFFFFFF, grey: 0xF0F0F0, blue: 0x0058A3, yellow: 0xFFDB00, ink: 0x111111 };
  var INK = 0x111111;

  /* ---------------------------------------------------------------- loop maths (closed form, so every loop is seamless).
     The same shape as Bold Blue's BBTime, kept local so a Flat-Pack deck loads no Bold Blue file. If a third look needs
     it, lift this block and BBTime into engine/deck/lib/ and have both looks load it. */
  function wrap(t, P) { P = P || 1; return ((t % P) + P) % P; }
  function phase(t, P) { return TAU * wrap(t, P) / (P || 1); }
  function easeStep(x) { return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); }     // smoothstep: a part slides and stops
  /* n states per loop, each held then moved: returns { i, next, k } with k in [0,1] across the move.
     This is the manual's own rhythm - a step is still, then one thing moves, then it is still again. */
  function steps(t, P, n, move) {
    move = move == null ? 0.28 : move;
    var u = wrap(t, P) / P * n, i = Math.floor(u), f = u - i;
    var k = f < 1 - move ? 0 : easeStep((f - (1 - move)) / move);
    return { i: i % n, next: (i + 1) % n, k: k };
  }

  /* ---------------------------------------------------------------- a part: a flat fill plus its own ink outline.
     outline widths above 1 are not supported by WebGL line width, so the outline is drawn as a slightly inflated
     back-face shell (the classic inverted-hull trick) PLUS the geometry's hard edges. Together they read as one even
     4 px pen line at 1920 x 1080. */
  function part(THREE, geometry, o) {
    o = o || {};
    var fill = typeof o.fill === 'string' ? (FILL[o.fill] != null ? FILL[o.fill] : FILL.paper) : (o.fill != null ? o.fill : FILL.paper);
    var g = new THREE.Group();
    var mat = new THREE.MeshBasicMaterial({ color: fill, toneMapped: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    var mesh = new THREE.Mesh(geometry, mat);
    g.add(mesh);
    if (o.outline !== false) {
      var hull = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: o.ink != null ? o.ink : INK, side: THREE.BackSide, toneMapped: false }));
      hull.scale.setScalar(1 + (o.weight != null ? o.weight : 0.012));
      hull.userData.hull = true;
      g.add(hull);
      var edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, o.edgeAngle != null ? o.edgeAngle : 24),
        new THREE.LineBasicMaterial({ color: o.ink != null ? o.ink : INK, toneMapped: false }));
      g.add(edges);
    }
    g.userData.fp = { mesh: mesh, material: mat };
    return g;
  }
  function fill(group, name) {                      // recolour a part: FP3D.fill(leg, 'blue')
    var d = group && group.userData && group.userData.fp;
    if (d) d.material.color.setHex(typeof name === 'string' ? (FILL[name] != null ? FILL[name] : FILL.paper) : name);
    return group;
  }

  /* a line in the drawing: solid for a real edge, dashed for a guide ("this slides in here") */
  function line(THREE, pts, o) {
    o = o || {};
    var v = pts.map(function (p) { return p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2] || 0); });
    var g = new THREE.BufferGeometry().setFromPoints(v);
    var m = o.dashed
      ? new THREE.LineDashedMaterial({ color: o.color != null ? o.color : INK, dashSize: o.dash != null ? o.dash : 0.18, gapSize: o.gap != null ? o.gap : 0.14, toneMapped: false })
      : new THREE.LineBasicMaterial({ color: o.color != null ? o.color : INK, toneMapped: false });
    var l = new THREE.Line(g, m);
    if (o.dashed) l.computeLineDistances();
    return l;
  }
  /* an assembly arrow: a shaft plus a solid cone head, both ink. The manual's only way of saying "move this". */
  function arrow(THREE, from, to, o) {
    o = o || {};
    var a = new THREE.Vector3(from[0], from[1], from[2] || 0), b = new THREE.Vector3(to[0], to[1], to[2] || 0);
    var dir = b.clone().sub(a), len = dir.length() || 1e-6; dir.normalize();
    var head = o.head != null ? o.head : Math.min(0.34, len * 0.3), r = o.r != null ? o.r : 0.045;
    var g = new THREE.Group();
    var shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(0.001, len - head), 10),
      new THREE.MeshBasicMaterial({ color: o.color != null ? o.color : INK, toneMapped: false }));
    shaft.position.copy(a).addScaledVector(dir, (len - head) / 2);
    var tip = new THREE.Mesh(new THREE.ConeGeometry(head * 0.45, head, 14),
      new THREE.MeshBasicMaterial({ color: o.color != null ? o.color : INK, toneMapped: false }));
    tip.position.copy(b).addScaledVector(dir, -head / 2);
    var q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    shaft.quaternion.copy(q); tip.quaternion.copy(q);
    g.add(shaft, tip);
    return g;
  }

  /* S4 in geometry: a sequence is a path that CLIMBS. n treads rising left to right, with the goal marked on top.
     Returns { group, tops: [Vector3] } so a label or a part can sit on each tread. */
  function climb(THREE, n, o) {
    o = o || {};
    var w = o.tread != null ? o.tread : 1.2, h = o.rise != null ? o.rise : 0.55, d = o.depth != null ? o.depth : 1.0;
    var g = new THREE.Group(), tops = [];
    for (var i = 0; i < n; i++) {
      var hgt = h * (i + 1);
      var p = part(THREE, new THREE.BoxGeometry(w, hgt, d), { fill: i === n - 1 ? (o.goalFill || 'blue') : (o.fill || 'paper') });
      p.position.set((i - (n - 1) / 2) * w, hgt / 2, 0);
      g.add(p);
      tops.push(new THREE.Vector3((i - (n - 1) / 2) * w, hgt, 0));
    }
    return { group: g, tops: tops };
  }
  /* S5 in geometry: two objects, whole, side by side, same camera, same scale. Never a morph and never a ghost. */
  function pair(THREE, a, b, gap) {
    gap = gap == null ? 3.2 : gap;
    var g = new THREE.Group();
    a.position.x -= gap / 2; b.position.x += gap / 2;
    g.add(a, b);
    return g;
  }

  /* ---------------------------------------------------------------- the sheet: an orthographic camera over white paper.
     No lights exist in this scene at all - MeshBasicMaterial needs none, and that is the point.

     NO POST-PROCESSING, EVER. engine/deck/lib/post-policy.js registers flat-pack with every tier off, and a sheet
     refuses a `post` option by name rather than quietly ignoring it. This is the look, not caution: an assembly manual
     is DRAWN, so its picture is a flat fill inside a constant-weight ink outline. Bloom spreads light out of shapes
     that emit none; depth of field blurs a line whose whole job is to be the same 4 px everywhere; ambient occlusion
     puts back the shading gradient the look deliberately removed. Each one makes the drawing read as a bad photograph
     OF a drawing. A Flat-Pack slide that needs photographic impact needs a different look, not a different filter. */
  function sheet(ctx, o) {
    o = o || {};
    if (o.post) throw new Error('FP3D.sheet: Flat-Pack has no post-processing - it is a drawing, not a photograph. Use the Bold Blue look for a photographic slide.');
    var THREE = ctx.THREE, renderer = ctx.renderer, width = ctx.width, height = ctx.height;
    var opt = Object.assign({
      target: [0, 1, 0],
      size: 6,                      // half-height of the view in world units (the orthographic "distance")
      turn: -35,                    // axonometric: 35 deg round, 30 deg down - the manual's standard view
      tilt: 30,
      background: null,             // null = transparent, so the slide's own paper shows through
      sway: 4,                      // degrees of turntable per loop; 0 = a perfectly still drawing
    }, o);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = false;
    renderer.setClearColor(opt.background == null ? 0x000000 : opt.background, opt.background == null ? 0 : 1);
    var scene = new THREE.Scene();
    if (opt.background != null) scene.background = new THREE.Color(opt.background);

    var aspect = width / height;
    var camera = new THREE.OrthographicCamera(-opt.size * aspect, opt.size * aspect, opt.size, -opt.size, -200, 400);
    var target = new THREE.Vector3(opt.target[0], opt.target[1], opt.target[2]);

    function place(turn, tilt) {
      var a = turn * Math.PI / 180, e = tilt * Math.PI / 180, R = 100;
      camera.position.set(target.x + R * Math.cos(e) * Math.sin(a), target.y + R * Math.sin(e), target.z + R * Math.cos(e) * Math.cos(a));
      camera.lookAt(target);
    }
    place(opt.turn, opt.tilt);

    var exploders = [];
    var S = {
      THREE: THREE, scene: scene, camera: camera, target: target, renderer: renderer, period: ctx.period, FILL: FILL,
      add: function () { for (var i = 0; i < arguments.length; i++) scene.add(arguments[i]); return arguments[0]; },
      place: place,
      /* the only camera motion this look allows: a small, exactly periodic turntable. A manual page does not swoop. */
      turn: function (t, s) {
        s = s || {};
        var P = s.period || ctx.period || 12, w = TAU * wrap(t, P) / P;
        place((s.turn != null ? s.turn : opt.turn) + (s.sway != null ? s.sway : opt.sway) * Math.sin(w),
          (s.tilt != null ? s.tilt : opt.tilt) + (s.swayTilt != null ? s.swayTilt : 1.2) * Math.sin(2 * w));
      },
      /* the exploded view: parts lift off along their own axis and settle back, once per loop. */
      exploded: function (parts, offset, o2) {
        o2 = o2 || {};
        var rec = { parts: parts, off: new THREE.Vector3(offset[0], offset[1], offset[2] || 0), hold: o2.hold != null ? o2.hold : 0.4,
          home: parts.map(function (p) { return p.position.clone(); }) };
        exploders.push(rec);
        return rec;
      },
      assemble: function (t) {
        var P = ctx.period || 12, u = wrap(t, P) / P;
        exploders.forEach(function (r) {
          // out over the first 35 %, held apart, in over the last 35 %: periodic, and still at both ends
          var k = u < 0.35 ? easeStep(u / 0.35) : u < 0.65 ? 1 : 1 - easeStep((u - 0.65) / 0.35);
          r.parts.forEach(function (p, i) { p.position.copy(r.home[i]).addScaledVector(r.off, k); });
        });
      },
      labels: function (set) { labelSets.push(set); return set; },
      api: function (o2) {
        o2 = o2 || {};
        return Object.assign({ scene: scene, camera: camera }, o2, {
          update: function (t, dt) {
            if (o2.update) o2.update(t, dt);
            S.assemble(t);
            camera.updateMatrixWorld();
            labelSets.forEach(function (l) { l.time(t); l.update(); });
          },
          render: function (t, dt) {
            renderer.setRenderTarget(null); renderer.render(scene, camera);
            if (o2.render) o2.render(t, dt);
          },
          resize: function (w, h) {
            var a = w / h;
            camera.left = -opt.size * a; camera.right = opt.size * a; camera.top = opt.size; camera.bottom = -opt.size;
            camera.updateProjectionMatrix();
            labelSets.forEach(function (l) { l.update(); });
            if (o2.resize) o2.resize(w, h);
          },
          dispose: function () { try { if (o2.dispose) o2.dispose(); } catch (e) { /* ignore */ } },
        });
      },
    };
    var labelSets = [];
    return S;
  }

  /* ---------------------------------------------------------------- numbered pins and callout boxes.
     Same contract as Bold Blue's labels: every element inside the holder with data-follow="name" is moved each frame,
     so it is recorded into the loop video with the picture. Here the elements are .fp-pin discs and .fp-tag boxes. */
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
          var align = el.dataset.align || 'left', dx = parseFloat(el.dataset.dx || '24'), dy = parseFloat(el.dataset.dy || '0');
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

  /* ---------------------------------------------------------------- a few shapes a manual keeps needing */
  function panel(THREE, w, h, d, o) { return part(THREE, new THREE.BoxGeometry(w, h, d), o); }
  function rod(THREE, r, len, o) { return part(THREE, new THREE.CylinderGeometry(r, r, len, (o && o.segs) || 20), o); }
  function disc(THREE, r, h, o) { return part(THREE, new THREE.CylinderGeometry(r, r, h, (o && o.segs) || 28), o); }
  function dowel(THREE, r, len, o) {                       // the manual's own fastener: a rod with a chamfered end
    return part(THREE, new THREE.CylinderGeometry(r, r * 0.8, len, 14), o);
  }

  window.FP3D = {
    version: '1.0', FILL: FILL, INK: INK,
    wrap: wrap, phase: phase, easeStep: easeStep, steps: steps,
    sheet: sheet, part: part, fill: fill, line: line, arrow: arrow, climb: climb, pair: pair, pins: pins,
    panel: panel, rod: rod, disc: disc, dowel: dowel,
  };
})();
