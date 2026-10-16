<?php
/*
 * The owner's endpoint. Everything except 'session', 'login' and 'setup'
 * needs a live session, and every POST that changes something needs the
 * session's CSRF token in X-CSRF-Token as well.
 *
 *   GET  ?action=session      where the page should start: setup, lock or dashboard
 *   GET  ?action=dashboard    the three lists (numbers masked)
 *   POST {action:'setup',  setup_key, code}     one time only
 *   POST {action:'login',  code}
 *   POST {action:'logout'}
 *   POST {action:'create', name, phone, stay_from, stay_to, expiry_days, require_check}
 *   POST {action:'revoke'|'verify'|'reveal', id}           (invitation id)
 *   POST {action:'delete', id}                 (invitation id; only one no review hangs on)
 *   POST {action:'approve'|'reject'|'takedown', id}         (review id)
 */
declare(strict_types=1);
define('BENAKA_REVIEWS', true);
require __DIR__ . '/lib/bootstrap.php';

$db = gr_boot('owner');

/* ------------------------------------------------------------------- GET */
if (gr_method() === 'GET') {
    gr_rate_limit($db, 'owner');
    $action = $_GET['action'] ?? '';

    if ($action === 'session') {
        if (gr_code_hash() === '') {
            // No code yet. Setup is offered only while the config holds a
            // setup phrase; without one there is nothing anyone can do here.
            gr_json(200, ['ok' => true, 'state' => strlen((string)gr_cfg('SETUP_KEY', '')) >= 20 ? 'setup' : 'unconfigured']);
        }
        $s = gr_session($db);
        if ($s) gr_json(200, ['ok' => true, 'state' => 'signed_in', 'csrf' => $s['csrf']]);
        gr_json(200, ['ok' => true, 'state' => 'signed_out', 'retry_after' => gr_lock_remaining($db)]);
    }

    if ($action === 'dashboard') {
        gr_require_owner($db, false);
        gr_json(200, ['ok' => true] + gr_dashboard($db));
    }
    gr_json(400, ['ok' => false, 'error' => 'action']);
}

/* ------------------------------------------------------------------ POST */
$in = gr_read_json();
$action = $in['action'] ?? '';

if ($action === 'login') {
    gr_rate_limit($db, 'login');
    $r = gr_attempt_login($db, $in['code'] ?? null);
    if ($r['ok']) {
        $csrf = gr_start_session($db);
        gr_json(200, ['ok' => true, 'csrf' => $csrf]);
    }
    if ($r['error'] === 'locked') {
        header('Retry-After: ' . $r['retry_after']);
        gr_json(423, $r);
    }
    gr_json(401, $r);
}

if ($action === 'setup') {
    gr_rate_limit($db, 'setup');
    $key = (string)gr_cfg('SETUP_KEY', '');
    if (gr_code_hash() !== '' || strlen($key) < 20) gr_json(403, ['ok' => false, 'error' => 'closed']);
    $given = $in['setup_key'] ?? '';
    if (!is_string($given) || !hash_equals($key, $given)) gr_json(403, ['ok' => false, 'error' => 'setup_key']);
    $code = $in['code'] ?? null;
    if (!gr_code_shape_ok($code)) gr_json(422, ['ok' => false, 'error' => 'code_shape']);
    // Argon2id comes from PHP's own build or from the sodium extension.
    // Hostinger's PHP 8.3 had sodium switched off when this was written; if
    // its build lacks Argon2id too, say how to fix it rather than fail blank.
    if (!defined('PASSWORD_ARGON2ID') && !function_exists('sodium_crypto_pwhash_str')) {
        gr_json(503, ['ok' => false, 'error' => 'no_argon2']);
    }

    $hash = gr_hash_code($code);
    $file = (string)gr_cfg('OWNER_HASH_FILE', '');
    $written = false;
    if ($file !== '') {
        // 'x': create, and fail if it exists, so two setups cannot both win.
        $fh = @fopen($file, 'x');
        if ($fh) {
            $written = fwrite($fh, $hash . "\n") !== false;
            fclose($fh);
            @chmod($file, 0600);
        }
    }
    if (!$written) {
        // The owner pastes this into OWNER_CODE_HASH with hPanel's File Manager.
        // It is a hash, not the code, and it is shown only to someone who knew
        // the setup phrase.
        gr_json(200, ['ok' => true, 'written' => false, 'hash' => $hash]);
    }
    $csrf = gr_start_session($db);
    gr_json(200, ['ok' => true, 'written' => true, 'csrf' => $csrf]);
}

// Everything below changes state: a session AND its CSRF token.
gr_rate_limit($db, 'owner');
gr_require_owner($db, true);
$now = gr_now();
$n = gr_sql($now);

switch ($action) {
    case 'logout':
        gr_end_session($db);
        gr_json(200, ['ok' => true]);

    case 'create':
        $name  = gr_v_name($in['name'] ?? null);
        $phone = gr_v_phone($in['phone'] ?? null);
        $from  = gr_v_date($in['stay_from'] ?? null);
        $to    = gr_v_date($in['stay_to'] ?? null);
        $days  = array_key_exists('expiry_days', $in) ? gr_v_int_range($in['expiry_days'], 1, 90) : GR_DEFAULT_EXPIRY;
        $check = $in['require_check'] ?? true;
        $bad = [];
        if ($name === null)  $bad[] = 'name';
        if ($phone === null) $bad[] = 'phone';
        if ($from === null)  $bad[] = 'stay_from';
        if ($to === null || ($from !== null && ($to <= $from || (strtotime($to) - strtotime($from)) > 90 * 86400))) $bad[] = 'stay_to';
        if ($days === null)  $bad[] = 'expiry_days';
        if (!is_bool($check)) $bad[] = 'require_check';
        if ($bad) gr_json(422, ['ok' => false, 'error' => 'invalid', 'fields' => $bad]);

        $token = gr_random_token();
        $code = gr_check_code();
        $expires = $now->modify("+{$days} days");
        $db->prepare('INSERT INTO gr_invitations (token_hash, guest_name, phone_e164, stay_from, stay_to,
                                                  require_check, check_code, status, created_at, expires_at)
                      VALUES (?, ?, ?, ?, ?, ?, ?, \'active\', ?, ?)')
           ->execute([hash('sha256', $token), $name, $phone, $from, $to, $check ? 1 : 0, $code, $n, gr_sql($expires)]);
        // The token leaves the server this once, to the owner, and is never
        // stored. Lose the link and the invitation is revoked and remade.
        gr_json(200, [
            'ok' => true,
            'id' => (int)$db->lastInsertId(),
            'name' => $name,
            'phone' => $phone,
            'link' => rtrim((string)gr_cfg('SITE_URL', ''), '/') . '/review/#t=' . $token,
            'expires' => gr_ist_date(gr_sql($expires)),
            'require_check' => $check,
            'check_code' => $code,
        ]);

    case 'revoke':
        $id = gr_v_id($in['id'] ?? null) ?? gr_json(422, ['ok' => false, 'error' => 'invalid']);
        $st = $db->prepare("UPDATE gr_invitations SET status = 'revoked', revoked_at = ?
                             WHERE id = ? AND status IN ('active','verified')");
        $st->execute([$n, $id]);
        gr_changed($st);

    case 'verify':
        $id = gr_v_id($in['id'] ?? null) ?? gr_json(422, ['ok' => false, 'error' => 'invalid']);
        $st = $db->prepare("UPDATE gr_invitations SET status = 'verified', verified_at = ?
                             WHERE id = ? AND status = 'active' AND require_check = 1 AND expires_at > ?");
        $st->execute([$n, $id, $n]);
        gr_changed($st);

    case 'reveal':
        $id = gr_v_id($in['id'] ?? null) ?? gr_json(422, ['ok' => false, 'error' => 'invalid']);
        $st = $db->prepare('SELECT phone_e164 FROM gr_invitations WHERE id = ?');
        $st->execute([$id]);
        $p = $st->fetchColumn();
        if ($p === false) gr_json(404, ['ok' => false, 'error' => 'gone']);
        gr_json(200, ['ok' => true, 'phone' => $p]);

    case 'delete':
        // Revoke stops a link and keeps the record; delete removes the record.
        // Only an invitation that no review hangs on can go: a review keeps
        // its card (and with it approve and reject) until day 30, and the
        // purge removes both then. The row is taken FOR UPDATE, as the guest's
        // submit takes it, so a review arriving at the same moment either
        // lands first (and this answers has_review) or finds no link (dead).
        $id = gr_v_id($in['id'] ?? null) ?? gr_json(422, ['ok' => false, 'error' => 'invalid']);
        $r = gr_tx($db, function (PDO $db) use ($id) {
            $st = $db->prepare('SELECT id FROM gr_invitations WHERE id = ? FOR UPDATE');
            $st->execute([$id]);
            if ($st->fetchColumn() === false) return 'gone';
            $st = $db->prepare('SELECT COUNT(*) FROM gr_reviews WHERE invitation_id = ?');
            $st->execute([$id]);
            if ((int)$st->fetchColumn() > 0) return 'has_review';
            $db->prepare('DELETE FROM gr_invitations WHERE id = ?')->execute([$id]);
            return 'ok';
        });
        if ($r === 'ok') gr_json(200, ['ok' => true]);
        $r === 'gone' ? gr_json(404, ['ok' => false, 'error' => 'gone'])
                      : gr_json(409, ['ok' => false, 'error' => 'has_review']);

    case 'approve':
    case 'reject':
        $id = gr_v_id($in['id'] ?? null) ?? gr_json(422, ['ok' => false, 'error' => 'invalid']);
        $to = $action === 'approve' ? 'approved' : 'rejected';
        // Rejecting is possible only while the card exists; after day 30 a
        // published review comes down with 'takedown', which deletes it.
        $st = $db->prepare('UPDATE gr_reviews SET status = ?, moderated_at = ?
                             WHERE id = ? AND status <> ? AND invitation_id IS NOT NULL');
        $st->execute([$to, $n, $id, $to]);
        gr_changed($st);

    case 'takedown':
        $id = gr_v_id($in['id'] ?? null) ?? gr_json(422, ['ok' => false, 'error' => 'invalid']);
        $gone = gr_tx($db, function (PDO $db) use ($id) {
            $st = $db->prepare('SELECT invitation_id FROM gr_reviews WHERE id = ? FOR UPDATE');
            $st->execute([$id]);
            $inv = $st->fetchColumn();
            if ($inv === false) return 0;
            $db->prepare('DELETE FROM gr_reviews WHERE id = ?')->execute([$id]);
            if ($inv !== null) $db->prepare('DELETE FROM gr_invitations WHERE id = ?')->execute([$inv]);
            return 1;
        });
        $gone ? gr_json(200, ['ok' => true]) : gr_json(404, ['ok' => false, 'error' => 'gone']);
}
gr_json(400, ['ok' => false, 'error' => 'action']);

/* ------------------------------------------------------------- helpers */

function gr_changed(PDOStatement $st): void {
    $st->rowCount() === 1 ? gr_json(200, ['ok' => true]) : gr_json(409, ['ok' => false, 'error' => 'state']);
}

/** Seven characters the owner can match by eye: no 0/O, 1/I/L. */
function gr_check_code(): string {
    $a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    $s = '';
    for ($i = 0; $i < 6; $i++) $s .= $a[random_int(0, strlen($a) - 1)];
    return substr($s, 0, 3) . '-' . substr($s, 3);
}

/** Seconds until sign-in unlocks for this visitor, or 0. Reads only. */
function gr_lock_remaining(PDO $db): int {
    $scopes = gr_lock_scopes();
    $st = $db->prepare('SELECT MAX(locked_until) FROM gr_login_locks WHERE scope IN (?, ?, ?)');
    $st->execute($scopes);
    $lu = gr_from_sql($st->fetchColumn() ?: null);
    $now = gr_now();
    return ($lu && $lu > $now) ? $lu->getTimestamp() - $now->getTimestamp() : 0;
}

function gr_days_left(?string $purgeAt, DateTimeImmutable $now): ?int {
    $p = gr_from_sql($purgeAt);
    return $p ? max(0, (int)ceil(($p->getTimestamp() - $now->getTimestamp()) / 86400)) : null;
}

function gr_dashboard(PDO $db): array {
    $now = gr_now();
    $reviews = $db->query("SELECT r.id, r.invitation_id, r.display_name, r.rating, r.body, r.consent_public,
                                  r.status, r.submitted_at, r.moderated_at, r.purge_at,
                                  i.phone_e164, i.stay_from, i.stay_to
                             FROM gr_reviews r LEFT JOIN gr_invitations i ON i.id = r.invitation_id
                            ORDER BY r.submitted_at DESC")->fetchAll();
    $waiting = $rejected = $published = [];
    foreach ($reviews as $r) {
        $card = $r['invitation_id'] !== null;
        $row = [
            'id'        => (int)$r['id'],
            'name'      => $r['display_name'],
            'rating'    => (int)$r['rating'],
            'body'      => $r['body'],
            'consent'   => (bool)$r['consent_public'],
            'status'    => $r['status'],
            'submitted' => gr_iso($r['submitted_at']),
            'date'      => gr_ist_date($r['submitted_at']),
            'card'      => $card ? [
                'invitation_id'  => (int)$r['invitation_id'],
                'phone_masked'   => gr_mask_phone($r['phone_e164']),
                'stay_from'      => $r['stay_from'],
                'stay_to'        => $r['stay_to'],
                'nights'         => (int)round((strtotime($r['stay_to']) - strtotime($r['stay_from'])) / 86400),
                'dissolves_in'   => gr_days_left($r['purge_at'], $now),
            ] : null,
        ];
        if ($r['status'] === 'pending')      $waiting[] = $row;
        elseif ($r['status'] === 'rejected') $rejected[] = $row;
        else                                 $published[] = $row;
    }

    $invs = $db->query('SELECT i.id, i.guest_name, i.phone_e164, i.stay_from, i.stay_to, i.require_check, i.check_code,
                               i.status, i.created_at, i.expires_at, i.verified_at, i.used_at, i.revoked_at,
                               EXISTS(SELECT 1 FROM gr_reviews r WHERE r.invitation_id = i.id) AS has_review
                          FROM gr_invitations i ORDER BY i.created_at DESC')->fetchAll();
    $invitations = [];
    foreach ($invs as $i) {
        $status = $i['status'];
        if (in_array($status, ['active', 'verified'], true) && gr_from_sql($i['expires_at']) <= $now) $status = 'expired';
        $invitations[] = [
            'id'            => (int)$i['id'],
            'name'          => $i['guest_name'],
            'phone_masked'  => gr_mask_phone($i['phone_e164']),
            'stay_from'     => $i['stay_from'],
            'stay_to'       => $i['stay_to'],
            'require_check' => (bool)$i['require_check'],
            'check_code'    => $i['check_code'],
            'status'        => $status,
            'created'       => gr_iso($i['created_at']),
            'expires'       => gr_iso($i['expires_at']),
            'verified'      => gr_iso($i['verified_at']),
            'used'          => gr_iso($i['used_at']),
            'revoked'       => gr_iso($i['revoked_at']),
            'deletable'     => !(int)$i['has_review'],
        ];
    }
    return ['now' => gr_iso(gr_sql($now)), 'waiting' => $waiting, 'rejected' => $rejected,
            'published' => $published, 'invitations' => $invitations];
}
