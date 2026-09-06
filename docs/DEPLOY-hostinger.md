# Deploying to Hostinger

The site is static. PHP is needed only for the booking endpoint, and only once
you have WhatsApp credentials — everything else works as plain files.

## 1. Upload

Put the repository contents into `public_html` so the tree looks like this:

```
public_html/
  .htaccess
  index.html      redirect stub -> web/ (fallback; see below)
  web/            index.html, css/, js/, fonts/, scrub-engine.js, world.config.js
  assets/         raw/, scenes/ (+ scenes/portrait/), clips/, manifest.json
  api/            booking.php, config.php        (config.php you create)
```

Upload **both** `.htaccess` and the root `index.html`. They do different jobs:
`.htaccess` is what gives you a clean `/` — it maps the root to `web/index.html`
with an internal rewrite, so visitors never see `/web/` in the address bar. The
root `index.html` only takes over if `.htaccess` is ever ignored (a server with
`AllowOverride None`, or a move to non-Apache hosting), and then it redirects to
`web/` rather than showing a directory listing.

Use the hPanel File Manager or SFTP. The `.htaccess` at the root serves
`web/index.html` at `/`, so visitors never see `/web/` in the address.

Do **not** upload `.data/`, `render/`, `docs/` or `.git/`. They are not needed in
production and `.data/` must live outside the web root (step 3).

## 2. Check it renders

Open the domain. You should get the name over the road, then seven beats of
walkthrough, then the tiled photographs, then the footer. Check it on a phone
too: phones are served a separate portrait chain (`assets/clips/leg-0N-m.mp4`
and `assets/scenes/portrait/`), so if those did not upload the beats fall back to
the landscape clips and go soft. If the type falls back
to a system serif, `web/fonts/` did not upload — the fonts are self-hosted, there
is no CDN to fall back to.

## 3. Switch booking on

Booking is deliberately inert until you do this. Until then the panel says so and
nothing is sent anywhere.

1. **Get WhatsApp Cloud API credentials.** In Meta Business
   (business.facebook.com) add the WhatsApp product, then take the **Phone number
   ID** and a **permanent access token** for a system user from *API Setup*.
2. **Create `api/config.php`** by copying `api/config.example.php` and filling
   in: `OWNER_WHATSAPP` (digits with country code, no `+`), `WA_PHONE_ID`,
   `WA_TOKEN`, and your real domains in `ALLOWED_ORIGINS`. Then set
   `'CONFIGURED' => true`.
3. **Move the data directory out of the web root.** In `config.php` set
   `'DATA_DIR' => '/home/<your-user>/sherlock-data'` and create that folder with
   permissions `0700`. Leaving it under `public_html` would expose stored booking
   requests.
4. **Flip the client on**: in `web/js/api.js` set `const LIVE = true;`.
5. **Set PHP 8.1 or newer** in hPanel → Advanced → PHP Configuration. The
   endpoint uses typed properties and `never` return types.

Test with a real number: you should get a six-digit code on WhatsApp, and the
owner's number should get the request after you confirm.

### If you would rather not run PHP at all

Set `LIVE` to false and change the booking button to a `wa.me` link:
`https://wa.me/<owner-number>?text=<prefilled>`. You lose OTP and stored
requests, but it needs no server and works the moment you have the number.

## 4. Optional: MySQL instead of files

File storage is fine for a homestay's volume. To use MySQL, create a database in
hPanel, set `STORAGE`, `DB_*` in `config.php`, and create:

```sql
CREATE TABLE bookings (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  name      VARCHAR(80)  NOT NULL,
  from_city VARCHAR(80)  NOT NULL,
  phone     VARCHAR(20)  NOT NULL,
  whatsapp  VARCHAR(20)  NOT NULL,
  email     VARCHAR(190) NOT NULL,
  delivered TINYINT(1)   NOT NULL DEFAULT 0,
  created   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (email), INDEX (created)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 5. When the walkthrough clips arrive

Rendering the Higgsfield chain (see `render/run-chain.md`) produces
`assets/clips/leg-01..08.mp4`. Upload that folder and add one line per beat in
`web/world.config.js`:

```js
{ id: 'gate', …, clip: '../assets/clips/leg-02.mp4' },
```

Nothing else changes. The engine loads clips as blobs, so byte-range support on
the host is irrelevant, and the stills stay as posters and as the
reduced-motion fallback.
