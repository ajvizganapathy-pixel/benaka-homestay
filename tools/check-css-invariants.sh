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
need "story typography carries no text-shadow" \
     'text-shadow:[[:space:]]*none[[:space:]]*!important'

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
