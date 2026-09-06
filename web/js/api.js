/* ============================================================================
   The adapter. Every network call the site makes goes through here.
   ----------------------------------------------------------------------------
   THE SERVER DECIDES THE MODE, NOT THIS FILE. On load we ask
   api/booking.php for its status. If it answers live, every call is real. If
   it answers not-configured, 404s, or cannot be reached at all, we fall back to
   a local preview and the panel says plainly that nothing is being delivered.

   That means going live is exactly one thing: put a filled api/config.php on
   the server with CONFIGURED => true. No source file is edited, no build step,
   no flag anyone can forget to flip back.

   Nothing secret ever reaches this file. The status reply carries only whether
   the endpoint is live and which channel sends the code — no tokens, no phone
   ids, no credentials of any kind.
   ========================================================================== */

window.BenakaAPI = (function () {
  'use strict';

  /* Resolve the endpoint from this script's own URL rather than from the
     document's. The page can be served at /, at /web/, or from a subdirectory
     depending on whether Apache rewrote the root, and a document-relative path
     silently points somewhere different in each case. */
  const ENDPOINT = (function () {
    const self = document.currentScript
      || document.querySelector('script[src$="js/api.js"]');
    const here = (self && self.src) || document.baseURI;
    try { return new URL('../../api/booking.php', here).href; }
    catch (_) { return '../api/booking.php'; }
  })();

  const wait = ms => new Promise(r => setTimeout(r, ms));

  let mode = 'unknown';          // unknown | live | preview
  let channel = 'none';

  /* One probe, at startup. Anything other than a clear "live" is a preview. */
  const ready = (async function probe() {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status' }),
      });
      const data = await res.json();
      if (data && data.ok && data.live) {
        mode = 'live';
        channel = data.otpChannel || 'whatsapp';
      } else {
        mode = 'preview';
      }
    } catch (_) {
      mode = 'preview';          // no PHP, no network, no endpoint — all preview
    }
    // NOT data-booking: the panel already owns that attribute, and setting it
    // on <html> makes document.querySelector('[data-booking]') return the root
    // element instead of the panel.
    document.documentElement.dataset.bookingMode = mode;
    return mode;
  })();

  async function post(action, payload) {
    await ready;
    if (mode !== 'live') return mock(action, payload);

    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
    } catch (_) {
      throw fault('We could not reach the server. Check your connection and try again.', 'offline');
    }

    let data = null;
    try { data = await res.json(); } catch (_) { /* not JSON: handled below */ }

    if (!data) {
      throw fault('The server sent something we could not read. Please try again.', 'bad_response');
    }
    if (!data.ok) {
      throw fault(data.error || 'Something went wrong.', data.reason || 'error', data.field);
    }
    return data;
  }

  function fault(message, reason, field) {
    const e = new Error(message);
    e.reason = reason;
    if (field) e.field = field;
    return e;
  }

  /* The preview keeps the shapes identical to the PHP endpoint's replies, so
     nothing downstream can tell them apart except by what it is told. It never
     claims a delivery: submitBooking always reports deliveryStatus 'skipped'. */
  async function mock(action, payload) {
    await wait(420);                            // a real network has weight
    switch (action) {
      case 'status':
        return { ok: true, live: false, otpChannel: 'none' };
      case 'requestOtp':
        sessionStorage.setItem('bk_otp', '123456');
        return { ok: true, sent: true, channel: 'preview',
                 dest: payload.whatsapp || payload.phone };
      case 'verifyOtp':
        if (payload.code !== sessionStorage.getItem('bk_otp')) {
          throw fault('That code is not right. In this preview the code is 123456.', 'bad_code');
        }
        sessionStorage.removeItem('bk_otp');
        return { ok: true, verified: true, channel: 'preview' };
      case 'submitBooking':
        return { ok: true, received: true, deliveryStatus: 'skipped',
                 requestId: 'preview', reason: 'not_configured' };
      default:
        throw fault('Unknown action.', 'unknown_action');
    }
  }

  return {
    ready,
    mode:          () => mode,
    isLive:        () => mode === 'live',
    otpChannel:    () => channel,
    requestOtp:    d => post('requestOtp', d),
    verifyOtp:     d => post('verifyOtp', d),
    submitBooking: d => post('submitBooking', d),
  };
})();
