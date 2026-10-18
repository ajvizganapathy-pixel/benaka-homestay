<?php
/*
 * POST /review-api/invite.php   (JSON)
 *   {action:'check',  token}
 *   {action:'submit', token, rating, body, website}   (consent: optional, see below)
 *
 * The guest's endpoint. The token arrives in the request BODY: the page reads
 * it from the URL fragment (#t=...), which browsers never send to a server, so
 * it is never in an access log or a Referer header.
 *
 * Everything about the guest (name, number, expiry, status) is read from the
 * row the token's hash points to. A name or number in the request is ignored.
 *
 * Unknown, used, revoked and expired links all get the SAME answer, 410
 * {error:'dead'}, so the page cannot be used to probe which one it was.
 *
 * The phone number never appears in any response from this file.
 */
declare(strict_types=1);
define('BENAKA_REVIEWS', true);
require __DIR__ . '/lib/bootstrap.php';

$db = gr_boot('invite');
$in = gr_read_json();
gr_rate_limit($db, 'invite');

function dead(): void { gr_json(410, ['ok' => false, 'error' => 'dead']); }

/** The invitation row if the link is live now, else null. */
function live_invitation(PDO $db, string $token, bool $forUpdate): ?array {
    $st = $db->prepare('SELECT id, guest_name, stay_from, stay_to, require_check, check_code, status, expires_at
                          FROM gr_invitations WHERE token_hash = ?' . ($forUpdate ? ' FOR UPDATE' : ''));
    $st->execute([hash('sha256', $token)]);
    $inv = $st->fetch();
    if (!$inv) return null;
    if (!in_array($inv['status'], ['active', 'verified'], true)) return null;
    if (gr_from_sql($inv['expires_at']) <= gr_now()) return null;
    return $inv;
}

function needs_check(array $inv): bool {
    return (int)$inv['require_check'] === 1 && $inv['status'] !== 'verified';
}

$token = gr_v_token($in['token'] ?? null);
if ($token === null) dead();
$action = $in['action'] ?? '';

if ($action === 'check') {
    $inv = live_invitation($db, $token, false);
    if (!$inv) dead();
    $nc = needs_check($inv);
    gr_json(200, [
        'ok'          => true,
        'name'        => $inv['guest_name'],
        'needs_check' => $nc,
        'check_code'  => $nc ? $inv['check_code'] : null,
        'owner_wa'    => $nc ? (string)gr_cfg('OWNER_WHATSAPP', '') : null,
        'expires'     => gr_ist_date($inv['expires_at']),
        'limits'      => ['min' => GR_BODY_MIN, 'max' => GR_BODY_MAX],
    ]);
}

if ($action === 'submit') {
    // A hidden field people never see. Anything in it is a bot: answer as if
    // the link were dead and store nothing.
    $hp = $in['website'] ?? '';
    if (!is_string($hp) || $hp !== '') dead();

    $rating  = gr_v_rating($in['rating'] ?? null);
    $body    = gr_v_body($in['body'] ?? null);
    // Showing the name is a condition of reviewing now: the form says so and
    // no longer asks. A page opened before that change still sends its tick
    // box, and an explicit false from it is honoured: that guest was told
    // their review would stay private.
    $consent = array_key_exists('consent', $in) ? $in['consent'] : true;
    $errors = [];
    if ($rating === null) $errors[] = 'rating';
    if ($body === null)   $errors[] = 'body';
    if (!is_bool($consent)) $errors[] = 'consent';
    if ($errors) gr_json(422, ['ok' => false, 'error' => 'invalid', 'fields' => $errors]);

    $now = gr_now();
    try {
    $result = gr_tx($db, function (PDO $db) use ($token, $rating, $body, $consent, $now) {
        $inv = live_invitation($db, $token, true);     // row lock: a second submit waits here
        if (!$inv) return 'dead';
        if (needs_check($inv)) return 'needs_check';
        // The claim. Exactly one request can move this row out of
        // active/verified; any other sees 0 rows and gets "dead".
        $claim = $db->prepare("UPDATE gr_invitations SET status = 'used', used_at = ?
                                WHERE id = ? AND status IN ('active','verified') AND expires_at > ?");
        $claim->execute([gr_sql($now), $inv['id'], gr_sql($now)]);
        if ($claim->rowCount() !== 1) return 'dead';
        // UNIQUE(invitation_id) is the backstop if anything above were wrong.
        // The stay is copied: the invitation goes at day 30, the card on the
        // site keeps showing it.
        $db->prepare('INSERT INTO gr_reviews (invitation_id, display_name, rating, body, consent_public,
                                              stay_from, stay_to, status, submitted_at, month_key, purge_at)
                      VALUES (?, ?, ?, ?, ?, ?, ?, \'pending\', ?, ?, ?)')
           ->execute([$inv['id'], $inv['guest_name'], $rating, $body, $consent ? 1 : 0,
                      $inv['stay_from'], $inv['stay_to'],
                      gr_sql($now), gr_month_key($now), gr_sql($now->modify('+' . GR_CARD_DAYS . ' days'))]);
        return 'ok';
    });
    } catch (PDOException $e) {
        // 23000 is the UNIQUE backstop firing: the link was claimed by a
        // request that got there first. The guest is told what any used link
        // tells them. Anything else is a real failure, logged without detail.
        if ($e->getCode() !== '23000') { error_log('benaka reviews: submit failed'); gr_json(500, ['ok' => false, 'error' => 'server']); }
        $result = 'dead';
    }
    if ($result === 'needs_check') gr_json(409, ['ok' => false, 'error' => 'needs_check']);
    if ($result !== 'ok') dead();
    gr_json(200, ['ok' => true]);
}

gr_json(400, ['ok' => false, 'error' => 'action']);
