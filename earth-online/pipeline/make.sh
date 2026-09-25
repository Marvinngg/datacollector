#!/usr/bin/env bash
# Full build: voice-over -> timeline -> sound cues -> audio mix -> frames -> final MP4.
#   bash pipeline/make.sh            # everything
#   SKIP_VO=1 bash pipeline/make.sh  # reuse existing build/vo + timeline
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PWD/.bin:$PATH"   # bundled ffmpeg from setup.sh, if any

if [ -z "${SKIP_VO:-}" ]; then
  echo "== voice-over"
  python3 pipeline/gen_vo.py 2>&1 | grep -v -E "Unknown token|Warn" || true
fi

echo "== sound cues"
node pipeline/render.mjs cues

echo "== audio"
bash pipeline/audio/build_audio.sh

echo "== frames"
node pipeline/render.mjs video --workers "${WORKERS:-4}"

echo "== mux"
mkdir -p out
ffmpeg -y -loglevel error -i build/video.mp4 -i build/audio/mix.wav \
  -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -ar 48000 -shortest -movflags +faststart \
  out/earth-online.mp4
ffprobe_dur=$(ffmpeg -i out/earth-online.mp4 2>&1 | grep -o "Duration: [0-9:.]*" || true)
echo "done: out/earth-online.mp4  ${ffprobe_dur}"

# compressed copy for sharing (release/ is not git-ignored; out/ is)
mkdir -p release
ffmpeg -y -loglevel error -i build/video.mp4 -i build/audio/mix.wav -map 0:v -map 1:a \
  -c:v libx264 -preset slow -crf 24 -tune stillimage -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart \
  "release/${RELEASE_NAME:-earth-online}.mp4"
echo "release: release/${RELEASE_NAME:-earth-online}.mp4"
