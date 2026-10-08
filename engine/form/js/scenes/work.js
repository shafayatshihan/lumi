// "Your work" scene: an idea machine. Four sticky notes (subject, what you did, the problem, how) feed tubes into a
// hopper; each answer sends a paper slip down its tube, lights a lamp, spins the gears faster, and makes the lightbulb
// on top glow brighter. With all four filled the bulb shines and a little card pops out of the chute.

import { C, SPRING, EASE, h, get, clean, currentScreen, wrap, setLines, star, pill, makeStage } from './talk.js';

const NOTES = [
  ['work.field', 'subject', C.or0], ['work.summary', 'what you did', C.p0],
  ['work.problem', 'the problem', C.lilac], ['work.method', 'how you did it', C.f1]];
const GLASS = [C.pill, '#fbeedd', C.or0, '#f7c58a', '#f5b469'];
const HALO = [0, 0.22, 0.42, 0.62, 0.9];
const RATE = [0.12, 0.35, 0.6, 0.85, 1.25];
const HOPPER = [306, 112];

function gearPath(r, n) {
  const step = (Math.PI * 2) / n, ri = r * 0.8, pts = [];
  for (let i = 0; i < n; i++) {
    const a = i * step;
    [[ri, a], [r, a + step * 0.16], [r, a + step * 0.44], [ri, a + step * 0.6]].forEach(([rr, aa]) => pts.push(`${(rr * Math.cos(aa)).toFixed(2)},${(rr * Math.sin(aa)).toFixed(2)}`));
  }
  return 'M' + pts.join('L') + 'Z';
}

export default {
  mount(el, ctx) {
    const S = makeStage(el, ctx, 'work');
    S.svg.append(h('style', { text: `
      .s2d-work .focus{transition:transform .8s ${SPRING}}
      .s2d-work[data-focus=work] .f-n0,.s2d-work[data-focus=work] .f-n1,
      .s2d-work[data-focus=why] .f-n2,.s2d-work[data-focus=why] .f-n3{transform:scale(1.05)}
      .s2d-work .tube{transition:stroke .5s ease}
      .s2d-work .flow{animation:wk-flow 1.4s linear infinite}
      @keyframes wk-flow{to{stroke-dashoffset:-24}}
      .s2d-work .halo{transition:opacity .9s ease,transform .9s ${EASE}}
      .s2d-work .rays{transition:opacity .8s ease}
      .s2d-work .lamp{transition:fill .5s ease}` }));
    const back = S.layer(S.svg, 3), mid = S.layer(S.svg, 7), front = S.layer(S.svg, 11);

    // ---- back: floor and sparkles
    back.append(h('ellipse', { cx: 360, cy: 350, rx: 290, ry: 14, fill: C.f2, opacity: 0.55 }));
    const sp = [star(612, 70, 8, C.or, 'twinkle fb'), star(232, 46, 6, C.p1, 'twinkle fb'), star(630, 300, 7, C.white, 'twinkle fb')];
    sp.forEach((s, i) => { s.style.animationDelay = `${-i * 0.9}s`; back.append(s); });

    // ---- mid: tubes, then the machine
    const tubes = NOTES.map((_, i) => {
      const y = 88 + i * 78;
      const d = `M202,${y}C238,${y} 250,${150 - i * 4} ${HOPPER[0] - 26 + i * 16},${132}`;
      const base = h('path', { d, stroke: C.f2, 'stroke-width': 10, fill: 'none', 'stroke-linecap': 'round', class: 'tube' });
      const flow = h('path', { d, stroke: C.pill, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round', 'stroke-dasharray': '4 8', opacity: 0, class: 'fade' });
      mid.append(base, flow);
      return { base, flow, d, y };
    });

    const machine = h('g');
    // hopper
    machine.append(
      h('path', { d: 'M254,104H358L338,152H274Z', fill: C.f5 }),
      h('rect', { x: 248, y: 98, width: 116, height: 12, rx: 6, fill: C.f6 }),
      h('path', { d: 'M266,112H346', stroke: C.f4, 'stroke-width': 2, opacity: 0.7 }));
    // body
    machine.append(
      h('rect', { x: 262, y: 322, width: 30, height: 16, rx: 6, fill: C.f6 }), h('rect', { x: 498, y: 322, width: 30, height: 16, rx: 6, fill: C.f6 }),
      h('rect', { x: 246, y: 148, width: 300, height: 180, rx: 24, fill: C.f4 }),
      h('rect', { x: 246, y: 148, width: 300, height: 26, rx: 13, fill: C.f3 }),
      h('path', { d: 'M266,160H330', stroke: C.white, 'stroke-width': 4, 'stroke-linecap': 'round', opacity: 0.5 }),
      h('circle', { cx: 362, cy: 250, r: 64, fill: C.f5 }),
      h('circle', { cx: 362, cy: 250, r: 56, fill: C.f1 }));
    // gears (behind the window glare)
    const gearBig = h('g', { transform: 'translate(344,244)' });
    const gbSpin = h('g', {}, [h('path', { d: gearPath(34, 12), fill: C.f5 }), h('circle', { r: 12, fill: C.f1 }), h('circle', { r: 5, fill: C.f6 })]);
    gearBig.append(gbSpin);
    const gearSmall = h('g', { transform: 'translate(387,272)' });
    const gsSpin = h('g', {}, [h('path', { d: gearPath(22, 8), fill: C.p2 }), h('circle', { r: 7, fill: C.f1 }), h('circle', { r: 3, fill: C.p1 })]);
    gearSmall.append(gsSpin);
    const gearTiny = h('g', { transform: 'translate(392,220)' });
    const gtSpin = h('g', {}, [h('path', { d: gearPath(14, 6), fill: C.or }), h('circle', { r: 4, fill: C.f1 })]);
    gearTiny.append(gtSpin);
    const wclip = S.uid('win');
    S.defs.append(h('clipPath', { id: wclip }, [h('circle', { cx: 362, cy: 250, r: 56 })]));
    machine.append(h('g', { 'clip-path': `url(#${wclip})` }, [gearBig, gearSmall, gearTiny,
      h('path', { d: 'M318,214a56,56 0 0 1 40,-20', stroke: C.white, 'stroke-width': 6, 'stroke-linecap': 'round', fill: 'none', opacity: 0.7 })]));
    // lamps, one per note
    const lamps = NOTES.map((_, i) => {
      const l = h('circle', { cx: 466 + (i % 2) * 34, cy: 212 + Math.floor(i / 2) * 34, r: 10, fill: C.f2, class: 'lamp' });
      machine.append(h('circle', { cx: 466 + (i % 2) * 34, cy: 212 + Math.floor(i / 2) * 34, r: 14, fill: C.f5 }), l);
      return l;
    });
    // a lever and the chute
    machine.append(
      h('rect', { x: 456, y: 272, width: 64, height: 10, rx: 5, fill: C.f5 }),
      h('circle', { cx: 476, cy: 277, r: 8, fill: C.p2 }),
      h('path', { d: 'M546,286H600L612,304H546Z', fill: C.f5 }),
      h('rect', { x: 546, y: 300, width: 70, height: 8, rx: 4, fill: C.f6 }));
    mid.append(machine);
    const outCard = h('g', { style: { opacity: 0 } }, [
      h('rect', { x: 0, y: 0, width: 58, height: 40, rx: 6, fill: C.pill }),
      h('rect', { x: 7, y: 7, width: 28, height: 6, rx: 3, fill: C.p1 }),
      h('rect', { x: 7, y: 18, width: 42, height: 4, rx: 2, fill: C.f2 }),
      h('rect', { x: 7, y: 26, width: 32, height: 4, rx: 2, fill: C.f2 }),
      star(48, 8, 7, C.or)]);
    const outG = h('g', { transform: 'translate(560,256)' }, [h('g', { class: 'bob' }, [outCard])]);
    mid.append(outG);

    // the bulb on top
    const bulb = h('g');
    const halo = h('g', { class: 'halo', style: { transformOrigin: '490px 76px', opacity: 0 } }, [
      h('circle', { cx: 490, cy: 76, r: 62, fill: C.or0, opacity: 0.35 }), h('circle', { cx: 490, cy: 76, r: 46, fill: C.or0, opacity: 0.55 })]);
    const rays = h('g', { class: 'rays', style: { opacity: 0 } });
    const raySpin = h('g', { style: { transformOrigin: '490px 76px' } });
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      raySpin.append(h('path', { d: `M${490 + 44 * Math.cos(a)},${76 + 44 * Math.sin(a)}L${490 + 58 * Math.cos(a)},${76 + 58 * Math.sin(a)}`, stroke: C.or, 'stroke-width': 4, 'stroke-linecap': 'round' }));
    }
    rays.append(raySpin);
    const glass = h('path', { d: 'M476,112C476,100 460,94 460,76A30,30 0 0 1 520,76C520,94 504,100 504,112Z', fill: GLASS[0], class: 'lamp' });
    const fil = h('path', { d: 'M484,106V90M496,106V90M484,90q3,-7 6,0t6,0', stroke: C.f5, 'stroke-width': 2.6, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'tube' });
    bulb.append(halo, rays,
      h('rect', { x: 484, y: 128, width: 12, height: 22, fill: C.f6 }),
      glass, fil,
      h('path', { d: 'M468,70a22,22 0 0 1 12,-18', stroke: C.white, 'stroke-width': 4, 'stroke-linecap': 'round', fill: 'none', opacity: 0.8 }),
      h('rect', { x: 474, y: 110, width: 32, height: 8, rx: 3, fill: C.f5 }), h('rect', { x: 476, y: 118, width: 28, height: 7, rx: 3, fill: C.f6 }),
      h('rect', { x: 479, y: 125, width: 22, height: 6, rx: 3, fill: C.f5 }));
    mid.append(bulb);
    const countP = pill({ x: 396, y: 350, ht: 26, pad: 11, size: 13, align: 'center', max: 200 });
    mid.append(countP.g);

    // ---- front: the notes
    const notes = NOTES.map(([, label, col], i) => {
      const y = 52 + i * 78;
      const f = h('g', { class: `focus f-n${i}`, style: { transformOrigin: `110px ${y + 36}px` } });
      const sway = h('g', { class: 'sway-s fbt', style: { animationDelay: `${-i * 1.3}s`, animationDuration: `${5 + i * 0.4}s` } });
      const card = h('rect', { x: 20, y, width: 182, height: 72, rx: 10 });
      const lab = pill({ x: 30, y: y + 8, ht: 20, pad: 8, size: 13, max: 160 });
      const txt = h('text', { x: 31, y: y + 46, 'font-size': 13 });
      sway.append(h('rect', { x: 24, y: y + 4, width: 182, height: 72, rx: 10, fill: C.f3, opacity: 0.6 }), card,
        h('rect', { x: 150, y: y - 5, width: 34, height: 12, rx: 3, fill: C.white, opacity: 0.7, transform: `rotate(${i % 2 ? 6 : -6} 167 ${y + 1})` }),
        lab.g, txt);
      f.append(sway);
      front.append(f);
      return { card, lab, txt, col, label, y, filled: null };
    });

    // ---- gears: Web Animations so the speed can change smoothly
    const spins = [];
    function spin(node, ms, dir) {
      const a = S.anim(node, [{ transform: 'rotate(0deg)' }, { transform: `rotate(${dir * 360}deg)` }], { duration: ms, iterations: Infinity, easing: 'linear' });
      if (a) spins.push(a);
    }
    spin(gbSpin, 9000, 1); spin(gsSpin, 6000, -1); spin(gtSpin, 4500, 1);
    const raysAnim = S.anim(raySpin, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 24000, iterations: Infinity, easing: 'linear' });
    if (raysAnim) spins.push(raysAnim);
    const setRate = r => spins.forEach(a => { try { a.updatePlaybackRate ? a.updatePlaybackRate(r) : (a.playbackRate = r); } catch (e) {} });
    const vis = () => spins.forEach(a => { try { document.hidden ? a.pause() : a.play(); } catch (e) {} });
    S.listen(document, 'visibilitychange', vis);

    // ---- state
    let last = {};
    const focus = s => { S.wrap.dataset.focus = ['work', 'why'].includes(s) ? s : ''; };
    focus(currentScreen());
    S.onBus('step:change', d => focus(d.to));

    function fly(i) {
      const slip = h('g', {}, [h('rect', { x: -12, y: -8, width: 24, height: 16, rx: 3, fill: NOTES[i][2] }), h('rect', { x: -7, y: -3, width: 14, height: 3, rx: 1.5, fill: C.f5 })]);
      mid.append(slip);
      const path = tubes[i].base;
      const len = path.getTotalLength();
      const frames = [0, 0.25, 0.5, 0.75, 1].map(t => { const p = path.getPointAtLength(len * t); return { transform: `translate(${p.x}px,${p.y}px) rotate(${t * 180}deg) scale(${1 - t * 0.4})`, opacity: t > 0.9 ? 0 : 1 }; });
      frames.push({ transform: `translate(${HOPPER[0]}px,${HOPPER[1] + 30}px) scale(.3)`, opacity: 0 });
      const a = S.anim(slip, frames, { duration: 1100, easing: 'ease-in-out' });
      if (a) S.later(1120, () => slip.remove()); else slip.remove();
      if (!S.rm) S.anim(machine, [{ transform: 'none' }, { transform: 'translateY(2px) scale(1.01,.99)' }, { transform: 'none' }], { duration: 380, delay: 1000 });
    }

    function render(state, force) {
      const vals = NOTES.map(([k]) => clean(get(state, k)));
      const n = vals.filter(Boolean).length;
      vals.forEach((v, i) => {
        const N = notes[i], filled = !!v;
        if (force || N.text !== v) {
          N.card.setAttribute('fill', filled ? N.col : C.pill);
          N.card.setAttribute('stroke', filled ? 'none' : C.f3);
          N.card.setAttribute('stroke-dasharray', filled ? '' : '5 5');
          N.card.setAttribute('stroke-width', filled ? 0 : 2);
          N.lab.set(N.label);
          N.lab.rect.setAttribute('fill', filled ? C.ink : C.f3);
          setLines(N.txt, filled ? wrap(v, { size: 13, width: 162, lines: 2 }).lines : ['not yet'], 17);
          N.txt.setAttribute('fill', filled ? C.ink : C.muted);
          tubes[i].base.setAttribute('stroke', filled ? N.col === C.f1 ? C.f3 : N.col : C.f2);
          tubes[i].flow.setAttribute('opacity', filled ? 0.9 : 0);
          tubes[i].flow.classList.toggle('flow', filled);
          lamps[i].setAttribute('fill', filled ? C.or : C.f2);
          if (!force && filled && N.filled === false) fly(i);
          N.filled = filled; N.text = v;
        }
      });
      if (force || n !== last.n) {
        glass.setAttribute('fill', GLASS[n]);
        fil.setAttribute('stroke', n ? C.or2 : C.f5);
        halo.style.opacity = HALO[n];
        halo.style.transform = `scale(${0.7 + n * 0.08})`;
        rays.style.opacity = n >= 3 ? (n === 4 ? 1 : 0.5) : 0;
        setRate(RATE[n]);
        countP.set(n === 4 ? 'bright idea, ready' : n ? `ideas in ${n} of 4` : 'feed me your ideas');
        countP.rect.setAttribute('fill', n === 4 ? C.ink : n ? C.f6 : C.f4);
        outCard.style.opacity = n === 4 ? 1 : 0;
        if (!force && n === 4 && last.n === 3) S.anim(outCard, [{ transform: 'translate(-30px,30px) scale(.4)', opacity: 0 }, { transform: 'translate(4px,-6px) scale(1.06)', opacity: 1, offset: 0.65 }, { transform: 'none', opacity: 1 }], { duration: 700, delay: 900, fill: 'backwards', easing: 'ease-out' });
        if (!force && n > (last.n || 0)) S.anim(glass, [{ transform: 'none' }, { transform: 'scale(1.08)' }, { transform: 'none' }], { duration: 500, delay: 1000, easing: SPRING });
      }
      last = { n };
    }
    glass.classList.add('fb');

    let state = ctx.getState ? ctx.getState() : {};
    render(state || {}, true);
    vis();
    S.fonts(() => render(state || {}, true));
    return {
      update(s) { state = s || {}; render(state, false); },
      destroy() { spins.forEach(a => { try { a.cancel(); } catch (e) {} }); S.destroy(); },
    };
  },
};
