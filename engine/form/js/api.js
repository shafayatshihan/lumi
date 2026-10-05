// Calls to the local Lumi server (engine/form_server.py). Every call resolves; failures come back as {ok:false, error}.
// F-19: a network failure OR a hang is { ok:false, error:'offline' } (a hang is cut off by a timeout, never waited on for ever),
// and the module keeps one honest answer to "can I reach Lumi?" (reachable() / onReach()) that the shell shows as a single
// "can't reach lumi, retrying" bar. Two failures in a row flip it; the next success flips it back.
const L = new Set();
let fails = 0, up = true;
export const reachable = () => up;
export function onReach(fn) { L.add(fn); return () => L.delete(fn); }
let confirming = 0, lastOk = Date.now();
export const idleMs = () => Date.now() - lastOk;      // how long since any request succeeded (the shell pings when this gets long)
function mark(ok) {
  if (ok) { lastOk = Date.now(); fails = 0; if (!up) { up = true; L.forEach(f => f(true)); } return; }
  if (++fails >= 2 && up) { up = false; L.forEach(f => f(false)); }
  else if (up && !confirming && typeof setTimeout === 'function') {      // one failure: ask again in a moment, so the bar does not wait for the next poll
    confirming = setTimeout(() => { confirming = 0; req('GET', '/api/ping', undefined, 4000); }, 1200);
  }
}
// how long to wait before the next poll: base grows with idle polls (nothing changed), a hidden tab and an unreachable
// server both slow it down, and any change should call it again with idle = 0 (F-09).
export function pace(base, idle = 0, { max = 6000, hidden = 4000 } = {}) {
  let ms = Math.min(max, Math.round(base * (1 + Math.min(idle, 10) * 0.45)));
  if (typeof document !== 'undefined' && document.hidden) ms = Math.max(ms, hidden);
  if (!up) ms = Math.max(ms, Math.min(8000, base * 3));
  return ms;
}
async function req(method, url, body, ms) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), ms || (method === 'GET' ? 15000 : 120000)) : 0;
  try {
    const r = await fetch(url, body === undefined ? { method, signal: ctl && ctl.signal } :
      { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl && ctl.signal });
    const j = await r.json().catch(() => ({}));
    mark(true);
    return r.ok ? j : { ok: false, status: r.status, ...j };
  } catch (e) { mark(false); return { ok: false, error: 'offline' }; } finally { clearTimeout(t); }
}
export const getJSON = (url, ms) => req('GET', url, undefined, ms);
export const postJSON = (url, body = {}) => req('POST', url, body);
export const patchJSON = (url, body = {}) => req('PATCH', url, body);

// Upload one file to a "3 - Put your files here" folder. onProgress(0..1). Resolves {ok, path, name, size} or {ok:false}.
export function upload(file, folder, onProgress = () => {}) {
  return new Promise(resolve => {
    const x = new XMLHttpRequest();
    x.open('POST', `/api/upload?folder=${encodeURIComponent(folder)}&name=${encodeURIComponent(file.name)}`);
    x.setRequestHeader('Content-Type', 'application/octet-stream');
    x.upload.onprogress = e => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch (e) {}
      resolve(x.status < 300 ? { ok: true, ...j } : { ok: false, status: x.status, ...j }); };
    x.onerror = () => resolve({ ok: false, error: 'offline' });
    x.send(file);
  });
}

export const ping = () => req('GET', '/api/ping', undefined, 4000);

export const claude = {
  status: (refresh = false) => getJSON('/api/claude/status' + (refresh ? '?refresh=1' : '')),
  login: browser => postJSON('/api/claude/login', { browser: browser || 'private' }),
  start: deckId => postJSON('/api/claude/start', deckId ? { deckId } : {}),
  // opts: { deckId, slide } (v0.3 editor): the server prefixes "[slide N]" and resumes that deck's own session.
  reply: (text, opts = {}) => postJSON('/api/claude/reply', { text, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v != null)) }),
  stop: () => postJSON('/api/claude/stop'),
  logout: () => postJSON('/api/claude/logout'),
  // the sign-in confirmation ("signed in as x - that's me"), remembered per install until the email changes
  confirm: email => postJSON('/api/claude/confirm', { email: email || '' }),
  signin: () => getJSON('/api/claude/signin'),
  events: since => getJSON('/api/claude/events?since=' + (since | 0)),
};
export const openSlides = path => postJSON('/api/open-slides', path ? { path } : {});
export const openFiles = () => postJSON('/api/open-files');

// v0.3: readiness checks, repairs, deck library, usage.
export const health = part => getJSON('/api/health' + (part ? '?part=' + encodeURIComponent(part) : ''));
export const fixClaude = body => postJSON('/api/fix/claude', body);
export const fix = (name, body) => postJSON('/api/fix/' + encodeURIComponent(name), body);
export const fixStatus = () => getJSON('/api/fix/status');
export const usage = () => getJSON('/api/usage');
export const decks = {
  list: () => getJSON('/api/decks'),
  get: id => getJSON('/api/decks/' + encodeURIComponent(id)),
  patch: (id, body) => patchJSON('/api/decks/' + encodeURIComponent(id), body),
  slides: id => getJSON('/api/decks/' + encodeURIComponent(id) + '/slides'),
  text: (id, editId, text) => postJSON('/api/decks/' + encodeURIComponent(id) + '/text', { editId, text }),
  // W-02: remove = move to the bin (never a real delete, the finished files in "4 - Your slides" are untouched); restore undoes it
  remove: id => req('DELETE', '/api/decks/' + encodeURIComponent(id)),
  restore: binned => postJSON('/api/decks/restore', { binned }),
  rename: (id, title) => patchJSON('/api/decks/' + encodeURIComponent(id), { title }),
  archive: (id, archived) => patchJSON('/api/decks/' + encodeURIComponent(id), { archived: !!archived }),
};
// W-08: copy the saved answers aside before "start fresh" clears them
export const brief = {
  get: () => getJSON('/api/brief'),
  save: data => postJSON('/api/brief', data),
  archive: () => postJSON('/api/brief/archive'),
  // for the last gasp when the page closes: keepalive lets the request finish after the page is gone
  saveOnExit: body => { try { fetch('/api/brief', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body }); } catch (e) { /* closing */ } },
};
export const files = () => getJSON('/api/files');
export const removeFile = path => postJSON('/api/remove', { path });

// v0.5: planning page, slide-by-slide build, finalize.
export const plan = {
  start: deckId => postJSON('/api/plan/start', deckId ? { deckId } : {}),
  get: id => getJSON('/api/decks/' + encodeURIComponent(id) + '/plan'),
  save: (id, planObj, replan) => postJSON('/api/decks/' + encodeURIComponent(id) + '/plan', { plan: planObj, ...(replan && replan.length ? { replan } : {}) }),
  answer: (id, doubtId, answer, other) => postJSON('/api/decks/' + encodeURIComponent(id) + '/plan/answer', { id: doubtId, answer, other }),
  suggest: (id, after) => postJSON('/api/decks/' + encodeURIComponent(id) + '/plan/suggest', { after }),
};
export const build = {
  next: id => postJSON('/api/decks/' + encodeURIComponent(id) + '/build', { mode: 'next' }),
  rest: id => postJSON('/api/decks/' + encodeURIComponent(id) + '/build', { mode: 'rest' }),
  stop: id => postJSON('/api/decks/' + encodeURIComponent(id) + '/build', { mode: 'stop' }),
};
// D-01: the explicit PowerPoint copy (one picture per slide, notes in the notes pane), a background job like finalize.
export const pptx = {
  start: id => postJSON('/api/decks/' + encodeURIComponent(id) + '/pptx'),
  status: id => getJSON('/api/decks/' + encodeURIComponent(id) + '/pptx'),
};
// S-05: remove what Lumi no longer needs (old temp files, extra older versions); { dry: true } only reports.
export const cleanup = opts => postJSON('/api/cleanup', opts || {});
// Blender studio renders (docs/blender-contract.md section 7): every slide's view, the preview loop, approve, the full render.
const bl = (id, sid, act) => '/api/decks/' + encodeURIComponent(id) + '/blender' + (sid ? '/' + encodeURIComponent(sid) : '') + (act ? '/' + act : '');
export const blender = {
  deck: id => getJSON(bl(id)),
  slide: (id, sid) => getJSON(bl(id, sid)),
  preview: (id, sid) => postJSON(bl(id, sid, 'preview')),
  change: (id, sid, text) => postJSON(bl(id, sid, 'change'), { text }),
  approve: (id, sid, preview) => postJSON(bl(id, sid, 'approve'), preview != null ? { preview } : {}),
  render: (id, sid, res) => postJSON(bl(id, sid, 'render'), res ? { res } : {}),
  cancel: (id, sid, job) => postJSON(bl(id, sid, 'cancel'), job ? { job } : {}),
  defer: (id, sid, on = true) => postJSON(bl(id, sid, 'defer'), { on: !!on }),
};
export const finalize = {
  start: (id, opts) => postJSON('/api/decks/' + encodeURIComponent(id) + '/finalize', opts || {}),
  status: () => getJSON('/api/finalize'),
  cancel: () => postJSON('/api/finalize/cancel'),
};
