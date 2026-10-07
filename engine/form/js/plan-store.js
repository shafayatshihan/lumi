// THE PLAN, IN ONE PLACE. Every page that shows a deck's plan reads it from here and nowhere else.
//
// WHY. The plan used to be copied: the build page kept `pay`, the editor kept `picPlan`, the plan page keeps its draft,
// and none of them re-read after a build step. That is one root cause with three faces:
//   * the 409 "built" refusal - a build step writes `visual.engine` (pin_engine) and `visual.builtAs` (pin_built_visual)
//     into the slide it just finished, so every copy older than that differs from the server's in exactly the field
//     `content_of` compares. Saving such a copy to remove an UNBUILT slide was read as an edit to a BUILT one;
//   * the left-hand list not growing when a slide was generated;
//   * "slide 7 of 7" beside "slide 7 of 13 is ready" - two counters from two copies of different ages.
// So: one owner, and changes are said as changes. A mutation names the slide and what to do with it, the server applies
// it to its own plan (never ours), and the answer it hands back becomes the new truth for every subscriber at once.
// There is nothing left to go stale, and no window in which a build step can land between a read and a write.
import * as api from './api.js';

const open = new Map();                       // deckId -> the one store for that deck

function make(deckId) {
  let payload = null, seq = 0, seen = 0, users = 0;
  const subs = new Set();
  const notify = () => { for (const fn of [...subs]) { try { fn(payload); } catch (e) { /* one bad listener is not the others' problem */ } } };
  // Only the newest answer is kept: a slow GET that lands after a mutation must never put the old plan back.
  const land = (my, r) => {
    if (my < seen) return r;
    seen = my;
    if (r && r.ok && r.plan) { payload = r; notify(); }
    return r;
  };
  const run = call => { const my = ++seq; return call().then(r => land(my, r), () => land(my, { ok: false, error: 'offline' })); };

  const store = {
    get: () => payload,
    slides: () => (payload && payload.plan && payload.plan.slides) || [],
    count: () => ((payload && payload.count) | 0) || store.slides().length,
    built: () => (payload && payload.built) | 0,
    // the plan's own id for the nth slide (1-based), so callers never key off a position they also have to maintain
    idAt: n => (store.slides()[n - 1] || {}).id || null,
    subscribe(fn) {
      subs.add(fn);
      if (payload) { try { fn(payload); } catch (e) { /* as above */ } }
      return () => subs.delete(fn);
    },
    refresh: () => run(() => api.plan.get(deckId)),
    // a payload this deck's plan came back inside anyway (plan/picture, a page that fetched it itself): same truth, one owner
    adopt: r => land(++seq, r),
    addSlide: (slide, after) => run(() => api.plan.slideAdd(deckId, slide || {}, after || null)),
    saveSlide: slide => run(() => api.plan.slideSave(deckId, slide)),
    // discard: yes, I know this slide is built and its work goes with it. Without it the server asks (409 'confirm').
    removeSlide: (id, { discard = false } = {}) => run(() => api.plan.slideRemove(deckId, id, discard ? { discard: true } : {})),
    picture: (id, main, opts) => run(() => api.plan.picture(deckId, id, main, opts || {})),
    release() { if (--users <= 0 && open.get(deckId) === store) open.delete(deckId); },
  };
  Object.defineProperty(store, '_hold', { value: () => { users++; return store; } });
  return store;
}

/** The store for one deck. Every caller gets the same one; each caller calls release() when it is done with it. */
export function openPlan(deckId) {
  let s = open.get(deckId);
  if (!s) { s = make(deckId); open.set(deckId, s); }
  return s._hold();
}

export function _reset() { open.clear(); }
