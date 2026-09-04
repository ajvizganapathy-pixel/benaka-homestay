#!/bin/bash
# Extract leg i's ACTUAL last frame, to be handed to leg i+1 as its start_image.
# This frame handoff is what makes the seam frame-identical; using the original
# photo instead is the single most common cause of a visible pop at the seam.
#
# Usage: bash render/extract-handoff-frame.sh render/raw/leg-03.mp4 render/frames/leg-03-last.png
set -euo pipefail
src="$1"; out="$2"
mkdir -p "$(dirname "$out")"
ffmpeg -y -loglevel error -sseof -0.15 -i "$src" -frames:v 1 -q:v 2 "$out"
echo "wrote $out"
# Eyeball it before chaining: it must read as a frame from a calm forward glide —
# no sideways motion blur, no half-finished orbit, no drifted angle. A bad handoff
# frame poisons every leg after it. Re-roll the leg rather than continuing.
