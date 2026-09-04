# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A scroll-driven landing page for a homestay in Coorg (Kodagu), Karnataka, built
on the `scroll-world` skill. Scroll drives a **camera**, not a scrollbar: the
page scrubs pre-rendered video by scroll position so a single continuous camera
flight travels from the road outside, through the gate, into a guest room, and
back out to the pool.

Static and framework-free — plain HTML, one vanilla-JS engine, no build step, no
package manifest, no tests. Serve the repo root over HTTP and open `/web/`.

**The property is signed "Sherlock's Jungle Retreat" at its gate** (visible in
`assets/raw/gate-arch-01.jpg` and `-02.jpg`), while the repo is named
`benaka-homestay`. Confirm the intended public name before writing any copy or
branding.

## Current state: procedural pass only

The page deliberately has **no UI and no UX**. No typography, palette, nav, copy,
headlines or CTAs. `web/index.html` hides the chrome that the engine builds
unconditionally, and every section in `web/world.config.js` omits `eyebrow`,
`title`, `body`, `tags` and `cta`. This is intentional — the deliverable of this
pass is the camera mechanism and its scroll pacing. **Do not add design until
that is signed off.**

No video exists yet either. Each section carries a `still` (a 16:9 canvas cut
from the property's own photographs) and **no `clip`**. That works because
`web/scrub-engine.js:201` (`if (reduce || s.loading || !s.clip) return;`) skips
clip loading when `clip` is absent, so the section holds its still and still
occupies its band in the scroll chain. Adding `clip:` later changes nothing else.

## Commands

```bash
# serve and open the harness (engine loads clips as blobs, so byte-range
# support is irrelevant — the stock server is fine)
python3 -m http.server 8765     # then http://localhost:8765/web/index.html

# regenerate a 16:9 scene canvas from a raw photo
ffmpeg -y -i assets/raw/<file>.jpg \
  -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1" \
  -q:v 2 assets/scenes/<NN-slug>.jpg

# after the video chain renders (see render/run-chain.md)
bash render/extract-handoff-frame.sh render/raw/leg-0N.mp4 render/frames/leg-0N-last.png
bash render/encode.sh
```

There is no linter, test suite, or build. Verification is visual: drive the page
in the pre-installed Chromium (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`,
`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`) via `playwright-core`, screenshot each
section midpoint and each seam, and check that the sequence reads as one forward
journey through one property.

## Layout

```
assets/raw/       47 property photographs, renamed to content-derived slugs
assets/scenes/    the 7 chosen start canvases, exactly 1920x1080
assets/manifest.json   every image: dimensions, orientation, category, scene role
web/              index.html + world.config.js + scrub-engine.js
render/           the Higgsfield chain — authored but NOT executed
```

`assets/manifest.json` is the source of truth for the image library. It was built
by inspecting every photograph, not by inferring from filenames. Read it before
picking images for anything.

`web/scrub-engine.js` is copied **verbatim** from the `scroll-world` skill
(`references/scrub-engine.js`) and must stay that way — it is config-driven and
self-contained, and local changes would be lost on any re-copy. Suppress or
extend its behaviour from `web/index.html` and `web/world.config.js` instead. Its
header documents the full config surface and CSS custom properties.

## The camera architecture (matters before touching render/)

This build uses the skill's **architecture A — one continuous forward take**,
chosen because the material is real photography. The consequences are not
optional:

- **Legs chain from each other's actual last frame.** Leg *i*'s `start_image` is
  the PNG extracted from leg *i−1*'s rendered video, never the original
  photograph. Using the photo instead is the single most common cause of a
  visible pop at the seam.
- **No `end_image`, ever.** An end-image of a wider shot forces the camera to
  pull back, and a camera that reverses across a seam reads as a rewind stutter.
- **No connectors.** Architecture A has none — the legs *are* the journey. Hence
  `connectors: []` in the config, and skill Step 5 is skipped entirely.
- **Legs are strictly sequential.** Leg *i* cannot start until leg *i−1* has
  rendered and its last frame is extracted and eyeballed. This cannot be
  parallelised.

## Rendering environment

The `higgsfield` CLI and `monid` are **not installed**, so the skill's
`pipeline.md` bash scripts do not apply as written. Use the **Higgsfield MCP
server** instead — `models_explore get seedance_2_0` confirms `start_image` and
`end_image` roles, so frame-locking works over MCP. `ffmpeg`/`ffprobe` 6.1.1 are
installed and do frame extraction and encoding.

Check `Higgs_field balance` before rendering anything. At the time this repo was
scaffolded it read `credits: 0, plan: free` with unlimited generations
unavailable, which is why `render/` is armed rather than fired. `render/COSTS.md`
carries the calibration protocol — render one leg, diff the balance, extrapolate
— and the NSFW-filter notes, which matter here because the bedroom, bathroom and
pool legs are exactly the contexts Seedance's filter flags.
