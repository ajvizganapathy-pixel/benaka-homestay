#!/bin/bash
# Cut the seven 9:16 start/end canvases for the PORTRAIT chain.
#
# Phones crop a 16:9 clip to about a quarter of its width; a native 1080x1920
# leg shows 82% of the frame instead, which is the whole reason this chain
# exists. These canvases are what anchor it: leg 01's startFrame and every
# leg's endFrame. Legs 02-07 start from real 1080x1920 render output.
#
# The sources are WhatsApp-sized, so a 9:16 window off a landscape frame keeps
# only ~506-600px of width and gets upscaled ~1.8-2.1x. Two beats have a
# portrait-native source and are cut from that instead (games-hall-01 also puts
# the stair in frame, which is where leg 05 is going):
#   05 -> games-hall-01.jpg        1200x1600, 1.2x
#   06 -> room-heritage-double-03  1560x1560, 1.23x  (wheel headboard, almirah)
#
# The third argument is where the crop window is centred horizontally, 0..1.
# The values below were picked by eye against a contact sheet: the arch needs
# its whole sign, the road needs to lead somewhere, the pool must not sit on
# the frame edge. Re-run the whole script after changing one.
#
# Usage: bash render/cut-portrait-canvases.sh
set -euo pipefail
OUT=assets/scenes/portrait
mkdir -p "$OUT"

cut() {
  local src=$1 out=$2 xf=${3:-0.5}
  read -r W H < <(ffprobe -v error -select_streams v:0 \
      -show_entries stream=width,height -of csv=p=0 "$src" | tr ',' ' ')
  local cw ch x y
  ch=$H; cw=$(python3 -c "print(int(round($H*9/16)))")
  if [ "$cw" -gt "$W" ]; then cw=$W; ch=$(python3 -c "print(int(round($W*16/9)))"); fi
  x=$(python3 -c "print(max(0,min($W-$cw, int(round(($W-$cw)*$xf)))))")
  y=$(python3 -c "print(max(0,($H-$ch)//2))")
  ffmpeg -y -loglevel error -i "$src" \
    -vf "crop=$cw:$ch:$x:$y,scale=1080:1920:flags=lanczos,unsharp=5:5:0.7:5:5:0.0" \
    -q:v 2 "$out"
  echo "$(basename "$out")  src ${W}x${H}  crop ${cw}x${ch}+${x}+${y}  upscale $(python3 -c "print(round(1080/$cw,2))")x"
}

cut assets/raw/approach-road-01.jpg            $OUT/01-approach-road.jpg   0.68
cut assets/raw/gate-arch-02.jpg                $OUT/02-gate-arch.jpg       0.47
cut assets/raw/exterior-mainhouse-front-02.jpg $OUT/03-courtyard-house.jpg 0.42
cut assets/raw/courtyard-pavilion-02.jpg       $OUT/04-buffet-table.jpg    0.20
cut assets/raw/games-hall-01.jpg               $OUT/05-billiards.jpg       0.45
cut assets/raw/room-heritage-double-03.jpg     $OUT/06-room.jpg            0.35
cut assets/raw/pool-hills-04.jpg               $OUT/07-pool.jpg            0.45
