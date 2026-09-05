/* ============================================================================
   Booking: who → code → done. Three steps, plain validation, no cleverness.
   Every call goes through SherlockAPI so the mock and the live endpoint are
   interchangeable.
   ========================================================================== */

(function () {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const panel   = $('[data-booking]');
  if (!panel) return;
  const form    = $('[data-bk-form]', panel);
  const steps   = $$('.step', panel);
  const pips    = $$('.bk__steps i', panel);
  const otpBoxes = $$('[data-otp] input', panel);

  let step = 1, details = null, opener = null, timer = null;

  /* ---- open / close ------------------------------------------------------ */
  function open() {
    opener = document.activeElement;
    panel.hidden = false;
    requestAnimationFrame(() => {
      panel.classList.add('open');
      document.body.style.overflow = 'hidden';
      $('#bk-name').focus();
    });
  }
  function close() {
    panel.classList.remove('open');
    document.body.style.overflow = '';
    clearInterval(timer);
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
    const f = $$('button,input,select,a[href]', panel).filter(n => n.offsetParent !== null && !n.disabled);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  function show(n) {
    step = n;
    steps.forEach(s => s.classList.toggle('active', +s.dataset.step === n));
    pips.forEach((p, i) => p.classList.toggle('done', i < n));
    const t = $('[data-bk-title]');
    t.textContent = n === 1 ? 'Who is coming?' : n === 2 ? 'Check your phone' : 'Thank you';
  }

  /* ---- WhatsApp-same-as-phone toggle ------------------------------------ */
  const waSame = $('[data-wa-same]'), waField = $('[data-wa-field]');
  waSame.addEventListener('change', () => { waField.hidden = waSame.checked; });

  /* ---- validation -------------------------------------------------------- */
  const setErr = (name, msg) => {
    const slot = $(`[data-err="${name}"]`, panel);
    const input = $(`[name="${name}"]`, panel);
    if (slot) slot.textContent = msg || '';
    if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  };

  function readStep1() {
    const v = n => (($(`[name="${n}"]`, panel) || {}).value || '').trim();
    const d = {
      name: v('name'), from: v('from'),
      cc: v('cc') || '+91', phone: v('phone'),
      whatsapp: waSame.checked ? v('phone') : v('whatsapp'),
      email: v('email'), password: v('password'),
    };
    let ok = true;
    const fail = (f, m) => { setErr(f, m); ok = false; };

    ['name', 'from', 'phone', 'email', 'password'].forEach(f => setErr(f, ''));
    setErr('whatsapp', '');

    if (d.name.length < 2)                      fail('name', 'Please tell us your name.');
    if (d.from.length < 2)                      fail('from', 'Which town or city?');
    if (!/^\d[\d\s-]{6,15}$/.test(d.phone))     fail('phone', 'A phone number we can reach you on.');
    if (!waSame.checked && !/^\d[\d\s-]{6,15}$/.test(d.whatsapp))
                                                fail('whatsapp', 'Or untick the box above.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) fail('email', 'That email does not look right.');
    if (d.password.length < 8)                  fail('password', 'Eight characters or more.');

    d.phone = d.cc + ' ' + d.phone;
    d.whatsapp = waSame.checked ? d.phone : d.cc + ' ' + d.whatsapp;
    return ok ? d : null;
  }

  /* ---- step 1 → send code ----------------------------------------------- */
  $('[data-bk-next="1"]').addEventListener('click', async e => {
    const btn = e.currentTarget;
    const d = readStep1();
    if (!d) { $('[aria-invalid="true"]', panel)?.focus(); return; }
    details = d;
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const r = await SherlockAPI.requestOtp(d);
      $('[data-bk-dest]').textContent = r.dest || d.phone;
      show(2); startResend(); otpBoxes[0].focus();
    } catch (err) {
      setErr('phone', err.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Send me a code';
    }
  });

  /* ---- OTP boxes: type, paste, backspace -------------------------------- */
  otpBoxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/\D/g, '').slice(0, 1);
      if (box.value && i < otpBoxes.length - 1) otpBoxes[i + 1].focus();
    });
    box.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !box.value && i > 0) otpBoxes[i - 1].focus();
      if (e.key === 'ArrowLeft'  && i > 0) otpBoxes[i - 1].focus();
      if (e.key === 'ArrowRight' && i < otpBoxes.length - 1) otpBoxes[i + 1].focus();
    });
    box.addEventListener('paste', e => {
      e.preventDefault();
      const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6).split('');
      digits.forEach((ch, k) => { if (otpBoxes[k]) otpBoxes[k].value = ch; });
      otpBoxes[Math.min(digits.length, 5)].focus();
    });
  });

  function startResend() {
    let left = 30;
    const label = $('[data-otp-timer]'), btn = $('[data-otp-resend]');
    btn.disabled = true;
    clearInterval(timer);
    const tick = () => {
      label.textContent = left > 0 ? `Resend in ${left}s` : 'Did not get it?';
      if (left <= 0) { btn.disabled = false; clearInterval(timer); }
      left--;
    };
    tick(); timer = setInterval(tick, 1000);
  }
  $('[data-otp-resend]').addEventListener('click', async () => {
    if (!details) return;
    await SherlockAPI.requestOtp(details);
    otpBoxes.forEach(b => (b.value = ''));
    otpBoxes[0].focus(); startResend();
  });

  /* ---- step 2 → confirm -------------------------------------------------- */
  $('[data-bk-next="2"]').addEventListener('click', async e => {
    const btn = e.currentTarget;
    const code = otpBoxes.map(b => b.value).join('');
    setErr('otp', '');
    if (code.length !== 6) { setErr('otp', 'All six digits, please.'); return; }
    btn.disabled = true; btn.textContent = 'Checking…';
    try {
      await SherlockAPI.verifyOtp({ ...details, code });
      const r = await SherlockAPI.submitBooking(details);
      renderSummary(r);
      show(3);
      clearInterval(timer);
    } catch (err) {
      setErr('otp', err.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Confirm';
    }
  });

  $('[data-bk-back="1"]').addEventListener('click', () => show(1));
  $('[data-bk-login]').addEventListener('click', () =>
    setErr('email', 'Accounts are not switched on yet — send a request instead.'));

  function renderSummary(r) {
    const rows = [
      ['Name', details.name], ['From', details.from],
      ['Phone', details.phone], ['WhatsApp', details.whatsapp],
      ['Email', details.email],
    ];
    $('[data-bk-summary]').innerHTML =
      `<dl style="margin:0">${rows.map(([k, v]) =>
        `<dt class="micro" style="margin-bottom:4px">${k}</dt>
         <dd style="margin:0 0 14px">${escape_(v)}</dd>`).join('')}</dl>` +
      (r && r.delivered === false
        ? `<p class="micro" style="color:var(--s-ink-faint)">Held locally. Not delivered — WhatsApp is not connected yet.</p>`
        : '');
  }
  function escape_(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
