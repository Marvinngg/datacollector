#!/usr/bin/env bash
# One-time setup of the film pipeline in a FRESH container / clone. Safe to re-run. Then:
#   bash book-studio/film/make.sh <book.json> <outdir>
# Installs: python packages (numpy, scipy, soundfile, pyloudnorm, tinysoundfont), node packages (playwright 1.56
# + the web fonts), headless Chromium (unless preinstalled in $PLAYWRIGHT_BROWSERS_PATH, e.g. /opt/pw-browsers),
# ffmpeg with libx264 (system, else a static build from pip's imageio-ffmpeg), and the General MIDI SoundFont
# the score plays (GeneralUser GS, 32 MB, from GitHub; Hugging Face is not needed).
set -euo pipefail
cd "$(dirname "$0")"

need() { command -v "$1" >/dev/null || { echo "missing: $1 ($2)"; exit 1; }; }
need python3 "Python 3.10+"
need node "Node.js 18+"
need npm "Node.js 18+"
need curl "curl"

echo "== python packages"
PIP="python3 -m pip install -q"
$PIP "numpy>=1.24" "scipy>=1.10" "soundfile>=0.12" "pyloudnorm==0.2.0" 2>/dev/null \
  || $PIP --break-system-packages "numpy>=1.24" "scipy>=1.10" "soundfile>=0.12" "pyloudnorm==0.2.0"
$PIP --no-deps "tinysoundfont>=0.3.6" 2>/dev/null || $PIP --break-system-packages --no-deps "tinysoundfont>=0.3.6"
python3 -c "import numpy, scipy, soundfile, pyloudnorm, tinysoundfont" && echo "python ok"

echo "== node packages (playwright 1.56 + fonts)"
npm install --no-audit --no-fund --silent
echo "node ok"

echo "== headless chromium"
if [ -n "${PLAYWRIGHT_BROWSERS_PATH:-}" ] && ls -d "$PLAYWRIGHT_BROWSERS_PATH"/chromium* >/dev/null 2>&1; then
  echo "using preinstalled browsers in $PLAYWRIGHT_BROWSERS_PATH"
elif ls -d /opt/pw-browsers/chromium* >/dev/null 2>&1; then
  echo "using preinstalled browsers in /opt/pw-browsers (make.sh sets PLAYWRIGHT_BROWSERS_PATH)"
else
  npx playwright install chromium
fi

echo "== ffmpeg"
if command -v ffmpeg >/dev/null && ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libx264; then
  echo "using system ffmpeg: $(command -v ffmpeg)"
else
  $PIP "imageio-ffmpeg>=0.5" 2>/dev/null || $PIP --break-system-packages "imageio-ffmpeg>=0.5"
  mkdir -p .bin
  ln -sf "$(python3 -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())')" .bin/ffmpeg
  echo "using bundled ffmpeg via $(pwd)/.bin/ffmpeg (make.sh puts .bin on PATH; ffprobe falls back to ffmpeg)"
fi

echo "== SoundFont"
SF2=models/sf2/GeneralUser-GS.sf2
SF2_SHA=9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe
SF2_URL=https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/main/GeneralUser-GS.sf2
mkdir -p models/sf2
ok_sf2() { [ -f "$SF2" ] && [ "$(sha256sum "$SF2" | cut -d' ' -f1)" = "$SF2_SHA" ]; }
if ok_sf2; then echo "ok   $SF2"
else
  for local in ../../earth-online/models/sf2/GeneralUser-GS.sf2 ../../good-kid/models/sf2/GeneralUser-GS.sf2; do
    if [ -f "$local" ]; then cp "$local" "$SF2"; ok_sf2 && { echo "copied $local"; break; }; fi
  done
  if ! ok_sf2; then
    echo "get  $SF2_URL"
    curl -fL --retry 4 --retry-delay 2 -o "$SF2.part" "$SF2_URL" && mv "$SF2.part" "$SF2"
  fi
  ok_sf2 || { echo "SoundFont checksum mismatch: $SF2"; exit 1; }
  curl -fsL -o models/sf2/LICENSE.txt https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/main/LICENSE.txt || true
  echo "ok   $SF2"
fi

echo
echo "setup done. make films with:  bash $(pwd)/make.sh <book.json> <outdir>"
