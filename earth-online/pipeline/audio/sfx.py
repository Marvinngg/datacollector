"""Sound effects for 《地球 Online》 -> build/audio/sfx.wav (48 kHz stereo float).

Reads build/cues.json ([{t, type, scene, ...}], t absolute seconds). All sounds are synthesised here
(no samples), tuned to the score's key (D major) where they are pitched, and kept soft so they never
compete with the voice.

  python3 sfx.py [--cues path] [--regen] [--plot]
    --regen  re-export cues first (node pipeline/render.mjs cues)
"""
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
    import json
    tl.cues = json.load(open(args[args.index('--cues') + 1]))
D = tl.duration
rng = np.random.default_rng(424242)
t_ = lambda n: np.arange(n) / SR


def dmp(f, dur, tau, ph=0.0):
    n = n_of(dur); t = t_(n)
    return np.sin(2 * np.pi * f * t + ph) * np.exp(-t / tau)


def noise(n, seed=None):
    return (np.random.default_rng(seed) if seed is not None else rng).standard_normal(n)


def env_attack(n, a):
    return np.minimum(1, t_(n) / max(a, 1e-4))


def pad_to(x, n):
    return np.pad(x, (0, max(0, n - len(x))))[:n]


def st(x, w=0.0, seed=0):
    """mono -> stereo with a tiny decorrelation (w = 0..1)"""
    if w <= 0: return to_stereo(x)
    d = n_of(0.0004 + 0.0006 * w)
    r = np.concatenate([np.zeros(d), x[:-d]]) if d > 0 else x
    return np.stack([x, (1 - w * 0.5) * x + w * 0.5 * r], 1)


# ----------------------------------------------------------------------------- designs
def s_key(c):
    """soft mechanical key: bandpassed click + short thock body + faint upstroke"""
    n = n_of(0.16)
    g = 10 ** (rng.uniform(-3, 1.5) / 20)
    fc = rng.uniform(2400, 4200)
    clk = filt(noise(n) * np.exp(-t_(n) / rng.uniform(0.0012, 0.0022)), 'bp', fc, q=1.3)
    body = pad_to(dmp(rng.uniform(170, 260), 0.06, rng.uniform(0.010, 0.016)), n) * 0.5
    body += pad_to(dmp(rng.uniform(650, 950), 0.03, 0.005), n) * 0.25
    up_t = rng.uniform(0.045, 0.075)
    up = np.zeros(n); k = n_of(up_t)
    uc = filt(noise(n - k) * np.exp(-t_(n - k) / 0.0012), 'bp', fc * 1.2, q=1.5) * 0.22
    up[k:] = uc
    x = (clk * 1.0 + body + up) * env_attack(n, 0.0003)
    x = filt(x, 'lp', 9000)
    return st(x / 3.0, 0.3) * g, rng.uniform(-0.18, 0.18)


def s_enter(c):
    n = n_of(0.3)
    clk = filt(noise(n) * np.exp(-t_(n) / 0.0025), 'bp', 2600, q=1.1)
    body = pad_to(dmp(135, 0.12, 0.026), n) * 0.8 + pad_to(dmp(520, 0.05, 0.008), n) * 0.3
    rat = np.zeros(n); k = n_of(0.011)
    rat[k:] = filt(noise(n - k) * np.exp(-t_(n - k) / 0.0015), 'bp', 4200, q=2) * 0.35
    up = np.zeros(n); k = n_of(0.11)
    up[k:] = filt(noise(n - k) * np.exp(-t_(n - k) / 0.0015), 'bp', 3000, q=1.5) * 0.25
    x = filt(clk + body + rat + up, 'lp', 8500)
    return st(x / 2.2, 0.3) * 1.3, 0.0


def bell(f, dur, taus=(0.9, 0.45, 0.25, 0.14), parts=(1.0, 2.0, 3.01, 4.17), amps=(1.0, 0.28, 0.11, 0.05), attack=0.0025):
    n = n_of(dur); t = t_(n); x = np.zeros(n)
    for p, a, tau in zip(parts, amps, taus):
        if f * p < 16000: x += a * np.sin(2 * np.pi * f * p * t) * np.exp(-t / tau)
    return x * env_attack(n, attack)


def s_ping(c, dull=False):
    """notification: A5 -> D6 soft bell (in D major). dull: low-passed, shorter, smaller"""
    v = float(c.get('v', 1.0)) if dull else 1.0
    n = n_of(1.4)
    tz = (0.5, 0.3, 0.18, 0.1)                   # short enough not to smear into a drone when they come on every beat
    a = bell(mtof(81), 1.4, taus=tz)
    b = pad_to(np.concatenate([np.zeros(n_of(0.085)), bell(mtof(86), 1.4 - 0.085, taus=tz)]), n)
    x = a * 0.75 + b
    if dull:
        x = x * np.exp(-t_(n) / (0.25 + 0.25 * v))
        x = filt(x, 'lp', 650 + 1500 * v, order=2)
        x *= 0.3 + 0.35 * v
    return st(x * 0.32, 0.5), 0.12


def s_check(c):
    """✓: soft wooden two-note (F#5, A5), marimba-like partial ratio"""
    n = n_of(0.6)
    mk = lambda f: bell(f, 0.6, taus=(0.22, 0.06), parts=(1.0, 3.93), amps=(1.0, 0.35), attack=0.0015)
    x = mk(mtof(78)) * 0.7 + pad_to(np.concatenate([np.zeros(n_of(0.07)), mk(mtof(81))]), n)
    return st(filt(x, 'lp', 7000) * 0.3, 0.4), 0.0


def s_whoosh(c):
    """soft air sweep; dur from the cue"""
    dur = float(c.get('dur', 1.2)); dur = min(max(dur, 0.3), 6.0)
    n = n_of(dur + 0.3); t = t_(n); u = np.clip(t / dur, 0, 1)
    nz = np.stack([noise(n), noise(n)], 1)
    fc = 250 * (1 + 7 * np.sin(np.pi * u) ** 1.5)
    x = sweep(nz, 'bp', fc, q=0.9)
    rum = filt(noise(n), 'lp', 160, order=2) * 1.5
    e = np.sin(np.pi * np.clip(t / dur, 0, 1) ** 0.8) ** 2
    x = (x + to_stereo(rum) * 0.5) * e[:, None]
    p = np.clip(-0.5 + u, -0.5, 0.5)                  # travels L -> R
    gl, gr = pan_gains(p)
    x[:, 0] *= gl; x[:, 1] *= gr
    x = filt(x, 'lp', 5000)
    return x * 0.14, None


def s_drop(c):
    """marker lands: soft low thud + tiny in-key knock (D5)"""
    n = n_of(0.7); t = t_(n)
    f = 60 + 45 * np.exp(-t / 0.03)
    thud = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.09) * env_attack(n, 0.002)
    knock = bell(mtof(74), 0.7, taus=(0.3, 0.05), parts=(1.0, 3.93), amps=(1.0, 0.3)) * 0.35
    tick = filt(noise(n) * np.exp(-t / 0.003), 'bp', 1600, q=1.2) * 0.15
    return st((thud * 0.8 + knock + tick) * 0.3, 0.3), 0.1


def s_card(c):
    """card pops in: short soft blip + paper air"""
    n = n_of(0.35); t = t_(n)
    f = mtof(83) * (1 + 0.015 * (1 - np.exp(-t / 0.02)))
    blip = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.06) * env_attack(n, 0.003)
    paper = filt(noise(n) * np.exp(-t / 0.025) * env_attack(n, 0.006), 'bp', 3500, q=0.8) * 0.3
    return st((blip * 0.6 + paper) * 0.14, 0.6), rng.uniform(-0.2, 0.2)


def s_spark(c):
    """spark: airy glint (the musical twinkle lives in the score)"""
    n = n_of(0.9); t = t_(n); x = np.zeros(n)
    for k, m in enumerate([93, 98, 100, 105]):     # A6, D7, E7, A7 grains
        d = n_of(0.03 + 0.05 * k)
        x[d:] += bell(mtof(m), (n - d) / SR, taus=(0.12,), parts=(1.0,), amps=(1.0,)) * (0.5 - 0.08 * k)
    air = filt(noise(n), 'hp', 5000, order=2) * np.sin(np.pi * np.clip(t / 0.6, 0, 1)) ** 2 * 0.1
    return st((x + air) * 0.07, 0.8), 0.25


def s_fizzle(c):
    n = n_of(0.6); t = t_(n); u = np.clip(t / 0.45, 0, 1)
    fc = 1800 * (350 / 1800) ** u
    puff = sweep(to_stereo(noise(n)), 'bp', fc, q=1.0)[:, 0] * np.exp(-t / 0.14) * env_attack(n, 0.01)
    f = 1100 * (0.5 ** u)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.1) * 0.25
    return st((puff + tone) * 0.12, 0.5), 0.2


def s_alarm(c):
    """08:00 alarm: two soft double-beeps (A5), rounded square tone, not shrill"""
    dur = 1.1; n = n_of(dur); x = np.zeros(n)
    beep_n = n_of(0.085)
    tb = t_(beep_n)
    tone = sum((1 / k) * np.sin(2 * np.pi * mtof(81) * k * tb) for k in (1, 3, 5))
    tone = filt(tone, 'lp', 3000) * np.sin(np.pi * np.clip(tb / 0.085, 0, 1)) ** 0.6
    for s in (0.0, 0.14, 0.48, 0.62):
        i = n_of(s); x[i:i + beep_n] += tone[:len(x[i:i + beep_n])]
    return st(x * 0.1, 0.3), 0.3


_win_count = [0]


_win_prev = [0]


def s_window(c):
    """AI window(s) open: small pitched pops walking up the D pentatonic as windows multiply.
    With `n` (total windows after this split) one pop per new window (max 6), spread over ~0.2 s."""
    PEN = [74, 76, 78, 81, 83, 86, 88, 90, 93]
    n_tot = int(c.get('n', _win_prev[0] + 1))
    new = max(1, n_tot - _win_prev[0]); _win_prev[0] = n_tot
    pops = min(new, 6)
    dur = 0.3 + 0.2; n = n_of(dur); t = t_(n); x = np.zeros((n, 2))
    for j in range(pops):
        k = _win_count[0]; _win_count[0] += 1
        m = PEN[min(k, len(PEN) - 1)] if pops == 1 else PEN[(k % 5) + 2]
        d = n_of(0.2 * j / max(1, pops - 1)) if pops > 1 else 0
        nn = n - d
        y = bell(mtof(m), nn / SR, taus=(0.07, 0.03), parts=(1.0, 2.0), amps=(1.0, 0.2), attack=0.002)
        y = y + filt(noise(nn) * np.exp(-t_(nn) / 0.015), 'bp', 5000, q=1.0) * 0.15
        gl, gr = pan_gains(float(np.clip(rng.normal(0, 0.45), -0.7, 0.7)))
        x[d:, 0] += y * gl / np.sqrt(pops); x[d:, 1] += y * gr / np.sqrt(pops)
    return x * 0.09, 0.0


def s_tick(c):
    n = n_of(0.06); t = t_(n)
    x = filt(noise(n) * np.exp(-t / 0.0015), 'bp', 3800, q=2.0) + dmp(1600, 0.06, 0.004) * 0.3
    return st(x * 0.12, 0.2), 0.3


def s_final(c):
    """end card: a low, warm breath under the final chord"""
    n = n_of(3.0); t = t_(n)
    sub = np.sin(2 * np.pi * mtof(38) * t) * (1 - np.exp(-t / 0.08)) * np.exp(-t / 1.2)
    air = filt(noise(n), 'bp', 900, q=0.6) * np.sin(np.pi * np.clip(t / 2.2, 0, 1)) ** 2 * 0.15
    return st(filt((sub * 0.5 + air) * 0.12, 'lp', 2200, order=2), 0.7), 0.0


def s_boot(c):
    """power-on: sub swell rising into D2 with faint mains-like harmonics"""
    dur = float(c.get('dur', 3.0)); n = n_of(dur + 1.0); t = t_(n)
    f = 36.7 + (73.4 - 36.7) * (1 - np.exp(-t / 0.5))
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.08 * np.sin(3 * ph)
    e = (1 - np.exp(-t / 0.35)) * np.exp(-np.maximum(0, t - 0.6) / 0.9)
    hum = filt(noise(n), 'bp', 220, q=3) * 0.2 * e
    return st(filt((x * e + hum) * 0.2, 'lp', 900, order=2), 0.4), 0.0


def s_generic(c):
    n = n_of(0.25)
    return st(bell(mtof(81), 0.25, taus=(0.08,), parts=(1.0,), amps=(1.0,)) * 0.06, 0.3), 0.0


DESIGN = {'key': s_key, 'enter': s_enter, 'check': s_check, 'ping': s_ping, 'ping_dull': lambda c: s_ping(c, True),
          'whoosh': s_whoosh, 'drop': s_drop, 'card': s_card, 'spark': s_spark, 'fizzle': s_fizzle,
          'alarm': s_alarm, 'window': s_window, 'tick': s_tick, 'final': s_final, 'boot': s_boot}

# ----------------------------------------------------------------------------- render
out = buf(D + 4)
room = make_ir(0.7, bright=0.5, seed=99)
wet = buf(D + 4)
SEND = {'ping': 0.35, 'ping_dull': 0.25, 'check': 0.25, 'drop': 0.3, 'spark': 0.5, 'window': 0.3, 'alarm': 0.2,
        'final': 0.5, 'card': 0.2, 'key': 0.08, 'enter': 0.1, 'whoosh': 0.2, 'fizzle': 0.3, 'tick': 0.1}
# peak level of each sound in sfx.wav (dBFS). mix.py adds sfx at unity against voice at ~-19 LUFS.
TARGET = {'key': -31, 'enter': -26, 'check': -25, 'ping': -23, 'ping_dull': -24, 'whoosh': -26, 'drop': -24,
          'card': -29, 'spark': -30, 'fizzle': -31, 'alarm': -22, 'window': -29, 'tick': -33, 'final': -26,
          'boot': -17}
cues = sorted(tl.cues, key=lambda c: c['t'])
counts = {}
peaks = {}
# density compensation for clustered cues of the same type (e.g. 20 windows at once)
times_by_type = {}
for c in cues: times_by_type.setdefault(c['type'], []).append(float(c['t']))
for c in cues:
    typ = c['type']; t = float(c['t'])
    fn = DESIGN.get(typ, s_generic)
    x, pan = fn(c)
    x = fade(x, 0.0005, 0.01)
    x = x * (10 ** (TARGET.get(typ, -30) / 20) / max(np.abs(x).max(), 1e-9))     # calibrated peak level
    v = float(c.get('v', 1.0))
    g = (0.28 + 0.72 * v) if typ == 'ping_dull' else v
    if typ == 'key': g *= 10 ** (rng.uniform(-3, 1.5) / 20)
    if typ in ('window', 'card', 'tick'):
        near = sum(1 for u in times_by_type[typ] if abs(u - t) < 0.25)
        g /= np.sqrt(max(1, near))
    p = 0.0 if pan is None else pan
    place(out, t, x, g, p)
    place(wet, t, x, g * SEND.get(typ, 0.2), p)
    counts[typ] = counts.get(typ, 0) + 1
    pk = db(np.abs(x).max() * g)
    peaks[typ] = max(peaks.get(typ, -200), pk)
out = out + convolve(wet, room)
out = out[:n_of(D)]
out = filt(out, 'hp', 35, order=2)
if np.abs(out).max() > 0.7:
    out *= 0.7 / np.abs(out).max()
write(f'{OUT}/sfx.wav', out)
print('cues:', len(cues), counts)
print('peak dBFS per type (dry):', {k: round(v, 1) for k, v in peaks.items()})
unknown = sorted(set(counts) - set(DESIGN))
if unknown: print('  (generic blip used for unknown types:', unknown, ')')
if '--plot' in args:
    plot_tracks([('sfx', out)], tl, f'{OUT}/plot_sfx.png', 'sfx.wav')
