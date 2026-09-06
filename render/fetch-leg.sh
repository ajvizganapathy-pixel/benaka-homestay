#!/bin/bash
# Fetch a finished OpenArt leg, extract its handoff frame, measure the seam, and
# lay out a contact strip so the leg can be eyeballed before it is chained.
#
#   bash render/fetch-leg.sh <N> <resultUrl> [targetCanvas] [-p]
#
# The trailing -p switches to the PORTRAIT chain: render/raw-portrait/leg-0N.mp4
# and assets/handoff/leg-0N-last-p.png.
#
# Prints the numbers that decide whether to chain or re-roll:
#   frame0 vs the start frame   -> should be >= ~30 dB (frame-lock held)
#   last   vs the target canvas -> 18-25 dB with matching composition is a good landing
set -euo pipefail
N=$1; URL=$2; TARGET=${3:-}; MODE=${4:-}
if [ "$MODE" = "-p" ] || [ "$TARGET" = "-p" ]; then
  [ "$TARGET" = "-p" ] && TARGET=""
  RAW=render/raw-portrait; SUF="-p"
else
  RAW=render/raw; SUF=""
fi
mkdir -p "$RAW" assets/handoff

curl -sS --max-time 300 -o "$RAW/leg-$N.mp4" "$URL"
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration \
        -of csv=p=0:s=x "$RAW/leg-$N.mp4"

bash render/extract-handoff-frame.sh "$RAW/leg-$N.mp4" "assets/handoff/leg-$N-last$SUF.png"

SP="${SCRATCH:-/tmp}"
n=$(ffprobe -v error -select_streams v:0 -show_entries stream=nb_frames -of csv=p=0 "$RAW/leg-$N.mp4")
sel=$(python3 -c "
n=int('$n'); ks=[int(round(i*(n-1)/4)) for i in range(5)]
print('+'.join('eq(n\\\\,%d)'%k for k in ks))")
ffmpeg -y -v error -i "$RAW/leg-$N.mp4" \
  -vf "select='$sel',tile=5x1,scale=-1:700" -frames:v 1 -q:v 3 "$SP/leg$N$SUF-strip.jpg"

if [ -n "$TARGET" ]; then
  python3 - "$N" "$TARGET" "$SUF" <<'PY'
import subprocess, sys, math
n, target, suf = sys.argv[1], sys.argv[2], sys.argv[3]
def g(p):
    return subprocess.run(['ffmpeg','-v','error','-i',p,'-vf','scale=288:512',
                           '-f','rawvideo','-pix_fmt','gray','-'],capture_output=True).stdout
A,B = g(f'assets/handoff/leg-{n}-last{suf}.png'), g(target)
m = min(len(A),len(B)); mse = sum((A[i]-B[i])**2 for i in range(m))/m
print(f"  last frame vs {target}: {10*math.log10(255*255/mse):.1f} dB")
PY
fi
echo "  strip -> $SP/leg$N$SUF-strip.jpg"
