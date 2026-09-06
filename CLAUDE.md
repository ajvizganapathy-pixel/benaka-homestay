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
python3 -m http.server 8765     # then http://localhost:8765/ (root index.html redirects)

# re-cut a 16:9 scene canvas from a photograph
ffmpeg -y -i assets/raw/<file>.jpg \
  -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1" \
  -q:v 2 assets/scenes/<NN-slug>.jpg

# after the video chain renders (see render/run-chain.md)
bash render/extract-handoff-frame.sh render/raw/leg-0N.mp4 render/frames/leg-0N-last.png
bash render/encode.sh
```

```bash
bash tools/check-css-invariants.sh   # run after ANY edit to web/css/site.css
```

That check exists because two "off" switches in `site.css` — the engine's copy
scrim and the typography text-shadow — have each been silently deleted by later
edits to that file and only found again from a screenshot. They fail invisibly:
nothing looks broken, the suppressed thing just quietly comes back.

No linter, test suite or build. Verification is visual: drive the page in the
pre-installed Chromium (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`,
`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`) via `playwright-core`.

**When screenshotting the canvas, disable smooth scrolling and wait ~1.4s.** An
instant `scrollTo` caught mid-flight shows dark bands that are not a layout bug —
they are the scene mid-crossfade. `addStyleTag({content:'html{scroll-behavior:auto!important}'})`.

## Architecture

```
index.html            root redirect stub -> web/ (see the note under Layout)
web/index.html        page shell: hero, canvas mount, gallery, footer, booking
web/world.config.js   the 7 beats, their copy, and all scroll pacing
web/scrub-engine.js   VERBATIM from the skill — do not edit
web/css/              fonts, tokens, site chrome, booking
web/js/               api adapter, site behaviour, booking flow
web/fonts/            self-hosted woff2 (no CDN at runtime)
assets/               raw/ photographs, scenes/ canvases, manifest.json
api/                  booking.php + config.example.php — inert until configured
render/               the OpenArt render chain: model, prompts, run book, costs
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

### Two entry points, on purpose

The site is `web/index.html`. The root `index.html` is a redirect stub, not a
copy — keep it that way, and never let the two drift.

On Hostinger the stub is never reached for `/`: `.htaccess:4` sets
`DirectoryIndex web/index.html index.html` and `.htaccess:47` rewrites `^$` to
`web/index.html` **internally**, so the URL stays clean. The stub is the fallback
for everywhere `.htaccess` does not apply — `python3 -m http.server`, a
non-Apache host, opening the files directly. It uses `location.replace()` so it
leaves no history entry; `assign()` would trap the Back button.

### Nothing goes over the photographs

No text-shadow, glow, outline or scrim, anywhere. **Both kill-rules sit together
at the top of `site.css`; keep them there and run
`tools/check-css-invariants.sh` after editing that file.** The engine ships a shadow on
`.sw-copy__title` and a gradient on `.sw-copylayer::before` from inside
`@layer sw`; both are overridden off with `!important` in `site.css`. **Do not
reintroduce either as a readability patch.**

Legibility instead comes from per-beat copy placement: each beat puts its copy
where the picture is darkest. Measure against the **rendered clips, not the still
canvases** — the stills are only posters, and a spot that is dark on the poster
can be a white wall four seconds into the leg. Measure across the copy's whole
visible window and score each zone by its **worst** moment, not its average:
optimising a midpoint is what left one beat sitting on a white house.

Where a leg has nowhere dark at all — the lit games room, worst case 147 — the
ink flips to dark rather than a shade going over the photograph. The positions
and their measured values are recorded in `site.css`.

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
photography:

- **Legs chain from each other's actual last frame.** Leg *i*'s `startFrame` is
  the PNG extracted from leg *i−1*'s rendered video, never a canvas. This is what
  makes the seam invisible.
- **Each leg carries an `endFrame`** — the next beat's canvas — so it lands on
  that beat. Without it the camera runs away: an open-ended 5s probe crossed
  three beats in one clip. (The earlier Higgsfield plan forbade end frames
  because Seedance pulled back and the seam read as a rewind; PixVerse does not,
  verified by probe.) The finale leg has no end frame.
- **No connectors.** The legs *are* the journey — `connectors: []`.
- **Strictly sequential.** Leg *i* waits for leg *i−1* to render, and its last
  frame is eyeballed before chaining.

## Rendering environment

Generation runs on **OpenArt over MCP** — `pixverseV6`, `image2video`, 8s,
1080p, 16:9, audio off. **216 credits per leg** (240 list, less the Plus
account's 10% MCP discount).

**Getting frames to OpenArt:** its uploader is a browser widget that cannot read
files from this machine. The way in is that this repository is public, so any
committed image has a `raw.githubusercontent.com` URL that OpenArt accepts as a
frame. Push a handoff frame and confirm its URL returns 200 before submitting the
leg that uses it.

`ffmpeg`/`ffprobe` 6.1.1 are installed and do frame extraction and encoding.

**Spend deliberately.** Prove a mechanism on a 45-credit 540p probe before
committing a 1,512-credit chain; read the balance before and after each leg. See
`render/COSTS.md`, which also records why Seedance 2.0 was ruled out (1,440 per
leg, eight times the cost) and that OpenArt has no masked-inpaint mode.
