/* ============================================================================
   /review/#t=<token>: the guest's form.

   The token is read from the fragment, which a browser never sends to a
   server, and is posted in the request body. Everything the page shows about
   the guest (their name) comes back from the server; nothing the guest could
   edit decides who the review is from.

   Every string from the server is set with textContent.
   ========================================================================== */
(function () {
  'use strict';

  const API = '../review-api/invite.php';
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const token = (new URLSearchParams(location.hash.slice(1))).get('t') || '';
  let limits = { min: 20, max: 1500 };
  let first = '';

  function show(name) {
    $$('[data-view]').forEach(v => { v.hidden = v.dataset.view !== name; });
    const h = $(`[data-view="${name}"] h1`);
    if (h && name !== 'form') { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }

  async function post(body) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 15000);
    try {
      const res = await fetch(API, {
        method: 'POST', credentials: 'omit', signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      return { status: res.status, ...(json && typeof json === 'object' ? json : { ok: false, error: 'network' }) };
    } catch {
      return { status: 0, ok: false, error: 'network' };
    } finally { clearTimeout(t); }
  }

  function route(r) {
    if (r.error === 'dead') return show('dead');
    if (r.error === 'paused') return show('paused');
    if (r.error === 'slow_down' || !r.ok) return show('unavailable');
    first = String(r.name || '').split(/\s+/)[0];
    $$('[data-first]').forEach(n => { n.textContent = first; });
    if (r.limits) limits = r.limits;
    if (r.needs_check) {
      $('[data-code]').textContent = r.check_code;
      const text = `BENAKA review ${r.check_code}`;
      $('[data-wa-confirm]').href = `https://wa.me/${String(r.owner_wa).replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
      return show('check');
    }
    $('[data-name]').textContent = r.name;
    count();
    show('form');
  }

  async function check() {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return show('dead');
    route(await post({ action: 'check', token }));
  }

  /* ---- stars: a radio group, painted up to the chosen one ---- */
  const radios = $$('input[name="rating"]');
  const paint = upTo => radios.forEach((r, i) => r.nextElementSibling.classList.toggle('is-on', i < upTo));
  const chosen = () => { const r = radios.find(x => x.checked); return r ? +r.value : 0; };
  radios.forEach((r, i) => {
    r.addEventListener('change', () => paint(chosen()));
    const lab = r.nextElementSibling;
    lab.addEventListener('mouseenter', () => paint(i + 1));
    lab.addEventListener('mouseleave', () => paint(chosen()));
  });

  /* ---- the counter ---- */
  const body = $('textarea[name="body"]');
  const len = () => [...body.value.trim()].length;
  function count() {
    const n = len();
    const c = $('[data-count]');
    c.textContent = n < limits.min
      ? `${n} / ${limits.max.toLocaleString('en-IN')} · at least ${limits.min}`
      : `${n} / ${limits.max.toLocaleString('en-IN')}`;
    c.classList.toggle('is-bad', n > 0 && n < limits.min || n > limits.max);
  }
  body.addEventListener('input', count);

  /* ---- send ---- */
  const form = $('[data-review-form]');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('[data-form-msg]');
    const rating = chosen();
    const n = len();
    if (!rating) { msg.textContent = 'Choose a rating from 1 to 5 stars.'; radios[0].focus(); return; }
    if (n < limits.min) { msg.textContent = `Write at least ${limits.min} characters.`; body.focus(); return; }
    if (n > limits.max) { msg.textContent = `Keep it under ${limits.max.toLocaleString('en-IN')} characters.`; body.focus(); return; }
    const send = $('[data-send]');
    send.disabled = true;
    msg.textContent = 'Sending…';
    const r = await post({ action: 'submit', token, rating, body: body.value, website: form.website.value });
    send.disabled = false;
    if (r.ok) {
      $('[data-thanks-line]').textContent =
        'Your review has reached the owners. It will appear on the site with your name once they have read it.';
      return show('thanks');
    }
    if (r.error === 'dead') return show('dead');
    if (r.error === 'needs_check') return check();
    if (r.error === 'invalid') { msg.textContent = 'Please check your rating and review, then send again.'; return; }
    if (r.error === 'paused') return show('paused');
    msg.textContent = 'It did not send. Your link is still open, so please try again.';
  });

  $('[data-recheck]').addEventListener('click', async () => {
    const m = $('[data-check-msg]');
    m.textContent = 'Checking…';
    const r = await post({ action: 'check', token });
    if (r.ok && r.needs_check) { m.textContent = 'Not confirmed yet. We open the form once we have seen your message.'; return; }
    m.textContent = '';
    route(r);
  });
  $('[data-retry]').addEventListener('click', check);

  check();
})();
