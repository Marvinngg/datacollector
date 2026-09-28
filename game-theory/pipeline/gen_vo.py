"""Script -> voice-over clips -> timeline.
Reads script/script.json, synthesizes every narration line (build/vo/<line>.wav) and writes build/timeline.json:
  chapters [{id,num,title,part,start,end,card:[a,b]|null}]
  beats    [{id,chapter,start,end,visual,lines:[{id,text,start,dur}]}]   (visual "ref" resolved, step times absolute)
  lines    [{id,text,start,dur}]                                         (flat, for subtitles and the mix)
Pacing knobs live in PACE below; the voice lives in script.json "voice".
Clips are cached per line (build/vo/<line>.key = hash of spoken text + voice), so clips repaired by fix_vo.py
survive re-runs; change the text or the voice and that clip is re-synthesized.
usage: python3 pipeline/gen_vo.py [--script script/script.json] [--out build]"""
import argparse, copy, hashlib, json, os, sys
import numpy as np, soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tts_engines import make_engine
from pinyin_match import speakable

PACE = {
    'card': 2.6,        # chapter title card (no voice)
    'lead': 0.45,       # silence before the first line of a beat
    'gap': 0.42,        # between lines of one beat
    'tail': 0.85,       # after the last line of a beat (lets the visual settle)
    'hold_min': 3.0,    # minimum beat length
}

ap = argparse.ArgumentParser()
ap.add_argument('--script', default=f'{ROOT}/script/script.json')
ap.add_argument('--out', default=f'{ROOT}/build')
args = ap.parse_args()
S = json.load(open(args.script))
voice = S['voice']
synth = make_engine(voice)
os.makedirs(f'{args.out}/vo', exist_ok=True)
say_map = S.get('say', {})  # global pronunciation replacements {"写法": "读法"}


def trim(x, sr, thr=0.01):
    idx = np.where(np.abs(x) > thr)[0]
    if len(idx) == 0: return x
    return x[max(0, idx[0] - int(0.03 * sr)): min(len(x), idx[-1] + int(0.08 * sr))]


def clip_key(say, voice):
    return hashlib.sha1(json.dumps([say, voice], ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def say_of(text, line_say=None):
    t = line_say or text
    for k, v in say_map.items(): t = t.replace(k, v)
    return speakable(t) if voice.get('cn_numbers', True) else t


beats_by_id = {b['id']: b for c in S['chapters'] for b in c['beats']}
t = 0.0; sr = None
chapters, beats, lines = [], [], []
for c in S['chapters']:
    c_start = t; card = None
    if c.get('card', True):
        card = [round(t, 3), round(t + PACE['card'], 3)]; t += PACE['card']
    for b in c['beats']:
        b_start = t; t += PACE['lead'] if b['lines'] else 0
        blines = []
        for k, text in enumerate(b['lines']):
            if k: t += PACE['gap']
            lid = f"{b['id']}_{k}"
            say = say_of(text, (b.get('say') or {}).get(str(k)))
            key = clip_key(say, voice); wav = f'{args.out}/vo/{lid}.wav'
            kf = wav[:-4] + '.key'
            if os.path.exists(wav) and os.path.exists(kf) and open(kf).read() == key:
                x, sr = sf.read(wav, dtype='float32')           # cached (possibly repaired by fix_vo.py)
            else:
                raw, sr = synth(say, voice.get('speed', 1.0))
                x = trim(np.asarray(raw, dtype=np.float32), sr)
                sf.write(wav, x, sr); open(wav[:-4] + '.key', 'w').write(key)
            ln = {'id': lid, 'text': text, 'start': round(t, 3), 'dur': round(len(x) / sr, 3)}
            blines.append(ln); lines.append(ln); t += len(x) / sr
        t += PACE['tail'] if b['lines'] else 0
        t = max(t, b_start + PACE['hold_min'], b_start + b.get('hold', 0))
        vis = copy.deepcopy(b['visual'])
        if 'ref' in vis:  # inherit the referenced beat's visual params, keep own steps
            base = copy.deepcopy(beats_by_id[vis['ref']]['visual']); base.update({k: v for k, v in vis.items() if k != 'ref'})
            base['ref'] = vis['ref']; vis = base
        for st in vis.get('steps', []):  # absolute trigger time for every step
            k = st.get('at', 0)
            st['t'] = round((blines[k]['start'] if k < len(blines) else b_start) + st.get('delay', 0), 3)
        beats.append({'id': b['id'], 'chapter': c['id'], 'start': round(b_start, 3), 'end': round(t, 3),
                      'visual': vis, 'lines': blines})
    chapters.append({'id': c['id'], 'num': c.get('num', ''), 'title': c['title'], 'part': c.get('part', ''),
                     'start': round(c_start, 3), 'end': round(t, 3), 'card': card})
    print(f"{c['id']} {c['title']:<12} {c_start:7.2f} -> {t:7.2f}")

tl = {'fps': 30, 'width': 1920, 'height': 1080, 'duration': round(t + 0.5, 3), 'sample_rate': sr,
      'title': S['title'], 'credit': S.get('credit', ''), 'chapters': chapters, 'beats': beats, 'lines': lines}
json.dump(tl, open(f'{args.out}/timeline.json', 'w'), ensure_ascii=False, indent=1)
print(f"total {tl['duration']:.1f}s = {tl['duration'] / 60:.1f} min, {len(lines)} lines, {len(beats)} beats")
