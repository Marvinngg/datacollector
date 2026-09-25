"""Shared helpers for the Earth Online audio pipeline (music.py / sfx.py / mix.py).

Everything time-related is read from build/timeline.json (and optionally build/cues.json) at run time.
Audio is float32/float64 numpy, stereo arrays have shape (n, 2), SR = 48 kHz.
"""
import json
import os
import numpy as np
import soundfile as sf
from scipy import signal

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))          # earth-online/
BUILD = os.path.join(ROOT, 'build')
OUT = os.path.join(BUILD, 'audio')
SF2_PATH = os.path.join(ROOT, 'models', 'sf2', 'GeneralUser-GS.sf2')
SF2_URL = 'https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/main/GeneralUser-GS.sf2'


# ----------------------------------------------------------------------------- timeline
class Timeline:
    def __init__(self):
        self.d = json.load(open(os.path.join(BUILD, 'timeline.json')))
        self.duration = float(self.d['duration'])
        self.sc = {s['id']: s for s in self.d['scenes']}
        self.ln = {l['id']: l for l in self.d['lines']}
        self.vo_sr = int(self.d['sample_rate'])
        p = os.path.join(BUILD, 'cues.json')
        self.cues = json.load(open(p)) if os.path.exists(p) else []

    def s(self, sid):  return float(self.sc[sid]['start'])
    def e(self, sid):  return float(self.sc[sid]['end'])
    def ls(self, lid): return float(self.ln[lid]['start'])
    def le(self, lid): return float(self.ln[lid]['start'] + self.ln[lid]['dur'])

    def cue_times(self, typ, scene=None, lo=None, hi=None):
        out = []
        for c in self.cues:
            if c.get('type') != typ: continue
            if scene and c.get('scene') != scene: continue
            t = float(c['t'])
            if lo is not None and t < lo: continue
            if hi is not None and t > hi: continue
            out.append(t)
        return sorted(out)

    def first_cue(self, typ, scene, default, lo=None, hi=None):
        ts = self.cue_times(typ, scene, lo, hi)
        return (ts[0], True) if ts else (default, False)


def n_of(t): return int(round(t * SR))


# ----------------------------------------------------------------------------- buffers
def buf(dur):
    return np.zeros((n_of(dur) + 1, 2), dtype=np.float64)


def to_stereo(x):
    x = np.asarray(x, dtype=np.float64)
    return np.stack([x, x], axis=1) if x.ndim == 1 else x


def pan_gains(p):
    """equal-power pan, p in [-1, 1]"""
    a = (p + 1) * np.pi / 4
    return np.cos(a) * np.sqrt(2), np.sin(a) * np.sqrt(2)


def place(dst, t, x, gain=1.0, pan=0.0):
    """mix stereo/mono x into dst at time t (seconds)"""
    x = to_stereo(x)
    i = n_of(t)
    if i < 0: x = x[-i:]; i = 0
    j = min(len(dst), i + len(x))
    if j <= i: return
    gl, gr = pan_gains(pan)
    if x.ndim == 2 and pan != 0.0:
        dst[i:j, 0] += x[:j - i, 0] * gain * gl
        dst[i:j, 1] += x[:j - i, 1] * gain * gr
    else:
        dst[i:j] += x[:j - i] * gain


def fade(x, fi=0.005, fo=0.005):
    x = x.copy(); n = len(x)
    a, b = min(n, n_of(fi)), min(n, n_of(fo))
    if a > 1: x[:a] *= (0.5 - 0.5 * np.cos(np.linspace(0, np.pi, a)))[:, None] if x.ndim == 2 else (0.5 - 0.5 * np.cos(np.linspace(0, np.pi, a)))
    if b > 1: x[n - b:] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, b)))[:, None] if x.ndim == 2 else (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, b)))
    return x


def env_points(n_total, pts, curve='cos'):
    """piecewise gain envelope from [(t, gain), ...]; smooth (raised-cosine) segments"""
    g = np.ones(n_total)
    pts = sorted(pts)
    tt = np.arange(n_total) / SR
    g[:] = pts[0][1]
    for (t0, g0), (t1, g1) in zip(pts[:-1], pts[1:]):
        i0, i1 = n_of(t0), n_of(t1)
        i0c, i1c = max(0, i0), min(n_total, i1)
        if i1c > i0c:
            u = (tt[i0c:i1c] - t0) / max(1e-9, t1 - t0)
            if curve == 'cos': u = 0.5 - 0.5 * np.cos(np.pi * u)
            g[i0c:i1c] = g0 + (g1 - g0) * u
    g[max(0, n_of(pts[-1][0])):] = pts[-1][1]
    return g


def adsr(n, a, d, s, r, sr=SR, hold=None):
    """ADSR with gate length = n - r samples (or hold seconds)"""
    na, nd, nr = max(1, int(a * sr)), max(1, int(d * sr)), max(1, int(r * sr))
    gate = n - nr if hold is None else int(hold * sr)
    gate = max(gate, 1)
    e = np.zeros(n)
    t = np.arange(n)
    e = np.where(t < na, t / na, s + (1 - s) * np.exp(-(t - na) / nd * 3.0))
    lvl_at_gate = e[min(gate, n - 1)]
    rel = lvl_at_gate * np.exp(-(t - gate) / nr * 6.0)
    e = np.where(t < gate, e, rel)
    return e


# ----------------------------------------------------------------------------- filters
def biquad(kind, f0, q=0.707, gain_db=0.0, sr=SR):
    f0 = min(max(f0, 10.0), sr * 0.45)
    w = 2 * np.pi * f0 / sr; cw, sw = np.cos(w), np.sin(w); al = sw / (2 * q)
    A = 10 ** (gain_db / 40)
    if kind == 'lp':
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'hp':
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'bp':
        b = [al, 0, -al]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'peak':
        b = [1 + al * A, -2 * cw, 1 - al * A]; a = [1 + al / A, -2 * cw, 1 - al / A]
    elif kind == 'hs':
        sq = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) + (A - 1) * cw + sq), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - sq)]
        a = [(A + 1) - (A - 1) * cw + sq, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - sq]
    elif kind == 'ls':
        sq = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) - (A - 1) * cw + sq), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - sq)]
        a = [(A + 1) + (A - 1) * cw + sq, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - sq]
    b, a = np.array(b) / a[0], np.array(a) / a[0]
    return b, a


def filt(x, kind, f0, q=0.707, gain_db=0.0, order=1):
    b, a = biquad(kind, f0, q, gain_db)
    y = x
    for _ in range(order): y = signal.lfilter(b, a, y, axis=0)
    return y


def sweep(x, kind, f_curve, q=0.707, block=128):
    """time-varying biquad; f_curve: per-sample cutoff array (len(x)). Coefficients updated per block."""
    x = to_stereo(x) if x.ndim == 1 else x
    y = np.zeros_like(x)
    zi = np.zeros((2, x.shape[1]))
    for i in range(0, len(x), block):
        b, a = biquad(kind, float(f_curve[min(i + block // 2, len(x) - 1)]), q)
        # transposed DF-II state is compatible across coefficient changes closely enough for slow sweeps
        y[i:i + block], zi = signal.lfilter(b, a, x[i:i + block], axis=0, zi=zi)
    return y


# ----------------------------------------------------------------------------- reverb
def make_ir(rt60=2.5, length=None, predelay=0.018, bright=0.5, seed=1, width=1.0):
    """Synthetic stereo hall IR: octave-band decorrelated noise, higher bands decay faster,
    plus a few early reflections. Energy-normalised."""
    rng = np.random.default_rng(seed)
    L = length or rt60 * 1.3
    n = n_of(L)
    t = np.arange(n) / SR
    ir = np.zeros((n, 2))
    bands = [(60, 250), (250, 700), (700, 2000), (2000, 5000), (5000, 12000)]
    band_rt = [1.15, 1.0, 0.85, 0.6 * (0.6 + bright * 0.5), 0.35 * (0.5 + bright)]
    band_g = [1.0, 1.0, 0.8, 0.5 * (0.4 + bright), 0.25 * (0.3 + bright)]
    for (lo, hi), rtm, g in zip(bands, band_rt, band_g):
        sos = signal.butter(2, [lo, hi], 'bandpass', fs=SR, output='sos')
        nz = rng.standard_normal((n, 2))
        nz = signal.sosfilt(sos, nz, axis=0)
        ir += g * nz * np.exp(-6.91 * t / (rt60 * rtm))[:, None]
    # gentle build-up (diffusion) instead of hard onset
    ir *= (1 - np.exp(-t / 0.012))[:, None]
    # early reflections
    for k in range(10):
        dt = rng.uniform(0.004, 0.06); g = 0.5 * np.exp(-dt / 0.05) * rng.uniform(0.4, 1)
        i = n_of(dt); ir[i, k % 2] += g * rng.choice([-1, 1]) * 3
    pd = np.zeros((n_of(predelay), 2))
    ir = np.concatenate([pd, ir])
    # width: mid/side
    m, s_ = (ir[:, 0] + ir[:, 1]) / 2, (ir[:, 0] - ir[:, 1]) / 2
    ir = np.stack([m + width * s_, m - width * s_], 1)
    ir /= np.sqrt((ir ** 2).sum() / 2)
    return ir


def convolve(x, ir):
    x = to_stereo(x)
    y = np.stack([signal.fftconvolve(x[:, c], ir[:, c])[:len(x)] for c in range(2)], 1)
    return y


def widen(x, w=1.3):
    m, s_ = (x[:, 0] + x[:, 1]) / 2, (x[:, 0] - x[:, 1]) / 2
    return np.stack([m + w * s_, m - w * s_], 1)


# ----------------------------------------------------------------------------- oscillators
def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)


def additive(freq, n, amps, phases=None, detune_cents=0.0, vib=None, sr=SR):
    """sum of harmonics; amps: list of (k, amp) or array amp[k-1]; returns mono"""
    t = np.arange(n) / sr
    f = freq * 2 ** (detune_cents / 1200)
    ph0 = 2 * np.pi * f * t if vib is None else 2 * np.pi * np.cumsum(f * (1 + vib)) / sr
    y = np.zeros(n)
    rng = np.random.default_rng(int(freq * 1000) % 2 ** 31)
    for k, a in enumerate(amps, start=1):
        if a == 0 or f * k > sr * 0.45: continue
        p = rng.uniform(0, 2 * np.pi) if phases is None else phases[k - 1]
        y += a * np.sin(k * ph0 + p)
    return y


def saw_amps(nh, tilt=1.0, cutoff_h=None):
    a = np.array([1.0 / k ** tilt for k in range(1, nh + 1)])
    if cutoff_h: a *= 1 / np.sqrt(1 + (np.arange(1, nh + 1) / cutoff_h) ** 4)
    return a


def pluck_additive(freq, dur, bright=12.0, decay=0.6, nh=40, tilt=1.0, sr=SR, attack=0.003):
    """plucked synth: each harmonic decays faster than the one below (like a closing LP env)"""
    n = n_of(dur); t = np.arange(n) / sr
    y = np.zeros(n)
    rng = np.random.default_rng(int(freq * 7919) % 2 ** 31)
    for k in range(1, nh + 1):
        if freq * k > 14000: break
        a = 1.0 / k ** tilt / np.sqrt(1 + (k / bright) ** 2)
        tau = decay / (1 + 0.35 * (k - 1))
        y += a * np.exp(-t / tau) * np.sin(2 * np.pi * freq * k * t + rng.uniform(0, 6.28))
    atk = np.minimum(1, t / attack)
    return y * atk


# ----------------------------------------------------------------------------- SF2 instrument
class SF2:
    """Render single notes offline from a General MIDI SoundFont (tinysoundfont)."""
    def __init__(self, path=SF2_PATH):
        import tinysoundfont
        self.syn = tinysoundfont.Synth(samplerate=SR, gain=0)
        self.sfid = self.syn.sfload(path, max_voices=64)
        self.cache = {}

    def note(self, bank, preset, key, vel, dur, tail=4.0, drums=False):
        k = (bank, preset, key, vel, round(dur, 3), tail, drums)
        if k in self.cache: return self.cache[k]
        s = self.syn
        s.program_select(0, self.sfid, bank, preset, is_drums=drums)
        s.noteon(0, int(key), int(vel))
        a = np.frombuffer(s.generate(max(1, n_of(dur))), dtype=np.float32)
        s.noteoff(0, int(key))
        b = np.frombuffer(s.generate(n_of(tail)), dtype=np.float32)
        s.notes_off(0); s.sounds_off(0)
        s.generate(256)
        x = np.concatenate([a, b]).reshape(-1, 2).astype(np.float64)
        # trim trailing silence
        e = np.abs(x).max(1)
        idx = np.where(e > 1e-5)[0]
        x = x[:idx[-1] + 1] if len(idx) else x[:1]
        x = fade(x, 0.0005, min(0.3, len(x) / SR / 4))
        self.cache[k] = x
        return x


def ensure_sf2():
    if os.path.exists(SF2_PATH) and os.path.getsize(SF2_PATH) > 1_000_000: return True
    import urllib.request
    os.makedirs(os.path.dirname(SF2_PATH), exist_ok=True)
    try:
        print('downloading', SF2_URL)
        urllib.request.urlretrieve(SF2_URL, SF2_PATH)
        return True
    except Exception as ex:
        print('SF2 download failed:', ex)
        return False


# ----------------------------------------------------------------------------- io / analysis
def write(path, x):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sf.write(path, np.asarray(x, dtype=np.float32), SR, subtype='FLOAT')
    print('wrote', os.path.relpath(path, ROOT), f'{len(x) / SR:.3f}s', f'peak {db(np.abs(x).max()):.1f} dBFS')


def db(x): return 20 * np.log10(max(float(x), 1e-12))


def lufs(x):
    import pyloudnorm as pyln
    return pyln.Meter(SR).integrated_loudness(to_stereo(x))


def true_peak_db(x, os_=4):
    y = signal.resample_poly(to_stereo(x), os_, 1, axis=0)
    return db(np.abs(y).max())


def plot_tracks(tracks, tl, path, title=''):
    """tracks: [(name, stereo array)] -> PNG with RMS envelope (dB) + spectrogram per track and scene/line marks"""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    n = len(tracks)
    fig, axes = plt.subplots(2 * n, 1, figsize=(22, 4.2 * n), sharex=True,
                             gridspec_kw={'height_ratios': [1, 1.4] * n})
    for i, (name, x) in enumerate(tracks):
        m = to_stereo(x).mean(1)
        hop = 480
        fr = len(m) // hop
        rms = np.sqrt((m[:fr * hop].reshape(fr, hop) ** 2).mean(1) + 1e-12)
        pk = np.abs(m[:fr * hop]).reshape(fr, hop).max(1)
        tt = np.arange(fr) * hop / SR
        ax = axes[2 * i]
        ax.plot(tt, 20 * np.log10(pk + 1e-9), lw=0.5, color='#999', label='peak')
        ax.plot(tt, 20 * np.log10(rms), lw=0.8, color='C0', label='rms')
        ax.set_ylim(-80, 0); ax.set_ylabel(name + ' dB'); ax.grid(alpha=0.3)
        ax = axes[2 * i + 1]
        f, t, S = signal.spectrogram(m, SR, nperseg=4096, noverlap=3072)
        ax.pcolormesh(t, f, 10 * np.log10(S + 1e-14), shading='auto', vmin=-130, vmax=-40, cmap='magma')
        ax.set_yscale('symlog', linthresh=200); ax.set_ylim(30, 16000); ax.set_ylabel(name + ' Hz')
    for ax in axes:
        for s in tl.d['scenes']:
            ax.axvline(s['start'], color='lime', lw=1.2)
        for l in tl.d['lines']:
            ax.axvspan(l['start'], l['start'] + l['dur'], color='cyan', alpha=0.07)
    for s in tl.d['scenes']:
        axes[0].text(s['start'] + 0.2, -5, s['id'], color='green', fontsize=9, va='top')
    for l in tl.d['lines']:
        axes[0].text(l['start'], -75, l['id'], color='teal', fontsize=7)
    axes[-1].set_xlabel('s')
    axes[0].set_title(title)
    plt.tight_layout(); fig.savefig(path, dpi=60); plt.close(fig)
    print('plot', path)


def limiter(x, ceiling_db=-1.2, lookahead=0.005, release=0.12, os_=4, blk=48):
    """Look-ahead true-peak limiter (4x oversampled peak detection, block-rate gain computer)."""
    x = to_stereo(x)
    ceil = 10 ** (ceiling_db / 20)
    up = np.abs(signal.resample_poly(x, os_, 1, axis=0)).max(1)
    nb = int(np.ceil(len(x) / blk))
    up = np.pad(up, (0, nb * blk * os_ - len(up)))
    pk = up.reshape(nb, blk * os_).max(1)
    need = np.minimum(1.0, ceil / np.maximum(pk, 1e-9))
    la = max(1, int(lookahead * SR / blk))
    from scipy.ndimage import minimum_filter1d
    need = minimum_filter1d(need, size=2 * la + 1, origin=0)
    g = np.empty(nb); c = np.exp(-blk / (release * SR)); prev = 1.0
    for i in range(nb):
        v = need[i]
        prev = v if v < prev else v + (prev - v) * c
        g[i] = prev
    g = minimum_filter1d(g, 3)
    gs = np.repeat(g, blk)[:len(x)]
    k = np.ones(blk) / blk
    gs = np.minimum(gs, np.convolve(gs, k, mode='same'))
    return x * gs[:, None]


def plot_range(x, tl, t0, t1, path, title='', vmin=-130):
    """zoomed spectrogram + envelope of one time range"""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    a, b = n_of(t0), n_of(t1)
    m = to_stereo(x)[a:b].mean(1)
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(18, 7), sharex=True, gridspec_kw={'height_ratios': [1, 2]})
    hop = 240; fr = len(m) // hop
    rms = np.sqrt((m[:fr * hop].reshape(fr, hop) ** 2).mean(1) + 1e-12)
    pk = np.abs(m[:fr * hop]).reshape(fr, hop).max(1)
    tt = t0 + np.arange(fr) * hop / SR
    ax1.plot(tt, 20 * np.log10(pk + 1e-9), lw=0.5, color='#999'); ax1.plot(tt, 20 * np.log10(rms), lw=0.8)
    ax1.set_ylim(-80, 0); ax1.grid(alpha=0.3)
    f, t, S = signal.spectrogram(m, SR, nperseg=2048, noverlap=1536)
    ax2.pcolormesh(t + t0, f, 10 * np.log10(S + 1e-14), shading='auto', vmin=vmin, vmax=-40, cmap='magma')
    ax2.set_yscale('symlog', linthresh=200); ax2.set_ylim(30, 20000)
    for ax in (ax1, ax2):
        for s in tl.d['scenes']:
            if t0 <= s['start'] <= t1: ax.axvline(s['start'], color='lime', lw=1.2)
        for l in tl.d['lines']:
            if l['start'] < t1 and l['start'] + l['dur'] > t0:
                ax.axvspan(l['start'], l['start'] + l['dur'], color='cyan', alpha=0.08)
                ax1.text(l['start'], -76, l['id'], color='teal', fontsize=8)
    ax1.set_title(title); ax2.set_xlim(t0, t1)
    plt.tight_layout(); fig.savefig(path, dpi=70); plt.close(fig)
    print('plot', path)
