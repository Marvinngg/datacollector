"""Score for 《地球 Online》 -> build/audio/music.wav (48 kHz stereo float).

Key: D major throughout. Tempi: s1 88 BPM, s3 90 BPM, s5 96 BPM; s0/s2/s4/s6 are free-time and
anchored to voice-over lines / picture cues. All times are read from build/timeline.json (+ cues.json when
present), nothing is hard-coded in seconds except musical durations and small offsets.

Instruments: GeneralUser GS SoundFont (marimba, music box, grand piano, tine EP, pads, strings, celesta)
rendered offline with tinysoundfont, plus in-house additive synths (kick, hats, bass, pluck arps, sub drone).
Every section is rendered to its own bus with its own synthetic convolution reverb, then gated.
"""
import sys
import numpy as np
from common import *   # noqa

rng = np.random.default_rng(20260925)
tl = Timeline()
D = tl.duration
N = n_of(D)
PAD = 7.0          # buffers run past the end so reverb tails never wrap
if not ensure_sf2():
    sys.exit('SoundFont missing: ' + SF2_PATH)
sf2 = SF2()

# GM programs (bank, preset)
MARIMBA, MBOX, PIANO, EP, EPC = (0, 12), (0, 10), (0, 0), (0, 4), (8, 4)
WPAD, HALO, GLASS, STR, CELESTA, SYNSTR = (0, 89), (0, 94), (0, 92), (0, 49), (0, 8), (0, 50)


class Bus:
    """a section bus covering [lo, hi] (+ reverb pad) of the absolute timeline"""
    def __init__(self, name, lo, hi, rt60=2.2, send=0.25, bright=0.45, width=1.0, seed=1):
        self.name, self.send = name, send
        self.lo = max(0.0, lo)
        self.dry, self.wet = buf(hi - self.lo + PAD), buf(hi - self.lo + PAD)
        self.ir = make_ir(rt60, bright=bright, width=width, seed=seed)
        self.pre = None      # optional fn(stereo) applied to dry & wet before reverb

    def times(self):
        return self.lo + np.arange(len(self.dry)) / SR

    def add(self, t, x, gain=1.0, pan=0.0, send=None):
        place(self.dry, t - self.lo, x, gain, pan)
        s = self.send if send is None else send
        if s > 0: place(self.wet, t - self.lo, x, gain * s, pan)

    def render(self):
        d, w = self.dry, self.wet
        if self.pre: d, w = self.pre(d), self.pre(w)
        return d + convolve(w, self.ir)


def hum_t(sd=0.006): return float(rng.normal(0, sd))
def hum_v(v, sd=5): return int(np.clip(v + rng.normal(0, sd), 1, 127))


def gm(bus, t, prog, key, vel, dur, gain=1.0, pan=0.0, send=None, tail=4.0):
    bus.add(t, sf2.note(prog[0], prog[1], key, vel, dur, tail), gain, pan, send)


def roll(bus, t, prog, keys, vel, dur, gain=1.0, spread=0.035, pan_w=0.3, send=None, human=True, tail=4.0):
    """rolled chord, low -> high, slight pan spread across the voicing"""
    for i, k in enumerate(keys):
        p = (i / max(1, len(keys) - 1) - 0.5) * 2 * pan_w
        dt = i * spread + (hum_t(0.008) if human else 0)
        gm(bus, t + dt, prog, k, hum_v(vel - 4 * (i == 0), 4) if human else vel, dur - dt, gain, p, send, tail)


# ----------------------------------------------------------------------------- in-house synths
_cache = {}


def kick(soft=1.0):
    k = ('kick', soft)
    if k in _cache: return _cache[k]
    n = n_of(0.45); t = np.arange(n) / SR
    f = 46 + 70 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.16) * (1 - np.exp(-t / 0.002))
    click = filt(np.random.default_rng(3).standard_normal(n) * np.exp(-t / 0.004), 'lp', 1800) * 0.25
    x = np.tanh(1.3 * (body + click * soft)) / np.tanh(1.3)
    _cache[k] = fade(x, 0, 0.05); return _cache[k]


def hat(var=0, dur=0.05, tone=7500):
    k = ('hat', var, dur, tone)
    if k in _cache: return _cache[k]
    n = n_of(dur + 0.03); t = np.arange(n) / SR
    nz = np.random.default_rng(100 + var).standard_normal((n, 2))
    nz = filt(nz, 'hp', tone, order=2)
    nz = filt(nz, 'lp', 11000)
    x = nz * np.exp(-t / (dur / 3))[:, None] * (1 - np.exp(-t / 0.0006))[:, None]
    x /= np.abs(x).max()
    _cache[k] = x; return x


def shaker(var=0):
    k = ('shk', var)
    if k in _cache: return _cache[k]
    n = n_of(0.12); t = np.arange(n) / SR
    nz = np.random.default_rng(300 + var).standard_normal((n, 2))
    nz = filt(filt(nz, 'hp', 4500, order=2), 'lp', 9000)
    e = (t / 0.03) ** 2 * np.exp(-t / 0.025)
    x = nz * (e / e.max())[:, None]
    _cache[k] = x / np.abs(x).max(); return _cache[k]


def bass(m, dur, cutoff_h=6.0):
    k = ('bass', m, round(dur, 3), cutoff_h)
    if k in _cache: return _cache[k]
    f = mtof(m); n = n_of(dur + 0.08)
    x = np.zeros(n)
    for dc in (-6, 6):
        x += additive(f, n, saw_amps(30, 1.0, cutoff_h), detune_cents=dc) * 0.35
    x += additive(f, n, [1.0]) * 0.8          # sub
    e = adsr(n, 0.004, 0.18, 0.55, 0.06)
    x = np.tanh(1.5 * x * e) / 1.5
    _cache[k] = fade(x, 0.001, 0.02); return _cache[k]


def pluck(m, dur=0.45, bright=9.0, decay=0.32):
    k = ('pluck', m, dur, bright, decay)
    if k in _cache: return _cache[k]
    f = mtof(m)
    a = pluck_additive(f * 2 ** (-7 / 1200), dur, bright, decay, tilt=1.0)
    b = pluck_additive(f * 2 ** (7 / 1200), dur, bright, decay, tilt=1.0)
    x = np.stack([a * 0.85 + b * 0.3, b * 0.85 + a * 0.3], 1) * 0.5
    _cache[k] = fade(x, 0.0005, 0.03); return _cache[k]


def sub_drone(m, dur, beat_hz=0.18):
    n = n_of(dur); f = mtof(m)
    x = additive(f, n, [1.0, 0.25, 0.08]) + additive(f + beat_hz, n, [1.0, 0.2, 0.05])
    return x * 0.5


def noise_riser(dur, f0=300, f1=5000):
    n = n_of(dur)
    nz = np.random.default_rng(7).standard_normal((n, 2))
    fc = f0 * (f1 / f0) ** (np.arange(n) / n)
    y = sweep(nz, 'bp', fc, q=1.2)
    e = (np.arange(n) / n) ** 2.2
    return y * e[:, None]


# ----------------------------------------------------------------------------- harmony
CH = {  # voicings (MIDI). D major.
    'D':      [62, 66, 69, 74], 'Bm': [59, 62, 66, 71], 'G': [59, 62, 67, 71], 'A': [57, 61, 64, 69],
    'Gadd9':  [43, 50, 59, 62, 69], 'D/F#': [42, 50, 57, 64, 66], 'Em9': [40, 50, 54, 55, 59],
    'Bm9':    [47, 54, 57, 61, 62], 'Gmaj9': [43, 50, 54, 57, 59], 'Asus4': [45, 52, 57, 62, 64],
    'A7sus':  [45, 52, 55, 62, 64], 'Aadd9': [45, 52, 57, 59, 61], 'Dadd9': [38, 50, 57, 62, 64, 66, 69],
}
BROOT = {'D': 38, 'Bm': 35, 'G': 43, 'A': 45, 'A/C#': 37, 'Dsus2': 38}
PENTA = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86]   # D major pentatonic D4..D6

def fit_tempo(interval, pref=88.0, lo=80.0, hi=96.0):
    """BPM such that `interval` is a whole number of beats; prefer lo..hi, closest to pref"""
    for a, b in ((lo, hi), (72.0, 104.0)):
        c = [60.0 * k / interval for k in range(1, 9) if a <= 60.0 * k / interval <= b]
        if c: return min(c, key=lambda v: abs(v - pref))
    return pref


def clusters(ts, gap):
    out = []
    for t in sorted(ts):
        if not out or t - out[-1][-1] > gap: out.append([t])
        else: out[-1].append(t)
    return out


buses = []
gates = {}
BUS_DB = {'s0': -3.0, 's3': -3.0, 's3k': -3.5}      # section trims (dB)


def section_bus(name, lo, hi, **kw):
    b = Bus(name, lo, hi, **kw); buses.append(b); return b


# ============================================================================= s0_boot
s0, s1s = tl.s('s0_boot'), tl.s('s1_school')
drone_end = s1s + 5.0
b0 = section_bus('s0', s0, drone_end + 1, rt60=3.5, send=0.35, bright=0.3, seed=10)
gm(b0, s0 + 0.05, WPAD, 38, 64, drone_end - s0, gain=0.6, tail=3)
gm(b0, s0 + 0.35, WPAD, 45, 54, drone_end - s0 - 0.3, gain=0.45, tail=3)
gm(b0, s0 + 1.2, HALO, 57, 40, drone_end - s0 - 1.2, gain=0.35, tail=3)
b0.add(s0, sub_drone(26, drone_end - s0 + 1), gain=0.09, send=0.0)     # D1 sub, slow beating
b0.pre = lambda x: filt(x, 'lp', 2400, order=2)
gates['s0'] = [(s0, 0.0), (s0 + 3.2, 1.0), (s1s + 1.0, 1.0), (drone_end, 0.0)]

# ============================================================================= s1_school  (~88-92 BPM, 4/4)
s1e = tl.e('s1_school')
b1 = section_bus('s1', s1s - 0.5, s1e + 1, rt60=2.0, send=0.22, bright=0.5, seed=11)
b1long = section_bus('s1strike', s1s, s1e + 10, rt60=5.5, send=0.6, bright=0.35, width=1.2, seed=12)   # the ✓ chord rings into s2
# tempo & phase from the picture: each log row starts typing on a beat (key-cue clusters)
rows = [c_[0] for c_ in clusters(tl.cue_times('key', 's1_school', lo=s1s, hi=tl.le('L02')), 0.4)]
bpm1 = fit_tempo(float(np.median(np.diff(rows)))) if len(rows) >= 2 else 88.0
beat = 60 / bpm1; bar = 4 * beat; e8 = beat / 2
t0 = rows[0] - beat * np.floor((rows[0] - s1s + 0.05) / beat) if rows else s1s
n_full = max(1, int((s1e - t0 - 0.4) // bar))
prog1 = ['D', 'Bm', 'G', 'A']
MEL1 = {'D': [78, 81], 'Bm': [78, 74], 'G': [74, 71], 'A': [73, 76]}
pat = [0, 1, 2, 3, 2, 1, 2, 3]
for i in range(n_full):
    c = prog1[i % 4]; tb = t0 + i * bar; notes = CH[c]
    for j, p in enumerate(pat):
        acc = 78 if j % 4 == 0 else (64 if j % 2 == 0 else 56)          # strict, schedule-like accents
        gm(b1, tb + j * e8 + hum_t(0.002), MARIMBA, notes[p], hum_v(acc, 2), e8 * 0.9, gain=1.5,
           pan=(p - 1.5) * 0.18, tail=1.5)
    gm(b1, tb, PIANO, BROOT[c] + 12, 52, bar * 0.95, gain=0.9, pan=-0.1, tail=2)             # soft bass
    if i >= 1:
        for k, m in enumerate(MEL1[c]):
            gm(b1, tb + k * 2 * beat, MBOX, m, 44, beat * 1.5, gain=0.33, pan=0.25, tail=2.5)
strike = t0 + n_full * bar
roll(b1long, strike, MARIMBA, [62, 66, 69, 74], 80, 0.5, gain=1.4, spread=0.0, human=False, tail=2)
gm(b1long, strike, MBOX, 86, 46, 1.0, gain=0.35, pan=0.2, tail=3)
gm(b1long, strike, PIANO, 50, 50, 3.5, gain=0.8, tail=3)
gm(b1long, strike, PIANO, 38, 46, 3.5, gain=0.7, tail=3)
gates['s1'] = [(s1s - 0.01, 1.0), (s1e + 6, 1.0)]

# ============================================================================= s2_empty (almost nothing)
s2s, s2e = tl.s('s2_empty'), tl.e('s2_empty')
s3s, s3e = tl.s('s3_money'), tl.e('s3_money')
b2 = section_bus('s2', s2s - 0.5, tl.e('s3_money'), rt60=6.0, send=0.9, bright=0.25, width=1.3, seed=13)
# the only things left: a far-away pad fifth that barely moves, and a lone piano note or two
enter_t, _ = tl.first_cue('enter', 's3_money', tl.le('L07') - 0.15, lo=s3s, hi=tl.le('L08'))
gm(b2, s2s + 0.6, HALO, 50, 34, enter_t - s2s - 0.6, gain=0.17, pan=-0.2, tail=4)
gm(b2, s2s + 1.4, GLASS, 57, 30, enter_t - s2s - 1.4, gain=0.11, pan=0.25, tail=4)
lone1 = tl.le('L04') + 0.35
gm(b2, lone1, PIANO, 69, 34, 3.0, gain=0.9, pan=0.15, tail=5)             # A4, alone
lone2 = min(tl.le('L06') + 0.45, s2e - 0.2)
gm(b2, lone2, PIANO, 64, 30, 3.0, gain=0.8, pan=-0.1, tail=5)             # E4, unresolved
b2.pre = lambda x: filt(x, 'lp', 3500)
gates['s2'] = [(s2s, 1.0), (enter_t - 0.5, 1.0), (enter_t + 1.2, 0.0)]

# ============================================================================= s3_money (90 BPM groove)
b3 = section_bus('s3', s3s, s3e + 1, rt60=1.4, send=0.14, bright=0.5, seed=14)
b3k = section_bus('s3k', s3s, s3e + 1, rt60=0.8, send=0.03, seed=15)
# the notifications land on the beat: tempo from their spacing, first downbeat right after 'enter'
pings = tl.cue_times('ping', 's3_money') + tl.cue_times('ping_dull', 's3_money')
pings = sorted(pings)
if len(pings) >= 3:
    bpm3 = fit_tempo(float(np.median(np.diff(pings))), pref=84)
    beat = 60 / bpm3
    g0 = pings[0] - beat * np.floor((pings[0] - enter_t + 0.02) / beat)
else:
    bpm3 = 90.0; beat = 60 / bpm3; g0 = enter_t
bar = 4 * beat; e8 = beat / 2; e16 = beat / 4
freeze_from = tl.ls('L09')
f_end = tl.le('L10')
prog3 = ['D', 'A/C#', 'Bm', 'G']
EP3 = {'D': [57, 62, 66, 69], 'A/C#': [57, 61, 64, 69], 'Bm': [57, 62, 66, 71], 'G': [59, 62, 67, 71], 'Dsus2': [57, 62, 64, 69]}
PL3 = {'D': [78, 81, 74, 81], 'A/C#': [76, 81, 73, 81], 'Bm': [78, 74, 71, 74], 'G': [74, 79, 71, 79]}
i = 0
while True:
    tb = g0 + i * bar
    if tb >= s3e - 0.05: break
    frozen = tb >= freeze_from - 0.35 * bar
    c = 'Dsus2' if frozen else prog3[i % 4]
    hv = (lambda v, sd=4: v) if frozen else hum_v            # frozen = identical loop, no humanisation
    ht = (lambda sd=0: 0.0) if frozen else hum_t
    r = BROOT[c]
    for b in range(4):
        tt = tb + b * beat
        if tt < s3e - 0.02: b3k.add(tt, kick(), gain=0.32)
    for j in range(8):
        tt = tb + j * e8
        if tt >= s3e - 0.02: continue
        m = [r, r, r + 12, r, r + 7, r, r + 12, r + 7][j]
        b3.add(tt + ht(0.003), bass(m, e8 * 0.8), gain=0.2 * (1.0 if j % 2 == 0 else 0.8), pan=0, send=0.02)
        if j % 2 == 1 and i >= 1:
            b3.add(tt + ht(0.004), hat(j % 3, 0.045), gain=0.05 * (hv(100, 10) / 100), pan=0.3)
        if bpm3 < 84 and i >= 1 and not frozen:          # slow tempo: light 16th ghost hats keep it moving
            b3.add(tt + e16 + ht(0.004), hat(3 + j % 2, 0.03), gain=0.022, pan=0.35)
    # EP stabs: 1 (long), 2&, 4
    for off, du, v in [(0, 1.4 * beat, 66), (1.5 * beat, 0.4 * beat, 56), (3 * beat, 0.6 * beat, 58)]:
        tt = tb + off
        if tt >= s3e - 0.05: continue
        for k, m in enumerate(EP3[c]):
            gm(b3, tt + ht(0.006) + 0.006 * k, EP, m, hv(v, 4), du, gain=0.8, pan=(k - 1.5) * 0.2, tail=1.5)
    # pluck counter-line on offbeats: the "numbers going up" -- disappears when it freezes
    if not frozen and i >= 1:
        for q in range(4):
            tt = tb + q * beat + e8
            if tt < s3e - 0.05:
                b3.add(tt + ht(0.003), pluck(PL3[c][q], 0.4, 7, 0.22), gain=0.07, pan=0.35 * (-1) ** q, send=0.3)
    i += 1
# filter slowly closing from L09 to the end of L10; hats & top fade with it
tt = b3.times()
u = np.clip((tt - freeze_from) / max(0.5, f_end - freeze_from), 0, 1)
lp_curve = 16000 * (420 / 16000) ** (u ** 0.8)
b3.pre = lambda x: sweep(x, 'lp', lp_curve, q=0.8)
lp_k = 16000 * (900 / 16000) ** u
b3k.pre = lambda x: sweep(x, 'lp', lp_k, q=0.7)
gates['s3'] = [(g0 - 0.01, 1.0), (s3e - 0.14, 1.0), (s3e, 0.0)]
gates['s3k'] = gates['s3']

# ============================================================================= s4_others (free time, warm)
s4s, s4e = tl.s('s4_others'), tl.e('s4_others')
b4 = section_bus('s4', s4s, s4e + 3, rt60=3.2, send=0.32, bright=0.45, width=1.2, seed=16)
b4p = section_bus('s4pad', s4s, s4e + 3, rt60=4.0, send=0.4, bright=0.35, width=1.4, seed=17)
b4f = section_bus('s4felt', s4s, s4e + 3, rt60=3.0, send=0.4, bright=0.3, seed=18)
wh, _ = tl.first_cue('whoosh', 's4_others', s4s + 2.0, lo=s4s + 0.8, hi=tl.ls('L11'))
open_t = max(wh, s4s + 1.9)
spark_t, _ = tl.first_cue('spark', 's4_others', tl.ls('L14') + 0.4, lo=open_t)
alarm_t, _ = tl.first_cue('alarm', 's4_others', max(spark_t + 1.6, tl.ls('L16') + tl.ln['L16']['dur'] * 0.45), lo=spark_t)
fall = alarm_t + 0.25

ev4 = [(open_t, 'Gadd9'), (tl.ls('L12') - 0.35, 'D/F#'), (tl.ls('L13') - 0.35, 'Em9'), (tl.ls('L14') - 0.35, 'Bm9')]
if spark_t < fall: ev4.append((spark_t, 'Gmaj9'))
ev4 = sorted([e for e in ev4 if e[0] < fall - 0.3])
for k, (t, c) in enumerate(ev4):
    t_next = ev4[k + 1][0] if k + 1 < len(ev4) else fall
    d = t_next - t + 0.25
    keys = CH[c]
    roll(b4, t, EPC, keys[1:], 60 if k else 66, d, gain=0.95, spread=0.05, pan_w=0.35)
    gm(b4, t, PIANO, keys[0], 44, d, gain=0.9, pan=-0.1, tail=3)                  # low root, felt
    pad_keys = [keys[1] + 12, keys[2] + 12, keys[-1] + 12]
    for j, m in enumerate(pad_keys):
        gm(b4p, t - 0.05, WPAD, m, 50, d + 0.4, gain=0.42, pan=(j - 1) * 0.5, tail=3)
# the opening: the pad's filter opens with the view
tt = b4p.times()
uo = np.clip((tt - open_t) / 2.8, 0, 1)
fc4 = 350 * (7000 / 350) ** (0.5 - 0.5 * np.cos(np.pi * uo))
b4p.pre = lambda x: sweep(x, 'lp', fc4, q=0.8)
b4f.pre = lambda x: filt(x, 'lp', 2600, order=2)       # felt-piano
# three cards: warm little felt-piano motifs
cards = tl.cue_times('card', 's4_others', lo=open_t, hi=spark_t)
if not cards:
    a, b_ = tl.le('L11') + 0.2, tl.le('L13') - 0.6
    cards = list(np.linspace(a, b_, 3))
MOT = [[74, 76, 78], [81, 78, 74, 76], [76, 78, 81, 83]]
for k, t in enumerate(cards[:6]):
    mot = MOT[k % 3]
    for j, m in enumerate(mot):
        gm(b4f, t + j * 0.21 + hum_t(0.012), PIANO, m, hum_v(40 - 3 * j, 3), 0.9, gain=0.9, pan=0.2 * (k - 1), tail=3)
# spark: a small bright twinkle (celesta)
for j, m in enumerate([78, 81, 86, 90]):
    gm(b4, spark_t + j * 0.07, CELESTA, m, 56 - 5 * j, 0.5, gain=0.7, pan=0.3 + 0.05 * j, send=0.6, tail=3)
# after the alarm: fall back to a thin, low pad that carries into s5
gm(b4p, fall + 0.1, HALO, 50, 36, s4e - fall + 1.2, gain=0.35, pan=-0.15, tail=3)
gm(b4p, fall + 0.3, HALO, 57, 30, s4e - fall + 1.0, gain=0.25, pan=0.2, tail=3)
gates['s4'] = [(open_t - 0.02, 0.0), (open_t, 1.0), (fall - 0.3, 1.0), (fall + 0.6, 0.35), (s4e + 1.0, 0.0)]
gates['s4pad'] = [(open_t - 0.02, 0.0), (open_t, 1.0), (fall - 0.2, 1.0), (fall + 0.9, 0.55), (s4e, 0.5), (s4e + 1.5, 0.0)]
gates['s4felt'] = [(open_t - 0.02, 0.0), (open_t, 1.0), (s4e + 1.0, 1.0), (s4e + 3, 0.0)]

# ============================================================================= s5_team (96 BPM, layering up)
s5s, s5e = tl.s('s5_team'), tl.e('s5_team')
cut = tl.ls('L20')
s6s, s6e = tl.s('s6_loop'), tl.e('s6_loop')
b5 = section_bus('s5', s5s - 0.5, cut + 1, rt60=1.8, send=0.2, bright=0.5, width=1.2, seed=19)
b5d = section_bus('s5drums', s5s - 0.5, cut + 1, rt60=0.9, send=0.05, seed=20)
beat = 60 / 96; bar = 4 * beat; e8 = beat / 2; e16 = beat / 4
g5 = s5s + 0.3
prog5 = ['Bm', 'G', 'D', 'A']
ARP = {'Bm': [59, 62, 66, 69], 'G': [59, 62, 67, 71], 'D': [57, 62, 66, 69], 'A': [57, 61, 64, 69]}
PADV = {'Bm': [50, 54, 59, 66], 'G': [50, 55, 59, 67], 'D': [50, 54, 57, 66], 'A': [49, 52, 57, 64]}
R5 = {'Bm': 35, 'G': 31, 'D': 38, 'A': 33}
# split events: cluster 'window' cues (a burst of windows opening = one split)
wins = tl.cue_times('window', 's5_team', lo=s5s, hi=cut)
splits = []
for t in wins:
    if not splits or t - splits[-1][-1] > 0.35: splits.append([t])
    else: splits[-1].append(t)
splits = [s_[0] for s_ in splits]
NL = 5
if len(splits) < 2:   # fallback: dialog enter after L17 starts, then splits spread up to L19
    splits = list(np.linspace(tl.ls('L17') + 0.8, tl.ls('L19'), NL))
if len(splits) > NL:  # more splits than layers: keep first and last, spread the rest
    idx = np.round(np.linspace(0, len(splits) - 1, NL)).astype(int); splits = [splits[k] for k in idx]
while len(splits) < NL: splits.append(tl.ls('L19'))
splits = [min(s_, tl.ls('L19')) for s_ in splits]


def q_next(t, grid):   # quantise to the nearest grid line
    k = np.round((t - g5) / grid); return g5 + k * grid


L_on = [q_next(s_, e16) for s_ in splits]    # layer 1..5 on-times
i = 0
while True:
    tb = g5 + i * bar
    if tb >= cut: break
    c = prog5[i % 4]; arp = ARP[c]
    # base layer: pad chord from the start (soft), grows with layer 4
    lvl = 0.22 if tb < L_on[3] else 0.42
    for j, m in enumerate(PADV[c]):
        gm(b5, tb, WPAD, m, 50, bar + 0.1, gain=lvl, pan=(j - 1.5) * 0.35, send=0.35, tail=2)
    prog_u = np.clip((tb - g5) / max(1.0, cut - g5), 0, 1)       # brightness rises through the scene
    for s16 in range(16):
        tt = tb + s16 * e16
        if tt >= cut: break
        # layer 1: 16th arp (mid)
        if tt >= L_on[0] - 1e-6:
            m = (arp + [arp[0] + 12])[[0, 1, 2, 3, 4, 3, 2, 1][s16 % 8]]
            acc = 1.0 if s16 % 4 == 0 else 0.7
            b5.add(tt, pluck(m, 0.35, 6 + 5 * prog_u, 0.18), gain=0.12 * acc, pan=-0.25, send=0.25)
        # layer 3: 8th arp octave up, other side
        if tt >= L_on[2] - 1e-6 and s16 % 2 == 0:
            m = [arp[3] + 12, arp[1] + 12, arp[2] + 12, arp[0] + 24][(s16 // 2) % 4]
            b5.add(tt + e16 * 0.02, pluck(m, 0.5, 5 + 4 * prog_u, 0.3), gain=0.06, pan=0.45, send=0.4)
        # layer 2: kick + bass
        if tt >= L_on[1] - 1e-6:
            if s16 % 4 == 0: b5d.add(tt, kick(0.8), gain=0.34)
            if s16 % 2 == 0:
                bm = R5[c] + (12 if s16 % 8 == 4 else 0)
                b5.add(tt, bass(bm, e8 * 0.75, 5 + 3 * prog_u), gain=0.24, send=0.02)
        # layer 4: hats, shaker, celesta counter, EP stabs
        if tt >= L_on[3] - 1e-6:
            if s16 % 2 == 1: b5d.add(tt, hat(s16 % 4, 0.035, 8000), gain=0.035, pan=0.25)
            if s16 % 4 == 2: b5d.add(tt, shaker(s16 % 3), gain=0.035, pan=-0.3)
        if tt >= L_on[4] - 1e-6:
            if s16 % 8 == 0:
                gm(b5, tt, CELESTA, arp[[3, 2][(s16 // 8) % 2]] + 12, 46, 0.4, gain=0.35, pan=0.3, send=0.4, tail=2)
            if s16 == 0 or abs(tt - L_on[4]) < 1e-6:
                for k, m in enumerate(PADV[c][1:]):
                    gm(b5, tt + 0.005 * k, STR, m + 12, 56, tb + bar - tt, gain=0.35, pan=(k - 1) * 0.4, send=0.3, tail=2)
    i += 1
# a soft rising air into L20 -- that is cut together with everything else
rs = tl.ls('L19')
b5.add(rs, noise_riser(cut - rs + 0.2, 400, 6000), gain=0.02, pan=0, send=0.3)
gates['s5'] = [(s5s - 0.5, 0.0), (s5s + 0.8, 1.0), (cut - 0.03, 1.0), (cut, 0.0)]
gates['s5drums'] = gates['s5']
# the one thing left after the stop: a quiet held note (revealed at the cut) that leads into s6
bb = section_bus('bridge', cut - 2, s6e, rt60=4.0, send=0.5, bright=0.3, width=1.3, seed=21)
anchor6 = max(s6s + 0.4, tl.ls('L21') - 0.8)
gm(bb, cut - 1.5, HALO, 57, 34, anchor6 - cut + 3.0, gain=0.35, tail=3)
gm(bb, cut - 1.5, GLASS, 69, 26, anchor6 - cut + 2.5, gain=0.12, pan=0.3, tail=3)
gates['bridge'] = [(cut - 1.5, 0.0), (cut - 0.9, 1.0), (anchor6 + 0.5, 1.0), (anchor6 + 3.0, 0.0)]

# ============================================================================= s6_loop (warm, resolving)
b6 = section_bus('s6', s6s - 0.5, D + 1, rt60=3.2, send=0.3, bright=0.45, width=1.2, seed=22)
b6p = section_bus('s6pad', s6s - 0.5, D + 1, rt60=4.5, send=0.45, bright=0.35, width=1.4, seed=23)
b6f = section_bus('s6felt', s6s - 0.5, D + 1, rt60=3.4, send=0.42, bright=0.3, seed=24)
b6f.pre = lambda x: filt(x, 'lp', 3000, order=2)
final_t, _ = tl.first_cue('final', 's6_loop', tl.le('L24') + 3.5, lo=tl.le('L23'))
final_t = min(final_t, D - 3.0)
L24s, L24e = tl.ls('L24'), tl.le('L24')
# '停一拍': the Asus4 just hangs over the 02:13 clock; the next chord lands with the clock tick (or just before L24)
clock_t, _ = tl.first_cue('tick', 's6_loop', L24s - 0.3, lo=tl.le('L23'), hi=L24s + 0.6)
spark6 = tl.cue_times('spark', 's6_loop', lo=L24s)
ev6 = [(anchor6, 'Gadd9'), (tl.ls('L22') - 0.3, 'D/F#'), (tl.ls('L22') + tl.ln['L22']['dur'] * 0.55, 'Em9'),
       (tl.ls('L23') - 0.3, 'Asus4'),
       (clock_t, 'Bm9'), (L24s + tl.ln['L24']['dur'] * 0.5, 'Gmaj9'),
       (max(L24e + 0.2, final_t - 3.6), 'D/F#'), (final_t - 2.4, 'Asus4'), (final_t - 1.2, 'A7sus')]
ev6 = sorted(ev6)
clean = []
for t, c in ev6:     # drop events that crowd each other if the timeline gets tight
    if clean and t - clean[-1][0] < 0.9: clean[-1] = (clean[-1][0], c) if c in ('Asus4', 'A7sus') else clean[-1]; continue
    clean.append((t, c))
ev6 = clean + [(final_t, 'Dadd9')]
for k, (t, c) in enumerate(ev6[:-1]):
    d = ev6[k + 1][0] - t + 0.3
    keys = CH[c]
    v = 62 if c not in ('Bm9', 'Gmaj9') else 66
    roll(b6, t, EPC, keys[1:], v, d, gain=0.95, spread=0.05, pan_w=0.35)
    gm(b6, t, PIANO, keys[0], 46, d, gain=0.9, pan=-0.1, tail=3)
    for j, m in enumerate([keys[1] + 12, keys[2] + 12, keys[-1] + 12]):
        gm(b6p, t - 0.05, WPAD, m, 50, d + 0.4, gain=0.42 if k else 0.3, pan=(j - 1) * 0.5, tail=3)
# strings bloom under L24 (the most moving moment -- kept low, no crescendo to the sky)
for j, m in enumerate([50, 57, 62, 66]):
    gm(b6p, L24s - 0.5 + 0.15 * j, STR, m, 58, final_t - L24s + 0.5, gain=0.45, pan=(j - 1.5) * 0.4, tail=4)
# felt-piano melody: sparse, stepwise, mostly in the gaps
mel = [(anchor6 + 0.25, 74, 40), (tl.le('L21') + 0.05, 78, 38), (tl.ls('L22') - 0.1, 76, 38),
       (tl.le('L22') + 0.1, 74, 36), (tl.le('L22') + 0.35, 71, 34), (tl.le('L23') + 0.7, 76, 36),
       (clock_t + 0.02, 78, 44), (L24s + 1.2, 76, 40), (L24s + tl.ln['L24']['dur'] * 0.5, 74, 44),
       (L24s + tl.ln['L24']['dur'] * 0.5 + 0.55, 71, 38), (L24e + 0.25, 69, 40), (final_t - 2.4, 74, 36), (final_t - 1.2, 73, 36)]
for t, m, v in mel:
    if t < final_t - 0.3:
        gm(b6f, t + hum_t(0.01), PIANO, m, hum_v(v, 2), 1.4, gain=0.95, pan=0.15, tail=3)
# the side quest triggers: the same little twinkle as the spark in s4 (callback)
for ts in spark6[:1]:
    if ts < final_t - 0.5:
        for j, m in enumerate([78, 81, 86, 90]):
            gm(b6, ts + j * 0.07, CELESTA, m, 52 - 5 * j, 0.5, gain=0.6, pan=0.3 + 0.05 * j, send=0.6, tail=3)
# final: one complete, clean D chord, left to decay on its own
fk = CH['Dadd9']
for k, m in enumerate(fk):
    gm(b6, final_t + 0.012 * k, PIANO, m, 54 - 2 * k, 6.5, gain=0.9, pan=(k / (len(fk) - 1) - 0.5) * 0.5, tail=5)
roll(b6, final_t, EPC, [62, 66, 69, 76], 54, 6.0, gain=0.8, spread=0.02, human=False, tail=5)
gm(b6f, final_t + 0.05, PIANO, 74, 42, 5.0, gain=0.9, pan=0.15, tail=5)
gm(b6f, final_t + 0.65, CELESTA, 86, 34, 1.0, gain=0.35, pan=0.3, send=0.7, tail=4)
for j, m in enumerate([50, 57, 62, 66]):
    gm(b6p, final_t - 0.05, WPAD, m + 12, 52, 5.5, gain=0.4, pan=(j - 1.5) * 0.45, tail=4)
end_fade0 = max(final_t + 5.0, D - 3.5)
g6 = [(anchor6 - 0.02, 0.0), (anchor6, 1.0), (end_fade0, 1.0), (D - 0.25, 0.0)]
gates['s6'] = gates['s6pad'] = gates['s6felt'] = g6

# ============================================================================= render
# windows where the voice must NOT duck the music (the score is deliberately silent there) -> mix.py
import json
os.makedirs(OUT, exist_ok=True)
json.dump({'no_duck': [[cut - 0.05, anchor6]], 'cut': cut, 'final': final_t, 'open_s4': open_t,
           'spark': spark_t, 'alarm': alarm_t, 'groove_s3': g0, 'splits_s5': L_on},
          open(f'{OUT}/music_meta.json', 'w'), indent=1)

master = np.zeros((N + n_of(PAD + 2), 2))
for b in buses:
    y = b.render()
    if b.name in gates:
        y = y * env_points(len(y), [(t - b.lo, g) for t, g in gates[b.name]])[:, None]
    y *= 10 ** (BUS_DB.get(b.name, 0.0) / 20)
    place(master, b.lo, y)
    print(f'  bus {b.name:9s} {b.lo:7.2f}s  peak {db(np.abs(y).max()):6.1f} dB')
master = master[:N]
master = filt(master, 'hp', 28, order=2)
# gentle glue
from pedalboard import Pedalboard, Compressor
pb = Pedalboard([Compressor(threshold_db=-20, ratio=1.8, attack_ms=25, release_ms=300)])
master = pb(master.T.astype(np.float32), SR).T.astype(np.float64)
peak = np.abs(master).max()
master *= 10 ** (-3 / 20) / peak        # music stem normalised to -3 dBFS sample peak; mix.py sets its level
master = limiter(master, -1.5)
master = fade(master, 0.01, 0.2)
write(f'{OUT}/music.wav', master)

# per-section report
for s in tl.d['scenes']:
    a, b_ = n_of(s['start']), n_of(s['end'])
    seg = master[a:b_]
    try: L = lufs(seg)
    except Exception: L = float('nan')
    print(f"  {s['id']:10s} {s['start']:7.2f}-{s['end']:7.2f}  {L:6.1f} LUFS  peak {db(np.abs(seg).max()):6.1f}")
if '--plot' in sys.argv:
    plot_tracks([('music', master)], tl, f'{OUT}/plot_music.png', 'music.wav')
