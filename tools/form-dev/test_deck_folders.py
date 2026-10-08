"""Developer-only tests for per-deck source folders (v0.5.6 work, untested when it was written).

Called from test_server.py with the test module as `T`; also runnable alone:
    python tools/form-dev/test_deck_folders.py --sandbox X:\\aura-dev-folders

What it holds the change to:
  * two decks with different files never see each other's (helpers, /api/files?deck=, and on disk);
  * a number present only in deck A's report does NOT trace on deck B's slide - the whole reason the change
    exists. Proved twice: at the claims.js level (t_deck_corpus.js) and through the real deck_check.js with
    --interview naming each deck, which is the wiring a build step actually uses;
  * a file uploaded BEFORE the deck exists lands in the draft and is adopted by the deck that is then made;
    a file uploaded AFTER lands straight in that deck's folder;
  * a deck record with no `filesFolder` (made on 0.5.3-0.5.5) still reads the shared root and .aura/temp/text,
    and never sees the per-deck folders sitting beside its type folders;
  * renaming a deck renames its folder, a title collision gets " (2)", and Windows-illegal names are sanitised.
"""
import json, os, shutil, subprocess, sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ENGINE = REPO / 'engine'
NODE = shutil.which('node.exe') or shutil.which('node')


def node(args, cwd, timeout=300):
    r = subprocess.run([NODE] + [str(a) for a in args], cwd=str(cwd), capture_output=True, timeout=timeout,
                       stdin=subprocess.DEVNULL, text=True, encoding='utf-8', errors='replace')
    return r.returncode, (r.stdout or '') + (r.stderr or '')


def run(T=None):
    if T is None:
        class T:
            pass
        a = sys.argv
        T.SANDBOX = Path(a[a.index('--sandbox') + 1]) if '--sandbox' in a else Path(r'X:\aura-dev-folders')
        T.REPO = REPO
        T.check = lambda name, ok, info='': print(('  PASS ' if ok else '  FAIL ') + name + ('' if ok else f'   <- {info}'))
        T.jget = T.jpost = T.req = None
        os.environ.setdefault('AURA_TEST_UNIT_ROOT', str(T.SANDBOX / 'unit'))
    check = T.check
    sandbox = Path(T.SANDBOX)
    sys.path.insert(0, str(ENGINE)); sys.path.insert(0, str(Path(__file__).parent))
    import form_server as fs
    import test_batch_c as C
    os.environ.setdefault('AURA_TEST_UNIT_ROOT', str(sandbox / 'unit'))
    print('\n[per-deck source folders: isolation, the draft, legacy decks, renames]')

    unit_tests(fs, C, check)
    corpus_tests(sandbox, check)
    if getattr(T, 'jget', None): http_tests(T, check)


# ---------------------------------------------------------------- the helpers, against a throwaway root
def deck_with(fs, title, folder=None, deck_id=None):
    """A deck record straight on disk, like one the server made."""
    rec = fs.new_deck(brief={}, title=title)
    if deck_id: pass
    if folder is not None: rec = fs.update_deck(rec['id'], filesFolder=folder)
    return rec


def put(root, *parts, text='x'):
    p = Path(root).joinpath(*parts)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding='utf-8')
    return p


def unit_tests(fs, C, check):
    with C.unit_root(fs, 'deck-folders') as root:
        FILES, AURA = fs.FILES, fs.AURA

        # ---- the draft: where files go before any deck exists
        check('no deck yet: files go to the draft folder, not the shared root',
              fs.files_root(None) == FILES / 'New deck' and fs.text_root(None) == fs.TEMP / 'draft-text',
              (fs.files_root(None), fs.text_root(None)))
        put(FILES, 'New deck', 'Report', 'draft.docx')
        put(fs.TEMP, 'draft-text', 'Report', 'draft.docx.txt', text='# draft.docx\nPeak 355 kPa.')

        # ---- a deck born after the files: it adopts the draft, folder and corpus
        a = fs.new_deck(brief={}, title='Pulsating Heat Pipe')
        a = fs.adopt_draft(a)
        check('uploads BEFORE the deck exists are adopted by it (folder renamed to the title)',
              a.get('filesFolder') == 'Pulsating Heat Pipe' and (FILES / 'Pulsating Heat Pipe' / 'Report' / 'draft.docx').is_file()
              and not (FILES / 'New deck').exists(), a.get('filesFolder'))
        check("the draft's extracted text became THIS deck's corpus",
              (fs.DECKS / a['id'] / 'text' / 'Report' / 'draft.docx.txt').is_file() and not (fs.TEMP / 'draft-text').exists()
              and fs.text_root(a) == fs.DECKS / a['id'] / 'text', fs.text_root(a))
        check('the adopted deck reads its own files folder',
              fs.files_root(a) == FILES / 'Pulsating Heat Pipe', fs.files_root(a))

        # ---- uploads AFTER the deck exists go straight in
        put(FILES, 'Pulsating Heat Pipe', 'Data (csv, excel, graphs)', 'later.csv')
        got = {g['folder']: g['files'] for g in fs.list_files(a)}
        check('uploads AFTER the deck exists land in that deck and are listed',
              got.get('Report') == ['Report/draft.docx'] and got.get('Data (csv, excel, graphs)') == ['Data (csv, excel, graphs)/later.csv'], got)

        # ---- a second deck: the two never see each other
        b = fs.new_deck(brief={}, title='Lattice Cooling')
        put(FILES, 'New deck', 'Report', 'b-report.docx')
        b = fs.adopt_draft(b)
        put(fs.DECKS, b['id'], 'text', 'Report', 'b-report.docx.txt', text='# b-report.docx\nNo pressures.')
        fa = [f for g in fs.list_files(a) for f in g['files']]
        fb = [f for g in fs.list_files(b) for f in g['files']]
        check('two decks with different files never see each other\'s',
              'Report/draft.docx' in fa and 'Report/b-report.docx' not in fa
              and 'Report/b-report.docx' in fb and 'Report/draft.docx' not in fb, (fa, fb))
        check('the two decks have two different folders on disk and two different corpora',
              fs.files_root(a) != fs.files_root(b) and fs.text_root(a) != fs.text_root(b)
              and (FILES / 'Lattice Cooling' / 'Report' / 'b-report.docx').is_file(), (fs.files_root(b), fs.text_root(b)))

        # ---- a deck made before per-deck folders: nothing of its moves, and it sees nothing new
        old = fs.new_deck(brief={}, title='Old deck from 0.5.4')
        check('a record with no filesFolder keeps the shared root and the shared corpus',
              'filesFolder' not in old and fs.files_root(old) == FILES and fs.text_root(old) == fs.TEMP / 'text',
              (fs.files_root(old), fs.text_root(old)))
        put(FILES, 'Report', 'legacy.docx')
        fo = [f for g in fs.list_files(old) for f in g['files']]
        check('the legacy deck reads exactly what it always read',
              fo == ['Report/legacy.docx'], fo)
        check('a scan never walks the whole root: the new decks\' folders sit beside the type folders and are not read',
              not any('Pulsating' in f or 'Lattice' in f for f in fo)
              and sorted(p.name for p in FILES.iterdir() if p.is_dir() and p.name not in fs.FOLDERS) == ['Lattice Cooling', 'Pulsating Heat Pipe'],
              sorted(p.name for p in FILES.iterdir()))
        check('the legacy deck\'s own files are invisible to a per-deck deck', 'Report/legacy.docx' not in fa + fb, (fa, fb))

        # ---- rename
        a = fs.update_deck(a['id'], title='Closed-Loop Pulsating Heat Pipe')
        a = fs.rename_files_folder(a)
        check('renaming a deck renames its folder and keeps every file',
              a['filesFolder'] == 'Closed-Loop Pulsating Heat Pipe'
              and (FILES / 'Closed-Loop Pulsating Heat Pipe' / 'Report' / 'draft.docx').is_file()
              and not (FILES / 'Pulsating Heat Pipe').exists(), a['filesFolder'])
        old_folder = a['filesFolder']
        a2 = fs.rename_files_folder(fs.update_deck(a['id'], title='Closed-Loop Pulsating Heat Pipe'))
        check('renaming to the same name is a no-op, not a " (2)"', a2['filesFolder'] == old_folder, a2['filesFolder'])

        # ---- a title collision
        c = fs.new_deck(brief={}, title='Closed-Loop Pulsating Heat Pipe')
        c = fs.adopt_draft(c)
        check('a second deck with the same title gets " (2)"',
              c['filesFolder'] == 'Closed-Loop Pulsating Heat Pipe (2)'
              and (FILES / 'Closed-Loop Pulsating Heat Pipe (2)').is_dir(), c['filesFolder'])
        d = fs.rename_files_folder(fs.update_deck(fs.adopt_draft(fs.new_deck(brief={}, title='x'))['id'],
                                                 title='Closed-Loop Pulsating Heat Pipe'))
        check('a rename into a taken name gets " (3)", never an overwrite',
              d['filesFolder'] == 'Closed-Loop Pulsating Heat Pipe (3)'
              and (FILES / 'Closed-Loop Pulsating Heat Pipe' / 'Report' / 'draft.docx').is_file(), d['filesFolder'])

        # ---- Windows-illegal and awkward titles
        for title, want in (('Q3: results <draft> | v2?', 'Q3_ results _draft_ _ v2_'),
                            ('CON', '_CON'), ('nul', '_nul'), ('  ...  ', 'New deck'), ('', 'New deck'),
                            ('a/b\\c', 'c'), ('trailing dot.', 'trailing dot'), ('x' * 90, 'x' * 60),
                            ('  spaced   out  ', 'spaced out'), ('file', 'file'),
                            ('Report', 'Report deck'), ('anything else', 'anything else deck')):
            check(f'title {title[:24]!r} -> folder {want[:28]!r}', fs.folder_name(title) == want, fs.folder_name(title))
        e = fs.adopt_draft(fs.new_deck(brief={}, title='Q3: results <draft> | v2?'))
        check('an illegal title makes a real, legal folder on disk',
              e['filesFolder'] == 'Q3_ results _draft_ _ v2_' and (FILES / e['filesFolder']).is_dir(), e['filesFolder'])

        # ---- the draft never collides with a deck that owns "New deck"
        n = fs.adopt_draft(fs.new_deck(brief={}, title='New deck'))
        check('a deck actually titled "New deck" owns the folder; the next draft steps aside',
              n['filesFolder'] == 'New deck' and fs.draft_dir() == FILES / 'New deck (2)', (n['filesFolder'], fs.draft_dir()))

        r = fs.adopt_draft(fs.new_deck(brief={}, title='Report'))
        check('a deck titled like a type folder never becomes one (a legacy deck would read it as its own Report)',
              r['filesFolder'] == 'Report deck' and (FILES / 'Report deck').is_dir(), r['filesFolder'])

        # ---- extract_sources always names the files, so a shared root is never walked
        import inspect
        src = inspect.getsource(fs.extract_sources)
        check('extract_sources never walks a root without an explicit --only list',
              "if not only: only = [f.relative_to(root).as_posix() for f in source_files(root)]" in src
              and "cmd += ['--only', o]" in src, src[:80])

        # ---- source_texts drops a path that points outside this deck
        slide = {'sources': ['../../../Report/legacy.docx', 'Report/draft.docx']}
        put(fs.DECKS, a['id'], 'text', 'Report', 'draft.docx.txt', text='x')
        got = fs.source_texts(slide, a)
        check('a slide source that points outside this deck\'s corpus is dropped',
              len(got) == 1 and got[0].endswith('Report/draft.docx.txt'), got)


# ---------------------------------------------------------------- the provenance hole, proved twice
def corpus_tests(sandbox, check):
    scratch = sandbox / 'corpus'
    code, out = node([Path(__file__).parent / 't_deck_corpus.js', scratch], REPO)
    for line in out.splitlines():
        if line.startswith(('PASS ', 'FAIL ')):
            check('claims: ' + line.split(' ', 1)[1].split('   <- ')[0], line.startswith('PASS '), line)
    check('the claims-level corpus probe ran', 'all passed' in out or 'FAILED' in out, out[-300:])

    # the same thing through the real checker: deck_check reads the text folder beside the --interview file it is given.
    root = sandbox / 'dc'
    shutil.rmtree(root, ignore_errors=True)
    build = root / '.aura' / 'temp' / 'build' / 'x'
    build.mkdir(parents=True)
    (build / 'index.html').write_text(
        '<!doctype html><meta charset="utf-8"><title>t</title><main class="deck">\n'
        '<section class="slide" data-kind="content" data-title="Results"><div class="safe">'
        '<p style="font-size:34px;color:#111;background:#fff">Pressure peaks at 355 kPa in the cavity.</p></div>\n'
        '<aside class="notes" data-aura-notes><p>Peak pressure and why the third run mattered.</p></aside></section>\n</main>\n',
        encoding='utf-8')
    for did, text in (('deckA', 'The rig peaked at 355 kPa in the third run.'), ('deckB', 'A survey of lattice cooling.')):
        t = root / '.aura' / 'decks' / did / 'text' / 'Report'
        t.mkdir(parents=True)
        (t / 'r.docx.txt').write_text('# r.docx\n' + text + '\n', encoding='utf-8')
        (root / '.aura' / 'decks' / did / 'interview.json').write_text('{"identity":[]}', encoding='utf-8')
    MSG = 'number "355 kPa" is not in your files and has no provenance entry'
    run1 = lambda did: node([ENGINE / 'tools' / 'deck_check.js', '.aura/temp/build/x', '--no-shots',
                             '--interview', f'.aura/decks/{did}/interview.json'], root)
    _, outa = run1('deckA')
    _, outb = run1('deckB')
    check('deck_check: the number in deck A\'s own report is traced on deck A\'s slide',
          MSG not in outa and 'numbers on slides: 1 (1 in your files' in outa,
          [l for l in outa.splitlines() if 'number' in l][:3])
    check('deck_check: the SAME number is reported untraced on deck B\'s slide (the hole this change closes)',
          MSG in outb and 'numbers on slides: 1 (0 in your files' in outb,
          [l for l in outb.splitlines() if 'number' in l][:3])
    shutil.rmtree(root, ignore_errors=True)


# ---------------------------------------------------------------- the routes, against the live test server
def http_tests(T, check):
    check_, jget, jpost, req = T.check, T.jget, T.jpost, T.req
    from urllib.parse import quote
    import json as _json
    AURA, FILES = Path(T.SANDBOX) / '.aura', Path(T.SANDBOX) / '3 - Put your files here'
    decks = AURA / 'decks'
    decks.mkdir(parents=True, exist_ok=True)

    def record(did, title, folder):
        (decks / f'{did}.json').write_text(_json.dumps({
            'id': did, 'title': title, 'file': None, 'look': 'Bold Blue', 'quality': 'balanced',
            'createdAt': 'x', 'updatedAt': 'x', 'sessionId': None, 'brief': {}, 'build': None,
            **({'filesFolder': folder} if folder else {})}), encoding='utf-8')

    record('fdA', 'Folder A', 'Folder A')
    record('fdB', 'Folder B', 'Folder B')
    record('fdLegacy', 'Legacy', None)

    def up(folder, name, deck=None, data=b'hello'):
        q = f'/api/upload?folder={quote(folder, safe="")}&name={quote(name, safe="")}' + (f'&deck={deck}' if deck else '')
        s, h, d = req('POST', q, data, headers={'Content-Type': 'application/octet-stream'})
        return s, _json.loads(d or b'{}')

    s, j = up('Report', 'a-only.txt', 'fdA')
    check('upload ?deck= lands in that deck\'s folder',
          s == 200 and j.get('path') == 'Report/a-only.txt' and (FILES / 'Folder A' / 'Report' / 'a-only.txt').is_file(), j)
    s, j = up('Report', 'b-only.txt', 'fdB')
    check('a second deck\'s upload lands in its own folder',
          s == 200 and (FILES / 'Folder B' / 'Report' / 'b-only.txt').is_file()
          and not (FILES / 'Folder A' / 'Report' / 'b-only.txt').exists(), j)
    fa = [f for g in jget('/api/files?deck=fdA')[1] for f in g['files']]
    fb = [f for g in jget('/api/files?deck=fdB')[1] for f in g['files']]
    check('/api/files?deck= shows only that deck\'s files',
          'Report/a-only.txt' in fa and 'Report/b-only.txt' not in fa
          and 'Report/b-only.txt' in fb and 'Report/a-only.txt' not in fb, (fa, fb))
    # the shared root is where a deck made on 0.5.3-0.5.5 keeps its files: the per-deck folders sit beside the type
    # folders there, and it must not see into them.
    (FILES / 'Report').mkdir(parents=True, exist_ok=True)
    (FILES / 'Report' / 'legacy-only.pdf').write_bytes(b'%PDF-1.4 old')
    fl = [f for g in jget('/api/files?deck=fdLegacy')[1] for f in g['files']]
    check('a deck with no filesFolder still reads the shared root, and sees neither new folder',
          fl == ['Report/legacy-only.pdf'], fl)
    fd = [f for g in jget('/api/files')[1] for f in g['files']]
    check('no deck at all reads the draft folder, which is neither the shared root nor a deck',
          'Report/hello.txt' in fd and not any('only' in f for f in fd), fd)
    check('the legacy deck\'s file is invisible to both new decks',
          not any('legacy-only' in f for f in fa + fb), (fa, fb))
    check('an unknown deck id is 404, never a silent fall back to someone else\'s files',
          jget('/api/files?deck=nope')[0] == 404 and up('Report', 'x.txt', 'nope')[0] == 404
          and jpost('/api/remove', {'path': 'Report/a-only.txt', 'deck': 'nope'})[0] == 404)
    check('remove is scoped to the deck: deck B cannot remove deck A\'s file',
          jpost('/api/remove', {'path': 'Report/a-only.txt', 'deck': 'fdB'})[0] == 403
          and (FILES / 'Folder A' / 'Report' / 'a-only.txt').is_file())
    check('remove inside the right deck works',
          jpost('/api/remove', {'path': 'Report/a-only.txt', 'deck': 'fdA'})[0] == 200
          and not (FILES / 'Folder A' / 'Report' / 'a-only.txt').exists())
    for did in ('fdA', 'fdB', 'fdLegacy'):
        (decks / f'{did}.json').unlink(missing_ok=True)


if __name__ == '__main__':
    run()
