"""Voice every line of script/film.json with Alibaba's open-source CosyVoice 2, on your own computer.

Each line is spoken in its character's reference timbre (assets/voice_refs/cast/<who>.wav — synthetic voices, no
real person) with the delivery written in the script ("how": e.g. 用老汉低沉的声音，冷淡、干脆地说) via
CosyVoice's instruct mode. Output goes to assets/voice_override/<beat>_<step>.wav, which pipeline/voice.py uses
instead of its own synthesis. See docs/配音-本地CosyVoice教程.md.

usage (run inside the CosyVoice checkout, with its environment active):
  python /path/to/winter-melon/tools/cosyvoice_local.py --model pretrained_models/CosyVoice2-0.5B
options:
  --only s05,s08     only these scenes          --takes 2      write extra takes as <beat>_<step>.take2.wav …
  --no-instruct      plain zero-shot (timbre only, no delivery instructions)
  --stale            only the lines that are new or were rewritten since they were voiced (see texts.json)
"""
import argparse, inspect, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
FILM = os.path.dirname(HERE)                                        # winter-melon/
REF_TEXT = '其实这件事也没那么复杂，你先别着急，我们慢慢来。'          # what every reference clip says
SPEED = {'qin': 0.85, 'xiao': 0.95, 'wang': 0.88, 'lin': 0.95, 'kid': 1.0}

ap = argparse.ArgumentParser()
ap.add_argument('--model', default='pretrained_models/CosyVoice2-0.5B')
ap.add_argument('--only', default='')
ap.add_argument('--takes', type=int, default=1)
ap.add_argument('--no-instruct', action='store_true')
ap.add_argument('--stale', action='store_true', help='only lines that have no file yet or were rewritten since they were voiced')
args = ap.parse_args()

sys.path.append(os.path.join(os.getcwd(), 'third_party', 'Matcha-TTS'))   # CosyVoice needs its bundled Matcha-TTS
from cosyvoice.cli.cosyvoice import CosyVoice2                             # noqa: E402
from cosyvoice.utils.file_utils import load_wav                            # noqa: E402
import soundfile as sf                                                     # noqa: E402

cv = CosyVoice2(args.model, load_jit=False, load_trt=False, fp16=False)
SR = cv.sample_rate

def prompt_arg(fn, who):
    """CosyVoice versions differ: older ones take a 16 kHz tensor, newer ones a wav path."""
    path = os.path.join(FILM, 'assets', 'voice_refs', 'cast', f'{who}.wav')
    names = list(inspect.signature(fn).parameters)
    return path if any(n.startswith('prompt_wav') for n in names) else load_wav(path, 16000)

def speak(text, who, how):
    spd = SPEED.get(who, 1.0)
    if how and not args.no_instruct:
        gen = cv.inference_instruct2(text, how, prompt_arg(cv.inference_instruct2, who), stream=False, speed=spd)
    else:
        gen = cv.inference_zero_shot(text, REF_TEXT, prompt_arg(cv.inference_zero_shot, who), stream=False, speed=spd)
    import torch
    return torch.cat([j['tts_speech'] for j in gen], dim=1).cpu().numpy()[0]

def speakable(t):
    return re.sub(r'[“”"「」]', '', t).replace('……', '').replace('…', '').strip()

S = json.load(open(os.path.join(FILM, 'script', 'film.json'), encoding='utf8'))
only = set(x for x in args.only.split(',') if x)
out = os.path.join(FILM, 'assets', 'voice_override'); os.makedirs(out, exist_ok=True)
mpath = os.path.join(out, 'texts.json')      # which text each file was voiced from (so an old take of a rewritten line is not used)
voiced = json.load(open(mpath, encoding='utf8')) if os.path.exists(mpath) else {}
n = 0
for c in S['chapters']:
    for b in c['beats']:
        if only and b['id'] not in only: continue
        for k, st in enumerate(b['visual'].get('steps', [])):
            if not st.get('say'): continue
            name = f"{b['id']}_{k}.wav"
            if args.stale and voiced.get(name) == st['text'] and os.path.exists(os.path.join(out, name)): continue
            for take in range(1, args.takes + 1):
                x = speak(speakable(st['text']), st['say'], st.get('how', ''))
                f = os.path.join(out, f"{b['id']}_{k}.wav" if take == 1 else f"{b['id']}_{k}.take{take}.wav")
                sf.write(f, x, SR); n += 1
                if take == 1: voiced[f"{b['id']}_{k}.wav"] = st['text']
                print(f"{os.path.basename(f):<16} {st['say']:<4} {len(x) / SR:4.1f}s  {st['text']}   [{st.get('how', '')}]")
json.dump(voiced, open(mpath, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print(f'{n} files -> {out}')
print('听一遍，不满意的句子删掉重跑（--only 场景号），或者把 .take2.wav 改名替换（texts.json 里记的是正文，take 改名不用动它）。然后 git add assets/voice_override 并推送。')
