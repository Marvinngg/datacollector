"""Self-check plots: full-length stems + one zoom per chapter. -> build/audio/plots/*.png
  python3 check.py [music|sfx|mix ...]
"""
import os
import sys
import soundfile as sf
from common import *   # noqa

tl = Timeline()
P = os.path.join(OUT, 'plots'); os.makedirs(P, exist_ok=True)
which = sys.argv[1:] or ['music', 'sfx', 'mix']
tr = {}
for k in which:
    p = f'{OUT}/{k}.wav'
    if os.path.exists(p): tr[k] = sf.read(p, always_2d=True)[0]
plot_tracks(list(tr.items()), tl, f'{P}/all_{"_".join(tr)}.png', ' / '.join(tr))
for c in tl.chapters:
    a, b = max(0, c['start'] - 3), min(tl.duration, c['end'] + 2)
    for k, x in tr.items():
        plot_range(x, tl, a, b, f'{P}/z_{c["id"]}_{k}.png', f'{k}: {c["id"]} {c["title"]}')
