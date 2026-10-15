<?php
/*
 * Guest reviews: everything every endpoint does first.
 *
 *   require __DIR__ . '/lib/bootstrap.php';
 *   $db = gr_boot('public');      // headers, config, off switch, DB, purge
 *
 * Nothing under lib/ is an endpoint. .htaccess answers 404 for review-api/lib/
 * on Apache, lib/.htaccess denies it again, and each file refuses to run
 * unless an endpoint defined BENAKA_REVIEWS first, for hosts that ignore both.
 */
declare(strict_types=1);

if (!defined('BENAKA_REVIEWS')) { http_response_code(404); exit; }

// Everything is stored and compared in UTC; Asia/Kolkata is applied only where
// a calendar date is shown (gr_month_key, gr_ist_date).
date_default_timezone_set('UTC');
// Errors go to the server log, never into a response body.
ini_set('display_errors', '0');
set_exception_handler(static function (Throwable $e): void {
    error_log('benaka reviews: ' . get_class($e) . ' at ' . basename($e->getFile()) . ':' . $e->getLine());
    if (!headers_sent()) { http_response_code(500); header('Content-Type: application/json; charset=utf-8'); }
    echo '{"ok":false,"error":"server"}';
});

require_once __DIR__ . '/http.php';
require_once __DIR__ . '/clock.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/validate.php';
require_once __DIR__ . '/ratelimit.php';
require_once __DIR__ . '/purge.php';
require_once __DIR__ . '/auth.php';

const GR_CARD_DAYS        = 30;   // an approval card dissolves this long after submission
const GR_DEFAULT_EXPIRY   = 30;   // an invitation link's default life, in days
const GR_UNUSED_KEEP_DAYS = 30;   // an unused invitation is deleted this long after it expires
const GR_TZ               = 'Asia/Kolkata';

/** The repository root, which on Hostinger IS public_html. */
function gr_repo_root(): string { return dirname(__DIR__, 2); }

/**
 * The real config lives one level ABOVE public_html, where Git auto-deploy
 * never writes and the web server never serves. A test run (the PHP built-in
 * server or the CLI, never Apache/LiteSpeed) may point elsewhere with
 * BENAKA_REVIEWS_CONFIG.
 */
function gr_config_path(): string {
    if (PHP_SAPI === 'cli-server' || PHP_SAPI === 'cli') {
        $env = getenv('BENAKA_REVIEWS_CONFIG');
        if (is_string($env) && $env !== '') return $env;
    }
    return dirname(gr_repo_root()) . '/benaka-reviews-config.php';
}

/** @return array<string,mixed>|null  null when there is no readable config. */
function gr_config(): ?array {
    static $cfg = false;
    if ($cfg !== false) return $cfg;
    $path = gr_config_path();
    $cfg = null;
    if (is_file($path) && is_readable($path)) {
        // OPcache may otherwise keep serving the old file for its revalidation
        // period, and the off switch must work the moment the file is saved.
        // Without force, this recompiles only when the file actually changed.
        if (function_exists('opcache_invalidate')) @opcache_invalidate($path, false);
        $c = (static function (string $p) { return require $p; })($path);
        if (is_array($c)) $cfg = $c;
    }
    return $cfg;
}

function gr_cfg(string $key, $default = null) {
    $c = gr_config();
    return ($c !== null && array_key_exists($key, $c)) ? $c[$key] : $default;
}

/**
 * Headers, the off switch, the database and the day-30 purge, in that order.
 * The purge runs at the start of EVERY request, so nothing depends on a cron.
 */
function gr_boot(string $endpoint): PDO {
    gr_send_common_headers();
    $cfg = gr_config();
    if ($cfg === null || ($cfg['REVIEWS_ENABLED'] ?? false) !== true) {
        // Off, or not configured yet. Same answer either way, and the database
        // is never touched.
        gr_json(503, ['ok' => false, 'error' => 'paused']);
    }
    try {
        $db = gr_db();
    } catch (Throwable $e) {
        error_log('benaka reviews: database unavailable');   // no DSN, no message text
        gr_json(503, ['ok' => false, 'error' => 'unavailable']);
    }
    gr_purge($db, gr_now());
    return $db;
}
