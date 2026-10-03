"""Original score + sync sound for 《先别急》 -> build/audio/mix.wav (stereo 48 kHz, -16 LUFS, true peak <= -1 dBTP).

Cinematic minimalism in D minor at the film's tempo (80 BPM), resolving to D major in the last chord.
The musical form is composed from build/timeline.json alone (beats are looked up by their visual type, steps by
name, every onset sits on the beat grid); build/cues.json adds sync hits on top (handlers for the whole BRIEF
vocabulary; unknown types are ignored). Nothing is hard-coded in seconds.

Theme ("先别急"): F5 - E5 - A4 (a falling sigh) ... answered by a stepwise climb back to D. It is heard at the
title, in e3's cadence (chain), and in the ending, where its first note finally becomes F#: the D major chord.

usage: python3 pipeline/audio/score.py [--plot]
"""
import os, sys, time
import numpy as np
from scipy import signal
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from common import *   # noqa

T_RUN = time.time()
tl = Timeline(); D = tl.duration
BPM = float(tl.d.get('bpm', 80)); BT = 60.0 / BPM; BAR = 4 * BT; E8 = BT / 2; S16 = BT / 4
NN = n_of(D) + n_of(3.0)            # working length (tails run past the end, cut at the end)
NOUT = n_of(D)                      # output length = timeline duration
CUES = sorted([c for c in tl.cues if isinstance(c.get('t'), (int, float))], key=lambda c: c['t'])
R = np.random.default_rng(1980)

# ================================================================ timeline lookup (by visual type / step name)
BEATS = tl.beats
BY_TYPE = {}
for _b in BEATS: BY_TYPE.setdefault(tl.btype(_b), _b)
def B(vtype): return BY_TYPE.get(vtype)
def steps(b): return (b or {}).get('visual', {}).get('steps', []) if b else []
def step(vtype, name):
    for s in steps(B(vtype)):
        if s.get('show') == name: return s
    return None
def T(vtype, name=None):
    b = B(vtype)
    if b is None: return None
    if name is None: return b['start']
    s = step(vtype, name); return s['t'] if s else None
def E(vtype, name=None):
    b = B(vtype)
    if b is None: return None
    if name is None: return b['end']
    s = step(vtype, name); return s['t'] + s['dur'] if s else None
def beat_of(t):
    for b in BEATS:
        if b['start'] - 1e-6 <= t < b['end'] - 1e-6: return b
    return BEATS[-1] if t >= BEATS[-1]['start'] else BEATS[0]
def step_of(t):
    b = beat_of(t)
    for s in steps(b):
        if s['t'] - 1e-6 <= t < s['t'] + s['dur'] - 1e-6: return b, s
    return b, None
def chap_of(t): return tl.chapter_of(t)['id']
def snap(t, g=BT): return round(t / g) * g
def grid(t0, t1, div):
    k = int(np.ceil((t0 - 1e-6) / div))
    while k * div < t1 - 1e-6:
        yield k, k * div; k += 1
def h01(k, seed=0):                 # deterministic hash -> [0, 1)
    x = (int(k) * 2654435761 + int(seed) * 40503 + 12345) & 0xffffffff
    x ^= x >> 15; x = (x * 2246822519) & 0xffffffff; x ^= x >> 13
    return (x % 100000) / 100000.0
def ok(*xs): return all(x is not None for x in xs)

# ================================================================ pitch / harmony
_PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
def m(s):
    if isinstance(s, (int, np.integer)): return int(s)
    p = _PC[s[0]]; i = 1
    while i < len(s) and s[i] in '#b': p += 1 if s[i] == '#' else -1; i += 1
    return 12 * (int(s[i:]) + 1) + p
def ms(*names): return [m(x) for x in names]
# chord: (bass, upper tones used by ostinati/pads, low-to-high)
CHORDS = {
    'Dm':      (m('D2'),  ms('D4', 'F4', 'A4')),
    'Dm9':     (m('D2'),  ms('D4', 'E4', 'F4', 'A4')),
    'Dm/F':    (m('F2'),  ms('D4', 'F4', 'A4')),
    'Dsus2':   (m('D2'),  ms('D4', 'E4', 'A4')),
    'Dsus4':   (m('D2'),  ms('D4', 'G4', 'A4')),
    'Dmaj9':   (m('D2'),  ms('D4', 'F#4', 'A4', 'E5')),
    'Bb':      (m('Bb1'), ms('Bb3', 'D4', 'F4')),
    'Bbmaj7':  (m('Bb1'), ms('Bb3', 'D4', 'F4', 'A4')),
    'Bbmaj7#11': (m('Bb1'), ms('D4', 'E4', 'F4', 'A4')),
    'Gm':      (m('G1'),  ms('G3', 'Bb3', 'D4')),
    'Gm9':     (m('G1'),  ms('Bb3', 'D4', 'F4', 'A4')),
    'Gm/Bb':   (m('Bb1'), ms('G3', 'Bb3', 'D4')),
    'F':       (m('F2'),  ms('F3', 'A3', 'C4', 'F4')),
    'Fmaj7/A': (m('A1'),  ms('F3', 'A3', 'C4', 'E4')),
    'C':       (m('C2'),  ms('C4', 'E4', 'G4')),
    'C6':      (m('C2'),  ms('C4', 'E4', 'G4', 'A4')),
    'Csus2':   (m('C2'),  ms('C4', 'D4', 'G4')),
    'C/E':     (m('E2'),  ms('C4', 'E4', 'G4')),
    'Em7b5':   (m('E2'),  ms('G3', 'Bb3', 'D4', 'E4')),
    'Asus4':   (m('A1'),  ms('A3', 'D4', 'E4')),
    'A':       (m('A1'),  ms('A3', 'C#4', 'E4')),
    'A7':      (m('A1'),  ms('G3', 'C#4', 'E4')),
}
HARM = []                                   # [(t0, t1, chord)]
def harm(t0, t1, names):
    """lay chords over [t0, t1): split in whole beats, in order"""
    if not ok(t0, t1) or t1 <= t0: return
    if isinstance(names, str): names = [names]
    nb = max(1, int(round((t1 - t0) / BT))); k = len(names)
    cuts = [t0 + BT * int(round(nb * i / k)) for i in range(k)] + [t1]
    for i, nm in enumerate(names): HARM.append((cuts[i], cuts[i + 1], nm))
def chord_at(t):
    for a, b, nm in reversed(HARM):
        if a - 1e-6 <= t < b: return nm
    return 'Dm9'
def chord_spans(t0, t1):
    out = []
    for a, b, nm in sorted(HARM):
        lo, hi = max(a, t0), min(b, t1)
        if hi > lo + 1e-6: out.append((lo, hi, nm))
    return out
DMIN = [0, 2, 3, 5, 7, 8, 10]              # natural minor from D
PENT = [0, 3, 5, 7, 10]                    # D minor pentatonic
def scale_note(deg, base=m('D4'), sc=DMIN):
    deg = int(deg); return base + 12 * (deg // len(sc)) + sc[deg % len(sc)]

# ================================================================ instruments + buses
ensure_sf2(); sf2 = SF2()
PNO, CEL, GLK, MBOX, VIB, MAR, TUB = 0, 8, 9, 10, 11, 12, 14
CELLO, CBASS, TREM, PIZZ, HARP, TIMP, STR, SSTR, CHOIR = 42, 43, 44, 45, 46, 47, 48, 49, 52
PAD, PADC, TAIKO = 89, 91, 116
CALKEY = {CBASS: m('D2'), CELLO: m('D3'), TIMP: m('D2'), TAIKO: m('D3')}
_CAL = {}
def cal(preset, drums=False):
    k = (preset, drums)
    if k not in _CAL:
        if drums: x = sf2.note(128, 0, preset, 100, 0.3, tail=0.4, drums=True)
        else: x = sf2.note(0, preset, CALKEY.get(preset, m('D4')), 100, 0.6, tail=0.4)
        r = np.sqrt((x[:n_of(0.5)] ** 2).mean()) + 1e-9
        _CAL[k] = 0.1 / r                   # every preset -> -20 dBFS RMS at velocity 100
    return _CAL[k]

class Bus:
    def __init__(s, name):
        s.name = name
        s.dry = np.zeros((NN, 2), np.float32); s.hall = np.zeros((NN, 2), np.float32); s.big = np.zeros((NN, 2), np.float32)
    def add(s, t, x, g=1.0, pan=0.0, rv=0.0, bg=0.0):
        if t >= D + 1.0 or g == 0: return
        place(s.dry, t, x, g, pan)
        if rv: place(s.hall, t, x, g * rv, pan)
        if bg: place(s.big, t, x, g * bg, pan)
    def render(s):
        print(f'  reverb {s.name} ...', flush=True)
        y = s.dry.astype(np.float64)
        if np.abs(s.hall).max() > 0: y += convolve(s.hall, IR_HALL) * 0.55
        if np.abs(s.big).max() > 0: y += convolve(s.big, IR_BIG) * 0.6
        return y
MUS, FX, POST = Bus('music'), Bus('fx'), Bus('post')
IR_HALL = make_ir(rt60=2.6, bright=0.5, seed=11, width=0.85)
IR_BIG = make_ir(rt60=7.0, bright=0.62, seed=23, width=0.95, predelay=0.03)

def local_env(n, pts):
    """envelope from [(local seconds, gain)], held after the last point"""
    return env_points(n, [(a, g) for a, g in pts])

def note(preset, key, t, dur, vel, g=1.0, pan=0.0, rv=0.3, bg=0.0, bus=None, tail=3.0, env=None):
    if t is None or t >= D + 0.5: return
    vel = int(np.clip(round(vel / 4) * 4, 4, 124))
    dur = max(0.05, round(dur / 0.05) * 0.05)
    x = sf2.note(0, preset, int(key), vel, dur, tail=tail)
    if env is not None: x = x * local_env(len(x), env)[:, None]
    (bus or MUS).add(t, x, g * cal(preset), pan, rv, bg)

def drum(key, t, vel, g=1.0, pan=0.0, rv=0.15, bus=None):
    if t is None or t >= D: return
    vel = int(np.clip(round(vel / 4) * 4, 4, 124))
    x = sf2.note(128, 0, key, vel, 0.25, tail=0.6, drums=True)
    (bus or MUS).add(t, x, g * cal(key, True), pan, rv, 0)

# ---------------------------------------------------------------- synthesis
_cache = {}
def cached(key, fn):
    if key not in _cache: _cache[key] = fn()
    return _cache[key]
def tvec(n): return np.arange(n) / SR
def sine(f, dur, tau=None, ph=0.0):
    n = n_of(dur); t = tvec(n); x = np.sin(2 * np.pi * f * t + ph)
    return x * np.exp(-t / tau) if tau else x
def wnoise(n, seed=None): return np.random.default_rng(seed).standard_normal(n)
def kick(f0=115, f1=44, tau=0.17, dur=0.7, click=0.25):
    def mk():
        n = n_of(dur); t = tvec(n); f = f1 + (f0 - f1) * np.exp(-t / 0.032)
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / tau) * np.minimum(1, t / 0.0015)
        c = filt(wnoise(n, 3), 'hp', 1500) * np.exp(-t / 0.0025) * click
        return x + c
    return cached(('kick', f0, f1, tau, dur, click), mk)
def hat(tau=0.014, f=7500, seed=0):
    def mk():
        n = n_of(0.12); t = tvec(n)
        return filt(filt(wnoise(n, 40 + seed), 'hp', f, order=2), 'peak', 10000, 1, 4) * np.exp(-t / tau)
    return cached(('hat', tau, f, seed), mk)
def shaker(seed=0):
    def mk():
        n = n_of(0.09); t = tvec(n)
        return filt(wnoise(n, 70 + seed), 'bp', 6200, q=1.2, order=2) * np.minimum(1, t / 0.006) * np.exp(-t / 0.022)
    return cached(('shk', seed), mk)
def tick(f=3200, tau=0.004, seed=0, body=0.0):
    def mk():
        n = n_of(0.06); t = tvec(n)
        x = filt(wnoise(n, 90 + seed), 'bp', f, q=2.5) * np.exp(-t / tau)
        if body: x += body * np.sin(2 * np.pi * f * 0.11 * t) * np.exp(-t / 0.01)
        return x / (np.abs(x).max() + 1e-9)
    return cached(('tick', f, tau, seed, body), mk)
def glass(f, dur=1.0, tau=0.3, seed=0):
    def mk():
        n = n_of(dur); t = tvec(n); rng = np.random.default_rng(seed)
        y = np.zeros(n)
        for r, a, k in [(1, 1, 1), (2.32, 0.5, 0.6), (4.25, 0.28, 0.4), (6.63, 0.16, 0.28), (9.4, 0.08, 0.2)]:
            if f * r < 19000: y += a * np.sin(2 * np.pi * f * r * t + rng.uniform(0, 6.28)) * np.exp(-t / (tau * k))
        return y * np.minimum(1, t / 0.0008)
    return cached(('glass', round(f, 1), dur, tau, seed), mk)
def bell(f, dur=4.0, tau=1.4):
    def mk():
        n = n_of(dur); t = tvec(n); y = np.zeros(n)
        for r, a, k in [(0.5, 0.35, 1.3), (1, 1, 1), (1.19, 0.25, 0.5), (1.5, 0.3, 0.6), (2.0, 0.45, 0.55), (2.74, 0.2, 0.3), (3.76, 0.1, 0.2)]:
            if f * r < 18000: y += a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / (tau * k))
        return y * np.minimum(1, t / 0.001) / 2
    return cached(('bell', round(f, 1), dur, tau), mk)
def pluck(midi, dur, bright=6.0, decay=0.25, nh=30):
    return cached(('pl', midi, round(dur, 3), bright, decay, nh),
                  lambda: pluck_additive(mtof(midi), dur, bright=bright, decay=decay, nh=nh, tilt=1.0) * 0.6)
def air(dur, f0, f1, q=0.9, seed=0):
    """band-passed noise sweeping f0 -> f1 (exponential)"""
    n = n_of(dur); x = to_stereo(wnoise(n, seed)) + 0.0
    x[:, 1] = wnoise(n, seed + 1)
    fc = f0 * (f1 / f0) ** (np.arange(n) / max(1, n - 1))
    return sweep(x, 'bp', fc, q=q)
def shepard(dur, rise_oct=2.0, base=40.0, n_oct=8, accel=1.6):
    n = n_of(dur); t = tvec(n); u = (t / dur) ** accel
    y = np.zeros(n); c = n_oct / 2
    for k in range(n_oct):
        p = (k + rise_oct * u) % n_oct
        f = base * 2 ** p
        a = np.exp(-((p - c) / (n_oct / 5.0)) ** 2)
        y += a * np.sin(2 * np.pi * np.cumsum(f) / SR)
    return y / n_oct

# ================================================================ global envelopes (freeze gate, hush/cancel duck)
GATE = []          # (t0, t1): true silence on music + fx
DUCK = []          # (t0, t1, depth, release)
DONE = {}          # sync-hit registry (form and cues share handlers; no double hits)
def seen(kind, t, win=0.12):
    ts = DONE.setdefault(kind, [])
    if any(abs(t - x) < win for x in ts): return True
    ts.append(t); return False
def gated(t): return any(a - 1e-6 <= t < b for a, b in GATE)
def cue_in(kind, t0, t1):
    return any(c.get('type') == kind and t0 - 0.05 <= c['t'] < t1 for c in CUES)

# ================================================================ sync-hit handlers (the BRIEF cue vocabulary)
def h_type(t, dur=1.0, **_):
    rng = np.random.default_rng(int(t * 1000)); x = t
    bus = POST if gated(t) else FX
    while x < t + dur:
        bus.add(x, tick(rng.choice([2600, 3100, 3600]), 0.003, int(rng.integers(0, 6)), body=0.25),
                0.035 * rng.uniform(0.6, 1.0), rng.uniform(-0.25, 0.25), rv=0.15)
        x += rng.uniform(0.065, 0.15)

def h_click(t, **_):
    if gated(t):                    # caret / keys in a frozen silence: a tiny soft click only
        POST.add(t, tick(2400, 0.003, 1, body=0.4), 0.03, 0.0, rv=0.1); return
    if seen('click', t, 0.05): return
    FX.add(t, tick(3800, 0.0025, 2, body=0.3), 0.05, 0.1, rv=0.2)
    up = CHORDS[chord_at(t)][1]; k = len(DONE['click']) % len(up)
    note(PIZZ, up[k] + 12, t, 0.3, 64, 0.22, 0.15, rv=0.35, bus=FX)

def h_chip(t, i=0, **_):
    if seen('chip', t): return
    up = sorted(set([p % 12 for p in CHORDS[chord_at(t)][1]]))
    seq = [m('A5'), m('C6'), m('D6'), m('F6'), m('A6')]
    k = seq[int(i) % len(seq)] if i is not None else seq[0]
    note(GLK, k, t, 0.4, 84, 0.42, -0.3 + 0.3 * (int(i) % 3), rv=0.45, bus=FX)
    note(CEL, k - 12, t, 0.5, 80, 0.32, 0.0, rv=0.45, bus=FX)
    FX.add(t, bell(mtof(k), 2.0, 0.5), 0.05, 0.2, rv=0.4)

def h_punch(t, **_):
    if seen('punch', t, 0.2): return
    root = CHORDS[chord_at(t)][0]
    FX.add(t, kick(130, 42, 0.32, 1.2, 0.5), 0.75, 0, rv=0.25)
    n = n_of(0.35); FX.add(t, filt(wnoise(n, 5), 'bp', 1800, q=0.7) * np.exp(-tvec(n) / 0.03), 0.12, 0, rv=0.4)
    note(PNO, root, t, 1.2, 108, 0.75, -0.05, rv=0.4, bus=FX)
    note(PNO, root + 12, t, 1.2, 100, 0.5, 0.05, rv=0.4, bus=FX)
    note(TIMP, root + 12, t, 1.0, 110, 0.55, 0, rv=0.3, bus=FX)

def h_hush(t, dur=None, **_):
    if seen('hush', t, 0.3): return
    b = beat_of(t); t1 = t + dur if dur else b['end']
    DUCK.append((t, t1 - 0.06, 0.02, 0.06))   # back to full exactly at t1
    # the single sustained note (fx bus: not ducked), a breath that leans into what comes next
    L = t1 - t
    note(SSTR, m('A4'), t + 0.05, L - 0.1, 64, 0.30, 0.1, rv=0.6, bg=0.3, bus=FX, tail=1.5,
         env=[(0, 0.0), (0.4, 0.8), (L * 0.6, 0.7), (L - 0.05, 1.0)])
    FX.add(t + 0.05, sine(mtof(m('A5')), L, None) * local_env(n_of(L), [(0, 0), (1.0, 1), (L - 0.4, 1), (L, 0)]), 0.006, 0.0, rv=0.5)
    # an inhaled reverse air into the drop
    a = air(0.5, 6000, 1200, seed=17)[::-1] * np.linspace(0, 1, n_of(0.5))[:, None] ** 2
    FX.add(t - 0.5, a, 0.05, 0, rv=0.3)

def h_heartbeat(t, k=0, **_):
    if seen('heartbeat', t, 0.1): return
    k = float(k or 0); g = 0.42 + 0.05 * min(k, 11)
    x = filt(kick(85, 46, 0.13, 0.6, 0.0), 'lp', 260)
    y = filt(kick(78, 44, 0.11, 0.6, 0.0), 'lp', 240)
    bus = POST if gated(t) else FX
    bus.add(t, x, g, 0, rv=0.12); bus.add(t + 0.19, y, g * 0.62, 0, rv=0.12)

def h_riser(t, dur=3.0, bus=None, g=1.0, **_):
    if seen('riser', t, 0.3): return
    dur = max(0.3, dur); n = n_of(dur); u = np.arange(n) / n
    a = air(dur, 300, 6000, q=1.4, seed=int(t * 10)) * (u ** 2.2)[:, None]
    f = mtof(CHORDS[chord_at(t)][0] + 24) * 2 ** (u * 1.0)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * (u ** 2.5) * 0.25
    x = (a * 0.5 + to_stereo(tone)) * local_env(n, [(0, 1), (dur - 0.04, 1), (dur, 0)])[:, None]
    (bus or FX).add(t, x, 0.16 * g, 0, rv=0.3)

def crack(t, g=1.0, bus=None):
    """a tiny glassy crack"""
    bus = bus or FX; rng = np.random.default_rng(int(t * 100))
    for j in range(5):
        f = mtof(m('D7')) * rng.uniform(0.7, 1.6)
        bus.add(t + rng.uniform(0, 0.05), glass(f, 0.35, 0.05, j), 0.035 * g * rng.uniform(0.5, 1), rng.uniform(-0.4, 0.4), rv=0.25)
    n = n_of(0.05); bus.add(t, filt(wnoise(n, 9), 'hp', 4000) * np.exp(-tvec(n) / 0.006), 0.05 * g, 0.1, rv=0.2)

def h_freeze(t, dur=None, **_):
    if seen('freeze', t, 0.3): return
    if dur: t1 = t + dur
    else:
        b, s = step_of(t); t1 = s['t'] + s['dur'] if s else min(b['end'], t + 2 * BT)
    GATE.append((t, t1))
    # the crack decays to digital zero within ~0.4 s; afterwards true silence until t1
    rng = np.random.default_rng(7)
    for j in range(4):
        f = mtof(m('A6')) * rng.uniform(0.9, 1.7)
        x = glass(f, 0.4, 0.04, j) * local_env(n_of(0.4), [(0, 1), (0.25, 1), (0.4, 0)])
        POST.add(t + 0.01 + j * 0.012, x, 0.03, rng.uniform(-0.5, 0.5))

def h_silence(t, dur=1.5, **_):
    GATE.append((t, t + max(0.05, dur)))

def h_shatter(t, **_):
    if seen('shatter', t, 0.3): return
    big = tl.btype(beat_of(t)) == 'title'
    if not big:
        crack(t, 1.6); note(CEL, m('D6'), t, 0.4, 60, 0.12, 0.2, rv=0.5, bg=0.4, bus=FX)
        FX.add(t, glass(mtof(m('A6')), 1.5, 0.4), 0.03, -0.3, rv=0.4, bg=0.6)
        return
    # crystalline burst: ~90 glass grains in D minor pentatonic, dense at the impact, thinning out, huge reverb
    rng = np.random.default_rng(25)
    pool = [m(x) for x in ('D6', 'F6', 'G6', 'A6', 'C7', 'D7', 'F7', 'A7', 'E6', 'A5')]
    for i in range(90):
        dt = 2.6 * rng.random() ** 2.4
        f = mtof(pool[rng.integers(len(pool))]) * (1 + rng.normal(0, 0.0015))
        a = 0.06 * (1 - dt / 2.7) ** 1.3 * rng.uniform(0.35, 1)
        FX.add(t + dt, glass(f, 1.6, rng.uniform(0.12, 0.5), i % 7), a, rng.uniform(-0.95, 0.95), rv=0.3, bg=1.1)
    for i, k in enumerate(['A6', 'D6', 'F6', 'E6', 'C7', 'A5', 'D7', 'G6']):
        dt = 0.04 + 1.8 * (i / 8) ** 1.6 + rng.uniform(0, 0.08)
        note(CEL if i % 2 else GLK, m(k), t + dt, 0.6, 76 - i * 4, 0.16, rng.uniform(-0.8, 0.8), rv=0.3, bg=1.0, bus=FX)
    n = n_of(0.25); FX.add(t, filt(wnoise(n, 31), 'hp', 2500) * np.exp(-tvec(n) / 0.02), 0.10, 0, rv=0.2, bg=0.8)
    FX.add(t, filt(kick(70, 34, 0.5, 1.5, 0.0), 'lp', 200), 0.35, 0, bg=0.4)

def h_gather(t, dur=4.0, **_):
    """slow reversed swell that lands exactly at t + dur"""
    if seen('gather', t, 0.3): return
    dur = max(0.5, dur); big = tl.btype(beat_of(t)) == 'title'
    tgt = 'Dm9' if big else chord_at(t + dur + 0.01)
    bass, up = CHORDS[tgt]
    L = dur + 1.0; loc = np.zeros((n_of(L) + n_of(6), 2))
    def put(preset, key, vel, g):
        x = sf2.note(0, preset, key, vel, 1.6, tail=2.0) * cal(preset) * g; place(loc, 0.0, x)
    for k in up: put(SSTR, k, 92, 0.6); put(PNO, k + 12, 80, 0.5)
    put(PNO, bass + 12, 90, 0.6); put(CEL, up[-1] + 12, 90, 0.4)
    wet = convolve(loc, IR_BIG) * 1.2 + loc * 0.2
    r = wet[:n_of(dur)][::-1].copy()
    r *= local_env(len(r), [(0, 0), (dur * 0.5, 0.25), (dur - 0.03, 1.0), (dur, 0.0)])[:, None]
    MUS.add(t, r, 0.7 if big else 0.45, 0)

def h_title(t, **_):
    """the title chord: one low piano note + a soft D minor add9 pad, long tail; the theme's head on celesta"""
    if seen('title', t, 0.3): return
    b = beat_of(t); L = max(3.0, b['end'] - t) + 2.0
    note(PNO, m('D1'), t, 6.0, 96, 1.0, -0.05, rv=0.4, bg=0.7, tail=8)
    note(PNO, m('D2'), t, 6.0, 72, 0.6, 0.05, rv=0.4, bg=0.7, tail=8)
    for k, p in zip(['D3', 'A3', 'E4', 'F4', 'A4'], [-0.4, -0.2, 0.0, 0.2, 0.4]):
        note(PAD, m(k), t, L, 56, 0.20, p, rv=0.3, bg=0.6, tail=5, env=[(0, 0), (0.9, 1)])
        note(SSTR, m(k), t + 0.1, L, 52, 0.32, -p, rv=0.4, bg=0.6, tail=5, env=[(0, 0), (1.5, 1)])
    note(CHOIR, m('A4'), t + 0.4, L - 0.4, 48, 0.12, 0.0, rv=0.4, bg=0.8, tail=5, env=[(0, 0), (2.0, 1)])
    theme_head(t + BT, CEL, 70, 0.5, bus=MUS, bg=0.9)
    theme_head(t + BT, PNO, 52, 0.35, bus=MUS, bg=0.6, oct=0)

def theme_head(t, preset, vel, g, bus=None, bg=0.5, oct=0, unit=BT):
    for k, (nm, d) in enumerate([('F5', 1), ('E5', 1), ('A4', 3)]):
        note(preset, m(nm) + 12 * oct, t, d * unit * 1.1, vel - 4 * k, g, 0.1, rv=0.4, bg=bg, bus=bus, tail=4)
        t += d * unit

def h_ticks(t, dur=1.0, n=8, p0=0.2, p1=0.8, **_):
    """a run of n soft ticks (beads lighting): musical (32nd grid, D minor pentatonic), never a machine-gun"""
    n = int(max(1, n or 1)); dur = max(0.0, float(dur or 0)); p0 = float(p0 if p0 is not None else 0.2); p1 = float(p1 if p1 is not None else p0)
    div = S16 / 2
    mm = int(min(n, max(1, dur / div)))
    slots = sorted(set(int(round((t + (dur * i / mm if mm > 1 else 0)) / div)) for i in range(mm)))
    ch = chap_of(t); g0 = 0.11 / np.sqrt(max(1.0, len(slots) / 6))
    for i, s in enumerate(slots):
        tt = s * div; u = i / max(1, len(slots) - 1)
        p = np.clip(p0 + (p1 - p0) * u, 0, 1)
        key = scale_note(round(p * 12), m('A4'), PENT)
        inst = MAR if ch == 'e3' and i % 2 else (GLK if i % 4 == 3 else CEL)
        if gated(tt): continue
        note(inst, key, tt, 0.25, 64 - (6 if i % 2 else 0), g0, np.sin(i * 1.7) * 0.5, rv=0.45, bg=0.15, bus=FX, tail=1.5)
    if n > len(slots) * 1.5 and dur > 0.3:     # many more beads than notes: a faint glittering bed
        a = air(dur, 5000, 9000, q=2, seed=n) * np.hanning(n_of(dur))[:, None]
        FX.add(t, a, 0.012, 0, rv=0.4)

def h_sweep(t, dur=2.0, **_):
    """soft airy glissando"""
    if seen('sweep', t, 0.3): return
    dur = max(0.4, dur); k0 = 10; k1 = 26; cnt = int(min(24, dur * 8))
    for i in range(cnt):
        u = i / max(1, cnt - 1); key = scale_note(k0 + (k1 - k0) * u, m('D3'), PENT)
        note(HARP, key, t + dur * 0.85 * u ** 1.2, 0.6, 50 + int(16 * np.sin(np.pi * u)), 0.18, -0.6 + 1.2 * u, rv=0.5, bg=0.3, bus=FX)
    a = air(dur, 900, 7000, q=1.1, seed=5) * np.sin(np.pi * np.linspace(0, 1, n_of(dur)))[:, None] ** 1.5
    FX.add(t, a, 0.03, 0, rv=0.4)

def h_stamp(t, **_):
    if seen('stamp', t, 0.3): return
    root = CHORDS[chord_at(t)][0]
    note(TAIKO, m('D3'), t, 0.8, 120, 0.85, 0, rv=0.35, bg=0.25, bus=FX)
    note(TIMP, root + 12, t, 1.6, 120, 0.7, 0, rv=0.35, bg=0.25, bus=FX)
    FX.add(t, kick(90, 33, 0.55, 2.0, 0.6), 0.6, 0, rv=0.2, bg=0.3)
    n = n_of(0.8); w = filt(wnoise(n, 41), 'lp', 900) * np.exp(-tvec(n) / 0.12)
    FX.add(t, w, 0.08, 0, rv=0.4, bg=0.3)

def h_roll(t, dur=1.5, **c):
    """odometer: an arpeggio (16ths) whose pitch follows the number"""
    fr = float(c.get('from', 0)); to = float(c.get('to', fr)); dur = max(0.2, float(dur or 1.5))
    def deg(v): return v / 3.0
    cnt = max(1, int(round(dur / S16)))
    for k in range(cnt):
        tt = t + k * S16; u = k / cnt; s = u * u * (3 - 2 * u)
        v = fr + (to - fr) * s
        key = scale_note(round(deg(v)) + [0, 2, 4, 2][k % 4], m('D4'))
        note(CEL if k % 2 == 0 else MAR, key, tt, 0.22, 60 + (8 if k % 4 == 0 else 0), 0.16, 0.25 * np.sin(k), rv=0.4, bus=FX, tail=1.2)
    kf = scale_note(round(deg(to)), m('D4'))
    note(CEL, kf, t + dur, 1.2, 76, 0.24, 0, rv=0.45, bg=0.3, bus=FX)
    note(VIB, kf - 12, t + dur, 1.2, 70, 0.20, 0, rv=0.45, bus=FX)

def h_whoosh(t, dur=1.0, **_):
    dur = max(0.2, dur); n = n_of(dur)
    a = air(dur, 400, 3500, q=0.8, seed=int(t * 7)) * np.sin(np.pi * np.linspace(0, 1, n))[:, None] ** 2
    a[:, 0] *= np.linspace(1.2, 0.5, n); a[:, 1] *= np.linspace(0.5, 1.2, n)
    FX.add(t, a, 0.06, 0, rv=0.3)

def h_swell(t, dur=3.0, **_):
    if seen('swell', t, 0.3): return
    dur = max(0.5, dur); bass, up = CHORDS[chord_at(t + dur * 0.5)]
    env = [(0, 0), (dur, 1), (dur + 0.6, 0.6)]
    for j, k in enumerate(up):
        note(SSTR, k, t, dur + 0.6, 84, 0.20, -0.4 + 0.8 * j / max(1, len(up) - 1), rv=0.5, bg=0.4, bus=FX, tail=3, env=env)
    note(CELLO, bass + 12, t, dur + 0.6, 84, 0.22, 0, rv=0.4, bus=FX, tail=3, env=env)
    a = air(dur, 500, 3000, q=0.8, seed=9) * np.linspace(0, 1, n_of(dur))[:, None] ** 2
    FX.add(t, a, 0.02, 0, rv=0.4)

def h_cancel(t, **_):
    """P(D) annihilation: reversed cymbal into a bright bell chime, then a moment of space"""
    if seen('cancel', t, 0.3): return
    L = 2 * BT; n = n_of(L); tt = tvec(n)
    cym = filt(to_stereo(wnoise(n, 12)) + 0.0, 'hp', 2500) * np.exp(-tt / 0.6)[:, None]
    cym[:, 1] = filt(wnoise(n, 13), 'hp', 2500) * np.exp(-tt / 0.6)
    met = sum(np.sin(2 * np.pi * f * tt) * np.exp(-tt / 0.5) for f in (3150, 4420, 5870, 7240)) * 0.15
    rc = (cym + to_stereo(met))[::-1] * local_env(n, [(0, 0), (L - 0.02, 1), (L, 0)])[:, None]
    FX.add(t - L, rc, 0.05, 0, rv=0.4)
    for k, g in [(m('D6'), 0.06), (m('A6'), 0.035), (m('F#6') if chap_of(t) == 'e6' else m('E6'), 0.02)]:
        FX.add(t, bell(mtof(k), 4.5, 1.3), g, 0.15, rv=0.5, bg=0.6)
    note(TUB, m('D5'), t, 2.0, 84, 0.25, -0.1, rv=0.5, bg=0.6, bus=FX)
    note(GLK, m('A6'), t, 0.6, 76, 0.18, 0.2, rv=0.5, bg=0.6, bus=FX)
    DUCK.append((t, t + 1.5 * BT, 0.18, 0.5))

def h_thud(t, **_):
    """a dull nothing: heavy, muted, dry; the music does not react"""
    if seen('thud', t, 0.15): return
    n = n_of(0.5)
    x = filt(kick(70, 48, 0.09, 0.5, 0.0), 'lp', 180) + filt(wnoise(n, 77), 'lp', 300) * np.exp(-tvec(n) / 0.025) * 0.5
    FX.add(t, x, 0.55, 0, rv=0.06)

def h_glitch(t, **_):
    rng = np.random.default_rng(int(t * 1000) % 99991)
    seg = n_of(rng.uniform(0.012, 0.03))
    base = rng.standard_normal(seg) * 0.5 + np.sin(2 * np.pi * rng.uniform(800, 4000) * tvec(seg))
    reps = int(rng.integers(3, 7)); parts = []
    for r in range(reps): parts.append(base[:max(8, int(seg * (1 - r / (reps + 1))))])
    x = np.concatenate(parts); x = np.round(x * 6) / 6
    x = filt(x, 'lp', 9000) * np.hanning(len(x)) ** 0.3
    (POST if gated(t) else FX).add(t, x, 0.035, rng.uniform(-0.7, 0.7), rv=0.1)

def h_stream(t, dur=2.0, **_):
    dur = max(0.2, dur); rng = np.random.default_rng(int(t * 31))
    if chap_of(t) == 'e5':        # data: rapid quiet blips
        x = t
        while x < t + dur:
            f = mtof(scale_note(int(rng.integers(14, 30)), m('D4'), PENT))
            FX.add(x, sine(f, 0.04, 0.01), 0.018, rng.uniform(-0.8, 0.8), rv=0.15)
            x += S16 / 2
    else:                         # light: soft glitter on the pentatonic, drifting across
        cnt = int(dur * 5)
        for i in range(cnt):
            u = i / max(1, cnt - 1)
            k = scale_note(int(rng.integers(10, 20)), m('D4'), PENT)
            note(CEL if i % 3 else HARP, k, t + u * dur, 0.4, 44, 0.08, -0.7 + 1.4 * u, rv=0.5, bg=0.4, bus=FX)
        FX.add(t, air(dur, 3000, 6000, q=2, seed=2) * np.hanning(n_of(dur))[:, None], 0.012, 0, rv=0.4)

def h_resolve(t, **_):
    if seen('resolve', t, 0.3): return
    bass, up = CHORDS[chord_at(t + 0.05)]
    for j, k in enumerate([bass + 12] + up + [up[0] + 12]):
        note(HARP, k, t + j * 0.05, 1.5, 62, 0.22, -0.4 + 0.15 * j, rv=0.5, bg=0.4, bus=FX)
    FX.add(t, bell(mtof(up[0] + 24), 3.5, 1.2), 0.03, 0.1, rv=0.5, bg=0.5)

HANDLERS = {'type': h_type, 'punch': h_punch, 'chip': h_chip, 'hush': h_hush, 'riser': h_riser, 'heartbeat': h_heartbeat,
            'freeze': h_freeze, 'shatter': h_shatter, 'gather': h_gather, 'title': h_title, 'ticks': h_ticks,
            'sweep': h_sweep, 'stamp': h_stamp, 'roll': h_roll, 'whoosh': h_whoosh, 'swell': h_swell, 'cancel': h_cancel,
            'thud': h_thud, 'click': h_click, 'glitch': h_glitch, 'stream': h_stream, 'silence': h_silence,
            'resolve': h_resolve}
def anchor(kind, vtype, name, **kw):
    """a form-level hit at a step start, unless the template already cues this kind inside that step"""
    t0, t1 = T(vtype, name), E(vtype, name)
    if not ok(t0): return
    if cue_in(kind, t0, t1): return
    HANDLERS[kind](t0, **kw)

# ================================================================ composition helpers
def ostinato(t0, t1, preset, cell, vel=48, g=1.0, pan=0.0, rv=0.3, bg=0.0, octave=0, dens=(1.0, 1.0), dur=E8 * 1.5,
             div=E8, seed=1, human=0.005, accent=6, bus=None, tail=2.0, phase=0):
    """cell entries: None (rest) or chord-tone index (int; >= len(tones) wraps up an octave); aligned to the global grid"""
    if not ok(t0, t1): return
    rng = np.random.default_rng(seed)
    for k, t in grid(t0, t1, div):
        c = cell[(k + phase) % len(cell)]
        if c is None: continue
        u = (t - t0) / max(1e-6, t1 - t0); d = dens[0] + (dens[1] - dens[0]) * u
        if h01(k, seed) > d: continue
        tones = CHORDS[chord_at(t + 0.01)][1]
        key = tones[c % len(tones)] + 12 * (c // len(tones) + octave)
        v = vel + (accent if (k + phase) % len(cell) == 0 else 0) + int(rng.integers(-3, 4))
        note(preset, key, t + (rng.uniform(0, human) if human else 0), dur, v, g, pan, rv=rv, bg=bg, bus=bus, tail=tail)

def pads(t0, t1, preset, vel=50, g=0.3, rv=0.4, bg=0.3, octave=0, fi=0.6, fo=None, overlap=0.4, spread=0.6, which=None, bass=False, tail=3.0):
    """sustained chord tones following the harmony map over [t0, t1)"""
    if not ok(t0, t1): return
    spans = chord_spans(t0, t1)
    for j, (a, b, nm) in enumerate(spans):
        bs, up = CHORDS[nm]
        keys = [bs + 12 * (1 + octave)] if bass else [k + 12 * octave for k in (up if which is None else [up[i] for i in which if i < len(up)])]
        L = b - a + overlap
        for i, k in enumerate(keys):
            p = 0 if len(keys) == 1 else -spread + 2 * spread * i / (len(keys) - 1)
            env = [(0, 0 if (j == 0 and fi) else 0.6), (fi if j == 0 and fi else 0.15, 1.0)]
            if fo and j == len(spans) - 1: env += [(max(0.2, L - fo), 1.0), (L, 0.0)]
            note(preset, k, a, L, vel, g, p, rv=rv, bg=bg, tail=tail, env=env)

def basses(t0, t1, preset, vel=60, g=0.5, octave=1, rv=0.3, every=None, dur=None, tail=2.0):
    """chord roots: one per chord (or every `every` seconds)"""
    if not ok(t0, t1): return
    for a, b, nm in chord_spans(t0, t1):
        times = [a] if not every else [x for _, x in grid(a, b, every)]
        for x in times:
            note(preset, CHORDS[nm][0] + 12 * octave, x, dur or (b - x if not every else every), vel, g, 0, rv=rv, tail=tail)

def melody(t, seq, preset, vel=60, g=0.5, pan=0.0, rv=0.4, bg=0.4, unit=BT, legato=1.05, oct=0, bus=None, tail=3.0):
    for nm, d in seq:
        if nm: note(preset, m(nm) + 12 * oct, t, d * unit * legato, vel, g, pan, rv=rv, bg=bg, bus=bus, tail=tail)
        t += d * unit
    return t

def perc_grid(t0, t1, kind, g, div=S16, accent=None, pan=0.0, seed=0, prob=1.0, rv=0.1):
    if not ok(t0, t1): return
    for k, t in grid(t0, t1, div):
        a = accent[k % len(accent)] if accent else 1.0
        if a <= 0 or h01(k, seed + 7) > prob: continue
        if kind == 'hat': x = hat(0.012 if a < 0.8 else 0.02, 7500, k % 4)
        elif kind == 'shaker': x = shaker(k % 5)
        elif kind == 'tick': x = tick(4200, 0.002, k % 3, body=0.0)
        MUS.add(t, x, g * a, pan + 0.15 * np.sin(k * 0.9), rv=rv)

def synth_line(t0, t1, keys_fn, div, dur, g, bright=(4.0, 4.0), decay=0.18, pan=0.0, rv=0.2, nh=30, detune=False, seed=0, vel_fn=None):
    if not ok(t0, t1): return
    for k, t in grid(t0, t1, div):
        key = keys_fn(k, t)
        if key is None: continue
        u = (t - t0) / max(1e-6, t1 - t0); br = round(bright[0] + (bright[1] - bright[0]) * u, 1)
        a = g * (vel_fn(k, t) if vel_fn else 1.0)
        x = pluck(int(key), dur, br, decay, nh)
        if detune:
            y = pluck(int(key), dur, br, decay * 0.9, nh)
            st = np.stack([x, np.roll(y, 23)], 1)
            MUS.add(t, st, a, pan, rv=rv)
        else:
            MUS.add(t, x, a, pan, rv=rv)

def ring_kick(t0, t1, pattern, g, div=E8, f0=110, tau=0.18):
    if not ok(t0, t1): return
    for k, t in grid(t0, t1, div):
        a = pattern[k % len(pattern)]
        if a: MUS.add(t, kick(f0, 44, tau, 0.7, 0.2), g * a, 0, rv=0.05)

# ================================================================ HARMONY (from the timeline structure)
H = harm
# e0
if B('pitch'):
    b = B('pitch'); t0 = b['start']
    for k, nm in enumerate(['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb']):
        H(t0 + k * BAR, min(b['end'], t0 + (k + 1) * BAR), nm)
H(T('gut'), E('gut'), 'Dm')
H(T('title'), E('title', 'form'), 'Dm9'); H(T('title', 'sub'), E('title'), 'Dm9')
# e1
H(T('thousand', 'fact'), E('thousand', 'fact'), 'Dm9'); H(T('thousand', 'fall'), E('thousand', 'fall'), 'Bbmaj7')
H(T('thousand', 'count'), E('thousand', 'count'), 'Fmaj7/A')
H(T('baserate', 'sweep'), E('baserate', 'sweep'), 'Gm9'); H(T('baserate', 'one'), E('baserate', 'one'), 'Dm9')
H(T('baserate', 'gather'), E('baserate', 'gather'), ['Bbmaj7#11', 'C6']); H(T('baserate', 'gap'), E('baserate', 'gap'), 'Dsus2')
H(T('nine', 'need'), E('nine', 'need'), 'Dm9'); H(T('nine', 'membrane'), E('nine', 'membrane'), ['Bbmaj7#11', 'C6'])
H(T('nine', 'result'), E('nine', 'result'), 'Dmaj9'); H(T('nine', 'rare'), E('nine', 'rare'), 'Dm')
# e2
H(T('worlds', 'stop'), E('worlds', 'stop'), 'Dm9'); H(T('worlds', 'form'), E('worlds', 'form'), ['Bbmaj7', 'C6'])
H(T('worlds', 'orbit'), E('worlds', 'orbit'), 'Fmaj7/A'); H(T('worlds', 'flow'), E('worlds', 'flow'), ['Gm9', 'Asus4'])
H(T('missing', 'claim'), E('missing', 'claim'), 'Dm9'); H(T('missing', 'reveal'), E('missing', 'reveal'), 'Dm9')
H(T('missing', 'real'), E('missing', 'real'), 'Bbmaj7#11'); H(T('missing', 'humble'), E('missing', 'humble'), ['Gm9', 'Asus4'])
# e3
H(T('pie_vs_odds', 'pie'), E('pie_vs_odds', 'pie'), ['Dm', 'Em7b5']); H(T('pie_vs_odds', 'tug'), E('pie_vs_odds', 'tug'), ['Dm', 'C'])
H(T('pie_vs_odds', 'rel'), E('pie_vs_odds', 'rel'), 'Bbmaj7')
H(T('equation', 'rule'), E('equation', 'rule'), ['Dm9', 'Bbmaj7']); H(T('equation', 'lr'), E('equation', 'lr'), ['Gm9', 'Asus4'])
H(T('equation', 'fraction'), E('equation', 'fraction'), ['Bbmaj7', 'C']); H(T('equation', 'cancel'), E('equation', 'cancel'), 'F')
H(T('equation', 'only'), E('equation', 'only'), ['F', 'C/E'])
H(T('evidence1', 'stamp'), E('evidence1', 'stamp'), 'Dm'); H(T('evidence1', 'light'), E('evidence1', 'light'), ['Dm9', 'Bbmaj7'])
H(T('evidence1', 'stream'), E('evidence1', 'stream'), ['Gm9', 'C']); H(T('evidence1', 'ratio'), E('evidence1', 'ratio'), ['F', 'C/E'])
H(T('evidence1', 'note'), E('evidence1', 'note'), ['Bbmaj7', 'Asus4'])
H(T('evidence2', 'stamp'), E('evidence2', 'stamp'), 'Dm'); H(T('evidence2', 'filter'), E('evidence2', 'filter'), ['Gm', 'Em7b5'])
H(T('evidence2', 'ratio'), E('evidence2', 'ratio'), ['Bbmaj7', 'Asus4']); H(T('evidence2', 'ghost'), E('evidence2', 'ghost'), ['Dm/F', 'Bbmaj7#11'])
H(T('noise', 'drop'), E('noise', 'nothing'), 'Dm9')
H(T('noise', 'text'), E('noise', 'text'), ['Bbmaj7', 'C']); H(T('noise', 'chain'), E('noise', 'chain'), ['Gm9', 'A', 'Dm9'])
# e4
H(T('threshold', 'calc'), E('threshold', 'calc'), 'Gm9'); H(T('threshold', 'lever'), E('threshold', 'lever'), ['Bbmaj7', 'C'])
H(T('threshold', 'line'), E('threshold', 'line'), 'Dm/F'); H(T('threshold', 'go'), E('threshold', 'go'), 'F')
H(T('other', 'heavy'), E('other', 'heavy'), ['Dm', 'Gm/Bb']); H(T('other', 'slide'), E('other', 'slide'), ['Gm', 'Em7b5'])
H(T('other', 'split'), E('other', 'split'), ['Bbmaj7', 'A7']); H(T('other', 'both'), E('other', 'both'), 'Dm9')
H(T('gap', 'zoom'), E('gap', 'zoom'), 'Dsus2'); H(T('gap', 'do'), E('gap'), 'Dsus4')
# e5
H(T('ai', 'burst'), E('ai', 'burst'), ['Dm9', 'Bbmaj7']); H(T('ai', 'flood'), E('ai', 'flood'), ['Gm9', 'C'])
H(T('ai', 'fast'), E('ai', 'fast'), 'A')
H(T('human', 'freeze'), E('human', 'cursor'), 'Dsus2'); H(T('human', 'decide'), E('human', 'decide'), 'Bbmaj7')
H(T('human', 'rope'), E('human', 'rope'), ['Gm9', 'Asus4']); H(T('human', 'who'), E('human', 'who'), ['Bbmaj7', 'Csus2'])
# e6
H(T('recall', 'flash'), E('recall', 'flash'), 'Dm'); H(T('recall', 'slow'), E('recall', 'slow'), 'Dm9')
H(T('recall', 's1'), E('recall', 's1'), 'Bbmaj7'); H(T('recall', 's2'), E('recall', 's2'), 'Gm9')
H(T('recall', 's3'), E('recall', 's3'), 'F'); H(T('recall', 's4'), E('recall', 's4'), ['C', 'Bbmaj7', 'A'])
H(T('end', 'l1'), E('end', 'l1'), ['Dm', 'Bbmaj7', 'Gm9']); H(T('end', 'l2'), E('end', 'l2'), ['Asus4', 'A', 'A7'])
H(T('end', 'final'), E('end', 'final'), 'Dmaj9')

# ================================================================ FORM
print('composing ...', flush=True)
for c in CUES:                      # the silences first, so every hit knows where the film is frozen
    if c.get('type') == 'freeze': h_freeze(float(c['t']), dur=c.get('dur'))
    if c.get('type') == 'silence': h_silence(float(c['t']), dur=c.get('dur', 1.5)); c['_done'] = 1

# ---------------------------------------------------------------- e0 · b01 pitch: the confident "sales" groove
if B('pitch'):
    t0 = T('pitch'); t_h = next((c['t'] for c in CUES if c.get('type') == 'hush' and t0 <= c['t'] < E('pitch')), T('pitch', 'q1'))
    t_m = T('pitch', 'money') or t0 + BAR; t_tag = T('pitch', 'tag1') or t_m + BAR
    span = max(1e-3, t_h - t0)
    # muted synth bass 8ths, opening its filter as the pitch rises
    oc = [0, 0, 12, 0, 0, 12, 0, 12]
    synth_line(t0, t_h, lambda k, t: CHORDS[chord_at(t + 0.01)][0] + 12 + oc[k % 8], E8, 0.34, 0.20, bright=(2.5, 7.5), decay=0.16,
               vel_fn=lambda k, t: (1.0 if k % 2 == 0 else 0.72) * (0.6 + 0.4 * (t - t0) / span))
    # tight ticks (16ths, accented off-beats), side stick on 2 & 4 after the money, kick 1 / 2& / 3
    perc_grid(t0, t_h, 'hat', 0.05, S16, accent=[0.5, 0.3, 1.0, 0.3])
    for k, t in grid(t_m, t_h, BT):
        if k % 2 == 1: drum(37, t, 80, 0.10, 0.1)
    ring_kick(t_m, t_h, [1, 0, 0, 0.55, 1, 0, 0, 0], 0.32)
    # staccato strings on the off-beats, a register higher with each chip
    for k, t in grid(t_tag, t_h, E8):
        if k % 2 == 0: continue
        up = CHORDS[chord_at(t)][1]; lift = 12 if t >= (T('pitch', 'tag3') or 1e9) else 0
        for j, kk in enumerate(up[:3]): note(STR, kk + lift, t, 0.14, 84, 0.13, -0.3 + 0.3 * j, rv=0.25, tail=0.8)
        note(PIZZ, up[-1] + 12 + lift, t, 0.2, 80, 0.12, 0.3, rv=0.25)
    # piano chord on each bar line from the money on (confident)
    for a, b_, nm in chord_spans(t_m, t_h):
        bs, up = CHORDS[nm]
        for j, kk in enumerate([bs + 12] + up): note(PNO, kk, a + 0.01 * j, BT * 0.9, 76, 0.32, -0.2 + 0.1 * j, rv=0.3)
    h_riser(t_tag, t_h - t_tag, bus=MUS, g=0.8)
    anchor('type', 'pitch', 'ask', dur=1.0); anchor('punch', 'pitch', 'money')
    for i, nm in enumerate(['tag1', 'tag2', 'tag3']): anchor('chip', 'pitch', nm, i=i)
    anchor('hush', 'pitch', 'q1')

# ---------------------------------------------------------------- e0 · b02 gut: heartbeat, riser, climbing cluster, FREEZE
if B('gut'):
    t0, t_fr = T('gut'), T('gut', 'freeze') or E('gut')
    nb = int(round((t_fr - t0) / BT))
    for k in range(nb): h_heartbeat(t0 + k * BT, k=k)
    t_more = T('gut', 'more') or t0 + 0.6 * (t_fr - t0)
    for k, t in grid(t_more, t_fr, BT): h_heartbeat(t + E8, k=k % 12)       # 'more': the heart races (8ths)
    # tension cluster (tremolo + slow strings), a semitone higher every two beats, crescendo
    for j, (k, t) in enumerate(grid(t0, t_fr, 2 * BT)):
        lift = j + (2 if t >= t_more else 0); u = (t - t0) / (t_fr - t0)
        for i, base in enumerate(ms('D4', 'Eb4', 'E4')):
            note(TREM, base + lift, t, 2 * BT + 0.1, int(60 + 50 * u), 0.22 + 0.25 * u, -0.4 + 0.4 * i, rv=0.3, tail=1.0)
        note(SSTR, m('D3') + lift, t, 2 * BT + 0.1, int(60 + 50 * u), 0.2 + 0.2 * u, 0, rv=0.3, tail=1.0)
    # low pulse under it (the groove's bass, muted, 8ths)
    synth_line(t0, t_fr, lambda k, t: m('D2') + (12 if k % 4 == 3 else 0), E8, 0.3, 0.14, bright=(2.0, 6.0), decay=0.12,
               vel_fn=lambda k, t: 0.5 + 0.5 * (t - t0) / (t_fr - t0))
    perc_grid(t_more, t_fr, 'hat', 0.05, S16, accent=[1, 0.4, 0.7, 0.4])
    # a second rise in 'more' that is cut dead by the freeze
    n = n_of(t_fr - t_more); MUS.add(t_more, shepard(t_fr - t_more, 1.5, 55, 7, 1.3) * np.linspace(0.2, 1, n) ** 2, 0.12, 0, rv=0.2)
    anchor('riser', 'gut', 'rise', dur=(E('gut', 'rise') or t0 + 6 * BT) - t0)
    anchor('freeze', 'gut', 'freeze')

# ---------------------------------------------------------------- e0 · b03 title: shatter, reversed gather, the title chord
if B('title'):
    anchor('shatter', 'title', 'shatter')
    t_s, t_f = T('title', 'shatter'), T('title', 'form')
    if ok(t_s, t_f):            # the drift: near silence, a breath of high air and one far low D
        L = t_f - t_s + 1
        MUS.add(t_s + 1.0, air(L, 2500, 4000, q=3, seed=4) * np.hanning(n_of(L))[:, None], 0.006, 0, bg=0.5)
    anchor('gather', 'title', 'form', dur=(E('title', 'form') or 0) - (T('title', 'form') or 0) or 4 * BT)
    anchor('title', 'title', 'sub')

# ---------------------------------------------------------------- e1 一成: the plain Reich-like piano ostinato
REICH = [0, 2, 3, 1, 2, 3]        # 6 eighths against a 4-beat bar: the cell drifts across the bar line
if B('thousand'):
    a, b = T('thousand'), E('nine', 'rare') if B('nine') else E('baserate') or E('thousand')
    t_gap, t_gap1 = T('baserate', 'gap'), E('baserate', 'gap')
    t_mem, t_rare = T('nine', 'membrane'), T('nine', 'rare')
    # density: enters sparse under the title's tail, fills by the count
    ostinato(a, E('thousand'), PNO, REICH, 44, 0.42, 0.05, rv=0.4, bg=0.15, dens=(0.25, 0.95), seed=3)
    if ok(t_gap):
        ostinato(T('baserate'), t_gap, PNO, REICH, 46, 0.45, 0.05, rv=0.4, bg=0.15, dens=(1, 1), seed=3)
        ostinato(t_gap, t_gap1, PNO, [0, None, 2, None, 1, None], 40, 0.36, 0.05, rv=0.45, bg=0.25, seed=4)      # thinned: the gap
        # the gap: a sustained low open fifth
        for k, g in [('D2', 0.5), ('A2', 0.42)]:
            note(CELLO, m(k), t_gap, t_gap1 - t_gap + 0.4, 72, g, 0, rv=0.4, bg=0.3, tail=3, env=[(0, 0), (1.2, 1)])
            note(CBASS, m(k) - 12, t_gap, t_gap1 - t_gap + 0.4, 64, g * 0.6, 0, rv=0.3, tail=3, env=[(0, 0), (1.5, 1)])
    if B('nine'):
        ostinato(T('nine'), t_rare, PNO, REICH, 44, 0.40, 0.05, rv=0.45, bg=0.2, seed=5)
        ostinato(t_rare, E('nine'), PNO, REICH, 46, 0.44, 0.05, rv=0.4, bg=0.15, dens=(1, 0.6), seed=6)     # plain again
        # the 9x membrane: shimmering high strings over a brightening harmony (the illusion), cracking at 'rare'
        if ok(t_mem, t_rare):
            L = t_rare - t_mem
            for a_, b_, nm in chord_spans(t_mem, t_rare):
                up = CHORDS[nm][1]
                for j, k in enumerate(up[-3:]):
                    note(TREM, k + 24, a_, b_ - a_ + 0.3, 64, 0.13, -0.5 + 0.5 * j, rv=0.5, bg=0.5, tail=1.5, env=[(0, 0), (0.8, 1)])
                    note(SSTR, k + 12, a_, b_ - a_ + 0.3, 56, 0.16, 0.5 - 0.5 * j, rv=0.5, bg=0.4, tail=1.5, env=[(0, 0), (0.8, 1)])
            n = n_of(L); tt = tvec(n)
            sh = sum(np.sin(2 * np.pi * mtof(k) * tt * (1 + 0.0015 * np.sin(2 * np.pi * (5 + j) * tt))) for j, k in enumerate(ms('D6', 'A6', 'E7')))
            MUS.add(t_mem, sh * local_env(n, [(0, 0), (2.0, 1), (L - 0.05, 1), (L, 0)]), 0.006, 0, rv=0.4, bg=0.6)
            anchor('shatter', 'nine', 'rare')
    # soft roots under it all
    basses(a, E('nine') if B('nine') else E('thousand'), CELLO, 56, 0.20, 1, rv=0.4)
    basses(a, E('nine') if B('nine') else E('thousand'), PNO, 52, 0.28, 0, rv=0.4, dur=2 * BT)
    anchor('sweep', 'baserate', 'sweep', dur=(E('baserate', 'sweep') or 0) - (T('baserate', 'sweep') or 0) or 3.0)

# ---------------------------------------------------------------- e2 竞争世界: spacious pads, slow motion, awe
if B('worlds'):
    a, b = T('worlds'), E('worlds')
    pads(a, b, CHOIR, 52, 0.20, rv=0.5, bg=0.5, fi=2.0)
    pads(T('worlds', 'form'), b, SSTR, 56, 0.26, rv=0.5, bg=0.4, fi=1.0)
    pads(a, b, PAD, 48, 0.12, rv=0.3, bg=0.4, octave=-1, fi=2.0)
    basses(a, b, CBASS, 56, 0.30, 1, rv=0.4)
    note(PNO, m('D2'), a, 3.0, 64, 0.4, 0, rv=0.4, bg=0.5)
    anchor('swell', 'worlds', 'form', dur=(E('worlds', 'form') or 0) - (T('worlds', 'form') or 0) or 4.0)
    # orbit / flow: the spheres turn: a slow circling harp arpeggio (quarter notes), celesta above
    ostinato(T('worlds', 'orbit'), b, HARP, [0, 1, 2, 3, 2, 1], 56, 0.30, -0.2, rv=0.5, bg=0.4, div=BT, dur=BT * 2, seed=8)
    ostinato(T('worlds', 'flow'), b, CEL, [None, 3, None, 4, None, 2, None, 5], 50, 0.16, 0.3, rv=0.5, bg=0.5, div=E8, dur=BT, seed=9)
if B('missing'):
    a, b = T('missing'), E('missing'); t_rv, t_rl, t_hm = T('missing', 'reveal'), T('missing', 'real'), T('missing', 'humble')
    pads(a, t_rv, CHOIR, 52, 0.18, rv=0.5, bg=0.5, fi=0)
    pads(a, t_rv, SSTR, 54, 0.22, rv=0.5, bg=0.4, fi=0, fo=1.5)
    ostinato(a, t_rv, HARP, [0, 1, 2, 3, 2, 1], 52, 0.26, -0.2, rv=0.5, bg=0.4, div=BT, dur=BT * 2, seed=10, dens=(1, 0.5))
    basses(a, t_rv, CBASS, 52, 0.26, 1, rv=0.4)
    if ok(t_rv, t_rl):
        L = t_rl - t_rv; L2 = (t_hm or b) - t_rv
        # deep sub swell: something enormous in the dark
        n = n_of(L2); tt = tvec(n)
        sub = np.sin(2 * np.pi * mtof(m('D1')) * tt) + 0.5 * np.sin(2 * np.pi * mtof(m('D2')) * tt) + 0.15 * np.sin(2 * np.pi * mtof(m('A2')) * tt)
        MUS.add(t_rv, sub * local_env(n, [(0, 0), (L * 0.9, 1), (L2 - 1.0, 0.6), (L2, 0)]), 0.16, 0, rv=0.1)
        note(CBASS, m('D2'), t_rv, L2, 72, 0.5, 0, rv=0.3, bg=0.5, env=[(0, 0), (L * 0.8, 1)])
        note(TIMP, m('D2'), t_rv + L * 0.55, L * 0.4, 36, 0.3, 0, rv=0.4, bg=0.6)     # a distant roll-like swell
        # a quietly dissonant cluster that slowly resolves: Eb and Bb fade out, D-E-A stays and becomes Bbmaj7#11
        for k, p, diss in [('D4', -0.5, 0), ('Eb4', 0.4, 1), ('E4', -0.2, 0), ('A4', 0.5, 0), ('Bb4', -0.4, 1)]:
            env = [(0, 0), (L * 0.75, 1)] + ([(L * 0.8, 1), (L + 2.0, 0)] if diss else [(L2 - 0.5, 1), (L2 + 0.4, 0.5)])
            note(CHOIR, m(k), t_rv, L2 + 0.4, 60, 0.20, p, rv=0.5, bg=0.7, env=env, tail=4)
            note(SSTR, m(k) + 12, t_rv, L2 + 0.4, 54, 0.14, -p, rv=0.5, bg=0.7, env=env, tail=4)
        note(SSTR, m('Bb1') + 12, t_rl, L2 - L + 0.4, 60, 0.3, 0, rv=0.5, bg=0.6, env=[(0, 0), (1.5, 1)])
        note(PNO, m('Bb1'), t_rl, 3.0, 60, 0.4, 0, rv=0.4, bg=0.6)
        anchor('swell', 'missing', 'reveal', dur=L * 0.5)
    if ok(t_hm):        # humble: thinner, an unresolved suspension leaning into e3
        pads(t_hm, b, SSTR, 50, 0.22, rv=0.5, bg=0.5, fi=1.0, fo=1.2, which=[0, 2])
        ostinato(t_hm, b, HARP, [0, None, 2, None, 1, None], 46, 0.22, -0.2, rv=0.5, bg=0.4, div=BT, dur=BT * 2, seed=12)
        basses(t_hm, b, CELLO, 50, 0.25, 1, rv=0.4)

# ---------------------------------------------------------------- e3 一次乘法: the building pulse
MAR_CELL = [0, 2, 1, 3, 2, 0, 3, 1]
if B('pie_vs_odds'):
    a, b = T('pie_vs_odds'), E('pie_vs_odds'); t_tug, t_rel = T('pie_vs_odds', 'tug'), T('pie_vs_odds', 'rel')
    ostinato(a, b, MAR, MAR_CELL, 50, 0.24, 0.25, rv=0.3, dens=(0.5, 0.9), seed=13)
    # the pie: nervous little stabs (pizzicato, syncopated, irregular)
    for k, t in grid(a, t_tug, S16):
        if h01(k, 21) < 0.22 and k % 4 in (1, 3, 2):
            up = CHORDS[chord_at(t)][1]
            note(PIZZ, up[int(h01(k, 5) * len(up))] + 12, t, 0.15, 76, 0.2, -0.4 + 0.8 * h01(k, 6), rv=0.3)
            if h01(k, 22) < 0.4: note(STR, up[0], t, 0.1, 76, 0.10, 0, rv=0.25, tail=0.6)
    perc_grid(a, t_tug, 'tick', 0.025, S16, accent=[0, 0.5, 1, 0.5], prob=0.6, seed=2)
    # the tug-of-war: a low rocking ostinato (8ths)
    tug = [0, 0, -5, 0, 0, -5, 0, 2]
    synth_line(t_tug, b, lambda k, t: CHORDS[chord_at(t + 0.01)][0] + 12 + tug[k % 8], E8, 0.3, 0.26, bright=(3, 4), decay=0.16,
               vel_fn=lambda k, t: 1.0 if k % 2 == 0 else 0.7)
    ostinato(t_tug, t_rel, CELLO, [0, None, 0, None], 70, 0.25, -0.1, rv=0.3, octave=-1, div=E8, dur=E8 * 0.8, seed=14)
    perc_grid(t_tug, b, 'shaker', 0.04, S16, accent=[0.7, 0.3, 1.0, 0.3])
    pads(t_rel, b, SSTR, 48, 0.18, rv=0.4, bg=0.3, fi=1.0)
if B('equation'):
    a, b = T('equation'), E('equation'); t_c, t_o = T('equation', 'cancel'), T('equation', 'only')
    ostinato(a, b, PNO, REICH, 48, 0.42, -0.05, rv=0.4, seed=15)
    ostinato(a, t_c, MAR, MAR_CELL, 52, 0.24, 0.3, rv=0.3, seed=16)
    synth_line(a, t_c, lambda k, t: CHORDS[chord_at(t + 0.01)][0] + 12 + (12 if k % 4 == 3 else 0), E8, 0.3, 0.22, bright=(3, 5), decay=0.15,
               vel_fn=lambda k, t: 1.0 if k % 2 == 0 else 0.7)
    perc_grid(a, t_c, 'shaker', 0.045, S16, accent=[0.7, 0.3, 1.0, 0.3])
    for k, t in grid(T('equation', 'lr'), t_c, BT):
        if k % 2 == 1: drum(37, t, 72, 0.08, 0.1)
    pads(T('equation', 'fraction'), t_c, SSTR, 56, 0.22, rv=0.4, bg=0.3, fi=2.0)
    anchor('cancel', 'equation', 'cancel')
    if ok(t_c):     # after the chime: space; only the piano and a high F chord
        pads(t_c + BT, b, SSTR, 50, 0.20, rv=0.5, bg=0.5, fi=1.5, octave=1, which=[1, 2, 3])
    basses(a, b, CELLO, 58, 0.22, 1, rv=0.4)
if B('evidence1'):
    a, b = T('evidence1'), E('evidence2') if B('evidence2') else E('evidence1')
    for vt in ('evidence1', 'evidence2'):
        if not B(vt): continue
        anchor('stamp', vt, 'stamp')
        s0, s1 = T(vt), E(vt)
        t_go = T(vt, 'stamp') + BT if T(vt, 'stamp') is not None else s0
        t_last = T(vt, 'note') or T(vt, 'ghost') or s1        # the step where it pulls back a little
        ostinato(t_go, s1, PNO, REICH, 50, 0.44, -0.05, rv=0.4, seed=17)
        ostinato(t_go, t_last, MAR, MAR_CELL, 56, 0.26, 0.3, rv=0.3, seed=18)
        ostinato(t_last, s1, MAR, MAR_CELL, 46, 0.20, 0.3, rv=0.35, seed=19, dens=(0.8, 0.4))
        synth_line(t_go, s1, lambda k, t: CHORDS[chord_at(t + 0.01)][0] + 12 + (12 if k % 4 == 3 else 0), E8, 0.3, 0.26,
                   bright=(4, 6), decay=0.16, vel_fn=lambda k, t: 1.0 if k % 2 == 0 else 0.7)
        perc_grid(t_go, t_last, 'shaker', 0.05, S16, accent=[0.7, 0.3, 1.0, 0.3])
        perc_grid(t_last, s1, 'shaker', 0.03, S16, accent=[0.7, 0.3, 1.0, 0.3])
        ring_kick(t_go, t_last, [1, 0, 0, 0, 0.7, 0, 0, 0], 0.18)
        for k, t in grid(t_go, t_last, BT):
            if k % 2 == 1: drum(37, t, 76, 0.09, 0.1)
        pads(t_go, s1, SSTR, 54, 0.22, rv=0.4, bg=0.3, fi=1.5)
        rr = T(vt, 'ratio')                     # strings rise under the ratio
        if ok(rr): pads(rr, E(vt, 'ratio'), STR, 60, 0.12, rv=0.4, bg=0.3, octave=1, which=[1, 2], fi=1.5)
        basses(s0, s1, CELLO, 60, 0.24, 1, rv=0.4)
        basses(s0, s1, CBASS, 56, 0.20, 0, rv=0.3)
if B('noise'):
    a, b = T('noise'), E('noise'); t_txt, t_ch = T('noise', 'text'), T('noise', 'chain')
    # drop / nothing: the pulse simply carries on, unchanged (the card is x1)
    ostinato(a, b, PNO, REICH, 50, 0.44, -0.05, rv=0.4, seed=20)
    ostinato(a, b, MAR, MAR_CELL, 52, 0.24, 0.3, rv=0.3, seed=21)
    synth_line(a, b, lambda k, t: CHORDS[chord_at(t + 0.01)][0] + 12 + (12 if k % 4 == 3 else 0), E8, 0.3, 0.24, bright=(4, 7), decay=0.16,
               vel_fn=lambda k, t: 1.0 if k % 2 == 0 else 0.7)
    perc_grid(a, b, 'shaker', 0.045, S16, accent=[0.7, 0.3, 1.0, 0.3])
    basses(a, b, CELLO, 60, 0.24, 1, rv=0.4)
    anchor('thud', 'noise', 'drop')
    pads(t_txt, b, SSTR, 58, 0.24, rv=0.4, bg=0.3, fi=1.5)
    if ok(t_ch):    # the chain line builds to the cadence: the theme, landing on D minor
        ring_kick(t_txt, t_ch + 4 * BT, [1, 0, 0, 0.6, 0.8, 0, 0, 0], 0.2)
        perc_grid(t_ch, t_ch + 4 * BT, 'hat', 0.03, S16, accent=[0.4, 0.2, 1.0, 0.2])
        th = [('F5', 1), ('E5', 1), ('D5', 0.5), ('E5', 0.5), ('C#5', 1), ('D5', 2)]
        melody(t_ch, th, PNO, 74, 0.5, 0.1, rv=0.4, bg=0.4)
        melody(t_ch, th, SSTR, 70, 0.30, -0.1, rv=0.4, bg=0.4, legato=1.15)
        melody(t_ch, th, CEL, 60, 0.18, 0.2, rv=0.4, bg=0.5, oct=1)
        land = t_ch + 4 * BT
        for j, k in enumerate(ms('D2', 'A2', 'D3', 'F3', 'A3', 'E4')): note(PNO, k, land + 0.012 * j, 3.0, 70, 0.4, -0.3 + 0.12 * j, rv=0.4, bg=0.5, tail=4)
        note(TIMP, m('D2'), land, 1.5, 80, 0.35, 0, rv=0.3, bg=0.4)
        h_resolve(land)

# ---------------------------------------------------------------- e4 概率不是决定: marimba + vibraphone (3+3+2), counterpoint, Shepard zoom
CELL332 = [0, 2, 3, 0, 2, 3, 1, 2]
if B('threshold'):
    a, b = T('threshold'), E('other') if B('other') else E('threshold')
    t_split = T('other', 'split') if B('other') else None
    t_osti_end = t_split or b
    ostinato(a, t_osti_end, MAR, CELL332, 54, 0.30, -0.25, rv=0.35, seed=30, accent=10)
    ostinato(T('threshold', 'lever') or a, t_osti_end, VIB, [3, None, None, 2, None, None, 1, None], 50, 0.20, 0.3, rv=0.45, bg=0.3, dur=BT, seed=31)
    basses(a, b, PNO, 60, 0.32, 0, rv=0.4, dur=2 * BT)
    basses(a, b, CELLO, 56, 0.24, 1, rv=0.4)
    pads(a, b, SSTR, 48, 0.16, rv=0.5, bg=0.3, fi=2.0)
    if B('other'):     # the loss feels heavier: a low swell under 'heavy', a descending glide under 'slide'
        th_, tsl = T('other', 'heavy'), T('other', 'slide')
        if ok(th_, tsl): note(CBASS, m('D1') + 12, th_, tsl - th_ + 0.5, 84, 0.45, 0, rv=0.3, bg=0.3, env=[(0, 0), (tsl - th_, 1), (tsl - th_ + 0.5, 0)])
        if ok(tsl, t_split):
            for i, k in enumerate(ms('A4', 'G4', 'F4', 'E4', 'D4', 'C#4')):
                note(VIB, k, tsl + i * (t_split - tsl) / 6, BT * 1.2, 56, 0.18, 0.2 - 0.08 * i, rv=0.45)
    if ok(t_split):    # two decisions, two motifs in counterpoint, both arrive at D (two octaves apart)
        u = 1.5        # dotted quarters against the beat
        up_ = [('F4', u), ('G4', u), ('A4', u), ('C#5', u), ('D5', 6)]
        dn_ = [('Bb3', u), ('A3', u), ('G3', u), ('E3', u), ('D3', 6)]
        melody(t_split, up_, VIB, 70, 0.34, 0.45, rv=0.45, bg=0.3, legato=1.0)
        melody(t_split, up_, CEL, 60, 0.18, 0.45, rv=0.45, bg=0.4, oct=1)
        melody(t_split, dn_, CELLO, 76, 0.40, -0.45, rv=0.4, bg=0.3, legato=1.0)
        melody(t_split, dn_, PNO, 60, 0.26, -0.45, rv=0.4, bg=0.3)
        tb = T('other', 'both')
        if ok(tb):      # an echo of both endings, softly
            melody(tb + 3 * BT, [('C#5', 1), ('D5', 2)], VIB, 54, 0.22, 0.45, rv=0.5, bg=0.5)
            melody(tb + 3 * BT, [('E3', 1), ('D3', 2)], CELLO, 60, 0.26, -0.45, rv=0.5, bg=0.5)
if B('gap'):
    a, b = T('gap'), E('gap'); t_do, t_find = T('gap', 'do'), T('gap', 'find')
    if ok(t_do):       # endless zoom: a long Shepard-like riser
        L = t_do - a; n = n_of(L)
        sh = shepard(L, 2.5, 30.0, 9, 1.4) * local_env(n, [(0, 0), (1.5, 0.7), (L - 0.8, 1.0), (L, 0)])
        MUS.add(a, sh, 0.28, 0, rv=0.3, bg=0.3)
        MUS.add(a, air(L, 600, 9000, q=1.6, seed=33) * local_env(n, [(0, 0), (L - 0.5, 1), (L, 0)])[:, None] ** 2, 0.03, 0, rv=0.3)
        note(CBASS, m('D2'), a, L, 60, 0.3, 0, rv=0.3, env=[(0, 0), (2, 1), (L, 0.5)])
        # suspended stillness: Dsus4 held, very quiet
        pads(t_do, b, SSTR, 44, 0.16, rv=0.5, bg=0.6, fi=1.5, fo=1.5)
        pads(t_do, b, CHOIR, 40, 0.08, rv=0.5, bg=0.6, fi=2.0, fo=1.5, which=[0, 2])
    if ok(t_find):     # one glint
        MUS.add(t_find + BT, bell(mtof(m('A6')), 4.0, 1.5), 0.04, 0.3, rv=0.4, bg=0.8)
        note(CEL, m('E6'), t_find + BT, 0.6, 64, 0.16, 0.3, rv=0.4, bg=0.8)

# ---------------------------------------------------------------- e5 人与 AI: the flood (16th arps), the cut, the human
if B('ai'):
    a, b = T('ai'), E('ai'); t_fl, t_fa = T('ai', 'flood') or a, T('ai', 'fast') or b
    def arp(k, t, span=2, pat=None):
        up = CHORDS[chord_at(t + 0.01)][1]; tones = [x + 12 * o for o in range(span) for x in up]
        seq = list(range(len(tones))) + list(range(len(tones) - 2, 0, -1))
        return tones[seq[k % len(seq)]] + 12
    synth_line(a, b, lambda k, t: arp(k, t), S16, 0.22, 0.17, bright=(5, 16), decay=0.11, detune=True, pan=-0.1,
               vel_fn=lambda k, t: 1.0 if k % 4 == 0 else 0.7)
    synth_line(t_fl, b, lambda k, t: arp(k * 3, t, 2) + 12, S16, 0.16, 0.09, bright=(8, 18), decay=0.08, pan=0.35,
               vel_fn=lambda k, t: 0.8 if k % 3 == 0 else 0.55)
    synth_line(t_fa, b, lambda k, t: arp(k * 5, t, 3) + 12, S16 / 2, 0.08, 0.05, bright=(10, 18), decay=0.05, pan=-0.35)
    synth_line(a, b, lambda k, t: CHORDS[chord_at(t + 0.01)][0] + 12 + (12 if k % 2 else 0), E8, 0.3, 0.28, bright=(3, 6), decay=0.14,
               vel_fn=lambda k, t: 1.0 if k % 2 == 0 else 0.6)
    ring_kick(a, b, [1, 0], 0.34, f0=120, tau=0.15)
    for k, t in grid(a, b, BT):
        if k % 2 == 1: drum(39, t, 90, 0.16, 0.0, rv=0.2)
    perc_grid(a, b, 'hat', 0.06, S16, accent=[0.5, 0.3, 1.0, 0.3])
    pads(t_fl, b, SSTR, 64, 0.16, rv=0.4, bg=0.2, fi=2.0)
    for k, t in grid(t_fl, b, S16):                 # glitchy ticks, increasingly dense
        u = (t - t_fl) / max(1e-6, b - t_fl)
        if h01(k, 50) < 0.08 + 0.18 * u: h_glitch(t)
    h_riser(t_fa, b - t_fa, bus=MUS, g=1.2)
if B('human'):
    a, b = T('human'), E('human')
    anchor('freeze', 'human', 'freeze')
    t_cur, t_dec, t_rope, t_who = T('human', 'cursor'), T('human', 'decide'), T('human', 'rope'), T('human', 'who')
    if ok(t_cur, t_dec):     # barely there: one low D breathing in under the typing
        note(SSTR, m('D3'), t_cur + 2 * BT, t_dec - t_cur - 2 * BT + 0.5, 40, 0.14, 0, rv=0.5, bg=0.5, env=[(0, 0), (2.0, 1)])
    if ok(t_dec, t_rope):    # decide: a warm chord
        for j, k in enumerate(ms('Bb1', 'F2', 'D3', 'A3', 'C4', 'D4', 'F4')):
            note(SSTR, k + (12 if j < 2 else 0), t_dec, t_rope - t_dec + 0.8, 64, 0.22, -0.5 + j * 0.16, rv=0.5, bg=0.5, env=[(0, 0), (0.8, 1)])
            note(PNO, k, t_dec + 0.02 * j, 3.0, 60, 0.26, -0.5 + j * 0.16, rv=0.4, bg=0.5)
        note(CHOIR, m('F4'), t_dec, t_rope - t_dec + 0.8, 48, 0.10, 0, rv=0.5, bg=0.5, env=[(0, 0), (1.5, 1)])
    if ok(t_rope, t_who):    # rope: a precise mechanical pulse (no humanising at all)
        perc_grid(t_rope, t_who, 'tick', 0.045, S16, accent=[1.0, 0.45, 0.7, 0.45])
        ostinato(t_rope, t_who, MAR, [0, 2, 0, 2, 0, 2, 1, 2], 58, 0.26, 0.2, rv=0.25, human=0, seed=40, accent=8, octave=-1)
        tug = [0, 0, -5, 0, 0, -5, 0, 2]
        synth_line(t_rope, t_who, lambda k, t: CHORDS[chord_at(t + 0.01)][0] + 12 + tug[k % 8], E8, 0.25, 0.2, bright=(3, 3), decay=0.12)
        pads(t_rope, t_who, SSTR, 50, 0.14, rv=0.4, bg=0.3, fi=1.0, which=[1, 3])
    if ok(t_who):            # who: warm strings swell, human
        L = b - t_who
        for a_, b_, nm in chord_spans(t_who, b):
            bs, up = CHORDS[nm]
            for j, k in enumerate([bs + 12, bs + 24] + up + [up[-1] + 12]):
                note(SSTR, k, a_, b_ - a_ + 0.6, 76, 0.24, -0.6 + 0.2 * j, rv=0.5, bg=0.5, env=[(0, 0.3), (b_ - a_, 1.0), (b_ - a_ + 0.6, 0.5)])
            note(CELLO, bs + 12, a_, b_ - a_ + 0.6, 72, 0.32, 0, rv=0.4, bg=0.4)
        note(CHOIR, m('A4'), t_who, L, 56, 0.12, 0, rv=0.5, bg=0.6, env=[(0, 0), (L * 0.7, 1), (L, 0.3)])
        melody(t_who + 2 * BT, [('D5', 2), ('C5', 1), ('A4', 3)], PNO, 58, 0.3, 0.15, rv=0.4, bg=0.5)

# ---------------------------------------------------------------- e6 尾声: recall, half-time, the theme, D major
if B('recall'):
    a = T('recall'); t_sl = T('recall', 'slow') or a + 4 * BT
    for k, (_, t) in enumerate(grid(a, t_sl, BT)): h_heartbeat(t, k=k + 4)        # the e0 pulse flashes back
    synth_line(a, t_sl, lambda k, t: m('D2') + (12 if k % 4 == 3 else 0), E8, 0.3, 0.16, bright=(3, 5), decay=0.14)
    for i, base in enumerate(ms('D4', 'Eb4', 'E4')):
        note(TREM, base + 4, a, t_sl - a, 70, 0.18, -0.4 + 0.4 * i, rv=0.3, env=[(0, 1), (t_sl - a - 0.3, 0.5), (t_sl - a, 0)], tail=0.5)
    # time slows: half-time, sustains (piano roots + inner voice every half bar), strings under the theme
    end_t = E('end', 'final') if B('end') else E('recall')
    fin = T('end', 'final') if B('end') else None
    body_end = fin or end_t
    for a_, b_, nm in chord_spans(t_sl, body_end):
        bs, up = CHORDS[nm]
        note(PNO, bs + 12, a_, b_ - a_ + 0.5, 62, 0.42, -0.1, rv=0.4, bg=0.6, tail=4)
        if b_ - a_ >= 2 * BT - 1e-3: note(PNO, up[1] if len(up) > 1 else up[0], a_ + 2 * BT, b_ - a_ - 2 * BT + 0.5, 50, 0.3, 0.1, rv=0.4, bg=0.6, tail=4)
    pads(t_sl, body_end, SSTR, 52, 0.20, rv=0.5, bg=0.6, fi=2.0, octave=-1)
    pads(t_sl, body_end, CHOIR, 44, 0.08, rv=0.5, bg=0.6, fi=3.0, which=[0, 2])
    basses(t_sl, body_end, CELLO, 54, 0.22, 1, rv=0.5)
    # the theme, in half-time (1 theme beat = 2 film beats), phrased to the step lines
    TH = [('recall', 's1', [('F5', 2), ('E5', 2)]), ('recall', 's2', [('A4', 4)]), ('recall', 's3', [('Bb4', 1), ('C5', 1), ('D5', 2)]),
          ('recall', 's4', [('G5', 2), ('F5', 2), ('E5', 2)]), ('end', 'l1', [('F5', 2), ('E5', 2), ('A4', 2)]),
          ('end', 'l2', [('D5', 2), ('E5', 2), ('C#5', 2)])]
    for vt, nm, seq in TH:
        t = T(vt, nm)
        if t is None: continue
        melody(t, seq, PNO, 64, 0.5, 0.1, rv=0.45, bg=0.7, legato=1.0, tail=4)
        melody(t, seq, SSTR, 56, 0.20, -0.15, rv=0.5, bg=0.6, legato=1.1, oct=-1)
        # each step line lands with a soft bell
        MUS.add(t, bell(mtof(CHORDS[chord_at(t)][1][0] + 24), 3.0, 1.0), 0.022, 0.35, rv=0.5, bg=0.7)
    if ok(fin):     # 先别急: D major with a ninth. The longest, quietest tail; silence by the end
        L = end_t - fin
        env = [(0, 1), (L * 0.35, 0.75), (L - 0.4, 0.0)]
        for j, k in enumerate(ms('D2', 'A2', 'D3', 'F#3', 'A3', 'E4', 'F#4', 'A4')):
            note(PNO, k, fin + 0.03 * j, L, 58 - j, 0.30, -0.4 + 0.1 * j, rv=0.4, bg=0.9, tail=2, env=env)
            note(SSTR, k + 12, fin + 0.3, L, 48, 0.12, 0.4 - 0.1 * j, rv=0.5, bg=0.9, tail=2, env=[(0, 0), (2.0, 1), (L * 0.6, 0.5), (L - 0.4, 0.0)])
        note(PNO, m('F#5'), fin + 2 * BT, L - 2 * BT, 56, 0.4, 0.15, rv=0.4, bg=1.0, tail=2, env=[(0, 1), (L - 2 * BT - 0.6, 0)])
        note(CEL, m('F#6'), fin + 2 * BT, 2.0, 50, 0.14, 0.2, rv=0.4, bg=1.0)
        MUS.add(fin, bell(mtof(m('D6')), 6.0, 2.0) * local_env(n_of(6.0), [(0, 1), (5.5, 0)]), 0.025, -0.2, rv=0.5, bg=0.9)

# ================================================================ SYNC: every cue in cues.json
used = {}
for c in CUES:
    ty = c.get('type'); fn = HANDLERS.get(ty)
    if not fn or c.get('_done'): continue
    kw = {k: v for k, v in c.items() if k not in ('t', 'type', 'beat', 'chapter', 'visual', '_done')}
    try:
        fn(float(c['t']), **kw); used[ty] = used.get(ty, 0) + 1
    except Exception as ex:
        print(f'  cue {ty} @ {c["t"]}: skipped ({ex})')
print('cues handled:', ', '.join(f'{k}×{v}' for k, v in sorted(used.items())) or '(none)')

# ================================================================ MIX
print(f'rendered notes ({len(sf2.cache)} unique SF2 notes) in {time.time() - T_RUN:.1f}s; mixing ...', flush=True)
mus = MUS.render(); fxb = FX.render(); post = POST.render()
nn = len(mus)
def env_from(spans, kind):
    g = np.ones(nn)
    for sp in spans:
        if kind == 'gate':
            a, b = sp; i0, i1 = n_of(a), min(nn, n_of(b))
            r = n_of(0.003); g[max(0, i0 - r):i0] *= np.linspace(1, 0, len(g[max(0, i0 - r):i0]))
            g[i0:i1] = 0
            r2 = n_of(0.006); g[i1:i1 + r2] *= np.linspace(0, 1, len(g[i1:i1 + r2]))
        else:
            a, b, depth, rel = sp
            pts = [(a - 0.005, 1.0), (a + 0.04, depth), (b, depth), (b + rel, 1.0)]
            i0, i1 = max(0, n_of(a - 0.01)), min(nn, n_of(b + rel + 0.01))
            g[i0:i1] *= env_points(i1 - i0, [(x - i0 / SR, y) for x, y in pts], curve='cos')
    return g
G = env_from(GATE, 'gate')[:, None]; HD = env_from(DUCK, 'duck')[:, None]
mix = mus * 1.0 * HD + fxb * 0.85
mix = filt(mix, 'hp', 28, order=2)
mix = mix * G + post
mix = mix[:NOUT]
# the last bar fades to digital silence at the end of the final step (no click)
end_t = E('end') if B('end') else D
mix *= env_points(len(mix), [(0, 1), (end_t - 0.6, 1), (end_t - 0.05, 0)])[:, None]
L0 = lufs(mix); gain = 10 ** ((-16.0 - L0) / 20); mix *= gain
mix = limiter(mix, ceiling_db=-1.3)
for _ in range(3):                     # tiny correction loop after limiting
    L1 = lufs(mix)
    if abs(L1 + 16) < 0.05: break
    mix = limiter(mix * 10 ** ((-16 - L1) / 20), ceiling_db=-1.3)
os.makedirs(OUT, exist_ok=True)
write(os.path.join(OUT, 'mix.wav'), mix)

# ================================================================ report
L, TP = lufs(mix), true_peak_db(mix)
def rms_db(a, b):
    x = mix[n_of(a):n_of(b)]
    return db(np.sqrt((x ** 2).mean()) + 1e-12) if len(x) else -999
print('section RMS (dBFS):')
for b_ in BEATS:
    print(f"  {b_['id']} {tl.btype(b_):12s} {b_['start']:6.1f}-{b_['end']:6.1f}  {rms_db(b_['start'], b_['end']):6.1f}")
for a, b_ in GATE:
    x = mix[n_of(a + 0.45):n_of(b_)]
    pk = np.abs(x).max() if len(x) else 0.0
    print(f'  freeze/silence {a:.2f}-{b_:.2f}: peak after the crack {db(pk) if pk > 0 else -999:.1f} dBFS ({"digital zero" if pk == 0 else "tiny post-bus clicks"})')
if '--plot' in sys.argv:
    plot_tracks([('mix', mix)], tl, os.path.join(OUT, 'score.png'), 'score: 先别急')
print(f'score: {L:.2f} LUFS, true peak {TP:.2f} dBTP, {len(mix) / SR:.2f}s, {len(CUES)} cues, built in {time.time() - T_RUN:.0f}s')
