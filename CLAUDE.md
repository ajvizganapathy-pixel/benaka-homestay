# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A scroll-driven site for a homestay in Coorg (Kodagu), Karnataka, built on the
`scroll-world` skill. Scroll drives a **camera**, not a scrollbar. Seven beats
run from the road outside to the pool, then dissolve into a tiled gallery of the
property's photographs, a footer, and a booking flow.

Static and framework-free — plain HTML, one vanilla-JS engine, no build step, no
package manifest, no tests. Serve the repo root over HTTP and open `/web/`.

The property is signed **Sherlock's Jungle Retreat** at its gate, which is what
the site uses. The repo is still named `benaka-homestay`.

## Commands

```bash
python3 -m http.server 8765     # then http://localhost:8765/web/index.html

# re-cut a 16:9 scene canvas from a photograph
ffmpeg -y -i assets/raw/<file>.jpg \
  -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1" \
  -q:v 2 assets/scenes/<NN-slug>.jpg

# after the video chain renders (see render/run-chain.md)
bash render/extract-handoff-frame.sh render/raw/leg-0N.mp4 render/frames/leg-0N-last.png
bash render/encode.sh
```

No linter, test suite or build. Verification is visual: drive the page in the
pre-installed Chromium (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`,
`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`) via `playwright-core`.

**When screenshotting the canvas, disable smooth scrolling and wait ~1.4s.** An
instant `scrollTo` caught mid-flight shows dark bands that are not a layout bug —
they are the scene mid-crossfade. `addStyleTag({content:'html{scroll-behavior:auto!important}'})`.

## Architecture

```
web/index.html        page shell: hero, canvas mount, gallery, footer, booking
web/world.config.js   the 7 beats, their copy, and all scroll pacing
web/scrub-engine.js   VERBATIM from the skill — do not edit
web/css/              fonts, tokens, site chrome, booking
web/js/               api adapter, site behaviour, booking flow
web/fonts/            self-hosted woff2 (no CDN at runtime)
assets/               raw/ photographs, scenes/ canvases, manifest.json
api/                  booking.php + config.example.php — inert until configured
render/               the Higgsfield chain: written, costed, NOT run
```

### Three things that will bite

1. **`web/scrub-engine.js` must stay byte-identical to the skill's copy.** It is
   config-driven and self-contained; local edits are lost on any re-copy. Suppress
   or extend it from `web/css/site.css` and `web/world.config.js` instead. The
   chrome it builds unconditionally (topbar, hint, route rail, particles) is
   hidden in `site.css`.

2. **Engine theme tokens must be set on `:root, .sw-root` — both.** The engine
   declares its cream defaults on `.sw-root` (`scrub-engine.js:359`), which is a
   *closer ancestor* to the canvas copy than `:root`. Custom properties inherit by
   proximity, and `@layer` does not enter into it, so `:root` alone silently loses
   inside the canvas and everything renders cream-on-cream. `web/css/tokens.css`
   sets both.

3. **The page after the canvas needs its own stacking level.** The engine's
   `.sw-sky` (z0), `.sw-stage` (z10) and `.sw-copylayer` (z20) are fixed and paint
   for the whole document. `.after` sits at z30 with an opaque ground. This is
   safe because `layout()` sizes only its own `.sw-track` from its own segment
   widths and never reads `document.scrollHeight`, and every fixed layer is
   `pointer-events: none`.

### Nothing goes over the photographs

No text-shadow, glow, outline or scrim, anywhere. The engine ships a shadow on
`.sw-copy__title` and a gradient on `.sw-copylayer::before` from inside
`@layer sw`; both are overridden off with `!important` in `site.css`. **Do not
reintroduce either as a readability patch.**

Legibility instead comes from per-beat copy placement: each beat puts its copy
where that photograph is already dark, measured with a luminance scan of the copy
block over a grid on each canvas. The positions and their measured values are
recorded in `site.css`. Re-run the scan if a canvas is ever re-cut.

### Type

Two registers and nothing between them: an editorial serif (macro) and a small
tracked sans (micro). A third size in the middle is what makes a page read as
generated. The QA script asserts exactly two families render.

Copy rule: plain English, short, and only about what is visible in the
photographs. No invented distances, rates or amenities. If a sentence could
describe any hotel anywhere, rewrite it.

### Booking

Every network call goes through `web/js/api.js`. `LIVE = false` today: calls hit a
mock and the panel says plainly that requests are not delivered. `api/booking.php`
is written against the WhatsApp Cloud API and refuses to run until
`api/config.php` exists with `CONFIGURED => true`. Going live is those two flags —
see `docs/DEPLOY-hostinger.md`.

Never make the form claim a booking was received when it was not.

## The camera architecture (before touching render/)

**Architecture A — one continuous forward take**, because the material is real
photography. Not optional:

- **Legs chain from each other's actual last frame.** Leg *i*'s `start_image` is
  the PNG extracted from leg *i−1*'s rendered video, never the original
  photograph. Using the photo is the commonest cause of a visible seam pop.
- **No `end_image`, ever.** It forces the camera to pull back, and a camera that
  reverses across a seam reads as a rewind stutter.
- **No connectors.** The legs *are* the journey — `connectors: []`, skill Step 5
  skipped. There is therefore no connector slot to `null` out when a clip refuses
  to render; a bad leg must be re-rolled, not skipped.
- **Strictly sequential.** Leg *i* waits for leg *i−1* to render and its last
  frame to be extracted and eyeballed.

Enhancements to the photographs are **masked inpaints** on `nano_banana_2`
(`is_inpaint: true` + a `mask` role). That is the only way to change part of a
photograph while leaving the rest of the real image untouched — `seedream_v4_5`
and `flux_kontext` take `image_references` only and would redraw the frame.

## Rendering environment

The `higgsfield` and `monid` CLIs are **not installed**, so the skill's
`pipeline.md` bash scripts do not apply. Use the **Higgsfield MCP server** —
`models_explore get seedance_2_0` confirms `start_image`/`end_image`, so
frame-locking works over MCP. `ffmpeg`/`ffprobe` 6.1.1 are installed.

**Do not spend credits without an explicit go.** At last check the account read
`credits: 0, plan: free`. `render/COSTS.md` carries the estimate (≈525–705
credits for 15 generations, or ≈120–160 for a full previz pass first — the agreed
order), the calibration protocol, and the NSFW-filter notes — which matter here
because three legs put people in frame and the pool is the context that filter
flags hardest. Check `unlim.available` first: both models support it, and an
active allowance makes the chain free.
