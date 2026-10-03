#!/usr/bin/env bash
# Mux the current picture with the current score for a quick check (no re-encode of the video).
#   bash pipeline/audio/preview.sh            # -> build/preview.mp4
#   REBUILD=1 bash pipeline/audio/preview.sh  # regenerate cues + rebuild the score first
set -euo pipefail
cd "$(dirname "$0")/../.."
if [ -n "${REBUILD:-}" ]; then
  node pipeline/render.mjs cues
  python3 pipeline/audio/score.py | tail -1
fi
[ -f build/audio/mix.wav ] || { echo "no build/audio/mix.wav: run python3 pipeline/audio/score.py"; exit 1; }
if [ ! -f build/video.mp4 ]; then echo "no build/video.mp4 yet (render.mjs film); score only: build/audio/mix.wav"; exit 0; fi
ffmpeg -y -loglevel error -i build/video.mp4 -i build/audio/mix.wav -map 0:v -map 1:a \
  -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart build/preview.mp4
echo "wrote build/preview.mp4"
