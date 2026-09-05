#!/bin/bash
# Fetch a finished OpenArt leg, extract its handoff frame, measure the seam, and
# publish the frame so the next leg can start from it.
#
#   bash render/fetch-leg.sh <N> <resultUrl> [targetCanvas]
#
# Prints the numbers that decide whether to chain or re-roll:
#   frame0 vs the start frame  -> should be >= ~30 dB (frame-lock held)
#   last   vs the target canvas -> 18-25 dB with matching composition is a good landing
set -euo pipefail
N=$1; URL=$2; TARGET=${3:-}
mkdir -p render/raw assets/handoff

curl -sS --max-time 240 -o "render/raw/leg-$N.mp4" "$URL"
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration \
        -of csv=p=0:s=x "render/raw/leg-$N.mp4"

bash render/extract-handoff-frame.sh "render/raw/leg-$N.mp4" "assets/handoff/leg-$N-last.png"

SP="${SCRATCH:-/tmp}"
ffmpeg -y -v error -i "render/raw/leg-$N.mp4" \
  -vf "select='eq(n\,0)+eq(n\,64)+eq(n\,128)+eq(n\,191)',tile=4x1,scale=3200:-1" \
  -frames:v 1 -q:v 3 "$SP/leg$N-strip.jpg"

if [ -n "$TARGET" ]; then
  python3 - "$N" "$TARGET" <<'PY'
import subprocess, sys, math
n, target = sys.argv[1], sys.argv[2]
def g(p):
    return subprocess.run(['ffmpeg','-v','error','-i',p,'-vf','scale=512:288',
                           '-f','rawvideo','-pix_fmt','gray','-'],capture_output=True).stdout
A,B = g(f'assets/handoff/leg-{n}-last.png'), g(target)
m = min(len(A),len(B)); mse = sum((A[i]-B[i])**2 for i in range(m))/m
print(f"  last frame vs {target}: {10*math.log10(255*255/mse):.1f} dB")
PY
fi
echo "  strip -> $SP/leg$N-strip.jpg"
