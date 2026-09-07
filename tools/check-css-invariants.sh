#!/bin/bash
# Guards the rules over the photographs that have each been silently deleted by
# later edits to site.css and had to be rediscovered from a screenshot. They
# fail invisibly: nothing looks broken when they vanish, the suppressed thing
# just quietly comes back.
#
#   bash tools/check-css-invariants.sh
#
# No dependencies — this is a grep, so it runs anywhere the repo does.
#
# WHAT CHANGED, AND WHY THESE ARE NOT THE OLD CHECKS.
# This used to guard the scroll-world canvas: the engine's copy scrim being
# forced off, and a bounded text-shadow on type that sat ON the footage. The
# walkthrough is now six separate blocks with the words BESIDE the film, so
# there is no copy layer left to scrim and no type over a photograph to shadow.
# Those two assertions had nothing to point at and were removed rather than left
# passing vacuously. What survives is the rule they were both serving: NOTHING
# DIMS OR OBSCURES THE PHOTOGRAPHS.
set -u
CSS=web/css/site.css
fail=0

# Every content check below runs against the stylesheet with /* comments */
# stripped. The prose in this file explains the rules it enforces, so scanning
# raw text made the guard fail on its own documentation.
CODE=$(mktemp)
perl -0pe 's{/\*.*?\*/}{}gs' "$CSS" > "$CODE"
trap 'rm -f "$CODE"' EXIT

echo "site.css invariants:"

# 1. The tint on the rendered legs stays translucent. Opaque it stops being a
#    wash over the footage and becomes a backdrop, which is the thing every
#    version of this check has existed to prevent.
tint=$(awk '/^\.leg__figure::after/ { inblock = 1 } inblock { print } inblock && /^}/ { inblock = 0 }' "$CODE")
if [ -z "$tint" ]; then
  printf '  FAIL  the leg tint is missing\n'; fail=1
else
  worst=$(printf '%s' "$tint" | grep -oE '[0-9]{1,3}%, *transparent' | tr -cd '0-9\n' | sort -n | tail -1)
  if [ -n "$worst" ] && [ "$worst" -lt 40 ]; then
    printf '  ok    the leg tint is translucent (%s%%)\n' "$worst"
  else
    printf '  FAIL  the leg tint is too heavy (%s%%) — it should wash, not cover\n' "${worst:-none}"; fail=1
  fi
fi

# 2. No scrim. A dark gradient laid over a photograph to rescue type is the
#    original sin this file keeps re-committing. There is no type over the
#    photographs any more, so there is no excuse for one either.
if grep -nE 'linear-gradient\([^)]*rgba?\(\s*[0-9]{1,2}\s*,\s*[0-9]{1,2}\s*,\s*[0-9]{1,2}' "$CODE" \
   | grep -vE '\.ed-hero|--s-accent|\.tile figcaption' >/dev/null; then
  printf '  FAIL  a dark gradient scrim crept back over a photograph\n'; fail=1
else
  printf '  ok    no scrim over the photographs\n'
fi

# 3. No text-shadow, glow or outline anywhere. With the words beside the picture
#    this is once again absolute, as it was before the canvas forced a compromise.
if grep -nE 'text-shadow|-webkit-text-stroke' "$CODE" | grep -v 'text-shadow: *none' >/dev/null; then
  printf '  FAIL  a text-shadow or outline was reintroduced\n'; fail=1
else
  printf '  ok    no text-shadow, glow or outline\n'
fi

# 4. The engine is no longer mounted, but the file stays as the record of the
#    chain and world.config.js stays the source of truth for the walkthrough.
[ -f web/scrub-engine.js ] && printf '  ok    scrub-engine.js retained (unmounted)\n'
if grep -qE '<script[^>]+scrub-engine\.js' web/index.html; then
  printf '  FAIL  scrub-engine.js is being loaded again — the legs render it dead\n'; fail=1
else
  printf '  ok    the retired engine is not loaded\n'
fi

[ $fail -eq 0 ] && echo "all invariants hold" || echo "INVARIANT BROKEN — see above" >&2
exit $fail
