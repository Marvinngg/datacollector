"""Sound effects for 《博弈论：看局、解局、改局》 -> build/audio/sfx.wav (48 kHz stereo float).

Reads build/cues.json ([{t, type, ...}], t in absolute seconds; exported by `node pipeline/render.mjs cues`).
Vocabulary (BRIEF.md): tick pop whoosh(dur) chime click thud swish count(dur), plus the runtime's chapter / beat.
Everything is synthesised here (no samples) and kept very soft: this is a learning film, the voice leads.
Pitched sounds take their notes from the score's harmony at that moment (build/audio/music_meta.json, written by
music.py); without it they fall back to D major.

  python3 sfx.py [--cues path] [--regen] [--plot]
    --regen  re-export cues first (node pipeline/render.mjs cues)
"""
import json
import os
import subprocess
import sys
import numpy as np
from common import *   # noqa

args = sys.argv[1:]
if '--regen' in args:
    try:
        subprocess.run(['node', 'pipeline/render.mjs', 'cues'], cwd=ROOT, check=True, timeout=300)
    except Exception as ex:
        print('cue export failed, using existing cues.json:', ex)
tl = Timeline()
if '--cues' in args:
    tl.cues = json.load(open(args[args.index('--cues') + 1]))
D = tl.duration
rng = np.random.default_rng(1928)
t_ = lambda n: np.arange(n) / SR

# ----------------------------------------------------------------------------- harmony from the score
_mp = os.path.join(OUT, 'music_meta.json')
CHORDS = json.load(open(_mp))['chords'] if os.path.exists(_mp) else []
if not CHORDS: print('  (music_meta.json missing: pitched sfx use D major)')


def harmony(t):
    """(chord pitch classes, root pc, scale pcs) sounding at t"""
    for c in CHORDS:
        if c['t0'] <= t < c['t1']: return c['pcs'], c['root'], c['scale']
    if CHORDS:
        c = CHORDS[-1] if t >= CHORDS[-1]['t0'] else CHORDS[0]
        return c['pcs'], c['root'], c['scale']
    return [2, 6, 9, 4], 2, [2, 4, 6, 7, 9, 11, 1]


def notes_in(pcs, lo, hi): return [k for k in range(lo, hi + 1) if k % 12 in pcs]


def nearest(pcs, target):
    ks = notes_in(pcs, target - 7, target + 7)
    return min(ks, key=lambda k: abs(k - target)) if ks else target


# ----------------------------------------------------------------------------- building blocks
def noise(n, seed=None): return (np.random.default_rng(seed) if seed is not None else rng).standard_normal(n)
def env_attack(n, a): return np.minimum(1, t_(n) / max(a, 1e-4))
def pad_to(x, n): return np.pad(x, (0, max(0, n - len(x))))[:n]


def st(x, w=0.0):
    """mono -> stereo with a tiny decorrelation (w = 0..1)"""
    if w <= 0: return to_stereo(x)
    d = n_of(0.0004 + 0.0008 * w)
    r = np.concatenate([np.zeros(d), x[:-d]])
    return np.stack([x, (1 - w * 0.5) * x + w * 0.5 * r], 1)


def bell(f, dur, taus=(1.1, 0.5, 0.25, 0.12), parts=(1.0, 2.0, 2.76, 5.4), amps=(1.0, 0.22, 0.12, 0.04), attack=0.004):
    """soft glassy bell: few partials, upper ones die first, rounded attack"""
    n = n_of(dur); t = t_(n); x = np.zeros(n)
    for p, a, tau in zip(parts, amps, taus):
        if f * p < 15000: x += a * np.sin(2 * np.pi * f * p * t + 0.3 * p) * np.exp(-t / tau)
    return x * env_attack(n, attack)


def airband(n, lo, hi, seed=None):
    x = noise(n, seed)
    return filt(filt(x, 'hp', lo, order=2), 'lp', hi, order=2)


# ----------------------------------------------------------------------------- designs  (return stereo, pan)
def s_tick(c):
    """element appears: tiny felt tick with a whisper of pitch (a chord tone, high)"""
    n = n_of(0.12); t = t_(n)
    pcs, _, _ = harmony(c['t'])
    k = int(rng.choice(notes_in(pcs, 84, 96) or [86]))
    clk = filt(noise(n) * np.exp(-t / 0.0014), 'bp', rng.uniform(2600, 3600), q=1.4)
    ping = np.sin(2 * np.pi * mtof(k) * t) * np.exp(-t / 0.03) * env_attack(n, 0.002) * 0.35
    body = np.sin(2 * np.pi * 420 * t) * np.exp(-t / 0.006) * 0.3
    return st(filt(clk + ping + body, 'lp', 8000), 0.3), float(rng.uniform(-0.2, 0.2))


def s_pop(c):
    """emphasis / highlight: soft rounded bubble on a chord tone"""
    n = n_of(0.3); t = t_(n)
    pcs, _, _ = harmony(c['t'])
    f = mtof(int(rng.choice(notes_in(pcs, 74, 81) or [78])))
    fr = f * (0.82 + 0.18 * (1 - np.exp(-t / 0.018)))
    y = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t / 0.07) * env_attack(n, 0.004)
    y += 0.12 * np.sin(4 * np.pi * np.cumsum(fr) / SR) * np.exp(-t / 0.03)
    air = filt(noise(n) * np.exp(-t / 0.01), 'bp', 2200, q=0.8) * 0.08
    return st(filt(y + air, 'lp', 5000), 0.4), float(rng.uniform(-0.15, 0.15))


def s_whoosh(c):
    """large move: soft air, band sweeping up then down, drifting L -> R; length from the cue"""
    dur = float(np.clip(float(c.get('dur', 0.9)), 0.3, 4.0))
    n = n_of(dur + 0.25); t = t_(n); u = np.clip(t / dur, 0, 1)
    nz = np.stack([noise(n), noise(n)], 1)
    fc = 380 * (1 + 4.5 * np.sin(np.pi * u) ** 1.4)
    x = sweep(nz, 'bp', fc, q=0.8)
    e = np.sin(np.pi * u ** 0.85) ** 2
    x = x * e[:, None]
    gl, gr = pan_gains(np.clip(-0.35 + 0.7 * u, -0.35, 0.35))
    x[:, 0] *= gl; x[:, 1] *= gr
    return filt(x, 'lp', 4500), None


def s_swish(c):
    """throw / sweep past: short, downward, brighter than whoosh"""
    dur = float(np.clip(float(c.get('dur', 0.32)), 0.15, 1.0))
    n = n_of(dur + 0.1); t = t_(n); u = np.clip(t / dur, 0, 1)
    fc = 4200 * (900 / 4200) ** u
    x = sweep(to_stereo(noise(n)), 'bp', fc, q=1.1)[:, 0]
    e = np.sin(np.pi * u ** 0.6) ** 2
    return st(filt(x * e, 'lp', 7000), 0.6), float(rng.uniform(-0.25, 0.25))


def s_chime(c):
    """remember card / conclusion: two soft bell notes from the current chord (5th or 9th, then root/3rd)"""
    pcs, root, sc = harmony(c['t'] + 0.05)
    third = [p for p in pcs if (p - root) % 12 in (3, 4)]
    land = nearest([root] + third, 79)
    up = [k for k in notes_in(pcs, land + 2, land + 9) if (k - root) % 12 in (7, 2, 11)]
    first = up[0] if up else land + 7
    dur = 4.5; n = n_of(dur)
    a = bell(mtof(first), dur) * 0.55
    b = pad_to(np.concatenate([np.zeros(n_of(0.22)), bell(mtof(land), dur - 0.22)]), n)
    x = filt(a + b, 'lp', 6500)
    return st(x, 0.7), 0.05


def s_click(c):
    """choice / confirm: small soft button, two-part"""
    n = n_of(0.12); t = t_(n); x = np.zeros(n)
    for dt, fc, g in ((0.0, 1900, 1.0), (0.028, 3100, 0.55)):
        i = n_of(dt); m = n - i
        x[i:] += g * filt(noise(m) * np.exp(-t_(m) / 0.0016), 'bp', fc, q=1.6)
    x += np.sin(2 * np.pi * 230 * t) * np.exp(-t / 0.012) * env_attack(n, 0.0008) * 0.35
    return st(filt(x, 'lp', 7500), 0.2), float(rng.uniform(-0.1, 0.1))


def s_thud(c):
    """impact / failure: soft felt thump on the chord root (low), no click"""
    n = n_of(0.6); t = t_(n)
    _, root, _ = harmony(c['t'])
    f0 = mtof(36 + (root - 36) % 12)          # C2..B2
    fr = f0 * (1 + 0.5 * np.exp(-t / 0.03))
    ph = 2 * np.pi * np.cumsum(fr) / SR
    y = (np.sin(ph) + 0.25 * np.sin(2 * ph)) * np.exp(-t / 0.13) * (1 - np.exp(-t / 0.004))
    y += filt(noise(n) * np.exp(-t / 0.02), 'lp', 380, order=2) * 0.5
    return st(filt(y, 'lp', 1400, order=2), 0.2), 0.0


def s_count(c):
    """number rolling: a quiet run of soft ticks, quick then settling, stepping up the scale"""
    dur = float(np.clip(float(c.get('dur', 1.0)), 0.2, 5.0))
    n = n_of(dur + 0.25); x = np.zeros(n)
    _, _, sc = harmony(c['t'])
    ks = notes_in(sc, 81, 98) or [86]
    # tick times: dense at the start, slowing down towards the end (like a counter easing out)
    m = int(np.clip(dur * 14, 4, 50))
    u = np.linspace(0, 1, m)
    ts = dur * (1 - (1 - u) ** 1.8)
    for j, tt in enumerate(ts):
        i = n_of(tt); L = n_of(0.05)
        if i + L > n: break
        tl_ = t_(L)
        k = ks[min(len(ks) - 1, j * len(ks) // m)]
        tk = filt(noise(L) * np.exp(-tl_ / 0.0012), 'bp', 3200, q=1.5) * 0.6
        tk += np.sin(2 * np.pi * mtof(k) * tl_) * np.exp(-tl_ / 0.012) * 0.25
        x[i:i + L] += tk * (0.55 + 0.45 * (j == m - 1))
    return st(filt(x, 'lp', 8000), 0.3), 0.2


def s_chapter(c):
    """chapter card: a slow airy breath (the page turns) and, very faintly, the new key's fifth high up.
    Starts PRE['chapter'] s before the cue so the breath peaks just as the card lands."""
    n = n_of(3.2); t = t_(n)
    sw = np.clip(t / 0.8, 0, 1); fall = np.exp(-np.maximum(0, t - 0.8) / 0.55)
    e = np.sin(0.5 * np.pi * sw) ** 2 * fall
    air = np.stack([airband(n, 350, 2600), airband(n, 350, 2600)], 1) * e[:, None]
    pcs, root, _ = harmony(c['t'] + 0.2)
    k = nearest(pcs, 88 + ((root + 7) % 12 - 4))
    if (k - root) % 12 not in (0, 7, 2): k = nearest([(root + 7) % 12], 88)
    sh = np.zeros(n); i = n_of(PRE['chapter'] + 0.1)
    sh[i:] = bell(mtof(k), (n - i) / SR, taus=(1.2, 0.5), parts=(1.0, 2.0), amps=(1.0, 0.15), attack=0.05) * 0.25
    return air * 0.8 + st(sh, 0.9), None


def s_beat(c):
    """new picture: barely-there breath"""
    n = n_of(0.5); t = t_(n)
    e = np.sin(np.pi * np.clip(t / 0.45, 0, 1)) ** 2
    x = airband(n, 900, 4200) * e
    return st(x, 0.8), float(rng.uniform(-0.2, 0.2))


def s_generic(c):
    n = n_of(0.3)
    pcs, _, _ = harmony(c['t'])
    return st(bell(mtof(nearest(pcs, 81)), 0.3, taus=(0.08,), parts=(1.0,), amps=(1.0,)), 0.3), 0.0


PRE = {'chapter': 0.6}          # seconds a sound starts before its cue (breaths that should peak on the cue)
DESIGN = {'tick': s_tick, 'pop': s_pop, 'whoosh': s_whoosh, 'swish': s_swish, 'chime': s_chime, 'click': s_click,
          'thud': s_thud, 'count': s_count, 'chapter': s_chapter, 'beat': s_beat}
# peak level of each sound in sfx.wav (dBFS, dry). mix.py adds sfx at unity against a voice stem of ~-19 LUFS
# (voice peaks ~-6 dBFS): everything sits 20-40 dB under the voice.
TARGET = {'tick': -35, 'pop': -31, 'whoosh': -33, 'swish': -35, 'chime': -27, 'click': -33, 'thud': -28,
          'count': -38, 'chapter': -31, 'beat': -45}
SEND = {'tick': 0.15, 'pop': 0.25, 'whoosh': 0.25, 'swish': 0.2, 'chime': 0.55, 'click': 0.12, 'thud': 0.2,
        'count': 0.15, 'chapter': 0.5, 'beat': 0.3}

# ----------------------------------------------------------------------------- render
out = np.zeros((n_of(D) + n_of(4), 2))
wet = np.zeros_like(out)
room = make_ir(1.1, bright=0.4, seed=99, width=0.9)
cues = sorted([c for c in tl.cues if 0 <= float(c.get('t', -1)) < D], key=lambda c: float(c['t']))
counts, peaks, skipped = {}, {}, {}
times_by_type = {}
for c in cues: times_by_type.setdefault(c['type'], []).append(float(c['t']))
all_t = [(float(c['t']), c['type']) for c in cues]
placed = []
for c in cues:
    typ = c['type']; t = float(c['t'])
    if typ == 'beat':
        # the runtime emits a beat on every new picture; stay silent when something else already speaks there,
        # right after a chapter card, or when the voice is running over the cut
        busy = any(abs(u - t) < 0.25 and ty != 'beat' for u, ty in all_t) or \
            any(ty == 'chapter' and 0 <= t - u < 4.0 for u, ty in all_t) or tl.voiced(t, 0.1)
        if busy: skipped[typ] = skipped.get(typ, 0) + 1; continue
    if any(p[1] == typ and abs(p[0] - t) < 0.03 for p in placed[-8:]):      # exact duplicates
        skipped[typ] = skipped.get(typ, 0) + 1; continue
    x, pan = DESIGN.get(typ, s_generic)(dict(c, t=t))
    x = fade(x, 0.0005, 0.02)
    x = x * (10 ** (TARGET.get(typ, -34) / 20) / max(np.abs(x).max(), 1e-9))
    g = float(c.get('v', 1.0))
    near = sum(1 for u in times_by_type[typ] if abs(u - t) < 0.3)             # clusters stay soft
    g /= np.sqrt(max(1, near))
    if typ not in ('chapter', 'beat', 'chime') and tl.voiced(t): g *= 10 ** (-2 / 20)
    p = 0.0 if pan is None else pan
    t0 = max(0.0, t - PRE.get(typ, 0.0))
    place(out, t0, x, g, p)
    place(wet, t0, x, g * SEND.get(typ, 0.2), p)
    placed.append((t, typ))
    counts[typ] = counts.get(typ, 0) + 1
    peaks[typ] = max(peaks.get(typ, -200), db(np.abs(x).max() * g))
out = out + convolve(wet, room)
out = out[:n_of(D)]
out = filt(out, 'hp', 40, order=2)
if np.abs(out).max() > 0.5:
    out *= 0.5 / np.abs(out).max()
write(f'{OUT}/sfx.wav', out)
print('cues:', len(cues), 'placed', counts, 'skipped', skipped)
print('peak dBFS per type (dry):', {k: round(v, 1) for k, v in peaks.items()})
unknown = sorted(set(counts) - set(DESIGN))
if unknown: print('  (generic blip used for unknown types:', unknown, ')')
if '--plot' in args:
    plot_tracks([('sfx', out)], tl, f'{OUT}/plot_sfx.png', 'sfx.wav')
