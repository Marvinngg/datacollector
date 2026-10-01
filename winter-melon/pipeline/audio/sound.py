"""Sound for 《李叔的冬瓜》: score + ambience + effects + mix -> build/audio/mix.wav (-16 LUFS, true peak <= -1 dBTP).

Score (GeneralUser GS SoundFont): a plain folk tune in D, 72 BPM — nylon guitar fingerpicking, a piano melody,
later a flute and a soft string pad. It stays out of the first act (only a breath of pad at the opening and at
night) and comes in for the first time on the turn in s08 ("music": "in"), as the old man looks at his field.
Ambience is synthesised per scene: dawn birds, summer cicadas, night crickets, wind, a city kitchen's room tone and
the simmering pot. Effects come from build/cues.json (knock, write, ride, phone, paper, box, thud, spoon, slide).
Every time is read from build/timeline.json / build/cues.json; nothing is hard-coded in seconds.
usage: python3 pipeline/audio/sound.py"""
import os, sys
import numpy as np
from scipy import signal
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *   # noqa

R = np.random.default_rng(20261001)
tl = Timeline(); D = tl.duration
beat = {b['id']: b for b in tl.beats}
def B(bid): return beat[bid]
def step(bid, name):
    for s in B(bid)['visual'].get('steps', []):
        if s.get('show') == name: return s
    return None
def scene_of(t):
    for b in tl.beats:
        if b['start'] <= t < b['end']: return b
    return tl.beats[-1]

# ================================================================= score
ensure_sf2(); sf2 = SF2()
GUITAR, PIANO, FLUTE, STRINGS, PAD = 24, 0, 73, 49, 89          # GM presets (bank 0)
BPM = 72; BT = 60 / BPM; BAR = 4 * BT
N = {'B2': 47, 'D3': 50, 'E3': 52, 'F#3': 54, 'G2': 43, 'A2': 45, 'B3': 59, 'D4': 62, 'E4': 64, 'F#4': 66, 'G4': 67,
     'A4': 69, 'B4': 71, 'C#5': 73, 'D5': 74, 'E5': 76, 'F#5': 78, 'A3': 57, 'G3': 55, 'C#4': 61}
# chords: bass + three upper voices for the arpeggio
CH = {'D': ['D3', 'A3', 'D4', 'F#4'], 'Bm': ['B2', 'F#3', 'B3', 'D4'], 'G': ['G2', 'D3', 'B3', 'D4'], 'A': ['A2', 'E3', 'A3', 'C#4'],
      'F#m': ['F#3', 'A3', 'C#4', 'F#4'], 'Asus': ['A2', 'E3', 'A3', 'D4']}
PROG = ['D', 'Bm', 'G', 'A', 'D', 'F#m', 'G', 'Asus']
# 8-bar tune (beats): plain, pentatonic, easy to hum
TUNE = [[('A4', 2), ('F#4', 1), ('E4', 1)], [('D4', 2), ('B3', 1), ('D4', 1)], [('E4', 1.5), ('F#4', .5), ('A4', 1), ('B4', 1)], [('A4', 4)],
        [('A4', 1), ('B4', 1), ('D5', 2)], [('C#5', 1), ('B4', 1), ('F#4', 2)], [('E4', 1), ('F#4', 1), ('A4', 1), ('E4', 1)], [('D4', 4)]]

music = buf(D + 6)
def note(preset, key, t, dur, vel, gain=1.0, pan=0.0, tail=3.0):
    if t >= D + 2: return
    place(music, t, sf2.note(0, preset, N[key] if isinstance(key, str) else key, vel, dur, tail=tail), gain, pan)

def guitar_bar(t, chord, vel=58, gain=1.0, sparse=False):
    v = CH[chord]
    note(GUITAR, v[0], t, BAR * 0.9, vel + 6, gain, -0.1)
    pat = [(0.5, 1), (1.0, 2), (1.5, 3), (2.0, 2), (2.5, 1), (3.0, 2), (3.5, 3)] if not sparse else [(1.0, 2), (2.0, 3), (3.0, 1)]
    for b_, i in pat: note(GUITAR, v[i], t + b_ * BT + R.uniform(0, 0.012), BT * 1.6, vel - 4 + int(R.integers(-4, 4)), gain, 0.15)

def tune_bar(t, k, preset=PIANO, vel=60, gain=1.0, oct=0, pan=-0.05):
    x = t
    for key, d in TUNE[k % 8]:
        note(preset, N[key] + 12 * oct, x + R.uniform(0, 0.01), d * BT * (0.95 if preset == PIANO else 0.92), vel, gain, pan, tail=2.5)
        x += d * BT

# -- opening: a breath of pad, three soft piano notes, a rolled chord on the title
s01 = B('s01'); tt = step('s01', 'title')
note(PAD, 'D3', s01['start'] + 0.2, 9, 40, 0.5); note(PAD, 'A3', s01['start'] + 0.8, 8, 36, 0.4)
for i, k in enumerate(['F#5', 'A4', 'D5']): note(PIANO, k, s01['start'] + 2.2 + i * 2.1, 2, 44, 0.5, 0.2)
if tt:
    for i, k in enumerate(['D3', 'A3', 'D4', 'F#4', 'A4']): note(GUITAR, k, s01['start'] + tt['t'] - s01['start'] + i * 0.11, 4, 56, 0.9, -0.2 + i * 0.1)
# -- night: a held, thin pad while she scrolls; two quiet piano notes when the message appears
for bid in ('s06', 's07'):
    b = B(bid); note(PAD, 'D3', b['start'], b['end'] - b['start'] + 1, 34, 0.35); note(PAD, 'F#3', b['start'] + 1, b['end'] - b['start'], 30, 0.25)
m1 = step('s07', 'msg')
if m1: note(PIANO, 'A4', m1['t'] + 0.3, 2.5, 40, 0.45, 0.2); note(PIANO, 'D5', m1['t'] + 1.3, 3, 38, 0.4, 0.2)
# -- the turn: music comes in and stays to the end
turn = next((s for s in B('s08')['visual']['steps'] if s.get('music') == 'in'), None)
t0 = turn['t'] if turn else B('s09')['start']
end_t = B('s15')['end']
sec = lambda bid: (B(bid)['start'], B(bid)['end'])
bars = []
t = t0
while t < end_t - BAR * 0.5: bars.append(t); t += BAR
under_talk = [sec('s10'), sec('s11')]         # dialogue-heavy: guitar only, lower
melody = [sec('s09'), sec('s12'), sec('s13'), sec('s14')]
flute = [sec('s13')]
in_any = lambda t, spans: any(a - 0.1 <= t < b - 0.5 for a, b in spans)
for i, bt in enumerate(bars):
    ch = PROG[i % 8]
    last = i == len(bars) - 1
    if last: ch = 'D'
    talk = in_any(bt, under_talk)
    guitar_bar(bt, ch, vel=52 if talk else 58, gain=0.75 if talk else 0.95, sparse=(i < 2))
    if in_any(bt, melody) and not talk and not last:
        if in_any(bt, flute): tune_bar(bt, i, FLUTE, 56, 0.6, 0, 0.1)
        else: tune_bar(bt, i, PIANO, 58, 0.85)
    if bt >= sec('s12')[0] and not last:
        note(STRINGS, CH[ch][1], bt, BAR * 1.05, 40, 0.28, -0.3); note(STRINGS, CH[ch][3], bt, BAR * 1.05, 36, 0.24, 0.3)
# final chord, let it ring under the end card
fin = bars[-1] if bars else end_t - 6
for i, k in enumerate(['D3', 'A3', 'D4', 'F#4', 'A4', 'D5']): note(GUITAR, k, fin + i * 0.13, 6, 54, 0.9, -0.25 + i * 0.1, tail=5)
note(STRINGS, 'D4', fin, 7, 40, 0.3); note(STRINGS, 'A3', fin, 7, 38, 0.3)
music = convolve(music, make_ir(rt60=2.2, bright=0.45, seed=3)) * 0.32 + music
music = music[:n_of(D) + 1]
music *= env_points(len(music), [(0, 1.0), (D - 2.5, 1.0), (D - 0.3, 0.0)])[:, None]

# ================================================================= ambience
n = n_of(D) + 1; tt_ = np.arange(n) / SR
def noise(k=1): return R.standard_normal((n, 2)) * k
def scene_gain(spec):          # spec: {scene_id: gain}; smooth 0.8 s crossfades at scene boundaries
    pts = []
    for b in tl.beats:
        g = spec.get(b['id'], 0.0); pts += [(b['start'] + 0.4, g), (b['end'] - 0.4, g)]
    return env_points(n, sorted(pts))[:, None]
amb = np.zeros((n, 2))
# wind / air: everywhere outdoors, very low
wind = filt(noise(), 'lp', 500, order=2); wind = filt(wind, 'hp', 60)
wmod = 0.6 + 0.4 * np.sin(2 * np.pi * tt_ * 0.07)[:, None]
amb += wind * wmod * 0.05 * scene_gain({'s01': 1, 's02': .5, 's04': .6, 's05': .7, 's08': .6, 's09': .7, 's11': .5, 's14': .6, 's15': .8})
# cicadas: band-passed noise, pulsing
cic = filt(noise(), 'bp', 5200, q=3, order=2)
pulse = (0.55 + 0.45 * np.sin(2 * np.pi * tt_ * 38)) * (0.7 + 0.3 * np.sin(2 * np.pi * tt_ * 0.21))
amb += cic * pulse[:, None] * 0.025 * scene_gain({'s02': 1, 's03': .9, 's04': 1, 's05': 1, 's09': 1, 's10': .35, 's11': .9, 's12': .3})
# birds: short chirps (dawn / morning / dusk)
birds = np.zeros((n, 2))
def chirp(t, f0, f1, d, pan):
    k = np.arange(n_of(d)); f = np.linspace(f0, f1, len(k)); ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.sin(np.pi * k / len(k)) ** 2
    place(birds, t, x, 0.06, pan)
bird_spec = {'s01': 1.0, 's02': .6, 's05': .5, 's08': 1.0, 's09': .4, 's14': .5}
for bid, dens in bird_spec.items():
    a, b = sec(bid); t = a + R.uniform(0.3, 1.2)
    while t < b - 0.5:
        f0 = R.uniform(2600, 4200); pan = R.uniform(-0.8, 0.8)
        for j in range(int(R.integers(2, 5))): chirp(t + j * 0.11, f0, f0 * R.uniform(1.1, 1.4), 0.07, pan)
        t += R.uniform(1.2, 3.5) / dens
amb += birds
# crickets: trilled sine bursts at night and dusk
cr = np.zeros(n)
car = np.sin(2 * np.pi * 4600 * tt_)
trill = (np.sin(2 * np.pi * 30 * tt_) > 0.2).astype(float) * ((tt_ % 0.9) < 0.42)
cr = car * trill
cr2 = np.sin(2 * np.pi * 3900 * tt_) * (np.sin(2 * np.pi * 26 * tt_) > 0.3) * (((tt_ + 0.37) % 1.3) < 0.5)
crk = np.stack([cr * 0.9 + cr2 * 0.4, cr * 0.4 + cr2 * 0.9], 1)
amb += filt(crk, 'lp', 7000) * 0.012 * scene_gain({'s06': 1, 's07': .8, 's14': .7, 's15': .6})
# city kitchen: room tone + far traffic + simmering pot
room = filt(noise(), 'lp', 220, order=2)
amb += room * 0.07 * scene_gain({'s13': 1})
sim = np.zeros((n, 2)); a, b = sec('s13'); sp = step('s13', 'soup'); ts = sp['t'] - 1.0 if sp else a + 6
t = ts
while t < b:
    k = np.arange(n_of(0.03)); x = np.sin(2 * np.pi * R.uniform(150, 300) * k / SR) * np.exp(-k / (0.006 * SR))
    place(sim, t, x, 0.05 * min(1, (t - ts) / 2), R.uniform(-0.3, 0.3)); t += R.uniform(0.04, 0.18)
amb += filt(sim, 'lp', 1500)
# shed interior (s10, s12): muffle whatever is outside
amb = amb

# ================================================================= effects (from cues)
fx = np.zeros((n + n_of(3), 2))
def knock(t):   # a hollow 冬瓜 thump
    k = np.arange(n_of(0.45)); e = np.exp(-k / (0.06 * SR))
    x = (np.sin(2 * np.pi * 165 * k / SR) * 0.8 + np.sin(2 * np.pi * 290 * k / SR) * 0.35 + np.sin(2 * np.pi * 520 * k / SR) * 0.12 * np.exp(-k / (0.015 * SR))) * e
    click = filt(R.standard_normal(len(k)) * np.exp(-k / (0.002 * SR)), 'lp', 2500) * 0.4
    place(fx, t, x + click, 0.5, 0.05)
def thud(t, g=0.5):
    k = np.arange(n_of(0.5)); x = np.sin(2 * np.pi * 70 * k / SR) * np.exp(-k / (0.08 * SR)) + filt(R.standard_normal(len(k)), 'lp', 400) * np.exp(-k / (0.03 * SR)) * 0.5
    place(fx, t, x, g)
def write_(t, d):
    m = n_of(d); x = filt(R.standard_normal(m), 'bp', 3500, q=1.2)
    tk = np.arange(m) / SR; strokes = (np.sin(2 * np.pi * 3.1 * tk + np.sin(tk * 7)) > -0.2) * (0.5 + 0.5 * np.sin(2 * np.pi * 11 * tk) ** 2)
    place(fx, t, x * strokes * 0.05, 1.0, -0.1)
def ride(t, d):  # small motor tricycle: low putter + wheel rumble
    m = n_of(d); tk = np.arange(m) / SR
    put = filt(R.standard_normal(m), 'lp', 180, order=2) * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 9 * tk)))
    rum = filt(R.standard_normal(m), 'bp', 900, q=0.8) * 0.15
    env = np.minimum(1, tk / 1.0) * np.minimum(1, (d - tk) / 1.5)
    place(fx, t, (put * 0.35 + rum) * env, 0.6)
def phone(t):
    k = np.arange(n_of(0.6)); x = (np.sin(2 * np.pi * 1318 * k / SR) * np.exp(-k / (0.09 * SR)))
    k2 = np.arange(n_of(0.6)); y = np.sin(2 * np.pi * 1760 * k2 / SR) * np.exp(-k2 / (0.12 * SR))
    place(fx, t, x * 0.05, 1, 0.1); place(fx, t + 0.12, y * 0.04, 1, 0.1)
def paper(t):
    m = n_of(0.5); x = filt(R.standard_normal(m), 'bp', 4200, q=0.9) * (R.random(m) < 0.3) * np.hanning(m)
    place(fx, t, x * 0.12, 1, -0.05)
def box(t):
    m = n_of(0.35); k = np.arange(m)
    x = filt(R.standard_normal(m), 'lp', 900) * np.exp(-k / (0.04 * SR)) + np.sin(2 * np.pi * 120 * k / SR) * np.exp(-k / (0.05 * SR)) * 0.6
    place(fx, t, x * 0.35, 1)
def spoon(t):
    k = np.arange(n_of(0.8)); x = sum(np.sin(2 * np.pi * f * k / SR) * np.exp(-k / (d * SR)) * a for f, d, a in [(2480, 0.25, 1), (3710, 0.15, 0.5), (5120, 0.08, 0.3)])
    place(fx, t, x * 0.04, 1, 0.15)
def slide(t, d):
    m = n_of(d); x = filt(R.standard_normal(m), 'bp', 1800, q=2) * np.hanning(m) * 0.02
    place(fx, t, x, 1, 0.3)
for c in tl.cues:
    ty, t = c.get('type'), c['t']
    if ty == 'knock': knock(t)
    elif ty == 'thud': thud(t)
    elif ty == 'write': write_(t, c.get('dur', 2.0))
    elif ty == 'ride': ride(t, c.get('dur', 8.0))
    elif ty == 'phone': phone(t)
    elif ty == 'paper': paper(t)
    elif ty == 'box': box(t)
    elif ty == 'spoon': spoon(t)
    elif ty == 'slide': slide(t, c.get('dur', 2.0))
    elif ty == 'door': thud(t, 0.25)
fx = fx[:n]
fx = convolve(fx, make_ir(rt60=0.6, bright=0.4, seed=5)) * 0.25 + fx

# ================================================================= voices (pipeline/voice.py) + ducking
vo = np.zeros((n + n_of(3), 2)); speech = np.zeros(n + n_of(3))
import soundfile as sf_
for b in tl.beats:
    for st in b['visual'].get('steps', []):
        if not st.get('vo'): continue
        x, vsr = sf_.read(os.path.join(ROOT, st['vo']), dtype='float64')
        if x.ndim > 1: x = x.mean(1)
        if vsr != SR: x = signal.resample_poly(x, SR // 1000, vsr // 1000)
        t = st['t'] + 0.18                                   # the line appears on screen a moment before it is spoken
        x = filt(filt(x, 'hp', 90), 'peak', 3000, q=1.0, gain_db=2.0)
        place(vo, t, x, 1.0, 0.0)
        i = n_of(t); speech[i:i + len(x)] = 1.0
vo = vo[:n]; speech = speech[:n]
vo = convolve(vo, make_ir(rt60=0.45, bright=0.5, seed=7)) * 0.10 + vo
from scipy.ndimage import uniform_filter1d
duck = np.clip(uniform_filter1d(speech, n_of(0.5)) * 1.6, 0, 1)[:, None]   # smooth: in ~0.25 s, out ~0.25 s

# ================================================================= mix
music = to_stereo(music)[:n]; music = np.pad(music, ((0, n - len(music)), (0, 0)))
mix = music * (1 - 0.5 * duck) + amb * 2.0 * (1 - 0.4 * duck) + fx * 1.2 + vo * 0.9   # ambience carries the first act (no score until s08)
mix = filt(mix, 'hp', 35)
L0 = lufs(mix); g = 10 ** ((-16.0 - L0) / 20); mix *= g
mix = limiter(mix, ceiling_db=-1.2)
os.makedirs(OUT, exist_ok=True)
write(os.path.join(OUT, 'music.wav'), music * g); write(os.path.join(OUT, 'mix.wav'), mix)
print(f'mix: {lufs(mix):.2f} LUFS, true peak {true_peak_db(mix):.2f} dBTP, gain {20 * np.log10(g):+.1f} dB, {len(tl.cues)} cues')
