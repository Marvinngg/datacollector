"""Cut the finished film into a collection (合集) of short episodes for feeds where 5 minutes is too long.
Each episode is a whole number of chapters, cut on chapter boundaries (which sit on the score's beat grid), with a
short audio fade at both ends. Reads build/timeline.json and release/xianbieji.mp4 -> release/ep1..ep3 (+ 720p)."""
import json, os, subprocess
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tl = json.load(open(f'{ROOT}/build/timeline.json'))
ch = {c['id']: c for c in tl['chapters']}
EPS = [('ep1', ['e0', 'e1'], '你以为有五成把握'),
       ('ep2', ['e2', 'e3'], '一次乘法'),
       ('ep3', ['e4', 'e5', 'e6'], '谁来拍板')]
src = f'{ROOT}/release/xianbieji.mp4'
for name, ids, title in EPS:
    a, b = ch[ids[0]]['start'], (ch[ids[-1]]['end'] if ids[-1] != tl['chapters'][-1]['id'] else tl['duration'])
    d = b - a
    out = f'{ROOT}/release/{name}.mp4'
    vf = f"fade=t=in:st=0:d=0.4,fade=t=out:st={d - 0.6:.3f}:d=0.6"
    af = f"afade=t=in:st=0:d=0.3,afade=t=out:st={d - 0.8:.3f}:d=0.8"
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', f'{a:.3f}', '-i', src, '-t', f'{d:.3f}', '-vf', vf, '-af', af,
                    '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-maxrate', '3M', '-bufsize', '6M', '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out], check=True)
    # a 720p preview small enough to send in chat (<= ~27 MB): bitrate from the length
    prev = f'{ROOT}/build/{name}-720.mp4'
    kbps = int(27 * 8 * 1024 / d) - 140
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', out, '-vf', 'scale=720:1280', '-c:v', 'libx264', '-preset', 'slow',
                    '-b:v', f'{min(kbps, 2500)}k', '-maxrate', f'{min(kbps, 2500) * 2}k', '-bufsize', f'{min(kbps, 2500) * 2}k',
                    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', prev], check=True)
    print(f'{name}  {title}  {a:6.1f} -> {b:6.1f}  ({d:5.1f}s)  {os.path.relpath(out, ROOT)}')
