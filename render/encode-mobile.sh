#!/bin/bash
# Encode the PORTRAIT chain for phones.
#
# The engine serves `clipMobile` on a coarse-pointer / <=860px viewport. Those
# files are a native 9:16 render, not a resize of the landscape master — see the
# note at the foot of render/encode.sh for why the resize was a mistake.
#
# NATIVE RESOLUTION, no downscale. This used to write 810x1440 to save
# bandwidth. On a 390x844 phone `object-fit: cover` scales a 9:16 clip by 0.44
# and shows 82% of its width, so 810 wide put ~665 source pixels across 390 CSS
# pixels; native 1080 puts 887 there. That is 1.33x more detail on the glass for
# no credits at all — the single cheapest quality win available on this site,
# and the reason to spend bytes rather than pixels.
#
# It costs about 14MB a leg instead of 8MB. The engine fetches one leg at a time
# as you approach it, so that is 14MB before the first scene moves, not 100MB.
# If mobile data ever proves the binding constraint, put `scale=810:1440` back
# in the filter chain below and nothing else has to change.
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

# The raw directory is gitignored working state and survives between chains, so
# a leg from a PREVIOUS run sits there looking exactly like a current one. It
# would encode cleanly and chain visibly wrong. Refuse anything older than the
# newest leg by more than an hour rather than shipping a mixed chain.
if [ ${#legs[@]} -gt 1 ]; then
  newest=0
  for f in "${legs[@]}"; do t=$(stat -c %Y "$f"); [ "$t" -gt "$newest" ] && newest=$t; done
  for f in "${legs[@]}"; do
    t=$(stat -c %Y "$f")
    if [ $((newest - t)) -gt 3600 ]; then
      echo "REFUSING: $(basename "$f") is $(( (newest - t) / 3600 ))h older than the" >&2
      echo "newest leg in $IN_DIR — that is a leg from an earlier chain. Delete it or" >&2
      echo "re-render it; a mixed chain has a visible seam." >&2
      exit 1
    fi
  done
fi
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
    -vf "unsharp=5:5:0.8:5:5:0.0" \
    -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p \
    -g 4 -keyint_min 4 -sc_threshold 0 -movflags +faststart \
    "$out"
done

echo "done -> $OUT_DIR"
