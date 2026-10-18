# Deploying to Hostinger

The site is static: HTML, CSS, JavaScript, fonts, photographs and three videos.
Enquiries go straight to WhatsApp or the phone from plain links on the page.

The one server-side part is the **guest review system** (`review-api/`, PHP 8
and MySQL on this same plan). It needs a database and a config file once,
before it is switched on. See section 5. Until then, the homepage simply does
not show a reviews section.

(There used to be a booking form backed by `api/booking.php` and an approved
WhatsApp template. It was removed at the owner's request. CLAUDE.md says how to
recover it from history if it is ever wanted back.)

---

## 0. How it is actually deployed now

benakahomestay.com is set to **Git auto-deploy from the `main` branch** of
`ajvizganapathy-pixel/benaka-homestay` into `public_html`. It was configured
through the Hostinger API on 27 Sep 2026, and in hPanel it lives under
Websites → Manage → Advanced → Git. **Pushing to `main` is the whole deploy.**
The manual upload below is only for rebuilding the site from scratch somewhere
else.

## 1. What to upload

Put these into `public_html`:

```
public_html/
  .htaccess
  index.html          redirect stub -> web/ (a fallback; see below)
  web/                index.html, css/, js/, fonts/, favicon-64.png, apple-touch-icon.png
  assets/
    raw/              the property photographs
    brand/            the hero stills and the logo
    video/            the property film, its poster, and the two hero loops
    manifest.json
```

**Do not upload.** None of this is needed in production:

| | why |
|---|---|
| `assets/scenes/`, `assets/handoff/`, `assets/clips/` | stills and clips from the rejected render chain |
| `render/` | the render pipeline and its working files |
| `docs/`, `tools/` | this guide and the test suite |
| `.git/`, `.gitignore`, `CLAUDE.md`, `README.md` | development files |

`.htaccess` denies `render/`, `docs/`, `tools/` and `assets/handoff/` anyway,
so an accidental upload does not expose anything. It is still dead weight.

Upload **both** `.htaccess` and the root `index.html`, because they do different jobs.
`.htaccess` gives you a clean `/`. It maps the root to `web/index.html` with an
*internal* rewrite, so visitors never see `/web/` in the address bar. It also
redirects `/web/` back to `/`, so the page only ever has one URL. The root
`index.html` takes over only where `.htaccess` is ignored, such as a server with
`AllowOverride None` or a move to non-Apache hosting. Then it redirects to
`web/` rather than showing a directory listing.

---

## 2. Check it renders

Open the domain. You should see, in order:

- **The hero with the round logo top left.** The Benaka mark sits over the photograph,
  and on a wide screen the section links sit top right. After the page loads, the
  man at the pool edge starts kicking his feet and the birds cross the sky.
- **On a phone:** a *Menu* button top right opens the full-screen section list. The
  phone's Back button closes it (and the photo viewer) rather than leaving the
  site. Tapping the logo returns to the top.
- **The rest of the page:** the story, the grounds mosaic, the film, the three
  photograph stacks, the footer with the WhatsApp and call numbers, and the venue.

If the type falls back to a system serif, `web/fonts/` did not upload. The fonts
are self-hosted; there is no CDN to fall back to.

If the hero never moves, check that `assets/video/hero-loop.mp4` (phones) and
`hero-loop-wide.mp4` (desktop) uploaded. A missing loop is not visible as an error,
because the still simply stays.

---

## 3. Local development

```bash
php -S localhost:8765 -t .        # then http://localhost:8765/
# or: python3 -m http.server 8765 (no PHP: the reviews section stays hidden)
```

```bash
bash tools/test.sh                   # the full suite
bash tools/check-css-invariants.sh   # after ANY edit to web/css/site.css
```

---

## 4. Changing a phone number

Every number lives in `web/index.html`, in two places: the footer (`#visit`) and
the venue block (`#venue`). Calls use `tel:+91…` and WhatsApp uses
`https://wa.me/91…`. `tools/test.sh` fails if any contact link carries a number
that is not on its list of the owner's numbers. That list is deliberate: a typo in a
number does not look broken, it just dials a stranger. When a number changes,
change it in both places **and** in that check.

---

## 5. Guest reviews: first-time setup

Do these **in this order, and only after the owner has said "deploy"**. Steps
1 to 4 change nothing visible. Merging the PR (step 5) is the deploy itself,
because Hostinger pulls `main` within a minute. The code is set in step 6,
after the merge, because `/owner/` exists on the server only once it is
deployed.

The account's paths, read from the Hostinger API on 15 Oct 2026:

```
/home/u531905492/domains/benakahomestay.com/                         <- config goes HERE
/home/u531905492/domains/benakahomestay.com/public_html/              <- the repo (Git deploy)
```

PHP is 8.3 with `pdo_mysql` on and no `open_basedir`, so the site's PHP can read
and write that folder above `public_html`.

1. **Back up.** hPanel → Files → Backups: generate a backup of the files and of
   the databases. (There is no database yet, so this is the files.)
2. **Create the database.** hPanel → Databases → Management: create a database
   and a user, and give the user all privileges on that database. Note the full
   names (`u531905492_…`) and the password. The password goes only into the
   config file in step 4, never into chat or git.
3. **Create the tables.** hPanel → Databases → phpMyAdmin → that database →
   Import → `migrations/001_guest_reviews.sql` (download it from the repo). It
   only creates tables whose names start `gr_` and one view. It alters or drops
   nothing, and it can be run twice safely.
4. **Place the config.** hPanel → Files → File Manager → go **up one level**
   from `public_html` into `domains/benakahomestay.com/` → new file
   `benaka-reviews-config.php`. Paste in `review-api/config.example.php`, then
   fill in:
   - `DB_DSN`: `mysql:host=127.0.0.1;port=3306;dbname=<database>;charset=utf8mb4`
   - `DB_USER`, `DB_PASS`: from step 2
   - `PEPPER`: 32+ random characters (any password generator)
   - `SETUP_KEY`: a phrase of 20+ characters that only the owner knows
   - leave `OWNER_CODE_HASH` empty and `REVIEWS_ENABLED` **false** for now
5. **Merge the PR.** That is the deploy. With `REVIEWS_ENABLED` still false,
   nothing visible changes: the homepage has no reviews section, and `/owner/`
   and `/review/` say "paused".
6. **Switch on, and the owner sets their code.** Set `REVIEWS_ENABLED` to
   `true` in the config, then open `https://benakahomestay.com/owner/`. With
   no code set yet, the page shows *Choose your code*. (It is the same page in
   the same order whoever opens it, and it is useless without the setup
   phrase.) Type the setup phrase, then the code twice: digits only, 8 or
   more. The server writes only an Argon2id hash, to `benaka-owner-code.hash`
   beside the config, and signs the owner in. Then empty `SETUP_KEY` in the
   config again. The code never passes through chat, git or any log.
   - If the page says the server cannot make an Argon2id hash: hPanel →
     Advanced → PHP Configuration → PHP extensions → turn on **sodium**, save,
     try again.
   - If the page says it could not write the code file, it shows the hash
     instead. Paste it into `OWNER_CODE_HASH` in the config and reload.
   The homepage still shows no reviews section until the first review is
   approved.
7. **Smoke test.** Sign in, create an invitation for "Test Guest Live" to the
   owner's own number, open the link in a private window, submit, approve,
   check the homepage, then take it down from Published and revoke anything
   left. Then run the live checks below.

### Later migrations: run them BEFORE merging

Each one is additive and safe on a live site. Run it in phpMyAdmin first,
because the code that needs it goes live within a minute of the merge.

- **002 — stay dates on reviews** (`migrations/002_review_stay_dates.sql`).
  It adds two empty columns, `stay_from` and `stay_to`, to `gr_reviews`, and
  copies the stay onto every review whose invitation still exists. It also
  widens `gr_public_reviews` by those two columns. Take an hPanel database
  backup, then phpMyAdmin → the database → **SQL** tab → paste the file → Go.
  Run it once: a second run stops at "Duplicate column name" and changes
  nothing. Undo with `002_review_stay_dates.down.sql`, after reverting the code.

### Live checks (only the live server can answer these)

```bash
for p in review-api/lib/db.php review-api/lib/ migrations/001_guest_reviews.sql migrations/002_review_stay_dates.sql \
         tests/reviews/harness.php review-api/config.example.php; do
  printf '%s  ' "$(curl -s -o /dev/null -w '%{http_code}' https://benakahomestay.com/$p)"; echo "$p"
done                       # every line must be 403 or 404
curl -sI https://benakahomestay.com/owner/ | grep -i x-robots-tag      # noindex, nofollow
curl -s  https://benakahomestay.com/review-api/public.php              # {"ok":true,...}
curl -sI https://benakahomestay.com/review-api/public.php | grep -iE 'cache-control|content-type'
```

### Turning it off, and rolling back

In this order, and stop at the first step that fixes it:

1. **Switch off.** In the config, `REVIEWS_ENABLED => false`. It takes effect on
   the next request. The homepage section hides, `/owner/` and `/review/` say
   "paused", and the API stops touching the database. Nothing is deleted.
2. **Revert the merge.** On GitHub, revert the PR's merge commit into `main`.
   Auto-deploy puts the previous site back within a minute. The branch
   `backup/pre-reviews-2026-10-15` points at the last commit before reviews.
3. **Drop the tables, only if they are truly unwanted.** Take a database
   backup, then run `migrations/001_guest_reviews.down.sql` in phpMyAdmin. It
   drops only the `gr_` tables and the view. This deletes every review.

### Changing the code later

Delete `benaka-owner-code.hash` beside the config (and clear `OWNER_CODE_HASH`
if it was pasted there), put a new `SETUP_KEY` in the config, and open
`/owner/` again.

### If the owner is locked out

Five wrong codes lock sign-in for 30 minutes, for every device. Anyone who knows
the address can trigger that on purpose; they still cannot get in. To lift it
early, in phpMyAdmin: `DELETE FROM gr_login_locks;`.
