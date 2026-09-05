/* ============================================================================
   The walkthrough — eight beats, gate to pool.
   ----------------------------------------------------------------------------
   Each section holds a `still` and no `clip` yet: scrub-engine.js:201 skips clip
   loading when `clip` is absent, so the still holds its scroll band. When the
   Higgsfield legs render, add `clip: '../assets/clips/leg-0N.mp4'` to each
   section and change nothing else — pacing, copy and connectors all carry over.

   Architecture A (one continuous forward take) has no connectors; the legs are
   the journey. Hence `connectors: []` and a short crossfade.

   PACING: these scroll values are the whole answer to "it takes too much wheel".
   Total is ~5.8 viewport-heights across seven beats, down from 11.3 across
   eight. Everything about pace lives here, so it stays trivial to retune.

   COPY RULE: plain English, short, and only about things visible in the
   photographs. No invented distances, prices or amenities. Nothing "nestled",
   nothing "unwinds". If a sentence could describe any hotel anywhere, it is
   wrong and gets rewritten.
   ========================================================================== */

window.SHERLOCK_WORLD = {
  nav: false,
  atmosphere: false,
  diveScroll: 0.8,
  crossfade: 0.08,

  sections: [
    { id: 'approach', label: 'The road',
      still: '../assets/scenes/01-approach-road.jpg',
      scroll: 0.9,
      // No copy here on purpose: the hero holds the name over this beat, and two
      // blocks of type on one screen is exactly the clutter we are avoiding.
      },

    { id: 'gate', label: 'The arch',
      still: '../assets/scenes/02-gate-arch.jpg',
      scroll: 0.7,
      eyebrow: 'The gate',
      title: 'You will know it by the arch.',
      body: 'Red gates, a sign that has taken a few monsoons, and a drive that curves up to the house.' },

    { id: 'courtyard', label: 'The house',
      still: '../assets/scenes/03-courtyard-house.jpg',
      scroll: 0.8, linger: 0.25,
      eyebrow: 'The house',
      title: 'Two floors and one long verandah.',
      body: 'Everyone ends up here. On the steps, in a chair, watching it rain on the brick.' },

    { id: 'table', label: 'The table',
      still: '../assets/scenes/04-buffet-table.jpg',
      scroll: 0.7,
      eyebrow: 'Meals',
      title: 'Food comes out at the pavilion.',
      body: 'Served hot, eaten under a tin roof, with the hill sitting there and dripping.' },

    { id: 'billiards', label: 'The table',
      still: '../assets/scenes/05-billiards.jpg',
      scroll: 0.7,
      eyebrow: 'The playroom',
      title: 'There is a billiards table under the stairs.',
      body: 'Cane chairs, the doors open to the yard, and an afternoon going nowhere.' },

    { id: 'room', label: 'The rooms',
      still: '../assets/scenes/06-room.jpg',
      scroll: 0.9, linger: 0.35,
      eyebrow: 'The rooms',
      title: 'Old wood and thick walls.',
      body: 'A carved headboard, a green almirah, and a window that opens onto the trees.' },

    { id: 'pool', label: 'The pool',
      still: '../assets/scenes/07-pool.jpg',
      scroll: 1.1, linger: 0.4,
      eyebrow: 'The pool',
      title: 'The water is the point.',
      body: 'Long enough to swim properly, with the hill right behind you.' },
  ],

  connectors: [],
};
