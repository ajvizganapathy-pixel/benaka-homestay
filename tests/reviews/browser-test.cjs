/* ============================================================================
   Guest reviews: the browser suite. Drives the real pages in Chromium against
   a seeded test server (tests/reviews/seed.php), with OBVIOUSLY FAKE data.

     node tests/reviews/browser-test.cjs

   Needs playwright (or playwright-core) resolvable by node, and Chromium.
   Exit 0 all passed, 1 any failed, 3 cannot run here (no browser or no DB).
   Every line is labelled [browser].
   ========================================================================== */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

let pw;
try { pw = require('playwright'); } catch { try { pw = require('playwright-core'); } catch { console.error('playwright not found'); process.exit(3); } }
const EXE = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.CHROMIUM_PATH].find(p => p && fs.existsSync(p));

const ROOT = path.resolve(__dirname, '..', '..');
let PASS = 0, FAIL = 0;
const ok = w => { PASS++; console.log(`  \x1b[32mok\x1b[0m    [browser] ${w}`); };
const bad = (w, why) => { FAIL++; console.log(`  \x1b[31mFAIL\x1b[0m  [browser] ${w}`); if (why) console.log(`        ${String(why).slice(0, 500)}`); };
const check = (c, w, why) => (c ? ok(w) : bad(w, why));
const section = t => console.log(`\n  \x1b[1m${t}\x1b[0m`);
const wait = ms => new Promise(r => setTimeout(r, ms));

async function seed(args) {
  const out = path.join(os.tmpdir(), `gr-seed-${process.pid}-${Date.now()}.json`);
  const p = spawn('php', [path.join(__dirname, 'seed.php'), out, ...args], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', d => { err += d; });
  for (let i = 0; i < 120; i++) {
    if (fs.existsSync(out)) { const s = JSON.parse(fs.readFileSync(out, 'utf8')); s.proc = p; return s; }
    if (p.exitCode !== null) break;
    await wait(500);
  }
  p.kill('SIGTERM');
  throw new Error('seed did not start: ' + err);
}
function stop(s) { return new Promise(r => { s.proc.once('exit', r); s.proc.kill('SIGTERM'); setTimeout(r, 5000); }); }
const setEnabled = (s, on) => {
  const c = fs.readFileSync(s.config, 'utf8');
  fs.writeFileSync(s.config, c.replace(/'REVIEWS_ENABLED' => (true|false)/, `'REVIEWS_ENABLED' => ${on}`));
};

(async () => {
  if (!EXE && !process.env.PLAYWRIGHT_BROWSERS_PATH) { console.error('no chromium'); process.exit(3); }
  let s;
  try { s = await seed(['--xss']); } catch (e) { console.error(e.message); process.exit(3); }
  const browser = await pw.chromium.launch({ executablePath: EXE, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const B = s.base;

  const page = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
    const p = await ctx.newPage();
    p.errors = [];
    p.on('pageerror', e => p.errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) p.errors.push(m.text()); });
    p.on('dialog', d => { p.errors.push('dialog: ' + d.message()); d.dismiss(); });
    return p;
  };
  const signIn = async p => {
    await p.goto(B + '/owner/');
    await p.waitForSelector('.lock--3d, .lock--flat');
    await p.locator('#code').focus();
    await p.keyboard.type(s.code);
    await p.keyboard.press('Enter');
    await p.waitForSelector('[data-view="dash"]:not([hidden]) .acard', { timeout: 15000 });
  };

  try {
    /* ------------------------------------------------------------------ */
    section('11. Stored XSS, rendered');
    let p = await page();
    await p.goto(B + '/web/', { waitUntil: 'load' });
    await p.waitForSelector('[data-reviews]:not([hidden]) .rcard');
    let r = await p.evaluate(() => ({
      xss: window.__xss,
      injectedImgs: document.querySelectorAll('#reviews img').length,
      scripts: document.querySelectorAll('#reviews script').length,
      text: [...document.querySelectorAll('#reviews .rcard')].map(c => c.textContent).join(' '),
    }));
    check(r.xss === undefined && r.injectedImgs === 0 && r.scripts === 0, '11. homepage: the payload in a name and a review runs nothing and adds no element', JSON.stringify(r).slice(0, 200));
    check(r.text.includes('<script>window.__xss=1</script>') && r.text.includes('Test Guest <img src=x onerror=alert(1)>'), '11. homepage: it shows as literal text');
    check(p.errors.length === 0, '11. homepage: no errors, no alert dialog', p.errors.join(' | '));
    await p.context().close();

    p = await page();
    await signIn(p);
    await p.click('[data-tab="published"]');
    r = await p.evaluate(() => ({ xss: window.__xss, imgs: document.querySelectorAll('[data-panel] img').length,
      shown: document.querySelector('[data-panel="published"]').textContent.includes('<img src=x onerror="window.__xss=2">') }));
    check(r.xss === undefined && r.imgs === 0 && r.shown && p.errors.length === 0, '11. owner dashboard: the same payload is inert text there too', JSON.stringify(r) + p.errors.join('|'));

    /* ------------------------------------------------------------------ */
    section('Owner page');
    r = await p.evaluate(code => ({
      inHtml: document.documentElement.outerHTML.includes(code),
      field: document.querySelector('#code').value,
    }), s.code);
    check(!r.inHtml && r.field === '', '23. after signing in the code is not in the page, and the field is empty');
    const js = await (await p.request.get(B + '/owner/owner.js')).text() + await (await p.request.get(B + '/owner/lock.js')).text();
    check(!js.includes(s.code) && !js.includes('$argon2'), '23. owner.js and lock.js carry no code and no hash');
    const cookies = await p.context().cookies();
    const sc = cookies.find(c => c.name === 'benaka_owner');
    check(sc && sc.httpOnly && sc.sameSite === 'Strict', 'the session cookie is HttpOnly and SameSite=Strict, so page script cannot read it', JSON.stringify(sc));
    check(await p.evaluate(() => !document.cookie.includes('benaka_owner')), 'document.cookie does not show it');
    // The new-invitation flow builds a wa.me link to the GUEST with the text typed in.
    await p.click('[data-new-invite]');
    await p.fill('[name=name]', 'Test Guest Browser');
    await p.fill('[name=phone]', '90000 00088');
    await p.fill('[name=stay_from]', '2026-10-10');
    await p.fill('[name=stay_to]', '2026-10-12');
    await p.click('[data-invite-form] button[type=submit]');
    await p.waitForSelector('[data-invite-done]:not([hidden])');
    const href = await p.getAttribute('[data-wa]', 'href');
    const msg = decodeURIComponent(href.split('text=')[1] || '');
    check(href.startsWith('https://wa.me/919000000088?text=') && msg.includes('/review/#t=') && msg.startsWith('Hello Test,'),
      'Open in WhatsApp goes to the guest\'s number with the message typed in, nothing sent', href.slice(0, 60));
    check(await p.getAttribute('[data-wa]', 'target') === '_blank', 'and it opens WhatsApp in a new tab; the page sends nothing itself');
    await p.context().close();

    p = await page({ viewport: { width: 390, height: 844 } });
    await p.goto(B + '/owner/');
    await p.waitForSelector('.lock--3d, .lock--flat');
    const mode = await p.evaluate(() => document.querySelector('[data-view="lock"]').className);
    check(/lock--3d/.test(mode), 'the 3D lock renders in this Chromium (SwiftShader WebGL)', mode);
    r = await p.evaluate(() => ({ label: document.querySelector('label[for="code"]').textContent, hidden: document.querySelector('[data-lock-stage]').getAttribute('aria-hidden') || document.querySelector('canvas')?.getAttribute('aria-hidden') }));
    check(r.label.includes('Sign-in code') && r.hidden === 'true', 'screen readers get a labelled digit field; the 3D canvas is hidden from them', JSON.stringify(r));
    await p.context().close();

    // Without WebGL the same keys sit on a dial drawn in CSS, and work.
    const ctxNo = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await ctxNo.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
    const pn = await ctxNo.newPage();
    const noErr = [];
    pn.on('pageerror', e => noErr.push(e.message));
    await pn.goto(B + '/owner/');
    await pn.waitForSelector('.lock--flat', { timeout: 10000 }).catch(() => {});
    const flat = await pn.evaluate(() => ({ cls: document.querySelector('[data-view="lock"]').className,
      keys: [...document.querySelectorAll('.lock__key')].filter(k => k.getBoundingClientRect().width >= 56).length,
      canvas: !!document.querySelector('.lock__canvas') }));
    for (const d of s.code) await pn.tap(`.lock__key[data-key="${d}"]`);
    await pn.tap('[data-lock-go]');
    const inNo = await pn.waitForSelector('[data-view="dash"]:not([hidden])', { timeout: 10000 }).then(() => true).catch(() => false);
    check(/lock--flat/.test(flat.cls) && flat.keys === 10 && !flat.canvas && inNo && !noErr.length,
      'without WebGL the dial is drawn in CSS, the same ten keys are there, and signing in by tapping them works', JSON.stringify(flat) + noErr.join('|'));
    await ctxNo.close();
    // And the plain field still signs in on its own (a paste, a password manager).
    const ctxF = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctxF.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
    const pf = await ctxF.newPage();
    await pf.goto(B + '/owner/');
    await pf.waitForSelector('.lock--flat, .lock--3d');
    await pf.fill('#code', s.code);
    await pf.click('[data-lock-go]');
    check(await pf.waitForSelector('[data-view="dash"]:not([hidden])', { timeout: 10000 }).then(() => true).catch(() => false),
      'filling the digit field directly (paste, password manager) signs in too');
    await ctxF.close();

    /* ------------------------------------------------------------------ */
    section('The lock: key size, press, status ring');
    for (const [w, h] of [[360, 640], [360, 740], [390, 844], [412, 915], [1440, 900]]) {
      p = await page({ viewport: { width: w, height: h }, hasTouch: w < 500 });
      await p.goto(B + '/owner/');
      await p.waitForSelector('.lock--3d, .lock--flat');
      r = await p.evaluate(() => {
        const st = document.querySelector('[data-lock-stage]').getBoundingClientRect();
        const cx = st.left + st.width / 2, cy = st.top + st.height / 2, face = st.width * 0.45;
        const ks = [...document.querySelectorAll('.lock__key')].map(k => k.getBoundingClientRect());
        let minGap = Infinity, outside = 0;
        ks.forEach((a, i) => {
          const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
          if (Math.hypot(ax - cx, ay - cy) + a.width / 2 > face) outside++;
          ks.forEach((b, j) => { if (j > i) minGap = Math.min(minGap, Math.hypot(ax - b.left - b.width / 2, ay - b.top - b.height / 2) - a.width / 2 - b.width / 2); });
        });
        const btns = [...document.querySelectorAll('.lock__buttons .btn')].map(b => b.getBoundingClientRect().height);
        return { min: Math.min(...ks.map(k => Math.min(k.width, k.height))), max: Math.max(...ks.map(k => k.width)), n: ks.length,
                 minGap: Math.round(minGap), outside, btns: Math.min(...btns),
                 scroll: document.scrollingElement.scrollHeight - innerHeight };
      });
      check(r.n === 10 && r.min >= 56 && r.max <= 64.5 && r.minGap >= 8 && r.outside === 0 && r.btns >= 44 && r.scroll <= 0,
        `${w}x${h}: ten keys 56-64px across, at least 8px apart, all on the face, Clear/Unlock 44px+, no scrolling`, JSON.stringify(r));
      await p.context().close();
    }

    // The press: a key goes in while held and springs back when let go.
    p = await page();
    await p.goto(B + '/owner/');
    await p.waitForSelector('.lock--3d, .lock--flat');
    await p.locator('#code').focus();
    const k5 = p.locator('.lock__key[data-key="5"]');
    const kb = await k5.boundingBox();
    await p.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2);
    await p.mouse.down();
    await wait(120);
    const down = await k5.evaluate(k => ({ pressed: k.classList.contains('is-pressed'), t: getComputedStyle(k).transform, sh: getComputedStyle(k).boxShadow }));
    await p.mouse.up();
    await wait(700);                     // the spring has settled
    const up = await k5.evaluate(k => ({ pressed: k.classList.contains('is-pressed'), t: getComputedStyle(k).transform }));
    const focusKept = await p.evaluate(() => document.activeElement && document.activeElement.id === 'code');
    check(down.pressed && down.t !== 'none' && /inset/.test(down.sh) && !up.pressed && (up.t === 'none' || Math.abs(parseFloat((up.t.match(/matrix\(([-\d.e]+)/) || [])[1]) - 1) < 0.002),
      'a key moves in (transform, inset shadow) while pressed and springs back on release', JSON.stringify({ down, up }));
    check(focusKept && await p.inputValue('#code') === '5', 'the press put one digit in the field, and focus stayed in the field');
    const go = p.locator('[data-lock-go]');
    const gb = await go.boundingBox();
    await p.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
    await p.mouse.down();
    await wait(100);
    const goT = await go.evaluate(b => getComputedStyle(b).transform);
    await p.mouse.move(5, 5);
    await p.mouse.up();
    check(goT !== 'none', 'Unlock presses in the same way (Clear shares the rule)', goT);
    // A typed digit presses its key too.
    await p.locator('#code').focus();
    await p.keyboard.down('7');
    const typed = await p.evaluate(() => document.querySelector('.lock__key[data-key="7"]').classList.contains('is-pressed'));
    await p.keyboard.up('7');
    check(typed && await p.inputValue('#code') === '57', 'a digit typed on the keyboard presses the matching key');
    await p.click('[data-lock-clear]');
    check(await p.inputValue('#code') === '', 'Clear empties the field');
    check(p.errors.length === 0, 'no errors on the lock', p.errors.join(' | '));
    await p.context().close();

    // Fast repeated taps: every tap is one digit, none lost, none doubled.
    p = await page({ viewport: { width: 360, height: 640 }, hasTouch: true });
    await p.goto(B + '/owner/');
    await p.waitForSelector('.lock--3d, .lock--flat');
    const seq = '1111222233330000';
    for (const d of seq) await p.tap(`.lock__key[data-key="${d}"]`, { delay: 0 });
    r = await p.evaluate(() => ({ v: document.querySelector('#code').value, dots: document.querySelector('[data-lock-dots]').textContent.length,
                                  active: document.activeElement.tagName }));
    check(r.v === seq && r.dots === seq.length, '16 rapid taps, the same key repeatedly: exactly 16 digits, in order', JSON.stringify(r));
    check(r.active !== 'INPUT', 'tapping keys does not focus the field, so the phone keyboard stays closed', r.active);
    await p.tap('[data-lock-clear]');

    // A wrong code: red, the same for the whole ring, and gone at the next key.
    for (const d of '00000001') await p.tap(`.lock__key[data-key="${d}"]`);
    await p.tap('[data-lock-go]');
    await p.waitForFunction(() => /Not accepted/.test(document.querySelector('[data-lock-msg]').textContent));
    // The halo fades in over .35s: wait for it to finish, however slow the machine.
    await p.waitForFunction(() => getComputedStyle(document.querySelector('.lock__halo')).opacity === '1', null, { timeout: 4000 }).catch(() => {});
    r = await p.evaluate(() => { const v = document.querySelector('[data-view="lock"]'); const h = getComputedStyle(document.querySelector('.lock__halo'));
      return { err: v.classList.contains('lock--err'), ok: v.classList.contains('lock--ok'), op: h.opacity, sh: h.boxShadow, msg: document.querySelector('[data-lock-msg]').textContent }; });
    check(r.err && !r.ok && r.op === '1' && /232, 72, 72/.test(r.sh), 'a wrong code turns the ring red, never green', JSON.stringify(r));
    check(!/\d+ of|digit|position|first|last|correct/i.test(r.msg.replace(/\d+ tries left/, '')), 'and the message says nothing about any digit', r.msg);
    await p.tap('.lock__key[data-key="4"]');
    check(await p.evaluate(() => !document.querySelector('[data-view="lock"]').classList.contains('lock--err')), 'the next key press clears the red');
    await p.tap('[data-lock-clear]');
    for (const d of '00000002') await p.tap(`.lock__key[data-key="${d}"]`);
    await p.tap('[data-lock-go]');
    await p.waitForSelector('.lock--err');
    await p.tap('[data-lock-clear]');
    check(await p.evaluate(() => !document.querySelector('[data-view="lock"]').className.match(/lock--(err|ok)/)), 'and so does Clear: the ring is dark again');

    // The right code: nothing green until the server has said yes.
    let release;
    const held = new Promise(res => { release = res; });
    await p.route('**/review-api/owner.php', async route => {
      if (route.request().method() === 'POST' && /"login"/.test(route.request().postData() || '')) { await held; }
      await route.continue();
    });
    for (const d of s.code) await p.tap(`.lock__key[data-key="${d}"]`);
    await p.tap('[data-lock-go]');
    const during = [];
    for (let i = 0; i < 6; i++) { await wait(150); during.push(await p.evaluate(() => document.querySelector('[data-view="lock"]').className)); }
    release();
    await p.waitForSelector('.lock--ok', { timeout: 5000 }).catch(() => {});
    await p.waitForFunction(() => getComputedStyle(document.querySelector('.lock__halo')).opacity === '1', null, { timeout: 4000 }).catch(() => {});
    const after = await p.evaluate(() => ({ cls: document.querySelector('[data-view="lock"]').className, sh: getComputedStyle(document.querySelector('.lock__halo')).boxShadow }));
    check(during.every(c => !/lock--ok|lock--err/.test(c)), 'while the server is still checking, the ring stays dark (no early green)', during.join(' / '));
    check(/lock--ok/.test(after.cls) && /52, 211, 153/.test(after.sh), 'after the server accepts the code, the ring glows emerald', JSON.stringify(after));
    check(await p.waitForSelector('[data-view="dash"]:not([hidden])', { timeout: 8000 }).then(() => true).catch(() => false), 'and the dashboard opens');
    check(p.errors.length === 0, 'no errors through wrong, cleared and right codes', p.errors.join(' | '));
    await p.context().close();

    // Reduced motion: the press and the ring still show, without movement.
    p = await page({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await p.goto(B + '/owner/');
    await p.waitForSelector('.lock--3d, .lock--flat');
    const k1 = await p.locator('.lock__key[data-key="1"]').boundingBox();
    await p.mouse.move(k1.x + 20, k1.y + 20);
    await p.mouse.down();
    await wait(60);
    r = await p.evaluate(() => { const k = document.querySelector('.lock__key[data-key="1"]'); return { pressed: k.classList.contains('is-pressed'), t: getComputedStyle(k).transform, sh: getComputedStyle(k).boxShadow }; });
    await p.mouse.up();
    check(r.pressed && r.t === 'none' && /inset/.test(r.sh) && await p.inputValue('#code') === '1',
      'under prefers-reduced-motion a key still shows it is pressed (shading), but does not move', JSON.stringify(r));
    await p.context().close();

    /* ------------------------------------------------------------------ */
    section('Deleting an invitation');
    p = await page();
    await signIn(p);
    const sess = await (await p.request.get(B + '/review-api/owner.php?action=session')).json();
    const mk = async name => (await (await p.request.post(B + '/review-api/owner.php', { headers: { 'X-CSRF-Token': sess.csrf },
      data: { action: 'create', name, phone: '+91 90000 00077', stay_from: '2026-10-10', stay_to: '2026-10-12', require_check: false } })).json());
    const dA = await mk('Test Guest Delete A');
    const dB = await mk('Test Guest Delete B');
    const listInv = async () => (await (await p.request.get(B + '/review-api/owner.php?action=dashboard')).json()).invitations;
    await p.click('[data-refresh]');
    await p.click('[data-tab="invitations"]');
    await p.waitForSelector(`[data-del="${dA.id}"]`);
    r = await p.evaluate(() => [...document.querySelectorAll('[data-panel="invitations"] .acard')].map(c => ({
      used: !!c.querySelector('.acard__status.is-used'), bin: !!c.querySelector('.acard__del') })));
    check(r.some(x => x.bin) && r.filter(x => x.used).every(x => !x.bin), 'open invitations show a bin; used ones (with a review) do not', JSON.stringify(r));
    const nBefore = (await listInv()).length;
    const binBox = await p.locator(`[data-del="${dA.id}"]`).boundingBox();
    check(binBox.width >= 44 && binBox.height >= 44, 'the bin is a 44px touch target', JSON.stringify(binBox));
    await p.click(`[data-del="${dA.id}"]`);
    r = await p.evaluate(() => ({ open: document.querySelector('[data-delete-dialog]').open, h: document.querySelector('#del-h').textContent,
      t: document.querySelector('[data-del-text]').textContent, focus: document.activeElement.textContent }));
    check(r.open && r.h === 'Delete invitation?' && r.t.includes('Test Guest Delete A') && /permanently/.test(r.t) && /never be used again/.test(r.t) && r.focus === 'Cancel',
      'the bin opens "Delete invitation?", naming the guest, saying it is permanent and the link dies; Cancel has focus', JSON.stringify(r));
    await p.click('[data-del-cancel]');
    check(!(await p.evaluate(() => document.querySelector('[data-delete-dialog]').open)) && (await listInv()).length === nBefore
      && await p.locator(`[data-del="${dA.id}"]`).count() === 1, 'Cancel closes it and changes nothing');
    await p.click(`[data-del="${dA.id}"]`);
    await p.keyboard.press('Escape');
    check((await listInv()).length === nBefore, 'Escape cancels too');
    const delReqs = [];
    p.on('request', q => { if (q.method() === 'POST' && /"delete"/.test(q.postData() || '')) delReqs.push(q.postData()); });
    await p.click(`[data-del="${dA.id}"]`);
    await p.dblclick('[data-del-go]');
    await p.waitForFunction(() => /Deleted/.test(document.querySelector('[data-dash-msg]').textContent));
    await wait(300);
    const after2 = await listInv();
    check(delReqs.length === 1 && JSON.parse(delReqs[0]).id === dA.id, 'Delete sends exactly one request, for that invitation, even on a double tap', JSON.stringify(delReqs));
    check(after2.length === nBefore - 1 && !after2.some(x => x.id === dA.id) && after2.some(x => x.id === dB.id),
      'only that invitation is gone; the others, including one made at the same moment, stay', JSON.stringify(after2.map(x => x.id)));
    check(await p.locator(`[data-del="${dA.id}"]`).count() === 0 && /Its link no longer works/.test(await p.textContent('[data-dash-msg]')),
      'the dashboard refreshes and says it is done');
    const tokA = dA.link.split('#t=')[1];
    const g = await (await p.request.post(B + '/review-api/invite.php', { data: { action: 'check', token: tokA } }));
    check(g.status() === 410, 'the deleted invitation\'s link is dead', String(g.status()));
    // The request carries the CSRF header: the page sent it, and without it the server says no.
    const noCsrf = await p.request.post(B + '/review-api/owner.php', { data: { action: 'delete', id: dB.id } });
    check(noCsrf.status() === 403 && (await listInv()).some(x => x.id === dB.id), 'a delete without the CSRF token is refused (403) and deletes nothing', String(noCsrf.status()));
    check(p.errors.length === 0, 'no errors on the dashboard', p.errors.join(' | '));
    await p.context().close();

    /* ------------------------------------------------------------------ */
    section('16. The guest page at 390 and 1440');
    const own = await browser.newContext({ baseURL: B });
    const lr = await own.request.post('/review-api/owner.php', { data: { action: 'login', code: s.code } });
    const csrf = (await lr.json()).csrf;
    const mkLink = async check => {
      const j = await (await own.request.post('/review-api/owner.php', { headers: { 'X-CSRF-Token': csrf },
        data: { action: 'create', name: 'Test Guest Layout', phone: '+91 90000 00066', stay_from: '2026-10-10', stay_to: '2026-10-12', require_check: check } })).json();
      return j.link.replace(/^https?:\/\/[^/]*/, B);
    };
    for (const [w, h] of [[390, 844], [1440, 900]]) {
      p = await page({ viewport: { width: w, height: h } });
      await p.goto(await mkLink(false));
      await p.waitForSelector('[data-view="form"]:not([hidden])');
      r = await p.evaluate(() => {
        const small = [...document.querySelectorAll('[data-view="form"] button, [data-view="form"] .gstars label, [data-view="form"] textarea')]
          .map(e => e.getBoundingClientRect()).filter(b => b.width && (b.height < 44 || b.width < 44)).length;
        return { sw: document.documentElement.scrollWidth, small, name: document.querySelector('[data-name]').textContent,
                 editable: !!document.querySelector('[data-view="form"] input[name="name"]') };
      });
      check(r.sw === w, `16. ${w}px: no horizontal scroll`, r.sw);
      check(r.small === 0, `16. ${w}px: every button, star and the text box is at least 44px`, r.small);
      check(r.name === 'Test Guest Layout' && !r.editable, `16. ${w}px: the name comes from the invitation and is not an input`);
      // keyboard only: stars are radio buttons
      await p.focus('#r1'); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight');
      check(await p.evaluate(() => document.querySelector('input[name=rating]:checked')?.value) === '3', `16. ${w}px: stars work from the keyboard`);
      await p.fill('textarea[name=body]', 'short');
      await p.click('[data-send]');
      check((await p.textContent('[data-form-msg]')).includes('at least 20'), `16. ${w}px: too short is caught before sending, with a plain message`);
      await p.context().close();
    }
    // Names are required now: no tick box, and the form says what will show.
    p = await page({ viewport: { width: 390, height: 844 } });
    await p.goto(await mkLink(false));
    await p.waitForSelector('[data-view="form"]:not([hidden])');
    r = await p.evaluate(() => ({ boxes: document.querySelectorAll('[data-view="form"] input[type="checkbox"]').length,
      shown: document.querySelector('[data-shown]').textContent }));
    check(r.boxes === 0 && /your name/.test(r.shown) && /dates of your stay/.test(r.shown),
      'the guest form has no "show my name" tick box, and says the name and stay dates will appear', JSON.stringify(r));
    await p.click('label[for="r4"]');
    await p.fill('textarea[name=body]', 'Test text sent from the form, not a real review.');
    const sent = p.waitForRequest(q => q.method() === 'POST' && /"submit"/.test(q.postData() || ''));
    await p.click('[data-send]');
    const body = JSON.parse((await sent).postData());
    await p.waitForSelector('[data-view="thanks"]:not([hidden])');
    const waiting = (await (await own.request.get('/review-api/owner.php?action=dashboard')).json()).waiting;
    const mine = waiting.find(x => x.body === 'Test text sent from the form, not a real review.');
    check(!('consent' in body) && mine && mine.consent === true && /with your name/.test(await p.textContent('[data-thanks-line]')),
      'a review sent from the form carries no consent field and is stored to show the name', JSON.stringify({ body: Object.keys(body), mine: mine && mine.consent }));
    check(p.errors.length === 0, 'no errors on the guest form', p.errors.join(' | '));
    await p.context().close();
    await own.close();

    /* ------------------------------------------------------------------ */
    section('18-19. The existing page still works');
    p = await page();
    await p.goto(B + '/web/', { waitUntil: 'load' });
    await p.waitForSelector('.stack-row');
    r = await p.evaluate(() => ({
      stacks: document.querySelectorAll('.stack-row').length,
      tiles: document.querySelectorAll('[data-hero-mosaic] .tile').length,
      filmSrc: document.querySelector('[data-tour]').getAttribute('src'),
      wa: document.querySelector('.foot a.btn').getAttribute('href'),
      order: [...document.querySelectorAll('.after > section, .after > footer')].map(e => e.id),
      navIds: [...document.querySelectorAll('#nav-list a')].map(a => a.getAttribute('href')),
      h1: document.querySelectorAll('h1').length,
    }));
    check(r.stacks === 3 && r.tiles === 10, '19. the gallery\'s three stacks and the ten-tile mosaic still build', JSON.stringify(r));
    check(r.filmSrc === null, '19. the film is still not fetched on load');
    check(r.wa.startsWith('https://wa.me/919448647831?text='), '18. the footer still opens WhatsApp with 94486 47831');
    check(JSON.stringify(r.order) === JSON.stringify(['gallery', 'reviews', 'visit', 'venue']), '#reviews sits between #gallery and #visit', JSON.stringify(r.order));
    check(r.navIds.join() === '#top,#story,#grounds,#explore,#gallery,#reviews,#visit,#venue', 'the menu has Reviews between Photographs and Contact', r.navIds.join());
    check(p.errors.length === 0, 'no console errors on the homepage', p.errors.join(' | '));
    await p.context().close();
    // The desktop menu still clears the logo at its narrowest (821px), with an eighth link.
    p = await page({ viewport: { width: 821, height: 800 } });
    await p.goto(B + '/web/', { waitUntil: 'load' });
    await p.waitForSelector('[data-reviews-nav]:not([hidden])');
    r = await p.evaluate(() => {
      const nav = document.querySelector('.nav__list').getBoundingClientRect(), brand = document.querySelector('.brand').getBoundingClientRect();
      return { gap: Math.round(nav.left - brand.right), h: Math.round(nav.height) };
    });
    check(r.gap >= 12 && r.h < 60, '821px: with "Reviews" added the menu stays on one line and clear of the logo', JSON.stringify(r));
    await p.context().close();

    /* ------------------------------------------------------------------ */
    section('20. The backend is unavailable');
    const cases = {
      'request aborted': route => route.abort(),
      '500': route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false,"error":"server"}' }),
      'GitHub Pages: the PHP as plain text': route => route.fulfill({ status: 200, contentType: 'application/octet-stream', body: fs.readFileSync(path.join(ROOT, 'review-api/public.php')) }),
      'HTML error page': route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>Service unavailable</html>' }),
      'JSON but not ok': route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' }),
      'JSON garbage': route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"reviews":[{"name":5}]}' }),
      'no answer for 8 seconds': async route => { await wait(8000); route.abort().catch(() => {}); },
    };
    for (const [name, handler] of Object.entries(cases)) {
      p = await page({ viewport: { width: 390, height: 844 } });
      await p.route('**/review-api/public.php*', handler);
      const t0 = Date.now();
      await p.goto(B + '/web/', { waitUntil: 'load' });
      await p.waitForTimeout(name.startsWith('no answer') ? 6000 : 800);
      r = await p.evaluate(() => ({ s: document.querySelector('[data-reviews]').hidden, n: document.querySelector('[data-reviews-nav]').hidden, stacks: document.querySelectorAll('.stack-row').length }));
      check(r.s && r.n && r.stacks === 3 && p.errors.length === 0, `20. ${name}: section and menu link hidden, gallery fine, no errors`, JSON.stringify(r) + p.errors.join('|'));
      if (name.startsWith('no answer')) check(Date.now() - t0 < 12000, '20. a hung API never holds the page: load fired and the 5s timeout gave up');
      await p.context().close();
    }

    /* ------------------------------------------------------------------ */
    section('25. The slider');
    p = await page({ viewport: { width: 390, height: 844 } });
    await p.goto(B + '/web/', { waitUntil: 'load' });
    await p.waitForSelector('[data-reviews]:not([hidden]) .rcard');
    await p.evaluate(() => document.querySelector('#reviews').scrollIntoView());
    await p.mouse.move(5, 5);
    const x0 = await p.$eval('[data-review-track]', t => t.scrollLeft);
    await p.waitForTimeout(5000);
    const x1 = await p.$eval('[data-review-track]', t => t.scrollLeft);
    check(x1 > x0 + 20, '25. it drifts sideways on its own (more than 3 reviews, more than fit)', `${x0} -> ${x1}`);
    await p.hover('[data-review-track] .rcard');
    await p.waitForTimeout(300);
    const h0 = await p.$eval('[data-review-track]', t => t.scrollLeft);
    await p.waitForTimeout(1500);
    const h1 = await p.$eval('[data-review-track]', t => t.scrollLeft);
    check(h1 === h0, '25. it stops while the mouse is over it', `${h0} -> ${h1}`);
    await p.mouse.move(5, 5);
    await p.focus('[data-review-track]');
    const f0 = await p.$eval('[data-review-track]', t => t.scrollLeft);
    await p.waitForTimeout(1500);
    check(await p.$eval('[data-review-track]', t => t.scrollLeft) === f0, '25. it stops while it has keyboard focus');
    await p.evaluate(() => document.activeElement.blur());
    // A hand scroll: the visitor drags it; it holds still for a while after.
    await p.$eval('[data-review-track]', t => { t.scrollLeft = 40; t.dispatchEvent(new TouchEvent('touchstart', { bubbles: true })); t.dispatchEvent(new TouchEvent('touchend', { bubbles: true })); });
    await p.waitForTimeout(1500);
    const s1 = await p.$eval('[data-review-track]', t => t.scrollLeft);
    check(s1 === 40, '25. after a touch or a hand scroll it stays where the visitor left it', s1);
    await p.click('[data-review-months] button:last-child');      // the oldest month: 2 reviews
    await p.waitForTimeout(300);
    r = await p.evaluate(() => ({ n: document.querySelectorAll('.rcard').length, st: document.querySelector('[data-reviews]').reviewsMotion(),
      pressed: document.querySelector('[data-review-months] [aria-pressed="true"]').textContent }));
    check(r.n === 2 && r.pressed === 'September 2026' && r.st.enabled === false, '25. a month chip filters, and with 1-3 reviews the slider stays still', JSON.stringify(r));
    await p.click('[data-review-months] button:nth-child(2)');
    r = await p.evaluate(() => [...document.querySelectorAll('.rcard')].map(c => ({ m: c.dataset.month, d: c.querySelector('.rcard__date').textContent })));
    check(r.length > 0 && r.every(x => x.m === '2026-10'), '15. "October 2026" shows only reviews written in October', JSON.stringify(r));
    check(r.every(x => /^\d{1,2}( [A-Z][a-z]{2})?( \d{4})?\s?–\s?\d{1,2} [A-Z][a-z]{2} \d{4} · \d+ nights?$/.test(x.d)) && r.some(x => x.d === '28 Sep – 1 Oct 2026 · 3 nights'),
      'each card shows the stay (check-in, check-out, nights) where it used to show a date', r.map(x => x.d).join(', '));
    await p.context().close();

    p = await page({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await p.goto(B + '/web/', { waitUntil: 'load' });
    await p.waitForSelector('[data-reviews]:not([hidden]) .rcard');
    await p.evaluate(() => document.querySelector('#reviews').scrollIntoView());
    await p.waitForTimeout(4000);
    r = await p.evaluate(() => ({ x: document.querySelector('[data-review-track]').scrollLeft, st: document.querySelector('[data-reviews]').reviewsMotion() }));
    check(r.x === 0 && r.st.enabled === false, '25. under prefers-reduced-motion it never moves', JSON.stringify(r));
    await p.context().close();

    /* ------------------------------------------------------------------ */
    section('The off switch, in the browser');
    setEnabled(s, false);
    await wait(300);
    p = await page();
    await p.goto(B + '/web/', { waitUntil: 'load' });
    await p.waitForTimeout(800);
    const homeHidden = await p.evaluate(() => document.querySelector('[data-reviews]').hidden);
    await p.goto(B + '/owner/');
    const ownerPaused = await p.waitForSelector('[data-view="paused"]:not([hidden])', { timeout: 5000 }).then(() => true).catch(() => false);
    const threeLoaded = await p.evaluate(() => performance.getEntriesByType('resource').some(e => e.name.includes('three-')));
    await p.goto(B + '/review/#t=' + 'A'.repeat(43));
    const guestPaused = await p.waitForSelector('[data-view="paused"]:not([hidden])', { timeout: 5000 }).then(() => true).catch(() => false);
    check(homeHidden && ownerPaused && guestPaused, 'REVIEWS_ENABLED off: homepage section hidden, /owner/ and /review/ show the paused page', JSON.stringify({ homeHidden, ownerPaused, guestPaused }));
    check(!threeLoaded, 'and the paused owner page does not download Three.js');
    setEnabled(s, true);
    await p.context().close();

    p = await page();
    await p.goto(B + '/web/', { waitUntil: 'load' });
    await p.waitForTimeout(500);
    const three = await p.evaluate(() => performance.getEntriesByType('resource').some(e => e.name.includes('three-')));
    check(!three, 'the homepage never loads Three.js');
    await p.context().close();
  } catch (e) {
    bad('the browser suite crashed', e.stack);
  } finally {
    await browser.close();
    await stop(s);
  }
  console.log(`\n  ${PASS} passed, ${FAIL} failed`);
  process.exit(FAIL ? 1 : 0);
})();
