# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A site for a homestay in Coorg (Kodagu), Karnataka. It opens as a property
brochure — real photographs, ivory ground, editorial serif — carries one film
of the place in the middle, and closes with a tiled photograph gallery, a
footer, a booking flow and the venue.

Static and framework-free — plain HTML, no build step, no package manifest.
Serve the repo root over HTTP and open `/web/`.

The property is signed **Benaka By The Hills** at its gate, which is what the
site uses. The repo is still named `benaka-homestay`.

### The scroll world was rejected. Do not rebuild it.

This began as a `scroll-world` build: one continuous scroll-scrubbed camera move
across seven beats, driven by `web/scrub-engine.js`, rendered leg by leg on
OpenArt. It went through three shapes — scrubbed canvas, then six separate legs
zigzagging down the page — and the client read every one of them the same way:
as an AI film rather than as a place. **The owner rejected the concept.**

What stands in its place is `assets/video/benaka-tour.mp4` — 848×480, 31s,
H.264 + AAC — footage shot on the property: the mosaic mural, the pool with the
house behind it, a bedroom, the garden swings, the front elevation. It is the
whole of the "Explore Benaka" section, and it is the only video the site plays.

**What is gone, and where to find it if it is ever wanted again:**

| Gone | Recover with |
|---|---|
| `web/scrub-engine.js`, `web/world.config.js` | `git show 76bab70:web/scrub-engine.js` |
| The `.leg` zigzag CSS and `buildLegs`/`playOnView` | `git show 76bab70:web/css/site.css` |
| 14 rendered clips, 193MB | still on disk in `assets/clips/`, untracked; also `git show 76bab70:assets/clips/leg-01.mp4 > leg-01.mp4` |

`assets/clips/*.mp4` is **untracked on purpose**. `.gitignore` ignores `*.mp4`
and excepts only `assets/video/*.mp4`. Do not restore a `!assets/clips`
negation — `tools/check-css-invariants.sh` fails the build if you do, because a
single `git add -A` would otherwise walk 193MB of rejected footage back into the
tree.

`assets/scenes/`, `assets/handoff/` and `render/` are untouched. They are stills
and run books, not video, and they are the record of what the chain cost.

**A whole class of problem left with the concept.** There is no type over
footage anywhere on the page now, so the contrast fight — three rounds of
luminance measurement, the bounded text-shadow, the forest veil over the copy
layer, beats stuck at 3.2–4.0:1 — no longer applies at all. And the film gets
**no tint**: the wash over the rendered legs existed to knock the sheen off
generated footage. This is the place itself.

## Commands

```bash
php -S localhost:8765 -t .      # then http://localhost:8765/ (root index.html redirects)
                                # NOT python3 -m http.server: it cannot run api/booking.php,
                                # so the booking form silently stays in preview.
bash tools/test.sh              # syntax, secrets, assets, and the live booking API
bash tools/check-css-invariants.sh   # run after ANY edit to web/css/site.css

# re-cut the property film if it is ever replaced. +faststart is NOT optional:
# without it the browser downloads all 8.8MB before painting a frame.
ffmpeg -i <new>.mp4 -c copy -movflags +faststart assets/video/benaka-tour.mp4
ffmpeg -ss 30 -i assets/video/benaka-tour.mp4 -frames:v 1 -q:v 2 \
  assets/video/benaka-tour-poster.jpg

# --- everything below belongs to the REJECTED render chain (see HISTORICAL) ---
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
web/index.html        page shell: editorial band, the film, gallery, footer, booking
web/css/              fonts, tokens, site chrome, booking
web/js/               api adapter, site behaviour, booking flow
web/fonts/            self-hosted woff2 (no CDN at runtime)
assets/raw/           the property photographs — the gallery, mosaic and plates
assets/brand/         the hero images and the owner's reference they came from
assets/video/         benaka-tour.mp4 and its poster. The ONLY tracked video.
assets/scenes/        canvases from the rejected render chain (+ portrait/)
assets/handoff/       leg handoff frames from the same chain
assets/clips/         14 rendered legs, UNTRACKED, kept on disk only
api/                  booking.php + config.example.php — inert until configured
render/               the OpenArt render chain: model, prompts, run book, costs
```

### Three things that will bite

1. **The film is not fetched until you are near it, and is paused when you are
   not.** `mountTour()` in `site.js` uses two observers on purpose: a loose one
   at `rootMargin: 150%` decides when to spend bandwidth by setting `src`, and a
   tight one at `threshold: 0.25` decides when to spend a decoder by calling
   `play()`. The `<video>` ships with **no `src` attribute at all** and
   `preload="none"`; that pair is what keeps a visitor who never scrolls that far
   from paying 8.8MB for it.

2. **The film must stay faststart.** `ffmpeg` writes the `moov` index *after*
   the media data unless `-movflags +faststart` is given, and a browser cannot
   paint a frame until it has read `moov` — so without the flag the whole file
   downloads before anything appears. It fails silently: the video still plays,
   it just takes forever to start, which reads as a slow network rather than a
   bad encode. `tools/test.sh` scans the atom order (`tools/atom-order.py`) and
   fails the build. If you ever re-encode this file, pass the flag.

3. **`.explore` redeclares the palette tokens.** It is not inside `.before` or
   `.after`, so without that block it inherits the dark `:root` values and sits
   outside the site's theme. It carries the forest ground deliberately, so the
   page reads ivory, forest, ivory and the film is the one dark chapter in the
   middle.

4. **The hero is TWO images, and the wash over it is measured.** `<picture>`
   serves `assets/brand/hero-tall.jpg` (9:16) below 700px and
   `assets/brand/hero-wide.jpg` (16:9) above it — a separately generated frame,
   not a crop, for the reason in the architecture note above. The `media` query
   in the markup and the 700px breakpoint in `site.css` have to move together.

   The gradient stops in the phone `.ed-hero__frame::after` are **measured, not
   chosen**. Over the old dark arch photograph the 12px "Coorg · Karnataka"
   line — highest in the copy block, where a bottom-up wash is weakest — sat at
   3.27:1 against the 4.5 that size needs; the current stops put it at 5.98.
   If the hero photograph is ever replaced, re-measure all four copy elements
   at 390 / 1440 / 2560 rather than nudging the numbers.

### The gallery is three stacks, not a tile grid

Each group is five photographs laid over each other like prints, with the
section's name beside them and one control. Clicking a stack calls
`openLightbox(g, imgsInGroup, 0)` — **the whole group**, so nothing is hidden by
showing five: 12, 16 and 10 photographs are still one click away.

Three things to know before editing it:

1. **`.tiles` and `.tile` in `site.css` are still load-bearing.** The gallery
   stopped using them, but the hero mosaic (`.ed-mosaic.tiles`) is built on
   them. Deleting them as "dead tile-gallery CSS" collapses the band under the
   story.

2. **Which five photographs is data, not code** — `stack` on each galleryGroup
   in `assets/manifest.json`. `tools/test.sh` fails if a name is not in its own
   group or not on disk, because a typo there shows up only as a card that
   silently 404s.

3. **The fan's offsets are fixed per `nth-child`, not random,** and every
   supporting card must keep a clear corner. The first cut put card 5 wholly
   inside the hero card's span, so all that showed was a strip along its top —
   which in all three stacks happened to be blown sky or a white ceiling, and
   read as an empty mount. If you move the numbers, re-measure the visible
   fraction of each card rather than eyeballing one screenshot.

   The mobile block must override **both** `.stack-row` and
   `.stack-row:nth-child(even)`. A media query adds no specificity, so the
   mirrored even-row rule (0,2,0) beats a bare `.stack-row` (0,1,0) inside it
   and the middle row stays in two columns on a phone.

Live tiles run on the hero mosaic **only** now. The stacks are a curated
selection and cards reshuffling under the visitor would fight the one thing they
are for.

### Two things that make a deploy look like it failed

1. **The gallery is not in the HTML.** `web/index.html` holds only
   `<div data-gallery>`; `buildGallery()` renders the stacks at runtime from
   `assets/manifest.json`. Grepping the HTML for the markup finds nothing, and
   that is correct.

2. **CSS, JS and JSON are served `Cache-Control: no-cache`, on purpose.** They
   change in place at the same URLs on every deploy, and there is no build step
   to stamp a hash into their names. They were cached for a day once: the HTML
   came back fresh while the browser kept yesterday's `site.js`, so a returning
   visitor saw yesterday's gallery drawn inside a new-looking page. `no-cache`
   means revalidate, not do not store — the browser still caches and Apache
   answers 304. Do not give them a long expiry again without adding
   cache-busting filenames in the same change.

### The hero is the one generated image on the page

Everything else is a photograph taken on the property. The two hero files are
**Nano Banana Pro `image2image` at 4K**, generated from
`assets/brand/hero-reference.png` — the aerial the owner supplied as the brand
image — at 72 credits each after the Plus discount.

This is why the page says "The photographs on this page were taken on the
property" and the gallery says "Every photograph **below**". Both were reworded
when the hero changed. Keep them true: if a generated image ever appears below
the hero, those sentences have to change again.

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

One step. Name, where they are travelling from, a WhatsApp number, arriving and
leaving — then **Send**. The request goes to the owners' WhatsApp and the owner
replies there. That is the whole flow.

**There is no verification, and that was asked for.** The OTP round trip is gone
along with the email field, the separate "WhatsApp is a different number" field
and the AUTHENTICATION template. Do not reintroduce any of them without being
asked: the owner wanted the shortest path between a visitor deciding to come and
a message on their phone.

**Know what that costs.** Nothing now proves a visitor owns the number they
typed, so the endpoint can be used to put text on the owners' phones. Four
things stand in place of the OTP, and none of them is an identity check:

| Guard | Where |
|---|---|
| Honeypot field (`website`) | `.bk__trap` in the markup, `looks_scripted()` in PHP |
| Minimum fill time (3s from opening the panel) | `elapsed`, same function |
| Per-IP limit, `RATE_PER_IP_HOUR` | `rate_ok()` |
| Per-number limit, `BOOKINGS_PER_NUMBER_DAY` | `rate_ok()` on the phone number |

A post that trips the honeypot or the timer is **answered exactly as a success
is** — same shape, same fields, a plausible reference — and nothing is stored or
sent. An error would tell a script which check to defeat. `tools/test.sh` proves
these fire by asserting that no booking file and no outbox line were written,
because the reply alone cannot tell you.

A missing `elapsed` is deliberately *not* suspicious: a cached older page or a
client with JavaScript off will not send one.

**The WhatsApp template has FIVE parameters now, not seven.** Name, coming from,
WhatsApp number, the stay as one line, and when it came in. If a seven-variable
template is still approved in WhatsApp Manager, every send fails on parameter
count — edit it to the body in `api/config.example.php` and wait for
re-approval. Template values may not contain newlines, which is why the layout
lives in the approved body. It is business-initiated, so it must stay a
template; free-form text is rejected outside the 24-hour window.

`WA_TRANSPORT` picks where a send goes: `cloud` (Meta), `log` (write the payload
to the data dir — this is how `tools/test.sh` drives the whole journey with no
credentials), or `off`.

Every network call goes through `web/js/api.js`, and **the server decides the
mode**: on load the page POSTs `{action:'status'}` and switches to live only if
the endpoint says so. There is no `LIVE` constant to flip. Going live is one
thing: `api/config.php` on the server with `CONFIGURED => true`.

**The booking record is written before the send is attempted.** Losing a guest's
request because an API was down is the one failure this endpoint exists to
prevent. Never make the form claim a booking was received or delivered when it
was not — and the record carries `verified: false`, because there is no
verification step and nothing should later read an old booking as though there
had been.

There are no accounts and no passwords. A password field existed once, was
required, was sent to the server, and was used by nothing — do not bring it back.

`DATA_DIR` must resolve **outside** the document root; `booking.php` refuses to
start otherwise.

## HISTORICAL — the rejected render chain

Everything from here down describes the scroll world, which the owner rejected.
None of it is live on the page. It is kept because it is expensive knowledge —
what the chain cost, which model holds a signboard, why the phone chain could
not be a resize — and because `render/` and `assets/scenes/` are still on disk.

**Do not act on any of it to rebuild the walkthrough.** Read it only if someone
asks for new rendered footage from scratch, and read the rejection at the top of
this file first.

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
