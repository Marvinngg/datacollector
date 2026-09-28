"""Self-check plots -> build/audio/plots/*.png
  all_<tracks>.png   full-length envelope + spectrogram per track, chapter lines (green), beats (dotted),
                     remember cards (gold), voice lines (cyan)
  z_<chapter>.png    per chapter: voice / ducked music / sfx envelopes on one axis (music must sit well under the
                     voice wherever it speaks) + the mix spectrogram, chord names from music_meta.json
  python3 check.py [music sfx mix]
"""
import json
import os
import sys
import warnings
import soundfile as sf
from common import *   # noqa
warnings.filterwarnings('ignore')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

tl = Timeline()
P = os.path.join(OUT, 'plots'); os.makedirs(P, exist_ok=True)
which = sys.argv[1:] or ['music', 'sfx', 'mix']
meta = json.load(open(f'{OUT}/music_meta.json')) if os.path.exists(f'{OUT}/music_meta.json') else {}


def rd(p, a=None, b=None):
    if not os.path.exists(p): return None
    return sf.read(p, always_2d=True, start=None if a is None else n_of(a), stop=None if b is None else n_of(b))[0]


tr = {k: rd(f'{OUT}/{k}.wav') for k in which}
tr = {k: v for k, v in tr.items() if v is not None}
plot_tracks(list(tr.items()), tl, f'{P}/all_{"_".join(tr)}.png', ' / '.join(tr))
del tr


def env(x, hop=480):
    m = to_stereo(x).mean(1); fr = len(m) // hop
    return 20 * np.log10(np.sqrt((m[:fr * hop].reshape(fr, hop) ** 2).mean(1)) + 1e-9), fr


for c in tl.chapters:
    a, b = max(0, c['start'] - 3), min(tl.duration, c['end'] + 2)
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(20, 8), sharex=True, gridspec_kw={'height_ratios': [1.3, 1]})
    for k, col in (('voice', 'k'), ('music_ducked', 'C3'), ('sfx', 'C2')):
        x = rd(f'{OUT}/stems/{k}.wav', a, b) if k != 'sfx' else rd(f'{OUT}/sfx.wav', a, b)
        if x is None: continue
        e, fr = env(x)
        ax1.plot(a + np.arange(fr) * 480 / SR, e, lw=0.8, color=col, label=k)
    ax1.set_ylim(-90, -5); ax1.grid(alpha=0.3); ax1.legend(loc='upper right')
    for ch in meta.get('chords', []):
        if a <= ch['t0'] <= b:
            ax1.axvline(ch['t0'], color='C3', lw=0.4, alpha=0.5)
            ax1.text(ch['t0'] + 0.1, -10, ch['name'] + ('*' if ch['kind'] in ('cad', 'final') else ''), fontsize=8, color='C3')
    m = rd(f'{OUT}/mix.wav', a, b)
    if m is not None:
        t, f, S = coarse_spec(to_stereo(m).mean(1), nperseg=2048, max_cols=1400)
        ax2.pcolormesh(t + a, f, S, shading='auto', vmin=-130, vmax=-40, cmap='magma')
        ax2.set_yscale('symlog', linthresh=200); ax2.set_ylim(30, 16000)
    for ax in (ax1, ax2):
        for bt in tl.beats:
            if a <= bt['start'] <= b: ax.axvline(bt['start'], color='lime', lw=0.8, ls=':')
            if tl.btype(bt) == 'remember' and bt['start'] < b and bt['end'] > a:
                ax.axvspan(bt['start'], bt['end'], color='gold', alpha=0.12)
        if c.get('card'): ax.axvspan(c['card'][0], c['card'][1], color='lime', alpha=0.10)
        for l in tl.lines:
            if l['start'] < b and l['start'] + l['dur'] > a:
                ax.axvspan(l['start'], l['start'] + l['dur'], color='cyan', alpha=0.08)
    ax1.set_title(f"{c['id']}  voice / music (ducked) / sfx  (dB RMS, 10 ms)")
    ax2.set_xlim(a, b)
    plt.tight_layout(); fig.savefig(f'{P}/z_{c["id"]}.png', dpi=60); plt.close(fig)
    print('plot', f'{P}/z_{c["id"]}.png')
