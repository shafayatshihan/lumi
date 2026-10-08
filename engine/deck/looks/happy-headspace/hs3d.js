/* Happy Headspace 3D: the quiet room (classic script, no imports; uses the THREE that Aura.scene passes in).
   Subject-free.

   WHY THIS EXISTS, AND WHY IT IS NEITHER FLAT-PACK'S SHEET NOR PINK PUNCH'S PRINT
   Headspace's pictures are soft round volumes with no outline at all: a shape is defined by its own colour against a
   white page, and by the gentlest possible fall of light across it. That is a LIT picture - the only one of the three
   looks built here that has lights in the scene - but it is lit for FORM, never for drama:

     - one warm key and a wide hemisphere fill, so the darkest point on any form stays bright;
     - matte Lambert surfaces: no specular highlight, no reflection, no metal, no glass;
     - NO cast shadow and no shadow map. Grounding is a soft tinted contact disc under the form, nothing more;
     - every edge is rounded. There is no hard edge anywhere in this look, so there is no hard terminator either.

   The camera is a gentle PERSPECTIVE camera, because a soft volume needs a little depth to read as a volume, and it
   moves on a slow breath rather than a turntable.

   NO FACES AND NO CHARACTERS. Headspace's own illustration is full of them; Lumi decks are often shown in formal
   settings, so this look takes the brand's shapes and leaves its cast behind. That rule is in the brand DNA file and
   it is not negotiable.

   3D ENGINE POLICY: Happy Headspace is 'threejs' and never Blender, and that is deliberate. Cycles path tracing
   (lumi_bpy: AgX, soft shadows, PBR) spends its whole budget on exactly the things this look removes - contact
   shadows, specular response, material realism. A Cycles render here would be a more expensive picture that is
   further from the brand. The policy is written down as form_server.LOOK_3D['happy-headspace'] = 'threejs', so a 3D
   slide here always resolves to an engine. Do not write a scene.py for a Happy Headspace deck.

     Aura.scene('s3-scene', (ctx) => {
       const S = HS3D.room(ctx, { target: [0, 1, 0], distance: 9 });
       const body = S.add(HS3D.blob(ctx.THREE, 1.2, { fill: 'orange', squash: .86 }));  body.position.y = 1.2;
       S.ground(1.6);
       S.sway([body], [0, .16, 0]);
       HS3D.pins(S, ctx.el, { body: body });
       return S.api({ update(t) { S.breathe(t); } });
     }, { period: 20 });

   Everything is a pure function of t, so seek(t) in the capture contract and the recorded loop agree. */
(function () {
  'use strict';
  if (window.HS3D) return;
  var TAU = Math.PI * 2;

  /* ---------------------------------------------------------------- the palette. Orange is always dominant. */
  var FILL = { orange: 0xFF7300, gold: 0xFFCE00, amber: 0xFFA500, purple: 0x3B197F, navy: 0x27455C,
               candy: 0xFFA1CC, warm: 0xF9F4F2, white: 0xFFFFFF, ink: 0x2D2C2B };
  var INK = 0x2D2C2B;

  /* ---------------------------------------------------------------- loop maths (closed form, so every loop is seamless) */
  function wrap(t, P) { P = P || 1; return ((t % P) + P) % P; }
  function phase(t, P) { return TAU * wrap(t, P) / (P || 1); }
  function easeStep(x) { return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); }
  /* this look's easing: smoothstep applied twice - slower to start and slower to settle than smoothstep alone, and
     with no overshoot anywhere. easeSoft(0) === 0, easeSoft(1) === 1. */
  function easeSoft(x) { var s = easeStep(x); return s * s * (3 - 2 * s); }
  /* the breath: 0 at t = 0, 1 at the half period, 0 again at the end. Smooth at both ends, so a loop never jumps. */
  function breath(t, P) { return 0.5 - 0.5 * Math.cos(phase(t, P)); }
  /* n states per loop, each held then eased into the next: { i, next, k }. Nothing snaps here. */
  function steps(t, P, n, move) {
    move = move == null ? 0.42 : move;                  // a longer move than the other looks: this one does not hurry
    var u = wrap(t, P) / P * n, i = Math.floor(u), f = u - i;
    var k = f < 1 - move ? 0 : easeSoft((f - (1 - move)) / move);
    return { i: i % n, next: (i + 1) % n, k: k };
  }

  /* ---------------------------------------------------------------- a form: a matte fill and NO outline.
     MeshLambertMaterial has no specular term at all, which is exactly right: this look's light describes the form and
     then stops. flatShading stays off - every surface is smooth. */
  function form(THREE, geometry, o) {
    o = o || {};
    var hex = typeof o.fill === 'string' ? (FILL[o.fill] != null ? FILL[o.fill] : FILL.warm) : (o.fill != null ? o.fill : FILL.warm);
    var g = new THREE.Group();
    var mat = new THREE.MeshLambertMaterial({ color: hex, transparent: o.opacity != null, opacity: o.opacity != null ? o.opacity : 1 });
    var mesh = new THREE.Mesh(geometry, mat);
    g.add(mesh);
    g.userData.hs = { mesh: mesh, material: mat };
    return g;
  }
  function fill(group, name) {
    var d = group && group.userData && group.userData.hs;
    if (d) d.material.color.setHex(typeof name === 'string' ? (FILL[name] != null ? FILL[name] : FILL.warm) : name);
    return group;
  }

  /* ---------------------------------------------------------------- the shapes. Everything is round or rounded. */
  function blob(THREE, r, o) {
    o = o || {};
    var g = form(THREE, new THREE.SphereGeometry(r, o.segs || 48, o.segs2 || 36), o);
    g.userData.hs.mesh.scale.set(o.wide != null ? o.wide : 1, o.squash != null ? o.squash : 1, o.deep != null ? o.deep : 1);
    return g;
  }
  function pill(THREE, r, len, o) { return form(THREE, new THREE.CapsuleGeometry(r, Math.max(0.01, len), 10, (o && o.segs) || 32), o); }
  function ring(THREE, R, r, o) { return form(THREE, new THREE.TorusGeometry(R, r, (o && o.segs2) || 20, (o && o.segs) || 64), o); }
  /* an arc: part of a ring. `sweep` is a fraction of a full turn (0.5 = a half arc). */
  function arc(THREE, R, r, sweep, o) {
    return form(THREE, new THREE.TorusGeometry(R, r, (o && o.segs2) || 20, (o && o.segs) || 64, TAU * (sweep == null ? 0.5 : sweep)), o);
  }
  function rod(THREE, r, len, o) { return form(THREE, new THREE.CylinderGeometry(r, r, len, (o && o.segs) || 40), o); }
  /* a mound: the look's own ground form - half a squashed sphere sitting on y = 0 */
  function mound(THREE, r, h, o) {
    o = o || {};
    var g = form(THREE, new THREE.SphereGeometry(r, o.segs || 48, o.segs2 || 24, 0, TAU, 0, Math.PI / 2), o);
    g.userData.hs.mesh.scale.set(1, Math.max(0.05, h) / r, 1);
    return g;
  }
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
  /* a soft slab: a rounded rectangle extruded with a real bevel, so even its edges are round */
  function slab(THREE, w, h, d, o) {
    o = o || {};
    var bev = Math.min(o.bevel != null ? o.bevel : 0.12, d / 2 - 0.001);
    var geo = new THREE.ExtrudeGeometry(roundedShape(THREE, w, h, o.r != null ? o.r : Math.min(w, h) * 0.3),
      { depth: Math.max(0.01, d - bev * 2), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 5, curveSegments: 14 });
    geo.center();
    return form(THREE, geo, o);
  }
  /* the same slab standing on the ground: footprint w x d, height h, base at y = 0 */
  function block(THREE, w, d, h, o) {
    o = o || {};
    var bev = Math.min(o.bevel != null ? o.bevel : 0.14, h / 2 - 0.001);
    var geo = new THREE.ExtrudeGeometry(roundedShape(THREE, w, d, o.r != null ? o.r : Math.min(w, d) * 0.32),
      { depth: Math.max(0.01, h - bev * 2), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 5, curveSegments: 14 });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, bev, 0);
    return form(THREE, geo, o);
  }

  /* S4 in geometry: a sequence CLIMBS - soft rounded blocks rising left to right, a warm sphere resting on the top.
     Returns { group, tops: [Vector3], blocks: [] }. */
  function climb(THREE, n, o) {
    o = o || {};
    var w = o.tread != null ? o.tread : 1.25, h = o.rise != null ? o.rise : 0.6, d = o.depth != null ? o.depth : 1.1;
    var cols = o.fills || ['warm', 'candy', 'amber', 'orange'];
    var g = new THREE.Group(), tops = [], blocks = [];
    for (var i = 0; i < n; i++) {
      var hgt = h * (i + 1);
      var p = block(THREE, w, d, hgt, { fill: i === n - 1 ? (o.goalFill || 'orange') : cols[i % cols.length] });
      p.position.set((i - (n - 1) / 2) * w * 1.08, 0, 0);
      g.add(p); blocks.push(p);
      tops.push(new THREE.Vector3((i - (n - 1) / 2) * w * 1.08, hgt, 0));
    }
    return { group: g, tops: tops, blocks: blocks };
  }
  /* S5 in geometry: two forms, whole, side by side, same camera, same scale. Never a morph, never a ghost. */
  function pair(THREE, a, b, gap) {
    gap = gap == null ? 3.4 : gap;
    var g = new THREE.Group();
    a.position.x -= gap / 2; b.position.x += gap / 2;
    g.add(a, b);
    return g;
  }

  /* ---------------------------------------------------------------- the quiet room.
     A perspective camera, a hemisphere fill, one warm key, and no shadow map at all.

     NO POST-PROCESSING, EVER. post-policy registers happy-headspace with every tier off, and the room refuses a
     `post` option by name rather than quietly ignoring it. This is the look, not caution: bloom would put a halo on a
     brand that has no highlights, depth of field would blur forms whose softness is already their whole character,
     and ambient occlusion would darken exactly the crevices this light is set up to keep open. A slide that needs
     drama needs a different look. */
  function room(ctx, o) {
    o = o || {};
    if (o.post) throw new Error('HS3D.room: Happy Headspace has no post-processing - its calm is the design. Use the Bold Blue look for a cinematic slide.');
    var THREE = ctx.THREE, renderer = ctx.renderer, width = ctx.width, height = ctx.height;
    var opt = Object.assign({
      target: [0, 1, 0],
      distance: 10,                 // how far back the camera sits; with fov this sets the apparent scale
      fov: 26,                      // gentle: enough depth to read a volume, not enough to distort it
      turn: -22,                    // degrees round
      tilt: 16,                     // degrees down
      background: null,             // null = transparent, so the slide's own white page shows through
      sway: 4,                      // degrees of turn across one breath; 0 = perfectly still
      dolly: 0.02,                  // how much the camera breathes in and out, as a fraction of the distance
      key: 1.15,                    // the one warm light
      ambient: 2.3,                 // the wide hemisphere fill that keeps the dark side bright
      shift: 0,                     // world units to pan the subject right in the frame (see place())
    }, o);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = false;             // there are no cast shadows in this look. Grounding is S.ground().
    renderer.setClearColor(opt.background == null ? 0xFFFFFF : opt.background, opt.background == null ? 0 : 1);
    var scene = new THREE.Scene();
    if (opt.background != null) scene.background = new THREE.Color(opt.background);

    // the light. Wide and warm, and set so the darkest point on a form still reads as the same colour.
    var hemi = new THREE.HemisphereLight(0xFFFFFF, 0xF4E7DE, opt.ambient);
    scene.add(hemi);
    var key = new THREE.DirectionalLight(0xFFF2E4, opt.key);
    key.position.set(-3.2, 6.0, 5.2);
    scene.add(key);

    var camera = new THREE.PerspectiveCamera(opt.fov, width / height, 0.1, 400);
    var target = new THREE.Vector3(opt.target[0], opt.target[1], opt.target[2]);

    function place(turn, tilt, dist) {
      var a = turn * Math.PI / 180, e = tilt * Math.PI / 180, R = dist;
      camera.position.set(target.x + R * Math.cos(e) * Math.sin(a), target.y + R * Math.sin(e), target.z + R * Math.cos(e) * Math.cos(a));
      /* shift: pan the camera sideways WITHOUT re-aiming it, so the subject sits off-centre in the frame.
         This is how a full-bleed title slide keeps its picture clear of its own headline. Positive = the
         subject moves right. */
      camera.lookAt(target);
      if (opt.shift) camera.translateX(-opt.shift);
    }
    place(opt.turn, opt.tilt, opt.distance);

    var swayers = [], labelSets = [], discs = [];
    var S = {
      THREE: THREE, scene: scene, camera: camera, target: target, renderer: renderer, period: ctx.period, FILL: FILL,
      key: key, hemi: hemi,
      add: function () { for (var i = 0; i < arguments.length; i++) scene.add(arguments[i]); return arguments[0]; },
      place: place,
      /* the only camera motion this look allows: one slow breath per loop. Never a turntable, never a swoop. */
      breathe: function (t, s) {
        s = s || {};
        var P = s.period || ctx.period || 20, w = TAU * wrap(t, P) / P;
        var d = (s.distance != null ? s.distance : opt.distance) * (1 - (s.dolly != null ? s.dolly : opt.dolly) * Math.sin(w));
        place((s.turn != null ? s.turn : opt.turn) + (s.sway != null ? s.sway : opt.sway) * Math.sin(w),
          (s.tilt != null ? s.tilt : opt.tilt) + (s.swayTilt != null ? s.swayTilt : 1.0) * Math.sin(2 * w), d);
      },
      /* grounding, this look's way: a soft tinted disc on the floor. No shadow map, no hard edge, no dark pool. */
      ground: function (r, o2) {
        o2 = o2 || {};
        var size = 128, cv = document.createElement('canvas'); cv.width = cv.height = size;
        var g2 = cv.getContext('2d');
        var grad = g2.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        var a = o2.strength != null ? o2.strength : 0.16;
        grad.addColorStop(0, 'rgba(45, 44, 43, ' + a + ')');
        grad.addColorStop(0.55, 'rgba(45, 44, 43, ' + (a * 0.42).toFixed(3) + ')');
        grad.addColorStop(1, 'rgba(45, 44, 43, 0)');
        g2.fillStyle = grad; g2.fillRect(0, 0, size, size);
        var tex = new THREE.CanvasTexture(cv);
        if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
        var m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.6, r * 2.6),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
        m.rotation.x = -Math.PI / 2;
        m.position.set(o2.x || 0, o2.y != null ? o2.y : 0.004, o2.z || 0);
        m.renderOrder = -1;
        scene.add(m); discs.push({ mesh: m, tex: tex });
        return m;
      },
      /* the signature loop: forms rise and settle on one slow breath. Exactly periodic, and still at both ends. */
      sway: function (parts, offset, o2) {
        o2 = o2 || {};
        var rec = { parts: parts, off: new THREE.Vector3(offset[0], offset[1], offset[2] || 0),
          spin: o2.spin != null ? o2.spin : 0, lag: o2.lag != null ? o2.lag : 0,
          home: parts.map(function (p) { return p.position.clone(); }) };
        swayers.push(rec);
        return rec;
      },
      run: function (t) {
        var P = ctx.period || 20;
        swayers.forEach(function (r) {
          var k = breath(t - r.lag, P);
          r.parts.forEach(function (p, i) {
            p.position.copy(r.home[i]).addScaledVector(r.off, k);
            if (r.spin) p.rotation.y = TAU * r.spin * wrap(t, P) / P;    // whole turns only, so t = P matches t = 0
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
          render: function (t, dt) {
            renderer.setRenderTarget(null); renderer.render(scene, camera);
            if (o2.render) o2.render(t, dt);
          },
          resize: function (w, h) {
            camera.aspect = w / h; camera.updateProjectionMatrix();
            labelSets.forEach(function (l) { l.update(); });
            if (o2.resize) o2.resize(w, h);
          },
          dispose: function () {
            try { discs.forEach(function (d) { d.tex.dispose(); d.mesh.geometry.dispose(); d.mesh.material.dispose(); }); } catch (e) { /* ignore */ }
            try { if (o2.dispose) o2.dispose(); } catch (e) { /* ignore */ }
          },
        });
      },
    };
    return S;
  }

  /* ---------------------------------------------------------------- soft discs and round callout cards.
     Same contract as the other looks: every element inside the holder with data-follow="name" is moved each frame, so
     it is recorded into the loop video with the picture. Here they are .hs-pin discs, .hs-tag cards, .hs-pill tags. */
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
          var align = el.dataset.align || 'left', dx = parseFloat(el.dataset.dx || '28'), dy = parseFloat(el.dataset.dy || '0');
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

  window.HS3D = {
    version: '1.0', FILL: FILL, INK: INK,
    wrap: wrap, phase: phase, easeStep: easeStep, easeSoft: easeSoft, breath: breath, steps: steps,
    room: room, form: form, fill: fill, climb: climb, pair: pair, pins: pins,
    roundedShape: roundedShape, blob: blob, pill: pill, ring: ring, arc: arc, rod: rod, mound: mound,
    slab: slab, block: block,
  };
})();
