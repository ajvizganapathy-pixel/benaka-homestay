# Render chain — armed, not fired

Architecture **A** (continuous forward walkthrough), **7 legs**, no connectors,
plus one masked inpaint (the buffet).

**Nothing here has been executed.** At the time of writing, `Higgs_field balance`
reported `credits: 0, subscription_plan_type: free`, and `models_explore get
seedance_2_0` reported `unlim.available: false`. Read `COSTS.md`, then run this
only on an explicit go.

## Why MCP and not the CLI

The `higgsfield` CLI is **not installed** in this environment and neither is
`monid`, so the skill's `pipeline.md` bash scripts do not apply as written. The
Higgsfield **MCP server** is available and does the same job. `models_explore get
seedance_2_0` confirms the model's `medias.roles` include `start_image` and
`end_image`, so frame-locking — the thing the whole method rests on — works over
MCP.

`ffmpeg`/`ffprobe` 6.1.1 **are** installed (via apt) and do the frame extraction
and encoding.

## Model and parameters

Every parameter below was checked against `models_explore get seedance_2_0`; do
not add flags that the schema does not list.

| Parameter | Value | Why |
|---|---|---|
| model | `seedance_2_0` | Roster default; frame-locks via `start_image` |
| `mode` | `std` | Required for 1080p |
| `resolution` | `1080p` | Native; never downscale at render time |
| `aspect_ratio` | `16:9` | Explicit — the default is `auto` and follows the input image |
| `duration` | `8` | Legs want length; schema allows 4–15 |
| `generate_audio` | `false` | Schema default is `true`; audio is wasted (we mute and `-an`) |

**One model for the whole chain.** Mixing renderers keeps position continuity but
the render-character shift reads as a pop. The one sanctioned exception is
`kling3_0` for a single clip the Seedance NSFW filter refuses (see COSTS.md).

## The chain

Legs are **strictly sequential** — leg *i* cannot start until leg *i−1* has
rendered and its last frame is extracted. This cannot be parallelised.

### Leg 01 (the only leg that starts from a photo)

1. `media_upload` → `assets/scenes/01-approach-road.jpg`
2. `generate_video` with the parameters above, `start_image` = that upload,
   `prompt` = contents of `render/prompts/leg-01.txt`
3. `jobs_wait`, then **download the result immediately** — result URLs expire.
   Save to `render/raw/leg-01.mp4`.

### Legs 02–07

For i = 2..7:

1. `bash render/extract-handoff-frame.sh render/raw/leg-0<i-1>.mp4 render/frames/leg-0<i-1>-last.png`
2. **Eyeball that frame before continuing.** It must read as a frame from a calm
   forward glide — no sideways motion blur, no half-finished orbit, no drifted
   angle (Seedance rotates slightly on long legs). A bad handoff frame poisons
   every leg after it: re-roll leg *i−1* rather than building on it.
3. `media_upload` that PNG
4. `generate_video`, `start_image` = that upload, `prompt` =
   `render/prompts/leg-0<i>.txt`, **and no `end_image`**
5. `jobs_wait` → download to `render/raw/leg-0<i>.mp4`

**No `end_image`, ever, on this architecture.** An end-image of a wider shot
forces the camera to pull back, and a camera that reverses across a seam reads as
a rewind stutter. That is the skill's single most-cited failure. The legs still
arrive at distinct rooms because the prompt steers the content.

The scene canvases for legs 02–07 (`assets/scenes/02-…` … `07-…`) are **not**
start images — they are the reference for what each leg should arrive at, and
they stay wired as the engine's posters. Only leg 01 starts from a photo.

## Before the chain — the masked inpaint

Run this first; leg 04 starts from its output. (The bathroom inpaint is gone with the bathroom beat.)

| Spec | Source | Mask | Output |
|---|---|---|---|
| `render/prompts/enhance-buffet.txt` | `assets/raw/courtyard-pavilion-02.jpg` | `render/masks/courtyard-pavilion-02-mask.png` | `assets/enhanced/courtyard-pavilion-02.jpg` |

It uses `nano_banana_2` with `is_inpaint: true` and a `mask` media role —
confirmed present on that model via `models_explore get nano_banana_2`. **This is
the whole reason that model is chosen.** Everything outside the mask is returned
untouched, so the photograph stays the real room. `seedream_v4_5` and
`flux_kontext` accept only `image_references` and would redraw the entire frame.

Paint the masks by hand (any editor, white = repaint, black = keep) and keep them
tight. After each, compare against the original at full size: if anything outside
the mask has shifted, the mask leaked — redo it tighter.

Then re-cut the affected scene canvases to 16:9 from the enhanced files and point
`web/world.config.js` at them.

## After the chain

1. `bash render/encode.sh` → `assets/clips/leg-0N.mp4`
2. Add `clip: '../assets/clips/leg-0N.mp4'` to the matching section in
   `web/world.config.js`. Change nothing else: `connectors: []` and the
   `crossfade`/`scroll`/`linger` pacing already tuned on the stills carry over
   unchanged.
3. QA the seams — screenshot just before and just after each one. Judge by
   **composition, not raw PSNR**: a correctly frame-locked seam can read
   18–25 dB from detail shimmer alone. A real mismatch shows as different
   composition or props, not just softness.
4. Confirm `video.seekable.end(0) > 0` in the console (blob loading working) and
   that `currentTime` tracks scroll across each clip's band.

## Not doing

- **No connectors.** Architecture A has none; skill Step 5 is skipped entirely.
- **No mobile chain.** The native 9:16 portrait chain roughly doubles the spend
  and was not opted into. The engine's phone hardening (seek coalescing, iOS
  priming, safe-area) is always on regardless, so a desktop-only build degrades
  gracefully rather than breaking.
