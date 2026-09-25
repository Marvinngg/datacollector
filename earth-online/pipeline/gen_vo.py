"""Synthesize every voice-over line and build build/timeline.json from real durations.
Timeline = scene lead + (pre gap + line duration)* + scene tail. Everything else reads timeline.json.

Engine: lines.json "engine" = "kokoro" (default) | "zipvoice" | "vits" | "matcha"; see pipeline/tts_engines.py.
Per-line pronunciation text: "say" is Kokoro-specific; other engines use "say_<engine>" if present, else "text".
Optional "asr_retries": N -> up to N extra takes per line, keeping the take whose SenseVoice transcript matches
"text" best in pinyin (useful for stochastic engines like zipvoice).
usage: gen_vo.py [sid] [--spec lines.json] [--out DIR]   (--out writes vo/ + timeline.json under DIR instead of build/)"""
import json, sys, os, argparse, numpy as np, soundfile as sf
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tts_engines import make_engine
ap = argparse.ArgumentParser(); ap.add_argument('sid', nargs='?', type=int)
ap.add_argument('--spec', default=f'{ROOT}/pipeline/lines.json'); ap.add_argument('--out', default=f'{ROOT}/build')
args = ap.parse_args()
spec = json.load(open(args.spec))
engine = spec.get('engine', 'kokoro')
sid = args.sid if args.sid is not None else spec.get('voice_sid', 0)
synth = make_engine(dict(spec, voice_sid=sid))
os.makedirs(f'{args.out}/vo', exist_ok=True)

def trim(x, sr, thr=0.01):
    idx = np.where(np.abs(x) > thr)[0]
    if len(idx) == 0: return x
    a, b = max(0, idx[0] - int(0.03*sr)), min(len(x), idx[-1] + int(0.08*sr))
    return x[a:b]

def say_of(ln):
    if engine == 'kokoro': return ln.get('say', ln['text'])
    return ln.get(f'say_{engine}', ln['text'])

retries = int(spec.get('asr_retries', 0))
if retries:
    import re, sherpa_onnx
    from pypinyin import lazy_pinyin, Style
    A = f'{ROOT}/models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17/'
    asr = sherpa_onnx.OfflineRecognizer.from_sense_voice(model=A+'model.int8.onnx', tokens=A+'tokens.txt',
                                                         language='zh', use_itn=False, num_threads=4)
    def pys(s):
        s = re.sub(r'[\s，。：、！？,.:!?；;“”"\'…—\-]', '', s).upper().replace('她', '他').replace('它', '他')
        out = []
        for w in re.findall(r'[A-Z]|[^A-Z]+', s):
            out += [w] if re.match(r'[A-Z]', w) else lazy_pinyin(w, style=Style.TONE3, neutral_tone_with_five=True)
        return out
    def ed(a, b):
        d = list(range(len(b)+1))
        for i in range(1, len(a)+1):
            p, d[0] = d[0], i
            for j in range(1, len(b)+1): p, d[j] = d[j], min(d[j]+1, d[j-1]+1, p + (a[i-1] != b[j-1]))
        return d[len(b)]
    def score(x, sr, text):
        s = asr.create_stream(); s.accept_waveform(sr, x); asr.decode_stream(s)
        return ed(pys(text), pys(s.result.text))

def take(ln):
    sp = ln.get('speed', spec['speed']); best = None
    for k in range(1 + retries):
        raw, sr = synth(say_of(ln), sp); x = trim(raw, sr)
        if not retries: return x, sr
        e = score(x, sr, ln['text'])
        if best is None or e < best[0]: best = (e, x, sr)
        if e == 0: break
    if best[0]: print(f"  {ln['id']}: best take still differs from text by {best[0]} pinyin")
    return best[1], best[2]

t = 0.0; scenes = []; lines = []; sr = None
for sc in spec['scenes']:
    start = t; t += sc['lead']
    for i, ln in enumerate(sc['lines']):
        if i: t += ln.get('pre', 0.5)
        x, sr = take(ln)
        sf.write(f"{args.out}/vo/{ln['id']}.wav", x, sr)
        d = len(x) / sr
        lines.append({'id': ln['id'], 'scene': sc['id'], 'text': ln['text'], 'start': round(t, 3), 'dur': round(d, 3)})
        t += d
    t += sc['tail']
    scenes.append({'id': sc['id'], 'start': round(start, 3), 'end': round(t, 3)})
    print(f"{sc['id']:10s} {start:6.2f} -> {t:6.2f}")
tl = {'fps': 30, 'width': 1920, 'height': 1080, 'duration': round(t, 3), 'engine': engine, 'voice_sid': sid,
      'sample_rate': sr, 'scenes': scenes, 'lines': lines}
json.dump(tl, open(f'{args.out}/timeline.json', 'w'), ensure_ascii=False, indent=1)
print('total', round(t, 2), 's')
