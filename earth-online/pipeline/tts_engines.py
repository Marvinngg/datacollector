"""TTS engine factory for gen_vo.py.  make_engine(spec) -> synth(text, speed[, sid]) -> (float32 samples, sample_rate)

spec keys (from lines.json):
  engine      "kokoro" (default) | "vits" | "matcha" | "zipvoice"
  voice_sid   speaker id (kokoro / vits)
  model_dir   optional, relative to earth-online/models/ (defaults below)
  zipvoice    {"prompt_wav": path rel. to earth-online/, "prompt_text": exact transcript,
               "num_steps": 8, "guidance_scale": 1.0, "int8": false}
"""
import os, numpy as np, soundfile as sf, sherpa_onnx

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DIR = {'kokoro': 'kokoro-multi-lang-v1_1', 'vits': 'vits-icefall-zh-aishell3',
               'matcha': 'matcha-icefall-zh-en', 'zipvoice': 'sherpa-onnx-zipvoice-distill-zh-en-emilia'}


def _model_cfg(engine, M, nt, zv=None):
    if engine == 'kokoro':
        return sherpa_onnx.OfflineTtsModelConfig(kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
            model=M+'model.onnx', voices=M+'voices.bin', tokens=M+'tokens.txt', data_dir=M+'espeak-ng-data',
            dict_dir=M+'dict', lexicon=M+'lexicon-us-en.txt,'+M+'lexicon-zh.txt'), num_threads=nt), \
            M+'date-zh.fst,'+M+'phone-zh.fst,'+M+'number-zh.fst', ''
    if engine == 'vits':
        return sherpa_onnx.OfflineTtsModelConfig(vits=sherpa_onnx.OfflineTtsVitsModelConfig(
            model=M+'model.onnx', lexicon=M+'lexicon.txt', tokens=M+'tokens.txt'), num_threads=nt), \
            M+'phone.fst,'+M+'date.fst,'+M+'number.fst,'+M+'new_heteronym.fst', M+'rule.far'
    if engine == 'matcha':
        return sherpa_onnx.OfflineTtsModelConfig(matcha=sherpa_onnx.OfflineTtsMatchaModelConfig(
            acoustic_model=M+'model-steps-3.onnx', vocoder=M+'vocos-16khz-univ.onnx', lexicon=M+'lexicon.txt',
            tokens=M+'tokens.txt', data_dir=M+'espeak-ng-data'), num_threads=nt), \
            M+'phone-zh.fst,'+M+'date-zh.fst,'+M+'number-zh.fst', ''
    if engine == 'zipvoice':
        q = '_int8' if zv.get('int8') else ''
        return sherpa_onnx.OfflineTtsModelConfig(zipvoice=sherpa_onnx.OfflineTtsZipvoiceModelConfig(
            tokens=M+'tokens.txt', encoder=M+f'text_encoder{q}.onnx', decoder=M+f'fm_decoder{q}.onnx',
            vocoder=M+'vocos_24khz.onnx', data_dir=M+'espeak-ng-data', lexicon=M+'pinyin.raw',
            guidance_scale=float(zv.get('guidance_scale', 1.0))), num_threads=nt), '', ''
    raise ValueError(f'unknown engine {engine}')


def make_engine(spec, num_threads=4):
    engine = spec.get('engine', 'kokoro')
    M = f"{ROOT}/models/{spec.get('model_dir', DEFAULT_DIR[engine])}/"
    zv = spec.get('zipvoice', {})
    mc, fsts, fars = _model_cfg(engine, M, num_threads, zv)
    tts = sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=mc, rule_fsts=fsts, rule_fars=fars))
    sid = int(spec.get('voice_sid', 0))
    if engine == 'zipvoice':
        p, psr = sf.read(f"{ROOT}/{zv['prompt_wav']}", dtype='float32')
        if p.ndim > 1: p = p.mean(1)
        ptxt, steps = zv['prompt_text'], int(zv.get('num_steps', 8))
        def synth(text, speed, sid=None):
            a = tts.generate(text, ptxt, p.tolist(), psr, speed=speed, num_steps=steps)
            return np.array(a.samples, np.float32), a.sample_rate
    else:
        def synth(text, speed, sid=sid):
            a = tts.generate(text, sid=sid, speed=speed)
            return np.array(a.samples, np.float32), a.sample_rate
    return synth
