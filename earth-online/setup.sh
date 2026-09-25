#!/usr/bin/env bash
# One-time setup on a fresh clone (Linux or macOS). Then:  bash pipeline/make.sh
#   bash setup.sh                 # deps + models
#   WITH_ASR=1 bash setup.sh      # + ASR model for pronunciation checks
set -euo pipefail
cd "$(dirname "$0")"

need() { command -v "$1" >/dev/null || { echo "missing: $1 ($2)"; exit 1; }; }
need python3 "Python 3.10+"
need node "Node.js 18+"
need npm "Node.js 18+"
need curl "curl"

echo "== python packages"
python3 -m pip install -q -r requirements.txt
python3 -m pip install -q --no-deps tinysoundfont

echo "== node packages (fonts + playwright)"
npm install --silent

echo "== headless chromium"
if [ -n "${PLAYWRIGHT_BROWSERS_PATH:-}" ] && [ -d "$PLAYWRIGHT_BROWSERS_PATH" ]; then
  echo "using preinstalled browsers in $PLAYWRIGHT_BROWSERS_PATH"
else
  npx playwright install chromium
fi

echo "== ffmpeg"
mkdir -p .bin
if command -v ffmpeg >/dev/null && ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libx264; then
  echo "using system ffmpeg: $(command -v ffmpeg)"
else
  ln -sf "$(python3 -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())')" .bin/ffmpeg
  echo "using bundled ffmpeg via .bin/ffmpeg"
fi

echo "== models"
bash pipeline/fetch_models.sh

echo
echo "setup done. build the film with:  bash pipeline/make.sh   (output: release/earth-online.mp4)"
