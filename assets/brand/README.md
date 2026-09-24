# Brand

**The logo.** `logo-112.png` and `logo-168.png` (2x and 3x of the 56px it is
shown at; phones show it at 44px). Both were cut from the round BENAKA mark the owner sent.
The cut follows the outer edge of the dark green ring, found by fitting a circle to it
(centre 624,614, radius 544 in the 1254px original, fit residual under 4px),
and everything outside it is transparent. It is scaled uniformly and never
stretched. `web/favicon-64.png` and `web/apple-touch-icon.png` (on the ivory,
because iOS paints no transparency) are cut the same way.

**The heroes.** `hero-reference.png` is the aerial the owner supplied as the
brand reference. It is not in `assets/raw/` or the manifest, so the gallery
never shows it. It is the source the heroes were generated from:

- `hero-tall.jpg`, 9:16, for phones. A separately generated frame, not a crop:
  a 16:9 frame cover-cropped into a 390x844 phone shows about a quarter of its
  width.
- `hero-wide-pool.jpg`, 16:9, for desktop. It shows the pool with one man sitting on the
  right-hand edge, feet in the water. It is a Nano Banana Pro edit of the
  earlier `hero-wide.jpg` (in history), colour-matched to the opening frame of
  `assets/video/hero-loop-wide.mp4`, so the loop fades in over it invisibly. It
  has a new filename rather than overwriting the old one because images are
  served with a year-long immutable cache.
