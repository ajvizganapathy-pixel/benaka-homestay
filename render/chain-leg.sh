#!/bin/bash
# Chain one portrait leg: download, measure, extract the handoff frame, publish.
#
#   bash render/chain-leg.sh <N> <url> <targetCanvas>
#
# Prints the two numbers that decide whether to keep it:
#   frame-lock  first frame vs the frame it was told to start from (>= ~30 dB)
#   landing     last frame vs the canvas it was aimed at (18-27 dB is a good land)
set -euo pipefail
N=$1; URL=$2; TARGET=$3
PREV=$(printf '%02d' $((10#$N - 1)))
mkdir -p render/raw-portrait assets/handoff
curl -sS --max-time 300 -o "render/raw-portrait/leg-$N.mp4" "$URL"
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration \
        -of csv=p=0:s=x "render/raw-portrait/leg-$N.mp4"
bash render/extract-handoff-frame.sh "render/raw-portrait/leg-$N.mp4" "assets/handoff/leg-$N-last-p.png" >/dev/null
python3 - "$N" "$PREV" "$TARGET" <<'PY'
import subprocess, sys, math, os
n, prev, target = sys.argv[1], sys.argv[2], sys.argv[3]
S = os.environ.get('SCRATCH', '/tmp')
def gray(p):
    return subprocess.run(['ffmpeg','-v','error','-i',p,'-vf','scale=288:512',
                           '-f','rawvideo','-pix_fmt','gray','-'],capture_output=True).stdout
def db(a,b):
    m=min(len(a),len(b))
    if not m: return float('nan')
    mse=sum((a[i]-b[i])**2 for i in range(m))/m
    return 10*math.log10(255*255/mse) if mse else 99.0
subprocess.run(['ffmpeg','-y','-v','error','-i',f'render/raw-portrait/leg-{n}.mp4',
                '-frames:v','1','-q:v','2',f'{S}/first.png'],check=True)
src = f'assets/handoff/leg-{prev}-last-p.png'
if os.path.isfile(src):
    print(f'  frame-lock  {db(gray(f"{S}/first.png"), gray(src)):.1f} dB')
print(f'  landing     {db(gray(f"assets/handoff/leg-{n}-last-p.png"), gray(target)):.1f} dB  vs {target}')
PY
c=$(ffprobe -v error -select_streams v:0 -show_entries stream=nb_frames -of csv=p=0 "render/raw-portrait/leg-$N.mp4")
sel=$(python3 -c "n=int('$c');print('+'.join('eq(n\\\\,%d)'%int(round(i*(n-1)/4)) for i in range(5)))")
ffmpeg -y -v error -i "render/raw-portrait/leg-$N.mp4" \
  -vf "select='$sel',tile=5x1,scale=-1:460" -frames:v 1 -q:v 3 "${SCRATCH:-/tmp}/strip-$N.jpg"
echo "  strip -> ${SCRATCH:-/tmp}/strip-$N.jpg"
