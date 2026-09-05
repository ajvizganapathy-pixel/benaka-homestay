/* ============================================================================
   The adapter. Every network call the site makes goes through here.
   ----------------------------------------------------------------------------
   TODAY: LIVE = false. Calls resolve against a local mock so the whole flow can
   be walked and tested, and the booking panel says plainly that requests are not
   being delivered. Nothing is faked at the user: no confirmation is claimed that
   did not happen.

   TO GO LIVE: fill api/config.php with the owner's WhatsApp credentials, then
   set LIVE = true here. Nothing else in the site changes — same five functions,
   same shapes. That is the entire switch.
   ========================================================================== */

window.SherlockAPI = (function () {
  'use strict';

  const LIVE     = false;             // flip to true once api/config.php is filled
  const ENDPOINT = '../api/booking.php';

  const wait = ms => new Promise(r => setTimeout(r, ms));

  async function post(action, payload) {
    if (!LIVE) return mock(action, payload);
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
    if (!res.ok) throw new Error('Could not reach the server. Try again in a moment.');
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }

  /* The mock keeps the shapes identical to the PHP endpoint's replies, so
     turning LIVE on is genuinely a one-line change and not a rewrite. */
  async function mock(action, payload) {
    await wait(420);                            // a real network has weight
    switch (action) {
      case 'requestOtp':
        sessionStorage.setItem('sh_otp', '123456');
        return { ok: true, sent: true, dest: payload.whatsapp || payload.phone, mock: true };
      case 'verifyOtp':
        if (payload.code !== sessionStorage.getItem('sh_otp')) {
          throw new Error('That code is not right. In this preview the code is 123456.');
        }
        return { ok: true, verified: true, mock: true };
      case 'submitBooking':
        return { ok: true, delivered: false, reason: 'not_configured', mock: true };
      case 'login':
        throw new Error('Accounts are not switched on yet.');
      default:
        throw new Error('Unknown action.');
    }
  }

  return {
    isLive:        () => LIVE,
    requestOtp:    d => post('requestOtp', d),
    verifyOtp:     d => post('verifyOtp', d),
    register:      d => post('register', d),
    login:         d => post('login', d),
    submitBooking: d => post('submitBooking', d),
  };
})();
