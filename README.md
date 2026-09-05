# Sherlock's Jungle Retreat

A scroll-driven site for a homestay in Coorg (Kodagu), Karnataka. Scroll drives a
camera, not a scrollbar: it comes up the road, passes under the arch, crosses the
courtyard, sits down to a meal, plays a frame of billiards, looks into a room and
its bathroom, and comes out at the pool.

![The name over the road in](docs/screenshots/01-hero.jpg)

Static and framework-free — plain HTML, one vanilla-JS engine, no build step, no
dependencies. Serve the repo over HTTP and open `/web/`.

```bash
python3 -m http.server 8765
# http://localhost:8765/web/index.html
```

## The walkthrough

Seven beats, chained as one continuous forward journey: the road, the arch, the
house, the table, the playroom, a room, the pool.

| | |
|---|---|
| ![Through the arch](docs/screenshots/02-gate.jpg) | ![Meals at the pavilion](docs/screenshots/04-table.jpg) |
| **The arch.** The name dissolves as the camera goes in. | **The table.** Where the buffet is laid. |
| ![The billiards table](docs/screenshots/05-billiards.jpg) | ![A room](docs/screenshots/06-room.jpg) |
| **The playroom**, halfway down the scroll. | **The rooms.** Old wood, thick walls. |

![The pool](docs/screenshots/07-pool.jpg)

The story is told in two type registers and nothing between them: a large
editorial serif for anything that carries meaning, a small tracked sans for
anything that labels. That gap is the whole system — a third size in the middle is
what makes a page read as generated, so there isn't one.

**Nothing is laid over the photographs** — no shadow, no glow, no scrim, no
gradient. Instead each beat places its copy where that photograph is already
dark, measured rather than guessed: mean luminance of the copy block sampled on
a grid over every canvas, darkest position wins. Three beats are bright down
their whole left side, so their copy sits right or centre, and the alternation
reads as rhythm.

## The photographs

Past the last beat the camera dissolves into a tiled gallery of all 47
photographs. The three groups — outside the house, inside the rooms, pool and
playroom — sit side by side as a single block rather than stacked, so the whole
library reads at a glance.

![The tiled gallery](docs/screenshots/08-gallery.jpg)

Click any tile and it opens into a horizontal carousel across that group —
arrow keys, swipe, `Esc` to close.

![The carousel](docs/screenshots/09-lightbox.jpg)

## Booking

A compact BOOK button stays fixed to the left edge for the entire scroll, from
the first frame to the footer — a small persistent control, not a sidebar. It
expands to BOOK YOUR STAY on hover and opens a three-step request: who is
coming, a code to their phone, and confirmation.

| | |
|---|---|
| ![The footer](docs/screenshots/10-footer.jpg) | ![The booking panel](docs/screenshots/11-booking.jpg) |

**Booking is deliberately inert.** The form works end to end against a mock, and
says plainly on its face that requests are not being delivered yet. Switching it
on is filling `api/config.php` with the owner's WhatsApp credentials and setting
one flag — see [docs/DEPLOY-hostinger.md](docs/DEPLOY-hostinger.md). Nothing
pretends to have accepted a booking it did not.

## On a phone

![On a phone](docs/screenshots/12-mobile.jpg)

The button stays on the left, the copy clears it, and the type scales down with
the viewport. No horizontal overflow at 360px through 2560px.

## Layout

| Path | What |
|---|---|
| `web/` | the page, its config, the CSS, the JS, self-hosted fonts |
| `web/scrub-engine.js` | the scroll-scrub engine, byte-identical to the `scroll-world` skill |
| `assets/raw/` | 47 property photographs, named for what they show |
| `assets/scenes/` | the 7 walkthrough canvases, exactly 1920×1080 |
| `assets/manifest.json` | every image: dimensions, category, gallery group, scene role |
| `api/` | the booking endpoint for Hostinger, inert until configured |
| `render/` | the Higgsfield chain — written, costed, **not run** |
| `docs/` | deployment guide and these screenshots |

## The video chain

Today every beat holds a still. The camera moves because the engine scrubs, not
because there is video yet.

`render/` carries the whole chain ready to fire: seven leg prompts sharing one
byte-identical style preamble, a masked inpaint that lays a buffet on the
pavilion table, the run book, and the encode scripts. It has not been run — the
Higgsfield account reads **0 credits on a free plan**.

**Estimated cost of the full build: ≈525–705 credits** across 15 generations,
with a full previz pass on `seedance_2_0_mini` at **≈120–160** to approve the
journey first. `render/COSTS.md` has the breakdown — including that both models
report `supports_unlim: true`, so a plan with unlimited generations active would
make the whole chain free.

When the clips land, each beat takes one added line in `web/world.config.js` and
nothing else changes.

## A note on the name

The property is signed **Sherlock's Jungle Retreat** at its gate, which is what
the site uses. The repository is still named `benaka-homestay`.
