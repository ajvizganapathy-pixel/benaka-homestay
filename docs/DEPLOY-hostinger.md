# Deploying to Hostinger

The site is static. PHP is needed only for the booking endpoint. Everything else
is plain files.

Read this once end to end before uploading. Steps 3 and 4 are the ones that take
real time, because Meta has to approve two message templates before a single
booking can reach the owner's phone.

---

## 1. What to upload

Put these into `public_html`:

```
public_html/
  .htaccess
  index.html          redirect stub -> web/ (a fallback; see below)
  web/                index.html, css/, js/, fonts/, scrub-engine.js, world.config.js
  assets/
    raw/              the 47 photographs
    scenes/           the 7 landscape canvases
    scenes/portrait/  the 7 portrait canvases  (phones need these)
    clips/            14 legs: leg-0N.mp4 and leg-0N-m.mp4
    manifest.json
  api/                booking.php, config.php  (config.php you create in step 4)
```

**Do not upload** — none of it is needed in production and some of it is large
or revealing:

| | why |
|---|---|
| `assets/handoff/` | 40 MB of render intermediates nothing on the site requests |
| `render/` | the render pipeline, ~135 MB of working files |
| `docs/` | this guide, which describes where the credentials live |
| `tools/`, `.github/` | the test suite and CI |
| `.git/`, `.gitignore`, `CLAUDE.md`, `README.md` | development files |

`.htaccess` denies all of the above anyway, so an accidental upload is not a
breach — but it is still 175 MB of nothing.

Upload **both** `.htaccess` and the root `index.html`. They do different jobs.
`.htaccess` is what gives you a clean `/`: it maps the root to `web/index.html`
with an *internal* rewrite, so visitors never see `/web/` in the address bar, and
it redirects `/web/` back to `/` so there is only ever one URL for the page. The
root `index.html` only takes over where `.htaccess` is ignored — a server with
`AllowOverride None`, or a move to non-Apache hosting — and then it redirects to
`web/` rather than showing a directory listing.

**PHP version:** hPanel → Advanced → PHP Configuration → **8.1 or newer**. The
endpoint uses typed properties and `never` return types and will not parse on
8.0. Required extensions — `curl`, `json`, `mbstring` — are on by default on
every Hostinger plan.

---

## 2. Check it renders before touching booking

Open the domain. You should get the name over the road, then seven beats of
walkthrough, then the tiled photographs, then the footer.

- **On a phone too.** Phones are served a separate portrait chain
  (`assets/clips/leg-0N-m.mp4` and `assets/scenes/portrait/`). If those did not
  upload, the beats fall back to the landscape clips and go noticeably soft.
- **If the type falls back to a system serif**, `web/fonts/` did not upload.
  The fonts are self-hosted; there is no CDN to fall back to.
- The BOOK button opens a panel that says *"Not taking live bookings yet"*.
  That is correct at this stage and it is the server saying so, not the page.

---

## 3. Set up WhatsApp — before you touch the server

This is the long pole. Do it first.

1. **Meta Business account.** business.facebook.com. The business needs to be
   **verified** before a permanent token and production messaging are available.
2. **Add the WhatsApp product** and a WhatsApp Business Account (WABA).
3. **Add and verify the sending number.** This is *not* the owner's personal
   number unless they are willing to lose WhatsApp on that handset — a number
   registered to the Cloud API can no longer be used in the normal WhatsApp app.
   Use a second number for sending. The owner's own number is only a
   *recipient*, and needs nothing done to it.
4. **Phone Number ID.** API Setup page. It is a long numeric id, not the phone
   number. → `WA_PHONE_ID`
5. **Create the two templates** (Meta Business Suite → WhatsApp Manager →
   Message templates). Both must be **APPROVED** before booking works.

   **a. The owner's notification.** Category **UTILITY**, language **English**,
   name `benaka_booking_request`. Body, verbatim:

   ```
   New booking request from the Benaka By The Hills website.

   Guest: {{1}}
   Coming from: {{2}}
   Phone: {{3}}
   WhatsApp: {{4}}
   Email: {{5}}
   Dates: {{6}}
   Received: {{7}}

   Reply to this guest on WhatsApp to confirm the stay.
   ```

   Sample values when Meta asks: `Anjan Ganapathy`, `Bengaluru`,
   `+919876543210`, `+919876543210`, `anjan@example.com`,
   `12 Oct 2026 to 15 Oct 2026 (3 nights)`, `6 Sep 2026, 14:20`.

   Two rules Meta enforces and this body respects: a template may not begin or
   end with a variable, and two variables may not be adjacent. Values may not
   contain line breaks — which is why the layout lives in the approved body and
   not in the data.

   **b. The guest's code.** Category **AUTHENTICATION**, language **English**,
   name `benaka_otp`. You do not write this body; Meta supplies fixed preset
   text and you pick the options:
   - Code delivery: **Copy code**. Not one-tap autofill — that needs an Android
     app signing hash, which a website does not have.
   - Tick **Add security recommendation**.
   - Tick **Add expiry time for the code**, set **10 minutes** (match
     `OTP_TTL_SECONDS`).

   > Sending a verification code as ordinary text instead of an authentication
   > template is grounds for Meta suspending the WhatsApp account. The endpoint
   > only ever sends templates, and there is no setting that makes it do
   > otherwise.

6. **Permanent access token.** Business Settings → Users → System Users → add a
   system user with the **whatsapp_business_messaging** and
   **whatsapp_business_management** permissions, assign the WABA, then generate a
   token with no expiry. → `WA_TOKEN`

   The 24-hour token on the API Setup page is for testing only. It will expire
   in the middle of a booking.

7. **Costs.** Meta charges per message. Utility and authentication messages are
   inexpensive in India (paise, not rupees) but they are not free, and the
   account needs a payment method or messages simply stop sending.

---

## 4. Switch booking on

Booking is inert until this is done. Until then the panel says so and nothing is
sent anywhere.

1. Copy `api/config.example.php` to **`api/config.php`** on the server — through
   hPanel's File Manager or SFTP, never through git. Every value is documented
   in the file itself.

2. Fill in: `OWNER_WHATSAPP_NUMBERS`, `WA_PHONE_ID`, `WA_TOKEN`, both template
   names, and `ALLOWED_ORIGINS`.

   `OWNER_WHATSAPP_NUMBERS` is a **list** — every number on it gets the same
   message, each send recorded separately, so one unreachable phone cannot lose
   a booking for the other. Digits with country code, no `+` and no spaces:

   ```php
   'OWNER_WHATSAPP_NUMBERS' => ['919448647831', '918861070431'],
   ```

   `ALLOWED_ORIGINS` must list **every** origin the site is served from, scheme
   included and no trailing slash. If both the bare domain and the `www` one
   resolve, list both, or the form will 403 for half your visitors:

   ```php
   'ALLOWED_ORIGINS' => ['https://yourdomain.com', 'https://www.yourdomain.com'],
   ```

3. **`DATA_DIR` must be outside `public_html`.** This is where the bookings
   live. The default climbs one level above the web root, which on Hostinger is
   right; if you are unsure, set the absolute path from File Manager:

   ```php
   'DATA_DIR' => '/home/uXXXXXXXX/domains/yourdomain.com/benaka-data',
   ```

   The endpoint refuses to run if this resolves inside the document root, and
   writes a deny rule into the folder as a second line of defence. **Back this
   folder up** — it is the booking book.

4. Set **`'CONFIGURED' => true`**.

5. Reload the site. That is the whole switch-on: no file in `web/` is edited,
   no build step runs. The page asks the endpoint what mode it is in, so the
   "not taking live bookings" notice disappears by itself.

**If the authentication template is not approved yet** and you want to launch
anyway, set `'OTP_CHANNEL' => 'email'` and an `OTP_EMAIL_FROM` address. The code
goes to the guest by email, the owner's WhatsApp notification still works (that
is the utility template, which approves faster), and you switch back to
`'whatsapp'` the day the other one clears.

### Verify it end to end, with a real booking

1. Open the site and send yourself a request through the form, using a phone
   number you can read WhatsApp on.
2. The code should arrive from the business number, in an authentication
   message with a **Copy code** button.
3. Enter it. The panel should say *"Sent to the owner on WhatsApp. Confirmation
   will reach you shortly."* and show a reference beginning `bk_`.
4. **Both** owner phones should have the booking, laid out as the template
   above, with the requested dates on the `Dates:` line.
5. `benaka-data/bookings/bk_….json` should exist, with
   `"delivery_status": "sent"`.

If step 4 fails but the panel says *"Saved. WhatsApp delivery did not go through
just now"* — that is the system working as designed. The request is not lost.
Read `benaka-data/error.log` and the record's `delivery_error` field; the
usual causes are an unapproved template, a wrong template name, an expired
token, or no payment method on the WhatsApp account.

---

## 5. Local development

```bash
php -S localhost:8765 -t .        # then http://localhost:8765/
```

**`php -S`, not `python3 -m http.server`** — the latter cannot execute
`api/booking.php`, so the booking form silently stays in preview.

With no `api/config.php` the site runs in preview: the whole flow works, the
code is `123456`, and the panel says plainly that nothing is delivered.

To exercise the real endpoint without any Meta credentials, point it at a
fixture with `WA_TRANSPORT => 'log'` — every send is written to
`DATA_DIR/wa-outbox.log` as the exact payload it would have posted:

```bash
BENAKA_CONFIG=/path/to/fixture-config.php php -S localhost:8765 -t .
```

That is how `tools/test.sh` drives the whole journey.

```bash
bash tools/test.sh                # the full suite
bash tools/check-css-invariants.sh   # after ANY edit to web/css/site.css
```

---

## 6. Optional: MySQL instead of files

Not implemented, and not needed. A homestay takes a handful of bookings a week;
JSON files outside the web root are atomic, locked, backed up by copying a
folder, and have nothing to misconfigure. If volume ever justifies a database,
the storage helpers in `api/booking.php` (`store_get`, `store_put`,
`atomic_write`) are the four functions to swap.

---

## 7. If PHP is unavailable

Delete `api/`, and point the BOOK button at a click-to-chat link:

```html
<a href="https://wa.me/91XXXXXXXXXX?text=I%20would%20like%20to%20book%20a%20stay">Book</a>
```

The guest's own WhatsApp opens with a message ready to send. No credentials, no
server, no cost — and no record kept, and nothing sent until the guest presses
send themselves.


---

## 8. Optional: confirm back to the guest automatically

The panel tells the guest that confirmation will reach them shortly, and today
that confirmation is the owner replying by hand — which for a homestay taking a
handful of bookings a week is the right amount of automation.

If you ever want it sent automatically, it needs a **third** approved template
(UTILITY, addressed to the guest, e.g. "We have your request for {{1}} — we will
confirm within the day"), a `WA_GUEST_TEMPLATE` config key, and one more
`wa_send_template()` call in `submitBooking` beside the owner loop. It is a
small change; it is left undone because an automatic "we got it" that arrives
before a human has looked at the dates is worth less than a real reply.
