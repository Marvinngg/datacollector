"""Original intro / outro stings for the podcast, rendered offline from the GeneralUser GS SoundFont (tinysoundfont).

Mood: calm, warm, late at night.  Key D-flat major, slow (~66 BPM), soft Rhodes-style electric piano over a warm pad,
a fretless/acoustic bass root and a few music-box notes for the "lamp" motif.  Everything is deterministic.

intro()  -> (stereo float64 @ 48 kHz, cues)  cues: {'title_at': s, 'speech_at': s}  (where the voice may come in)
outro()  -> (stereo float64 @ 48 kHz, cues)  cues: {'swell_at': s}  (the point that should line up with the end
            of the last spoken line; everything before it is quiet enough to sit under the voice)
"""
import numpy as np
from scipy import signal
from lib import locate, SF2 as SF2_NAME

SR = 48000
EP, PAD, MBOX, BASS, STRINGS = (0, 4), (0, 89), (0, 10), (0, 32), (0, 49)
BEAT = 60 / 66


def n_of(t): return int(round(t * SR))


class SF2:
    def __init__(self):
        import tinysoundfont
        self.syn = tinysoundfont.Synth(samplerate=SR, gain=0)
        self.sfid = self.syn.sfload(locate(SF2_NAME), max_voices=64)
        self.cache = {}

    def note(self, prog, key, vel, dur, tail=3.0):
        k = (prog, key, vel, round(dur, 3), tail)
        if k in self.cache:
            return self.cache[k]
        s = self.syn
        s.program_select(0, self.sfid, prog[0], prog[1])
        s.noteon(0, int(key), int(vel))
        a = np.frombuffer(s.generate(max(1, n_of(dur))), dtype=np.float32)
        s.noteoff(0, int(key))
        b = np.frombuffer(s.generate(n_of(tail)), dtype=np.float32)
        s.notes_off(0); s.sounds_off(0); s.generate(256)
        x = np.concatenate([a, b]).reshape(-1, 2).astype(np.float64)
        e = np.abs(x).max(1); idx = np.where(e > 1e-5)[0]
        x = x[:idx[-1] + 1] if len(idx) else x[:1]
        n = min(len(x), n_of(0.3))
        if n > 1:
            x[-n:] *= np.linspace(1, 0, n)[:, None]
        rl, rr = np.sqrt((x[:, 0] ** 2).mean()) + 1e-12, np.sqrt((x[:, 1] ** 2).mean()) + 1e-12
        x = x * np.array([np.sqrt(rr / rl), np.sqrt(rl / rr)])      # centre hard-panned samples
        self.cache[k] = x
        return x


def place(dst, t, x, gain=1.0, pan=0.0):
    i = n_of(t); j = min(len(dst), i + len(x))
    if j <= i:
        return
    a = (pan + 1) * np.pi / 4
    dst[i:j] += x[:j - i] * gain * np.array([np.cos(a), np.sin(a)]) * np.sqrt(2)


def make_ir(rt60=2.6, seed=7):
    rng = np.random.default_rng(seed)
    n = n_of(rt60 * 1.2); t = np.arange(n) / SR
    ir = np.zeros((n, 2))
    for (lo, hi), rtm, g in zip([(80, 400), (400, 1500), (1500, 4500), (4500, 10000)],
                                [1.1, 1.0, 0.75, 0.45], [1.0, 0.9, 0.5, 0.18]):
        sos = signal.butter(2, [lo, hi], 'bandpass', fs=SR, output='sos')
        nz = signal.sosfilt(sos, rng.standard_normal((n, 2)), axis=0)
        ir += g * nz * np.exp(-6.91 * t / (rt60 * rtm))[:, None]
    ir *= (1 - np.exp(-t / 0.015))[:, None]
    ir = np.concatenate([np.zeros((n_of(0.02), 2)), ir])
    return ir / np.sqrt((ir ** 2).sum() / 2)


def reverb(x, ir, wet=0.28):
    w = np.stack([signal.oaconvolve(x[:, c], ir[:, c])[:len(x)] for c in range(2)], 1)
    return x + wet * w


def warm(x):
    """gentle tone: roll off sub-rumble and the top end so the sting stays soft"""
    sos_h = signal.butter(2, 45, 'highpass', fs=SR, output='sos')
    sos_l = signal.butter(2, 7500, 'lowpass', fs=SR, output='sos')
    return signal.sosfilt(sos_l, signal.sosfilt(sos_h, x, axis=0), axis=0)


def _render(events, length):
    sf = SF2()
    dry = np.zeros((n_of(length + 4), 2))
    for t, prog, key, vel, dur, gain, pan in events:
        place(dry, t, sf.note(prog, key, vel, dur), gain, pan)
    y = warm(reverb(dry, make_ir()))
    y = y[:n_of(length)]
    fo = n_of(1.2)
    y[-fo:] *= np.cos(np.linspace(0, np.pi / 2, fo))[:, None] ** 2
    return y / (np.abs(y).max() + 1e-12) * 0.5


def chord(t, keys, vel, dur, spread=0.06, gain=1.0, prog=EP, pan_w=0.35):
    ev = []
    for i, k in enumerate(keys):
        p = (i / max(1, len(keys) - 1) - 0.5) * 2 * pan_w
        ev.append((t + i * spread, prog, k, vel - 3 * (i % 2), dur - i * spread, gain, p))
    return ev


# D-flat major voicings (MIDI): Gbmaj9, Dbmaj9 (add9), Bbm9, Absus4
GB_MAJ9 = [54, 61, 65, 68, 70]      # Gb3 Db4 F4 Ab4 Bb4
DB_MAJ9 = [49, 60, 63, 65, 68]      # Db3 C4 Eb4 F4 Ab4
BB_M9 = [46, 56, 60, 61, 65]        # Bb2 Ab3 C4 Db4 F4
AB_SUS = [56, 61, 63, 66]           # Ab3 Db4 Eb4 Gb4


def intro():
    b = BEAT
    ev = []
    ev += [(0.0, PAD, k, 58, 6 * b, 0.55, 0) for k in [54, 61, 65]]
    ev += [(3 * b, PAD, k, 56, 5 * b, 0.5, 0) for k in [49, 56, 60, 65]]
    ev += chord(0.15, GB_MAJ9, 52, 3 * b)
    ev += [(0.1, BASS, 42, 60, 3 * b, 0.8, 0), (3 * b, BASS, 37, 60, 5 * b, 0.8, 0)]
    ev += chord(3 * b, DB_MAJ9, 50, 5 * b)
    # lamp motif on music box: Ab5 F5 Eb5 ... Db6 (rises, settles)
    for i, (beat, k, v) in enumerate([(1.0, 80, 46), (1.5, 77, 40), (2.0, 75, 42), (3.5, 80, 44), (4.0, 85, 40)]):
        ev.append((beat * b, MBOX, k, v, 1.4, 0.45, 0.2 if i % 2 else -0.2))
    length = 8 * b + 1.5
    return _render(ev, length), {'title_at': 2.3 * b, 'speech_at': 5.2 * b}


def outro():
    b = BEAT
    ev = []
    # bars 1-2 quiet (sits under the last line), swell at bar 3, resolve on Db
    ev += [(0.0, PAD, k, 50, 4 * b, 0.45, 0) for k in [46, 56, 61]]
    ev += chord(0.1, BB_M9, 42, 2 * b, gain=0.7)
    ev += chord(2 * b, AB_SUS, 44, 2 * b, gain=0.75)
    ev += [(0.0, BASS, 34, 50, 2 * b, 0.6, 0), (2 * b, BASS, 44, 52, 2 * b, 0.6, 0)]
    s = 4 * b                                       # swell: the last line has ended here
    ev += [(s, PAD, k, 58, 6 * b, 0.6, 0) for k in [54, 61, 65]]
    ev += chord(s, GB_MAJ9, 54, 3 * b)
    ev += [(s, BASS, 42, 62, 3 * b, 0.85, 0), (s + 3 * b, BASS, 37, 62, 6 * b, 0.85, 0)]
    ev += [(s + 3 * b, PAD, k, 56, 6 * b, 0.55, 0) for k in [49, 56, 60, 65]]
    ev += chord(s + 3 * b, DB_MAJ9, 50, 6 * b, spread=0.09)
    for i, (beat, k, v) in enumerate([(1.0, 80, 44), (1.5, 77, 40), (2.0, 75, 40), (3.0, 73, 42), (4.5, 85, 34)]):
        ev.append((s + beat * b, MBOX, k, v, 1.6, 0.45, 0.2 if i % 2 else -0.2))
    length = s + 9 * b + 1.0
    return _render(ev, length), {'swell_at': s}


if __name__ == '__main__':
    import soundfile as sf, sys, os
    d = sys.argv[1] if len(sys.argv) > 1 else '.'
    for name, fn in [('intro', intro), ('outro', outro)]:
        y, c = fn()
        sf.write(os.path.join(d, f'{name}.wav'), y.astype(np.float32), SR)
        print(name, f'{len(y) / SR:.2f}s', c)
