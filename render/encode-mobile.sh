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
# would encode cleanly and chain visibly wrong.
#
# This used to refuse anything more than an hour older than the newest leg. That
# is the wrong test: it fired twice on chains that were perfectly continuous but
# had a pause in the middle while a human answered a question, and it would not
# have caught a stale leg re-rendered minutes ago. Wall-clock age was only ever a
# proxy for the thing that matters.
#
# So check the real invariant instead. Architecture A says leg N starts from leg
# N-1's ACTUAL last frame, and those frames are kept in assets/handoff. If leg
# N's frame 0 matches assets/handoff/leg-(N-1)-last-p.png, the two legs are from
# the same chain no matter when they were rendered; if it does not, they are not,
# however fresh they look. Rendering measures this as frame-lock and it comes
# back 33-39 dB on a good join, ~15 dB when the picture is merely similar.
check_chain () {
  local dir=$1 prev cur first ref db
  for f in "$dir"/leg-*.mp4; do
    cur=$(basename "$f" .mp4); cur=${cur#leg-}
    prev=$(printf '%02d' $((10#$cur - 1)))
    ref="assets/handoff/leg-$prev-last-p.png"
    [ -f "$ref" ] || continue          # first leg of the chain, or no record
    first=$(mktemp --suffix=.png)
    ffmpeg -v error -y -i "$f" -frames:v 1 "$first"
    db=$(python3 - "$first" "$ref" <<'PYEOF'
import subprocess, sys, math
def gray(p):
    return subprocess.run(['ffmpeg','-v','error','-i',p,'-vf','scale=288:512',
                           '-f','rawvideo','-pix_fmt','gray','-'],
                          capture_output=True).stdout
a, b = gray(sys.argv[1]), gray(sys.argv[2])
n = min(len(a), len(b))
mse = sum((a[i]-b[i])**2 for i in range(n))/n if n else 0
print(f"{10*math.log10(255*255/mse) if mse else 99:.1f}")
PYEOF
)
    rm -f "$first"
    if [ "$(echo "$db < 25" | bc -l)" = 1 ]; then
      echo "REFUSING: leg-$cur does not start where leg-$prev ended ($db dB)." >&2
      echo "These legs are from different chains and would encode a visible seam." >&2
      echo "Re-render leg-$cur from assets/handoff/leg-$prev-last-p.png." >&2
      exit 1
    fi
    echo "  chain ok  leg-$prev -> leg-$cur  $db dB"
  done
}
[ ${#legs[@]} -gt 1 ] && check_chain "$IN_DIR"

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
