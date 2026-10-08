"""Final encode of every part: <build>/partN/video.mp4 + mix.wav -> <out>/partN.mp4 (+ <out>/parts.json).
H.264 two-pass at a bitrate computed from the duration so that each file stays <= 19 MiB (the artifact asset cap
is 20 MiB), AAC 128 kb/s, +faststart. 1080x1920 when the budget allows ~2.6 Mb/s of video, else 720x1280.
A part is skipped when its inputs and settings are unchanged (stamp file).
usage: python3 pipeline/encode.py <build_dir> <out_dir>"""
import hashlib, json, os, subprocess, sys

LIMIT = 19 * 1024 * 1024          # bytes, hard
AUDIO_K = 128
build, out = sys.argv[1], sys.argv[2]
parts = json.load(open(os.path.join(build, 'parts.json'), encoding='utf-8'))


def probe_dur(f):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True)
    return float(r.stdout.strip())


index = []
for P in parts:
    d = os.path.join(build, f"part{P['part']}")
    vid, wav, dst = os.path.join(d, 'video.mp4'), os.path.join(d, 'mix.wav'), os.path.join(out, f"part{P['part']}.mp4")
    dur = P['dur']
    stamp_key = hashlib.md5(json.dumps([os.path.getsize(vid), os.path.getmtime(vid), os.path.getsize(wav), os.path.getmtime(wav), dur,
                                        open(__file__).read()]).encode()).hexdigest()
    stamp = dst + '.stamp'
    if os.path.exists(dst) and os.path.exists(stamp) and open(stamp).read() == stamp_key and os.path.getsize(dst) <= LIMIT:
        print(f"part{P['part']}: unchanged ({os.path.getsize(dst) / 2**20:.2f} MiB)")
    else:
        budget_k = LIMIT * 8 / 1000 / dur * 0.94              # kb/s for the whole file, 6% for container + rate error
        vk = int(budget_k - AUDIO_K - 8)
        big = vk >= 2600
        scale = 'scale=1080:1920:flags=lanczos' if big else 'scale=720:1280:flags=lanczos'
        for attempt in range(4):
            vk_ = min(vk, 6000)
            vf = f'hqdn3d=1.2:1.2:3:3,{scale}'
            common = ['-vf', vf, '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-b:v', f'{vk_}k',
                      '-maxrate', f'{int(vk_ * 1.6)}k', '-bufsize', f'{int(vk_ * 2.5)}k', '-pix_fmt', 'yuv420p', '-g', '60']
            plog = os.path.join(d, 'x264pass')
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', vid, *common, '-pass', '1', '-passlogfile', plog, '-an', '-f', 'null', '/dev/null'], check=True)
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', vid, '-i', wav, '-map', '0:v', '-map', '1:a', *common, '-pass', '2', '-passlogfile', plog,
                            '-c:a', 'aac', '-b:a', f'{AUDIO_K}k', '-ar', '48000', '-t', f'{dur:.3f}', '-movflags', '+faststart', dst], check=True)
            size = os.path.getsize(dst)
            print(f"part{P['part']}: {'1080x1920' if big else '720x1280'} video {vk_} kb/s -> {size / 2**20:.2f} MiB")
            if size <= LIMIT: break
            vk = int(vk_ * LIMIT / size * 0.95)
        for f in os.listdir(d):
            if f.startswith('x264pass'): os.remove(os.path.join(d, f))
        if os.path.getsize(dst) > LIMIT: raise SystemExit(f'{dst} is still larger than 19 MiB')
        open(stamp, 'w').write(stamp_key)
    index.append({'file': f"part{P['part']}.mp4", 'title': P['title'], 'dur': round(probe_dur(dst), 2)})
json.dump(index, open(os.path.join(out, 'parts.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps(index, ensure_ascii=False))
