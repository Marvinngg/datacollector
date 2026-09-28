#!/usr/bin/env bash
# Voice-over with automatic pronunciation repair: synthesize -> ASR check -> repair -> rebuild timeline.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 pipeline/gen_vo.py  2>&1 | grep -v -E "Unknown token|Warn" | tail -1
if [ -d models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17 ]; then
  python3 pipeline/fix_vo.py 2>&1 | grep -E "^(fixed|LISTEN|[0-9]+ fixed)" || true
  python3 pipeline/gen_vo.py 2>&1 | grep -v -E "Unknown token|Warn" | tail -1
else
  echo "(no ASR model: skipping pronunciation repair; WITH_ASR=1 bash pipeline/fetch_models.sh to enable)"
fi
