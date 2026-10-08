#!/usr/bin/env bash
# Make a fresh container ready for make.sh.  Safe to re-run: everything already present is skipped.
#   bash book-studio/podcast/setup.sh            # TTS model, SoundFont, fonts, SenseVoice ASR, python deps
#   WITH_ASR=0 bash book-studio/podcast/setup.sh # skip the ASR model (no per-line pronunciation check / spot check)
# Models are reused from earth-online/models/ when that folder has them; otherwise they are downloaded into
# book-studio/podcast/models/ (git-ignored).  All downloads come from GitHub (Hugging Face is not needed).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
SHARED="$HERE/../../earth-online/models"
M="$HERE/models"
mkdir -p "$M/fonts" "$M/sf2"
TTS=https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models
ASR=https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models

# --- system tools
if ! command -v ffmpeg >/dev/null; then
  if command -v apt-get >/dev/null; then (apt-get update -qq && apt-get install -y -qq ffmpeg) || sudo apt-get install -y -qq ffmpeg
  else echo "please install ffmpeg (with libx264)" >&2; exit 1; fi
fi

# --- python
PIP="python3 -m pip install -q --disable-pip-version-check"
$PIP "sherpa-onnx==1.13.8" soundfile numpy scipy pillow pyloudnorm pypinyin
# tinysoundfont declares pyaudio (realtime playback only, needs portaudio headers); offline rendering does not use it
$PIP --no-deps tinysoundfont
python3 -c "import sherpa_onnx, soundfile, numpy, scipy, PIL, pyloudnorm, pypinyin, tinysoundfont" \
  || { echo "python deps missing" >&2; exit 1; }

have() { [ -e "$M/$1" ] || [ -e "$SHARED/$1" ]; }

fetch_tar() {  # fetch_tar <url> <dir it unpacks to>
  local url=$1 dir=$2
  if have "$dir"; then echo "ok   $dir"; return; fi
  echo "get  $url"
  curl -fL --retry 4 --retry-delay 2 -o "$M/_dl.tar.bz2" "$url"
  tar -xjf "$M/_dl.tar.bz2" -C "$M" && rm -f "$M/_dl.tar.bz2"
  echo "ok   $dir"
}

fetch_file() {  # fetch_file <url> <path relative to models/> <min bytes>
  local url=$1 rel=$2 min=$3
  if have "$rel"; then echo "ok   $rel"; return; fi
  echo "get  $url"
  curl -fL --retry 4 --retry-delay 2 -o "$M/$rel.part" "$url"
  [ "$(stat -c %s "$M/$rel.part")" -ge "$min" ] || { echo "download too small: $rel" >&2; exit 1; }
  mv "$M/$rel.part" "$M/$rel"; echo "ok   $rel"
}

# TTS: Kokoro v1.1-zh (both hosts are built-in speakers of this one model, see voices.json)
fetch_tar "$TTS/kokoro-multi-lang-v1_1.tar.bz2" kokoro-multi-lang-v1_1
# Music: GeneralUser GS SoundFont
fetch_file https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/main/GeneralUser-GS.sf2 sf2/GeneralUser-GS.sf2 1000000
# Cover font: Noto Serif SC (SIL OFL)
for w in Bold Regular; do
  fetch_file "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Serif/SubsetOTF/SC/NotoSerifSC-$w.otf" \
    "fonts/NotoSerifSC-$w.otf" 1000000
done
# SenseVoice ASR: build.py re-synthesises lines whose transcript does not match; verify.py spot-checks the result
if [ "${WITH_ASR:-1}" = "1" ]; then
  fetch_tar "$ASR/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2" \
    sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17
fi
echo "podcast pipeline ready"
