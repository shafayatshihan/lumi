"""Lumi's Blender probe: which Blender this is and which render device Cycles would use. Run by Lumi's server only:
    blender -b --factory-startup -P probe_gpu.py
Prints one line:  [lumi] probe {"version": "5.2.2 LTS", "best": "OPTIX", "devices": [{"type": "OPTIX", "name": "..."}]}
The result is cached in .aura/temp/blender-probe.json (form_server.blender_probe), so this runs once per Blender."""
import json
import bpy

out = {'version': bpy.app.version_string, 'best': 'CPU', 'devices': []}
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for kind in ('OPTIX', 'CUDA', 'HIP', 'METAL', 'ONEAPI'):
        try:
            prefs.compute_device_type = kind
        except TypeError:
            continue
        prefs.refresh_devices()
        found = [d for d in prefs.devices if d.type == kind]
        out['devices'] += [{'type': kind, 'name': d.name} for d in found]
        if found and out['best'] == 'CPU':
            out['best'] = kind
except Exception as e:                      # no Cycles add-on: still report the version
    out['error'] = repr(e)[:200]
print('[lumi] probe ' + json.dumps(out), flush=True)
