"""Original score + sync sound for 《打分的人走了》 -> build/audio/mix.wav (stereo 48 kHz, -16 LUFS, true peak <= -1 dBTP).

Intimate, adult chamber minimalism at the film's tempo (72 BPM): a close felt piano (soft hammers, a little mechanism),
sustained strings, a warm low pad, sparse electronics; air between the notes; no drums. E minor for most of the
film, turning to E major at 'take' (b20) and singing the theme there.

Theme, "the waiting child": E4 - B4 - A4 - G4 - F#4 (held). It opens on a fifth, steps down, and stops on the
second degree: a question that waits for a score. School turns it into a correct, finished G major tune; the
title sets it over a deep chord; the fork stammers it; the empty examiner's chair leaves it unanswered; the floor
after the fall harmonises its waiting F# as the third of D (it is finally held by something); the end sings it in
E major and answers it upwards (F# -> G# -> B -> E): "Have a try".

The musical form is composed from build/timeline.json alone (beats looked up by visual type, steps by name; every
composed onset sits on the beat grid); build/cues.json adds sync hits on top (handlers for the whole BRIEF
vocabulary; unknown types are ignored). Nothing is hard-coded in seconds.

usage: python3 pipeline/audio/score.py [--plot] [--stems]
"""
import os, sys, time
import numpy as np
from scipy import signal
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from common import *   # noqa

T_RUN = time.time()
tl = Timeline(); D = tl.duration
BPM = float(tl.d.get('bpm', 72)); BT = 60.0 / BPM; E8 = BT / 2; S16 = BT / 4
NN = n_of(D) + n_of(4.0)            # working length (tails run past the end, cut at the end)
NOUT = n_of(D)                      # output length = timeline duration
CUES = sorted([c for c in tl.cues if isinstance(c.get('t'), (int, float))
               and not (c.get('type') == 'beat' and 'visual' in c)], key=lambda c: c['t'])   # scene markers are not hits

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
def btype_at(t): return tl.btype(beat_of(t))
def chap_of(t): return tl.chapter_of(t)['id']
def snap(t, g=BT): return round(t / g) * g
def grid(t0, t1, div):
    k = int(np.ceil((t0 - 1e-4) / div))
    while k * div < t1 - 1e-4:
        yield k, k * div; k += 1
def h01(k, seed=0):                 # deterministic hash -> [0, 1)
    x = (int(k) * 2654435761 + int(seed) * 40503 + 12345) & 0xffffffff
    x ^= x >> 15; x = (x * 2246822519) & 0xffffffff; x ^= x >> 13
    return (x % 100000) / 100000.0
def ok(*xs): return all(x is not None for x in xs)
def at(vtype, name, k=0.0):
    """step start + k beats (None if the step does not exist)"""
    t = T(vtype, name); return None if t is None else t + k * BT
def cue_times(kinds, t0, t1):
    kinds = (kinds,) if isinstance(kinds, str) else tuple(kinds)
    if not ok(t0, t1): return []
    return [float(c['t']) for c in CUES if c.get('type') in kinds and t0 - 0.05 <= c['t'] < t1 - 0.05]
def cue_list(kinds, t0, t1):
    kinds = (kinds,) if isinstance(kinds, str) else tuple(kinds)
    if not ok(t0, t1): return []
    return [c for c in CUES if c.get('type') in kinds and t0 - 0.05 <= c['t'] < t1 - 0.05]
def first(kinds, t0, t1, default):
    ts = cue_times(kinds, t0, t1); return ts[0] if ts else default

# ================================================================ pitch / harmony
_PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
def m(s):
    if isinstance(s, (int, np.integer)): return int(s)
    p = _PC[s[0]]; i = 1
    while i < len(s) and s[i] in '#b': p += 1 if s[i] == '#' else -1; i += 1
    return 12 * (int(s[i:]) + 1) + p
def ms(*names): return [m(x) for x in names]
# chord: (bass, upper tones used by ostinati/pads, low-to-high, around G3..A4)
CHORDS = {
    'Em':       (m('E2'),  ms('B3', 'E4', 'G4')),
    'Em9':      (m('E2'),  ms('G3', 'B3', 'D4', 'F#4')),
    'Emadd9':   (m('E2'),  ms('B3', 'E4', 'F#4', 'G4')),
    'Em7':      (m('E2'),  ms('G3', 'B3', 'D4', 'E4')),
    'E5':       (m('E2'),  ms('B3', 'E4')),
    'Em/D':     (m('D2'),  ms('G3', 'B3', 'E4')),
    'Cmaj7':    (m('C2'),  ms('G3', 'B3', 'E4')),
    'Cmaj9':    (m('C2'),  ms('G3', 'B3', 'D4', 'E4')),
    'Cmaj7#11': (m('C2'),  ms('B3', 'E4', 'F#4', 'G4')),
    'Cadd9':    (m('C2'),  ms('G3', 'D4', 'E4')),
    'C':        (m('C2'),  ms('G3', 'C4', 'E4')),
    'Am':       (m('A1'),  ms('A3', 'C4', 'E4')),
    'Am7':      (m('A1'),  ms('G3', 'C4', 'E4')),
    'Am9':      (m('A1'),  ms('G3', 'B3', 'C4', 'E4')),
    'G':        (m('G1'),  ms('G3', 'B3', 'D4')),
    'Gadd9':    (m('G1'),  ms('B3', 'D4', 'G4', 'A4')),
    'Gmaj7':    (m('G1'),  ms('B3', 'D4', 'F#4')),
    'G/B':      (m('B1'),  ms('G3', 'B3', 'D4')),
    'G/D':      (m('D2'),  ms('G3', 'B3', 'D4')),
    'D':        (m('D2'),  ms('F#3', 'A3', 'D4')),
    'Dadd9':    (m('D2'),  ms('F#3', 'A3', 'E4')),
    'D/F#':     (m('F#1'), ms('A3', 'D4', 'F#4')),
    'Dsus4':    (m('D2'),  ms('G3', 'A3', 'D4')),
    'D6':       (m('D2'),  ms('F#3', 'A3', 'B3', 'D4')),
    'Bsus4':    (m('B1'),  ms('B3', 'E4', 'F#4')),
    'B7sus4':   (m('B1'),  ms('A3', 'E4', 'F#4')),
    'B7':       (m('B1'),  ms('A3', 'D#4', 'F#4')),
    'B(b9)':    (m('B1'),  ms('C4', 'D#4', 'F#4')),     # B with a flat ninth (C): the cliff
    'F#m7b5':   (m('F#1'), ms('A3', 'C4', 'E4')),
    # E major (from 'take')
    'E':        (m('E2'),  ms('G#3', 'B3', 'E4')),
    'Eadd9':    (m('E2'),  ms('B3', 'E4', 'F#4', 'G#4')),
    'Emaj9':    (m('E2'),  ms('G#3', 'B3', 'D#4', 'F#4')),
    'E/G#':     (m('G#1'), ms('B3', 'E4', 'G#4')),
    'Amaj7':    (m('A1'),  ms('G#3', 'C#4', 'E4')),
    'Aadd9':    (m('A1'),  ms('B3', 'C#4', 'E4')),
    'C#m7':     (m('C#2'), ms('G#3', 'B3', 'E4')),
    'B':        (m('B1'),  ms('F#3', 'B3', 'D#4')),
    'B/D#':     (m('D#2'), ms('F#3', 'B3', 'D#4')),
    'C#m':      (m('C#2'), ms('G#3', 'C#4', 'E4')),
    'F#m7':     (m('F#1'), ms('A3', 'C#4', 'E4')),
    'A':        (m('A1'),  ms('A3', 'C#4', 'E4')),
}
HARM = []                                   # [(t0, t1, chord)]
def harm(t0, t1, names):
    """lay chords over [t0, t1): split in whole beats, in order"""
    if not ok(t0, t1) or t1 <= t0: return
    if isinstance(names, str): names = [names]
    nb = max(1, int(round((t1 - t0) / BT))); k = len(names)
    cuts = [t0 + BT * int(round(nb * i / k)) for i in range(k)] + [t1]
    for i, nm in enumerate(names): HARM.append((cuts[i], cuts[i + 1], nm))
def H(vtype, name, names):
    harm(T(vtype, name), E(vtype, name), names)
def HB(vtype, name, seq):
    """chords with explicit lengths in beats; the last one fills the rest of the step (robust to retimed steps)"""
    t0, t1 = T(vtype, name), E(vtype, name)
    if not ok(t0, t1): return
    for i, (nm, nb) in enumerate(seq):
        a = t0; t0 = t1 if i == len(seq) - 1 else min(t1, t0 + nb * BT)
        if t0 > a + 1e-6: HARM.append((a, t0, nm))
def chord_at(t):
    for a, b, nm in reversed(HARM):
        if a - 1e-6 <= t < b: return nm
    return 'Em9'
def chord_spans(t0, t1):
    out = []
    for a, b, nm in sorted(HARM):
        lo, hi = max(a, t0), min(b, t1)
        if hi > lo + 1e-6: out.append((lo, hi, nm))
    return out
EMIN = [0, 2, 3, 5, 7, 8, 10]              # natural minor from E
PENT = [0, 3, 5, 7, 10]                    # E minor pentatonic
def scale_note(deg, base=m('E4'), sc=EMIN):
    deg = int(deg); return base + 12 * (deg // len(sc)) + sc[deg % len(sc)]
def major_now(t): return chord_at(t) in ('E', 'Eadd9', 'Emaj9', 'E/G#', 'Amaj7', 'Aadd9', 'C#m7', 'B', 'B/D#', 'C#m', 'F#m7', 'A')

# ================================================================ instruments + buses
ensure_sf2(); sf2 = SF2()
PNO, EP, CEL, GLK, MBOX, VIB, TUB = 0, 4, 8, 9, 10, 11, 14
GTR, VLN, VLA, CELLO, CBASS, TREM, PIZZ, HARP, STR, SSTR = 25, 40, 41, 42, 43, 44, 45, 46, 48, 49
CHOIR, OOHS, PAD, HALO, GLASS = 52, 53, 89, 94, 92
TIMP, HORN, BRASS, REVCYM = 47, 60, 61, 119
KIT_STD, KIT_ORCH = 0, 48                            # GM drum kits (bank 128): standard, orchestral
KICK, LTOM, LTOM2, MTOM, CRASH, CRASH2, SHAKER, CONGA_HI, CONGA_LO, CONGA_MUTE, BASSDRUM = 36, 41, 43, 45, 49, 57, 70, 62, 64, 63, 35
CALKEY = {CBASS: m('E2'), CELLO: m('E3'), GTR: m('E3'), TIMP: m('E2'), HORN: m('E3'), BRASS: m('E3')}
_CAL = {}
def cal(preset, bank=0):
    k = (bank, preset)
    if k not in _CAL:
        x = sf2.note(bank, preset, CALKEY.get(preset, m('E4')), 100, 0.6, tail=0.4)
        r = np.sqrt((x[:n_of(0.5)] ** 2).mean()) + 1e-9
        _CAL[k] = 0.1 / r                   # every preset -> -20 dBFS RMS at velocity 100
    return _CAL[k]

_DCAL = {}
def dcal(key, kit=KIT_STD):
    if (key, kit) not in _DCAL:
        x = sf2.note(128, kit, key, 100, 0.3, tail=0.6, drums=True)
        r = np.sqrt((x[:n_of(0.25)] ** 2).mean()) + 1e-9
        _DCAL[(key, kit)] = 0.1 / r
    return _DCAL[(key, kit)]

GATE = []          # (t0, t1): true silence on every bus but POST
def next_gate(t):
    return next((a for a, _ in sorted(GATE) if a > t + 1e-6), None)
def gated(t): return any(a - 1e-6 <= t < b for a, b in GATE)

class Bus:
    def __init__(s, name, lp=None, hs=None):
        s.name, s.lp, s.hs = name, lp, hs
        s.dry = np.zeros((NN, 2), np.float32); s.hall = np.zeros((NN, 2), np.float32); s.big = np.zeros((NN, 2), np.float32)
    def add(s, t, x, g=1.0, pan=0.0, rv=0.0, bg=0.0, cut=None, cutf=0.12):
        if t is None or t >= D + 1.0 or g == 0: return
        x = to_stereo(x)
        lim = [] if cut is None else [(cut, False)]
        gs = None if s.name == 'post' else next_gate(t)
        if gs is not None: lim.append((gs, True))
        if lim:                          # cut at a layer's end (a short fade from there) or dead at the next silence
            c, hard = min(lim)
            if c <= t + 1e-4: return
            f = n_of(0.003) if hard else n_of(cutf)
            k = n_of(c - t) + (0 if hard else f)
            if k < len(x):
                x = x[:k].copy(); f = max(1, min(k, f))
                x[k - f:] *= np.linspace(1, 0, f)[:, None]
        place(s.dry, t, x, g, pan)
        if rv: place(s.hall, t, x, g * rv, pan)
        if bg: place(s.big, t, x, g * bg, pan)
    def render(s):
        print(f'  reverb {s.name} ...', flush=True)
        y = s.dry.copy()
        # reverb per gate-delimited segment: a freeze also kills the room (tails never resurface after it)
        cuts = [0] + sorted(set(n_of(a) for a, _ in GATE if 0 < n_of(a) < NN)) + [NN]
        for i0, i1 in zip(cuts[:-1], cuts[1:]):
            for arr, ir, k in ((s.hall, IR_HALL, 0.55), (s.big, IR_BIG, 0.6)):
                seg = arr[i0:i1]
                if np.any(seg): y[i0:i1] += conv_seg(seg, ir) * k
        y = y.astype(np.float64)
        # the bus filters are linear and time-invariant: filtering after the room = filtering before it
        if s.lp: y = filt(y, 'lp', s.lp, q=0.6, order=2)   # felt: soft hammers, a close dark piano
        if s.hs: y = filt(y, 'hs', s.hs[0], gain_db=s.hs[1])
        return y
def conv_seg(seg, ir, chunk=24.0):
    """reverb of one segment: 24 s chunks (silent ones skipped), float32 FFTs on every core, cut at the segment end"""
    import scipy.fft
    out = np.zeros(seg.shape, np.float32); n = len(seg); C = n_of(chunk); ir32 = ir.astype(np.float32)
    with scipy.fft.set_workers(os.cpu_count() or 1):
        for c0 in range(0, n, C):
            ch = seg[c0:c0 + C]
            if not np.any(ch): continue
            y = np.stack([signal.oaconvolve(ch[:, k], ir32[:, k]) for k in range(2)], 1)
            j = min(n, c0 + len(y)); out[c0:j] += y[:j - c0]
    return out
PNOB = Bus('piano', lp=2600, hs=(6000, -6))     # the felt piano: close, soft, dark
MUS = Bus('music')
BLUR = Bus('blur', lp=950)                       # the reunion: their warmth, heard through a wall
FX, POST = Bus('fx'), Bus('post')
IR_HALL = make_ir(rt60=2.8, bright=0.42, seed=11, width=0.85)
IR_BIG = make_ir(rt60=7.5, bright=0.5, seed=23, width=0.95, predelay=0.035)
FXG = {'e0': 1.0, 'e1': 0.9, 'e2': 0.9, 'e3': 0.85, 'e4': 0.95, 'e5': 0.95, 'e6': 0.8}
def fxg(t):
    last = BEATS[-1]; ls = steps(last)
    if ls and t >= ls[-1]['t'] - 1e-6: return 0.3      # the last step: barely
    return FXG.get(chap_of(t), 0.9)

FREE = []          # deliberately free (out-of-grid) gestures: the 个性 scribble, the imperfect tries
ONSETS = []        # composed onsets (nominal, before humanising): checked against the grid in the report
IN_SYNC = [False]

def local_env(n, pts): return env_points(n, [(a, g) for a, g in pts])

def drum(key, t, vel, g=1.0, pan=0.0, rv=0.15, bg=0.0, kit=KIT_STD, bus=None, nominal=None, cut=None):
    """one GM drum hit (the drums only enter for the climax)"""
    if t is None or t >= D: return
    if not IN_SYNC[0]: ONSETS.append(nominal if nominal is not None else t)
    vel = int(np.clip(round(vel / 4) * 4, 4, 124))
    x = sf2.note(128, kit, key, vel, 0.3, tail=1.2, drums=True)
    (bus or MUS).add(t, x, g * dcal(key, kit), pan, rv, bg, cut=cut)

def note(preset, key, t, dur, vel, g=1.0, pan=0.0, rv=0.3, bg=0.0, bus=None, tail=3.0, env=None, cut=None, cutf=0.12,
         bank=0, nominal=None, free=False):
    if t is None or t >= D + 0.5: return
    if not IN_SYNC[0]: (FREE if free else ONSETS).append(nominal if nominal is not None else t)
    vel = int(np.clip(round(vel / 4) * 4, 4, 124))
    dur = max(0.05, round(dur / 0.05) * 0.05)
    x = sf2.note(bank, preset, int(key), vel, dur, tail=tail)
    if env is not None: x = x * local_env(len(x), env)[:, None]
    (bus or MUS).add(t, x, g * cal(preset, bank), pan, rv, bg, cut=cut, cutf=cutf)

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
def smooth_rand(n, rate, seed, lo=0.0, hi=1.0):
    """slow random curve in [lo, hi] (cosine-interpolated random points, `rate` points per second)"""
    k = max(3, int(n / SR * rate) + 3); r = np.random.default_rng(seed).uniform(lo, hi, k)
    x = np.arange(n) / max(1, n - 1) * (k - 1); i = np.minimum(k - 2, x.astype(int)); u = x - i
    u = 0.5 - 0.5 * np.cos(np.pi * u)
    return r[i] * (1 - u) + r[i + 1] * u
def thump(f0=95, f1=48, tau=0.12, dur=0.6, lp=220, seed=0):
    def mk():
        n = n_of(dur); t = tvec(n); f = f1 + (f0 - f1) * np.exp(-t / 0.03)
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / tau) * np.minimum(1, t / 0.002)
        x += filt(wnoise(n, 3 + seed), 'lp', 400) * np.exp(-t / 0.02) * 0.4
        return filt(x, 'lp', lp)
    return cached(('thump', f0, f1, tau, dur, lp, seed), mk)
def tick(f=3200, tau=0.004, seed=0, body=0.0):
    def mk():
        n = n_of(0.06); t = tvec(n)
        x = filt(wnoise(n, 90 + seed), 'bp', f, q=2.5) * np.exp(-t / tau)
        if body: x += body * np.sin(2 * np.pi * f * 0.11 * t) * np.exp(-t / 0.01)
        return x / (np.abs(x).max() + 1e-9)
    return cached(('tick', f, tau, seed, body), mk)
def felt(seed=0):
    """the felt piano's mechanism: a soft hammer/key 'thock' (low, short), a breath of felt"""
    def mk():
        n = n_of(0.09); t = tvec(n)
        x = filt(wnoise(n, 300 + seed), 'lp', 520) * np.exp(-t / 0.011)
        x += 0.5 * np.sin(2 * np.pi * (170 + 13 * seed) * t) * np.exp(-t / 0.014)
        x += 0.15 * filt(wnoise(n, 400 + seed), 'bp', 2200, q=1.5) * np.exp(-t / 0.004)
        return x / (np.abs(x).max() + 1e-9)
    return cached(('felt', seed), mk)
def bell(f, dur=4.0, tau=1.4):
    def mk():
        n = n_of(dur); t = tvec(n); y = np.zeros(n)
        for r, a, k in [(0.5, 0.3, 1.3), (1, 1, 1), (2.0, 0.4, 0.55), (2.76, 0.18, 0.3), (5.4, 0.06, 0.15)]:
            if f * r < 18000: y += a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / (tau * k))
        return y * np.minimum(1, t / 0.001) / 2
    return cached(('bell', round(f, 1), dur, tau), mk)
def glow_tone(f, dur=4.0, att=0.35, tau=1.8):
    """a warm light kindling: soft attack, round partials, a slow chorus between L and R"""
    def mk():
        n = n_of(dur); t = tvec(n)
        env = (1 - np.exp(-t / (att / 3))) * np.exp(-t / tau)
        y = np.zeros((n, 2))
        for c, dc in enumerate((-3.5, 3.5)):
            ff = f * 2 ** (dc / 1200)
            for r, a in [(1, 1.0), (2, 0.22), (3, 0.07), (0.5, 0.12)]:
                y[:, c] += a * np.sin(2 * np.pi * ff * r * t + c * 0.7)
        br = filt(wnoise(n, int(f)), 'bp', min(8000, f * 4), q=1.2) * np.exp(-t / 0.15) * 0.05
        return (y * env[:, None] + br[:, None] * np.minimum(1, t / 0.05)[:, None]) / 1.4
    return cached(('glow', round(f, 1), dur, att, tau), mk)
def air(dur, f0, f1, q=0.9, seed=0):
    """band-passed stereo noise sweeping f0 -> f1 (exponential)"""
    n = n_of(dur); x = np.stack([wnoise(n, seed), wnoise(n, seed + 1)], 1)
    fc = f0 * (f1 / f0) ** (np.arange(n) / max(1, n - 1))
    return sweep(x, 'bp', fc, q=q)
def wind(dur, seed=0, lo=250, hi=1500, rate=0.5, q=0.8):
    """gusty wind: noise through a slowly wandering band-pass, slowly breathing amplitude"""
    n = n_of(dur); x = np.stack([wnoise(n, seed), wnoise(n, seed + 1)], 1)
    fc = lo * (hi / lo) ** smooth_rand(n, rate, seed + 10)
    y = sweep(x, 'bp', fc, q=q)
    am = 0.35 + 0.65 * smooth_rand(n, rate * 1.4, seed + 20) ** 1.5
    return y * am[:, None]
def shepard(dur, rise_oct=-2.0, base=40.0, n_oct=8, accel=1.0):
    n = n_of(dur); t = tvec(n); u = (t / dur) ** accel
    y = np.zeros(n); c = n_oct / 2
    for k in range(n_oct):
        p = (k + rise_oct * u) % n_oct
        f = base * 2 ** p
        a = np.exp(-((p - c) / (n_oct / 5.0)) ** 2)
        y += a * np.sin(2 * np.pi * np.cumsum(f) / SR)
    return y / n_oct
def shimmer(keys, dur, beat_hz=0.35, seed=0):
    """slow detuned shimmer: pairs of pure tones beating against each other, drifting"""
    n = n_of(dur); t = tvec(n); y = np.zeros((n, 2)); rng = np.random.default_rng(seed)
    for j, k in enumerate(keys):
        f = mtof(k); d = beat_hz * (0.7 + 0.6 * rng.random())
        a = 0.4 + 0.6 * smooth_rand(n, 0.25, seed + j)
        y[:, j % 2] += a * np.sin(2 * np.pi * f * t + rng.uniform(0, 6))
        y[:, (j + 1) % 2] += a * np.sin(2 * np.pi * (f + d) * t + rng.uniform(0, 6))
    return y / max(1, len(keys))
def pluck(midi, dur, bright=6.0, decay=0.25, nh=30):
    return cached(('pl', midi, round(dur, 3), bright, decay, nh),
                  lambda: pluck_additive(mtof(midi), dur, bright=bright, decay=decay, nh=nh, tilt=1.0) * 0.6)
def kick(f0=110, f1=44, tau=0.22, dur=0.8, click=0.18):
    def mk():
        n = n_of(dur); t = tvec(n); f = f1 + (f0 - f1) * np.exp(-t / 0.035)
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / tau) * np.minimum(1, t / 0.0015)
        return x + filt(wnoise(n, 3), 'hp', 1500) * np.exp(-t / 0.003) * click
    return cached(('kick', f0, f1, tau, dur, click), mk)
def revcym(L=2.0, seed=12):
    """a reversed cymbal swelling into the next downbeat"""
    def mk():
        n = n_of(L); tt = tvec(n)
        x = np.stack([filt(wnoise(n, seed), 'hp', 3000), filt(wnoise(n, seed + 1), 'hp', 3000)], 1) * np.exp(-tt / 0.7)[:, None]
        met = sum(np.sin(2 * np.pi * f * tt) * np.exp(-tt / 0.6) for f in (3150, 4420, 5870, 7240)) * 0.12
        return (x + to_stereo(met))[::-1] * local_env(n, [(0, 0), (L - 0.02, 1), (L, 0)])[:, None]
    return cached(('revcym', L, seed), mk)
def eclick(seed=0):
    """a tiny electrical click (a phone's switch)"""
    def mk():
        n = n_of(0.05); t = tvec(n)
        x = filt(wnoise(n, 60 + seed), 'bp', 3400, q=2.0) * np.exp(-t / 0.0015)
        x += 0.35 * np.sin(2 * np.pi * 140 * t) * np.exp(-t / 0.005)
        return x / (np.abs(x).max() + 1e-9)
    return cached(('eclick', seed), mk)
def scratch(dur=0.4, seed=0):
    """a pen nib on paper: band-passed grain with a stroke rhythm, a hint of squeak"""
    def mk():
        n = n_of(dur); t = tvec(n)
        x = filt(wnoise(n, 500 + seed), 'bp', 3300, q=1.3, order=2)
        gr = 0.55 + 0.45 * np.sin(2 * np.pi * (28 + 9 * smooth_rand(n, 6, seed)) * t) ** 2
        env = np.minimum(1, t / 0.015) * np.minimum(1, (dur - t) / 0.06).clip(0)
        sq = 0.08 * np.sin(2 * np.pi * np.cumsum(2300 + 400 * smooth_rand(n, 5, seed + 1)) / SR)
        return (x * gr + sq) * env
    return cached(('scratch', round(dur, 2), seed), mk)
def printer(dur, seed=0):
    """a small receipt printer: a stepper whine gated in 16ths, the paper's line feeds, dry"""
    n = n_of(dur); t = tvec(n); y = np.zeros(n)
    k16 = int(np.ceil(dur / S16)); rng = np.random.default_rng(seed)
    for k in range(k16):
        a = [1.0, 0.55, 0.8, 0.55][k % 4]; i0 = n_of(k * S16); L = n_of(S16 * 0.62)
        if i0 >= n: break
        L = min(L, n - i0); tt = tvec(L); f = 820 + 60 * ((k // 4) % 3)
        w = np.sign(np.sin(2 * np.pi * f * tt)) * 0.5 + np.sin(2 * np.pi * 2 * f * tt) * 0.3
        w *= np.minimum(1, tt / 0.004) * np.minimum(1, (L / SR - tt) / 0.01)
        y[i0:i0 + L] += a * w * 0.5
        c = tick(2600 + 300 * (k % 3), 0.002, k % 5, body=0.5)
        j = min(len(c), n - i0); y[i0:i0 + j] += c[:j] * 0.45 * a
    y = filt(filt(y, 'bp', 1600, q=0.6), 'lp', 5000)
    return y * np.minimum(1, t / 0.01)[:] * np.minimum(1, (dur - t) / 0.02).clip(0)
def murmur(dur, seed=0, voices=11):
    """a warm room of people talking: formant-filtered noise with syllable rhythms, low-passed"""
    n = n_of(dur); y = np.zeros((n, 2)); rng = np.random.default_rng(seed)
    for v in range(voices):
        f1 = rng.uniform(320, 780); f2 = rng.uniform(1100, 2000)
        src = wnoise(n, seed * 31 + v)
        x = filt(src, 'bp', f1, q=3.5) + 0.45 * filt(src, 'bp', f2, q=4)
        syl = smooth_rand(n, rng.uniform(7, 10), seed * 7 + v) ** 2.2
        talk = (smooth_rand(n, 0.35, seed * 11 + v) > 0.42).astype(float)
        talk = filt(talk, 'lp', 3)
        p = rng.uniform(-0.8, 0.8); gl, gr = pan_gains(p)
        sig = x * syl * talk * rng.uniform(0.6, 1.0)
        y[:, 0] += sig * gl; y[:, 1] += sig * gr
    return filt(y, 'lp', 1400) / np.sqrt(voices)
def laugh(dur=1.6, seed=0):
    """a soft burst of shared laughter from across the table"""
    n = n_of(dur); t = tvec(n); y = np.zeros((n, 2)); rng = np.random.default_rng(seed)
    for v in range(4):
        rate = rng.uniform(4.5, 6.5); f = rng.uniform(600, 1200); d = rng.uniform(0, 0.25)
        src = filt(wnoise(n, seed * 13 + v), 'bp', f, q=2.5) + 0.4 * filt(wnoise(n, seed * 17 + v), 'bp', f * 2.1, q=3)
        ha = np.maximum(0, np.sin(2 * np.pi * rate * np.maximum(0, t - d))) ** 3 * (t > d)
        env = np.exp(-np.maximum(0, t - d) / (dur * 0.45))
        p = rng.uniform(-0.9, 0.9); gl, gr = pan_gains(p)
        y[:, 0] += src * ha * env * gl; y[:, 1] += src * ha * env * gr
    return filt(y, 'lp', 1800) * np.minimum(1, t / 0.08)[:, None]
def roomtone(dur, seed=0, hum=True):
    """1 a.m.: the low noise of a room, and a phone's faint hum (tuned to E)"""
    n = n_of(dur); t = tvec(n)
    x = np.stack([filt(wnoise(n, seed), 'lp', 260, order=2), filt(wnoise(n, seed + 1), 'lp', 260, order=2)], 1)
    x += 0.04 * np.stack([filt(wnoise(n, seed + 2), 'hp', 3000), filt(wnoise(n, seed + 3), 'hp', 3000)], 1)
    if hum:
        h = sum(a * np.sin(2 * np.pi * mtof(m('E2')) * r * t) for r, a in [(1, 1.0), (2, 0.45), (3, 0.2), (5, 0.06)])
        h *= 0.8 + 0.2 * smooth_rand(n, 0.3, seed + 5)
        x += 0.25 * to_stereo(h)
    return x

# ================================================================ registry, ducks
DUCK = []          # (t0, t1, depth, release) on the music buses
CUTS = {}          # bus-level stops: name -> [(t, fade)]
CLIMAX = ('kline', 'agents', 'summit', 'journey')
PEAK_AT = []       # the sun-break time(s) the template cues inside summit
PRINTING = []      # printer spans (overlapping print cues are one printer running longer)
DONE = {}          # sync-hit registry (form and cues share handlers; no double hits)
def seen(kind, t, win=0.12):
    ts = DONE.setdefault(kind, [])
    if any(abs(t - x) < win for x in ts): return True
    ts.append(t); return False
def cue_in(kind, t0, t1):
    return any(c.get('type') == kind and t0 - 0.05 <= c['t'] < t1 - 0.05 for c in CUES)

# ================================================================ instrument voices
def pno(key, t, dur, vel, g=1.0, pan=0.0, rv=0.35, bg=0.15, cut=None, human=0.006, tail=4.0, mech=1.0, seed=None, free=False, cutf=0.12, nominal=None):
    """the felt piano: soft velocities, the hammer's thock, a little late or early like a hand"""
    if t is None: return
    sd = int(key * 7 + t * 100) if seed is None else seed
    dt = (h01(sd, 3) - 0.5) * 2 * human if human else 0.0
    note(PNO, key, t + dt, dur, vel, g, pan, rv=rv, bg=bg, bus=PNOB, tail=tail, cut=cut, cutf=cutf, nominal=t if nominal is None else nominal, free=free)
    if mech:
        PNOB.add(t + dt - 0.004, felt(sd % 6), 0.010 * mech * g * (vel / 64) ** 1.4 * (1.3 if key < m('C3') else 1.0),
                 pan, rv=0.08, cut=cut, cutf=cutf)

def pchord(keys, t, dur, vel, g=1.0, roll=0.018, pan=(-0.3, 0.3), **kw):
    for j, k in enumerate(sorted(keys)):
        p = pan[0] + (pan[1] - pan[0]) * j / max(1, len(keys) - 1)
        pno(k, t + j * roll if t is not None else None, dur, vel - 2 * j, g, p, mech=1.0 if j == 0 else 0.3, nominal=t, **kw)

def melody(t, seq, voice, unit=BT, **kw):
    """seq: [(note | None, beats)], voice(key, t, dur) -> places one note"""
    for nm, d in seq:
        if nm is not None and t is not None: voice(m(nm), t, d * unit)
        if t is not None: t += d * unit
    return t

def strings(keys, t, dur, vel=56, g=0.2, preset=SSTR, rv=0.45, bg=0.35, fi=1.2, fo=None, spread=0.6, cut=None, cutf=0.12, tail=3.0, bus=None):
    if not ok(t) or dur <= 0: return
    env = [(0, 0), (fi, 1.0)] if fi else None
    if fo: env = (env or [(0, 1)]) + [(max(fi or 0, dur - fo), 1.0), (dur, 0.0)]
    for i, k in enumerate(keys):
        p = 0 if len(keys) == 1 else -spread + 2 * spread * i / (len(keys) - 1)
        note(preset, k, t, dur, vel, g, p, rv=rv, bg=bg, tail=tail, env=env, cut=cut, cutf=cutf, bus=bus)

def pads(t0, t1, preset, vel=50, g=0.3, rv=0.4, bg=0.3, octave=0, fi=0.6, fo=None, overlap=0.4, spread=0.6, which=None,
         bass=False, tail=3.0, cut=None, cutf=0.12, bus=None):
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
            note(preset, k, a, L, vel, g, p, rv=rv, bg=bg, tail=tail, env=env, cut=cut, cutf=cutf, bus=bus)

def basses(t0, t1, preset, vel=60, g=0.5, octave=1, rv=0.3, every=None, dur=None, tail=2.0, cut=None, cutf=0.12, bus=None, piano=False):
    """chord roots: one per chord (or every `every` seconds)"""
    if not ok(t0, t1): return
    for a, b, nm in chord_spans(t0, t1):
        times = [a] if not every else [x for _, x in grid(a, b, every)]
        for x in times:
            L = dur or (b - x if not every else every)
            if piano: pno(CHORDS[nm][0] + 12 * octave, x, L, vel, g, 0, rv=rv, cut=cut)
            else: note(preset, CHORDS[nm][0] + 12 * octave, x, L, vel, g, 0, rv=rv, tail=tail, cut=cut, cutf=cutf, bus=bus)

def pulse(t0, t1, cell, vel=44, g=1.0, octave=0, div=E8, dur=None, seed=1, dens=(1.0, 1.0), accent=5, cut=None, cutf=0.12,
          pan=0.0, rv=0.35, bg=0.1, inst=None, human=0.006):
    """an ostinato over the harmony map: cell entries are chord-tone indices (None = rest), aligned to the global grid"""
    if not ok(t0, t1): return
    for k, t in grid(t0, t1, div):
        c = cell[k % len(cell)]
        if c is None: continue
        u = (t - t0) / max(1e-6, t1 - t0); d = dens[0] + (dens[1] - dens[0]) * u
        if h01(k, seed) > d: continue
        tones = CHORDS[chord_at(t + 0.01)][1]
        key = tones[c % len(tones)] + 12 * (c // len(tones) + octave)
        v = vel + (accent if k % len(cell) == 0 else 0) + int(round((h01(k, seed + 9) - 0.5) * 6))
        L = dur or div * 2.5
        if inst is None: pno(key, t, L, v, g, pan, rv=rv, bg=bg, cut=cut, cutf=cutf, human=human)
        else: note(inst, key, t, L, v, g, pan, rv=rv, bg=bg, cut=cut, cutf=cutf)

def theme(t, seq, vel=50, g=0.5, oct=0, pan=0.08, rv=0.4, bg=0.35, unit=BT, strings_too=None, **kw):
    """the theme on the felt piano (optionally doubled by sustained strings)"""
    def v(k, tt, d): pno(k + 12 * oct, tt, d * 1.15 + 0.3, vel, g, pan, rv=rv, bg=bg, **kw)
    end = melody(t, seq, v, unit)
    if strings_too:
        pr, sv, sg, so = strings_too
        def w(k, tt, d): note(pr, k + 12 * (oct + so), tt, d * 1.02, sv, sg, -pan, rv=0.5, bg=0.45, tail=2.5, env=[(0, 0.2), (0.25, 1.0)])
        melody(t, seq, w, unit)
    return end

QUESTION = [('E4', 1), ('B4', 1), ('A4', 1), ('G4', 1), ('F#4', 2)]

# ================================================================ sync-hit handlers (the BRIEF cue vocabulary)
def sync(fn):
    def w(*a, **k):
        prev = IN_SYNC[0]; IN_SYNC[0] = True
        try: return fn(*a, **k)
        finally: IN_SYNC[0] = prev
    w.__name__ = fn.__name__; return w

@sync
def h_type(t, dur=1.0, **_):
    """soft key taps (a phone keyboard / a pencil), never busy"""
    dur = min(4.0, max(0.1, float(dur or 1.0))); rng = np.random.default_rng(int(t * 1000)); x = t
    bus = POST if gated(t) else FX; gk = 0.25 if gated(t) else 1.0
    while x < t + dur:
        bus.add(x, tick(rng.choice([2200, 2600, 3000]), 0.003, int(rng.integers(0, 6)), body=0.3),
                0.022 * gk * rng.uniform(0.6, 1.0), rng.uniform(-0.2, 0.2), rv=0.12)
        x += rng.uniform(0.09, 0.18)

@sync
def h_swipe(t, **_):
    """a thumb across glass: a soft airy swish"""
    if seen('swipe', t, 0.25): return
    dur = 0.55; n = n_of(dur); u = np.arange(n) / n
    a = air(dur, 900, 4200, q=1.1, seed=int(t * 13) % 1000)
    env = np.minimum(1, u / 0.35) ** 1.6 * np.exp(-np.maximum(0, u - 0.35) * 7)
    a = a * env[:, None]; a[:, 0] *= np.linspace(1.1, 0.7, n); a[:, 1] *= np.linspace(0.7, 1.1, n)
    FX.add(t - 0.12, a, 0.10, 0, rv=0.25)
    FX.add(t - 0.12, tick(1800, 0.006, 3, body=0.0), 0.006, 0.1, rv=0.1)

@sync
def h_tick(t, **_):
    if seen('tick', t, 0.04): return
    bt = btype_at(t)
    if bt == 'rules':                         # a box on the scoring form ticked: dry pencil
        FX.add(t, tick(3200, 0.002, 2, body=0.3), 0.05, 0.15, rv=0.0); return
    if bt == 'exchange':                      # the balance's escapement: a soft wooden tock
        FX.add(t, tick(1300, 0.007, 4, body=1.0), 0.05, 0.3 if len(DONE['tick']) % 2 else -0.3, rv=0.3); return
    if bt == 'trap':                          # the ranking re-sorts, you climb: each step a notch higher
        r = len([x for x in DONE['tick'] if beat_of(x) is beat_of(t)]) - 1
        FX.add(t, tick(2800, 0.003, r % 6, body=0.4), 0.05, 0.1, rv=0.15)
        note(CEL, m('B5') + [0, 3, 7, 8][r % 4], t, 0.3, 56, 0.08, 0.2, rv=0.4, bus=FX); return
    bus = POST if gated(t) else FX
    bus.add(t, tick(3000, 0.0025, int(t * 10) % 6, body=0.4), 0.05, 0.1 * np.sin(t * 3), rv=0.15)
    if bt in ('fuel', 'tries'):
        k = CHORDS[chord_at(t)][1][len(DONE['tick']) % 3] + 24
        note(CEL, k, t, 0.3, 48, 0.06, 0.2, rv=0.4, bus=FX)

@sync
def h_ticks(t, dur=1.0, n=8, p0=0.2, p1=0.8, **_):
    """the scoring clock: a quick, almost mechanical run of soft ticks (16th / 32nd grid), barely pitched"""
    n = int(max(1, n or 1)); dur = max(0.0, float(dur or 0)); p0 = float(p0 if p0 is not None else 0.2); p1 = float(p1 if p1 is not None else p0)
    if seen('ticks', t, 0.2): return
    div = S16 / 2
    mm = int(min(n, max(1, dur / div)))
    slots = sorted(set(int(round((t + (dur * i / mm if mm > 1 else 0)) / div)) for i in range(mm)))
    g0 = 0.075 / np.sqrt(max(1.0, len(slots) / 12))
    for i, s in enumerate(slots):
        tt = s * div; u = i / max(1, len(slots) - 1)
        p = np.clip(p0 + (p1 - p0) * u, 0, 1)
        if gated(tt):                        # in a frozen silence the scoring clock alone goes on ticking
            POST.add(tt, tick(2300 + 1600 * p, 0.0022, i % 6, body=0.55), g0 * 0.07, 0.2 * np.sin(i * 1.3), rv=0.0)
            continue
        FX.add(tt, tick(2300 + 1600 * p, 0.0022, i % 6, body=0.55), g0 * (1.0 if i % 4 == 0 else 0.7), 0.25 * np.sin(i * 1.3), rv=0.12)
        if i % 4 == 0:                       # a faint pitch every beat-quarter: the clock is almost music
            key = scale_note(round(p * 7), m('E5'), PENT)
            note(MBOX, key, tt, 0.2, 36, 0.035, 0.2 * np.sin(i), rv=0.3, bus=FX, tail=1.0)
    if n > len(slots) * 1.5 and dur > 0.3 and not gated(t):
        a = air(dur, 5000, 8000, q=2, seed=n) * np.hanning(n_of(dur))[:, None]
        FX.add(t, a, 0.006, 0, rv=0.3)

@sync
def h_pen(t, dur=None, **_):
    """the red pen: a nib's stroke and a small bright reward (in rules' score: the 0, a muted thud)"""
    if seen('pen', t, 0.2): return
    d = float(dur) if isinstance(dur, (int, float)) and dur > 0 else 0.35
    d = min(1.2, max(0.15, d))
    FX.add(t, scratch(round(d, 2), int(t * 10) % 7), 0.03 if btype_at(t) == 'tries' else 0.05, 0.15, rv=0.15)
    bt, s = step_of(t); bt = tl.btype(bt); sname = (s or {}).get('show')
    if bt == 'rules':
        if sname == 'score':                  # the red 0 on 个性: a muted thud, nothing rewarding
            FX.add(t + d * 0.6, thump(80, 46, 0.10, 0.6, 180), 0.55, 0, rv=0.08)
        return                                # a rule written onto the form: the dry nib only
    if bt == 'tries':                         # your own hand crossing out a wrong character: no scorer, no reward
        return
    if bt in ('yourbill', 'bills'):           # 不是: a plain stroke, a dull low tick
        FX.add(t + d * 0.7, tick(900, 0.008, 1, body=1.0), 0.03, 0.1, rv=0.1); return
    up = CHORDS[chord_at(t)][1]; j = len(DONE['pen']) - 1
    k = up[j % len(up)] + 24
    while k > m('B6'): k -= 12
    FX.add(t + d * 0.8, bell(mtof(k), 2.5, 0.6), 0.035, 0.25, rv=0.4, bg=0.2)
    note(GLK, k, t + d * 0.8, 0.4, 64, 0.10, 0.25, rv=0.4, bus=FX, tail=1.5)

@sync
def h_stamp(t, **_):
    """the 批准 stamp hovers and never lands: a held, unresolved tone (elsewhere a soft, heavy press)"""
    if seen('stamp', t, 0.3): return
    bt = btype_at(t)
    if bt == 'freedom':
        t1 = T('freedom', 'free') if ok(T('freedom', 'free')) and T('freedom', 'free') > t + BT else t + 6 * BT
        L = t1 - t
        env = [(0, 0), (L * 0.85, 1.0), (L, 0.8)]
        for j, k in enumerate(ms('B3', 'E4', 'F#4')):        # Bsus4 tremolo: suspended, never resolves
            note(TREM, k, t, L, 64, 0.16, -0.4 + 0.4 * j, rv=0.4, bg=0.3, env=env, cut=t1, cutf=0.08, bus=FX)
        note(SSTR, m('B1') + 12, t, L, 60, 0.20, 0, rv=0.4, env=env, cut=t1, cutf=0.08, bus=FX)
        n = n_of(L); tt = tvec(n)
        x = np.sin(2 * np.pi * mtof(m('F#5')) * tt) + 0.2 * np.sin(2 * np.pi * mtof(m('F#5')) * 2 * tt)
        FX.add(t, x * local_env(n, env), 0.012, 0.1, rv=0.4, cut=t1, cutf=0.08)
        return
    if bt == 'yourbill':
        return h_title(t)                      # 试错权: the heavy chord (title handler, yourbill branch)
    FX.add(t, thump(90, 40, 0.18, 1.0, 200), 0.5, 0, rv=0.2, bg=0.2)
    FX.add(t, filt(wnoise(n_of(0.3), 41), 'lp', 900) * np.exp(-tvec(n_of(0.3)) / 0.05), 0.05, 0, rv=0.3)

@sync
def h_print(t, dur=2.0, **_):
    """the receipt printer, its 16ths snapped to the music's grid"""
    dur = min(12.0, max(0.3, float(dur or 2.0)))
    if any(a - 0.05 <= t < b for a, b in PRINTING): return                # already printing (merged below)
    ov = [c for c in CUES if c.get('type') == 'print' and t <= c['t'] < t + dur]
    for c in ov: dur = max(dur, c['t'] + min(12.0, float(c.get('dur') or 2.0)) - t)
    PRINTING.append((t, t + dur))
    t0 = snap(t, S16)
    if seen('print', t0, 0.15): return
    x = printer(dur, int(t * 10) % 100)
    g = 0.09 if btype_at(t) == 'bills' else 0.08
    FX.add(t0, x, g, 0.1 if len(DONE['print']) % 2 else -0.1, rv=0.06)
    n = n_of(0.18); FX.add(t0 + dur, filt(wnoise(n, 77), 'bp', 2500, q=0.8) * np.exp(-tvec(n) / 0.04), 0.03, 0.2, rv=0.1)

@sync
def h_click(t, **_):
    if seen('click', t, 0.05): return
    (POST if gated(t) else FX).add(t, eclick(int(t) % 4), 0.06, 0.05, rv=0.08)

@sync
def h_off(t, soft=False, **_):
    """phone off: a tiny click, then real silence; a lamp off: a relay, the light's hum gone"""
    if seen('off', t, 0.2): return
    bt = btype_at(t)
    if bt == 'darkq':
        POST.add(t, eclick(1), 0.07, 0.05, rv=0.0)
        return
    if bt in ('leave', 'scorer', 'exchange'):
        k = 0.45 if soft else 1.0
        FX.add(t, eclick(2), 0.05 * k, 0.0, rv=0.25)
        FX.add(t, thump(70, 40, 0.07, 0.4, 160, 2), 0.20 * k, 0, rv=0.3)
        n = n_of(0.5); FX.add(t, filt(wnoise(n, 81), 'lp', 3000) * np.exp(-tvec(n) / 0.08), 0.006, 0, rv=0.4)
        return
    FX.add(t, eclick(3), 0.04, 0, rv=0.2)

@sync
def h_hush(t, dur=None, **_):
    if seen('hush', t, 0.3): return
    d = float(dur) if isinstance(dur, (int, float)) and dur > 0 else BT
    nt = [x for x in cue_times('title', t, t + 1.5)]
    if nt: DUCK.append((t, nt[0] - 0.05, 0.4, 0.05)); return
    DUCK.append((t, t + d, 0.62, 2 * BT))

@sync
def h_swell(t, dur=3.0, **_):
    """strings breathe toward t + dur, on the chord found there"""
    if seen('swell', t, 0.3): return
    dur = min(12.0, max(0.5, float(dur or 3.0))); bass, up = CHORDS[chord_at(t + dur - 0.05)]
    env = [(0, 0), (dur, 1), (dur + 1.2, 0.5)]
    hi = 24 if btype_at(t) == 'weightless' else 12
    for j, k in enumerate(up):
        note(SSTR, k + hi, t, dur + 1.2, 68, 0.10, -0.5 + j / max(1, len(up) - 1), rv=0.5, bg=0.5, bus=FX, tail=3, env=env)
    if hi == 12: note(CELLO, bass + 12, t, dur + 1.2, 66, 0.12, 0, rv=0.4, bus=FX, tail=3, env=env)
    a = air(dur, 500, 2500, q=0.8, seed=9) * np.linspace(0, 1, n_of(dur))[:, None] ** 2
    FX.add(t, a, 0.012, 0, rv=0.4)

@sync
def h_whoosh(t, dur=1.0, **_):
    if seen('whoosh', t, 0.2): return
    dur = min(8.0, max(0.2, float(dur or 1.0))); n = n_of(dur)
    a = wind(dur, int(t * 7) % 1000, 300, 2200, 1.2) * np.sin(np.pi * np.linspace(0, 1, n))[:, None] ** 1.5
    a[:, 0] *= np.linspace(1.2, 0.6, n); a[:, 1] *= np.linspace(0.6, 1.2, n)
    FX.add(t, a, 0.10, 0, rv=0.3)

@sync
def h_fall(t, dur=None, **_):
    """the floor drops out: a descending Shepard texture and wind; in weightless just a short sinking"""
    if seen('fall', t, 0.3): return
    bt = btype_at(t)
    dur = float(dur) if isinstance(dur, (int, float)) and dur > 0 else (6.5 if bt == 'fall' else 2.0)
    dur = min(10.0, max(0.5, dur)); n = n_of(dur)
    if bt == 'fall':
        sh = shepard(dur, -2.6, 36.0, 9, 1.15) * local_env(n, [(0, 0), (0.6, 0.8), (dur - 1.0, 1.0), (dur, 0)])
        FX.add(t, to_stereo(sh), 0.30, 0, rv=0.25, bg=0.35)
        w = wind(dur, 71, 250, 3200, 0.8, q=0.7) * local_env(n, [(0, 0), (1.0, 0.6), (dur - 0.6, 1.0), (dur, 0)])[:, None]
        FX.add(t, w, 0.17, 0, rv=0.15, bg=0.2)
        for j, k in enumerate(ms('F#6', 'E6', 'C6', 'B5', 'A5', 'F#5', 'E5', 'C5')):   # glints falling past
            FX.add(t + 0.4 + j * dur / 9, glow_tone(mtof(k), 2.0, 0.05, 0.4), 0.03, -0.7 + 0.2 * j, rv=0.4, bg=0.6)
        return
    sh = shepard(dur, -0.8, 120.0, 6, 1.0) * local_env(n, [(0, 0), (dur * 0.3, 1), (dur, 0)])
    FX.add(t, to_stereo(sh), 0.08, 0, rv=0.4, bg=0.4)

@sync
def h_land(t, **_):
    """the landing: soft, warm, one low note and a bloom of strings (elsewhere: a soft footfall)"""
    if seen('land', t, 0.3): return
    bt = btype_at(t)
    if bt == 'fall':
        t1 = E('fall', 'land') or t + 6 * BT
        L = max(2 * BT, t1 - t) + 1.5
        pno(m('C1'), t, 8.0, 70, 0.75, 0, rv=0.3, bg=0.6, human=0, tail=8)
        pno(m('C2'), t + 0.01, 8.0, 50, 0.4, 0, rv=0.3, bg=0.6, human=0, tail=8)
        note(CBASS, m('C2'), t, L, 70, 0.30, 0, rv=0.3, bg=0.4, env=[(0, 0), (0.4, 1)], bus=FX)
        FX.add(t, thump(60, 34, 0.35, 1.5, 120), 0.20, 0, rv=0.2, bg=0.3)
        bloom = ms('C3', 'G3', 'B3', 'D4', 'E4', 'G4', 'B4', 'D5')
        for j, k in enumerate(bloom):        # the strings bloom out of the low note
            note(SSTR, k, t + 0.15 + 0.07 * j, L, 64, 0.11, -0.7 + 1.4 * j / (len(bloom) - 1), rv=0.5, bg=0.7,
                 env=[(0, 0), (1.8, 1.0), (L - 1.0, 0.9)], bus=FX, tail=4)
        note(OOHS, m('G4'), t + 0.5, L, 52, 0.07, 0.0, rv=0.5, bg=0.8, env=[(0, 0), (2.5, 1)], bus=FX, tail=4)
        note(OOHS, m('E4'), t + 0.5, L, 52, 0.06, 0.2, rv=0.5, bg=0.8, env=[(0, 0), (2.5, 1)], bus=FX, tail=4)
        return
    FX.add(t, thump(85, 46, 0.08, 0.5, 200), 0.25, 0, rv=0.1)

@sync
def h_glow(t, **_):
    """a light kindles: a warm amber tone on the chord (in fuel: praise chimes that stack into a chord)"""
    if seen('glow', t, 0.15): return
    bt = btype_at(t)
    idx = sum(1 for x in DONE['glow'] if beat_of(x) is beat_of(t)) - 1
    if bt == 'fuel':
        t_end = (E('fuel', 'rule') or t + 8 * BT) - 0.5 * BT
        stack = ms('G5', 'B5', 'D6', 'E6', 'F#6', 'A6', 'B6')
        k = stack[idx % len(stack)]
        note(GLK, k, t, 0.5, 60, 0.13, -0.6 + 0.24 * (idx % 6), rv=0.45, bg=0.4, bus=FX, tail=2)
        FX.add(t, bell(mtof(k), 3.0, 0.9), 0.020, 0.2, rv=0.4, bg=0.4)
        L = max(0.6, t_end - t)              # each word keeps burning: the chord is fuel
        note(VIB, k - 12, t, 0.6, 54, 0.12, -0.3 + 0.12 * (idx % 6), rv=0.5, bg=0.5, bus=FX, tail=2)
        note(GLASS, k - 12, t, L, 52, 0.07, 0.4 - 0.15 * (idx % 6), rv=0.5, bg=0.5, bus=FX, tail=2.5,
             env=[(0, 0), (0.6, 1.0), (L - 0.6, 1.0), (L, 0.0)])
        return
    up = CHORDS[chord_at(t + 0.02)][1]
    k = up[(idx + 1) % len(up)] + 12
    while k > m('B5'): k -= 12
    while k < m('E5'): k += 12
    if bt == 'darkq':                         # the question lights up in the dark: barely a breath of light
        FX.add(t, glow_tone(mtof(m('B5')), 4.0, 1.0, 1.6), 0.012, 0.1, rv=0.5, bg=0.7); return
    if bt == 'reunion':                       # his stories light the table: warm, but behind the wall
        BLUR.add(t, glow_tone(mtof(k), 4.0, 0.3, 1.6), 0.10, 0.25 * np.sin(idx * 1.9), rv=0.5); return
    FX.add(t, glow_tone(mtof(k), 4.5, 0.4, 1.9), 0.055, 0.25 * np.sin(idx * 1.9), rv=0.5, bg=0.5)
    note(VIB, k, t, 1.0, 48, 0.07, 0.15, rv=0.5, bg=0.5, bus=FX, tail=2)

@sync
def h_title(t, **_):
    """the title moment: after the silence, a low, deep chord and the theme in the piano"""
    if seen('title', t, 0.3): return
    bt = btype_at(t)
    if bt == 'leave':
        b, s_ = step_of(t); L = max(4.0, (s_['t'] + s_['dur'] if s_ else b['end']) - t) + 2.0
        pno(m('E1'), t, 7.0, 84, 0.8, -0.05, rv=0.3, bg=0.7, human=0, tail=8)
        pno(m('E2'), t + 0.012, 7.0, 62, 0.45, 0.05, rv=0.3, bg=0.7, human=0, tail=8)
        pno(m('B2'), t + 0.024, 7.0, 54, 0.35, 0.1, rv=0.3, bg=0.7, human=0, tail=8)
        note(CBASS, m('E2'), t, L, 72, 0.32, 0, rv=0.3, bg=0.5, env=[(0, 0), (0.5, 1)], bus=FX)
        note(CELLO, m('E2'), t, L, 68, 0.26, -0.1, rv=0.4, bg=0.5, env=[(0, 0), (0.8, 1)], bus=FX)
        note(CELLO, m('B2'), t, L, 64, 0.20, 0.1, rv=0.4, bg=0.5, env=[(0, 0), (1.0, 1)], bus=FX)
        for k, p in zip(['G3', 'B3', 'D4', 'F#4'], [-0.5, -0.17, 0.17, 0.5]):
            note(SSTR, m(k), t + 0.2, L, 54, 0.10, p, rv=0.5, bg=0.7, tail=5, env=[(0, 0), (2.2, 1)], bus=FX)
        note(PAD, m('E3'), t, L, 56, 0.10, 0, rv=0.3, bg=0.6, tail=5, env=[(0, 0), (1.5, 1)], bus=FX)
        note(OOHS, m('B3'), t + 0.4, L - 0.4, 48, 0.05, 0.0, rv=0.4, bg=0.8, tail=5, env=[(0, 0), (2.5, 1)], bus=FX)
        FX.add(t, thump(55, 32, 0.4, 1.6, 110), 0.16, 0, bg=0.4)
        return
    if bt == 'darkq': return                   # the question's title is the theme itself (composed)
    if bt == 'end':                           # 'Have a try' appears: a warm light, high
        FX.add(t, glow_tone(mtof(m('B5')), 4.0, 0.3, 1.6), 0.03, 0.2, rv=0.5, bg=0.7)
        note(CEL, m('E6'), t, 1.0, 44, 0.06, 0.25, rv=0.5, bg=0.8, bus=FX); return
    if bt == 'yourbill':
        b = beat_of(t); L = max(3.0, b['end'] - t) + 1.5
        for j, k in enumerate(ms('C1', 'G1', 'C2')):
            pno(k, t + 0.01 * j, 6.0, 86 - 8 * j, 0.7 - 0.15 * j, 0, rv=0.3, bg=0.6, human=0, tail=7)
        note(CBASS, m('C2'), t, L, 80, 0.38, 0, rv=0.3, bg=0.4, env=[(0, 0), (0.2, 1)], bus=FX)
        for k, p in zip(['C3', 'G3', 'E4', 'B4', 'D5'], [-0.4, -0.2, 0, 0.2, 0.4]):
            note(SSTR, m(k), t + 0.05, L, 62, 0.11, p, rv=0.5, bg=0.6, env=[(0, 0), (1.0, 1)], bus=FX, tail=4)
        note(CELLO, m('G2'), t, L, 70, 0.22, 0.0, rv=0.4, bg=0.4, env=[(0, 0), (0.6, 1)], bus=FX)
        FX.add(t, thump(62, 30, 0.45, 1.8, 120), 0.32, 0, rv=0.2, bg=0.4)
        return
    k = CHORDS[chord_at(t)][1][0] + 12
    pno(k - 12, t, 3.0, 50, 0.4, 0, rv=0.4, bg=0.5, human=0)
    FX.add(t, bell(mtof(k + 12), 3.5, 1.1), 0.02, 0.3, rv=0.5, bg=0.6)

@sync
def h_freeze(t, dur=None, **_):
    if seen('freeze', t, 0.3): return
    if isinstance(dur, (int, float)) and dur > 0: t1 = t + dur
    elif btype_at(t) == 'trap' and ok(T('trap', 'rank')) and T('trap', 'rank') > t + BT: t1 = T('trap', 'rank')
    else:
        b, s = step_of(t); t1 = s['t'] + s['dur'] if s else min(b['end'], t + 2 * BT)
        t1 = max(t1, t + 2 * BT)
    GATE.append((t, t1))

@sync
def h_resolve(t, **_):
    if seen('resolve', t, 0.3): return
    bass, up = CHORDS[chord_at(t + 0.05)]
    for j, k in enumerate([bass + 12] + up + [up[0] + 12]):
        note(HARP, k, t + j * 0.06, 1.5, 54, 0.14, -0.4 + 0.15 * j, rv=0.5, bg=0.4, bus=FX)
    FX.add(t, glow_tone(mtof(up[0] + 24), 3.5, 0.2, 1.4), 0.025, 0.1, rv=0.5, bg=0.5)

@sync
def h_beat(t, **kw):
    """a downbeat hit: low tom + kick (+ timpani in the climb), on the chord root"""
    if 'visual' in kw: return                  # a scene marker, not a hit
    if seen('beathit', t, 0.15): return
    bt = btype_at(t); root = CHORDS[chord_at(t + 0.02)][0]
    if bt in CLIMAX:
        FX.add(t, kick(95, 40, 0.3, 1.0, 0.1), 0.30, 0, rv=0.15, bg=0.1)
        drum(LTOM, t, 96, 0.38, -0.15, rv=0.3, bg=0.2, bus=FX)
        if bt in ('kline', 'summit'): note(TIMP, root + 12, t, 1.0, 92, 0.36, 0.05, rv=0.3, bg=0.3, bus=FX)
        return
    FX.add(t, thump(80, 44, 0.12, 0.6, 200), 0.3, 0, rv=0.15)

@sync
def h_rise(t, dur=2.0, **_):
    """a riser that lands at t + dur: air sweeping up, a rising tone, a reversed cymbal"""
    if seen('rise', t, 0.3): return
    dur = min(10.0, max(0.4, float(dur or 2.0))); n = n_of(dur); u = np.arange(n) / n
    a = air(dur, 300, 7000, q=1.3, seed=int(t * 10) % 997) * (u ** 2.0)[:, None]
    f = mtof(CHORDS[chord_at(t + dur + 0.02)][0] + 24) * 2 ** (u * 1.0)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * u ** 2.5 * 0.3
    x = (a * 0.6 + to_stereo(tone)) * local_env(n, [(0, 1), (dur - 0.03, 1), (dur, 0)])[:, None]
    k = 1.0 if btype_at(t + dur - 0.05) in CLIMAX else 0.45
    FX.add(t, x, 0.10 * k, 0, rv=0.3)
    L = min(dur, 2.0); FX.add(t + dur - L, revcym(round(L, 2)), 0.10 * k, 0, rv=0.3, bg=0.3)

@sync
def h_drop(t, **_):
    """the dip: everything cut to one low hit (the silence itself is set up before composing)"""
    if seen('drop', t, 0.3): return
    root = CHORDS[chord_at(t + 0.02)][0]
    bus = POST if gated(t) else FX
    note(PNO, root - 12, t, 3.0, 104, 0.40, 0, rv=0.3, bg=0.6, bus=bus, tail=5)
    note(PNO, root, t + 0.008, 3.0, 90, 0.22, 0, rv=0.3, bg=0.6, bus=bus, tail=5, nominal=t)
    note(TIMP, root + 12, t, 2.0, 112, 0.32, 0, rv=0.3, bg=0.6, bus=bus)
    bus.add(t, kick(70, 30, 0.6, 2.0, 0.15), 0.26, 0, rv=0.2, bg=0.5)
    drum(BASSDRUM, t, 112, 0.22, 0, rv=0.3, bg=0.5, kit=KIT_ORCH, bus=bus)

@sync
def h_spawn(t, dur=1.5, n=24, **_):
    """agents spawning: a rising cascade of tiny plucks fanning out across the stereo field"""
    if seen('spawn', t, 0.2): return
    dur = min(6.0, max(0.2, float(dur or 1.5))); n = int(max(1, n or 24))
    div = S16 / 2; mm = int(min(n, max(1, dur / div), 32))
    slots = sorted(set(int(round((t + dur * i / max(1, mm - 1)) / div)) for i in range(mm))) if mm > 1 else [int(round(t / div))]
    up = CHORDS[chord_at(t + 0.02)][1]; tones = [k + 12 * o for o in (1, 2) for k in up]
    w = len(DONE['spawn']) - 1
    for i, sl in enumerate(slots):
        tt = sl * div; u = i / max(1, len(slots) - 1)
        key = tones[min(len(tones) - 1, int(u * len(tones)))] + (12 if (w % 2 and u > 0.6) else 0)
        x = pluck(int(key), 0.5, 9.0, 0.12, 24)
        FX.add(tt, x, 0.05 * (0.6 + 0.4 * u), np.sin(i * 2.4 + w) * (0.3 + 0.6 * u), rv=0.35, bg=0.3)
    if n > len(slots) * 2:                     # many more agents than notes: a glittering bed under the cascade
        FX.add(t, air(dur, 4000, 9000, q=2, seed=n % 97) * np.hanning(n_of(dur))[:, None], 0.02, 0, rv=0.4)

@sync
def h_pulse(t, **_):
    """a pulse through the network: a soft sub kick and a short bright chord"""
    if seen('pulse', t, 0.1): return
    FX.add(t, kick(70, 42, 0.18, 0.6, 0.05), 0.25, 0, rv=0.15)
    for j, k in enumerate(CHORDS[chord_at(t + 0.02)][1]):
        FX.add(t, pluck(k + 12, 0.4, 7.0, 0.1, 20), 0.035, -0.4 + 0.4 * j, rv=0.4, bg=0.2)

@sync
def h_peak(t, **_):
    """the sun breaks: the film's peak (in summit composed by the form at this time); elsewhere a big warm hit"""
    if seen('peak', t, 0.3): return
    if btype_at(t) == 'summit': PEAK_AT.append(t); return
    drum(CRASH, t, 90, 0.35, 0.3, rv=0.4, bg=0.4, bus=FX)
    note(TIMP, CHORDS[chord_at(t + 0.02)][0] + 12, t, 1.5, 100, 0.5, 0, rv=0.3, bg=0.4, bus=FX)

@sync
def h_wind(t, dur=3.0, **_):
    if seen('wind', t, 0.3): return
    dur = min(12.0, max(0.5, float(dur or 3.0))); n = n_of(dur)
    w = wind(dur, int(t * 3) % 997, 300, 2400, 0.9) * local_env(n, [(0, 0), (min(1.0, dur / 3), 1), (dur * 0.7, 0.9), (dur, 0)])[:, None]
    FX.add(t, w, 0.11, 0, rv=0.3)

HANDLERS = {'type': h_type, 'swipe': h_swipe, 'tick': h_tick, 'ticks': h_ticks, 'pen': h_pen, 'stamp': h_stamp,
            'print': h_print, 'click': h_click, 'off': h_off, 'hush': h_hush, 'swell': h_swell, 'whoosh': h_whoosh,
            'fall': h_fall, 'land': h_land, 'glow': h_glow, 'title': h_title, 'freeze': h_freeze, 'resolve': h_resolve,
            'beat': h_beat, 'rise': h_rise, 'drop': h_drop, 'spawn': h_spawn, 'pulse': h_pulse, 'peak': h_peak, 'wind': h_wind}
def anchor(kind, vtype, name, k=0.0, **kw):
    """a form-level hit at a step start (+k beats), unless the template already cues this kind inside that step"""
    t0, t1 = T(vtype, name), E(vtype, name)
    if not ok(t0): return None
    if cue_in(kind, t0, t1): return cue_times(kind, t0, t1)[0]
    HANDLERS[kind](t0 + k * BT, **kw); return t0 + k * BT

# ================================================================ HARMONY (from the timeline structure)
# e0 深夜
H('feed', 'clock', 'Em9'); H('feed', 'swipe1', 'Cmaj7'); H('feed', 'swipe2', ['Am9', 'Am9', 'G']); H('feed', 'swipe3', 'Cmaj9')
H('feed', 'stare', ['Em9', 'Em9', 'Cmaj7#11'])
H('answers', 'facts', ['Em', 'G', 'D']); H('answers', 'fill', ['Em', 'C', 'D']); H('answers', 'right', ['G', 'D/F#'])
H('answers', 'gray', ['Em9', 'Em7', 'E5'])
H('darkq', 'off', 'E5'); H('darkq', 'dark', 'E5'); H('darkq', 'q', ['Emadd9', 'Emadd9', 'Emadd9', 'Emadd9', 'Bsus4'])
# e1 打分的人走了
H('reunion', 'table', ['Cmaj7', 'G/B']); H('reunion', 'arrive', ['Am7', 'G', 'Cmaj7']); H('reunion', 'stories', ['Am7', 'G/B', 'Cmaj7', 'D'])
H('reunion', 'wait', ['Cmaj7', 'G/B', 'Am7']); H('reunion', 'none', 'Em9')
H('scorer', 'school', ['G', 'D/F#']); H('scorer', 'marks', ['Em7', 'C', 'G/D', 'D']); H('scorer', 'seen', ['G', 'Em7', 'Cadd9'])
H('scorer', 'held', ['Am7', 'Dsus4', 'D'])
H('leave', 'go', 'Cmaj7'); H('leave', 'none', 'Cmaj7'); H('leave', 'title', 'Em9'); H('leave', 'lamp', ['Cmaj7', 'Am9', 'Am9'])
H('leave', 'held', ['Cmaj7#11', 'B7sus4', 'B7sus4'])
# e2 好孩子思维
H('fuel', 'name', ['Em9', 'Em9', 'Cmaj7']); H('fuel', 'praise', ['G', 'Gmaj7', 'Cmaj9', 'Cmaj9']); H('fuel', 'rule', ['Am9', 'Am9', 'F#m7b5', 'B7sus4'])
H('weightless', 'met', ['Em', 'G', 'Em']); H('weightless', 'gone', ['Emadd9', 'Cmaj7#11']); H('weightless', 'fork', ['Cmaj7#11', 'Am9'])
H('rules', 'r1', ['Em', 'Em/D']); H('rules', 'r2', ['C', 'Am']); H('rules', 'r3', ['F#m7b5', 'B7'])
H('rules', 'score', ['Em', 'Em', 'Em']); H('rules', 'end', ['Cmaj7', 'Am9', 'B7sus4', 'B7sus4'])
# e3 你羡慕的
H('honest', 'bike', 'Cmaj7'); H('honest', 'q', ['Cmaj7', 'D6', 'D6']); H('honest', 'no', 'Am7'); H('honest', 'what', ['Bsus4', 'Bsus4', 'B7sus4'])
H('freedom', 'word', ['Em7', 'Em7', 'Cadd9']); H('freedom', 'items', ['G', 'D/F#', 'Em7', 'Cadd9']); H('freedom', 'stamp', 'Bsus4')
H('freedom', 'free', ['Gadd9', 'D/F#', 'Em7']); H('freedom', 'need', ['Cmaj7', 'Cmaj7', 'Emadd9'])
# e4 账单不同
H('bills', 'print', ['Em', 'Em', 'C', 'Am', 'B7']); H('bills', 'pay', ['Am9', 'Am9', 'B7sus4'])
H('trap', 'relief', ['G', 'D/F#', 'Em7']); H('trap', 'climb', ['Cadd9', 'D']); H('trap', 'back', 'E5'); H('trap', 'rank', 'E5')
H('exchange', 'scale', ['Em9', 'Cmaj7', 'Em9', 'Cmaj7']); H('exchange', 'trade', ['Am9', 'D', 'Gmaj7']); H('exchange', 'empty', ['Em9', 'Em9', 'Em9', 'Bsus4'])
# e5 试错权
H('yourbill', 'print', 'Em'); H('yourbill', 'word', 'Cmaj9')
H('never', 'a18', 'Am9'); H('never', 'a20', 'F#m7b5'); H('never', 'a25', 'B7'); H('never', 'never', 'B7')
H('fall', 'cliff', 'B(b9)'); H('fall', 'step', 'B(b9)'); H('fall', 'drop', 'B(b9)'); H('fall', 'land', 'Cmaj9')
HB('fall', 'floor', [('Cmaj7', 2), ('Am7', 2), ('D', 99)])
# e6 Have a try
H('stand', 'not', 'Em9'); H('stand', 'up', ['C', 'D', 'G/B', 'Cadd9']); H('stand', 'given', ['Am9', 'Am9', 'Dsus4'])
H('stand', 'kid', ['Em9', 'Em9', 'Em9', 'Cmaj7'])
H('tries', 'try', ['G', 'D/F#', 'Em7']); H('tries', 't1', ['C', 'G']); H('tries', 't2', ['D', 'Em7']); H('tries', 't3', ['C', 'G/B'])
H('tries', 't4', ['Am7', 'D']); H('tries', 't5', ['Em7', 'C']); H('tries', 't6', ['G', 'D']); H('tries', 'fine', ['C', 'G', 'D'])
HB('lamp', 'take', [('Cmaj7', 2), ('Dadd9', 2), ('Eadd9', 99)])
# the climax (E major)
HB('kline', 'run', [('E', 2), ('C#m7', 2), ('A', 1), ('B', 99)]); HB('kline', 'dip', [('C#m', 99)]); HB('kline', 'climb', [('A', 2), ('B', 99)])
HB('agents', 'found', [('Eadd9', 2), ('E/G#', 99)]); HB('agents', 'spawn', [('A', 2), ('B', 2), ('C#m7', 99)])
HB('agents', 'command', [('A', 2), ('F#m7', 2), ('Bsus4', 1), ('B', 99)])
HB('summit', 'climb', [('Bsus4', 2), ('B7', 99)]); HB('summit', 'peak', [('E', 2), ('Amaj7', 2), ('B', 2), ('E/G#', 99)])
HB('journey', 'ride', [('E', 2), ('B/D#', 2), ('C#m7', 2), ('A', 99)]); HB('journey', 'free', [('Aadd9', 2), ('Eadd9', 99)])
HB('end', 'years', [('E', 2), ('C#m7', 2), ('Aadd9', 99)]); HB('end', 'try', [('Aadd9', 2), ('Bsus4', 99)])
HB('end', 'love', [('E', 2), ('Amaj7', 2), ('Bsus4', 2), ('B', 99)]); HB('end', 'you', [('Eadd9', 99)])
H('end', 'life', 'Eadd9')

# ================================================================ FORM
print('composing ...', flush=True)
# the silences first, so every note knows where the film is silent
for c in CUES:
    if c.get('type') == 'freeze': h_freeze(float(c['t']), dur=c.get('dur'))
T_OFF = None                                # 1 a.m.: the phone switches off -> real silence until the question
if B('darkq'):
    T_OFF = first('off', T('darkq'), T('darkq', 'q') or E('darkq'), T('darkq', 'dark') or T('darkq'))
    t_q = T('darkq', 'q') or E('darkq')
    GATE.append((T_OFF, t_q if t_q > T_OFF + BT else T_OFF + 2 * BT))
    h_off(T_OFF)
if B('kline'):                              # the dip: a dead cut to one low hit, then the build
    _d0, _d1 = T('kline', 'dip') or T('kline'), T('kline', 'climb') or E('kline')
    T_DROP = first('drop', T('kline'), E('kline'), _d0)
    GATE.append((T_DROP, min(_d1 - 0.05, T_DROP + BT) if _d1 > T_DROP + 0.5 * BT else T_DROP + 0.5 * BT))
if B('trap') and not any(beat_of(a) is B('trap') for a, _ in GATE):
    h_freeze(first('freeze', T('trap', 'climb') or T('trap'), E('trap'), T('trap', 'back') or T('trap', 'rank') or T('trap')))

# ---------------------------------------------------------------- e0 · b01 feed: 1 a.m., room tone, sparse felt piano, swishes
if B('feed'):
    a = T('feed'); tend = T_OFF or E('darkq') or E('feed')
    L = tend - a
    rt = roomtone(L + 0.5, 5) * local_env(n_of(L + 0.5), [(0, 0), (1.2, 1.0), (L - 0.05, 1.0), (L, 0.0)])[:, None]
    MUS.add(a, rt, 0.016, 0, rv=0.0, cut=tend, cutf=0.003)
    # the felt piano at 1 a.m.: single notes, far apart, the pedal down
    P = [('clock', [(1, 'B4', 40), (3, 'E4', 34)]),
         ('swipe1', [(0, 'C3', 38), (0, 'G3', 30), (2, 'E4', 36), (3, 'B4', 38), (5, 'G4', 32)]),
         ('swipe2', [(0, 'A2', 38), (0, 'E3', 30), (2, 'C5', 36), (3, 'B4', 34), (4, 'G2', 34), (5, 'D4', 32)]),
         ('swipe3', [(0, 'C3', 40), (0, 'G3', 32), (1, 'E4', 36), (2, 'D5', 40), (3, 'B4', 36), (5, 'E4', 32)]),
         ('stare', [(0, 'E2', 40), (0, 'B2', 32), (2, 'G4', 34), (3, 'F#4', 32), (5, 'C3', 32), (5, 'B3', 28)])]
    for nm, ev in P:
        for k, key, v in ev:
            pno(m(key), at('feed', nm, k), 3.5, v, 0.55, 0.15 if m(key) > m('C4') else -0.15, rv=0.45, bg=0.3)
    # the three warm lives on the screen: a soft pad breathes in with each card, then lets go
    for nm in ('swipe1', 'swipe2', 'swipe3'):
        s0, s1 = T('feed', nm), E('feed', nm)
        if not ok(s0): continue
        pads(s0, s1, PAD, 50, 0.13, rv=0.4, bg=0.4, fi=1.6, fo=1.4, overlap=0.6)
        pads(s0 + 2 * BT, s1, SSTR, 44, 0.06, rv=0.5, bg=0.5, fi=1.5, fo=1.2, octave=1, which=[1, 2])
        anchor('swipe', 'feed', nm)
    if ok(T('feed', 'stare')):                 # something sinks: a cello low E
        s0 = T('feed', 'stare'); note(CELLO, m('E2'), s0, E('feed', 'stare') - s0 + 1.0, 50, 0.16, 0, rv=0.45, bg=0.4,
                                     env=[(0, 0), (1.5, 1), (E('feed', 'stare') - s0, 0.8), (E('feed', 'stare') - s0 + 1.0, 0)])

# ---------------------------------------------------------------- e0 · b02 answers: correct, orderly; the scoring clock; grey
if B('answers'):
    f0, f1 = T('answers', 'facts'), E('answers', 'facts')
    for i, (a_, b_, nm) in enumerate(chord_spans(f0, f1)):          # three facts, three plain correct chords
        bs, up = CHORDS[nm]
        pchord([bs + 12] + up, a_, 2 * BT + 0.6, 42 + 2 * i, 0.42, rv=0.4, bg=0.25)
    t_fill, e_fill = T('answers', 'fill'), E('answers', 'fill')
    if ok(t_fill):
        pulse(t_fill, e_fill, [0, 1, 2, 1], 34, 0.30, octave=1, div=E8, dur=E8 * 1.2, seed=7, human=0.0, rv=0.25, bg=0.0)
        basses(t_fill, e_fill, None, 40, 0.4, 1, piano=True, rv=0.4)
        anchor('ticks', 'answers', 'fill', dur=(e_fill - t_fill) * 0.7, n=36, p0=0.1, p1=0.9)
    t_r = T('answers', 'right')
    if ok(t_r):                                 # 每一步都对: a small, neat cadence
        pchord(ms('G2', 'D3', 'B3', 'G4'), t_r, 2 * BT + 0.5, 44, 0.42, rv=0.4, bg=0.3)
        pchord(ms('F#2', 'D3', 'A3', 'F#4'), t_r + 2 * BT, 2 * BT + 0.5, 40, 0.40, rv=0.4, bg=0.3)
        pno(m('D5'), t_r + BT, 1.5, 38, 0.35, 0.2); pno(m('B4'), t_r + 3 * BT, 1.5, 36, 0.35, 0.2)
    t_g, e_g = T('answers', 'gray'), E('answers', 'gray')
    if ok(t_g):                                 # the sheet turns grey: the harmony drains to an open fifth
        tend = T_OFF or e_g; Lg = tend - t_g
        for k, gg in [('E2', 0.18), ('B2', 0.14)]:
            note(CELLO, m(k), t_g, Lg + 0.5, 54, gg, 0, rv=0.45, bg=0.4, env=[(0, 0), (1.2, 1)], cut=tend, cutf=0.003)
        for k, gg in [('B3', 0.07), ('E4', 0.06)]:
            note(SSTR, m(k), t_g, Lg + 0.5, 48, gg, 0.2, rv=0.5, bg=0.5, env=[(0, 0), (1.5, 1)], cut=tend, cutf=0.003)
        for k, pan in [('G3', -0.3), ('D4', 0.3), ('F#4', 0.4)]:   # the colour leaves, one tone at a time
            fade_at = (e_g - t_g) * (0.35 if k == 'F#4' else 0.55 if k == 'D4' else 0.8)
            note(SSTR, m(k), t_g, fade_at + 0.5, 46, 0.06, pan, rv=0.5, bg=0.5, env=[(0, 0), (1.2, 1), (fade_at, 0.7), (fade_at + 0.5, 0)])
        pchord(ms('E2', 'B2', 'G3', 'D4', 'F#4'), t_g, 4.0, 40, 0.38, rv=0.45, bg=0.4)
        pno(m('B3'), t_g + 4 * BT, 3.0, 32, 0.4, 0.1); pno(m('E3'), t_g + 4 * BT + 0.01, 3.0, 30, 0.35, -0.1)

# ---------------------------------------------------------------- e0 · b03 darkq: open fifth thins; off; silence; the question
if B('darkq'):
    t_o, tend = T('darkq', 'off'), T_OFF or T('darkq', 'dark')
    if ok(t_o) and tend > t_o:
        L = tend - t_o
        note(CELLO, m('E2'), t_o, L + 1, 48, 0.17, 0, rv=0.45, bg=0.4, cut=tend, cutf=0.003)
        note(CELLO, m('B2'), t_o, L + 1, 44, 0.12, 0.1, rv=0.45, bg=0.4, cut=tend, cutf=0.003,
             env=[(0, 1), (L * 0.6, 0.4)])
        pno(m('E3'), t_o + 2 * BT, 3.0, 30, 0.35, -0.1, cut=tend, cutf=0.003)
    t_q = T('darkq', 'q')
    if ok(t_q):                                 # the question: the theme, alone, very quiet
        theme(t_q + BT, [('E4', 1.5), ('B4', 1.5), ('A4', 1), ('G4', 1), ('F#4', 4)], vel=34, g=0.55, rv=0.5, bg=0.6, human=0.012)
        s = T('darkq', 'q') + 5 * BT          # the held F# is kept alive by a breath of a high string
        note(VLN, m('F#5'), s, 4 * BT, 32, 0.035, 0.2, rv=0.6, bg=0.8, env=[(0, 0), (2.0, 1), (4 * BT, 0)])

# ---------------------------------------------------------------- e1 · b04 reunion: their warmth through a wall; 'none' stops it
if B('reunion'):
    a, b = T('reunion'), E('reunion')
    t_none = first(('hush', 'off'), T('reunion', 'none') - 0.5 * BT if ok(T('reunion', 'none')) else b, b,
                   T('reunion', 'none') or b)
    CUTS.setdefault('blur', []).append((t_none, 0.12))
    L = t_none - a
    mm = murmur(L + 1.0, 4) * local_env(n_of(L + 1.0), [(0, 0), (2 * BT, 0.7), (L * 0.35, 1.0), (L + 1, 1.0)])[:, None]
    BLUR.add(a, mm, 0.30, 0, rv=0.35)
    # warm, slightly blurred chords: a soft EP comping and the pad, behind the wall
    for a_, b_, nm in chord_spans(a, t_none):
        bs, up = CHORDS[nm]
        for k, t in grid(a_, b_, BT):
            v = 54 if k % 2 == 0 else 46
            for j, kk in enumerate(up): note(EP, kk + 12, t, BT * 0.9, v, 0.16, -0.3 + 0.3 * j, rv=0.4, bus=BLUR, tail=1.5)
        note(EP, bs + 12, a_, b_ - a_, 56, 0.20, 0, rv=0.3, bus=BLUR, tail=1.5)
    pads(a, t_none, PAD, 52, 0.18, rv=0.4, bg=0.3, fi=2.0, bus=BLUR)
    pads(a, t_none, CBASS, 52, 0.12, rv=0.3, bass=True, octave=0, fi=1.0, bus=BLUR)
    # stories: laughter rolls across the table, three times
    s0, s1 = T('reunion', 'stories'), E('reunion', 'stories')
    if ok(s0):
        lt_ = cue_times('glow', s0, s1) or [snap(s0 + (s1 - s0) * (i + 0.6) / 3, BT) for i in range(3)]
        for i, x in enumerate(lt_[:4]): BLUR.add(x + 0.5, laugh(1.8, 3 + i), 0.22, 0.3 * np.sin(i * 2.1), rv=0.4)
    # arrive: everyone turns toward him (a lift in the warmth)
    if ok(T('reunion', 'arrive')):
        t_ar = T('reunion', 'arrive')
        BLUR.add(t_ar, air(2 * BT, 400, 1600, q=0.7, seed=3) * np.hanning(n_of(2 * BT))[:, None], 0.05, 0, rv=0.4)
    # wait: your own small notes, close and clear, unanswered under their warmth
    if ok(T('reunion', 'wait')):
        w = T('reunion', 'wait')
        pno(m('E4'), w + 2 * BT, 2.0, 36, 0.5, 0.1, rv=0.45, bg=0.3)
        pno(m('B4'), w + 3 * BT, 3.0, 34, 0.5, 0.15, rv=0.45, bg=0.3)
    # none: it stops. Only the room is left, then one low note
    if ok(T('reunion', 'none')):
        tn = T('reunion', 'none')
        pno(m('E2'), tn + 2 * BT, 4.0, 36, 0.5, -0.1, rv=0.5, bg=0.5)
        pno(m('B2'), tn + 2 * BT + 0.02, 4.0, 30, 0.4, 0.0, rv=0.5, bg=0.5, nominal=tn + 2 * BT)
        note(CELLO, m('E2'), tn + 2 * BT, 4 * BT, 40, 0.10, 0, rv=0.5, bg=0.5, env=[(0, 0), (1.5, 1), (4 * BT, 0)])

# ---------------------------------------------------------------- e1 · b05 scorer + b06 leave: the school, then the holders leave
SCHOOL = None
if B('scorer'):
    a = T('scorer'); go0 = T('leave', 'go') if B('leave') else E('scorer')
    go1 = E('leave', 'go') if B('leave') else E('scorer')
    offs = cue_times('off', go0, go1 + BT) if B('leave') else []
    if not offs and B('leave'):
        offs = [go0 + 2 * BT, go0 + 4 * BT, go0 + 6 * BT]
        for x in offs: h_off(x)
    NL = 3                                      # layers: the praise (music box), the pulse, the warm chord
    offs = sorted(offs)[:NL]
    cut = list(offs); cf = [0.15] * len(cut)
    while len(cut) < NL:                        # fewer lamps than layers: the rest fade as the last beam fades
        cut.append(max((cut[-1] + 2 * BT) if cut else go0, go1 - 2 * BT)); cf.append(1.6)
    SCHOOL = cut
    # layer 1: the music box / celesta: the theme made correct and complete, in G major
    mb = [(T('scorer', 'school'), [('G5', 1), ('D6', 1), ('C6', 1), ('B5', 1)]),
          (T('scorer', 'marks'), [('A5', 1), ('B5', 1), ('G5', 2), ('B5', 1), ('D6', 1), ('C6', 1), ('A5', 1)]),
          (T('scorer', 'seen'), [('G5', 1), ('D6', 1), ('C6', 1), ('B5', 1), ('A5', 1), ('G5', 1)]),
          (T('scorer', 'held'), [('A5', 1), ('C6', 1), ('B5', 1), ('A5', 1), ('F#5', 2)]),
          (go0, [('G5', 1), ('E6', 1), ('D6', 1), ('B5', 1), ('C6', 2), ('B5', 2)])]
    for t0, seq in mb:
        if t0 is None: continue
        def vb(k, tt, d): note(MBOX, k, tt, d, 64, 0.20, 0.3, rv=0.4, bg=0.3, cut=cut[0], cutf=cf[0], tail=2)
        def vc(k, tt, d): note(CEL, k - 12, tt, d, 56, 0.12, -0.2, rv=0.4, bg=0.3, cut=cut[0], cutf=cf[0], tail=2)
        melody(t0, seq, vb); melody(t0, seq, vc)
    # layer 2: the orderly pulse: piano broken chords in 8ths and a pizzicato root on every other beat
    pulse(a, go1, [0, 2, 1, 2], 40, 0.36, octave=0, div=E8, dur=E8 * 1.6, seed=11, human=0.0, cut=cut[1], cutf=cf[1], rv=0.35, bg=0.1)
    for k, t in grid(a, go1, 2 * BT):
        note(PIZZ, CHORDS[chord_at(t + 0.01)][0] + 12, t, 0.4, 70, 0.34, -0.05, rv=0.35, cut=cut[1], cutf=cf[1])
    # layer 3: the warm chord (strings + pad), being seen
    t_seen = T('scorer', 'seen') or a
    pads(T('scorer', 'marks') or a, go1 + BT, SSTR, 50, 0.13, rv=0.45, bg=0.35, fi=2.0, cut=cut[2], cutf=cf[2], overlap=0.5)
    pads(t_seen, go1 + BT, STR, 48, 0.06, rv=0.45, bg=0.35, fi=1.5, octave=1, which=[1, 2], cut=cut[2], cutf=cf[2])
    pads(a, go1 + BT, PAD, 46, 0.09, rv=0.4, bg=0.3, fi=1.0, cut=cut[2], cutf=cf[2])
    basses(t_seen, go1 + BT, CELLO, 54, 0.16, 1, rv=0.4, cut=cut[2], cutf=cf[2])
    # the red pen: a mark for each item (only if the template does not cue its own pens)
    m0, m1 = T('scorer', 'marks'), E('scorer', 'marks')
    if ok(m0) and not cue_in('pen', m0, m1):
        for i in range(4): h_pen(m0 + 2 * i * BT)
if B('leave'):
    go0 = T('leave', 'go'); t_none, t_title = T('leave', 'none'), T('leave', 'title')
    tt = first('title', t_title - BT if ok(t_title) else go0, E('leave', 'title') or E('leave'), t_title)
    # the single sustained note that remains: a violin B4 (the maj7 of C, the fifth of E), alone, then gone
    if ok(go0, tt):
        L = tt - go0 - BT
        note(VLN, m('B4'), go0, L, 50, 0.09, 0.1, rv=0.55, bg=0.6, env=[(0, 0), (2.0, 1.0), (L * 0.75, 0.85), (L, 0.0)], tail=1.0)
        note(SSTR, m('B4'), go0, L, 46, 0.07, -0.1, rv=0.55, bg=0.6, env=[(0, 0), (2.0, 1.0), (L * 0.75, 0.8), (L, 0.0)], tail=1.0)
    if ok(tt):
        h_title(tt)
        t_th = (t_title or tt) + 2 * BT         # the theme, low and close, in the deep chord
        theme(t_th, [('E4', 1), ('B4', 1), ('A4', 1), ('G4', 1), ('F#4', 2)], vel=46, g=0.62, rv=0.45, bg=0.6, human=0.01)
        pno(m('E3'), t_th + 4 * BT, 3.0, 34, 0.4, -0.2)
    t_l, e_l = T('leave', 'lamp'), E('leave', 'lamp')
    if ok(t_l):                                 # 不是你自己的灯: the strings carry on; the piano answers downward
        pads(t_l, E('leave'), SSTR, 50, 0.12, rv=0.5, bg=0.5, fi=1.5, fo=2.0, overlap=0.6)
        pads(t_l, E('leave'), PAD, 44, 0.08, rv=0.4, bg=0.4, fi=1.5, fo=2.0)
        basses(t_l, E('leave'), CELLO, 50, 0.16, 1, rv=0.45)
        basses(t_l, E('leave'), None, 40, 0.42, 0, piano=True, rv=0.45)
        theme(t_l + BT, [('G4', 1), ('E4', 1), ('B3', 2), ('C4', 1)], vel=38, g=0.5, rv=0.45, bg=0.5)
        t_h = T('leave', 'held')
        if ok(t_h): theme(t_h + BT, [('A4', 1), ('F#4', 1), ('E4', 3)], vel=36, g=0.5, rv=0.5, bg=0.6)

# ---------------------------------------------------------------- e2 · b07 fuel: the name; praise chimes stack into a chord
if B('fuel'):
    a, b = T('fuel'), E('fuel')
    t_n, t_p, t_r = T('fuel', 'name'), T('fuel', 'praise'), T('fuel', 'rule')
    if ok(t_n):
        pchord(ms('E2', 'B2', 'G3', 'D4', 'F#4'), t_n, 4.0, 40, 0.45, rv=0.45, bg=0.4)
        note(CELLO, m('E2'), t_n, (t_p or b) - t_n + 1, 46, 0.14, 0, rv=0.45, bg=0.4, env=[(0, 0), (1.5, 1)])
        pno(m('B4'), t_n + 3 * BT, 2.0, 34, 0.4, 0.2); pno(m('C5'), t_n + 4 * BT, 2.0, 34, 0.4, 0.2)
    if ok(t_p):
        pulse(t_p, t_r or b, [0, None, 1, 2, None, 1], 36, 0.32, octave=0, div=E8, dur=E8 * 2.5, seed=13, rv=0.4, bg=0.2)
        basses(t_p, t_r or b, CELLO, 50, 0.16, 1, rv=0.4); basses(t_p, t_r or b, None, 38, 0.4, 0, piano=True)
        if not cue_in('glow', t_p, E('fuel', 'praise')):
            npos = len((B('fuel').get('visual', {}).get('lines', {}) or {}).get('praise', [])) or 6
            pb = int(round((E('fuel', 'praise') - t_p) / BT))
            for i in range(npos): h_glow(t_p + int(round(i * pb / npos)) * BT)
    if ok(t_r):                                 # 押在了别人的评价上: the warm chord turns, the price is felt
        pads(t_r, b, SSTR, 52, 0.13, rv=0.5, bg=0.45, fi=1.2, fo=1.5, overlap=0.6)
        basses(t_r, b, CELLO, 52, 0.18, 1, rv=0.45)
        for a_, b_, nm in chord_spans(t_r, b):
            pchord([CHORDS[nm][0] + 12] + CHORDS[nm][1], a_, b_ - a_ + 0.6, 38, 0.38, rv=0.45, bg=0.4)

# ---------------------------------------------------------------- e2 · b08 weightless: standing on 标准; the floor drops out; the fork
if B('weightless'):
    t_m, t_g, t_f, b = T('weightless', 'met'), T('weightless', 'gone'), T('weightless', 'fork'), E('weightless')
    t_g = first('fall', t_m or t_g, E('weightless', 'gone') or b, t_g)
    if ok(t_m, t_g):                            # standing: a steady low pedal and plain chords on the beat
        for k, t in grid(t_m, t_g, BT):
            bs, up = CHORDS[chord_at(t + 0.01)]
            pno(bs + 12, t, BT * 1.1, 40 if k % 2 == 0 else 34, 0.42, -0.1, rv=0.3, cut=t_g, human=0)
            if k % 2 == 1: pchord(up, t, BT * 1.5, 34, 0.32, rv=0.35, cut=t_g)
        note(CBASS, m('E2'), t_m, t_g - t_m + 1, 54, 0.18, 0, rv=0.3, cut=t_g, cutf=0.05, env=[(0, 0), (0.6, 1)])
        note(CELLO, m('E2'), t_m, t_g - t_m + 1, 50, 0.16, 0, rv=0.4, cut=t_g, cutf=0.05, env=[(0, 0), (0.8, 1)])
    if ok(t_g):                                 # gone: no bass; high strings float; a slow detuned shimmer
        t_e = b; L = t_e - t_g
        h_fall(t_g, dur=2 * BT)
        for j, k in enumerate(ms('B5', 'E6', 'F#6')):
            note(SSTR, k, t_g, L, 50, 0.07, -0.5 + 0.5 * j, rv=0.5, bg=0.8, env=[(0, 0), (2.5, 1), (L - 1.5, 1), (L, 0.2)])
        note(GLASS, m('E5'), t_g, L, 48, 0.06, 0.2, rv=0.5, bg=0.8, env=[(0, 0), (2.0, 1), (L - 1, 0.6)])
        sh = shimmer(ms('B5', 'E6', 'F#6', 'B6'), L, 0.4, 3) * local_env(n_of(L), [(0, 0), (3.0, 1), (L - 1.0, 1), (L, 0)])[:, None]
        MUS.add(t_g, sh, 0.012, 0, rv=0.4, bg=0.8)
    if ok(t_f):                                 # the fork: the theme hesitates, stops, starts again, stops
        pno(m('E4'), t_f + BT, 2.0, 36, 0.5, 0.1, rv=0.5, bg=0.6)
        pno(m('B4'), t_f + 2.5 * BT, 2.5, 34, 0.5, 0.15, rv=0.5, bg=0.6)
        pno(m('A4'), t_f + 4 * BT, 3.0, 32, 0.45, 0.15, rv=0.5, bg=0.6)
        pno(m('E4'), t_f + 6.5 * BT, 1.5, 30, 0.4, 0.1, rv=0.5, bg=0.6)
        pno(m('B4'), t_f + 7 * BT, 2.5, 28, 0.4, 0.15, rv=0.5, bg=0.6)
        pno(m('C3'), t_f, 4.0, 30, 0.3, -0.2, rv=0.5, bg=0.5); pno(m('A2'), t_f + 4 * BT, 4.0, 30, 0.3, -0.2, rv=0.5, bg=0.5)

# ---------------------------------------------------------------- e2 · b09 rules: the scoring form's dry metronome; the red 0
if B('rules'):
    a, b = T('rules'), E('rules'); t_s, t_e = T('rules', 'score'), T('rules', 'end')
    t_zero = first('pen', t_s or a, t_e or b, (t_s or a) + 3 * BT)
    for k, t in grid(a, t_zero, BT):            # the metronome: exact, dry, no room at all
        ONSETS.append(t); MUS.add(t, tick(2400, 0.003, 1, body=0.8), 0.045 if k % 4 else 0.06, 0.0, rv=0.0)
        if k % 2 == 0 and t < (t_s or b):
            note(PIZZ, CHORDS[chord_at(t + 0.01)][0] + 12, t, 0.3, 64, 0.30, -0.1, rv=0.08)
    for k, t in grid(a, t_s or b, E8):          # dry staccato piano on the off-beats: the form, filled in
        if k % 2 == 1:
            up = CHORDS[chord_at(t + 0.01)][1]
            for j, kk in enumerate(up[:3]): pno(kk, t, E8 * 0.5, 34, 0.30, -0.2 + 0.2 * j, rv=0.08, bg=0.0, human=0, mech=0.6)
    if ok(t_s):                                 # 个性: a free scribble on the piano, out of the grid... then the 0
        rng = np.random.default_rng(5); x = t_s + 0.3
        for i, k in enumerate(ms('E5', 'G5', 'F#5', 'B5', 'A5', 'D6', 'C#6', 'E6', 'B5', 'G5')):
            if x >= t_zero - 0.15: break
            pno(k, x, 0.5, 40 + int(rng.integers(-4, 6)), 0.38, 0.4 * np.sin(i), rv=0.35, bg=0.2, human=0.0, free=True)
            x += rng.uniform(0.11, 0.26)
        if not cue_in('pen', t_s, t_e or b): h_pen(t_zero)
        note(CELLO, m('E2'), snap(t_zero, E8) + E8, (t_e or b) - t_zero, 44, 0.12, 0, rv=0.4, bg=0.4, env=[(0, 0), (1.0, 1), ((t_e or b) - t_zero, 0.5)])
    if ok(t_e):                                 # 你不是没有个性: tender
        pads(t_e, b, SSTR, 50, 0.12, rv=0.5, bg=0.5, fi=1.5, fo=1.5, overlap=0.6)
        basses(t_e, b, CELLO, 50, 0.15, 1, rv=0.45)
        for a_, b_, nm in chord_spans(t_e, b):
            pchord([CHORDS[nm][0] + 12] + CHORDS[nm][1][:2], a_, b_ - a_ + 0.5, 36, 0.36, rv=0.45, bg=0.4)
        theme(t_e + 2 * BT, [('G4', 1), ('E5', 1), ('D5', 1), ('B4', 1), ('A4', 2)], vel=36, g=0.45, rv=0.5, bg=0.5)

# ---------------------------------------------------------------- e3 · b10 honest: the motorbike's warmth, the honest no
if B('honest'):
    a, b = T('honest'), E('honest')
    t_b, t_q, t_n, t_w = T('honest', 'bike'), T('honest', 'q'), T('honest', 'no'), T('honest', 'what')
    if ok(t_b):                                 # the feed's warm pad and the sea wind, remembered
        pads(t_b, t_q or b, PAD, 50, 0.13, rv=0.4, bg=0.4, fi=1.5, fo=1.0, overlap=0.8)
        MUS.add(t_b, wind((t_q or b) - t_b + 1, 31, 300, 1200, 0.5) * local_env(n_of((t_q or b) - t_b + 1), [(0, 0), (1.5, 1), ((t_q or b) - t_b + 1, 0)])[:, None], 0.05, 0, rv=0.3)
        pno(m('C3'), t_b, 3.5, 36, 0.45, -0.2); pno(m('G3'), t_b + 0.02, 3.5, 30, 0.4, -0.1, nominal=t_b)
        pno(m('E4'), t_b + 2 * BT, 2.5, 34, 0.45, 0.1); pno(m('B4'), t_b + 3 * BT, 2.5, 32, 0.45, 0.2)
    if ok(t_q):                                 # the honest question: an open, rising piano figure
        pads(t_q, t_n or b, SSTR, 46, 0.10, rv=0.5, bg=0.5, fi=1.0, fo=1.0)
        basses(t_q, t_n or b, None, 38, 0.42, 1, piano=True)
        melody(t_q + BT, [('E4', 1), ('G4', 1), ('B4', 1), ('D5', 2)], lambda k, t, d: pno(k, t, d + 0.4, 38, 0.45, 0.15, rv=0.45, bg=0.4))
    if ok(t_n):                                 # 大概不会: the warmth falls away, a small falling dyad
        pchord(ms('A2', 'E3'), t_n, 3.0, 36, 0.4, rv=0.45)
        pno(m('G4'), t_n + BT, 1.2, 36, 0.45, 0.1); pno(m('E4'), t_n + 2 * BT, 2.5, 32, 0.45, 0.1)
    if ok(t_w):                                 # 那你到底在羡慕什么: the theme's head as a question, suspended
        pads(t_w, b, SSTR, 50, 0.12, rv=0.5, bg=0.5, fi=1.5, fo=1.0, overlap=0.6)
        note(CELLO, m('B2'), t_w, b - t_w + 0.5, 48, 0.14, 0, rv=0.45, bg=0.4, env=[(0, 0), (1.0, 1), (b - t_w + 0.5, 0.6)])
        theme(t_w + BT, [('E4', 1), ('B4', 1), ('A4', 2)], vel=38, g=0.5, rv=0.5, bg=0.5)

# ---------------------------------------------------------------- e3 · b11 freedom: wind, a guitar heard from outside; the stamp; release
GUITAR = [0, 3, 1, 4, 2, 4, 1, 3]
def gtr_voicing(nm):
    """open-string guitar voicings (low to high), heard from outside"""
    V = {'Em7': ms('E2', 'B2', 'D3', 'G3', 'B3', 'E4'), 'Cadd9': ms('C3', 'G3', 'D4', 'G4', 'E4'),
         'G': ms('G2', 'D3', 'G3', 'B3', 'D4', 'G4'), 'D/F#': ms('F#2', 'A2', 'D3', 'A3', 'D4', 'F#4'),
         'Gadd9': ms('G2', 'D3', 'A3', 'B3', 'D4', 'G4'), 'Cmaj7': ms('C3', 'G3', 'B3', 'E4', 'G4'),
         'Emadd9': ms('E2', 'B2', 'E3', 'F#3', 'G3', 'B3')}
    return V.get(nm) or [CHORDS[nm][0] + 12] + CHORDS[nm][1]
def guitar(t0, t1, g=0.30, vel=64, cut=None, dens=(1, 1), seed=21):
    if not ok(t0, t1): return
    for k, t in grid(t0, t1, E8):
        u = (t - t0) / max(1e-6, t1 - t0)
        if h01(k, seed) > dens[0] + (dens[1] - dens[0]) * u: continue
        vc = gtr_voicing(chord_at(t + 0.01)); i = GUITAR[k % len(GUITAR)]
        key = vc[i % len(vc)] if (k % 8) else vc[0]
        dt = (h01(k, seed + 5) - 0.5) * 0.012
        note(GTR, key, t + dt, E8 * 3, vel + (8 if k % 4 == 0 else 0), g, -0.35 + 0.7 * (i % len(vc)) / len(vc), rv=0.45, bg=0.4,
             cut=cut, tail=2.0, nominal=t)
if B('freedom'):
    a, b = T('freedom'), E('freedom')
    t_w, t_i, t_s, t_f, t_n = (T('freedom', x) for x in ('word', 'items', 'stamp', 'free', 'need'))
    t_st = first('stamp', t_s or a, t_f or b, t_s)
    if ok(t_w, t_st):                           # 不在乎: the guitar enters, open and rhythmic; wind; strings below
        guitar(t_w, t_st, 0.26, 60, cut=t_st, dens=(0.55, 1.0))
        L = t_st - t_w
        MUS.add(t_w, wind(L + 1, 41, 300, 1800, 0.45) * local_env(n_of(L + 1), [(0, 0), (2.0, 1), (L, 1), (L + 0.3, 0)])[:, None], 0.07, 0, rv=0.3, cut=t_st, cutf=0.3)
        pads(t_i or t_w, t_st, SSTR, 50, 0.12, rv=0.45, bg=0.4, fi=2.0, cut=t_st, cutf=0.3)
        basses(t_w, t_st, CELLO, 54, 0.18, 1, rv=0.4, cut=t_st, cutf=0.3)
        pads(t_w, t_st, PAD, 46, 0.08, rv=0.4, bg=0.4, fi=2.0, cut=t_st, cutf=0.3)
    if ok(t_st): h_stamp(t_st)                  # the stamp hovers: a held unresolved tone until 'free'
    if ok(t_f):                                 # 不需要被批准的自由: the swell opens
        L = (t_n or b) - t_f
        h_whoosh(first('whoosh', t_f - BT, t_f + BT, t_f - 0.5 * BT), dur=2 * BT)
        guitar(t_f, t_n or b, 0.30, 68)
        guitar(t_n or b, b, 0.24, 56, dens=(0.9, 0.3), seed=23)
        for a_, b_, nm in chord_spans(t_f, t_n or b):
            bs, up = CHORDS[nm]
            for j, k in enumerate([bs + 24] + up + [up[-1] + 12]):
                note(SSTR, k, a_, b_ - a_ + 0.5, 70, 0.12, -0.6 + 0.24 * j, rv=0.5, bg=0.6, env=[(0, 0.4 if a_ > t_f else 0.0), (0.8, 1.0)])
            note(CELLO, bs + 12, a_, b_ - a_ + 0.5, 70, 0.24, 0, rv=0.4, bg=0.4)
            note(CBASS, bs + 12, a_, b_ - a_ + 0.5, 60, 0.14, 0, rv=0.3)
        note(OOHS, m('B4'), t_f, L + 0.5, 54, 0.06, 0.1, rv=0.5, bg=0.7, env=[(0, 0), (1.5, 1), (L, 0.7)])
        MUS.add(t_f, wind(L + 1, 43, 400, 2600, 0.6) * local_env(n_of(L + 1), [(0, 0), (0.5, 1), (L, 0.6), (L + 1, 0)])[:, None], 0.08, 0, rv=0.3)
        pads(t_f, t_n or b, PAD, 52, 0.10, rv=0.4, bg=0.5, fi=0.5)
    if ok(t_n):                                 # 你真正缺的: settles back; the piano returns, E minor again
        pads(t_n, b, SSTR, 50, 0.12, rv=0.5, bg=0.5, fi=0.3, fo=2.0, overlap=0.6)
        basses(t_n, b, CELLO, 50, 0.16, 1, rv=0.45)
        pchord(ms('C3', 'G3', 'B3', 'E4'), t_n + BT, 3.5, 38, 0.42, rv=0.45, bg=0.4)
        theme(t_n + 4 * BT, [('B4', 1), ('G4', 1), ('F#4', 2)], vel=34, g=0.45, rv=0.5, bg=0.5)

# ---------------------------------------------------------------- e4 · b12 bills: the printer woven into a dry ostinato
if B('bills'):
    a, b = T('bills'), E('bills'); t_p, t_y = T('bills', 'print'), T('bills', 'pay')
    if ok(t_p):
        e_p = t_y or b
        pulse(t_p, e_p, [0, None, 2, 1, None, 2, 0, 1], 38, 0.34, octave=0, div=S16 * 2, dur=E8 * 0.7, seed=31, human=0.0, rv=0.15, bg=0.0)
        for k, t in grid(t_p, e_p, BT):
            note(PIZZ, CHORDS[chord_at(t + 0.01)][0] + 12, t, 0.35, 66 if k % 2 == 0 else 54, 0.32, -0.1, rv=0.2)
        pads(t_p + 2 * BT, e_p, SSTR, 44, 0.08, rv=0.4, bg=0.3, fi=2.0, which=[0, 2])
        if not cue_in('print', t_p, e_p):
            nb = int(round((e_p - t_p) / BT))
            for i in range(3): h_print(t_p + int(round(i * nb / 3)) * BT, dur=2.5 * BT)
    if ok(t_y):                                 # 他们也在付账: plain, sober
        pads(t_y, b, SSTR, 50, 0.12, rv=0.5, bg=0.45, fi=0.8, fo=1.0, overlap=0.4)
        basses(t_y, b, CELLO, 52, 0.17, 1, rv=0.45)
        for a_, b_, nm in chord_spans(t_y, b):
            pchord([CHORDS[nm][0] + 12] + CHORDS[nm][1], a_, b_ - a_ + 0.4, 38, 0.38, rv=0.45, bg=0.35)

# ---------------------------------------------------------------- e4 · b13 trap: smug, neat school pulse; FREEZE; a cold tone
if B('trap'):
    a, b = T('trap'), E('trap')
    t_fr = next((x for x, _ in sorted(GATE) if beat_of(x) is B('trap')), T('trap', 'back'))
    t_c, t_rk = T('trap', 'climb'), T('trap', 'rank')
    pulse(a, t_fr, [0, 2, 1, 2], 42, 0.36, div=E8, dur=E8 * 1.6, seed=41, human=0.0, rv=0.3)
    for k, t in grid(a, t_fr, 2 * BT):
        note(PIZZ, CHORDS[chord_at(t + 0.01)][0] + 12, t, 0.4, 70, 0.32, -0.05, rv=0.3)
    pads(a, t_fr, SSTR, 50, 0.11, rv=0.4, bg=0.3, fi=1.0)
    for t0, seq in [(a, [('B5', 1), ('D6', 1), ('A5', 1), ('F#5', 1), ('G5', 2)]),
                    (t_c, [('E5', 0.5), ('G5', 0.5), ('A5', 0.5), ('B5', 0.5), ('C6', 0.5), ('D6', 0.5), ('E6', 0.5), ('F#6', 0.5)])]:
        if t0 is None: continue
        melody(t0, seq, lambda k, t, d: (note(MBOX, k, t, d, 64, 0.20, 0.3, rv=0.4, bg=0.3, tail=2),
                                         note(CEL, k - 12, t, d, 56, 0.12, -0.2, rv=0.4, bg=0.3, tail=2)))
    if ok(t_c) and not cue_in('pen', t_c, t_fr):  # #1 again: a tidy little reward, right before the freeze
        FX.add(t_fr - 0.5 * BT, bell(mtof(m('G6')), 2.0, 0.6), 0.03, 0.2, rv=0.3)
    if ok(t_rk):                                # 'rank': a cold single tone
        L = b - t_rk; n = n_of(L); tt = tvec(n)
        x = np.sin(2 * np.pi * mtof(m('B5')) * tt) + 0.06 * np.sin(2 * np.pi * mtof(m('B5')) * 3 * tt)
        MUS.add(t_rk, x * local_env(n, [(0, 0), (0.08, 1), (L - 1.2, 0.85), (L, 0)]), 0.018, 0.0, rv=0.15)

# ---------------------------------------------------------------- e4 · b14 exchange: a pendulum; the empty chair
if B('exchange'):
    a, b = T('exchange'), E('exchange'); t_t, t_e = T('exchange', 'trade'), T('exchange', 'empty')
    e_sw = t_e or b
    for k, t in grid(a, e_sw, BT):              # the pendulum: one swing per beat, left / right
        bs, up = CHORDS[chord_at(t + 0.01)]
        ph = np.sin(2 * np.pi * (t - a) / (8 * BT))       # where the balance is in its swing
        side = 0.6 * ph
        keys = [bs + 12, up[1]] if ph >= 0 else [up[0], up[-1]]
        u = (t - a) / max(1e-6, e_sw - a)
        for j, kk in enumerate(keys):
            pno(kk, t + 0.015 * j, BT * 1.2, 38 - int(6 * max(0, u - 0.7) / 0.3), 0.36, side, rv=0.35, bg=0.2, human=0, nominal=t)
        note(HARP, up[-1] + 12, t, 0.8, 46, 0.10, -side, rv=0.45, bg=0.3)
    pads(a, e_sw, SSTR, 46, 0.09, rv=0.5, bg=0.4, fi=2.0, fo=1.5)
    if ok(t_t):
        pads(t_t, e_sw, STR, 46, 0.06, rv=0.5, bg=0.4, octave=1, which=[1, 2], fi=1.5, fo=1.0)
        basses(t_t, e_sw, CELLO, 48, 0.15, 1, rv=0.45)
    if ok(t_e):                                 # 根本就没有阅卷人: the theme, and nobody answers
        note(CELLO, m('E2'), t_e, b - t_e + 1, 40, 0.11, 0, rv=0.5, bg=0.5, env=[(0, 0), (1.5, 1), (b - t_e, 0.7), (b - t_e + 1, 0)])
        theme(t_e + BT, QUESTION, vel=36, g=0.55, rv=0.55, bg=0.7, human=0.01)

# ---------------------------------------------------------------- e5 · b15 yourbill: your receipt; 试错权 lands low and heavy
if B('yourbill'):
    a, b = T('yourbill'), E('yourbill'); t_p, t_w = T('yourbill', 'print'), T('yourbill', 'word')
    if ok(t_p):
        e_p = t_w or b
        for k, t in grid(t_p, e_p, BT):         # a low E pulse under the printing, a heartbeat without drums
            pno(m('E2'), t, BT * 0.9, 38 if k % 2 == 0 else 30, 0.42, -0.05, rv=0.3, human=0)
        note(CELLO, m('E2'), t_p, e_p - t_p, 46, 0.12, 0, rv=0.4, bg=0.3, env=[(0, 0), (2.0, 1), (e_p - t_p, 1)], cut=e_p, cutf=0.05)
        note(SSTR, m('B3'), t_p + 2 * BT, e_p - t_p - 2 * BT, 42, 0.06, 0.2, rv=0.5, bg=0.4, env=[(0, 0), (2.0, 1)], cut=e_p, cutf=0.05)
        if not cue_in('print', t_p, e_p): h_print(t_p, dur=(e_p - t_p) * 0.75)
    if ok(t_w):
        pr = cue_list('print', t_w - BT, b)
        tw = first(('stamp', 'title', 'land'), t_w - BT, b,
                   (float(pr[-1]['t']) + float(pr[-1].get('dur') or 0)) if pr else t_w)
        h_title(tw)
        theme(snap(tw, BT) + 2 * BT, [('B4', 1), ('C5', 1), ('B4', 2)], vel=34, g=0.45, rv=0.5, bg=0.6)

# ---------------------------------------------------------------- e5 · b16 never: three soft notes, left unresolved
if B('never'):
    a, b = T('never'), E('never')
    pads(a, b, SSTR, 46, 0.10, rv=0.5, bg=0.6, fi=1.5, fo=2.0, overlap=0.8)
    basses(a, b, CELLO, 46, 0.13, 1, rv=0.5)
    for nm, key in (('a18', 'B4'), ('a20', 'C5'), ('a25', 'D#5')):
        t0 = T('never', nm)
        if not ok(t0): continue
        pno(m(key), t0 + BT, 5.0, 38, 0.55, 0.15, rv=0.5, bg=0.7, human=0)
        note(VLN, m(key), t0 + BT, 3 * BT, 34, 0.035, -0.15, rv=0.6, bg=0.8, env=[(0, 0), (1.0, 1), (3 * BT, 0)])
        pno(CHORDS[chord_at(t0 + 0.01)][0] + 12, t0, 4.0, 34, 0.4, -0.15, rv=0.5, bg=0.5)

# ---------------------------------------------------------------- e5 · b17 fall: the cliff; the drop; the landing; the floor
if B('fall'):
    a, b = T('fall'), E('fall')
    t_d, t_ld, t_fl = T('fall', 'drop'), T('fall', 'land'), T('fall', 'floor')
    t_fall = first('fall', T('fall', 'step') or a, t_ld or b, t_d)
    t_land = first('land', t_d or a, E('fall', 'land') or b, t_ld)
    if ok(t_fall):                              # the cliff: a low B with its flat ninth, trembling; a high harmonic
        L = t_fall - a
        env = [(0, 0), (2.0, 0.6), (L - 0.4, 1.0), (L, 1.0)]
        note(TREM, m('B2'), a, L + 0.3, 60, 0.15, -0.3, rv=0.4, bg=0.4, env=env, cut=t_fall, cutf=0.12)
        note(TREM, m('C3'), a, L + 0.3, 56, 0.12, 0.3, rv=0.4, bg=0.4, env=env, cut=t_fall, cutf=0.12)
        note(CBASS, m('B1'), a, L + 0.3, 60, 0.20, 0, rv=0.3, env=env, cut=t_fall, cutf=0.12)
        note(SSTR, m('F#5'), a + 2 * BT, L - 2 * BT + 0.3, 40, 0.05, 0.3, rv=0.5, bg=0.6, env=[(0, 0), (2.0, 1)], cut=t_fall, cutf=0.12)
        MUS.add(a, wind(L + 0.5, 61, 200, 900, 0.4) * local_env(n_of(L + 0.5), [(0, 0), (L, 1)])[:, None], 0.05, 0, rv=0.3, cut=t_fall, cutf=0.12)
        ts = T('fall', 'step')
        if ok(ts):                              # the step off: a breath held (everything leans in)
            for j, k in enumerate(ms('D#4', 'E4', 'F#4')):
                note(TREM, k, ts, t_fall - ts + 0.3, 50, 0.08, -0.4 + 0.4 * j, rv=0.4, bg=0.4,
                     env=[(0, 0), (t_fall - ts, 1.0)], cut=t_fall, cutf=0.08)
        L2 = (t_land or b) - t_fall
        h_fall(t_fall, dur=L2 - 0.15)
    if ok(t_land):
        h_land(t_land)
        e_ld = E('fall', 'land') or b           # 原来摔一跤，人是不会死的: one tender line over the bloom
        theme(snap(t_land, BT) + 2 * BT, [('G4', 1), ('B4', 1), ('E5', 2)], vel=36, g=0.45, rv=0.5, bg=0.7)
    if ok(t_fl):                                # 知道底下有地: the theme harmonised, warmer; its F# finally held (D)
        pads(t_fl, b, SSTR, 54, 0.12, rv=0.5, bg=0.6, fi=1.0, fo=2.0, overlap=0.6)
        pads(t_fl, b, PAD, 48, 0.08, rv=0.4, bg=0.5, fi=1.0, fo=2.0)
        basses(t_fl, b, CELLO, 54, 0.17, 1, rv=0.45)
        basses(t_fl, b, None, 42, 0.45, 0, piano=True, rv=0.45)
        for a_, b_, nm in chord_spans(t_fl, b):
            pchord(CHORDS[nm][1], a_ + BT * 0.5, b_ - a_, 32, 0.32, rv=0.45, bg=0.5)
        theme(t_fl, [('E4', 1), ('B4', 1), ('A4', 1), ('G4', 1), ('F#4', 4)], vel=46, g=0.6, rv=0.5, bg=0.6,
              strings_too=(SSTR, 52, 0.10, 1))
        theme(t_fl + 8 * BT, [('A4', 1), ('D5', 1)], vel=34, g=0.42, rv=0.5, bg=0.6)

# ---------------------------------------------------------------- e6 · b18 stand: up toward the light; the waiting child
if B('stand'):
    a, b = T('stand'), E('stand')
    t_n, t_u, t_g, t_k = (T('stand', x) for x in ('not', 'up', 'given', 'kid'))
    if ok(t_n):
        pchord(ms('E2', 'B2', 'G3', 'D4', 'F#4'), t_n, 3.5, 38, 0.42, rv=0.45, bg=0.4)
        pno(m('B4'), t_n + 2 * BT, 2.0, 34, 0.42, 0.15)
        note(CELLO, m('E2'), t_n, (t_u or b) - t_n + 0.3, 44, 0.12, 0, rv=0.45, bg=0.4, env=[(0, 0), (1.5, 1)])
    if ok(t_u):                                 # standing up: a slow swell toward the light
        tsw = first('swell', t_u, E('stand', 'up') or b, t_u)
        DONE.setdefault('swell', []).append(tsw)            # composed here, the cue is not doubled
        e_u = E('stand', 'up') or b; L = e_u - t_u
        for a_, b_, nm in chord_spans(t_u, e_u):
            bs, up = CHORDS[nm]; u0 = (a_ - t_u) / L; u1 = (b_ - t_u) / L
            for j, k in enumerate(up + [up[-1] + 12]):
                note(SSTR, k, a_, b_ - a_ + 0.5, 54 + int(22 * u1), 0.08 + 0.07 * u0, -0.5 + 0.33 * j, rv=0.5, bg=0.6,
                     env=[(0, 0.6 if a_ > t_u else 0.0), (b_ - a_, 1.0)])
            note(CELLO, bs + 12, a_, b_ - a_ + 0.5, 54 + int(18 * u1), 0.18, 0, rv=0.45, bg=0.4)
            pchord([bs + 12] + up, a_, b_ - a_ + 0.6, 36 + int(8 * u1), 0.38, rv=0.45, bg=0.4)
        MUS.add(t_u, air(L, 400, 3000, q=0.7, seed=91) * np.linspace(0, 1, n_of(L))[:, None] ** 2, 0.012, 0, rv=0.5)
        theme(t_u + 4 * BT, [('B4', 1), ('C5', 1), ('D5', 1), ('E5', 1)], vel=38, g=0.45, rv=0.5, bg=0.5)
    if ok(t_g):                                 # 它是别人发给你的: settles
        pads(t_g, t_k or b, SSTR, 50, 0.12, rv=0.5, bg=0.5, fi=0.3, fo=1.0, overlap=0.5)
        basses(t_g, t_k or b, CELLO, 48, 0.15, 1, rv=0.45)
        basses(t_g, t_k or b, None, 36, 0.42, 1, piano=True)
        pno(m('E5'), t_g + BT, 2.5, 34, 0.42, 0.15); pno(m('C5'), t_g + 2 * BT, 2.5, 32, 0.42, 0.15)
    if ok(t_k):                                 # the child who waits for a score: the theme as it was at 1 a.m.
        note(CELLO, m('E2'), t_k, b - t_k + 1.0, 42, 0.12, 0, rv=0.5, bg=0.5, env=[(0, 0), (1.5, 1), (b - t_k, 0.8), (b - t_k + 1, 0)])
        note(SSTR, m('B3'), t_k, b - t_k + 1.0, 40, 0.06, -0.2, rv=0.5, bg=0.6, env=[(0, 0), (2.0, 1), (b - t_k + 1, 0)])
        theme(t_k + BT, [('E5', 1.5), ('B5', 1.5), ('A5', 1), ('G5', 1), ('F#5', 3)], vel=32, g=0.5, rv=0.55, bg=0.7, human=0.012)

# ---------------------------------------------------------------- e6 · b19 tries: playful, imperfect figures; glows; the pulse goes on
if B('tries'):
    a, b = T('tries'), E('tries'); bl = E('lamp') if B('lamp') else b
    t_t = T('tries', 'try')
    pulse(a + 2 * BT, bl, [0, 2, 1, 2, 0, 2, 1, 3], 34, 0.32, div=E8, dur=E8 * 1.8, seed=51, human=0.008, dens=(0.8, 1.0))
    basses(a, bl, CELLO, 48, 0.15, 1, rv=0.45)
    basses(a, bl, None, 38, 0.42, 0, piano=True, rv=0.4)
    pads(a, bl, SSTR, 46, 0.09, rv=0.5, bg=0.5, fi=2.0)
    FIG = {'t1': [('D5', 0.5), ('E5', 0.5), ('G5', 1)],                                 # a small stall: a first step
           't2': [('B5', 0.5), ('A5', 0.5), ('F#5', 0.5), (None, 0.5), ('D5', 1)],          # stocks: it goes badly; nothing happens
           't3': [('E5', 0.5), ('F#5', 0.75), ('E5', 0.25), ('G5', 1)],                     # a course you can't do: it wobbles
           't4': [('F#5', 0.5), ('A5', 0.5), ('A#5', 0.5), ('B5', 0.5), ('D6', 1)],         # a stranger's city: a wrong note, left in
           't5': [('E5', 0.5), ('F#5', 0.5), (None, 1), ('D5', 0.5)],                       # an unready word: it slips, falters
           't6': [('B4', 0.5), ('D5', 0.75), ('G5', 0.25), ('F#5', 0.5), ('D5', 1)]}        # something you'll never be good at: uneven
    for nm, seq in FIG.items():
        t0 = T('tries', nm)
        if not ok(t0): continue
        rng = np.random.default_rng(len(nm) * 7 + int(nm[1]))
        x = t0
        for key, d in seq:                    # imperfect: a hand that is still learning (late, early, uneven)
            if key: pno(m(key), x + rng.uniform(-0.03, 0.05), d * BT + 0.4, 40 + int(rng.integers(-6, 6)), 0.48, 0.2,
                        rv=0.4, bg=0.4, human=0.0, free=True)
            x += d * BT
        if not cue_in('glow', t0, E('tries', nm)): h_glow(t0 + 2 * BT)
    if ok(t_t):
        pno(m('B4'), t_t + BT, 2.0, 36, 0.42, 0.15); pno(m('D5'), t_t + 3 * BT, 2.0, 34, 0.42, 0.15)
    t_f = T('tries', 'fine')
    if ok(t_f):                                 # 做得不好，世界也没有塌: nothing happens; the pulse simply goes on
        theme(t_f + BT, [('E5', 1), ('D5', 1), ('B4', 1), ('C5', 1), ('D5', 1)], vel=36, g=0.42, rv=0.45, bg=0.4)

# ---------------------------------------------------------------- e6 · b20 lamp: take back your own light; E major
if B('lamp'):
    a, b = T('lamp'), E('lamp'); t_tk = T('lamp', 'take') or a
    pads(a, b, PAD, 50, 0.10, rv=0.45, bg=0.5, fi=1.5, cut=b if B('kline') else None, cutf=0.08)
    for a_, b_, nm in chord_spans(a, b):
        bs, up = CHORDS[nm]
        for j, k in enumerate(up + [up[-1] + 12]):
            note(SSTR, k, a_, b_ - a_ + 0.5, 60, 0.10, -0.5 + 0.33 * j, rv=0.5, bg=0.6, env=[(0, 0.5 if a_ > a else 0.0), (0.8, 1.0)],
                 cut=b if B('kline') else None, cutf=0.08)
        note(CELLO, bs + 12, a_, b_ - a_ + 0.5, 58, 0.18, 0, rv=0.45, bg=0.4, cut=b if B('kline') else None, cutf=0.08)
    t_E = next((x for x, _, nm in chord_spans(a, b) if nm.startswith('E')), None)
    if ok(t_E):                                 # the turn to E major: G# arrives, warm
        pchord(ms('E2', 'B2', 'E3', 'G#3', 'B3', 'F#4'), t_E, 5.0, 46, 0.5, rv=0.45, bg=0.6)
        note(OOHS, m('G#4'), t_E, b - t_E + 1.0, 50, 0.06, 0.1, rv=0.5, bg=0.7, env=[(0, 0), (1.5, 1), (b - t_E + 1, 0.5)])
        if not cue_in('glow', a, b): h_glow(t_E + 2 * BT)
        theme(t_E + 3 * BT, [('B4', 1), ('G#4', 1), ('B4', 1)], vel=36, g=0.45, rv=0.5, bg=0.5)
    pno(m('E5'), t_tk + BT, 2.0, 36, 0.42, 0.15); pno(m('F#5'), t_tk + 3 * BT, 2.0, 36, 0.42, 0.15)

# ---------------------------------------------------------------- e6 · CLIMAX: the drums enter for the first time
def drive(t0, t1, g=1.0, toms=True, hands=True, kickpat=(1, 0, 0, 0), cut=None, seed=0, cres=(1.0, 1.0)):
    """the climax pulse on the 16th grid: kick, low toms in 8ths, congas + shaker (hand percussion)"""
    if not ok(t0, t1): return
    for k, t in grid(t0, t1, S16):
        u = (t - t0) / max(1e-6, t1 - t0); cg = g * (cres[0] + (cres[1] - cres[0]) * u)
        q = k % 4; b2 = (k // 4) % 2
        if kickpat[q]: MUS.add(t, kick(105, 42, 0.22, 0.8, 0.15), 0.42 * cg * kickpat[q], 0, rv=0.08, cut=cut, cutf=0.02); ONSETS.append(t)
        if toms and q == 2: drum(LTOM if b2 else LTOM2, t, 84 + 10 * b2, 0.34 * cg, -0.25 if b2 else 0.2, rv=0.25, bg=0.1, cut=cut)
        if toms and q == 3 and h01(k, seed + 3) < 0.35: drum(MTOM, t, 70, 0.22 * cg, 0.3, rv=0.25, cut=cut)
        if hands:
            drum(SHAKER, t, 70 if q == 2 else 52, 0.13 * cg, 0.35, rv=0.15, cut=cut)
            if q in (1, 3) or (q == 2 and b2):
                drum(CONGA_HI if q == 3 else (CONGA_MUTE if q == 1 else CONGA_LO), t, 74 if q == 3 else 62, 0.17 * cg, -0.4, rv=0.2, cut=cut)

def spicc(t0, t1, g=0.12, vel=78, octave=0, cell=(0, 1, 2, 1), cut=None, div=E8):
    """strings: short repeated notes on the chord"""
    if not ok(t0, t1): return
    for k, t in grid(t0, t1, div):
        tones = CHORDS[chord_at(t + 0.01)][1]; c = cell[k % len(cell)]
        note(STR, tones[c % len(tones)] + 12 * (octave + c // len(tones)), t, div * 0.7, vel + (8 if k % 2 == 0 else 0), g,
             -0.4 + 0.8 * ((k * 3) % 5) / 4, rv=0.3, bg=0.15, tail=0.6, cut=cut, cutf=0.02)

def arp(t0, t1, g=0.05, div=S16, span=2, oct=1, bright=(5.0, 10.0), step=1, pan=0.0, detune=True, cut=None, seed=0):
    """a synth arpeggio over the chord, up and down two octaves, its brightness opening"""
    if not ok(t0, t1): return
    for k, t in grid(t0, t1, div):
        up = CHORDS[chord_at(t + 0.01)][1]; tones = [x + 12 * o for o in range(span) for x in up]
        seq = list(range(len(tones))) + list(range(len(tones) - 2, 0, -1)); key = tones[seq[(k * step) % len(seq)]] + 12 * oct
        u = (t - t0) / max(1e-6, t1 - t0); br = round(bright[0] + (bright[1] - bright[0]) * u, 0)
        x = pluck(int(key), div * 1.6, br, 0.16, 30)
        if detune: x = np.stack([x, np.roll(pluck(int(key), div * 1.6, br, 0.14, 30), 31)], 1)
        a = g * (1.0 if k % 4 == 0 else 0.72)
        MUS.add(t, x, a, pan + 0.35 * np.sin(k * 0.7 + seed), rv=0.3, bg=0.2, cut=cut, cutf=0.02); ONSETS.append(t)

def bassline(t0, t1, g=0.3, cut=None, eighths=True):
    if not ok(t0, t1): return
    for k, t in grid(t0, t1, E8 if eighths else BT):
        r = CHORDS[chord_at(t + 0.01)][0]
        x = pluck(r + 12 + (12 if (eighths and k % 4 == 3) else 0), 0.35, 3.0, 0.16, 24)
        MUS.add(t, x, g * (1.0 if k % 2 == 0 else 0.7), 0, rv=0.08, cut=cut, cutf=0.02); ONSETS.append(t)

def tutti(t, L, keys, vel=80, g=0.12, preset=SSTR, fi=0.3, pan=0.8, cut=None, env=None):
    for j, k in enumerate(keys):
        note(preset, k, t, L, vel, g, -pan + 2 * pan * j / max(1, len(keys) - 1), rv=0.5, bg=0.6, tail=3,
             env=env or [(0, 0.3), (fi, 1.0)], cut=cut)

if B('lamp') and B('kline'):                    # the hard cut: the last two beats of 'take' lean into the downbeat
    k0 = T('kline')
    if not cue_in('rise', T('lamp'), k0 + 0.1): h_rise(k0 - 2 * BT, dur=2 * BT)

if B('kline'):
    a, b = T('kline'), E('kline'); t_dip = T_DROP; t_cl = T('kline', 'climb') or b
    # run: the line races. A driving pulse, felt piano octaves in 8ths, strings, a pluck bass
    drive(a, t_dip, 1.0, kickpat=(1, 0, 0, 0.0), cres=(0.85, 1.05))
    bassline(a, t_dip, 0.30)
    spicc(a, t_dip, 0.10, 76)
    for k, t in grid(a, t_dip, E8):
        r = CHORDS[chord_at(t + 0.01)][0] + 24
        pno(r, t, E8 * 1.2, 52 if k % 2 == 0 else 44, 0.42, -0.1, rv=0.25, bg=0.1, human=0, mech=0.4)
        if k % 2 == 0: pno(r + 12, t, E8 * 1.2, 46, 0.32, 0.1, rv=0.25, human=0, mech=0.2)
    arp(a + 2 * BT, t_dip, 0.035, bright=(4, 9), seed=1)
    pads(a, t_dip, SSTR, 66, 0.11, rv=0.45, bg=0.4, fi=0.6, octave=1)
    pads(a, t_dip, CELLO, 70, 0.18, rv=0.4, bass=True, fi=0.2)
    if not cue_in('beat', a - 0.1, a + 0.3): h_beat(a)
    # the dip: one low hit (the cut itself is the silence set up above)
    h_drop(t_dip)
    # climb: the recovery builds. Toms 8ths -> 16ths, a rising string line, a riser into 'found'
    s0 = t_dip + BT if t_dip + BT < t_cl else t_cl
    if not cue_in('rise', t_dip, b): h_rise(s0, dur=b - s0)
    drive(t_cl, b, 1.0, kickpat=(1, 0, 0.6, 0), cres=(0.8, 1.25), seed=3)
    for k, t in grid(t_cl, b, S16):             # tom run doubling up toward the downbeat
        u = (t - t_cl) / max(1e-6, b - t_cl)
        if (k % 2 == 0) or u > 0.5: drum(LTOM if k % 3 else MTOM, t, int(70 + 40 * u), 0.22 + 0.2 * u, -0.3 + 0.6 * ((k % 4) / 3), rv=0.25, bg=0.15)
    bassline(t_cl, b, 0.32)
    line = ms('B3', 'C#4', 'D#4', 'E4', 'F#4', 'G#4', 'A4', 'B4', 'C#5', 'D#5', 'E5', 'F#5')
    n16 = int(round((b - t_cl) / S16))
    for i in range(len(line)):
        t = t_cl + int(round(i * n16 / len(line))) * S16
        note(STR, line[i], t, E8 * 1.5, 80 + 2 * i, 0.12, -0.3 + 0.05 * i, rv=0.35, bg=0.3, tail=1.0)
        note(STR, line[i] - 12, t, E8 * 1.5, 76 + 2 * i, 0.10, 0.3 - 0.05 * i, rv=0.35, bg=0.3, tail=1.0)
    for k, t in grid(t_cl, b, S16):             # a timpani roll, growing
        u = (t - t_cl) / max(1e-6, b - t_cl)
        if u > 0.35: note(TIMP, CHORDS[chord_at(t + 0.01)][0] + 12, t, S16 * 1.5, int(60 + 50 * u), 0.15 + 0.25 * u, 0, rv=0.3, bg=0.2, tail=0.8)

if B('agents'):
    a, b = T('agents'), E('agents')
    t_sp, t_cm = T('agents', 'spawn') or a, T('agents', 'command') or b
    if not cue_in('beat', a - 0.1, a + 0.3): h_beat(a)
    # found: a stall's lamp grows. One arpeggio, a warm pad, the felt piano, a lighter pulse
    arp(a, b, 0.045, bright=(3, 12), seed=2)
    pads(a, b, PAD, 60, 0.14, rv=0.45, bg=0.5, fi=0.5)
    for a_, b_, nm in chord_spans(a, t_sp):
        bs, up = CHORDS[nm]; pchord([bs + 12] + up, a_, b_ - a_ + 0.3, 50, 0.45, rv=0.4, bg=0.4)
    drive(a, t_sp, 0.75, toms=False, kickpat=(1, 0, 0, 0))
    bassline(a, b, 0.26, eighths=False)
    # spawn: layers multiply with the agents: a second arpeggio against it (3 against 4), strings, toms
    arp(t_sp, b, 0.035, step=3, oct=2, bright=(8, 14), pan=0.2, seed=5)
    spicc(t_sp, b, 0.10, 80, octave=1)
    drive(t_sp, t_cm, 0.95, kickpat=(1, 0, 0, 0), seed=5)
    pads(t_sp, b, SSTR, 66, 0.12, rv=0.45, bg=0.5, fi=1.0, octave=1)
    basses(t_sp, b, CELLO, 72, 0.22, 1, rv=0.4)
    if not cue_in('spawn', t_sp, t_cm):           # three spawn waves, each wider than the last
        for i in range(3): h_spawn(t_sp + 2 * i * BT, dur=1.6 + 0.4 * i, n=8 * 3 ** (i + 1))
    # command: one person, a thousand agents. The choir enters; a third, high arpeggio; the drive grows
    arp(t_cm, b, 0.03, div=S16, step=5, oct=3, bright=(12, 16), pan=-0.2, seed=7)
    drive(t_cm, b, 1.05, kickpat=(1, 0, 0.5, 0), cres=(1.0, 1.2), seed=7)
    for a_, b_, nm in chord_spans(t_cm, b):
        bs, up = CHORDS[nm]
        for j, k in enumerate(up): note(CHOIR, k + 12, a_, b_ - a_ + 0.4, 70, 0.11, -0.5 + 0.5 * j, rv=0.5, bg=0.7, env=[(0, 0.3 if a_ > t_cm else 0.0), (0.7, 1.0)])
        note(CHOIR, bs + 24, a_, b_ - a_ + 0.4, 66, 0.10, 0, rv=0.5, bg=0.6, env=[(0, 0.3 if a_ > t_cm else 0.0), (0.7, 1.0)])
    theme(t_cm, [('E5', 1), ('B5', 1), ('A5', 1), ('G#5', 1)], vel=56, g=0.42, rv=0.4, bg=0.5)   # the theme, glimpsed

if B('summit'):
    a, b = T('summit'), E('summit'); t_pk = T('summit', 'peak') or a + 4 * BT
    t_pk = PEAK_AT[0] if PEAK_AT else first('peak', a, b, t_pk)
    t_pkg = snap(t_pk, BT)                       # the composed peak music stays on the grid; the hit is on the cue
    if not cue_in('beat', a - 0.1, a + 0.3): h_beat(a)
    # climb: a dominant pedal, tremolo strings and choir swelling, the timpani rolling, the arpeggios still racing
    L = t_pk - a
    for j, k in enumerate(ms('B2', 'F#3', 'B3', 'D#4', 'F#4', 'A4', 'B4')):
        note(TREM, k, a, L + 0.05, 90, 0.10, -0.6 + 0.2 * j, rv=0.4, bg=0.4, env=[(0, 0.3), (L, 1.0)], cut=t_pk, cutf=0.05)
    for j, k in enumerate(ms('B3', 'D#4', 'F#4', 'B4')):
        note(CHOIR, k, a, L + 0.05, 80, 0.12, -0.4 + 0.27 * j, rv=0.5, bg=0.6, env=[(0, 0.2), (L, 1.0)], cut=t_pk, cutf=0.05)
    arp(a, t_pk, 0.035, bright=(10, 16), seed=9); arp(a, t_pk, 0.03, step=3, oct=2, bright=(12, 16), seed=10)
    bassline(a, t_pk, 0.32)
    for k, t in grid(a, t_pk, S16):
        u = (t - a) / max(1e-6, L)
        note(TIMP, m('B2'), t, S16 * 1.5, int(56 + 60 * u), 0.14 + 0.35 * u, 0, rv=0.3, bg=0.2, tail=0.8)
        if k % 2 == 0 or u > 0.5: drum(LTOM if k % 2 else LTOM2, t, int(64 + 50 * u), 0.15 + 0.25 * u, -0.3 + 0.6 * (k % 3) / 2, rv=0.25, bg=0.15)
    if not cue_in('rise', a, t_pk + 0.1): h_rise(a, dur=L)
    # PEAK: the sun breaks. Full orchestra + choir: the loudest, widest moment of the film
    P = b - t_pk; Lp = P + 1.5
    MUS.add(t_pk, kick(60, 28, 0.9, 3.0, 0.2), 0.24, 0, rv=0.2, bg=0.7)
    drum(BASSDRUM, t_pk, 116, 0.30, 0, rv=0.3, bg=0.7, kit=KIT_ORCH)
    drum(CRASH, t_pk, 104, 0.26, -0.5, rv=0.4, bg=0.7); drum(CRASH2, t_pk + 0.01, 100, 0.24, 0.5, rv=0.4, bg=0.7)
    note(TIMP, m('E2'), t_pk, 2.0, 116, 0.45, 0, rv=0.3, bg=0.6)
    note(TIMP, m('B1') + 12, t_pk + 0.01, 2.0, 104, 0.28, 0.1, rv=0.3, bg=0.6)
    for k, v in (('E1', 100), ('E2', 92), ('B2', 80)): note(PNO, m(k), t_pk, 6.0, v, 0.32, 0, rv=0.3, bg=0.7, tail=6, bus=PNOB)
    env_pk = [(0, 1.0), (P * 0.7, 0.85), (Lp, 0.6)]
    for a_, b_, nm in chord_spans(t_pk, b):
        bs, up = CHORDS[nm]; Lc = b_ - a_ + 0.6
        tutti(a_, Lc, [bs + 12, bs + 19] + [k for k in up] + [k + 12 for k in up] + [up[-1] + 24], vel=96, g=0.11, fi=0.08, pan=0.95,
              env=[(0, 0.5 if a_ > t_pk else 1.0), (0.1, 1.0)])
        note(CBASS, bs + 12, a_, Lc, 100, 0.30, 0, rv=0.3, bg=0.4); note(CELLO, bs + 12, a_, Lc, 100, 0.30, -0.1, rv=0.4, bg=0.4)
        for j, k in enumerate(up): note(HORN, k, a_, Lc, 92, 0.13, -0.3 + 0.3 * j, rv=0.5, bg=0.6, env=[(0, 0.6), (0.3, 1.0)])
        note(BRASS, bs + 24, a_, Lc, 86, 0.08, 0.0, rv=0.5, bg=0.6, env=[(0, 0.6), (0.3, 1.0)])
        for j, k in enumerate(up + [up[0] + 12]): note(CHOIR, k + 12, a_, Lc, 96, 0.13, -0.7 + 0.47 * j, rv=0.5, bg=0.8, env=[(0, 0.7), (0.3, 1.0)])
        if a_ > t_pk: note(TIMP, bs + 12 if bs + 12 <= m('B2') else bs, a_, 1.5, 100, 0.5, 0, rv=0.3, bg=0.4)
    pads(t_pk, b + BT, PAD, 76, 0.16, rv=0.4, bg=0.6, fi=0.1)
    # the theme, sung out at last: violins + choir sopranos + horns an octave below, and it climbs on
    TH = [('E5', 1), ('B5', 1), ('A5', 1), ('G#5', 1), ('F#5', 2), ('G#5', 1), ('B5', 1)]
    melody(t_pkg, TH, lambda k, t, d: (note(VLN, k, t, d * 1.04, 104, 0.16, 0.15, rv=0.5, bg=0.7, tail=2.5, env=[(0, 0.6), (0.15, 1.0)]),
                                      note(STR, k, t, d * 1.04, 98, 0.12, -0.15, rv=0.5, bg=0.7, tail=2.5),
                                      note(CHOIR, k, t, d * 1.06, 92, 0.09, 0.0, rv=0.5, bg=0.8, tail=2.5),
                                      note(HORN, k - 12, t, d * 1.04, 98, 0.15, -0.25, rv=0.5, bg=0.7, tail=2.5)))
    for k, t in grid(t_pkg, b, BT):              # big, slow pulse under the peak: half-time toms + kick
        if k % 2 == 0 and t > t_pk + 0.1:
            MUS.add(t, kick(80, 36, 0.4, 1.2, 0.1), 0.20, 0, rv=0.15, bg=0.3); ONSETS.append(t)
            drum(LTOM2, t, 96, 0.24, -0.3, rv=0.35, bg=0.3); drum(LTOM, t + E8, 86, 0.20, 0.3, rv=0.35, bg=0.3)
    arp(t_pkg, b, 0.03, step=1, oct=2, bright=(14, 16), seed=11)
    MUS.add(t_pk, glow_tone(mtof(m('E6')), 6.0, 0.2, 3.0), 0.05, 0.2, rv=0.5, bg=0.9)
    MUS.add(t_pk, glow_tone(mtof(m('B5')), 6.0, 0.2, 3.0), 0.05, -0.2, rv=0.5, bg=0.9)
    if not cue_in('rise', t_pk + BT, b): MUS.add(b - 2 * BT, revcym(round(2 * BT, 2), 21), 0.06, 0, rv=0.3, bg=0.3)

if B('journey'):
    a, b = T('journey'), E('journey'); t_fr = T('journey', 'free') or b
    # ride: release at speed. The guitar from their freedom is yours now; a long sweeping string phrase; wind
    if not cue_in('beat', a - 0.1, a + 0.3): h_beat(a)
    guitar(a, t_fr, 0.30, 74)
    guitar(t_fr, b, 0.22, 60, dens=(0.8, 0.2), seed=27)
    drive(a, a + 4 * BT, 0.55, toms=False, kickpat=(1, 0, 0, 0), cres=(1.0, 0.4))
    for k, t in grid(a, t_fr, S16): drum(SHAKER, t, 60 if k % 2 else 44, 0.08 * (1 - 0.6 * (t - a) / (t_fr - a)), 0.35, rv=0.2)
    SWEEP = [('E6', 2), ('D#6', 1), ('B5', 1), ('C#6', 1), ('G#5', 1), ('A5', 1), ('F#5', 1), ('G#5', 2), ('E5', 2)]
    melody(a, SWEEP, lambda k, t, d: (note(VLN, k, t, d * 1.05, 92, 0.14, 0.2, rv=0.5, bg=0.7, tail=3, env=[(0, 0.5), (0.2, 1.0)]),
                                      note(SSTR, k - 12, t, d * 1.05, 80, 0.10, -0.2, rv=0.5, bg=0.7, tail=3)))
    melody(a, [('E3', 2), ('F#3', 2), ('G#3', 2), ('A3', 2), ('C#4', 2), ('B3', 2)],
           lambda k, t, d: note(CELLO, k, t, d * 1.05, 80, 0.22, -0.3, rv=0.45, bg=0.5, tail=3))
    for a_, b_, nm in chord_spans(a, b):
        bs, up = CHORDS[nm]; Lc = b_ - a_ + 0.6; u = (a_ - a) / (b - a)
        tutti(a_, Lc, up + [up[-1] + 12], vel=int(84 - 24 * u), g=0.10, fi=0.4, pan=0.9)
        note(CBASS, bs + 12, a_, Lc, int(84 - 24 * u), 0.22, 0, rv=0.35, bg=0.4)
    pads(a, b, PAD, 60, 0.12, rv=0.45, bg=0.6, fi=0.2, fo=2.0)
    note(OOHS, m('B4'), a, b - a + 1, 60, 0.07, 0.1, rv=0.5, bg=0.8, env=[(0, 1), (b - a, 0.5), (b - a + 1, 0)])
    if not cue_in(('wind', 'whoosh'), a, t_fr): h_wind(a, dur=t_fr - a + 2 * BT)
    # free: into a calm open dusk sea. The guitar thins; the sea breathes; the strings hold
    L = b - t_fr + 2.0
    sea = wind(L, 77, 180, 900, 0.25, q=0.5) * local_env(n_of(L), [(0, 0), (1.5, 1), (L - 1.5, 0.8), (L, 0)])[:, None]
    MUS.add(t_fr, sea, 0.06, 0, rv=0.4, bg=0.4)
    MUS.add(t_fr, glow_tone(mtof(m('G#5')), 6.0, 1.0, 2.5), 0.03, 0.3, rv=0.5, bg=0.9)

# ---------------------------------------------------------------- e6 · b21 end: back to the felt piano; the theme's last statement; 那才是你
if B('end'):
    a, b = T('end'), E('end')
    t_y, t_t, t_lv, t_u = (T('end', x) for x in ('years', 'try', 'love', 'you'))
    e_body = t_u or b
    for a_, b_, nm in chord_spans(a, e_body):    # intimate again: piano + quiet strings
        bs, up = CHORDS[nm]
        strings(up, a_, b_ - a_ + 0.5, 50, 0.10, fi=0.6 if a_ > a else 1.5, spread=0.5)
        note(CELLO, bs + 12, a_, b_ - a_ + 0.5, 50, 0.16, 0, rv=0.45, bg=0.5, env=[(0, 0.4), (0.6, 1.0)])
        pno(bs + 12, a_, b_ - a_ + 0.8, 42, 0.45, -0.1, rv=0.45, bg=0.5)
        pchord(up, a_ + BT, b_ - a_, 32, 0.32, rv=0.45, bg=0.5)
    if ok(t_y):                                 # 你已经做了很多年的好孩子了: the piano alone, gently
        theme(t_y + BT, [('G#4', 1), ('B4', 1), ('E5', 2)], vel=36, g=0.45, rv=0.5, bg=0.6)
    if ok(t_t):                                 # Have a try: a breath of light, waiting on the dominant
        pno(m('B4'), t_t + BT, 2.0, 34, 0.42, 0.15); pno(m('C#5'), t_t + 2 * BT, 2.0, 34, 0.42, 0.15)
    if ok(t_lv):                                # 找回你自己热爱的…: the theme's last statement, sung by piano + strings
        seq = [('E4', 1), ('B4', 1), ('A4', 1), ('G#4', 1), ('F#4', 4)]
        theme(t_lv, seq, vel=50, g=0.6, rv=0.5, bg=0.6, strings_too=(VLN, 58, 0.10, 1), human=0.006)
        melody(t_lv, seq, lambda k, t, d: note(CELLO, k - 12, t, d * 1.02, 54, 0.14, -0.2, rv=0.5, bg=0.5, tail=2.5, env=[(0, 0.3), (0.3, 1.0)]))
    if ok(t_u):                                 # 那才是你。: the waiting note rises home, the warm last E major chord
        t_fin = first(('title', 'glow', 'resolve', 'land', 'peak', 'beat'), t_u, b, t_u + 2 * BT)
        t_fg = snap(t_fin, BT) if abs(t_fin - snap(t_fin, BT)) < 0.05 else t_fin
        t_li = snap(t_fg, BT) - 2 * BT if t_fg - snap(t_fg, BT) > -0.2 else snap(t_fg, BT) - 3 * BT
        if t_li >= t_u - 0.01:
            theme(t_li, [('G#4', 1), ('B4', 1)], vel=44, g=0.55, rv=0.5, bg=0.7, strings_too=(VLN, 56, 0.09, 1))
        if t_fg > t_u + BT:                     # under 那才是你: the dominant held softly, waiting for the word
            Lb = t_fg - t_u
            strings(ms('F#3', 'B3', 'D#4', 'F#4'), t_u, Lb + 0.15, 50, 0.09, fi=1.0, cut=t_fg, cutf=0.15)
            note(CELLO, m('B2'), t_u, Lb + 0.15, 50, 0.15, 0, rv=0.45, bg=0.5, env=[(0, 0.3), (1.0, 1.0)], cut=t_fg, cutf=0.15)
            pno(m('B2'), t_u, Lb, 40, 0.42, -0.1, rv=0.45, bg=0.5); pchord(ms('F#3', 'B3', 'D#4'), t_u + BT, Lb - BT, 32, 0.32, rv=0.45, bg=0.5)
        L = b - t_fg; env = [(0, 1), (L * 0.3, 0.8), (L - 0.3, 0.0)]
        IN_SYNC[0] = abs(t_fg - snap(t_fg, BT)) > 1e-3     # on a cue time (sync), else on the grid
        for j, k in enumerate(ms('E1', 'E2', 'B2', 'G#3', 'B3', 'E4', 'F#4', 'G#4', 'E5')):
            pno(k, t_fg + 0.025 * j, L, 54 - 2 * j, 0.45, -0.4 + 0.1 * j, rv=0.45, bg=0.9, tail=2, human=0, mech=0.6 if j == 0 else 0.2, nominal=t_fg)
            note(SSTR, k + 12, t_fg, L, 54, 0.07, 0.4 - 0.1 * j, rv=0.5, bg=0.9, tail=1, env=[(0, 0.5), (1.2, 1), (L * 0.55, 0.6), (L - 0.3, 0.0)])
        note(VLN, m('E5'), t_fg, L, 54, 0.09, 0.15, rv=0.5, bg=0.9, tail=1, env=[(0, 1), (L * 0.5, 0.6), (L - 0.3, 0)])
        note(OOHS, m('B4'), t_fg, L, 48, 0.045, 0.0, rv=0.5, bg=0.9, tail=1, env=[(0, 0.6), (L * 0.5, 0.5), (L - 0.3, 0)])
        MUS.add(t_fg, glow_tone(mtof(m('E5')), L, 1.5, L * 0.45), 0.035, -0.1, rv=0.5, bg=0.9)
        IN_SYNC[0] = False
        for i, (k, d) in enumerate([('E6', 2), ('B6', 2), ('G#6', 4)]):       # the theme's head, a last high echo
            note(CEL, m(k), snap(t_fg, BT) + (3 + 2 * i) * BT, 1.5, 42 - 4 * i, 0.06, 0.25, rv=0.5, bg=0.9, tail=3)

# ================================================================ SYNC: every cue in cues.json
IN_SYNC[0] = True
used = {}
for c in CUES:
    ty = c.get('type'); fn = HANDLERS.get(ty)
    if not fn or (ty == 'beat' and 'visual' in c): continue
    kw = {k: v for k, v in c.items() if k not in ('t', 'type', 'beat', 'chapter', 'visual')}
    try:
        fn(float(c['t']), **kw); used[ty] = used.get(ty, 0) + 1
    except Exception as ex:
        print(f'  cue {ty} @ {c["t"]}: skipped ({ex})')
print('cues handled:', ', '.join(f'{k}×{v}' for k, v in sorted(used.items())) or '(none)')

# ================================================================ MIX
print(f'rendered notes ({len(sf2.cache)} unique SF2 notes) in {time.time() - T_RUN:.1f}s; mixing ...', flush=True)
pnob = PNOB.render(); mus = MUS.render(); blur = BLUR.render(); fxb = FX.render(); post = POST.render()
nn = len(mus)
for t, f in CUTS.get('blur', []):              # 'none': their warmth stops (a door closes on it)
    blur *= env_points(nn, [(0, 1), (t, 1), (t + f, 0)])[:, None]
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
# section trims (dB, by visual type) on the music buses, 80 ms cosine moves on the beat lines
TRIM = {'feed': -4.0, 'answers': -3.5, 'darkq': -2.5, 'weightless': 1.0, 'lamp': -1.5, 'leave': -1.5, 'fall': -1.5}
# the summit must stay the film's loudest moment: the first-half peak (title) and the landing sit a little lower
FXTRIM = {'leave': 0.8, 'fall': 0.82}
pts = []
for b_ in BEATS:
    g_ = 10 ** (TRIM.get(tl.btype(b_), 0.0) / 20)
    pts += [(b_['start'] + 0.04, g_), (b_['end'] - 0.04, g_)]
HD = HD * env_points(nn, pts)[:, None]
_tf = np.arange(int(nn / SR * 20) + 2) / 20
_gf = np.convolve(np.array([fxg(x) for x in _tf]), np.ones(3) / 3, mode='same')      # 0.15 s smoothing
_gf *= np.array([FXTRIM.get(btype_at(x), 1.0) for x in _tf])
FXE = np.interp(np.arange(nn) / SR, _tf, _gf)[:, None]
music = (pnob * 1.0 + mus + blur) * HD
fxs = fxb * FXE
if '--stems' in sys.argv:        # debug: loudness of each bus per step
    import pyloudnorm as pyln
    M_ = pyln.Meter(SR, block_size=0.4)
    for b_ in BEATS:
        for s_ in steps(b_):
            i0, i1 = n_of(s_['t']), n_of(s_['t'] + s_['dur'])
            vals = []
            for y in (pnob * HD, (mus + blur) * HD, fxs):
                try: vals.append(M_.integrated_loudness(y[i0:i1]))
                except Exception: vals.append(-99)
            print(f"   stem {b_['id']} {s_['show']:8s} piano {vals[0]:6.1f}  music {vals[1]:6.1f}  fx {vals[2]:6.1f}")
mix = music + fxs
mix = filt(mix, 'hp', 30, order=2)
mix = mix * G + post
mix = mix[:NOUT]
# the last chord reaches digital silence at the end of the final step (no click)
end_t = E('end') if B('end') else D
mix *= env_points(len(mix), [(0, 1), (end_t - 2.5, 1), (end_t - 0.05, 0)])[:, None]
L0 = lufs(mix); gain = 10 ** ((-16.0 - L0) / 20); mix *= gain
_pre = mix.copy()
mix = limiter(mix, ceiling_db=-1.3)
for _ in range(4):                     # tiny correction loop after limiting
    L1 = lufs(mix)
    if abs(L1 + 16) < 0.05: break
    mix = limiter(mix * 10 ** ((-16 - L1) / 20), ceiling_db=-1.3)
os.makedirs(OUT, exist_ok=True)
write(os.path.join(OUT, 'mix.wav'), mix)
_h = SR // 10; _nb = len(mix) // _h
_gr = 20 * np.log10((np.abs(mix[:_nb * _h]).reshape(_nb, _h, 2).max((1, 2)) + 1e-9) / (np.abs(_pre[:_nb * _h] * (10 ** ((lufs(mix) - lufs(_pre)) / 20))).reshape(_nb, _h, 2).max((1, 2)) + 1e-9))
print(f'limiter: max gain reduction {-_gr.min():.1f} dB at {np.argmin(_gr) * 0.1:.1f}s; > 2 dB in {np.mean(_gr < -2) * 100:.1f}% of the film')
del _pre

# ================================================================ report
import pyloudnorm as pyln
L, TP = lufs(mix), true_peak_db(mix)
MTR = pyln.Meter(SR)
def seg_lufs(a, b):
    x = mix[n_of(a):n_of(b)]
    try: return MTR.integrated_loudness(x) if len(x) > SR else -99
    except Exception: return -99
def rms_db(a, b):
    x = mix[n_of(a):n_of(b)]
    return db(np.sqrt((x ** 2).mean()) + 1e-12) if len(x) else -999
print('chapter loudness (LUFS integrated):')
for c in tl.chapters:
    print(f"  {c['id']} {c['title']:8s} {c['start']:6.1f}-{c['end']:6.1f}  {seg_lufs(c['start'], c['end']):6.1f} LUFS  max-short {max([seg_lufs(x, x + 3) for x in np.arange(c['start'], c['end'] - 3, 1.5)] or [-99]):6.1f}")
print('beat RMS (dBFS):')
for b_ in BEATS:
    print(f"  {b_['id']} {tl.btype(b_):11s} {b_['start']:6.1f}-{b_['end']:6.1f}  {rms_db(b_['start'], b_['end']):6.1f}")
for a, b_ in sorted(set(GATE)):
    x = mix[n_of(a + 0.05):n_of(b_)]
    pk = np.abs(x).max() if len(x) else 0.0
    print(f'  silence {a:.2f}-{b_:.2f} ({btype_at(a)}): peak {db(pk) if pk > 0 else -999:.1f} dBFS ({"digital zero" if pk == 0 else "post-bus clicks only"})')
on = np.array(ONSETS); off = np.abs(on / S16 - np.round(on / S16)) * S16
if os.environ.get('GK_GRID'): print('off-grid:', sorted(set(np.round(on[off > 0.013], 3))))
print(f'grid: {len(on)} composed onsets, {np.mean(off < 0.002) * 100:.1f}% exactly on the 16th grid (max off {off.max() * 1000:.1f} ms: the felt hand, <= 12 ms); {len(FREE)} deliberately free notes (个性 scribble, imperfect tries)')
tail = mix[n_of(end_t):]
print(f'end: last step ends {end_t:.3f}s; after it peak {db(np.abs(tail).max()) if len(tail) and np.abs(tail).max() > 0 else -999:.1f} dBFS')
if '--plot' in sys.argv:
    plot_tracks([('mix', mix)], tl, os.path.join(OUT, 'score.png'), 'score: 打分的人走了')
print(f'score: {L:.2f} LUFS, true peak {TP:.2f} dBTP, {len(mix) / SR:.3f}s (timeline {D:.3f}s), {len(CUES)} cues, built in {time.time() - T_RUN:.0f}s')
