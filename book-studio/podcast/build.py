"""book.json -> <outdir>/podcast.mp4 + <outdir>/podcast.json   (called by make.sh)

    python3 build.py <book.json> <outdir>

1. voices    voices.json: two built-in Kokoro v1.1-zh speakers (by speaker id).  No cloning, no reference audio.
2. speech    every line: normalise text -> split long lines at punctuation -> synthesise -> trim; when the
             SenseVoice ASR model is present each line is checked and re-synthesised (slower / re-punctuated)
             if the transcript does not match.  Cached in <outdir>/build/cache.
3. levels    per-voice loudness normalisation (+-2 dB per-line correction), 70 Hz high-pass.
4. timeline  intro sting -> title -> dialogue with deterministic, slightly varied gaps (longer after questions and
             at speaker changes, shorter for same-speaker continuations) -> outro sting swelling after the last line.
5. master    music side-chain ducked under speech, -16 LUFS integrated, true-peak limiter (-1 dBTP after AAC).
6. package   cover.png (PIL) + AAC 112 kb/s in MP4, 1 fps still video, +faststart; podcast.json with timestamps.
"""
import hashlib, json, os, re, subprocess, sys, time, zlib
import numpy as np, soundfile as sf
from scipy import signal
from scipy.ndimage import minimum_filter1d, uniform_filter1d
import pyloudnorm as pyln

from lib import HERE, Kokoro, locate, normalize, split_long, trim, make_asr, transcribe, cer_pinyin
import music, cover

SR = 48000
T0 = time.time()


def log(*a):
    print(f'[{time.time() - T0:6.1f}s]', *a, flush=True)


# ----------------------------------------------------------------------------- speech
class Voices:
    def __init__(self, cfg, cache_dir):
        self.cfg = cfg
        self.tts = Kokoro(locate(cfg['model']))
        self.cache = cache_dir
        os.makedirs(cache_dir, exist_ok=True)
        self.asr = None if os.environ.get('PODCAST_ASR') == '0' else make_asr()
        self.retries = 0

    def voice(self, who, order):
        v = self.cfg['voices']
        if who in v:
            return v[who]
        keys = sorted(v)                      # unknown speaker keys get the configured voices in turn
        return v[keys[order % len(keys)]]

    def _chunk(self, text, sid, speed):
        k = hashlib.sha1(f"{self.cfg['model']}|{sid}|{speed:.3f}|{text}".encode()).hexdigest()[:16]
        p = os.path.join(self.cache, k + '.npy')
        if os.path.exists(p):
            return np.load(p)
        x = trim(self.tts(text, sid, speed), self.tts.sr, pad=0.02)
        np.save(p, x)
        return x

    def render(self, chunks, sid, speed):
        out = []
        for i, c in enumerate(chunks):
            if i:
                out.append(np.zeros(int((0.24 if out and chunks[i - 1][-1] in '。！？' else 0.16) * self.tts.sr), np.float32))
            out.append(self._chunk(c, sid, speed))
        return np.concatenate(out) if out else np.zeros(1, np.float32)

    def line(self, text, voice):
        sid, speed = voice['sid'], voice.get('speed', 1.0)
        said = normalize(text)
        chunks = split_long(said)
        x = self.render(chunks, sid, speed)
        if not self.asr:
            return x, None
        cer = cer_pinyin(said, transcribe(self.asr, x, self.tts.sr))
        if cer <= 0.08:
            return x, cer
        # retry: a little slower; then with every comma turned into a full stop (separate prosodic units)
        best = (cer, x)
        for sp, ch in [(speed * 0.93, chunks), (speed, [c for s in chunks for c in split_long(s.replace('，', '。'), 20)])]:
            y = self.render(ch, sid, sp)
            c2 = cer_pinyin(said, transcribe(self.asr, y, self.tts.sr))
            self.retries += 1
            if c2 < best[0]:
                best = (c2, y)
            if c2 <= 0.08:
                break
        return best[1], best[0]


def to48(x, sr):
    y = signal.resample_poly(x.astype(np.float64), SR, sr) if sr != SR else x.astype(np.float64)
    y = signal.sosfilt(signal.butter(2, 70, 'highpass', fs=SR, output='sos'), y)
    n = min(len(y) // 2, int(0.006 * SR))
    if n > 1:
        y[:n] *= np.linspace(0, 1, n); y[-n:] *= np.linspace(1, 0, n)
    return y


# ----------------------------------------------------------------------------- pacing
def gap(book_id, i, prev, cur):
    """deterministic pause before line i (seconds)"""
    u = (zlib.crc32(f'{book_id}:{i}'.encode()) % 10000) / 10000 - 0.5           # [-0.5, 0.5)
    t = prev['text'].strip()
    if prev['who'] == cur['who']:
        g = 0.20 + 0.06 * u if t.endswith(('，', ',', '、', '：', ':')) else 0.34 + 0.10 * u
    else:
        g = 0.44 + 0.22 * u
    if re.search(r'[？?]\s*$', t):
        g += 0.22
    if len(t) > 40:
        g += 0.08
    return g


# ----------------------------------------------------------------------------- master
def lufs(x):
    return pyln.Meter(SR).integrated_loudness(x if x.ndim == 2 else np.stack([x, x], 1))


def duck_gain(speech, depth_db=-15.0, attack=0.08, release=0.45, thresh_db=-40):
    """side-chain gain for the music from the speech signal (10 ms frames, smoothed attack/release)"""
    h = int(0.01 * SR)
    nfr = len(speech) // h + 1
    pad = np.zeros(nfr * h); pad[:len(speech)] = np.abs(speech)
    env = pad.reshape(nfr, h).max(1)
    active = env > 10 ** (thresh_db / 20) * (env.max() + 1e-12)
    target = np.where(active, 10 ** (depth_db / 20), 1.0)
    # look-ahead so the music is already down when a word starts
    target = minimum_filter1d(target, size=int(attack / 0.01) * 2 + 1)
    g = np.empty_like(target); cur = 1.0
    ka, kr = np.exp(-0.01 / attack), np.exp(-0.01 / release)
    for i, tv in enumerate(target):
        k = ka if tv < cur else kr
        cur = tv + (cur - tv) * k
        g[i] = cur
    return np.interp(np.arange(len(speech)), np.arange(nfr) * h, g)


def true_peak_limit(x, ceiling_db, look=0.02):
    """look-ahead limiter on the 4x-oversampled peak; guarantees |x_os| <= ceiling (smooth ~20 ms gain moves)"""
    c = 10 ** (ceiling_db / 20)
    os4 = signal.resample_poly(x, 4, 1, axis=0)
    pk = np.abs(os4).max(1).reshape(-1, 4).max(1)[:len(x)]
    if len(pk) < len(x):
        pk = np.pad(pk, (0, len(x) - len(pk)))
    req = np.minimum(1.0, c / np.maximum(pk, 1e-9))
    L = int(look * SR)
    g = uniform_filter1d(minimum_filter1d(req, size=2 * L + 1), size=L)
    g = np.minimum(g, req)      # numerical safety
    return x * g[:, None]


def master(mix, target=-16.0, ceiling=-1.5):
    y = mix
    for _ in range(4):
        y = y * 10 ** ((target - lufs(y)) / 20)
        y = true_peak_limit(y, ceiling)
        if abs(lufs(y) - target) < 0.1:
            break
    return y


def ebur128(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-filter_complex', 'ebur128=peak=true',
                        '-f', 'null', '-'], capture_output=True, text=True).stderr
    s = r[r.rfind('Summary:'):]
    g = lambda pat: float(re.search(pat, s, re.S).group(1))
    return {'I': g(r'I:\s+(-?[\d.]+) LUFS'), 'LRA': g(r'LRA:\s+(-?[\d.]+) LU'), 'TP': g(r'Peak:\s+(-?[\d.]+) dBFS')}


# ----------------------------------------------------------------------------- main
def main(book_path, outdir):
    book = json.load(open(book_path, encoding='utf-8'))
    pod = book.get('podcast') or sys.exit('book.json has no "podcast" section')
    lines = [l for l in pod.get('lines', []) if str(l.get('text', '')).strip()]
    if not lines:
        sys.exit('podcast.lines is empty')
    title = pod.get('title') or book.get('title', '')
    book_id = book.get('id', 'book')
    os.makedirs(outdir, exist_ok=True)
    work = os.path.join(outdir, 'build', 'podcast')     # build/ is shared with other pipelines
    os.makedirs(work, exist_ok=True)
    cfg = json.load(open(os.path.join(HERE, 'voices.json'), encoding='utf-8'))

    V = Voices(cfg, os.path.join(work, 'cache'))
    log(f'{len(lines)} lines, voices A={cfg["voices"]["A"]["name"]} B={cfg["voices"]["B"]["name"]}, '
        f'ASR check {"on" if V.asr else "off"}')
    order = {w: i for i, w in enumerate(dict.fromkeys(l['who'] for l in lines))}
    first = lines[0]['who']
    t_syn = time.time()
    intro_line = {'who': first, 'text': pod.get('intro') or title, 'intro': True}
    seq = [intro_line] + lines
    audio, cers = [], []
    for i, l in enumerate(seq):
        x, cer = V.line(l['text'], V.voice(l['who'], order.get(l['who'], 0)))
        audio.append(to48(x, V.tts.sr)); cers.append(cer)
        flag = '' if cer is None or cer <= 0.08 else f'  (ASR cer {cer:.2f})'
        log(f'  {i:2d} {l["who"]} {len(audio[-1]) / SR:5.2f}s {l["text"][:30]}{flag}')
    t_syn = time.time() - t_syn

    # per-voice loudness: voice median -> -20 LUFS, per-line correction limited to +-2 dB
    loud = [lufs(np.pad(a, (0, max(0, int(0.5 * SR) - len(a))))) for a in audio]
    for who in set(l['who'] for l in seq):
        idx = [i for i, l in enumerate(seq) if l['who'] == who and np.isfinite(loud[i])]
        med = float(np.median([loud[i] for i in idx]))
        for i in idx:
            audio[i] *= 10 ** ((-20 - med + np.clip(0.5 * (med - loud[i]), -2, 2)) / 20)

    # timeline
    intro, ic = music.intro()
    outro, oc = music.outro()
    t = ic['title_at']
    stamps = []
    for i, l in enumerate(seq):
        if i == 1:
            t = max(ic['speech_at'], t + 0.9)
        elif i > 1:
            t += gap(book_id, i, seq[i - 1], l)
        stamps.append(t)
        t += len(audio[i]) / SR
    speech_end = t
    outro_at = speech_end + 0.35 - oc['swell_at']
    total = max(outro_at + len(outro) / SR, len(intro) / SR) + 0.3
    N = int(total * SR)
    voice = np.zeros(N)
    for s, a in zip(stamps, audio):
        i = int(s * SR); voice[i:i + len(a)] += a[:N - i]
    mus = np.zeros((N, 2))
    mus[:len(intro)] += intro
    j = int(outro_at * SR); mus[j:j + len(outro)] += outro[:N - j]
    # music sits ~4 LU under the speech when alone, ducked a further 15 dB under the voice
    mus *= 10 ** ((-24 - lufs(intro)) / 20)
    mus *= duck_gain(voice)[:, None]
    mix = mus + voice[:, None]
    y = master(mix)
    wav = os.path.join(work, 'master.wav')
    sf.write(wav, y.astype(np.float32), SR, subtype='FLOAT')
    log(f'mixed {total:.1f}s, pre-AAC {lufs(y):.2f} LUFS')

    # package
    png = cover.render(book, os.path.join(work, 'cover.png'), os.environ.get('PODCAST_COVER', '720x720'))
    mp4 = os.path.join(outdir, 'podcast.mp4')
    kbps = int(min(112, (19 * 2 ** 20 * 0.92 * 8 / total - 8000) / 1000))
    gain_db = 0.0
    for _ in range(3):
        src = wav
        if gain_db:
            src = os.path.join(work, 'master_adj.wav')
            sf.write(src, (y * 10 ** (gain_db / 20)).astype(np.float32), SR, subtype='FLOAT')
        subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-loop', '1', '-framerate', '1',
                        '-i', png, '-i', src, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-tune', 'stillimage',
                        '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-r', '1', '-g', '30',
                        '-c:a', 'aac', '-b:a', f'{kbps}k', '-ar', str(SR), '-t', f'{total:.3f}',
                        '-metadata', f'title={title}', '-movflags', '+faststart', mp4], check=True)
        m = ebur128(mp4)
        if m['TP'] <= -1.0 and abs(m['I'] + 16) <= 0.5:
            break
        # AAC overshoot: pull the limiter ceiling down by the excess and re-encode
        if m['TP'] > -1.0:
            y = true_peak_limit(y * 10 ** ((-16 - m['I']) / 20), -1.5 - (m['TP'] + 1.0) - 0.1)
        else:
            gain_db = -16 - m['I']
    size = os.path.getsize(mp4)
    tl = [{'t': round(s, 2), 'end': round(s + len(a) / SR, 2), 'who': l['who'], 'text': l['text']}
          for s, a, l in zip(stamps, audio, seq)]
    meta = {'file': 'podcast.mp4', 'dur': round(total, 2), 'title': title, 'hosts': pod.get('hosts', {}),
            'voices': {k: {'model': cfg['model'], 'speaker': v['name'], 'sid': v['sid']} for k, v in cfg['voices'].items()},
            'loudness': {'integrated_lufs': m['I'], 'true_peak_dbtp': m['TP'], 'lra_lu': m['LRA']},
            'lines': tl}
    json.dump(meta, open(os.path.join(outdir, 'podcast.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    bad = [i for i, c in enumerate(cers) if c is not None and c > 0.08]
    log(f'done: {mp4}  {total:.1f}s  {size / 2 ** 20:.2f} MiB  I {m["I"]} LUFS  TP {m["TP"]} dBTP  LRA {m["LRA"]}  '
        f'synthesis {t_syn:.1f}s  ASR retries {V.retries}  lines still off: {bad or "none"}')
    if size > 19 * 2 ** 20:
        sys.exit('podcast.mp4 exceeds 19 MiB')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
