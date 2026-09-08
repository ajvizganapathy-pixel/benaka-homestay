<?php
/**
 * Booking endpoint — Benaka By The Hills.
 *
 * Actions: status | submitBooking
 * Shapes match web/js/api.js exactly.
 *
 * NO VERIFICATION STEP. The owner asked for the shortest path from a visitor
 * deciding to come to a message on their phone, so there is no OTP, no email
 * and no password: the form posts once and the request goes to WhatsApp. That
 * is a deliberate trade and it costs something — nothing here proves the
 * visitor owns the number they typed. What stands in its place is not an
 * identity check and does not pretend to be one:
 *
 *   - a per-IP rate limit, as before;
 *   - a per-number rate limit, so one number cannot be used to flood;
 *   - a honeypot field and a minimum fill time, which stop scripted posts.
 *
 * Three rules this file exists to keep:
 *
 *   1. A guest is never told a booking was delivered that was not. The record is
 *      stored first and the WhatsApp result is reported honestly afterwards.
 *   2. Nothing but JSON ever leaves here. Warnings, notices, fatals and
 *      uncaught exceptions are all funnelled into one JSON 500 with an opaque
 *      incident id; the detail goes to a log file outside the web root.
 *   3. A rejection never explains itself to a bot. The honeypot and timing
 *      checks answer exactly as a successful post does.
 *
 * REFUSES to accept bookings until api/config.php exists with CONFIGURED => true.
 * `status` still answers, so the site can ask the server what mode it is in
 * rather than having a mode compiled into the JavaScript.
 */

declare(strict_types=1);

// ---------------------------------------------------------------------------
// 0. Nothing but JSON. Buffer everything so a stray notice cannot get in front
//    of the response body, and turn every class of failure into the same reply.
// ---------------------------------------------------------------------------
ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);
ob_start();

const MAX_BODY = 8192;

$INCIDENT = bin2hex(random_bytes(6));
$LOG_TO   = null;                     // set once the config is read

function log_line(string $msg): void {
    global $LOG_TO, $INCIDENT;
    if (!$LOG_TO) return;
    @file_put_contents(
        $LOG_TO,
        sprintf("[%s] %s %s\n", date('c'), $INCIDENT, $msg),
        FILE_APPEND | LOCK_EX
    );
}

function reply(array $body, int $code = 200): never {
    if (ob_get_length() !== false) ob_clean();
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** The one shape every internal failure collapses to. Never leaks a path. */
function fail_internal(string $detail): never {
    global $INCIDENT;
    log_line('ERROR ' . $detail);
    reply([
        'ok'       => false,
        'error'    => 'Something went wrong at our end. Please try again in a moment.',
        'reason'   => 'internal',
        'incident' => $INCIDENT,
    ], 500);
}

set_error_handler(function (int $no, string $str, string $file, int $line): bool {
    fail_internal(sprintf('%s in %s:%d', $str, basename($file), $line));
});
set_exception_handler(function (Throwable $e): void {
    fail_internal(sprintf('%s: %s in %s:%d',
        get_class($e), $e->getMessage(), basename($e->getFile()), $e->getLine()));
});
register_shutdown_function(function (): void {
    $e = error_get_last();
    if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        fail_internal(sprintf('FATAL %s in %s:%d',
            $e['message'], basename($e['file']), $e['line']));
    }
});

// ---------------------------------------------------------------------------
// 1. Config
// ---------------------------------------------------------------------------
// BENAKA_CONFIG lets a test harness (tools/test.sh) point at a fixture, and
// lets a host that prefers environment configuration keep the file elsewhere.
// In production it is unset and this is simply api/config.php.
$configPath = getenv('BENAKA_CONFIG') ?: (__DIR__ . '/config.php');
$cfg        = is_file($configPath) ? require $configPath : [];
if (!is_array($cfg)) $cfg = [];

/** Every config read goes through here, so a missing key is never a warning. */
function cfg(string $key, mixed $default = null): mixed {
    global $cfg;
    return array_key_exists($key, $cfg) ? $cfg[$key] : $default;
}

$CONFIGURED = (bool)cfg('CONFIGURED', false);

// Timestamps on the owner's notification should read in the owner's time, not
// the server's. Shared hosts are usually UTC.
@date_default_timezone_set((string)cfg('TIMEZONE', 'Asia/Kolkata'));

// Where records live. The default deliberately climbs two levels: on Hostinger
// api/ sits inside public_html, so ../../ lands beside public_html rather than
// inside it. A data directory inside the web root is one .htaccess mistake away
// from serving every guest's details as JSON.
$dataDir = rtrim((string)cfg('DATA_DIR', __DIR__ . '/../../benaka-data'), '/');
$LOG_TO  = $dataDir . '/error.log';

// ---------------------------------------------------------------------------
// 2. Request gate — method, content type, size, then origin
//
// Order matters. The cheap, universal checks come first; the origin check comes
// after the body is parsed so that `status` can be exempted from it. `status`
// answers whether booking is switched on and nothing else, so it is safe from
// anywhere — and it has to be, because a site that has not been configured yet
// has no allow-list to match its own origin against.
// ---------------------------------------------------------------------------
$allowedOrigins = array_values(array_filter((array)cfg('ALLOWED_ORIGINS', [])));
$origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
$originAllowed = $origin !== '' && in_array($origin, $allowedOrigins, true);

if ($originAllowed) {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Vary: Origin');
}

$method = (string)($_SERVER['REQUEST_METHOD'] ?? '');
if ($method === 'OPTIONS') reply(['ok' => true]);
if ($method !== 'POST') {
    header('Allow: POST');
    reply(['ok' => false, 'error' => 'POST only.', 'reason' => 'method'], 405);
}

// A cross-site HTML form cannot set this header, which is what makes it a
// usable CSRF guard for a JSON endpoint that carries no cookies.
$ctype = strtolower(trim(explode(';', (string)($_SERVER['CONTENT_TYPE'] ?? ''))[0]));
if ($ctype !== 'application/json') {
    reply(['ok' => false, 'error' => 'Expected JSON.', 'reason' => 'content_type'], 415);
}

$raw = file_get_contents('php://input');
if ($raw === false) $raw = '';
if (strlen($raw) > MAX_BODY) {
    reply(['ok' => false, 'error' => 'Request too large.', 'reason' => 'too_large'], 413);
}
$in = json_decode($raw, true);
if (!is_array($in)) {
    reply(['ok' => false, 'error' => 'Malformed request.', 'reason' => 'malformed'], 400);
}
$action = (string)($in['action'] ?? '');

// ---------------------------------------------------------------------------
// 3. status — no origin gate, no secrets, answerable before configuration.
//    This is what lets the front end learn its mode instead of hardcoding it.
// ---------------------------------------------------------------------------
if ($action === 'status') {
    reply(['ok' => true, 'live' => $CONFIGURED]);
}

if (!$CONFIGURED) {
    reply(['ok' => false,
           'error'  => 'Live booking is not switched on for this site yet.',
           'reason' => 'not_configured'], 503);
}

// Configured but with no allow-list is a misconfiguration, not an open door.
if (!$allowedOrigins) {
    log_line('ALLOWED_ORIGINS is empty while CONFIGURED is true');
    reply(['ok' => false, 'error' => 'Booking is misconfigured on this server.',
           'reason' => 'no_allowed_origins'], 500);
}

if ($origin !== '') {
    if (!$originAllowed) {
        reply(['ok' => false, 'error' => 'Origin not allowed.', 'reason' => 'origin'], 403);
    }
} else {
    // No Origin header: a browser still sends Referer on a cross-site POST, and
    // requiring one of the two closes the hole where "no Origin" meant "no check".
    $ref = (string)($_SERVER['HTTP_REFERER'] ?? '');
    $refOrigin = '';
    if ($ref !== '' && ($p = parse_url($ref)) && isset($p['scheme'], $p['host'])) {
        $refOrigin = $p['scheme'] . '://' . $p['host']
                   . (isset($p['port']) ? ':' . $p['port'] : '');
    }
    if (!in_array($refOrigin, $allowedOrigins, true)) {
        reply(['ok' => false, 'error' => 'Origin not allowed.', 'reason' => 'origin'], 403);
    }
}

// ---------------------------------------------------------------------------
// 4. Storage — files, outside the web root, atomic, locked
// ---------------------------------------------------------------------------
function ensure_dir(string $d): void {
    if (is_dir($d)) return;
    if (!@mkdir($d, 0700, true) && !is_dir($d)) {
        fail_internal("cannot create data dir $d");
    }
}

/** Belt and braces: if the data dir ends up web-served anyway, deny it there. */
function guard_dir(string $d): void {
    $ht = $d . '/.htaccess';
    if (!is_file($ht)) {
        @file_put_contents($ht, "Require all denied\nDeny from all\n");
    }
    $idx = $d . '/index.html';
    if (!is_file($idx)) @file_put_contents($idx, '');
}

ensure_dir($dataDir);
guard_dir($dataDir);
ensure_dir($dataDir . '/bookings');
ensure_dir($dataDir . '/rl');

// Refuse to run with the records inside the document root. Better a loud 500
// than quietly publishing guest details.
$docRoot = realpath((string)($_SERVER['DOCUMENT_ROOT'] ?? '')) ?: '';
$dataReal = realpath($dataDir) ?: $dataDir;
if ($docRoot !== '' && str_starts_with($dataReal . DIRECTORY_SEPARATOR, $docRoot . DIRECTORY_SEPARATOR)) {
    log_line("DATA_DIR $dataReal is inside document root $docRoot");
    reply(['ok' => false,
           'error'  => 'Booking is misconfigured on this server.',
           'reason' => 'data_dir_in_webroot'], 500);
}

function slot(string $dir, string $bucket, string $key): string {
    return $dir . '/' . $bucket . '/' . hash('sha256', $key) . '.json';
}

/** Write via a temp file in the same directory, then rename: never a half file. */
function atomic_write(string $file, array $val): void {
    $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (@file_put_contents($tmp, json_encode($val, JSON_UNESCAPED_UNICODE), LOCK_EX) === false) {
        fail_internal("write failed: " . basename($file));
    }
    @chmod($tmp, 0600);
    if (!@rename($tmp, $file)) { @unlink($tmp); fail_internal("rename failed: " . basename($file)); }
}

function store_get(string $dir, string $bucket, string $key): ?array {
    $f = slot($dir, $bucket, $key);
    if (!is_file($f)) return null;
    $d = json_decode((string)@file_get_contents($f), true);
    return is_array($d) ? $d : null;
}
function store_put(string $dir, string $bucket, string $key, array $val): void {
    atomic_write(slot($dir, $bucket, $key), $val);
}
function store_del(string $dir, string $bucket, string $key): void {
    @unlink(slot($dir, $bucket, $key));
}

/**
 * Rate limit. The lock is held across read-modify-write — the previous version
 * read, filtered and wrote as three separate steps, so two requests arriving
 * together each saw the pre-write count and both got through.
 */
function rate_ok(string $dir, string $bucket, int $limit, int $window): bool {
    $f = $dir . '/rl/' . hash('sha256', $bucket) . '.json';
    $fh = @fopen($f, 'c+');
    if (!$fh) fail_internal('rate limit file');
    if (!flock($fh, LOCK_EX)) { fclose($fh); fail_internal('rate limit lock'); }

    $now  = time();
    $body = stream_get_contents($fh);
    $hits = $body ? (json_decode($body, true) ?: []) : [];
    $hits = array_values(array_filter($hits, fn($t) => is_int($t) && $t > $now - $window));

    $ok = count($hits) < $limit;
    if ($ok) {
        $hits[] = $now;
        ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($hits)); fflush($fh);
    }
    flock($fh, LOCK_UN); fclose($fh);
    return $ok;
}

/** Sweep spent rate-limit files occasionally; nothing else prunes them. */
function sweep(string $dir): void {
    if (random_int(1, 50) !== 1) return;
    $cut = time() - 86400;
    foreach (['rl'] as $bucket) {
        foreach (glob($dir . '/' . $bucket . '/*.json') ?: [] as $f) {
            if (@filemtime($f) < $cut) @unlink($f);
        }
    }
}
sweep($dataDir);

$ip = (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
if (!rate_ok($dataDir, "ip:$ip", (int)cfg('RATE_PER_IP_HOUR', 20), 3600)) {
    reply(['ok' => false, 'error' => 'Too many requests. Try again later.',
           'reason' => 'rate_limited'], 429);
}

// ---------------------------------------------------------------------------
// 5. Validation
// ---------------------------------------------------------------------------
/** To E.164 digits: no +, no spaces, no leading 00. */
function msisdn(string $s): string {
    $d = preg_replace('/\D+/', '', $s) ?? '';
    if (str_starts_with($d, '00')) $d = substr($d, 2);
    return ltrim($d, '0') === '' ? '' : $d;
}

/**
 * A stay date. Accepts only YYYY-MM-DD, which is what <input type="date">
 * submits regardless of how the browser displays it, and checks the date is
 * real — 2026-02-31 parses but does not exist.
 */
function stay_date(string $s): ?string {
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $s, $m)) return null;
    return checkdate((int)$m[2], (int)$m[3], (int)$m[1]) ? $s : null;
}

function clean_details(array $in): array {
    $name  = trim((string)($in['name'] ?? ''));
    $from  = trim((string)($in['from'] ?? ''));
    // One number, and it is the WhatsApp number. The form used to ask for a
    // second one and it was almost always the same; the reply comes back on
    // WhatsApp, so this is the number that matters.
    $phone = msisdn((string)($in['phone'] ?? ''));
    $from_d = stay_date(trim((string)($in['arrival'] ?? '')));
    $to_d   = stay_date(trim((string)($in['departure'] ?? '')));

    $bad = function (string $field, string $msg): never {
        reply(['ok' => false, 'error' => $msg, 'reason' => 'invalid', 'field' => $field], 422);
    };

    if (mb_strlen($name) < 2 || mb_strlen($name) > 80)  $bad('name',  'Please give your name.');
    if (mb_strlen($from) < 2 || mb_strlen($from) > 80)  $bad('from',  'Where are you travelling from?');
    if (strlen($phone) < 8 || strlen($phone) > 15)      $bad('phone', 'That WhatsApp number does not look right.');

    // Dates are checked again here and not only in the browser: the endpoint is
    // reachable without one, and a booking with no dates is no use to the owner.
    if ($from_d === null) $bad('arrival',   'Which day would you like to arrive?');
    if ($to_d   === null) $bad('departure', 'And which day would you leave?');
    $today = date('Y-m-d');
    if ($from_d < $today)  $bad('arrival',   'That date has already passed.');
    if ($to_d  <= $from_d) $bad('departure', 'Leaving day has to be after arriving day.');
    if ((strtotime($to_d) - strtotime($from_d)) / 86400 > 60)
                           $bad('departure', 'That is a very long stay — please call us to arrange it.');

    $nights = (int)round((strtotime($to_d) - strtotime($from_d)) / 86400);

    return compact('name', 'from', 'phone') + [
        'arrival'   => $from_d,
        'departure' => $to_d,
        'nights'    => $nights,
        // One single-line value, because a WhatsApp template parameter may not
        // contain a line break.
        'stay'      => sprintf('%s to %s (%d night%s)',
                               date('j M Y', strtotime($from_d)),
                               date('j M Y', strtotime($to_d)),
                               $nights, $nights === 1 ? '' : 's'),
    ];
}

/**
 * Is this post a script? Neither check is an identity check — they are what is
 * left after the OTP was removed, and they only have to be cheap and quiet.
 *
 *   website  a honeypot input, hidden from sight and from screen readers and
 *            never autofilled. A human cannot fill it in; form-filling bots do.
 *   elapsed  seconds between the panel opening and Send. Nobody reads five
 *            fields and picks two dates in under three seconds.
 *
 * A caller that trips either is answered EXACTLY as a success is — same shape,
 * same fields, a plausible reference — because an error tells a bot what to fix.
 * Nothing is stored and nothing is sent.
 */
function looks_scripted(array $in): bool {
    if (trim((string)($in['website'] ?? '')) !== '') return true;
    $elapsed = $in['elapsed'] ?? null;
    // Absent or non-numeric is NOT suspicious on its own: a caller with
    // JavaScript disabled or an older cached page will not send it.
    return is_numeric($elapsed) && (int)$elapsed < 3;
}

// ---------------------------------------------------------------------------
// 6. WhatsApp Cloud API — templates only
//
// The owner notification is business-initiated. Outside the 24-hour customer
// service window Meta rejects free-form text, so it has to be an approved
// template: UTILITY category, FIVE positional body parameters — name, coming
// from, WhatsApp number, the stay as one line, and when the request came in.
// Template parameters may not contain newlines, so the layout lives in the
// approved body text and never in the values.
//
// This is now the ONLY template the site sends. The AUTHENTICATION template
// that carried the verification code went with the OTP step; if WA_OTP_TEMPLATE
// is still in a config file it is simply ignored.
//
// WA_TRANSPORT decides where a send actually goes:
//   cloud  the real Graph API
//   log    append the payload to the data dir and report success — this is how
//          the flow is tested end to end without credentials
//   off    do not send, report skipped
// ---------------------------------------------------------------------------
function wa_send_template(array $ctx, string $to, string $template, string $lang, array $components): array {
    $transport = (string)cfg('WA_TRANSPORT', 'cloud');
    $payload = [
        'messaging_product' => 'whatsapp',
        'recipient_type'    => 'individual',
        'to'                => $to,
        'type'              => 'template',
        'template'          => [
            'name'       => $template,
            'language'   => ['code' => $lang],
            'components' => $components,
        ],
    ];

    if ($transport === 'off') {
        return ['status' => 'skipped', 'error' => 'WA_TRANSPORT is off'];
    }
    if ($transport === 'log') {
        @file_put_contents(
            $ctx['dataDir'] . '/wa-outbox.log',
            json_encode(['at' => date('c'), 'to' => $to, 'payload' => $payload]) . "\n",
            FILE_APPEND | LOCK_EX
        );
        return ['status' => 'sent', 'message_id' => 'logged-' . bin2hex(random_bytes(6))];
    }

    if ($template === '' || (string)cfg('WA_PHONE_ID', '') === '' || (string)cfg('WA_TOKEN', '') === '') {
        return ['status' => 'failed', 'error' => 'WhatsApp is not fully configured'];
    }
    if (!function_exists('curl_init')) {
        return ['status' => 'failed', 'error' => 'cURL is not available on this server'];
    }

    $url = sprintf('https://graph.facebook.com/%s/%s/messages',
                   (string)cfg('WA_API_VERSION', 'v25.0'), (string)cfg('WA_PHONE_ID'));
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_HTTPHEADER     => [
            'Authorization: Bearer ' . (string)cfg('WA_TOKEN'),
            'Content-Type: application/json',
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => (int)cfg('WA_TIMEOUT', 15),
        CURLOPT_CONNECTTIMEOUT => 8,
    ]);
    $res  = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $cerr = curl_error($ch);
    curl_close($ch);

    if ($res === false) {
        return ['status' => 'failed', 'error' => 'transport: ' . ($cerr ?: 'no response')];
    }
    $body = json_decode((string)$res, true);
    if ($code >= 200 && $code < 300 && isset($body['messages'][0]['id'])) {
        return ['status' => 'sent', 'message_id' => (string)$body['messages'][0]['id']];
    }
    $err = $body['error']['message'] ?? ('HTTP ' . $code);
    $sub = $body['error']['code'] ?? null;
    return ['status' => 'failed', 'error' => trim($err . ($sub !== null ? " (code $sub)" : ''))];
}

/**
 * Who gets the booking notification. The homestay is run by more than one
 * person, so this is a list. A single OWNER_WHATSAPP string is still accepted so
 * an older config file keeps working rather than silently notifying nobody.
 */
function owner_numbers(): array {
    $raw = cfg('OWNER_WHATSAPP_NUMBERS', null);
    if ($raw === null) $raw = cfg('OWNER_WHATSAPP', '');
    if (is_string($raw)) $raw = preg_split('/[\s,]+/', $raw) ?: [];
    $out = [];
    foreach ((array)$raw as $n) {
        $n = msisdn((string)$n);
        if (strlen($n) >= 8 && strlen($n) <= 15 && !in_array($n, $out, true)) $out[] = $n;
    }
    return $out;
}

// ---------------------------------------------------------------------------
// 7. Actions
// ---------------------------------------------------------------------------
$ctx = ['dataDir' => $dataDir];

switch ($action) {

case 'submitBooking': {
    $d = clean_details($in);

    // Answered before anything is stored or sent, and answered as a success:
    // an error here would tell a script exactly which check to defeat.
    if (looks_scripted($in)) {
        log_line('discarded a scripted-looking submission');
        reply(['ok' => true, 'requestId' => 'bk_' . bin2hex(random_bytes(8)),
               'received' => true, 'deliveryStatus' => 'sent', 'notified' => 1]);
    }

    // A second limit, on the number rather than the address. The per-IP limit
    // above does not stop a phone rotating through mobile networks, and with no
    // verification step the owner's WhatsApp is the thing being protected.
    if (!rate_ok($dataDir, 'num:' . $d['phone'], (int)cfg('BOOKINGS_PER_NUMBER_DAY', 4), 86400)) {
        reply(['ok' => false,
               'error'  => 'We already have a request from this number. Please call us instead.',
               'reason' => 'rate_limited'], 429);
    }

    $id  = 'bk_' . bin2hex(random_bytes(8));
    $now = date('c');

    // Stored BEFORE the send is attempted. A booking must not depend on Meta
    // being reachable; losing a guest's request because an API was down is the
    // one failure this endpoint exists to prevent.
    $record = [
        'id'              => $id,
        'name'            => $d['name'],
        'origin'          => $d['from'],
        'whatsapp'        => '+' . $d['phone'],
        // Recorded so nobody later reads an old booking as a verified one.
        // There is no verification step; saying so is cheaper than an argument.
        'verified'        => false,
        'arrival'         => $d['arrival'],
        'departure'       => $d['departure'],
        'nights'          => $d['nights'],
        'delivery_status' => 'pending',
        'deliveries'      => [],
        'created_at'      => $now,
        'updated_at'      => $now,
    ];
    atomic_write($dataDir . '/bookings/' . $id . '.json', $record);

    // Five single-line parameters. No password (there is none), no code (there
    // is none), no email — just what the owner needs to reply to the guest and
    // know which nights they are asking for.
    $components = [['type' => 'body', 'parameters' => array_map(
        fn($t) => ['type' => 'text', 'text' => $t],
        [$d['name'], $d['from'], '+' . $d['phone'], $d['stay'], date('j M Y, H:i')]
    )]];

    // The homestay is run by more than one person, so the request goes to every
    // number on the list. One unreachable number must not lose the booking for
    // the others, so each send is recorded on its own and the guest is told it
    // arrived if ANY of them took it.
    $recipients = owner_numbers();
    if (!$recipients) {
        log_line('no owner numbers configured; booking ' . $id . ' kept undelivered');
    }
    $deliveries = [];
    foreach ($recipients as $to) {
        $send = wa_send_template($ctx, $to,
            (string)cfg('WA_BOOKING_TEMPLATE', ''),
            (string)cfg('WA_BOOKING_TEMPLATE_LANG', 'en'),
            $components);
        $deliveries[] = [
            'to'         => '+' . $to,
            'status'     => $send['status'],
            'message_id' => $send['message_id'] ?? null,
            'error'      => $send['error'] ?? null,
        ];
        if ($send['status'] === 'failed') {
            log_line(sprintf('owner notify failed for %s to +%s: %s',
                             $id, $to, $send['error'] ?? '?'));
        }
    }

    $statuses = array_column($deliveries, 'status');
    $overall  = in_array('sent', $statuses, true) ? 'sent'
              : (in_array('failed', $statuses, true) ? 'failed' : 'skipped');

    $record['delivery_status'] = $overall;
    $record['deliveries']      = $deliveries;
    $record['updated_at']      = date('c');
    atomic_write($dataDir . '/bookings/' . $id . '.json', $record);

    // Truthful either way: the request is kept, and the guest is told exactly
    // what happened to the notification.
    reply([
        'ok'             => true,
        'requestId'      => $id,
        'received'       => true,
        'deliveryStatus' => $overall,              // sent | failed | skipped
        'notified'       => count(array_filter($statuses, fn($s) => $s === 'sent')),
    ]);
}

default:
    reply(['ok' => false, 'error' => 'Unknown action.', 'reason' => 'unknown_action'], 400);
}
