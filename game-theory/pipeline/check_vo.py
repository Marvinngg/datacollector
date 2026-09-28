"""Pronunciation check: transcribe every build/vo/Lxx.wav with SenseVoice and compare pinyin with the script.
Needs: WITH_ASR=1 bash pipeline/fetch_models.sh
Usage: python3 pipeline/check_vo.py [DIR]   (DIR holds timeline.json + vo/, default build/; exit 1 on any mismatch)
Homophones and polyphones pass (任务栏→任务蓝); misread characters fail (汤→糖, 纳什→那神)."""
import json, os, re, sys
import soundfile as sf, sherpa_onnx
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pinyin_match import distance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = f'{ROOT}/models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17/'
if not os.path.isdir(A):
    sys.exit('ASR model missing: run  WITH_ASR=1 bash pipeline/fetch_models.sh')
asr = sherpa_onnx.OfflineRecognizer.from_sense_voice(model=A + 'model.int8.onnx', tokens=A + 'tokens.txt',
                                                     language='zh', use_itn=False, num_threads=4)
D = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else f'{ROOT}/build'
tl = json.load(open(f'{D}/timeline.json'))
bad = 0
for l in tl['lines']:
    x, sr = sf.read(f"{D}/vo/{l['id']}.wav", dtype='float32')
    s = asr.create_stream(); s.accept_waveform(sr, x); asr.decode_stream(s)
    e = distance(l['text'], s.result.text); ok = e == 0
    bad += not ok
    print(('OK ' if ok else f'!{e} ') + l['id'], l['text'], '|', s.result.text)
print(f'{len(tl["lines"]) - bad}/{len(tl["lines"])} lines match by pinyin')
sys.exit(1 if bad else 0)
