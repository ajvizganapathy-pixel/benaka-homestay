/* ============================================================================
   /owner/: setup, the lock and the dashboard.

   The page asks the server where to start (owner.php?action=session) and
   shows one view. The 3D dial (lock.js, and Three.js with it) is imported
   only when the lock is actually shown, so a signed-in owner and a paused
   site never download it. The keys are plain buttons in the page and work
   whether or not the dial loads.

   Everything a guest wrote is put on the page with textContent, never
   innerHTML. The code typed here is posted once and never kept in a variable
   longer than the request.
   ========================================================================== */
const API = '../review-api/owner.php';
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let csrf = '';
let lock = null;          // the 3D dial, when it loaded
let data = null;          // the last dashboard
let lockTimer = 0;

/* ---- talking to the server ---------------------------------------------- */
async function call(method, body, query = '') {
  const opt = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
  if (method === 'POST') {
    opt.headers['Content-Type'] = 'application/json';
    if (csrf) opt.headers['X-CSRF-Token'] = csrf;
    opt.body = JSON.stringify(body || {});
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  opt.signal = ctl.signal;
  let res, json;
  try {
    res = await fetch(API + query, opt);
    json = await res.json();
  } catch {
    return { status: 0, ok: false, error: 'network' };
  } finally { clearTimeout(t); }
  if (!json || typeof json !== 'object') return { status: res.status, ok: false, error: 'network' };
  return { status: res.status, ...json };
}

/** A signed-in call. A 401 means the session ended: back to the lock. */
async function act(body) {
  const r = await call('POST', body);
  if (r.status === 401) { signedOut('Signed out after 30 minutes without activity. Sign in again.'); }
  if (r.status === 503) { show('paused'); }
  return r;
}

/* ---- views --------------------------------------------------------------- */
function show(name) {
  $$('[data-view]').forEach(v => { v.hidden = v.dataset.view !== name; });
  $$('[data-when]').forEach(v => { v.hidden = v.dataset.when !== name; });
  document.body.dataset.screen = name;
}

async function start() {
  const r = await call('GET', null, '?action=session');
  if (r.error === 'paused') return show('paused');
  if (!r.ok) return show('unavailable');
  if (r.state === 'unconfigured') return show('unconfigured');
  if (r.state === 'setup') return showSetup();
  if (r.state === 'signed_in') { csrf = r.csrf; return openDashboard(); }
  return showLock(r.retry_after || 0, '');
}

/* ---- one-time setup ------------------------------------------------------- */
function showSetup() {
  show('setup');
  const f = $('[data-setup-form]');
  const msg = $('[data-msg]', f);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const key = f.setup_key.value, c1 = f.code.value, c2 = f.code2.value;
    if (!/^[0-9]{8,32}$/.test(c1)) { msg.textContent = 'The code must be 8 to 32 digits, and digits only.'; return; }
    if (c1 !== c2) { msg.textContent = 'The two codes are different. Type them again.'; return; }
    msg.textContent = 'Setting the code…';
    const r = await call('POST', { action: 'setup', setup_key: key, code: c1 });
    f.code.value = f.code2.value = '';
    if (r.ok && r.written) { csrf = r.csrf; f.reset(); return openDashboard(); }
    if (r.ok && !r.written) {
      f.hidden = true;
      $('[data-hash-out]').value = r.hash;
      $('[data-setup-hash]').hidden = false;
      return;
    }
    msg.textContent = r.error === 'setup_key' ? 'That setup phrase does not match the server config.'
                    : r.error === 'no_argon2' ? 'This server\'s PHP cannot make an Argon2id hash. In hPanel, open Advanced, PHP Configuration, PHP extensions, turn on "sodium", save, and try again.'
                    : r.error === 'closed' ? 'A code is already set. Reload the page to sign in.'
                    : r.error === 'slow_down' ? 'Too many tries. Wait ten minutes.'
                    : 'That did not work. Try again.';
  });
}

/* ---- the lock --------------------------------------------------------------- */
const field = () => $('#code');

function paintDots() {
  const n = field().value.length;
  $('[data-lock-dots]').textContent = '●'.repeat(n);
  // The CSS dial's ring turns a notch a digit, as the 3D one does.
  $('[data-lock-stage]').style.setProperty('--turn', `${n * 12}deg`);
  if (lock) lock.turnTo(n);
}

let checking = false;     // a code is with the server: keys wait

/** One digit into the field. The only thing a key does. */
function press(d) {
  const f = field();
  if (f.disabled || checking || f.value.length >= 32) return;
  f.value += d;
  setRing('');
  $('[data-lock-msg]').textContent = '';
  paintDots();
}

/* ---- the keys: a real press, held at least long enough to see ---------- */
const HOLD_MS = 90;
function hold(k) {
  clearTimeout(k._up);
  k._down = performance.now();
  k.classList.add('is-pressed');
}
function release(k) {
  if (!k.classList.contains('is-pressed')) return;
  const left = HOLD_MS - (performance.now() - (k._down || 0));
  clearTimeout(k._up);
  k._up = setTimeout(() => k.classList.remove('is-pressed'), Math.max(0, left));
}
/** A digit typed on the keyboard presses its key too. */
function flash(d) {
  const k = $(`.lock__key[data-key="${d}"]`);
  if (k) { hold(k); release(k); }
}

/** The status ring: '' (dark), 'ok' (the server said yes) or 'err'. Green
    is set in exactly one place, after a 200 from login. */
function setRing(state) {
  const view = $('[data-view="lock"]');
  if (!state && view.classList.contains('is-locked')) return;   // red while locked out
  view.classList.toggle('lock--ok', state === 'ok');
  view.classList.toggle('lock--err', state === 'err');
}
function shake() {
  const st = $('[data-lock-stage]');
  st.classList.remove('is-shaking');
  void st.offsetWidth;                 // restart the animation
  st.classList.add('is-shaking');
}

let lockWired = false;
async function showLock(retryAfter, message) {
  show('lock');
  const stage = $('[data-lock-stage]');
  const view = $('[data-view="lock"]');
  if (!lockWired) {
    lockWired = true;
    wireLock();
    // The 3D dial, if this device can draw it. If not, the same dial is
    // drawn in CSS under the same keys, and nothing else changes.
    try {
      const mod = await import('./lock.js?v=20261016-1');
      lock = mod.mountLock(stage);
      view.classList.add('lock--3d');
    } catch {
      lock = null;
      view.classList.add('lock--flat');
    }
  }
  checking = false;
  view.classList.remove('lock--ok', 'lock--err');
  if (lock) lock.clear();
  $('[data-lock-msg]').textContent = message || '';
  setLocked(retryAfter);
  if (matchMedia('(pointer: fine)').matches && !field().disabled) field().focus({ preventScroll: true });
}

function wireLock() {
  const f = $('[data-lock-form]');
  const input = field();
  // The field takes digits only, from the keyboard or a paste.
  input.addEventListener('input', () => {
    const clean = input.value.replace(/\D/g, '').slice(0, 32);
    if (clean !== input.value) input.value = clean;
    paintDots();
  });
  // Typing a digit anywhere on the lock screen goes to the field, and
  // presses the matching key.
  input.addEventListener('keydown', e => {
    if (/^[0-9]$/.test(e.key) && !e.metaKey && !e.ctrlKey) { e.preventDefault(); flash(e.key); press(e.key); }
  });
  document.addEventListener('keydown', e => {
    if (document.body.dataset.screen !== 'lock' || e.target === input) return;
    if (/^[0-9]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); flash(e.key); press(e.key); }
    if (e.key === 'Enter' && e.target === document.body) f.requestSubmit();
    if (e.key === 'Backspace' && e.target === document.body) { input.value = input.value.slice(0, -1); paintDots(); }
  });

  // The keys. pointerdown is cancelled so a tap never takes focus from the
  // field (and never opens a phone's keyboard); the digit goes in on click,
  // which every tap and every mouse press ends with, however fast.
  $$('.lock__key').forEach(k => {
    k.addEventListener('pointerdown', e => {
      if (e.button > 0 || field().disabled) return;
      e.preventDefault();
      hold(k);
      if (e.pointerType === 'touch' && navigator.vibrate) { try { navigator.vibrate(8); } catch {} }
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => k.addEventListener(t, () => release(k)));
    k.addEventListener('click', () => press(k.dataset.key));
  });
  // Clear and Unlock press the same way.
  $$('.lock__buttons .btn').forEach(b => {
    b.addEventListener('pointerdown', e => { if (e.button <= 0 && !b.disabled) hold(b); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => b.addEventListener(t, () => release(b)));
  });

  $('[data-lock-clear]').addEventListener('click', () => {
    input.value = ''; paintDots(); if (lock) lock.clear();
    setRing('');
    $('[data-lock-msg]').textContent = '';
  });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('[data-lock-msg]');
    if (input.disabled) return;
    if (checking) return;
    if (!/^[0-9]{8,32}$/.test(input.value)) { msg.textContent = 'Codes are 8 digits or more.'; return; }
    checking = true;
    $('[data-lock-go]').disabled = true;
    msg.textContent = 'Checking…';
    const r = await call('POST', { action: 'login', code: input.value });
    input.value = ''; paintDots();
    $('[data-lock-go]').disabled = false;
    if (r.ok) {                          // keys stay still (checking) until the dashboard is up
      csrf = r.csrf;
      msg.textContent = 'Unlocked.';
      setRing('ok');
      // Long enough to see the ring go green and the bolt turn.
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      await Promise.all([lock ? lock.open() : null, new Promise(res => setTimeout(res, still ? 500 : 900))]);
      return openDashboard();
    }
    checking = false;
    if (lock) lock.clear();
    // Red says only "not accepted": the whole ring, the same for every
    // refusal, and nothing about any digit.
    if (r.error === 'wrong' || r.error === 'locked') { setRing('err'); shake(); }
    if (r.error === 'locked') { msg.textContent = ''; return setLocked(r.retry_after); }
    if (r.error === 'wrong') {
      msg.textContent = r.tries_left === 1
        ? 'Not accepted. One more wrong code locks sign-in for 30 minutes.'
        : `Not accepted. ${r.tries_left} tries left before sign-in locks for 30 minutes.`;
      return;
    }
    msg.textContent = r.error === 'slow_down' ? 'Too many tries from here. Wait ten minutes.'
                    : r.error === 'paused' ? 'Reviews are paused on the server.'
                    : 'The server did not answer. Try again.';
  });
}

/** Locked by the server for `secs`: the field and buttons are disabled and a
    countdown runs. The server enforces the lock whatever this page does. */
function setLocked(secs) {
  clearInterval(lockTimer);
  const on = secs > 0;
  const view = $('[data-view="lock"]');
  const was = view.classList.contains('is-locked');
  view.classList.toggle('is-locked', on);
  field().disabled = on;
  $('[data-lock-go]').disabled = on;
  $('[data-lock-clear]').disabled = on;
  $$('.lock__key').forEach(k => { k.disabled = on; });
  if (lock) lock.setLocked(on);
  if (on) setRing('err');
  else if (was) setRing('');
  if (!on) return;
  const until = Date.now() + secs * 1000;
  const tick = () => {
    const left = Math.ceil((until - Date.now()) / 60000);
    if (left <= 0) {
      clearInterval(lockTimer);
      $('[data-lock-msg]').textContent = 'Sign-in is open again.';
      return setLocked(0);
    }
    $('[data-lock-msg]').textContent =
      `Locked after 5 wrong codes. Sign-in opens again in ${left} minute${left === 1 ? '' : 's'}.`;
  };
  tick();
  lockTimer = setInterval(tick, 15000);
}

function signedOut(message) {
  csrf = '';
  data = null;
  showLock(0, message);
}

/* ---- the dashboard ---------------------------------------------------------- */
let dashWired = false;
async function openDashboard() {
  show('dash');
  if (!dashWired) { dashWired = true; wireDashboard(); }
  await refresh();
}

async function refresh() {
  const r = await call('GET', null, '?action=dashboard');
  if (r.status === 401) return signedOut('Signed out after 30 minutes without activity. Sign in again.');
  if (r.status === 503) return show('paused');
  if (!r.ok) { $('[data-dash-msg]').textContent = 'Could not load the lists. Try Refresh.'; return; }
  data = r;
  render();
}

function wireDashboard() {
  const tabs = $$('[role="tab"]');
  const select = t => {
    tabs.forEach(x => {
      const on = x === t;
      x.setAttribute('aria-selected', String(on));
      x.tabIndex = on ? 0 : -1;
      $(`[data-panel="${x.dataset.tab}"]`).hidden = !on;
    });
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', e => {
      const j = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : -1;
      if (j >= 0) { select(tabs[j]); tabs[j].focus(); }
    });
  });
  $('[data-refresh]').addEventListener('click', refresh);
  $('[data-signout]').addEventListener('click', async () => {
    await act({ action: 'logout' });
    signedOut('Signed out.');
  });
  wireInviteDialog();
  wireDeleteDialog();
}

/* Small DOM builder: every string goes in as text. */
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
}
function button(label, cls, onClick) {
  const b = el('button', 'btn ' + (cls || ''), label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

const IST = { timeZone: 'Asia/Kolkata' };
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-GB', { ...IST, day: 'numeric', month: 'short', year: 'numeric' }) : '';
const fmtDateTime = iso => iso ? new Date(iso).toLocaleString('en-GB', { ...IST, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
/** 'YYYY-MM-DD' as a calendar date, with no time zone shift. */
const ymd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fmtYmd = s => ymd(s).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
function fmtStay(from, to, nights) {
  const a = ymd(from), b = ymd(to);
  const same = a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
  const range = same ? `${a.getUTCDate()}–${fmtYmd(to)}` : `${fmtYmd(from)} – ${fmtYmd(to)}`;
  return `${range} · ${nights} night${nights === 1 ? '' : 's'}`;
}
function stars(n) {
  const s = el('span', 'rp__stars', '★'.repeat(n) + '☆'.repeat(5 - n));
  s.setAttribute('role', 'img');
  s.setAttribute('aria-label', `${n} out of 5 stars`);
  return s;
}

/** +919000000008 -> +91 90000 00008, the way the site writes numbers. */
const spacedPhone = p => /^\+91\d{10}$/.test(p) ? `+91 ${p.slice(3, 8)} ${p.slice(8)}` : p;

/** The masked number, with a Show button that asks the server for it. */
function phoneLine(invId, masked) {
  const wrap = el('span', 'rp__phone');
  const num = el('span', 'rp__num', masked);
  const b = el('button', 'rp__link', 'Show');
  b.type = 'button';
  b.addEventListener('click', async () => {
    if (b.dataset.shown) { num.textContent = masked; b.textContent = 'Show'; delete b.dataset.shown; return; }
    const r = await act({ action: 'reveal', id: invId });
    if (r.ok) { num.textContent = spacedPhone(r.phone); b.textContent = 'Hide'; b.dataset.shown = '1'; }
  });
  wrap.append(num, b);
  return wrap;
}

function reviewCard(rv, actions) {
  const c = el('article', 'acard');
  const top = el('div', 'acard__top');
  top.append(el('h3', 'acard__name', rv.name));
  if (rv.card) {
    const ttl = el('span', 'acard__ttl', rv.card.dissolves_in === 0 ? 'Dissolves today'
      : `Dissolves in ${rv.card.dissolves_in} day${rv.card.dissolves_in === 1 ? '' : 's'}`);
    top.append(ttl);
  }
  c.append(top);

  const meta = el('div', 'acard__meta');
  if (rv.card) meta.append(phoneLine(rv.card.invitation_id, rv.card.phone_masked),
                           el('span', '', fmtStay(rv.card.stay_from, rv.card.stay_to, rv.card.nights)));
  meta.append(stars(rv.rating), el('span', '', 'Written ' + fmtDate(rv.submitted)));
  c.append(meta);

  const body = el('div', 'acard__body');
  rv.body.split('\n').filter(Boolean).forEach(p => body.append(el('p', '', p)));
  c.append(body);

  c.append(el('p', 'acard__consent', rv.consent
    ? 'Agreed to show their full name on the site.'
    : 'Did not agree to show their name. This review will never appear on the site, even if approved.'));

  const row = el('div', 'acard__act');
  actions.forEach(a => row.append(a));
  c.append(row);
  return c;
}

async function moderate(action, id, okMsg) {
  const r = await act({ action, id });
  $('[data-dash-msg]').textContent = r.ok ? okMsg : 'That did not go through. Refresh and try again.';
  await refresh();
}

function render() {
  const W = $('[data-panel="waiting"]'), P = $('[data-panel="published"]'), I = $('[data-panel="invitations"]');
  W.replaceChildren(); P.replaceChildren(); I.replaceChildren();
  $('[data-count="waiting"]').textContent = String(data.waiting.length);
  $('[data-count="published"]').textContent = String(data.published.length);
  $('[data-count="invitations"]').textContent = String(data.invitations.length);

  /* Waiting */
  if (!data.waiting.length) W.append(el('p', 'rp__empty', 'Nothing waiting. New reviews appear here for you to approve or reject.'));
  data.waiting.forEach(rv => W.append(reviewCard(rv, [
    button('Approve', '', () => moderate('approve', rv.id, `Approved: ${rv.name}.`)),
    button('Reject', 'btn--ghost', () => moderate('reject', rv.id, `Rejected: ${rv.name}.`)),
  ])));
  if (data.rejected.length) {
    W.append(el('h2', 'dash__sub micro', 'Rejected · deleted when the card dissolves'));
    data.rejected.forEach(rv => W.append(reviewCard(rv, [
      button('Approve instead', 'btn--ghost', () => moderate('approve', rv.id, `Approved: ${rv.name}.`)),
    ])));
  }

  /* Published */
  if (!data.published.length) P.append(el('p', 'rp__empty', 'No published reviews yet.'));
  data.published.forEach(rv => {
    const acts = [];
    if (rv.card) acts.push(button('Move to rejected', 'btn--ghost', () => moderate('reject', rv.id, `Rejected: ${rv.name}.`)));
    acts.push(button('Take down', 'btn--ghost', () => {
      if (confirm(`Take down the review by ${rv.name}? It is deleted for good.`)) moderate('takedown', rv.id, `Taken down: ${rv.name}.`);
    }));
    const card = reviewCard(rv, acts);
    card.classList.add('acard--pub');
    card.insertBefore(el('p', 'acard__state micro', rv.consent ? 'On the site' : 'Not on the site · no consent'), card.firstChild);
    P.append(card);
  });

  /* Invitations */
  if (!data.invitations.length) I.append(el('p', 'rp__empty', 'No invitations yet. Use New invitation after a guest checks out.'));
  else I.append(el('p', 'rp__small-print dash__legend', 'Revoke stops a link and keeps the record. Delete removes the invitation for good. An invitation with a review stays until its card dissolves.'));
  const LABEL = { active: 'Open', verified: 'Verified, open', used: 'Used', revoked: 'Revoked', expired: 'Expired' };
  data.invitations.forEach(inv => {
    const c = el('article', 'acard acard--inv');
    const top = el('div', 'acard__top');
    const side = el('span', 'acard__side');
    side.append(el('span', `acard__status is-${inv.status}`, LABEL[inv.status] || inv.status));
    if (inv.deletable) side.append(binButton(inv));
    top.append(el('h3', 'acard__name', inv.name), side);
    c.append(top);
    const meta = el('div', 'acard__meta');
    const nights = Math.round((ymd(inv.stay_to) - ymd(inv.stay_from)) / 86400000);
    meta.append(phoneLine(inv.id, inv.phone_masked), el('span', '', fmtStay(inv.stay_from, inv.stay_to, nights)));
    c.append(meta);
    const dl = el('dl', 'acard__times');
    const row = (k, v) => { if (v) dl.append(el('dt', 'micro', k), el('dd', '', v)); };
    row('Created', fmtDateTime(inv.created));
    row(inv.status === 'expired' ? 'Expired' : 'Expires', fmtDateTime(inv.expires));
    row('Verified', fmtDateTime(inv.verified));
    row('Used', fmtDateTime(inv.used));
    row('Revoked', fmtDateTime(inv.revoked));
    row('WhatsApp check', inv.require_check ? `On · code ${inv.check_code}` : 'Off');
    c.append(dl);
    const acts = el('div', 'acard__act');
    if (inv.status === 'active' && inv.require_check) {
      acts.append(button('Verified', '', () => {
        if (confirm(`Did a WhatsApp message with ${inv.check_code} arrive from ${inv.name}'s number? Tap Show to compare it first.`))
          moderate('verify', inv.id, `Verified: ${inv.name}. Their form is open.`);
      }));
    }
    if (inv.status === 'active' || inv.status === 'verified') {
      acts.append(button('Revoke', 'btn--ghost', () => {
        if (confirm(`Revoke the link for ${inv.name}? It stops working at once.`)) moderate('revoke', inv.id, `Revoked: ${inv.name}.`);
      }));
    }
    if (acts.childNodes.length) c.append(acts);
    I.append(c);
  });
}

/* ---- deleting an invitation --------------------------------------------------- */
const SVG = 'http://www.w3.org/2000/svg';
/** The bin on an invitation card. Opens the dialog for exactly this card. */
function binButton(inv) {
  const b = el('button', 'acard__del');
  b.type = 'button';
  b.title = 'Delete invitation';
  b.setAttribute('aria-label', `Delete the invitation for ${inv.name}`);
  b.dataset.del = String(inv.id);
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '20'); svg.setAttribute('height', '20');
  svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  for (const d of ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12', 'M9 7V4h6v3']) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  b.append(svg);
  b.addEventListener('click', () => openDelete(inv, b));
  return b;
}

let pendingDelete = null;      // { id, name, from } while the dialog is open
function openDelete(inv, from) {
  const dlg = $('[data-delete-dialog]');
  pendingDelete = { id: inv.id, name: inv.name, from };
  $('[data-del-text]').textContent =
    `This permanently removes the invitation for ${inv.name}. Its link stops working and can never be used again. This cannot be undone. To stop a link but keep the record, use Revoke instead.`;
  $('[data-del-msg]').textContent = '';
  $('[data-del-go]').disabled = false;
  $('[data-del-cancel]').disabled = false;
  dlg.showModal();
  $('[data-del-cancel]').focus();          // the safe choice is the default
}

function wireDeleteDialog() {
  const dlg = $('[data-delete-dialog]');
  const go = $('[data-del-go]'), cancel = $('[data-del-cancel]');
  let busy = false;
  cancel.addEventListener('click', () => dlg.close());
  dlg.addEventListener('cancel', e => { if (busy) e.preventDefault(); });   // Escape waits for an answer
  dlg.addEventListener('close', () => {
    const from = pendingDelete && pendingDelete.from;
    pendingDelete = null;
    if (from && from.isConnected) from.focus();
  });
  go.addEventListener('click', async () => {
    if (busy || !pendingDelete) return;
    busy = true;
    go.disabled = cancel.disabled = true;
    const { id, name } = pendingDelete;
    $('[data-del-msg]').textContent = 'Deleting…';
    const r = await act({ action: 'delete', id });
    busy = false;
    const say = t => { $('[data-dash-msg]').textContent = t; };
    if (r.status === 401 || r.status === 503) { dlg.close(); return; }
    if (r.ok) { dlg.close(); say(`Deleted: the invitation for ${name}. Its link no longer works.`); return refresh(); }
    if (r.error === 'gone') { dlg.close(); say(`Already removed: the invitation for ${name}.`); return refresh(); }
    if (r.error === 'has_review') {
      dlg.close();
      say(`${name} has left a review, so this invitation stays until the review's card dissolves.`);
      return refresh();
    }
    $('[data-del-msg]').textContent = 'That did not go through. Check the connection and try again.';
    go.disabled = cancel.disabled = false;
  });
}

/* ---- new invitation ---------------------------------------------------------- */
function wireInviteDialog() {
  const dlg = $('[data-invite-dialog]');
  const f = $('[data-invite-form]');
  const done = $('[data-invite-done]');
  const msg = $('[data-msg]', f);

  $('[data-new-invite]').addEventListener('click', () => {
    f.reset(); msg.textContent = '';
    f.hidden = false; done.hidden = true;
    dlg.showModal();
    f.name.focus();
  });
  $$('[data-dlg-close]', dlg).forEach(b => b.addEventListener('click', () => dlg.close()));
  dlg.addEventListener('close', () => { $('[data-done-link]').value = ''; refresh(); });

  f.addEventListener('submit', async e => {
    e.preventDefault();
    const body = {
      action: 'create',
      name: f.name.value,
      phone: f.phone.value,
      stay_from: f.stay_from.value,
      stay_to: f.stay_to.value,
      expiry_days: parseInt(f.expiry_days.value, 10),
      require_check: f.require_check.checked,
    };
    msg.textContent = 'Creating…';
    const r = await act(body);
    if (!r.ok) {
      const names = { name: 'the full name', phone: 'the WhatsApp number', stay_from: 'the check-in date',
                      stay_to: 'the check-out date (after check-in)', expiry_days: 'the expiry (1 to 90 days)' };
      msg.textContent = r.fields ? 'Check ' + r.fields.map(x => names[x] || x).join(', ') + '.' : 'That did not go through. Try again.';
      return;
    }
    f.hidden = true; done.hidden = false;
    const first = r.name.split(/\s+/)[0];
    $('[data-done-h]').textContent = `Link for ${r.name}`;
    $('[data-done-link]').value = r.link;
    const until = fmtYmd(r.expires);
    const text = [
      `Hello ${first}, thank you for staying with us at Benaka By The Hills.`,
      `If you would like to leave a review, this link is just for you: ${r.link}`,
      `It works once, until ${until}.`,
      r.require_check ? 'The page will ask you to send us a short code on WhatsApp first, so we know the review is from you.' : '',
    ].filter(Boolean).join('\n\n');
    $('[data-done-note]').textContent = r.require_check
      ? `WhatsApp check is on. When ${first} sends you ${r.check_code} from their number, tap Verified on this invitation.`
      : 'WhatsApp check is off for this guest.';
    $('[data-wa]').href = 'https://wa.me/' + r.phone.replace(/\D/g, '') + '?text=' + encodeURIComponent(text);
    $('[data-done-msg]').value = text;
    $('[data-done-h]').focus();
  });

  $('[data-copy]').addEventListener('click', async () => {
    const inp = $('[data-done-link]');
    try { await navigator.clipboard.writeText(inp.value); $('[data-copy]').textContent = 'Copied'; }
    catch { inp.select(); document.execCommand('copy'); $('[data-copy]').textContent = 'Copied'; }
    setTimeout(() => { $('[data-copy]').textContent = 'Copy link'; }, 1600);
  });
}

start();
