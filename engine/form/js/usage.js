// The "plan used 42% · resets 3:10 pm" pill in the top bar (home, editor, workshop). Data comes from GET /api/usage,
// which only changes while Claude runs, so the pill says "as of <time>". Refreshes every 30 s and on claude:event.
// initUsage(el) -> { show(bool), refresh() }
import * as api from './api.js';
import { on } from './bus.js';

const tfmt = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(/\s+/g, ' ');

export function initUsage(el) {
  let visible = false, timer = 0, last = 0, busy = false, has = false;
  el.innerHTML = '<span class="us-bar" aria-hidden="true"><i></i></span><span class="us-text"><span class="us-main"></span><span class="us-asof"></span></span>';
  const bar = el.querySelector('.us-bar i'), main = el.querySelector('.us-main'), asof = el.querySelector('.us-asof');

  function paint(u) {
    has = !!(u && (u.utilization != null || u.status));
    el.hidden = !visible || !has;
    if (!has) return;
    let pct = Number(u.utilization);
    if (Number.isFinite(pct)) pct = pct <= 1 ? pct * 100 : pct; else pct = null;
    const rejected = u.status && !String(u.status).startsWith('allowed');
    const reset = u.resetsAt ? new Date(Number(u.resetsAt) * 1000) : null;
    const resetOk = reset && !isNaN(reset) && reset > Date.now() - 60000;
    const resetTxt = resetOk ? tfmt(reset) : '';
    if (rejected) { main.textContent = resetTxt ? `plan limit reached · you can continue after ${resetTxt}` : 'plan limit reached for now'; pct = 100; }
    else main.textContent = (pct != null ? `plan used ${Math.round(pct)}%` : 'plan in use') + (resetTxt ? ` · resets ${resetTxt}` : '');
    const cap = u.capturedAt ? new Date(Number(u.capturedAt) * 1000) : null;
    asof.textContent = cap && !isNaN(cap) ? `as of ${tfmt(cap)}` : '';
    bar.style.transform = `scaleX(${Math.max(0.03, Math.min(1, (pct || 0) / 100))})`;
    el.dataset.level = rejected ? 'red' : pct != null && pct > 80 ? 'amber' : 'ok';
    el.title = 'how much of your claude plan is used right now';
  }
  async function refresh() {
    if (busy) return;
    busy = true; last = Date.now();
    const r = await api.usage();
    busy = false;
    if (r && r.ok !== false) paint(r.usage);
  }
  on('claude:event', d => {
    const k = d && d.event && d.event.kind;
    if (d && d.replay) return;
    if (k === 'limit' || k === 'done' || Date.now() - last > 5000) setTimeout(refresh, 300);
  });
  return {
    show(v) {
      visible = !!v;
      clearInterval(timer);
      if (visible) { refresh(); timer = setInterval(() => { if (!document.hidden) refresh(); }, 30000); }
      el.hidden = !visible || !has;
    },
    refresh,
  };
}
