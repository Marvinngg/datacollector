"""TTS engine factory for gen_vo.py.  make_engine(spec) -> synth(text, speed[, sid]) -> (float32 samples, sample_rate)

spec keys (from lines.json):
  engine      "kokoro" (default) | "vits" | "matcha" | "zipvoice"
  voice_sid   speaker id (kokoro / vits)
  model_dir   optional, relative to earth-online/models/ (defaults below)
  model_file  optional onnx file name inside model_dir (vits; default model.onnx)
  zipvoice    {"prompt_wav": path rel. to earth-online/, "prompt_text": exact transcript,
               "num_steps": 8, "guidance_scale": 1.0}
              for zipvoice, `speed` is a true tempo factor for the generated text (see synth below)
"""
import os, numpy as np, soundfile as sf, sherpa_onnx

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DIR = {'kokoro': 'kokoro-multi-lang-v1_1', 'vits': 'vits-icefall-zh-aishell3',
               'matcha': 'matcha-icefall-zh-en', 'zipvoice': 'sherpa-onnx-zipvoice-distill-int8-zh-en-emilia'}


def _model_cfg(engine, M, nt, zv=None, mf=None):
    if engine == 'kokoro':
        return sherpa_onnx.OfflineTtsModelConfig(kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
            model=M+'model.onnx', voices=M+'voices.bin', tokens=M+'tokens.txt', data_dir=M+'espeak-ng-data',
            dict_dir=M+'dict', lexicon=M+'lexicon-us-en.txt,'+M+'lexicon-zh.txt'), num_threads=nt), \
            M+'date-zh.fst,'+M+'phone-zh.fst,'+M+'number-zh.fst', ''
    if engine == 'vits':
        return sherpa_onnx.OfflineTtsModelConfig(vits=sherpa_onnx.OfflineTtsVitsModelConfig(
            model=M+(mf or 'model.onnx'), lexicon=M+'lexicon.txt', tokens=M+'tokens.txt'), num_threads=nt), \
            M+'phone.fst,'+M+'date.fst,'+M+'number.fst,'+M+'new_heteronym.fst', M+'rule.far'
    if engine == 'matcha':
        return sherpa_onnx.OfflineTtsModelConfig(matcha=sherpa_onnx.OfflineTtsMatchaModelConfig(
            acoustic_model=M+'model-steps-3.onnx', vocoder=M+'vocos-16khz-univ.onnx', lexicon=M+'lexicon.txt',
            tokens=M+'tokens.txt', data_dir=M+'espeak-ng-data'), num_threads=nt), \
            M+'phone-zh.fst,'+M+'date-zh.fst,'+M+'number-zh.fst', ''
    if engine == 'zipvoice':
        # new package layout (encoder.int8.onnx + lexicon.txt) or old (text_encoder*.onnx + pinyin.raw)
        pick = lambda *c: next((M+f for f in c if os.path.exists(M+f)), M+c[0])
        enc = pick('encoder.int8.onnx', 'encoder.onnx', 'text_encoder.onnx')
        dec = pick('decoder.int8.onnx', 'decoder.onnx', 'fm_decoder.onnx')
        return sherpa_onnx.OfflineTtsModelConfig(zipvoice=sherpa_onnx.OfflineTtsZipvoiceModelConfig(
            tokens=M+'tokens.txt', encoder=enc, decoder=dec,
            vocoder=M+'vocos_24khz.onnx', data_dir=M+'espeak-ng-data', lexicon=pick('lexicon.txt', 'pinyin.raw'),
            guidance_scale=float(zv.get('guidance_scale', 1.0))), num_threads=nt), '', ''
    raise ValueError(f'unknown engine {engine}')


def make_engine(spec, num_threads=4):
    engine = spec.get('engine', 'kokoro')
    M = f"{ROOT}/models/{spec.get('model_dir', DEFAULT_DIR[engine])}/"
    zv = spec.get('zipvoice', {})
    mc, fsts, fars = _model_cfg(engine, M, num_threads, zv, spec.get('model_file'))
    tts = sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=mc, rule_fsts=fsts, rule_fars=fars))
    sid = int(spec.get('voice_sid', 0))
    if engine == 'zipvoice':
        p, psr = sf.read(f"{ROOT}/{zv['prompt_wav']}", dtype='float32')
        if p.ndim > 1: p = p.mean(1)
        ptxt, steps = zv['prompt_text'], int(zv.get('num_steps', 8))
        lex = {}
        for l in open(M+'lexicon.txt', encoding='utf8'):
            w = l.split(); lex.setdefault(w[0], len(w) - 1)
        ntok = lambda t: sum(lex.get(c, 1) for c in t if not c.isspace())
        pt = ntok(ptxt)
        def synth(text, speed, sid=None):
            # sherpa-onnx sizes prompt+text jointly as P/pt*(pt+tt)/s and then drops the prompt part, so its
            # `speed` over-compresses short lines (and truncates them above ~1.3).  Treat `speed` here as the true
            # tempo factor r for the text part and convert: s = (pt+tt) / (pt + tt/r).
            tt = ntok(text); s = (pt + tt) / (pt + tt / speed)
            a = tts.generate(text, ptxt, p.tolist(), psr, speed=s, num_steps=steps)
            x = np.array(a.samples, np.float32); pk = np.abs(x).max() if len(x) else 0
            if pk > 0.95: x *= 0.95 / pk   # zipvoice RMS-normalizes output and can clip on loud syllables
            return x, a.sample_rate
    else:
        def synth(text, speed, sid=sid):
            a = tts.generate(text, sid=sid, speed=speed)
            return np.array(a.samples, np.float32), a.sample_rate
    return synth
