# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A site for a homestay in Coorg (Kodagu), Karnataka. It opens as a property
brochure — real photographs, ivory ground, editorial serif — carries one film
of the place in the middle, and closes with a photograph gallery, a footer
with the WhatsApp and call numbers, and the venue. The round BENAKA logo sits
fixed top left on every screen, with a section menu top right.

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
                                # python3 -m http.server works too: there is no PHP any more
bash tools/test.sh              # syntax, secrets, assets, budgets, contact numbers
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
web/index.html        page shell: logo + menu, editorial band, the film, gallery, footer, venue
web/css/              fonts, tokens, site chrome
web/js/site.js        all behaviour: film, hero loop, gallery, mosaic, lightbox, menu
web/fonts/            self-hosted woff2 (no CDN at runtime)
assets/raw/           the property photographs — the gallery and the mosaic
assets/brand/         the logo, the hero images and the owner's reference (README there)
assets/video/         benaka-tour.mp4 + poster, hero-loop.mp4, hero-loop-wide.mp4.
                      The ONLY tracked videos.
assets/scenes/        canvases from the rejected render chain (+ portrait/)
assets/handoff/       leg handoff frames from the same chain
assets/clips/         14 rendered legs, UNTRACKED, kept on disk only
render/               the OpenArt render chain: model, prompts, run book, costs
```

### Things that will bite

1. **The film is not fetched until you are near it, and is paused when you are
   not.** `mountTour()` in `site.js` uses two observers on purpose: a loose one
   at `rootMargin: 100%` decides when to spend bandwidth by setting `src`, and a
   tight one at `threshold: 0.25` decides when to spend a decoder by calling
   `play()`. The `<video>` ships with **no `src` attribute at all** and
   `preload="none"`; that pair is what keeps a visitor who never scrolls that far
   from paying 8.8MB for it.

   **`mountTour()` runs only after `buildGallery()` settles**, and that order is
   load-bearing. The grounds mosaic above the film is built from the manifest,
   so until the manifest arrives the mosaic is 0px tall and the film sits up to
   ~950px higher than it really is. An observer attached before that took its
   first reading inside the margin and fetched the film on load, intermittently
   (it depends on how fast the manifest arrives). The margin was also 150% until
   the story lost its photographs and the phone mosaic shrank. Those changes put the
   film 1,937px down a 390x844 phone, inside 150%. If the page above the film
   gets shorter again, re-measure it against the margin.

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
   `assets/brand/hero-wide-pool.jpg` (16:9) above it — a separately generated frame,
   not a crop, for the reason in the architecture note above. The `media` query
   in the markup and the 700px breakpoint in `site.css` have to move together.

   The gradient stops in the phone `.ed-hero__frame::after` are **measured, not
   chosen**. Over the old dark arch photograph the 12px "Coorg · Karnataka"
   line — highest in the copy block, where a bottom-up wash is weakest — sat at
   3.27:1 against the 4.5 that size needs; the current stops put it at 5.98.
   If the hero photograph is ever replaced, re-measure all four copy elements
   at 390 / 1440 / 2560 rather than nudging the numbers.

### The hero has a living loop on every screen, and it must stay late

Two clips, one per still, picked by the same 700px query the `<picture>` uses.
`mountHeroLoop()` in `site.js` also swaps them if the window crosses 700px, so a
clip never sits over the other photograph.

| | phones | desktop |
|---|---|---|
| clip | `hero-loop.mp4`, 720x1280, 3.4s, 650KB | `hero-loop-wide.mp4`, 1920x1072, 4.3s, 2.0MB |
| still under it | `hero-tall.jpg` | `hero-wide-pool.jpg` |
| budget in `tools/test.sh` | 1500KB | 3000KB |

Both show the same scene: one man sitting on the **right-hand** edge of the pool
kicking his legs in the water, the palms moving in the breeze, a flock crossing
the sky. The right-hand edge is deliberate. The left of the frame is under the
headline and the darkest part of the wash.

**It is fetched after `window load`, on purpose.** The still is the LCP element;
giving the video a `src` any earlier would put the clip in front of the one paint
that decides how fast the site feels. `mountHeroLoop()` declines to run at all
under `prefers-reduced-motion`, Save-Data or a 2g connection. Verified: exactly
one request per viewport (the right clip), landing after load. Zero requests
under reduced motion.

**Every failure mode is the still.** No `src` until it is wanted, no `poster`
(the photograph underneath *is* the poster — a poster attribute would fetch the
same picture twice), and `opacity: 0` until `canplay`. If the download stalls or
autoplay is refused, the visitor sees the still hero, which is a perfectly good hero.
(Playwright's bundled Chromium has **no H.264**, so `canplay` never fires there.
To check the fade wiring, dispatch it by hand. Checking the motion itself needs a
real browser.)

**Phone clip.** PixVerse V6 `image2video` from `hero-tall.jpg`, 63 credits a
roll. The first roll put three swimmers in the water and was rejected. The raw
clip opens on an empty pool and takes about a second to settle the figure onto
the edge, so the first second is trimmed off and the last 0.7s is dissolved back
over the head. Seam **30.1 dB**, against 33.2 for adjacent frames, 23.9 for
frames a second apart, and 20.6 for the raw uncrossfaded cut.

**Desktop clip, made the other way round, and the better way.** An open-ended
roll from the old `hero-wide.jpg` (150 credits, 1080p, 5s) dollied the camera
in for the whole clip and walked the man into frame. That can never loop. So:

1. Nano Banana Pro `image2image` (2K, 40 credits) put the seated man into the
   still. It came back slightly tighter than the original, which is why it became
   a new still, `hero-wide-pool.jpg`, rather than being pasted into the old one.
2. PixVerse V6 `image2video` (1080p, 5s, 150 credits) with that still as **both**
   `startFrame` and `endFrame`. That locks the camera and brings the clip home to
   where it began.
3. The model's last frame still lands only near its first (27.6 dB), so the last
   0.7s (17 frames) is dissolved over the head as for the phone clip. Seam
   **31.0 dB**, against 31.4–37.3 for adjacent frames: inside the normal
   frame-to-frame range, so it does not read as a restart.
4. The still was colour-matched to the clip's first frame with a per-channel linear fit.
   The video's grade is a touch warmer, and without the match the fade-in shows a
   visible shift.

If either clip is ever regenerated, crossfade it again. And if the desktop still
changes, regenerate the clip from the new still, because they have to be the same frame.

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

   **Every stylesheet and script link carries `?v=YYYYMMDD`, and you must bump it
   whenever CSS or JS changes.** `.htaccess` only exists on Apache. The site is
   also served from **GitHub Pages**, which ignores `.htaccess` and caches CSS
   for about 10 minutes. A phone there once rendered new HTML under an old
   `site.css`: the social icons came out column-wide and link-blue, and a button
   was still underlined. The version in the URL is what makes a deploy impossible
   to serve stale. `tools/test.sh` fails if any local `.css`/`.js` link lacks
   `?v=`, or if they disagree.

### The hero is the one generated image on the page

Everything else is a photograph taken on the property. The hero stills and both
hero loops are generated from `assets/brand/hero-reference.png`, the aerial the
owner supplied as the brand image (see `assets/brand/README.md`).

That is why the gallery says "Every photograph **below**". Two other lines used
to say the same thing, and both were removed at the owner's request: "The
photographs on this page were taken on the property" in the story (it went with
the story's three photographs), and "Photographs taken on the property" in the
footer bar. Keep the gallery sentence true: if a generated image ever appears
below the hero, it has to change.

### The logo, the menu, and the Back button

The logo (`assets/brand/logo-112.png`/`-168.png`) is fixed top left on every
screen: 56px on desktop, 44px on phones. It is cut round from the owner's mark
with a transparent outside and never stretched. It is also the way home:
clicking it scrolls to the top **without** adding a `#top` history entry.

The section menu is **one list** in the markup. Above 820px CSS shows it as a
row of links on forest glass. At 820px and below it is a *Menu* button that opens a
full-height forest panel with the section names in the serif. 820, not the
hero's 700: the seven-link row ran 8px into the logo between 701 and ~720px.
`phoneQ` in `site.js` must match it. Keep the list and
the section ids (`#top #story #grounds #explore #gallery #visit #venue`) in step.

**Back closes things instead of leaving the site.** Opening the menu or the
lightbox pushes one history entry. `popstate` closes whichever overlay is no
longer current, and closing one any other way (X, Escape, a link) calls
`history.back()` so no dead entries pile up. Two details matter:

- `history.scrollRestoration` is set to `manual` while an overlay entry exists.
  Without that, Chromium restores the page entry's saved scroll position when
  Back pops it. A jump made from the menu then gets undone, and you land where
  you opened the menu.
- A menu link scrolls from the `popstate` handler (`afterPop`), not straight
  away, because `history.back()` is asynchronous.

### Two entry points, on purpose

The site is `web/index.html`. The root `index.html` is a redirect stub, not a
copy — keep it that way, and never let the two drift.

On Hostinger the stub is never reached for `/`: `.htaccess:9` sets
`DirectoryIndex web/index.html index.html` and `.htaccess:35` rewrites `^$` to
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

### Contact, and the booking flow that was removed

There is no booking form. Enquiries go to the owners directly:

| | numbers |
|---|---|
| WhatsApp (`https://wa.me/91…`) | 94486 47831, 81975 58321 |
| Call (`tel:+91…`) | 88610 70431, 81975 58321, 96477 82880 |

They appear twice, in the footer (`#visit`) and in the venue block (`#venue`).

Social links sit in the footer's *Follow* entry **only**: each platform's own
mark in its own colours, the platform name, and the handle. They were also
repeated as buttons in the venue block until the owner asked for one set.

| | link |
|---|---|
| Instagram | `https://www.instagram.com/benakabythehills/` |
| Facebook | `https://www.facebook.com/profile.php?id=61594081930585` |

The Facebook address is what the owner's share link
(`facebook.com/share/19QqiByC3i/`) redirects to. Use the permanent
`profile.php?id=` form, not the share link, because Facebook can expire share links. The
Business portfolio ID (`1806534560356550`) is a Meta admin identifier, not a
public page, so never link it. The marks are the official glyphs (Simple Icons
paths, CC0): Instagram filled with its brand gradient (`#ig-grad`), Facebook in
`#0866FF`. They are inline SVG, so there is no icon font and no third-party script, and
the CSP needs no new origin. Each `<svg>` carries `width="22" height="22"`
itself, so a page that loads without its stylesheet still shows small icons
(see the stale-CSS note below). `tools/test.sh` fails unless each link appears
exactly once.
The footer's *Enquire on WhatsApp* button opens a chat with 94486 47831 and a
short message already typed in. `tools/test.sh` fails if any `tel:` or `wa.me` link
carries a number not on that list, so a new number has to be added there too.

**The booking system was removed at the owner's request**: the one-step form,
`api/booking.php` and its WhatsApp-template delivery, the honeypot and rate
limits, `web/js/api.js`, `web/js/booking.js`, `web/css/booking.css`, and the
test section that drove the endpoint over HTTP. Do not bring back a Book
button or a form without being asked. If it is ever wanted again, the last
commit that had it is `2533d7f`:

```bash
git show 2533d7f:api/booking.php        # also api/config.example.php
git show 2533d7f:web/js/booking.js      # also web/js/api.js, web/css/booking.css
git show 2533d7f:tools/test.sh          # section 4 is the endpoint's test suite
git show 2533d7f:CLAUDE.md              # the "Booking" section: guards, template, DATA_DIR
```

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
