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
# This began life guarding the scroll-world canvas: the engine's copy scrim
# forced off, and a bounded text-shadow on type that sat ON the footage. Then it
# guarded the tint over the six rendered legs. The scroll world is now rejected
# outright and replaced by one film of the real property, so none of those three
# have an element to point at; they were removed rather than left passing
# vacuously. What survives is the rule all of them served — NOTHING DIMS OR
# OBSCURES THE PHOTOGRAPHS — plus a new check that the scroll world stays gone.
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

# 1. No scrim. A dark gradient laid over a photograph to rescue type is the
#    original sin this file keeps re-committing. There is no type over the
#    photographs any more, so there is no excuse for one either.
if grep -nE 'linear-gradient\([^)]*rgba?\(\s*[0-9]{1,2}\s*,\s*[0-9]{1,2}\s*,\s*[0-9]{1,2}' "$CODE" \
   | grep -vE '\.ed-hero|--s-accent|\.tile figcaption' >/dev/null; then
  printf '  FAIL  a dark gradient scrim crept back over a photograph\n'; fail=1
else
  printf '  ok    no scrim over the photographs\n'
fi

# 2. No text-shadow, glow or outline anywhere. With the words beside the picture
#    this is once again absolute, as it was before the canvas forced a compromise.
if grep -nE 'text-shadow|-webkit-text-stroke' "$CODE" | grep -v 'text-shadow: *none' >/dev/null; then
  printf '  FAIL  a text-shadow or outline was reintroduced\n'; fail=1
else
  printf '  ok    no text-shadow, glow or outline\n'
fi

# 3. The scroll world stays gone. Every piece of it has been reintroduced by a
#    later edit at least once in this repo's history, and a half-restored engine
#    painting fixed layers over a page laid out in normal flow is miserable to
#    diagnose from a screenshot. So this asserts the absence, not the presence.
ghosts=0
for f in web/scrub-engine.js web/world.config.js; do
  [ -e "$f" ] && { printf '  FAIL  %s is back — the scroll world was rejected\n' "$f"; ghosts=1; }
done
grep -qE '(scrub-engine|world\.config)\.js' web/index.html \
  && { printf '  FAIL  web/index.html loads a retired scroll-world script\n'; ghosts=1; }
grep -qE '^\s*\.leg' "$CODE" \
  && { printf '  FAIL  the .leg zigzag rules are back in site.css\n'; ghosts=1; }
grep -rq 'assets/clips' web/ \
  && { printf '  FAIL  web/ still points at assets/clips — those files are untracked\n'; ghosts=1; }
if [ $ghosts -eq 0 ]; then
  printf '  ok    no scroll-world engine, config, styles or clip references\n'
else
  fail=1
fi

# 4. The one video the repo carries is tracked, and the AI clips are not. The
#    negation that used to except assets/clips has to stay gone or 193MB walks
#    back into the tree on the next `git add -A`.
if grep -qE '^\s*!assets/clips' .gitignore; then
  printf '  FAIL  .gitignore excepts assets/clips again\n'; fail=1
elif ! grep -qE '^\s*!assets/video/\*\.mp4' .gitignore; then
  printf '  FAIL  .gitignore no longer excepts the property film\n'; fail=1
else
  printf '  ok    the property film is tracked, the AI clips are not\n'
fi

[ $fail -eq 0 ] && echo "all invariants hold" || echo "INVARIANT BROKEN — see above" >&2
exit $fail
