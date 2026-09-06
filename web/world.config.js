/* ============================================================================
   The walkthrough — seven beats, the road to the pool.
   ----------------------------------------------------------------------------
   Each section holds its rendered leg plus the still it was chained from. The
   still stays as the poster and as the reduced-motion fallback; scrub-engine.js
   scrubs the clip by scroll position.

   `clipMobile` / `stillMobile` are a SECOND, NATIVE 9:16 chain, not a resize of
   the landscape one, and the engine serves them on a coarse-pointer viewport.
   A 16:9 clip on a 390x844 phone is cropped by `object-fit: cover` to 25.8% of
   its width; a portrait leg shows 82%, which is roughly 2.7x the detail on the
   glass. Both must be set together — a portrait clip under a landscape poster
   flashes a crop of the wrong picture before the first frame paints.

   Architecture A (one continuous forward take) has no connectors; the legs are
   the journey. Hence `connectors: []` and a short crossfade — each leg starts
   from the previous leg's actual last frame, so the seams are frame-exact and
   the crossfade only has to cover the small drift where a leg lands on its
   target beat.

   PACING: these scroll values are the whole answer to "it takes too much wheel".
   Total is ~5.8 viewport-heights across seven beats, down from 11.3 across
   eight. Everything about pace lives here, so it stays trivial to retune.

   COPY RULE: plain English, short, and only about things visible in the
   photographs. No invented distances, prices or amenities. Nothing "nestled",
   nothing "unwinds". If a sentence could describe any hotel anywhere, it is
   wrong and gets rewritten.

   And each line names the JOURNEY its leg travels, not the place it starts
   from. Every leg runs beat N -> beat N+1: leg 02 is arch -> house, leg 05 is
   billiards -> the rooms. Copy that named only the start left the whole story
   reading half a beat behind the picture, which is exactly how it looked on a
   phone. Check a rewrite against the clip at t = 2, 4 and 6s, not against the
   still.
   ========================================================================== */

window.BENAKA_WORLD = {
  nav: false,
  atmosphere: false,
  diveScroll: 0.8,
  crossfade: 0.08,

  sections: [
    { id: 'approach', label: 'The road',
      still: '../assets/scenes/01-approach-road.jpg',
      stillMobile: '../assets/scenes/portrait/01-approach-road.jpg',
      clip: '../assets/clips/leg-01.mp4',
      clipMobile: '../assets/clips/leg-01-m.mp4',
      scroll: 0.9,
      // No copy here on purpose: the hero holds the name over this beat, and two
      // blocks of type on one screen is exactly the clutter we are avoiding.
      },

    { id: 'gate', label: 'The arch',
      still: '../assets/scenes/02-gate-arch.jpg',
      stillMobile: '../assets/scenes/portrait/02-gate-arch.jpg',
      clip: '../assets/clips/leg-02.mp4',
      clipMobile: '../assets/clips/leg-02-m.mp4',
      scroll: 0.7,
      eyebrow: 'The gate',
      title: 'In under the arch, up to the house.',
      body: 'A sign that has taken a few monsoons, a short wet drive, and the house waiting at the top of it.' },

    { id: 'courtyard', label: 'The house',
      still: '../assets/scenes/03-courtyard-house.jpg',
      stillMobile: '../assets/scenes/portrait/03-courtyard-house.jpg',
      clip: '../assets/clips/leg-03.mp4',
      clipMobile: '../assets/clips/leg-03-m.mp4',
      scroll: 0.8, linger: 0.25,
      eyebrow: 'The house',
      title: 'Along the verandah, out to the pavilion.',
      body: 'Two floors, a verandah the whole way along, and a brick yard that stays wet all monsoon.' },

    { id: 'table', label: 'The pavilion',
      still: '../assets/scenes/04-buffet-table.jpg',
      stillMobile: '../assets/scenes/portrait/04-buffet-table.jpg',
      clip: '../assets/clips/leg-04.mp4',
      clipMobile: '../assets/clips/leg-04-m.mp4',
      scroll: 0.7,
      eyebrow: 'Meals',
      title: 'Served at the pavilion, then in through the doors.',
      body: 'Open on three sides, a tin roof over it, the hill dripping behind. Past it the floor turns to tile.' },

    { id: 'billiards', label: 'The playroom',
      still: '../assets/scenes/05-billiards.jpg',
      stillMobile: '../assets/scenes/portrait/05-billiards.jpg',
      clip: '../assets/clips/leg-05.mp4',
      clipMobile: '../assets/clips/leg-05-m.mp4',
      scroll: 0.7,
      eyebrow: 'The playroom',
      title: 'Past the billiards table, through to the rooms.',
      body: 'Cane chairs, a tiled floor, the stair going up, and an afternoon going nowhere.' },

    { id: 'room', label: 'The rooms',
      still: '../assets/scenes/06-room.jpg',
      stillMobile: '../assets/scenes/portrait/06-room.jpg',
      clip: '../assets/clips/leg-06.mp4',
      clipMobile: '../assets/clips/leg-06-m.mp4',
      scroll: 0.9, linger: 0.35,
      eyebrow: 'The rooms',
      title: 'Out of the room and down to the water.',
      body: 'A carved headboard, a green almirah, a window on the trees — and the pool waiting below.' },

    { id: 'pool', label: 'The pool',
      still: '../assets/scenes/07-pool.jpg',
      stillMobile: '../assets/scenes/portrait/07-pool.jpg',
      clip: '../assets/clips/leg-07.mp4',
      clipMobile: '../assets/clips/leg-07-m.mp4',
      scroll: 1.1, linger: 0.4,
      eyebrow: 'The pool',
      title: 'The water is the point.',
      body: 'Long enough to swim properly, with the hill right behind you.' },
  ],

  connectors: [],
};
