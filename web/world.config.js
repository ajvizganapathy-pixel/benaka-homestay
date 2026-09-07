/* ============================================================================
   The walkthrough — six legs, the road to the pool.
   ----------------------------------------------------------------------------
   Each section is one short film plus the still it was chained from. The still
   is the poster; site.js lays the sections out as separate zigzag blocks and
   plays each clip while its block is on screen.

   This file used to configure scrub-engine.js, which scrubbed all seven beats as
   ONE continuous camera move. That was retired on the owner's instruction — the
   legs read better as separate pieces than as one unbroken take — but the file
   stays the source of truth for the walkthrough, and tools/test.sh still walks
   every path in it.

   `clipMobile` / `stillMobile` are a SECOND, NATIVE 9:16 chain, not a resize of
   the landscape one. A 16:9 clip on a 390x844 phone is cropped by
   `object-fit: cover` to 25.8% of its width; a portrait leg shows 82%. Both must
   be set together, or the poster flashes a crop of the wrong picture.

   THE BUFFET-TO-BILLIARDS LEG IS GONE, also on instruction: the old beat 4,
   "Down the length of the table, on to the games room". Its files are still in
   assets/clips/ (leg-04.mp4, leg-04-m.mp4) — nothing was deleted, the page just
   no longer shows them.

   COPY RULE: plain English, short, and only about things visible in the
   photographs. No invented distances, prices or amenities. And each line names
   the JOURNEY its leg travels, not the place it starts from.
   ========================================================================== */

window.BENAKA_WORLD = {
  nav: false,
  atmosphere: false,
  diveScroll: 0.8,
  crossfade: 0.08,

  sections: [
    { id: 'approach', label: 'The way in',
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
      body: 'The name over the gate, a short wet drive, and the house waiting at the top of it.' },

    { id: 'courtyard', label: 'The house',
      still: '../assets/scenes/03-courtyard-house.jpg',
      stillMobile: '../assets/scenes/portrait/03-courtyard-house.jpg',
      clip: '../assets/clips/leg-03.mp4',
      clipMobile: '../assets/clips/leg-03-m.mp4',
      scroll: 0.8, linger: 0.25,
      eyebrow: 'The house',
      title: 'Along the verandah, across to the table.',
      body: 'Two floors, a verandah the whole way along, a brick yard that stays wet.' },

    { id: 'billiards', label: 'The playroom',
      still: '../assets/scenes/05-billiards.jpg',
      stillMobile: '../assets/scenes/portrait/05-billiards.jpg',
      clip: '../assets/clips/leg-05.mp4',
      clipMobile: '../assets/clips/leg-05-m.mp4',
      scroll: 0.7,
      eyebrow: 'The playroom',
      title: 'Past the billiards table, through to the rooms.',
      body: 'Cane chairs, a tiled floor, and the verandah out to the rooms.' },

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
