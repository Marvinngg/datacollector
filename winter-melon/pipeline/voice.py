"""Voice every spoken line of script/film.json -> build/vo/*.wav + build/vo/lines.json (durations for the timeline).

Cast: each character gets a reference voice (a short synthetic clip, never a real person's recording) and ZipVoice
speaks the lines in that timbre with natural prosody:
  - references come from Kokoro v1.0 speakers (or the yunjian clip), pitch-shifted to suit age; built once into
    build/vo/refs/;
  - every line is synthesised with its character's reference, cached by (voice, text, speed): rerunning only redoes
    lines whose words changed;
  - SenseVoice listens to each line and compares it with the script (characters, punctuation ignored); a line that
    does not match is retried at slightly different speeds and reported if it still fails.
Real recordings can replace any line: drop a wav at assets/voice_override/<beat>_<step>.wav (e.g. s05_2.wav).
usage: python3 pipeline/voice.py [--refs] [--probe]   (--refs rebuilds the reference clips; --probe tries the API's preset voices)
Engine: Alibaba Cloud Model Studio CosyVoice API when DASHSCOPE_API_KEY is set, else local ZipVoice."""
import hashlib, json, os, re, sys
import numpy as np, soundfile as sf
import sherpa_onnx
from scipy import signal

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
M = f'{ROOT}/models'
OUT = f'{ROOT}/build/vo'; REFS = f'{OUT}/refs'
os.makedirs(REFS, exist_ok=True)
SR = 24000
REF_TEXT = '其实这件事也没那么复杂，你先别着急，我们慢慢来。'

# who -> reference source, pitch shift (semitones) applied to the reference, speaking tempo
CAST = {
    'qin':  {'src': 'yunjian', 'pitch': -3.0, 'speed': 0.82, 'gain': 1.0},     # 李叔, 72: lower, slower
    'xiao': {'src': 48, 'pitch': 0.0, 'speed': 0.95, 'gain': 1.0},             # 晓禾, 26: zf_xiaoyi
    'wang': {'src': 45, 'pitch': -2.0, 'speed': 0.85, 'gain': 1.0},            # 桂兰婶, ~60: zf_xiaobei, lower
    'lin':  {'src': 46, 'pitch': -0.5, 'speed': 0.95, 'gain': 1.0},            # 林姐, city: zf_xiaoni
    'kid':  {'src': 47, 'pitch': 3.5, 'speed': 1.0, 'gain': 0.95},             # 孩子: zf_xiaoxiao, higher
}

def speakable(t):
    t = re.sub(r'[“”"「」]', '', t).replace('……', '').replace('…', '')
    return t.strip()

def kokoro():
    K = f'{M}/kokoro-multi-lang-v1_0/'
    cfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
        model=K + 'model.onnx', voices=K + 'voices.bin', tokens=K + 'tokens.txt', data_dir=K + 'espeak-ng-data', dict_dir=K + 'dict',
        lexicon=K + 'lexicon-us-en.txt,' + K + 'lexicon-zh.txt'), num_threads=4), rule_fsts=K + 'date-zh.fst,' + K + 'phone-zh.fst,' + K + 'number-zh.fst')
    return sherpa_onnx.OfflineTts(cfg)

def resample(x, sr_in, sr_out=SR):
    if sr_in == sr_out: return x.astype(np.float32)
    from math import gcd
    g = gcd(sr_in, sr_out); return signal.resample_poly(x, sr_out // g, sr_in // g).astype(np.float32)

def pitch(x, sr, st):
    if abs(st) < 0.01: return x
    from pedalboard import Pedalboard, PitchShift
    return Pedalboard([PitchShift(semitones=st)])(x.astype(np.float32)[None, :], sr)[0]

def build_refs(force=False):
    kk = None
    for who, c in CAST.items():
        p = f'{REFS}/{who}.wav'
        if os.path.exists(p) and not force: continue
        if c['src'] == 'yunjian':
            x, sr = sf.read(f'{ROOT}/assets/voice_refs/yunjian.wav', dtype='float32')
            if x.ndim > 1: x = x.mean(1)
        else:
            kk = kk or kokoro(); a = kk.generate(REF_TEXT, sid=int(c['src']), speed=0.9); x, sr = np.array(a.samples, np.float32), a.sample_rate
        x = pitch(resample(x, sr), SR, c['pitch'])
        x = x / (np.abs(x).max() + 1e-9) * 0.8
        sf.write(p, x, SR); print('ref', who, f'{len(x) / SR:.1f}s')

def zipvoice():
    Z = f'{M}/sherpa-onnx-zipvoice-distill-int8-zh-en-emilia/'
    pick = lambda *c: next((Z + f for f in c if os.path.exists(Z + f)), Z + c[0])
    cfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(zipvoice=sherpa_onnx.OfflineTtsZipvoiceModelConfig(
        tokens=Z + 'tokens.txt', encoder=pick('encoder.int8.onnx', 'encoder.onnx', 'text_encoder.onnx'),
        decoder=pick('decoder.int8.onnx', 'decoder.onnx', 'fm_decoder.onnx'), vocoder=Z + 'vocos_24khz.onnx',
        data_dir=Z + 'espeak-ng-data', lexicon=pick('lexicon.txt', 'pinyin.raw'), guidance_scale=1.0), num_threads=4))
    tts = sherpa_onnx.OfflineTts(cfg)
    lex = {}
    for l in open(pick('lexicon.txt', 'pinyin.raw'), encoding='utf8'):
        w = l.split()
        if w: lex.setdefault(w[0], len(w) - 1)
    ntok = lambda t: sum(lex.get(c, 1) for c in t if not c.isspace())
    def synth(text, who, speed):
        p, psr = sf.read(f'{REFS}/{who}.wav', dtype='float32')
        pt, tt = ntok(REF_TEXT), ntok(text); s = (pt + tt) / (pt + tt / speed)   # true tempo for the text part
        a = tts.generate(text, REF_TEXT, p.tolist(), psr, speed=s, num_steps=8)
        x = np.array(a.samples, np.float32); return resample(x, a.sample_rate)
    return synth

def asr():
    A = f'{M}/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17/'
    rec = sherpa_onnx.OfflineRecognizer.from_sense_voice(model=A + 'model.int8.onnx', tokens=A + 'tokens.txt', language='zh', use_itn=False, num_threads=4)
    def hear(x):
        s = rec.create_stream(); s.accept_waveform(SR, x.tolist()); rec.decode_stream(s); return s.result.text
    return hear

def norm(t): return re.sub(r'[^一-鿿0-9a-zA-Z]', '', t)
def similar(a, b):
    a, b = norm(a), norm(b)
    if not a: return 1.0
    import difflib; return difflib.SequenceMatcher(None, a, b).ratio()

def trim(x, thr=0.01, pad=0.06):
    e = np.abs(x) > thr * np.abs(x).max(); idx = np.where(e)[0]
    if not len(idx): return x
    a, b = max(0, idx[0] - int(pad * SR)), min(len(x), idx[-1] + int(pad * 1.5 * SR)); return x[a:b]

# ---------------------------------------------------------------- Alibaba Cloud Model Studio (百炼) CosyVoice API
# used when DASHSCOPE_API_KEY is set (or VOICE_ENGINE=dashscope). DASHSCOPE_REGION=intl for the international site.
# Voices are preset speakers of the service; pick them by ear with `python3 pipeline/voice.py --probe`.
API_MODEL = os.environ.get('DASHSCOPE_TTS_MODEL', 'cosyvoice-v2')
API_CAST = {   # who -> preset voice, speech rate, pitch rate (override any of them with env DASHSCOPE_CAST='{"qin": {"voice": "..."}}')
    'qin':  {'voice': 'longlaotie_v2', 'rate': 0.85, 'pitch': 0.92},
    'xiao': {'voice': 'longxiaochun_v2', 'rate': 0.98, 'pitch': 1.0},
    'wang': {'voice': 'longxiaoxia_v2', 'rate': 0.9, 'pitch': 0.95},
    'lin':  {'voice': 'longwan_v2', 'rate': 1.0, 'pitch': 1.0},
    'kid':  {'voice': 'longjielidou_v2', 'rate': 1.0, 'pitch': 1.05},
}
API_CAST.update({k: {**API_CAST.get(k, {}), **v} for k, v in json.loads(os.environ.get('DASHSCOPE_CAST', '{}')).items()})
PROBE = ['longxiaochun_v2', 'longxiaoxia_v2', 'longwan_v2', 'longcheng_v2', 'longhua_v2', 'longshu_v2', 'longlaotie_v2',
         'longjielidou_v2', 'longtong_v2', 'longxiaobai_v2', 'longmiao_v2', 'longyue_v2', 'longfei_v2', 'longshuo_v2', 'longjing_v2']

def dashscope_engine():
    import dashscope, io
    from dashscope.audio.tts_v2 import SpeechSynthesizer, AudioFormat
    dashscope.api_key = os.environ['DASHSCOPE_API_KEY']
    if os.environ.get('DASHSCOPE_REGION') == 'intl':
        dashscope.base_websocket_api_url = 'wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference'
        dashscope.base_http_api_url = 'https://dashscope-intl.aliyuncs.com/api/v1'
    def synth(text, who, how=None, voice=None):
        c = API_CAST[who]
        kw = dict(model=API_MODEL, voice=voice or c['voice'], format=AudioFormat.WAV_24000HZ_MONO_16BIT, speech_rate=c.get('rate', 1.0), pitch_rate=c.get('pitch', 1.0))
        audio = None
        if how:
            try: audio = SpeechSynthesizer(**kw, instruction=how).call(text)
            except Exception: audio = None        # voices / models without instruction support: plain synthesis
        if not audio: audio = SpeechSynthesizer(**kw).call(text)
        if not audio: raise RuntimeError(f'no audio for voice {kw["voice"]}')
        x, sr = sf.read(io.BytesIO(audio), dtype='float32')
        return resample(x.mean(1) if x.ndim > 1 else x, sr)
    return synth

def probe():
    synth = dashscope_engine(); os.makedirs(f'{OUT}/probe', exist_ok=True)
    for v in PROBE:
        try:
            x = synth('李叔，我来收瓜。一块二一斤，比去年还高。', 'xiao', voice=v); sf.write(f'{OUT}/probe/{v}.wav', x, SR); print('ok  ', v, f'{len(x) / SR:.1f}s')
        except Exception as e: print('fail', v, str(e)[:80])

def main():
    if '--probe' in sys.argv: return probe()
    API = bool(os.environ.get('DASHSCOPE_API_KEY')) and os.environ.get('VOICE_ENGINE', 'dashscope') == 'dashscope'
    if not API: build_refs(force='--refs' in sys.argv)
    S = json.load(open(f'{ROOT}/script/film.json'))
    jobs = []
    for c in S['chapters']:
        for b in c['beats']:
            for k, st in enumerate(b['visual'].get('steps', [])):
                if st.get('say') and st.get('text'): jobs.append((b['id'], k, st['say'], st['text']))
    synth, hear, out, bad = None, None, {}, []
    api = dashscope_engine() if API else None
    hows = {(b['id'], k): st.get('how', '') for c_ in S['chapters'] for b in c_['beats'] for k, st in enumerate(b['visual'].get('steps', []))}
    for bid, k, who, text in jobs:
        c = API_CAST[who] if API else CAST[who]; spoken = speakable(text)
        ov = f'{ROOT}/assets/voice_override/{bid}_{k}.wav'
        how = hows.get((bid, k), '')
        key = hashlib.md5(json.dumps(['api', API_MODEL, who, spoken, c, how] if API else [who, spoken, c, open(f'{REFS}/{who}.wav', 'rb').read().__len__()]).encode()).hexdigest()[:12]
        f = f'{OUT}/{bid}_{k}_{key}.wav'
        if os.path.exists(ov):
            x, sr = sf.read(ov, dtype='float32'); x = resample(x.mean(1) if x.ndim > 1 else x, sr); sf.write(f, x, SR); score = 1.0; heard = '(录音)'
        elif os.path.exists(f):
            x, _ = sf.read(f, dtype='float32'); score, heard = 1.0, '(缓存)'
        else:
            hear = hear or asr()
            if not API: synth = synth or zipvoice()
            best = None
            for sp in ((None,) if API else (c['speed'], c['speed'] * 0.93, c['speed'] * 1.07)):
                x = trim(api(spoken, who, how) if API else synth(spoken, who, sp)); heard = hear(x); score = similar(spoken, heard)
                if not best or score > best[0]: best = (score, x, heard)
                if score >= 0.85: break
            score, x, heard = best
            x = x / (np.sqrt(np.mean(x ** 2)) + 1e-9) * 0.08 * c.get('gain', 1.0); x = np.clip(x, -0.98, 0.98)
            sf.write(f, x, SR)
            if score < 0.85: bad.append((bid, k, who, text, heard, round(score, 2)))
        out[f'{bid}:{k}'] = {'file': os.path.relpath(f, ROOT), 'dur': round(len(x) / SR, 3), 'who': who}
        print(f'{bid}:{k} {who:<4} {len(x) / SR:4.1f}s  {text}   ← {heard}')
    json.dump(out, open(f'{OUT}/lines.json', 'w'), ensure_ascii=False, indent=1)
    print(f'{len(out)} lines voiced -> build/vo/lines.json')
    for b in bad: print('CHECK', b)

if __name__ == '__main__':
    main()
