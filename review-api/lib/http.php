<?php
/* Guest reviews: request and response plumbing. See bootstrap.php. */
declare(strict_types=1);
if (!defined('BENAKA_REVIEWS')) { http_response_code(404); exit; }

function gr_send_common_headers(): void {
    header('Content-Type: application/json; charset=utf-8');
    // Nothing here is ever cached, by the browser or anything in between: a
    // cached owner response would hold a phone number, and a cached public one
    // would keep showing a review the owner has taken down.
    header('Cache-Control: no-store, max-age=0');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex, nofollow');
    header('Referrer-Policy: no-referrer');
    header_remove('X-Powered-By');
}

/** Send JSON and stop. Every response body in review-api goes through here. */
function gr_json(int $status, array $body): void {
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP);
    exit;
}

function gr_method(): string { return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'); }

/**
 * A POST body must be JSON, sent as application/json. A cross-site <form>
 * cannot send that content type, so this is a CSRF wall on its own, before the
 * token checks. Bodies over 16KB are refused unread.
 * @return array<string,mixed>
 */
function gr_read_json(): array {
    if (gr_method() !== 'POST') gr_json(405, ['ok' => false, 'error' => 'method']);
    $ct = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? ''));
    if (strpos($ct, 'application/json') !== 0) gr_json(415, ['ok' => false, 'error' => 'type']);
    gr_check_origin();
    $raw = file_get_contents('php://input', false, null, 0, 16385);
    if ($raw === false || strlen($raw) > 16384) gr_json(413, ['ok' => false, 'error' => 'size']);
    $data = json_decode($raw, true, 8);
    if (!is_array($data) || array_is_list($data) && $data !== []) gr_json(400, ['ok' => false, 'error' => 'json']);
    return $data;
}

/** A browser always sends Origin on a POST; if it is someone else's site, stop. */
function gr_check_origin(): void {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? null;
    if ($origin === null || $origin === '') return;          // non-browser client
    $host = $_SERVER['HTTP_HOST'] ?? '';
    $o = parse_url($origin);
    if (!is_array($o) || !isset($o['host'])) gr_json(403, ['ok' => false, 'error' => 'origin']);
    $oh = $o['host'] . (isset($o['port']) ? ':' . $o['port'] : '');
    if (!hash_equals(strtolower($host), strtolower($oh))) gr_json(403, ['ok' => false, 'error' => 'origin']);
}

/**
 * The client's IP, hashed with the server's pepper. REMOTE_ADDR only: an
 * X-Forwarded-For header is whatever the client wants it to be. The raw IP is
 * never stored or logged by this code.
 */
function gr_ip_hash(): string {
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    return hash_hmac('sha256', 'ip|' . $ip, (string)gr_cfg('PEPPER', ''));
}

function gr_is_https(): bool {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

/** 32 random bytes, base64url. */
function gr_random_token(int $bytes = 32): string {
    return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
}
