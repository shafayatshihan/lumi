"""Lumi's render-time calibration scene (run by the server, never by Claude): a small lathe part in the full Bold Blue
studio, so the measured seconds per frame include what every real scene pays (lights, shadow catcher, composite).
The server renders it three times and fits  seconds = c + a * MP + k * MP * samples  (form_server.BlenderRenderer._bench)."""
import os, sys


def _lumi_dir():
    if os.environ.get('LUMI_BPY') and os.path.isfile(os.path.join(os.environ['LUMI_BPY'], 'lumi_bpy.py')):
        return os.environ['LUMI_BPY']
    return os.path.dirname(os.path.abspath(__file__))


sys.path.insert(0, _lumi_dir())
import lumi_bpy as L

a = L.args(); L.reset(a); L.gpu(a); L.cycles(a.samples)
body = L.lathe([(0.0, -0.6), (0.45, -0.6), (0.45, 0.2), (0.3, 0.45), (0.0, 0.5)], name='bench', material=L.mat('aluminium'))
ring = L.lathe([(0.46, -0.3), (0.55, -0.3), (0.55, -0.1), (0.46, -0.1)], name='ring', material=L.mat('paint', L.C['blue']))
parts = [body, ring]
for o in parts:
    o.location = (0, 0, 0.6)
L.studio(fit=parts)
L.camera(parts, view='three-quarter', fill=0.6, frame_right=True)
L.render(a.out)
