"""Generic original score for one film part: <part>/timeline.json -> <part>/mix.wav (48 kHz stereo, -16 LUFS,
true peak <= -1.5 dBTP so the AAC encode stays under -1 dBTP).

Ideas and instruments from good-kid's score (felt piano, sustained strings, bowed glass, warm pad, glow tones, a
synthetic hall), but composed from the timeline alone, for any book:
  * 72 BPM; every scene is a whole, even number of beats, chords are laid on the beat grid from each scene's start,
    and the moments the picture shares (`marks`: text formed, key lit, list item k written, count lands, ...) are
    hit exactly.
  * The mood of each scene drives harmony and orchestration:
      cold     E minor, open and sparse: bowed glass high above, single felt-piano notes far apart, a low pedal
      neutral  E minor / G major: rolled piano chords, soft strings, a slow pulse, roots in cello
      warm     E major: warm pad + strings, an 8th-note piano arpeggio, cello roots — fuller and closer
  * `quote` is a lift: a riser and swell lead into it, brighter chords, strings + voices, the theme on piano
    (doubled by a violin when warm), a glow when the key lights.
  * `question` drops to an open fifth and almost silence; `chapter` is a low note and a bell; `list` items are
    notes rising through the chord; `number` ticks while it counts and lands on a low note; `contrast` answers a
    cold bell with a warm glow and settles on a chord.
  * `end` resolves: IV - V(sus4) - V - I in E major, the theme's last statement, the final chord fading to digital
    silence. A part without an end scene closes on its last chord and fades with the picture.
usage: python3 pipeline/audio/score.py <part_dir>
"""
import json, os, sys, time, hashlib
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from common import *   # noqa

T_RUN = time.time()
PART = os.path.abspath(sys.argv[1])
TL = json.load(open(os.path.join(PART, 'timeline.json'), encoding='utf-8'))
D = float(TL['duration']); BT = 60.0 / TL.get('bpm', 72); E8 = BT / 2
SC = TL['scenes']
NN = n_of(D) + n_of(5.0); NOUT = n_of(D)
SEED = int(TL.get('seed', 1))

def h01(*k):
    x = int(hashlib.md5(repr((SEED,) + k).encode()).hexdigest()[:8], 16); return x / 2 ** 32

# ================================================================ pitch / chords
_PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
def m(s):
    if isinstance(s, (int, np.integer)): return int(s)
    p = _PC[s[0]]; i = 1
    while i < len(s) and s[i] in '#b': p += 1 if s[i] == '#' else -1; i += 1
    return 12 * (int(s[i:]) + 1) + p
def ms(*a): return [m(x) for x in a]
CH = {   # name: (bass, upper voicing low->high)
    'Em': (m('E2'), ms('B3', 'E4', 'G4')), 'Em9': (m('E2'), ms('G3', 'B3', 'D4', 'F#4')), 'Em7': (m('E2'), ms('G3', 'B3', 'D4', 'E4')),
    'E5': (m('E2'), ms('B3', 'E4', 'B4')), 'Cmaj7': (m('C2'), ms('G3', 'B3', 'E4')), 'Cmaj9': (m('C2'), ms('G3', 'B3', 'D4', 'E4')),
    'Cmaj7#11': (m('C2'), ms('B3', 'E4', 'F#4', 'G4')), 'Cadd9': (m('C2'), ms('G3', 'D4', 'E4')), 'Am9': (m('A1'), ms('G3', 'B3', 'C4', 'E4')),
    'Am7': (m('A1'), ms('G3', 'C4', 'E4')), 'G': (m('G1'), ms('G3', 'B3', 'D4')), 'Gadd9': (m('G1'), ms('B3', 'D4', 'G4', 'A4')),
    'G/B': (m('B1'), ms('G3', 'B3', 'D4')), 'D/F#': (m('F#1'), ms('A3', 'D4', 'F#4')), 'Dadd9': (m('D2'), ms('F#3', 'A3', 'E4')),
    'Bsus4': (m('B1'), ms('B3', 'E4', 'F#4')), 'B7sus4': (m('B1'), ms('A3', 'E4', 'F#4')), 'Em/D': (m('D2'), ms('G3', 'B3', 'E4')),
    'E': (m('E2'), ms('G#3', 'B3', 'E4')), 'Eadd9': (m('E2'), ms('B3', 'E4', 'F#4', 'G#4')), 'Emaj9': (m('E2'), ms('G#3', 'B3', 'D#4', 'F#4')),
    'E/G#': (m('G#1'), ms('B3', 'E4', 'G#4')), 'Amaj7': (m('A1'), ms('G#3', 'C#4', 'E4')), 'Aadd9': (m('A1'), ms('B3', 'C#4', 'E4')),
    'C#m7': (m('C#2'), ms('G#3', 'B3', 'E4')), 'B': (m('B1'), ms('F#3', 'B3', 'D#4')), 'B/D#': (m('D#2'), ms('F#3', 'B3', 'D#4')),
    'F#m7': (m('F#1'), ms('A3', 'C#4', 'E4')),
}
MAJOR = {'E', 'Eadd9', 'Emaj9', 'E/G#', 'Amaj7', 'Aadd9', 'C#m7', 'B', 'B/D#', 'F#m7'}
PROG = {
    'cold':    [['Em9', 'Cmaj7', 'Am9', 'Em9'], ['E5', 'Cmaj7#11', 'Am9', 'Bsus4'], ['Em', 'Cmaj9', 'G/B', 'Bsus4'], ['Em9', 'Em/D', 'Cmaj7', 'B7sus4']],
    'neutral': [['Em7', 'Cadd9', 'G', 'D/F#'], ['Am9', 'Em9', 'Cmaj9', 'Bsus4'], ['Cmaj9', 'G/B', 'Am7', 'Em7'], ['G', 'D/F#', 'Em7', 'Cmaj9']],
    'warm':    [['Eadd9', 'Aadd9', 'C#m7', 'Bsus4'], ['Amaj7', 'E/G#', 'C#m7', 'B'], ['Eadd9', 'B/D#', 'C#m7', 'Aadd9'], ['Aadd9', 'Eadd9', 'F#m7', 'B']],
}
LIFT = {'cold': ['Cmaj7', 'G/B', 'Am9', 'Bsus4'], 'neutral': ['Cmaj9', 'G', 'D/F#', 'Em7'], 'warm': ['Aadd9', 'Eadd9', 'B/D#', 'C#m7']}
THEMES = [[('E4', 1), ('B4', 1), ('A4', 1), ('G4', 1), ('F#4', 2)],
          [('B3', 1), ('E4', 1), ('F#4', 1), ('G4', 2), ('F#4', 1), ('E4', 2)],
          [('G4', 1), ('F#4', 1), ('E4', 1), ('B4', 2), ('A4', 2)]]
THEME = THEMES[SEED % len(THEMES)]
def to_major(n): return n[0] + '#' + n[1:] if n[0] in 'GCD' and n[1] != '#' else n    # E minor -> E major: G, C, D are raised

HARM = []    # (t0, t1, chord)
def lay(t0, t1, names, unit=4):
    """chords over [t0, t1) in blocks of `unit` beats (the last one takes the rest)"""
    nb = int(round((t1 - t0) / BT)); k = 0; t = t0
    while nb > 0:
        u = unit if nb - unit >= 2 or nb == unit else nb
        HARM.append((t, t + u * BT, names[k % len(names)])); t += u * BT; nb -= u; k += 1
def chord_at(t):
    for a, b, nm in reversed(HARM):
        if a - 1e-6 <= t < b: return nm
    return 'Em9'
def spans(t0, t1):
    return [(max(a, t0), min(b, t1), nm) for a, b, nm in sorted(HARM) if min(b, t1) > max(a, t0) + 1e-6]

# ================================================================ instruments + buses
ensure_sf2(); sf2 = SF2()
PNO, CEL, GLK, MBOX, HARP = 0, 8, 9, 10, 46
VLN, CELLO, CBASS, STR, SSTR, OOHS, PAD, GLASS, HALO = 40, 42, 43, 48, 49, 53, 89, 92, 94
CALKEY = {CBASS: m('E2'), CELLO: m('E3')}
_CAL = {}
def cal(preset):
    if preset not in _CAL:
        x = sf2.note(0, preset, CALKEY.get(preset, m('E4')), 100, 0.6, tail=0.4)
        _CAL[preset] = 0.1 / (np.sqrt((x[:n_of(0.5)] ** 2).mean()) + 1e-9)
    return _CAL[preset]

class Bus:
    def __init__(s, name, lp=None, hs=None):
        s.name, s.lp, s.hs = name, lp, hs
        s.dry = np.zeros((NN, 2), np.float32); s.hall = np.zeros((NN, 2), np.float32); s.big = np.zeros((NN, 2), np.float32)
    def add(s, t, x, g=1.0, pan=0.0, rv=0.0, bg=0.0):
        if t is None or t >= D + 1.0 or g == 0: return
        x = to_stereo(x)
        place(s.dry, t, x, g, pan)
        if rv: place(s.hall, t, x, g * rv, pan)
        if bg: place(s.big, t, x, g * bg, pan)
    def render(s):
        import scipy.fft
        y = s.dry.astype(np.float64)
        with scipy.fft.set_workers(os.cpu_count() or 1):
            for arr, ir, k in ((s.hall, IR_HALL, 0.55), (s.big, IR_BIG, 0.6)):
                if np.any(arr): y += np.stack([signal.oaconvolve(arr[:, c], ir[:, c].astype(np.float32))[:NN] for c in range(2)], 1) * k
        if s.lp: y = filt(y, 'lp', s.lp, q=0.6, order=2)
        if s.hs: y = filt(y, 'hs', s.hs[0], gain_db=s.hs[1])
        return y
PNOB = Bus('piano', lp=2600, hs=(6000, -6)); MUS = Bus('music'); FX = Bus('fx')
IR_HALL = make_ir(rt60=2.8, bright=0.42, seed=11, width=0.85)
IR_BIG = make_ir(rt60=7.0, bright=0.5, seed=23, width=0.95, predelay=0.035)

def note(preset, key, t, dur, vel, g=1.0, pan=0.0, rv=0.3, bg=0.0, bus=None, tail=3.0, env=None):
    if t is None or t >= D + 0.5 or dur <= 0: return
    vel = int(np.clip(round(vel / 4) * 4, 4, 124)); dur = max(0.05, round(dur / 0.05) * 0.05)
    x = sf2.note(0, preset, int(key), vel, dur, tail=tail)
    if env is not None: x = x * env_points(len(x), env)[:, None]
    (bus or MUS).add(t, x, g * cal(preset), pan, rv, bg)

_cache = {}
def cached(key, fn):
    if key not in _cache: _cache[key] = fn()
    return _cache[key]
def tvec(n): return np.arange(n) / SR
def wnoise(n, seed=None): return np.random.default_rng(seed).standard_normal(n)
def felt(seed=0):
    def mk():
        n = n_of(0.09); t = tvec(n)
        x = filt(wnoise(n, 300 + seed), 'lp', 520) * np.exp(-t / 0.011) + 0.5 * np.sin(2 * np.pi * (170 + 13 * seed) * t) * np.exp(-t / 0.014)
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
    def mk():
        n = n_of(dur); t = tvec(n); env = (1 - np.exp(-t / (att / 3))) * np.exp(-t / tau); y = np.zeros((n, 2))
        for c, dc in enumerate((-3.5, 3.5)):
            for r, a in [(1, 1.0), (2, 0.22), (3, 0.07), (0.5, 0.12)]:
                y[:, c] += a * np.sin(2 * np.pi * f * 2 ** (dc / 1200) * r * t + c * 0.7)
        return y * env[:, None] / 1.4
    return cached(('glow', round(f, 1), dur, att, tau), mk)
def riser(L):
    def mk():
        n = n_of(L); x = np.stack([wnoise(n, 5), wnoise(n, 6)], 1)
        fc = 300 * (6000 / 300) ** (np.arange(n) / max(1, n - 1)) ** 1.6
        y = sweep(x, 'bp', fc, q=1.2) * (np.linspace(0, 1, n) ** 2.2)[:, None]
        return y * env_points(n, [(0, 1), (L - 0.06, 1), (L, 0)])[:, None]
    return cached(('riser', round(L, 3)), mk)
def thump(f0=90, f1=46, tau=0.14, dur=0.7):
    def mk():
        n = n_of(dur); t = tvec(n); f = f1 + (f0 - f1) * np.exp(-t / 0.03)
        return filt(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / tau) * np.minimum(1, t / 0.002), 'lp', 220)
    return cached(('thump', f0, f1, tau, dur), mk)
def tick(f=3000, seed=0):
    def mk():
        n = n_of(0.05); t = tvec(n); x = filt(wnoise(n, 90 + seed), 'bp', f, q=2.5) * np.exp(-t / 0.004)
        return x / (np.abs(x).max() + 1e-9)
    return cached(('tick', f, seed), mk)
def room(dur):
    n = n_of(dur)
    x = np.stack([filt(wnoise(n, 1), 'lp', 240, order=2), filt(wnoise(n, 2), 'lp', 240, order=2)], 1)
    return x + 0.03 * np.stack([filt(wnoise(n, 3), 'hp', 3000), filt(wnoise(n, 4), 'hp', 3000)], 1)

def pno(key, t, dur, vel, g=1.0, pan=0.0, rv=0.38, bg=0.18, human=0.006):
    dt = (h01('h', key, round(t, 3)) - 0.5) * 2 * human
    note(PNO, key, t + dt, dur, vel, g, pan, rv=rv, bg=bg, bus=PNOB, tail=4.0)
    PNOB.add(t + dt - 0.004, felt(int(key) % 5), 0.010 * g * (vel / 64) ** 1.4, pan, rv=0.08)
def pchord(keys, t, dur, vel, g=1.0, roll=0.03):
    for j, k in enumerate(sorted(keys)):
        pno(k, t + j * roll, dur, vel - 2 * j, g, -0.3 + 0.6 * j / max(1, len(keys) - 1))
def pads(t0, t1, preset, vel=50, g=0.3, octave=0, fi=0.8, fo=0.8, rv=0.45, bg=0.35, which=None, spread=0.6):
    for j, (a, b, nm) in enumerate(spans(t0, t1)):
        up = CH[nm][1]; keys = [up[i] for i in which if i < len(up)] if which else up
        L = b - a + 0.35
        for i, k in enumerate(keys):
            env = [(0, 0 if j == 0 else 0.6), (fi if j == 0 else 0.15, 1.0)]
            if t1 - b < 1e-3: env += [(max(0.2, L - fo), 1.0), (L, 0.0)]
            note(preset, k + 12 * octave, a, L, vel, g, -spread + 2 * spread * i / max(1, len(keys) - 1), rv=rv, bg=bg, env=env, tail=2.5)
def roots(t0, t1, preset, vel=56, g=0.4, octave=1):
    for a, b, nm in spans(t0, t1):
        note(preset, CH[nm][0] + 12 * octave, a, b - a + 0.2, vel, g, 0, rv=0.3, bg=0.15, tail=2.0)
def arpeggio(t0, t1, vel=40, g=0.8, dens=1.0, octave=0, cell=(0, 1, 2, 3, 2, 1)):
    k0 = int(np.ceil((t0 - 1e-4) / E8))
    for k in range(k0, int(np.ceil((t1 - 1e-4) / E8))):
        t = k * E8
        if h01('arp', k) > dens: continue
        up = CH[chord_at(t + 0.01)][1]; c = cell[k % len(cell)]
        pno(up[c % len(up)] + 12 * (octave + c // len(up)), t, E8 * 3, vel + (6 if k % 4 == 0 else 0), g, 0.25 * np.sin(k), rv=0.35, bg=0.12)
def sparse(t0, t1, vel=36, g=0.8, every=2, dens=0.7, octave=1):
    for k in range(int(np.ceil(t0 / BT - 1e-4)), int(np.ceil(t1 / BT - 1e-4)), every):
        t = k * BT
        if h01('sp', k) > dens: continue
        up = CH[chord_at(t + 0.01)][1]
        pno(up[int(h01('spn', k) * len(up))] + 12 * octave, t, BT * 3, vel, g, (h01('spp', k) - 0.5) * 0.8, rv=0.5, bg=0.35)
def theme(t, warm, g=0.5, vel=50, octave=0, violin=False):
    for nm, d in THEME:
        k = m(to_major(nm) if warm else nm) + 12 * octave
        pno(k, t, d * BT * 1.15 + 0.3, vel, g, 0.08, rv=0.42, bg=0.35)
        if violin: note(VLN, k + 12, t, d * BT * 1.02, 58, 0.16, -0.1, rv=0.5, bg=0.45, tail=2.5, env=[(0, 0.2), (0.25, 1.0)])
        t += d * BT
    return t

# ================================================================ form: scene by scene
PEDAL = []
for i, s in enumerate(SC):
    t0, t1, mood, ty = s['start'], s['end'], s['mood'], s['type']
    mk_ = lambda name, d=None: (t0 + s['marks'][name]) if s.get('marks', {}).get(name) is not None else d
    warm, cold = mood == 'warm', mood == 'cold'
    prog = PROG[mood][(s['gi'] + SEED) % len(PROG[mood])]
    nxt = SC[i + 1] if i + 1 < len(SC) else None
    if ty == 'question':
        HARM.append((t0, t1, 'E5' if not warm else 'Eadd9'))
        pads(t0, t1, GLASS, vel=40, g=0.10, octave=1, fi=1.6, fo=1.5, which=[0, 1])
        note(CBASS, m('E2'), t0, t1 - t0, 40, 0.22, 0, rv=0.3, env=[(0, 0), (1.5, 1), (t1 - t0 - 1.0, 1), (t1 - t0, 0)])
        lit = mk_('lit', t0 + 3 * BT)
        note(VLN, m('B5'), lit, t1 - lit - 0.6, 44, 0.10, 0.15, rv=0.6, bg=0.6, env=[(0, 0), (1.2, 1), (t1 - lit - 1.2, 0.7), (t1 - lit - 0.6, 0)])
        pno(m('F#5'), lit, 3 * BT, 30, 0.7)
        continue
    if ty == 'end':
        nb = s['beats']; f = mk_('formed', t0 + 3 * BT)
        f = max(t0 + 2 * BT, round((f - t0) / BT) * BT + t0)
        HARM += [(t0, t0 + (f - t0) / 2, 'Aadd9'), (t0 + (f - t0) / 2, f - BT, 'Bsus4'), (f - BT, f, 'B'), (f, t1 + 4, 'Eadd9')]
        pads(t0, f, STR, vel=52, g=0.22, fi=1.0, which=[0, 1, 2]); pads(t0, f, PAD, vel=44, g=0.16, fi=1.0)
        roots(t0, f, CELLO, vel=54, g=0.32, octave=1)
        for a, b, nm in spans(t0, f): pchord(CH[nm][1], a, b - a + 0.4, 44, 0.8)
        # the resolution: the final chord blooms on the text, then fades to silence before the end
        L = t1 - f + 1.0
        fade = [(0, 0), (0.3, 1), (L * 0.55, 0.8), (L - 0.4, 0.0)]
        for k in ms('E1', 'E2', 'B2'): pno(k, f, L, 52, 0.9)
        pchord(ms('G#3', 'B3', 'E4', 'F#4'), f + BT, L - BT, 40, 0.75)
        for k in ms('E3', 'B3', 'G#4', 'E5'): note(STR, k, f, L, 56, 0.17, (k % 7 - 3) / 4, rv=0.5, bg=0.5, env=fade, tail=3)
        for k in ms('G#4', 'B4', 'E5'): note(OOHS, k, f, L, 50, 0.10, 0, rv=0.5, bg=0.6, env=fade, tail=3)
        note(CELLO, m('E2') + 12, f, L, 52, 0.25, 0, rv=0.4, env=fade)
        FX.add(f, glow_tone(mtof(m('B5')), 6.0, att=0.8, tau=3.0), 0.05, 0, rv=0.5, bg=0.6)
        tt = theme(f + 4 * BT, True, g=0.45, vel=44, octave=1)
        note(CEL, m('E6'), min(tt, t1 - 3), 2.0, 60, 0.10, 0.2, rv=0.5, bg=0.6)
        continue
    if ty == 'chapter':
        lay(t0, t1, [prog[0]], unit=s['beats'])
        f = mk_('formed', t0 + 2 * BT)
        pno(CH[prog[0]][0] + 12, t0, 4 * BT, 46, 1.0); pno(CH[prog[0]][0], t0, 4 * BT, 40, 0.8)
        FX.add(f, bell(mtof(m('B5') if not warm else m('G#5')), 4.0, 1.3), 0.035, 0.2, rv=0.6, bg=0.6)
        pads(t0, t1, GLASS if cold else (PAD if warm else SSTR), vel=44, g=0.12 if cold else 0.16, octave=1 if cold else 0, fi=1.2)
        continue
    if ty == 'quote':
        names = LIFT[mood]; lay(t0, t1, names, unit=4)
        # the lift into it: a riser over the two beats before, strings swell
        if i > 0:
            FX.add(t0 - 2 * BT, riser(2 * BT), 0.022, 0, rv=0.3, bg=0.4)
            note(SSTR, CH[names[0]][1][-1] + 12, t0 - 2 * BT, 2 * BT + 0.3, 50, 0.10, 0, rv=0.4, bg=0.4, env=[(0, 0), (2 * BT, 1), (2 * BT + 0.3, 0.6)])
        pads(t0, t1, STR, vel=60, g=0.24, fi=0.6, fo=1.2)
        pads(t0, t1, OOHS, vel=50, g=0.10, octave=1 if not cold else 0, fi=1.5, fo=1.2, which=[0, 2])
        if cold: pads(t0, t1, GLASS, vel=40, g=0.09, octave=1, fi=1.2, which=[1, 2])
        else: pads(t0, t1, PAD, vel=46, g=0.16, fi=1.0)
        roots(t0, t1, CELLO, vel=58, g=0.36, octave=1); roots(t0, t1, CBASS, vel=48, g=0.22, octave=1)
        for a, b, nm in spans(t0, t1): pchord(CH[nm][1], a, b - a + 0.5, 48, 0.85); pno(CH[nm][0] + 12, a, b - a + 0.5, 48, 0.9)
        f = mk_('formed', t0 + 3 * BT)
        theme(t0 + max(2, round((f - t0) / BT)) * BT, warm, g=0.5, vel=50, octave=1 if warm else 0, violin=warm)
        kk = mk_('key', f + BT)
        FX.add(kk, glow_tone(mtof(m('B4') if not warm else m('G#4')), 5.0, att=0.6, tau=2.4), 0.07, 0, rv=0.5, bg=0.5)
        continue
    # line / title / list / contrast / number: the mood's own bed
    lay(t0, t1, prog, unit=4)
    if cold:
        pads(t0, t1, GLASS, vel=42, g=0.10, octave=1, which=[0, 2])
        sparse(t0, t1, vel=34, g=0.85, every=2, dens=0.65, octave=1)
        PEDAL.append((t0, t1))
    elif warm:
        pads(t0, t1, PAD, vel=46, g=0.17); pads(t0, t1, SSTR, vel=50, g=0.15, which=[0, 2])
        roots(t0, t1, CELLO, vel=52, g=0.30, octave=1)
        arpeggio(t0, t1, vel=36, g=0.75, dens=0.85 if ty != 'title' else 0.5)
    else:
        pads(t0, t1, SSTR, vel=48, g=0.15, which=[0, 1, 2])
        roots(t0, t1, CELLO, vel=46, g=0.22, octave=1)
        for a, b, nm in spans(t0, t1): pchord(CH[nm][1], a, b - a + 0.5, 36, 0.55)
        arpeggio(t0, t1, vel=30, g=0.45, dens=0.35, cell=(0, 2, 1, 3))
    if ty == 'title':
        f = mk_('formed', t0 + 3 * BT)
        for k in ms('E1', 'E2'): pno(k, t0 + (0 if i == 0 else 0), 8 * BT, 44, 0.9)
        FX.add(f, glow_tone(mtof(m('B4') if not warm else m('G#4')), 6.0, att=1.0, tau=2.6), 0.07, 0, rv=0.5, bg=0.6)
        if mk_('sub'): theme(mk_('sub'), warm, g=0.4, vel=42, octave=0)
    elif ty == 'line' and mk_('key') is not None:
        kt = mk_('key'); up = CH[chord_at(kt + 0.01)][1]
        if warm: FX.add(kt, glow_tone(mtof(up[-1] + 12), 4.0, att=0.5, tau=2.0), 0.05, 0.1, rv=0.5, bg=0.5)
        else: FX.add(kt, bell(mtof(up[-1] + 12), 3.5, 1.2), 0.03, -0.1, rv=0.5, bg=0.5)
    elif ty == 'list':
        if mk_('head') is not None: pno(CH[chord_at(mk_('head') + 0.01)][0] + 24, mk_('head'), 3 * BT, 40, 0.8)
        for j, at in enumerate(s['marks'].get('items', [])):
            ta = t0 + at; up = CH[chord_at(ta + 0.01)][1]
            k = up[j % len(up)] + 12 * (1 + j // len(up))
            pno(k, ta, 3 * BT, 46 + 2 * j, 0.95, -0.3 + 0.6 * j / max(1, len(s['items']) - 1))
            if warm: FX.add(ta + 0.05, glow_tone(mtof(k + 12), 3.0, att=0.3, tau=1.4), 0.03, 0, rv=0.4, bg=0.4)
            else: FX.add(ta, bell(mtof(k + 12), 2.5, 0.9), 0.018, 0, rv=0.4, bg=0.4)
    elif ty == 'contrast':
        tl_, tr_, tb_ = mk_('left'), mk_('right'), mk_('balance')
        if tl_: FX.add(tl_, bell(mtof(m('B5')), 3.5, 1.2), 0.03, -0.5, rv=0.5, bg=0.5); pno(m('E3'), tl_, 3 * BT, 40, 0.8, -0.4)
        if tr_: FX.add(tr_, glow_tone(mtof(m('G#4')), 4.0, att=0.4, tau=1.8), 0.06, 0.5, rv=0.5, bg=0.5); pno(m('B3'), tr_, 3 * BT, 42, 0.8, 0.4)
        if tb_: pchord(ms('E3', 'B3', 'E4', 'F#4'), tb_, 4 * BT, 42, 0.9)
    elif ty == 'number':
        c0, c1 = mk_('count'), mk_('land')
        if c0 is not None and c1 is not None:
            k = int(np.ceil(c0 / E8 - 1e-4))
            while k * E8 < c1 - 1e-4:
                tt = k * E8; FX.add(tt, tick(2800 + 300 * (k % 2), k % 4), 0.05 * (0.5 + 0.5 * (tt - c0) / max(0.1, c1 - c0)), 0.2 * np.sin(k), rv=0.2); k += 1
            FX.add(c1, thump(), 0.32, 0, rv=0.3, bg=0.3); pno(CH[chord_at(c1 + 0.01)][0], c1, 4 * BT, 50, 1.0)
# a soft low pedal under the cold stretches, joined across neighbouring cold scenes
merged = []
for a, b in PEDAL:
    if merged and abs(merged[-1][1] - a) < 1e-3: merged[-1][1] = b
    else: merged.append([a, b])
for a, b in merged:
    note(CBASS, m('E2'), a, b - a, 40, 0.20, 0, rv=0.3, env=[(0, 0), (1.2, 1), (b - a - 0.8, 1), (b - a, 0)])
# the room: a faint bed of air under everything (never digital silence while the picture runs)
FX.add(0, room(D + 1) * env_points(n_of(D + 1), [(0, 0), (1.5, 1), (D - 2, 1), (D, 0)])[:, None], 0.010)

# ================================================================ mix + master
print(f'  notes rendered ({len(sf2.cache)} unique) in {time.time() - T_RUN:.1f}s; mixing ...', flush=True)
mix = PNOB.render() * 1.0 + MUS.render() + FX.render()
mix = filt(mix, 'hp', 30, order=2)[:NOUT]
# loudness shaping: every scene is moved toward a level set by its mood and type (relative LUFS; the master then
# normalises the whole part to -16), within +-7 dB so the composed dynamics inside a scene survive.
TARGET = {'cold': -23.0, 'neutral': -20.5, 'warm': -18.5}
TYPE_ADJ = {'quote': 5.5, 'question': -3.5, 'chapter': -0.5, 'title': 1.0, 'end': 3.0, 'list': 0.5, 'number': 0.5, 'contrast': 0.5}
import pyloudnorm as pyln
_M = pyln.Meter(SR)
pts = []
for s_ in SC:
    a, b = n_of(s_['start']), min(len(mix), n_of(s_['end']))
    try: Ls = _M.integrated_loudness(mix[a:b])
    except Exception: Ls = -70
    if not np.isfinite(Ls): Ls = -70
    tgt = TARGET[s_['mood']] + TYPE_ADJ.get(s_['type'], 0.0)
    if s_['type'] == 'quote' and s_['mood'] == 'cold': tgt -= 1.5
    g = 10 ** (float(np.clip(tgt - Ls, -7, 7)) / 20)
    pts += [(s_['start'] + 0.25, g), (s_['end'] - 0.25, g)]
    print(f"  {s_['i']:2d} {s_['type']:9s} {s_['mood']:8s} {Ls:6.1f} -> {tgt:6.1f} LUFS")
mix *= env_points(len(mix), pts)[:, None]
last = SC[-1]
end_t = last['end'] if last['type'] != 'end' else last['end'] + 0.3
mix *= env_points(len(mix), [(0, 1), (min(end_t, D) - (3.0 if last['type'] == 'end' else 2.0), 1), (min(D - 0.1, end_t + 0.6), 0)])[:, None]
L0 = lufs(mix); mix *= 10 ** ((-16.0 - L0) / 20)
mix = limiter(mix, ceiling_db=-1.6)
for _ in range(4):
    L1 = lufs(mix)
    if abs(L1 + 16) < 0.05: break
    mix = limiter(mix * 10 ** ((-16 - L1) / 20), ceiling_db=-1.6)
out = os.path.join(PART, 'mix.wav')
sf.write(out, mix.astype(np.float32), SR, subtype='FLOAT')
print(f'  {os.path.relpath(out)}: {lufs(mix):.2f} LUFS, true peak {true_peak_db(mix):.2f} dBTP, {len(mix) / SR:.2f}s, built in {time.time() - T_RUN:.0f}s')
