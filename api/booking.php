<?php
/**
 * Booking endpoint — Sherlock's Jungle Retreat.
 *
 * Actions: requestOtp | verifyOtp | register | login | submitBooking
 * Shapes match web/js/api.js exactly, so flipping LIVE there is the whole
 * switch-on.
 *
 * REFUSES TO RUN until api/config.php exists with CONFIGURED => true. An
 * unconfigured deploy answers with a clear "not configured" rather than
 * pretending to accept a booking.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function reply(array $body, int $code = 200): never {
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) {
    reply(['ok' => false, 'error' => 'Booking is not configured on this server yet.',
           'reason' => 'no_config'], 503);
}
$cfg = require $configPath;

if (empty($cfg['CONFIGURED'])) {
    reply(['ok' => false, 'error' => 'Booking is not switched on yet.',
           'reason' => 'not_configured'], 503);
}

// --- CORS: same-origin by default, explicit allow-list otherwise ------------
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    if (!in_array($origin, $cfg['ALLOWED_ORIGINS'], true)) {
        reply(['ok' => false, 'error' => 'Origin not allowed.'], 403);
    }
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Headers: Content-Type');
    header('Vary: Origin');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') reply(['ok' => true]);
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    reply(['ok' => false, 'error' => 'POST only.'], 405);
}

$raw = file_get_contents('php://input') ?: '';
if (strlen($raw) > 8192) reply(['ok' => false, 'error' => 'Request too large.'], 413);
$in = json_decode($raw, true);
if (!is_array($in)) reply(['ok' => false, 'error' => 'Malformed request.'], 400);

$action = (string)($in['action'] ?? '');

// --- storage ----------------------------------------------------------------
$dataDir = rtrim((string)$cfg['DATA_DIR'], '/');
if (!is_dir($dataDir)) @mkdir($dataDir, 0700, true);

function store_path(string $dir, string $key): string {
    return $dir . '/' . hash('sha256', $key) . '.json';
}
function store_get(string $dir, string $key): ?array {
    $f = store_path($dir, $key);
    if (!is_file($f)) return null;
    $d = json_decode((string)file_get_contents($f), true);
    return is_array($d) ? $d : null;
}
function store_put(string $dir, string $key, array $val): void {
    file_put_contents(store_path($dir, $key), json_encode($val), LOCK_EX);
}

// --- rate limiting: a booking form is a spam target -------------------------
function rate_ok(string $dir, string $bucket, int $limit, int $window): bool {
    $f = $dir . '/rl_' . hash('sha256', $bucket) . '.json';
    $now = time();
    $hits = is_file($f) ? (json_decode((string)file_get_contents($f), true) ?: []) : [];
    $hits = array_values(array_filter($hits, fn($t) => $t > $now - $window));
    if (count($hits) >= $limit) return false;
    $hits[] = $now;
    file_put_contents($f, json_encode($hits), LOCK_EX);
    return true;
}
$ip = (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
if (!rate_ok($dataDir, "ip:$ip", 20, 3600)) {
    reply(['ok' => false, 'error' => 'Too many requests. Try again later.'], 429);
}

// --- validation -------------------------------------------------------------
function digits(string $s): string { return preg_replace('/\D+/', '', $s) ?? ''; }

function clean_details(array $in): array {
    $name  = trim((string)($in['name'] ?? ''));
    $from  = trim((string)($in['from'] ?? ''));
    $phone = digits((string)($in['phone'] ?? ''));
    $wa    = digits((string)($in['whatsapp'] ?? '')) ?: $phone;
    $email = trim((string)($in['email'] ?? ''));

    if (mb_strlen($name) < 2 || mb_strlen($name) > 80) reply(['ok'=>false,'error'=>'Please give your name.'], 422);
    if (mb_strlen($from) < 2 || mb_strlen($from) > 80) reply(['ok'=>false,'error'=>'Where are you travelling from?'], 422);
    if (strlen($phone) < 8 || strlen($phone) > 15)     reply(['ok'=>false,'error'=>'That phone number does not look right.'], 422);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL))    reply(['ok'=>false,'error'=>'That email does not look right.'], 422);

    return compact('name', 'from', 'phone', 'wa', 'email');
}

// --- WhatsApp ---------------------------------------------------------------
function wa_send(array $cfg, string $to, string $body): bool {
    $url = sprintf('https://graph.facebook.com/%s/%s/messages',
                   $cfg['WA_API_VERSION'], $cfg['WA_PHONE_ID']);
    $payload = [
        'messaging_product' => 'whatsapp',
        'to'   => $to,
        'type' => 'text',
        'text' => ['body' => $body],
    ];
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_HTTPHEADER     => [
            'Authorization: Bearer ' . $cfg['WA_TOKEN'],
            'Content-Type: application/json',
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 12,
    ]);
    $res  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $res !== false && $code >= 200 && $code < 300;
}

// --- actions ----------------------------------------------------------------
switch ($action) {

case 'requestOtp': {
    $d = clean_details($in);
    if (!rate_ok($dataDir, 'otp:' . $d['wa'], 5, 3600)) {
        reply(['ok' => false, 'error' => 'Too many codes requested. Try again later.'], 429);
    }
    $existing = store_get($dataDir, 'otp:' . $d['wa']);
    if ($existing && time() - ($existing['sent'] ?? 0) < (int)$cfg['OTP_RESEND_WAIT']) {
        reply(['ok' => false, 'error' => 'Please wait a moment before asking for another code.'], 429);
    }
    $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    store_put($dataDir, 'otp:' . $d['wa'], [
        'hash'     => password_hash($code, PASSWORD_DEFAULT),
        'sent'     => time(),
        'expires'  => time() + (int)$cfg['OTP_TTL_SECONDS'],
        'attempts' => 0,
    ]);
    $sent = wa_send($cfg, $d['wa'], "Your code for Sherlock's Jungle Retreat is $code. It expires in 10 minutes.");
    if (!$sent) reply(['ok' => false, 'error' => 'Could not send the code just now.'], 502);
    reply(['ok' => true, 'sent' => true, 'dest' => '+' . $d['wa']]);
}

case 'verifyOtp': {
    $d   = clean_details($in);
    $rec = store_get($dataDir, 'otp:' . $d['wa']);
    if (!$rec)                          reply(['ok'=>false,'error'=>'Ask for a code first.'], 400);
    if (time() > ($rec['expires'] ?? 0)) reply(['ok'=>false,'error'=>'That code has expired.'], 400);
    if (($rec['attempts'] ?? 0) >= (int)$cfg['OTP_MAX_ATTEMPTS']) {
        reply(['ok'=>false,'error'=>'Too many attempts. Ask for a new code.'], 429);
    }
    $rec['attempts'] = ($rec['attempts'] ?? 0) + 1;
    store_put($dataDir, 'otp:' . $d['wa'], $rec);

    if (!password_verify((string)($in['code'] ?? ''), (string)$rec['hash'])) {
        reply(['ok' => false, 'error' => 'That code is not right.'], 401);
    }
    $rec['verified'] = true;
    store_put($dataDir, 'otp:' . $d['wa'], $rec);
    reply(['ok' => true, 'verified' => true]);
}

case 'register': {
    $d   = clean_details($in);
    $pw  = (string)($in['password'] ?? '');
    if (strlen($pw) < 8) reply(['ok'=>false,'error'=>'Password must be at least 8 characters.'], 422);
    store_put($dataDir, 'user:' . $d['email'], [
        'details' => $d,
        'pass'    => password_hash($pw, PASSWORD_DEFAULT),   // never stored in the clear
        'created' => time(),
    ]);
    reply(['ok' => true, 'registered' => true]);
}

case 'login': {
    $email = trim((string)($in['email'] ?? ''));
    $u = store_get($dataDir, 'user:' . $email);
    // One message for both cases: never reveal whether an account exists.
    if (!$u || !password_verify((string)($in['password'] ?? ''), (string)$u['pass'])) {
        reply(['ok' => false, 'error' => 'Those details do not match.'], 401);
    }
    reply(['ok' => true, 'user' => ['name' => $u['details']['name']]]);
}

case 'submitBooking': {
    $d   = clean_details($in);
    $rec = store_get($dataDir, 'otp:' . $d['wa']);
    if (!$rec || empty($rec['verified'])) {
        reply(['ok' => false, 'error' => 'Confirm your number first.'], 403);
    }
    $line = sprintf(
        "New booking request\n\nName: %s\nFrom: %s\nPhone: +%s\nWhatsApp: +%s\nEmail: %s\n\nSent from the website.",
        $d['name'], $d['from'], $d['phone'], $d['wa'], $d['email']
    );
    $delivered = wa_send($cfg, (string)$cfg['OWNER_WHATSAPP'], $line);

    store_put($dataDir, 'booking:' . $d['email'] . ':' . time(), [
        'details'   => $d,
        'at'        => date('c'),
        'delivered' => $delivered,
    ]);

    // The request is kept either way; the guest is told the truth about delivery.
    reply(['ok' => true, 'delivered' => $delivered]);
}

default:
    reply(['ok' => false, 'error' => 'Unknown action.'], 400);
}
