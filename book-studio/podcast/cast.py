"""Objective casting of two built-in Mandarin voices (no listening possible, no voice cloning).

Stage 1: every built-in zh speaker of Kokoro v1.1-zh (sid 3..102) and Kokoro v1.0 (zf_*/zm_*) reads one sentence;
         we measure ASR accuracy (SenseVoice, pinyin CER), clipping, speaking rate, median F0 and pitch movement.
Stage 2: the best female and male candidates read five probe sentences (question, numbers, English, short reply);
         score = ASR accuracy + no clipping + natural pitch movement + steady pitch (low frame-to-frame jitter)
         + speaking rate near the panel median.  Writes cast/report.json and prints the ranking.

    python3 cast.py            # ~10 min on 4 cores; needs the ASR model (setup.sh)
The chosen ids are then written by hand into voices.json (documented there and in README.md).
"""
import json, os, sys, time
import numpy as np
from lib import Kokoro, locate, normalize, trim, f0_track, make_asr, transcribe, cer_pinyin, HERE

OUT = os.path.join(HERE, 'cast')
os.makedirs(OUT, exist_ok=True)

STAGE1 = '你有没有想过，为什么我们总是在深夜，才开始怀疑自己？'
PROBES = ['今天想跟你聊一个很多人都有、却很少说出口的感觉。',
          '你有没有想过，为什么我们总是在深夜，才开始怀疑自己？',
          normalize('调查里大概有60%的人说，他们在2024年换过工作。'),
          normalize('他每天用iPhone记账，坚持了3年，一共记了1200多笔。'),
          '对，我也是这么想的。不过，事情没那么简单。']


def names(model):
    if model == 'kokoro-multi-lang-v1_0':
        return {45 + i: n for i, n in enumerate(['zf_xiaobei', 'zf_xiaoni', 'zf_xiaoxiao', 'zf_xiaoyi',
                                                 'zm_yunjian', 'zm_yunxi', 'zm_yunxia', 'zm_yunyang'])}
    ids = [1, 2, 3, 4, 5, 6, 7, 8, 17, 18, 19, 21, 22, 23, 24, 26, 27, 28, 32, 36, 38, 39, 40, 42, 43, 44, 46, 47, 48,
           49, 51, 59, 60, 67, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 83, 84, 85, 86, 87, 88, 90, 92, 93, 94, 99]
    m = [9, 10, 11, 12, 13, 14, 15, 16, 20, 25, 29, 30, 31, 33, 34, 35, 37, 41, 45, 50, 52, 53, 54, 55, 56, 57, 58, 61,
         62, 63, 64, 65, 66, 68, 69, 80, 81, 82, 89, 91, 95, 96, 97, 98, 100]
    return {3 + i: f'zf_{n:03d}' for i, n in enumerate(ids)} | {58 + i: f'zm_{n:03d}' for i, n in enumerate(m)}


def measure(x, sr, text, asr):
    y = trim(x, sr)
    f0 = f0_track(y, sr)
    st = 12 * np.log2(f0 / np.median(f0)) if len(f0) > 5 else np.zeros(1)
    hyp = transcribe(asr, x, sr)
    nch = sum(1 for c in text if '一' <= c <= '鿿') + 0.6 * sum(1 for c in text if c.isascii() and c.isalpha())
    return dict(cer=round(cer_pinyin(text, hyp), 3), hyp=hyp, peak=round(float(np.abs(x).max()), 3),
                clip=float(np.mean(np.abs(x) > 0.98)), rate=round(nch / (len(y) / sr), 2),
                f0=round(float(np.median(f0)), 1) if len(f0) > 5 else 0.0,
                f0_st=round(float(np.std(st)), 2),
                jitter=round(float(np.median(np.abs(np.diff(st)))) if len(st) > 3 else 9.0, 3))


def main():
    asr = make_asr()
    if asr is None:
        sys.exit('ASR model missing: bash setup.sh')
    rep = {'stage1': [], 'stage2': []}
    t0 = time.time()
    engines = {}
    for model in ['kokoro-multi-lang-v1_1', 'kokoro-multi-lang-v1_0']:
        if not locate(model, required=False):
            continue
        k = engines[model] = Kokoro(locate(model))
        for sid, nm in names(model).items():
            m = measure(k(STAGE1, sid), k.sr, STAGE1, asr)
            rep['stage1'].append(dict(model=model, sid=sid, name=nm, **m))
            print(f'{model[-4:]} {sid:3d} {nm:11s} cer {m["cer"]:.2f} f0 {m["f0"]:5.0f} st {m["f0_st"]:.2f} '
                  f'jit {m["jitter"]:.3f} rate {m["rate"]:.1f} peak {m["peak"]:.2f}  {m["hyp"]}', flush=True)
    s1 = rep['stage1']
    med_rate = float(np.median([r['rate'] for r in s1]))

    def score1(r):
        return (r['cer'] * 10 + (r['clip'] > 0) * 5 + abs(r['rate'] - med_rate) / med_rate * 2
                + r['jitter'] * 4 + abs(r['f0_st'] - 3.5) * 0.3)
    short = []
    for g in ['zf', 'zm']:
        c = sorted([r for r in s1 if r['name'].startswith(g) and r['cer'] <= 0.05 and r['f0'] > 0], key=score1)
        short += c[:8]
    for r in short:
        k = engines[r['model']]
        ms = []
        for i, p in enumerate(PROBES):
            x = k(p, r['sid'])
            ms.append(measure(x, k.sr, p, asr))
            if i == 0:
                import soundfile as sf
                sf.write(f'{OUT}/{r["name"]}_{r["model"][-4:]}.wav', x, k.sr)
        agg = {key: round(float(np.mean([m[key] for m in ms])), 3) for key in ['cer', 'clip', 'rate', 'f0', 'f0_st', 'jitter', 'peak']}
        agg['peak'] = max(m['peak'] for m in ms)
        agg['worst_cer'] = max(m['cer'] for m in ms)
        agg['hyps'] = [m['hyp'] for m in ms]
        rep['stage2'].append(dict(model=r['model'], sid=r['sid'], name=r['name'], **agg))
        print(f'S2 {r["name"]:11s} {r["model"][-4:]} cer {agg["cer"]:.3f}/{agg["worst_cer"]:.2f} f0 {agg["f0"]:5.0f} '
              f'st {agg["f0_st"]:.2f} jit {agg["jitter"]:.3f} rate {agg["rate"]:.2f} peak {agg["peak"]:.2f}', flush=True)
    s2 = rep['stage2']
    med2 = float(np.median([r['rate'] for r in s2]))
    for r in s2:
        r['score'] = round(r['cer'] * 20 + r['worst_cer'] * 5 + (r['clip'] > 0) * 5 + (r['peak'] > 0.95) * 1
                           + abs(r['rate'] - med2) / med2 * 3 + r['jitter'] * 4 + abs(r['f0_st'] - 3.5) * 0.3, 3)
    s2.sort(key=lambda r: r['score'])
    print('\nranking (lower is better):')
    for r in s2:
        print(f'  {r["score"]:.3f}  {r["name"]:11s} {r["model"]}  sid {r["sid"]}  f0 {r["f0"]:.0f} Hz')
    rep['panel_median_rate'] = med2
    rep['elapsed_s'] = round(time.time() - t0, 1)
    json.dump(rep, open(f'{OUT}/report.json', 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
