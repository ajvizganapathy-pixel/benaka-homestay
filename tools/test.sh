#!/bin/bash
# Production test suite — Benaka By The Hills.
#
# No framework and no package manifest: this project is deliberately static and
# framework-free, and its test suite has no business being the only thing that
# needs npm. Everything here is bash, node --check, python3 and php -r.
#
#   bash tools/test.sh
#
# There is no server side any more. The booking endpoint and the section of this
# suite that drove it over HTTP were removed with the booking flow; enquiries go
# straight to WhatsApp or the phone from plain links. See CLAUDE.md for how to
# recover the endpoint from history if it is ever wanted again.
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD

PASS=0; FAIL=0
ok()   { printf '  \033[32mok\033[0m    %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; [ $# -gt 1 ] && printf '        %s\n' "$2"; FAIL=$((FAIL+1)); }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

# ===========================================================================
head_ "1. Syntax"
# ===========================================================================
while IFS= read -r f; do
  if out=$(node --check "$f" 2>&1); then ok "node --check $f"; else bad "node --check $f" "$out"; fi
done < <(find web -name '*.js' | sort)

for f in tools/*.sh render/*.sh; do
  [ -f "$f" ] || continue
  if out=$(bash -n "$f" 2>&1); then ok "bash -n $f"; else bad "bash -n $f" "$out"; fi
done

if out=$(python3 -m json.tool assets/manifest.json >/dev/null 2>&1); then
  ok "assets/manifest.json is valid JSON"; else bad "assets/manifest.json" "$out"; fi

# ===========================================================================
head_ "2. Secrets and required files"
# ===========================================================================
# The booking flow is gone, not dormant. A half-removed one is worse than
# either: a Book button that opens nothing, or a form posting to a 404.
if [ -e api ] || [ -e web/js/booking.js ] || [ -e web/js/api.js ] || [ -e web/css/booking.css ]; then
  bad "a booking file is back" "$(ls -d api web/js/booking.js web/js/api.js web/css/booking.css 2>/dev/null)"
elif grep -qE 'data-open-booking|data-booking|booking\.(js|css)|js/api\.js' web/index.html; then
  bad "web/index.html still wires the booking flow"
else
  ok "no booking flow anywhere in the page"
fi

# Nothing token-shaped may ever be committed: a Meta system-user token starts
# EAA, and a bearer token is long and opaque.
if git grep -nIE '(EAA[A-Za-z0-9]{20,}|Bearer [A-Za-z0-9._-]{20,})' -- . >/dev/null 2>&1; then
  bad "something token-shaped is committed" "$(git grep -nIE '(EAA[A-Za-z0-9]{20,}|Bearer [A-Za-z0-9._-]{20,})' -- . | head -5)"
else
  ok "no token-shaped literal is committed"
fi

# The property was re-signed BENAKA ByTheHills. The old name lived in visible
# copy, in identifiers, in config keys and in three photographs; a half-done
# rename is how a client finds someone else's brand on their own website.
# Split so this line does not match its own pattern.
OLDNAME='sherloc'\''k'\'''
if git grep -niI "$OLDNAME" -- . >/dev/null 2>&1; then
  bad "the old property name is still in the tree" "$(git grep -niI "$OLDNAME" -- . | head -5)"
else
  ok "no trace of the old property name"
fi

for f in index.html web/index.html .htaccess assets/manifest.json \
         assets/brand/hero-wide-pool.jpg assets/brand/hero-tall.jpg \
         assets/brand/logo-112.png assets/brand/logo-168.png \
         web/favicon-64.png web/apple-touch-icon.png \
         assets/video/benaka-tour.mp4 assets/video/benaka-tour-poster.jpg \
         assets/video/hero-loop.mp4 assets/video/hero-loop-wide.mp4; do
  [ -f "$f" ] && ok "present: $f" || bad "missing: $f"
done

# ===========================================================================
head_ "3. Assets and CSS invariants"
# ===========================================================================
bash tools/check-css-invariants.sh >/dev/null 2>&1 \
  && ok "site.css invariants hold" \
  || bad "site.css invariants" "$(bash tools/check-css-invariants.sh 2>&1 | tail -4)"

# The property film must stream progressively. ffmpeg writes the moov index
# AFTER the media data unless -movflags +faststart is given, and a browser
# cannot paint a single frame until it has that index — so without this the
# whole 8.8MB downloads before anything appears. It fails silently: the video
# still works, it just takes forever to start, which is easy to blame on the
# network rather than on the encode.
# EVERY tracked video, not just the film: the phone hero loop is the more
# sensitive of the two, because it plays on the first screen.
for mp4 in assets/video/*.mp4; do
  atoms=$(python3 tools/atom-order.py "$mp4")
  mo=$(printf '%s\n' $atoms | grep -n '^moov$' | cut -d: -f1)
  md=$(printf '%s\n' $atoms | grep -n '^mdat$' | cut -d: -f1)
  if [ -n "$mo" ] && [ -n "$md" ] && [ "$mo" -lt "$md" ]; then
    ok "$(basename "$mp4") is faststart (moov before mdat)"
  else
    bad "$(basename "$mp4") is not faststart" "atom order: $atoms"
  fi
done

# The hero loop plays over the still on the FIRST SCREEN. It is deliberately
# fetched after window load, but a fat file would still steal bandwidth from
# the rest of the page the moment it lands, so hold it to a budget.
# Phones get the 9:16 loop, desktop the 16:9 one, each with its own budget.
for pair in hero-loop.mp4:1500 hero-loop-wide.mp4:3000; do
  f=assets/video/${pair%%:*}; kb=${pair##*:}
  hs=$(stat -c %s "$f")
  if [ "$hs" -le $((kb * 1000)) ]; then
    ok "${pair%%:*} is $((hs/1024))KB (budget ${kb}KB)"
  else
    bad "${pair%%:*} is too heavy" "$((hs/1024))KB, budget ${kb}KB"
  fi
done

# Every contact link must be one of the owner's numbers. A typo in a tel: or
# wa.me href does not look broken — it dials a stranger.
badnum=$(grep -oE '(tel:\+|wa\.me/)[0-9]+' web/index.html | grep -oE '[0-9]+$' | sort -u \
         | grep -vxE '91(9448647831|8197558321|8861070431|9647782880)')
[ -z "$badnum" ] && ok "every tel: and wa.me link is an owner's number" \
                 || bad "unknown number in a contact link" "$badnum"

missing=$(python3 - <<'PY'
import json, os
m = json.load(open('assets/manifest.json'))
bad = [i['file'] for i in m['images'] if not os.path.isfile('assets/raw/' + i['file'])]
print('\n'.join(bad))
PY
)
n=$(python3 -c "import json;print(len(json.load(open('assets/manifest.json'))['images']))")
[ -z "$missing" ] && ok "all $n manifest photographs exist" || bad "missing photographs" "$missing"

# Every galleryGroup's `stack` names the five photographs shown as its stack in
# the gallery. A typo there does not throw — the card is simply built with a src
# that 404s, or the group quietly falls back to fewer cards — so it has to be
# checked here rather than noticed in a screenshot.
stackbad=$(python3 - <<'PY'
import json, os
m = json.load(open('assets/manifest.json'))
by = {}
for i in m['images']:
    by.setdefault(i.get('galleryGroup'), set()).add(i['file'])
bad = []
for g in m.get('galleryGroups', []):
    st = g.get('stack')
    if not st:
        bad.append(g['id'] + ': no stack')
        continue
    if not 3 <= len(st) <= 5:
        bad.append('%s: %d in stack, want 3-5' % (g['id'], len(st)))
    for f in st:
        if f not in by.get(g['id'], set()):
            bad.append('%s: %s is not in that group' % (g['id'], f))
        elif not os.path.isfile('assets/raw/' + f):
            bad.append('%s: %s is not on disk' % (g['id'], f))
print('\n'.join(bad))
PY
)
ng=$(python3 -c "import json;print(len(json.load(open('assets/manifest.json'))['galleryGroups']))")
[ -z "$stackbad" ] && ok "all $ng gallery stacks resolve" || bad "gallery stack" "$stackbad"

# manifest count must match what is actually in the array
php -r '$m=json_decode(file_get_contents("assets/manifest.json"),true); exit($m["imageCount"]===count($m["images"])?0:1);' \
  && ok "manifest imageCount matches the array" || bad "manifest imageCount is stale"

# The CSP is script-src 'self'; an inline <script> would be blocked at runtime.
if grep -nE '<script(?![^>]*src=)' web/index.html >/dev/null 2>&1 \
   || grep -n '<script>' web/index.html >/dev/null 2>&1; then
  bad "web/index.html has an inline <script>, which the CSP blocks"
else
  ok "no inline <script> (CSP script-src 'self' is satisfiable)"
fi

grep -q "Content-Security-Policy" .htaccess && ok ".htaccess sets a CSP" || bad ".htaccess has no CSP"
grep -q "Options -Indexes"       .htaccess && ok ".htaccess disables directory listing" || bad "no Options -Indexes"
grep -q "RewriteCond %{HTTPS}"   .htaccess && ok ".htaccess forces HTTPS" || bad "no HTTPS redirect"

# ===========================================================================
printf '\n\033[1m%d passed, %d failed\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
