/* Lumi post-processing POLICY (classic script, no imports). Decides WHETHER a 3D holder gets post and WHICH tier;
   lib/post.js decides nothing and only renders.

   Load order in a deck's <head>:  runtime.js, lib/post.js, lib/post-policy.js, then the look's own scripts.

   ------------------------------------------------------------------ the four inputs, in precedence order
   1. the scene's own options          BB3D.studio(ctx, { post: {...} | 'cinematic' | false })   - wins outright
   2. the slide / holder override      <section class="slide" data-post="cinematic">  or  <div class="aura-3d" data-post="off">
   3. the look's policy                LumiPostPolicy.register('<look>', { hero, body, closing, allowOnMeasured })
   4. nothing                          -> OFF. An unregistered look gets no post, ever.

   ------------------------------------------------------------------ the hero rule (cinematic-direction.md section 3)
   Contrast creates impact: if every slide is spectacular, none is. So a look's policy names THREE tiers and the slide's
   position picks one, instead of each deck deciding slide by slide:
     hero     slides 1 and 2            - the full stack
     closing  the last slide, or data-kind="closing"  - echoes the hero tier, so the deck frames itself
     body     everything between        - calm
   A look sets `heroSlides` if its opening is longer or shorter than two slides.

   ------------------------------------------------------------------ the honesty gate (cinematic-direction.md section 7)
   Bloom blows out an error bar; depth of field hides the region a number was read from. So post is REFUSED on a slide
   that carries measured values, unless the look says `allowOnMeasured: true`.
   "Carries measured values" is not guessed. It is read from the B-05 provenance record, which pack_deck.py writes into
   the packed deck as a JSON script tag with id="lumi-measured" holding {"slides":[3,7],"source":"provenance.json"} -
   every slide with a claim of kind `figure`, `source`, `published` or `computed`. An `illustrative` claim is not a
   measured value, so it does not close the gate. `data-measured` on a slide section says the same thing by hand.
   An UNPACKED build folder has no such tag: the answer is then `unknown`, the gate stays open so a preview looks like
   the finished deck, and `resolve()` reports `measured: 'unknown'` so a caller can say so. The deck that actually
   ships, is checked, and becomes the PDF is the packed one, and that one always carries the real answer.

   ------------------------------------------------------------------ contrast (deck_check.js L-03)
   Post is drawn inside the scene's WebGL canvas only. Slide text is HTML above it and is not a pixel in the chain, so
   its measured foreground never changes. What CAN change is the measured BACKGROUND of a projected label sitting over
   the canvas, so every preset here keeps the bloom threshold at or above 3.2 - well above the looks' paper white,
   which is 1.0 after tone mapping - and no preset touches exposure.
*/
(function () {
  'use strict';
  if (window.LumiPostPolicy) return;

  /* ---------------------------------------------------------------- the presets a look picks from.
     Named, so a look's policy reads as a decision and an A/B is one word. */
  var PRESETS = {
    /* nothing at all: the renderer draws straight to the canvas */
    off: null,

    /* what every Bold Blue 3D slide has had since v0.4: crease AO and a high-threshold bloom that only catches
       genuinely emissive material. This is the DEFAULT, and it is pixel-for-pixel what shipped. */
    clinical: { bloom: true, threshold: 3.2, strength: 0.5, radius: 0.6, ao: true, aoRadius: 0.35, aoIntensity: 0.9,
                dof: false, fxaa: false },

    /* the full stack: a slightly wider, stronger bloom, plus a shallow depth of field focused on whatever the camera
       is looking at, plus edge antialiasing. For an opening, a metaphor or an establishing shot - never for a figure
       a number is read from.
       THE THRESHOLD STAYS AT 3.2, AND THAT IS NOT CONSERVATISM. Both looks that ship are LIGHT: a Bold Blue
       cyclorama is near-white paper, and after ACES tone mapping its floor already sits close to 1.0. Dropping the
       threshold to 2.6 - the value that looks right on a dark scene - puts the BACKDROP itself through the bright
       pass, and the measured result was the whole plate washing to pure white with the contact shadow gone. On a
       light look, bloom must be driven by raising emissive intensity on the one thing that should glow, never by
       lowering the threshold until everything does. */
    /* `strength` is held near the clinical value for the same reason as the threshold: measured on a light
       cyclorama with one hot emitter, 0.75 spread a visible pink wash across the whole upper plate. The depth of
       field and the FXAA are what make this preset cinematic; the bloom is a half-step, not a flood.
       `radius` is left at the clinical value on purpose - see the note on it in post.js: it compounds through the
       recursive up-chain, so 0.6 -> 0.7 nearly doubles the widest halo and clips a light plate to white. */
    /* `shafts` (volumetric light from the key) is in this preset ONLY: atmosphere is for an establishing shot, and it
       is the first thing the adaptive ladder drops. The honesty gate below closes it with everything else - a light
       shaft across a chart is the same crime as bloom on an error bar. */
    cinematic: { bloom: true, threshold: 3.2, strength: 0.6, radius: 0.6, ao: true, aoRadius: 0.35, aoIntensity: 0.95,
                 dof: true, focus: 'auto', aperture: 0.75, maxBlur: 8, fxaa: true, shafts: true },

    /* cinematic without the depth of field: impact without hiding any part of the picture. The honest hero preset,
       and the one a look should reach for when its slides carry figures. */
    showpiece: { bloom: true, threshold: 3.2, strength: 0.6, radius: 0.6, ao: true, aoRadius: 0.35, aoIntensity: 0.95,
                 dof: false, fxaa: true },
  };

  var looks = {};

  /* register('bold-blue', { hero: 'clinical', body: 'clinical', closing: 'hero', allowOnMeasured: false }) */
  function register(look, policy) {
    looks[String(look || '').toLowerCase()] = Object.assign({ hero: 'off', body: 'off', closing: 'hero',
      heroSlides: 2, allowOnMeasured: false }, policy || {});
    return looks[String(look || '').toLowerCase()];
  }
  function policyFor(look) { return looks[String(look || '').toLowerCase()] || null; }

  /* ---------------------------------------------------------------- where a holder sits in the deck */
  function slideOf(el) { return el && el.closest ? el.closest('.slide') : null; }
  function slideIndex(slide) {
    if (!slide || !slide.ownerDocument) return 0;
    var all = slide.ownerDocument.querySelectorAll('.slide');
    for (var i = 0; i < all.length; i++) if (all[i] === slide) return i + 1;
    return 0;
  }
  function tierOf(slide, pol) {
    if (!slide) return 'body';
    var doc = slide.ownerDocument, n = slideIndex(slide), total = doc.querySelectorAll('.slide').length;
    if (slide.dataset && slide.dataset.kind === 'closing') return 'closing';
    if (n && n === total && total > 1) return 'closing';
    if (n && n <= (pol && pol.heroSlides != null ? pol.heroSlides : 2)) return 'hero';
    return 'body';
  }

  /* ---------------------------------------------------------------- the measured-values record (B-05) */
  var measuredCache = null;
  function measuredSlides(doc) {
    if (measuredCache) return measuredCache;
    doc = doc || document;
    var set = {}, known = false, source = null;
    if (window.LumiMeasured && window.LumiMeasured.slides) {
      (window.LumiMeasured.slides || []).forEach(function (n) { set[n] = true; });
      known = true; source = window.LumiMeasured.source || 'window.LumiMeasured';
    } else {
      var tag = doc.getElementById('lumi-measured');
      if (tag) {
        try { var j = JSON.parse(tag.textContent || '{}'); (j.slides || []).forEach(function (n) { set[n] = true; });
              known = true; source = j.source || '#lumi-measured'; }
        catch (e) { /* a broken tag is "unknown", never a silent "nothing is measured" */ }
      }
    }
    var marked = doc.querySelectorAll('.slide[data-measured]');
    if (marked.length) {
      known = true; source = source ? source + ' + data-measured' : 'data-measured';
      for (var i = 0; i < marked.length; i++) set[slideIndex(marked[i])] = true;
    }
    measuredCache = { known: known, slides: set, source: source };
    return measuredCache;
  }
  function forget() { measuredCache = null; }        // tests and the editor, after the DOM changes

  /* ---------------------------------------------------------------- resolve a preset name / object / boolean */
  function expand(v, pol, slide) {
    if (v == null || v === false || v === 'off' || v === 'none') return null;
    if (v === true) return Object.assign({}, PRESETS.clinical);
    if (typeof v === 'string') {
      var name = v.toLowerCase();
      if (name === 'hero' || name === 'body' || name === 'closing') return expand(pol ? pol[name] : null, pol, slide);
      return PRESETS[name] ? Object.assign({}, PRESETS[name]) : null;
    }
    if (typeof v === 'object') {
      var base = v.preset && PRESETS[v.preset] ? Object.assign({}, PRESETS[v.preset]) : {};
      return Object.assign(base, v);
    }
    return null;
  }

  /* ----------------------------------------------------------------
     resolve({ el, look, scenePost }) -> { enabled, cfg, tier, slide, measured, reason }
     `reason` is always a plain sentence, so a tool can print why a slide did or did not get post. */
  function resolve(o) {
    o = o || {};
    var el = o.el || null, slide = o.slide || slideOf(el);
    var doc = (slide && slide.ownerDocument) || (el && el.ownerDocument) || document;
    var look = o.look || (doc.documentElement && doc.documentElement.dataset ? doc.documentElement.dataset.look : '') || '';
    var pol = policyFor(look);
    var n = slideIndex(slide), tier = tierOf(slide, pol);
    var out = { enabled: false, cfg: null, tier: tier, slide: n, look: look, measured: 'unknown', reason: '' };

    /* 4 first, because it is the floor: a look that registers no policy gets no post, and NOTHING overrides that.
       A slide attribute or a scene option may only choose among what its look already allows - otherwise "off by
       default" would mean "off until one deck writes one attribute", which is not a default at all. */
    if (!pol) { out.reason = 'the look "' + (look || '(none)') + '" registers no post policy, so post is off'; return out; }

    /* then 1 / 2 / 3: the first source that says anything wins */
    var from, cfg = null;
    if (o.scenePost !== undefined && o.scenePost !== null) { cfg = expand(o.scenePost, pol, slide); from = 'the scene\'s own post option'; }
    else {
      var ov = (el && el.dataset && el.dataset.post) || (slide && slide.dataset && slide.dataset.post) || null;
      if (ov) { cfg = expand(ov, pol, slide); from = 'data-post="' + ov + '"'; }
      else { cfg = expand(pol[tier], pol, slide); from = 'the ' + look + ' look\'s ' + tier + ' tier'; }
    }
    if (!cfg) { out.reason = from + ' asks for no post'; return out; }

    /* the honesty gate */
    var m = measuredSlides(doc);
    out.measured = m.known ? (m.slides[n] ? 'yes' : 'no') : 'unknown';
    if (out.measured === 'yes' && !(pol && pol.allowOnMeasured)) {
      out.reason = 'slide ' + n + ' carries measured values (' + m.source + '), and the ' + (look || 'current') +
                   ' look does not allow post on a slide whose figure carries traced numbers';
      return out;
    }

    out.enabled = true; out.cfg = cfg;
    out.reason = from + ' -> ' + (cfg.dof ? 'bloom + depth of field' : 'bloom') + (cfg.fxaa ? ' + FXAA' : '') +
                 (cfg.ao ? ' + AO' : '') + (cfg.shafts ? ' + light shafts' : '') + (out.measured === 'unknown' ? ' (no provenance record in this page: pack the deck to apply the honesty gate)' : '');
    return out;
  }

  /* make(THREE, renderer, scene, camera, resolved) -> a LumiPost instance, or null */
  function make(THREE, renderer, scene, camera, resolved) {
    if (!resolved || !resolved.enabled) return null;
    if (!window.LumiPost) { console.warn('Lumi: deck/lib/post.js is not loaded, so this slide renders without post.'); return null; }
    return window.LumiPost.create(THREE, renderer, scene, camera, resolved.cfg);
  }

  window.LumiPostPolicy = { version: '1.0', PRESETS: PRESETS, register: register, policyFor: policyFor,
    resolve: resolve, make: make, measuredSlides: measuredSlides, forget: forget,
    slideIndex: slideIndex, tierOf: tierOf, expand: expand,
    get looks() { return looks; } };

  /* ---------------------------------------------------------------- the two looks that ship.
     Both are deliberately conservative: cinematic-direction.md section 7 - "Do not make the effects global."

     Bold Blue stays CLINICAL in every tier. That is not timidity: `clinical` is exactly the post Bold Blue has always
     had, so registering it changes no pixel of any existing deck. A deck that wants the opening to sing says so on the
     slide: <section class="slide" data-post="showpiece">. */
  register('bold-blue', { hero: 'clinical', body: 'clinical', closing: 'hero', heroSlides: 2, allowOnMeasured: false });

  /* Flat-Pack is a DRAWING, not a photograph: orthographic, no lights, flat fills, constant-weight ink outline. Bloom
     on an ink line is a mistake, not a style. Off in every tier, and `allowOnMeasured` is moot. */
  register('flat-pack', { hero: 'off', body: 'off', closing: 'off', heroSlides: 0, allowOnMeasured: false });

  /* Pink Punch is a screen print and Happy Headspace a soft-lit form: neither takes post. Stated, not inherited. */
  register('pink-punch', { hero: 'off', body: 'off', closing: 'off', heroSlides: 0, allowOnMeasured: false });
  register('happy-headspace', { hero: 'off', body: 'off', closing: 'off', heroSlides: 0, allowOnMeasured: false });

  /* Clay Pop is a RENDER look: crease AO is half of what makes clay read as clay, so every tier keeps it (clinical).
     The opening gets `showpiece` (adds FXAA; the bloom threshold stays 3.2, and matte clay emits nothing, so bloom stays
     dark). Never depth of field: a clay set is shot sharp, and the measured-values gate stays closed. */
  register('clay-pop', { hero: 'showpiece', body: 'clinical', closing: 'hero', heroSlides: 2, allowOnMeasured: false });
})();
