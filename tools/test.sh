#!/bin/bash
# Production test suite — Benaka By The Hills.
#
# No framework and no package manifest: this project is deliberately static and
# framework-free, and its test suite has no business being the only thing that
# needs npm. Everything here is bash, php, curl, node --check and jq.
#
#   bash tools/test.sh
#
# It boots a real PHP server against fixture configs and drives the booking
# endpoint over HTTP, so what is being tested is the endpoint as deployed, not
# a mock of it. WhatsApp sends go to WA_TRANSPORT=log, which writes the exact
# payload it would have posted to Meta — that is how the owner's message is read
# how the owner's message is inspected without any credentials existing.
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD

PASS=0; FAIL=0
ok()   { printf '  \033[32mok\033[0m    %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; [ $# -gt 1 ] && printf '        %s\n' "$2"; FAIL=$((FAIL+1)); }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

TMP=$(mktemp -d); trap 'rm -rf "$TMP"; [ -n "${SRV:-}" ] && kill "$SRV" 2>/dev/null' EXIT

# ===========================================================================
head_ "1. Syntax"
# ===========================================================================
while IFS= read -r f; do
  if out=$(php -l "$f" 2>&1); then ok "php -l $f"; else bad "php -l $f" "$out"; fi
done < <(find api -name '*.php' | sort)

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
[ -f api/config.php ] \
  && bad "api/config.php must not exist in the repo" \
  || ok "api/config.php absent"

grep -qx 'api/config.php' .gitignore \
  && ok ".gitignore ignores api/config.php" \
  || bad ".gitignore does not ignore api/config.php"

# A real Meta system-user token starts EAA; a Graph token is long and opaque.
if git grep -nIE '(EAA[A-Za-z0-9]{20,}|Bearer [A-Za-z0-9._-]{20,})' -- . >/dev/null 2>&1; then
  bad "something token-shaped is committed" "$(git grep -nIE '(EAA[A-Za-z0-9]{20,}|Bearer [A-Za-z0-9._-]{20,})' -- . | head -5)"
else
  ok "no token-shaped literal is committed"
fi

# Every credential slot in the example file must be empty.
if php -r '
  $c = require "api/config.example.php";
  foreach (["OWNER_WHATSAPP","WA_PHONE_ID","WA_TOKEN"] as $k) {
      if (($c[$k] ?? "") !== "") { fwrite(STDERR, "$k is not empty\n"); exit(1); }
  }
  if (!empty($c["CONFIGURED"])) { fwrite(STDERR, "CONFIGURED is true\n"); exit(1); }
' 2>"$TMP/cfgerr"; then ok "config.example.php ships no values"; else bad "config.example.php" "$(cat "$TMP/cfgerr")"; fi

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

for f in index.html web/index.html api/booking.php api/config.example.php \
         .htaccess assets/manifest.json \
         assets/video/benaka-tour.mp4 assets/video/benaka-tour-poster.jpg; do
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
atoms=$(python3 tools/atom-order.py assets/video/benaka-tour.mp4)
mo=$(printf '%s\n' $atoms | grep -n '^moov$' | cut -d: -f1)
md=$(printf '%s\n' $atoms | grep -n '^mdat$' | cut -d: -f1)
if [ -n "$mo" ] && [ -n "$md" ] && [ "$mo" -lt "$md" ]; then
  ok "the property film is faststart (moov before mdat)"
else
  bad "the property film is not faststart" "atom order: $atoms"
fi

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
head_ "4. Booking API"
# ===========================================================================
PORT=8791
ORIGIN="http://127.0.0.1:$PORT"

mkcfg() {  # mkcfg <name> <php-array-overrides>
  local name=$1; shift
  mkdir -p "$TMP/data-$name"
  cat > "$TMP/cfg-$name.php" <<PHPCFG
<?php return array_merge([
  'CONFIGURED' => true,
  'OWNER_WHATSAPP_NUMBERS' => ['919448600001', '918861000002'],
  'WA_PHONE_ID' => 'test-phone-id',
  'WA_TOKEN' => 'test-token',
  'WA_API_VERSION' => 'v25.0',
  'WA_BOOKING_TEMPLATE' => 'benaka_booking_request',
  'WA_TRANSPORT' => 'log',
  'RATE_PER_IP_HOUR' => 200,
  'BOOKINGS_PER_NUMBER_DAY' => 50,
  'DATA_DIR' => '$TMP/data-$name',
  'ALLOWED_ORIGINS' => ['$ORIGIN'],
], $*);
PHPCFG
}

serve() {  # serve <config-name>
  [ -n "${SRV:-}" ] && { kill "$SRV" 2>/dev/null; wait "$SRV" 2>/dev/null; }
  BENAKA_CONFIG="$TMP/cfg-$1.php" php -S "127.0.0.1:$PORT" -t "$ROOT" >"$TMP/srv.log" 2>&1 &
  SRV=$!
  for _ in $(seq 1 50); do
    curl -sf -o /dev/null "$ORIGIN/web/index.html" && return 0
    php -r 'usleep(100000);'
  done
  bad "php -S did not come up"; return 1
}

# POST <json> [extra curl args...] -> body in $BODY, status in $CODE
call() {
  local body=$1; shift
  local out
  out=$(curl -s -w '\n%{http_code}' -X POST "$ORIGIN/api/booking.php" \
        -H 'Content-Type: application/json' -H "Origin: $ORIGIN" \
        --data "$body" "$@")
  CODE=${out##*$'\n'}
  BODY=${out%$'\n'*}
}

expect() {  # expect <label> <wanted-code> <jq-filter> <wanted-value>
  local label=$1 want=$2 filter=$3 val=$4
  if ! printf '%s' "$BODY" | jq -e . >/dev/null 2>&1; then
    bad "$label" "response is not JSON: $(printf '%s' "$BODY" | head -c 200)"; return
  fi
  local got; got=$(printf '%s' "$BODY" | jq -r "$filter")
  if [ "$CODE" = "$want" ] && [ "$got" = "$val" ]; then ok "$label"
  else bad "$label" "http $CODE (want $want), $filter = $got (want $val)"; fi
}

mkcfg live '[]'
serve live || { printf '\n%s\n' "$(cat "$TMP/srv.log")"; exit 1; }
OUT="$TMP/data-live/wa-outbox.log"

# --- gate ------------------------------------------------------------------
call '{"action":"status"}';                          expect "status reports live"            200 .live true
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$ORIGIN/api/booking.php")
[ "$CODE" = 405 ] && ok "GET is rejected (405)" || bad "GET" "got $CODE"

out=$(curl -s -w '\n%{http_code}' -X POST "$ORIGIN/api/booking.php" \
      -H 'Content-Type: text/plain' -H "Origin: $ORIGIN" --data '{"action":"status"}')
CODE=${out##*$'\n'}; BODY=${out%$'\n'*}
expect "wrong Content-Type is rejected"              415 .reason content_type

out=$(curl -s -w '\n%{http_code}' -X POST "$ORIGIN/api/booking.php" \
      -H 'Content-Type: application/json' -H "Origin: https://evil.example" --data '{"action":"nope"}')
CODE=${out##*$'\n'}; BODY=${out%$'\n'*}
expect "foreign Origin is rejected"                  403 .reason origin

# status is deliberately exempt: it leaks only live true/false, and an
# unconfigured site has no allow-list to match its own origin against.
out=$(curl -s -w '\n%{http_code}' -X POST "$ORIGIN/api/booking.php" \
      -H 'Content-Type: application/json' -H "Origin: https://evil.example" --data '{"action":"status"}')
CODE=${out##*$'\n'}; BODY=${out%$'\n'*}
expect "status answers regardless of origin"         200 .ok true

out=$(curl -s -w '\n%{http_code}' -X POST "$ORIGIN/api/booking.php" \
      -H 'Content-Type: application/json' --data '{"action":"submitBooking"}')
CODE=${out##*$'\n'}; BODY=${out%$'\n'*}
expect "no Origin and no Referer is rejected"        403 .reason origin

# A configured site with an empty allow-list is a misconfiguration, and must
# refuse loudly rather than accept from anywhere.
mkcfg noorigins "['ALLOWED_ORIGINS' => []]"
serve noorigins
call '{"action":"submitBooking"}';                   expect "empty allow-list refuses" 500 .reason no_allowed_origins
serve live

call 'not json at all';                              expect "malformed JSON"                 400 .reason malformed
call "{\"action\":\"status\",\"pad\":\"$(head -c 9000 /dev/zero | tr '\0' 'x')\"}"
                                                     expect "oversized body"                 413 .reason too_large
call '{"action":"nope"}';                            expect "unknown action"                 400 .reason unknown_action

# The OTP actions are gone, not merely unused. A stale front end or a bookmarked
# script must be told so plainly rather than quietly appearing to work.
call '{"action":"requestOtp"}';                      expect "requestOtp no longer exists" 400 .reason unknown_action
call '{"action":"verifyOtp"}';                       expect "verifyOtp no longer exists"  400 .reason unknown_action

# --- validation ------------------------------------------------------------
ARR=$(date -u -d '+14 days' +%F); DEP=$(date -u -d '+17 days' +%F)
G="\"from\":\"Bengaluru\",\"phone\":\"+91 98765 43210\",\"arrival\":\"$ARR\",\"departure\":\"$DEP\""
call "{\"action\":\"submitBooking\",\"name\":\"A\",$G}";     expect "name too short"   422 .field name
call "{\"action\":\"submitBooking\",\"name\":\"Anjan G\",\"from\":\"B\",\"phone\":\"+91 98765 43210\",\"arrival\":\"$ARR\",\"departure\":\"$DEP\"}"
                                                             expect "origin too short" 422 .field from
call "{\"action\":\"submitBooking\",\"name\":\"Anjan G\",\"from\":\"Bengaluru\",\"phone\":\"12\",\"arrival\":\"$ARR\",\"departure\":\"$DEP\"}"
                                                             expect "phone too short"  422 .field phone

# An email is no longer asked for, and one sent anyway must not be able to fail
# a booking or find its way into the record.
call "{\"action\":\"submitBooking\",\"name\":\"Anjan G\",$G,\"email\":\"nope\"}"
                                                             expect "a stray email is ignored, not rejected" 200 .received true

# --- dates -----------------------------------------------------------------
NOW="\"name\":\"Anjan Ganapathy\",\"from\":\"Bengaluru\",\"phone\":\"+91 98765 43210\""
call "{\"action\":\"submitBooking\",$NOW,\"departure\":\"$DEP\"}"
                                                             expect "missing arrival"   422 .field arrival
call "{\"action\":\"submitBooking\",$NOW,\"arrival\":\"$ARR\"}"
                                                             expect "missing departure" 422 .field departure
call "{\"action\":\"submitBooking\",$NOW,\"arrival\":\"2020-01-01\",\"departure\":\"$DEP\"}"
                                                             expect "arrival in the past" 422 .field arrival
call "{\"action\":\"submitBooking\",$NOW,\"arrival\":\"$DEP\",\"departure\":\"$ARR\"}"
                                                             expect "departure before arrival" 422 .field departure
call "{\"action\":\"submitBooking\",$NOW,\"arrival\":\"$ARR\",\"departure\":\"$ARR\"}"
                                                             expect "zero-night stay"   422 .field departure
call "{\"action\":\"submitBooking\",$NOW,\"arrival\":\"2026-02-31\",\"departure\":\"$DEP\"}"
                                                             expect "a date that does not exist" 422 .field arrival

# --- the happy path: one post, no verification -----------------------------
GUEST="{\"name\":\"Anjan Ganapathy\",$G}"
call "{\"action\":\"submitBooking\",${GUEST#\{}"
expect "booking accepted with no verification step"          200 .received true
printf '%s' "$BODY" | jq -e '.deliveryStatus == "sent"' >/dev/null \
  && ok "delivery reported as sent" || bad "deliveryStatus" "$BODY"
REQ=$(printf '%s' "$BODY" | jq -r .requestId)

REC="$TMP/data-live/bookings/$REQ.json"
if [ -f "$REC" ]; then
  ok "booking persisted as $REQ.json"
  for k in id name origin whatsapp verified arrival departure nights \
           delivery_status deliveries created_at updated_at; do
    jq -e "has(\"$k\")" "$REC" >/dev/null && ok "record has $k" || bad "record missing $k"
  done
  jq -e 'has("password") or has("pass")' "$REC" >/dev/null \
    && bad "record stores a password" || ok "record stores no password"
  jq -e 'has("email")' "$REC" >/dev/null \
    && bad "record stores an email that is no longer collected" || ok "record stores no email"
  # There is no verification step, so nothing may claim there was one.
  jq -e '.verified == false' "$REC" >/dev/null \
    && ok "record does not claim the number was verified" || bad "record claims verification"
else
  bad "booking was not persisted"
fi

# Two owner numbers: BOTH must have been written, each as its own send.
OWNER=$(tail -1 "$OUT")
TO_ALL=$(tail -2 "$OUT" | jq -r '.to' | sort | tr '\n' ' ')
[ "$(printf '%s' "$OWNER" | jq -r '.payload.type')" = template ] \
  && ok "the owner was sent a template, not free text" || bad "owner send is not a template"
[ "$(printf '%s' "$OWNER" | jq -r '.payload.template.name')" = benaka_booking_request ] \
  && ok "owner notified with the booking template" || bad "owner template name"
[ "$TO_ALL" = "918861000002 919448600001 " ] \
  && ok "both owner numbers were notified" || bad "owner recipients" "$TO_ALL"
# FIVE, not seven. The template in WhatsApp Manager has to match this exactly or
# Meta rejects the send on parameter count.
[ "$(printf '%s' "$OWNER" | jq -r '.payload.template.components[0].parameters | length')" = 5 ] \
  && ok "owner message carries five fields" || bad "owner field count"
printf '%s' "$OWNER" | jq -r '.payload.template.components[0].parameters[].text' \
  | grep -qP '[\n\t]' && bad "a template parameter contains a newline" \
  || ok "no template parameter contains a newline"
printf '%s' "$OWNER" | jq -r '.payload.template.components[0].parameters[3].text' \
  | grep -qE 'to .* \([0-9]+ nights?\)$' \
  && ok "the stay dates reached the owner" \
  || bad "stay parameter" "$(printf '%s' "$OWNER" | jq -r '.payload.template.components[0].parameters[3].text')"
jq -e '.deliveries | length == 2' "$REC" >/dev/null \
  && ok "the record keeps a result per number" || bad "deliveries array"
jq -e '.arrival and .departure and .nights' "$REC" >/dev/null \
  && ok "the record keeps the dates" || bad "record dates"

# --- the spam guards that replaced the OTP ---------------------------------
# Both answer exactly as a success does, so a script learns nothing. What proves
# they fired is that NOTHING WAS WRITTEN: no new booking file, no outbox line.
BEFORE_B=$(find "$TMP/data-live/bookings" -name '*.json' | wc -l)
BEFORE_O=$(wc -l < "$OUT")

call "{\"action\":\"submitBooking\",\"website\":\"http://spam.example\",${GUEST#\{}"
expect "a honeypot post is answered as a success"            200 .received true
[ "$(find "$TMP/data-live/bookings" -name '*.json' | wc -l)" = "$BEFORE_B" ] \
  && ok "the honeypot post was not stored" || bad "a honeypot post reached the booking store"
[ "$(wc -l < "$OUT")" = "$BEFORE_O" ] \
  && ok "the honeypot post was not sent to the owner" || bad "a honeypot post reached WhatsApp"

call "{\"action\":\"submitBooking\",\"elapsed\":1,${GUEST#\{}"
expect "a form filled in one second is answered as a success" 200 .received true
[ "$(wc -l < "$OUT")" = "$BEFORE_O" ] \
  && ok "the too-fast post was not sent to the owner" || bad "a too-fast post reached WhatsApp"

# A missing `elapsed` must NOT be treated as suspicious: a cached older page or
# a client with JavaScript disabled will not send one.
call "{\"action\":\"submitBooking\",\"name\":\"No Timer\",\"from\":\"Madikeri\",\"phone\":\"+91 90000 00009\",\"arrival\":\"$ARR\",\"departure\":\"$DEP\"}"
expect "a post with no timing at all still goes through"     200 .received true
[ "$(wc -l < "$OUT")" -gt "$BEFORE_O" ] \
  && ok "the untimed post did reach the owner" || bad "an untimed post was silently dropped"

# --- per-number rate limit -------------------------------------------------
# The per-IP limit does not stop a phone moving between mobile networks, and
# with no verification step this is what protects the owner's WhatsApp.
mkcfg pernum "['BOOKINGS_PER_NUMBER_DAY' => 2]"
serve pernum
G3="\"from\":\"Kochi\",\"phone\":\"+91 90000 00003\",\"arrival\":\"$ARR\",\"departure\":\"$DEP\""
GUEST3="{\"name\":\"Third Guest\",$G3}"
for _ in 1 2; do call "{\"action\":\"submitBooking\",${GUEST3#\{}" >/dev/null; done
call "{\"action\":\"submitBooking\",${GUEST3#\{}"
                                                             expect "one number cannot flood" 429 .reason rate_limited
# ...and a different number is unaffected by that.
call "{\"action\":\"submitBooking\",\"name\":\"Fourth Guest\",\"from\":\"Kochi\",\"phone\":\"+91 90000 00004\",\"arrival\":\"$ARR\",\"departure\":\"$DEP\"}"
                                                             expect "another number still gets through" 200 .received true
serve live

# --- delivery failure keeps the booking ------------------------------------
mkcfg nodeliver "['WA_TRANSPORT' => 'off']"
serve nodeliver
call "{\"action\":\"submitBooking\",${GUEST#\{}"
expect "booking still accepted with no transport"            200 .received true
printf '%s' "$BODY" | jq -e '.deliveryStatus == "skipped"' >/dev/null \
  && ok "undelivered is reported honestly, not as sent" || bad "deliveryStatus" "$BODY"
[ "$(find "$TMP/data-nodeliver/bookings" -name '*.json' | wc -l)" -ge 1 ] \
  && ok "booking kept even though nothing was sent" || bad "booking lost on delivery failure"

# --- IP rate limit ---------------------------------------------------------
mkcfg tight "['RATE_PER_IP_HOUR' => 3]"
serve tight
for _ in 1 2 3; do call '{"action":"nope"}' >/dev/null; done
call '{"action":"nope"}';                                    expect "IP rate limit bites" 429 .reason rate_limited
call '{"action":"status"}';                                  expect "status stays reachable when limited" 200 .ok true

# --- unconfigured ----------------------------------------------------------
mkcfg off "['CONFIGURED' => false]"
serve off
call '{"action":"status"}';                                  expect "status works unconfigured" 200 .live false
call "{\"action\":\"submitBooking\",${GUEST#\{}"
                                                             expect "unconfigured refuses bookings" 503 .reason not_configured

# --- no PHP warning ever reached a response --------------------------------
if grep -qiE 'warning|notice|deprecated|fatal' "$TMP/srv.log"; then
  bad "PHP emitted a diagnostic" "$(grep -iE 'warning|notice|deprecated|fatal' "$TMP/srv.log" | head -5)"
else
  ok "no PHP warnings, notices or fatals during the run"
fi

# ===========================================================================
printf '\n\033[1m%d passed, %d failed\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
