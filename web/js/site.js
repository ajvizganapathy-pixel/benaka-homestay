/* ============================================================================
   Site behaviour: play the property film, build the gallery and the hero
   mosaic, turn the live tiles over, run the lightbox and drive the book
   control.
   ========================================================================== */

(function () {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- 1. The walkthrough — one film of the real property ---------------
     What used to be here was the scroll world: first a scroll-scrubbed camera
     driven by scrub-engine.js, then six rendered legs laid out zigzag. Both
     were rejected — the client read the rendered footage as an AI film rather
     than a place. It is replaced by video shot on the property, so both the
     engine and world.config.js are gone from the repo (history keeps them).

     Two observers, the same split the live tiles use below: the loose one
     decides when to spend 8.8MB of bandwidth by setting src, the tight one
     decides when to spend a decoder. Nothing is fetched on load, and a visitor
     who never reaches this section never pays for it.

     The film has a real soundtrack, so it starts muted — the only way a browser
     will autoplay it — with a button to turn the sound on. Unmuting inside a
     click is a user gesture, which is what makes it allowed.                */
  function mountTour() {
    const v = $('[data-tour]');
    if (!v) return;
    const SRC = '../assets/video/benaka-tour.mp4';

    new IntersectionObserver((es, o) => {
      es.forEach(e => {
        if (!e.isIntersecting) return;
        if (!v.src) { v.src = SRC; v.load(); }
        o.disconnect();
      });
    }, { rootMargin: '150% 0px' }).observe(v);

    new IntersectionObserver(es => {
      es.forEach(e => {
        if (e.isIntersecting && !reduced) v.play().catch(() => {});
        else { try { v.pause(); } catch {} }
      });
    }, { threshold: 0.25 }).observe(v);

    const btn = $('[data-tour-sound]');
    if (!btn) return;
    btn.addEventListener('click', () => {
      v.muted = !v.muted;
      btn.setAttribute('aria-pressed', String(!v.muted));
      btn.textContent = v.muted ? 'Sound on' : 'Sound off';
      // Turning the sound on is also an intent to watch it.
      if (!v.muted) v.play().catch(() => {});
    });
  }

  /* ---- 1b. The phone hero's living loop ---------------------------------
     A 3.5s silent clip of the pool — three swimmers, the palm moving, a flock
     crossing the sky — laid over the still hero on phones only.

     It is deliberately the LAST thing the page does. The still is the LCP
     element; giving the video a src before load would put 860KB in front of
     the one paint that decides how fast the site feels. So: wait for window
     load, then fetch, then fade in over an opening frame that is the same
     photograph, which is why the swap is invisible rather than a cut.

     Four reasons it never runs, and none of them is a failure:
       - not a phone. The <picture> serves the 9:16 still below 700px and the
         16:9 one above; the loop follows the same line, and the CSS hides it
         above 700px as well in case this ever gets called anyway.
       - prefers-reduced-motion. A moving hero is exactly what that asks about.
       - Save-Data, or a 2g connection. Nobody metering their data wants an
         autoplaying hero, and on 2g it would arrive long after they had gone.
       - autoplay refused. Muted inline autoplay is allowed everywhere that
         matters, but if a browser says no the still simply stays, which is a
         perfectly good hero.                                                 */
  function mountHeroLoop() {
    const v = $('[data-hero-loop]');
    if (!v) return;
    if (reduced) return;
    if (!matchMedia('(max-width: 700px)').matches) return;

    const c = navigator.connection;
    if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) return;

    const start = () => {
      v.src = '../assets/video/hero-loop.mp4';
      // readyState as well as the event: a `once` listener that attaches after
      // canplay has already passed never fires, and the video would then sit at
      // opacity 0 for ever. Failing that way is safe — the still stays — but it
      // fails silently, which is the worst kind.
      const live = () => v.classList.add('is-live');
      if (v.readyState >= 3) live();
      else v.addEventListener('canplay', live, { once: true });
      v.play().catch(() => {});          // refused: the still stays, no harm

      // Do not hold a decoder open for a hero nobody is looking at.
      new IntersectionObserver(es => es.forEach(e => {
        if (e.isIntersecting) v.play().catch(() => {}); else { try { v.pause(); } catch {} }
      }), { threshold: 0.1 }).observe(v);
    };

    if (document.readyState === 'complete') start();
    else addEventListener('load', start, { once: true });
  }

  /* ---- 2. Gallery — three stacks of photographs -------------------------
     This used to render all 38 photographs at once as three columns of ~90px
     tiles. It read as an archive rather than as a collection anyone chose, so
     each group is now a small stack of prints laid over each other, with one
     way in. Nothing is hidden by that: clicking a stack opens the group's
     COMPLETE set in the lightbox, which already took a whole group and needed
     no change at all.

     Which five photographs are on top is data, not code — `stack` on each
     galleryGroup in the manifest, so the choice can be re-ordered without
     touching this file. tools/test.sh fails the build if one of those names is
     not in its group or not on disk, because a bad name here would show up only
     as a card that silently 404s.                                            */

  // Tile shapes cycle so the mosaic never lines up into a plain grid. Wide and
  // tall cells fall on different beats of the cycle, which is what gives the
  // Windows-8 look without hand-placing anything. USED BY THE HERO MOSAIC ONLY
  // now — the gallery below stopped being a tile grid.
  const SHAPES = ['tile--b', '', 'tile--w', '', '', 'tile--t', 'tile--w', '', ''];

  async function buildGallery() {
    const host = $('[data-gallery]');
    if (!host) return;
    let data;
    try {
      const res = await fetch('../assets/manifest.json');
      data = await res.json();
    } catch {
      host.innerHTML = '<p class="micro">Photographs could not be loaded.</p>';
      return;
    }

    host.innerHTML = '';
    (data.galleryGroups || []).forEach(g => {
      const imgs = data.images.filter(i => i.galleryGroup === g.id);
      if (!imgs.length) return;

      // Fall back to the head of the group if `stack` is missing, so a manifest
      // written before this existed still renders something sensible.
      const byFile = new Map(imgs.map(i => [i.file, i]));
      const cards = (g.stack || []).map(f => byFile.get(f)).filter(Boolean);
      if (!cards.length) cards.push(...imgs.slice(0, 5));

      const row = document.createElement('article');
      row.className = 'stack-row reveal';

      // The cards are decorative duplicates of what the button opens, so they
      // are hidden from assistive technology rather than announced a second
      // time. Alt text is empty for the same reason.
      const fig = document.createElement('figure');
      fig.className = 'stack';
      fig.setAttribute('aria-hidden', 'true');
      fig.innerHTML = cards.map(im =>
        `<span class="stack__card">
           <img src="../assets/raw/${encodeURIComponent(im.file)}" alt=""
                loading="lazy" decoding="async" width="${im.width}" height="${im.height}">
         </span>`).join('');

      const words = document.createElement('div');
      words.className = 'stack__words';
      const n = imgs.length;
      words.innerHTML =
        `<p class="micro stack__eyebrow">Gallery</p>
         <h3 class="stack__h">${esc(g.label)}</h3>
         <p class="stack__blurb">${esc(g.blurb || '')}</p>
         <button class="stack__cta" type="button">
           View all ${n} photograph${n === 1 ? '' : 's'} <i aria-hidden="true">&rarr;</i>
         </button>`;

      // ONE control in the tab order. The figure forwards its click to the same
      // handler so the stack is clickable by mouse and touch, without giving a
      // keyboard or a screen reader two stops that do the identical thing.
      const open = () => openLightbox(g, imgs, 0);
      $('.stack__cta', words).addEventListener('click', open);
      fig.addEventListener('click', open);

      row.append(fig, words);
      host.appendChild(row);
    });

    buildHeroMosaic(data);
    observeReveals();
    startLiveTiles();
  }

  /* One tile, used by both the gallery and the hero mosaic, so the two cannot
     drift: same markup, same data-group/data-index contract the live rotation
     reads, same click into the same carousel. */
  function makeTile(im, i, group, imgs, shape) {
    const b = document.createElement('button');
    b.className = `tile ${shape || ''}`.trim();
    b.type = 'button';
    b.dataset.group = group.id;
    b.dataset.index = String(i);
    b.setAttribute('aria-label', `Open: ${im.description}`);
    b.innerHTML =
      `<figure style="margin:0;height:100%">
         <img src="../assets/raw/${encodeURIComponent(im.file)}" alt="${esc(im.description)}"
              loading="lazy" decoding="async" width="${im.width}" height="${im.height}">
         <figcaption class="micro">${esc(shortLabel(im))}</figcaption>
       </figure>`;
    // Read the index off the element, not the closure: a live tile may have
    // turned over since it was built, and the click must open what is on it.
    // `imgs` is whichever array this tile was built from — the whole group in
    // the gallery, the filtered pool in the hero mosaic — and the rotation
    // above stays inside it, so index and array never disagree.
    b.addEventListener('click', () => openLightbox(group, imgs, +b.dataset.index));
    return b;
  }

  /* ---- 2a. The hero mosaic ----------------------------------------------
     The band under the story, built from the two groups the owner asked for —
     everything around the property, and the pool and playroom. It holds ten
     cells but draws on the whole pool of photographs: the live rotation below
     turns them over, so every one appears within about a minute. Showing them
     all at once would be a contact sheet, not a band.

     THE INDOOR BILLIARDS PHOTOGRAPHS ARE EXCLUDED HERE, and only here. This is
     the band that says "around the property", so a dark interior in it reads as
     a mistake; the gallery below still shows them under "Pool and playroom".

     That exclusion has to hold in TWO places, which is why HERO_POOLS exists.
     Filtering only the opening cells would leave the live rotation free to turn
     a cell into a billiards frame a minute later, and the fault would only ever
     show up in a screenshot taken at the wrong moment.

     Shapes are weighted heavier than the gallery's cycle because there are
     fewer cells here and the composition has to stay asymmetric at a glance. */
  const HERO_EXCLUDE = ['games'];

  /* group id -> the exact array the mosaic's tiles index into. A tile's
     data-index is an offset into this array, so the rotation and the lightbox
     must both read it from here or they will open the wrong photograph. */
  const HERO_POOLS = Object.create(null);
  const HERO_SHAPES = ['tile--b', 'tile--w', '', 'tile--t', '', 'tile--w',
                       'tile--t', '', 'tile--b', ''];

  function buildHeroMosaic(data) {
    const host = $('[data-hero-mosaic]');
    if (!host) return;
    const wanted = ['outside', 'play'];
    const groups = (data.galleryGroups || []).filter(g => wanted.includes(g.id));
    if (!groups.length) return;

    // Interleave the two groups so the mosaic never shows a block of one place.
    const pools = groups.map(g => {
      const imgs = data.images.filter(i => i.galleryGroup === g.id
                                        && !HERO_EXCLUDE.includes(i.category));
      HERO_POOLS[g.id] = imgs;
      return { g, imgs };
    });
    const picks = [];
    for (let i = 0; picks.length < HERO_SHAPES.length; i++) {
      const p = pools[i % pools.length];
      const idx = Math.floor(i / pools.length);
      if (idx >= p.imgs.length) { if (pools.every((q, k) => Math.floor(i / pools.length) >= q.imgs.length)) break; continue; }
      picks.push({ ...p, im: p.imgs[idx], idx });
    }
    host.innerHTML = '';
    picks.forEach((pick, n) =>
      host.appendChild(makeTile(pick.im, pick.idx, pick.g, pick.imgs, HERO_SHAPES[n % HERO_SHAPES.length])));
  }

  /* ---- 2b. Live tiles ---------------------------------------------------
     The wall turns over: every couple of seconds one tile flips to another
     photograph from its own group and keeps it. Over a minute the whole grid
     reshuffles, which is what makes it a live tile wall rather than a
     contact sheet — and every photograph is still one click from the carousel.

     It only runs while the gallery is actually on screen, and not at all under
     prefers-reduced-motion. Whatever a tile is currently showing is what its
     click opens, so the two never disagree.                                */
  let liveTimer = null;
  function startLiveTiles() {
    if (reduced) return;
    // The hero mosaic only. The gallery used to be tiles and turned over here
    // too; it is three curated stacks now, and cards reshuffling under the
    // visitor would fight the one thing those stacks are for — looking chosen.
    const roots = [$('[data-hero-mosaic]')].filter(Boolean);
    if (!roots.length) return;

    const visible = new Set();

    const turn = () => {
      // Only turn cells in a mosaic that is actually on screen.
      const live = visible.size ? [...visible] : roots;
      const tiles = live.flatMap(r => $$('.tile', r));
      if (!tiles.length) return;
      const tile = tiles[Math.floor(Math.random() * tiles.length)];
      // HERO_POOLS, not the whole group: a mosaic tile's data-index is an offset
      // into the FILTERED array it was built from, so turning it over anywhere
      // else would both show an excluded photograph and open a different one on
      // click. buildHeroMosaic fills this map, and runs before this does.
      const pool = HERO_POOLS[tile.dataset.group] || [];
      if (pool.length < 2) return;

      const showing = +tile.dataset.index;
      let next = showing;
      while (next === showing) next = Math.floor(Math.random() * pool.length);
      const im = pool[next];
      const img = tile.querySelector('img');
      if (!img) return;

      // Decode before showing it, so the tile never flashes empty mid-turn.
      const incoming = new Image();
      incoming.src = `../assets/raw/${encodeURIComponent(im.file)}`;
      incoming.decode().catch(() => {}).then(() => {
        img.classList.add('turning');
        tile.classList.add('lit');
        setTimeout(() => {
          img.src = incoming.src;
          img.alt = im.description;
          tile.dataset.index = String(next);
          tile.setAttribute('aria-label', `Open: ${im.description}`);
          const cap = tile.querySelector('figcaption');
          if (cap) cap.textContent = shortLabel(im);
          img.classList.remove('turning');
          setTimeout(() => tile.classList.remove('lit'), 900);
        }, 620);
      });
    };

    // Run only while one of the two mosaics is actually on screen. With two
    // roots the observer reports each one separately, so track which are
    // visible rather than reading a single entry list — otherwise scrolling the
    // hero out of view would stop the rotation while the gallery is still up.
    const io2 = new IntersectionObserver(entries => {
      entries.forEach(e => e.isIntersecting ? visible.add(e.target) : visible.delete(e.target));
      clearInterval(liveTimer);
      if (visible.size) liveTimer = setInterval(turn, 2200);
    }, { rootMargin: '0px 0px -10% 0px' });
    roots.forEach(r => io2.observe(r));
  }

  const shortLabel = im => im.description.split(',')[0];
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---- 3. Lightbox carousel --------------------------------------------- */
  const lb       = $('[data-lightbox]');
  const lbTrack  = $('[data-lb-track]');
  const lbCount  = $('[data-lb-count]');
  const lbCap    = $('[data-lb-caption]');
  const lbGroup  = $('[data-lb-group]');
  let lbImages = [], lbIndex = 0, lbOpener = null;

  function openLightbox(group, imgs, index) {
    lbImages = imgs; lbIndex = index; lbOpener = document.activeElement;
    lbGroup.textContent = group.label;

    lbTrack.innerHTML = imgs.map(im =>
      `<div class="lb__slide">
         <img src="../assets/raw/${encodeURIComponent(im.file)}" alt="${esc(im.description)}"
              loading="lazy" decoding="async">
       </div>`).join('');

    lb.hidden = false;
    lbOutside().forEach(n => n.inert = true);
    requestAnimationFrame(() => {
      lb.classList.add('open');
      document.body.classList.add('lb-open');
      goTo(index, false);
      lbTrack.focus();
    });
  }

  function closeLightbox() {
    lb.classList.remove('open');
    document.body.classList.remove('lb-open');
    lbOutside().forEach(n => n.inert = false);
    setTimeout(() => { lb.hidden = true; lbTrack.innerHTML = ''; }, 350);
    if (lbOpener) lbOpener.focus();
  }

  // The lightbox is a modal and has to behave like one: the page behind it goes
  // inert, and Tab cycles inside it instead of walking out into the gallery
  // tiles underneath. (The booking panel already did both; this did not.)
  const lbOutside = () => [...document.body.children].filter(n => n !== lb);

  lb.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || lb.hidden) return;
    const f = [...lb.querySelectorAll('button,[tabindex]:not([tabindex="-1"]),a[href]')]
      .filter(n => n.offsetParent !== null && !n.disabled);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  function goTo(i, smooth = true) {
    lbIndex = (i + lbImages.length) % lbImages.length;
    const slide = lbTrack.children[lbIndex];
    if (slide) lbTrack.scrollTo({ left: slide.offsetLeft - lbTrack.offsetLeft, behavior: smooth && !reduced ? 'smooth' : 'auto' });
    lbCount.textContent = `${lbIndex + 1} / ${lbImages.length}`;
    lbCap.textContent = lbImages[lbIndex] ? lbImages[lbIndex].description : '';
  }

  $('[data-lb-close]').addEventListener('click', closeLightbox);
  $('[data-lb-prev]').addEventListener('click', () => goTo(lbIndex - 1));
  $('[data-lb-next]').addEventListener('click', () => goTo(lbIndex + 1));
  lb.addEventListener('click', e => { if (e.target === lb) closeLightbox(); });

  document.addEventListener('keydown', e => {
    if (lb.hidden) return;
    if (e.key === 'Escape')     closeLightbox();
    if (e.key === 'ArrowRight') goTo(lbIndex + 1);
    if (e.key === 'ArrowLeft')  goTo(lbIndex - 1);
  });

  // Keep the counter honest when the reader swipes the track directly.
  let scrollTick;
  lbTrack.addEventListener('scroll', () => {
    clearTimeout(scrollTick);
    scrollTick = setTimeout(() => {
      const i = Math.round(lbTrack.scrollLeft / lbTrack.clientWidth);
      if (i !== lbIndex && lbImages[i]) {
        lbIndex = i;
        lbCount.textContent = `${i + 1} / ${lbImages.length}`;
        lbCap.textContent = lbImages[i].description;
      }
    }, 90);
  }, { passive: true });

  /* ---- 4. Reveals -------------------------------------------------------- */
  let io;
  function observeReveals() {
    if (reduced) { $$('.reveal').forEach(n => n.classList.add('in')); return; }
    io = io || new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px' });
    $$('.reveal:not(.in)').forEach(n => io.observe(n));
  }

  /* ---- 5. The book control ----------------------------------------------
     All that is left of what was a canvas-to-gallery handoff: the page is
     ordinary flow now, so there is no fixed stage to dissolve. */
  let ticking = false;

  function onScroll() {
    // The book control only appears once the hero is behind you, so the first
    // screen carries nothing but the property.
    document.body.classList.toggle('book-on', window.scrollY > window.innerHeight * 0.75);
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  window.addEventListener('resize', onScroll);

  mountTour();
  mountHeroLoop();
  buildGallery().then(onScroll);
  onScroll();
})();
