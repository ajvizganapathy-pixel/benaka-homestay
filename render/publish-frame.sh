#!/bin/bash
# Publish a handoff frame so OpenArt can read it by URL, and confirm it is live.
#
#   bash render/publish-frame.sh <N> [suffix]
#     bash render/publish-frame.sh 03        -> assets/handoff/leg-03-last.png
#     bash render/publish-frame.sh 03 -p     -> assets/handoff/leg-03-last-p.png
#
# OpenArt's uploader is a browser widget and cannot read files from this
# machine, so the only way in is a public URL. This repository is public, and
# raw.githubusercontent.com serves any branch — the frames do not have to land
# on main mid-render, so this pushes and reads back the CURRENT branch.
set -euo pipefail
N=$1; SUF=${2:-}
F="assets/handoff/leg-$N-last$SUF.png"
BR=$(git rev-parse --abbrev-ref HEAD)
[ -f "$F" ] || { echo "no such frame: $F" >&2; exit 1; }
git add "$F"
git commit -q -m "Handoff frame for leg $N${SUF:+ (portrait)}

The frame leg $((10#$N + 1)) starts from. Committed because OpenArt reads frames
by URL and this repository is public; there is no path from this machine to an
OpenArt asset id.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UZewFMt2SkE2FsdCrb85Uf"
for i in 1 2 3; do git push -q -u origin "$BR" && break; sleep $((2**i)); done
URL="https://raw.githubusercontent.com/ajvizganapathy-pixel/benaka-homestay/$BR/$F"
for i in 1 2 3 4; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 25 "$URL" || echo 000)
  [ "$code" = "200" ] && { echo "live: $URL"; exit 0; }
  sleep $((2**i))
done
echo "NOT LIVE ($code) - do not submit the next leg" >&2; exit 1
