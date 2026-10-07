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
//     back). The page hides the whole thing while Claude is asking a question (#build.is-asking), so the person's work
//     always wins.
// mountPlay(host) -> { setRunning(bool), setStep({ head, sub }), destroy() }
import { lumiArt } from './lumi-art.js';
import { h } from './dom.js';

const KEY = 'lumi.play.hidden';
const store = {
  get() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } },
  set(v) { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) { /* private window */ } },
};
// Space belongs to whatever is focused. Only "nothing is focused" counts as free.
const nothingFocused = () => { const a = document.activeElement; return !a || a === document.body || a === document.documentElement; };
const isTyping = () => { const a = document.activeElement; return !!a && (a.isContentEditable || /^(input|textarea|select)$/i.test(a.tagName)); };

export function mountPlay(host) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let alive = true, running = false, hidden = store.get();
  let inside = false, focused = false, onScreen = true, paused = false, started = false, dead = false, big = false;
  let raf = 0, last = 0, score = 0, best = 0;
  let W = 560, H = 138, dpr = 2;                                   // arena size in CSS px; the canvas backs it at dpr
  let y = 0, vy = 0, travelled = 0, nextPipe = 0, speed = 0, flash = 0;
  const pipes = [];

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
    if (!w || !hh || (w === W && hh === H)) return;
    // the arena changes size when it grows and shrinks, so the run in flight is carried over proportionally rather
    // than thrown away: a score must not be lost to a resize the person asked for
    const kx = w / W, ky = hh / H;
    W = w; H = hh;
    dpr = Math.min(2, Math.max(1, (window.devicePixelRatio || 1)));
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!started) y = H * 0.42;
    else { y *= ky; vy *= ky; for (const p of pipes) { p.x *= kx; p.top *= ky; p.gap *= ky; } }
    draw();
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => measure()) : null;
  if (ro) ro.observe(arena);

  // ------------------------------------------------------------------ the game
  const birdR = () => Math.max(16, H * 0.075);
  const birdX = () => W * 0.27;
  const gapH = () => Math.max(birdR() * 4.2, H * (score < 6 ? 0.42 : 0.36));
  const pipeW = () => Math.max(34, W * 0.072);
  const gravity = () => H * 2.3;
  const flapV = () => -H * 0.78;
  const vel = () => Math.min(W * 0.52, W * (reduced ? 0.19 : 0.26) * (1 + score * 0.025));

  function reset() {
    pipes.length = 0; score = 0; scoreEl.textContent = '0';
    y = H * 0.42; vy = 0; travelled = 0; nextPipe = W * 0.62; dead = false; flash = 0;
    bird.innerHTML = lumiArt({ size: 48 });
    paintHint();
  }
  function flap() {
    if (hidden || !running) return;
    if (dead) { reset(); started = true; setBig(true); vy = flapV(); sync(); return; }
    if (paused) { paused = false; pauseB.textContent = 'pause'; }
    if (!started) { started = true; reset(); setBig(true); }
    vy = flapV();
    paintHint();
    sync();
  }
  function die() {
    dead = true; flash = 0.35;
    if (score > best) { best = score; }
    bestEl.textContent = best ? `best ${best}` : '';
    bird.innerHTML = lumiArt({ size: 48, mood: 'hmm' });
    paintHint();
  }
  function paintHint() {
    hint.textContent = dead ? 'space to try again' : paused ? 'space to carry on' : 'space to flap';
    hint.classList.toggle('is-off', started && !dead && !paused);   // a class, not [hidden]: app.css hides that outright
  }

  function spawn() {
    const gh = gapH(), m = Math.max(birdR() * 1.1, H * 0.1);
    pipes.push({ x: W + pipeW(), top: m + Math.random() * Math.max(1, H - gh - m * 2), gap: gh, passed: false });
  }
  function rr(x, w, y0, y1) {                                        // a rounded column between two heights
    const r = Math.min(10, w / 2, Math.abs(y1 - y0) / 2);
    g.beginPath(); g.moveTo(x, y0);
    g.lineTo(x + w, y0); g.lineTo(x + w, y1 - r); g.quadraticCurveTo(x + w, y1, x + w - r, y1);
    g.lineTo(x + r, y1); g.quadraticCurveTo(x, y1, x, y1 - r); g.closePath(); g.fill();
  }
  function draw() {
    g.clearRect(0, 0, W, H);
    for (const p of pipes) {
      const w = pipeW();
      g.fillStyle = '#b8a6df';
      rr(p.x, w, -8, p.top);                                         // the upper column hangs down
      g.save(); g.translate(0, H); g.scale(1, -1); rr(p.x, w, -8, H - (p.top + p.gap)); g.restore();
      g.fillStyle = 'rgba(255,255,255,.34)';
      g.fillRect(p.x + 4, Math.max(0, p.top - 9), w - 8, 5);
      g.fillRect(p.x + 4, Math.min(H - 5, p.top + p.gap + 4), w - 8, 5);
    }
    g.fillStyle = 'rgba(120,96,180,.18)';
    g.fillRect(0, H - 4, W, 4);
    if (flash > 0) { g.fillStyle = `rgba(217,147,180,${flash})`; g.fillRect(0, 0, W, H); }
    const r = birdR();
    bird.style.width = bird.style.height = `${r * 2}px`;
    const tilt = Math.max(-22, Math.min(62, (vy / (H * 1.1)) * 70));
    bird.style.transform = `translate(${birdX() - r}px, ${y - r}px) rotate(${tilt}deg)`;
  }

  function frame(now) {
    raf = 0;
    if (!playing()) return;
    const dt = Math.min(0.045, (now - last) / 1000); last = now;
    if (flash > 0) flash = Math.max(0, flash - dt * 1.6);
    if (!dead && started) {
      vy += gravity() * dt;
      y += vy * dt;
      speed = vel();
      travelled += speed * dt;
      if (travelled >= nextPipe) { spawn(); nextPipe = travelled + Math.max(W * 0.40, pipeW() * 4.6); }
      const r = birdR(), bx = birdX(), w = pipeW();
      for (let i = pipes.length - 1; i >= 0; i--) {
        const p = pipes[i];
        p.x -= speed * dt;
        if (p.x + w < -4) { pipes.splice(i, 1); continue; }
        if (!p.passed && p.x + w < bx - r) { p.passed = true; score++; scoreEl.textContent = String(score); }
        const overlapX = bx + r * 0.78 > p.x && bx - r * 0.78 < p.x + w;
        if (overlapX && (y - r * 0.74 < p.top || y + r * 0.74 > p.top + p.gap)) die();
      }
      if (y + r * 0.6 >= H || y - r * 0.6 <= 0) { y = Math.max(r * 0.6, Math.min(H - r * 0.6, y)); die(); }
    }
    draw();
    if (!dead || flash > 0) raf = requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------ when the loop may run, and how big we are
  const engaged = () => inside || focused;
  const playing = () => alive && running && !hidden && !paused && engaged() && onScreen && !document.hidden && document.hasFocus();
  function setBig(v) {
    v = !!v && !hidden && running;
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
    flap();
  });
  // space while only hovering: allowed only when nothing at all is focused, so nothing is ever taken from the page
  const onKey = e => {
    if (!running || hidden || !inside || focused) return;
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key !== ' ' && e.key !== 'Spacebar' && e.code !== 'Space') return;
    if (!nothingFocused()) return;
    e.preventDefault();
    flap();
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
        pipes.length = 0; score = 0; scoreEl.textContent = '0';
        bird.innerHTML = lumiArt({ size: 48 });
        setBig(false);
        paintHint();
        g.clearRect(0, 0, W, H);
      } else requestAnimationFrame(measure);
      sync();
    },
    setStep({ head, sub } = {}) { if (head != null) stepHead.textContent = head; if (sub != null) stepSub.textContent = sub; },
    destroy() {
      alive = false; sync();
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('keydown', onKey);
      removeEventListener('blur', onVis); removeEventListener('focus', onVis);
      if (io) io.disconnect();
      if (ro) ro.disconnect();
      root.remove();
    },
  };
}
