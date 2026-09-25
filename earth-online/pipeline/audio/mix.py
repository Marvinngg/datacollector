"""Final mix for 《地球 Online》 -> build/audio/mix.wav (48 kHz stereo, 24-bit).

voice (build/vo/Lxx.wav placed at timeline starts, resampled to 48 k) + music.wav (side-chain ducked under
the voice) + sfx.wav. Integrated loudness -16 LUFS, true peak <= -1 dBTP, length = timeline.duration.

  python3 mix.py [--plot]
"""
import json
import os
import sys
from fractions import Fraction
import numpy as np
import soundfile as sf
from scipy import signal
from common import *   # noqa

TARGET_LUFS = -16.0
TP_CEIL = -1.0
VO_LUFS = -19.0          # voice stem level before master normalisation
MUSIC_REL = -3.5         # music stem integrated loudness relative to the voice (before ducking)
DUCK_DB = -9.0
SFX_GAIN_DB = 0.0

tl = Timeline()
D = tl.duration
N = n_of(D)


def load48(path):
    x, sr = sf.read(path, always_2d=True)
    if sr != SR:
        fr = Fraction(SR, sr).limit_denominator(1000)
        x = signal.resample_poly(x, fr.numerator, fr.denominator, axis=0)
    return x


def fit(x, n):
    x = to_stereo(x)
    return np.pad(x, ((0, max(0, n - len(x))), (0, 0)))[:n]


# ----------------------------------------------------------------------------- voice
vo = np.zeros(N + SR)
for ln in tl.d['lines']:
    p = os.path.join(BUILD, 'vo', ln['id'] + '.wav')
    x = load48(p).mean(1)
    x = fade(x, 0.004, 0.02)                          # no clicks at the edges of each take
    i = n_of(ln['start'])
    vo[i:i + len(x)] += x[:len(vo) - i]
vo = vo[:N]
# EQ: 80 Hz high-pass (24 dB/oct), slight low-mid clean-up, gentle presence lift
vo = filt(vo, 'hp', 80, q=0.707, order=2)
vo = filt(vo, 'peak', 280, q=1.0, gain_db=-1.5)
vo = filt(vo, 'peak', 3200, q=0.9, gain_db=2.5)
vo = filt(vo, 'hs', 9000, q=0.7, gain_db=-1.0)
from pedalboard import Pedalboard, Compressor
vo = Pedalboard([Compressor(threshold_db=-24, ratio=2.2, attack_ms=6, release_ms=90)])(vo[None].astype(np.float32), SR)[0].astype(np.float64)
vo *= 10 ** ((VO_LUFS - lufs(vo)) / 20)
vo = to_stereo(vo)                                    # dead centre

# ----------------------------------------------------------------------------- music + ducking
music = fit(load48(f'{OUT}/music.wav'), N)
meta_p = f'{OUT}/music_meta.json'
meta = json.load(open(meta_p)) if os.path.exists(meta_p) else {}
no_duck = meta.get('no_duck', [])
music *= 10 ** ((VO_LUFS + MUSIC_REL - lufs(music)) / 20)

ATT, REL, PRE, POST, MERGE = 0.28, 0.65, 0.06, 0.12, 0.9
iv = []
for ln in tl.d['lines']:
    a, b = ln['start'], ln['start'] + ln['dur']
    if any(lo <= a <= hi for lo, hi in no_duck): continue    # score is silent on purpose here
    a, b = a - PRE, b + POST
    if iv and a - iv[-1][1] < MERGE: iv[-1][1] = b          # short gaps stay ducked (no pumping)
    else: iv.append([a, b])
pts = [(0.0, 1.0)]
g = 10 ** (DUCK_DB / 20)
for a, b in iv:
    pts += [(max(0, a - ATT), 1.0), (a, g), (b, g), (b + REL, 1.0)]
duck = env_points(N, pts)
# extra-smooth: 30 ms moving average removes any corner of the segment envelope
k = n_of(0.03); duck = np.convolve(np.pad(duck, (k, k), mode='edge'), np.ones(k) / k, mode='same')[k:-k]
music_d = music * duck[:, None]

# ----------------------------------------------------------------------------- sfx
sfx = fit(load48(f'{OUT}/sfx.wav'), N) * 10 ** (SFX_GAIN_DB / 20)

# ----------------------------------------------------------------------------- master
mix = vo + music_d + sfx
mix = filt(mix, 'hp', 25, order=1)
for it in range(3):                                   # normalise -> limit -> re-measure
    mix *= 10 ** ((TARGET_LUFS - lufs(mix)) / 20)
    mix = limiter(mix, TP_CEIL - 0.3, lookahead=0.004, release=0.10)
L = lufs(mix)
tp = true_peak_db(mix)
if tp > TP_CEIL:                                      # safety (should not trigger)
    mix *= 10 ** ((TP_CEIL - 0.05 - tp) / 20); tp = true_peak_db(mix); L = lufs(mix)
mix = fade(mix, 0.005, 0.05)
os.makedirs(OUT, exist_ok=True)
sf.write(f'{OUT}/mix.wav', mix.astype(np.float32), SR, subtype='PCM_24')

# ----------------------------------------------------------------------------- report
import pyloudnorm as pyln
meter = pyln.Meter(SR)
print(f'mix.wav  {len(mix) / SR:.3f}s (timeline {D:.3f}s)  integrated {L:.2f} LUFS  true peak {tp:.2f} dBTP  '
      f'sample peak {db(np.abs(mix).max()):.2f} dBFS')
try:
    lra = meter.loudness_range(mix) if hasattr(meter, 'loudness_range') else None
    if lra is not None: print(f'  LRA {lra:.1f} LU')
except Exception:
    pass
gain_total = mix.std() / max((vo + music_d + sfx).std(), 1e-12)
print(f'  voice stem {lufs(vo):.1f} LUFS, music stem {lufs(music):.1f} LUFS (pre-duck), sfx stem {lufs(sfx):.1f} LUFS  (pre-master)')
for s in tl.d['scenes']:
    a, b = n_of(s['start']), n_of(s['end'])
    print(f"  {s['id']:10s} mix {lufs(mix[a:b]):6.1f} LUFS")
# duck depth actually applied under each line
for ln in tl.d['lines']:
    a, b = n_of(ln['start']), n_of(ln['start'] + ln['dur'])
    print(f"  {ln['id']} duck {db(duck[a:b].mean()):5.1f} dB", end='' if int(ln['id'][1:]) % 6 else '\n')
print()
# click check: isolated high-frequency bursts (a click is broadband energy with no HF around it)
def clicks(x, name):
    m = filt(x.mean(1), 'hp', 12000, order=3)
    hop = 240; fr = len(m) // hop
    e = 10 * np.log10((m[:fr * hop].reshape(fr, hop) ** 2).mean(1) + 1e-14)
    from scipy.ndimage import median_filter
    base = median_filter(e, size=81)
    bad = np.where((e - base > 25) & (e > -75))[0]
    print(f'  click scan {name}: {len(bad)} isolated HF bursts', [round(b_ * hop / SR, 2) for b_ in bad[:12]])
clicks(mix, 'mix'); clicks(music, 'music'); clicks(sfx * 10, 'sfx(+20dB)')
if '--plot' in sys.argv:
    gm_ = 10 ** ((TARGET_LUFS - L) / 20)
    plot_tracks([('voice', vo), ('music(ducked)', music_d), ('sfx', sfx), ('mix', mix)], tl, f'{OUT}/plot_mix.png', 'stems (pre-master) + final mix')
