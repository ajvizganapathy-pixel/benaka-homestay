# benaka-homestay

A scroll-driven landing page for a homestay in Coorg (Kodagu), Karnataka, built
on the `scroll-world` skill. Scroll drives a camera through the property — from
the road outside, through the gate, into a guest room, and back out to the pool —
as one continuous forward flight.

> The property is signed **"Sherlock's Jungle Retreat"** at its gate. The
> intended public name is still to be confirmed.

## Status: procedural pass

This pass ships the **mechanism only** — no UI, no UX, no copy. The seven scroll
sections are wired to 16:9 canvases cut from the property's own photographs, and
the pacing is tuned on those stills. The Higgsfield video chain is authored under
`render/` but has not been executed.

## Run it

```bash
python3 -m http.server 8765
# open http://localhost:8765/web/index.html
```

Scroll. Seven scenes hand off in order: approach → gate → courtyard → verandah →
room → bath → pool.

## Layout

| Path | What |
|---|---|
| `assets/raw/` | 47 property photographs, renamed to content-derived slugs |
| `assets/scenes/` | the 7 start canvases, exactly 1920×1080 |
| `assets/manifest.json` | every image: dimensions, orientation, category, scene role |
| `web/` | the page, its config, and the scroll-scrub engine |
| `render/` | the video chain — prompts, run book, encode scripts, cost notes |

See `CLAUDE.md` for the architecture and the constraints that govern `render/`.
