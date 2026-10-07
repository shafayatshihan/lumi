#!/usr/bin/env node
// Lumi PERMISSION GATE. Claude Code runs it as a PreToolUse hook (matcher Bash|PowerShell) from .claude/settings.json.
//
// Why it exists: Lumi runs Claude headless (`claude -p`), where any command that needs approval is simply refused. Static
// allow rules cannot cover the many ways Claude spells the same toolkit call (forward or back slashes, quotes, `& `, `./`,
// absolute install paths, /c/... paths, `cd X && ...`, `| head`, `2>&1 | tail`), and a rule such as
// `Bash(node .aura/engine/tools/:*)` never matches at all (a `:*` prefix must end on a word boundary). v0.5.0 shipped exactly
// that and the first slide could not be built.
//
// What it decides, for the WHOLE command (every segment of a && / || / ; / | chain):
//   allow  every segment is a Lumi toolkit call (node, python or the install's venv python running a script that lives in
//          .aura/engine/tools or .aura/engine/rules), a read-only helper (cat, head, tail, ls, grep, Get-Content,
//          Select-Object, Get-ChildItem, Test-Path, echo ...) on paths inside the install, cd into the install, or
//          mkdir / New-Item / cp / Copy-Item / mv / Move-Item into the deck work folders (.aura/temp, .aura/decks).
//          A hook "allow" also lifts Claude Code's "contains multiple operations" refusal (measured with claude -p).
//   deny   any segment deletes files, uses git, the network, nested shells, package installers or Invoke-Expression, or
//          writes into .aura/engine, .aura/venv, .aura/blender or .claude. The reason goes back to Claude so it can take another way.
//   Blender: always allow or deny, never defer: only `blender -b -P <scene.py in the work folders> -- ...` on its own, from the
//          bundled or an official install (blenderCmd below; docs/blender-contract.md section 11).
//   (none) anything else: the normal permission rules decide (in Lumi's headless runs that means "refused").
// Deny rules in settings.json always win over this hook's "allow" (Claude Code checks them first).
//
// Unit tests: tools/form-dev/test_permissions_real.py (corpus of real command spellings from Lumi transcripts).
'use strict';
const fs = require('fs'), path = require('path');
const W = path.win32;

const INTERPRETERS = new Set(['node', 'node.exe', 'python', 'python.exe', 'python3', 'python3.exe', 'py', 'py.exe']);
const READERS_BASH = new Set(['cat', 'head', 'tail', 'ls', 'dir', 'grep', 'egrep', 'fgrep', 'wc', 'sort', 'uniq', 'cut', 'echo',
  'printf', 'pwd', 'true', 'false', ':', 'test', '[', '[[', 'file', 'stat', 'du', 'basename', 'dirname', 'realpath', 'find', 'tree',
  'which', 'diff', 'cmp', 'nl', 'column', 'sleep',
  // pure text filters that write nothing (post-mortem problem 10: `tr -s ' \n' ' ' < file | grep ...` was refused twice)
  'tr', 'tac', 'rev', 'fold', 'expand', 'unexpand', 'paste', 'comm', 'join', 'seq', 'base64', 'od', 'xxd', 'strings',
  'md5sum', 'sha1sum', 'sha256sum', 'cksum', 'date']);
const READERS_PS = new Set(['get-content', 'gc', 'type', 'select-object', 'select', 'get-childitem', 'gci', 'test-path',
  'get-location', 'gl', 'select-string', 'sls', 'format-table', 'ft', 'format-list', 'fl', 'format-wide', 'out-string', 'out-null',
  'measure-object', 'measure', 'sort-object', 'write-output', 'write', 'write-host', 'get-item', 'gi', 'resolve-path', 'split-path',
  'join-path', 'get-filehash', 'get-itemproperty', 'start-sleep', 'group-object', 'get-unique']);
const CD = new Set(['cd', 'chdir', 'set-location', 'sl', 'push-location', 'pushd']);
const POPD = new Set(['popd', 'pop-location']);
const MKDIR = new Set(['mkdir', 'md', 'new-item', 'ni', 'touch']);
const COPY = new Set(['cp', 'copy', 'copy-item', 'cpi']);
const MOVE = new Set(['mv', 'move', 'move-item', 'mi']);
const WRITERS = new Set(['set-content', 'sc', 'add-content', 'ac', 'out-file', 'tee', 'tee-object', 'rename-item', 'rni', 'ren',
  'clear-content', 'clc', 'sed', 'new-item', 'ni', 'mkdir', 'md', 'touch', 'cp', 'copy', 'copy-item', 'cpi', 'mv', 'move',
  'move-item', 'mi', 'ln', 'mklink', 'chmod', 'attrib', 'truncate', 'dd']);

const DENY = [
  [/^(rm|rmdir|del|erase|rd|remove-item|ri|unlink|shred|clear-recyclebin)$/, 'Lumi does not let Claude delete files or folders. Leave unused files where they are (Lumi tidies its temp folders itself) or overwrite them.'],
  [/^git(\.exe)?$/, 'git is switched off inside Lumi. The deck folders are not a git repository; just edit the files.'],
  [/^(curl|curl\.exe|wget|wget\.exe|invoke-webrequest|iwr|invoke-restmethod|irm|start-bitstransfer|scp|ssh|sftp|ftp|nc|ncat|telnet|bitsadmin|certutil)$/, 'Lumi keeps decks offline: Claude has no network commands here. Use only the user\'s files and what is already installed.'],
  [/^(invoke-expression|iex|invoke-command|icm|add-type|start-process|saps|start|runas|set-executionpolicy|new-service|schtasks|reg|reg\.exe|regedit|takeown|icacls|net|netsh|sc\.exe|shutdown|stop-computer|restart-computer|format|diskpart|bcdedit|wmic|stop-process|kill|taskkill)$/, 'That command is switched off inside Lumi. Use the Lumi toolkit (.aura/engine/tools) and the Read / Write / Edit tools.'],
  [/^(powershell|powershell\.exe|pwsh|pwsh\.exe|cmd|cmd\.exe|bash|bash\.exe|sh|sh\.exe|zsh|wsl|wsl\.exe|eval|exec|source|\.)$/, 'Nested shells are switched off inside Lumi. Run the command directly (one tool call), for example `node .aura/engine/tools/deck_check.js <folder>`.'],
  [/^(npm|npm\.cmd|npx|npx\.cmd|pnpm|yarn|pip|pip3|pip\.exe|pipx|uv|conda|winget|choco|scoop|install-module|install-package)$/, 'Lumi installs everything it needs itself; Claude cannot install packages here. Use the tools already in .aura/engine/tools.'],
];
const PROTECTED_REASON = 'Files under .aura/engine, .aura/venv, .aura/blender and .claude are Lumi\'s own and read-only. Write into the deck build folder (.aura/temp/build/<slug>) or the deck folder (.aura/decks/<id>) instead.';

// ------------------------------------------------------------------ tokenizer
// Returns {segs: [[{v, q}...]...], redirs: [{op, target}], bad: reason|null}. q = token had quotes (so it is never an operator).
function tokenize(cmd, shell) {
  const ps = shell === 'ps';
  const segs = [[]], redirs = [];
  let cur = null, quoted = false, i = 0, bgJob = false;
  const push = () => { if (cur !== null) segs[segs.length - 1].push({ v: cur, q: quoted }); cur = null; quoted = false; };
  const split = () => { push(); if (segs[segs.length - 1].length) segs.push([]); };
  const bad = r => ({ segs, redirs, bad: r });
  while (i < cmd.length) {
    const c = cmd[i], n = cmd[i + 1];
    if (c === "'") {
      let j = i + 1, s = '';
      for (;;) {
        if (j >= cmd.length) return bad('unclosed quote');
        if (cmd[j] === "'") { if (ps && cmd[j + 1] === "'") { s += "'"; j += 2; continue; } break; }
        s += cmd[j++];
      }
      cur = (cur || '') + s; quoted = true; i = j + 1; continue;
    }
    if (c === '"') {
      let j = i + 1, s = '';
      for (;;) {
        if (j >= cmd.length) return bad('unclosed quote');
        const d = cmd[j];
        if (d === '"') { if (ps && cmd[j + 1] === '"') { s += '"'; j += 2; continue; } break; }
        if (d === '$' && !(ps && /^\$null\b/i.test(cmd.slice(j)))) return bad('variable or subexpression inside quotes');
        if (!ps && d === '`') return bad('command substitution');
        if (ps && d === '`') { s += cmd[j + 1] || ''; j += 2; continue; }
        if (!ps && d === '\\' && '"\\$`'.includes(cmd[j + 1])) { s += cmd[j + 1]; j += 2; continue; }
        s += d; j++;
      }
      cur = (cur || '') + s; quoted = true; i = j + 1; continue;
    }
    if (c === '\r') { i++; continue; }
    if (c === ' ' || c === '\t') { push(); i++; continue; }
    if (c === '\n' || c === ';') { split(); i++; continue; }
    if (c === '|') { split(); i += n === '|' ? 2 : 1; continue; }
    if (c === '&' && n === '&') { split(); i += 2; continue; }
    // redirections: [n|*|&]>[>][&n | target], <, << (heredoc = code)
    if (c === '>' || (c === '<') || (c === '&' && n === '>') ||
        ((/^[0-9*]$/.test(c)) && cur === null && (n === '>' || (n === '<'))) ) {
      if (c === '<' || n === '<') {
        // `cmd < file` only READS the file, so it is as safe as passing the path as an argument - and Claude reaches for
        // it (`tr -s ' \n' ' ' < "Word file.pdf.txt" | grep ...` was refused twice in deck b45622aef312). A heredoc
        // (`<<`) is a program written inline and a process substitution (`<(`) is a nested shell: both stay refused.
        const lt = c === '<' ? i : i + 1;             // the position of the '<' itself (0<file, *<file)
        if (cmd[lt + 1] === '<') return bad('heredoc');
        if (cmd[lt + 1] === '(') return bad('process substitution');
        if (ps) return bad('input redirection');      // PowerShell has no input redirection; anything spelled so is odd
        let j = lt + 1;
        while (cmd[j] === ' ') j++;
        let k = j, t = '';
        if (cmd[k] === '"' || cmd[k] === "'") { const qch = cmd[k]; k++; while (k < cmd.length && cmd[k] !== qch) t += cmd[k++]; k++; }
        else while (k < cmd.length && !' \t\n;|&<>'.includes(cmd[k])) t += cmd[k++];
        if (!t) return bad('redirection without a target');
        push(); redirs.push({ op: '<', target: t }); i = k; continue;
      }
      let j = i; if (c !== '>') j++;           // skip fd digit / * / &
      j++; if (cmd[j] === '>') j++;
      if (cmd[j] === '(') return bad('process substitution');
      if (cmd[j] === '&') { let k = j + 1; while (/[0-9-]/.test(cmd[k] || '')) k++; redirs.push({ op: '>&', target: cmd.slice(j, k) }); push(); i = k; continue; }
      while (cmd[j] === ' ') j++;
      // read the target as one token
      let k = j, t = '';
      if (cmd[k] === '"' || cmd[k] === "'") { const qch = cmd[k]; k++; while (k < cmd.length && cmd[k] !== qch) t += cmd[k++]; k++; }
      else while (k < cmd.length && !' \t\n;|&<>'.includes(cmd[k])) t += cmd[k++];
      if (!t) return bad('redirection without a target');
      push(); redirs.push({ op: '>', target: t }); i = k; continue;
    }
    if (c === '&') {
      if (ps) {                               // call operator: only at the start of a segment
        const seg = segs[segs.length - 1];
        if (!seg.length && cur === null) { seg.push({ v: '&', q: false }); i++; continue; }
        return bad('background job');
      }
      bgJob = true; split(); i++; continue;   // bash: background, then a new command
    }
    if (!ps && c === '`') return bad('command substitution');
    if (c === '$') {
      if (ps && /^\$null\b/i.test(cmd.slice(i)) && cur === null) { cur = '$null'; i += 5; continue; }
      return bad('variables and subexpressions are not analysed');
    }
    if (c === '(' || c === ')') return bad('subshells and expressions are not analysed');
    if (ps && (c === '{' || c === '}' || c === '@' && (n === '(' || n === '{') || c === '[' && /^\[[A-Za-z.]+\]::/.test(cmd.slice(i)))) return bad('script blocks and .NET calls are not analysed');
    if (!ps && c === '\\') { cur = (cur || '') + (n === undefined ? '' : n); i += 2; continue; }
    if (ps && c === '`') { cur = (cur || '') + (n === undefined ? '' : n); i += 2; continue; }
    cur = (cur || '') + c; i++;
  }
  push();
  return { segs: segs.filter(s => s.length), redirs, bad: null, bgJob };
}

// ------------------------------------------------------------------ paths
function toWin(p) {
  let s = String(p).replace(/\//g, '\\');
  const m = /^\\([a-zA-Z])(\\|$)/.exec(s);                   // /c/Lumi -> C:\Lumi (Git Bash spelling)
  if (m && !/^\\\\/.test(s)) s = m[1].toUpperCase() + ':\\' + s.slice(3);
  return s;
}
function canon(p) {
  // the real path of p (resolving junctions, 8.3 names and case), or of its nearest existing parent + the rest
  let cur = W.resolve(p), rest = [];
  for (let k = 0; k < 64; k++) {
    try { return W.join(fs.realpathSync.native(cur), ...rest).toLowerCase(); }
    catch (e) {
      const up = W.dirname(cur);
      if (up === cur) return W.resolve(p).toLowerCase();
      rest.unshift(W.basename(cur)); cur = up;
    }
  }
  return W.resolve(p).toLowerCase();
}
const within = (p, dir) => p === dir || p.startsWith(dir.endsWith('\\') ? dir : dir + '\\');

function makeCtx(root, cwd) {
  const R = canon(root);
  const C = d => canon(W.join(root, d));
  return {
    root, R, cwd,
    tools: [C('.aura/engine/tools'), C('.aura/engine/rules')],
    venvPy: [C('.aura/venv/Scripts/python.exe'), C('.aura/venv/Scripts/python')],
    work: [C('.aura/temp'), C('.aura/decks')],
    protect: [C('.aura/engine'), C('.aura/venv'), C('.claude'), C('.aura/blender'), canon(W.join(root, '.aura', 'engine'))],
    blenderDirs: blenderDirs(root),
  };
}
// Where a blender.exe may live (docs/blender-contract.md section 11): Lumi's bundled copy and the official installs.
function blenderDirs(root) {
  const e = process.env, out = [canon(W.join(root, '.aura', 'blender'))];
  for (const base of [e.ProgramFiles || 'C:\\Program Files', e.ProgramW6432, e['ProgramFiles(x86)']]) if (base) out.push(canon(W.join(base, 'Blender Foundation')));
  if (e.LOCALAPPDATA) out.push(canon(W.join(e.LOCALAPPDATA, 'Programs', 'Blender Foundation')));
  return out;
}

// ------------------------------------------------------------------ Blender (docs/blender-contract.md section 11)
// Claude may run Blender ONLY as `blender -b -P <scene.py in .aura/decks or .aura/temp> -- <script args>`: the bundled or an
// official install, in any spelling (plain, .exe, quoted absolute path, `& "...\blender.exe"`). Anything else around Blender is
// DENIED (never deferred), so the reason tells Claude the one form that works. No static allow rule exists for it on purpose.
const BLENDER_FORM = 'Run Blender as ONE plain command and nothing else on the line, exactly: blender -b -P ' +
  '.aura/decks/<id>/blender/<slide>/scene.py -- --out .aura/decks/<id>/blender/<slide>/scratch/check.png --preview ' +
  '(no full path needed, no pipes, no redirection, no &, no $(...)). Lumi renders the preview and the full render itself.';
const isBlenderExe = raw => /^blender(\.exe)?$/i.test(W.basename(toWin(raw)));
// Blender hiding in a line that could not be tokenized. It has to be in COMMAND position (start of the line or straight
// after ; && || | ( ` or $( ), or be a path to blender.exe. A folder NAMED blender is not Blender running: the deck's own
// `.aura/decks/<id>/blender/<sid>` is such a folder, and a plain `mkdir -p .aura/decks/<id>/blender` used to be refused
// with the Blender message, which told Claude nothing about the real problem (the `;` and the pipe on that line).
const BLENDER_HIDDEN = /(?:^|[;&|(\n]|\$\(|`)\s*["']?(?:[^\s"'|;&]*[\\/])?blender(?:\.exe)?(?=["'\s]|$)/i;
const BLENDER_EXE_ANYWHERE = /blender\.exe/i;
const blenderHidden = cmd => BLENDER_HIDDEN.test(cmd) || BLENDER_EXE_ANYWHERE.test(cmd);
function blenderSeg(seg, shell) {
  const t = seg.filter((x, i) => !(i === 0 && shell === 'ps' && x.v === '&' && !x.q));
  return !!t.length && isBlenderExe(t[0].v);
}
function blenderCmd(ctx, raw, args) {
  const no = why => ({ v: 'deny', why: why + ' ' + BLENDER_FORM });
  if (/[\\/]/.test(raw)) {
    const p = resolveArg(ctx, raw);
    if (!p || !inside(ctx, p, ctx.blenderDirs)) return no('Only Lumi\'s Blender (or an official install under Program Files) may run.');
  }
  if (args.length === 1 && /^(--version|-v)$/.test(args[0])) return { v: 'allow', why: 'blender version check' };
  const dd = args.indexOf('--');
  const pre = dd < 0 ? args : args.slice(0, dd), post = dd < 0 ? [] : args.slice(dd + 1);
  let bg = false, script = null, nP = 0;
  for (let k = 0; k < pre.length; k++) {
    const a = pre[k];
    if (a === '-b' || a === '--background') { bg = true; continue; }
    if (a === '-P' || a === '--python') {
      nP++;
      if (!bg) return no('-b must come before -P.');
      script = pre[++k]; continue;
    }
    if (['--factory-startup', '-noaudio', '-q', '--quiet'].includes(a)) continue;
    if (['--python-exit-code', '-t', '--threads', '--log-level', '--log'].includes(a)) {
      k++;
      if (!/^[\w*,.^-]+$/.test(pre[k] || '')) return no(`Blender option ${a} needs a simple value.`);
      continue;
    }
    if (/^--python-(expr|text|console|use-system-env)$/.test(a)) return no('Blender may only run a scene file, never inline Python.');
    if (/\.blend\d*$/i.test(a)) return no('Blender may not open .blend files here.');
    return no(`The Blender option "${a}" is not allowed in Lumi.`);
  }
  if (!bg || nP !== 1 || !script) return no('Blender must run in the background (-b) with exactly one scene file (-P).');
  const sp = resolveArg(ctx, script);
  if (!sp || !/\.py$/i.test(sp) || !inside(ctx, sp, ctx.work)) return no('The scene must be a .py file inside .aura/decks or .aura/temp.');
  for (const a0 of post) {
    let a = a0;
    const m = /^--?[A-Za-z][\w-]*=(.*)$/.exec(a);
    if (m) a = m[1]; else if (/^--?[A-Za-z][\w-]*$/.test(a)) continue;
    if (/^-?[\d.]+$/.test(a) || /^[A-Za-z][\w-]*$/.test(a)) continue;             // numbers, plain words (--view hero)
    const p = resolveArg(ctx, a);
    if (!p || !inside(ctx, p, ctx.work)) return no('Blender may only write inside .aura/decks or .aura/temp.');
  }
  return { v: 'allow', why: 'Lumi Blender scene render' };
}
// resolve a path argument against the segment's cwd; null when it cannot be known
function resolveArg(ctx, s) {
  if (!s) return null;
  if (/^~/.test(s)) return null;
  const w = toWin(s);
  if (/^[a-zA-Z]:\\/.test(w) || /^\\\\/.test(w)) return canon(w);
  if (/^[a-zA-Z]:/.test(w)) return null;                    // C:foo (drive-relative) is never what Claude means
  if (!ctx.cwd) return null;
  return canon(W.resolve(ctx.cwd, w));          // resolve, not join: \etc\passwd is rooted on the drive
}
const isNull = s => /^(\/dev\/null|\$null|nul)$/i.test(s);
const inside = (ctx, p, dirs) => !!p && dirs.some(d => within(p, d));

// ------------------------------------------------------------------ one segment
// returns {v: 'allow'|'deny'|null, why}
function segment(ctx, toks, shell) {
  const ps = shell === 'ps';
  let t = toks.slice();
  if (ps && t[0] && t[0].v === '&' && !t[0].q) t.shift();   // & "C:\...\python.exe" ...
  if (!t.length) return { v: null, why: 'empty' };
  const raw = t[0].v;
  const exe = W.basename(toWin(raw)).toLowerCase();
  const args = t.slice(1).map(x => x.v);
  const rawLow = raw.toLowerCase();

  // env assignments (FOO=1 cmd) and odd first words are not analysed
  if (!ps && /^[A-Za-z_][A-Za-z0-9_]*=/.test(raw)) return { v: null, why: 'environment assignment' };

  for (const [re, why] of DENY) if (re.test(exe) || re.test(rawLow)) return { v: 'deny', why };
  if (/^(python|python3|py)(\.exe)?$/.test(exe) && args[0] === '-m' && /^(pip|ensurepip|venv)$/.test(args[1] || '')) return { v: 'deny', why: DENY[5][1] };
  if (isBlenderExe(raw)) return blenderCmd(ctx, raw, args);

  // anything that writes: never into Lumi's own folders
  if (WRITERS.has(exe) && !COPY.has(exe)) {            // a copy only writes its destination (checked below)
    const writesInPlace = exe !== 'sed' || args.some(a => /^-[a-zA-Z]*i/.test(a) || a === '--in-place');
    if (writesInPlace) for (const a of args) {
      if (/^-/.test(a)) continue;
      const p = resolveArg(ctx, a);
      if (p && inside(ctx, p, ctx.protect)) return { v: 'deny', why: PROTECTED_REASON };
    }
  }

  // the Lumi toolkit: an interpreter running a script that lives in .aura/engine/tools or .aura/engine/rules
  const exePath = /[\\/]/.test(raw) ? resolveArg(ctx, raw) : null;
  const isVenv = exePath && ctx.venvPy.some(v => exePath === v || exePath === v + '.exe');
  if (INTERPRETERS.has(exe) && (!exePath || isVenv) || isVenv) {
    if (args.length === 1 && /^(--version|-v|-V)$/.test(args[0])) return { v: 'allow', why: 'version check' };
    const script = args[0];
    if (!script || /^-/.test(script)) return { v: null, why: 'interpreter flags (-c / -e / -m) run arbitrary code' };
    const p = resolveArg(ctx, script);
    if (p && inside(ctx, p, ctx.tools) && /\.(js|mjs|cjs|py)$/.test(p)) return { v: 'allow', why: 'Lumi toolkit' };
    return { v: null, why: 'script outside .aura/engine/tools' };
  }
  if (exePath && !isVenv) return { v: null, why: 'program given by path' };

  const pathsInside = (list, allowNull) => list.every(a => {
    if (/^-/.test(a)) {                                        // --include=*.js, -Path:x
      const m = /^--?[A-Za-z-]+[=:](.+)$/.exec(a);
      return !m || !/[\\/]/.test(m[1]) || inside(ctx, resolveArg(ctx, m[1]), [ctx.R]);
    }
    if (allowNull && isNull(a)) return true;
    if (/^\.env$|[\\/]\.env$/i.test(a)) return false;
    return inside(ctx, resolveArg(ctx, a), [ctx.R]);
  });

  if (CD.has(exe)) {
    const target = args.filter(a => !/^-/.test(a))[0];
    if (!target) { ctx.cwd = ctx.root; return { v: 'allow', why: 'cd home' }; }
    const p = resolveArg(ctx, target);
    if (!inside(ctx, p, [ctx.R])) return { v: null, why: 'cd outside the Lumi folder' };
    ctx.cwd = p; return { v: 'allow', why: 'cd inside the Lumi folder' };
  }
  if (POPD.has(exe)) { ctx.cwd = null; return { v: 'allow', why: 'popd' }; }

  if ((!ps && READERS_BASH.has(exe)) || (ps && (READERS_PS.has(exe) || ['cat', 'head', 'tail', 'ls', 'dir', 'echo', 'pwd', 'sort'].includes(exe)))) {
    if (exe === 'find' && args.some(a => /^-(exec|execdir|ok|okdir|delete|fprint|fprint0|fprintf|fls)$/.test(a))) return { v: null, why: 'find with actions' };
    if (['echo', 'printf', 'tr', 'seq', 'fold', 'rev', 'tac', 'expand', 'unexpand', 'date',
         'write-output', 'write', 'write-host', 'test', '[', '[[', ':', 'true', 'false', 'sleep', 'start-sleep',
         'select-object', 'select', 'format-table', 'ft', 'format-list', 'fl', 'format-wide', 'out-string', 'out-null', 'measure-object',
         'measure', 'sort-object', 'group-object', 'get-unique', 'which', 'grep', 'egrep', 'fgrep', 'select-string', 'sls'].includes(exe)) {
      // text-only helpers: their words are not paths (a grep pattern, a property list); path-like words must still be inside
      const pathy = args.filter(a => !/^-/.test(a) && (/^([a-zA-Z]:|\/[a-zA-Z]\/|\/|\.\.?[\\/]|~)/.test(a)) && !isNull(a));
      return pathy.every(a => inside(ctx, resolveArg(ctx, a), [ctx.R])) ? { v: 'allow', why: 'read-only helper' } : { v: null, why: 'path outside the Lumi folder' };
    }
    return pathsInside(args, true) ? { v: 'allow', why: 'read-only helper' } : { v: null, why: 'path outside the Lumi folder' };
  }

  if (MKDIR.has(exe)) {
    let type = null; const pos = [];
    for (let k = 0; k < args.length; k++) {
      const a = args[k], al = a.toLowerCase();
      if (/^-(itemtype|type)$/.test(al)) { type = (args[++k] || '').toLowerCase(); continue; }
      if (/^-(path|name|literalpath)$/.test(al)) { pos.push(args[++k]); continue; }
      if (/^-(value)$/.test(al)) { k++; continue; }
      if (/^-/.test(a)) continue;
      pos.push(a);
    }
    if (type && !/^(directory|file|dir)$/.test(type)) return { v: null, why: 'links are not analysed' };
    if (!pos.length) return { v: null, why: 'nothing to create' };
    return pos.every(a => inside(ctx, resolveArg(ctx, a), ctx.work)) ? { v: 'allow', why: 'folder in the deck work area' } : { v: null, why: 'outside the deck work folders' };
  }

  if (COPY.has(exe) || MOVE.has(exe)) {
    let dest = null; const src = [];
    for (let k = 0; k < args.length; k++) {
      const a = args[k], al = a.toLowerCase();
      if (/^-(destination|dest|d)$/.test(al) && ps) { dest = args[++k]; continue; }
      if (/^-(path|literalpath|p)$/.test(al) && ps) { src.push(args[++k]); continue; }
      if (/^--?target-directory=/.test(a)) { dest = a.split('=')[1]; continue; }
      if (/^-/.test(a)) continue;
      src.push(a);
    }
    if (!dest) dest = src.pop();
    if (!dest || !src.length) return { v: null, why: 'copy without source or destination' };
    const d = resolveArg(ctx, dest);
    if (d && inside(ctx, d, ctx.protect)) return { v: 'deny', why: PROTECTED_REASON };
    if (!inside(ctx, d, ctx.work)) return { v: null, why: 'destination outside the deck work folders' };
    const okSrc = src.every(a => inside(ctx, resolveArg(ctx, a), MOVE.has(exe) ? ctx.work : [ctx.R]));
    return okSrc ? { v: 'allow', why: 'copy into the deck work area' } : { v: null, why: 'source outside the Lumi folder' };
  }
  return { v: null, why: 'not a Lumi command' };
}

// ------------------------------------------------------------------ whole command
function decide(tool, command, opts) {
  const shell = /^powershell$/i.test(tool) ? 'ps' : 'bash';
  const root = opts.root;
  let cwd = opts.cwd || root;
  const ctx = makeCtx(root, null);
  ctx.cwd = inside(ctx, canon(cwd), [ctx.R]) ? canon(cwd) : null;
  const cmd = String(command || '').trim();
  if (!cmd) return { decision: null, reason: 'empty' };
  const tk = tokenize(cmd, shell);
  // a denied word anywhere still denies, even when the rest cannot be analysed (rm hidden behind `$(...)` is not let through
  // either way: without an allow, Lumi's headless run refuses it)
  if (tk.bad) {
    for (const seg of tk.segs) { const r = segment(makeCtxCopy(ctx), seg, shell); if (r.v === 'deny') return { decision: 'deny', reason: r.why }; }
    if (blenderHidden(cmd)) return { decision: 'deny', reason: 'Blender cannot run inside $(...), a variable or a subshell. ' + BLENDER_FORM };
    return { decision: null, reason: tk.bad };
  }
  if (tk.segs.some(seg => blenderSeg(seg, shell)) && (tk.segs.length > 1 || tk.redirs.length || tk.bgJob))
    return { decision: 'deny', reason: 'Blender must run on its own: no &&, ;, | or redirection around it. ' + BLENDER_FORM };
  for (const r of tk.redirs) {
    if (r.op === '>&' || r.op === '<') continue;        // `< file` only reads: reading Lumi's own files is allowed
    if (isNull(r.target)) continue;
    const p = resolveArg(ctx, r.target);
    if (p && inside(ctx, p, ctx.protect)) return { decision: 'deny', reason: PROTECTED_REASON };
  }
  let verdict = 'allow', why = [];
  for (const seg of tk.segs) {
    const r = segment(ctx, seg, shell);
    if (r.v === 'deny') return { decision: 'deny', reason: r.why };
    if (r.v !== 'allow') { verdict = null; why.push(seg.map(x => x.v).join(' ').slice(0, 80) + ': ' + r.why); }
  }
  if (verdict === 'allow') for (const r of tk.redirs) {
    if (r.op === '>&' || isNull(r.target)) continue;
    if (r.op === '<') {                                // reading a file in: anywhere inside the Lumi folder
      if (!inside(ctx, resolveArg(ctx, r.target), [ctx.R])) { verdict = null; why.push('reads ' + r.target + ', outside the Lumi folder'); }
      continue;
    }
    // file redirection: only into the deck work folders (PowerShell refuses these on its own anyway)
    if (!inside(ctx, resolveArg(ctx, r.target), ctx.work)) { verdict = null; why.push('redirect to ' + r.target); }
  }
  return verdict === 'allow' ? { decision: 'allow', reason: 'Lumi toolkit or read-only helper' } : { decision: null, reason: why.join('; ') };
}
function makeCtxCopy(ctx) { return Object.assign({}, ctx); }

function findRoot() {
  if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR;
  let d = process.cwd();
  for (let k = 0; k < 12; k++) { if (fs.existsSync(path.join(d, '.aura'))) return d; const up = path.dirname(d); if (up === d) break; d = up; }
  return process.cwd();
}

function logLine(root, s) {
  try {
    const f = path.join(root, '.aura', 'logs', 'permissions.log');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    try { if (fs.statSync(f).size > 256 * 1024) fs.renameSync(f, f + '.old'); } catch (e) {}
    fs.appendFileSync(f, new Date().toISOString() + ' ' + s.replace(/\s+/g, ' ').slice(0, 400) + '\n');
  } catch (e) {}
}

// settings.json runs it as `node -e "require(<project>/.aura/engine/rules/permit.js).main()"`, so the hook still works after
// Claude changed directory (a relative `node .aura/engine/rules/permit.js` would not be found from a sub-folder).
function main() {
  let raw = '';
  process.stdin.on('data', d => { raw += d; });
  process.stdin.on('end', () => {
    try {
      const inp = JSON.parse(raw.replace(/^\uFEFF/, '').trim() || '{}');
      const tool = inp.tool_name || '';
      if (!/^(bash|powershell)$/i.test(tool)) return;
      const root = findRoot();
      const r = decide(tool, (inp.tool_input || {}).command, { root, cwd: inp.cwd || process.cwd() });
      logLine(root, `${r.decision || 'defer'} ${tool}: ${(inp.tool_input || {}).command} -- ${r.reason}`);
      if (!r.decision) return;
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: r.decision,
        permissionDecisionReason: r.decision === 'deny' ? 'Lumi: ' + r.reason : 'Lumi: ' + r.reason } }));
    } catch (e) { /* never block on a hook error: the normal rules decide */ }
  });
}

if (require.main === module) main();
module.exports = { decide, tokenize, main };
