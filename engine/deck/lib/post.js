/* Lumi shared post-processing stack (classic script, no imports; uses the THREE that Aura.scene passes in).

   THE ONE POST IMPLEMENTATION. Every look that wants bloom / depth of field / ambient occlusion / FXAA / tone mapping
   goes through LumiPost.create(). Bold Blue's studio3d.js delegates here; Flat-Pack refuses post entirely (it is a
   drawing, not a photograph). Do not write a second composer: the whole point of one implementation is that the
   determinism proof and the frame-cost measurement below describe every deck.

   WHY NOT three/examples/jsm/postprocessing/EffectComposer
   It exists in engine/node_modules/three (0.186.1) and it is an ES module. A packed Lumi deck is ONE offline HTML file
   whose look scripts are classic <script> text; the only ES module a deck loads is three itself, through an import map
   of data URLs built by pack_deck.py. Pulling EffectComposer in would mean inlining a second module graph
   (EffectComposer -> Pass -> ShaderPass -> CopyShader -> ...) and giving the look scripts module scope. LOOK-BASE 4.5
   already says "no add-on imports (they will not be packed)". So this file is the EffectComposer-equivalent, written
   as one render target chain with no dependencies beyond the THREE core.
   What it does borrow from the suite is the MATH, not the files: the bright-pass + dual-filter mip chain is
   UnrealBloomPass's idea, the circle-of-confusion gather is BokehPass's, the edge estimator is FXAAPass's.
   AfterimagePass is deliberately NOT ported - see DETERMINISM below.

   DETERMINISM (the capture contract, runtime.js section 2)
   finalize.js screenshots one frame per seek(t) and expects seek(t) twice to produce identical pixels. Every effect
   here is a pure function of (scene pixels, camera, config):
     - no uniform is fed from performance.now(), Date, Math.random() or a frame counter;
     - every sampling pattern is a fixed golden-angle spiral baked into the shader as constants;
     - no render target survives a frame as INPUT to the next (the targets are written before they are read, every
       frame, in the same order) - nothing accumulates.
   AfterimagePass accumulates by design: frame N blends frame N-1. Under seek-based capture that makes the pixels at
   t depend on which frame was drawn before, so seek(5) after seek(4) differs from seek(5) after seek(9). It is
   therefore refused by name (see REJECT below), not merely left out.

   HONESTY (cinematic-direction.md section 7)
   This file renders; it does not decide. Whether a slide gets post at all is post-policy.js's job, and that gate
   closes over any slide carrying measured values. Bloom blows out an error bar; depth of field hides the region a
   number was read from.

   CONTRAST (deck_check.js L-03)
   The chain draws into the scene's own WebGL canvas and nowhere else. Slide text is HTML above that canvas and is
   never a pixel in this pipeline. Text whose MEASURED BACKGROUND is the canvas (a projected label inside the holder)
   can still shift, so post-policy.js keeps the bloom threshold above the look's paper white by default.

   Usage:
     const P = LumiPost.create(THREE, renderer, scene, camera, { bloom: true, dof: false, fxaa: true });
     // in render(): P.render();   in resize(): P.resize();   in dispose(): P.dispose();
     P.state.bloom = false;        // toggle live (this is what makes an A/B still trivial)
     P.degrade();                  // drop the most expensive remaining effect; returns its name or null
*/
(function () {
  'use strict';
  if (window.LumiPost) return;

  /* Effects that cannot satisfy the capture contract. Asking for one is an error, not a silent no-op: a deck that
     thought it had motion blur and quietly did not is worse than one that failed loudly at build time. */
  var REJECT = {
    afterimage: 'accumulates the previous frame, so seek(t) depends on the frame drawn before it',
    motionBlur: 'needs the previous frame or a velocity buffer, neither of which survives a seek',
    temporalAA: 'jitters across frames, so two seeks to the same t differ',
    filmGrain: 'animated grain is a function of wall-clock time, not of t',
  };

  var VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

  var DEFAULTS = {
    /* `radius` is NOT a linear dial and a preset should be very slow to move it. The up-chain is recursive - each
       level's result is the next level's input - so uR multiplies the coarsest mip roughly four times over. Going
       from 0.6 to 0.7 therefore nearly DOUBLES the widest, most diffuse part of the halo (0.7^4 / 0.6^4 = 1.85), and
       measured on a light cyclorama that was the difference between a glow around the emitter and the whole upper
       plate clipping to white with the floor gradient and the contact shadow gone. Reach for `strength` or for the
       emitter's own emissiveIntensity instead; leave `radius` where it is. */
    bloom: true, threshold: 3.2, strength: 0.5, radius: 0.6,
    /* focus is a distance in world units from the camera, or 'auto' - the distance from the camera to `focusTarget`
       (the studio's own look-at point), recomputed each frame from the camera pose. 'auto' is still a pure function
       of t, because the camera pose is: it reads the matrix, never the clock. A fixed number is almost always wrong,
       because a look's orbit changes the camera's distance to its subject every frame. */
    dof: false, focus: 'auto', focusTarget: null, aperture: 0.6, maxBlur: 9,
    ao: true, aoRadius: 0.35, aoIntensity: 0.9,
    fxaa: false,
    /* light shafts (volumetric light, screen space): a radial march from each pixel toward the projected position of
       `shaftFrom` (a world point - studio3d passes its key light), accumulating "lit air": depth-buffer pixels farther
       than the subject (camera-to-`focusTarget` distance + `shaftDepth`) or empty. Whatever is nearer blocks the
       march, which is what cuts the shafts. Half resolution, 40 FIXED taps, no dither and no per-frame rotation: the
       usual way to hide banding in a raymarch is noise that changes every frame, and that is exactly what seek(t)
       cannot have; the half-res bilinear upsample does the smoothing instead. Pure function of the camera pose.
       `shaftStrength` is the light added in linear HDR before tone mapping - on a light cyclorama it washes the plate
       just as bloom does, so keep it low and warm, never lift it to make up for a dim key. */
    shafts: false, shaftFrom: null, shaftColor: [1.0, 0.94, 0.86], shaftStrength: 0.12, shaftDepth: 1.5,
    exposure: null,          // null = leave renderer.toneMappingExposure alone
    levels: 5,
  };

  /* The order the adaptive ladder drops things in: most frame time per unit of visible gain, first.
     The LAST rung is `bypass`, and it is the one that matters. Measured on a full-bleed 1920x1080 cyclorama scene
     (X:\lumi-post-ab, Edge / Windows, integrated GPU): rendering straight to the canvas costs ~11.5 ms a frame; going
     through this chain with every effect switched off still costs ~35 ms. The effects are nearly free next to the
     price of the chain itself - the half-float render target with 4x MSAA, its depth texture, and one full-screen
     composite. So turning effects off one at a time is a rounding error on a laptop that cannot hold the frame; only
     leaving the composer entirely gives the frame back, and `bypass` is that rung.
     `shafts` goes first: it is pure atmosphere, the least information per millisecond of anything here. */
  var LADDER = ['shafts', 'dof', 'ao', 'bloom', 'fxaa', 'bypass'];

  function create(THREE, renderer, scene, camera, o) {
    var cfg = {}, k;
    for (k in DEFAULTS) cfg[k] = DEFAULTS[k];
    if (o && o !== true) for (k in o) { if (REJECT[k] && o[k]) throw new Error('LumiPost: "' + k + '" is refused - ' + REJECT[k] + '.'); cfg[k] = o[k]; }
    var LEVELS = Math.max(2, cfg.levels | 0);

    var quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)), qs = new THREE.Scene(),
        qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    qs.add(quad); quad.frustumCulled = false;

    var rt = function (w, h, msaa) {
      return new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: msaa ? 4 : 0, depthBuffer: !!msaa });
    };
    var sm = function (frag, uniforms) {
      return new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: frag, uniforms: uniforms,
        depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false });
    };

    var main = null, ldr = null, shaftRT = null, mips = [], ups = [], W = 0, H = 0;

    /* ---- bloom: bright pass, then a dual-filter down/up mip chain (UnrealBloomPass's shape, no add-on) ---- */
    var brightM = sm(
      'uniform sampler2D tSrc; uniform float uTh; varying vec2 vUv;\n' +
      'void main(){ vec4 c = texture2D(tSrc, vUv); vec3 rgb = c.a > 1e-4 ? c.rgb / c.a : vec3(0.0);\n' +
      '  float l = max(rgb.r, max(rgb.g, rgb.b));\n' +
      '  float k = max(l - uTh, 0.0) / max(l, 1e-4); gl_FragColor = vec4(rgb * k * c.a, 1.0); }',
      { tSrc: { value: null }, uTh: { value: cfg.threshold } });
    var downM = sm(
      'uniform sampler2D tSrc; uniform vec2 uPx; varying vec2 vUv;\n' +
      'void main(){ vec3 c = texture2D(tSrc, vUv).rgb * 4.0;\n' +
      '  c += texture2D(tSrc, vUv + vec2(-uPx.x, -uPx.y)).rgb + texture2D(tSrc, vUv + vec2(uPx.x, -uPx.y)).rgb\n' +
      '     + texture2D(tSrc, vUv + vec2(-uPx.x, uPx.y)).rgb + texture2D(tSrc, vUv + vec2(uPx.x, uPx.y)).rgb;\n' +
      '  gl_FragColor = vec4(c / 8.0, 1.0); }',
      { tSrc: { value: null }, uPx: { value: new THREE.Vector2() } });
    var upM = sm(
      'uniform sampler2D tSrc; uniform sampler2D tAdd; uniform vec2 uPx; uniform float uR; varying vec2 vUv;\n' +
      'void main(){ vec3 c = vec3(0.0);\n' +
      '  c += texture2D(tSrc, vUv + vec2(-2.0 * uPx.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(2.0 * uPx.x, 0.0)).rgb;\n' +
      '  c += texture2D(tSrc, vUv + vec2(0.0, -2.0 * uPx.y)).rgb + texture2D(tSrc, vUv + vec2(0.0, 2.0 * uPx.y)).rgb;\n' +
      '  c += (texture2D(tSrc, vUv + uPx).rgb + texture2D(tSrc, vUv - uPx).rgb + texture2D(tSrc, vUv + vec2(uPx.x, -uPx.y)).rgb + texture2D(tSrc, vUv + vec2(-uPx.x, uPx.y)).rgb) * 2.0;\n' +
      '  gl_FragColor = vec4(texture2D(tAdd, vUv).rgb + c / 12.0 * uR, 1.0); }',
      { tSrc: { value: null }, tAdd: { value: null }, uPx: { value: new THREE.Vector2() }, uR: { value: cfg.radius } });

    /* ---- light shafts: see `shafts` in DEFAULTS. 0.96 per tap is the decay, 0.85 the fraction of the way to the light
       (at most one screen) the march covers; both are constants so the pattern is the same every frame. uK fades the shafts out as the
       light moves behind the camera, where the screen-space projection stops meaning anything. ---- */
    var shaftM = sm('#include <packing>\n' +
      'uniform sampler2D tDepth; uniform vec2 uLight; uniform float uNear, uFar, uOcc, uAspect, uK; varying vec2 vUv;\n' +
      'float lit(vec2 uv){ float d = texture2D(tDepth, uv).x; if (d >= 0.99999) return 1.0;\n' +
      '  return smoothstep(uOcc, uOcc + 1.0, -perspectiveDepthToViewZ(d, uNear, uFar)); }\n' +
      // a studio key sits far above a long lens, so the light usually projects screens away from the frame: the glow
      // falls off from where the light ENTERS the frame (its clamped position), and the march is capped at one screen
      'float src(vec2 uv){ vec2 q = (uv - clamp(uLight, 0.0, 1.0)) * vec2(uAspect, 1.0); return lit(uv) * (1.0 - smoothstep(0.0, 1.0, length(q))); }\n' +
      'void main(){\n' +
      '  vec2 toL = vUv - uLight; float dl = max(length(toL), 1e-4);\n' +
      '  vec2 st = toL / dl * min(dl, 1.0) * (0.85 / 40.0), uv = vUv; float w = 1.0, acc = 0.0, n = 0.0;\n' +
      '  for (int i = 0; i < 40; i++) { acc += src(clamp(uv, 0.0, 1.0)) * w; n += w; uv -= st; w *= 0.96; }\n' +
      '  gl_FragColor = vec4(vec3(acc / n * uK), 1.0); }',
      { tDepth: { value: null }, uLight: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 400 },
        uOcc: { value: 10 }, uAspect: { value: 1 }, uK: { value: 0 } });

    /* ---- composite: crease AO -> depth-of-field gather -> bloom add -> tone map -> sRGB ----
       Alpha is kept (and premultiplied at the end) so the slide behind the canvas shows through a 'stage' scene. */
    var compM = new THREE.ShaderMaterial({
      vertexShader: VS, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: true,
      uniforms: {
        tScene: { value: null }, tDepth: { value: null }, tBloom: { value: null },
        uBloom: { value: cfg.strength }, uUseBloom: { value: 1 },
        uUseDof: { value: cfg.dof ? 1 : 0 }, uFocus: { value: typeof cfg.focus === 'number' ? cfg.focus : 10 },
        uAperture: { value: cfg.aperture }, uMaxBlur: { value: cfg.maxBlur },
        uNear: { value: camera.near }, uFar: { value: camera.far }, uPx: { value: new THREE.Vector2() },
        uUseAO: { value: cfg.ao ? 1 : 0 }, uAOR: { value: cfg.aoRadius }, uAOK: { value: cfg.aoIntensity }, uProj: { value: 1000 },
        tShaft: { value: null }, uUseShaft: { value: 0 },
        uShaftC: { value: new THREE.Vector3().fromArray(cfg.shaftColor).multiplyScalar(cfg.shaftStrength) },
      },
      fragmentShader: '#include <packing>\n' +
        'uniform sampler2D tScene; uniform sampler2D tDepth; uniform sampler2D tBloom; uniform sampler2D tShaft;\n' +
        'uniform float uBloom, uUseBloom, uUseDof, uFocus, uAperture, uMaxBlur, uNear, uFar; uniform vec2 uPx; varying vec2 vUv;\n' +
        'uniform float uUseAO, uAOR, uAOK, uProj, uUseShaft; uniform vec3 uShaftC;\n' +
        'float vz(vec2 uv){ return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }\n' +
        'float coc(vec2 uv){ return clamp(abs(vz(uv) - uFocus) * uAperture, 0.0, uMaxBlur); }\n' +
        // crease ambient occlusion from depth alone: two opposite samples BOTH in front of the pixel mean a concave
        // corner (object meets floor, part meets part); a flat or tilted plane never triggers it.
        // 2.39996 is the golden angle: a FIXED spiral, identical every frame, so the pattern never flickers under seek.
        'float creaseAO(){\n' +
        '  if (texture2D(tDepth, vUv).x >= 0.99999) return 0.0;\n' +
        '  float z0 = vz(vUv), rpx = clamp(uAOR * uProj / max(z0, 0.1), 3.0, 72.0), occ = 0.0;\n' +
        '  for (int i = 0; i < 12; i++) {\n' +
        '    float fi = float(i), a = fi * 2.39996 + 0.7, rr = rpx * (0.25 + 0.75 * fract(fi * 0.618));\n' +
        '    vec2 o = vec2(cos(a), sin(a)) * rr * uPx;\n' +
        '    float d1 = z0 - vz(vUv + o), d2 = z0 - vz(vUv - o), m = min(d1, d2);\n' +
        '    if (m > 0.0) occ += clamp(m / uAOR, 0.0, 1.0) * (1.0 - smoothstep(uAOR, 3.0 * uAOR, max(d1, d2)));\n' +
        '  }\n' +
        '  return clamp(occ / 12.0 * 2.0, 0.0, 1.0);\n' +
        '}\n' +
        'void main(){\n' +
        '  vec4 c = texture2D(tScene, vUv);\n' +
        '  if (uUseAO > 0.5) { float o = creaseAO() * uAOK; c.rgb *= 1.0 - o; c.a = c.a + o * 0.55 * (1.0 - c.a); }\n' +
        '  if (uUseDof > 0.5) {\n' +
        '    float r = coc(vUv);\n' +
        '    if (r > 0.5) { vec4 acc = c; float n = 1.0;\n' +
        '      for (int i = 0; i < 24; i++) { float fi = float(i); float a = fi * 2.39996; float rr = sqrt((fi + 0.5) / 24.0) * r;\n' +
        '        vec2 uv = vUv + vec2(cos(a), sin(a)) * rr * uPx; float w = clamp(coc(uv) / max(r, 1e-3) + 0.25, 0.0, 1.0);\n' +
        '        acc += texture2D(tScene, uv) * w; n += w; }\n' +
        '      c = acc / n; }\n' +
        '  }\n' +
        '  vec3 rgb = c.a > 1e-4 ? c.rgb / c.a : vec3(0.0); float a = c.a;\n' +
        '  if (uUseShaft > 0.5) { vec3 s = texture2D(tShaft, vUv).rgb * uShaftC; float sl = clamp(max(s.r, max(s.g, s.b)), 0.0, 1.0);\n' +
        '    float na = max(a, sl); rgb = (rgb * a + s) / max(na, 1e-4); a = na; }\n' +
        '  if (uUseBloom > 0.5) { vec3 b = texture2D(tBloom, vUv).rgb * uBloom; float bl = clamp(max(b.r, max(b.g, b.b)), 0.0, 1.0);\n' +
        '    float na = max(a, bl); rgb = (rgb * a + b) / max(na, 1e-4); a = na; }\n' +
        '  gl_FragColor = vec4(rgb, a);\n' +
        '  #include <tonemapping_fragment>\n' +
        '  #include <colorspace_fragment>\n' +
        '  gl_FragColor.rgb *= gl_FragColor.a;\n' +
        '}' });

    /* ---- FXAA: FXAAPass's estimator, run LAST, and the pass that also performs the sRGB ENCODE the composite could
       not do (see the note on `ldr` in resize()). `fetch()` reads a linear premultiplied texel, unpremultiplies it,
       encodes it to sRGB and premultiplies it again, so the estimator works on perceptual values - which is the
       correct domain for an edge detector - and the canvas receives exactly what it expects. Luma is taken
       UNPREMULTIPLIED so the silhouette of a transparent 'stage' canvas is antialiased against the slide behind it,
       not against black. ---- */
    var fxaaM = sm(
      'uniform sampler2D tSrc; uniform vec2 uPx; uniform float uExp; varying vec2 vUv;\n' +
      // ACES filmic, matching three.js's ACESFilmicToneMapping exactly, so the FXAA path and the straight-to-canvas
      // path (where three applies its own include) agree to the pixel.
      'vec3 rrt(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.432951) + 0.238081; return a / b; }\n' +
      'vec3 aces(vec3 c){\n' +
      '  const mat3 IN = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);\n' +
      '  const mat3 OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);\n' +
      '  c *= uExp / 0.6; c = IN * c; c = rrt(c); c = OUT * c; return clamp(c, 0.0, 1.0);\n' +
      '}\n' +
      'vec3 enc(vec3 v){ return mix(v * 12.92, 1.055 * pow(max(v, vec3(0.0)), vec3(0.41666)) - 0.055, step(vec3(0.0031308), v)); }\n' +
      // one linear premultiplied texel -> the finished sRGB premultiplied pixel the canvas wants
      'vec4 fetch(vec2 uv){ vec4 c = texture2D(tSrc, uv); vec3 r = c.a > 1e-4 ? c.rgb / c.a : vec3(0.0); return vec4(enc(aces(r)) * c.a, c.a); }\n' +
      'float lum(vec4 c){ vec3 r = c.a > 1e-4 ? c.rgb / c.a : vec3(0.0); return dot(r, vec3(0.299, 0.587, 0.114)) * c.a; }\n' +
      'void main(){\n' +
      '  vec4 m  = fetch(vUv);\n' +
      '  float lNW = lum(fetch(vUv + vec2(-uPx.x, -uPx.y)));\n' +
      '  float lNE = lum(fetch(vUv + vec2( uPx.x, -uPx.y)));\n' +
      '  float lSW = lum(fetch(vUv + vec2(-uPx.x,  uPx.y)));\n' +
      '  float lSE = lum(fetch(vUv + vec2( uPx.x,  uPx.y)));\n' +
      '  float lM  = lum(m);\n' +
      '  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));\n' +
      '  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));\n' +
      '  if (lMax - lMin < max(0.0312, lMax * 0.125)) { gl_FragColor = m; return; }\n' +
      '  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));\n' +
      '  float red = max((lNW + lNE + lSW + lSE) * 0.25 * 0.125, 0.0078125);\n' +
      '  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);\n' +
      '  dir = clamp(dir * rcp, -8.0, 8.0) * uPx;\n' +
      '  vec4 a = 0.5 * (fetch(vUv + dir * (1.0 / 3.0 - 0.5)) + fetch(vUv + dir * (2.0 / 3.0 - 0.5)));\n' +
      '  vec4 b = a * 0.5 + 0.25 * (fetch(vUv - dir * 0.5) + fetch(vUv + dir * 0.5));\n' +
      '  float lB = lum(b);\n' +
      '  gl_FragColor = (lB < lMin || lB > lMax) ? a : b;\n' +
      '}',
      { tSrc: { value: null }, uPx: { value: new THREE.Vector2() }, uExp: { value: 1 } });

    var size = new THREE.Vector2();
    function resize() {
      renderer.getDrawingBufferSize(size);
      var w = Math.max(2, size.x | 0), h = Math.max(2, size.y | 0);
      if (w === W && h === H) return;
      W = w; H = h;
      [main, ldr, shaftRT].concat(mips, ups).forEach(function (x) { if (x) x.dispose(); });
      main = rt(w, h, true);
      shaftRT = rt(Math.max(2, w >> 1), Math.max(2, h >> 1));
      main.depthTexture = new THREE.DepthTexture(w, h);
      main.depthTexture.type = THREE.UnsignedIntType;
      /* The FXAA hand-off buffer, and the trap that goes with it, written down because it cost real time and the
         symptom points at the wrong knob.
         WHEN THE COMPOSITE RENDERS INTO A RENDER TARGET IT IS NEITHER TONE MAPPED NOR ENCODED. three.js decides
         both from the program parameters, and both are derived from the renderer ONLY when drawing to the canvas:
         for any ordinary render target it forces NoToneMapping and LinearSRGBColorSpace, ignoring
         `renderTarget.texture.colorSpace` (setting that property was tried; it does nothing).
         So `ldr` receives raw linear HDR, and the FXAA pass has to finish the job - exposure, ACES, sRGB - which is
         exactly what it does below. Get it wrong and the canvas shows linear HDR as though it were sRGB: every
         midtone lifts, a light backdrop clips to white, and it reads precisely like a bloom that is far too strong.
         Measured on the probe scene, switching FXAA on ALONE moved the backdrop from rgb(227,224,223) to
         rgb(255,240,227) with bloom untouched. If post ever seems to wash the plate, suspect this before you reach
         for `strength` or `radius`.
         The buffer is HALF FLOAT for the same reason: 8 bits cannot hold the pre-tone-map values without clipping
         the highlights that ACES exists to roll off. */
      ldr = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });
      mips = []; ups = [];
      var mw = w >> 1, mh = h >> 1;
      for (var i = 0; i < LEVELS; i++) {
        mips.push(rt(Math.max(2, mw), Math.max(2, mh)));
        ups.push(rt(Math.max(2, mw), Math.max(2, mh)));
        mw >>= 1; mh >>= 1;
      }
      compM.uniforms.uPx.value.set(1 / w, 1 / h);
      fxaaM.uniforms.uPx.value.set(1 / w, 1 / h);
    }

    function pass(m, target) { quad.material = m; renderer.setRenderTarget(target); renderer.render(qs, qc); }

    var state = { shafts: !!cfg.shafts, bloom: !!cfg.bloom, dof: !!cfg.dof, ao: !!cfg.ao, fxaa: !!cfg.fxaa, bypass: false };
    var dropped = [];
    var vec3 = function (p) { return p && p.isVector3 ? p : new THREE.Vector3(p ? p[0] : 0, p ? p[1] : 0, p ? p[2] : 0); };
    var focusAt = vec3(cfg.focusTarget);
    /* Shafts DECLINE rather than throw (a throw here now fails the whole build, runtime.js section 5): no light to
       march toward, or a context that cannot run the shader (checked after its first draw, below), and the effect
       steps off the ladder, says why in `shaftsOff`, and the rest of the chain draws as before. */
    var shaftsOff = null, shaftChecked = false, shaftFrom = cfg.shaftFrom ? vec3(cfg.shaftFrom) : null, lv = new THREE.Vector3();
    function declineShafts(why) { shaftsOff = why; if (state.shafts) { state.shafts = false; dropped.push('shafts'); } }
    if (state.shafts && !shaftFrom) declineShafts('no shaftFrom: there is no light to draw shafts from');

    function render() {
      /* the last rung of the degrade ladder: no targets, no composite, straight to the canvas. The picture loses the
         post AND the chain's MSAA, which is why it is last - but it is the only rung that buys back a real frame. */
      if (state.bypass) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
      resize();
      if (cfg.exposure != null) renderer.toneMappingExposure = cfg.exposure;
      renderer.setRenderTarget(main); renderer.clear(); renderer.render(scene, camera);
      if (state.bloom) {
        brightM.uniforms.tSrc.value = main.texture; pass(brightM, mips[0]);
        for (var i = 1; i < LEVELS; i++) {
          downM.uniforms.tSrc.value = mips[i - 1].texture;
          downM.uniforms.uPx.value.set(1 / mips[i - 1].width, 1 / mips[i - 1].height);
          pass(downM, mips[i]);
        }
        var src = mips[LEVELS - 1];
        for (var j = LEVELS - 2; j >= 0; j--) {
          upM.uniforms.tSrc.value = src.texture; upM.uniforms.tAdd.value = mips[j].texture;
          upM.uniforms.uPx.value.set(0.5 / src.width, 0.5 / src.height);
          pass(upM, ups[j]); src = ups[j];
        }
        compM.uniforms.tBloom.value = ups[0].texture;
      }
      if (state.shafts) {
        lv.copy(shaftFrom).applyMatrix4(camera.matrixWorldInverse);
        var su = shaftM.uniforms;
        su.uK.value = THREE.MathUtils.clamp(-lv.z / 2, 0, 1);         // 0 once the light is behind the camera
        lv.applyMatrix4(camera.projectionMatrix);
        su.uLight.value.set(THREE.MathUtils.clamp(lv.x * 0.5 + 0.5, -4, 5), THREE.MathUtils.clamp(lv.y * 0.5 + 0.5, -4, 5));
        su.tDepth.value = main.depthTexture; su.uNear.value = camera.near; su.uFar.value = camera.far;
        su.uOcc.value = camera.position.distanceTo(focusAt) + cfg.shaftDepth; su.uAspect.value = W / H;
        pass(shaftM, shaftRT);
        if (!shaftChecked) {          // once: did this context link the program? (three reports, it does not throw)
          shaftChecked = true;
          var pr = renderer.properties.get(shaftM).currentProgram;
          if (pr && pr.diagnostics && pr.diagnostics.runnable === false) declineShafts('the shaft shader did not compile on this GPU / GL');
        }
        compM.uniforms.tShaft.value = shaftRT.texture;
      }
      compM.uniforms.uUseShaft.value = state.shafts ? 1 : 0;
      compM.uniforms.tScene.value = main.texture;
      compM.uniforms.tDepth.value = main.depthTexture;
      compM.uniforms.uUseBloom.value = state.bloom ? 1 : 0;
      compM.uniforms.uUseDof.value = state.dof ? 1 : 0;
      compM.uniforms.uUseAO.value = state.ao ? 1 : 0;
      if (state.dof && cfg.focus === 'auto') compM.uniforms.uFocus.value = camera.position.distanceTo(focusAt);
      compM.uniforms.uNear.value = camera.near;
      compM.uniforms.uFar.value = camera.far;
      compM.uniforms.uProj.value = H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov || 50) / 2));
      if (state.fxaa) {
        pass(compM, ldr);                                    // linear HDR: three tone maps and encodes only to the canvas
        fxaaM.uniforms.tSrc.value = ldr.texture;
        fxaaM.uniforms.uExp.value = renderer.toneMappingExposure;
        pass(fxaaM, null);                                   // ...so the FXAA pass does the exposure, ACES and sRGB
      }
      else pass(compM, null);
    }

    /* Drop the next effect on the ladder; returns its name, or null when nothing is left to drop.
       `bypass` is the one rung that is switched ON rather than off, and once it is on nothing further is left. */
    function degrade() {
      if (state.bypass) return null;
      for (var i = 0; i < LADDER.length - 1; i++) {
        var n = LADDER[i];
        if (state[n]) { state[n] = false; dropped.push(n); return n; }
      }
      state.bypass = true; dropped.push('bypass'); return 'bypass';
    }

    function dispose() {
      [main, ldr, shaftRT].concat(mips, ups).forEach(function (x) { if (x) x.dispose(); });
      [brightM, downM, upM, shaftM, compM, fxaaM].forEach(function (m) { m.dispose(); });
      quad.geometry.dispose();
    }

    return { render: render, resize: resize, dispose: dispose, degrade: degrade, state: state, dropped: dropped,
             uniforms: compM.uniforms, cfg: cfg, ladder: LADDER.slice(), get shaftsOff() { return shaftsOff; } };
  }

  window.LumiPost = { version: '1.0', create: create, DEFAULTS: DEFAULTS, LADDER: LADDER, REJECT: REJECT,
                      deterministic: true };
})();
