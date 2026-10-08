#!/usr/bin/env bash
# One command: book.json -> <outdir>/podcast.mp4 + <outdir>/podcast.json
#   bash book-studio/podcast/make.sh book-studio/books/dafen/book.json book-studio/books/dafen/out
# env: PODCAST_ASR=0 skips the per-line ASR check; PODCAST_COVER=1280x720 for a wide cover frame;
#      PODCAST_VERIFY=0 skips the final verification.
set -euo pipefail
if [ $# -ne 2 ]; then echo "usage: bash $0 <path/to/book.json> <outdir>" >&2; exit 2; fi
BOOK=$(realpath "$1"); OUT=$(realpath -m "$2")
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$OUT"
cd "$HERE"
python3 build.py "$BOOK" "$OUT"
if [ "${PODCAST_VERIFY:-1}" != "0" ]; then python3 verify.py "$OUT"; fi
