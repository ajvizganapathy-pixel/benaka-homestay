<?php
/*
 * Guest reviews: the owner's sign-in.
 *
 * THE CODE. Digits only, 8 or more. Only its Argon2id hash exists, in the
 * config above public_html (OWNER_CODE_HASH) or the file it names
 * (OWNER_HASH_FILE). It is never in the repository, the page, a response or a
 * log line. It is set once through the setup action (see owner.php), which
 * works only while SETUP_KEY is set and no hash exists yet.
 *
 * THE LOCK. Five wrong codes lock sign-in for 30 minutes, counted in three
 * scopes at once: the whole account, this IP (hashed) and this device (a
 * random cookie). Any one of them at five locks it. While locked, a try is
 * refused BEFORE the code is checked, so even the right code does not get in.
 * The account row is taken FOR UPDATE, so parallel guesses queue up behind
 * each other instead of racing past the counter.
 *
 * THE SESSION. A random cookie, HttpOnly, Secure, SameSite=Strict, path /.
 * Only its SHA-256 is stored. It ends after 30 idle minutes (and after 12 hours
 * whatever happens). Every state-changing owner request carries the session's
 * CSRF token in X-CSRF-Token.
 */
declare(strict_types=1);
if (!defined('BENAKA_REVIEWS')) { http_response_code(404); exit; }

const GR_LOCK_TRIES   = 5;
const GR_LOCK_SECONDS = 1800;     // 30 minutes
const GR_SESSION_IDLE = 1800;     // 30 idle minutes
const GR_SESSION_MAX  = 43200;    // 12 hours, whatever happens
const GR_CODE_MIN     = 8;
const GR_CODE_MAX     = 32;

function gr_cookie_name(): string {
    // __Host- pins the cookie to this exact host, path / and HTTPS. The plain
    // name is only for the local test server, which runs over http.
    return gr_cfg('COOKIE_SECURE', true) === false ? 'benaka_owner' : '__Host-benaka_owner';
}
function gr_device_cookie_name(): string {
    return gr_cfg('COOKIE_SECURE', true) === false ? 'benaka_dev' : '__Host-benaka_dev';
}

function gr_set_cookie(string $name, string $value, int $expires): void {
    setcookie($name, $value, [
        'expires'  => $expires,
        'path'     => '/',
        'secure'   => gr_cfg('COOKIE_SECURE', true) !== false,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}

/* ---------------------------------------------------------------- the code */

function gr_code_hash(): string {
    $h = (string)gr_cfg('OWNER_CODE_HASH', '');
    if ($h !== '') return $h;
    $f = (string)gr_cfg('OWNER_HASH_FILE', '');
    if ($f !== '' && is_file($f) && is_readable($f)) return trim((string)file_get_contents($f));
    return '';
}

function gr_code_shape_ok($code): bool {
    return is_string($code) && preg_match('/^[0-9]{' . GR_CODE_MIN . ',' . GR_CODE_MAX . '}$/', $code) === 1;
}

/** Argon2id. password_hash where PHP was built with it, libsodium where not. */
function gr_hash_code(string $code): string {
    if (defined('PASSWORD_ARGON2ID')) {
        return password_hash($code, PASSWORD_ARGON2ID, ['memory_cost' => 65536, 'time_cost' => 4, 'threads' => 1]);
    }
    if (function_exists('sodium_crypto_pwhash_str')) {
        return sodium_crypto_pwhash_str($code, SODIUM_CRYPTO_PWHASH_OPSLIMIT_MODERATE, SODIUM_CRYPTO_PWHASH_MEMLIMIT_INTERACTIVE);
    }
    throw new RuntimeException('no Argon2id available');
}

function gr_verify_code(string $code, string $hash): bool {
    if ($hash === '' || strpos($hash, '$argon2id$') !== 0) return false;   // Argon2id or nothing
    if (password_verify($code, $hash)) return true;
    if (!defined('PASSWORD_ARGON2ID') && function_exists('sodium_crypto_pwhash_str_verify')) {
        return sodium_crypto_pwhash_str_verify($hash, $code);
    }
    return false;
}

/* ---------------------------------------------------------------- the lock */

/** The scopes this attempt counts against: account, IP and device. */
function gr_lock_scopes(): array {
    $dev = $_COOKIE[gr_device_cookie_name()] ?? '';
    if (!is_string($dev) || !preg_match('/^[A-Za-z0-9_-]{43}$/', $dev)) {
        $dev = gr_random_token();
        gr_set_cookie(gr_device_cookie_name(), $dev, time() + 365 * 86400);
    }
    $pepper = (string)gr_cfg('PEPPER', '');
    return ['account',
            'ip:' . substr(gr_ip_hash(), 0, 64),
            'dev:' . hash_hmac('sha256', 'dev|' . $dev, $pepper)];
}

/**
 * One sign-in attempt, start to finish. Returns
 *   ['ok' => true]
 *   ['ok' => false, 'error' => 'locked', 'retry_after' => seconds]
 *   ['ok' => false, 'error' => 'wrong',  'tries_left' => n]
 */
function gr_attempt_login(PDO $db, $code): array {
    $now = gr_now();
    $n = gr_sql($now);
    $scopes = gr_lock_scopes();
    $hash = gr_code_hash();

    // The counter rows exist before the transaction starts. Creating them
    // inside it (INSERT IGNORE takes a shared lock on an existing row) let two
    // parallel attempts deadlock on the upgrade to FOR UPDATE below.
    $ins = $db->prepare('INSERT IGNORE INTO gr_login_locks (scope, fails, locked_until, updated_at) VALUES (?, 0, NULL, ?)');
    foreach ($scopes as $s) $ins->execute([$s, $n]);

    return gr_tx($db, function (PDO $db) use ($scopes, $now, $n, $code, $hash) {
        // Account row first, always, so every attempt queues on the same lock.
        $sel = $db->prepare('SELECT scope, fails, locked_until FROM gr_login_locks WHERE scope = ? FOR UPDATE');
        $rows = [];
        foreach ($scopes as $s) { $sel->execute([$s]); $rows[$s] = $sel->fetch(); }

        $until = null;
        foreach ($rows as $r) {
            $lu = gr_from_sql($r['locked_until']);
            if ($lu && $lu > $now && (!$until || $lu > $until)) $until = $lu;
        }
        if ($until) {
            return ['ok' => false, 'error' => 'locked', 'retry_after' => $until->getTimestamp() - $now->getTimestamp()];
        }

        // Checked only when not locked. A malformed code counts as a wrong one.
        $good = gr_code_shape_ok($code) && $hash !== '' && gr_verify_code($code, $hash);

        if ($good) {
            $db->prepare('UPDATE gr_login_locks SET fails = 0, locked_until = NULL, updated_at = ? WHERE scope IN (?, ?, ?)')
               ->execute([$n, ...$scopes]);
            return ['ok' => true];
        }

        $left = GR_LOCK_TRIES;
        $locked = false;
        $up = $db->prepare('UPDATE gr_login_locks SET fails = ?, locked_until = ?, updated_at = ? WHERE scope = ?');
        foreach ($rows as $s => $r) {
            $f = (int)$r['fails'] + 1;
            if ($f >= GR_LOCK_TRIES) {
                $up->execute([0, gr_sql($now->modify('+' . GR_LOCK_SECONDS . ' seconds')), $n, $s]);
                $locked = true;
            } else {
                $up->execute([$f, null, $n, $s]);
                $left = min($left, GR_LOCK_TRIES - $f);
            }
        }
        if ($locked) return ['ok' => false, 'error' => 'locked', 'retry_after' => GR_LOCK_SECONDS];
        return ['ok' => false, 'error' => 'wrong', 'tries_left' => $left];
    });
}

/* ------------------------------------------------------------- the session */

function gr_start_session(PDO $db): string {
    $id = gr_random_token();
    $csrf = bin2hex(random_bytes(32));
    $n = gr_sql(gr_now());
    $db->prepare('INSERT INTO gr_sessions (id_hash, csrf, created_at, last_seen_at) VALUES (?, ?, ?, ?)')
       ->execute([hash('sha256', $id), $csrf, $n, $n]);
    // A session cookie (no expiry): closing the browser ends it too.
    gr_set_cookie(gr_cookie_name(), $id, 0);
    return $csrf;
}

/** The live session row, touched; or null. Expired rows were purged in gr_boot. */
function gr_session(PDO $db): ?array {
    $id = $_COOKIE[gr_cookie_name()] ?? '';
    if (!is_string($id) || !preg_match('/^[A-Za-z0-9_-]{43}$/', $id)) return null;
    $h = hash('sha256', $id);
    $now = gr_now();
    $st = $db->prepare('SELECT id_hash, csrf, created_at, last_seen_at FROM gr_sessions WHERE id_hash = ?');
    $st->execute([$h]);
    $s = $st->fetch();
    if (!$s) return null;
    $seen = gr_from_sql($s['last_seen_at']);
    $born = gr_from_sql($s['created_at']);
    if ($now->getTimestamp() - $seen->getTimestamp() >= GR_SESSION_IDLE
        || $now->getTimestamp() - $born->getTimestamp() >= GR_SESSION_MAX) {
        $db->prepare('DELETE FROM gr_sessions WHERE id_hash = ?')->execute([$h]);
        return null;
    }
    $db->prepare('UPDATE gr_sessions SET last_seen_at = ? WHERE id_hash = ?')->execute([gr_sql($now), $h]);
    return $s;
}

function gr_end_session(PDO $db): void {
    $id = $_COOKIE[gr_cookie_name()] ?? '';
    if (is_string($id) && $id !== '') {
        $db->prepare('DELETE FROM gr_sessions WHERE id_hash = ?')->execute([hash('sha256', $id)]);
    }
    gr_set_cookie(gr_cookie_name(), '', time() - 3600);
}

/** Stop unless there is a live session and, for a change, a matching CSRF token. */
function gr_require_owner(PDO $db, bool $change): array {
    $s = gr_session($db);
    if (!$s) gr_json(401, ['ok' => false, 'error' => 'signed_out']);
    if ($change) {
        $t = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (!is_string($t) || !hash_equals($s['csrf'], $t)) gr_json(403, ['ok' => false, 'error' => 'csrf']);
    }
    return $s;
}
