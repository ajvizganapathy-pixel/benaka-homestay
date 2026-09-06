# The two arch canvases

The gate was re-signed **BENAKA ByTheHills** partway through the project. Beats
01 and 02 are the arch beats, so the old canvases — and the legs rendered from
them — carried a name the property no longer uses.

The owner supplied one new photograph of the arch, `assets/raw/gate-arch-benaka-01.jpg`
(1600×900). One photograph is enough for one beat, not two: legs need somewhere
to travel, and a crop of a 1600px frame upscaled to a canvas is soft exactly
where the sign is.

So beat 02's canvases were generated from that photograph with **Nano Banana Pro**
(`image2image`, 4K, 72 credits each), which is the model on this roster built for
in-image text — the whole risk here being that a generative model garbles
lettering. The outputs came back 5504×3072 and 3072×5504 and were **downscaled**
to the canvas sizes, so the sign is sharper than anything a crop of the original
could give.

| canvas | how |
|---|---|
| `scenes/01-approach-road.jpg` | the photograph, 1600×900 → 1920×1080 |
| `scenes/portrait/01-approach-road.jpg` | generated wide 9:16, 3072×5504 → 1080×1920 |
| `scenes/02-gate-arch.jpg` | generated close 16:9, 5504×3072 → 1920×1080 |
| `scenes/portrait/02-gate-arch.jpg` | generated close 9:16, 3072×5504 → 1080×1920 |

The first attempt at beat 02 came back barely closer than beat 01 — too little
travel for an eight-second leg. The prompts below are the second attempt, which
says in as many words that the camera is *underneath* the arch with its ironwork
running off both edges of the frame. Check any regeneration against that: beat 01
and beat 02 must be visibly different distances, or the leg between them has
nowhere to go.

The 4K masters are not committed; they are reproducible from these prompts.
