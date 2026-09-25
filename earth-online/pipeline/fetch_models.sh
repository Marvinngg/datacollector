#!/usr/bin/env bash
# Download the offline models into models/ (git-ignored). Safe to re-run: existing models are skipped.
#   bash pipeline/fetch_models.sh          # models needed to build the film
#   WITH_ASR=1 bash pipeline/fetch_models.sh   # + SenseVoice ASR for pronunciation checks (pipeline/check_vo.py)
# Everything comes from GitHub releases, so it works where Hugging Face is unreachable.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p models
TTS=https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models
ASR=https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models

fetch() {  # fetch <url> <dir-it-unpacks-to>
  local url=$1 dir=$2
  if [ -d "models/$dir" ]; then echo "ok   models/$dir"; return; fi
  echo "get  $url"
  curl -fL --retry 4 --retry-delay 2 -o models/_dl.tar.bz2 "$url"
  tar -xjf models/_dl.tar.bz2 -C models && rm -f models/_dl.tar.bz2
  echo "ok   models/$dir"
}

# Voice-over engines (pipeline/lines.json "engine" picks one; Kokoro is the default)
fetch "$TTS/kokoro-multi-lang-v1_1.tar.bz2" kokoro-multi-lang-v1_1
for m in ${EXTRA_TTS:-}; do fetch "$TTS/$m.tar.bz2" "$m"; done   # e.g. EXTRA_TTS="sherpa-onnx-zipvoice-distill-zh-en-emilia vits-icefall-zh-aishell3"

# Pronunciation check
if [ "${WITH_ASR:-0}" = "1" ]; then
  fetch "$ASR/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2" sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17
fi

# The GM SoundFont used by the music (GeneralUser GS) downloads itself on first music build.
echo "models ready"
