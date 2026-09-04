# Cost state and calibration

## Measured, at the time this chain was authored

```
Higgs_field balance  ->  { "credits": 0, "subscription_plan_type": "free" }
models_explore get seedance_2_0  ->  supports_unlim: true,
                                     unlim: { available: false, remaining: null }
```

**Zero credits, free plan, unlimited generations not available.** The chain
cannot render until this changes. Everything else in this repo is complete and
does not depend on it.

## Shape of the spend

Architecture A, N = 7:

| Item | Count |
|---|---|
| Video generations (legs) | 7 |
| Connectors | 0 — architecture A has none |
| Still generations | 0 — the scene canvases are the property's own photographs |
| Re-roll headroom (~15%) | ~1–2 |
| **Total** | **~8–9 video generations** |

Using the property's real photographs instead of generated stills removes the
`N` image generations the skill normally budgets for, and architecture A removes
the `N−1` connectors. This chain is roughly half the generation count of the
skill's default architecture-B build at the same N.

## Calibrate, do not guess

The CLI and MCP expose no pricing, and plans differ. Before committing to the
full run:

1. Render **one** leg.
2. Diff `Higgs_field balance` before and after.
3. Extrapolate to 7 and add the re-roll headroom.
4. Warn before proceeding if the estimate exceeds ~70% of the balance.

For orientation only, observed on a Plus plan in 2026-07: a standard video was
~40–55 credits. Do not treat that as this account's price — measure it.

A real `not_enough_credits` mid-run is recoverable (finished legs survive; resume
after top-up) but wasteful, and on a sequential chain it strands the handoff.

## NSFW false positives — budget for these

Seedance's content filter flags innocuous footage, and **this build is unusually
exposed to it**: legs 05 (bedroom), 06 (bathroom) and 07 (pool) are exactly the
contexts the skill names as the touchy ones, along with trigger words like *bed*,
*pool*, *shower* and *waterfall*.

Fixes, in order:

1. **Re-roll.** It is often non-deterministic and passes on the 2nd–3rd try.
2. **Strip trigger words** and lean on the preamble's existing "empty,
   unoccupied, no people, no figures, architectural, tasteful" — already present
   verbatim in every prompt file for this reason.
3. **Re-render that one leg on `kling3_0`** with the same start frame. A
   different provider's filter often passes what Seedance blocks. Note the flag
   differences: no `resolution` parameter, sound defaults on so pass it off, and
   encode at whatever native resolution ffprobe reports — never upscale.

Option 4 from the skill — setting a connector slot to `null` — **does not apply
here**: architecture A has no connectors, so there is no seam the engine can
crossfade past. A leg that will not render must be re-rolled or dropped from the
journey; it cannot be skipped.
