/* ============================================================================
   #reviews: fetch the published guest reviews and lay them out as a slow
   sideways slider of bento cards, with month chips above it.

   THE SECTION STAYS HIDDEN unless review-api/public.php answers, within five
   seconds, with JSON that says ok and holds at least one review. So the API
   down, a 500, the off switch (503), or GitHub Pages (which serves the PHP
   file as plain text) all leave the page exactly as it was before reviews
   existed. Nothing here can block or break the rest of the page: it starts
   after load, in its own script, and every failure ends in "stay hidden".

   Every review is put on the page with textContent. Nothing a guest wrote is
   ever parsed as HTML.

   THE MOTION. The track drifts sideways at about 18px a second, turning at
   each end. It does not move at all under prefers-reduced-motion, with three
   reviews or fewer, or when everything already fits. It pauses while a mouse
   is over it, while anything inside has focus, for a few seconds after a
   touch or a hand scroll, while it is off screen and while the tab is hidden.
   The visitor can always swipe or scroll it by hand.
   ========================================================================== */
(function () {
  'use strict';

  const API = '../review-api/public.php';
  const SPEED = 18;              // px per second
  const REST = 2500;             // ms to rest at each end before turning
  const HOLD = 5000;             // ms to stay still after a touch or a hand scroll
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                  'August', 'September', 'October', 'November', 'December'];
  const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const section = document.querySelector('[data-reviews]');
  if (!section) return;
  const track = section.querySelector('[data-review-track]');
  const chips = section.querySelector('[data-review-months]');
  const navLi = document.querySelector('[data-reviews-nav]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Valid reviews only; anything malformed is dropped, not shown. */
  function clean(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(r => r && typeof r === 'object'
      && typeof r.name === 'string' && r.name.trim()
      && typeof r.body === 'string' && r.body.trim()
      && Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5
      && typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date)
      && typeof r.month === 'string' && /^\d{4}-\d{2}$/.test(r.month));
  }

  async function load() {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    try {
      const res = await fetch(API, { headers: { Accept: 'application/json' }, signal: ctl.signal, credentials: 'omit' });
      if (!res.ok) return [];
      if (!(res.headers.get('content-type') || '').includes('application/json')) return [];
      const json = await res.json();
      return json && json.ok === true ? clean(json.reviews) : [];
    } catch {
      return [];
    } finally { clearTimeout(t); }
  }

  const fmtDate = ymd => { const [y, m, d] = ymd.split('-').map(Number); return `${d} ${SHORT[m - 1]} ${y}`; };
  const fmtMonth = ym => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };

  function card(r) {
    const len = r.body.length;
    const fig = document.createElement('figure');
    fig.className = 'rcard' + (len > 420 ? ' rcard--tall' : len > 150 ? ' rcard--wide' : '');

    const stars = document.createElement('p');
    stars.className = 'rcard__stars';
    stars.textContent = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
    stars.setAttribute('role', 'img');
    stars.setAttribute('aria-label', `${r.rating} out of 5 stars`);

    const quote = document.createElement('blockquote');
    quote.className = 'rcard__body';
    r.body.split(/\n+/).filter(Boolean).forEach(line => {
      const p = document.createElement('p');
      p.textContent = line;
      quote.appendChild(p);
    });

    fig.append(stars, quote);

    // A very long review is cut to nine lines, with a way to read the rest.
    if (len > 600) {
      quote.classList.add('is-clamped');
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'rcard__more';
      more.textContent = 'Read all of it';
      more.setAttribute('aria-expanded', 'false');
      more.addEventListener('click', () => {
        const open = quote.classList.toggle('is-clamped') === false;
        more.setAttribute('aria-expanded', String(open));
        more.textContent = open ? 'Show less' : 'Read all of it';
      });
      fig.appendChild(more);
    }

    const by = document.createElement('figcaption');
    by.className = 'rcard__by';
    const name = document.createElement('cite');
    name.className = 'rcard__name';
    name.textContent = r.name;
    const date = document.createElement('span');
    date.className = 'micro rcard__date';
    date.textContent = fmtDate(r.date);
    by.append(name, date);
    fig.appendChild(by);
    return fig;
  }

  let all = [];
  function render(month) {
    const list = month ? all.filter(r => r.month === month) : all;
    track.replaceChildren(...list.map(card));
    track.classList.toggle('is-few', list.length <= 3);
    track.scrollLeft = 0;
    motion.reset(list.length);
    [...chips.children].forEach(c => c.setAttribute('aria-pressed', String((c.dataset.month || '') === (month || ''))));
  }

  function buildChips() {
    const months = [...new Set(all.map(r => r.month))].sort().reverse();
    const mk = (label, month) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'reviews__chip';
      b.textContent = label;
      if (month) b.dataset.month = month;
      b.addEventListener('click', () => render(month));
      return b;
    };
    chips.replaceChildren(mk('All', ''), ...months.map(m => mk(fmtMonth(m), m)));
  }

  /* ---- the drift ---------------------------------------------------------- */
  const motion = (() => {
    let enabled = false, raf = 0, last = 0, pos = 0, dir = 1, restUntil = 0, holdUntil = 0;
    let hover = false, focus = false, onScreen = false;

    const max = () => track.scrollWidth - track.clientWidth;
    const running = () => enabled && onScreen && !hover && !focus && !document.hidden;

    function frame(now) {
      raf = 0;
      if (!running()) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // A scroll we did not make is the visitor's hand: hold still a while.
      if (Math.abs(track.scrollLeft - Math.round(pos)) > 2) { pos = track.scrollLeft; holdUntil = now + HOLD; }
      if (now >= holdUntil && now >= restUntil) {
        pos += dir * SPEED * dt;
        const m = max();
        if (pos >= m) { pos = m; dir = -1; restUntil = now + REST; }
        if (pos <= 0) { pos = 0; dir = 1; restUntil = now + REST; }
        track.scrollLeft = Math.round(pos);
      }
      raf = requestAnimationFrame(frame);
    }
    function kick() {
      if (!raf && running()) { last = performance.now(); raf = requestAnimationFrame(frame); }
    }

    track.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { hover = true; } });
    track.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { hover = false; kick(); } });
    const touched = () => { holdUntil = performance.now() + HOLD; pos = track.scrollLeft; };
    track.addEventListener('touchstart', touched, { passive: true });
    track.addEventListener('touchend', () => { touched(); kick(); }, { passive: true });
    track.addEventListener('wheel', touched, { passive: true });
    section.addEventListener('focusin', () => { focus = true; });
    section.addEventListener('focusout', e => { if (!section.contains(e.relatedTarget)) { focus = false; kick(); } });
    document.addEventListener('visibilitychange', kick);
    new IntersectionObserver(es => es.forEach(e => { onScreen = e.isIntersecting; kick(); })).observe(track);

    return {
      reset(n) {
        pos = 0; dir = 1; restUntil = performance.now() + REST;
        enabled = !reduced && n > 3 && max() > 4;
        kick();
      },
      state: () => ({ enabled, hover, focus, onScreen, running: running(), pos }),
    };
  })();

  /* ---- arrows, for a mouse with no sideways scroll ---- */
  const nav = section.querySelector('[data-review-nav]');
  const step = d => {
    const first = track.querySelector('.rcard');
    const w = first ? first.getBoundingClientRect().width + 12 : 300;
    track.scrollBy({ left: d * w, behavior: reduced ? 'auto' : 'smooth' });
  };
  section.querySelector('[data-review-prev]').addEventListener('click', () => step(-1));
  section.querySelector('[data-review-next]').addEventListener('click', () => step(1));

  async function start() {
    all = await load();
    if (!all.length) return;                 // stays hidden: nothing to show, or no API here
    buildChips();
    section.hidden = false;
    if (navLi) navLi.hidden = false;
    render('');
    nav.hidden = all.length <= 3;
    // For the browser tests: how the drift sees things right now.
    section.reviewsMotion = motion.state;
  }

  if (document.readyState === 'complete') start();
  else addEventListener('load', start, { once: true });
})();
