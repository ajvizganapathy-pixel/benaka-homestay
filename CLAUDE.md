# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A scroll-driven site for a homestay in Coorg (Kodagu), Karnataka, built on the
`scroll-world` skill. Scroll drives a **camera**, not a scrollbar. Seven beats
run from the road outside to the pool, then dissolve into a tiled gallery of the
property's photographs, a footer, and a booking flow.

Static and framework-free — plain HTML, one vanilla-JS engine, no build step, no
package manifest, no tests. Serve the repo root over HTTP and open `/web/`.

The property is signed **Benaka By The Hills** at its gate, which is what
the site uses. The repo is still named `benaka-homestay`.

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
web/index.html        page shell: editorial band, canvas mount, gallery, footer, booking
web/world.config.js   the 7 beats, their copy, and all scroll pacing
web/scrub-engine.js   VERBATIM from the skill — do not edit
web/css/              fonts, tokens, site chrome, booking
web/js/               api adapter, site behaviour, booking flow
web/fonts/            self-hosted woff2 (no CDN at runtime)
assets/               raw/ photographs, scenes/ canvases (+ scenes/portrait/),
                      clips/ 14 legs, manifest.json
api/                  booking.php + config.example.php — inert until configured
render/               the OpenArt render chain: model, prompts, run book, costs
```

### Four things that will bite

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

4. **There are TWO rendered chains, and the phone one is not a resize.** Desktop
   gets `clip` / `still` (16:9); a coarse-pointer or ≤860px viewport gets
   `clipMobile` / `stillMobile`, which are a separately rendered native 9:16
   chain. This is not an optimisation that can be undone with an encoder flag:
   `object-fit: cover` shows only 25.8% of a 16:9 frame's width on a 390×844
   phone, and a resize of that master to 1280 wide is an *upscale* — the fault
   that made the phone build look dull. Set `clipMobile` and `stillMobile`
   together, or the poster flashes a crop of the wrong picture. Landscape encodes
   come from `render/encode.sh`, portrait from `render/encode-mobile.sh`, which
   refuses a landscape input outright.

### The editorial band, and why the walkthrough has an eighth section

The page opens as a property brochure — real photographs, ivory ground, editorial
serif — and only then hands over to the canvas. That order exists because the
client read the old build as an AI cinematic rather than as a real place.

**The catch is that `scrub-engine.js` lays its segments out from zero
(`let off = 0`, :187) and reads absolute `window.scrollY` (:223), so it assumes
its track starts at the top of the document.** Anything above `#world` shifts
every beat's trigger point, and the engine cannot be patched.

So `web/js/site.js` measures the `.before` band at mount and prepends **one
lead-in section** to the config, carrying beat 1's poster and **no clip**. It is
pure scroll: the band spends it, and the seven real beats then begin unspent.
Consequences to know:

- there are **8 `.sw-copy` elements, not 7**, so every `nth-child()` beat
  selector in `site.css` is offset by one;
- `.sw-copy__num` is hidden, which is why the renumbering never shows;
- `.before` and `.after` use `padding-left` for the book rail, not `margin-left`
  — a margin left the rail transparent and the engine's fixed `.sw-stage`
  painted a strip of canvas down the edge of the brochure;
- both bands must restate `color: var(--s-ink)` as well as the token, because
  `color` inherits as a computed value and `body` has already resolved the dark
  theme's cream.

### Two entry points, on purpose

The site is `web/index.html`. The root `index.html` is a redirect stub, not a
copy — keep it that way, and never let the two drift.

On Hostinger the stub is never reached for `/`: `.htaccess:4` sets
`DirectoryIndex web/index.html index.html` and `.htaccess:47` rewrites `^$` to
`web/index.html` **internally**, so the URL stays clean. The stub is the fallback
for everywhere `.htaccess` does not apply — `python3 -m http.server`, a
non-Apache host, opening the files directly. It uses `location.replace()` so it
leaves no history entry; `assign()` would trap the Back button.

### Nothing DIMS the photographs — but the type may carry a bounded shadow

**The scrim is still banned outright.** The engine's `.sw-copylayer::before`
gradient is overridden off with `!important` and must stay off: it dimmed the
left of every frame for the whole scroll. No black gradients, no cinematic wash,
nothing that darkens the picture as a whole.

**The text-shadow ban was REVERSED**, on the client's explicit written
instruction, after measurement showed placement alone could not carry it: with
no shadow and no scrim, four of the seven beats sat at 3.2–4.0:1 against cream
type on phones, and no position, ink colour or copy length reached 4.5:1 — the
rooms the chain now shows are bright, white-plastered interiors.

What replaced it is a **bound, not a licence**: blur only, no offset, alpha
below 0.5, one layer, no outline, on the canvas copy only. That reads as ink
printed onto the photograph; an offset or opaque shadow reads as a movie poster,
which is exactly what the reversal was careful not to become.
`tools/check-css-invariants.sh` now asserts the bound rather than absence, so the
guard still fails the build if someone raises the alpha to rescue a beat. If a
beat needs more than this, it needs different footage.

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
