#!/usr/bin/env bash
# book.json -> vertical films, no human in the loop.
#   bash book-studio/film/make.sh <path/to/book.json> <outdir>
#     -> <outdir>/part1.mp4, part2.mp4, ... (H.264 + AAC, +faststart, each <= 19 MiB) and <outdir>/parts.json
#   Intermediate work is cached in <outdir>/build (timelines, per-scene frame segments, scores): a re-run only redoes
#   what changed. FRESH=1 re-renders every frame; WORKERS=n sets the render workers (default 4).
#   KEEP_BUILD=0 deletes <outdir>/build at the end (the next run starts from scratch).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
[ $# -ge 1 ] || { echo "usage: bash make.sh <book.json> <outdir>"; exit 2; }
BOOK="$(realpath "$1")"
OUT="$(realpath -m "${2:-$(dirname "$BOOK")/out}")"
BUILD="$OUT/build"
export PATH="$HERE/.bin:$PATH"     # a bundled ffmpeg from setup.sh, if the system has none
mkdir -p "$BUILD"
[ -d "$HERE/node_modules/playwright" ] || { echo "run: bash $HERE/setup.sh"; exit 1; }
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
[ -d "$PLAYWRIGHT_BROWSERS_PATH" ] || unset PLAYWRIGHT_BROWSERS_PATH
T0=$(date +%s)

echo "== timeline"
python3 "$HERE/pipeline/timeline.py" "$BOOK" "$BUILD"
PARTS=$(python3 -c "import json,sys; print(' '.join(str(p['part']) for p in json.load(open(sys.argv[1]))))" "$BUILD/parts.json")

echo "== score (in the background, while the frames render)"
(
  for p in $PARTS; do
    d="$BUILD/part$p"
    if [ -f "$d/mix.wav" ] && [ "$d/mix.wav" -nt "$d/timeline.json" ] && [ "$d/mix.wav" -nt "$HERE/pipeline/audio/score.py" ] && [ "$d/mix.wav" -nt "$HERE/pipeline/audio/common.py" ]; then
      echo "   part$p score: unchanged"
    else
      nice -n 5 python3 "$HERE/pipeline/audio/score.py" "$d" | tail -1
    fi
  done
) > "$BUILD/score.log" 2>&1 &
SCORE_PID=$!

echo "== frames"
node "$HERE/pipeline/render.mjs" film --build "$BUILD" --workers "${WORKERS:-4}" ${FRESH:+--fresh}
T1=$(date +%s)

if ! wait $SCORE_PID; then cat "$BUILD/score.log"; echo "score failed"; exit 1; fi
cat "$BUILD/score.log"

echo "== encode"
python3 "$HERE/pipeline/encode.py" "$BUILD" "$OUT"
[ "${KEEP_BUILD:-1}" = "0" ] && rm -rf "$BUILD"
T2=$(date +%s)
echo "done in $((T2 - T0))s (frames $((T1 - T0))s): $OUT/parts.json"
ls -la "$OUT"/*.mp4
