# Credits — OpenArt

## Account

```
openart_account_get -> { plan: "Plus", credits: 12000 }   at the first chain
openart_account_get -> { plan: "Plus", credits: 10398 }   before the portrait chain
```

Plus earns a **10% discount on MCP-originated generations**. Credits have no
decimals, so the charge is `round(unitCredits × 0.9) × quantity` — quote that
formula's result, not a mental "10% off".

## The chain

| | list | charged | ×7 legs |
|---|---:|---:|---:|
| **PixVerse V6, image2video, 8s, 1080p, 16:9, audio off** | 240 | **216** | **1,512** |
| Re-roll budget (4 legs) | 240 | 216 ea | 864 |
| **Worst case** | | | **≈2,376 of 12,000 (20%)** |

Cheaper settings for drafting a re-roll before committing at 1080p:

| config | list | charged |
|---|---:|---:|
| 8s / 720p | 112 | 101 |
| 5s / 540p | 50 | 45 |

## Why PixVerse V6

Its stated strength — stable, natural camera and shot motion — is what a chained
walkthrough needs, and it holds the best cost-performance on the roster. It also
spans 540p to 1080p and 1–15s, so a draft and its final run on the **same model**
and there is no render-character shift between what gets approved and what ships.

**Seedance 2.0 was ruled out on price:** 1,600 list / **1,440 charged** per leg at
8s/1080p — 10,080 for a single pass, 84% of the balance with nothing left for
re-rolls. Better at people, but not at eight times the cost.

Veo 3.1 (lite) ties PixVerse at 216 for the same config and is a fair
alternative, but previz would have to run on a different model.

## Spent so far

| what | result | charged |
|---|---|---:|
| Handoff probe — 540p/5s, startFrame only | frame-lock **30.6–32.9 dB**, foreign URL accepted | 45 |
| End-frame probe — 540p/5s, start+end | see `run-chain.md` | 45 |
| **The 16:9 chain — 7 legs, 8s/1080p** | no re-rolls | **1,512** |
| Portrait-aspect probe — 540p/5s, 1080×1920 frames | out **576×1024**, clean forward glide, landed under the arch | 45 |
| **The portrait chain — 7 legs, 8s/1080p, 9:16** | | **1,512** |

## The portrait chain

`pixverseV6/image2video` has **no aspect-ratio field** — output aspect follows
`startFrame`. That was an assumption worth 45 credits to test rather than 1,512
to discover: a 540p/5s job with a 1080×1920 start frame came back **576×1024**,
so a 1080p job returns 1080×1920. Same 216 a leg, same seven legs, **1,512**.

Why it is worth spending at all: on a 390×844 phone the 16:9 chain is cropped by
`object-fit: cover` to 25.8% of frame width, and the old mobile encode then
*upscaled* that — 330 source pixels across 390 CSS pixels. A native 9:16 leg
shows 82% of the frame and puts 887 there. The fix is not an encoder setting;
there is no way to recover framing that was never rendered.

## No masked inpaint on OpenArt

OpenArt's image models expose `text2image` / `image2image` with reference images
— there is **no mask role**, so the masked inpaint the earlier plan used to dress
the pavilion with a buffet is not available. The buffet arrives in leg 04's video
prompt instead, generated in motion from the real pavilion photograph. That costs
nothing extra and keeps an untouched photograph as the start frame, which is the
better outcome anyway.

## Rules for spending

- Prove a mechanism on a 45-credit 540p probe before committing a 1,512 chain.
- Read the balance before and after each leg; confirm the charge matches 216.
- Draft a doubtful re-roll at 720p (101) before paying 216 for it.
- Stop and check in if the running total approaches the estimate plus the
  re-roll budget.
