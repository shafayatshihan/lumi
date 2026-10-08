"""ONE network policy for Lumi's toolkit (Part D's research.py; Part E's fetch_asset.py can use the same). Claude has no network
of its own inside Lumi: permit.js denies every network command and Claude Code's WebFetch / WebSearch are denied in the
workspace settings. The toolkit scripts are the narrow doors and this module is their frame:
  - https only, GET only: there is no request body anywhere in here, so nothing can be uploaded;
  - the CALLER passes a host allowlist that is hardcoded in its own file, never taken from an argument;
  - a redirect off that list is refused, not followed;
  - a timeout and a size cap on every answer;
  - every request that leaves the machine is appended, whole, to .aura/temp/net-log.txt (what was sent, to whom, when).
Offline is a normal state: get() raises Offline, and the caller says so in one line and carries on."""
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

UA = 'Lumi (slide builder for students; https://github.com/shafayatshihan/lumi)'
TIMEOUT = 15


class Offline(Exception):
    """No network, a timeout, or the host is down: build from the person's files alone."""


class Refused(Exception):
    """The request broke the policy (host, scheme, size). A bug or an injected prompt, never retried."""


def aura_root():
    """.aura in an install (this file is .aura/engine/tools/lib/lumi_net.py); <repo>/.aura in the source tree."""
    up = Path(__file__).resolve().parents[3]
    return up if up.name == '.aura' else up / '.aura'


def check_url(url, hosts):
    u = urllib.parse.urlsplit(url)
    if u.scheme != 'https' or u.hostname not in hosts or u.username or u.password or u.port not in (None, 443):
        raise Refused(f'not allowed: {u.scheme}://{u.hostname} (allowed: {", ".join(hosts)}, https only)')


def log_sent(tool, url):
    try:
        f = aura_root() / 'temp' / 'net-log.txt'
        f.parent.mkdir(parents=True, exist_ok=True)
        with f.open('a', encoding='utf-8') as fh:
            fh.write(f'{time.strftime("%Y-%m-%d %H:%M:%S")}\t{tool}\tGET {url}\n')
    except OSError:
        pass


def get(url, hosts, max_bytes, tool, timeout=TIMEOUT):
    """GET one https URL on an allowed host. Returns the body (bytes). Raises Offline or Refused, or HTTPError for a 4xx/5xx."""
    check_url(url, hosts)

    class OnlyAllowed(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            check_url(newurl, hosts)
            return super().redirect_request(req, fp, code, msg, headers, newurl)

    opener = urllib.request.build_opener(OnlyAllowed)
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'identity'}, method='GET')
    log_sent(tool, url)
    try:
        with opener.open(req, timeout=timeout) as r:
            data = r.read(max_bytes + 1)
    except urllib.error.HTTPError:
        raise
    except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError, OSError) as e:
        if isinstance(getattr(e, 'reason', None), Refused):
            raise e.reason
        raise Offline(str(getattr(e, 'reason', e))[:120])
    if len(data) > max_bytes:
        raise Refused(f'answer larger than {max_bytes // 1024} KB')
    return data
