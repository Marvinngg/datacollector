#!/usr/bin/env bash
# Earth Online audio: music -> sfx -> mix.  Outputs build/audio/{music,sfx,mix}.wav (48 kHz stereo).
#   pipeline/audio/build_audio.sh            # full build (re-exports cues from the scenes first)
#   SKIP_CUES=1 pipeline/audio/build_audio.sh   # use the existing build/cues.json
#   PLOTS=1 ...                              # also write self-check plots to build/audio/plots/
set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

# python deps (tinysoundfont without its optional pyaudio playback dependency)
python3 -c "import tinysoundfont" 2>/dev/null || pip install -q --no-deps tinysoundfont
python3 -c "import pedalboard, pyloudnorm, matplotlib" 2>/dev/null || pip install -q pedalboard pyloudnorm matplotlib

if [ "${SKIP_CUES:-0}" != "1" ]; then
  (cd "$ROOT" && node pipeline/render.mjs cues) || echo "!! cue export failed, using existing build/cues.json"
fi

cd "$HERE"
echo "== music";  python3 music.py
echo "== sfx";    python3 sfx.py
echo "== mix";    python3 mix.py
if [ "${PLOTS:-0}" = "1" ]; then echo "== plots"; python3 check.py; fi
echo "done: $ROOT/build/audio/mix.wav"
