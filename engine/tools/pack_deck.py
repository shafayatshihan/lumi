"""Pack an Aura build folder into ONE self-contained offline HTML file in "4 - Your slides".
  .aura/venv/Scripts/python.exe .aura/engine/tools/pack_deck.py <build folder | index.html> [--title "Deck title"] [--out <folder>] [--replace]
Inlines the runtime, stylesheets, scripts, fonts, pictures (resized and compressed with Pillow), videos and, when the deck
uses 3D, three.js through an import map of data URLs. A Blender slide's holder (<div class="bb-blender" data-blender="<sid>">)
is filled from assets/blender/<sid>.png | <sid>.mp4 + <sid>-poster.png + <sid>.json (Lumi's server puts them there; see
docs/blender-contract.md): the render is inlined LOSSLESS (its background must stay the exact slide colour) and the loop video
as it is. An older deck with the same name (and its PDF / PowerPoint /
notes backups) is moved to "4 - Your slides/Older versions" with its date first. Fails if anything needs the internet.
--replace (small edits from the app's editor): overwrite the deck in place and leave its backups where they are; nothing
moves to Older versions. Every attribute is kept as written, including the data-edit text ids the editor relies on."""
import base64, datetime, html as htmllib, io, json, mimetypes, os, re, shutil, sys, time
from pathlib import Path

ENGINE = Path(__file__).resolve().parents[1]
THREE_DIR = ENGINE / 'node_modules' / 'three' / 'build'
MAX_SIDE = 1920
MAX_MEDIA = 60 * 1024 * 1024
MIME = {'.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.svg': 'image/svg+xml',
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
        '.avif': 'image/avif', '.ico': 'image/x-icon', '.bmp': 'image/bmp', '.mp4': 'video/mp4', '.webm': 'video/webm',
        '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.vtt': 'text/vtt',
        '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
        '.glb': 'model/gltf-binary'}
BACKUP_SUFFIXES = ['.pdf', '.pptx', ' - speaker notes.docx', ' - speaker notes.pdf']

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass


class PackError(Exception):
    pass


def find_aura_root(p: Path):
    for d in [p] + list(p.parents):
        if (d / '.aura').is_dir():
            return d
    env = os.environ.get('CLAUDE_PROJECT_DIR')
    if env and (Path(env) / '.aura').is_dir():
        return Path(env)
    return Path.cwd() if (Path.cwd() / '.aura').is_dir() else None


class Packer:
    def __init__(self, html_path: Path):
        self.html_path = html_path
        self.base = html_path.parent
        self.cache = {}
        self.problems = []          # things that block packing
        self.notes = []             # friendly info lines
        self.stats = {'images': 0, 'fonts': 0, 'media': 0, 'css': 0, 'scripts': 0, 'saved': 0, 'blender': 0}

    # ---------- single resources ----------
    def is_external(self, url):
        return re.match(r'^(https?:)?//', url, re.I) is not None

    def skip(self, url):
        return (not url) or url.startswith(('data:', 'blob:', '#', 'about:', 'javascript:', 'mailto:', 'tel:')) or url.startswith('%23')

    def local(self, url, base: Path):
        clean = re.split(r'[?#]', url, maxsplit=1)[0]
        from urllib.parse import unquote
        p = (base / unquote(clean)).resolve()
        return p if p.is_file() else None

    def data_uri(self, url, base: Path, where):
        if self.skip(url):
            return url
        if self.is_external(url):
            self.problems.append(f'{where} needs the internet: {url[:100]} (download it into the build folder instead)')
            return url
        p = self.local(url, base)
        if not p:
            self.problems.append(f'{where} points to a missing file: {url[:100]}')
            return url
        frag = '#' + url.split('#', 1)[1] if '#' in url and p.suffix.lower() == '.svg' else ''
        if p in self.cache:
            return self.cache[p] + frag
        ext = p.suffix.lower()
        if ext in ('.png', '.jpg', '.jpeg', '.webp', '.bmp'):
            uri = self.image(p, lossless='blender' in p.parent.parts[-2:])
        elif ext == '.svg':
            uri = 'data:image/svg+xml;base64,' + base64.b64encode(p.read_bytes()).decode('ascii')
            self.stats['images'] += 1
        else:
            data = p.read_bytes()
            if len(data) > MAX_MEDIA:
                raise PackError(f'{p.name} is {len(data) // 1048576} MB, too big to put inside one HTML file (limit 60 MB). Use a shorter or smaller clip.')
            if ext in ('.woff2', '.woff', '.ttf', '.otf'):
                self.stats['fonts'] += 1
            else:
                self.stats['media'] += 1
            uri = f'data:{MIME.get(ext) or mimetypes.guess_type(p.name)[0] or "application/octet-stream"};base64,' + base64.b64encode(data).decode('ascii')
        self.cache[p] = uri
        return uri + frag

    def image(self, p: Path, lossless=False):
        raw = p.read_bytes()
        self.stats['images'] += 1
        try:
            from PIL import Image
            im = Image.open(io.BytesIO(raw))
            if getattr(im, 'is_animated', False):
                raise ValueError('animated')
            im.load()
            w, h = im.size
            if max(w, h) > MAX_SIDE:
                k = MAX_SIDE / max(w, h)
                im = im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
            alpha = im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info)
            if alpha:
                im = im.convert('RGBA')
                alpha = im.getchannel('A').getextrema()[0] < 255
            few_colours = (im.convert('RGB').getcolors(4096) is not None) if max(im.size) <= 4096 else False
            out = io.BytesIO()
            if lossless:          # a Blender render: the background is the exact slide colour, so never lossy
                (im if alpha else im.convert('RGB')).save(out, 'WEBP', lossless=True, quality=100, method=4)
                kind = 'image/webp'
            elif few_colours:       # charts, logos, line art: lossless keeps them crisp
                (im if alpha else im.convert('RGB')).save(out, 'PNG', optimize=True)
                kind = 'image/png'
            else:                 # photos and rich illustrations
                (im if alpha else im.convert('RGB')).save(out, 'WEBP', quality=84, method=6)
                kind = 'image/webp'
            data = out.getvalue()
            if len(data) >= len(raw) and max(w, h) <= MAX_SIDE:
                data, kind = raw, MIME.get(p.suffix.lower(), 'image/png')
            self.stats['saved'] += max(0, len(raw) - len(data))
        except Exception:
            data, kind = raw, MIME.get(p.suffix.lower(), 'application/octet-stream')
        if len(data) > 3 * 1048576:
            self.notes.append(f'{p.name} is still {len(data) / 1048576:.1f} MB after compression.')
        return f'data:{kind};base64,' + base64.b64encode(data).decode('ascii')

    # ---------- CSS ----------
    def css(self, text, base: Path, where, depth=0):
        def imp(m):
            url = m.group(1) or m.group(2)
            if self.is_external(url):
                self.problems.append(f'{where} imports a web stylesheet: {url[:100]} (fonts must come from .aura/engine/fonts)')
                return ''
            p = self.local(url, base)
            if not p or depth > 8:
                self.problems.append(f'{where} imports a missing stylesheet: {url[:100]}')
                return ''
            return self.css(p.read_text(encoding='utf-8'), p.parent, p.name, depth + 1)
        text = re.sub(r'@import\s+(?:url\(\s*[\'"]?([^\'")]+)[\'"]?\s*\)|[\'"]([^\'"]+)[\'"])[^;]*;', imp, text)

        def u(m):
            q, url = m.group(1), m.group(2).strip()
            return f'url({q}{self.data_uri(url, base, where)}{q})'
        return re.sub(r'url\(\s*([\'"]?)([^\'")]+?)\1\s*\)', u, text)

    # ---------- Blender holders ----------
    def blender_fill(self, html):
        """Put the render of each <div class="bb-blender" data-blender="sid"> inside it (docs/blender-contract.md section 4): an
        <img> (the still, or the loop's poster) and, for a loop, a muted looping <video> over it that the runtime plays only while
        the slide is current. The holder's own children (projected labels) stay. data-draft marks a preview that is not the approved
        render; data-anchors / data-fps carry where the labels sit on the picture."""
        adir = self.base / 'assets' / 'blender'

        def one(m):
            tag = m.group(0)
            sid = re.search(r'data-blender\s*=\s*["\']([^"\']+)["\']', tag)
            if not sid or re.search(r'\sdata-filled\b', tag): return tag
            sid = sid.group(1)
            if not re.fullmatch(r'[A-Za-z0-9_.-]+', sid): return tag
            try: meta = json.loads((adir / f'{sid}.json').read_text(encoding='utf-8'))
            except (OSError, ValueError): meta = None
            if meta and meta.get('baked'):
                return self.baked_fill(tag, sid, meta, adir)
            png, mp4, poster = adir / f'{sid}.png', adir / f'{sid}.mp4', adir / f'{sid}-poster.png'
            still = poster if mp4.is_file() else png
            if not (meta and still.is_file()):
                return tag[:-1] + ' data-pending="1">'
            esc = lambda v: htmllib.escape(str(v), quote=True)
            u = lambda f: self.data_uri('assets/blender/' + f.name, self.base, f'the Blender render of slide {sid}')
            attrs = ' data-filled="1"' + (' data-draft="1"' if meta.get('draft') else '') + (' data-stale="1"' if meta.get('stale') else '')
            if not re.search(r'\sdata-kind\s*=', tag): attrs += f' data-kind="{"animation" if mp4.is_file() else "still"}"'
            if meta.get('fps'): attrs += f' data-fps="{esc(meta["fps"])}"'
            lab = (meta.get('labels') or {}).get('anchors')
            if lab: attrs += ' data-anchors="' + esc(json.dumps(lab, separators=(',', ':'))) + '"'
            inner = f'<img class="bb-blender-img" src="{u(still)}" alt="" draggable="false">'
            if mp4.is_file():
                inner += (f'<video class="bb-blender-video" src="{u(mp4)}" poster="{u(still)}" muted loop playsinline preload="metadata" '
                          'aria-hidden="true" disablepictureinpicture></video>')
            if meta.get('draft'): inner += '<span class="bb-blender-tag" data-edit="no" data-aura-ui>preview</span>'
            self.stats['blender'] = self.stats.get('blender', 0) + 1
            return tag[:-1] + attrs + '>' + inner
        return re.sub(r'<div\b[^>]*\bclass\s*=\s*["\'][^"\']*\bbb-blender\b[^"\']*["\'][^>]*>', one, html)

    def baked_fill(self, tag, sid, meta, adir):
        """Batch 6 Part B: a baked studio render is not a picture but a model. The holder BECOMES a live three.js scene
        (class aura-3d + data-scene) that lib/bake-player.js plays from the inlined model.glb, so finalize records it with
        the seek-based capture like any other scene. data-baked keeps it out of the runtime's list of already-recorded
        Blender holders; the [data-anchor] labels inside it are moved by the player."""
        glb = adir / f'{sid}.glb'
        man = meta.get('bake') or {}
        if not glb.is_file() or not man:
            return tag[:-1] + ' data-pending="1">'
        esc = lambda v: htmllib.escape(str(v), quote=True)
        scene_id = f'lumi-bake-{sid}'
        period = float(man.get('period') or 0) or 1.0
        attrs = (f' data-filled="1" data-baked="1" data-scene="{esc(scene_id)}" data-period="{period:g}"'
                 + (' data-draft="1"' if meta.get('draft') else '') + (' data-stale="1"' if meta.get('stale') else ''))
        if not re.search(r'\sdata-kind\s*=', tag): attrs += ' data-kind="animation"'
        names = sorted((man.get('anchors') or {}).keys())
        if names: attrs += f' data-anchor-names="{esc(",".join(names))}"'
        tag = re.sub(r'(\bclass\s*=\s*["\'])', r'\1aura-3d ', tag, count=1)
        glb_uri = 'data:model/gltf-binary;base64,' + base64.b64encode(glb.read_bytes()).decode('ascii')
        opts = json.dumps({'manifest': man, 'glb': glb_uri, 'period': period}, separators=(',', ':'))
        self.baked.append(f'Aura.scene({json.dumps(scene_id)}, (ctx) => LumiBake.scene(ctx, {opts}), {{ period: {period:g} }});')
        # the poster (one Cycles frame of the baked materials): hidden while the model draws, the picture when it cannot
        poster = adir / f'{sid}-poster.png'
        inner = (f'<img class="bb-blender-img bb-bake-poster" src="{self.data_uri("assets/blender/" + poster.name, self.base, f"the poster of slide {sid}")}" '
                 'alt="" draggable="false">' if poster.is_file() else '')
        if meta.get('draft'): inner += '<span class="bb-blender-tag" data-edit="no" data-aura-ui>preview</span>'
        self.stats['blender'] = self.stats.get('blender', 0) + 1
        return tag[:-1] + attrs + '>' + inner

    def baked_scripts(self, html):
        """The player and one registration per baked holder, before </body> (runtime.js reads registrations on load)."""
        if not self.baked:
            return html
        player = (ENGINE / 'deck' / 'lib' / 'bake-player.js')
        if not player.is_file():
            raise PackError('lib/bake-player.js is missing from .aura/engine. Run "Update Lumi".')
        safe = lambda js: js.replace('</script', '<\\/script')      # the player's own doc comment shows a <script> example
        # ids: finalize.js drops both once every baked slide is a recorded loop (the models are most of the file's bytes)
        tag = ('<script id="lumi-bake-player">\n' + safe(player.read_text(encoding='utf-8')) + '\n</script>\n<script id="lumi-bake-scenes">\n'
               + safe('\n'.join(self.baked)) + '\n</script>\n')
        m = None
        for m in re.finditer(r'</body\s*>', html, re.I):
            pass
        return html[:m.start()] + tag + html[m.start():] if m else html + tag

    # ---------- the measured-values record (B-05 -> the post-processing honesty gate) ----------
    # engine/deck/lib/post-policy.js refuses bloom and depth of field on a slide whose figure carries traced numbers:
    # bloom blows out an error bar, depth of field hides the region a number was read from. The gate needs to know
    # WHICH slides those are, and guessing from the DOM is exactly the kind of inference B-05 exists to replace, so the
    # answer is taken from provenance.json - the same file deck_check.js judges against.
    # A claim of kind figure / source / published / computed is a measured value. `illustrative` is not: it is declared
    # as not-a-measurement on the slide itself, so it does not close the gate.
    # The tag is written on EVERY pack, empty list included: its presence is what tells the policy "I know the answer",
    # and its absence is what tells an unpacked build folder "you do not".
    MEASURED_KINDS = ('figure', 'source', 'published', 'computed')

    def measured_record(self, html):
        slides, source = [], 'provenance.json'
        prov = self.html_path.parent / 'provenance.json'
        if prov.is_file():
            try:
                j = json.loads(prov.read_text(encoding='utf-8').lstrip('﻿'))
                claims = j if isinstance(j, list) else (j.get('claims') or [])
                for c in claims:
                    if not isinstance(c, dict):
                        continue
                    if str(c.get('kind', '')).strip().lower() not in self.MEASURED_KINDS:
                        continue
                    try:
                        n = int(c.get('slide'))
                    except (TypeError, ValueError):
                        continue
                    if n > 0 and n not in slides:
                        slides.append(n)
            except (OSError, ValueError):
                self.problems.append('provenance.json could not be read, so the post-processing honesty gate cannot be built. Fix the JSON, or remove the file.')
                return html
        else:
            source = 'no provenance.json: every number on this deck traces to the user\'s own files'
        tag = ('<script id="lumi-measured" type="application/json">'
               + json.dumps({'slides': sorted(slides), 'source': source}, separators=(',', ':'))
               + '</script>\n')
        html = re.sub(r'<script\b[^>]*\bid\s*=\s*["\']lumi-measured["\'][^>]*>.*?</script>\s*', '', html, flags=re.S | re.I)
        m = re.search(r'</head\s*>', html, re.I)
        return html[:m.start()] + tag + html[m.start():] if m else tag + html

    # ---------- HTML ----------
    def pack(self):
        html = self.html_path.read_text(encoding='utf-8')
        self.baked = []
        html = self.blender_fill(html)
        html = self.baked_scripts(html)
        html = self.measured_record(html)
        html = self.strip_dead_examples(html)
        uses_three = self.needs_three(html)
        # import maps are rebuilt below
        html = re.sub(r'<script\b[^>]*type\s*=\s*["\']importmap["\'][^>]*>.*?</script>\s*', '', html, flags=re.S | re.I)

        def attr(tag, name):
            m = re.search(r'\s' + name + r'\s*=\s*("([^"]*)"|\'([^\']*)\'|([^\s>]+))', tag, re.I)
            return None if not m else next(g for g in m.groups()[1:] if g is not None)

        def link(m):
            tag = m.group(0)
            rel = (attr(tag, 'rel') or '').lower()
            href = attr(tag, 'href') or ''
            if 'stylesheet' in rel:
                if self.is_external(href):
                    self.problems.append(f'stylesheet needs the internet: {href[:100]}')
                    return ''
                p = self.local(href, self.base)
                if not p:
                    self.problems.append(f'missing stylesheet: {href}')
                    return ''
                self.stats['css'] += 1
                return '<style>\n' + self.css(p.read_text(encoding='utf-8'), p.parent, p.name) + '\n</style>'
            if rel in ('preconnect', 'dns-prefetch', 'preload', 'prefetch', 'modulepreload'):
                return ''
            if 'icon' in rel and href:
                return re.sub(r'href\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)', lambda _: 'href="' + self.data_uri(href, self.base, 'icon') + '"', tag, count=1)
            return tag
        html = re.sub(r'<link\b[^>]*>', link, html, flags=re.I)

        def script(m):
            open_tag, body = m.group(1), m.group(2)
            src = attr(open_tag, 'src')
            if src:
                if self.is_external(src):
                    self.problems.append(f'script needs the internet: {src[:100]}')
                    return m.group(0)
                p = self.local(src, self.base)
                if not p:
                    self.problems.append(f'missing script: {src}')
                    return m.group(0)
                body = p.read_text(encoding='utf-8')
                open_tag = re.sub(r'\s(src|defer|async|crossorigin|integrity)(\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+))?', '', open_tag, flags=re.I)
                self.stats['scripts'] += 1
            body = self.script_assets(body)
            return open_tag + body.replace('</script', '<\\/script') + '</script>'
        html = re.sub(r'(<script\b[^>]*>)(.*?)</script>', script, html, flags=re.S | re.I)

        html = re.sub(r'(<style\b[^>]*>)(.*?)(</style>)', lambda m: m.group(1) + self.css(m.group(2), self.base, 'a style block') + m.group(3), html, flags=re.S | re.I)
        html = re.sub(r'(\sstyle\s*=\s*)(["\'])(.*?)\2', lambda m: m.group(1) + m.group(2) + self.css(m.group(3), self.base, 'a style attribute').replace(m.group(2), '&quot;' if m.group(2) == '"' else '&#39;') + m.group(2), html, flags=re.S | re.I)

        def media(m):
            tag = m.group(0)
            tag = re.sub(r'\ssrcset\s*=\s*("[^"]*"|\'[^\']*\')', '', tag, flags=re.I)

            def one(a):
                q = a.group(3)[0] if a.group(3)[0] in '"\'' else ''
                val = a.group(3).strip('"\'')
                return f'{a.group(1)}{a.group(2)}={q or chr(34)}{self.data_uri(val, self.base, "<" + m.group(1) + ">")}{q or chr(34)}'
            return re.sub(r'(\s)(src|poster|href|xlink:href)\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)', one, tag, flags=re.I)
        html = re.sub(r'<(img|source|video|audio|track|image|use|input|embed|feImage)\b[^>]*>', media, html, flags=re.I)

        if uses_three:
            html = self.add_three(html)
        if not re.search(r'<meta\s+charset', html, re.I):
            html = re.sub(r'<head[^>]*>', lambda m: m.group(0) + '\n<meta charset="utf-8">', html, count=1, flags=re.I)
        stamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
        html = re.sub(r'<html\b', f'<!-- Made with Lumi, {stamp}. One file, works offline. Keys: arrows/space, F full screen, N notes, P presenter window, B black screen. -->\n<html', html, count=1, flags=re.I)
        self.uses_three = uses_three
        return html

    def script_assets(self, js):
        # pictures that scripts load by name, e.g. new THREE.TextureLoader().load('assets/wood.jpg')
        def s(m):
            q, url = m.group(1), m.group(2)
            p = self.local(url, self.base)
            return q + self.data_uri(url, self.base, 'a script') + q if p else m.group(0)
        return re.sub(r'([\'"])((?:\./)?assets/[^\'"\n]+?\.(?:png|jpe?g|webp|svg|gif|mp4|webm|glb|json))\1', s, js, flags=re.I)

    # The template ships a worked 3D example commented out so a person editing the deck by hand has one to copy. It is dead
    # text in a finished deck, it is the second `Aura.scene(` the post-mortem found in deck b45622, and it is the reason the
    # three.js decision has to strip comments at all. Removing it removes both the weight and the trap.
    DEAD_EXAMPLE = re.compile(r'[ \t]*/\*\s*3D example\b.*?\*/\s*', re.S)

    def strip_dead_examples(self, html):
        html, n = self.DEAD_EXAMPLE.subn('', html)
        if n: self.stats['deadExamples'] = self.stats.get('deadExamples', 0) + n
        # a <script> that held nothing but the example is now empty: drop it rather than ship an empty tag
        return re.sub(r'<script>\s*</script>\s*', '', html)

    # Post-mortem problem 11 said three.js "ships in every deck". It does NOT - this gate already existed and already
    # worked - but the gate was a bare expression in the middle of pack(), and it was only correct because of WHERE it sat:
    # `engine/deck/runtime.js` contains a real `import('three')` (its lazy loader), and the runtime is pulled in by
    # `<script src>` a few lines further down. Compute the same expression after that inlining and every deck in the world
    # starts carrying a megabyte it does not use, with no test to notice. So the signal is a named method that removes
    # engine `<script src>` tags itself, and the rule no longer depends on the order of the lines around it.
    def needs_three(self, html):
        """True when the DECK'S OWN code asks for three.js: a live `Aura.scene(...)` registration, or an import of the bare
        module. Comments do not count, and neither does anything Lumi's own runtime does to load it lazily."""
        live = re.sub(r'<script\b[^>]*\bsrc\s*=[^>]*>\s*</script>', '', html, flags=re.I)   # not yet inlined, and never the deck's own code
        # ...and Lumi's own runtime, wherever it is: `engine/deck/runtime.js` holds the real `import('three')` that loads
        # the module lazily FOR a scene. It is the loader, not a user of it, so it must never be the thing that decides.
        # `threePromise` is that loader's own variable and appears nowhere a deck author writes.
        live = '\n'.join(ln for ln in live.split('\n') if 'threePromise' not in ln)
        live = re.sub(r'<!--.*?-->|/\*.*?\*/', '', live, flags=re.S)
        live = re.sub(r'(?m)^\s*//.*$', '', live)                                           # a line-commented example counts no more than a block one
        return bool(re.search(r'Aura\.scene\s*\(|import\s*\(\s*[\'"]three[\'"]|from\s+[\'"]three[\'"]', live))

    def add_three(self, html):
        mod, core = THREE_DIR / 'three.module.js', THREE_DIR / 'three.core.js'
        if not mod.is_file():
            raise PackError('three.js is missing from .aura/engine. Run "Update Lumi", or make the 3D slides 2D.')
        b64 = lambda s: base64.b64encode(s.encode('utf-8')).decode('ascii')
        imports = {}
        small = self.minified_three()
        if small:
            imports['three'] = 'data:text/javascript;base64,' + b64(small)
            self.three_kind = 'minified'
            return self.insert_importmap(html, imports)
        self.three_kind = 'full'
        mod_src = mod.read_text(encoding='utf-8')
        if core.is_file():
            # three 0.18x: three.module.js imports ./three.core.js, which a data URL cannot reach: point it at a bare name
            mod_src = re.sub(r'([\'"])\./three\.core\.js\1', r'\1three/core\1', mod_src)
            imports['three/core'] = 'data:text/javascript;base64,' + b64(core.read_text(encoding='utf-8'))
        imports['three'] = 'data:text/javascript;base64,' + b64(mod_src)
        return self.insert_importmap(html, imports)

    def addons(self, imports):
        """GLTFLoader for the baked-slide player, inlined like three itself. Its two relative imports cannot be reached
        from a data URL, so they become bare names the import map resolves too."""
        b64 = lambda s: base64.b64encode(s.encode('utf-8')).decode('ascii')
        jsm = THREE_DIR.parent / 'examples' / 'jsm'
        for rel in ('loaders/GLTFLoader.js', 'utils/BufferGeometryUtils.js', 'utils/SkeletonUtils.js'):
            p = jsm / rel
            if not p.is_file():
                raise PackError('three.js\'s GLTFLoader is missing from .aura/engine. Run "Update Lumi".')
            src = re.sub(r'([\'"])\.\./(utils/[A-Za-z]+\.js)\1', r'\1three/addons/\2\1', p.read_text(encoding='utf-8'))
            imports['three/addons/' + rel] = 'data:text/javascript;base64,' + b64(src)
        return imports

    def insert_importmap(self, html, imports):
        import json
        if getattr(self, 'baked', None):
            imports = self.addons(imports)
        tag = '<script type="importmap">' + json.dumps({'imports': imports}) + '</script>\n'
        m = re.search(r'<script\b', html, re.I)
        return html[:m.start()] + tag + html[m.start():] if m else html.replace('</head>', tag + '</head>', 1)

    def minified_three(self):
        """One minified module made by three_min.js (cached in .aura/temp/cache); None means use the raw files."""
        import shutil, subprocess, tempfile
        node = shutil.which('node')
        if not node:
            return None
        root = find_aura_root(self.html_path)
        cache = (root / '.aura' / 'temp' / 'cache') if root else Path(tempfile.gettempdir()) / 'aura-cache'
        out = cache / 'three.min.js'
        try:
            r = subprocess.run([node, str(Path(__file__).resolve().parent / 'three_min.js'), str(out)],
                               capture_output=True, text=True, timeout=120)
            if r.returncode == 0 and out.is_file():
                return out.read_text(encoding='utf-8')
        except Exception:
            pass
        return None


def safe_name(title):
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', ' ', title).strip().rstrip('. ')
    name = re.sub(r'\s+', ' ', name)[:110].strip()
    if name.upper().split('.')[0] in {'CON', 'PRN', 'AUX', 'NUL', *(f'COM{i}' for i in range(1, 10)), *(f'LPT{i}' for i in range(1, 10))}:
        name = 'Slides - ' + name
    return name or 'My slides'


def unique(p: Path):
    if not p.exists():
        return p
    stem, suf = (p.name[:-len(p.suffix)], p.suffix) if p.suffix else (p.name, '')
    for i in range(2, 999):
        q = p.with_name(f'{stem} ({i}){suf}')
        if not q.exists():
            return q
    raise PackError('Too many old versions with the same name.')


def retire_old(out_dir: Path, stem: str):
    """Move the previous deck and its backups into Older versions, date first."""
    moved = []
    family = [out_dir / (stem + '.html')] + [out_dir / (stem + s) for s in BACKUP_SUFFIXES]
    old = [f for f in family if f.is_file()]
    if not old:
        return moved
    when = datetime.datetime.fromtimestamp(old[0].stat().st_mtime).strftime('%Y-%m-%d %H%M')
    dest = out_dir / 'Older versions'
    dest.mkdir(parents=True, exist_ok=True)
    for f in old:
        target = unique(dest / f'{when} {f.name}')
        shutil.move(str(f), str(target))
        moved.append(target)
    return moved


# ---- Windows file locks (post-mortem problem 7) -------------------------------------------------------------------
# os.replace onto a path another process holds open fails on Windows with WinError 5 / 32, where POSIX simply succeeds.
# The deck open in a browser tab, a preview window, PowerPoint or an antivirus scan is the usual holder, and it almost
# always lets go within a moment - so retry before saying anything, and when it really is stuck say what a person can do
# about it. A traceback must never reach the user (HANDOFF rule 12).
LOCK_ERRNOS = (5, 32, 33)
LOCKED_MSG = ('Could not pack the deck: "{name}" is open in another program. Close the deck in your browser (or in '
              'PowerPoint, or a preview window) and press pack again.')


def is_locked(e):
    return isinstance(e, PermissionError) or getattr(e, 'winerror', None) in LOCK_ERRNOS


def replace_retry(tmp: Path, target: Path, tries=8, wait=0.15):
    """os.replace, retried for ~1.2 s: a Windows file lock on the packed deck is nearly always transient."""
    for i in range(tries):
        try:
            os.replace(tmp, target)
            return
        except OSError as e:
            if i == tries - 1 or not is_locked(e):
                raise
            time.sleep(wait)


def drop(p: Path):
    """Remove a leftover .part file. Never raises: a tidy-up must not become the error the user sees."""
    try:
        if p and Path(p).exists():
            Path(p).unlink()
    except OSError:
        pass


def os_reason(e):
    """One plain sentence for an OSError, never its repr or a path the user did not type."""
    if is_locked(e):
        return 'a file Lumi had to write is open in another program. Close the deck everywhere and try again.'
    if getattr(e, 'errno', None) == 28 or getattr(e, 'winerror', None) == 112:
        return 'the disk is full. Free some space and try again.'
    if isinstance(e, FileNotFoundError):
        return 'a file the deck needs is missing. Rebuild the slide and try again.'
    return 'Lumi could not write the deck file (' + e.__class__.__name__ + '). Try again; if it keeps happening, restart Lumi.'


def main():
    args = sys.argv[1:]
    def opt(name):
        if name in args:
            i = args.index(name)
            v = args[i + 1] if i + 1 < len(args) else None
            del args[i:i + 2]
            return v
        return None
    title, out = opt('--title'), opt('--out')
    replace = '--replace' in args
    if replace:
        args.remove('--replace')
    if not args:
        print(__doc__)
        return 2
    src = Path(args[0]).resolve()
    if src.is_dir():
        src = src / 'index.html'
    if not src.is_file():
        print(f'Deck not found: {src}')
        return 2
    root = find_aura_root(src)
    out_dir = Path(out).resolve() if out else ((root / '4 - Your slides') if root else src.parent)
    tmp = target = None
    try:
        p = Packer(src)
        html = p.pack()
        if p.problems:
            print('Could not pack the deck yet:')
            for x in dict.fromkeys(p.problems):
                print('  - ' + x)
            return 1
        if not title:
            m = re.search(r'<title[^>]*>(.*?)</title>', html, re.S | re.I)
            import html as H
            title = H.unescape(m.group(1)).strip() if m else src.parent.name
        stem = safe_name(title)
        out_dir.mkdir(parents=True, exist_ok=True)
        moved = [] if replace else retire_old(out_dir, stem)
        target = out_dir / (stem + '.html')
        tmp = target.with_name(target.name + '.part')
        tmp.write_text(html, encoding='utf-8', newline='\n')
        replace_retry(tmp, target)
        prov = src.parent / 'provenance.json'          # B-05: the record of where every number came from travels with the deck
        if prov.is_file():
            try:
                shutil.copyfile(prov, out_dir / ('provenance.json' if out_dir.name != '4 - Your slides' else stem + '.provenance.json'))
            except OSError:
                print('  note: the provenance file could not be copied next to the deck.')
    except PackError as e:
        drop(tmp)
        print('Could not pack the deck: ' + str(e))
        return 1
    except OSError as e:                               # a Windows file lock is the common one; never a traceback (rule 12)
        drop(tmp)
        print(LOCKED_MSG.format(name=(target.name if target else 'the deck')) if is_locked(e)
              else 'Could not pack the deck: ' + os_reason(e))
        return 1
    visible = re.sub(r'<script\b.*?</script>|<!--.*?-->', '', html, flags=re.S | re.I)
    slides = len(re.findall(r'<section\b[^>]*class\s*=\s*["\'][^"\']*\bslide\b', visible, re.I))
    size = target.stat().st_size
    shown = (str(target.relative_to(root)) if root and str(target).startswith(str(root)) else str(target)).replace('\\', '/')
    print(f'Packed: {shown}')
    print(f'  {slides} slides, {size / 1048576:.2f} MB, one file, works offline')
    s = p.stats
    print(f'  inlined: {s["css"]} stylesheets, {s["scripts"]} scripts, {s["fonts"]} fonts, {s["images"]} pictures'
          + (f' ({s["saved"] / 1048576:.1f} MB saved by compression)' if s['saved'] > 65536 else '')
          + (f', {s["media"]} media files' if s['media'] else '') + (f', {s["blender"]} Blender render(s)' if s.get('blender') else '') + (f', three.js for 3D ({p.three_kind})' if p.uses_three else ''))
    ids = re.findall(r"""\sdata-edit\s*=\s*(?:"([^"]*)"|'([^']*)')""", visible, re.I)
    ids = [a or b for a, b in ids]
    ids = [i for i in ids if i.lower() not in ('no', 'off', 'false')]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    print(f'  {len(ids)} editable texts (data-edit ids)' + (', replaced in place' if replace else ''))
    if dupes:
        print('  note: repeated data-edit ids ' + ', '.join(dupes[:8]) + ' - run new_deck.js --ids on the build folder and pack again.')
    elif slides and not ids:
        print('  note: no data-edit ids - run new_deck.js --ids on the build folder and pack again.')
    for n in p.notes:
        print('  note: ' + n)
    for m in moved:
        print(f'  older version moved to: {m.relative_to(root) if root else m}'.replace('\\', '/'))
    return 0


if __name__ == '__main__':
    # Last line of defence (post-mortem problem 7 / HANDOFF rule 12): whatever goes wrong in here, the user and the chat
    # see one plain sentence, never a Python traceback. The server reads the LAST line of this output as its message.
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except KeyboardInterrupt:
        print('Could not pack the deck: it was stopped before it finished.')
        sys.exit(1)
    except OSError as e:
        print('Could not pack the deck: ' + os_reason(e))
        sys.exit(1)
    except BaseException as e:
        print('Could not pack the deck: something went wrong inside Lumi (' + e.__class__.__name__
              + '). Try the step again; if it keeps happening, restart Lumi.')
        sys.exit(1)
