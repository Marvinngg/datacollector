#!/usr/bin/env bash
# script -> finished film.
#   bash pipeline/make.sh                       # v2 (default): silent film from script/v2.json — text + music, no narration
#   VERSION=1 bash pipeline/make.sh             # v1: narrated film from script/script.json (voice + pronunciation repair)
#   SKIP_VO=1 VERSION=1 bash pipeline/make.sh   # v1, reuse build/vo + timeline
#   FROM=115 TO=206 RELEASE_NAME=c3-pilot bash pipeline/make.sh   # render only a time range (e.g. one chapter)
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PWD/.bin:$PATH"
if [ "${VERSION:-2}" = "1" ]; then
  [ -z "${SKIP_VO:-}" ] && bash pipeline/voice.sh
else
  echo "== timeline (silent)"; python3 pipeline/gen_timeline.py --script "${SCRIPT:-script/v4.json}" | tail -1
fi
echo "== sound cues";  node pipeline/render.mjs cues
echo "== audio";       SKIP_CUES=1 bash pipeline/audio/build_audio.sh
echo "== frames"
RANGE=(); [ -n "${FROM:-}" ] && RANGE+=(--from "$FROM"); [ -n "${TO:-}" ] && RANGE+=(--to "$TO")
node pipeline/render.mjs video --workers "${WORKERS:-4}" "${RANGE[@]}"
echo "== mux"
mkdir -p release
AUD=(-i build/audio/mix.wav); [ -n "${FROM:-}" ] && AUD=(-ss "$FROM" -i build/audio/mix.wav)
ffmpeg -y -loglevel error -i build/video.mp4 "${AUD[@]}" -map 0:v -map 1:a \
  -vf hqdn3d=3:3:6:6 -c:v libx264 -preset slow -crf 26 -tune stillimage -pix_fmt yuv420p -c:a aac -b:a 160k -shortest -movflags +faststart \
  "release/${RELEASE_NAME:-game-theory}.mp4"
echo "done: release/${RELEASE_NAME:-game-theory}.mp4 $(ffmpeg -i release/${RELEASE_NAME:-game-theory}.mp4 2>&1 | grep -o 'Duration: [0-9:.]*')"
