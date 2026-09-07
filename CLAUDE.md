# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A site for a homestay in Coorg (Kodagu), Karnataka. It opens as a property
brochure — real photographs, ivory ground, editorial serif — and then walks you
through the place as **six short films, each its own block, zigzagging down the
page**: in from the road, under the arch, along the verandah, past the billiards
table, into a room, down to the water. Then a tiled photograph gallery, a
footer, a booking flow and the venue.

Static and framework-free — plain HTML, no build step, no package manifest.
Serve the repo root over HTTP and open `/web/`.

The property is signed **Benaka By The Hills** at its gate, which is what the
site uses. The repo is still named `benaka-homestay`.

### The scroll-world engine is retired

This began as a `scroll-world` build: one continuous scroll-scrubbed camera move
across seven beats, driven by `web/scrub-engine.js`. **That is no longer
mounted.** The owner asked for the legs as separate pieces rather than one
unbroken take, so `web/js/site.js` now renders them from `web/world.config.js`
as ordinary blocks and the engine's `<script>` tag is gone from `web/index.html`.

The file stays in the repo as the record of what the chain was, and
`tools/test.sh` still syntax-checks it. `tools/check-css-invariants.sh` fails the
build if anything loads it again — the legs render it dead, and a half-mounted
engine painting fixed layers over a page laid out in normal flow would be a mess
to diagnose.

**A whole class of problem left with it.** In a leg block the words sit *beside*
the film, not on it, so the contrast fight — three rounds of luminance
measurement, the bounded text-shadow, the forest veil over the copy layer, beats
stuck at 3.2–4.0:1 — no longer applies at all. Type on paper needs none of it.

**The buffet → billiards leg was dropped** on instruction (the old beat 4, "Down
the length of the table, on to the games room"). `leg-04.mp4` and `leg-04-m.mp4`
are still in `assets/clips/` — nothing was deleted, the page just stops showing
them.

## Commands

```bash
php -S localhost:8765 -t .      # then http://localhost:8765/ (root index.html redirects)
                                # NOT python3 -m http.server: it cannot run api/booking.php,
                                # so the booking form silently stays in preview.
bash tools/test.sh              # syntax, secrets, assets, and the live booking API

# re-cut a 16:9 scene canvas from a photograph
ffmpeg -y -i assets/raw/<file>.jpg \
  -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1" \
  -q:v 2 assets/scenes/<NN-slug>.jpg

# re-cut the seven 9:16 canvases the PHONE chain is anchored to
bash render/cut-portrait-canvases.sh

# after the video chain renders (see render/run-chain.md)
bash render/extract-handoff-frame.sh render/raw/leg-0N.mp4 assets/handoff/leg-0N-last.png
bash render/encode.sh          # landscape masters  -> assets/clips/leg-0N.mp4
bash render/encode-mobile.sh   # portrait for phones -> assets/clips/leg-0N-m.mp4
```

`render/fetch-leg.sh` does the download, the frame extraction, the seam
measurement and the contact strip in one go; pass `-p` for the portrait chain.

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
web/index.html        page shell: editorial band, the legs, gallery, footer, booking
web/world.config.js   the 6 legs, their copy and their clips — still the source of truth
web/scrub-engine.js   RETIRED, not mounted; kept as the record of the old chain
web/css/              fonts, tokens, site chrome, booking
web/js/               api adapter, site behaviour, booking flow
web/fonts/            self-hosted woff2 (no CDN at runtime)
assets/               raw/ photographs, scenes/ canvases (+ scenes/portrait/),
                      clips/ 14 legs, manifest.json
api/                  booking.php + config.example.php — inert until configured
render/               the OpenArt render chain: model, prompts, run book, costs
```

### Three things that will bite

1. **There are TWO rendered chains, and the phone one is not a resize.** Desktop
   gets `clip` / `still` (16:9); a coarse-pointer or ≤860px viewport gets
   `clipMobile` / `stillMobile`, which are a separately rendered native 9:16
   chain. This is not an optimisation that can be undone with an encoder flag:
   `object-fit: cover` shows only 25.8% of a 16:9 frame's width on a 390×844
   phone, and a resize of that master to 1280 wide is an *upscale* — the fault
   that made the phone build look dull. Set `clipMobile` and `stillMobile`
   together, or the poster flashes a crop of the wrong picture. Landscape encodes
   come from `render/encode.sh`, portrait from `render/encode-mobile.sh`, which
   refuses a landscape input outright.

2. **A leg's clip is not fetched until you are near it, and is paused when you
   are not.** `playOnView()` in `site.js` uses two observers on purpose: a loose
   one at `rootMargin: 150%` decides when to spend bandwidth by setting `src`,
   and a tight one at `threshold: 0.25` decides when to spend a decoder by
   calling `play()`. Setting `src` up front would pull six files of 13–18MB on
   load. `preload="none"` plus that pair is what keeps it to what you actually
   watch.

3. **`.legs` redeclares the palette tokens.** It is not inside `.before` or
   `.after`, so without that block it inherits the dark `:root` values and sits
   outside the site's theme. It carries the forest ground deliberately, matching
   the "Step inside" band above it, so the walkthrough reads as one chapter
   between the ivory brochure and the ivory gallery.

### Two entry points, on purpose

The site is `web/index.html`. The root `index.html` is a redirect stub, not a
copy — keep it that way, and never let the two drift.

On Hostinger the stub is never reached for `/`: `.htaccess:4` sets
`DirectoryIndex web/index.html index.html` and `.htaccess:47` rewrites `^$` to
`web/index.html` **internally**, so the URL stays clean. The stub is the fallback
for everywhere `.htaccess` does not apply — `python3 -m http.server`, a
non-Apache host, opening the files directly. It uses `location.replace()` so it
leaves no history entry; `assign()` would trap the Back button.

### Type

Two registers and nothing between them: an editorial serif (macro) and a small
tracked sans (micro). A third size in the middle is what makes a page read as
generated. The QA script asserts exactly two families render.

Copy rule: plain English, short, and only about what is visible in the
photographs. No invented distances, rates or amenities. If a sentence could
describe any hotel anywhere, rewrite it.

### Booking

Every network call goes through `web/js/api.js`, and **the server decides the
mode**: on load the page POSTs `{action:'status'}` and switches to live only if
the endpoint says so. There is no `LIVE` constant to flip. Going live is one
thing: `api/config.php` on the server with `CONFIGURED => true`.

**Every WhatsApp send is an approved template, and this is not negotiable.**
Both messages are business-initiated, so Meta rejects free-form text outside the
24-hour window, and sending an OTP as free text is grounds for suspending the
WhatsApp account. The guest's code is an AUTHENTICATION template with a
**COPY_CODE** button (one-tap needs an Android signing hash a website cannot
have); the owner's notification is a UTILITY template with six single-line
parameters — template values may not contain newlines, which is why the layout
lives in the approved body.

`WA_TRANSPORT` picks where a send goes: `cloud` (Meta), `log` (write the payload
to the data dir — this is how `tools/test.sh` drives the whole journey with no
credentials), or `off`.

**The booking record is written before the send is attempted.** Losing a guest's
request because an API was down is the one failure this endpoint exists to
prevent. Never make the form claim a booking was received or delivered when it
was not.

There are no accounts and no passwords. A password field existed once, was
required, was sent to the server, and was used by nothing — do not bring it back.

`DATA_DIR` must resolve **outside** the document root; `booking.php` refuses to
start otherwise.

### The arch, and the one thing that breaks it

The property was re-signed **BENAKA ByTheHills** partway through. Beats 01 and
02 are the arch beats, so the name is *in the footage* — no HTML edit fixes it,
those legs have to be re-rendered.

Two things learned doing it, both expensive to relearn:

1. **PixVerse V6 is the model for this material, and the reason is text.** Kling
   3.0 and Wan 2.7 both price at 252 a leg against PixVerse's 216 and are better
   on paper. Probed on the arch shot, both **hallucinated a second giant BENAKA
   sign across the arch** mid-clip and garbled the lettering. PixVerse held the
   old sign for eight seconds across the whole first chain and holds this one.
   Stability beats detail when there is a signboard in frame. Do not "upgrade"
   the model without re-probing that shot.

2. **Two beats need two visibly different distances.** The owner sent one
   photograph of the arch. Cropping a second canvas out of a 1600×900 frame
   upscales 2× exactly where the lettering is, and a first attempt at generating
   one came back barely closer than beat 01 — an eight-second leg with nowhere
   to travel. The canvases are Nano Banana Pro at 4K, **downscaled** into place,
   with the prompt saying in as many words that the camera is *underneath* the
   arch. See `render/prompts/canvas/`.

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
