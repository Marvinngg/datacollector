"""Check a finished episode:  python3 verify.py <outdir> [n_spot=6]

- container: duration, size (<= 19 MiB), streams (AAC audio + h264 still video), faststart (moov before mdat)
- loudness: ffmpeg ebur128 integrated / LRA / true peak  (target -16 LUFS, <= -1 dBTP)
- transcript: podcast.json timestamps are monotonic and inside the file
- ASR spot check (if the SenseVoice model is present): n lines spread over the episode are cut from the *final*
  AAC audio at their timestamps and transcribed; pinyin CER is reported.
Exit 1 on a hard failure (size, loudness, missing streams, timestamps).
"""
import json, os, subprocess, sys
import numpy as np
from lib import make_asr, transcribe, cer_pinyin, normalize
from build import ebur128


def main(outdir, n_spot=6):
    meta = json.load(open(os.path.join(outdir, 'podcast.json'), encoding='utf-8'))
    mp4 = os.path.join(outdir, meta['file'])
    fails = []
    pr = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', mp4],
                                   capture_output=True, text=True).stdout)
    dur = float(pr['format']['duration']); size = os.path.getsize(mp4)
    codecs = {s['codec_type']: s for s in pr['streams']}
    a, v = codecs.get('audio', {}), codecs.get('video', {})
    print(f'file      {mp4}')
    print(f'duration  {dur:.2f}s (json {meta["dur"]}s)   size {size / 2 ** 20:.2f} MiB')
    print(f'audio     {a.get("codec_name")} {int(a.get("bit_rate", 0)) // 1000} kb/s {a.get("sample_rate")} Hz {a.get("channels")} ch')
    print(f'video     {v.get("codec_name")} {v.get("width")}x{v.get("height")} @ {v.get("avg_frame_rate")}')
    head = open(mp4, 'rb').read(64 * 1024)
    faststart = 0 <= head.find(b'moov') < (head.find(b'mdat') if b'mdat' in head else 1 << 30)
    print(f'faststart {faststart}')
    if size > 19 * 2 ** 20: fails.append('size > 19 MiB')
    if a.get('codec_name') != 'aac' or v.get('codec_name') != 'h264': fails.append('streams')
    if not faststart: fails.append('faststart')
    if abs(dur - meta['dur']) > 0.5: fails.append('duration mismatch')
    m = ebur128(mp4)
    print(f'loudness  I {m["I"]} LUFS   LRA {m["LRA"]} LU   true peak {m["TP"]} dBTP')
    if abs(m['I'] + 16) > 0.5: fails.append('integrated loudness')
    if m['TP'] > -1.0: fails.append('true peak')
    L = meta['lines']
    if any(b['t'] < a_['end'] - 1e-3 for a_, b in zip(L, L[1:])) or L[-1]['end'] > dur:
        fails.append('timestamps')
    speech = sum(l['end'] - l['t'] for l in L)
    print(f'lines     {len(L)}  speech {speech:.1f}s  ({sum(len(l["text"]) for l in L) / speech:.2f} chars/s)')

    asr = make_asr()
    if asr is None:
        print('ASR spot check skipped (no SenseVoice model: bash setup.sh)')
    else:
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', mp4, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'],
                             capture_output=True).stdout
        x = np.frombuffer(raw, np.float32)
        idx = sorted(set(np.linspace(1, len(L) - 1, n_spot).round().astype(int).tolist()))
        cs = []
        for i in idx:
            l = L[i]
            seg = x[int((l['t'] - 0.05) * 16000):int((l['end'] + 0.05) * 16000)]
            hyp = transcribe(asr, seg, 16000)
            c = cer_pinyin(normalize(l['text']), hyp); cs.append(c)
            print(f'  ASR {i:2d} {l["who"]} cer {c:.2f}  {l["text"]}\n               -> {hyp}')
        print(f'ASR spot check: mean pinyin CER {np.mean(cs):.3f} over {len(cs)} lines')
    print('FAIL: ' + ', '.join(fails) if fails else 'verify: OK')
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 6))
