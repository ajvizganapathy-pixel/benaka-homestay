# Render chain — OpenArt / PixVerse V6

Seven legs, one continuous forward walkthrough from the road to the pool.

## Model and parameters

```
model  pixverseV6        mode  image2video
params {
  prompt,
  startFrame: { type:"image", id, url, label },
  endFrame:   { type:"image", id, url, label },   // omitted on the finale only
  duration: 8, resolution: "1080p",
  generateAudio: false, videoCount: 1
}
```

Confirmed against `openart_model_form_get`: `startFrame` required, `endFrame`
nullable, duration 1–15, resolution to 1080p, audio off by default.
**216 credits per leg** (240 list, less the Plus MCP discount).

## Getting frames to OpenArt

OpenArt's uploader (`openart_upload_pick`) is a browser widget and cannot read
files from this machine. The way in is that **this repository is public**, so any
committed image has a raw URL that OpenArt accepts as a frame:

```
https://raw.githubusercontent.com/ajvizganapathy-pixel/benaka-homestay/main/<path>
```

Verified by probe: a foreign raw URL was accepted and frame 0 of the output
matched the input at **30.6–32.9 dB**. Push a handoff frame and confirm its URL
returns 200 before submitting the leg that uses it.

## The shape of the chain

Each leg travels from one beat to the next. Seven canvases give six transitions,
plus an open-ended finale:

| leg | startFrame | endFrame | journey |
|---|---|---|---|
| 01 | canvas 01 | canvas 02 | road → the arch |
| 02 | leg 01 last frame | canvas 03 | arch → the house |
| 03 | leg 02 last frame | canvas 04 | courtyard → the pavilion |
| 04 | leg 03 last frame | canvas 05 | the table → the playroom |
| 05 | leg 04 last frame | canvas 06 | billiards → a room |
| 06 | leg 05 last frame | canvas 07 | the room → the pool |
| 07 | leg 06 last frame | *(none)* | the pool, the somersault, the hill |

**Why an end frame here, when the earlier Higgsfield plan forbade one.** That
rule came from Seedance, where an end-image made the camera pull back and the
seam read as a rewind. PixVerse does not: a 45-credit probe (canvas 01 → canvas
02) travelled forward the whole way and landed on the arch with no reversal.
Without it the camera runs away — an open-ended 5s probe crossed three beats in
one clip and would never have reached the room, the bath or the pool.

Anchoring also makes the journey *provably* visit all seven places, which
open-ended prompting cannot guarantee.

**The seam is still frame-exact** because each leg starts from the previous
leg's ACTUAL last frame, never from a canvas. The end frame only steers where a
leg arrives; the start frame is what makes the join invisible. A leg lands near
its target rather than on it (measured 19.7 dB, matching composition) — that is
expected, and the engine's crossfade covers it.

## Running a leg

1. Submit with the parameters above.
2. `openart_creation_get(historyId)` until COMPLETED — video usually outlasts one
   poll window. Download the result URL promptly.
3. `bash render/extract-handoff-frame.sh render/raw/leg-0N.mp4 assets/handoff/leg-0N-last.png`
4. **Look at that frame before chaining.** It must read as a frame from a calm
   forward glide: no sideways motion blur, no half-finished move, no drifted
   horizon. A bad handoff frame poisons every leg after it — re-roll leg N rather
   than building on it.
5. Commit and push the frame, confirm its raw URL returns 200, then submit leg
   N+1 with it as `startFrame`.

**Strictly sequential.** Leg N+1 cannot start until leg N has rendered and its
last frame is extracted, pushed and eyeballed.

## People

Legs 03, 04 and 07 put figures in frame — the buffet being served, the billiards
game, the swimmer. The prompts describe figures by action and dress, never by
body, and carry "fully clothed, documentary style, tasteful and respectful"
deliberately: it is what keeps a content filter from refusing the clip. Do not
soften it out.

## After the chain

1. `bash render/encode.sh` → `assets/clips/leg-0N.mp4`
2. Add one line per beat in `web/world.config.js`:
   `clip: '../assets/clips/leg-0N.mp4'`. Nothing else changes — the pacing, the
   per-beat copy positions and the gallery all carry over, and the stills remain
   the posters and the reduced-motion fallback.
3. Delete `assets/handoff/` once every leg is rendered; it exists only to give
   the frames public URLs.
