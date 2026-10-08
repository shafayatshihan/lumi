// Lumi opens fullscreen (installer/Lumi.cs and engine/form.ps1 both launch Edge with --app=<url> --start-fullscreen).
// Fullscreen means no title bar and no taskbar, so the window has no visible X any more - and a person must never be
// shut in a window they cannot see a way out of. This puts that way back on the page: one small control, shown ONLY
// when the window really is filling the screen, that closes the window exactly as the title-bar X used to.
//
// Why not kiosk mode: kiosk is built to take the ways out away (it suppresses the window controls and the F11 toggle).
// That is the opposite of what is wanted here. --start-fullscreen is the same pixels with every escape intact: F11
// gives the window back, Alt+F4 closes it, and this control closes it with the mouse.
//
// Measured, not assumed (probe against Edge 1536x864): an --app window started with --start-fullscreen reports
// outerWidth/outerHeight equal to screen.width/height and document.fullscreenElement null (it is browser fullscreen,
// which the page cannot see or leave through the Fullscreen API). A maximized window keeps a title bar and a taskbar,
// so its outerHeight is smaller - that difference is the test. window.close() works from the app window (one history
// entry), which is why the control can close it.
//
// Two ways this could still shut someone in, and what is done about each:
//   1. THE DETECTOR MISSES. Display scaling, a hidden taskbar or a second monitor can put screen.height a few CSS px
//      away from the window, and then the control never appears in a window that has no title bar either. So the test
//      is deliberately generous: the window counts as frameless when it covers the screen and keeps essentially none
//      of it for a frame. Showing the control in a maximized window costs a 30 px pill; withholding it in a
//      fullscreen one costs the person their way out. The cheap mistake is the one to make.
//   2. close() IS REFUSED. Chromium only lets a page close a window it opened or one with a single history entry.
//      An --app window qualifies, but a reload or a returned-to page can add entries. So the click is CHECKED: if the
//      window is still here a moment later, the control says what does work (F11 for the window back, Alt+F4 to
//      close) instead of silently doing nothing.
import { h } from './dom.js';

const SLACK = 4;             // a window manager, a scaled display or a hidden taskbar can be a few CSS px out
const FRAME = 24;            // a title bar is far taller than this; fullscreen keeps none of it

export function mountShellExit() {
  // Frameless and filling the screen: the viewport is as tall as the screen, with no chrome eating into it. A
  // maximized window loses a title bar AND a taskbar out of innerHeight, which is tens of px, not FRAME.
  const fullscreen = () => !!document.fullscreenElement
    || (window.outerHeight >= screen.height - SLACK && window.outerWidth >= screen.width - SLACK
      && screen.height - window.innerHeight <= FRAME);

  const btn = h('button', { type: 'button', class: 'sh-exit', 'data-nosfx': '', title: 'close lumi' }, 'close lumi');
  const tip = h('span', { class: 'sh-exit-tip', hidden: true, role: 'status' }, 'f11 for the window, alt+f4 to close');
  btn.addEventListener('click', () => {
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    let closing = true;
    try { window.close(); } catch (e) { closing = false; }
    // if we are still here, the browser refused: say what does work rather than leave a dead button
    setTimeout(() => { if (!closing || !window.closed) { tip.hidden = false; } }, 350);
  });
  const bar = h('div', { class: 'sh-exit-wrap', hidden: true }, tip, btn);
  document.body.append(bar);

  let t = 0;
  const paint = () => { bar.hidden = !fullscreen(); if (bar.hidden) tip.hidden = true; };
  const soon = () => { clearTimeout(t); t = setTimeout(paint, 120); };
  addEventListener('resize', soon);
  document.addEventListener('fullscreenchange', soon);
  paint();
  return () => { clearTimeout(t); removeEventListener('resize', soon); document.removeEventListener('fullscreenchange', soon); bar.remove(); };
}
