<?php
/*
 * Guest reviews: server config TEMPLATE. Placeholders only, never real values.
 *
 * The real file is NOT in this repository and NOT in public_html. Copy this to
 * ONE LEVEL ABOVE public_html, named benaka-reviews-config.php:
 *
 *   /home/<user>/domains/benakahomestay.com/benaka-reviews-config.php   <- here
 *   /home/<user>/domains/benakahomestay.com/public_html/                <- the repo
 *
 * review-api/lib/bootstrap.php looks for it at dirname(<repo root>). Git
 * auto-deploy never touches that folder, so a deploy cannot overwrite or
 * publish it. (.htaccess also denies config.example.php and config.php by name,
 * as a second wall.)
 *
 * See docs/DEPLOY-hostinger.md, "Guest reviews", for the steps in order.
 */
return [
    // THE OFF SWITCH. false: the homepage section hides itself, /owner/ and
    // /review/ show a short "paused" page, and every review-api endpoint answers
    // 503 without touching the database. Flip this first if anything goes wrong
    // live. Nothing else needs to change.
    'REVIEWS_ENABLED' => false,

    // The MySQL database and user created in hPanel > Databases. From PHP on the
    // same server the host is 127.0.0.1 (or localhost), never srvNNNN.hstgr.io.
    'DB_DSN'  => 'mysql:host=127.0.0.1;port=3306;dbname=u000000000_reviews;charset=utf8mb4',
    'DB_USER' => 'u000000000_reviews',
    'DB_PASS' => 'CHANGE-ME',

    // The owner's sign-in code, as an Argon2id hash. Leave this EMPTY: the code
    // is set once at /owner/ with SETUP_KEY below, and the hash is written to
    // OWNER_HASH_FILE. Paste a hash here only if the setup page says it could
    // not write that file. The code itself is never stored anywhere.
    'OWNER_CODE_HASH' => '',
    'OWNER_HASH_FILE' => __DIR__ . '/benaka-owner-code.hash',

    // One-time setup. Put any long phrase of your own here (20+ characters),
    // open /owner/, and type it once along with your new code. Setup works only
    // while this is set AND no code hash exists, so after the first use it is
    // closed for good. Empty it again afterwards. To change the code later,
    // delete the hash file and set a new phrase.
    'SETUP_KEY' => '',

    // A random secret used to hash IP addresses for rate limits and the
    // lockout, so raw IPs are never stored. 32+ random characters.
    'PEPPER' => 'CHANGE-ME-TO-32-RANDOM-CHARACTERS',

    // Where guest links point. No trailing slash.
    'SITE_URL' => 'https://benakahomestay.com',

    // The number guests message for the WhatsApp check (the owner's).
    'OWNER_WHATSAPP' => '919448647831',

    // Session cookie flags. Must stay true on the live site (HTTPS).
    'COOKIE_SECURE' => true,

    // TESTS ONLY. Never set on the live server: a file holding an ISO time that
    // replaces the server clock. tools/test.sh fails if this template sets it.
    'TEST_CLOCK_FILE' => '',
];
