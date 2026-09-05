# Credits — OpenArt

## Account

```
openart_account_get -> { plan: "Plus", credits: 12000 }
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
