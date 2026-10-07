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
import { h } from './dom.js';

const SLACK = 2;   // a window manager can be a pixel out

export function mountShellExit() {
  // The window fills the screen AND has no frame of its own: inner == outer == screen. A maximized window fails the
  // first (a title bar and a taskbar eat into it); a test window sized past the screen fails the second.
  const fullscreen = () => !!document.fullscreenElement
    || (Math.abs(window.outerHeight - screen.height) <= SLACK && Math.abs(window.innerHeight - screen.height) <= SLACK
      && Math.abs(window.outerWidth - screen.width) <= SLACK && Math.abs(window.innerWidth - screen.width) <= SLACK);

  const btn = h('button', { type: 'button', class: 'sh-exit', 'data-nosfx': '', title: 'close lumi' }, 'close lumi');
  btn.addEventListener('click', () => {
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    window.close();
  });
  const bar = h('div', { class: 'sh-exit-wrap', hidden: true }, btn);
  document.body.append(bar);

  let t = 0;
  const paint = () => { bar.hidden = !fullscreen(); };
  const soon = () => { clearTimeout(t); t = setTimeout(paint, 120); };
  addEventListener('resize', soon);
  document.addEventListener('fullscreenchange', soon);
  paint();
  return () => { clearTimeout(t); removeEventListener('resize', soon); document.removeEventListener('fullscreenchange', soon); bar.remove(); };
}
