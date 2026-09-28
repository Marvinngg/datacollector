"""Final mix for 《博弈论：看局、解局、改局》 -> build/audio/mix.wav (48 kHz stereo, 24-bit).
Two modes, chosen by timeline.json "mode": narrated (v1, below) or "silent" (v2: no build/vo, no ducking,
music + sfx are the programme).

voice (build/vo/<line id>.wav placed at timeline line starts, resampled to 48 k, dead centre)
+ music.wav (keyed ducking from the timeline's voice lines: about -11 dB plus a gentle presence dip while anyone
speaks, smooth ramps, short gaps stay ducked so nothing pumps) + sfx.wav.
Master: integrated -16 LUFS, true peak <= -1 dBTP, length = timeline.duration.

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
MUSIC_REL = -6.5         # music stem (un-ducked) integrated loudness relative to the voice
DUCK_DB = -11.0          # music gain while the voice speaks
DIP_DB = -2.0            # extra presence dip (1.5-4 kHz) on the music while ducked, per pass of a zero-phase filter
SFX_GAIN_DB = 0.0
SILENT_MUSIC_LUFS = -19.0  # silent mode: the music stem takes the voice's place (sfx keep their calibration)
ATT, REL, PRE, POST, MERGE = 0.35, 0.9, 0.08, 0.15, 1.6

tl = Timeline()
D = tl.duration
N = n_of(D)


def load48(path, sr_hint=None):
    x, sr = sf.read(path, always_2d=True)
    if sr != SR:
        fr = Fraction(SR, sr).limit_denominator(1000)
        x = signal.resample_poly(x, fr.numerator, fr.denominator, axis=0)
    return x


def fit(x, n):
    x = to_stereo(x)
    return np.pad(x, ((0, max(0, n - len(x))), (0, 0)))[:n]


SILENT = tl.silent        # v2 timeline: screen text, no narration -> no voice stem, no ducking; music leads
if SILENT:
    vo = np.zeros((N, 2))
    music = fit(load48(f'{OUT}/music.wav'), N)
    meta_p = f'{OUT}/music_meta.json'
    meta = json.load(open(meta_p)) if os.path.exists(meta_p) else {}
    music *= 10 ** ((SILENT_MUSIC_LUFS - lufs(music)) / 20)
    duck = np.ones(N)
    music_d = music
else:
    # ----------------------------------------------------------------------------- voice
    vo = np.zeros(N + SR)
    missing = []
    for ln in tl.lines:
        p = os.path.join(BUILD, 'vo', ln['id'] + '.wav')
        try:
            x = load48(p).mean(1)
        except Exception as ex:                           # missing / half-written take: leave a hole, say so
            missing.append(ln['id']); continue
        x = fade(x, 0.004, 0.02)                          # no clicks at the edges of each take
        i = n_of(ln['start'])
        vo[i:i + len(x)] += x[:len(vo) - i]
    if missing: print('!! missing voice takes:', missing)
    vo = vo[:N]
    vo = filt(vo, 'hp', 80, q=0.707, order=2)
    vo = filt(vo, 'peak', 280, q=1.0, gain_db=-1.5)
    vo = filt(vo, 'peak', 3200, q=0.9, gain_db=2.0)
    vo = filt(vo, 'hs', 9500, q=0.7, gain_db=-1.0)
    from pedalboard import Pedalboard, Compressor
    vo = Pedalboard([Compressor(threshold_db=-24, ratio=2.2, attack_ms=6, release_ms=90)])(vo[None].astype(np.float32), SR)[0].astype(np.float64)
    vo *= 10 ** ((VO_LUFS - lufs(vo)) / 20)
    vo = to_stereo(vo)

    # ----------------------------------------------------------------------------- music + ducking
    music = fit(load48(f'{OUT}/music.wav'), N)
    meta_p = f'{OUT}/music_meta.json'
    meta = json.load(open(meta_p)) if os.path.exists(meta_p) else {}
    no_duck = meta.get('no_duck', [])
    music *= 10 ** ((VO_LUFS + MUSIC_REL - lufs(music)) / 20)

    iv = []
    for ln in tl.lines:
        a, b = ln['start'], ln['start'] + ln['dur']
        if any(lo <= a <= hi for lo, hi in no_duck): continue
        a, b = a - PRE, b + POST
        if iv and a - iv[-1][1] < MERGE: iv[-1][1] = b          # short gaps stay ducked (no pumping)
        else: iv.append([a, b])
    g = 10 ** (DUCK_DB / 20)
    pts = [(0.0, 1.0)]
    for a, b in iv:
        pts += [(max(0, a - ATT), 1.0), (max(0, a), g), (b, g), (b + REL, 1.0)]
    pts.sort()
    duck = env_points(N, pts)
    if iv and iv[0][0] < 1.0: duck[:n_of(max(0, iv[0][0]))] = g        # voice right at the top: start ducked
    k = n_of(0.05); duck = np.convolve(np.pad(duck, (k, k), mode='edge'), np.ones(k) / k, mode='same')[k:-k]
    w = np.clip((1 - duck) / (1 - g), 0, 1)                 # 0 = open, 1 = fully ducked
    b_, a_ = biquad('peak', 2600, 0.7, DIP_DB)
    m_dip = signal.filtfilt(b_, a_, music, axis=0)           # zero phase -> crossfade stays coherent
    music_d = (music * (1 - w)[:, None] + m_dip * w[:, None]) * duck[:, None]
    del m_dip


# ----------------------------------------------------------------------------- sfx
sfx = fit(load48(f'{OUT}/sfx.wav'), N) * 10 ** (SFX_GAIN_DB / 20) if os.path.exists(f'{OUT}/sfx.wav') else np.zeros((N, 2))

# ----------------------------------------------------------------------------- master
raw = filt(vo + music_d + sfx, 'hp', 25, order=1)
gdb = TARGET_LUFS - lufs(raw)
for it in range(5):                                   # gain -> limit -> re-measure (always from the raw sum)
    pre_lim = raw * 10 ** (gdb / 20)
    mix = limiter(pre_lim, TP_CEIL - 0.4, lookahead=0.004, release=0.10)
    err = TARGET_LUFS - lufs(mix)
    if abs(err) < 0.05: break
    gdb += err
act = np.abs(pre_lim).max(1) > 1e-3
gr_db = 20 * np.log10(np.clip(np.abs(mix).max(1)[act] / np.abs(pre_lim).max(1)[act], 1e-6, 1))
tp = true_peak_db(mix)
if tp > TP_CEIL:                                      # safety (should not trigger)
    mix *= 10 ** ((TP_CEIL - 0.05 - tp) / 20); tp = true_peak_db(mix)
mix = fade(mix, 0.005, 0.05)
L = lufs(mix)
os.makedirs(OUT, exist_ok=True)
sf.write(f'{OUT}/mix.wav', mix.astype(np.float32), SR, subtype='PCM_24')

# ----------------------------------------------------------------------------- report
G = 10 ** (gdb / 20)
print(f'mix.wav  {len(mix) / SR:.3f}s (timeline {D:.3f}s)  integrated {L:.2f} LUFS  true peak {tp:.2f} dBTP  '
      f'sample peak {db(np.abs(mix).max()):.2f} dBFS  master gain {gdb:+.1f} dB')
print(f'  limiter: max gain reduction {-gr_db.min():.1f} dB, >1 dB on {(gr_db < -1).mean() * 100:.2f}% of samples')
if SILENT:
    print(f'  silent mode (no narration): music {lufs(music):.1f} LUFS, sfx {lufs(sfx) if np.abs(sfx).max() > 0 else -99:.1f} LUFS pre-master')
else:
    print(f'  stems pre-master: voice {lufs(vo):.1f} LUFS, music {lufs(music):.1f} LUFS un-ducked / {lufs(music_d):.1f} ducked, '
          f'sfx {lufs(sfx) if np.abs(sfx).max() > 0 else -99:.1f} LUFS')
    msk = np.zeros(N, bool)
    for l in tl.lines: msk[n_of(l['start']):n_of(l['start'] + l['dur'])] = True
    def lu_masked(x, m):
        xs = x[m]
        return lufs(xs) if len(xs) > SR else float('nan')
    v_in, m_in, m_out = lu_masked(vo, msk), lu_masked(music_d, msk), lu_masked(music_d, ~msk)
    print(f'  under the voice: voice {v_in:.1f} LUFS, music {m_in:.1f} LUFS  -> voice leads by {v_in - m_in:.1f} LU')
    print(f'  voice-free stretches: music {m_out:.1f} LUFS ({m_out - m_in:+.1f} LU vs under-voice)')
    print(f'  applied duck under lines: median {db(np.median(duck[msk])):.1f} dB, worst {db(duck[msk].max()):.1f} dB')
print('  per chapter (mix LUFS / music-only LUFS pre-master):')
for c in tl.chapters:
    a, b = n_of(c['start']), n_of(c['end'])
    print(f"    {c['id']}  {lufs(mix[a:b]):6.1f} / {lufs(music_d[a:b]):6.1f}")
# short-term (3 s) max of the mix, to spot any moment that jumps out
hop = n_of(1.0); st_ = []
import pyloudnorm as pyln
meter = pyln.Meter(SR)
for i in range(0, N - n_of(3), hop):
    st_.append((meter.integrated_loudness(mix[i:i + n_of(3)]) if np.abs(mix[i:i + n_of(3)]).max() > 1e-4 else -99, i / SR))
st_.sort(reverse=True)
print('  loudest 3 s windows:', [(round(v, 1), round(t, 1)) for v, t in st_[:4]])


def edit_clicks(x, times, name):
    """a click shows up as a burst of >8 kHz energy right at an edit, much louder than the 50 ms before it"""
    h = filt(to_stereo(x).mean(1), 'hp', 8000, order=3)
    worst = []
    for t in times:
        i = n_of(t)
        if i < n_of(0.06) or i > len(h) - n_of(0.01): continue
        at = np.sqrt((h[i - n_of(0.004):i + n_of(0.004)] ** 2).mean()) + 1e-9
        pre = np.sqrt((h[i - n_of(0.054):i - n_of(0.004)] ** 2).mean()) + 1e-9
        worst.append((db(at / pre), db(at), t))
    worst.sort(reverse=True)
    bad = [w for w in worst if w[0] > 12 and w[1] > -70]
    print(f'  click check {name}: {len(times)} edit points, {len(bad)} suspicious',
          [(round(w[2], 3), round(w[0], 1), round(w[1], 1)) for w in bad[:8]])


edits = [l['start'] for l in tl.speech] + [l['start'] + l['dur'] for l in tl.speech] + [D - 0.01]
edit_clicks(mix, edits + [c['t'] for c in tl.cues if 0 < c.get('t', -1) < D], 'mix (voice edges + cues)')
edit_clicks(music, [c['t0'] for c in meta.get('chords', [])], 'music (chord changes)')
if '--plot' in sys.argv:
    del raw, pre_lim
    for k_, x_ in ((() if SILENT else (('voice', vo),)) + (('music_ducked', music_d), ('duck_gain', duck))):
        write(f'{OUT}/stems/{k_}.wav', to_stereo(x_) * (G if k_ != 'duck_gain' else 1.0))
    plot_tracks(([] if SILENT else [('voice', vo)]) + [('music(ducked)', music_d), ('sfx', sfx), ('mix', mix)], tl, f'{OUT}/plots/mix_stems.png',
                'stems (pre-master) + final mix')
