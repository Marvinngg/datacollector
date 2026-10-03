#!/usr/bin/env bash
# script -> finished film (vertical 1080x1920) + the collection cut into episodes.
#   bash pipeline/make.sh            # -> release/xianbieji.mp4 and release/ep*.mp4
#   FRESH=1 bash pipeline/make.sh    # re-render every scene (ignore the scene cache)
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== timeline"; python3 pipeline/gen_timeline.py | tail -1
echo "== cues";     node pipeline/render.mjs cues
echo "== score";    python3 pipeline/audio/score.py | tail -3
echo "== frames";   node pipeline/render.mjs film --workers "${WORKERS:-4}" ${FRESH:+--fresh}
echo "== mux"
mkdir -p release
ffmpeg -y -loglevel error -i build/video.mp4 -i build/audio/mix.wav -map 0:v -map 1:a \
  -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart release/xianbieji.mp4
echo "== episodes"; python3 pipeline/episodes.py
echo "done: release/xianbieji.mp4"
