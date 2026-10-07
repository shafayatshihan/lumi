"""The Lumi marker grammar, server side. Every [[aura:...]] line Claude writes is read here.

The grammar itself is engine/rules/markers.json (one definition for every marker). The browser parser,
engine/form/js/markers.js, implements the same rules; tools/form-dev/test_instructions.py runs both against
tools/form-dev/marker_cases.json so they cannot drift apart.

scan(text) -> {'markers': [...], 'problems': [...]}
  markers   one entry per well-formed marker line: {'name', 'attrs', 'line'} (+ 'choice', the normalised question, for
            a choice marker; + 'text', the normalised question, for a text marker)
  problems  one entry per line that mentions [[aura: but could not be used: {'line', 'reason', 'marker', 'text'}.
            reasons: not-alone, unclosed, unknown, bad-attrs, missing-<attr>, bad-value, few-options, bad-id
Nothing is dropped silently: a caller that ignores `problems` is making that choice on purpose.
"""
import json, re
from pathlib import Path

SPEC = json.loads((Path(__file__).resolve().parent / 'rules' / 'markers.json').read_text(encoding='utf-8'))
LIMITS = SPEC['limits']
STAGES = tuple(SPEC['stages'])
MARKERS = SPEC['markers']

_BODY = r'((?:"[^"]*"|[^\]"])*)'
LINE_RE = re.compile(r'^\s*\[\[aura:([a-z][a-z-]*)' + _BODY + r'\]\]\s*$')
INLINE_RE = re.compile(r'\[\[aura:[a-z][a-z-]*' + _BODY + r'\]\]')
ATTR_RE = re.compile(r'([a-z]+)\s*=\s*(?:"([^"]*)"|([A-Za-z0-9._-]+))')
ID_RE = re.compile(r'^[A-Za-z0-9-]+$')

REASON_TEXT = {
    'not-alone': 'was written inside a sentence instead of on its own line',
    'unclosed': 'was cut off before its closing ]]',
    'unknown': 'is not a marker Lumi knows',
    'bad-attrs': 'has text Lumi could not read',
    'bad-value': 'has a value Lumi does not accept',
    'few-options': 'has fewer than two options',
    'bad-id': 'has an id with unusual characters',
}
WHAT = {'choice': 'a question', 'text': 'a question in your own words', 'hint': 'a suggestion', 'stage': 'a progress note',
        'ask': 'a "waiting for you" signal', 'done': 'the "finished" signal', 'plan': 'the plan signal',
        'plan-ok': 'a plan check', 'built': 'the "slide built" signal',
        'interview-done': 'the "interview finished" signal'}


def _split(v, sep='|'):
    return [x.strip() for x in str(v or '').split(sep) if x.strip()]


def normalise_choice(a):
    """A choice marker's attributes -> the one normal form (limits from markers.json)."""
    L = LIMITS
    options = [o[:L['optionChars']] for o in _split(a.get('options'))][:L['options']]
    multi = str(a.get('multi') or '').strip().lower() == 'yes'
    defs = [d[:L['optionChars']] for d in _split(a.get('default'))]
    defs = [d for d in defs if d in options]
    default = (defs if multi else defs[:1]) or options[:1]
    return {'id': str(a.get('id') or '').strip(), 'question': str(a.get('question') or '').strip()[:L['questionChars']],
            'options': options, 'multi': multi, 'default': default,
            'slide': str(a.get('slide') or '').strip(), 'scope': str(a.get('scope') or '').strip().lower(),
            'when': str(a.get('when') or '').strip()[:L['whenChars']],
            'depends': [d for d in re.split(r'[\s,]+', str(a.get('depends') or '')) if ID_RE.match(d)]}


def normalise_text(a):
    """A text marker's attributes -> the one normal form. A text marker is a sibling of choice, NOT a choice with zero
    options: options stays required for choice, the few-options guard stays, and when="q1=2" keeps its meaning.
    LIMIT (documented in markers.js and SKILL.md): `when` / `depends` may only name a CHOICE question. The browser sees a
    text answer as nothing selected, so a condition on a text question can never hold."""
    L = LIMITS
    raw = str(a.get('lines') or '').strip()
    return {'id': str(a.get('id') or '').strip(), 'question': str(a.get('question') or '').strip()[:L['questionChars']],
            'placeholder': str(a.get('placeholder') or '').strip()[:L['placeholderChars']],
            'lines': int(raw) if raw.isdigit() else 3,
            'slide': str(a.get('slide') or '').strip(), 'scope': str(a.get('scope') or '').strip().lower(),
            'when': str(a.get('when') or '').strip()[:L['whenChars']],
            'depends': [d for d in re.split(r'[\s,]+', str(a.get('depends') or '')) if ID_RE.match(d)]}


def _attrs(body):
    attrs = {}
    for m in ATTR_RE.finditer(body):
        attrs[m.group(1)] = m.group(2) if m.group(2) is not None else m.group(3)
    return attrs, ATTR_RE.sub('', body).strip()


def _build(name, body):
    """(marker, None) or (None, problem reason) for one whole-line marker."""
    spec = MARKERS.get(name)
    if not spec:
        return None, 'unknown'
    if spec.get('form') == 'value':
        m = re.match(r'^=\s*([A-Za-z0-9._-]+)\s*$', body)
        if not m:
            return None, 'bad-attrs'
        if m.group(1) not in STAGES:
            return None, 'bad-value'
        return {'name': name, 'attrs': {'value': m.group(1)}}, None
    attrs, rest = _attrs(body)
    if rest:
        return None, 'bad-attrs'
    for k in spec.get('required', []):
        if not str(attrs.get(k, '')).strip():
            return None, 'missing-' + k
    out = {'name': name, 'attrs': attrs}
    if name == 'hint' and not (re.fullmatch(r'\d+', attrs['slide']) and int(attrs['slide']) > 0):
        return None, 'bad-value'
    if name == 'choice':
        if not ID_RE.match(attrs['id'].strip()):
            return None, 'bad-id'
        c = normalise_choice(attrs)
        if len(c['options']) < 2:
            return None, 'few-options'
        out['choice'] = c
    if name == 'text':
        if not ID_RE.match(attrs['id'].strip()):
            return None, 'bad-id'
        if 'lines' in attrs and not (str(attrs['lines']).strip().isdigit() and 1 <= int(attrs['lines']) <= LIMITS['maxLines']):
            return None, 'bad-value'
        out['text'] = normalise_text(attrs)
    return out, None


def scan(text):
    markers, problems, seen = [], [], set()
    for i, raw in enumerate(re.split(r'\r?\n', str(text or ''))):
        if '[[aura:' not in raw:
            continue
        m = LINE_RE.match(raw)
        if m:
            mk, why = _build(m.group(1), m.group(2))
            if mk:
                mk['line'] = i + 1
                markers.append(mk)
                continue
            name = m.group(1)
        else:
            why = 'not-alone' if INLINE_RE.search(raw) else 'unclosed'
            nm = re.search(r'\[\[aura:([a-z][a-z-]*)', raw)
            name = nm.group(1) if nm else None
        t = raw.strip()[:160]
        if (why, t) in seen:        # the same line often arrives twice (the message and the final result)
            continue
        seen.add((why, t))
        problems.append({'line': i + 1, 'reason': why, 'marker': name, 'text': t})
    return {'markers': markers, 'problems': problems}


def find(text, name):
    return [m for m in scan(text)['markers'] if m['name'] == name]


def has(text, name):
    return bool(find(text, name))


def describe(problem):
    """One plain sentence for the person (no code): which kind of line failed and why."""
    why = problem['reason']
    what = WHAT.get(problem.get('marker'), 'one of its buttons')
    reason = 'is missing its ' + why[8:] if why.startswith('missing-') else REASON_TEXT.get(why, 'could not be read')
    return f'claude wrote {what} that {reason}, so lumi could not use it.'


# Post-mortem problem 3: all three dropped hints in deck b45622aef312 were `[[aura:hint text="..."]]` with no `slide=`,
# and the only feedback was describe() - written for the person, and read after the run had already ended. The event now
# also carries the shape Claude should have written, so the next turn can put the line back.
EXAMPLE = {'slide': '3', 'text': 'Make the icons loop gently', 'question': 'Which camera angle?', 'id': 'q1',
           'options': 'wide|close', 'path': '.aura/decks/<id>/<deck>.html', 'stage': 'building', 'name': 'building'}


def correct_form(name):
    """The literal line a marker should be, from markers.json - e.g. `[[aura:hint slide="3" text="..."]]`."""
    spec = MARKERS.get(name)
    if spec is None: return ''
    attrs = ' '.join(f'{a}="{EXAMPLE.get(a, "...")}"' for a in (spec.get('required') or []))
    return f'[[aura:{name}{" " + attrs if attrs else ""}]]'


def repair(problem):
    """One line of feedback FOR CLAUDE: what was wrong with the marker line, and the exact shape to write instead."""
    name = problem.get('marker') or ''
    form = correct_form(name)
    if not form: return ''
    why = problem['reason']
    miss = f'it is missing `{why[8:]}`' if why.startswith('missing-') else (REASON_TEXT.get(why) or 'it could not be read')
    req = ', '.join(MARKERS.get(name, {}).get('required') or []) or 'no attributes'
    return (f'Your `[[aura:{name} ...]]` line was dropped: {miss}. Its required attributes are {req}. '
            f'Write it exactly as `{form}`, on a line of its own.')
