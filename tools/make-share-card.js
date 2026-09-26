// Renders tools/share-card/card.html to assets/brand/share-card-photo.jpg - the
// og:image every link preview shows (WhatsApp, Instagram DMs, Facebook).
//
//   node tools/make-share-card.js
//
// Uses the Playwright that ships with this environment. The output must stay
// at or under 300KB: WhatsApp silently drops larger preview images, and the
// link then shares as bare text. Quality steps down until it fits.
//
// The file is served with a year-long immutable cache, so if the card ever
// changes, write it under a NEW name and update og:image in BOTH index.html
// files - otherwise browsers and Meta keep the old picture.
const path = require('path');
const fs = require('fs');
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'tools/share-card/card.html');
const OUT = path.join(ROOT, 'assets/brand/share-card-photo.jpg');
const LIMIT = 300 * 1024;

(async () => {
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.goto('file://' + SRC, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  let size = Infinity, q = 90;
  for (; q >= 60 && size > LIMIT; q -= 4) {
    await page.screenshot({ path: OUT, type: 'jpeg', quality: q,
                            clip: { x: 0, y: 0, width: 1200, height: 630 } });
    size = fs.statSync(OUT).size;
  }
  await browser.close();
  if (size > LIMIT) { console.error(`share-card-photo.jpg is ${size} bytes, over ${LIMIT}`); process.exit(1); }
  console.log(`wrote ${path.relative(ROOT, OUT)}: 1200x630, ${Math.round(size / 1024)}KB, quality ${q + 4}`);
})();
