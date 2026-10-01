#!/usr/bin/env bash
# One-time setup on a fresh clone (Linux or macOS). Then:  bash pipeline/make.sh
set -euo pipefail
cd "$(dirname "$0")"
command -v python3 >/dev/null && command -v node >/dev/null || { echo "need python3 (3.10+) and node (18+)"; exit 1; }
python3 -m pip install -q -r requirements.txt && python3 -m pip install -q --no-deps tinysoundfont
npm install --silent
if [ -z "${PLAYWRIGHT_BROWSERS_PATH:-}" ]; then npx playwright install chromium; fi
mkdir -p .bin
if ! (command -v ffmpeg >/dev/null && ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libx264); then
  ln -sf "$(python3 -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())')" .bin/ffmpeg
fi
echo "setup done. build the film with:  bash pipeline/make.sh   (the SoundFont downloads itself on the first sound build)"
