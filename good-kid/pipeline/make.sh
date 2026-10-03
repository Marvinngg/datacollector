#!/usr/bin/env bash
# script -> finished film (vertical 1080x1920) + the collection cut into episodes.
#   bash pipeline/make.sh            # -> release/dafen.mp4 and release/ep*.mp4
#   FRESH=1 bash pipeline/make.sh    # re-render every scene (ignore the scene cache)
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== timeline"; python3 pipeline/gen_timeline.py | tail -1
echo "== cues";     node pipeline/render.mjs cues
echo "== score";    python3 pipeline/audio/score.py | tail -3
echo "== frames";   node pipeline/render.mjs film --workers "${WORKERS:-4}" ${FRESH:+--fresh}
echo "== mux"
mkdir -p release
# two passes at 1.9 Mb/s keep the 5.8-minute film under GitHub's 100 MB file limit (the particle grain is expensive)
( cd build && ffmpeg -y -loglevel error -i video.mp4 -vf hqdn3d=2:2:4:4 -c:v libx264 -preset slow -b:v 1900k -pass 1 -an -f null /dev/null )
( cd build && ffmpeg -y -loglevel error -i video.mp4 -i audio/mix.wav -map 0:v -map 1:a -vf hqdn3d=2:2:4:4 -c:v libx264 -preset slow \
  -b:v 1900k -pass 2 -pix_fmt yuv420p -c:a aac -b:a 160k -shortest -movflags +faststart ../release/dafen.mp4 )
echo "== episodes"; python3 pipeline/episodes.py
echo "done: release/dafen.mp4"
