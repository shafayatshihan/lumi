/* Candy Grid 3D: the live product-shot studio (classic script, no imports; uses the THREE that Aura.scene passes in).
   Subject-free. Built on the same studio as Red Gallery's RG3D, recoloured and relit for a bright portfolio: glossy
   candy-coloured plastic under a clean white key and a strong fill, soft short shadows, standing on the flat colour
   panel behind it (.cg-stage). Candy Grid is a three.js look (form_server.LOOK_3D['candy-grid'] = 'threejs').

     Aura.scene('s3-scene', (ctx) => {
       const { THREE } = ctx;
       const S = CG3D.studio(ctx, { target: [0, 0.7, 0], distance: 8 });
       const body = S.add(CG3D.block(THREE, 2.2, 1.4, 1.2, { color: 'white' }));  body.position.y = 0.7;
       S.contact(body, 1.5);
       const key = S.add(CG3D.ball(THREE, 0.28, { color: 'rose' }));  key.position.set(1.6, 1.9, 0.4);
       S.float(key, { amp: 0.08 });
       CG3D.tags(S, ctx.el, { body: body, key: key });                            // .cg-tag with data-follow
       return S.api({ update(t) { S.sway(t); } });
     }, { period: 12 });

   Everything is a pure function of t, so seek(t) in the capture contract and the recorded loop agree. */
(function () {
  'use strict';
  if (window.CG3D) return;
  var TAU = Math.PI * 2;

  /* ---------------------------------------------------------------- the greys. No hue at all: the picture is a
     black-and-white photograph. 'ink' (= 'clay', the default) is the hero tone - dark against the cream page, like the
     reference's brush stroke; plaster and stone are the rest of the object; black is the deepest accent. */
  var CLAYS = { white: 0xF7F7F7, clay: 0xF7F7F7, ink: 0x26262C, black: 0x18181C, graphite: 0x4A4A55, grey: 0xB9B9C2, stone: 0xE6E6EC,
    yellow: 0xFFC72C, orange: 0xFF8A00, pink: 0xF9A8C9, rose: 0xEC4A7B, cyan: 0x29C4E6, violet: 0x9B8CF2, mint: 0x7FE0C0 };
  var BG = 0xFFC72C;

  /* ---------------------------------------------------------------- loop maths (closed form, so every loop is seamless) */
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
  /* the clay landing: progress k of a short drop -> { y: 0..1 of the drop height, sx, sy } with ONE soft squash at the
     end. Use it for a part arriving; never for anything that should look rigid. */
  function land(k) {
    if (k <= 0) return { y: 1, sx: 1, sy: 1 };
    if (k < 0.7) { var a = k / 0.7; return { y: 1 - a * a, sx: 1, sy: 1 }; }
    var s = Math.sin((k - 0.7) / 0.3 * Math.PI) * 0.08;
    return { y: 0, sx: 1 + s, sy: 1 - s };
  }

  /* ---------------------------------------------------------------- the thumbed grain: a deterministic value-noise
     bump texture (hash, not Math.random, so every render of a deck is the same) */
  var grainTex = null;
  function grain(THREE) {
    if (grainTex) return grainTex;
    var N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
    var g = cv.getContext('2d'), img = g.createImageData(N, N);
    var hash = function (x, y) { var h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); };
    var vn = function (x, y, c) {
      var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      var w = function (q) { return ((q % c) + c) % c; };
      var a = hash(w(xi), w(yi)), b = hash(w(xi + 1), w(yi)), d = hash(w(xi), w(yi + 1)), e = hash(w(xi + 1), w(yi + 1));
      var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      return a + (b - a) * u + (d - a) * v + (a - b - d + e) * u * v;
    };
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var p = 0.62 * vn(x / 32, y / 32, 8) + 0.28 * vn(x / 8, y / 8, 32) + 0.1 * vn(x / 2, y / 2, 128);   // presses + grain
      var o = (y * N + x) * 4, c = Math.round(p * 255);
      img.data[o] = img.data[o + 1] = img.data[o + 2] = c; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    grainTex = new THREE.CanvasTexture(cv);
    grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
    grainTex.repeat.set(2, 2);
    return grainTex;
  }

  /* ---------------------------------------------------------------- the material: matte, NO clearcoat, a soft sheen for
     the velvet rim real clay has, a fine bump. Cached per colour. o: { rough, sheen, bump } */
  var mats = {};
  function clay(THREE, color, o) {
    o = o || {};
    var hex = typeof color === 'string' ? (CLAYS[color] != null ? CLAYS[color] : new THREE.Color(color).getHex()) : (color != null ? color : CLAYS.clay);
    var key = hex + '|' + (o.rough || '') + '|' + (o.sheen || '') + '|' + (o.bump || '');
    if (mats[key]) return mats[key];
    var c = new THREE.Color(hex), sheenC = c.clone().lerp(new THREE.Color(0xFFFFFF), 0.45);
    mats[key] = new THREE.MeshPhysicalMaterial({
      color: c, roughness: o.rough != null ? o.rough : 0.38, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.3,
      specularIntensity: 0.5, sheen: o.sheen != null ? o.sheen : 0.3, sheenColor: sheenC, sheenRoughness: 0.55,
      bumpMap: grain(THREE), bumpScale: o.bump != null ? o.bump : 0.6,
    });
    return mats[key];
  }
  function mesh(THREE, geometry, o) {
    o = o || {};
    var m = new THREE.Mesh(geometry, o.material || clay(THREE, o.color || 'clay', o));
    m.castShadow = m.receiveShadow = true;
    return m;
  }

  /* ---------------------------------------------------------------- chunky, generously bevelled shapes. No thin parts. */
  /* a rounded block, w x h x d, every edge and corner rounded by b (default: 18 % of the smallest side). Built as a
     subdivided box whose vertices are pushed onto the rounded shape, with the normal of that shape written directly:
     smooth everywhere, no faceting (an ExtrudeGeometry bevel is non-indexed and shades flat - measured). */
  function block(THREE, w, h, d, o) {
    o = o || {};
    var b = Math.min(o.bevel != null ? o.bevel : 0.18 * Math.min(w, h, d), 0.49 * Math.min(w, h, d));
    var seg = o.segs || 30, g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
    var pos = g.attributes.position, nor = g.attributes.normal, hx = w / 2 - b, hy = h / 2 - b, hz = d / 2 - b;
    var v = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    var clamp = function (x, m) { return Math.max(-m, Math.min(m, x)); };
    var E = 0.3;                                     // the outer 30 % of the segments on each side go to the rounding
    var spread = function (x, H, inner) {
      var u = Math.abs(x) / H, s = x < 0 ? -1 : 1;
      return s * (u <= 1 - E ? u / (1 - E) * inner : inner + (u - (1 - E)) / E * (H - inner));
    };
    for (var i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      v.set(spread(v.x, w / 2, hx), spread(v.y, h / 2, hy), spread(v.z, d / 2, hz));
      c.set(clamp(v.x, hx), clamp(v.y, hy), clamp(v.z, hz));
      n.subVectors(v, c);
      if (n.lengthSq() < 1e-12) n.fromBufferAttribute(nor, i); else n.normalize();
      v.copy(c).addScaledVector(n, b);
      pos.setXYZ(i, v.x, v.y, v.z); nor.setXYZ(i, n.x, n.y, n.z);
    }
    pos.needsUpdate = nor.needsUpdate = true;
    return mesh(THREE, g, o);
  }
  /* a rounded cylinder (a knob, a lens ring, a button), axis Y, edge radius b */
  function puck(THREE, r, h, o) {
    o = o || {};
    var b = Math.min(o.bevel != null ? o.bevel : 0.3 * Math.min(r, h), r * 0.95, h / 2), pts = [new THREE.Vector2(0, -h / 2)], k;
    var ri = o.hole || 0;
    if (ri) pts = [new THREE.Vector2(ri, -h / 2)];
    for (k = 0; k <= 6; k++) { var a = -Math.PI / 2 + k / 6 * Math.PI / 2; pts.push(new THREE.Vector2(r - b + b * Math.cos(a), -h / 2 + b + b * Math.sin(a))); }
    for (k = 0; k <= 6; k++) { var a2 = k / 6 * Math.PI / 2; pts.push(new THREE.Vector2(r - b + b * Math.cos(a2), h / 2 - b + b * Math.sin(a2))); }
    pts.push(new THREE.Vector2(ri || 0, h / 2));
    if (ri) pts.push(new THREE.Vector2(ri, -h / 2));
    return mesh(THREE, new THREE.LatheGeometry(pts, o.segs || 48), o);
  }
  function ball(THREE, r, o) { return mesh(THREE, new THREE.SphereGeometry(r, 48, 32), o); }
  function pill(THREE, r, len, o) { return mesh(THREE, new THREE.CapsuleGeometry(r, len, 8, 24), o); }
  function ring(THREE, R, tube, o) { return mesh(THREE, new THREE.TorusGeometry(R, tube, 20, 64), o); }
  /* a soft cable along points: the coiled cord, the hose, the wire */
  function cable(THREE, pts, r, o) {
    var v = pts.map(function (p) { return new THREE.Vector3(p[0], p[1], p[2] || 0); });
    return mesh(THREE, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(v), Math.max(32, v.length * 16), r, 12, false), o);
  }
  /* any geometry, in clay */
  function part(THREE, geometry, o) { return mesh(THREE, geometry, o); }

  /* S4 in clay: a sequence is a path that CLIMBS - chunky blocks rising left to right, the goal block in the primary */
  function climb(THREE, n, o) {
    o = o || {};
    var w = o.tread != null ? o.tread : 1.1, h = o.rise != null ? o.rise : 0.5, d = o.depth != null ? o.depth : 1.0;
    var g = new THREE.Group(), tops = [], blocks = [];
    for (var i = 0; i < n; i++) {
      var hgt = h * (i + 1);
      var b = block(THREE, w * 0.94, hgt, d, { color: i === n - 1 ? (o.goal || 'clay') : (o.color || 'white'), bevel: Math.min(0.14, w * 0.12) });
      b.position.set((i - (n - 1) / 2) * w, hgt / 2, 0);
      g.add(b); blocks.push(b);
      tops.push(new THREE.Vector3((i - (n - 1) / 2) * w, hgt, 0));
    }
    return { group: g, tops: tops, blocks: blocks };
  }
  /* S5 in clay: two objects, whole, side by side, same light, same scale. Never a morph, never a ghost. */
  function pair(THREE, a, b, gap) {
    gap = gap == null ? 3 : gap;
    var g = new THREE.Group();
    a.position.x -= gap / 2; b.position.x += gap / 2;
    g.add(a, b);
    return g;
  }

  /* ---------------------------------------------------------------- the softbox room for reflections and soft light:
     cool near-white walls (the studio colour), a big top box, a warm box on the key side. Prefiltered with PMREM. */
  function room(THREE, renderer) {
    var sc = new THREE.Scene();
    var shell = new THREE.Mesh(new THREE.BoxGeometry(40, 20, 40), new THREE.MeshBasicMaterial({ color: 0xE8E8E8, side: THREE.BackSide }));
    shell.position.y = 6; sc.add(shell);
    var panel = function (w, h, color, k, x, y, z, rx, ry) {
      var m = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide }); m.color.multiplyScalar(k);
      var p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(x, y, z); p.rotation.set(rx, ry, 0); sc.add(p);
    };
    panel(16, 8, 0xFFFFFF, 5, 0, 15, 2, Math.PI / 2, 0);           // the big top box: the soft highlight on every top face
    panel(5, 10, 0xFFFFFF, 4, -14, 7, 8, 0, Math.PI / 2.3);       // key-side box, neutral
    panel(4, 10, 0xFFFFFF, 1.4, 14, 6, 6, 0, -Math.PI / 2.3);     // weak fill: a gallery photo keeps its shadows
    panel(40, 40, 0xC8C8C8, 1, 0, -3.9, 0, -Math.PI / 2, 0);      // floor bounce, neutral
    var pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(sc, 0.04);
    pm.dispose(); sc.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    return rt;
  }
  /* a contact-shadow texture: a soft radial falloff, drawn once */
  var contactTex = null;
  function contactTexture(THREE) {
    if (contactTex) return contactTex;
    var cv = document.createElement('canvas'); cv.width = cv.height = 128;
    var g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(30,20,50,0.55)'); gr.addColorStop(0.45, 'rgba(30,20,50,0.22)'); gr.addColorStop(1, 'rgba(30,20,50,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    contactTex = new THREE.CanvasTexture(cv);
    return contactTex;
  }

  /* ---------------------------------------------------------------- post (shared stack, look policy decides) */
  var warned = false;
  function makePost(ctx, THREE, renderer, scene, camera, scenePost, focus) {
    if (!window.LumiPost || !window.LumiPostPolicy) {
      if (!warned) { warned = true; console.warn('Candy Grid: engine/deck/lib/post.js and post-policy.js are not loaded, so 3D slides render without crease AO.'); }
      return null;
    }
    var decision = window.LumiPostPolicy.resolve({ el: ctx.el, scenePost: scenePost });
    if (decision.enabled && decision.cfg.focusTarget == null) decision.cfg.focusTarget = focus;
    var post = window.LumiPostPolicy.make(THREE, renderer, scene, camera, decision);
    if (post) post.decision = decision; else if (ctx.el) ctx.el.dataset.postOff = decision.reason;
    return post;
  }

  /* ---------------------------------------------------------------- the studio
     opts: target [x,y,z], distance, azimuth / elevation (deg), fov, shift (fraction of the width: -0.2 moves the subject
     right of centre), floor 'shadow' (default: shadow-only ground on the studio colour) | 'none' (it floats or flies),
     exposure, key [x,y,z] (offset from target), post (true = the look's policy decides | false | a preset name) */
  function studio(ctx, o) {
    o = o || {};
    var THREE = ctx.THREE, renderer = ctx.renderer, width = ctx.width, height = ctx.height;
    var opt = Object.assign({ target: [0, 0.8, 0], distance: 9, azimuth: -24, elevation: 16, fov: 28, shift: 0, floor: 'shadow',
      exposure: 1.0, key: [-5, 10, 7], keyIntensity: 2.2, shadowBox: 8, post: true }, o);
    renderer.toneMapping = THREE.NeutralToneMapping != null ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = opt.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;            // VSM light-bleeds in stripes along a block's foot (measured)
    renderer.setClearColor(0x000000, 0);                  // transparent: the slide's own studio colour shows through
    var scene = new THREE.Scene();
    var env = room(THREE, renderer);
    scene.environment = env.texture;
    if ('environmentIntensity' in scene) scene.environmentIntensity = 0.55;

    var camera = new THREE.PerspectiveCamera(opt.fov, width / height, 0.1, 300);
    var frame = function (w, h) { if (opt.shift) camera.setViewOffset(w, h, w * opt.shift, 0, w, h); else camera.clearViewOffset(); };
    frame(width, height);
    var target = new THREE.Vector3(opt.target[0], opt.target[1], opt.target[2]);
    var place = function (az, el, dist) {
      var a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
      camera.position.set(target.x + dist * Math.sin(a) * Math.cos(e), target.y + dist * Math.sin(e), target.z + dist * Math.cos(a) * Math.cos(e));
      camera.lookAt(target);
    };
    place(opt.azimuth, opt.elevation, opt.distance);

    // key: neutral white, upper LEFT front, a soft shadow. No warm/cool shift - the picture has no hue. A weak fill
    // from the right and a dim hemisphere, so the shadow side stays dark like a gallery photograph.
    var key = new THREE.DirectionalLight(0xFFFFFF, opt.keyIntensity);
    key.position.set(target.x + opt.key[0], target.y + opt.key[1], target.z + opt.key[2]);
    key.target.position.copy(target);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    var b = opt.shadowBox;
    Object.assign(key.shadow.camera, { left: -b, right: b, top: b, bottom: -b, near: 0.5, far: 50 });
    key.shadow.radius = 8; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
    scene.add(key, key.target);
    var fill = new THREE.DirectionalLight(0xFFFFFF, 0.7); fill.position.set(target.x + 8, target.y + 4, target.z + 5); scene.add(fill);
    scene.add(new THREE.HemisphereLight(0xFFFFFF, 0xC8C8D0, 0.75));

    var floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.18 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    if (opt.floor === 'none') floor.visible = false;
    scene.add(floor);

    var post = makePost(ctx, THREE, renderer, scene, camera, opt.post === true ? undefined : opt.post, target);
    var floaters = [], labelSets = [], contacts = [];
    var S = {
      THREE: THREE, scene: scene, camera: camera, key: key, floor: floor, target: target, renderer: renderer, period: ctx.period, post: post,
      add: function () { for (var i = 0; i < arguments.length; i++) scene.add(arguments[i]); return arguments[0]; },
      place: place,
      /* the only camera motion: a slow, exactly periodic sway (default 5 deg). A clay set is shot on a locked camera. */
      sway: function (t, s) {
        s = s || {};
        var P = s.period || ctx.period || 12, w = TAU * wrap(t, P) / P;
        place((s.azimuth != null ? s.azimuth : opt.azimuth) + (s.deg != null ? s.deg : 5) * Math.sin(w),
          (s.elevation != null ? s.elevation : opt.elevation) + 1.2 * Math.sin(2 * w), s.distance || opt.distance);
      },
      /* a soft contact shadow under a grounded part (radius in world units). It follows the part's x/z each frame. */
      contact: function (obj, radius, strength) {
        var m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: contactTexture(THREE), transparent: true,
          depthWrite: false, opacity: strength != null ? strength : 1, toneMapped: false }));
        m.rotation.x = -Math.PI / 2; m.position.y = 0.002; m.scale.set(radius * 2, radius * 2, 1);
        m.renderOrder = -1; scene.add(m); contacts.push({ m: m, obj: obj });
        return m;
      },
      /* a floating satellite: bobs and tips a little, once per loop (or `cycles` times), never lands */
      float: function (obj, f) {
        f = f || {};
        floaters.push({ obj: obj, home: obj.position.clone(), rot: obj.rotation.clone(), amp: f.amp != null ? f.amp : 0.08,
          tip: f.tip != null ? f.tip : 0.08, phase: f.phase || 0, cycles: f.cycles || 1 });
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
            contacts.forEach(function (c) { var p = c.obj.getWorldPosition(new THREE.Vector3()); c.m.position.x = p.x; c.m.position.z = p.z; });
            camera.updateMatrixWorld();
            labelSets.forEach(function (l) { l.time(t); l.update(); });
          },
          render: function (t, dt) {
            if (post) post.render(); else { renderer.setRenderTarget(null); renderer.render(scene, camera); }
            if (o2.render) o2.render(t, dt);
          },
          resize: function (w, h) {
            camera.aspect = w / h; frame(w, h); camera.updateProjectionMatrix();
            if (post) post.resize();
            labelSets.forEach(function (l) { l.update(); });
            if (o2.resize) o2.resize(w, h);
          },
          dispose: function () { try { if (o2.dispose) o2.dispose(); } catch (e) { /* ignore */ } env.dispose(); if (post) post.dispose(); },
        });
      },
    };
    return S;
  }

  /* ---------------------------------------------------------------- projected labels: every element inside the holder
     with data-follow="name" is moved to its anchor each frame (recorded into the loop video with the picture).
     Anchors: an Object3D, [x, y, z], or a function of t returning [x, y, z].
     A label NEVER covers the figure (LOOK-BASE 4.4): the points go to the one shared placer in runtime.js, which puts
     each one in clear space outside the subject and draws a leader back to the part. data-align / data-dx / data-dy
     are the preferred direction now, not a hard offset. */
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

  window.CG3D = {
    version: '1.0', CLAYS: CLAYS, BG: BG,
    wrap: wrap, phase: phase, easeStep: easeStep, steps: steps, land: land,
    studio: studio, clay: clay, part: part, block: block, puck: puck, ball: ball, pill: pill, ring: ring, cable: cable,
    climb: climb, pair: pair, tags: tags,
  };
})();
