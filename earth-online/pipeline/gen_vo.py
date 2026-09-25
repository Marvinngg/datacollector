"""Synthesize every voice-over line and build build/timeline.json from real durations.
Timeline = scene lead + (pre gap + line duration)* + scene tail. Everything else reads timeline.json."""
import json, sys, numpy as np, soundfile as sf, sherpa_onnx, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
M = f'{ROOT}/models/kokoro-multi-lang-v1_1/'
spec = json.load(open(f'{ROOT}/pipeline/lines.json'))
sid = int(sys.argv[1]) if len(sys.argv) > 1 else spec['voice_sid']
cfg = sherpa_onnx.OfflineTtsConfig(
    model=sherpa_onnx.OfflineTtsModelConfig(kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
        model=M+'model.onnx', voices=M+'voices.bin', tokens=M+'tokens.txt', data_dir=M+'espeak-ng-data',
        dict_dir=M+'dict', lexicon=M+'lexicon-us-en.txt,'+M+'lexicon-zh.txt'), num_threads=4),
    rule_fsts=M+'date-zh.fst,'+M+'phone-zh.fst,'+M+'number-zh.fst')
tts = sherpa_onnx.OfflineTts(cfg)
os.makedirs(f'{ROOT}/build/vo', exist_ok=True)

def trim(x, sr, thr=0.01):
    idx = np.where(np.abs(x) > thr)[0]
    if len(idx) == 0: return x
    a, b = max(0, idx[0] - int(0.03*sr)), min(len(x), idx[-1] + int(0.08*sr))
    return x[a:b]

t = 0.0; scenes = []; lines = []; sr = None
for sc in spec['scenes']:
    start = t; t += sc['lead']
    for i, ln in enumerate(sc['lines']):
        if i: t += ln.get('pre', 0.5)
        a = tts.generate(ln.get('say', ln['text']), sid=sid, speed=ln.get('speed', spec['speed']))
        sr = a.sample_rate; x = trim(np.array(a.samples, dtype=np.float32), sr)
        sf.write(f"{ROOT}/build/vo/{ln['id']}.wav", x, sr)
        d = len(x) / sr
        lines.append({'id': ln['id'], 'scene': sc['id'], 'text': ln['text'], 'start': round(t, 3), 'dur': round(d, 3)})
        t += d
    t += sc['tail']
    scenes.append({'id': sc['id'], 'start': round(start, 3), 'end': round(t, 3)})
    print(f"{sc['id']:10s} {start:6.2f} -> {t:6.2f}")
tl = {'fps': 30, 'width': 1920, 'height': 1080, 'duration': round(t, 3), 'voice_sid': sid, 'sample_rate': sr,
      'scenes': scenes, 'lines': lines}
json.dump(tl, open(f'{ROOT}/build/timeline.json', 'w'), ensure_ascii=False, indent=1)
print('total', round(t, 2), 's')
