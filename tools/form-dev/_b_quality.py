"""Dump form_server.quality_options() to _b_quality.json, so _b_screens.html can draw the real quality control
without the form server running.  usage: python tools/form-dev/_b_quality.py"""
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / 'engine'))
import form_server as fs                                           # noqa: E402

out = REPO / 'tools' / 'form-dev' / '_b_quality.json'
out.write_text(json.dumps(fs.quality_options(), indent=1), encoding='utf-8')
print('wrote', out, '-', len(fs.quality_options()['tiers']), 'tiers, default', fs.DEFAULT_QUALITY)
