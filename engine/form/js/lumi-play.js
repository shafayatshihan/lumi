// "Something to do while Claude works": a small offline flappy game next to the real current step of the run, shown on
// the build page under the slide preview. Tap space (or click/tap the arena) to flap; fly through the gaps.
//   - pure canvas + SVG, no assets, no network; one requestAnimationFrame loop that only runs while the arena is on
//     screen, the window is focused and the game is engaged (the pointer is over it, or it holds the keyboard focus),
//     so it costs nothing otherwise
//   - SPACE IS BORROWED, NEVER STOLEN. The arena reads space only when it is itself focused, or when the pointer is
//     over it AND nothing at all is focused. A text box, a question card, the chat input, a dialog or any other
//     control keeps space for itself; a click on the arena never pulls focus out of something you are typing in.
//   - the arena grows to the lower half of the stage while you are playing and shrinks back to its strip when you
//     pause, when the run ends, or when you hide it
//   - it stops for good when the run ends (setRunning(false)) and can be hidden ("hide"; remembered, "play" brings it
//     back). A question takes it away on the same tick it opens (setAsking(true)), and the page hides the whole thing
//     in CSS as well (#build.is-asking), so the person's work always wins.
//   - the best score is the person's, not the deck's: it is kept in localStorage (lumi.play.best) across reloads
//   - sound is the app's own synthesiser (audio.js), never a file: a flap, a point, ten points, a crash. It plays only
//     from inside the running loop or a flap, so never while nobody is playing and never on a run or question change,
//     and it stays quiet when lumi's sound is off (sfx off, or music off: the only switch the person can see)
//   - every ten points the day moves on (dawn, day, dusk, night) and the course changes: gaps that drift, wider
//     columns, quick pairs. Each gap tightens on an easing ramp toward a floor sized from Lumi, never below it.
// mountPlay(host) -> { setRunning(bool), setAsking(bool), setStep({ head, sub }), destroy() }
import { lumiArt } from './lumi-art.js';
import { h } from './dom.js';

const KEY = 'lumi.play.hidden', BEST = 'lumi.play.best';
const store = {
  get() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } },
  set(v) { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) { /* private window */ } },
  best() { try { return Math.max(0, parseInt(localStorage.getItem(BEST), 10) || 0); } catch (e) { return 0; } },
  setBest(n) { try { localStorage.setItem(BEST, String(n)); } catch (e) { /* private window */ } },
};
// Space belongs to whatever is focused. Only "nothing is focused" counts as free.
const nothingFocused = () => { const a = document.activeElement; return !a || a === document.body || a === document.documentElement; };
const isTyping = () => { const a = document.activeElement; return !!a && (a.isContentEditable || /^(input|textarea|select)$/i.test(a.tagName)); };

// the app's synthesiser, loaded the way app.js loads it (the same module, so the same mute); missing, the game is silent
let sound = null;
import('./audio.js').then(m => { sound = (m && m.audio) || null; }, () => {});

// the sky the run flies through, one entry per ten points: dawn, day, dusk, night, then dawn again
const SKY = [
  { top: [246, 242, 253], bot: [217, 205, 243], far: [204, 190, 236], near: [186, 168, 226], pipe: [184, 166, 223], sun: [255, 236, 226], cloud: [0.8] },
  { top: [236, 245, 255], bot: [207, 224, 250], far: [188, 206, 240], near: [166, 186, 230], pipe: [160, 150, 222], sun: [255, 250, 226], cloud: [0.92] },
  { top: [253, 232, 228], bot: [242, 194, 212], far: [225, 168, 202], near: [203, 146, 188], pipe: [188, 136, 190], sun: [255, 190, 160], cloud: [0.6] },
  { top: [36, 30, 74], bot: [78, 62, 130], far: [62, 50, 114], near: [47, 39, 92], pipe: [118, 98, 186], sun: [238, 232, 255], cloud: [0.14] },
];
const NIGHT = 3;
function hash(n) { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); }
const STARS = Array.from({ length: 70 }, (_, i) => [hash(i * 3.1), hash(i * 7.7) * 0.66, hash(i * 1.3)]);
const mixA = (a, b, f) => a.map((v, i) => v + (b[i] - v) * f);
const rgb = (a, al = 1) => `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},${al})`;

export function mountPlay(host) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const par = reduced ? 0 : 1;                                     // reduced motion: the scenery stands still
  let alive = true, running = false, hidden = store.get(), asking = false;
  let inside = false, focused = false, onScreen = true, paused = false, started = false, dead = false, big = false;
  let raf = 0, last = 0, score = 0, best = store.best(), runBest = best, diedAt = 0;
  let W = 0, H = 0, dpr = 1;                                       // arena size in CSS px; the canvas backs it at dpr
  let y = 0, vy = 0, travelled = 0, nextPipe = 0, speed = 0, flash = 0;
  let clock = 0, scroll = 0, tone = 0, fadeFrom = null, fadeK = 0, night = false, shake = 0, squash = 0;
  let mood = 'happy', moodT = 0, lastSp = 0, prevC = 0, breather = false;
  const pipes = [], bits = [];

  const canvas = h('canvas', { class: 'pl-cv', 'aria-hidden': 'true' });
  const g = canvas.getContext('2d');
  const bird = h('span', { class: 'pl-bird', html: lumiArt({ size: 48 }) });
  const scoreEl = h('span', { class: 'pl-score' }, '0');
  const bestEl = h('span', { class: 'pl-best' });
  const hint = h('span', { class: 'pl-hint' }, 'space to flap');
  const pauseB = h('button', { type: 'button', class: 'pl-pause', 'data-nosfx': '', hidden: true }, 'pause');
  const hideB = h('button', { type: 'button', class: 'pl-hide', 'data-nosfx': '', 'aria-label': 'hide the game', title: 'hide the game' }, 'hide');
  const arena = h('div', { class: 'pl-arena', tabindex: '0', role: 'application',
    'aria-label': 'a flappy game to pass the time while claude works. press space to flap.', 'data-nosfx': '' },
    canvas, bird, h('span', { class: 'pl-hud' }, scoreEl, bestEl), hint, pauseB, hideB);
  const stepHead = h('p', { class: 'pl-step-h' }, 'claude is getting started');
  const stepSub = h('p', { class: 'pl-step-s' }, 'waking up');
  const showB = h('button', { type: 'button', class: 'pl-show', 'data-nosfx': '', 'data-cursor-label': 'play' }, 'play while you wait');
  const step = h('div', { class: 'pl-step', 'aria-live': 'polite' },
    h('span', { class: 'pl-step-i', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    h('div', { class: 'pl-step-t' }, stepHead, stepSub), showB);
  const root = h('div', { class: 'pl-play', hidden: true }, arena, step);
  host.append(root);

  // ------------------------------------------------------------------ size: the arena is measured, never assumed
  function measure() {
    // the stage is scaled with a transform, so getBoundingClientRect is in screen px: offsetWidth/Height are the
    // arena's own (unscaled) px, which is the space the game plays in
    const w = arena.offsetWidth, hh = arena.offsetHeight;
    if (!w || !hh) return;
    // ...and the canvas is backed at the pixels it really covers on screen: crisp at 1920, not wasteful at 1366
    const d = Math.min(2, Math.max(1, (window.devicePixelRatio || 1) * (arena.getBoundingClientRect().width / w || 1)));
    if (w === W && hh === H && Math.abs(d - dpr) < 0.01) return;
    // the arena changes size when it grows and shrinks, so the run in flight is carried over proportionally rather
    // than thrown away: a score must not be lost to a resize the person asked for
    const kx = W ? w / W : 1, ky = H ? hh / H : 1;
    W = w; H = hh; dpr = d;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!started) y = H * 0.42;
    else {
      y *= ky; vy *= ky; prevC *= ky;
      for (const p of pipes) { p.x *= kx; p.w *= kx; p.top *= ky; p.base *= ky; p.amp *= ky; p.gap *= ky; }
    }
    bits.length = 0;
    draw();
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => measure()) : null;
  if (ro) ro.observe(arena);
  const onResize = () => measure();
  addEventListener('resize', onResize);

  // ------------------------------------------------------------------ the game
  const ramp = n => 1 - Math.exp(-score / n);                       // 0 at the start, easing toward 1, never past it
  const stage = () => Math.floor(score / 10);
  const birdR = () => Math.max(16, H * 0.075);
  const birdX = () => W * 0.27;
  const pipeW = () => Math.max(34, W * 0.072);
  const spacing = () => Math.max(W * 0.40, pipeW() * 4.6);
  const gravity = () => H * 2.3;
  const flapV = () => -H * 0.78;
  const vel = () => W * (reduced ? 0.19 : 0.26) * (1 + (reduced ? 0.3 : 0.55) * ramp(24));
  function gapH() {
    // the floor is sized from Lumi, so the hardest gap is always one a careful flap gets through
    const r = birdR(), open = Math.max(r * 4.6, H * 0.46);
    const floor = reduced ? Math.max(r * 4.4, H * 0.39) : Math.max(r * 4, H * 0.34);
    return open - (open - floor) * ramp(16);
  }

  function setMood(m, t = 0) {
    moodT = t;
    if (m === mood) return;
    mood = m;
    bird.innerHTML = lumiArt({ size: 48, mood: m });
  }
  function sfx(name) {
    if (!sound || !playing()) return;                              // nobody playing: nothing to hear
    try { const st = sound.state() || {}; if (st.sfx !== false && st.music !== false) sound.sfx(name); } catch (e) { /* never break the game for a sound */ }
  }
  function pop(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  function burst(n, colors, sp) {
    if (reduced) return;
    const r = birdR();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = H * sp * (0.4 + Math.random() * 0.6);
      bits.push({ x: birdX(), y, vx: Math.cos(a) * v - vel() * 0.3, vy: Math.sin(a) * v, life: 0.7 + Math.random() * 0.4, max: 1.1,
        s: r * (0.1 + Math.random() * 0.12), c: colors[i % colors.length] });
    }
  }

  function reset() {
    pipes.length = 0; bits.length = 0; score = 0; scoreEl.textContent = '0';
    y = H * 0.42; vy = 0; travelled = 0; nextPipe = W * 0.62; dead = false; flash = 0; shake = 0;
    lastSp = spacing(); prevC = H * 0.45; breather = false; runBest = best;
    // a new run starts at dawn: the sky crossfades home instead of winding the day backwards
    if (tone > 0.01) { fadeFrom = sky(); fadeK = 1; }
    tone = 0;
    setMood('happy');
    paintHint();
  }
  function kick() { vy = flapV(); if (!reduced) squash = 1; }
  function flap() {
    if (hidden || !running || asking) return;
    if (dead) {
      if (performance.now() - diedAt < 380) return;               // a flap mashed through the crash is not a restart
      reset(); started = true; setBig(true); kick(); sync(); sfx('tick'); return;
    }
    if (paused) { paused = false; pauseB.textContent = 'pause'; setBig(true); }   // space carries on at full size, as the button does
    if (!started) { started = true; reset(); setBig(true); }
    kick();
    paintHint();
    sync();
    sfx('tick');
  }
  function point(p) {
    score++; scoreEl.textContent = String(score);
    if (score > best) { best = score; store.setBest(best); bestEl.textContent = `best ${best}`; }
    if (score % 10 === 0) {                                        // a milestone: the day moves on, one easy gap to breathe
      breather = true;
      pop(scoreEl, 'is-mile');
      setMood('wow', 1.4);
      burst(16, ['#ffd27a', '#d993b4', '#ffffff', '#b8a6df'], 0.9);
      sfx('success');
      return;
    }
    pop(scoreEl, 'is-pop');
    if (p.near < birdR() * 0.3) setMood('hmm', 0.7);               // that was close
    sfx('select');
  }
  function die() {
    dead = true; diedAt = performance.now();
    flash = reduced ? 0.16 : 0.35; shake = reduced ? 0 : 1;
    vy = reduced || y > H * 0.8 ? 0 : -H * 0.3;                    // a little bump, then down
    bestEl.textContent = best ? `best ${best}` : '';
    setMood('sad');
    burst(8, ['#ffffff', '#cdbde6'], 0.5);
    sfx('drop');
    paintHint();
  }
  function paintHint() {
    const fresh = dead && score > runBest && runBest > 0;
    hint.textContent = dead ? (fresh ? 'new best · space to try again' : 'space to try again') : paused ? 'space to carry on' : 'space to flap';
    hint.classList.toggle('is-off', started && !dead && !paused);   // a class, not [hidden]: app.css hides that outright
  }

  function spawn() {
    // one pipe, and how far away the next one is. Fair by construction: the gap never moves further from the last one
    // than a person can climb or fall in the time between them, and a drifting gap keeps its whole swing on screen.
    const r = birdR(), k = ramp(20), base = spacing(), st = stage();
    let gh = gapH();
    if (breather) { gh *= 1.22; breather = false; }
    const w = pipeW() * (1 + Math.random() * (st >= 2 ? 0.5 : 0.15));
    const m = Math.max(r * 1.1, H * 0.1);
    let amp = !reduced && st >= 1 && Math.random() < 0.2 + 0.15 * Math.min(2, st - 1) ? H * 0.09 : 0;
    let lo = m + amp, hi = H - gh - m - amp;
    if (hi < lo) { amp = 0; lo = m; hi = Math.max(m, H - gh - m); }
    const reach = H * (0.22 + 0.26 * k) * Math.min(1.2, lastSp / base);
    let a = Math.max(lo, prevC - gh / 2 - reach), b = Math.min(hi, prevC - gh / 2 + reach);
    if (a > b) a = b = Math.max(lo, Math.min(hi, prevC - gh / 2));
    const top = a + Math.random() * (b - a);
    pipes.push({ x: W + 8, w, gap: gh, base: top, top, amp, ph: Math.random() * 6.283, look: Math.random() < 0.3 ? 1 : 0,
      passed: false, near: Infinity });
    prevC = top + gh / 2;
    // the rhythm breathes instead of ticking like a metronome; past 8 points, now and then a quick pair
    lastSp = score >= 8 && Math.random() < 0.14 ? base * 0.62 : base * (1.15 - 0.22 * k) * (0.82 + Math.random() * 0.36);
    return lastSp;
  }

  // ------------------------------------------------------------------ drawing: every pixel is code
  function sky() {
    const t = ((tone % 4) + 4) % 4, i = Math.floor(t), f = t - i, j = (i + 1) % 4, out = {};
    for (const key in SKY[0]) out[key] = mixA(SKY[i][key], SKY[j][key], f);
    out.night = (i === NIGHT ? 1 - f : 0) + (j === NIGHT ? f : 0);
    if (fadeK > 0 && fadeFrom) for (const key in out) out[key] = key === 'night' ? fadeFrom.night * fadeK + out.night * (1 - fadeK) : mixA(out[key], fadeFrom[key], fadeK);
    return out;
  }
  function box(x, y0, w, hh, r) {
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y0, w, hh, Math.max(0, Math.min(r, w / 2, hh / 2))); else g.rect(x, y0, w, hh);
    g.fill();
  }
  function hills(off, base, amp, f1, f2, color) {
    g.fillStyle = color; g.beginPath(); g.moveTo(-12, H + 12);
    const stp = Math.max(6, W / 150);
    for (let x = -12; x <= W + 12 + stp; x += stp) {
      const u = (x + off) / H;
      g.lineTo(x, base - amp * (0.6 * Math.sin(u * f1) + 0.4 * Math.sin(u * f2 + 1.7)));
    }
    g.lineTo(W + 12, H + 12); g.closePath(); g.fill();
  }
  function cloud(x, cy, s) {
    g.beginPath();
    for (const [dx, dy, rr] of [[-1, 0.1, 0.75], [-0.1, -0.35, 1.05], [0.95, 0, 0.8], [0.1, 0.35, 0.85]]) {
      g.moveTo(x + dx * s + rr * s, cy + dy * s); g.arc(x + dx * s, cy + dy * s, rr * s, 0, 6.283);
    }
    g.fill();
  }
  function column(p, P) {
    const w = p.w, lip = Math.max(7, H * 0.032), over = Math.min(8, w * 0.14), top = p.top, bot = p.top + p.gap;
    const body = rgb(P.pipe), dark = rgb(mixA(P.pipe, [40, 30, 90], 0.12)), shine = 'rgba(255,255,255,.22)';
    if (p.look) {                                                  // stacked stones, from the gap outward
      const sh = Math.max(14, w * 0.62);
      for (let n = 0, yy = top - lip; yy > -sh; n++, yy -= sh) { g.fillStyle = n % 2 ? dark : body; box(p.x, yy - sh + 3, w, sh - 3, 7); }
      for (let n = 0, yy = bot + lip; yy < H + sh; n++, yy += sh) { g.fillStyle = n % 2 ? dark : body; box(p.x, yy + 3, w, sh - 3, 7); }
    } else {
      g.fillStyle = body; box(p.x, -14, w, top + 14, 10); box(p.x, bot, w, H - bot + 14, 10);
      g.fillStyle = shine; g.fillRect(p.x + w * 0.16, -14, w * 0.12, top - lip + 14); g.fillRect(p.x + w * 0.16, bot + lip, w * 0.12, H - bot);
    }
    // the lips at the gap are a touch wider than the column, which is wider than nothing: the hitbox is the column,
    // so a graze on a lip is forgiven, never the other way round. A drifting gap has pink lips.
    g.fillStyle = p.amp ? 'rgb(217,147,180)' : rgb(mixA(P.pipe, [255, 255, 255], 0.3));
    box(p.x - over / 2, top - lip, w + over, lip, lip / 2); box(p.x - over / 2, bot, w + over, lip, lip / 2);
  }
  function draw() {
    if (!W || !H) return;
    const P = sky(), r = birdR();
    const isN = P.night > 0.5;
    if (isN !== night) { night = isN; arena.classList.toggle('is-night', night); }
    const amp = shake * Math.min(6, H * 0.018), sx = amp ? (Math.random() - 0.5) * 2 * amp : 0, sy = amp ? (Math.random() - 0.5) * 2 * amp : 0;
    g.save(); g.translate(sx, sy);
    const sk = g.createLinearGradient(0, 0, 0, H);
    sk.addColorStop(0, rgb(P.top)); sk.addColorStop(1, rgb(P.bot));
    g.fillStyle = sk; g.fillRect(-10, -10, W + 20, H + 20);
    if (P.night > 0.02) {
      for (let i = 0; i < STARS.length; i++) {
        const s = STARS[i], tw = reduced ? 0.8 : 0.55 + 0.45 * Math.sin(clock * 2 + i * 1.7);
        g.fillStyle = `rgba(255,255,255,${(P.night * tw).toFixed(3)})`;
        const x = (((s[0] * W - scroll * 0.02 * par) % W) + W) % W;
        g.fillRect(x, s[1] * H, s[2] > 0.8 ? 2 : 1.4, s[2] > 0.8 ? 2 : 1.4);
      }
    }
    const sr = Math.max(9, H * 0.085), sxp = W * 0.8, syp = H * 0.27;
    const glow = g.createRadialGradient(sxp, syp, sr * 0.6, sxp, syp, sr * 3);
    glow.addColorStop(0, rgb(P.sun, 0.45)); glow.addColorStop(1, rgb(P.sun, 0));
    g.fillStyle = glow; g.fillRect(sxp - sr * 3, syp - sr * 3, sr * 6, sr * 6);
    g.fillStyle = rgb(P.sun); g.beginPath(); g.arc(sxp, syp, sr, 0, 6.283); g.fill();
    hills(scroll * 0.1 * par, H * 0.8, H * 0.07, 1.9, 5.3, rgb(P.far));
    g.fillStyle = `rgba(255,255,255,${P.cloud[0]})`;
    const T = H * 1.5, off = scroll * 0.22 * par;
    for (let i = Math.floor(off / T) - 1, i1 = Math.floor((off + W) / T) + 1; i <= i1; i++) {
      if (hash(i) < 0.35) continue;
      cloud(i * T + hash(i + 0.5) * T * 0.6 - off, H * (0.12 + hash(i + 0.25) * 0.3), H * (0.045 + hash(i + 0.75) * 0.035));
    }
    hills(scroll * 0.38 * par, H * 0.94, H * 0.045, 3.1, 7.9, rgb(P.near));
    for (const p of pipes) column(p, P);
    for (const b of bits) { g.fillStyle = b.c; g.globalAlpha = Math.max(0, b.life / b.max); g.beginPath(); g.arc(b.x, b.y, b.s, 0, 6.283); g.fill(); }
    g.globalAlpha = 1;
    if (flash > 0) { g.fillStyle = `rgba(217,147,180,${flash})`; g.fillRect(-10, -10, W + 20, H + 20); }
    g.restore();
    bird.style.width = bird.style.height = `${r * 2}px`;
    const tilt = dead ? Math.min(95, 30 + (performance.now() - diedAt) * 0.35) : Math.max(-22, Math.min(62, (vy / (H * 1.1)) * 70));
    const q = squash * 0.12;
    bird.style.transform = `translate(${birdX() - r + sx}px, ${y - r + sy}px) rotate(${tilt}deg) scale(${1 - q},${1 + q})`;
  }

  function frame(now) {
    raf = 0;
    if (!playing()) return;
    const dt = Math.min(0.045, (now - last) / 1000); last = now;
    clock += dt;
    if (flash > 0) flash = Math.max(0, flash - dt * 1.6);
    if (shake > 0) shake = Math.max(0, shake - dt * 4);
    if (squash > 0) squash = Math.max(0, squash - dt * 6);
    if (fadeK > 0) fadeK = Math.max(0, fadeK - dt * 1.4);
    if (moodT > 0 && (moodT -= dt) <= 0 && !dead) setMood('happy');
    tone += (stage() - tone) * Math.min(1, dt * (reduced ? 2 : 0.8));
    const r = birdR(), floorY = H - r * 0.6;
    if (!started) {                                                // waiting for the first flap: Lumi hovers, the world drifts
      if (!reduced) { y = H * 0.42 + Math.sin(clock * 2.6) * H * 0.03; scroll += W * 0.05 * dt; }
    } else if (!dead) {
      vy += gravity() * dt;
      y += vy * dt;
      speed = vel();
      travelled += speed * dt; scroll += speed * dt;
      if (travelled >= nextPipe) nextPipe = travelled + spawn();
      const bx = birdX(), hr = r * 0.78, vr = r * 0.74;              // generous on purpose: the hitbox is smaller than Lumi
      for (let i = pipes.length - 1; i >= 0; i--) {
        const p = pipes[i];
        p.x -= speed * dt;
        if (p.amp) p.top = p.base + p.amp * Math.sin(p.ph + clock * 1.5);
        if (p.x + p.w < -24) { pipes.splice(i, 1); continue; }
        if (bx + hr > p.x && bx - hr < p.x + p.w) {
          const c = Math.min(y - vr - p.top, p.top + p.gap - (y + vr));
          if (c < 0) { die(); break; }
          p.near = Math.min(p.near, c);
        }
        if (!p.passed && p.x + p.w < bx - r) { p.passed = true; point(p); }
      }
      if (!dead && (y >= floorY || y - r * 0.6 <= 0)) { y = Math.max(r * 0.6, Math.min(floorY, y)); die(); }
    } else if (y < floorY) { vy += gravity() * dt; y = Math.min(floorY, y + vy * dt); }
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.life -= dt; if (b.life <= 0) { bits.splice(i, 1); continue; }
      b.vy += H * 0.9 * dt; b.x += b.vx * dt; b.y += b.vy * dt;
    }
    draw();
    const busy = started ? (!dead || flash > 0 || shake > 0 || bits.length || fadeK > 0 || y < floorY || moodT > 0) : !reduced;
    if (busy) raf = requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------ when the loop may run, and how big we are
  const engaged = () => inside || focused;
  const playing = () => alive && running && !asking && !hidden && !paused && engaged() && onScreen && !document.hidden && document.hasFocus();
  function setBig(v) {
    v = !!v && !hidden && running && !asking;
    if (v === big) return;
    big = v;
    root.classList.toggle('is-big', big);
    host.classList.toggle('is-big', big);
    requestAnimationFrame(measure);
  }
  function sync() {
    const on = playing();
    root.classList.toggle('is-playing', on);
    pauseB.hidden = !started || dead;
    if (on && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  // ------------------------------------------------------------------ input
  arena.addEventListener('pointerenter', () => { inside = true; sync(); });
  arena.addEventListener('pointerleave', () => { inside = false; sync(); });
  arena.addEventListener('pointercancel', () => { inside = false; sync(); });
  arena.addEventListener('focusin', () => { focused = true; sync(); });
  arena.addEventListener('focusout', () => { focused = arena.contains(document.activeElement); sync(); });
  // a click on the arena flaps; it takes the keyboard focus so space works next - but never away from a text box
  arena.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    if (isTyping()) e.preventDefault();                    // keep the caret where the person put it
    else if (document.activeElement !== arena) { try { arena.focus({ preventScroll: true }); } catch (err) { /* gone */ } }
    flap();
  });
  // space while the arena itself is focused
  arena.addEventListener('keydown', e => {
    if (e.target.closest('button')) return;                // the pause / hide buttons keep their own space and enter
    if (e.key !== ' ' && e.key !== 'Spacebar' && e.code !== 'Space') return;
    e.preventDefault(); e.stopPropagation();
    if (!e.repeat) flap();                                 // holding space is not a flap per frame
  });
  // space while only hovering: allowed only when nothing at all is focused, so nothing is ever taken from the page
  const onKey = e => {
    if (!running || hidden || asking || !inside || focused) return;
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key !== ' ' && e.key !== 'Spacebar' && e.code !== 'Space') return;
    if (!nothingFocused()) return;
    e.preventDefault();
    if (!e.repeat) flap();
  };
  document.addEventListener('keydown', onKey);
  pauseB.addEventListener('click', () => {
    paused = !paused;
    pauseB.textContent = paused ? 'resume' : 'pause';
    setBig(!paused && started);
    paintHint();
    sync();
  });
  hideB.addEventListener('click', () => { hidden = true; store.set(true); setBig(false); paintMode(); sync(); });
  showB.addEventListener('click', () => { hidden = false; store.set(false); paintMode(); sync(); });
  const onVis = () => sync();
  document.addEventListener('visibilitychange', onVis);
  addEventListener('blur', onVis); addEventListener('focus', onVis);
  const io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(es => { onScreen = es.some(e => e.isIntersecting); sync(); }, { threshold: 0.2 }) : null;
  if (io) io.observe(arena);

  function paintMode() {
    root.classList.toggle('is-nogame', hidden);
    arena.hidden = hidden;
    showB.hidden = !hidden;
    bestEl.textContent = best ? `best ${best}` : '';
    if (!hidden) requestAnimationFrame(measure);
  }
  paintMode();
  paintHint();

  return {
    setRunning(v) {
      running = !!v;
      root.hidden = !running;
      // the person's work always wins: the moment the run ends the game drops everything and gets out of the way
      if (!running) {
        started = false; paused = false; dead = false;
        pauseB.hidden = true; pauseB.textContent = 'pause';
        pipes.length = 0; bits.length = 0; score = 0; scoreEl.textContent = '0';
        flash = 0; shake = 0; squash = 0; tone = 0; fadeK = 0; fadeFrom = null;
        setMood('happy');
        setBig(false);
        paintHint();
        g.clearRect(0, 0, W, H);
      } else requestAnimationFrame(measure);
      sync();
    },
    setStep({ head, sub } = {}) { if (head != null) stepHead.textContent = head; if (sub != null) stepSub.textContent = sub; },
    // A QUESTION ALWAYS WINS, AT ONCE. The page also hides the arena in CSS (#build.is-asking), but CSS only stops
    // the loop when the IntersectionObserver gets round to noticing - and "the game yields immediately when a
    // question arrives" is a promise, not a best effort. This cuts the loop and gives the lower half of the stage
    // back on the same tick the question opens, and leaves the game paused afterwards so nothing jumps at the person.
    setAsking(v) {
      v = !!v;
      if (v === asking) return;
      asking = v;
      if (asking) { setBig(false); paused = started && !dead; pauseB.textContent = paused ? 'resume' : 'pause'; }
      paintHint();
      sync();
    },
    destroy() {
      alive = false; sync();
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('keydown', onKey);
      removeEventListener('blur', onVis); removeEventListener('focus', onVis);
      removeEventListener('resize', onResize);
      if (io) io.disconnect();
      if (ro) ro.disconnect();
      root.remove();
    },
  };
}
