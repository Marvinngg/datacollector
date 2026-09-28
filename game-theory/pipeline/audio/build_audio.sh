#!/usr/bin/env bash
# 《博弈论：看局、解局、改局》 audio: cues -> music -> sfx -> mix.  Outputs build/audio/{music,sfx,mix}.wav (48 kHz stereo).
#   pipeline/audio/build_audio.sh                # full build (re-exports cues from the templates first)
#   SKIP_CUES=1 pipeline/audio/build_audio.sh    # use the existing build/cues.json
#   SKIP_MUSIC=1 ...                             # keep the existing music.wav (only when timeline.json is unchanged)
#   PLOTS=1 ...                                  # also write self-check plots to build/audio/plots/
# Every time is read from build/timeline.json at run time: re-run this after every voice / timeline pass.
# timeline "mode": "silent" (v2, no narration) -> music_v2.py score, no build/vo, no ducking; otherwise v1.
set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

# python deps (tinysoundfont without its optional pyaudio playback dependency)
python3 -c "import tinysoundfont" 2>/dev/null || pip install -q --no-deps tinysoundfont
python3 -c "import pedalboard, pyloudnorm, matplotlib, soundfile, scipy" 2>/dev/null || pip install -q pedalboard pyloudnorm matplotlib soundfile scipy

if [ "${SKIP_CUES:-0}" != "1" ]; then
  (cd "$ROOT" && node pipeline/render.mjs cues) || echo "!! cue export failed, using existing build/cues.json"
fi

cd "$HERE"
if [ "${SKIP_MUSIC:-0}" != "1" ]; then echo "== music"; STEMS="${PLOTS:-0}" python3 music.py; fi
echo "== sfx";    python3 sfx.py
echo "== mix";    if [ "${PLOTS:-0}" = "1" ]; then python3 -W ignore mix.py --plot; else python3 mix.py; fi
if [ "${PLOTS:-0}" = "1" ]; then echo "== plots"; python3 check.py; fi
echo "done: $ROOT/build/audio/mix.wav"
