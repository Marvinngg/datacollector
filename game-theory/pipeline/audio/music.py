"""Score for 《博弈论：看局、解局、改局》 -> build/audio/music.wav (48 kHz stereo float) + music_meta.json.

Quiet, "thinking" underscore: pedalled low-velocity felt piano over warm pads, open/suspended harmony
(add9 / sus / maj7 / quartal), a gentle cadence on every "remember" card, a thinner "breath" with a new
harmonic colour on every chapter card, and a full final chord on the end card.

Tonal plan (one key area per chapter, pivoting on the chapter cards):
  c0 D  -> c1 D -> c2 G -> c3 E minor (soft pulse) -> c4 C (irregular pulse) -> c5 D minor (tension)
  -> c6 F -> c7 B-flat -> c8 D (chromatic-mediant "new table") -> c9 D (c0's "lens" voicing returns) -> D add9.

Nothing is timed in absolute seconds: every event is derived from build/timeline.json at run time
(chapters, chapter cards, beats + visual.type, voice lines).  Piano phrases go into the gaps between
voice lines; under a line only a rare single note sounds.

Instruments: GeneralUser GS v2.0.3 SoundFont (S. Christian Collins; free for any use, see models/sf2/LICENSE.txt),
rendered offline with tinysoundfont; the tape-hiss texture is synthesised here.
"""
import json
import sys
import numpy as np
from common import *   # noqa

rng = np.random.default_rng(20260928)
tl = Timeline()
D = tl.duration
N = n_of(D)
PAD_S = 8.0
NB = N + n_of(PAD_S)
if not ensure_sf2():
    sys.exit('SoundFont missing: ' + SF2_PATH)
sf2 = SF2()

PIANO, WPAD, STR, HALO, GLASS = (0, 0), (0, 89), (0, 49), (0, 94), (0, 92)
CELESTA, VIBES, HARP, NYLON = (0, 8), (0, 11), (0, 46), (0, 24)
SPARK = {'celesta': CELESTA, 'vibes': VIBES, 'harp': HARP, 'nylon': NYLON}
BPM = 66.0
Q = 60.0 / BPM

# ----------------------------------------------------------------------------- harmony
PCN = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def nm(s):
    """'F#3' / 'Bb1' -> MIDI"""
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
        ch('G6/9maj7', 'G1 D2|D3 A3 E4 F#4'), ch('A6sus4', 'A1 E2|D3 A3 E4 F#4')]   # one voicing, four basses

# mood keys: pad=[(program, gain dB, octave)], pv=pad velocity, cut=pad low-pass Hz, reg=piano melodic range,
# vel=piano velocity, gap=prob. of a note in a short gap, inl=notes/s under a voice line, spark=(inst, prob),
# pulse=None|'steady'|'mixed', gain=section gain dB
PLAN = {
    'c0': dict(key='D', mode='major', prog=LENS, card=None, pre=None, cad=None,
               mood=dict(pad=[(WPAD, -2, 0)], pv=34, cut=1700, reg=(62, 81), vel=34, gap=0.8, inl=0.12,
                         spark=('celesta', 0.6), pulse=None, gain=-1.0)),
    'c1': dict(key='D', mode='major',
               prog=[ch('Dmaj9', 'D2 A2|F#3 C#4 E4 A4'), ch('Bm9', 'B1 F#2|D3 A3 C#4 F#4'),
                     ch('Gmaj9', 'G1 D2|B3 D4 F#4 A4'), ch('Em11', 'E2 B2|D3 G3 A3 F#4')],
               card=ch('Gmaj9', 'G1 D2|B3 F#4 A4'), pre=ch('A9sus4', 'A1 E2|D3 G3 B3 E4'),
               cad=ch('Dadd9', 'D2 A2|F#3 D4 E4 A4'),
               mood=dict(pad=[(WPAD, 0, 0)], pv=38, cut=2000, reg=(59, 81), vel=36, gap=0.75, inl=0.14,
                         spark=('celesta', 0.35), pulse=None, gain=0.0)),
    'c2': dict(key='G', mode='major',
               prog=[ch('Gmaj9', 'G1 D2|D3 A3 B3 F#4'), ch('Em9', 'E2 B2|D3 G3 B3 F#4'),
                     ch('Cmaj9', 'C2 G2|E3 B3 D4 G4'), ch('D9sus4', 'D2 A2|G3 C4 E4 A4')],
               card=ch('Cmaj7#11', 'C2 G2|E3 B3 F#4'), pre=ch('D9sus4', 'D2 A2|G3 C4 E4 A4'),
               cad=ch('Gadd9', 'G1 D2|D3 G3 B3 A4'),
               mood=dict(pad=[(WPAD, 0, 0), (HALO, -9, 1)], pv=38, cut=2200, reg=(60, 83), vel=36, gap=0.8,
                         inl=0.16, spark=('harp', 0.4), pulse=None, gain=0.0)),
    'c3': dict(key='E', mode='minor',
               prog=[ch('Em9', 'E2 B2|D3 G3 B3 F#4'), ch('Cmaj9', 'C2 G2|D3 G3 B3 E4'),
                     ch('Am9', 'A1 E2|G3 B3 C4 E4'), ch('Dadd9', 'D2 A2|D3 F#3 A3 E4')],
               card=ch('Cmaj7', 'C2 G2|E3 B3'), pre=ch('B7sus4', 'B1 F#2|E3 A3 B3 F#4'),
               cad=ch('Em(add9)', 'E2 B2|G3 B3 F#4'),
               mood=dict(pad=[(WPAD, -1, 0), (STR, -5, 0)], pv=38, cut=1600, reg=(57, 78), vel=34, gap=0.6,
                         inl=0.08, spark=None, pulse='steady', gain=0.5)),
    'c4': dict(key='C', mode='major',
               prog=[ch('Cmaj9', 'C2 G2|E3 B3 D4 G4'), ch('Am11', 'A1 E2|G3 C4 D4 E4'),
                     ch('Fmaj7#11', 'F1 C2|A3 B3 E4'), ch('G9sus4', 'G1 D2|F3 A3 C4 D4')],
               card=ch('Fmaj9', 'F2 C3|A3 E4 G4'), pre=ch('G9sus4', 'G1 D2|F3 A3 C4 D4'),
               cad=ch('Cadd9', 'C2 G2|E3 G3 D4'),
               mood=dict(pad=[(WPAD, -1, 0), (HALO, -7, 1)], pv=36, cut=2200, reg=(60, 84), vel=35, gap=0.7,
                         inl=0.10, spark=('celesta', 0.45), pulse='mixed', gain=0.5)),
    'c5': dict(key='D', mode='minor',
               prog=[ch('Dm(add9)', 'D2 A2|F3 A3 E4'), ch('Bbmaj7#11', 'Bb1 F2|D3 A3 E4'),
                     ch('Gm9', 'G1 D2|Bb3 F4 A4'), ch('A7sus4b9', 'A1 E2|D3 G3 Bb3')],
               card=ch('Bbmaj7#11', 'Bb1 F2|D3 A3 E4'), pre=ch('A7sus4b9', 'A1 E2|D3 G3 Bb3'),
               cad=ch('Dm(add9)', 'D2 A2|F3 A3 E4'),
               mood=dict(pad=[(STR, 0, 0), (WPAD, -4, 0), (GLASS, -8, 1)], pv=40, cut=1400, reg=(52, 74),
                         vel=33, gap=0.55, inl=0.07, spark=None, pulse=None, gain=1.0)),
    'c6': dict(key='F', mode='major',
               prog=[ch('Fmaj9', 'F1 C2|A3 E4 G4'), ch('Dm9', 'D2 A2|F3 C4 E4'),
                     ch('Bbmaj9', 'Bb1 F2|D3 A3 C4'), ch('C9sus4', 'C2 G2|Bb3 D4 F4')],
               card=ch('Bbmaj9', 'Bb1 F2|D3 A3 C4'), pre=ch('C9sus4', 'C2 G2|Bb3 D4 F4'),
               cad=ch('Fadd9', 'F1 C2|A3 C4 G4'),
               mood=dict(pad=[(WPAD, 0, 0), (STR, -4, 0)], pv=38, cut=2400, reg=(57, 79), vel=36, gap=0.75,
                         inl=0.15, spark=('vibes', 0.35), pulse=None, gain=0.0)),
    'c7': dict(key='Bb', mode='major',
               prog=[ch('Bbmaj9', 'Bb1 F2|D3 A3 C4'), ch('Gm9', 'G1 D2|Bb3 F4 A4'),
                     ch('Ebmaj9', 'Eb2 Bb2|G3 D4 F4'), ch('F9sus4', 'F1 C2|Eb3 G3 Bb3')],
               card=ch('Ebmaj9', 'Eb2 Bb2|G3 D4 F4'), pre=ch('F9sus4', 'F1 C2|Eb3 G3 Bb3'),
               cad=ch('Bbadd9', 'Bb1 F2|D3 F3 C4'),
               mood=dict(pad=[(STR, -1, 0), (WPAD, -2, 0)], pv=38, cut=2400, reg=(57, 79), vel=36, gap=0.75,
                         inl=0.13, spark=('nylon', 0.6), pulse=None, gain=0.0)),
    'c8': dict(key='D', mode='major',
               prog=[ch('Dmaj9', 'D2 A2|F#3 E4 A4 C#5'), ch('Em11', 'E2 B2|D3 A3 G4 D5'),
                     ch('Gmaj9', 'G1 D2|B3 F#4 A4 D5'), ch('A13sus4', 'A1 E2|D3 G3 B3 F#4')],
               card=ch('Dsus2', 'D2 A2|E4 A4'), pre=ch('A13sus4', 'A1 E2|D3 G3 B3 F#4'),
               cad=ch('Dadd9', 'D2 A2|F#3 A3 E4 D5'),
               mood=dict(pad=[(STR, 0, 0), (HALO, -5, 1), (WPAD, -4, 0)], pv=40, cut=3000, reg=(62, 88), vel=36,
                         gap=0.8, inl=0.13, spark=('celesta', 0.45), pulse=None, gain=1.0)),
    'c9': dict(key='D', mode='major', prog=LENS,
               card=ch('Gmaj9', 'G1 D2|B3 F#4 A4'), pre=ch('Gmaj9', 'G1 D2|B3 D4 F#4 A4'),
               cad=ch('Dadd9', 'D2 A2|F#3 D4 E4 A4'),
               final=ch('Dadd9', 'D1 D2 A2|D3 F#3 A3 E4 F#4 A4 D5'),
               mood=dict(pad=[(STR, -1, 0), (WPAD, -2, 0), (HALO, -8, 1)], pv=36, cut=2400, reg=(57, 84), vel=34,
                         gap=0.7, inl=0.09, spark=('harp', 0.35), pulse=None, gain=0.0)),
}
DEFAULT = PLAN['c1']
for k, p in PLAN.items():
    p['scale'] = scale(p['key'], p['mode'])


def plan(cid): return PLAN.get(cid, DEFAULT)


# ----------------------------------------------------------------------------- 1. harmonic slots
ORDERS = [[0, 1, 2, 3], [0, 3, 1, 2], [0, 2, 1, 3], [0, 1, 3, 2]]


def cyc(prog, k):
    """k-th chord of the chapter: the 4-chord cycle is re-ordered on each pass so it never loops verbatim"""
    n = len(prog)
    if n != 4: return prog[k % n]
    return prog[ORDERS[(k // 4) % len(ORDERS)][k % 4]]


def build_slots():
    """[(t0, t1, chord, kind, chapter id, beat)] covering [0, D]"""
    slots = []
    beats_all = tl.beats
    final_beat = next((b for b in beats_all if tl.btype(b) == 'endcard'), None)
    for ci, c in enumerate(tl.chapters):
        P = plan(c['id'])
        bs = tl.beats_of(c['id'])
        if c.get('card') and P['card']:
            slots.append(dict(t0=c['start'], t1=c['card'][1], chord=P['card'], kind='card', cid=c['id'], beat=None))
        body = []   # (t0, beat, kind)
        for b in bs:
            ty = tl.btype(b)
            if ty == 'endcard':
                body.append((b['start'], b, 'final')); continue
            if ty == 'remember' and P['cad']:
                body.append((b['start'], b, 'cad')); continue
            body.append((b['start'], b, 'body'))
            ls = sorted(b['lines'], key=lambda l: l['start'])
            for j, l in enumerate(ls):
                t = l['start'] - 0.3
                if j == 0 and t - b['start'] < 1.5: continue
                if t - body[-1][0] < 2.5: continue
                kind = 'thin' if (ty == 'chicken' and j == 1) else 'body'
                body.append((t, b, kind))
            # very long single lines get a mid-line change so harmony keeps breathing
        exp = []
        for i, (t0, b, kind) in enumerate(body):
            t1 = body[i + 1][0] if i + 1 < len(body) else (tl.chapters[ci + 1]['start'] if ci + 1 < len(tl.chapters) else D)
            if kind in ('body', 'thin') and t1 - t0 > 11:
                m = t0 + (t1 - t0) / 2
                exp += [(t0, m, b, kind), (m, t1, b, kind)]
            else:
                exp.append((t0, t1, b, kind))
        k = 0
        prev = slots[-1]['chord']['name'] if slots else None
        for i, (t0, t1, b, kind) in enumerate(exp):
            nxt = exp[i + 1][3] if i + 1 < len(exp) else None
            if kind == 'final':
                chd = P.get('final') or P['cad'] or P['prog'][0]
            elif kind == 'cad':
                chd = P['cad']
            elif nxt in ('cad', 'final') and P['pre']:
                chd = P['pre']
            else:
                chd = cyc(P['prog'], k); k += 1
                if chd['name'] == prev or (nxt in ('cad', 'final') and P['pre'] and chd['name'] == P['pre']['name']):
                    chd = cyc(P['prog'], k); k += 1
            slots.append(dict(t0=t0, t1=t1, chord=chd, kind=kind, cid=c['id'], beat=b))
            prev = chd['name']
    slots.sort(key=lambda s: s['t0'])
    # no chord twice in a row (e.g. the cycle landing on the pre-cadence chord just before it)
    for i, s in enumerate(slots):
        if s['kind'] not in ('body', 'thin'): continue
        nb = {slots[j]['chord']['name'] for j in (i - 1, i + 1) if 0 <= j < len(slots)}
        if s['chord']['name'] in nb:
            alt = [c for c in plan(s['cid'])['prog'] if c['name'] not in nb]
            if alt: s['chord'] = alt[int(rng.integers(0, len(alt)))]
    slots[0]['t0'] = 0.0
    for a, b in zip(slots[:-1], slots[1:]): a['t1'] = b['t0']
    slots[-1]['t1'] = D
    return slots


SLOTS = build_slots()
CHANGES = [s['t0'] for s in SLOTS]


def slot_at(t):
    i = int(np.searchsorted(CHANGES, t, side='right')) - 1
    return SLOTS[max(0, min(i, len(SLOTS) - 1))]


def mood_at(t): return plan(slot_at(t)['cid'])['mood']


def pool(chd, lo, hi):
    return [k for k in range(lo, hi + 1) if k % 12 in chd['pcs']]


# ----------------------------------------------------------------------------- 2. note events
piano_ev, pulse_ev, spark_ev, pad_ev = [], [], [], []   # dicts
last_note = [66]


def hv(v, sd=3): return int(np.clip(round(v + rng.normal(0, sd)), 12, 100))


def add_piano(t, key, vel, bus=None, kind='mel'):
    (bus if bus is not None else piano_ev).append(dict(t=t + float(rng.normal(0, 0.006)), key=int(key), vel=hv(vel), kind=kind))


def pick_walk(chd, reg, prev, shape='walk'):
    P = pool(chd, *reg)
    if not P: return prev
    P = np.array(P)
    if shape == 'up':
        cand = P[(P > prev) & (P <= prev + 7)]
    elif shape == 'down':
        cand = P[(P < prev) & (P >= prev - 7)]
    else:
        cand = P[(np.abs(P - prev) <= 5) & (P != prev)]
    if len(cand) == 0:
        cand = P[np.argsort(np.abs(P - prev))[:3]]
    w = 1.0 / (1 + np.abs(cand - prev))
    return int(rng.choice(cand, p=w / w.sum()))


def phrase(t0, t_end, n, shape, vel, allow_over=0.5):
    """n notes from t0, spaced on the 66 BPM grid (8th / dotted 8th / quarter), each on the chord sounding then"""
    t = t0
    for i in range(n):
        if t > t_end + allow_over: break
        s = slot_at(t); m = plan(s['cid'])['mood']
        reg = m['reg']
        prev = last_note[0]
        if not (reg[0] <= prev <= reg[1]): prev = int(np.clip(prev, reg[0] + 4, reg[1] - 4))
        if shape == 'answer' and i == n - 1:
            # land on the root or third of the chord, nearest below
            tgt = [k for k in pool(s['chord'], reg[0], prev) if k % 12 in (s['chord']['root'], (s['chord']['root'] + (3 if plan(s['cid'])['mode'] == 'minor' else 4)) % 12)]
            k = max(tgt) if tgt else pick_walk(s['chord'], reg, prev, 'down')
        else:
            k = pick_walk(s['chord'], reg, prev, {'question': 'up', 'answer': 'down'}.get(shape, 'walk'))
        v = vel - 3 * i if shape == 'answer' else vel - (2 if i == n - 1 else 0)
        add_piano(t, k, v)
        last_note[0] = k
        t += Q * float(rng.choice([0.5, 0.75, 1.0], p=[0.35, 0.3, 0.35]))


def spark(t, inst, reg_hi=False):
    s = slot_at(t)
    prog = SPARK[inst]
    if inst in ('harp', 'nylon'):
        P = pool(s['chord'], 55, 79)
        st = int(rng.integers(0, max(1, len(P) - 4)))
        ks = P[st:st + int(rng.integers(3, 5))]
        dt = float(rng.uniform(0.13, 0.2))
        for i, k in enumerate(ks):
            spark_ev.append(dict(t=t + i * dt, key=k, vel=hv(34 - 2 * i), prog=prog, pan=-0.3 + 0.2 * i))
    else:
        lo, hi = (72, 91) if inst == 'celesta' else (65, 84)
        P = pool(s['chord'], lo, hi)
        k = int(rng.choice(P))
        spark_ev.append(dict(t=t, key=k, vel=hv(30), prog=prog, pan=float(rng.uniform(-0.5, 0.5))))
        if rng.random() < 0.5:
            P2 = [x for x in P if 2 <= abs(x - k) <= 7]
            if P2: spark_ev.append(dict(t=t + Q * 0.5, key=int(rng.choice(P2)), vel=hv(26), prog=prog, pan=float(rng.uniform(-0.5, 0.5))))


# 2a. bass + chord colour at every harmonic change
for s in SLOTS:
    m = plan(s['cid'])['mood']; chd = s['chord']
    t0 = s['t0']
    v = m['vel'] - (5 if tl.voiced(t0) else 0)
    if s['kind'] == 'thin': continue
    if s['kind'] == 'final':
        keys = chd['bass'] + [k for k in chd['pad'] if k >= 50]
        for i, k in enumerate(keys):
            piano_ev.append(dict(t=t0 + 0.07 * i, key=k, vel=hv(40 - i, 2), kind='final'))
        continue
    add_piano(t0, chd['bass'][0] + (12 if chd['bass'][0] < 31 else 0), v - 2, kind='bass')
    if s['kind'] == 'cad':
        # gentle landing: rolled tonic
        up = sorted(chd['pad'])[-3:]
        for i, k in enumerate(up): add_piano(t0 + 0.09 * (i + 1), k, v - 1 - i, kind='chord')
        last_note[0] = up[-1]
    elif s['kind'] == 'card':
        add_piano(t0 + 0.05, max(chd['pad']), v - 4)

# 2b. voice-free gaps: short melodic cells ("question" after a chapter card, "answer" after a remember card)
rem_line_ends = []
for b in tl.beats:
    if tl.btype(b) == 'remember' and b['lines']:
        rem_line_ends.append(max(l['start'] + l['dur'] for l in b['lines']))
card_starts = [c['start'] for c in tl.chapters if c.get('card')]
final_t = next((b['start'] for b in tl.beats if tl.btype(b) == 'endcard'), None)

for a, b in tl.gaps(0.0, D):
    g = b - a
    if final_t is not None and a >= final_t - 0.2: continue
    m = mood_at(a + 0.05)
    cs = [c for c in card_starts if a - 0.05 <= c <= b]
    after_rem = any(abs(a - e) < 0.05 for e in rem_line_ends)
    if final_t is not None and a < final_t <= b:
        b = final_t - 0.1; g = b - a
    if cs:
        c0 = cs[0]
        if after_rem and c0 - a > 0.5:
            phrase(a + 0.12, c0 - 0.1, 2, 'answer', m['vel'] - 2, allow_over=0.0)
        mm = mood_at(c0 + 0.1)
        phrase(c0 + 0.75, b - 0.1, int(rng.integers(2, 4)), 'question', mm['vel'] - 3, allow_over=0.2)
        if mm['spark'] and rng.random() < mm['spark'][1] + 0.2:
            spark(c0 + 1.9, mm['spark'][0])
        continue
    if after_rem:
        phrase(a + 0.1, b, 2 if g > 0.8 else 1, 'answer', m['vel'] - 2, allow_over=0.0)
        continue
    if g >= 1.6:
        phrase(a + 0.1, b, int(rng.integers(2, 5)), 'walk', m['vel'])
        if m['spark'] and rng.random() < m['spark'][1]: spark(a + 0.1 + Q, m['spark'][0])
    elif g >= 0.6:
        phrase(a + 0.08, b, 1 + int(rng.random() < 0.35), 'walk', m['vel'] - 1, allow_over=0.3)
        if m['spark'] and rng.random() < m['spark'][1] * 0.5: spark(a + 0.35, m['spark'][0])
    elif g >= 0.25 and rng.random() < m['gap']:
        phrase(a + 0.06, b, 1, 'walk', m['vel'] - 3, allow_over=0.3)

# 2c. under a voice line: only a rare, soft single note (high or low, away from the voice's centre)
for l in tl.lines:
    m = mood_at(l['start'] + 0.5)
    a, b = l['start'] + 0.8, l['start'] + l['dur'] - 0.4
    if b <= a: continue
    n = rng.poisson((b - a) * m['inl'])
    ts = np.sort(rng.uniform(a, b, n)) if n else []
    lastt = -9
    for t in ts:
        if t - lastt < 1.8: continue
        s = slot_at(t)
        if s['kind'] in ('thin', 'final'): continue
        hi = rng.random() < 0.6
        reg = (max(m['reg'][1] - 9, 70), m['reg'][1] + 3) if hi else (m['reg'][0] - 5, m['reg'][0] + 4)
        P = pool(s['chord'], *reg)
        if P: add_piano(t, int(rng.choice(P)), m['vel'] - 8); lastt = t

# 2d. pulse: steady (c3, "reasoning forward") / mixed (c4, randomised like a mixed strategy); heartbeat in 'chicken'
for c in tl.chapters:
    P = plan(c['id']); pm = P['mood']['pulse']
    if not pm: continue
    bs = [b for b in tl.beats_of(c['id']) if tl.btype(b) not in ('remember', 'endcard')]
    if not bs: continue
    t_a = bs[0]['start'] + 0.2
    rem = [b for b in tl.beats_of(c['id']) if tl.btype(b) == 'remember']
    t_b = (rem[0]['start'] - 0.25) if rem else c['end'] - 0.5
    t = t_a; i = 0
    first_end = bs[0]['end']
    while t < t_b:
        s = slot_at(t)
        pp = pool(s['chord'], 50, 66)
        if pp:
            frac = (t - t_a) / max(1, t_b - t_a)
            v = 25 + 7 * frac
            if pm == 'steady':
                if not (t < first_end and i % 2):          # first beat: half-time, then every quarter
                    root = [k for k in pp if k % 12 == s['chord']['root']]
                    pat = [root[0] if root else pp[0], pp[min(len(pp) - 1, 2)], pp[min(len(pp) - 1, 3)], pp[min(len(pp) - 1, 2)]]
                    add_piano(t, pat[i % 4], v - (3 if i % 2 else 0), bus=pulse_ev)
            else:
                if rng.random() > 0.32:
                    add_piano(t + (Q * 0.5 if rng.random() < 0.15 else 0), int(rng.choice(pp)), v - float(rng.uniform(0, 4)), bus=pulse_ev)
        t += Q; i += 1

for b in tl.beats:
    if tl.btype(b) != 'chicken' or not b['lines']: continue
    ls = sorted(b['lines'], key=lambda l: l['start'])
    t, t_b = b['start'] + 0.2, (ls[1]['start'] - 0.35) if len(ls) > 1 else b['end']
    root = slot_at(t)['chord']['bass'][0]
    root = root + 12 if root < 26 else root
    per = 60 / 50.0; j = 0
    while t < t_b - 0.3:
        v = 38 + 8 * (t - b['start']) / max(1, t_b - b['start'])
        pulse_ev.append(dict(t=t, key=root, vel=hv(v, 1), kind='hb'))
        pulse_ev.append(dict(t=t + 0.27, key=root, vel=hv(v - 10, 1), kind='hb'))
        t += per; j += 1

# 2e. pads (ties across slots when a pitch continues)
for s in SLOTS:
    m = plan(s['cid'])['mood']; chd = s['chord']
    layers = m['pad']
    t_on, t_off = s['t0'] - 0.35, s['t1'] + 0.25
    if s['kind'] == 'final':
        t_off = min(s['t1'], D) - 3.2
    for li, (prog, gdb, octv) in enumerate(layers):
        keys = sorted(chd['pad'])
        if s['kind'] == 'thin': keys = keys[-2:]
        elif s['kind'] == 'card': keys = keys[-3:]
        keys = [k + 12 * octv for k in keys]
        if octv: keys = keys[-2:]           # the high shimmer layer only doubles the top
        gain = gdb - (4 if s['kind'] in ('card', 'thin') else 0)
        for i, k in enumerate(keys):
            pan = (i / max(1, len(keys) - 1) - 0.5) * 0.7 * (-1 if li % 2 else 1)
            pad_ev.append(dict(t=t_on, off=t_off, key=k, vel=m['pv'], prog=prog, g=gain, pan=pan, layer=li))
    # string bass under everything (octave above if very low) - warm floor, not a bass line
    if s['kind'] not in ('thin',):
        bk = chd['bass'][0]; bk = bk + 12 if bk < 34 else bk
        pad_ev.append(dict(t=t_on, off=t_off, key=bk, vel=m['pv'] - 2, prog=STR, g=-5 - (3 if s['kind'] == 'card' else 0), pan=-0.1, layer=9))


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


# piano "pedal": a note rings until the harmony moves away from its pitch class (or it is struck again)
def pedal(evs, cap=9.0, damp=0.18):
    evs.sort(key=lambda e: e['t'])
    for i, e in enumerate(evs):
        off = e['t'] + cap
        for s in SLOTS:
            if s['t0'] > e['t'] + 0.05 and e['key'] % 12 not in s['chord']['pcs']:
                off = min(off, s['t0'] + damp); break
        for f in evs[i + 1:]:
            if f['t'] > off: break
            if f['key'] == e['key']:
                off = min(off, f['t'] + 0.01); break
        if e.get('kind') == 'final': off = D - 1.2
        e['off'] = max(e['t'] + 0.25, min(off, D - 0.3))
    return evs


piano_ev = pedal([e for e in piano_ev if e['t'] < D - 0.5])
for e in pulse_ev: e['off'] = e['t'] + (0.55 if e.get('kind') == 'hb' else 0.42)


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
    """felt-piano tone: gentle low-pass, a little less 250 Hz boxiness, soft top"""
    x = filt(x, 'lp', fc, q=0.6, order=2)
    x = filt(x, 'peak', 260, q=0.9, gain_db=-2.0)
    return filt(x, 'hs', 6000, gain_db=-4)


def pan_of(k): return float(np.clip((k - 64) / 30.0, -0.45, 0.45))


out = np.zeros((NB, 2))
stems = {}

# piano
bus = Bus(3.4, 0.55, bright=0.4, width=0.9, seed=11, predelay=0.025)
for e in piano_ev:
    y = note(PIANO, e['key'], e['vel'], e['off'] - e['t'], tail=3.0)
    bus.add(e['t'], y, 1.0, pan_of(e['key']))
stems['piano'] = bus.render(lambda d: felt(d, 3200)); del bus

# pulse (muted felt, drier)
bus = Bus(2.2, 0.35, bright=0.3, seed=12)
for e in pulse_ev:
    y = note(PIANO, e['key'], e['vel'], e['off'] - e['t'], tail=1.5)
    bus.add(e['t'], y, 1.0, -0.15 if e.get('kind') != 'hb' else 0.0)
stems['pulse'] = bus.render(lambda d: felt(d, 1300)); del bus

# sparks (celesta / vibes / harp / nylon)
bus = Bus(3.8, 0.7, bright=0.5, width=1.0, seed=13, predelay=0.035)
for e in spark_ev:
    if e['t'] >= D - 1: continue
    y = note(e['prog'], e['key'], e['vel'], 1.5 if e['prog'] in (HARP, NYLON) else 0.8, tail=4.0)
    bus.add(e['t'], y, 1.0, e['pan'])
stems['spark'] = bus.render(lambda d: filt(d, 'lp', 7000, order=1)); del bus

# pads, with a very slow low-pass drift (per-chapter base cutoff, two slow LFOs)
bus = Bus(4.5, 0.45, bright=0.35, width=1.0, seed=14, predelay=0.03)
for e in pad_ev:
    y = note(e['prog'], e['key'], e['vel'], e['off'] - e['t'], tail=5.0)
    bus.add(e['t'], y, 10 ** (e['g'] / 20), e['pan'])
tt = np.arange(NB) / SR
pts = []
for c in tl.chapters:
    pts += [(c['start'] - 1.5, np.log(plan(c['id'])['mood']['cut'])), (c['start'] + 2.5, np.log(plan(c['id'])['mood']['cut']))]
base = env_points(NB, sorted(pts))
cut = np.exp(base) * (1 + 0.22 * np.sin(2 * np.pi * tt / 41.0 + 0.7)) * (1 + 0.10 * np.sin(2 * np.pi * tt / 13.7))
del tt
stems['pad'] = bus.render(lambda d: filt(sweep(d, 'lp', cut, q=0.6, block=256), 'hp', 45, order=1)); del bus, cut

# tape-like hiss (very low, band-limited, slowly breathing)
hs = np.zeros((NB, 2))
nz = np.random.default_rng(7).standard_normal((NB, 2))
nz = filt(filt(nz, 'lp', 2500, order=1), 'hp', 250, order=1)
k = np.random.default_rng(8).standard_normal(NB // SR + 3)
from scipy.ndimage import gaussian_filter1d
mod = np.interp(np.arange(NB) / SR, np.arange(len(k)), 0.75 + 0.25 * np.tanh(gaussian_filter1d(k, 4) * 3))
hs = nz * mod[:, None]
del nz, mod
stems['hiss'] = hs

# ----------------------------------------------------------------------------- 4. balance + section gains
GAIN = {'piano': 0.0, 'pulse': -5.0, 'spark': -6.0, 'pad': -4.0, 'hiss': None}
ref = lufs(stems['piano'][:N])
for k, x in stems.items():
    if k == 'hiss':
        g = 10 ** ((ref - 44 - lufs(x[:N])) / 20)
    else:
        g = 10 ** (GAIN[k] / 20)
    out += x * g
    stems[k] = None

pts = []
for c in tl.chapters:
    gdb = plan(c['id'])['mood']['gain']
    pts += [(c['start'] - 1.0, None), (c['start'] + 2.0, 10 ** (gdb / 20))]
pp = []
prev = 10 ** (plan(tl.chapters[0]['id'])['mood']['gain'] / 20)
for t, g in pts:
    if g is None: pp.append((max(0.0, t), prev))
    else: pp.append((t, g)); prev = g
out *= env_points(NB, pp)[:, None]

out = out[:N]
out = fade(out, 0.3, 2.5)
out *= 10 ** (-3.0 / 20) / max(np.abs(out).max(), 1e-9)
write(f'{OUT}/music.wav', out)

meta = dict(
    bpm=BPM,
    chapters={c['id']: dict(key=plan(c['id'])['key'], mode=plan(c['id'])['mode'], scale=plan(c['id'])['scale']) for c in tl.chapters},
    chords=[dict(t0=round(s['t0'], 3), t1=round(s['t1'], 3), chapter=s['cid'], kind=s['kind'], name=s['chord']['name'],
                 pcs=s['chord']['pcs'], root=s['chord']['root'], scale=plan(s['cid'])['scale']) for s in SLOTS],
    no_duck=[], edits=[])
json.dump(meta, open(f'{OUT}/music_meta.json', 'w'), indent=1, ensure_ascii=False)
cnt = lambda ev: len(ev)
print(f'slots {len(SLOTS)}, piano notes {len(piano_ev)}, pulse {len(pulse_ev)}, spark {len(spark_ev)}, pad {len(pad_ev)}')
in_line = sum(1 for e in piano_ev if tl.voiced(e['t']))
print(f'piano notes under voice: {in_line}/{len(piano_ev)}')
for c in tl.chapters:
    ss = [s for s in SLOTS if s['cid'] == c['id']]
    print(f"  {c['id']} {plan(c['id'])['key']:>2} {plan(c['id'])['mode']:5s}: " + ' '.join(f"{s['chord']['name']}{'*' if s['kind'] in ('cad', 'final') else ''}" for s in ss))
