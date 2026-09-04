/* ============================================================================
   Benaka Homestay — scroll-world configuration
   ----------------------------------------------------------------------------
   PROCEDURAL PASS ONLY. This file deliberately carries NO design and NO copy:
   no eyebrow, title, body, tags or cta on any section, chrome switched off,
   neutral grey theme. The deliverable of this pass is the camera mechanism and
   its scroll pacing, nothing else.

   Each section has a `still` (the 16:9 start canvas) and NO `clip`. The engine
   handles that: scrub-engine.js:201 skips clip loading when `clip` is absent,
   so the section holds its still and still occupies its band in the scroll
   chain. Once the Higgsfield legs render (see ../render/run-chain.md), add
   `clip:` to each section and everything below stays as it is.

   Architecture A (continuous forward walkthrough) has NO connectors — the legs
   are the journey — hence `connectors: []` and a small crossfade.

   PACING: `scroll` is viewport-heights of scroll spent in a scene; `linger`
   (0..1, keep <= 0.6) settles the camera mid-scene. Transit beats are brisk,
   the room and the finale hold longer.
   ========================================================================== */

window.BENAKA_WORLD = {
  // --- chrome off: this pass ships mechanism, not design -------------------
  // `brand` is deliberately unset: setting it makes the engine render a brand
  // link in the topbar. index.html additionally hides the chrome the engine
  // builds unconditionally.
  nav: false,
  atmosphere: false,
  hint: '',

  diveScroll: 1.3,
  crossfade: 0.08,

  sections: [
    { id: 'approach',  label: 'Approach',
      still: '../assets/scenes/01-approach-road.jpg',
      scroll: 1.2 },

    { id: 'gate',      label: 'Gate',
      still: '../assets/scenes/02-gate-arch.jpg',
      scroll: 1.1 },

    { id: 'courtyard', label: 'Courtyard',
      still: '../assets/scenes/03-courtyard-house.jpg',
      scroll: 1.4, linger: 0.3 },

    { id: 'games',     label: 'Verandah',
      still: '../assets/scenes/04-verandah-games.jpg',
      scroll: 1.1 },

    { id: 'room',      label: 'Room',
      still: '../assets/scenes/05-room-heritage.jpg',
      scroll: 1.7, linger: 0.45 },

    { id: 'bath',      label: 'Bath',
      still: '../assets/scenes/06-bath-ensuite.jpg',
      scroll: 1.0 },

    { id: 'pool',      label: 'Pool',
      still: '../assets/scenes/07-pool-hills.jpg',
      scroll: 1.9, linger: 0.5 },
  ],

  connectors: [],
};
