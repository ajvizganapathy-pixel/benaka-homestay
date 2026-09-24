# Deploying to Hostinger

The site is static: HTML, CSS, JavaScript, fonts, photographs and three videos.
There is no server-side code, no database and nothing to configure. Enquiries go
straight to WhatsApp or the phone from plain links on the page.

(There used to be a booking form backed by `api/booking.php` and an approved
WhatsApp template. It was removed at the owner's request. CLAUDE.md says how to
recover it from history if it is ever wanted back.)

---

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
# or: python3 -m http.server 8765 — either works now there is no PHP
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
