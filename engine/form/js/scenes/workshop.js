// Workshop scene: a small toon "slide factory" on a bench, floating above the character while Claude works.
//   Read        -> a document hops from the in-tray into the scanner and gets scanned
//   Write/Edit  -> a slide blank comes out of the scanner, is stamped by the press, painted, then tips onto the stack
//                  (Edit on a finished stack is a touch-up: the top card lifts and sparkles)
//   Bash        -> the machine at the back runs: gear spins, gauge swings, chimney puffs
//   stage marks -> the indicator bulbs on the bench front, the light tint and each station's mode
//   done        -> the finished cards fan out above the bench with confetti and hearts
//   waiting     -> the belt stops, the press nods and a "?" bubble bobs above it
// One model in world units (1 unit = 1 design px at the bench), drawn by three.js or, if three is unavailable, by a
// flat 2.5D canvas renderer that uses the same orthographic tilt, so both look the same. A canvas overlay carries the
// small pills (stage, slide count) and the waiting bubble in both modes.
import {
  PAL, clamp, lerp, damp, ease, rng, makeRoot, loadThree, createRenderer, createLoop, addStudioLights,
  createKit, disposeTree, createCanvas2D, rr, onBus, roundedSlab, heartShape, sparkleShape,
} from './three-kit.js';
import { bus as appBus, on } from '../bus.js';
import { scanMarkers } from '../markers.js';

const DW = 660, DH = 390;                       // design size of #illus
const TILT = 24 * Math.PI / 180, COS = Math.cos(TILT), SIN = Math.sin(TILT);
const TX = 0, TY = 44, ZOOM = 1.06;              // world point at the zone centre, world px -> design px

// Layout (world units; y up, z towards the viewer, bench top at y = 0)
const TABLE = { w: 590, h: 26, d: 170, z: -20 };
const BELT = { x0: -262, x1: 170, z: 5, w: 54, top: 12 };
const SCAN_X = -215, PRESS_X = -60, PAINT_X = 55, END_X = 140, STACK_X = 224, STACK_Z = 8;
const SPAWN_X = -166, CARD_W = 72, CARD_H = 42, CARD_T = 3, CARD_Y = BELT.top + 4 + CARD_H / 2;
const MX = 118, MZ = -74;                        // machine
const INBOX = { x: -266, z: -70 };
const FAN = { x: 24, y: 210, z: 62, r: 300 };
const STAGES = ['read', 'plan', 'build', 'check', 'export', 'done'];
const STAGE_COL = { read: PAL.lilac, plan: PAL.pink, build: PAL.orange, check: PAL.fur[4], export: PAL.rose, done: PAL.orange };
const STAGE_TEXT = { idle: 'getting ready', read: 'reading your files', plan: 'planning the slides', build: 'building your slides',
  check: 'checking every slide', export: 'packing it up', done: 'all done', wait: 'a quick question for you', fail: 'paused for now' };

// Card timeline (seconds from the card's start)
const T_PRESS = 0.9, T_HIT = 1.2, T_LEAVE_PRESS = 1.5, T_PAINT = 2.2, T_PAINT_END = 3.1, T_END = 3.7, T_STACKED = 4.3;
const CARD_GAP = 1.6, DOC_T = 2.1, DOC_GAP = 1.3;
const STACK_STEP = 3.4, STACK_SHOW = 14;

const C = { ink: PAL.ink, pill: PAL.pill, lilac: PAL.lilac, pink: PAL.pink, rose: PAL.rose, orange: PAL.orange, f0: PAL.fur[0], f1: PAL.fur[1], f2: PAL.fur[2], f3: PAL.fur[3], f4: PAL.fur[4] };
// Card face layouts in card-local units (card 72 x 42, origin at the centre); x is the left edge of each part.
const LAYOUTS = [
  [{ x: -27, y: 7, w: 44, h: 6.5, c: C.ink }, { x: -27, y: -3, w: 28, h: 3.4, c: C.lilac }, { x: -27, y: -11, w: 13, h: 3.4, c: C.pink }],
  [{ x: -30, y: 13, w: 30, h: 4.6, c: C.ink }, { x: -30, y: 3, w: 24, h: 2.8, c: C.f2 }, { x: -30, y: -4, w: 19, h: 2.8, c: C.f2 },
    { x: -30, y: -11, w: 22, h: 2.8, c: C.f2 }, { x: 3, y: -1, w: 27, h: 23, c: C.pink }],
  [{ x: -30, y: 13, w: 26, h: 4.6, c: C.ink }, { x: -26, y: -10, w: 8, h: 10, c: C.f3 }, { x: -14, y: -7, w: 8, h: 16, c: C.orange },
    { x: -2, y: -8.5, w: 8, h: 13, c: C.rose }, { x: 10, y: -4, w: 8, h: 22, c: C.orange }, { x: -28, y: -15.6, w: 50, h: 1.2, c: C.ink }],
  [{ x: -30, y: 13, w: 34, h: 4.6, c: C.ink }, { x: -30, y: 2, w: 3, h: 3, c: C.rose }, { x: -24, y: 2, w: 30, h: 2.8, c: C.f3 },
    { x: -30, y: -5, w: 3, h: 3, c: C.rose }, { x: -24, y: -5, w: 24, h: 2.8, c: C.f3 }, { x: -30, y: -12, w: 3, h: 3, c: C.rose },
    { x: -24, y: -12, w: 32, h: 2.8, c: C.f3 }, { x: 14, y: -4, w: 15, h: 26, c: C.lilac }],
];
const ACCENT = { x: 22, y: 13, w: 6, h: 6, c: C.orange };
const CONF_COLS = [PAL.pink, PAL.orange, PAL.lilac, PAL.fur[3], PAL.rose, PAL.fur[2]];

// ---------------------------------------------------------------- model
function makeModel(reduced) {
  return {
    reduced, t: 0, rnd: rng(7),
    stage: -1, stageT: -9, running: false, waiting: false, finished: false, failed: false,
    planned: 0, cards: [], docs: [], parts: [], made: 0, nextCard: 0, nextDoc: 0, touchT: -9, touchCard: -1,
    machine: 0, errT: -9, gear: 0, needle: 0, puffAcc: 0, dropAcc: 0,
    belt: 0, beltV: 0, wait: 0, fan: 0, fanVis: 0, celebrateT: -9, check: 0, exp: 0, planeT: -9, lastAct: -9,
    tint: [1, 1, 1],
  };
}
function resetModel(m) { Object.assign(m, makeModel(m.reduced), { t: m.t }); }

function spawn(m, k, x, y, z, vx, vy, vz, life, size, col, o = {}) {
  if (m.reduced || m.parts.length > 320) return;
  m.parts.push({ k, x, y, z, vx, vy, vz, age: 0, life, size, col, g: o.g || 0, drag: o.drag || 0, rot: o.rot || 0, vr: o.vr || 0, grow: o.grow || 0 });
}
function sparkBurst(m, x, y, z, n, spread = 70) {
  for (let i = 0; i < n; i++) {
    const a = m.rnd() * Math.PI * 2, s = spread * (0.5 + m.rnd() * 0.6);
    spawn(m, 'spark', x, y, z, Math.cos(a) * s, Math.sin(a) * s * 0.8 + 20, (m.rnd() - 0.5) * 30, 0.7 + m.rnd() * 0.3, 3 + m.rnd() * 2.5,
      CONF_COLS[i % CONF_COLS.length], { drag: 3, rot: m.rnd() * 6, vr: (m.rnd() - 0.5) * 6 });
  }
}

function addCard(m, instant) {
  const slot = m.made++;
  const v = slot === 0 ? 0 : 1 + ((slot - 1) % 3);
  instant = instant || m.reduced;
  const start = instant ? m.t - T_STACKED - 0.01 : Math.max(m.t, m.nextCard);
  m.nextCard = start + CARD_GAP;
  m.cards.push({ id: slot, slot, v, start, rev: 0, jx: (m.rnd() - 0.5) * 6, jz: (m.rnd() - 0.5) * 5, jr: (m.rnd() - 0.5) * 0.16, hit: instant, painted: instant, stacked: instant, seed: m.rnd() * 6 });
}
function addDoc(m) {
  if (m.reduced) return;
  const pending = m.docs.filter(d => d.start > m.t).length;
  if (pending >= 3) return;
  const start = Math.max(m.t, m.nextDoc);
  m.nextDoc = start + DOC_GAP;
  m.docs.push({ start, done: false });
}
const stackedCards = m => m.cards.filter(c => c.stacked);
const stackTop = m => { const n = Math.min(stackedCards(m).length, STACK_SHOW); return 6 + n * STACK_STEP; };

function setStage(m, name, replay) {
  const i = STAGES.indexOf(name);
  if (i < 0 || i === m.stage) return;
  m.stage = i; m.stageT = replay ? -9 : m.t;
  if (!replay) sparkBurst(m, -262 + i * 18, -13, 70, 5, 40);
  if (name === 'done') celebrate(m, replay);
}
function celebrate(m, instant) {
  if (m.finished) return;
  m.finished = true; m.failed = false; m.waiting = false;
  if (m.stage < 5) { m.stage = 5; m.stageT = m.t; }
  if (!m.cards.length) for (let i = 0; i < Math.max(5, Math.min(8, m.planned || 6)); i++) addCard(m, true);
  if (instant || m.reduced) { m.fan = 1; return; }
  m.celebrateT = m.t;
}

// Translates one normalised Claude event into factory actions.
function onClaudeEvent(m, ev, replay) {
  if (!ev || typeof ev !== 'object') return;
  const kind = ev.kind, text = String(ev.text || ''), tool = String(ev.tool || '');
  if (kind === 'status' && ev.code === 'start') { resetModel(m); m.running = true; return; }
  if (!replay) m.lastAct = m.t;
  if (kind === 'say') {
    const mm = text.match(/(\d{1,2})\s+slides?/i);
    if (mm && !m.planned) m.planned = clamp(+mm[1], 1, 30);
    const found = scanMarkers(text).markers;               // one grammar for every reader (../markers.js)
    for (const mk of found) if (mk.name === 'stage') setStage(m, mk.attrs.value, replay);
    if (found.some(mk => mk.name === 'done')) celebrate(m, replay);
    if (found.some(mk => mk.name === 'ask') && !m.finished) m.waiting = true;
    if (replay && m.finished) m.fan = 1;
    return;
  }
  if (kind === 'tool') {
    const slideFile = /\.html?\b/i.test(String(ev.detail || '')) || !ev.detail;
    if (tool === 'Read' || tool === 'Glob' || tool === 'Grep') {
      if (!replay && tool === 'Read') addDoc(m);
      else if (!replay) m.lastScan = m.t;
    } else if (tool === 'Write' || tool === 'Edit' || tool === 'MultiEdit' || tool === 'NotebookEdit') {
      const want = m.planned || 6;
      if (tool === 'Write' && m.made === 0 && slideFile) { for (let i = 0; i < Math.min(want, 12); i++) addCard(m, replay); }
      else if (m.made < want) addCard(m, replay);
      else if (!replay) touchUp(m);
    } else if (!replay) {
      m.machine = tool === 'Bash' ? 1 : Math.max(m.machine, 0.45);
    }
    if (m.waiting && !replay) m.waiting = false;
    return;
  }
  if (kind === 'tool-error') { if (!replay) { m.errT = m.t; m.machine = Math.max(m.machine, 0.6); } return; }
  if (kind === 'user') { m.waiting = false; m.failed = false; return; }
  if (kind === 'error' || kind === 'limit') { m.failed = true; m.running = false; return; }
  if (kind === 'done') {
    m.running = false;
    if (ev.ok === false) { m.failed = true; return; }
    if (m.stage === 5 && !m.waiting) celebrate(m, replay);
  }
}
function touchUp(m) {
  const st = stackedCards(m);
  if (!st.length) { m.dropAcc += 4; return; }
  const c = st[st.length - 1 - ((m.touchN = (m.touchN || 0) + 1) - 1) % Math.min(3, st.length)];
  c.rev++; m.touchT = m.t; m.touchCard = c.id;
}

// Pose of a card at the current time (world), also used by both renderers.
function cardPose(m, c, o) {
  const a = m.t - c.start;
  o.vis = a >= 0; o.blank = a < T_HIT; o.clip = a < T_END; o.paint = clamp((a - T_PAINT) / (T_PAINT_END - T_PAINT));
  o.sx = o.sy = o.sz = 1; o.rx = o.ry = o.rz = 0; o.z = BELT.z; o.y = CARD_Y;
  if (a < T_PRESS) { o.x = lerp(SPAWN_X, PRESS_X, ease.inOutCubic(a / T_PRESS)); const k = ease.outBack(a / 0.35); o.sx = o.sy = o.sz = Math.max(0.001, k); }
  else if (a < T_LEAVE_PRESS) {
    o.x = PRESS_X;
    if (a >= T_HIT) { const k = clamp((a - T_HIT) / 0.3); o.sy = lerp(0.62, 1, ease.outBack(k)); o.sx = lerp(1.14, 1, ease.outCubic(k)); o.y = CARD_Y - (1 - o.sy) * CARD_H / 2; }
  } else if (a < T_PAINT) o.x = lerp(PRESS_X, PAINT_X, ease.inOutCubic((a - T_LEAVE_PRESS) / (T_PAINT - T_LEAVE_PRESS)));
  else if (a < T_PAINT_END) o.x = PAINT_X;
  else if (a < T_END) o.x = lerp(PAINT_X, END_X, ease.inOutCubic((a - T_PAINT_END) / (T_END - T_PAINT_END)));
  else {
    const n = Math.max(0, stackedCards(m).length - STACK_SHOW);
    const slot = c.stacked ? stackedCards(m).indexOf(c) - n : Math.min(stackedCards(m).length, STACK_SHOW);
    const sy = 6 + CARD_T / 2 + slot * STACK_STEP + 0.2;
    const k = ease.inOutCubic((a - T_END) / (T_STACKED - T_END));
    o.x = lerp(END_X, STACK_X + c.jx, k); o.z = lerp(BELT.z, STACK_Z + c.jz, k);
    o.y = lerp(CARD_Y, sy, k) + Math.sin(k * Math.PI) * 34;
    o.rx = -Math.PI / 2 * k; o.rz = c.jr * k;
    o.buried = slot < 0;
    if (c.id === m.touchCard) { const tk = m.t - m.touchT; if (tk < 1.1) { o.y += Math.sin(clamp(tk / 1.1) * Math.PI) * 26; o.rz += Math.sin(tk * 9) * 0.08 * (1 - tk / 1.1); } }
  }
  // finale: the last stacked cards fan out above the bench
  if (c.stacked && m.fan > 0) {
    const st = stackedCards(m), n = Math.min(7, st.length), idx = st.indexOf(c) - (st.length - n);
    if (idx >= 0) {
      const k = ease.outBack(clamp(m.fan * 1.7 - idx * 0.1));
      if (k > 0) {
        const u = idx - (n - 1) / 2, ang = u * 0.165;
        const sway = m.reduced ? 0 : Math.sin(m.t * 1.1 + idx * 0.9) * 0.025;
        const fx = FAN.x + Math.sin(ang) * FAN.r, fy = FAN.y - FAN.r + Math.cos(ang) * FAN.r + (m.reduced ? 0 : Math.sin(m.t * 1.6 + idx) * 2.5);
        o.x = lerp(o.x, fx, k); o.y = lerp(o.y, fy, k); o.z = lerp(o.z, FAN.z + idx * 3, k);
        o.rx = lerp(o.rx, -0.12, k); o.rz = lerp(o.rz, -ang + sway, k);
        o.sx = o.sy = o.sz = lerp(1, 1.12, k); o.buried = false;
      }
    }
  }
  return o;
}

// Document pose (in-tray hop -> scan -> absorbed into the scanner hood).
function docPose(m, d, o) {
  const a = m.t - d.start;
  o.vis = a >= 0 && a < DOC_T; o.scan = -1; o.s = 1; o.rz = 0;
  if (a < 0.6) {
    const k = ease.inOutCubic(a / 0.6);
    o.x = lerp(INBOX.x, SCAN_X, k); o.z = lerp(INBOX.z, BELT.z - 2, k); o.y = lerp(26, BELT.top + 25, k) + Math.sin(k * Math.PI) * 40;
    o.rz = Math.sin(k * Math.PI) * 0.3; o.s = lerp(0.6, 1, k);
  } else if (a < 1.6) { o.x = SCAN_X; o.z = BELT.z - 2; o.y = BELT.top + 25; o.scan = (a - 0.6) / 1.0; }
  else {
    const k = ease.inBack((a - 1.6) / 0.5);
    o.x = SCAN_X; o.z = BELT.z - 2 - k * 20; o.y = lerp(BELT.top + 25, 92, k); o.s = Math.max(0.05, 1 - k * 0.9);
  }
  return o;
}

const _o = {};
function step(m, dt) {
  const t = (m.t += dt), rm = m.reduced;
  let busy = false;
  // stations follow the cards
  m.stamp = 0; m.painting = -1; m.travel = false;
  for (const c of m.cards) {
    const a = t - c.start;
    if (a < 0) { busy = true; continue; }
    if (a < T_STACKED) busy = true;
    if ((a > 0 && a < T_PRESS) || (a > T_LEAVE_PRESS && a < T_PAINT) || (a > T_PAINT_END && a < T_END)) m.travel = true;
    if (a >= T_PRESS && a < T_LEAVE_PRESS) {
      const u = (a - T_PRESS) / (T_LEAVE_PRESS - T_PRESS);
      m.stamp = u < 0.5 ? ease.inBack(u / 0.5) : 1 - ease.outCubic((u - 0.5) / 0.5);
    }
    if (!c.hit && a >= T_HIT) {
      c.hit = true;
      for (let i = 0; i < 12; i++) spawn(m, 'chip', PRESS_X + (m.rnd() - 0.5) * 80, CARD_Y + (m.rnd() - 0.2) * 26, BELT.z + 4, (m.rnd() - 0.5) * 130, 40 + m.rnd() * 80, (m.rnd() - 0.2) * 60, 0.9, 3 + m.rnd() * 2, m.rnd() < 0.5 ? C.f0 : C.f1, { g: -320, rot: m.rnd() * 6, vr: (m.rnd() - 0.5) * 14 });
    }
    if (a >= T_PAINT && a < T_PAINT_END) m.painting = (a - T_PAINT) / (T_PAINT_END - T_PAINT), m.paintCard = c;
    if (!c.stacked && a >= T_STACKED) { c.stacked = true; sparkBurst(m, STACK_X, stackTop(m) + 6, STACK_Z + 10, 4, 45); }
  }
  // paint drops
  if (m.painting >= 0 && !rm) {
    m.dropAcc += dt * 42;
    const L = LAYOUTS[m.paintCard.v];
    while (m.dropAcc >= 1) {
      m.dropAcc--;
      const nx = m.nozzleX, ny = 86, nz = 30, T = 0.32;
      const tx = PAINT_X + (m.rnd() - 0.5) * 60, ty = CARD_Y + (m.rnd() - 0.5) * 34, tz = BELT.z + 3, g = -300;
      spawn(m, 'drop', nx, ny, nz, (tx - nx) / T, (ty - ny) / T - 0.5 * g * T, (tz - nz) / T, T, 2 + m.rnd() * 1.2, L[(m.rnd() * L.length) | 0].c, { g });
    }
  } else m.dropAcc = Math.min(m.dropAcc, 6);
  m.nozzleX = PAINT_X + (m.painting >= 0 && !rm ? Math.sin(m.painting * Math.PI * 3) * 24 : 0);
  // docs
  for (const d of m.docs) {
    const a = t - d.start;
    if (a < DOC_T) busy = true;
    if (!d.done && a >= DOC_T - 0.05) { d.done = true; sparkBurst(m, SCAN_X, 92, -4, 5, 40); }
  }
  m.docs = m.docs.filter(d => t - d.start < DOC_T);
  m.scanning = m.docs.some(d => { const a = t - d.start; return a >= 0.6 && a < 1.6; });
  // machine (Bash)
  if (m.machine > 0) { busy = true; m.machine = Math.max(0, m.machine - dt / 3.2); }
  const err = t - m.errT < 1.2;
  if (err) busy = true;
  m.gear += dt * (rm ? 0 : 0.25 + m.machine * 7);
  m.needle = damp(m.needle, -1.1 + m.machine * 2.0 + (rm ? 0 : Math.sin(t * 13) * 0.12 * m.machine), 6, dt);
  if (!rm && (m.machine > 0.05 || err)) {
    m.puffAcc += dt * (err ? 7 : 1.5 + m.machine * 4);
    while (m.puffAcc >= 1) {
      m.puffAcc--;
      spawn(m, 'puff', MX + 30 + (m.rnd() - 0.5) * 4, 96, MZ, 6 + m.rnd() * 10, 34 + m.rnd() * 14, (m.rnd() - 0.5) * 8, 1.7, 3.5 + m.rnd() * 1.5,
        err ? C.f4 : (m.rnd() < 0.7 ? C.pill : C.f0), { grow: 5, drag: 0.6 });
    }
  }
  // belt
  const beltTarget = m.travel ? 1 : (m.running && !m.waiting && !m.finished && !m.failed ? 0.12 : 0);
  m.beltV = damp(m.beltV, rm ? 0 : beltTarget, 5, dt);
  m.belt += m.beltV * dt * 120;
  if (m.beltV > 0.01) busy = busy || m.beltV > 0.2;
  // smoothed modes
  const w0 = m.wait; m.wait = damp(m.wait, m.waiting && !m.finished ? 1 : 0, 6, dt); if (Math.abs(m.wait - w0) > 1e-4) busy = true;
  const k0 = m.check; m.check = damp(m.check, m.stage === 3 && !m.finished ? 1 : 0, 5, dt); if (Math.abs(m.check - k0) > 1e-4) busy = true;
  const e0 = m.exp; m.exp = damp(m.exp, m.stage === 4 && !m.finished ? 1 : 0, 5, dt); if (Math.abs(m.exp - e0) > 1e-4) busy = true;
  if (m.stage === 4 && !m.finished && t - m.planeT > 4.2 && stackedCards(m).length) { m.planeT = t; }
  if (t - m.planeT < 2.6) busy = true;
  if (m.finished) {
    const f0 = m.fan;
    if (t - m.celebrateT > 0.15 || m.celebrateT < 0) m.fan = Math.min(1, m.fan + dt / 1.3);
    if (m.fan !== f0) busy = true;
    if (m.celebrateT > 0 && !m.burst && t - m.celebrateT > 0.9) {
      m.burst = true;
      for (let i = 0; i < 70; i++) {
        const a = -Math.PI / 2 + (m.rnd() - 0.5) * 2.6;
        const s = 150 + m.rnd() * 170;
        spawn(m, i % 5 === 0 ? 'heart' : 'conf', FAN.x + (m.rnd() - 0.5) * 120, FAN.y - 10, FAN.z + 10, Math.cos(a) * s * 0.9, -Math.sin(a) * s, (m.rnd() - 0.3) * 80,
          2.4 + m.rnd() * 0.8, i % 5 === 0 ? 7 + m.rnd() * 3 : 4 + m.rnd() * 2, CONF_COLS[i % CONF_COLS.length], { g: -300, drag: 1.4, rot: m.rnd() * 6, vr: (m.rnd() - 0.5) * 10 });
      }
    }
  }
  if (t - m.touchT < 1.2) {
    busy = true;
    if (!m.touchFx || m.touchFx !== m.touchT) { m.touchFx = m.touchT; sparkBurst(m, STACK_X, stackTop(m) + 24, STACK_Z + 12, 8, 60); }
  }
  if (t - m.stageT < 1.2) busy = true;
  // light tint follows the stage
  const sc = hexRgb(m.failed ? PAL.fur[2] : m.stage >= 0 ? STAGE_COL[STAGES[m.stage]] : '#ffffff');
  for (let i = 0; i < 3; i++) m.tint[i] = damp(m.tint[i], lerp(1, sc[i], 0.35), 3, dt);
  // particles
  for (const p of m.parts) {
    p.age += dt;
    const dr = p.drag ? Math.exp(-p.drag * dt) : 1;
    p.vx *= dr; p.vy = p.vy * dr + p.g * dt; p.vz *= dr;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += p.vr * dt;
  }
  if (m.parts.length) { busy = true; m.parts = m.parts.filter(p => p.age < p.life); }
  return busy;
}
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
const shade = (hex, k) => { const [r, g, b] = hexRgb(hex); const f = v => Math.round(clamp(v * k * 255, 0, 255)); return `rgb(${f(r)},${f(g)},${f(b)})`; };

// Station poses derived from the model (shared by both renderers).
function stations(m) {
  const t = m.reduced ? 0 : m.t, w = m.wait;
  return {
    stampY: lerp(86, 66, m.stamp) + Math.sin(t * 2.4) * 4 * w,
    stampTilt: Math.sin(t * 1.2) * 0.12 * w,
    scanGlow: clamp((m.scanning ? 1 : 0) + (m.stage === 0 ? 0.35 + 0.25 * Math.sin(t * 2) : 0)),
    shake: t - m.errT < 1.2 ? Math.sin(t * 60) * 1.6 * (1 - (t - m.errT) / 1.2) : Math.sin(t * 40) * 0.5 * m.machine,
    bob: Math.sin(t * 1.3) * 1.5,
  };
}
function bulbState(m, i) {
  if (m.failed && i === Math.max(0, m.stage)) return { col: PAL.fur[2], glow: 0 };
  if (m.finished) return { col: PAL.orange, glow: 0.5 + 0.5 * Math.sin((m.reduced ? 0 : m.t) * 3 - i * 0.7) };
  if (i < m.stage) return { col: PAL.pink, glow: 0.25 };
  if (i === m.stage) return { col: PAL.orange, glow: 0.55 + 0.45 * Math.sin((m.reduced ? 0 : m.t) * 4) };
  return { col: PAL.pill, glow: 0 };
}

// ---------------------------------------------------------------- 2D projection (orthographic tilt, design px)
const P = (x, y, z) => [DW / 2 + (x - TX) * ZOOM, DH / 2 - ((y - TY) * COS - z * SIN) * ZOOM];

// ---------------------------------------------------------------- overlay (pills, waiting bubble) — both modes
function drawOverlay(g, m) {
  const t = m.reduced ? 0 : m.t;
  g.save();
  g.textBaseline = 'middle';
  g.font = '15px "DM Sans", system-ui, sans-serif';
  const key = m.failed ? 'fail' : m.finished ? 'done' : m.wait > 0.5 ? 'wait' : m.stage >= 0 ? STAGES[m.stage] : 'idle';
  const text = STAGE_TEXT[key];
  const tw = g.measureText(text).width, ph = 30, pw = tw + 42;
  g.fillStyle = PAL.pill; rr(g, 8, 8, pw, ph, ph / 2); g.fill();
  const dotCol = key === 'idle' ? PAL.fur[2] : key === 'wait' ? PAL.pink : key === 'fail' ? PAL.fur[3] : STAGE_COL[key] || PAL.orange;
  g.fillStyle = dotCol; g.beginPath(); g.arc(8 + 16, 8 + ph / 2, 5 + (key !== 'idle' && key !== 'fail' ? Math.sin(t * 4) * 1 : 0), 0, Math.PI * 2); g.fill();
  g.fillStyle = PAL.ink; g.fillText(text, 8 + 30, 8 + ph / 2 + 1);
  const n = m.cards.filter(c => c.hit).length;
  if (n > 0 && !m.finished) {   // a running tally only: the real slide count comes from claude's final message
    const ct = `${n} slide${n === 1 ? '' : 's'}`, cw = g.measureText(ct).width + 26;
    g.fillStyle = PAL.ink; rr(g, DW - 8 - cw, 8, cw, ph, ph / 2); g.fill();
    g.fillStyle = PAL.pill; g.fillText(ct, DW - 8 - cw + 13, 8 + ph / 2 + 1);
  }
  // waiting bubble above the press
  if (m.wait > 0.02) {
    const [bx, by0] = P(PRESS_X, 150, 5), by = by0 + Math.sin(t * 2.2) * 4;
    const s = ease.outBack(m.wait);
    g.save(); g.translate(bx, by); g.scale(s, s); g.globalAlpha = clamp(m.wait * 1.4);
    g.fillStyle = PAL.ink; rr(g, -24, -20, 48, 40, 20); g.fill();
    g.beginPath(); g.moveTo(-6, 18); g.lineTo(2, 30); g.lineTo(8, 18); g.fill();
    g.fillStyle = PAL.pill; g.font = '900 24px Epilogue, "DM Sans", sans-serif'; g.textAlign = 'center'; g.fillText('?', 0, 2);
    g.restore();
  }
  g.restore();
}

// ---------------------------------------------------------------- 2D renderer (fallback)
function poly(g, pts) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); }
// Flat box: top face (lighter) + front face. (x,y,z) = centre.
function box(g, x, y, z, w, h, d, col, r = 4, topK = 1.07) {
  const [x0, yTopBack] = P(x - w / 2, y + h / 2, z - d / 2), [, yTopFront] = P(0, y + h / 2, z + d / 2), [x1, yBot] = P(x + w / 2, y - h / 2, z + d / 2);
  g.fillStyle = shade(col, topK); rr(g, x0, yTopBack, x1 - x0, yTopFront - yTopBack + r, Math.min(r, (yTopFront - yTopBack) / 2 + r / 2)); g.fill();
  g.fillStyle = col; rr(g, x0, yTopFront, x1 - x0, yBot - yTopFront, r); g.fill();
}
function disc(g, x, y, z, r, col) { const [sx, sy] = P(x, y, z); g.fillStyle = col; g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.fill(); }

// Projects card-local points through the card pose (rotation Z, then X, like three's XYZ order with ry ~ 0).
function cardMap(o) {
  const cx = Math.cos(o.rx), sx = Math.sin(o.rx), cz = Math.cos(o.rz), sz = Math.sin(o.rz);
  return (lx, ly, lz) => {
    lx *= o.sx; ly *= o.sy; lz *= o.sz;
    const x1 = lx * cz - ly * sz, y1 = lx * sz + ly * cz;
    const y2 = y1 * cx - lz * sx, z2 = y1 * sx + lz * cx;
    return P(o.x + x1, o.y + y2, o.z + z2);
  };
}
function drawCard2D(g, m, c, o) {
  const f = cardMap(o), hw = CARD_W / 2, hh = CARD_H / 2, ht = CARD_T / 2;
  const rect = (x0, y0, x1, y1, z) => poly(g, [f(x0, y0, z), f(x1, y0, z), f(x1, y1, z), f(x0, y1, z)]);
  if (o.blank) {
    g.fillStyle = C.f1; rect(-hw - 3, -hh - 3, hw + 3, hh + 3, -ht); g.fill();
    g.fillStyle = C.f0; rect(-hw - 3, -hh - 3, hw + 3, hh + 3, ht); g.fill();
    g.strokeStyle = C.f2; g.lineWidth = 1.2; g.setLineDash([3, 3]); rect(-hw, -hh, hw, hh, ht + 0.2); g.stroke(); g.setLineDash([]);
  } else {
    g.fillStyle = C.f2; rect(-hw, -hh, hw, hh, -ht); g.fill();
    g.fillStyle = C.f1; rect(-hw, -hh, hw, hh, 0); g.fill();
    g.fillStyle = C.pill; rect(-hw, -hh, hw, hh, ht); g.fill();
    const L = LAYOUTS[c.v], n = L.length;
    const parts = c.rev > 0 ? L.concat([ACCENT]) : L;
    parts.forEach((p, k) => {
      const pk = k >= n ? 1 : clamp((o.paint - k / n * 0.7) / 0.3);
      if (pk <= 0.01) return;
      g.fillStyle = p.c; rect(p.x, p.y - p.h / 2, p.x + p.w * pk, p.y + p.h / 2, ht + 0.3); g.fill();
    });
  }
  if (o.clip) { g.fillStyle = C.ink; const [a, b] = P(o.x - 10, BELT.top + 4, o.z + 4), [e, h] = P(o.x + 10, BELT.top, o.z + 4); rr(g, a, b, e - a, h - b, 2); g.fill(); }
}
function heartPath() {
  return new Path2D('M0,-0.42 C-0.12,-0.3 -0.5,-0.08 -0.5,0.16 C-0.5,0.36 -0.36,0.48 -0.24,0.48 C-0.11,0.48 -0.03,0.4 0,0.32 C0.03,0.4 0.11,0.48 0.24,0.48 C0.36,0.48 0.5,0.36 0.5,0.16 C0.5,-0.08 0.12,-0.3 0,-0.42Z');
}
function gearPath2D(N, rIn, rOut) {
  const p = new Path2D(), step = Math.PI * 2 / N;
  for (let k = 0; k < N; k++) {
    const a = k * step;
    [[rIn, a - 0.31 * step], [rOut, a - 0.15 * step], [rOut, a + 0.15 * step], [rIn, a + 0.31 * step]].forEach(([r, b], i) => {
      const x = Math.cos(b) * r, y = Math.sin(b) * r; (k === 0 && i === 0) ? p.moveTo(x, y) : p.lineTo(x, y);
    });
  }
  p.closePath(); p.moveTo(rIn * 0.35, 0); p.arc(0, 0, rIn * 0.35, 0, Math.PI * 2, true);
  return p;
}

function create2D(root) {
  const cv = createCanvas2D(root);
  const g = cv.g, heart = heartPath(), gear = gearPath2D(10, 10, 14), o = {};
  function drawParticles(m, front) {
    for (const p of m.parts) {
      if ((p.z > 20) !== front) continue;
      const [x, y] = P(p.x, p.y, p.z), u = p.age / p.life;
      g.globalAlpha = p.k === 'puff' ? 0.85 * (1 - u) : clamp((1 - u) * 3);
      g.fillStyle = p.col;
      if (p.k === 'puff') { g.beginPath(); g.arc(x, y, (p.size + p.grow * u * 1.6) * clamp((1 - u) * 2.5), 0, Math.PI * 2); g.fill(); }
      else if (p.k === 'drop') { g.beginPath(); g.arc(x, y, p.size, 0, Math.PI * 2); g.fill(); }
      else if (p.k === 'heart') { g.save(); g.translate(x, y); g.rotate(Math.sin(p.rot) * 0.5); g.scale(p.size * 1.8, p.size * 1.8); g.fill(heart); g.restore(); }
      else if (p.k === 'spark') { g.save(); g.translate(x, y); g.rotate(p.rot); const s = p.size; g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.28, -s * 0.28); g.lineTo(s, 0); g.lineTo(s * 0.28, s * 0.28); g.lineTo(0, s); g.lineTo(-s * 0.28, s * 0.28); g.lineTo(-s, 0); g.lineTo(-s * 0.28, -s * 0.28); g.closePath(); g.fill(); g.restore(); }
      else { g.save(); g.translate(x, y); g.rotate(p.rot); g.scale(1, Math.abs(Math.cos(p.rot * 1.3)) + 0.15); g.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2); g.restore(); }
    }
    g.globalAlpha = 1;
  }
  return {
    cv,
    paint(m) {
      const s = Math.min(cv.size.w / DW, cv.size.h / DH) || 1;
      cv.begin(); g.translate((cv.size.w - DW * s) / 2, (cv.size.h - DH * s) / 2); g.scale(s, s);
      const S = stations(m), t = m.reduced ? 0 : m.t;
      // shadow, legs, table
      const [shx, shy] = P(0, -76, 0);
      g.fillStyle = 'rgba(146,129,176,0.12)'; g.beginPath(); g.ellipse(shx, shy, 300 * ZOOM, 15, 0, 0, Math.PI * 2); g.fill();
      [[-268, -92], [268, -92], [-268, 48], [268, 48]].forEach(([x, z]) => box(g, x, -48, z, 13, 46, 13, C.f2, 5));
      box(g, 0, -TABLE.h / 2, TABLE.z, TABLE.w, TABLE.h, TABLE.d, C.f0, 10, 1.04);
      // in-tray
      box(g, INBOX.x, 3, INBOX.z, 46, 6, 34, C.f2, 3);
      for (let i = 0; i < 4; i++) box(g, INBOX.x + (i % 2) * 1.5, 7 + i * 2.2, INBOX.z, 34, 2, 26, i % 2 ? '#ffffff' : C.pill, 1);
      // machine
      g.save(); g.translate(S.shake, 0);
      box(g, MX + 30, 78, MZ, 18, 30, 18, C.f4, 6);
      box(g, MX, 32, MZ, 92, 64, 44, C.f2, 10);
      box(g, MX - 2, 40, MZ + 22, 76, 40, 1, C.f1, 8);
      const [gx, gy] = P(MX - 20, 44, MZ + 23);
      g.fillStyle = C.pill; g.beginPath(); g.arc(gx, gy, 11, 0, Math.PI * 2); g.fill();
      g.strokeStyle = C.ink; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx + Math.sin(m.needle) * 9, gy - Math.cos(m.needle) * 9); g.stroke();
      g.fillStyle = C.ink; g.beginPath(); g.arc(gx, gy, 2, 0, Math.PI * 2); g.fill();
      const lampOn = m.machine > 0.05 && Math.sin(t * 12) > 0;
      disc(g, MX - 22, 25, MZ + 23, 4, lampOn ? C.orange : shade(C.orange, 0.75));
      disc(g, MX - 9, 25, MZ + 23, 4, m.machine > 0.05 && !lampOn ? C.pink : shade(C.pink, 0.75));
      const [ggx, ggy] = P(MX + 22, 40, MZ + 24);
      g.save(); g.translate(ggx, ggy); g.rotate(m.gear); g.fillStyle = C.orange; g.fill(gear, 'evenodd'); g.restore();
      g.restore();
      drawParticles(m, false);
      // back posts of the stations
      box(g, SCAN_X, 42, -48, 54, 84, 26, C.f3, 7);
      box(g, PRESS_X, 59, -46, 22, 118, 20, C.f2, 5);
      box(g, PAINT_X, 55, -46, 18, 110, 18, C.f2, 5);
      // belt
      box(g, (BELT.x0 + BELT.x1) / 2, BELT.top / 2, BELT.z, BELT.x1 - BELT.x0, BELT.top, BELT.w, C.f4, 6, 1.18);
      {
        const [ax, ay] = P(BELT.x0 + 8, BELT.top, BELT.z - BELT.w / 2 + 4), [bx, by] = P(BELT.x1 - 8, BELT.top, BELT.z + BELT.w / 2 - 4);
        g.save(); g.beginPath(); g.rect(ax, ay, bx - ax, by - ay); g.clip();
        g.fillStyle = C.f3;
        const off = ((m.belt % 30) + 30) % 30;
        for (let x = ax - 30 + off; x < bx; x += 30) { g.fillRect(x, ay, 12, by - ay); }
        g.restore();
        [BELT.x0 + 6, BELT.x1 - 6].forEach(x => { const [rx, ry] = P(x, 6, BELT.z + BELT.w / 2); g.fillStyle = C.pill; g.beginPath(); g.arc(rx, ry, 5, 0, Math.PI * 2); g.fill(); g.fillStyle = C.ink; g.beginPath(); g.arc(rx + Math.cos(m.belt / 7) * 2.2, ry + Math.sin(m.belt / 7) * 2.2, 1.4, 0, Math.PI * 2); g.fill(); });
      }
      // stack tray + band
      box(g, STACK_X, 3, STACK_Z, 86, 6, 60, C.f2, 3);
      // docs
      for (const d of m.docs) {
        docPose(m, d, o);
        if (!o.vis) continue;
        const [x, y] = P(o.x, o.y, o.z), w = 34 * o.s * ZOOM, h = 46 * o.s * COS * ZOOM;
        g.save(); g.translate(x, y); g.rotate(-o.rz);
        g.fillStyle = C.f1; rr(g, -w / 2 + 2, -h / 2 + 2, w, h, 2); g.fill();
        g.fillStyle = '#ffffff'; rr(g, -w / 2, -h / 2, w, h, 2); g.fill();
        g.fillStyle = C.ink; g.fillRect(-w / 2 + 5 * o.s, -h / 2 + 6 * o.s, 16 * o.s, 3 * o.s);
        g.fillStyle = C.lilac; for (let i = 0; i < 4; i++) g.fillRect(-w / 2 + 5 * o.s, -h / 2 + (14 + i * 6) * o.s, (i === 3 ? 14 : 24) * o.s, 2 * o.s);
        g.fillStyle = C.pink; g.fillRect(-w / 2 + 5 * o.s, -h / 2 + 36 * o.s, 12 * o.s, 5 * o.s);
        g.restore();
        if (o.scan >= 0) {
          const ly = y - h / 2 + h * Math.abs(((o.scan * 2) % 2) - (o.scan * 2 % 2 > 1 ? 2 : 0));
          g.globalAlpha = 0.28; g.fillStyle = C.pink; g.fillRect(x - 25, ly - 7, 50, 14);
          g.globalAlpha = 1; g.fillRect(x - 25, ly - 1.5, 50, 3);
        }
      }
      // cards on the belt / tipping / stacked (buried ones drawn as a block)
      const st = stackedCards(m), buried = Math.max(0, st.length - STACK_SHOW);
      if (buried) box(g, STACK_X, 6 + 1, STACK_Z, 74, 2, 44, C.f1, 2);
      const order = m.cards.map(c => ({ c, o: cardPose(m, c, {}) })).filter(e => e.o.vis && !e.o.buried);
      order.sort((a, b) => (a.o.z - b.o.z) || (a.o.y - b.o.y));
      const front = order.filter(e => e.o.z > 40);
      for (const e of order) if (e.o.z <= 40) drawCard2D(g, m, e.c, e.o);
      // export band
      if (m.exp > 0.02 && st.length) {
        const top = stackTop(m);
        g.globalAlpha = clamp(m.exp * 1.5); box(g, STACK_X, (6 + top) / 2 + 1, STACK_Z, 9, top - 4, 50, C.orange, 2); g.globalAlpha = 1;
      }
      // overhead heads (in front of the cards)
      box(g, SCAN_X, 92, -14, 58, 14, 76, C.f4, 5);
      const glow = S.scanGlow;
      disc(g, SCAN_X, 84, 24, 4 + glow * 2, glow > 0.05 ? C.pink : shade(C.pink, 0.8));
      box(g, PRESS_X, 112, -18, 30, 16, 64, C.f3, 5);
      { const [px, py0] = P(PRESS_X, 104, 5), [, py1] = P(PRESS_X, S.stampY + 6, 5); g.fillStyle = C.pill; g.fillRect(px - 4, py0, 8, py1 - py0); }
      g.save(); { const [cx, cy] = P(PRESS_X, S.stampY, 5); g.translate(cx, cy); g.rotate(S.stampTilt); g.translate(-cx, -cy); }
      box(g, PRESS_X, S.stampY, 5, 84, 12, 22, C.pink, 4); g.restore();
      box(g, PAINT_X, 104, -10, 16, 12, 80, C.f3, 4);
      box(g, PAINT_X, 118, -30, 18, 18, 18, C.orange, 7);
      { const [nx, ny] = P(m.nozzleX, 92, 28), [ax0] = P(PAINT_X, 0, 0); g.strokeStyle = C.f4; g.lineWidth = 3; g.beginPath(); g.moveTo(ax0, P(0, 98, 28)[1]); g.lineTo(nx, ny - 4); g.stroke(); g.fillStyle = C.ink; g.beginPath(); g.moveTo(nx - 6, ny - 6); g.lineTo(nx + 6, ny - 6); g.lineTo(nx, ny + 6); g.closePath(); g.fill(); }
      // loupe (check stage)
      if (m.check > 0.02) {
        const top = stackTop(m), lx = STACK_X + Math.sin(t * 0.9) * 18, ly = top + 44 + Math.sin(t * 1.7) * 4;
        const [x, y] = P(lx, ly, STACK_Z + 20), k = ease.outBack(m.check);
        g.save(); g.translate(x, y); g.scale(k, k); g.rotate(0.5);
        g.fillStyle = C.ink; rr(g, -3, 16, 6, 22, 3); g.fill();
        g.globalAlpha = 0.45; g.fillStyle = C.lilac; g.beginPath(); g.arc(0, 0, 16, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1; g.strokeStyle = C.ink; g.lineWidth = 4.5; g.beginPath(); g.arc(0, 0, 16, 0, Math.PI * 2); g.stroke();
        g.restore();
      }
      // paper plane (export)
      const pt = m.t - m.planeT;
      if (pt >= 0 && pt < 2.6 && !m.reduced) {
        const k = pt / 2.6, px = STACK_X - 10 + k * 160, py = stackTop(m) + 10 + Math.sin(k * Math.PI) * 120, pz = STACK_Z + 20 - k * 60;
        const [x, y] = P(px, py, pz);
        g.save(); g.translate(x, y); g.rotate(-0.5 + k * 0.6); g.globalAlpha = clamp((1 - k) * 4);
        g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(14, 0); g.lineTo(-10, -9); g.lineTo(-5, 0); g.closePath(); g.fill();
        g.fillStyle = C.f1; g.beginPath(); g.moveTo(14, 0); g.lineTo(-5, 0); g.lineTo(-9, 7); g.closePath(); g.fill();
        g.restore();
      }
      // bench-front indicator bulbs
      for (let i = 0; i < 6; i++) {
        const b = bulbState(m, i), [x, y] = P(-262 + i * 18, -13, TABLE.z + TABLE.d / 2);
        if (b.glow > 0) { g.globalAlpha = 0.25 * b.glow; g.fillStyle = b.col; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
        g.fillStyle = b.col === PAL.pill ? C.pill : b.col; g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill();
      }
      for (const e of front) drawCard2D(g, m, e.c, e.o);
      drawParticles(m, true);
    },
    dispose() { cv.dispose(); },
  };
}

// ---------------------------------------------------------------- 3D renderer
// createRenderer() allocates a WebGL context; if building the scene throws, release it here (nothing else can).
function create3D(THREE, root, onEvict) {
  const gl = createRenderer(THREE, root, { maxPixels: 1.4e6, onEvict });
  try { return build3D(THREE, root, onEvict, gl); } catch (e) { try { gl.dispose(); } catch (e2) { /* ignore */ } throw e; }
}

function build3D(THREE, root, onEvict, gl) {
  gl.canvas.style.zIndex = '1';
  const kit = createKit(THREE);
  const scene = new THREE.Scene();
  const D = 1700;
  const camera = new THREE.PerspectiveCamera(15, DW / DH, 100, 4000);
  const target = new THREE.Vector3(TX, TY, 0);
  camera.position.set(TX, TY + SIN * D, COS * D);
  camera.lookAt(target);
  const fit = (w, h) => {
    const s = Math.min(w / DW, h / DH) || 1;
    camera.aspect = w / h;
    camera.fov = 2 * Math.atan((h / s / ZOOM / 2) / D) * 180 / Math.PI;
    camera.updateProjectionMatrix();
  };
  fit(gl.size.w || DW, gl.size.h || DH);
  const lights = addStudioLights(THREE, scene, { intensity: 0.86, key: [-0.5, 0.9, 0.7] });
  const hemiBase = lights.hemi.color.clone();

  const toon = c => kit.toon(c);
  const add = (geo, mat, x, y, z, parent = scene) => { const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); parent.add(mesh); return mesh; };
  const slab = (w, h, d, r) => roundedSlab(THREE, w, h, d, r, Math.min(1.6, d / 4, w / 6, h / 6));

  // bench
  add(slab(TABLE.w, TABLE.h, TABLE.d, 10), toon(C.f0), 0, -TABLE.h / 2, TABLE.z);
  const legGeo = new THREE.CylinderGeometry(6.5, 6.5, 46, 16);
  [[-268, -92], [268, -92], [-268, 48], [268, 48]].forEach(([x, z]) => add(legGeo, toon(C.f2), x, -48, z));
  const shadow = add(new THREE.PlaneGeometry(680, 150), kit.basic('#ffffff', { map: kit.shadowTexture(), transparent: true, depthWrite: false, opacity: 0.5 }), 0, -74, -20);
  shadow.rotation.x = -Math.PI / 2;
  // indicator bulbs on the bench front
  const bulbGeo = new THREE.SphereGeometry(4.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const bulbs = [];
  for (let i = 0; i < 6; i++) {
    const mat = kit.fresh('MeshToonMaterial', { color: C.pill, emissive: 0x000000 });
    const b = add(bulbGeo, mat, -262 + i * 18, -13, TABLE.z + TABLE.d / 2 - 0.5);
    b.rotation.x = Math.PI / 2;
    bulbs.push(b);
  }
  // in-tray with sheets
  add(slab(46, 6, 34, 3), toon(C.f2), INBOX.x, 3, INBOX.z);
  for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(34, 1.6, 26), toon(i % 2 ? '#ffffff' : C.pill), INBOX.x + (i % 2) * 1.5, 7 + i * 2.2, INBOX.z);

  // belt
  const beltLen = BELT.x1 - BELT.x0;
  add(slab(beltLen, BELT.top, BELT.w, 6), toon(C.f4), (BELT.x0 + BELT.x1) / 2, BELT.top / 2, BELT.z);
  const stripeTex = kit.canvasTexture(64, 16, (g2, w, h) => { g2.fillStyle = C.f4; g2.fillRect(0, 0, w, h); g2.fillStyle = C.f3; g2.fillRect(0, 0, w * 0.4, h); });
  stripeTex.wrapS = stripeTex.wrapT = THREE.RepeatWrapping;
  stripeTex.repeat.set((beltLen - 16) / 30, 1);
  const beltTop = add(new THREE.PlaneGeometry(beltLen - 16, BELT.w - 8), kit.basic('#ffffff', { map: stripeTex }), (BELT.x0 + BELT.x1) / 2, BELT.top + 0.15, BELT.z);
  beltTop.rotation.x = -Math.PI / 2;
  const rollerGeo = new THREE.CylinderGeometry(5.5, 5.5, BELT.w + 4, 18);
  const rollers = [BELT.x0 + 6, BELT.x1 - 6].map(x => {
    const r = add(rollerGeo, toon(C.pill), x, 6, BELT.z); r.rotation.x = Math.PI / 2;
    const dot = add(new THREE.SphereGeometry(1.5, 8, 6), toon(C.ink), 2.4, BELT.w / 2 + 2, 0, r); dot.name = 'dot';
    return r;
  });

  // scanner
  add(slab(54, 84, 26, 7), toon(C.f3), SCAN_X, 42, -48);
  add(slab(58, 14, 76, 5), toon(C.f4), SCAN_X, 92, -14);
  const lensMat = kit.fresh('MeshToonMaterial', { color: C.pink, emissive: 0x000000 });
  const lens = add(new THREE.SphereGeometry(4.5, 16, 10), lensMat, SCAN_X, 85, 24);
  const scanBar = add(new THREE.PlaneGeometry(50, 2.6), kit.basic(C.pink), SCAN_X, 50, BELT.z + 2);
  const scanGlow = add(new THREE.PlaneGeometry(50, 14), kit.basic(C.pink, { transparent: true, opacity: 0.28, depthWrite: false }), SCAN_X, 50, BELT.z + 1.8);

  // press
  add(slab(22, 118, 20, 5), toon(C.f2), PRESS_X, 59, -46);
  add(slab(30, 16, 64, 5), toon(C.f3), PRESS_X, 112, -18);
  const piston = add(new THREE.CylinderGeometry(3.6, 3.6, 1, 14), toon(C.pill), PRESS_X, 95, BELT.z);
  const stamp = new THREE.Group(); stamp.position.set(PRESS_X, 86, BELT.z); scene.add(stamp);
  add(slab(84, 12, 22, 4), toon(C.pink), 0, 0, 0, stamp);
  add(new THREE.BoxGeometry(74, 2, 16), toon(C.rose), 0, -6.5, 0, stamp);

  // paint station
  add(slab(18, 110, 18, 5), toon(C.f2), PAINT_X, 55, -46);
  add(slab(16, 12, 80, 4), toon(C.f3), PAINT_X, 104, -10);
  add(new THREE.CylinderGeometry(9, 9, 18, 20), toon(C.orange), PAINT_X, 119, -30);
  add(new THREE.CylinderGeometry(9.4, 9.4, 3, 20), toon(C.pill), PAINT_X, 128, -30);
  const nozzle = new THREE.Group(); scene.add(nozzle);
  add(new THREE.CylinderGeometry(1.8, 1.8, 10, 10), toon(C.f4), 0, 6, 0, nozzle);
  const cone = add(new THREE.ConeGeometry(5.5, 11, 16), toon(C.ink), 0, -2, 0, nozzle); cone.rotation.x = Math.PI;

  // machine
  const mach = new THREE.Group(); mach.position.set(MX, 0, MZ); scene.add(mach);
  add(slab(92, 64, 44, 10), toon(C.f2), 0, 32, 0, mach);
  add(slab(76, 40, 2, 7), toon(C.f1), -2, 40, 22, mach);
  add(new THREE.CylinderGeometry(9, 9, 30, 18), toon(C.f4), 30, 78, 0, mach);
  add(new THREE.CylinderGeometry(10.5, 10.5, 4, 18), toon(C.f3), 30, 93, 0, mach);
  const gauge = add(new THREE.CylinderGeometry(11, 11, 2, 24), toon(C.pill), -20, 44, 23.5, mach); gauge.rotation.x = Math.PI / 2;
  const needle = new THREE.Group(); needle.position.set(-20, 44, 25.2); mach.add(needle);
  add(new THREE.BoxGeometry(1.8, 9, 1), toon(C.ink), 0, 4.5, 0, needle);
  add(new THREE.SphereGeometry(2, 10, 8), toon(C.ink), -20, 44, 25.4, mach);
  const lampMats = [C.orange, C.pink].map(c => kit.fresh('MeshToonMaterial', { color: c, emissive: 0x000000 }));
  lampMats.forEach((mat, i) => add(new THREE.SphereGeometry(4, 14, 10), mat, -22 + i * 13, 25, 23, mach));
  const gearShape = new THREE.Shape();
  { const N = 10, st = Math.PI * 2 / N; let first = true;
    for (let k = 0; k < N; k++) { const a = k * st; [[10, a - 0.31 * st], [14, a - 0.15 * st], [14, a + 0.15 * st], [10, a + 0.31 * st]].forEach(([r, b]) => { const x = Math.cos(b) * r, y = Math.sin(b) * r; if (first) { gearShape.moveTo(x, y); first = false; } else gearShape.lineTo(x, y); }); }
    gearShape.closePath(); const hole = new THREE.Path(); hole.absarc(0, 0, 3.5, 0, Math.PI * 2, true); gearShape.holes.push(hole); }
  const gearMesh = add(new THREE.ExtrudeGeometry(gearShape, { depth: 3, bevelEnabled: true, bevelThickness: 0.8, bevelSize: 0.6, bevelSegments: 1, curveSegments: 6 }), toon(C.orange), 22, 40, 23, mach);

  // stack tray, export band, loupe, paper plane
  add(slab(86, 6, 60, 3), toon(C.f2), STACK_X, 3, STACK_Z);
  const buriedBlock = add(new THREE.BoxGeometry(74, 2, 44), toon(C.f1), STACK_X, 7, STACK_Z);
  const band = add(new THREE.BoxGeometry(9, 1, 52), toon(C.orange), STACK_X, 6, STACK_Z);
  const loupe = new THREE.Group(); scene.add(loupe);
  add(new THREE.TorusGeometry(16, 2.6, 10, 36), toon(C.ink), 0, 0, 0, loupe);
  add(new THREE.CircleGeometry(15, 32), kit.basic(C.lilac, { transparent: true, opacity: 0.45, depthWrite: false }), 0, 0, 0, loupe);
  const handle = add(new THREE.CylinderGeometry(2.8, 2.8, 22, 10), toon(C.ink), 0, -27, 0, loupe);
  loupe.rotation.z = -0.5;
  const planeGeo = new THREE.BufferGeometry();
  planeGeo.setAttribute('position', new THREE.Float32BufferAttribute([14, 0, 0, -10, 1, -9, -6, 1, 0, 14, 0, 0, -6, 1, 0, -10, 1, 9, 14, 0, 0, -6, 1, 0, -8, -4, 0], 3));
  planeGeo.computeVertexNormals();
  const plane = add(planeGeo, kit.toon('#ffffff', { side: THREE.DoubleSide }), 0, 0, 0);

  // documents
  const docTex = kit.canvasTexture(68, 92, (g2, w, h) => {
    g2.fillStyle = '#ffffff'; g2.fillRect(0, 0, w, h);
    g2.fillStyle = C.ink; g2.fillRect(9, 11, 32, 6);
    g2.fillStyle = C.lilac; for (let i = 0; i < 4; i++) g2.fillRect(9, 27 + i * 12, i === 3 ? 28 : 48, 4);
    g2.fillStyle = C.pink; g2.fillRect(9, 74, 24, 10);
    g2.fillStyle = C.f1; g2.beginPath(); g2.moveTo(w - 14, 0); g2.lineTo(w, 14); g2.lineTo(w - 14, 14); g2.closePath(); g2.fill();
  });
  const docGeo = new THREE.BoxGeometry(34, 46, 1.2);
  const docMats = [toon('#ffffff'), toon('#ffffff'), toon('#ffffff'), toon('#ffffff'), kit.basic('#ffffff', { map: docTex }), toon(C.f1)];
  const docs = [0, 1, 2, 3].map(() => { const d = new THREE.Mesh(docGeo, docMats); d.visible = false; scene.add(d); return d; });

  // cards (built lazily, geometries/materials shared and owned by the kit)
  const cardGeo = kit.own(slab(CARD_W, CARD_H, CARD_T, 5));
  const blankGeo = kit.own(new THREE.BoxGeometry(CARD_W + 6, CARD_H + 6, 2));
  const clipGeo = kit.own(new THREE.BoxGeometry(20, 4, 8));
  const unit = kit.own(new THREE.PlaneGeometry(1, 1)); unit.translate(0.5, 0, 0);
  const cardMeshes = new Map();
  function cardMesh(c) {
    let e = cardMeshes.get(c.id);
    if (e) return e;
    const grp = new THREE.Group();
    const body = new THREE.Mesh(cardGeo, toon(C.pill));
    const blank = new THREE.Mesh(blankGeo, toon(C.f0));
    const clip = new THREE.Mesh(clipGeo, toon(C.ink)); clip.position.y = -CARD_H / 2 - 1;
    grp.add(body, blank, clip);
    const parts = LAYOUTS[c.v].concat([ACCENT]).map(p => {
      const mm = new THREE.Mesh(unit, kit.basic(p.c, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      mm.position.set(p.x, p.y, CARD_T / 2 + 0.25); mm.scale.set(p.w, p.h, 1); grp.add(mm);
      return { mesh: mm, p };
    });
    scene.add(grp);
    e = { grp, body, blank, clip, parts };
    cardMeshes.set(c.id, e);
    return e;
  }

  // particles: one instanced mesh per kind
  const heartGeo = kit.own(new THREE.ShapeGeometry(heartShape(THREE, 2), 6));
  const sparkGeo = kit.own(new THREE.ShapeGeometry(sparkleShape(THREE, 0.3)));
  const KINDS = {
    chip: { geo: new THREE.PlaneGeometry(2, 1.4), mat: kit.basic('#ffffff', { side: THREE.DoubleSide }), max: 60 },
    drop: { geo: new THREE.SphereGeometry(1, 8, 6), mat: kit.basic('#ffffff'), max: 60 },
    puff: { geo: new THREE.SphereGeometry(1, 14, 10), mat: kit.fresh('MeshToonMaterial', { color: '#ffffff', transparent: true, opacity: 0.9 }), max: 40 },
    spark: { geo: sparkGeo, mat: kit.basic('#ffffff', { side: THREE.DoubleSide }), max: 60 },
    conf: { geo: new THREE.PlaneGeometry(2, 1.2), mat: kit.basic('#ffffff', { side: THREE.DoubleSide }), max: 80 },
    heart: { geo: heartGeo, mat: kit.basic('#ffffff', { side: THREE.DoubleSide }), max: 24 },
  };
  const col = new THREE.Color(), tmp = new THREE.Object3D();
  for (const k in KINDS) {
    const K = KINDS[k];
    K.mesh = new THREE.InstancedMesh(K.geo, K.mat, K.max);
    for (let i = 0; i < K.max; i++) K.mesh.setColorAt(i, col.set('#ffffff'));
    K.mesh.count = 0; K.mesh.frustumCulled = false;
    scene.add(K.mesh);
  }

  const o = {}, od = {};
  return {
    gl,
    render(m) {
      if (gl.disposed) return;
      if (gl.size.w && Math.abs(camera.aspect - gl.size.w / gl.size.h) > 1e-3) fit(gl.size.w, gl.size.h);
      const S = stations(m), t = m.reduced ? 0 : m.t;
      lights.hemi.color.setRGB(hemiBase.r * m.tint[0], hemiBase.g * m.tint[1], hemiBase.b * m.tint[2]);
      // belt
      stripeTex.offset.x = -m.belt / 30;
      rollers.forEach(r => { r.rotation.y = -m.belt / 5.5; });
      // bulbs
      bulbs.forEach((b, i) => { const s = bulbState(m, i); b.material.color.set(s.col); b.material.emissive.set(s.col).multiplyScalar(0.55 * s.glow); });
      // scanner
      lensMat.emissive.set(C.pink).multiplyScalar(0.7 * S.scanGlow);
      let scanY = -1;
      docs.forEach(d => { d.visible = false; });
      m.docs.slice(0, 4).forEach((d, i) => {
        docPose(m, d, od);
        const mesh = docs[i];
        mesh.visible = od.vis;
        if (!od.vis) return;
        mesh.position.set(od.x, od.y, od.z); mesh.rotation.set(0, 0, od.rz); mesh.scale.setScalar(od.s);
        if (od.scan >= 0) { const u = (od.scan * 2) % 2; scanY = od.y + 23 - 46 * (u > 1 ? 2 - u : u); }
      });
      scanBar.visible = scanGlow.visible = scanY > 0;
      if (scanY > 0) { scanBar.position.y = scanY; scanGlow.position.y = scanY; }
      // press
      stamp.position.y = S.stampY; stamp.rotation.z = S.stampTilt;
      const top = 104, bot = S.stampY + 6;
      piston.scale.y = Math.max(0.1, top - bot); piston.position.y = (top + bot) / 2;
      // paint nozzle
      nozzle.position.set(m.nozzleX, 92, 28);
      nozzle.rotation.z = (m.nozzleX - PAINT_X) * -0.012;
      // machine
      mach.position.x = MX + S.shake;
      gearMesh.rotation.z = -m.gear;
      needle.rotation.z = -m.needle;
      const on1 = m.machine > 0.05 && Math.sin(t * 12) > 0;
      lampMats[0].emissive.set(C.orange).multiplyScalar(on1 ? 0.6 : 0);
      lampMats[1].emissive.set(C.pink).multiplyScalar(m.machine > 0.05 && !on1 ? 0.6 : 0);
      // cards
      const st = stackedCards(m), buried = Math.max(0, st.length - STACK_SHOW);
      buriedBlock.visible = buried > 0;
      const seen = new Set();
      for (const c of m.cards) {
        cardPose(m, c, o);
        const e = cardMesh(c);
        seen.add(c.id);
        e.grp.visible = o.vis && !o.buried;
        if (!e.grp.visible) continue;
        e.grp.position.set(o.x, o.y, o.z); e.grp.rotation.set(o.rx, 0, o.rz); e.grp.scale.set(o.sx, o.sy, o.sz);
        e.blank.visible = o.blank; e.body.visible = !o.blank; e.clip.visible = o.clip;
        const n = LAYOUTS[c.v].length;
        e.parts.forEach(({ mesh, p }, k) => {
          const pk = k >= n ? (c.rev > 0 ? 1 : 0) : clamp((o.paint - k / n * 0.7) / 0.3);
          mesh.visible = !o.blank && pk > 0.01;
          mesh.scale.x = Math.max(0.001, p.w * pk);
        });
      }
      for (const [id, e] of cardMeshes) if (!seen.has(id)) { scene.remove(e.grp); cardMeshes.delete(id); }
      // export band, loupe, plane
      const sTop = stackTop(m);
      band.visible = m.exp > 0.02 && st.length > 0;
      if (band.visible) { band.scale.set(1, Math.max(0.1, (sTop - 4) * clamp(m.exp * 1.3)), 1); band.position.y = 6 + band.scale.y / 2 + 0.5; }
      loupe.visible = m.check > 0.02;
      if (loupe.visible) {
        loupe.position.set(STACK_X + Math.sin(t * 0.9) * 18, sTop + 44 + Math.sin(t * 1.7) * 4, STACK_Z + 20);
        loupe.scale.setScalar(Math.max(0.001, ease.outBack(m.check)));
        loupe.rotation.set(-0.35, 0, -0.5 + Math.sin(t * 0.9) * 0.1);
      }
      const pt = m.t - m.planeT;
      plane.visible = pt >= 0 && pt < 2.6 && !m.reduced;
      if (plane.visible) {
        const k = pt / 2.6;
        plane.position.set(STACK_X - 10 + k * 160, sTop + 10 + Math.sin(k * Math.PI) * 120, STACK_Z + 20 - k * 60);
        plane.rotation.set(0.25, -0.5 + k * 0.3, 0.5 - k * 0.9);
        plane.scale.setScalar(1.1 * clamp((1 - k) * 4));
      }
      // particles
      const counts = {};
      for (const k in KINDS) counts[k] = 0;
      for (const p of m.parts) {
        const K = KINDS[p.k]; if (!K) continue;
        const i = counts[p.k]; if (i >= K.max) continue;
        const u = p.age / p.life;
        tmp.position.set(p.x, p.y, p.z);
        let s = p.size;
        if (p.k === 'puff') s = (p.size + p.grow * u * 1.6) * clamp((1 - u) * 2.5);
        else if (p.k !== 'drop') s = p.size * clamp((1 - u) * 3);
        tmp.rotation.set(p.k === 'conf' || p.k === 'chip' ? p.rot * 1.3 : 0, p.k === 'heart' ? Math.sin(p.rot) * 0.6 : p.rot * 0.7, p.k === 'puff' ? 0 : p.rot);
        tmp.scale.setScalar(Math.max(0.001, s));
        tmp.updateMatrix();
        K.mesh.setMatrixAt(i, tmp.matrix);
        K.mesh.setColorAt(i, col.set(p.col));
        counts[p.k] = i + 1;
      }
      for (const k in KINDS) {
        const K = KINDS[k], n = counts[k];
        if (n || K.mesh.count) { K.mesh.count = n; K.mesh.instanceMatrix.needsUpdate = true; if (K.mesh.instanceColor) K.mesh.instanceColor.needsUpdate = true; }
      }
      gl.renderer.render(scene, camera);
    },
    dispose() {
      disposeTree(scene);   // traverse the cards too, before detaching them
      cardMeshes.forEach(e => scene.remove(e.grp)); cardMeshes.clear();
      kit.dispose(); gl.dispose();
    },
  };
}

// ---------------------------------------------------------------- mount
export default {
  mount(el, ctx = {}) {
    const reduced = !!ctx.reducedMotion;
    const { root, remove } = makeRoot(el, 'workshop');
    const m = makeModel(reduced);
    const over = createCanvas2D(root);
    over.canvas.style.zIndex = '2';
    let view3 = null, view2 = null, dead = false, ready = false;
    const offs = [];

    const paint = () => {
      if (view3) view3.render(m);
      else if (view2) view2.paint(m);
      const s = Math.min(over.size.w / DW, over.size.h / DH) || 1;
      over.begin(); over.g.translate((over.size.w - DW * s) / 2, (over.size.h - DH * s) / 2); over.g.scale(s, s);
      drawOverlay(over.g, m);
    };
    // Full rate while something moves, a calm 30 / 20 fps for ambient motion, and asleep when nothing changes.
    // Ambient motion sleeps between frames on a timer, so a waiting factory costs a few frames a second, not 60.
    let lastT = 0, timer = 0;
    const loop = createLoop(dtLoop => {
      const now = performance.now() / 1000;
      const dt = lastT ? Math.min(0.1, now - lastT) : dtLoop;
      lastT = now;
      const busy = step(m, dt);
      paint();
      if (!ready) return false;
      if (busy) return true;
      if (m.reduced) { lastT = 0; return false; }
      const fps = m.running || m.wait > 0.5 || m.finished ? 30 : 20;
      clearTimeout(timer);
      timer = setTimeout(() => { timer = 0; loop.wake(); }, 1000 / fps);
      return false;
    }, { onFrameTime: ms => view3 && view3.gl.governor(ms) });

    const use2D = () => { if (!view2 && !dead) view2 = create2D(root); if (view2) view2.cv.canvas.style.zIndex = '1'; };
    const toFallback = () => {
      if (dead) return;
      if (view3) { try { view3.dispose(); } catch (e) {} }
      view3 = null; use2D(); loop.wake();
    };
    loadThree(ctx).then(THREE => {
      if (dead) return;
      if (THREE) {
        try { view3 = create3D(THREE, root, toFallback); }
        catch (e) { console.info('[scene] workshop: 3D unavailable, drawing in 2D'); view3 = null; }
      }
      if (!view3) use2D();
      ready = true;
      paint();
      loop.start();
    });
    if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('15px "DM Sans"'), document.fonts.load('900 24px Epilogue')]).then(() => { if (!dead) { paint(); loop.wake(); } }, () => {});
    paint();

    // Claude events (from the workshop component). Same bus module as ctx.bus in the app; listen on ctx.bus too only
    // if a harness passes a different one.
    const handleEvent = d => { if (dead) return; onClaudeEvent(m, d && d.event, !!(d && d.replay)); loop.wake(); };
    const handleState = d => {
      if (dead || !d) return;
      m.running = !!d.running;
      m.waiting = !!d.waiting && !d.done;
      if (d.running) m.failed = false;
      if (d.done) celebrate(m);
      loop.wake();
    };
    offs.push(on('claude:event', handleEvent), on('claude:state', handleState));
    if (ctx.bus && ctx.bus !== appBus) offs.push(onBus(ctx.bus, 'claude:event', handleEvent), onBus(ctx.bus, 'claude:state', handleState));

    const api = {
      update() { if (!dead) loop.wake(); },
      destroy() {
        if (dead) return;
        dead = true;
        clearTimeout(timer);
        offs.forEach(f => f());
        loop.dispose();
        if (view3) { try { view3.dispose(); } catch (e) {} view3 = null; }
        if (view2) { view2.dispose(); view2 = null; }
        over.dispose();
        remove();
      },
      get debug() {
        return { mode: view3 ? '3d' : view2 ? '2d' : 'pending', stage: m.stage >= 0 ? STAGES[m.stage] : 'idle', cards: m.cards.length,
          stacked: stackedCards(m).length, waiting: m.waiting, finished: m.finished, failed: m.failed, particles: m.parts.length, running: loop.running };
      },
    };
    return api;
  },
};
