"""Shared helpers for the book-studio podcast pipeline.

- locate(): finds a model / asset in podcast/models/ first, then in earth-online/models/ (reuse when present)
- Kokoro(): one sherpa-onnx Kokoro instance, built-in speakers only (selected by speaker id)
- normalize(): makes arbitrary script text safe for TTS (numbers -> 汉字, symbols, English acronyms, quotes ...)
- split_long(): splits very long lines at punctuation
- trim(), f0_track(), ASR helpers used by cast.py / verify.py
"""
import os, re
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
MODEL_DIRS = [os.path.join(HERE, 'models'), os.path.join(REPO, 'earth-online', 'models')]

KOKORO = 'kokoro-multi-lang-v1_1'
ASR = 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17'
SF2 = 'sf2/GeneralUser-GS.sf2'
FONT_BOLD = 'fonts/NotoSerifSC-Bold.otf'
FONT_REG = 'fonts/NotoSerifSC-Regular.otf'


def locate(name, required=True):
    for d in MODEL_DIRS:
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    if required:
        raise SystemExit(f'missing {name}: run  bash book-studio/podcast/setup.sh')
    return None


# ----------------------------------------------------------------------------- TTS (built-in voices only)
class Kokoro:
    """Kokoro via sherpa-onnx. Only the model's built-in speaker table is used (sid); no voice prompts."""
    def __init__(self, model_dir=None, threads=4):
        import sherpa_onnx
        M = (model_dir or locate(KOKORO)).rstrip('/') + '/'
        cfg = sherpa_onnx.OfflineTtsConfig(
            model=sherpa_onnx.OfflineTtsModelConfig(
                kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
                    model=M + 'model.onnx', voices=M + 'voices.bin', tokens=M + 'tokens.txt',
                    data_dir=M + 'espeak-ng-data', dict_dir=M + 'dict',
                    lexicon=M + 'lexicon-us-en.txt,' + M + 'lexicon-zh.txt'),
                num_threads=threads),
            rule_fsts=M + 'date-zh.fst,' + M + 'phone-zh.fst,' + M + 'number-zh.fst',
            max_num_sentences=1)
        self.tts = sherpa_onnx.OfflineTts(cfg)
        self.sr = self.tts.sample_rate
        self.n_speakers = self.tts.num_speakers

    def __call__(self, text, sid, speed=1.0):
        a = self.tts.generate(text, sid=int(sid), speed=float(speed))
        return np.array(a.samples, np.float32)


# ----------------------------------------------------------------------------- text normalisation
DIG = '零一二三四五六七八九'
MEASURE = set('个次天位种条本件只张份块句步周回场层年月岁口家所把双台部首段节杯碗瓶辆座栋间分秒')


def _int4(n):
    """0 < n < 10000"""
    s, units, zero = '', ['千', '百', '十', ''], False
    for i, u in enumerate(units):
        d = (n // 10 ** (3 - i)) % 10
        if d == 0:
            zero = bool(s)
            continue
        if zero:
            s += '零'; zero = False
        s += DIG[d] + u
    return s


def num_zh(n):
    n = int(n)
    if n == 0:
        return '零'
    out, parts = '', [(10 ** 8, '亿'), (10 ** 4, '万'), (1, '')]
    rest, started = n, False
    for base, u in parts:
        q = rest // base; rest %= base
        if q:
            if started and q < 1000:
                out += '零'
            out += (num_zh(q) if q >= 10000 else _int4(q)) + u
            started = True
        elif started and rest and not out.endswith('零'):
            pass
    out = re.sub('零+', '零', out).rstrip('零')
    if out.startswith('一十'):
        out = out[1:]
    if re.match('二[千万亿]', out):
        out = '两' + out[1:]
    return out


def digits_zh(s):
    return ''.join(DIG[int(c)] for c in s)


def _number(m):
    return _numstr(m.group(0), m.string[m.end():m.end() + 1])


def _numstr(s, nxt=''):
    if '.' in s:
        a, b = s.split('.', 1)
        return num_zh(a) + '点' + digits_zh(b)
    if nxt == '年' and len(s) == 4:
        return digits_zh(s)                     # 2024年 -> 二零二四年
    if (len(s) > 1 and s[0] == '0') or len(s) > 12:
        return digits_zh(s)                     # codes, phone numbers
    z = num_zh(s)
    if s == '2' and nxt in MEASURE:
        return '两'
    return z


SYMBOLS = {'&': '和', '+': '加', '=': '等于', '@': ' at ', '#': '', '*': '', '_': ' ', '~': '，', '～': '，',
           '/': '，', '|': '，', '\\': '，'}


def normalize(text):
    t = text
    t = re.sub(r'\*\*|__|`', '', t)                                # markdown emphasis
    t = re.sub(r'https?://\S+', '', t)
    t = re.sub(r'[\U0001F000-\U0001FAFF☀-➿️]', '', t)  # emoji
    t = t.replace('……', '，').replace('…', '，').replace('...', '，')
    t = re.sub(r'[—–]+', '，', t)
    t = re.sub(r'[“”‘’「」『』《》〈〉"\'【】\[\]]', '', t)
    t = re.sub(r'[（(]', '，', t); t = re.sub(r'[）)]', '，', t)
    t = re.sub(r'(?<!\d)(\d{1,2}):(\d{2})(?!\d)',
               lambda m: num_zh(m.group(1)) + '点' + (num_zh(m.group(2)) + '分' if int(m.group(2)) else ''), t)
    t = re.sub(r'\d+(?:-\d+){1,3}', lambda m: digits_zh(m.group(0).replace('-', ''))
               if (m.group(0)[0] == '0' or len(m.group(0)) > 9) else m.group(0), t)          # phone / codes
    t = t.replace(':', '：').replace(';', '；').replace('?', '？').replace('!', '！')
    t = re.sub(r'(?<=[一-鿿]),', '，', t)
    t = re.sub(r'(?<=[一-鿿])\.(?!\d)', '。', t)
    # numbers: percentages, ranges, ordinals, decimals, plain integers (thousands separators removed first)
    t = re.sub(r'(?<=\d),(?=\d{3})', '', t)
    t = re.sub(r'(\d+(?:\.\d+)?)\s*[%％]', lambda m: '百分之' + _numstr(m.group(1)), t)
    t = re.sub(r'(?<!\d)([1-9]\d{0,3})\s*[-–~～]\s*([1-9]\d{0,3})(?!\d)', lambda m: m.group(1) + '到' + m.group(2), t)
    t = re.sub(r'\d+(?:\.\d+)?', _number, t)
    # ALL-CAPS acronyms are spelled out letter by letter (AI -> A I); other English is left to the lexicon
    t = re.sub(r'(?<![A-Za-z])([A-Z]{2,5})(?![A-Za-z])', lambda m: ' '.join(m.group(1)), t)
    for k, v in SYMBOLS.items():
        t = t.replace(k, v)
    t = re.sub(r'\s+', ' ', t)
    t = re.sub(r'(?<=[\u4e00-\u9fff，。！？；：、]) | (?=[\u4e00-\u9fff，。！？；：、])', '', t)
    t = re.sub(r'\s*([，。！？；：、])\s*', r'\1', t)
    t = re.sub(r'([，、；：])[，、；：]+', r'\1', t)
    t = re.sub(r'[，、；：]+([。！？])', r'\1', t)
    t = t.strip(' ，、；：')
    if t and t[-1] not in '。！？':
        t += '。'
    return t


def split_long(text, max_len=48):
    """split a normalised line into chunks of <= ~max_len chars, preferring sentence ends, then commas"""
    if len(text) <= max_len:
        return [text]
    sents = [s for s in re.split(r'(?<=[。！？])', text) if s]
    out = []
    for s in sents:
        if len(s) <= max_len:
            out.append(s); continue
        parts = [p for p in re.split(r'(?<=[，；：、])', s) if p]
        cur = ''
        for p in parts:
            if cur and len(cur) + len(p) > max_len:
                out.append(cur); cur = ''
            cur += p
        if cur:
            out.append(cur)
    # merge tiny fragments into neighbours
    merged = []
    for s in out:
        if merged and (len(s) < 6 or len(merged[-1]) < 6) and len(merged[-1]) + len(s) <= max_len + 10:
            merged[-1] += s
        else:
            merged.append(s)
    # a chunk that still exceeds the limit (no punctuation at all) is cut hard
    final = []
    for s in merged:
        while len(s) > max_len + 10:
            final.append(s[:max_len]); s = s[max_len:]
        final.append(s)
    return final


# ----------------------------------------------------------------------------- analysis
def trim(x, sr, thresh_db=-45, pad=0.03):
    if not len(x):
        return x
    win = max(1, int(0.01 * sr))
    e = np.sqrt(np.convolve(x.astype(np.float64) ** 2, np.ones(win) / win, 'same'))
    ref = e.max() + 1e-12
    idx = np.where(e > ref * 10 ** (thresh_db / 20))[0]
    if not len(idx):
        return x[:0]
    a = max(0, idx[0] - int(pad * sr)); b = min(len(x), idx[-1] + int(pad * sr))
    return x[a:b]


def f0_track(x, sr, fmin=70, fmax=400, hop=0.01, win=0.04):
    """normalised-autocorrelation pitch tracker (vectorised over frames) -> f0 of the voiced frames"""
    x = x.astype(np.float64)
    n, h = int(win * sr), int(hop * sr)
    lo, hi = int(sr / fmax), int(sr / fmin)
    starts = np.arange(0, len(x) - n - hi, h)
    if not len(starts):
        return np.zeros(0)
    F = x[starts[:, None] + np.arange(n + hi)[None, :]]
    A = F[:, :n] - F[:, :n].mean(1, keepdims=True)
    rms_all = np.sqrt(np.mean(x ** 2)) + 1e-12
    keep = np.sqrt((A ** 2).mean(1)) >= 0.3 * rms_all
    A, F = A[keep], F[keep]
    if not len(A):
        return np.zeros(0)
    e0 = (A ** 2).sum(1)
    best, lag = np.zeros(len(A)), np.ones(len(A))
    for L in range(lo, hi):
        B = F[:, L:L + n]
        B = B - B.mean(1, keepdims=True)
        c = (A * B).sum(1) / np.sqrt(e0 * (B ** 2).sum(1) + 1e-12)
        m = c > best
        best[m], lag[m] = c[m], L
    return sr / lag[best > 0.75]


def make_asr(threads=4):
    import sherpa_onnx
    A = locate(ASR, required=False)
    if not A:
        return None
    A += '/'
    return sherpa_onnx.OfflineRecognizer.from_sense_voice(model=A + 'model.int8.onnx', tokens=A + 'tokens.txt',
                                                         language='zh', use_itn=False, num_threads=threads)


def transcribe(asr, x, sr):
    s = asr.create_stream(); s.accept_waveform(sr, x.astype(np.float32)); asr.decode_stream(s)
    return s.result.text


def cer_pinyin(ref, hyp):
    """character error rate on pinyin (homophones count as correct; misreadings do not)"""
    from pypinyin import lazy_pinyin
    clean = lambda s: re.sub(r'[^一-鿿A-Za-z0-9]', '', s).lower()
    r, h = lazy_pinyin(clean(ref)), lazy_pinyin(clean(hyp))
    if not r:
        return 0.0
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = d[j]
            d[j] = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev = cur
    return d[len(h)] / len(r)
