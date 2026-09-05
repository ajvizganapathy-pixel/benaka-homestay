<?php
/**
 * Copy this file to config.php and fill it in. config.php is gitignored:
 * never commit real credentials.
 *
 * Until CONFIGURED is true, booking.php refuses every request and the site
 * keeps saying plainly that live booking is not switched on. That is
 * deliberate — a form that silently drops a guest's booking is worse than a
 * form that admits it is not ready.
 */

return [
    // Flip to true only once the values below are real.
    'CONFIGURED' => false,

    // --- WhatsApp Cloud API (business.facebook.com → WhatsApp → API Setup) ---
    // The owner receives booking requests on this number.
    'OWNER_WHATSAPP'   => '',          // e.g. '919876543210' — digits only, with country code, no +
    'WA_PHONE_ID'      => '',          // "Phone number ID" from the API Setup page
    'WA_TOKEN'         => '',          // permanent access token for the system user
    'WA_TEMPLATE'      => '',          // approved template name used to notify the owner
    'WA_API_VERSION'   => 'v21.0',

    // --- OTP ---
    'OTP_TTL_SECONDS'  => 600,         // ten minutes
    'OTP_MAX_ATTEMPTS' => 5,
    'OTP_RESEND_WAIT'  => 30,

    // --- Storage ---
    // 'file' needs nothing and is fine for a homestay's volume. 'mysql' expects
    // the tables in DEPLOY-hostinger.md to exist.
    'STORAGE'    => 'file',
    'DATA_DIR'   => __DIR__ . '/../.data',   // put this OUTSIDE public_html in production
    'DB_HOST'    => 'localhost',
    'DB_NAME'    => '',
    'DB_USER'    => '',
    'DB_PASS'    => '',

    // Requests are only accepted from these origins.
    'ALLOWED_ORIGINS' => ['https://example.com', 'https://www.example.com'],
];
