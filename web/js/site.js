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
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- 1. Mount the walkthrough ---------------------------------------- */
  const world = $('#world');
  if (world && window.SHERLOCK_WORLD) mountScrollWorld(world, window.SHERLOCK_WORLD);

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
      imgs.forEach((im, i) => {
        const b = document.createElement('button');
        b.className = `tile ${SHAPES[i % SHAPES.length]}`;
        b.type = 'button';
        b.dataset.group = g.id;
        b.dataset.index = String(i);
        b.setAttribute('aria-label', `Open: ${im.description}`);
        b.innerHTML =
          `<figure style="margin:0;height:100%">
             <img src="../assets/raw/${encodeURIComponent(im.file)}" alt="${esc(im.description)}"
                  loading="lazy" decoding="async" width="${im.width}" height="${im.height}">
             <figcaption class="micro">${esc(shortLabel(im))}</figcaption>
           </figure>`;
        b.addEventListener('click', () => openLightbox(g, imgs, i));
        grid.appendChild(b);
      });

      host.appendChild(sec);
    });

    observeReveals();
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
    setTimeout(() => { lb.hidden = true; lbTrack.innerHTML = ''; }, 350);
    if (lbOpener) lbOpener.focus();
  }

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

  /* ---- 5. Hero fade and the canvas-to-gallery handoff ------------------- */
  // The engine sizes only its own .sw-track and never reads document height, so
  // reading that track's height back is a safe way to know where the canvas ends.
  const hero = $('[data-hero]');
  let ticking = false;

  function onScroll() {
    const y     = window.scrollY;
    const vh    = window.innerHeight;
    const track = $('.sw-track');
    const canvasEnd = track ? track.offsetHeight : vh;

    // The name holds on landing, then dissolves across the first screen.
    const t = clamp(y / (vh * 0.85));
    if (hero) {
      hero.style.opacity = String(1 - t);
      hero.style.transform = `translateY(${-t * 26}px)`;
    }
    // The copy scrim comes up as the hero goes down: beat 1 has no copy to
    // serve, so it stays off there and the opening photograph reads clean.
    document.documentElement.style.setProperty('--scrim-on', t.toFixed(3));

    // The engine appends 1vh of track past the final beat so a clip can finish.
    // With stills that tail is empty, so it becomes the dissolve: the stage
    // fades out across it exactly as the gallery arrives.
    const fadeStart = canvasEnd - vh * 1.15;
    const fade = clamp((y - fadeStart) / (vh * 0.9));
    document.documentElement.style.setProperty('--canvas-fade', (1 - fade).toFixed(3));
    document.body.classList.toggle('past-canvas', fade > 0.98);

    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  window.addEventListener('resize', onScroll);

  buildGallery().then(onScroll);
  onScroll();
})();
