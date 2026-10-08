/* Lumi baked-slide player (batch 6 Part B). Classic script, no imports of its own: it takes the THREE that
   Aura.scene() passes in, exactly like studio3d.js. Load it after runtime.js.

   What it does: loads the model.glb that lumi_bake.py wrote, puts it in the look's own three.js studio, and drives
   its animation as a pure function of t. That last part is the whole point - it means a baked slide is just another
   scene under the capture contract in runtime.js, so finalize.js records it with the seek-based path that already
   exists. There is no new capture path and nothing in finalize.js knows baking happened.

     <div class="aura-3d bb-3d" data-scene="gears" data-period="5"></div>
     <script>
     Aura.scene('gears', (ctx) => LumiBake.scene(ctx, { url: 'bake/final/' }), { period: 5 });
     </script>

   Determinism. `mixer.setTime()` is an absolute seek, never an advance by dt, so frame k is the same picture however
   many frames came before it and the loop closes on itself. Nothing here reads a clock.

   What is NOT baked, and why. Lighting: a baked highlight rotates with the part and reads as dirt. The maps carry
   albedo, roughness, metallic and ambient occlusion only, and the studio relights them - L.studio()'s key, fill and
   rim were calibrated against studio3d.js, so the two agree by construction. The section hatch: it is screen-aligned
   by drafting convention (B.4), so it is injected per fragment here and never written into a texture. */
(function () {
  'use strict';
  if (window.LumiBake) return;

  const DEG = Math.PI / 180;

  // Blender is Z-up; the glTF was exported Y-up. Every point from bake.json comes through here.
  const zup = (THREE, v) => new THREE.Vector3(v[0], v[2], -v[1]);

  /* The studio world as an environment map. Without one a metal is BLACK - it has no diffuse to light, so all it can
     show is a reflection of nothing, and the first baked gear came back a silhouette. These are the exact ramp stops
     from `lumi_bpy.studio()`: a bright softbox ceiling, a thin dark horizon (the edge line that makes chrome read as
     chrome) and a warm floor bounce. A uniform cream world turns steel into white plastic - measured there, and it
     is just as true here. */
  const RAMP = [[0.0, '#B9B0A7'], [0.45, '#CFC8C0'], [0.497, '#9A9086'], [0.53, '#D9D3CC'],
                [0.7, '#EEEBE6'], [1.0, '#F6F3EF']];

  function envFromRamp(THREE, renderer) {
    // equirectangular: WIDE, not a strip. The first try was 8 x 128 - structurally a vertical gradient, but PMREM
    // read it as a panorama 8 pixels around, packed it into an 8 px cube and every metal came out black.
    const w = 256, h = 128, data = new Uint8Array(w * h * 4);
    const c0 = new THREE.Color(), c1 = new THREE.Color(), c = new THREE.Color();
    for (let y = 0; y < h; y++) {
      const v = y / (h - 1);                       // 0 at the bottom of the sphere, 1 at the top
      let i = 0;
      while (i < RAMP.length - 2 && v > RAMP[i + 1][0]) i++;
      const a = RAMP[i], b = RAMP[i + 1];
      const k = b[0] === a[0] ? 0 : (v - a[0]) / (b[0] - a[0]);
      c0.set(a[1]); c1.set(b[1]);
      c.copy(c0).lerp(c1, Math.max(0, Math.min(1, k))).convertSRGBToLinear();
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        data[o] = Math.round(c.r * 255); data[o + 1] = Math.round(c.g * 255);
        data[o + 2] = Math.round(c.b * 255); data[o + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.LinearSRGBColorSpace;
    tex.needsUpdate = true;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
    tex.dispose();
    return env;
  }

  async function loadGLTF(THREE, url, opts) {
    const Loader = (opts && opts.GLTFLoader) || window.GLTFLoader ||
      (await import(/* webpackIgnore: true */ (opts && opts.loaderUrl) || 'three/addons/loaders/GLTFLoader.js')).GLTFLoader;
    return new Promise((ok, fail) => new Loader().load(url, ok, null, fail));
  }

  /* ---------------------------------------------------------------- the screen-space section hatch (B.4)
     `L.section()` draws 45-degree hatch lines from TexCoord.Window - normalised screen position - so they stay put
     while the part turns, which is what makes a section read as a section. Baked into a texture they would glue to
     the surface. The node graph is reproduced here on gl_FragCoord, with two changes, both improvements:
       - the spacing is "lines across the frame width", and the captured region is the HOLDER, not the window, so it
         scales by slideWidth / holderWidth or the hatch comes out finer than the still it is matched against;
       - the Blender graph ends in LESS_THAN, a hard step that only looks clean because 128 spp of Cycles AA softens
         it. A hard step in a fragment shader crawls on a turning face, so this uses the screen-space derivative of
         the stripe coordinate. It depends on position and never on a clock, so seek(t) is still exact. */
  function hatch(THREE, material, opts) {
    const o = opts || {};
    const u = {
      uHatchSpacing: { value: o.spacing === undefined ? 40 : o.spacing },
      uHatchWidth: { value: o.width === undefined ? 0.14 : o.width },
      uHatchFlip: { value: o.flip ? -1 : 1 },
      uHatchColor: { value: new THREE.Color(o.color || '#0061EF') },
      uHatchScale: { value: o.scale === undefined ? 1 : o.scale },
      uHatchRes: { value: new THREE.Vector2(1920, 1080) },
    };
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `
          uniform float uHatchSpacing, uHatchWidth, uHatchFlip, uHatchScale;
          uniform vec3 uHatchColor;
          uniform vec2 uHatchRes;
          void main() {`)
        .replace('#include <color_fragment>', `
          #include <color_fragment>
          {
            vec2 w = gl_FragCoord.xy / uHatchRes;                 // 0..1 across the holder: Blender's Window coords
            float s = (w.x * uHatchFlip * (uHatchRes.x / uHatchRes.y) + w.y) * uHatchSpacing * uHatchScale;
            float f = fract(s);
            float e = max(fwidth(s), 1e-4);                       // one stripe-coordinate unit per pixel
            float line = 1.0 - smoothstep(uHatchWidth - e, uHatchWidth + e, f);
            diffuseColor.rgb = mix(diffuseColor.rgb, uHatchColor, line);
          }`);
    };
    material.userData.hatch = u;
    material.needsUpdate = true;
    return u;
  }

  /* ---------------------------------------------------------------- the scene */
  async function scene(ctx, opts) {
    const o = opts || {};
    const THREE = ctx.THREE;
    const base = String(o.url || '').replace(/\/?$/, '/');
    const man = o.manifest || await (await fetch(base + 'bake.json')).json();
    const gltf = await loadGLTF(THREE, o.glb || (base + (man.glb || 'model.glb')), o);    // o.glb: a packed deck's data URL
    const period = Number(o.period || man.period || ctx.period || 1) || 1;

    // the look's own studio, so a baked slide and a hand-written one are lit the same way. Without BB3D (a bare
    // deck, or a test page) a three-light rig matched to L.studio() stands in; the numbers are the ones in
    // lumi_bpy.studio(), not a guess.
    const size = (man.bounds && man.bounds.size) || 1;
    const target = zup(THREE, (man.camera && man.camera.target) || [0, 0, 0]);
    const eye = zup(THREE, (man.camera && man.camera.position) || [0, 0, size * 2]);
    let S = null, root, camera;
    if (window.BB3D && window.BB3D.studio && !o.plain) {
      S = window.BB3D.studio(ctx, { target: target.toArray(), distance: eye.distanceTo(target),
        fov: (man.camera && man.camera.fovY) || 30, post: o.post });
      root = S.scene || S.group || S;
      camera = S.camera;
    }
    if (!camera) {
      root = new THREE.Scene();
      camera = new THREE.PerspectiveCamera((man.camera && man.camera.fovY) || 30, ctx.width / ctx.height,
        Math.max(1e-4, size / 1000), size * 100);
      const key = new THREE.DirectionalLight(0xFFF4EC, 2.3); key.position.copy(eye).add(new THREE.Vector3(-size, size * 1.4, 0));
      const fill = new THREE.DirectionalLight(0xE6EFFF, 0.6); fill.position.set(size * 2, size, size * 2);
      const rim = new THREE.DirectionalLight(0xFFF7F0, 1.6); rim.position.set(0, size, -size * 2);
      root.add(key, fill, rim, new THREE.HemisphereLight(0xF6F3EF, 0xB9B0A7, 0.6));
      // the contact shadow L.studio()'s shadow catcher gives the Cycles render: a floor that shows only the shadow on it
      if (ctx.renderer && man.bounds && man.bounds.min) {
        ctx.renderer.shadowMap.enabled = true;
        ctx.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024);
        const r = size * 1.5, sc = key.shadow.camera;
        sc.left = sc.bottom = -r; sc.right = sc.top = r; sc.near = size / 100; sc.far = size * 10;
        key.shadow.radius = 6;
        key.target.position.copy(target); root.add(key.target);
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(size * 12, size * 12), new THREE.ShadowMaterial({ opacity: 0.16 }));
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(target.x, zup(THREE, man.bounds.min).y, target.z);
        floor.receiveShadow = true;
        root.add(floor);
      }
      root.environment = envFromRamp(THREE, ctx.renderer);
      if (man.background && !man.transparent) root.background = new THREE.Color(man.background);
    }
    camera.position.copy(eye);
    const cq = man.camera && man.camera.quaternion;
    if (cq) {
      // Blender's own world rotation, turned Y-up the same way every point is (a -90 degree turn about X). Both cameras
      // look down their local -Z with +Y up, so nothing else changes.
      camera.quaternion.set(cq[1], cq[2], cq[3], cq[0]).premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    } else camera.lookAt(target);
    if (man.camera && man.camera.clip) {
      camera.near = Math.max(1e-5, man.camera.clip[0]); camera.far = man.camera.clip[1];
    }
    camera.updateProjectionMatrix();
    // the render was composed for Blender's frame; a holder of another shape shows ALL of that frame, centred, like
    // the still's object-fit: contain - a narrower holder widens the view instead of cropping the subject
    function fit(w, h) {
      const c = man.camera || {};
      if (!c.fovX || !(w > 0 && h > 0)) return;
      const ar = c.aspect || 16 / 9, tx = Math.tan(c.fovX * DEG / 2), ty = Math.tan((c.fovY || 30) * DEG / 2);
      const hy = Math.max(ty, tx / (w / h)), hx = hy * (w / h);          // the holder's half-extent, at least the frame's
      camera.fov = 2 * Math.atan(hy) / DEG;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // the lens shift, as a shift of the frame in normalised device units, scaled by how much of the holder the frame fills
      const s = c.shift || [0, 0], byH = c.shiftUnit !== 'width';
      const dx = 2 * s[0] * (byH ? 1 / ar : 1) * (tx / hx), dy = 2 * s[1] * (byH ? 1 : ar) * (ty / hy);
      const e = camera.projectionMatrix.elements;
      e[8] += dx; e[9] += dy;
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    }
    fit(ctx.width, ctx.height);

    const model = gltf.scene;
    root.add(model);

    // the maps are already in the glTF; what the loader cannot know is which materials are section faces
    const sections = new Set(man.sectionMaterials || []);
    const hatches = [];
    model.traverse((n) => {
      if (!n.isMesh) return;
      n.castShadow = n.receiveShadow = true;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      mats.forEach((m) => {
        if (!m) return;
        if (sections.has(m.name)) hatches.push(hatch(THREE, m, o.hatch));
        if (m.map) m.map.anisotropy = 4;
      });
    });

    const mixer = gltf.animations && gltf.animations.length ? new THREE.AnimationMixer(model) : null;
    if (mixer) gltf.animations.forEach((clip) => { const a = mixer.clipAction(clip); a.play(); });

    // labels: every [data-anchor] child of the holder follows its L.anchor() point. lumi_bake stored each one either
    // local to its nearest animated ancestor (that node survives the join under its own name) or as a fixed point.
    const anchors = [], labels = ctx.el ? Array.from(ctx.el.querySelectorAll('[data-anchor]')) : [];
    labels.forEach((el) => {
      const a = (man.anchors || {})[el.dataset.anchor];
      if (!a) { el.style.display = 'none'; return; }
      const node = a.node ? (model.getObjectByName(a.node) || model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(a.node))) : null;
      if (a.node && !node) { el.style.display = 'none'; return; }
      // the exporter turns every node's own frame Y-up, so a node-local point converts exactly like a world one
      anchors.push({ el, node, p: zup(THREE, node ? a.local : a.point) });
    });
    const v = new THREE.Vector3();
    function placeLabels() {
      if (!anchors.length) return;
      model.updateMatrixWorld(true);
      camera.updateMatrixWorld();
      anchors.forEach((a) => {
        v.copy(a.p);
        if (a.node) a.node.localToWorld(v);
        v.project(camera);
        a.el.style.left = ((v.x + 1) * 50).toFixed(3) + '%';
        a.el.style.top = ((1 - v.y) * 50).toFixed(3) + '%';
      });
    }

    function setHatchRes(w, h) {
      hatches.forEach((u) => u.uHatchRes.value.set(w, h));
      // "lines across the frame width" was authored against the 1920 px slide, and this holder is narrower
      const slideW = (o.slideWidth || 1920);
      hatches.forEach((u) => { u.uHatchScale.value = w > 0 ? slideW / w : 1; });
    }
    setHatchRes(ctx.width, ctx.height);

    const api = {
      scene: root,
      camera,
      model,
      update(t) {
        if (mixer) mixer.setTime(((t % period) + period) % period);   // absolute seek: frame k never depends on k-1
        if (S && S.orbit && o.orbit) S.orbit(t);
        placeLabels();
      },
      resize(w, h) {
        setHatchRes(w, h);
        if (S && S.resize) S.resize(w, h);
        fit(w, h);
      },
      dispose() {
        if (mixer) mixer.stopAllAction();
        if (S && S.dispose) S.dispose();
      },
    };
    return S && S.api ? S.api(api) : api;
  }

  window.LumiBake = { version: '1.0', scene, hatch, zup, envFromRamp };
})();
