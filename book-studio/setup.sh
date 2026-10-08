#!/usr/bin/env bash
# Make a fresh container ready to build books: film + podcast pipelines (models, npm, pip).
set -euo pipefail
cd "$(dirname "$0")"
bash film/setup.sh
bash podcast/setup.sh
echo "book-studio ready"
