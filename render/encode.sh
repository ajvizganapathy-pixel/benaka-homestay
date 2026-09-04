#!/bin/bash
# Encode the rendered Higgsfield legs for scroll scrubbing.
# Settings are the scroll-world skill's Step 6 verbatim: native resolution (no
# downscale), crf 20, GOP 8, faststart, audio stripped, light unsharp to counter
# video softness. Blob loading in the engine makes byte-range support irrelevant,
# so GOP 8 scrubs fine at ~8MB instead of ~25MB all-intra.
#
# Usage: bash render/encode.sh            (encodes render/raw/leg-*.mp4)
set -euo pipefail

IN_DIR="${1:-render/raw}"
OUT_DIR="${2:-assets/clips}"
mkdir -p "$OUT_DIR"

shopt -s nullglob
legs=("$IN_DIR"/leg-*.mp4)
if [ ${#legs[@]} -eq 0 ]; then
  echo "no legs found in $IN_DIR — nothing to encode" >&2
  exit 1
fi

for src in "${legs[@]}"; do
  base=$(basename "$src")
  out="$OUT_DIR/$base"
  echo "encoding $base ($(ffprobe -v error -select_streams v:0 \
        -show_entries stream=width,height -of csv=p=0:s=x "$src"))"
  ffmpeg -y -loglevel error -i "$src" -an \
    -vf "unsharp=5:5:0.8:5:5:0.0" \
    -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p \
    -g 8 -keyint_min 8 -sc_threshold 0 -movflags +faststart \
    "$out"
done

echo "done -> $OUT_DIR"
