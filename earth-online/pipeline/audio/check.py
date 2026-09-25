"""Self-check plots: full-length stems + zooms on the key moments. -> build/audio/plots/*.png
  python3 check.py
"""
import json
import os
import soundfile as sf
from common import *   # noqa

tl = Timeline()
P = os.path.join(OUT, 'plots'); os.makedirs(P, exist_ok=True)
tr = {}
for k in ('music', 'sfx', 'mix'):
    p = f'{OUT}/{k}.wav'
    if os.path.exists(p): tr[k] = sf.read(p, always_2d=True)[0]
meta = json.load(open(f'{OUT}/music_meta.json')) if os.path.exists(f'{OUT}/music_meta.json') else {}
plot_tracks(list(tr.items()), tl, f'{P}/all.png', 'music / sfx / mix')
zooms = {
    's1_to_s2': (tl.s('s1_school') - 1, tl.s('s3_money') + 1),
    's3_money': (tl.s('s3_money') - 0.5, tl.s('s4_others') + 3),
    's4_open': (tl.s('s4_others') - 2, tl.ls('L13') + 1),
    's4_spark_s5': (tl.ls('L14') - 1, tl.s('s5_team') + 3),
    's5_build_cut': (tl.s('s5_team') - 1, tl.s('s6_loop') + 3),
    's6_end': (tl.s('s6_loop') - 1, tl.duration),
}
for name, (a, b) in zooms.items():
    for k in ('music', 'mix'):
        if k in tr: plot_range(tr[k], tl, a, b, f'{P}/z_{name}_{k}.png', f'{k}: {name}')
