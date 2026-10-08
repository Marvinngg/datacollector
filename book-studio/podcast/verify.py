"""Check a finished episode:  python3 verify.py <outdir> [n_spot=6]

- container: duration, size (<= 19 MiB), streams (AAC audio + h264 still video), faststart (moov before mdat)
- loudness: ffmpeg ebur128 integrated / LRA / true peak  (target -16 LUFS, <= -1 dBTP)
- transcript: podcast.json timestamps are monotonic and inside the file
- ASR spot check (if the SenseVoice model is present): n lines spread over the episode are cut from the *final*
  AAC audio at their timestamps and transcribed; pinyin CER is reported.
Exit 1 on a hard failure (size, loudness, missing streams, timestamps).
"""
import json, os, re, subprocess, sys
import numpy as np
from lib import make_asr, transcribe, cer_pinyin, normalize
from build import ebur128


def main(outdir, n_spot=6):
    meta = json.load(open(os.path.join(outdir, 'podcast.json'), encoding='utf-8'))
    mp4 = os.path.join(outdir, meta['file'])
    fails = []
    info = subprocess.run(['ffmpeg', '-hide_banner', '-i', mp4], capture_output=True, text=True).stderr  # no ffprobe needed
    h, mi, se = re.search(r'Duration: (\d+):(\d+):([\d.]+)', info).groups()
    dur = int(h) * 3600 + int(mi) * 60 + float(se); size = os.path.getsize(mp4)
    a = re.search(r'Audio: (\w+).*?(\d+) Hz, (\w+).*?(\d+) kb/s', info)
    v = re.search(r'Video: (\w+).*?(\d{2,5})x(\d{2,5}).*?([\d.]+) fps', info)
    a = {'codec_name': a.group(1), 'rate': a.group(2), 'ch': a.group(3), 'kbps': a.group(4)} if a else {}
    v = {'codec_name': v.group(1), 'size': f'{v.group(2)}x{v.group(3)}', 'fps': v.group(4)} if v else {}
    print(f'file      {mp4}')
    print(f'duration  {dur:.2f}s (json {meta["dur"]}s)   size {size / 2 ** 20:.2f} MiB')
    print(f'audio     {a.get("codec_name")} {a.get("kbps")} kb/s {a.get("rate")} Hz {a.get("ch")}')
    print(f'video     {v.get("codec_name")} {v.get("size")} @ {v.get("fps")} fps')
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
