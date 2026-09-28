#!/usr/bin/env bash
# Download the offline models into models/ (git-ignored). Safe to re-run: existing models are skipped.
#   bash pipeline/fetch_models.sh
# Everything comes from GitHub releases (works where Hugging Face is unreachable).
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -L models ]; then echo "models/ is a link to $(readlink models); nothing to fetch"; exit 0; fi
mkdir -p models
TTS=https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models
ASR=https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models
VOC=https://github.com/k2-fsa/sherpa-onnx/releases/download/vocoder-models

fetch() {  # fetch <url> <dir-it-unpacks-to>
  local url=$1 dir=$2
  if [ -d "models/$dir" ]; then echo "ok   models/$dir"; return; fi
  echo "get  $url"
  curl -fL --retry 4 --retry-delay 2 -o models/_dl.tar.bz2 "$url"
  tar -xjf models/_dl.tar.bz2 -C models && rm -f models/_dl.tar.bz2
  echo "ok   models/$dir"
}

# Voice: ZipVoice (natural prosody), timbre from assets/voice_refs/yunjian.wav
ZV=sherpa-onnx-zipvoice-distill-int8-zh-en-emilia
fetch "$TTS/$ZV.tar.bz2" "$ZV"
[ -f "models/$ZV/vocos_24khz.onnx" ] || curl -fL --retry 4 -o "models/$ZV/vocos_24khz.onnx" "$VOC/vocos_24khz.onnx"
# Kokoro v1.0 (the 云健 voice itself; used to regenerate the timbre reference, and as a fast fallback engine)
fetch "$TTS/kokoro-multi-lang-v1_0.tar.bz2" kokoro-multi-lang-v1_0

# ASR for the automatic pronunciation check/repair (pipeline/fix_vo.py)
fetch "$ASR/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2" sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17

# The GM SoundFont used by the music (GeneralUser GS) downloads itself on first music build.
echo "models ready"
