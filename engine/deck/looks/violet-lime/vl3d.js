/* Violet Lime 3D: the flat stage (classic script, no imports; uses the THREE that Aura.scene passes in).
   Subject-free. Violet Lime is a THREE.JS look (form_server.LOOK_3D['violet-lime'] = 'threejs') and it never
   renders in Blender - a Cycles still is a photoreal subject on a studio floor, and the one picture this look never
   shows is a photoreal render of something nobody photographed (LOOK.md, the 3D engine policy).

   This engine exists because a 3D slide must ALWAYS resolve to an engine, and for the rare slide whose subject has
   to turn or come apart. It is deliberately the plainest stage in the repo: flat solids in the look's two colours,
   NO floor, NO shadow catcher, NO reflections, NO post - depth comes from the ground changing colour, not from
   lifting things off it. For a still picture of a thing, LumiIllus (LOOK.md 3.3) is the better picture here.

     Aura.scene('s5-scene', (ctx) => {
       const { THREE } = ctx;
       const S = VL3D.stage(ctx, { target: [0, 0.9, 0], distance: 9 });
       const body = S.add(VL3D.block(THREE, 2.4, 1.6, 1.4, { color: 'white' }));  body.position.y = 0.8;
       const hero = S.add(VL3D.puck(THREE, 0.5, 0.3, { color: 'lime' }));         // the ONE lime part
       hero.position.set(0, 1.9, 0);
       VL3D.tags(S, ctx.el, { hero: hero });                                      // .vl-tag with data-follow
       return S.api({ update(t) { S.turn(t); } });
     }, { period: 12 });

   Everything is a pure function of t, so seek(t) in the capture contract and the recorded loop agree. */
(function () {
  'use strict';
  if (window.VL3D) return;
  var TAU = Math.PI * 2;

  /* the look's colours, and only the look's colours. EXACTLY ONE lime part per figure. */
  var COLORS = { violet: 0x3D2EE6, deep: 0x2B1FB0, lime: 0xD2F53C, white: 0xFFFFFF, ink: 0x15151A,
    muted: 0xD4D0F7, hair: 0xE4E3EF };

  /* ---------------------------------------------------------------- loop maths (closed form: every loop is seamless) */
  function wrap(t, P) { P = P || 1; return ((t % P) + P) % P; }
  function phase(t, P) { return TAU * wrap(t, P) / (P || 1); }
  function easeStep(x) { return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); }
  /* n states per loop, each held then moved: { i, next, k } with k in [0,1] across the move */
  function steps(t, P, n, move) {
    move = move == null ? 0.3 : move;
    var u = wrap(t, P) / P * n, i = Math.floor(u), f = u - i;
    var k = f < 1 - move ? 0 : easeStep((f - (1 - move)) / move);
    return { i: i % n, next: (i + 1) % n, k: k };
  }
  /* a part arriving: it slides in and settles once. Nothing bounces in this look. */
  function land(k) { var e = easeStep(k); return { y: 1 - e, s: 1 }; }

  /* ---------------------------------------------------------------- the material: flat, matte, no clearcoat, no
     sheen, no bump. Shaded only enough to read as volume. Cached per colour. */
  var mats = {};
  function flat(THREE, color, o) {
    o = o || {};
    var hex = typeof color === 'string' ? (COLORS[color] != null ? COLORS[color] : new THREE.Color(color).getHex())
      : (color != null ? color : COLORS.white);
    var key = hex + '|' + (o.rough || '');
    if (mats[key]) return mats[key];
    mats[key] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex), roughness: o.rough != null ? o.rough : 0.92, metalness: 0, flatShading: false,
    });
    return mats[key];
  }
  function mesh(THREE, geometry, o) {
    o = o || {};
    var m = new THREE.Mesh(geometry, o.material || flat(THREE, o.color || 'white', o));
    m.castShadow = m.receiveShadow = false;        // no shadows: the look is flat
    return m;
  }

  /* ---------------------------------------------------------------- rounded solids. Everything in this look has a
     radius, in 2D and in 3D alike. A rounded box: a subdivided box pushed onto the rounded shape, with the rounded
     shape's normal written directly, so it shades smooth with no faceting. */
  function block(THREE, w, h, d, o) {
    o = o || {};
    var b = Math.min(o.bevel != null ? o.bevel : 0.14 * Math.min(w, h, d), 0.49 * Math.min(w, h, d));
    var seg = o.segs || 24, g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
    var pos = g.attributes.position, nor = g.attributes.normal;
    var hx = w / 2 - b, hy = h / 2 - b, hz = d / 2 - b;
    var v = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    var clamp = function (x, m) { return Math.max(-m, Math.min(m, x)); };
    for (var i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      c.set(clamp(v.x, hx), clamp(v.y, hy), clamp(v.z, hz));
      n.copy(v).sub(c);
      if (n.lengthSq() < 1e-12) { n.set(0, 1, 0); } else { n.normalize(); }
      v.copy(c).addScaledVector(n, b);
      pos.setXYZ(i, v.x, v.y, v.z);
      nor.setXYZ(i, n.x, n.y, n.z);
    }
    pos.needsUpdate = true; nor.needsUpdate = true;
    g.computeBoundingSphere();
    return mesh(THREE, g, o);
  }
  function puck(THREE, r, h, o) { return mesh(THREE, new THREE.CylinderGeometry(r, r, h, 48, 1), o); }
  function ball(THREE, r, o) { return mesh(THREE, new THREE.SphereGeometry(r, 48, 32), o); }
  function pill(THREE, r, len, o) { return mesh(THREE, new THREE.CapsuleGeometry(r, len, 8, 24), o); }
  function ring(THREE, R, tube, o) { return mesh(THREE, new THREE.TorusGeometry(R, tube, 20, 64), o); }
  function cable(THREE, pts, r, o) {
    var curve = new THREE.CatmullRomCurve3(pts.map(function (p) { return p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2]); }));
    return mesh(THREE, new THREE.TubeGeometry(curve, Math.max(24, pts.length * 8), r || 0.07, 16, false), o);
  }
  function part(THREE, geometry, o) { return mesh(THREE, geometry, o); }

  /* S4 - a sequence CLIMBS (LOOK-BASE 4.0): blocks rising left to right, the goal block lime. */
  function climb(THREE, n, o) {
    o = o || {};
    var g = new THREE.Group(), tops = [], blocks = [];
    var w = o.width != null ? o.width : 1.0, gap = o.gap != null ? o.gap : 0.18, rise = o.rise != null ? o.rise : 0.55;
    for (var i = 0; i < n; i++) {
      var h = 0.5 + rise * i;
      var b = block(THREE, w, h, w, { color: i === n - 1 ? 'lime' : (o.color || 'white'), bevel: o.bevel });
      b.position.set((i - (n - 1) / 2) * (w + gap), h / 2, 0);
      g.add(b); blocks.push(b); tops.push(new THREE.Vector3(b.position.x, h, 0));
    }
    return { group: g, tops: tops, blocks: blocks };
  }
  /* S5 - a comparison shows BOTH WHOLE, side by side, same scale, same light. */
  function pair(THREE, a, b, gap) {
    var g = new THREE.Group(), d = gap != null ? gap : 2.6;
    a.position.x -= d / 2; b.position.x += d / 2;
    g.add(a, b);
    return g;
  }

  /* ---------------------------------------------------------------- the stage
     opts: target [x,y,z], distance, azimuth / elevation (deg), fov, shift (fraction of the width), exposure.
     There is NO floor option and no shadow option: this look does not ground a figure with a shadow. */
  function stage(ctx, o) {
    o = o || {};
    var THREE = ctx.THREE, renderer = ctx.renderer, width = ctx.width, height = ctx.height;
    var opt = Object.assign({ target: [0, 0.9, 0], distance: 9, azimuth: -22, elevation: 14, fov: 28, shift: 0,
      exposure: 1.0, key: [-5, 9, 7], keyIntensity: 2.1 }, o);
    renderer.toneMapping = THREE.NeutralToneMapping != null ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = opt.exposure;
    renderer.shadowMap.enabled = false;                   // flat look: nothing casts
    renderer.setClearColor(0x000000, 0);                  // transparent: the slide's own ground shows through
    var scene = new THREE.Scene();

    var camera = new THREE.PerspectiveCamera(opt.fov, width / height, 0.1, 300);
    var frame = function (w, h) { if (opt.shift) camera.setViewOffset(w, h, w * opt.shift, 0, w, h); else camera.clearViewOffset(); };
    frame(width, height);
    var target = new THREE.Vector3(opt.target[0], opt.target[1], opt.target[2]);
    var place = function (az, el, dist) {
      var a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
      camera.position.set(target.x + dist * Math.sin(a) * Math.cos(e), target.y + dist * Math.sin(e),
        target.z + dist * Math.cos(a) * Math.cos(e));
      camera.lookAt(target);
    };
    place(opt.azimuth, opt.elevation, opt.distance);

    // one key, one weak fill, one hemisphere. Neutral white: the colour is in the material, never in the light -
    // a tinted light would make a third colour out of two (LOOK.md 3.6).
    var key = new THREE.DirectionalLight(0xFFFFFF, opt.keyIntensity);
    key.position.set(target.x + opt.key[0], target.y + opt.key[1], target.z + opt.key[2]);
    key.target.position.copy(target);
    scene.add(key, key.target);
    var fill = new THREE.DirectionalLight(0xFFFFFF, 0.85);
    fill.position.set(target.x + 7, target.y + 3, target.z + 6);
    scene.add(fill);
    scene.add(new THREE.HemisphereLight(0xFFFFFF, 0xCFCBE8, 1.0));

    var floaters = [], labelSets = [];
    var S = {
      THREE: THREE, scene: scene, camera: camera, key: key, target: target, renderer: renderer, period: ctx.period,
      add: function () { for (var i = 0; i < arguments.length; i++) scene.add(arguments[i]); return arguments[0]; },
      place: place,
      /* a slow, exactly periodic sway about the framed pose */
      sway: function (t, s) {
        s = s || {};
        var P = s.period || ctx.period || 12, w = TAU * wrap(t, P) / P;
        place((s.azimuth != null ? s.azimuth : opt.azimuth) + (s.deg != null ? s.deg : 5) * Math.sin(w),
          (s.elevation != null ? s.elevation : opt.elevation) + 1.2 * Math.sin(2 * w), s.distance || opt.distance);
      },
      /* one whole turn per loop - for an object that reads from every side */
      turn: function (t, s) {
        s = s || {};
        var P = s.period || ctx.period || 12;
        place((s.azimuth != null ? s.azimuth : opt.azimuth) + 360 * wrap(t, P) / P,
          s.elevation != null ? s.elevation : opt.elevation, s.distance || opt.distance);
      },
      /* a floating part: drifts and tips a little, once per loop, never lands */
      float: function (obj, f) {
        f = f || {};
        floaters.push({ obj: obj, home: obj.position.clone(), rot: obj.rotation.clone(),
          amp: f.amp != null ? f.amp : 0.08, tip: f.tip != null ? f.tip : 0.07, phase: f.phase || 0, cycles: f.cycles || 1 });
        return obj;
      },
      labels: function (set) { labelSets.push(set); return set; },
      api: function (o2) {
        o2 = o2 || {};
        return Object.assign({ scene: scene, camera: camera }, o2, {
          update: function (t, dt) {
            if (o2.update) o2.update(t, dt);
            var P = ctx.period || 12;
            floaters.forEach(function (f) {
              var w = TAU * f.cycles * wrap(t, P) / P + f.phase;
              f.obj.position.y = f.home.y + f.amp * Math.sin(w);
              f.obj.rotation.x = f.rot.x + f.tip * Math.sin(w + 1.1);
              f.obj.rotation.z = f.rot.z + f.tip * 0.7 * Math.cos(w);
            });
            camera.updateMatrixWorld();
            labelSets.forEach(function (l) { l.time(t); l.update(); });
          },
          render: function (t, dt) {
            renderer.setRenderTarget(null);
            renderer.render(scene, camera);          // no post: Violet Lime is not registered in post-policy.js
            if (o2.render) o2.render(t, dt);
          },
          resize: function (w, h) {
            camera.aspect = w / h; frame(w, h); camera.updateProjectionMatrix();
            labelSets.forEach(function (l) { l.update(); });
            if (o2.resize) o2.resize(w, h);
          },
          dispose: function () { try { if (o2.dispose) o2.dispose(); } catch (e) { /* ignore */ } },
        });
      },
    };
    return S;
  }

  /* ---------------------------------------------------------------- projected labels: every element inside the
     holder with data-follow="name" is moved to its anchor each frame (recorded into the loop video with the
     picture). A label NEVER covers the figure (LOOK-BASE 4.4): the points go to the one shared placer in
     runtime.js, which puts each one in clear space outside the subject and draws a leader back to the part. */
  function tags(S, holder, anchors) {
    var THREE = S.THREE, v = new THREE.Vector3();
    var els = Array.prototype.slice.call(holder.querySelectorAll('[data-follow]'));
    els.forEach(function (el) { el.style.left = '0px'; el.style.top = '0px'; });
    var time = 0;
    return S.labels({
      time: function (t) { time = t; },
      update: function () {
        var w = holder.offsetWidth, h = holder.offsetHeight;
        if (!w || !h || !window.LumiLabel) return;
        var items = [];
        els.forEach(function (el) {
          var a = anchors[el.dataset.follow]; if (!a) return;
          if (Array.isArray(a)) v.set(a[0], a[1], a[2] || 0);
          else if (typeof a === 'function') { var p = a(time); v.set(p[0], p[1], p[2] || 0); }
          else if (a.isObject3D) a.getWorldPosition(v);
          v.project(S.camera);
          items.push({ el: el, x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, show: v.z <= 1 && v.z >= -1 });
        });
        window.LumiLabel.place(holder, items, window.LumiLabel.sceneGrid(THREE, S.scene, S.camera, w, h));
      },
    });
  }

  window.VL3D = {
    version: '1.0', COLORS: COLORS,
    wrap: wrap, phase: phase, easeStep: easeStep, steps: steps, land: land,
    stage: stage, flat: flat, part: part, block: block, puck: puck, ball: ball, pill: pill, ring: ring, cable: cable,
    climb: climb, pair: pair, tags: tags,
  };
})();
