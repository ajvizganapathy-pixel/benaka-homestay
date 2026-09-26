# Benaka By The Hills

A site for a homestay in Coorg (Kodagu), Karnataka. In order: the hero, the
family's own account of the place, a live mosaic of the grounds, one film shot
on the property, the photographs as three stacks, a footer with the WhatsApp and
call numbers, and the venue. The round BENAKA logo stays fixed top left, and
it takes you back to the top. A section menu sits top right: a row of links on desktop, a
*Menu* button on phones. The phone's Back button closes the menu and the photo
viewer instead of leaving the site.

![The name over the road in](docs/screenshots/01-hero.jpg)

The hero is the property from the air at sunset, served as two separately made
frames — 16:9 above 700px, 9:16 below it, because a landscape frame
cover-cropped into a phone shows about a quarter of its width. It is the one
generated image on the page, made from the owner's own aerial brand reference;
everything below it is a photograph taken on the property, which is why the page
says exactly that and no more.

**The hero moves, on every screen.** A few seconds of silent footage plays over
the still: one man sitting on the edge of the pool kicking his legs in the water,
the palms shifting in the breeze, a flock crossing the sky. It fades in over
an opening frame that is the same photograph, so the swap is invisible. Phones
get a 9:16 clip and desktop a 16:9 one. The desktop clip was rendered to start
**and end** on its own still, then its seam was dissolved, so it loops without
reading as a replay. It is fetched only after the page has loaded, and not at
all under reduced-motion or on a metered or 2g connection. Every one of those
cases simply keeps the still.

Static and framework-free — plain HTML, vanilla JS, no build step, no
dependencies. Serve the repo over HTTP and open `/web/`.

```bash
php -S localhost:8765 -t .     # or python3 -m http.server 8765
# http://localhost:8765/   — the root index.html sends you to the site
```

```bash
bash tools/test.sh   # the full suite: syntax, secrets, assets, budgets, contact numbers
```

The site itself lives in `web/`. The root `index.html` is a small redirect so
that opening the repository root gives the homestay rather than a directory
listing. On Hostinger it is never reached: `.htaccess` maps `/` to
`web/index.html` internally, so visitors get a clean `/` with no hop.

## Our story, and the grounds

Under the hero the page says what the place actually is: rooms along a
verandah, a courtyard wet all monsoon, meals at one table. It is just the words.
The three photographs that used to sit beside them, and the line saying they
were taken on the property, came out at the owner's request.

The band below it is a live mosaic of the grounds: ten cells drawn from the
whole set, turning over one at a time every couple of seconds, so the wall
reshuffles itself over about a minute. Tap any cell to open it.

**The indoor billiards frames are excluded from that band, deliberately.** It is
the band that says "around the property", so a dark interior in it reads as a
mistake. That exclusion has to hold in two places — the opening cells *and* the
rotation pool — because filtering only the first ten would let a cell turn into
a billiards frame a minute later, which no single screenshot would ever catch.
The gallery further down still shows them, under *Pool and playroom*.

## Explore Benaka

One film, 31 seconds, shot on the property: the mosaic mural, the pool with the
house behind it, a bedroom, the garden swings, the front elevation. It sits on
the forest ground between the ivory brochure above and the ivory gallery below,
so the page reads ivory, forest, ivory and the film is the one dark chapter.

It autoplays muted when you scroll to it, pauses when you leave, and carries a
button to turn the sound on. Nothing is fetched until you approach it: the
`<video>` ships with no `src` and `preload="none"`, and `site.js` sets the source
from an `IntersectionObserver` at `rootMargin: 150%`. A visitor who never scrolls
that far never pays 8.8MB for it.

The file is remuxed with `-movflags +faststart` so the `moov` index sits before
the media data. Without that a browser must download the whole file before it can
paint a frame — and it fails silently, looking like a slow network rather than a
bad encode. `tools/test.sh` scans the atom order and fails the build.

> **The scroll world was rejected.** This began as a scroll-scrubbed camera move
> across seven AI-rendered beats, and went through three shapes before the owner
> rejected the concept: it read as an AI film rather than as a place. The engine
> and its config are deleted, the fourteen rendered clips are untracked, and the
> record of what that chain cost is kept at the end of this file. Do not rebuild
> it.

## The photographs

Below the film, the gallery is three stacks — five photographs per group laid
over each other like prints on a table, the section's name beside them, and one
control. Around the property, inside the rooms, pool and playroom.

![The gallery stacks](docs/screenshots/08-gallery.jpg)

Showing five hides nothing: a stack opens its group's **complete** set in the
carousel — 12, 16 and 10 photographs — with arrow keys, swipe and `Esc`. The
fan's offsets are fixed rather than random, so the composition can be reviewed
and repeated instead of rolling differently on every load, and every supporting
card keeps a corner clear of the one on top of it.

![The carousel](docs/screenshots/09-lightbox.jpg)

## Getting in touch

There is no booking form. It was removed at the owner's request, along with
the PHP endpoint behind it. The footer and the venue block carry the numbers
directly:

| | |
|---|---|
| **WhatsApp** | 94486 47831 · 81975 58321 |
| **Call** | 88610 70431 · 81975 58321 · 96477 82880 |

| **Instagram** | [@benakabythehills](https://www.instagram.com/benakabythehills/) |
| **Facebook** | [Benaka Bythehills](https://www.facebook.com/profile.php?id=61594081930585) |

*Enquire on WhatsApp* in the footer opens a chat with a short message already typed in.
Instagram and Facebook appear once, in the footer, each with the platform's own
logo in its own colours, its name and the handle.
`tools/test.sh` fails if any call or WhatsApp link carries a number that is
not one of these. A typo in a number does not look broken; it dials a stranger.

![The footer](docs/screenshots/10-footer.jpg)

## Sharing the link

Paste the site's address into WhatsApp, an Instagram DM or Facebook and the
preview shows the round Benaka logo, the name, a one-line caption, and the
Instagram and Facebook handles:

![The link preview card](assets/brand/share-card-photo.jpg)

The footer also has a **Share Benaka** button. On a phone it opens the phone's
own share menu with the caption and link already filled in. On a desktop it opens
WhatsApp's choose-a-chat screen. Regenerate the card with
`node tools/make-share-card.js`. CLAUDE.md has the rules it has to keep.

## Where it is

![The venue block](docs/screenshots/15-venue.jpg)

The last block on the page: the name at the size it deserves, **Near Irpu Falls,
Kodagu**, the three call numbers as tap-to-call, both WhatsApp numbers, and one
button out to Google Maps. Not an
embedded map — an iframe would need google.com in the Content-Security-Policy
and would set third-party cookies on a site that has neither, and on a phone a
plain link opens the visitor's own map app anyway.

## On a phone

![On a phone](docs/screenshots/12-mobile.jpg)

The hero photograph takes the whole screen with the name on it. The logo sits top
left at 44px, and the *Menu* button opens a full-screen list of the sections.

The grounds mosaic keeps the desktop's four columns, so each cell is a quarter
of the size it used to be. The whole band is about 270px tall on a 390px phone,
down from about 1,090px when it was re-cut into two columns. It still has ten cells,
tiles flush, and turns over as you watch.

**The gallery stacks stay large.** They go one per row at full gutter width, the
biggest print about 57% of the screen — never a dense grid of thumbnails, which
is the whole point of a stack. That took fixing twice: `order` alone moved the
pictures into the narrow column on the flipped row, and the mobile rule lost a
specificity fight to the mirrored one because a media query adds no specificity
of its own.

The film goes full width. Type scales with the viewport. No horizontal overflow
from 360px through 2560px.

## Deploying

Upload the repository to the host; there is no build step and nothing to
compile. On Hostinger, `.htaccess` maps `/` to `web/index.html` internally, so
visitors get a clean `/`.

**If a change looks like it did not deploy, read this before anything else.**

The gallery, the grounds mosaic and the hero mosaic are all **built by
`web/js/site.js` at runtime** from `assets/manifest.json`. `web/index.html`
contains only `<div data-gallery>` — searching the HTML for the stack markup
finds nothing, and that is correct, not a failed deploy.

Which used to have a nastier consequence. `.htaccess` cached CSS and JS for a
day and the files carry no version in their URLs, so a returning visitor got a
*fresh* HTML shell running *yesterday's* JavaScript, and therefore yesterday's
gallery. It looked exactly like a change that had not shipped.

Those text files — the three stylesheets, `site.js`, and the
manifest — are now served `Cache-Control: no-cache`. That means *revalidate
before use*, not *do not store*: the browser keeps the file, asks
`If-Modified-Since`, and Apache answers **304 Not Modified** with no body when
nothing changed. A deploy is live the moment it lands.

Photographs, fonts and the film keep a year-long `immutable` expiry. They never
change at the same filename — replacing one means a new name — so they are safe
to freeze, and they are the bytes that actually matter for weight.

If you ever add a build step that stamps content hashes into filenames, you may
put the long expiry back on CSS and JS **in that same change**, and not before.

**GitHub Pages ignores `.htaccess`**, so none of the above applies there, and
it caches CSS for about ten minutes. That is why every stylesheet and script link in
`web/index.html` carries a `?v=` version. Bump it whenever CSS or JS changes, or
a visitor can get new HTML drawn with an old stylesheet.

## Layout

| Path | What |
|---|---|
| `web/` | the page, the CSS, the JS, self-hosted fonts |
| `assets/raw/` | 38 property photographs, named for what they show |
| `assets/brand/` | the logo, the two hero stills and the owner's aerial reference |
| `assets/video/` | the property film, its poster, and the two hero loops (phone, desktop) |
| `assets/manifest.json` | every image: dimensions, category, gallery group, scene role |
| `assets/scenes/`, `assets/handoff/` | stills from the rejected render chain |
| `assets/clips/` | 14 rendered legs, **untracked**; on disk, and in history at `76bab70` |
| `tools/test.sh` | the production suite: bash, node, python3; no framework |
| `render/` | the OpenArt render chain: prompts, run book, costs, encoders |
| `docs/` | deployment guide and these screenshots |

## HISTORICAL — the rejected render chain

Nothing below is live on the page. It is kept because it is expensive knowledge:
what the chain cost, which model can hold a signboard for eight seconds, and why
the phone chain could not be a resize. Read the rejection above first.

### The walkthrough was rendered

![Frames from the seven rendered legs](docs/screenshots/13-walkthrough.jpg)

Seven 8-second legs at 1080p, rendered on **OpenArt / PixVerse V6** from the
property's own photographs. One continuous forward journey: up the road, under
the arch, across the courtyard, past a buffet being served, through the billiards
game, into a room, and out to the pool for the last splash.

Each leg begins on the **actual last frame of the leg before it**, so the seams
are frame-exact rather than cut — measured at 30.3 dB on the first handoff. Each
also carries an **end frame** naming the next beat, which is what makes the
journey provably visit all seven places; without it a single 5-second clip
crossed three beats and would never have reached the room or the pool.

Cost: **1,512 credits** for the seven legs, plus 90 on two probes that proved the
mechanism before committing — **1,602 of a 12,000 balance**. `render/COSTS.md`
records the per-leg maths and why Seedance 2.0 was ruled out at eight times the
price.

### Phones got their own chain

A 16:9 clip on a 390×844 phone is cropped by `object-fit: cover` to **25.8% of
its width**, and the mobile encode used to resize the master to 1280 wide on top
of that — cover's scale factor there is 1.18, an *upscale*, so 330 source pixels
were being stretched across 390 CSS pixels. The phone build was softer than the
desktop master it came from, and no encoder setting could fix it: the framing was
never rendered.

So the phone gets a **second, native 9:16 chain** — the same seven beats, the
same journey, rendered portrait. It shows **82% of the frame** and puts **887
source pixels** where 330 used to go. Same 216 credits a leg; a 45-credit probe
confirmed PixVerse takes its aspect from the start frame before the chain was
committed.

![The same beat, 16:9 cropped to a phone and rendered 9:16](docs/screenshots/14-mobile-chain.jpg)

Desktop gets the 1080p landscape masters; phones get the portrait legs at
810×1440 with a tighter GOP, and a portrait poster to match, all served
automatically by the engine. The stills remain the posters and the
reduced-motion fallback.

## A note on the name

The property is signed **Benaka By The Hills** at its gate, which is what
the site uses. The repository is still named `benaka-homestay`.
