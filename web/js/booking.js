/* ============================================================================
   Booking: fill it in, press Send, done. One step and a confirmation.

   There is no verification code, no email and no password. The owner asked for
   the shortest path between a visitor deciding to come and a message landing on
   their phone, so the request goes straight to WhatsApp and the owner replies
   there. What that removes, and what has to stand in its place:

     GONE   the OTP round trip (request → six boxes → resend timer → confirm).
            Nothing now proves the visitor owns the number they typed.
     GONE   the email field, and with it the email OTP channel.
     GONE   the separate "WhatsApp is a different number" field. The one number
            asked for IS the WhatsApp number, because that is where the reply
            comes from.
     STANDS IN  a honeypot input and a minimum fill time below, plus per-IP and
            per-number rate limits in booking.php. They are not identity checks
            and are not pretending to be; they are what keeps a script from
            using the owner's phone as a mailbox.

   Every call still goes through BenakaAPI, so the preview and the live endpoint
   stay interchangeable.
   ========================================================================== */

(function () {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const panel = $('[data-booking]');
  if (!panel) return;
  const steps = $$('.step', panel);

  let details = null, opener = null, openedAt = 0;

  /* The panel's "not taking live bookings" notice is shown only while the
     server itself reports it is not configured. It is never a hardcoded state
     that someone has to remember to remove on the day they go live. */
  const notice = $('[data-bk-notice]', panel);
  BenakaAPI.ready.then(mode => { if (notice) notice.hidden = (mode === 'live'); });

  /* ---- open / close ------------------------------------------------------ */
  // Everything outside the panel goes inert while it is open, so a screen
  // reader cannot walk the page behind a modal that is visually covering it.
  const outside = () => [...document.body.children].filter(n => n !== panel);

  function open() {
    opener = document.activeElement;
    openedAt = Date.now();
    panel.hidden = false;
    outside().forEach(n => n.inert = true);
    requestAnimationFrame(() => {
      panel.classList.add('open');
      document.body.style.overflow = 'hidden';
      $('#bk-name').focus();
    });
  }
  function close() {
    panel.classList.remove('open');
    document.body.style.overflow = '';
    outside().forEach(n => n.inert = false);
    setTimeout(() => { panel.hidden = true; }, 400);
    if (opener) opener.focus();
  }

  $$('[data-open-booking]').forEach(b =>
    b.addEventListener('click', e => { e.preventDefault(); open(); }));
  $$('[data-bk-close]', panel).forEach(b => b.addEventListener('click', close));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !panel.hidden) close();
  });

  // Keep focus inside the panel while it is open.
  panel.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || panel.hidden) return;
    // tabindex="-1" excluded on purpose: the honeypot is a rendered 1px input,
    // so offsetParent alone would let it become the first or last stop and put
    // a Shift+Tab into a field no human is supposed to reach.
    const f = $$('button,input,select,a[href]', panel)
      .filter(n => n.offsetParent !== null && !n.disabled && n.tabIndex >= 0);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  function show(n) {
    steps.forEach(s => s.classList.toggle('active', +s.dataset.step === n));
    const t = $('[data-bk-title]');
    if (t) t.textContent = n === 1 ? 'Who is coming?' : 'Thank you';
  }

  /* ---- dates -------------------------------------------------------------
     No calendar library: <input type="date"> is a real date picker on every
     phone and desktop that matters, it is keyboard accessible for free, and it
     submits YYYY-MM-DD whatever the browser shows the visitor. The server
     re-checks all of this — the endpoint is reachable without a browser. */
  const arrive = $('#bk-arrive'), leave = $('#bk-leave'), nights = $('[data-bk-nights]');
  const iso = d => d.toISOString().slice(0, 10);
  const DAY = 86400000;

  (function seedDates() {
    const today = new Date();
    arrive.min = iso(today);
    leave.min  = iso(new Date(+today + DAY));
  })();

  function countNights() {
    if (!arrive.value || !leave.value) { nights.textContent = ''; return; }
    const n = Math.round((Date.parse(leave.value) - Date.parse(arrive.value)) / DAY);
    nights.textContent = n > 0 ? (n === 1 ? 'One night' : n + ' nights') : '';
  }
  arrive.addEventListener('change', () => {
    // Leaving can never be on or before arriving, so move the floor with it.
    if (arrive.value) {
      leave.min = iso(new Date(Date.parse(arrive.value) + DAY));
      if (leave.value && leave.value <= arrive.value) leave.value = leave.min;
    }
    countNights();
  });
  leave.addEventListener('change', countNights);

  /* ---- validation -------------------------------------------------------- */
  const setErr = (name, msg) => {
    const slot = $(`[data-err="${name}"]`, panel);
    const input = $(`[name="${name}"]`, panel);
    if (slot) slot.textContent = msg || '';
    if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  };

  function read() {
    const v = n => (($(`[name="${n}"]`, panel) || {}).value || '').trim();
    const d = {
      name: v('name'), from: v('from'),
      cc: v('cc') || '+91', phone: v('phone'),
      arrival: v('arrival'), departure: v('departure'),
      // Sent along so the server can make the same two judgements the browser
      // does. Both are advisory here and authoritative there.
      website: v('website'),
      elapsed: Math.round((Date.now() - openedAt) / 1000),
    };
    let ok = true;
    const fail = (f, m) => { setErr(f, m); ok = false; };

    ['name', 'from', 'phone', 'arrival', 'departure'].forEach(f => setErr(f, ''));

    if (d.name.length < 2)                  fail('name', 'Please tell us your name.');
    if (d.from.length < 2)                  fail('from', 'Which town or city?');
    if (!/^\d[\d\s-]{6,15}$/.test(d.phone)) fail('phone', 'A WhatsApp number we can reply on.');
    const today = iso(new Date());
    if (!d.arrival)                  fail('arrival', 'Which day would you like to arrive?');
    else if (d.arrival < today)      fail('arrival', 'That date has already passed.');
    if (!d.departure)                fail('departure', 'And which day would you leave?');
    else if (d.arrival && d.departure <= d.arrival)
                                     fail('departure', 'Leaving day has to be after arriving day.');

    d.phone = d.cc + ' ' + d.phone;
    return ok ? d : null;
  }

  /* ---- Send -------------------------------------------------------------- */
  $('[data-bk-send]').addEventListener('click', async e => {
    const btn = e.currentTarget;
    const d = read();
    if (!d) { $('[aria-invalid="true"]', panel)?.focus(); return; }
    details = d;
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const r = await BenakaAPI.submitBooking(d);
      renderSummary(r);
      show(2);
      $('[data-bk-done-h]', panel)?.focus();
    } catch (err) {
      // Put the message where it belongs when the server named a field, and on
      // the phone field otherwise — it is the one most likely to be at fault.
      const field = err.field && $(`[data-err="${err.field}"]`, panel) ? err.field : 'phone';
      setErr(field, err.message);
      $(`[name="${field}"]`, panel)?.focus();
    } finally {
      btn.disabled = false; btn.textContent = 'Send';
    }
  });

  /* Three states, told apart and told truthfully. The request is kept in every
     one of them, and none of them claims a delivery that did not happen. */
  const DELIVERY = {
    sent:    'Sent to the owner on WhatsApp. They will get in touch to confirm your dates.',
    failed:  'Saved. WhatsApp delivery did not go through just now, so the owner ' +
             'will pick this up from the booking list instead — your request is not lost.',
    skipped: 'Saved, but not delivered: live booking is not switched on for this ' +
             'site yet. Nothing you entered has been sent anywhere.',
  };

  function renderSummary(r) {
    const rows = [
      ['Name', details.name], ['From', details.from],
      ['Dates', stayLine()],
      ['WhatsApp', details.phone],
    ];
    const status = (r && r.deliveryStatus) || 'skipped';
    const note = DELIVERY[status] || DELIVERY.skipped;
    const ref = r && r.requestId && r.requestId !== 'preview'
      ? `<p class="micro" style="color:var(--s-ink-faint);margin-top:10px">Reference ${escape_(r.requestId)}</p>`
      : '';

    $('[data-bk-summary]').innerHTML =
      `<dl style="margin:0">${rows.map(([k, v]) =>
        `<dt class="micro" style="margin-bottom:4px">${k}</dt>
         <dd style="margin:0 0 14px">${escape_(v)}</dd>`).join('')}</dl>` +
      `<p class="micro" style="color:var(--s-ink-soft)">${escape_(note)}</p>` + ref;

    // The heading and the line under it are set together, because a heading
    // saying "on its way" over a line saying "saved" is the page contradicting
    // itself in exactly the case where honesty matters most.
    const h = $('[data-bk-done-h]', panel), sub = $('[data-bk-done-p]', panel);
    if (h)   h.textContent = status === 'sent'
      ? 'Your request is on its way.'
      : 'Your request has been saved.';
    if (sub) sub.textContent = status === 'sent'
      ? 'The owner will get in touch on WhatsApp to confirm your dates.'
      : 'We have kept your details.';
  }

  /* The same one-line shape the owner's WhatsApp message carries, so the guest
     is looking at exactly what was sent. */
  function stayLine() {
    const fmt = v => new Date(v + 'T00:00:00').toLocaleDateString('en-GB',
      { day: 'numeric', month: 'short', year: 'numeric' });
    const n = Math.round((Date.parse(details.departure) - Date.parse(details.arrival)) / 86400000);
    return `${fmt(details.arrival)} to ${fmt(details.departure)} (${n} night${n === 1 ? '' : 's'})`;
  }

  function escape_(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
