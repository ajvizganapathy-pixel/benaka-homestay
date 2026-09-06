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
# payload it would have posted to Meta — that is how the OTP is read back and
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
  foreach (["OWNER_WHATSAPP","WA_PHONE_ID","WA_TOKEN","OTP_EMAIL_FROM"] as $k) {
      if (($c[$k] ?? "") !== "") { fwrite(STDERR, "$k is not empty\n"); exit(1); }
  }
  if (!empty($c["CONFIGURED"])) { fwrite(STDERR, "CONFIGURED is true\n"); exit(1); }
' 2>"$TMP/cfgerr"; then ok "config.example.php ships no values"; else bad "config.example.php" "$(cat "$TMP/cfgerr")"; fi

# The property was re-signed BENAKA ByTheHills. The old name lived in visible
# copy, in identifiers, in config keys and in three photographs; a half-done
# rename is how a client finds someone else's brand on their own website.
if git grep -niI 'sherlock' -- . >/dev/null 2>&1; then
  bad "the old property name is still in the tree" "$(git grep -niI 'sherlock' -- . | head -5)"
else
  ok "no trace of the old property name"
fi

for f in index.html web/index.html web/scrub-engine.js web/world.config.js \
         api/booking.php api/config.example.php .htaccess assets/manifest.json; do
  [ -f "$f" ] && ok "present: $f" || bad "missing: $f"
done

# ===========================================================================
head_ "3. Assets and CSS invariants"
# ===========================================================================
bash tools/check-css-invariants.sh >/dev/null 2>&1 \
  && ok "site.css invariants hold" \
  || bad "site.css invariants" "$(bash tools/check-css-invariants.sh 2>&1 | tail -4)"

# Every path world.config.js names must exist, or a beat silently loses its clip.
missing=$(node -e '
  global.window = {};
  require("./web/world.config.js");
  const fs = require("fs"), path = require("path");
  const bad = [];
  for (const s of window.BENAKA_WORLD.sections)
    for (const k of ["still","stillMobile","clip","clipMobile"])
      if (s[k]) {
        const p = path.join("web", s[k]);
        if (!fs.existsSync(p)) bad.push(s.id + "." + k + " -> " + p);
      }
  console.log(bad.join("\n"));
')
n=$(node -e 'global.window={};require("./web/world.config.js");console.log(window.BENAKA_WORLD.sections.reduce((a,s)=>a+["still","stillMobile","clip","clipMobile"].filter(k=>s[k]).length,0))')
[ -z "$missing" ] && ok "all $n world.config.js asset paths resolve" || bad "missing world assets" "$missing"

missing=$(python3 - <<'PY'
import json, os
m = json.load(open('assets/manifest.json'))
bad = [i['file'] for i in m['images'] if not os.path.isfile('assets/raw/' + i['file'])]
print('\n'.join(bad))
PY
)
n=$(python3 -c "import json;print(len(json.load(open('assets/manifest.json'))['images']))")
[ -z "$missing" ] && ok "all $n manifest photographs exist" || bad "missing photographs" "$missing"

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
  'OWNER_WHATSAPP' => '910000000000',
  'WA_PHONE_ID' => 'test-phone-id',
  'WA_TOKEN' => 'test-token',
  'WA_API_VERSION' => 'v25.0',
  'WA_BOOKING_TEMPLATE' => 'benaka_booking_request',
  'WA_OTP_TEMPLATE' => 'benaka_otp',
  'WA_TRANSPORT' => 'log',
  'OTP_CHANNEL' => 'whatsapp',
  'OTP_TTL_SECONDS' => 600,
  'OTP_MAX_ATTEMPTS' => 5,
  'OTP_RESEND_WAIT' => 30,
  'RATE_PER_IP_HOUR' => 200,
  'OTP_PER_NUMBER_HOUR' => 50,
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
      -H 'Content-Type: application/json' --data '{"action":"requestOtp"}')
CODE=${out##*$'\n'}; BODY=${out%$'\n'*}
expect "no Origin and no Referer is rejected"        403 .reason origin

# A configured site with an empty allow-list is a misconfiguration, and must
# refuse loudly rather than accept from anywhere.
mkcfg noorigins "['ALLOWED_ORIGINS' => []]"
serve noorigins
call '{"action":"requestOtp"}';                      expect "empty allow-list refuses" 500 .reason no_allowed_origins
serve live

call 'not json at all';                              expect "malformed JSON"                 400 .reason malformed
call "{\"action\":\"status\",\"pad\":\"$(head -c 9000 /dev/zero | tr '\0' 'x')\"}"
                                                     expect "oversized body"                 413 .reason too_large
call '{"action":"nope"}';                            expect "unknown action"                 400 .reason unknown_action

# --- validation ------------------------------------------------------------
G='"from":"Bengaluru","phone":"+91 98765 43210","whatsapp":"+91 98765 43210","email":"guest@example.com"'
call "{\"action\":\"requestOtp\",\"name\":\"A\",$G}";        expect "name too short"   422 .field name
call "{\"action\":\"requestOtp\",\"name\":\"Anjan G\",\"from\":\"B\",\"phone\":\"+91 98765 43210\",\"email\":\"g@e.com\"}"
                                                             expect "origin too short" 422 .field from
call "{\"action\":\"requestOtp\",\"name\":\"Anjan G\",\"from\":\"Bengaluru\",\"phone\":\"12\",\"email\":\"g@e.com\"}"
                                                             expect "phone too short"  422 .field phone
call "{\"action\":\"requestOtp\",\"name\":\"Anjan G\",\"from\":\"Bengaluru\",\"phone\":\"+91 98765 43210\",\"email\":\"nope\"}"
                                                             expect "bad email"        422 .field email

# --- the happy path --------------------------------------------------------
GUEST="{\"name\":\"Anjan Ganapathy\",$G}"
call "{\"action\":\"requestOtp\",${GUEST#\{}";               expect "code requested"   200 .sent true
call "{\"action\":\"requestOtp\",${GUEST#\{}";               expect "resend is throttled" 429 .reason resend_cooldown

if [ -f "$OUT" ]; then
  P=$(tail -1 "$OUT")
  OTP=$(printf '%s' "$P" | jq -r '.payload.template.components[0].parameters[0].text')
  [ "$(printf '%s' "$P" | jq -r '.payload.type')" = template ] \
    && ok "OTP was sent as a template, not free text" || bad "OTP send is not a template"
  [ "$(printf '%s' "$P" | jq -r '.payload.template.components[1].sub_type')" = COPY_CODE ] \
    && ok "OTP carries the COPY_CODE button" || bad "OTP has no COPY_CODE button"
  [ "$(printf '%s' "$P" | jq -r '.payload.template.components[1].parameters[0].coupon_code')" = "$OTP" ] \
    && ok "button code matches the body code" || bad "button/body code mismatch"
  printf '%s' "$OTP" | grep -qE '^[0-9]{6}$' \
    && ok "code is six digits" || bad "code shape" "$OTP"
  [ "$OTP" != 123456 ] && ok "code is not the preview constant" || bad "code is 123456 in live mode"
else
  bad "no WhatsApp outbox was written"; OTP=000000
fi

call "{\"action\":\"verifyOtp\",\"code\":\"000000\",${GUEST#\{}"
                                                             expect "wrong code"       401 .reason bad_code
call "{\"action\":\"verifyOtp\",\"code\":\"$OTP\",${GUEST#\{}"
                                                             expect "right code"       200 .verified true
call "{\"action\":\"verifyOtp\",\"code\":\"$OTP\",${GUEST#\{}"
                                                             expect "code cannot be replayed" 401 .reason bad_code

call "{\"action\":\"submitBooking\",${GUEST#\{}"
expect "booking accepted"                                    200 .received true
printf '%s' "$BODY" | jq -e '.deliveryStatus == "sent"' >/dev/null \
  && ok "delivery reported as sent" || bad "deliveryStatus" "$BODY"
REQ=$(printf '%s' "$BODY" | jq -r .requestId)

REC="$TMP/data-live/bookings/$REQ.json"
if [ -f "$REC" ]; then
  ok "booking persisted as $REQ.json"
  for k in id name origin phone whatsapp email verified verified_channel \
           delivery_status wa_message_id created_at updated_at; do
    jq -e "has(\"$k\")" "$REC" >/dev/null && ok "record has $k" || bad "record missing $k"
  done
  jq -e 'has("password") or has("pass")' "$REC" >/dev/null \
    && bad "record stores a password" || ok "record stores no password"
  grep -q "$OTP" "$REC" && bad "record contains the OTP" || ok "record does not contain the OTP"
else
  bad "booking was not persisted"
fi

OWNER=$(tail -1 "$OUT")
[ "$(printf '%s' "$OWNER" | jq -r '.payload.template.name')" = benaka_booking_request ] \
  && ok "owner notified with the booking template" || bad "owner template name"
[ "$(printf '%s' "$OWNER" | jq -r '.payload.template.components[0].parameters | length')" = 6 ] \
  && ok "owner message carries six fields" || bad "owner field count"
printf '%s' "$OWNER" | grep -q "$OTP" \
  && bad "the OTP leaked into the owner's message" || ok "owner message contains no OTP"
printf '%s' "$OWNER" | jq -r '.payload.template.components[0].parameters[].text' \
  | grep -qP '[\n\t]' && bad "a template parameter contains a newline" \
  || ok "no template parameter contains a newline"

call "{\"action\":\"submitBooking\",${GUEST#\{}"
                                                             expect "code is spent after booking" 403 .reason unverified

# --- attempt cap -----------------------------------------------------------
G2='"from":"Mysuru","phone":"+91 90000 00002","whatsapp":"+91 90000 00002","email":"two@example.com"'
GUEST2="{\"name\":\"Second Guest\",$G2}"
call "{\"action\":\"requestOtp\",${GUEST2#\{}" >/dev/null
for _ in 1 2 3 4 5; do call "{\"action\":\"verifyOtp\",\"code\":\"111111\",${GUEST2#\{}"; done
call "{\"action\":\"verifyOtp\",\"code\":\"111111\",${GUEST2#\{}"
                                                             expect "attempts are capped" 429 .reason too_many_attempts

# --- expiry ----------------------------------------------------------------
mkcfg quick "['OTP_TTL_SECONDS' => 1, 'OTP_RESEND_WAIT' => 0]"
serve quick
call "{\"action\":\"requestOtp\",${GUEST#\{}" >/dev/null
# time() is whole seconds, so a 1s TTL needs more than 1s of waiting to be
# certain the clock has ticked past it twice.
php -r 'usleep(2600000);'
call "{\"action\":\"verifyOtp\",\"code\":\"123456\",${GUEST#\{}"
                                                             expect "expired code"     400 .reason expired

# --- delivery failure keeps the booking ------------------------------------
mkcfg nodeliver "['WA_TRANSPORT' => 'off', 'OTP_CHANNEL' => 'off']"
serve nodeliver
call "{\"action\":\"verifyOtp\",${GUEST#\{}";                expect "verification skipped when off" 200 .verified true
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
