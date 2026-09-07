#!/bin/bash
# Guards the CSS rules that have been silently deleted by later edits to
# site.css and had to be rediscovered from a screenshot. Both are "off"
# switches: nothing looks broken when they vanish except the thing they
# suppress quietly coming back.
#
#   bash tools/check-css-invariants.sh
#
# No dependencies — this is a grep, so it runs anywhere the repo does.
set -u
CSS=web/css/site.css
fail=0

need() {   # need <description> <grep-pattern>
  if grep -qE "$2" "$CSS"; then
    printf '  ok    %s\n' "$1"
  else
    printf '  FAIL  %s\n' "$1"; fail=1
  fi
}

echo "site.css invariants:"
need "the engine's copy scrim is switched off" \
     '\.sw-copylayer::before[[:space:]]*\{[[:space:]]*display:[[:space:]]*none[[:space:]]*!important'
# The text-shadow rule was REVERSED on the client's instruction — see the long
# comment beside it in site.css. It is no longer "must be absent"; it is "must
# stay within the bound", which is the thing that actually protects the
# photographs. A blurred, un-offset, low-alpha shadow reads as ink on the print;
# an offset or opaque one reads as a movie poster, which is what the reversal
# was careful not to become.
if grep -qE 'text-shadow:[[:space:]]*0[[:space:]]+0[[:space:]]+[0-9]+px[[:space:]]+rgba\([0-9]+,[[:space:]]*[0-9]+,[[:space:]]*[0-9]+,[[:space:]]*0\.[0-4][0-9]?\)' "$CSS"; then
  printf '  ok    canvas text-shadow is blur-only, no offset, alpha < 0.5\n'
else
  printf '  FAIL  canvas text-shadow is missing or outside its bound\n'; fail=1
fi

# Nothing may reintroduce a hard drop shadow or an outline as a second attempt
# at legibility. One bounded shadow, or none.
if grep -nE '(-webkit-text-stroke|text-shadow:[^;]*(px[[:space:]]+[0-9-]+px[[:space:]]+[0-9]+px[[:space:]]+rgba?\([^)]*(0\.[5-9]|1)\)|,))' "$CSS" | grep -v 'text-shadow:[[:space:]]*0[[:space:]]*0' >/dev/null; then
  printf '  FAIL  a hard shadow, second shadow layer or text outline crept in\n'; fail=1
else
  printf '  ok    no hard shadow, stacked shadow or text outline\n'
fi

# The engine is copied verbatim from the scroll-world skill and must stay that
# way; local edits are lost on any re-copy.
if [ -f web/scrub-engine.js ]; then
  if grep -q "mountScrollWorld" web/scrub-engine.js; then
    printf '  ok    scrub-engine.js present\n'
  else
    printf '  FAIL  scrub-engine.js looks wrong\n'; fail=1
  fi
fi

[ $fail -eq 0 ] && echo "all invariants hold" || echo "INVARIANT BROKEN — see above" >&2
exit $fail
