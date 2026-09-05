# Credits required for the build

## Measured state

```
Higgs_field balance              -> { "credits": 0, "subscription_plan_type": "free" }
models_explore get seedance_2_0  -> supports_unlim: true,
                                    unlim: { available: false, remaining: null }
models_explore get nano_banana_2 -> supports_unlim: true, is_inpaint + mask roles
```

**Zero credits, free plan, unlimited generations unavailable.** Nothing below has
been run. The site is complete and live-ready without any of it.

## The estimate

There is no pricing API on the MCP server. These figures come from the
`scroll-world` skill's own calibration (Plus plan, 2026-07: **standard video
≈ 40–55 credits, still ≈ 15**) and must be re-checked with one real render
before committing to the full chain.

| Item | Model | Gens | Credits each | Subtotal |
|---|---|---:|---|---:|
| Walkthrough legs (7 beats) | `seedance_2_0` std / 1080p / 8s | 7 | 40–55 | 280–385 |
| Re-roll headroom (~15%) | same | 2 | 40–55 | 80–110 |
| Re-rolls, filter-prone legs | same | 3 | 40–55 | 120–165 |
| Buffet masked inpaint | `nano_banana_2` 2k | 3 | ~15 | ~45 |
| **Total** | | **15** | | **≈ 525–705** |

**Budget ~700 credits.** The bathroom beat was dropped from the journey, which
removes one leg and one inpaint from the earlier 19-generation estimate.

**Run previz first** (the agreed order): all 7 legs on `seedance_2_0_mini` at
720p costs **≈120–160 credits** and shows the whole journey. Approve the pacing
and the people shots there, then re-render finals at 1080p. It frame-locks
identically, so nothing is thrown away.

## Three things that change the number

1. **Unlimited generations may make this free.** Both models report
   `supports_unlim: true`; the account currently reports
   `unlim.available: false` on a free plan. **If the Pro plan activates that
   allowance the whole build costs 0 credits.** Re-read `balance` and
   `models_explore get seedance_2_0` the moment Pro is live, and report before
   spending anything.
2. **Previz at a quarter of the cost** — see above; this is the agreed order.
3. **People are what will cost you re-rolls.** Legs 04 (buffet), 05 (billiards)
   and 07 (pool) put figures in frame. Bedroom, bathroom and pool are the three
   contexts the skill names as worst for Seedance's NSFW filter, and leg 08 adds
   a swimmer mid-dive. Those three extra re-rolls above are for exactly this.

## Why this chain is cheaper than a stock scroll-world build

- The scene canvases are the property's own photographs, so the `N` still
  generations a normal build needs are already zero.
- Architecture A has no connectors, so the `N−1` connector clips are gone.

Roughly half the generation count of the skill's default architecture-B build at
the same N.

## Handling an NSFW refusal

In order:

1. **Re-roll.** Often non-deterministic; passes on the 2nd or 3rd try.
2. **Lean on the wording already in the prompts.** Every people-carrying prompt
   describes figures by action and dress, never by body, and carries "fully
   clothed … documentary style, tasteful and respectful" verbatim for this
   reason. Do not soften the scene by removing the clothing language — that is
   the part doing the work.
3. **Re-render that one leg on `kling3_0`** with the same start frame. A
   different provider's filter often passes what Seedance blocks. Note: no
   `resolution` parameter, sound defaults on so pass it off, and encode at
   whatever native resolution ffprobe reports — never upscale.

The skill's fourth option — setting a connector slot to `null` — **does not apply
here.** Architecture A has no connectors, so there is no seam for the engine to
crossfade past. A leg that will not render must be re-rolled or dropped from the
journey; it cannot be skipped.
