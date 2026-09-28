"""Score for the silent (no narration) cut of 《博弈论：看局、解局、改局》 -> build/audio/music.wav + music_meta.json.
Run through music.py (it dispatches here when build/timeline.json has "mode": "silent").

Music is the lead now, but still quiet and thinking: pedalled felt piano phrases on a slow 66 BPM grid (rubato:
the grid restarts on every harmony change), warm pads, open / suspended harmony. Screen-text lines are reading
time, not speech, so the piano plays through them - but it stops moving wherever the picture asks the viewer to
think:
  question  read   -> light motion, a rising "question" cell
            pause  -> held breath: harmony freezes on a suspended chord, one sustained tone + a very soft pendulum
            reveal -> gentle resolution (rolled tonic, a celesta glint)
  line with pause:true -> "settle" on the tonic when its reading time ends, then stillness through the hold
  remember  -> cadence;  breath (episode end) -> the next episode's pivot chord, thin;  card -> same pivot, fuller
  sim_*     -> soft felt ostinato (sim_rps: randomised, like a mixed strategy);  chicken -> heartbeat, then held breath
  knowledge_tree -> warm, open, rising;  endcard -> full D add9, natural decay.

Tonal plan: e1 D (the "lens" voicing: one chord, four basses) -> e2 E minor -> e3 C -> e4 D minor -> e5 B-flat
-> e6 D (chromatic mediant from B-flat: "a new table") -> e7 D, final D add9.
Every time comes from build/timeline.json; nothing is timed in absolute seconds.
Instruments: GeneralUser GS v2.0.3 SoundFont (free for any use, models/sf2/LICENSE.txt) via tinysoundfont.
"""
import json
import os
import sys
import numpy as np
from common import *   # noqa
from scipy.ndimage import gaussian_filter1d

rng = np.random.default_rng(20260929)
tl = Timeline()
D = tl.duration
N = n_of(D)
NB = N + n_of(8.0)
if not ensure_sf2():
    sys.exit('SoundFont missing: ' + SF2_PATH)
sf2 = SF2()

PIANO, WPAD, STR, HALO, GLASS = (0, 0), (0, 89), (0, 49), (0, 94), (0, 92)
CELESTA, VIBES, HARP, NYLON = (0, 8), (0, 11), (0, 46), (0, 24)
SPARK = {'celesta': CELESTA, 'vibes': VIBES, 'harp': HARP, 'nylon': NYLON}
BPM = 66.0
Q = 60.0 / BPM
try:    # the hold after a pause:true line (seconds), from the script's pace; 3.5 s by default
    HOLD = float(json.load(open(os.path.join(ROOT, 'script', 'v2.json'))).get('pace', {}).get('pause', 3.5))
except Exception:
    HOLD = 3.5

# ----------------------------------------------------------------------------- harmony
PCN = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def nm(s):
    pc = PCN[s[0]]; i = 1
    while s[i] in '#b':
        pc += 1 if s[i] == '#' else -1; i += 1
    return pc + 12 * (int(s[i:]) + 1)


def ch(name, spec):
    lo, hi = spec.split('|')
    bass = [nm(x) for x in lo.split()]; pad = [nm(x) for x in hi.split()]
    return dict(name=name, bass=bass, pad=pad, pcs=sorted({k % 12 for k in bass + pad}), root=bass[0] % 12)


def scale(root, mode='major'):
    steps = {'major': [0, 2, 4, 5, 7, 9, 11], 'minor': [0, 2, 3, 5, 7, 8, 10]}[mode]
    r = PCN[root[0]] + (1 if '#' in root else -1 if 'b' in root[1:] else 0)
    return [(r + s) % 12 for s in steps]


LENS = [ch('Dadd9', 'D2 A2|D3 A3 E4 F#4'), ch('Bm11', 'B1 F#2|D3 A3 E4 F#4'),
        ch('G6/9maj7', 'G1 D2|D3 A3 E4 F#4'), ch('A6sus4', 'A1 E2|D3 A3 E4 F#4')]

# mood: pad=[(program, gain dB, octave)], pv pad velocity, cut pad low-pass, reg piano range, vel piano velocity,
# dens 0..1 phrase density, spark=(instrument, probability per phrase), gain section dB
PLAN = {
    'e1': dict(key='D', mode='major', prog=LENS,
               card=ch('Dsus2', 'D2 A2|E4 A4'), pre=ch('A9sus4', 'A1 E2|D3 G3 B3 E4'), cad=ch('Dadd9', 'D2 A2|F#3 D4 E4 A4'),
               mood=dict(pad=[(WPAD, 0, 0), (HALO, -9, 1)], pv=36, cut=1900, reg=(60, 83), vel=35, dens=0.45,
                         spark=('celesta', 0.25), gain=-0.5)),
    'e2': dict(key='E', mode='minor',
               prog=[ch('Em9', 'E2 B2|D3 G3 B3 F#4'), ch('Cmaj9', 'C2 G2|D3 G3 B3 E4'),
                     ch('Am9', 'A1 E2|G3 B3 C4 E4'), ch('Dadd9', 'D2 A2|D3 F#3 A3 E4')],
               card=ch('Cmaj7', 'C2 G2|E3 B3 G4'), pre=ch('B7sus4', 'B1 F#2|E3 A3 B3 F#4'), cad=ch('Em(add9)', 'E2 B2|G3 B3 F#4'),
               mood=dict(pad=[(WPAD, -1, 0), (STR, -5, 0)], pv=38, cut=1700, reg=(57, 79), vel=34, dens=0.5,
                         spark=None, gain=0.0)),
    'e3': dict(key='C', mode='major',
               prog=[ch('Cmaj9', 'C2 G2|E3 B3 D4 G4'), ch('Am11', 'A1 E2|G3 C4 D4 E4'),
                     ch('Fmaj7#11', 'F1 C2|A3 B3 E4'), ch('Em7', 'E2 B2|D3 G3 B3')],
               card=ch('Fmaj9', 'F2 C3|A3 E4 G4'), pre=ch('G9sus4', 'G1 D2|F3 A3 C4 D4'), cad=ch('Cadd9', 'C2 G2|E3 G3 D4'),
               mood=dict(pad=[(WPAD, -1, 0), (HALO, -7, 1)], pv=36, cut=2200, reg=(60, 84), vel=35, dens=0.5,
                         spark=('celesta', 0.3), gain=0.0)),
    'e4': dict(key='D', mode='minor',
               prog=[ch('Dm(add9)', 'D2 A2|F3 A3 E4'), ch('Bbmaj7#11', 'Bb1 F2|D3 A3 E4'),
                     ch('Fmaj9', 'F1 C2|A3 E4 G4'), ch('Gm9', 'G1 D2|Bb3 F4 A4')],
               card=ch('Bbmaj7#11', 'Bb1 F2|D3 A3 E4'), pre=ch('A7sus4b9', 'A1 E2|D3 G3 Bb3'), cad=ch('Dm(add9)', 'D2 A2|F3 A3 E4'),
               mood=dict(pad=[(STR, 0, 0), (WPAD, -4, 0), (GLASS, -9, 1)], pv=40, cut=1500, reg=(53, 76), vel=33,
                         dens=0.4, spark=('vibes', 0.2), gain=0.5)),
    'e5': dict(key='Bb', mode='major',
               prog=[ch('Bbmaj9', 'Bb1 F2|D3 A3 C4'), ch('Gm9', 'G1 D2|Bb3 F4 A4'),
                     ch('Ebmaj9', 'Eb2 Bb2|G3 D4 F4'), ch('Cm11', 'C2 G2|Eb3 Bb3 F4')],
               card=ch('Ebmaj9', 'Eb2 Bb2|G3 D4 F4'), pre=ch('F9sus4', 'F1 C2|Eb3 G3 Bb3'), cad=ch('Bbadd9', 'Bb1 F2|D3 F3 C4'),
               mood=dict(pad=[(STR, -1, 0), (WPAD, -2, 0)], pv=38, cut=2400, reg=(57, 80), vel=36, dens=0.55,
                         spark=('nylon', 0.35), gain=0.0)),
    'e6': dict(key='D', mode='major',
               prog=[ch('Dmaj9', 'D2 A2|F#3 E4 A4 C#5'), ch('Em11', 'E2 B2|D3 A3 G4 D5'),
                     ch('Gmaj9', 'G1 D2|B3 F#4 A4 D5'), ch('Bm9', 'B1 F#2|D3 A3 C#4 F#4')],
               card=ch('Dsus2', 'D2 A2|E4 A4 D5'), pre=ch('A13sus4', 'A1 E2|D3 G3 B3 F#4'), cad=ch('Dadd9', 'D2 A2|F#3 A3 E4 D5'),
               mood=dict(pad=[(STR, 0, 0), (HALO, -5, 1), (WPAD, -4, 0)], pv=40, cut=2800, reg=(62, 88), vel=36,
                         dens=0.55, spark=('celesta', 0.35), gain=0.5)),
    'e7': dict(key='D', mode='major', prog=LENS,
               card=ch('Gmaj9', 'G1 D2|B3 F#4 A4'), pre=ch('Gmaj9', 'G1 D2|B3 D4 F#4 A4'), cad=ch('Dadd9', 'D2 A2|F#3 D4 E4 A4'),
               final=ch('Dadd9', 'D1 D2 A2|D3 F#3 A3 E4 F#4 A4 D5'),
               tree=[ch('Gmaj9', 'G1 D2|B3 D4 F#4 A4'), ch('Dadd9/F#', 'F#2 D3|A3 D4 E4 A4'),
                     ch('Bm11', 'B1 F#2|D3 A3 E4 F#4'), ch('A6sus4', 'A1 E2|D3 A3 E4 F#4')],
               mood=dict(pad=[(STR, -1, 0), (WPAD, -2, 0), (HALO, -7, 1)], pv=38, cut=2600, reg=(57, 86), vel=34,
                         dens=0.45, spark=('harp', 0.3), gain=0.0)),
}
DEFAULT = PLAN['e1']
for p in PLAN.values(): p['scale'] = scale(p['key'], p['mode'])


def plan(cid): return PLAN.get(cid, DEFAULT)


ORDERS = [[0, 1, 2, 3], [0, 3, 1, 2], [0, 2, 1, 3], [0, 1, 3, 2]]


def cyc(prog, k):
    n = len(prog)
    return prog[ORDERS[(k // 4) % 4][k % 4]] if n == 4 else prog[k % n]


# ----------------------------------------------------------------------------- 1. harmonic slots
STILL = {'hold', 'breath', 'thin', 'final', 'settle'}        # no melodic motion (settle: after its first bar)


def build_slots():
    marks = []    # (t, kind, cid, beat)
    chs = tl.chapters
    for ci, c in enumerate(chs):
        if c.get('card'): marks.append((c['start'], 'card', c['id'], None))
        for b in tl.beats_of(c['id']):
            ty, t0, t1 = tl.btype(b), b['start'], b['end']
            if ty == 'breath': marks.append((t0, 'breath', c['id'], b)); continue
            if ty == 'endcard': marks.append((t0, 'final', c['id'], b)); continue
            if ty == 'remember': marks.append((t0, 'cad', c['id'], b))
            elif ty == 'question' and (b['visual'].get('phases') or {}).get('pause'):
                ph = b['visual']['phases']
                r1, p0, p1 = ph['read'][1], ph['pause'][0], ph['reveal'][0]
                marks.append((t0, 'qread', c['id'], b))
                if r1 > 7.5: marks.append((t0 + r1 / 2, 'qread', c['id'], b))
                marks.append((t0 + p0, 'hold', c['id'], b))
                marks.append((t0 + p1, 'reveal', c['id'], b))
                continue
            elif ty == 'knowledge_tree':
                k = 0; t = t0
                while t < t1 - 2.0:
                    marks.append((t, 'tree', c['id'], b)); t += max(2 * Q * 2, (t1 - t0) / 4); k += 1
                continue
            else:
                marks.append((t0, 'body', c['id'], b))
            ls = sorted(b['lines'], key=lambda l: l['start'])
            for j, l in enumerate(ls):
                if j and not (ty == 'chicken' and j == 1) and l['start'] - marks[-1][0] >= 3.0:
                    marks.append((l['start'], 'body' if ty != 'remember' else 'cadx', c['id'], b))
                if ty == 'chicken' and j == 1: marks.append((l['start'], 'thin', c['id'], b))
                if l.get('pause'):
                    ts = l['start'] + l['dur'] - HOLD
                    if ts - marks[-1][0] >= 1.5: marks.append((ts, 'settle', c['id'], b))
            # long stretches keep breathing: split slots longer than ~9 s
    marks.sort(key=lambda m: m[0])
    slots = []
    for i, (t, kind, cid, b) in enumerate(marks):
        t1 = marks[i + 1][0] if i + 1 < len(marks) else D
        if kind in ('body', 'qread') and t1 - t > 10.0:
            n = int(np.ceil((t1 - t) / 8.0))
            for j in range(n): slots.append(dict(t0=t + j * (t1 - t) / n, t1=t + (j + 1) * (t1 - t) / n, kind=kind, cid=cid, beat=b))
        else:
            slots.append(dict(t0=t, t1=t1, kind=kind, cid=cid, beat=b))
    # chords
    ids = [c['id'] for c in chs]
    k = {}
    tree_k = 0
    for i, s in enumerate(slots):
        P = plan(s['cid']); kind = s['kind']
        nxt = slots[i + 1]['kind'] if i + 1 < len(slots) else None
        if kind in ('breath',):
            j = ids.index(s['cid']) + 1
            s['chord'] = plan(ids[j])['card'] if j < len(ids) else P['cad']
        elif kind == 'card': s['chord'] = P['card']
        elif kind == 'final': s['chord'] = P.get('final') or P['cad']
        elif kind in ('cad', 'reveal', 'settle', 'cadx'): s['chord'] = P['cad']
        elif kind == 'hold': s['chord'] = P['pre']
        elif kind == 'tree':
            s['chord'] = P['pre'] if nxt == 'final' else (P['tree'][tree_k % 4] if P.get('tree') else cyc(P['prog'], tree_k)); tree_k += 1
        elif nxt in ('cad', 'final') and kind != 'thin': s['chord'] = P['pre']
        else:
            kk = k.get(s['cid'], 0)
            s['chord'] = cyc(P['prog'], kk); k[s['cid']] = kk + 1
        if kind == 'thin' and i: s['chord'] = slots[i - 1]['chord']
    for i, s in enumerate(slots):       # no chord twice in a row inside the running body
        if s['kind'] not in ('body', 'qread'): continue
        nb = {slots[j]['chord']['name'] for j in (i - 1, i + 1) if 0 <= j < len(slots)}
        if s['chord']['name'] in nb:
            alt = [c for c in plan(s['cid'])['prog'] if c['name'] not in nb]
            if alt: s['chord'] = alt[int(rng.integers(0, len(alt)))]
    # merge consecutive identical chords of the same still/cadence kind (e.g. remember cad + its settle)
    out = []
    for s in slots:
        if out and s['chord']['name'] == out[-1]['chord']['name'] and s['kind'] in ('settle', 'cadx') and out[-1]['kind'] in ('cad', 'cadx', 'reveal', 'settle'):
            out[-1]['t1'] = s['t1']; out[-1].setdefault('settle_at', s['t0']); continue
        out.append(s)
    out[0]['t0'] = 0.0
    for a, b in zip(out[:-1], out[1:]): a['t1'] = b['t0']
    out[-1]['t1'] = D
    return out


SLOTS = build_slots()
CH = [s['t0'] for s in SLOTS]


def slot_at(t):
    i = int(np.searchsorted(CH, t, side='right')) - 1
    return SLOTS[max(0, min(i, len(SLOTS) - 1))]


def pool(chd, lo, hi): return [k for k in range(lo, hi + 1) if k % 12 in chd['pcs']]


# stillness windows: question pause, the hold after a key line, breath cards, the chicken's held breath, the end
still = []
for s in SLOTS:
    if s['kind'] in ('hold', 'breath', 'thin', 'final'): still.append((s['t0'], s['t1']))
    if s['kind'] == 'settle': still.append((s['t0'] + 1.6 * Q, s['t1']))
    if 'settle_at' in s: still.append((s['settle_at'] + 1.6 * Q, s['t1']))


def is_still(t): return any(a - 0.05 <= t < b for a, b in still)


# ----------------------------------------------------------------------------- 2. note events
piano_ev, pulse_ev, spark_ev, pad_ev, hb_ev = [], [], [], [], []
last = [66]


def hv(v, sd=3): return int(np.clip(round(v + rng.normal(0, sd)), 12, 100))


def add_piano(t, key, vel, g=0.0, kind='mel', bus=None):
    (bus if bus is not None else piano_ev).append(dict(t=t + float(rng.normal(0, 0.006)), key=int(key), vel=hv(vel), g=g, kind=kind))


def walk(chd, reg, prev, shape):
    P = np.array(pool(chd, *reg) or [prev])
    cand = {'up': P[(P > prev) & (P <= prev + 7)], 'down': P[(P < prev) & (P >= prev - 7)]}.get(shape, P[(np.abs(P - prev) <= 5) & (P != prev)])
    if len(cand) == 0: cand = P[np.argsort(np.abs(P - prev))[:3]]
    w = 1.0 / (1 + np.abs(cand - prev))
    return int(rng.choice(cand, p=w / w.sum()))


def spark(t, inst, g=0.0):
    s = slot_at(t); prog = SPARK[inst]
    if inst in ('harp', 'nylon'):
        P = pool(s['chord'], 55, 79); st = int(rng.integers(0, max(1, len(P) - 4)))
        dt = float(rng.uniform(0.13, 0.2))
        for i, k in enumerate(P[st:st + int(rng.integers(3, 5))]):
            spark_ev.append(dict(t=t + i * dt, key=k, vel=hv(34 - 2 * i), prog=prog, pan=-0.3 + 0.2 * i, g=g))
    else:
        lo, hi = (72, 91) if inst == 'celesta' else (65, 84)
        P = pool(s['chord'], lo, hi) or [79]
        spark_ev.append(dict(t=t, key=int(rng.choice(P)), vel=hv(30), prog=prog, pan=float(rng.uniform(-0.5, 0.5)), g=g))


def phrase(t, t_end, shape, vel, g, nmax):
    """a short melodic cell on the 66 BPM grid; returns the time after it"""
    n = int(rng.integers(2, nmax + 1))
    for i in range(n):
        if t > t_end - 0.25 or is_still(t): break
        s = slot_at(t); m = plan(s['cid'])['mood']; reg = m['reg']
        prev = int(np.clip(last[0], reg[0] + 3, reg[1] - 3))
        sh = shape if shape != 'arch' else ('up' if i < n / 2 else 'down')
        k = walk(s['chord'], reg, prev, sh)
        arch = 2.0 * np.sin(np.pi * (i + 0.5) / n)
        add_piano(t, k, vel + arch - (2 if i == n - 1 else 0), g)
        last[0] = k
        t += Q * float(rng.choice([0.5, 1.0, 1.0, 1.5, 2.0], p=[0.2, 0.35, 0.15, 0.15, 0.15]))
    return t


# 2a. chord strikes at every harmony change
for s in SLOTS:
    m = plan(s['cid'])['mood']; chd = s['chord']; t0 = s['t0']; v = m['vel']; kind = s['kind']
    if kind == 'thin': continue
    if kind == 'final':
        keys = chd['bass'][:2] + [k for k in chd['pad'] if k >= 54]
        for i, k in enumerate(keys): piano_ev.append(dict(t=t0 + 0.08 * i, key=k, vel=hv(32 - 0.6 * i, 1), g=-5.0, kind='final'))
        spark_ev.append(dict(t=t0 + 1.2, key=86, vel=26, prog=CELESTA, pan=0.2, g=-4.0))
        continue
    if kind == 'hold':
        continue
    if kind == 'breath':
        add_piano(t0 + 0.1, max(chd['pad']), v - 4, g=-6.0); continue
    bg = {'card': -6.0, 'cad': -2.0, 'reveal': -1.0, 'settle': -4.0, 'tree': -2.0}.get(kind, -1.5)
    add_piano(t0, chd['bass'][0] + (12 if chd['bass'][0] < 31 else 0), v - 2, g=bg, kind='bass')
    if kind in ('cad', 'reveal', 'settle', 'cadx'):
        up = sorted(chd['pad'])[-(4 if kind == 'reveal' else 3):]
        for i, k in enumerate(up): add_piano(t0 + 0.09 * (i + 1), k, v - 1 - i, g=-4.0 - i - (2 if kind == 'settle' else 0), kind='chord')
        last[0] = up[-1]
        if kind == 'reveal':
            spark_ev.append(dict(t=t0 + 0.45, key=(pool(chd, 79, 91) or [86])[-1], vel=28, prog=CELESTA, pan=0.25, g=-5.0))
    if 'settle_at' in s:     # a key line inside a remember card: an "answer" note landing on the root
        ts = s['settle_at']; root = [k for k in pool(chd, 62, 76) if k % 12 == chd['root']]
        if root: add_piano(ts, root[0], v - 3, g=-4.0)

# 2b. melody: phrases on the grid, restarted at each harmony change; quiet, with real rests
for s in SLOTS:
    kind = s['kind']
    if kind in ('hold', 'breath', 'thin', 'final'): continue
    m = plan(s['cid'])['mood']
    t = s['t0'] + Q * (1.0 if kind in ('body', 'qread', 'tree') else 2.0)
    shape = {'card': 'up', 'qread': 'up', 'reveal': 'down', 'cad': 'down', 'settle': 'down', 'tree': 'arch'}.get(kind, 'walk')
    dens = m['dens'] + (0.25 if kind == 'tree' else 0) - (0.2 if kind in ('card', 'cad', 'reveal') else 0)
    first = True
    while t < s['t1'] - 0.4:
        if is_still(t): break
        nmax = 3 + int(dens * 3)
        t = phrase(t, s['t1'], shape if first else ('arch' if kind == 'tree' else 'walk'),
                   m['vel'] - (2 if kind in ('card', 'qread') else 0), -2.0 if kind == 'card' else 0.0, nmax)
        if m['spark'] and rng.random() < m['spark'][1] + (0.3 if kind == 'tree' else 0) and not is_still(t):
            spark(t + Q * 0.5, m['spark'][0], g=-2.0)
        first = False
        t += Q * float(rng.choice([2, 3, 4])) * (1.6 - dens)

# 2c. question pause: a very soft pendulum on two tones of the suspended chord
for s in SLOTS:
    if s['kind'] != 'hold': continue
    P = pool(s['chord'], 64, 79)
    top = max(s['chord']['pad'])
    a = [k for k in P if k != top and abs(k - top) <= 7] or P[:1]
    pair = [top, a[-1]] if a else [top, top - 5]
    t = s['t0'] + Q; i = 0
    while t < s['t1'] - 0.5:
        add_piano(t, pair[i % 2], 24, g=-3.0, kind='pend', bus=pulse_ev)
        t += 2 * Q; i += 1

# 2d. simulations: soft felt ostinato (steady 1-5-9-5; sim_rps randomised); chicken heartbeat


def ostinato(chd):
    r = 48 + (chd['root'] - 48) % 12
    if r < 47: r += 12
    pcs = chd['pcs']
    fifth = r + 7 if (r + 7) % 12 in pcs else (r + 5 if (r + 5) % 12 in pcs else r + 12)
    top = next((r + d for d in (14, 15, 16, 12) if (r + d) % 12 in pcs), r + 12)
    return [r, fifth, top, fifth]


for b in tl.beats:
    ty = tl.btype(b)
    if not ty.startswith('sim_'): continue
    t, t1 = b['start'] + 0.2, b['end'] - 0.3; i = 0
    while t < t1:
        if not is_still(t):
            s = slot_at(t); frac = (t - b['start']) / max(1, b['end'] - b['start'])
            v = 24 + 6 * frac
            if ty == 'sim_rps':
                pp = pool(s['chord'], 50, 67)
                if pp and rng.random() > 0.3: add_piano(t, int(rng.choice(pp)), v - float(rng.uniform(0, 4)), bus=pulse_ev)
            else:
                add_piano(t, ostinato(s['chord'])[i % 4], v - (3 if i % 2 else 0), bus=pulse_ev)
        t += Q if ty != 'sim_rps' else Q * float(rng.choice([0.5, 1.0, 1.0]))
        i += 1

for b in tl.beats:
    if tl.btype(b) != 'chicken' or not b['lines']: continue
    ls = sorted(b['lines'], key=lambda l: l['start'])
    t, tb = b['start'] + 0.2, (ls[1]['start'] - 0.35) if len(ls) > 1 else b['end']
    root = slot_at(t)['chord']['bass'][0]; root = root + 12 if root < 26 else root
    while t < tb - 0.3:
        v = 38 + 8 * (t - b['start']) / max(1, tb - b['start'])
        hb_ev.append((t, root, v / 46.0)); hb_ev.append((t + 0.28, root, (v - 12) / 46.0))
        t += 60 / 50.0

# 2e. pads (ties across slots when a pitch continues); the texture builds inside each episode
stage, prev_cid = 0, None
for s in SLOTS:
    m = plan(s['cid'])['mood']; chd = s['chord']; kind = s['kind']
    if s['cid'] != prev_cid: stage, prev_cid = 0, s['cid']
    if kind not in ('card', 'breath'): stage += 1
    t_on, t_off = s['t0'] - 0.35, s['t1'] + 0.25
    if kind == 'final': t_off = D - 3.2
    full = stage >= 2 or kind in ('cad', 'reveal', 'final', 'tree', 'settle', 'cadx') or s['cid'] == tl.chapters[0]['id']
    if kind == 'hold':      # held breath: one sustained tone (the chord's top) + the softest string pedal on the bass
        pad_ev.append(dict(t=t_on, off=t_off, key=max(chd['pad']), vel=m['pv'], prog=WPAD, g=-4.0, pan=0.1, layer=0))
        bk = chd['bass'][0]; bk = bk + 12 if bk < 34 else bk
        pad_ev.append(dict(t=t_on, off=t_off, key=bk, vel=m['pv'] - 4, prog=STR, g=-10.0, pan=-0.1, layer=9))
        continue
    for li, (prog, gdb, octv) in enumerate(m['pad']):
        if li > 0 and (not full or kind in ('card', 'breath')): continue
        keys = sorted(chd['pad'])
        if kind in ('thin', 'breath'): keys = keys[-2:]
        elif kind == 'card': keys = keys[-3:]
        keys = [k + 12 * octv for k in keys]
        if octv: keys = keys[-2:]
        gain = gdb - {'card': 5, 'thin': 4, 'breath': 6, 'final': 3}.get(kind, 0) - (0 if full else 1.5) + (1.0 if kind == 'tree' else 0)
        for i, k in enumerate(keys):
            pan = (i / max(1, len(keys) - 1) - 0.5) * 0.7 * (-1 if li % 2 else 1)
            pad_ev.append(dict(t=t_on, off=t_off, key=k, vel=m['pv'], prog=prog, g=gain, pan=pan, layer=li))
    if full and kind not in ('thin', 'card', 'breath'):
        bk = chd['bass'][0]; bk = bk + 12 if bk < 34 else bk
        pad_ev.append(dict(t=t_on, off=t_off, key=bk, vel=m['pv'] - 2, prog=STR, g=-5, pan=-0.1, layer=9))


def tie(evs):
    evs = sorted(evs, key=lambda e: (e['prog'], e['layer'], e['key'], e['t']))
    out = []
    for e in evs:
        p = out[-1] if out else None
        if p and (p['prog'], p['layer'], p['key']) == (e['prog'], e['layer'], e['key']) and e['t'] <= p['off'] + 0.05 \
                and abs(p['g'] - e['g']) < 0.5:
            p['off'] = max(p['off'], e['off'])
        else:
            out.append(dict(e))
    return out


pad_ev = tie(pad_ev)


def pedal(evs, cap=9.0, damp=0.18):
    evs.sort(key=lambda e: e['t'])
    for i, e in enumerate(evs):
        off = e['t'] + cap
        for s in SLOTS:
            if s['t0'] > e['t'] + 0.05 and e['key'] % 12 not in s['chord']['pcs']:
                off = min(off, s['t0'] + damp); break
        for f in evs[i + 1:]:
            if f['t'] > off: break
            if f['key'] == e['key']: off = min(off, f['t'] + 0.01); break
        if e.get('kind') == 'final': off = D - 1.2
        e['off'] = max(e['t'] + 0.25, min(off, D - 0.3))
    return evs


piano_ev = pedal([e for e in piano_ev if e['t'] < D - 0.5])
for e in pulse_ev: e['off'] = e['t'] + (1.2 if e.get('kind') == 'pend' else 0.42)


# ----------------------------------------------------------------------------- 3. render
class Bus:
    def __init__(self, rt60, send, bright=0.45, width=0.8, seed=1, predelay=0.02):
        self.x = np.zeros((NB, 2), dtype=np.float32)
        self.ir = make_ir(rt60, bright=bright, width=width, seed=seed, predelay=predelay)
        self.send = send

    def add(self, t, y, gain=1.0, pan=0.0): place(self.x, t, y, gain, pan)

    def render(self, pre=None):
        d = self.x.astype(np.float64)
        if pre: d = pre(d)
        return d + self.send * convolve(d, self.ir)


def note(prog, key, vel, gate, tail=3.5):
    y = sf2.note(prog[0], prog[1], key, vel, max(0.05, gate), tail)
    sf2.cache.clear()
    return y


def felt(x, fc):
    x = filt(x, 'lp', fc, q=0.6, order=2)
    x = filt(x, 'peak', 260, q=0.9, gain_db=-2.0)
    return filt(x, 'hs', 6000, gain_db=-4)


def thump(f, lv):
    n = n_of(0.9); t = np.arange(n) / SR
    ph = 2 * np.pi * np.cumsum(f * (1 + 0.35 * np.exp(-t / 0.025))) / SR
    e = (1 - np.exp(-t / 0.008)) * np.exp(-t / 0.17)
    return to_stereo((np.sin(ph) + 0.28 * np.sin(2 * ph) + 0.08 * np.sin(3 * ph)) * e * 0.05 * lv)


def pan_of(k): return float(np.clip((k - 64) / 30.0, -0.45, 0.45))


out = np.zeros((NB, 2))
stems = {}
bus = Bus(3.4, 0.55, bright=0.4, width=0.9, seed=11, predelay=0.025)
for e in piano_ev:
    bus.add(e['t'], note(PIANO, e['key'], e['vel'], e['off'] - e['t'], tail=3.0), 10 ** (e.get('g', 0.0) / 20), pan_of(e['key']))
stems['piano'] = bus.render(lambda d: felt(d, 3200)); del bus

bus = Bus(2.6, 0.45, bright=0.3, seed=12)
for e in pulse_ev:
    bus.add(e['t'], note(PIANO, e['key'], e['vel'], e['off'] - e['t'], tail=2.0), 10 ** (e.get('g', 0.0) / 20),
            0.2 * (1 if e['key'] % 2 else -1) if e.get('kind') == 'pend' else -0.15)
for t, k, lv in hb_ev: bus.add(t, thump(mtof(k), lv), 1.0, 0.0)
stems['pulse'] = bus.render(lambda d: felt(d, 1500)) if (pulse_ev or hb_ev) else bus.x.astype(np.float64); del bus

bus = Bus(3.8, 0.7, bright=0.5, width=1.0, seed=13, predelay=0.035)
for e in spark_ev:
    if e['t'] >= D - 1: continue
    bus.add(e['t'], note(e['prog'], e['key'], e['vel'], 1.5 if e['prog'] in (HARP, NYLON) else 0.8, tail=4.0),
            10 ** (e.get('g', 0.0) / 20), e['pan'])
stems['spark'] = bus.render(lambda d: filt(d, 'lp', 7000, order=1)); del bus

bus = Bus(4.5, 0.45, bright=0.35, width=1.0, seed=14, predelay=0.03)
for e in pad_ev:
    bus.add(e['t'], note(e['prog'], e['key'], e['vel'], e['off'] - e['t'], tail=5.0), 10 ** (e['g'] / 20), e['pan'])
tt = np.arange(NB) / SR
pts = []
for c in tl.chapters:
    lc = np.log(plan(c['id'])['mood']['cut']); pts += [(c['start'] - 1.5, lc), (c['start'] + 2.5, lc)]
cut = np.exp(env_points(NB, sorted(pts))) * (1 + 0.22 * np.sin(2 * np.pi * tt / 41.0 + 0.7)) * (1 + 0.10 * np.sin(2 * np.pi * tt / 13.7))
del tt
stems['pad'] = bus.render(lambda d: filt(sweep(d, 'lp', cut, q=0.6, block=256), 'hp', 45, order=1)); del bus, cut

nz = filt(filt(np.random.default_rng(7).standard_normal((NB, 2)), 'lp', 2500, order=1), 'hp', 250, order=1)
k = np.random.default_rng(8).standard_normal(NB // SR + 3)
stems['hiss'] = nz * np.interp(np.arange(NB) / SR, np.arange(len(k)), 0.75 + 0.25 * np.tanh(gaussian_filter1d(k, 4) * 3))[:, None]
del nz

# ----------------------------------------------------------------------------- 4. balance, section gains, automation
REL = {'piano': 0.0, 'pad': -4.0, 'pulse': -7.0, 'spark': -6.0, 'hiss': -44.0}
ref = lufs(stems['piano'][:N])
save = os.environ.get('STEMS') == '1'
for k, x in stems.items():
    L = lufs(x[:N])
    if not np.isfinite(L): stems[k] = None; continue
    g = 10 ** ((ref + REL[k] - L) / 20)
    print(f'  stem {k:6s} {L:6.1f} LUFS -> {L + db(g):6.1f}')
    out += x * g
    if save: write(f'{OUT}/stems/{k}.wav', (x * g)[:N] * 0.5)
    stems[k] = None

pp, prev = [], 10 ** (plan(tl.chapters[0]['id'])['mood']['gain'] / 20)
for c in tl.chapters:
    g = 10 ** (plan(c['id'])['mood']['gain'] / 20)
    pp += [(max(0.0, c['start'] - 1.0), prev), (c['start'] + 2.0, g)]; prev = g
out *= env_points(NB, pp)[:, None]
out = out[:N]
# held-breath / breath moments sit clearly under the running level; the end card slightly above it
Lb = lufs(out)
auto = [(0.0, 0.0)]
for s in SLOTS:
    rel = {'hold': -6.0, 'breath': -4.0, 'thin': -5.0, 'final': -1.0}.get(s['kind'])
    if rel is None: continue
    a, b = s['t0'], min(s['t1'], D)
    Lw = lufs(out[n_of(a):n_of(b)]) if b - a > 0.5 else Lb
    if not np.isfinite(Lw): continue
    gdb = float(np.clip(Lb + rel - Lw, -8.0, 1.5))
    auto += [(a - 0.5, 0.0), (a + 0.3, gdb), (b - 0.2, gdb), (b + 0.4, 0.0)]
auto.sort()
out *= (10 ** (env_points(N, auto) / 20))[:, None]
out = fade(out, 0.3, 2.5)
out *= 10 ** (-3.0 / 20) / max(np.abs(out).max(), 1e-9)
write(f'{OUT}/music.wav', out)

meta = dict(
    mode='silent', bpm=BPM,
    chapters={c['id']: dict(key=plan(c['id'])['key'], mode=plan(c['id'])['mode'], scale=plan(c['id'])['scale']) for c in tl.chapters},
    chords=[dict(t0=round(s['t0'], 3), t1=round(s['t1'], 3), chapter=s['cid'], kind=s['kind'], name=s['chord']['name'],
                 pcs=s['chord']['pcs'], root=s['chord']['root'], scale=plan(s['cid'])['scale']) for s in SLOTS],
    still=[[round(a, 3), round(b, 3)] for a, b in still], no_duck=[], edits=[],
    notes=[dict(t=round(e['t'], 3), key=e['key'], vel=e['vel'], g=round(e.get('g', 0.0), 1), bus=bn)
           for bn, evs in (('piano', piano_ev), ('pulse', pulse_ev), ('spark', spark_ev)) for e in evs])
json.dump(meta, open(f'{OUT}/music_meta.json', 'w'), indent=1, ensure_ascii=False)
print(f'slots {len(SLOTS)}, piano notes {len(piano_ev)}, pulse {len(pulse_ev)}, spark {len(spark_ev)}, pad {len(pad_ev)}')
print(f'piano notes inside stillness windows: {sum(1 for e in piano_ev if is_still(e["t"] - 0.2) and e.get("kind") not in ("final",))}')
for c in tl.chapters:
    ss = [s for s in SLOTS if s['cid'] == c['id']]
    print(f"  {c['id']} {plan(c['id'])['key']:>2} {plan(c['id'])['mode']:5s}: " +
          ' '.join(f"{s['chord']['name']}{'' if s['kind'] in ('body', 'qread') else '[' + s['kind'] + ']'}" for s in ss))
