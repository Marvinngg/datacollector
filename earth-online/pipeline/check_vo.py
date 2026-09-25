"""Pronunciation check: transcribe every build/vo/Lxx.wav with SenseVoice and compare pinyin with the script.
Needs: WITH_ASR=1 bash pipeline/fetch_models.sh
Usage: python3 pipeline/check_vo.py      (exit code 1 if any line's pinyin differs)
Homophones (任务栏→任务蓝) pass; misread characters (汤→糖) fail."""
import json, os, re, sys
import soundfile as sf, sherpa_onnx
from pypinyin import lazy_pinyin

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = f'{ROOT}/models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17/'
if not os.path.isdir(A):
    sys.exit('ASR model missing: run  WITH_ASR=1 bash pipeline/fetch_models.sh')
asr = sherpa_onnx.OfflineRecognizer.from_sense_voice(model=A + 'model.int8.onnx', tokens=A + 'tokens.txt',
                                                     language='zh', use_itn=False, num_threads=4)
tl = json.load(open(f'{ROOT}/build/timeline.json'))
clean = lambda s: re.sub(r'[^一-鿿A-Za-z]', '', s).lower()
bad = 0
for l in tl['lines']:
    x, sr = sf.read(f"{ROOT}/build/vo/{l['id']}.wav", dtype='float32')
    s = asr.create_stream(); s.accept_waveform(sr, x); asr.decode_stream(s)
    ok = lazy_pinyin(clean(s.result.text)) == lazy_pinyin(clean(l['text']))
    bad += not ok
    print(('OK ' if ok else '!! ') + l['id'], l['text'], '|', s.result.text)
print(f'{len(tl["lines"]) - bad}/{len(tl["lines"])} lines match by pinyin')
sys.exit(1 if bad else 0)
