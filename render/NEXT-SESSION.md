# Handoff — the three scroll-world fixes

Approved plan: `/root/.claude/plans/at-first-inspect-the-jiggly-cherny.md`.
This note records what was done, what was proved, and what is left.

## The three faults, all reproduced from contact strips

1. **Billiards → rooms.** Desktop `leg-05` goes billiards → doorway → straight
   into the bedroom; it reads as pushing through a wall. Portrait `leg-05-m` is
   worse: games room → stair → outdoor terrace → **back** to the billiards table
   → bedroom. No route at all.
2. **The meal beat on mobile.** The *leg* is fine — `leg-04-m` from ~2s on is a
   real buffet line, staff serving, guests with plates, billiards visible
   through the far end. The fault is the **canvas**: `scenes/portrait/04-buffet-table.jpg`
   is the empty concrete yard and the yellow water tower, so that is the poster
   at rest and the first second of the leg. Desktop's beat 04 is fine as it is.
3. **Desktop pool finale.** `leg-07` frame 1 has a tiny figure at the pool edge,
   frame 2 is a splash crown **with no body anywhere in frame**, then empty
   water. Portrait `leg-07-m` is correct — diver visibly enters, then swims —
   so only the landscape chain needs re-rendering.

Decisions taken with the owner: route is **out and along the verandah** to the
separate cottage row (not the stair, not through the house); mobile beat 04 is
**fully indoor**; desktop finale **matches what mobile does**.

## Done

- **`assets/scenes/portrait/04-dining-indoor.jpg`** — the new fully-indoor 9:16
  canvas, 1080×1920, Nano Banana Pro image2image at 4K (3072×5504 master,
  downscaled), **72 credits spent**. Prompt: `render/prompts/canvas/04-dining-indoor-9x16.txt`.
  Source: `assets/handoff/ref-04-dining-indoor.png`, which is frame 5.2s of the
  current `leg-04-m` — the one moment in either chain that actually shows the
  meal. **Checked and good**: sharp, indoor, guests with plates, billiards table
  visible in depth.
  It is **not wired in yet** — `world.config.js` still points `stillMobile` at
  `04-buffet-table.jpg`. Wire it only when portrait leg 04 has been re-rendered
  from it, or the poster and the first frame disagree.

## Left to do, in order

1. **Rewrite four leg prompts.**
   - `render/prompts/portrait/leg-04.txt` — stay **inside the dining hall for
     all eight seconds**, no courtyard, no water tower; travel the length of the
     buffet and out through the far doors, ending on the games-room canvas.
   - `render/prompts/portrait/leg-05.txt` and `render/prompts/leg-05.txt` — the
     verandah route: leave the games room, step out onto the covered pillared
     verandah, go **along** it past the green courtyard and the dripping eaves to
     a timber guest-room door in the cottage row, and in. Both chains, same route.
   - `render/prompts/leg-07.txt` — the swimmer **visible in frame entering the
     water**, then swimming, camera gliding forward over the surface. Explicitly
     forbid a splash with no body and a dive from off-screen. Mirror what
     `leg-07-m` already does.
2. **Render portrait 04 → 05 → 06 → 07**, strictly sequential, PixVerse V6,
   216 each. Leg 04 starts from `assets/handoff/leg-03-last-p.png` (unchanged)
   and its `endFrame` is the games-room portrait canvas; the new dining canvas
   is *not* leg 04's start frame — it is beat 04's **poster**. Everything after
   re-chains because each leg starts from the previous leg's real last frame.
3. **Render desktop 05 → 06 → 07**, same rule, 216 each.
4. **Encode**: `render/encode.sh`, `render/encode-mobile.sh`.
5. **Copy**: two lines in `web/world.config.js` no longer match the picture —
   beat 5's body says *"the stair going up"* (the stair is not the route any
   more) and beat 4 says *"Served at the pavilion … Open on three sides, a tin
   roof over it"* (false of a fully-indoor mobile leg; copy is shared across both
   chains, so it has to read true for landscape and portrait alike).
6. **Wire** `stillMobile: '../assets/scenes/portrait/04-dining-indoor.jpg'`.
7. Re-measure phone copy placement with `tools/measure-copy-zones.py` on the new
   portrait clips, `tools/check-css-invariants.sh`, `tools/test.sh`, the browser
   e2e, the 360→2560 sweep, screenshots, commit and push.

## Budget

| | credits |
|---|---|
| ceiling for this round (60% of 8,841, less what is already spent) | 2,415 |
| dining canvas — **spent** | 72 |
| portrait legs 04–07 | 864 |
| desktop legs 05–07 | 648 |
| re-roll budget (both 05s and desktop 07 are the hard ones) | ~648 |
| **remaining headroom** | **~183** |

Balance was **5,951** before the canvas. Read it before and after every leg and
log it in `COSTS.md`. Stop and check in rather than spending past the ceiling.

## Unrelated bug found in passing, not fixed

`assets/raw/exterior-mainhouse-verandah-01.jpg` is in `assets/manifest.json` and
**still shows the old SHERLOCK'S JUNGLE RETREAT arch sign**. The rebrand pass
removed three photographs with the old signage and missed this one. Check every
`category: "exterior"` and `"gate"` entry at full size before shipping.
