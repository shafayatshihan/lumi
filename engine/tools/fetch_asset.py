"""Fetch one PolyHaven asset (an HDRI or a PBR texture set) into Lumi's local cache, at BUILD time.
  python .aura/engine/tools/fetch_asset.py hdri studio_small_09 [--res 2k]
  python .aura/engine/tools/fetch_asset.py texture metal_plate [--res 1k]
  python .aura/engine/tools/fetch_asset.py hdri studio_small_09 --cached      (never touches the network)
Prints ONE line: [lumi] asset {"ok":..., "type":..., "id":..., "files":{...}} and exits 0, also when offline.

Why this exists instead of curl. permit.js denies every network command to Claude (line 51: "Lumi keeps decks
offline"), and that rule stays. This script is the one narrow door, and it is narrow by construction:
  - it talks ONLY to the hosts in HOSTS below. The list is in this file, never an argument, so a prompt cannot point
    it anywhere else. A redirect to any other host is refused, as is plain http.
  - it takes an asset TYPE and an asset ID, both checked against strict patterns. There is no URL argument at all.
  - it only GETs. There is no code path that sends a body, so it cannot upload anything.
  - every request goes through lib/lumi_net.py, the ONE network frame it shares with Part D's research tool, which
    also appends each one to .aura/temp/net-log.txt.
  - it writes only into the cache (.aura/temp/assets/<type>/<id>/), and keeps a file only if its extension, its
    first bytes (magic) AND PolyHaven's md5 all agree that it is a .hdr / .exr / .jpg / .png. Never an archive,
    never anything executable.
Offline is normal: a cache miss with no network answers ok:false, offline:true and says the scene falls back to the
built-in materials (lumi_bpy.PRESETS). Nothing a slide shows ever depends on a fetch at run time - the asset is baked
into the render / the GLB textures, and a packed deck stays one offline HTML file (LOOK-BASE 4.5).

PolyHaven assets are CC0. The API (api.polyhaven.com/files/<id>) lists every file with its URL on dl.polyhaven.org
and its md5. Technique credit: kevinbadi/blender-skills polyhaven-* (they fetch through the blender-mcp addon, which
Lumi does not have; this is Lumi's own implementation)."""
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.parse
from pathlib import Path

sys.dont_write_bytecode = True          # keep the engine folder clean
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import lumi_net                         # noqa: E402  the ONE network policy (Part D + E): https, GET, allowlist, net-log

HOSTS = ('api.polyhaven.com', 'dl.polyhaven.org')          # the whole allowlist
API = 'https://api.polyhaven.com/files/'
ID_RE = re.compile(r'^[a-z0-9][a-z0-9_]{1,63}$')
RES = ('1k', '2k', '4k')                                   # 8k / 16k are never needed for a slide
MAX_BYTES = 64 * 1024 * 1024
TIMEOUT = 20
# texture maps a PBR material uses, PolyHaven's key -> our name. nor_gl: OpenGL normal (Blender's convention).
MAPS = {'Diffuse': 'diff', 'Rough': 'rough', 'nor_gl': 'nor', 'Metal': 'metal', 'AO': 'ao', 'Displacement': 'disp'}
MAGIC = {'.hdr': (b'#?RADIANCE', b'#?RGBE'), '.exr': (b'\x76\x2f\x31\x01',), '.jpg': (b'\xff\xd8\xff',),
         '.png': (b'\x89PNG\r\n\x1a\n',)}
FALLBACK = 'using the built-in materials (lumi_bpy.PRESETS) instead'


def cache_root():
    """.aura/temp/assets in an install (this file is .aura/engine/tools/fetch_asset.py); <repo>/.aura/temp/assets in
    the source tree. LUMI_ASSETS overrides it (tests)."""
    if os.environ.get('LUMI_ASSETS'):
        return Path(os.environ['LUMI_ASSETS'])
    up = Path(__file__).resolve().parents[2]
    return (up if up.name == '.aura' else up / '.aura') / 'temp' / 'assets'


def _get(url, limit=MAX_BYTES):
    """GET only, through lumi_net: https, HOSTS only (redirects too), size cap, logged to .aura/temp/net-log.txt."""
    return lumi_net.get(url, HOSTS, limit, 'fetch_asset', timeout=TIMEOUT)


def _keep(data, url, md5, dest):
    ext = os.path.splitext(urllib.parse.urlsplit(url).path)[1].lower()
    if ext not in MAGIC:
        raise ValueError(f'refused: {ext or "no extension"} is not an image or an HDR')
    if not data.startswith(MAGIC[ext]):
        raise ValueError(f'refused: the file does not start like a {ext} file')
    if md5 and hashlib.md5(data).hexdigest() != md5:
        raise ValueError('refused: checksum does not match PolyHaven\'s')
    dest = dest.with_suffix(ext)
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(dest.name + '.part')
    tmp.write_bytes(data)
    os.replace(tmp, dest)
    return dest


def _pick(entry, prefer):
    """entry = {fmt: {url, md5, size}} -> the first preferred format present."""
    for f in prefer:
        if isinstance(entry, dict) and f in entry and 'url' in entry[f]:
            return entry[f]
    return None


def cached(kind, asset_id, res):
    """The files already in the cache for this asset, or None."""
    d = cache_root() / kind / asset_id / res
    if kind == 'hdri':
        hit = [p for p in (d / 'hdri.hdr', d / 'hdri.exr') if p.is_file()]
        return {'hdri': str(hit[0])} if hit else None
    hit = {p.stem: str(p) for p in d.glob('*.*') if p.suffix in ('.jpg', '.png') and p.stem in MAPS.values()}
    return hit if 'diff' in hit else None


def fetch(kind, asset_id, res='2k', offline=False):
    """Returns the result dict that main() prints. Never raises for a network failure: offline is normal."""
    if kind not in ('hdri', 'texture'):
        return {'ok': False, 'msg': 'type must be hdri or texture'}
    if not ID_RE.match(asset_id or ''):
        return {'ok': False, 'msg': 'asset id must be lower-case letters, digits and _ (a PolyHaven id)'}
    if res not in RES:
        return {'ok': False, 'msg': f'resolution must be one of {", ".join(RES)}'}
    hit = cached(kind, asset_id, res)
    if hit:
        return {'ok': True, 'type': kind, 'id': asset_id, 'res': res, 'cached': True, 'files': hit}
    if offline:
        return {'ok': False, 'offline': True, 'type': kind, 'id': asset_id, 'msg': f'not in the cache; {FALLBACK}'}
    d = cache_root() / kind / asset_id / res
    try:
        listing = json.loads(_get(API + asset_id, limit=4 * 1048576).decode('utf-8'))
        files = {}
        if kind == 'hdri':
            e = _pick((listing.get('hdri') or {}).get(res), ('hdr', 'exr'))
            if not e:
                return {'ok': False, 'type': kind, 'id': asset_id, 'msg': f'{asset_id} is not a PolyHaven HDRI at {res}'}
            files['hdri'] = str(_keep(_get(e['url']), e['url'], e.get('md5'), d / 'hdri'))
        else:
            for key, name in MAPS.items():
                e = _pick((listing.get(key) or {}).get(res), ('jpg', 'png'))
                if e:
                    files[name] = str(_keep(_get(e['url']), e['url'], e.get('md5'), d / name))
            if 'diff' not in files:
                return {'ok': False, 'type': kind, 'id': asset_id, 'msg': f'{asset_id} is not a PolyHaven texture at {res}'}
        return {'ok': True, 'type': kind, 'id': asset_id, 'res': res, 'cached': False, 'files': files}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {'ok': False, 'type': kind, 'id': asset_id, 'msg': f'PolyHaven has no asset "{asset_id}"'}
        return {'ok': False, 'offline': True, 'type': kind, 'id': asset_id, 'msg': f'PolyHaven answered {e.code}; {FALLBACK}'}
    except lumi_net.Offline:
        return {'ok': False, 'offline': True, 'type': kind, 'id': asset_id, 'msg': f'no network; {FALLBACK}'}
    except (lumi_net.Refused, ValueError, OSError) as e:
        return {'ok': False, 'type': kind, 'id': asset_id, 'msg': f'refused: {e}'}


def main(argv):
    args = [a for a in argv if not a.startswith('--')]
    flags = [a for a in argv if a.startswith('--')]
    res = '1k' if args[:1] == ['texture'] else '2k'
    for i, a in enumerate(argv):
        if a == '--res' and i + 1 < len(argv):
            res = argv[i + 1]
            args = [x for x in args if x != res]
    if len(args) != 2 or any(f not in ('--res', '--cached') for f in flags):
        print(__doc__)
        return 2
    out = fetch(args[0], args[1], res, offline='--cached' in flags)
    print('[lumi] asset ' + json.dumps(out, separators=(',', ':')), flush=True)
    return 0


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
    sys.exit(main(sys.argv[1:]))
