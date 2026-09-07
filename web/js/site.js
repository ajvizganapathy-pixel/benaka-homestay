/* ============================================================================
   Site behaviour: mount the canvas, build the gallery, run the lightbox, drive
   the book control, and hand off from canvas to page.

   scrub-engine.js is untouched. Everything here sits around it and reads its
   geometry from the DOM it built.
   ========================================================================== */

(function () {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- 1. The walkthrough — six legs, laid out zigzag ------------------
     This used to mount scrub-engine.js and scrub one continuous camera move
     across the whole page. It was retired on the owner's instruction: the legs
     read better as separate pieces. world.config.js is unchanged as the source
     of truth — same sections, same paths, same copy — it is only rendered
     differently.

     Each leg is a block: the film on one side, the words on the other, sides
     swapping as you go down. The words sit BESIDE the picture rather than on
     it, which is what retired the scrim, the text-shadow and three rounds of
     luminance measurement in one go.

     A clip plays only while its own block is on screen and pauses when it
     leaves, so at most one or two ever decode at once — and none at all under
     prefers-reduced-motion, where the poster simply stands.                 */
  const coarse = matchMedia('(hover: none) and (pointer: coarse)').matches;
  const phone = coarse || innerWidth <= 860;

  function buildLegs() {
    const host = $('[data-legs]');
    const cfg = window.BENAKA_WORLD;
    if (!host || !cfg || !cfg.sections) return;

    const frag = document.createDocumentFragment();
    cfg.sections.forEach((sec, i) => {
      // The portrait chain is a separately rendered 9:16 set, not a resize —
      // picking the wrong one crops a 16:9 frame to a quarter of its width.
      const clip  = (phone && sec.clipMobile)  ? sec.clipMobile  : sec.clip;
      const still = (phone && sec.stillMobile) ? sec.stillMobile : sec.still;
      if (!clip && !still) return;

      const art = document.createElement('article');
      art.className = 'leg reveal' + (i % 2 ? ' leg--flip' : '');

      const figure = document.createElement('figure');
      figure.className = 'leg__figure';
      if (clip) {
        const v = document.createElement('video');
        v.muted = true; v.loop = true; v.playsInline = true;
        v.preload = 'none';                 // nothing fetches until it is near
        v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
        if (still) v.poster = still;
        v.dataset.src = clip;               // src is set on approach, not now
        figure.appendChild(v);
      } else {
        const img = document.createElement('img');
        img.src = still; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
        figure.appendChild(img);
      }

      const words = document.createElement('div');
      words.className = 'leg__words';
      words.innerHTML =
        (sec.eyebrow ? `<p class="micro">${esc(sec.eyebrow)}</p>` : '') +
        (sec.title   ? `<h2 class="leg__title">${esc(sec.title)}</h2>` : '') +
        (sec.body    ? `<p class="leg__body">${esc(sec.body)}</p>` : '');

      art.append(figure, words);
      frag.appendChild(art);
    });
    host.appendChild(frag);
    playOnView();
  }

  /* Load a leg's film as it comes near, play it while it is on screen, pause it
     when it leaves. Two observers rather than one: the outer margin decides
     when to spend bandwidth, the tight one decides when to spend a decoder. */
  function playOnView() {
    const vids = $$('.leg video');
    if (!vids.length) return;

    const near = new IntersectionObserver((es, o) => {
      es.forEach(e => {
        if (!e.isIntersecting) return;
        const v = e.target;
        if (v.dataset.src && !v.src) { v.src = v.dataset.src; v.load(); }
        o.unobserve(v);
      });
    }, { rootMargin: '150% 0px' });

    const onScreen = new IntersectionObserver(es => {
      es.forEach(e => {
        const v = e.target;
        if (e.isIntersecting && !reduced) { v.play().catch(() => {}); }
        else { try { v.pause(); } catch {} }
      });
    }, { threshold: 0.25 });

    vids.forEach(v => { near.observe(v); onScreen.observe(v); });
  }

  /* ---- 2. Gallery, built from the manifest ------------------------------ */
  // Tile shapes cycle so the mosaic never lines up into a plain grid. Wide and
  // tall cells fall on different beats of the cycle, which is what gives the
  // Windows-8 look without hand-placing anything.
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

    const groups = data.galleryGroups || [];
    host.innerHTML = '';
    // One block holding all three groups side by side, rather than stacked.
    const block = document.createElement('div');
    block.className = 'groups';
    host.appendChild(block);

    groups.forEach(g => {
      const imgs = data.images.filter(i => i.galleryGroup === g.id);
      if (!imgs.length) return;

      const sec = document.createElement('section');
      sec.className = 'group reveal';
      sec.innerHTML =
        `<div class="group__head">
           <h3>${esc(g.label)}</h3>
           <span class="micro count">${imgs.length} photographs</span>
           <span class="micro" style="flex-basis:100%;color:var(--s-ink-faint)">${esc(g.blurb || '')}</span>
         </div>
         <div class="tiles"></div>`;

      const grid = $('.tiles', sec);
      imgs.forEach((im, i) => grid.appendChild(makeTile(im, i, g, imgs, SHAPES[i % SHAPES.length])));

      block.appendChild(sec);
    });

    buildHeroMosaic(data);
    observeReveals();
    startLiveTiles(data);
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
    b.addEventListener('click', () => openLightbox(group, imgs, +b.dataset.index));
    return b;
  }

  /* ---- 2a. The hero mosaic ----------------------------------------------
     The strip under the hero photograph, built from the two groups the owner
     asked for — everything outside the house, and the pool and playroom. It
     holds ten cells but draws on all 24 photographs: the live rotation below
     turns them over, so every one appears within about a minute. Showing all
     24 at once would be a contact sheet, not a hero.

     Shapes are weighted heavier than the gallery's cycle because there are
     fewer cells here and the composition has to stay asymmetric at a glance. */
  const HERO_SHAPES = ['tile--b', 'tile--w', '', 'tile--t', '', 'tile--w',
                       'tile--t', '', 'tile--b', ''];

  function buildHeroMosaic(data) {
    const host = $('[data-hero-mosaic]');
    if (!host) return;
    const wanted = ['outside', 'play'];
    const groups = (data.galleryGroups || []).filter(g => wanted.includes(g.id));
    if (!groups.length) return;

    // Interleave the two groups so the mosaic never shows a block of one place.
    const pools = groups.map(g => ({ g, imgs: data.images.filter(i => i.galleryGroup === g.id) }));
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
  function startLiveTiles(data) {
    if (reduced) return;
    const roots = [$('[data-gallery]'), $('[data-hero-mosaic]')].filter(Boolean);
    if (!roots.length) return;

    const byGroup = {};
    (data.galleryGroups || []).forEach(g => {
      byGroup[g.id] = data.images.filter(i => i.galleryGroup === g.id);
    });

    const visible = new Set();

    const turn = () => {
      // Only turn cells in a mosaic that is actually on screen. Drawing from
      // both roots at once spent half the turns on gallery tiles nobody was
      // looking at, which made the hero appear to sit still.
      const live = visible.size ? [...visible] : roots;
      const tiles = live.flatMap(r => $$('.tile', r));
      if (!tiles.length) return;
      const tile = tiles[Math.floor(Math.random() * tiles.length)];
      const pool = byGroup[tile.dataset.group] || [];
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
     All that is left of what was a canvas-to-gallery handoff: with the legs
     laid out in normal flow there is no fixed stage to dissolve, so the
     --canvas-fade / past-canvas machinery went with it. */
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

  buildLegs();
  buildGallery().then(onScroll);
  onScroll();
})();
