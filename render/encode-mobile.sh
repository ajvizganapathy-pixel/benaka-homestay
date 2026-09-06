#!/bin/bash
# Encode the PORTRAIT chain for phones.
#
# The engine serves `clipMobile` on a coarse-pointer / <=860px viewport. Those
# files are a native 9:16 render, not a resize of the landscape master — see the
# note at the foot of render/encode.sh for why the resize was a mistake.
#
# 810x1440 is the size, and it is a considered number. On a 390x844 phone
# `object-fit: cover` scales a 9:16 clip by 0.44 and shows 82% of its width, so
# 810 wide puts ~665 source pixels across 390 CSS pixels — 2.0x what the old
# 16:9 mobile encode managed, at roughly 10MB a leg. The engine fetches one leg
# at a time as you approach it, so that is 10MB, not 70MB, before the first
# scene moves. If it ever proves heavy on mobile data, 720x1280 / crf 23 is the
# fallback and is still 1.8x the old detail.
#
# -g 4 for the same reason as the desktop encode, more so: a phone decoder's
# seek cost is dominated by frames-from-keyframe, and this file gets scrubbed.
#
# Usage: bash render/encode-mobile.sh            (reads render/raw-portrait)
set -euo pipefail

IN_DIR="${1:-render/raw-portrait}"
OUT_DIR="${2:-assets/clips}"
mkdir -p "$OUT_DIR"

shopt -s nullglob
legs=("$IN_DIR"/leg-*.mp4)
if [ ${#legs[@]} -eq 0 ]; then
  echo "no portrait legs found in $IN_DIR — nothing to encode" >&2
  exit 1
fi

for src in "${legs[@]}"; do
  base=$(basename "$src" .mp4)
  out="$OUT_DIR/$base-m.mp4"
  dims=$(ffprobe -v error -select_streams v:0 \
         -show_entries stream=width,height -of csv=p=0 "$src")
  case "$dims" in
    *,*) w=${dims%%,*}; h=${dims##*,} ;;
  esac
  if [ "$w" -ge "$h" ]; then
    echo "REFUSING $base: $dims is not portrait. The phone build must be a" >&2
    echo "native 9:16 render; a landscape leg here is the bug this script exists" >&2
    echo "to prevent." >&2
    exit 1
  fi
  echo "mobile $(basename "$out")  <- $dims"
  ffmpeg -y -loglevel error -i "$src" -an \
    -vf "scale=810:1440:flags=lanczos,unsharp=5:5:0.8:5:5:0.0" \
    -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p \
    -g 4 -keyint_min 4 -sc_threshold 0 -movflags +faststart \
    "$out"
done

echo "done -> $OUT_DIR"
