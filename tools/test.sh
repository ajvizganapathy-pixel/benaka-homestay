#!/bin/bash
# Production test suite — Benaka By The Hills.
#
# No framework and no package manifest: this project is deliberately static and
# framework-free, and its test suite has no business being the only thing that
# needs npm. Everything here is bash, node --check, python3 and php -r.
#
#   bash tools/test.sh
#
# The booking endpoint and the section of this suite that drove it over HTTP
# were removed with the booking flow; enquiries go straight to WhatsApp or the
# phone from plain links. See CLAUDE.md for how to recover the endpoint from
# history if it is ever wanted again. The only server side now is the guest
# review system (review-api/), tested in section 4 on a real database.
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD

PASS=0; FAIL=0
ok()   { printf '  \033[32mok\033[0m    %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; [ $# -gt 1 ] && printf '        %s\n' "$2"; FAIL=$((FAIL+1)); }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
# Section 4's browser suite needs playwright; a global install is found here.
export NODE_PATH="${NODE_PATH:-$(npm root -g 2>/dev/null)}"

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
         web/favicon-64.png web/apple-touch-icon.png favicon.ico \
         assets/brand/favicon-48.png assets/brand/favicon-96.png \
         assets/brand/favicon-192.png \
         assets/video/benaka-tour.mp4 assets/video/benaka-tour-poster.jpg \
         assets/video/hero-loop.mp4 assets/video/hero-loop-wide.mp4; do
  [ -f "$f" ] && ok "present: $f" || bad "missing: $f"
done

# Google Search shows the favicon beside the result only if it is square and a
# multiple of 48px; anything else gets a grey globe, silently. Check every
# rel="icon" in both entry files resolves to such a PNG.
icon_err=$(python3 - <<'PY'
import re, os, struct
errs = []
for page, base in (("web/index.html", "web"), ("index.html", ".")):
    for href in re.findall(r'<link rel="icon" href="([^"]+)"', open(page).read()):
        path = os.path.normpath(os.path.join(base, href))
        if not os.path.isfile(path):
            errs.append(f"{page}: {href} does not exist"); continue
        head = open(path, "rb").read(24)
        if head[:8] != b"\x89PNG\r\n\x1a\n":
            errs.append(f"{page}: {href} is not a PNG"); continue
        w, h = struct.unpack(">II", head[16:24])
        if w != h or w % 48:
            errs.append(f"{page}: {href} is {w}x{h}, not a square multiple of 48")
print("\n".join(errs))
PY
)
[ -z "$icon_err" ] && ok "favicons are square multiples of 48px (Google shows them)" \
                   || bad "favicon Google will not show" "$icon_err"

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

# The two social links, in the footer and nowhere else: the venue block used to
# repeat them and the owner asked for one set. The Facebook one is the Page's
# permanent profile.php address, not a share link: share links are redirects
# Facebook can expire.
for url in 'https://www.instagram.com/benakabythehills/' \
           'https://www.facebook.com/profile.php?id=61594081930585'; do
  n=$(grep -cF "href=\"$url\"" web/index.html)
  [ "$n" -eq 1 ] && ok "social link appears once, in the footer: $url" \
                 || bad "social link should appear exactly once, found $n" "$url"
done

# Link previews. WhatsApp, Instagram DMs and Facebook read og:/twitter: tags,
# need ABSOLUTE URLs, and do not run JavaScript - so the root redirect stub,
# which is the address people share, must carry the same block as the page.
prev=$(python3 - <<'PY2'
import re, os, struct
def block(f):
    s = open(f).read()
    m = re.search(r'<!-- LINK PREVIEWS.*?<!-- /LINK PREVIEWS -->', s, re.S)
    return m.group(0) if m else None
a, b = block('index.html'), block('web/index.html')
bad = []
if not a or not b: bad.append('LINK PREVIEWS block missing from ' + ('index.html' if not a else 'web/index.html'))
elif a != b: bad.append('the LINK PREVIEWS blocks in index.html and web/index.html differ')
else:
    tags = dict(re.findall(r'<meta (?:property|name)="([^"]+)" content="([^"]*)"', a))
    for k in ('og:title', 'og:description', 'og:url', 'og:image', 'og:image:width', 'og:image:height', 'twitter:card'):
        if not tags.get(k): bad.append('missing ' + k)
    for k in ('og:url', 'og:image', 'twitter:image'):
        if not tags.get(k, '').startswith('https://'): bad.append(k + ' is not an absolute https URL')
    base = tags.get('og:url', '')
    img = tags.get('og:image', '')
    if not img.startswith(base): bad.append('og:image is not under og:url ' + base)
    img = img[len(base):]
    if not os.path.isfile(img): bad.append('og:image not on disk: ' + img)
    else:
        d = open(img, 'rb').read()
        if len(d) > 300 * 1024: bad.append('%s is %dKB; WhatsApp drops previews over 300KB' % (img, len(d) // 1024))
        i = 2   # walk JPEG segments to the SOF for the real dimensions
        while i < len(d):
            mk, ln = d[i + 1], struct.unpack('>H', d[i + 2:i + 4])[0]
            if mk in (0xC0, 0xC1, 0xC2):
                h, w = struct.unpack('>HH', d[i + 5:i + 9])
                if (w, h) != (1200, 630): bad.append('%s is %dx%d, want 1200x630' % (img, w, h))
                break
            i += 2 + ln
print('\n'.join(bad))
PY2
)
[ -z "$prev" ] && ok "link-preview tags identical in both entry files, absolute, card 1200x630 under 300KB" \
               || bad "link previews" "$prev"

# Every local stylesheet and script carries the same ?v= version. GitHub Pages
# ignores .htaccess, so the no-cache rule does not exist there, and a phone
# once rendered the new HTML under a ten-minute-old site.css: icons drawn
# column-wide, a button still underlined. A version in the URL is what makes a
# deploy impossible to serve stale. Bump it whenever CSS or JS changes.
vers=$(grep -oE '(href|src)="(css|js)/[^"]+"' web/index.html | grep -oE '\?v=[0-9A-Za-z._-]+"' | sort -u)
nolv=$(grep -oE '(href|src)="(css|js)/[^"]+"' web/index.html | grep -v '?v=')
if [ -n "$nolv" ]; then
  bad "a local stylesheet or script has no ?v= cache-buster" "$nolv"
elif [ "$(printf '%s\n' "$vers" | wc -l)" -ne 1 ]; then
  bad "stylesheets and scripts carry different ?v= values" "$vers"
else
  ok "every stylesheet and script carries the same cache-buster ${vers%\"}"
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
# The ONE exception is type="application/ld+json": structured data for Google,
# which browsers never execute, so the CSP does not apply to it. Every other
# <script> must load by src=. (This used to be two greps; the first used a
# (?!...) lookahead that grep -E does not support, so it errored silently and
# only a bare "<script>" was ever caught.)
scriptbad=$(python3 - <<'PY2'
import re, json
html = re.sub(r'<!--.*?-->', '', open('web/index.html').read(), flags=re.S)  # prose about <script> is not a script
bad = []
seen = []
for attrs, body in re.findall(r'<script\b([^>]*)>(.*?)</script>', html, re.S):
    if re.search(r'\bsrc=', attrs):
        continue
    if re.search(r'type="application/ld\+json"', attrs):
        try:
            d = json.loads(body)
        except ValueError as e:
            bad.append('JSON-LD does not parse: %s' % e); continue
        seen.append(d.get('@type'))
        if d.get('@type') == 'WebSite':
            # The site name Google shows above the result. It must be the same
            # name the link previews use, on the canonical home URL.
            og = re.search(r'<meta property="og:site_name" content="([^"]+)"', html)
            if not og or d.get('name') != og.group(1):
                bad.append('WebSite name %r != og:site_name %r' % (d.get('name'), og and og.group(1)))
            if d.get('url') != 'https://benakahomestay.com/':
                bad.append('WebSite url %r is not the canonical home URL' % d.get('url'))
            continue
        if d.get('@type') != 'LodgingBusiness':
            bad.append('JSON-LD @type is %r, want LodgingBusiness or WebSite' % d.get('@type'))
            continue
        owners = {'8861070431', '8197558321', '9647782880', '9448647831'}
        phones = [d.get('telephone', '')] + [c.get('telephone', '') for c in d.get('contactPoint', [])]
        for t in phones:
            digits = re.sub(r'\D', '', t)[-10:]
            if digits not in owners:
                bad.append('JSON-LD telephone %r is not one of the owner numbers' % t)
        social = set(re.findall(r'class="social__link" href="([^"]+)"', html))
        if set(d.get('sameAs', [])) != social:
            bad.append('JSON-LD sameAs %r != footer social links %r' % (d.get('sameAs'), sorted(social)))
        img = d.get('image', '')
        if not img.startswith('https://benakahomestay.com/') or not __import__('os').path.isfile(img.split('.com/', 1)[1]):
            bad.append('JSON-LD image not an existing file on the live base: %r' % img)
        continue
    bad.append('inline executable <script%s> (CSP blocks it)' % attrs)
for t in ('LodgingBusiness', 'WebSite'):
    if seen.count(t) != 1:
        bad.append('want exactly one %s JSON-LD block, found %d' % (t, seen.count(t)))
print('\n'.join(bad))
PY2
)
[ -z "$scriptbad" ] && ok "no inline executable <script>; the JSON-LD parses and matches the footer" \
                   || bad "script/JSON-LD check" "$scriptbad"

# On Apache the page is served from / by an internal rewrite, so every
# page-relative path in web/index.html (css/, js/, fonts/, the icons) resolves
# against / and needs its own rewrite back into web/. Without them the live site
# once rendered with no stylesheet at all.
unmapped=$(python3 - <<'PY2'
import re
html = open('web/index.html').read()
rules = re.findall(r'^\s*RewriteRule\s+(\S+)\s+web/', open('.htaccess').read(), re.M)
for ref in sorted(set(re.findall(r'(?:href|src)="([^"#:]+)"', html))):
    if ref.startswith(('../', '/')): continue
    path = ref.split('?')[0]
    if not any(re.match(r, path) for r in rules): print(path)
PY2
)
[ -z "$unmapped" ] && ok ".htaccess maps every page-relative asset path back into web/" \
                   || bad "page-relative paths with no .htaccess rewrite into web/" "$unmapped"

grep -q "Content-Security-Policy" .htaccess && ok ".htaccess sets a CSP" || bad ".htaccess has no CSP"
grep -q "Options -Indexes"       .htaccess && ok ".htaccess disables directory listing" || bad "no Options -Indexes"
grep -q "RewriteCond %{HTTPS}"   .htaccess && ok ".htaccess forces HTTPS" || bad "no HTTPS redirect"

# ===========================================================================
head_ "4. Guest reviews"
# ===========================================================================
# The invitation-only review system: review-api/ (PHP), /owner/ (the 3D lock
# and the dashboard), /review/ (the guest form) and #reviews on the homepage.
# Static checks first, then the two suites in tests/reviews/:
#   api-test.php      real HTTP on a real MySQL/MariaDB   [automated]
#   browser-test.cjs  the pages in Chromium                [browser]
# A suite that cannot run here (no database, no browser) prints "skip" and is
# NOT counted as passed. CI sets REVIEWS_REQUIRE_DB=1, which turns a database
# skip into a failure.

for f in review-api/*.php review-api/lib/*.php tests/reviews/*.php; do
  if out=$(php -l "$f" 2>&1); then ok "php -l $f"; else bad "php -l $f" "$out"; fi
done
for f in owner/owner.js owner/lock.js; do
  if out=$(node --input-type=module --check < "$f" 2>&1); then ok "node --check (module) $f"; else bad "node --check $f" "$out"; fi
done
for f in review/review.js tests/reviews/browser-test.cjs; do
  if out=$(node --check "$f" 2>&1); then ok "node --check $f"; else bad "node --check $f" "$out"; fi
done

# Every file in lib/ refuses to run unless an endpoint loaded it, for any host
# that ignores .htaccess.
nog=$(for f in review-api/lib/*.php; do grep -q "if (!defined('BENAKA_REVIEWS')) { http_response_code(404); exit; }" "$f" || echo "$f"; done)
[ -z "$nog" ] && ok "every review-api/lib file refuses a direct request" || bad "lib file without the BENAKA_REVIEWS guard" "$nog"

# .htaccess keeps the shared code, the SQL and the tests off the web.
for rule in '^/review-api/lib(/|$)' '^/(migrations|tests)(/|$)'; do
  grep -qF "RedirectMatch 404 (?i)$rule" .htaccess && ok ".htaccess answers 404 for $rule" || bad ".htaccess lost the 404 rule for $rule"
done
[ -f review-api/lib/.htaccess ] && grep -q 'Require all denied' review-api/lib/.htaccess \
  && ok "review-api/lib/.htaccess denies everything" || bad "review-api/lib/.htaccess is missing or open"

# No secret ever in git. The template holds placeholders only, ships switched
# off, with Secure cookies and no test clock; the real config and the code hash
# live above public_html and are never tracked.
cfgbad=$(php -r '
  $c = require "review-api/config.example.php"; $e = [];
  if ($c["REVIEWS_ENABLED"] !== false) $e[] = "REVIEWS_ENABLED is not false";
  if ($c["COOKIE_SECURE"] !== true) $e[] = "COOKIE_SECURE is not true";
  if ($c["TEST_CLOCK_FILE"] !== "") $e[] = "TEST_CLOCK_FILE is set";
  if ($c["OWNER_CODE_HASH"] !== "" || $c["SETUP_KEY"] !== "") $e[] = "a code hash or setup phrase is filled in";
  if ($c["DB_PASS"] !== "CHANGE-ME" || strpos($c["PEPPER"], "CHANGE-ME") !== 0) $e[] = "DB_PASS or PEPPER is not a placeholder";
  echo implode("; ", $e);')
[ -z "$cfgbad" ] && ok "config.example.php: placeholders only, switched off, Secure cookies, no test clock" \
                 || bad "config.example.php" "$cfgbad"
tracked=$(git ls-files | grep -E '(^|/)(benaka-reviews-config\.php|config\.php|[^/]*\.hash)$')
[ -z "$tracked" ] && ok "no real config or code-hash file is tracked" || bad "a config or hash file is tracked" "$tracked"
if git grep -nIE '\$argon2id\$v=[0-9]+\$m=' -- . ':!tools/test.sh' >/dev/null 2>&1; then
  bad "an Argon2id hash is committed" "$(git grep -nIE '\$argon2id\$v=' -- . ':!tools/test.sh' | head -3)"
else
  ok "no Argon2id hash anywhere in the tree"
fi

# The two new pages follow the same rules as the homepage: no inline script
# (CSP script-src 'self'), never indexed, and every local CSS/JS link carries
# the SAME ?v= as web/index.html, so one bump covers a deploy.
pagebad=$(python3 - <<'PY3'
import re
home = set(re.findall(r'\?v=([0-9A-Za-z._-]+)"', open('web/index.html').read()))
bad = []
for page in ('owner/index.html', 'review/index.html'):
    s = re.sub(r'<!--.*?-->', '', open(page).read(), flags=re.S)
    for attrs, body in re.findall(r'<script\b([^>]*)>(.*?)</script>', s, re.S):
        if 'src=' not in attrs or body.strip():
            bad.append(f'{page}: inline <script{attrs}>')
    if '<meta name="robots" content="noindex, nofollow">' not in s:
        bad.append(f'{page}: no noindex meta')
    refs = re.findall(r'(?:href|src)="([^"]+\.(?:css|js)(?:\?[^"]*)?)"', s)
    for r in refs:
        m = re.search(r'\?v=([0-9A-Za-z._-]+)$', r)
        if not m: bad.append(f'{page}: {r} has no ?v=')
        elif m.group(1) not in home: bad.append(f'{page}: {r} is not on the homepage version {sorted(home)}')
    if re.search(r'wa\.me/\d', s): bad.append(f'{page}: a wa.me/<digits> link in the markup')
print('\n'.join(bad))
PY3
)
[ -z "$pagebad" ] && ok "/owner/ and /review/: no inline script, noindex, same ?v= as the homepage, no wa.me number in markup" \
                  || bad "/owner/ or /review/" "$pagebad"

# Guest text reaches the page only as text.
if grep -nE '\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write' web/js/reviews.js owner/owner.js owner/lock.js review/review.js >/dev/null; then
  bad "review scripts write HTML" "$(grep -nE '\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write' web/js/reviews.js owner/owner.js owner/lock.js review/review.js | head -3)"
else
  ok "review scripts never use innerHTML/insertAdjacentHTML/document.write"
fi

# Three.js is self-hosted at a pinned version, unmodified, and only /owner/
# loads it.
three=owner/vendor/three-0.169.0.module.min.js
if [ "$(sha256sum "$three" 2>/dev/null | cut -d' ' -f1)" = f7cee3c7533449a1505cc12cb5128b89e3d4fd3d7ea62b05f9f5464a217472ee ]; then
  ok "Three.js r169 is vendored unmodified (sha256 matches npm three@0.169.0)"
else
  bad "the vendored Three.js is missing or changed" "$three"
fi
if grep -rqE 'three[-.]' web/index.html web/js/ 2>/dev/null; then bad "the homepage references Three.js"; else ok "the homepage never loads Three.js"; fi

# The migration only adds; its down script removes only what it added.
mig=$(python3 - <<'PY3'
import re
up = re.sub(r'--[^\n]*', '', open('migrations/001_guest_reviews.sql').read())
down = re.sub(r'--[^\n]*', '', open('migrations/001_guest_reviews.down.sql').read())
bad = [s.strip()[:50] for s in up.split(';') if s.strip() and not re.match(r'CREATE\s+(TABLE\s+IF\s+NOT\s+EXISTS|OR\s+REPLACE\s+VIEW)\s+gr_', s.strip(), re.I)]
bad += ['down: ' + s.strip()[:50] for s in down.split(';') if s.strip() and not re.match(r'DROP\s+(TABLE|VIEW)\s+IF\s+EXISTS\s+gr_', s.strip(), re.I)]
print('\n'.join(bad))
PY3
)
[ -z "$mig" ] && ok "migration 001 only creates gr_* objects; its down script only drops them" || bad "migration 001" "$mig"
# 002 only adds two nullable columns to gr_reviews, fills them, and widens the
# view; its down script narrows the view and drops exactly those columns.
mig=$(python3 - <<'PY3'
import re
up = re.sub(r'--[^\n]*', '', open('migrations/002_review_stay_dates.sql').read())
down = re.sub(r'--[^\n]*', '', open('migrations/002_review_stay_dates.down.sql').read())
ok_up = [r'ALTER\s+TABLE\s+gr_reviews\s+ADD\s+COLUMN\s+stay_from\s+DATE\s+NULL\b[^,]*,\s*ADD\s+COLUMN\s+stay_to\s+DATE\s+NULL\b[^,]*$',
         r'UPDATE\s+gr_reviews\s+r\s+JOIN\s+gr_invitations\s+i\b', r'CREATE\s+OR\s+REPLACE\s+VIEW\s+gr_']
ok_down = [r'CREATE\s+OR\s+REPLACE\s+VIEW\s+gr_', r'ALTER\s+TABLE\s+gr_reviews\s+DROP\s+COLUMN\s+stay_to\s*,\s*DROP\s+COLUMN\s+stay_from$']
bad = [s.strip()[:60] for s in up.split(';') if s.strip() and not any(re.match(x, s.strip(), re.I | re.S) for x in ok_up)]
bad += ['down: ' + s.strip()[:60] for s in down.split(';') if s.strip() and not any(re.match(x, s.strip(), re.I | re.S) for x in ok_down)]
print('\n'.join(bad))
PY3
)
[ -z "$mig" ] && ok "migration 002 only adds the two stay columns, fills them and widens the view; its down script undoes exactly that" || bad "migration 002" "$mig"

# --- the server suite, on a real database ----------------------------------
out=$(php tests/reviews/api-test.php 2>&1); rc=$?
if [ $rc -eq 3 ]; then
  if [ "${REVIEWS_REQUIRE_DB:-0}" = 1 ]; then bad "review API suite could not reach a database" "$out"
  else printf '  \033[33mskip\033[0m  review API suite: no MySQL/MariaDB here (set REVIEWS_TEST_DSN/USER/PASS)\n'; fi
else
  printf '%s\n' "$out" | grep -vE '^ *[0-9]+ passed, [0-9]+ failed' | sed '/^$/d; s/^/  /'
  p=$(printf '%s\n' "$out" | sed -nE 's/^ *([0-9]+) passed, ([0-9]+) failed.*/\1/p'); f=$(printf '%s\n' "$out" | sed -nE 's/^ *([0-9]+) passed, ([0-9]+) failed.*/\2/p')
  if [ -n "$p" ]; then PASS=$((PASS + p)); FAIL=$((FAIL + f)); else bad "review API suite did not finish" "$(printf '%s\n' "$out" | tail -5)"; fi
fi

# --- the browser suite -------------------------------------------------------
if node -e "try{require('playwright')}catch(e){require('playwright-core')}" >/dev/null 2>&1 && php tests/reviews/api-test.php --probe >/dev/null 2>&1 || [ "${REVIEWS_REQUIRE_BROWSER:-0}" = 1 ]; then
  out=$(node tests/reviews/browser-test.cjs 2>&1); rc=$?
  if [ $rc -eq 3 ]; then
    printf '  \033[33mskip\033[0m  review browser suite: %s\n' "$(printf '%s' "$out" | tail -1)"
  else
    printf '%s\n' "$out" | grep -vE '^ *[0-9]+ passed, [0-9]+ failed' | sed '/^$/d; s/^/  /'
    p=$(printf '%s\n' "$out" | sed -nE 's/^ *([0-9]+) passed, ([0-9]+) failed.*/\1/p'); f=$(printf '%s\n' "$out" | sed -nE 's/^ *([0-9]+) passed, ([0-9]+) failed.*/\2/p')
    if [ -n "$p" ]; then PASS=$((PASS + p)); FAIL=$((FAIL + f)); else bad "review browser suite did not finish" "$(printf '%s\n' "$out" | tail -5)"; fi
  fi
else
  printf '  \033[33mskip\033[0m  review browser suite: needs playwright, Chromium and a database\n'
fi

# ===========================================================================
printf '\n\033[1m%d passed, %d failed\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
