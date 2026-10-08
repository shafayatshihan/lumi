// Edit-bench scene: a compact desk for the editor (the factory stays for first builds). The deck's real slides lie on
// the desk as little cards. The selected card sits slightly raised; while Claude edits, the card it works on lifts
// off the desk, a pencil scribbles on it, a brush sweeps new colour across it on each file edit and a loupe checks it
// on each helper run. A question shows a "?" bubble; when Claude is done the card gets a tick, sparkles and settles.
// Flat 2.5D canvas drawing (no WebGL: the deck preview beside it may need the one WebGL context).
// update({ editor: { count, selected } }) feeds it the deck; Claude events arrive on the bus (claude:event/state).
import { PAL, clamp, lerp, damp, ease, rng, makeRoot, createLoop, createCanvas2D, rr, onBus } from './three-kit.js';
import { bus as appBus, on } from '../bus.js';
import { hasMarker } from '../markers.js';

const BW = 400, BH = 200;                         // design space of the bench
const DESK = { x0: 14, x1: 386, top: 118, depth: 50, front: 14 };
const AREA = { x0: 92, x1: 334, y: 144 };          // where the cards lie
const LIFT = { y: 66, scale: 2.05 };
const C = { ink: PAL.ink, pill: PAL.pill, lilac: PAL.lilac, pink: PAL.pink, rose: PAL.rose, orange: PAL.orange, f0: PAL.fur[0], f1: PAL.fur[1], f2: PAL.fur[2], f3: PAL.fur[3], f4: PAL.fur[4], plum: PAL.plum, white: '#ffffff' };
const ACCENTS = [C.pink, C.orange, C.lilac, C.rose, C.f3];
const LABEL = { idle: n => `ready to edit · slide ${n}`, work: n => `editing slide ${n}`, wait: () => 'a quick question for you', done: n => `slide ${n} updated` };

function makeModel(reduced) {
  return { reduced, t: 0, rnd: rng(11), count: 5, selected: 1, target: 1, mode: 'idle', modeT: 0, cards: [], parts: [],
    strokes: [], penP: 0, brushT: -9, loupeT: -9, tickT: -9, doneT: -9, lamp: 0, wait: 0, label: '' };
}
function syncCards(m) {
  const n = clamp(m.count | 0, 1, 60);
  while (m.cards.length < n) { const i = m.cards.length; m.cards.push({ i, lift: 0, accent: ACCENTS[i % ACCENTS.length], nextAccent: null, wipe: 1, v: i === 0 ? 0 : 1 + ((i - 1) % 3), jr: (m.rnd() - .5) * .08, bump: 0 }); }
  m.cards.length = n;
  m.selected = clamp(m.selected, 1, n); m.target = clamp(m.target, 1, n);
}
function setMode(m, mode) {
  if (m.mode === mode) return;
  m.mode = mode; m.modeT = m.t;
  if (mode === 'work') { m.strokes = []; m.penP = 0; }
  if (mode === 'done') { m.doneT = m.t; m.tickT = m.t; burst(m, 18); }
}
function spawn(m, x, y, vx, vy, life, size, col, k = 'spark') {
  if (m.reduced || m.parts.length > 160) return;
  m.parts.push({ x, y, vx, vy, life, age: 0, size, col, k, rot: m.rnd() * 6, vr: (m.rnd() - .5) * 8 });
}
function burst(m, n) {
  const p = cardPose(m, m.cards[m.target - 1] || m.cards[0]);
  for (let i = 0; i < n; i++) {
    const a = m.rnd() * Math.PI * 2, s = 60 + m.rnd() * 70;
    spawn(m, p.x, p.y - 4, Math.cos(a) * s, Math.sin(a) * s * .8 - 30, .9 + m.rnd() * .5, 3 + m.rnd() * 3, [C.pink, C.orange, C.lilac, C.rose][i % 4], i % 3 ? 'spark' : 'heart');
  }
}

// Where a card sits: flat on the desk (foreshortened) or lifted and facing us.
function flatSlot(m, i) {
  const n = m.cards.length, span = AREA.x1 - AREA.x0;
  const w = clamp((span - 8 * (n - 1)) / n, 18, 46);
  const step = n > 1 ? Math.min(w + 8, (span - w) / (n - 1)) : 0;
  const total = w + step * (n - 1);
  const x = (AREA.x0 + AREA.x1) / 2 - total / 2 + w / 2 + step * i;
  return { x, y: AREA.y, w };
}
function cardPose(m, c) {
  const s = flatSlot(m, c.i), k = ease.inOutCubic(c.lift);
  const big = m.cards.length > 1 ? LIFT.scale * 46 / s.w : LIFT.scale;
  const sc = lerp(1, Math.max(1.4, Math.min(big, 4.4)), Math.max(0, (c.lift - .2) / .8));
  const w = s.w * sc;
  const hover = c.lift > .3 && !m.reduced ? Math.sin(m.t * 1.7 + c.i) * 2.2 * k : 0;
  return { x: lerp(s.x, BW / 2 + 6, Math.max(0, (c.lift - .2) / .8)), y: lerp(s.y, LIFT.y, Math.max(0, (c.lift - .2) / .8)) - c.lift * 6 + hover - c.bump * 4,
    w, h: w * .5625, fs: lerp(.5, 1, ease.outCubic(Math.max(0, (c.lift - .15) / .85))), rot: lerp(0, -.05 + c.jr, k), k, flatY: s.y, flatW: s.w };
}

function step(m, dt) {
  m.t += dt;
  syncCards(m);
  let busy = false;
  const active = m.mode === 'work' || m.mode === 'wait' || (m.mode === 'done' && m.t - m.doneT < 1.6);
  for (const c of m.cards) {
    const n = c.i + 1;
    const want = active && n === m.target ? 1 : n === m.selected ? .16 : 0;
    const nl = m.reduced ? want : damp(c.lift, want, 5, dt);
    if (Math.abs(nl - want) > .002) busy = true;
    c.lift = Math.abs(nl - want) < .002 ? want : nl;
    if (c.bump > 0) { c.bump = Math.max(0, c.bump - dt * 3); busy = true; }
    if (c.wipe < 1) { c.wipe = Math.min(1, c.wipe + dt * 1.25); if (c.wipe >= 1 && c.nextAccent) { c.accent = c.nextAccent; c.nextAccent = null; } busy = true; }
  }
  if (m.mode === 'done' && m.t - m.doneT > 2.6) { m.mode = 'idle'; m.modeT = m.t; }
  // pencil scribble while working
  if (m.mode === 'work') {
    busy = true;
    if (!m.reduced) {
      m.penP += dt;
      const c = m.cards[m.target - 1];
      if (c && c.lift > .85 && m.strokes.length < 220) {
        const u = m.penP * .55, line = Math.floor(u) % 4, f = u - Math.floor(u);
        const lx = .12 + f * (.5 + (line % 2) * .15), ly = .42 + line * .12 + Math.sin(m.penP * 26) * .018;
        const last = m.strokes[m.strokes.length - 1];
        if (!last || last.line !== line || f < last.f) m.strokes.push({ line, f, pts: [[lx, ly]] });
        else { last.pts.push([lx, ly]); last.f = f; }
        if (m.strokes.length > 8) m.strokes.shift();
      }
    }
  }
  m.lamp = damp(m.lamp, m.mode === 'work' ? 1 : m.mode === 'wait' ? .55 : .2, 4, dt);
  m.wait = damp(m.wait, m.mode === 'wait' ? 1 : 0, 6, dt);
  if (Math.abs(m.lamp - (m.mode === 'work' ? 1 : m.mode === 'wait' ? .55 : .2)) > .01 || (m.wait > .01 && m.wait < .99)) busy = true;
  if (m.mode === 'wait') busy = true;
  if (m.t - m.brushT < 1.2 || m.t - m.loupeT < 1.6 || m.t - m.tickT < 1.4) busy = true;
  for (const p of m.parts) { p.age += dt; p.vy += 120 * dt; p.vx *= Math.exp(-2.2 * dt); p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; }
  m.parts = m.parts.filter(p => p.age < p.life);
  if (m.parts.length) busy = true;
  return busy;
}

// ---------------------------------------------------------------- drawing
const LAYOUTS = [
  [[.1, .3, .62, .14, 'ink'], [.1, .52, .44, .07, 'f3'], [.1, .64, .3, .07, 'acc']],
  [[.08, .14, .44, .11, 'ink'], [.08, .36, .36, .06, 'f2'], [.08, .48, .3, .06, 'f2'], [.08, .6, .34, .06, 'f2'], [.56, .3, .36, .5, 'acc']],
  [[.08, .14, .38, .11, 'ink'], [.14, .62, .1, .22, 'f3'], [.3, .5, .1, .34, 'acc'], [.46, .56, .1, .28, 'f3'], [.62, .4, .1, .44, 'acc'], [.1, .86, .7, .025, 'ink']],
  [[.08, .14, .5, .11, 'ink'], [.08, .38, .05, .08, 'acc'], [.17, .39, .4, .06, 'f3'], [.08, .54, .05, .08, 'acc'], [.17, .55, .34, .06, 'f3'], [.66, .3, .26, .52, 'f2']],
];
function poly(g, pts) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); }

function drawDesk(g, m) {
  const { x0, x1, top, depth, front } = DESK, inset = 18;
  // soft floor shadow
  g.fillStyle = 'rgba(146,129,176,.16)';
  g.beginPath(); g.ellipse(BW / 2, top + depth + front + 8, (x1 - x0) / 2 + 6, 7, 0, 0, Math.PI * 2); g.fill();
  // top face (a gentle trapezoid) and front edge
  g.fillStyle = C.f0;
  poly(g, [[x0 + inset, top], [x1 - inset, top], [x1, top + depth], [x0, top + depth]]); g.fill();
  g.fillStyle = 'rgba(255,255,255,.55)';
  poly(g, [[x0 + inset + 6, top + 3], [x1 - inset - 6, top + 3], [x1 - inset - 5, top + 6], [x0 + inset + 5, top + 6]]); g.fill();
  g.fillStyle = C.f2; rr(g, x0, top + depth - 1, x1 - x0, front, 5); g.fill();
  g.fillStyle = C.f3; rr(g, x0 + 10, top + depth + front - 4, x1 - x0 - 20, 4, 2); g.fill();
  // a cutting mat under the cards
  g.fillStyle = 'rgba(201,195,239,.55)';
  poly(g, [[AREA.x0 - 14, top + 9], [AREA.x1 + 14, top + 9], [AREA.x1 + 22, top + depth - 6], [AREA.x0 - 22, top + depth - 6]]); g.fill();
  g.strokeStyle = 'rgba(146,129,176,.28)'; g.lineWidth = 1;
  for (let i = 1; i < 6; i++) { const u = i / 6; g.beginPath(); g.moveTo(lerp(AREA.x0 - 14, AREA.x0 - 22, u), lerp(top + 9, top + depth - 6, u)); g.lineTo(lerp(AREA.x1 + 14, AREA.x1 + 22, u), lerp(top + 9, top + depth - 6, u)); g.stroke(); }
}
function drawLamp(g, m) {
  const bx = 40, by = DESK.top + 22, t = m.reduced ? 0 : m.t;
  // light pool on the desk
  if (m.lamp > .05) {
    g.save(); g.globalAlpha = .18 + m.lamp * .3;
    g.fillStyle = '#fff4dc';
    poly(g, [[78, 46], [100, 44], [BW / 2 + 70, DESK.top + 34], [BW / 2 - 70, DESK.top + 40]]); g.fill();
    g.restore();
  }
  g.fillStyle = C.f4; rr(g, bx - 16, by - 4, 32, 9, 4.5); g.fill();
  g.strokeStyle = C.plum; g.lineWidth = 4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(bx, by - 2); g.lineTo(bx + 8, 70); g.lineTo(bx + 40 + Math.sin(t * .8) * .6, 42); g.stroke();
  g.fillStyle = C.plum; g.beginPath(); g.arc(bx + 8, 70, 4, 0, Math.PI * 2); g.fill();
  g.save(); g.translate(bx + 44, 42); g.rotate(.5);
  g.fillStyle = C.rose; poly(g, [[-10, -8], [12, -8], [20, 10], [-18, 10]]); g.fill();
  g.fillStyle = m.lamp > .3 ? '#fff4dc' : C.f1; g.beginPath(); g.ellipse(1, 10, 18, 3.6, 0, 0, Math.PI * 2); g.fill();
  g.restore();
}
function drawCup(g, m) {
  const x = 362, y = DESK.top + 6, t = m.reduced ? 0 : m.t;
  g.fillStyle = C.orange; rr(g, x - 2, y - 44, 5, 40, 2); g.fill();
  g.save(); g.translate(x + 8, y - 38); g.rotate(.18); g.fillStyle = C.lilac; rr(g, -2.5, 0, 5, 36, 2); g.fill(); g.fillStyle = C.ink; poly(g, [[-2.5, 0], [2.5, 0], [0, -6]]); g.fill(); g.restore();
  g.save(); g.translate(x - 8, y - 34); g.rotate(-.22); g.fillStyle = C.pink; rr(g, -2.5, 0, 5, 32, 2); g.fill(); g.restore();
  g.fillStyle = C.f4; rr(g, x - 14, y - 16, 28, 26, 7); g.fill();
  g.fillStyle = C.f3; rr(g, x - 14, y - 16, 28, 6, 3); g.fill();
  // sticky note
  g.save(); g.translate(28, DESK.top + 34); g.rotate(-.12 + Math.sin(t * .6) * .01);
  g.fillStyle = '#ffe9a8'; rr(g, -12, -9, 26, 20, 3); g.fill();
  g.fillStyle = 'rgba(8,9,9,.35)'; rr(g, -7, -3, 15, 2.4, 1.2); g.fill(); rr(g, -7, 2, 10, 2.4, 1.2); g.fill();
  g.restore();
}
function cardFace(g, m, c, w, h, alpha = 1) {
  g.fillStyle = C.pill; rr(g, -w / 2, -h / 2, w, h, Math.max(2, w * .06)); g.fill();
  const lay = LAYOUTS[c.v];
  for (const [x, y, ww, hh, col] of lay) {
    let fill = col === 'acc' ? c.accent : C[col];
    g.fillStyle = fill; rr(g, -w / 2 + x * w, -h / 2 + y * h, ww * w, hh * h, Math.min(2.5, hh * h / 2)); g.fill();
  }
  if (c.nextAccent && c.wipe < 1) {   // a brush sweep paints the new accent across
    g.save(); rr(g, -w / 2, -h / 2, w, h, Math.max(2, w * .06)); g.clip();
    const cut = -w / 2 + w * ease.inOutCubic(c.wipe);
    g.beginPath(); g.rect(-w / 2, -h / 2, cut + w / 2, h); g.clip();
    for (const [x, y, ww, hh, col] of lay) if (col === 'acc') { g.fillStyle = c.nextAccent; rr(g, -w / 2 + x * w, -h / 2 + y * h, ww * w, hh * h, Math.min(2.5, hh * h / 2)); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(cut - 3, -h / 2, 3, h);
    g.restore();
  }
  void alpha;
}
function drawFlatCard(g, m, c, p) {
  // lying on the mat: a foreshortened card with a little thickness
  const w = p.w, hh = p.h * p.fs, x = p.x, y = p.y;
  g.save(); g.translate(x, y); g.rotate(p.rot);
  g.fillStyle = C.f3; rr(g, -w / 2, -hh / 2 + 2, w, hh, 3); g.fill();
  g.save(); g.scale(1, p.fs); cardFace(g, m, c, w, p.h); g.restore();
  g.restore();
}
function drawLiftedCard(g, m, c, p) {
  // shadow on the desk
  const sh = clamp(1 - p.k * .6);
  g.fillStyle = `rgba(146,129,176,${.12 + .14 * sh})`;
  g.beginPath(); g.ellipse(p.x, p.flatY + 6, p.w * .45 * (1.2 - p.k * .3), 6 + 3 * sh, 0, 0, Math.PI * 2); g.fill();
  g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
  g.fillStyle = C.f2; rr(g, -p.w / 2 + 2, -p.h * p.fs / 2 + 3, p.w, p.h * p.fs, 5); g.fill();
  g.save(); g.scale(1, p.fs);
  cardFace(g, m, c, p.w, p.h);
  // pencil marks, in card space
  if (m.strokes.length && (m.mode === 'work' || m.mode === 'wait' || m.t - m.doneT < 1.2) && c.i + 1 === m.target) {
    g.strokeStyle = C.plum; g.lineWidth = 1.4; g.lineCap = 'round'; g.lineJoin = 'round';
    g.globalAlpha = m.mode === 'done' ? clamp(1 - (m.t - m.doneT) / 1.2) : .85;
    for (const s of m.strokes) { g.beginPath(); s.pts.forEach(([u, v], i) => { const X = -p.w / 2 + u * p.w, Y = -p.h / 2 + v * p.h; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke(); }
    g.globalAlpha = 1;
  }
  // focus ring while it's being worked on
  if (p.k > .5 && (m.mode === 'work' || m.mode === 'wait')) {
    g.strokeStyle = m.mode === 'wait' ? C.orange : C.lilac; g.lineWidth = 2.5;
    g.setLineDash([5, 4]); g.lineDashOffset = m.reduced ? 0 : -m.t * 14;
    rr(g, -p.w / 2 - 5, -p.h / 2 - 5, p.w + 10, p.h + 10, 7); g.stroke(); g.setLineDash([]);
  }
  g.restore();
  // tick badge after a finished edit
  const tk = m.t - m.tickT;
  if (tk >= 0 && tk < 2.6 && c.i + 1 === m.target) {
    const s = ease.outBack(clamp(tk * 3)) * clamp((2.6 - tk) * 2);
    g.save(); g.translate(p.w / 2 - 2, -p.h * p.fs / 2 + 2); g.scale(s, s);
    g.fillStyle = '#5b3fa8'; g.beginPath(); g.arc(0, 0, 11, 0, Math.PI * 2); g.fill();
    g.strokeStyle = C.lilac; g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(-4.5, .5); g.lineTo(-1.2, 4); g.lineTo(5, -3.5); g.stroke();
    g.restore();
  }
  g.restore();
}
function drawPencil(g, m, p) {
  if (m.mode !== 'work' && m.mode !== 'wait') return;
  if (p.k < .7) return;
  const t = m.reduced ? 0 : m.penP, u = t * .55, line = Math.floor(u) % 4, f = u - Math.floor(u);
  let lx = .12 + f * (.5 + (line % 2) * .15), ly = .42 + line * .12;
  if (m.mode === 'wait') { lx = .7; ly = .5 + Math.abs(Math.sin(m.t * 3)) * -.08; }
  const X = p.x + (-p.w / 2 + lx * p.w), Y = p.y + (-p.h / 2 + ly * p.h) * p.fs + (m.mode === 'work' && !m.reduced ? Math.sin(t * 26) * 1.2 : 0);
  g.save(); g.translate(X, Y); g.rotate(-.65);
  g.fillStyle = C.ink; poly(g, [[0, 0], [-3.6, -9], [3.6, -9]]); g.fill();
  g.fillStyle = '#f6d7b0'; poly(g, [[-3.6, -9], [3.6, -9], [5, -14], [-5, -14]]); g.fill();
  g.fillStyle = C.orange; rr(g, -5, -48, 10, 35, 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,.35)'; rr(g, -1.5, -46, 3, 31, 1.5); g.fill();
  g.fillStyle = C.f3; rr(g, -5.4, -54, 10.8, 7, 1.5); g.fill();
  g.fillStyle = C.pink; rr(g, -5, -61, 10, 8, 3); g.fill();
  g.restore();
}
function drawBrush(g, m, p) {
  const k = (m.t - m.brushT) / 1.1;
  if (k < 0 || k > 1 || m.reduced) return;
  const X = p.x - p.w / 2 + p.w * ease.inOutCubic(k), Y = p.y - 6 + Math.sin(k * Math.PI) * -10;
  g.save(); g.translate(X, Y); g.rotate(.5 - k * .3); g.globalAlpha = clamp(Math.min(k * 6, (1 - k) * 6));
  const c = m.cards[m.target - 1];
  g.fillStyle = (c && (c.nextAccent || c.accent)) || C.pink; rr(g, -6, 0, 12, 12, 4); g.fill();
  g.fillStyle = C.f4; rr(g, -5, -5, 10, 6, 1.5); g.fill();
  g.fillStyle = C.plum; rr(g, -3, -42, 6, 38, 3); g.fill();
  g.restore();
}
function drawLoupe(g, m, p) {
  const k = (m.t - m.loupeT) / 1.5;
  if (k < 0 || k > 1 || m.reduced) return;
  const X = p.x - p.w * .45 + p.w * .9 * k, Y = p.y - 8 + Math.sin(k * Math.PI * 2) * 6;
  g.save(); g.globalAlpha = clamp(Math.min(k * 5, (1 - k) * 5));
  g.strokeStyle = C.plum; g.lineWidth = 6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(X + 11, Y + 11); g.lineTo(X + 24, Y + 24); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.arc(X, Y, 15, 0, Math.PI * 2); g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 3.5; g.beginPath(); g.arc(X, Y, 15, 0, Math.PI * 2); g.stroke();
  g.restore();
}
function drawBubble(g, m, p) {
  if (m.wait < .02) return;
  const s = ease.outBack(m.wait), bx = p.x + p.w / 2 + 14, by = p.y - p.h * p.fs / 2 - 10 + (m.reduced ? 0 : Math.sin(m.t * 2.4) * 3);
  g.save(); g.translate(bx, by); g.scale(s, s);
  g.fillStyle = '#5b3fa8'; rr(g, -19, -16, 38, 32, 16); g.fill();
  poly(g, [[-10, 13], [-16, 24], [-1, 15]]); g.fill();
  g.fillStyle = C.pill; g.font = '900 20px Epilogue, "DM Sans", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 0, 1);
  g.restore();
}
function drawParts(g, m) {
  for (const p of m.parts) {
    const u = p.age / p.life, s = p.size * clamp((1 - u) * 3);
    g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.col; g.globalAlpha = clamp((1 - u) * 2);
    if (p.k === 'heart') { g.beginPath(); g.moveTo(0, s * .9); g.bezierCurveTo(-s * 1.6, -s * .2, -s * .6, -s * 1.4, 0, -s * .4); g.bezierCurveTo(s * .6, -s * 1.4, s * 1.6, -s * .2, 0, s * .9); g.fill(); }
    else { g.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? s * .35 : s; const a = i * Math.PI / 4; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); }
    g.restore();
  }
}
function drawLabels(g, m) {
  const n = m.cards.length, every = n > 16 ? 5 : n > 10 ? 2 : 1;
  g.font = '13px "DM Sans", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const c of m.cards) {
    const k = c.i + 1, s = flatSlot(m, c.i);
    const sel = k === m.selected;
    if (!sel && (k % every) && k !== 1 && k !== n) continue;
    const y = DESK.top + DESK.depth + DESK.front / 2 - 1;
    if (sel) { g.fillStyle = '#5b3fa8'; rr(g, s.x - 11, y - 8, 22, 16, 8); g.fill(); g.fillStyle = C.pill; }
    else g.fillStyle = 'rgba(8,9,9,.55)';
    g.fillText(String(k), s.x, y + .5);
  }
}
function drawPill(g, m) {
  const key = m.mode;
  const text = (LABEL[key] || LABEL.idle)(m.mode === 'idle' ? m.selected : m.target);
  g.font = '15px "DM Sans", system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
  const tw = g.measureText(text).width, ph = 28, pw = tw + 38;
  g.fillStyle = C.pill; rr(g, 6, 6, pw, ph, ph / 2); g.fill();
  const col = key === 'work' ? C.orange : key === 'wait' ? C.pink : key === 'done' ? C.ink : C.f3;
  g.fillStyle = col; g.beginPath(); g.arc(6 + 15, 6 + ph / 2, 5 + (key === 'work' && !m.reduced ? Math.sin(m.t * 5) : 0), 0, Math.PI * 2); g.fill();
  g.fillStyle = C.ink; g.fillText(text, 6 + 28, 6 + ph / 2 + 1);
  const ct = `${m.cards.length} slide${m.cards.length === 1 ? '' : 's'}`, cw = g.measureText(ct).width + 24;
  g.fillStyle = '#5b3fa8'; rr(g, BW - 6 - cw, 6, cw, ph, ph / 2); g.fill();
  g.fillStyle = C.pill; g.fillText(ct, BW - 6 - cw + 12, 6 + ph / 2 + 1);
}
function draw(g, m) {
  drawDesk(g, m);
  drawLamp(g, m);
  drawCup(g, m);
  const lifted = [];
  for (const c of m.cards) { const p = cardPose(m, c); if (c.lift > .2) lifted.push([c, p]); else drawFlatCard(g, m, c, p); }
  drawLabels(g, m);
  lifted.sort((a, b) => a[0].lift - b[0].lift);
  for (const [c, p] of lifted) drawLiftedCard(g, m, c, p);
  const tc = m.cards[m.target - 1];
  if (tc && tc.lift > .2) { const p = cardPose(m, tc); drawLoupe(g, m, p); drawBrush(g, m, p); drawPencil(g, m, p); drawBubble(g, m, p); }
  drawParts(g, m);
  drawPill(g, m);
}

// ---------------------------------------------------------------- Claude events -> bench actions
// markers only count as whole lines, read by the one grammar in ../markers.js
const ASK = { test: t => hasMarker(t, 'ask') }, DONE = { test: t => hasMarker(t, 'done') };
function onClaudeEvent(m, ev, replay) {
  if (!ev || typeof ev !== 'object') return;
  const kind = ev.kind, text = String(ev.text || '');
  if (kind === 'user') { m.target = clamp(ev.slide | 0 || m.selected, 1, m.cards.length || 1); if (!replay) setMode(m, 'work'); return; }
  if (replay) return;
  if (kind === 'status' && ev.code === 'start') { m.target = m.selected; setMode(m, 'work'); return; }
  if (kind === 'tool' && m.mode === 'work') {
    const t = String(ev.tool || '');
    const c = m.cards[m.target - 1];
    if ((t === 'Edit' || t === 'Write' || t === 'MultiEdit') && c) { c.nextAccent = ACCENTS[(ACCENTS.indexOf(c.accent) + 1) % ACCENTS.length]; c.wipe = 0; m.brushT = m.t; c.bump = 1; }
    else if (t === 'Bash' || t === 'PowerShell') m.loupeT = m.t;
    return;
  }
  if (kind === 'say') {
    if (ASK.test(text)) setMode(m, 'wait');
    else if (DONE.test(text)) setMode(m, 'done');
    return;
  }
  if (kind === 'done') {
    if (ASK.test(text)) setMode(m, 'wait');
    else if (ev.ok && m.mode === 'work') setMode(m, 'done');
    else if (m.mode !== 'done') setMode(m, 'idle');
    return;
  }
  if (kind === 'error' || kind === 'limit') setMode(m, 'idle');
}

export default {
  mount(el, ctx = {}) {
    const m = makeModel(!!ctx.reducedMotion);
    const { root, remove } = makeRoot(el, 'edit-bench');
    const cv = createCanvas2D(root);
    let dead = false, timer = 0;
    syncCards(m);
    const paint = () => {
      const s = Math.min(cv.size.w / BW, cv.size.h / BH) || 1;
      cv.begin(); cv.g.translate((cv.size.w - BW * s) / 2, (cv.size.h - BH * s) / 2); cv.g.scale(s, s);
      draw(cv.g, m);
    };
    let lastT = 0;
    const loop = createLoop(dtLoop => {
      const now = performance.now() / 1000;
      const dt = lastT ? Math.min(0.1, now - lastT) : dtLoop;
      lastT = now;
      const busy = step(m, dt);
      paint();
      if (busy) return true;
      lastT = 0;
      return false;
    });
    loop.start();
    const wake = () => { if (!dead) loop.wake(); };
    // a slow ambient tick (the hovering card bobs) without keeping the GPU busy
    timer = setInterval(() => { if (!dead && !document.hidden && !m.reduced && m.cards.some(c => c.lift > .1)) wake(); }, 120);
    if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('15px "DM Sans"'), document.fonts.load('900 20px Epilogue')]).then(wake, () => {});

    const offs = [];
    const handleEvent = d => { if (dead || !d) return; onClaudeEvent(m, d.event, !!d.replay); wake(); };
    const handleState = d => {
      if (dead || !d) return;
      if (d.running && m.mode !== 'work') setMode(m, 'work');
      else if (d.waiting && !d.running) setMode(m, 'wait');
      else if (!d.running && !d.waiting && (m.mode === 'work' || m.mode === 'wait')) setMode(m, d.done ? 'done' : 'idle');
      wake();
    };
    offs.push(on('claude:event', handleEvent), on('claude:state', handleState));
    if (ctx.bus && ctx.bus !== appBus) offs.push(onBus(ctx.bus, 'claude:event', handleEvent), onBus(ctx.bus, 'claude:state', handleState));
    return {
      update(state) {
        const e = state && state.editor;
        if (!e) return;
        if (e.count) m.count = e.count | 0;
        if (e.selected) { m.selected = e.selected | 0; if (m.mode === 'idle') m.target = m.selected; }
        syncCards(m);
        wake();
      },
      destroy() {
        if (dead) return;
        dead = true; clearInterval(timer);
        offs.forEach(f => f()); loop.dispose(); cv.dispose(); remove();
      },
      get debug() { return { mode: m.mode, target: m.target, selected: m.selected, cards: m.cards.length, lifted: m.cards.filter(c => c.lift > .5).map(c => c.i + 1) }; },
    };
  },
};
