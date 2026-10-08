/* Bold Blue 3D studio (classic script, no imports; uses the THREE that Aura.scene passes in). Subject-free building
   blocks for the look's photoreal "product shot" 3D: physically based materials, procedural canvas textures, shader
   injections, a soft key light with VSM shadows, a softbox environment for reflections, a shadow-only floor over the
   slide canvas, the shared post stack (engine/deck/lib/post.js, gated by engine/deck/lib/post-policy.js) with adaptive
   quality, and HTML labels that follow 3D anchors. No three.js add-ons are needed, so a packed deck stays one offline file.

   Usage (load after runtime.js; see .claude/skills/aura-slide/looks/bold-blue/LOOK.md, "The 3D recipe"):
     <div class="aura-3d bb-3d" data-scene="hero" data-period="16">
       <div class="bb-tag" data-follow="cap"><b>Lipid shell</b><span>keeps the mRNA safe</span></div>
     </div>
     <script>
     Aura.scene('hero', (ctx) => {
       const S = BB3D.studio(ctx, { target: [0, 1, 0], distance: 9, azimuth: -28, elevation: 14, post: { bloom: true } });
       const M = BB3D.materials(ctx.THREE);
       const shell = S.add(BB3D.blob(ctx.THREE, { radius: 1.2, seed: 4 }, M.soft));
       BB3D.labels(S, ctx.el, { cap: [0, 2.3, 0] });
       return S.api({ update(t) { S.orbit(t); shell.rotation.y = 2 * Math.PI * t / ctx.period; } });
     }, { period: 16 });
     </script>
   Everything is a pure function of t (seeded random numbers at setup only), so seek(t) in the capture contract and the
   still frame for the PDF are real frames of the loop. Every frequency in a loop must be a whole multiple of 1/period. */
(function () {
  'use strict';
  if (window.BB3D) return;
  const TAU = Math.PI * 2;

  /* ------------------------------------------------------------------ deterministic random + noise */
  function rng(seed) { let s = (seed >>> 0) || 11; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
  function hash(a, b = 0, c = 0) {            // counter-based: same inputs, same number in [0, 1)
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function noise3(x, y, z, seed = 0) {        // smooth value noise in [-1, 1]
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
    const s = v => v * v * (3 - 2 * v), u = s(xf), v = s(yf), w = s(zf);
    const r = (i, j, k) => hash(xi + i + seed * 131, yi + j, zi + k) * 2 - 1;
    const l = (a, b, k) => a + (b - a) * k;
    return l(l(l(r(0, 0, 0), r(1, 0, 0), u), l(r(0, 1, 0), r(1, 1, 0), u), v),
             l(l(r(0, 0, 1), r(1, 0, 1), u), l(r(0, 1, 1), r(1, 1, 1), u), v), w);
  }

  /* ------------------------------------------------------------------ palette (warm studio, from the reference renders) */
  const C = {
    copper: 0xC97B3C, brass: 0xC9A15A, gold: 0xF5B800, steel: 0xC3C6CD, aluminium: 0xD6D8DC, darkSteel: 0x2D2C2B,
    ink: 0x2D2C2B, white: 0xF4F2EF, cream: 0xF9F4F2, blue: 0x0061EF, sky: 0x00A4FF, water: 0x2F6BFF, orange: 0xFF7E1D,
    hot: 0xFF5A1F, red: 0xE23B00, green: 0x02873E, violet: 0x5431A5, yellow: 0xFFCE00, rubber: 0x2A2A2E,
    walnut: 0x6B4226, flesh: 0xE9A48B, membrane: 0xF2C14E,
  };

  /* ------------------------------------------------------------------ procedural textures (CanvasTexture) */
  function canvasTex(THREE, w, h, draw, { srgb = true, repeat = null, aniso = 8 } = {}) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }
  const textures = {
    /* wood: long sine-perturbed grain lines, darker latewood, pores (colour map) */
    wood(THREE, { base = '#5B3A24', dark = '#1E1008', light = '#8C603E', seed = 7, repeat = null } = {}) {   // reference walnut
      const r = rng(seed);
      return canvasTex(THREE, 1024, 256, (g, w, h) => {
        g.fillStyle = base; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 70; i++) {
          const y0 = r() * h, amp = 2 + r() * 7, f = 0.004 + r() * 0.01, ph = r() * 6.28;
          g.strokeStyle = r() < 0.55 ? dark : light; g.globalAlpha = 0.10 + r() * 0.22; g.lineWidth = 0.8 + r() * 2.6;
          g.beginPath();
          for (let x = 0; x <= w; x += 8) { const y = y0 + amp * Math.sin(x * f + ph) + 3 * Math.sin(x * f * 3.1 + ph * 2); x ? g.lineTo(x, y) : g.moveTo(x, y); }
          g.stroke();
        }
        g.globalAlpha = 0.18; g.fillStyle = dark;
        for (let i = 0; i < 900; i++) g.fillRect(r() * w, r() * h, 1 + r() * 3, 1);
        g.globalAlpha = 1;
      }, { repeat });
    },
    /* brushed metal: fine streaks (roughness / bump data, linear) */
    brushed(THREE, { seed = 3, base = 150, spread = 60, repeat = [2, 2] } = {}) {
      const r = rng(seed);
      return canvasTex(THREE, 512, 512, (g, w, h) => {
        g.fillStyle = `rgb(${base},${base},${base})`; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 2400; i++) {
          const v = Math.max(0, Math.min(255, base + (r() - 0.5) * spread * 2)) | 0;
          g.fillStyle = `rgba(${v},${v},${v},.5)`; g.fillRect(r() * w, r() * h, 20 + r() * 140, 1);
        }
      }, { srgb: false, repeat });
    },
    /* smooth multi-octave noise (roughness variation; mottled organic colour when tint = [r, g, b]) */
    noise(THREE, { seed = 5, size = 256, scale = 8, octaves = 4, base = 128, spread = 90, repeat = [2, 2], tint = null } = {}) {
      return canvasTex(THREE, size, size, (g, w, h) => {
        const img = g.createImageData(w, h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let v = 0, a = 1, f = scale / w, n = 0;
          for (let o = 0; o < octaves; o++) { v += a * noise3(x * f, y * f, o * 7.1, seed); n += a; a *= 0.5; f *= 2; }
          const k = Math.max(0, Math.min(255, base + v / n * spread)) | 0, i = (y * w + x) * 4;
          if (tint) { img.data[i] = tint[0] * k / 255; img.data[i + 1] = tint[1] * k / 255; img.data[i + 2] = tint[2] * k / 255; }
          else { img.data[i] = img.data[i + 1] = img.data[i + 2] = k; }
          img.data[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
      }, { srgb: !!tint, repeat });
    },
    /* fine speckle (plastics, powder coat, soldermask) */
    speckle(THREE, { seed = 5, base = 128, spread = 40, size = 256, repeat = [3, 3] } = {}) {
      const r = rng(seed);
      return canvasTex(THREE, size, size, (g, w, h) => {
        const img = g.createImageData(w, h);
        for (let i = 0; i < w * h; i++) { const v = Math.max(0, Math.min(255, base + (r() - 0.5) * spread * 2)) | 0; img.data.set([v, v, v, 255], i * 4); }
        g.putImageData(img, 0, 0);
      }, { srgb: false, repeat });
    },
    /* bumps: a tangent-space NORMAL map made from round bumps (skin, cast metal, membranes, cork) */
    bumps(THREE, { seed = 9, size = 256, count = 260, rMin = 3, rMax = 12, strength = 1.2, repeat = [3, 3] } = {}) {
      const r = rng(seed), H = new Float32Array(size * size);
      for (let n = 0; n < count; n++) {
        const cx = r() * size, cy = r() * size, rad = rMin + r() * (rMax - rMin);
        for (let y = -Math.ceil(rad); y <= rad; y++) for (let x = -Math.ceil(rad); x <= rad; x++) {
          const d = Math.hypot(x, y) / rad; if (d >= 1) continue;
          const px = ((Math.round(cx + x) % size) + size) % size, py = ((Math.round(cy + y) % size) + size) % size;
          H[py * size + px] += Math.cos(d * Math.PI / 2) ** 2;
        }
      }
      return canvasTex(THREE, size, size, (g, w, h) => {
        const img = g.createImageData(w, h), at = (x, y) => H[((y + h) % h) * w + ((x + w) % w)];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
          const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
          img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
      }, { srgb: false, repeat });
    },
    /* soft radial glow for sprites (heat, LEDs, sparks, fluorescence) */
    glow(THREE, { inner = 'rgba(255,190,110,1)', mid = 'rgba(255,120,40,.45)', outer = 'rgba(255,90,20,0)' } = {}) {
      return canvasTex(THREE, 128, 128, (g) => {
        const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        gr.addColorStop(0, inner); gr.addColorStop(0.35, mid); gr.addColorStop(1, outer);
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      });
    },
    /* contact shadow blob (under objects so they sit on the floor) */
    contact(THREE) {
      return canvasTex(THREE, 256, 256, (g) => {
        const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
        gr.addColorStop(0, 'rgba(45,44,43,.55)'); gr.addColorStop(0.55, 'rgba(45,44,43,.18)'); gr.addColorStop(1, 'rgba(45,44,43,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      }, { srgb: false });
    },
    /* printed face (dial, chip marking, label, screen): draw(g, w, h) with the 2D canvas API */
    printed(THREE, w, h, draw) { return canvasTex(THREE, w, h, draw); },
  };

  /* ------------------------------------------------------------------ material families (generic factories) */
  const mat = {
    /* metals: copper, steel, aluminium, gold, brass ... (brushed roughness map, optional clear coat) */
    metal(THREE, { color = C.steel, roughness = 0.25, clearcoat = 0, brushed = true, seed = 3 } = {}) {
      return new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness, clearcoat, clearcoatRoughness: 0.18,
        roughnessMap: brushed ? textures.brushed(THREE, { seed }) : null });
    },
    /* real glass: transmission + thickness + IOR (needs the environment for believable reflections) */
    glass(THREE, { tint = 0xFFFFFF, roughness = 0.03, thickness = 0.25, ior = 1.5, attenuation = null, distance = 1 } = {}) {
      const m = new THREE.MeshPhysicalMaterial({ color: tint, metalness: 0, roughness, transmission: 1, thickness, ior, specularIntensity: 1 });
      if (attenuation != null) { m.attenuationColor = new THREE.Color(attenuation); m.attenuationDistance = distance; }
      return m;
    },
    /* plastic / painted / powder-coated (speckle roughness) */
    plastic(THREE, { color = C.white, roughness = 0.5, clearcoat = 0.3, seed = 5 } = {}) {
      return new THREE.MeshPhysicalMaterial({ color, roughness, clearcoat, clearcoatRoughness: 0.3, roughnessMap: textures.speckle(THREE, { seed }) });
    },
    /* ceramic / porcelain / bone / stone: glossy glaze over a matte body */
    ceramic(THREE, { color = 0xF4F1EC, roughness = 0.35, glaze = 0.9 } = {}) {
      return new THREE.MeshPhysicalMaterial({ color, roughness, clearcoat: glaze, clearcoatRoughness: 0.08, sheen: 0.2, sheenColor: new THREE.Color(0xffffff) });
    },
    /* organic / soft: cells, tissue, membranes, rubber, fabric (sheen; translucency > 0 adds transmission, but a
       transmissive object is invisible behind or inside glass, so keep it 0 for anything seen through glass) */
    soft(THREE, { color = C.flesh, roughness = 0.55, sheen = 0.8, sheenColor = 0xFFF1E6, translucency = 0, bumps = true, seed = 9 } = {}) {
      return new THREE.MeshPhysicalMaterial({ color, roughness, sheen, sheenRoughness: 0.5, sheenColor: new THREE.Color(sheenColor),
        transmission: translucency, thickness: 0.8, ior: 1.38, normalMap: bumps ? textures.bumps(THREE, { seed }) : null,
        normalScale: new THREE.Vector2(0.35, 0.35) });
    },
    /* liquids: clear (transmission) or opaque glossy (coloured fluid in a channel) */
    liquid(THREE, { color = C.water, clear = false, roughness = 0.06 } = {}) {
      return clear
        ? new THREE.MeshPhysicalMaterial({ color, roughness, transmission: 0.92, thickness: 0.5, ior: 1.33 })
        : new THREE.MeshPhysicalMaterial({ color, roughness, clearcoat: 1, clearcoatRoughness: 0.05 });
    },
    /* emissive: hot wire, LED, screen, fluorescence (intensity > 3.2 blooms with the default post settings) */
    emissive(THREE, { color = C.hot, intensity = 6, base = 0x2A1208 } = {}) {
      return new THREE.MeshStandardMaterial({ color: base, emissive: color, emissiveIntensity: intensity, roughness: 0.45, metalness: 0.3 });
    },
    wood(THREE, { seed = 7, repeat = null } = {}) {
      return new THREE.MeshPhysicalMaterial({ map: textures.wood(THREE, { seed, repeat }), roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.25 });
    },
  };
  /* ready-made presets; extend with materials(THREE, { extra: (THREE, C, mat) => ({ ... }) }) */
  function materials(THREE, opt = {}) {
    const M = {
      copper: mat.metal(THREE, { color: C.copper, roughness: 0.27, clearcoat: 0.5 }),
      steel: mat.metal(THREE, { color: C.steel, roughness: 0.22 }),
      aluminium: mat.metal(THREE, { color: C.aluminium, roughness: 0.32, seed: 4 }),
      gold: mat.metal(THREE, { color: C.gold, roughness: 0.25, brushed: false }),
      brass: mat.metal(THREE, { color: C.brass, roughness: 0.3 }),
      darkSteel: new THREE.MeshStandardMaterial({ color: C.darkSteel, metalness: 0.4, roughness: 0.35 }),
      glass: mat.glass(THREE),
      plastic: mat.plastic(THREE),
      black: mat.plastic(THREE, { color: 0x1B1B1F, roughness: 0.45, clearcoat: 0.2 }),
      blue: mat.plastic(THREE, { color: C.blue, roughness: 0.4 }),
      ceramic: mat.ceramic(THREE),
      soft: mat.soft(THREE),
      rubber: new THREE.MeshStandardMaterial({ color: C.rubber, roughness: 0.85 }),
      water: mat.liquid(THREE),
      waterClear: mat.liquid(THREE, { color: 0xBFDFFF, clear: true }),
      hot: mat.emissive(THREE),
      led: mat.emissive(THREE, { color: C.sky, intensity: 5, base: 0x0A2A40 }),
      wood: mat.wood(THREE),
    };
    if (opt.extra) Object.assign(M, opt.extra(THREE, C, mat));
    return M;
  }

  /* ------------------------------------------------------------------ shader injection (onBeforeCompile, chainable)
     inject(material, { key, uniforms, vertexPars, vertex, fragmentPars, emissive, fragment })
       vertex     GLSL after #include <begin_vertex>          (edit `transformed`, local space; uv is available)
       emissive   GLSL after #include <emissivemap_fragment>  (add to totalEmissiveRadiance; normal, vViewPosition, vBBUv, vBBPos)
       fragment   GLSL before #include <opaque_fragment>      (edit outgoingLight / diffuseColor)
     Returns the uniforms object: set .value in update(t). Displacement does not reach the shadow map. */
  function inject(m, part) {
    const list = m.userData.bbInject || (m.userData.bbInject = []);
    list.push(part);
    m.customProgramCacheKey = () => 'bb:' + list.map(p => p.key || '').join('|');
    m.onBeforeCompile = (sh) => {
      list.forEach(p => Object.assign(sh.uniforms, p.uniforms || {}));
      const type = u => (u.value && (u.value.isColor || u.value.isVector3)) ? 'vec3' : (u.value && u.value.isVector2) ? 'vec2' : 'float';
      const uDecl = list.flatMap(p => Object.entries(p.uniforms || {}).map(([k, u]) => 'uniform ' + type(u) + ' ' + k + ';')).join('\n');
      sh.vertexShader = 'varying vec2 vBBUv;\nvarying vec3 vBBPos;\n' + uDecl + '\n' + list.map(p => p.vertexPars || '').join('\n') + '\n' +
        sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvBBUv = uv;\n' + list.map(p => p.vertex || '').join('\n') + '\nvBBPos = transformed;');
      sh.fragmentShader = 'varying vec2 vBBUv;\nvarying vec3 vBBPos;\n' + uDecl + '\n' + list.map(p => p.fragmentPars || '').join('\n') + '\n' +
        sh.fragmentShader
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + list.map(p => p.emissive || '').join('\n'))
          .replace('#include <opaque_fragment>', list.map(p => p.fragment || '').join('\n') + '\n#include <opaque_fragment>');
    };
    m.needsUpdate = true;
    return part.uniforms || {};
  }
  const f3 = v => Number(v).toFixed(4);
  const shaders = {
    /* bands along a tube / strand (uv.x runs along TubeGeometry). Set uStripePhase.value = k * t / period for a loop */
    stripes(THREE, m, { count = 12, width = 0.35, color = C.blue, axis = 'x', soft = 0.04, glow = 0 } = {}) {
      const u = { uStripeCol: { value: new THREE.Color(color) }, uStripePhase: { value: 0 } };
      return inject(m, { key: 'stripes' + count + axis, uniforms: u,
        fragmentPars: `float bbStripe(){ float s = fract(vBBUv.${axis} * ${f3(count)} - uStripePhase); return smoothstep(${f3(width / 2 + soft)}, ${f3(width / 2)}, abs(s - 0.5)); }`,
        fragment: `outgoingLight = mix(outgoingLight, uStripeCol * (0.75 + ${f3(glow)}), bbStripe() * 0.85);` });
    },
    /* heat / activity glow ramp along a local axis: uHeat 0..1 (strongest at `from`) */
    heatGlow(THREE, m, { color = C.hot, axis = 'y', from = 0, to = 1, intensity = 5 } = {}) {
      const u = { uHeat: { value: 0 }, uHeatCol: { value: new THREE.Color(color) } };
      return inject(m, { key: 'heat' + axis, uniforms: u,
        emissive: `{ float k = clamp((vBBPos.${axis} - (${f3(from)})) / (${f3(to - from)}), 0.0, 1.0); totalEmissiveRadiance += uHeatCol * pow(1.0 - k, 2.0) * uHeat * ${f3(intensity)}; }` });
    },
    /* Fresnel rim light: separates soft or glass objects from the pale background */
    rim(THREE, m, { color = 0xFFFFFF, power = 2.5, strength = 0.6 } = {}) {
      const u = { uRimCol: { value: new THREE.Color(color) }, uRimK: { value: strength } };
      return inject(m, { key: 'rim' + power, uniforms: u,
        emissive: `{ float fr = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), ${f3(power)}); totalEmissiveRadiance += uRimCol * fr * uRimK; }` });
    },
    /* vertex displacement: glsl edits `transformed` (local) using uT (set it to t) and uv - e.g. a wobbling surface */
    displace(THREE, m, glsl, key = 'disp') {
      return inject(m, { key, uniforms: { uT: { value: 0 } }, vertex: glsl });
    },
  };

  /* ------------------------------------------------------------------ the softbox environment (IBL)
     Measured from the reference deck's own renders: a warm grey room with big emissive softboxes (a strong top box,
     a warm box at the left, a cool one at the right) and two near-black FLAGS that give metal and glass their dark edge
     reflections, plus a darker floor. Prefiltered with PMREM (sigma 0.02), so materials get photographic highlights
     without any image file. variant 'stage' (the 3D-beside-text slides) or 'cyc' (the full-bleed title studio). */
  function studioEnvironment(THREE, renderer, variant = 'stage') {
    const room = new THREE.Scene(), cyc = variant === 'cyc';
    const shell = new THREE.Mesh(new THREE.BoxGeometry(...(cyc ? [50, 26, 50] : [40, 20, 40])),
      new THREE.MeshBasicMaterial({ color: cyc ? 0xE9E5DF : 0xECEAE2, side: THREE.BackSide }));
    shell.position.y = cyc ? 9 : 6; room.add(shell);
    const panel = (w, h, color, k, x, y, z, rx, ry) => {
      const m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }); m.color.multiplyScalar(k);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(x, y, z); p.rotation.set(rx, ry, 0); room.add(p);
    };
    if (cyc) {
      panel(16, 7, 0xFFFFFF, 7, 0, 20, 4, Math.PI / 2, 0);              // top softbox
      panel(5, 12, 0xFFF4E6, 5, -16, 9, 12, 0, Math.PI / 2.3);           // warm key-side box
      panel(4, 12, 0xEAF0FF, 4, 17, 9, 6, 0, -Math.PI / 2.2);            // cool fill box
      panel(5, 18, 0x121214, 1, -9, 8, -6, 0, Math.PI / 3);              // black flags: dark edges on metal and glass
      panel(4, 18, 0x121214, 1, 11, 8, -10, 0, -Math.PI / 4);
      panel(50, 50, 0x8A7F72, 1, 0, -3.9, 0, -Math.PI / 2, 0);           // floor bounce
    } else {
      panel(14, 6, 0xFFFFFF, 6, 0, 16, 3, Math.PI / 2, 0);
      panel(4, 10, 0xFFF0E4, 4, -14, 7, 8, 0, Math.PI / 2.3);
      panel(4, 14, 0x141416, 1, 12, 7, -4, 0, -Math.PI / 4);
      panel(3, 14, 0x141416, 1, -9, 7, -8, 0, Math.PI / 3);
    }
    const pmrem = new THREE.PMREMGenerator(renderer);
    const target = pmrem.fromScene(room, 0.02);
    pmrem.dispose();
    room.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    return target;
  }

  /* ------------------------------------------------------------------ post-processing
     MOVED. The bloom / depth-of-field / crease-AO / FXAA chain that used to live here is now the one shared stack in
     engine/deck/lib/post.js (LumiPost), and whether a slide gets it is engine/deck/lib/post-policy.js (LumiPostPolicy).
     Bold Blue's default is unchanged: the `clinical` preset is pixel-for-pixel the configuration that shipped here.
     A deck that wants more says so on the slide - <section class="slide" data-post="showpiece"> - or in the scene -
     BB3D.studio(ctx, { post: 'cinematic' }).
     A build folder made before v0.5.6 does not load those two files; such a deck renders without post and says so once
     in the console rather than failing. Repack it, or add the two <script src> lines its <head> is missing. */
  let warnedNoPost = false;
  function makePost(ctx, THREE, renderer, scene, camera, scenePost, focusTarget, lightAt) {
    if (!window.LumiPost || !window.LumiPostPolicy) {
      if (!warnedNoPost) { warnedNoPost = true; console.warn('Bold Blue: engine/deck/lib/post.js and post-policy.js are not loaded, so 3D slides render without post-processing. Repack the deck (or re-create it with new_deck.js) to get them.'); }
      return null;
    }
    const decision = window.LumiPostPolicy.resolve({ el: ctx.el, scenePost: scenePost });
    // depth of field focuses on what the camera is looking at, not on a number guessed at authoring time: the orbit
    // changes the camera's distance to the subject every frame, so a fixed focus plane drifts off it.
    if (decision.enabled && decision.cfg.focusTarget == null) decision.cfg.focusTarget = focusTarget;
    // light shafts stream from the key light, the one light every studio has
    if (decision.enabled && decision.cfg.shaftFrom == null) decision.cfg.shaftFrom = lightAt;
    const post = window.LumiPostPolicy.make(THREE, renderer, scene, camera, decision);
    if (post) post.decision = decision; else if (ctx.el) ctx.el.dataset.postOff = decision.reason;
    return post;
  }

  /* ------------------------------------------------------------------ camera continuation (LOOK-BASE 4.8)
     Slide N+1's camera starts where slide N's ended, so a deck reads as one space. DECLARED, NEVER INHERITED: the pose a
     slide starts from is read from the previous slide's MARKUP (its holder's data-camera), not from a camera that
     happened to render before - so seek(t) stays a pure function of t, a deck opened on slide 7 shows what the video
     shows, and reordering slides keeps it right. Runtime hand-over (slide N writes its final camera, N+1 reads it) is
     refused for the same reason post.js refuses AfterimagePass. "Where N ended" is N's declared rest pose. */
  function declaredPose(el) {
    const raw = el && el.dataset ? el.dataset.camera : null;
    if (!raw) return null;
    const n = v => typeof v === 'number' && isFinite(v);
    try {
      const p = JSON.parse(raw);
      if (!n(p.azimuth) || !n(p.elevation) || !n(p.distance)) return null;
      const out = { azimuth: p.azimuth, elevation: p.elevation, distance: p.distance };
      if (Array.isArray(p.target) && p.target.length === 3 && p.target.every(n)) out.target = p.target;
      if (n(p.fov)) out.fov = p.fov;
      return out;
    } catch (e) { return null; }
  }
  function previousPose(el) {
    const slide = el.closest ? el.closest('.slide') : null;
    let p = slide ? slide.previousElementSibling : null;
    while (p && !p.classList.contains('slide')) p = p.previousElementSibling;
    return p ? declaredPose(p.querySelector('.aura-3d[data-camera]')) : null;
  }
  const smooth = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

  /* ------------------------------------------------------------------ the studio
     Two presets, both measured from the reference renders:
       stage (default)  the 3D beside text: transparent canvas, shadow-only floor (opacity .14), key light from the upper
                        LEFT (warm 0xFFF4EC, 2.3), hemisphere fill .55, VSM shadow radius 12 / 16 samples
       cyc: true        the full-bleed title studio: an opaque photo cyclorama (floor 0xEFEAE8, self-lit .34, curving up
                        into the back wall with radius 11, background 0xF1EEEA), a long lens (fov 24, distance ~30), key
                        2.6 from (-7, 13, 10), a cool fill 0.6 from the right, hemisphere .45, VSM radius 14 / 20 samples,
                        and the frame shifted so the object sits in the right half (shift -0.25)
     opts: fov, exposure, target, distance, azimuth, elevation (degrees), key [x,y,z] (offset from target), keyIntensity,
           fill (cool fill intensity, 0 = none), hemi, shadows 'vsm' | 'pcfsoft', shadowBox, floorY, floorOpacity,
           envIntensity, shift (horizontal frame shift, fraction of the width: -0.25 puts the target at 3/4 width),
           staging is per SUBJECT and optional, nothing below is a default prop: floor 'shadow' (default: a shadow-only
           ground) | 'none' (no ground at all: a molecule, a cell, a vehicle in flight, a floating cutaway),
           sky true | { top, bottom } (a flight / open-air backdrop: a soft cream-to-pale-blue gradient behind the
           subject, opaque, no fog, no dark sky; pair it with floor: 'none'), cyc: true (a clean cyclorama - only when nothing
           in the subject's own world is better),
           flicker { at, color, intensity, distance } (a warm practical light; S.flicker(t) animates it),
           post true (default: let the look's policy and the slide's position decide, which for Bold Blue is the
           `clinical` preset on every slide - exactly what has always shipped) | false (never) | a preset name
           ('clinical' | 'showpiece' | 'cinematic' | 'off') | { bloom, threshold, strength, radius, ao, aoRadius,
           aoIntensity, dof, focus, aperture, maxBlur, fxaa }. A slide can override without touching the scene:
           <section class="slide" data-post="showpiece">. See engine/deck/lib/post-policy.js for the precedence,
           the hero rule and the honesty gate, adaptive (default true)
     on the holder (camera continuation, LOOK-BASE 4.8): data-camera='{"azimuth":..,"elevation":..,"distance":..,
           "target":[x,y,z],"fov":..}' is this slide's rest pose and WINS over the same opts; data-camera-from="prev"
           starts the loop on the previous slide's declared rest pose (see continuation below) */
  function studio(ctx, o = {}) {
    const { THREE, renderer, width, height } = ctx;
    const cyc = !!o.cyc;
    const base = cyc
      ? { fov: 24, exposure: 1, target: [0, 1.6, 0], distance: 30, azimuth: -16, elevation: 5, key: [-7, 13, 10], keyIntensity: 2.6, fill: 0.6,
          hemi: 0.45, shadowRadius: 14, shadowSamples: 20, shift: -0.25, cycColor: 0xEFEAE8, background: 0xF1EEEA, cycRadius: 5, cycBack: -5.5, cycGlow: 0.2, horizon: 0.3 }
      : { fov: 30, exposure: 1, target: [0, 1, 0], distance: 12, azimuth: -22, elevation: 14, key: [-5, 11, 8], keyIntensity: 2.3, fill: 0,
          hemi: 0.55, shadowRadius: 12, shadowSamples: 16, shift: 0 };
    const el0 = ctx.el && ctx.el.dataset ? ctx.el : null;
    const own = declaredPose(el0);
    if (el0 && el0.dataset.camera && !own) console.warn('Bold Blue: data-camera on scene "' + el0.dataset.scene + '" is not {"azimuth","elevation","distance"} JSON, so it is ignored.');
    const opt = Object.assign(base, { shadows: 'vsm', shadowBox: 12, floorY: 0, floorOpacity: 0.14, envIntensity: 1, flicker: null,
      post: true, adaptive: true }, o, own || {});
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = opt.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = opt.shadows === 'pcfsoft' ? THREE.PCFShadowMap : THREE.VSMShadowMap;
    const skyOpt = opt.sky ? Object.assign({ top: '#D9E6F6', bottom: '#F6F0E8' }, opt.sky === true ? {} : opt.sky) : null;
    renderer.setClearColor(cyc ? opt.background : skyOpt ? new THREE.Color(skyOpt.bottom) : 0x000000, cyc || skyOpt ? 1 : 0);
    const scene = new THREE.Scene();
    if (cyc) scene.background = new THREE.Color(opt.background);
    else if (skyOpt) {      // open-air / flight backdrop: a vertical gradient, never dark
      const cv = document.createElement('canvas'); cv.width = 16; cv.height = 512;
      const g2 = cv.getContext('2d'), gr = g2.createLinearGradient(0, 0, 0, 512);
      gr.addColorStop(0, skyOpt.top); gr.addColorStop(1, skyOpt.bottom); g2.fillStyle = gr; g2.fillRect(0, 0, 16, 512);
      const tex = new THREE.CanvasTexture(cv); if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
      scene.background = tex;
    }
    const envRT = studioEnvironment(THREE, renderer, cyc ? 'cyc' : 'stage');
    scene.environment = envRT.texture;
    if ('environmentIntensity' in scene) scene.environmentIntensity = opt.envIntensity;

    const camera = new THREE.PerspectiveCamera(opt.fov, width / height, 0.1, 400);
    const frame = (w, h) => { if (opt.shift) camera.setViewOffset(w, h, w * opt.shift, 0, w, h); else camera.clearViewOffset(); };
    frame(width, height);
    const target = new THREE.Vector3(...opt.target);
    const tmp = new THREE.Vector3();
    const place = (az, el, dist, tgt) => {
      const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
      const tg = tgt ? (tgt.isVector3 ? tgt : tmp.set(tgt[0], tgt[1], tgt[2])) : target;
      camera.position.set(tg.x + dist * Math.sin(a) * Math.cos(e), tg.y + dist * Math.sin(e), tg.z + dist * Math.cos(a) * Math.cos(e));
      camera.lookAt(tg);
    };
    // continuation: the previous slide's rest pose, captured once as a position + orientation (+ lens), then the camera
    // goes back to this slide's own pose
    let cont = null;
    if (el0 && el0.dataset.cameraFrom) {
      const from = el0.dataset.cameraFrom === 'prev' ? previousPose(el0) : null;
      if (from) {
        place(from.azimuth, from.elevation, from.distance, from.target);
        cont = { pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: from.fov };
      } else console.warn('Bold Blue: data-camera-from="' + el0.dataset.cameraFrom + '" on scene "' + el0.dataset.scene + '" found no data-camera on the previous slide, so this slide starts on its own pose.');
    }
    place(opt.azimuth, opt.elevation, opt.distance);

    // key light (warm, upper left, soft VSM shadow) + optional cool fill from the right + hemisphere
    const key = new THREE.DirectionalLight(0xFFF4EC, opt.keyIntensity);
    key.position.set(target.x + opt.key[0], target.y + opt.key[1], target.z + opt.key[2]);
    key.target.position.copy(target);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const b = opt.shadowBox;
    Object.assign(key.shadow.camera, { left: -b, right: b, top: b, bottom: -b * 0.5, near: 1, far: 60 });
    if (opt.shadows === 'vsm') { key.shadow.radius = opt.shadowRadius; key.shadow.blurSamples = opt.shadowSamples; key.shadow.bias = -0.0005; }
    else { key.shadow.radius = 6; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; }
    scene.add(key, key.target);
    if (opt.fill) { const f = new THREE.DirectionalLight(0xE6EFFF, opt.fill); f.position.set(target.x + 10, target.y + 6, target.z + 6); scene.add(f); }
    scene.add(new THREE.HemisphereLight(0xFFFFFF, 0xD8CEC4, opt.hemi));
    let flick = null;
    if (opt.flicker) {
      const f = Object.assign({ at: [0, 0.5, 0], color: 0xFF6A24, intensity: 7, distance: 5.5 }, opt.flicker);
      flick = new THREE.PointLight(f.color, f.intensity, f.distance, 1.7); flick.position.set(...f.at); flick.userData.base = f.intensity; scene.add(flick);
    }
    // floor: shadow only (the slide canvas shows through), or the photo cyclorama (one swept surface: floor, cove, wall)
    let floor;
    if (cyc) {
      const m = new THREE.MeshStandardMaterial({ color: opt.cycColor, roughness: 0.95, metalness: 0, emissive: opt.cycColor, emissiveIntensity: opt.cycGlow,
        side: THREE.DoubleSide, vertexColors: true });
      const R = opt.cycRadius, back = target.z + opt.cycBack, y0 = opt.floorY, pts = [[back + 80, y0], [back, y0]];
      for (let i = 1; i <= 48; i++) { const a = i / 48 * Math.PI / 2; pts.push([back - R * Math.sin(a), y0 + R - R * Math.cos(a)]); }
      pts.push([back - R, y0 + 70]);
      const pos = [], idx = [];
      pts.forEach(([z, y]) => pos.push(-120, y, z, 120, y, z));
      // the horizon falloff measured on the reference render: bright floor, a soft darker band where the floor turns
      // into the wall (about 13 % darker), lifting again up the wall
      const col = [];
      pts.forEach(([z, y]) => {
        const into = Math.max(0, Math.min(1, (back + 7 - z) / 7)), up = Math.max(0, y - y0) / R;
        const k = 1 - opt.horizon * (0.55 * into + 0.45 * Math.min(1, up)) + opt.horizon * 0.55 * Math.max(0, Math.min(1, (y - y0 - R) / 30));
        col.push(k, k, k, k, k, k);
      });
      const gcol = new THREE.Float32BufferAttribute(col, 3);
      for (let i = 0; i < pts.length - 1; i++) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.setAttribute('color', gcol); g.computeVertexNormals();
      floor = new THREE.Mesh(g, m); floor.receiveShadow = true; floor.userData.shadow = false;
    } else {
      floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.ShadowMaterial({ opacity: opt.floorOpacity }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = opt.floorY; floor.receiveShadow = true; floor.userData.shadow = false;
      if (opt.floor === 'none') { floor.visible = false; floor.receiveShadow = false; }     // nothing to stand on: it flies, floats or hangs
    }
    scene.add(floor);

    // `post` defaults to true, which the policy expands to the look's tier preset (Bold Blue: `clinical`, the
    // configuration that has always shipped). `post: false`, `post: 'cinematic'` or a config object still win outright.
    const post = makePost(ctx, THREE, renderer, scene, camera, opt.post === true ? undefined : opt.post, target, key.position);
    const extra = [], labelSets = [];
    // adaptive quality: only during the live talk; capture and still frames always render at full quality
    const adaptive = opt.adaptive && !ctx.capture && !ctx.still;
    let frames = 0, acc = 0, lastNow = 0, level = 0;
    function measure() {
      if (!adaptive) return;
      const now = performance.now();
      if (lastNow) { const dt = now - lastNow; if (dt < 250) { acc += dt; frames++; } }
      lastNow = now;
      if (frames < 45) return;
      const avg = acc / frames; frames = 0; acc = 0;
      if (avg < 24 || level >= 4) return;
      level++;
      if (post && post.degrade()) { /* LumiPost drops shafts, then dof, then ao, then bloom, then fxaa */ }
      else if (key.shadow.mapSize.x > 1024) { key.shadow.mapSize.set(1024, 1024); if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; } }
      else { renderer.setPixelRatio(Math.max(0.5, renderer.getPixelRatio() * 0.75)); const s = new THREE.Vector2(); renderer.getSize(s); renderer.setSize(s.x, s.y, false); }
    }

    let motionGate = null;
    const motion = () => motionGate || (motionGate = (() => {
      const g = window.LumiPostPolicy && window.LumiPostPolicy.cameraMotion && ctx.el ? window.LumiPostPolicy.cameraMotion(ctx.el) : { moving: true };
      if (!g.moving && ctx.el) ctx.el.dataset.cameraMove = 'held: ' + g.reason;
      return g;
    })());
    const S = {
      THREE, scene, camera, key, floor, target, flickerLight: flick, post, renderer, period: ctx.period,
      get quality() { return level; },
      add(...objs) {
        objs.forEach(x => { scene.add(x); x.traverse && x.traverse(m => { if (m.isMesh && m.userData.shadow !== false) { m.castShadow = m.userData.cast !== false; m.receiveShadow = true; } }); });
        return objs[0];
      },
      place,
      /* periodic orbit: azimuth, elevation and distance drift on harmonics 1, 2 and 3 of the loop period - unhurried
         and irregular to the eye, but exactly back at its start at t = period */
      orbit(t, s = {}) {
        if (!motion().moving) return place(s.azimuth ?? opt.azimuth, s.elevation ?? opt.elevation, s.distance ?? opt.distance, s.target);
        const P = s.period || ctx.period || 20, w = TAU * (((t % P) + P) % P) / P;
        const az = (s.azimuth ?? opt.azimuth) + (s.swayAz ?? 7) * Math.sin(w) + (s.swayAz2 ?? 2) * Math.sin(3 * w + 0.6);
        const el = (s.elevation ?? opt.elevation) + (s.swayEl ?? 1.6) * Math.sin(2 * w + 1.1);
        const dist = (s.distance ?? opt.distance) * (1 + (s.breathe ?? 0.015) * Math.sin(w + 2.3));
        place(az, el, dist, s.target);
      },
      /* LOOK-BASE 4.11: a named camera setup, the same vocabulary as lumi_bpy.move() so a live slide and a Blender one
         are directed in one language. S.shot(t, 'crane' | 'dolly' | 'push' | 'orbit' | 'whip' | 'sway' | 'still',
         { amount, sway, azimuth, elevation, distance, fov, target }). Every offset is periodic in the loop (one-way
         moves go there and back on (1 - cos w) / 2), so seek(0) == seek(period) and t = 0 is the rest pose. A slide
         with measured values holds the rest pose (LumiPostPolicy.cameraMotion). */
      shot(t, name = 'sway', s = {}) {
        const az0 = s.azimuth ?? opt.azimuth, el0 = s.elevation ?? opt.elevation, d0 = s.distance ?? opt.distance, f0 = s.fov ?? opt.fov;
        if (!motion().moving) name = 'still';
        const P = s.period || ctx.period || 20, u = (((t % P) + P) % P) / P, w = TAU * u, U = (1 - Math.cos(w)) / 2;
        const k = name === 'orbit' ? Math.max(1, Math.round(s.amount ?? 1)) : (s.amount ?? 1);   // only whole turns close
        const h = (n, ph) => Math.sin(n * w + ph) - Math.sin(ph);                            // 0 at t = 0: the rest pose
        const o = ({
          still: {}, sway: {},
          crane: { el: 18 * k * U, dist: 1 + 0.22 * k * U, fov: 1 + 0.2 * k * U },
          dolly: { az: 30 * k * U, dist: 1 - 0.22 * k * U, fov: 1 - 0.15 * k * U },
          push: { dist: 1 - 0.2 * k * U, fov: 1 - 0.12 * k * U, az: 4 * k * U },
          orbit: { az: 360 * k * u },
          whip: { az: 360 * (u - 0.85 * Math.sin(4 * w) / (4 * TAU)), el: 8 * k * Math.sin(w) },
        })[name];
        if (!o) throw new Error(`BB3D S.shot: unknown setup "${name}"`);
        const a = name === 'still' ? 0 : (name === 'sway' ? k : (s.sway || 0));     // the handheld drift, lumi_bpy._sway
        const az = az0 + (o.az || 0) + a * (1.2 * h(1, 0) + 0.4 * h(3, 0.6));
        const el = el0 + (o.el || 0) + a * 0.6 * h(2, 1.1);
        const dist = d0 * (o.dist || 1) * (1 + a * 0.012 * h(1, 2.3));
        const fov = f0 * (o.fov || 1);
        if (Math.abs(camera.fov - fov) > 1e-9) { camera.fov = fov; camera.updateProjectionMatrix(); }
        place(az, el, dist, s.target);
        if (a) camera.rotateZ(a * 0.25 * h(1, 0.9) * Math.PI / 180);
      },
      /* camera tour from BBTime.tour: S.tour(tour(t)) */
      tour(shot) { camera.position.set(shot.pos[0], shot.pos[1], shot.pos[2]); camera.lookAt(shot.target[0], shot.target[1], shot.target[2]); },
      /* periodic flicker of the practical light (harmonics 7, 13, 29 of the period) */
      flicker(t, depth = 0.18) {
        if (!flick) return;
        const P = ctx.period || 10, w = TAU * (((t % P) + P) % P) / P;
        flick.intensity = flick.userData.base * (1 + depth * (0.5 * Math.sin(7 * w) + 0.3 * Math.sin(13 * w + 1.7) + 0.2 * Math.sin(29 * w + 0.4)));
      },
      track(x) { extra.push(x); return x; },     // textures / targets made by hand, freed on dispose
      labels(set) { labelSets.push(set); return set; },
      api(o2 = {}) {
        /* continuation over one loop: ease in from the previous slide's pose over the first 20 % of the period, hold
           this slide's own camera (orbit and all) for 60 %, ease back over the last 20 %, so seek(0) == seek(period)
           and the loop seam IS the previous slide's pose. The still frame (0.35 P) sits in the hold. The camera is
           reset to its setup pose before every update, so a scene that never moves it cannot accumulate the blend. */
        const basePos = camera.position.clone(), baseQuat = camera.quaternion.clone(), baseFov = camera.fov, q = new THREE.Quaternion();
        const blend = t => {
          const P = ctx.period || 0, u = P ? (((t % P) + P) % P) / P : 0.5, e = smooth(0, 0.2, u) * (1 - smooth(0.8, 1, u));
          camera.position.lerpVectors(cont.pos, camera.position, e);
          // slerpQuaternions copies its FIRST argument into `this` before reading the second, so the camera's own
          // orientation must be copied out first or the result is always the previous slide's orientation
          camera.quaternion.slerpQuaternions(cont.quat, q.copy(camera.quaternion), e);
          if (cont.fov) { camera.fov = cont.fov + (baseFov - cont.fov) * e; camera.updateProjectionMatrix(); }
        };
        return Object.assign({ scene, camera }, o2, {
          update(t, dt) {
            if (cont) { camera.position.copy(basePos); camera.quaternion.copy(baseQuat); }
            if (o2.update) o2.update(t, dt);
            if (cont) blend(t);
            camera.updateMatrixWorld(); labelSets.forEach(l => { l.time(t); l.update(); }); },
          render(t, dt) { measure(); if (post) post.render(); else { renderer.setRenderTarget(null); renderer.render(scene, camera); } if (o2.render) o2.render(t, dt); },
          resize(w, h) { frame(w, h); camera.updateProjectionMatrix(); if (post) post.resize(); labelSets.forEach(l => l.update()); if (o2.resize) o2.resize(w, h); },
          dispose() { try { o2.dispose && o2.dispose(); } catch (e) { /* ignore */ } envRT.dispose(); if (post) post.dispose(); extra.forEach(x => x.dispose && x.dispose()); },
        });
      },
    };
    return S;
  }

  /* ------------------------------------------------------------------ projected labels
     labels(S, holderEl, { name: anchor, ... }): every element inside the holder with data-follow="name" moves each frame
     so it sits beside the 3D anchor. anchor: [x, y, z] | THREE.Object3D | (t) => [x, y, z].
     On the label: data-align="left|right|center" (text to the right of the point, to its left, or centred on it),
     data-dx / data-dy (px offset, default 24 / 0). Labels are kept inside the holder and the slide's 96 px safe zone. */
  function labels(S, holder, anchors) {
    const THREE = S.THREE, v = new THREE.Vector3();
    const els = Array.from(holder.querySelectorAll('[data-follow]'));
    els.forEach(el => { el.style.left = '0px'; el.style.top = '0px'; });
    let time = 0;
    const set = {
      time(t) { time = t; },
      update() {
        const w = holder.offsetWidth, h = holder.offsetHeight, slide = holder.closest('.slide');
        let ox = 0, oy = 0;
        if (slide) { for (let e = holder; e && e !== slide && slide.contains(e); e = e.offsetParent) { ox += e.offsetLeft; oy += e.offsetTop; } }
        els.forEach(el => {
          const a = anchors[el.dataset.follow]; if (!a) return;
          if (Array.isArray(a)) v.set(a[0], a[1], a[2]);
          else if (typeof a === 'function') { const p = a(time); v.set(p[0], p[1], p[2]); }
          else if (a.isObject3D) a.getWorldPosition(v);
          v.project(S.camera);
          const hidden = v.z > 1 || v.z < -1;
          const align = el.dataset.align || 'left', dx = parseFloat(el.dataset.dx || '24'), dy = parseFloat(el.dataset.dy || '0');
          const ew = el.offsetWidth, eh = el.offsetHeight;
          let x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
          x = align === 'right' ? x - dx - ew : align === 'center' ? x - ew / 2 : x + dx;
          y = y + dy - eh / 2;
          x = Math.max(Math.max(0, 96 - ox), Math.min(x, Math.min(w, 1824 - ox) - ew));
          y = Math.max(Math.max(0, 96 - oy), Math.min(y, Math.min(h, 984 - oy) - eh));
          el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
          el.style.visibility = hidden ? 'hidden' : '';
        });
      },
    };
    return S.labels(set);
  }

  /* ------------------------------------------------------------------ geometry helpers */
  const V = (THREE, p) => (p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2] || 0));
  function curve(THREE, pts, closed = false) { return new THREE.CatmullRomCurve3(pts.map(p => V(THREE, p)), closed, 'centripetal'); }
  function tube(THREE, pts, radius, material, { closed = false, segs = null, radial = 24 } = {}) {
    const c = pts.isCurve ? pts : curve(THREE, pts, closed);
    const g = new THREE.TubeGeometry(c, segs || Math.max(64, Math.round(c.getLength() * 40)), radius, radial, closed);
    const m = new THREE.Mesh(g, material); m.castShadow = true; m.receiveShadow = true; m.userData.curve = c; return m;
  }
  /* a path of straight runs and round bends. seg: ['L', x, y] line to, ['A', cx, cy, r, a0, a1] arc */
  function path2d(THREE, start, segs, z = 0, step = 0.07) {
    const out = [new THREE.Vector3(start[0], start[1], z)]; let cur = out[0].clone();
    for (const s of segs) {
      if (s[0] === 'L') {
        const n = Math.max(2, Math.round(Math.hypot(s[1] - cur.x, s[2] - cur.y) / step));
        for (let i = 1; i <= n; i++) out.push(new THREE.Vector3(cur.x + (s[1] - cur.x) * i / n, cur.y + (s[2] - cur.y) * i / n, z));
      } else {
        const [, cx, cy, r, a0, a1] = s, n = Math.max(8, Math.round(Math.abs(a1 - a0) * r / step));
        for (let i = 1; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push(new THREE.Vector3(cx + r * Math.cos(a), cy + r * Math.sin(a), z)); }
      }
      cur = out[out.length - 1].clone();
    }
    return out;
  }
  function roundedBox(THREE, w, h, d, r = 0.08, material, segs = 4) {
    r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
    const s = new THREE.Shape(), x = -w / 2 + r, y = -h / 2 + r, W = w - 2 * r, H = h - 2 * r;
    s.moveTo(x, y - r); s.lineTo(x + W, y - r); s.absarc(x + W, y, r, -Math.PI / 2, 0); s.lineTo(x + W + r, y + H);
    s.absarc(x + W, y + H, r, 0, Math.PI / 2); s.lineTo(x, y + H + r); s.absarc(x, y + H, r, Math.PI / 2, Math.PI);
    s.lineTo(x - r, y); s.absarc(x, y, r, Math.PI, 1.5 * Math.PI);
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(1e-3, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r * 0.999, bevelSegments: segs, curveSegments: segs * 2 });
    g.translate(0, 0, -(d - 2 * r) / 2); g.computeVertexNormals();
    const m = new THREE.Mesh(g, material); m.castShadow = true; m.receiveShadow = true; return m;
  }
  /* helix points (springs, coils, DNA / RNA backbones, threads) around axis Y */
  function helix(THREE, { x = 0, z = 0, y0 = 0, y1 = 1, r = 0.18, turns = 9, phase = 0, perTurn = 24 } = {}) {
    const pts = [], n = Math.max(8, Math.round(turns * perTurn));
    for (let i = 0; i <= n; i++) { const a = phase + i / perTurn * TAU; pts.push(new THREE.Vector3(x + r * Math.cos(a), y0 + (y1 - y0) * i / n, z + r * Math.sin(a))); }
    return pts;
  }
  function coil(THREE, o, material) { return tube(THREE, helix(THREE, o), o.wire || 0.026, material, { segs: Math.round((o.turns || 9) * 48), radial: 8 }); }
  /* lathe from a 2D profile [[r, y], ...] (bottles, vials, beakers, knobs, droplets, capsules) */
  function lathe(THREE, profile, material, segs = 64) {
    const m = new THREE.Mesh(new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(p[0], p[1])), segs), material);
    m.castShadow = true; m.receiveShadow = true; return m;
  }
  /* organic blob: a sphere pushed out by smooth noise (cells, droplets, particles, rocks, organs). An indexed sphere,
     so the normals are smooth (an icosphere is non-indexed and would shade faceted). */
  function blob(THREE, { radius = 1, detail = 5, amount = 0.12, freq = 1.6, seed = 1 } = {}, material) {
    const seg = Math.max(24, detail * 20);
    const g = new THREE.SphereGeometry(radius, seg, Math.round(seg * 0.66)), p = g.attributes.position, v = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      n.fromBufferAttribute(p, i).normalize();
      const k = 1 + amount * (noise3(n.x * freq + 3, n.y * freq, n.z * freq, seed) + 0.5 * noise3(n.x * freq * 2.1, n.y * freq * 2.1 + 5, n.z * freq * 2.1, seed + 1));
      v.copy(n).multiplyScalar(radius * k); p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material); m.castShadow = true; m.receiveShadow = true; return m;
  }
  /* many copies of one shape: layout(fn(i, dummy)) sets dummy.position / rotation / scale for copy i */
  function instanced(THREE, geometry, material, count, place) {
    const im = new THREE.InstancedMesh(geometry, material, count), d = new THREE.Object3D();
    im.castShadow = true; im.receiveShadow = true;
    im.userData.layout = (fn) => {
      for (let i = 0; i < count; i++) { d.position.set(0, 0, 0); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); fn(i, d); d.updateMatrix(); im.setMatrixAt(i, d.matrix); }
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
    };
    if (place) im.userData.layout(place);
    return im;
  }
  /* soft contact shadow under an object (weight where the key-light shadow is too soft) */
  function contactShadow(THREE, w, d, { y = 0.002, opacity = 0.6 } = {}) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: textures.contact(THREE), transparent: true, depthWrite: false, opacity, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = y; m.userData.shadow = false; m.renderOrder = -1; return m;
  }
  /* additive glow sprite (heat, LEDs, fluorescence) */
  function glowSprite(THREE, color = 0xFF7A2A, size = 1, opacity = 0.9) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.glow(THREE), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
    sp.scale.setScalar(size); sp.userData.shadow = false; return sp;
  }
  /* things that ride along a curve (beads, packets, cars, charges): im.userData.place(offset 0..1) */
  function along(THREE, crv, count, geometry, material) {
    const im = new THREE.InstancedMesh(geometry, material, count);
    im.castShadow = true; im.receiveShadow = true;
    const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
    im.userData.place = (offset) => {
      for (let i = 0; i < count; i++) {
        const u = (((i / count + offset) % 1) + 1) % 1;
        q.setFromUnitVectors(up, crv.getTangentAt(u)); m4.compose(crv.getPointAt(u), q, one); im.setMatrixAt(i, m4);
      }
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
    };
    im.userData.place(0);
    return im;
  }
  /* ---- micro-detail: the small parts that make a model read as a manufactured object ---- */
  /* hex-head bolt / screw standing on +Y (fasteners, terminals, clamps) */
  function bolt(THREE, { r = 0.06, head = 0.05, len = 0.15 } = {}, material) {
    const g = new THREE.Group();
    const h = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.15, r * 1.15, head, 6), material); h.position.y = len + head / 2;
    const w = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.5, r * 1.5, r * 0.25, 24), material); w.position.y = len + r * 0.12 - head * 0;
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, len, 16), material); sh.position.y = len / 2;
    [h, w, sh].forEach(m => { m.castShadow = true; m.receiveShadow = true; g.add(m); });
    return g;
  }
  /* a lathe with n ridges between y0 and y1 (crimp caps, knurled knobs, threads, grips, bellows) */
  function ridged(THREE, { r = 0.3, y0 = 0, y1 = 0.3, n = 8, depth = 0.015, top = true } = {}, material, segs = 64) {
    const prof = [[0, y0], [r - depth, y0]];
    for (let i = 0; i <= n * 8; i++) { const k = i / (n * 8), y = y0 + (y1 - y0) * k; prof.push([r - depth + depth * (0.5 + 0.5 * Math.cos(k * n * Math.PI * 2)), y]); }
    if (top) prof.push([r - depth * 2, y1 + depth], [0, y1 + depth]);
    return lathe(THREE, prof, material, segs);
  }
  /* a printed label wrapped round a cylinder (vials, bottles, cans, cable tags): draw(g, w, h) paints it */
  function wrapLabel(THREE, { r = 0.3, y = 0, h = 0.4, arc = Math.PI * 1.2, start = -Math.PI * 0.6 } = {}, draw) {
    const tex = textures.printed(THREE, 1024, Math.round(1024 * h / (r * arc)), draw);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 64, 1, true, start, arc),
      new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.55, clearcoat: 0.3, side: THREE.FrontSide }));
    m.position.y = y + h / 2; m.castShadow = false; m.receiveShadow = true; return m;
  }
  /* a cylinder with chamfered (bevelled) edges: discs, stages, pucks, buttons, pins - no razor-sharp CG edges */
  function chamferCylinder(THREE, { r = 1, h = 0.2, c = 0.03 } = {}, material, segs = 96) {
    return lathe(THREE, [[0, 0], [r - c, 0], [r, c], [r, h - c], [r - c, h], [0, h]], material, segs);
  }

  /* glowing-metal colour for a normalised temperature 0..1 */
  function incandescent(THREE, k) {
    k = Math.max(0, Math.min(1, k));
    const stops = [[0, [0.18, 0.03, 0.01]], [0.35, [0.75, 0.12, 0.02]], [0.65, [1, 0.42, 0.08]], [1, [1, 0.86, 0.55]]];
    let i = 0; while (i < stops.length - 2 && k > stops[i + 1][0]) i++;
    const [k0, c0] = stops[i], [k1, c1] = stops[i + 1], f = (k - k0) / (k1 - k0);
    return new THREE.Color(c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f);
  }

  window.BB3D = { version: '2.1', C, rng, hash, noise3, textures, mat, materials, inject, shaders, studioEnvironment, studio, labels,
    curve, tube, path2d, roundedBox, helix, coil, lathe, blob, instanced, contactShadow, glowSprite, along, incandescent,
    bolt, ridged, wrapLabel, chamferCylinder };
})();
