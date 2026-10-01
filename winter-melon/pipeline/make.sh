#!/usr/bin/env bash
# script -> finished film (vertical 1080x1920).
#   bash pipeline/make.sh                          # -> release/li-melon.mp4
#   FROM=46 TO=73 RELEASE_NAME=s05 bash pipeline/make.sh   # render only a time range
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PWD/.bin:$PATH"
echo "== voices";    python3 pipeline/voice.py 2>/dev/null | grep -E "voiced|CHECK"
echo "== timeline";  python3 pipeline/gen_timeline.py --script "${SCRIPT:-script/film.json}" | tail -1
echo "== cues";      node pipeline/render.mjs cues
echo "== sound";     python3 pipeline/audio/sound.py | tail -1
echo "== frames"
RANGE=(); [ -n "${FROM:-}" ] && RANGE+=(--from "$FROM"); [ -n "${TO:-}" ] && RANGE+=(--to "$TO")
if [ ${#RANGE[@]} -gt 0 ]; then node pipeline/render.mjs video --workers "${WORKERS:-4}" "${RANGE[@]}"; else node pipeline/render.mjs film --workers "${WORKERS:-4}"; fi
echo "== mux"
mkdir -p release
AUD=(-i build/audio/mix.wav); [ -n "${FROM:-}" ] && AUD=(-ss "$FROM" -i build/audio/mix.wav)
ffmpeg -y -loglevel error -i build/video.mp4 "${AUD[@]}" -map 0:v -map 1:a \
  -vf hqdn3d=2:2:4:4 -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p -c:a aac -b:a 160k -shortest -movflags +faststart \
  "release/${RELEASE_NAME:-li-melon}.mp4"
echo "done: release/${RELEASE_NAME:-li-melon}.mp4"
