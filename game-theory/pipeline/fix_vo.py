"""Automatic pronunciation repair.
For every narration line whose voice clip fails the ASR pinyin check, try the candidates listed in
script/say_candidates.json (plus the plain text), each synthesized up to --takes times, and keep the first
wording that the ASR hears correctly. Winners go into script.json: a reworded line replaces the line text (subtitles must match the voice);
a punctuation-only fix becomes a beat "say" override. The
clip in build/vo is replaced. Lines that never pass are reported for a human to listen to.
usage: python3 pipeline/fix_vo.py [--takes 3]"""
import argparse, json, os, re, sys
import numpy as np, soundfile as sf, sherpa_onnx
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tts_engines import make_engine
from pinyin_match import distance
import importlib.util, hashlib
def clip_key(say, voice):
    return hashlib.sha1(json.dumps([say, voice], ensure_ascii=False, sort_keys=True).encode()).hexdigest()

ap = argparse.ArgumentParser(); ap.add_argument('--takes', type=int, default=3); args = ap.parse_args()
S = json.load(open(f'{ROOT}/script/script.json'))
cand_file = f'{ROOT}/script/say_candidates.json'
CANDS = json.load(open(cand_file)) if os.path.exists(cand_file) else {}
tl = json.load(open(f'{ROOT}/build/timeline.json'))
A = f'{ROOT}/models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17/'
asr = sherpa_onnx.OfflineRecognizer.from_sense_voice(model=A + 'model.int8.onnx', tokens=A + 'tokens.txt',
                                                     language='zh', use_itn=False, num_threads=4)
synth = make_engine(S['voice']); speed = S['voice'].get('speed', 1.0)
say_map = S.get('say', {})
def hear(x, sr):
    s = asr.create_stream(); s.accept_waveform(sr, x); asr.decode_stream(s); return s.result.text
def trim(x, sr, thr=0.01):
    idx = np.where(np.abs(x) > thr)[0]
    return x if len(idx) == 0 else x[max(0, idx[0] - int(0.03 * sr)): min(len(x), idx[-1] + int(0.08 * sr))]
def words(t):
    return re.sub(r'[^\u4e00-\u9fffA-Za-z0-9]', '', t)
def unmapped(t):
    for k, v in say_map.items(): t = t.replace(v, k)
    return t
def mapped(t):
    for k, v in say_map.items(): t = t.replace(k, v)
    return t

beats = {b['id']: b for c in S['chapters'] for b in c['beats']}
fixed, stuck = [], []
for l in tl['lines']:
    x, sr = sf.read(f"{ROOT}/build/vo/{l['id']}.wav", dtype='float32')
    bid, k = l['id'].rsplit('_', 1)
    spoken = (beats[bid].get('say') or {}).get(k) or mapped(l['text'])
    if distance(spoken, hear(x, sr)) == 0: continue
    tried = []
    for say in [mapped(l['text'])] + [mapped(c) for c in CANDS.get(l['id'], [])]:
        ok = False
        for _ in range(args.takes):
            raw, sr = synth(say, speed); y = trim(np.asarray(raw, np.float32), sr); h = hear(y, sr)
            tried.append((distance(say, h), say, h))   # the wording we asked for must be what is heard
            if tried[-1][0] == 0: ok = True; break
        if ok:
            sf.write(f"{ROOT}/build/vo/{l['id']}.wav", y, sr)
            open(f"{ROOT}/build/vo/{l['id']}.key", 'w').write(clip_key(say, S['voice']))
            if say != mapped(l['text']):
                if words(say) != words(mapped(l['text'])):
                    # the wording itself changed: subtitles must match what is heard, so adopt it as the line text
                    beats[bid]['lines'][int(k)] = unmapped(say); beats[bid].get('say', {}).pop(k, None)
                else:
                    beats[bid].setdefault('say', {})[k] = say     # only punctuation / reading hints differ
            elif k in beats[bid].get('say', {}): beats[bid]['say'].pop(k)   # plain wording won: drop a stale override
            fixed.append((l['id'], say)); break
    else:
        best = min(tried); stuck.append((l['id'], l['text'], best))
json.dump(S, open(f'{ROOT}/script/script.json', 'w'), ensure_ascii=False, indent=2)
for i, s in fixed: print('fixed ', i, s)
for i, t, b in stuck: print('LISTEN', i, t, '| best heard:', b[2], f'(d={b[0]}, say={b[1]})')
print(f'{len(fixed)} fixed, {len(stuck)} need a human ear. Now run gen_vo.py again: it reuses these clips and rebuilds the timeline.')
