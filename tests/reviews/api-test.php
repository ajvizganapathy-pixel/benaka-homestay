<?php
/*
 * Guest reviews: the server suite. Real HTTP against the real endpoints, on a
 * real MySQL/MariaDB, with the clock injected where time matters.
 *
 *   php tests/reviews/api-test.php
 *
 * Exit 0 when every check passes, 1 when any fails, 3 when no database is
 * reachable (tools/test.sh decides whether that is a failure).
 *
 * Every line is labelled [automated]: these run unattended. The browser
 * checks are in browser-test.cjs; what needs the live server is listed in the
 * PR and is never reported here.
 */
declare(strict_types=1);
require __DIR__ . '/harness.php';

if (in_array('--probe', $argv, true)) exit(Env::connection() ? 0 : 3);   // tools/test.sh: is there a database?
if (!Env::connection()) { fwrite(STDERR, "no MySQL/MariaDB reachable; set REVIEWS_TEST_DSN/USER/PASS\n"); exit(3); }

$PASS = 0; $FAIL = 0;
function ok(string $what): void { global $PASS; $PASS++; printf("  \033[32mok\033[0m    [automated] %s\n", $what); }
function bad(string $what, string $why = ''): void { global $FAIL; $FAIL++; printf("  \033[31mFAIL\033[0m  [automated] %s\n", $what); if ($why !== '') printf("        %s\n", mb_strimwidth($why, 0, 600, '…')); }
function check(bool $c, string $what, string $why = ''): void { $c ? ok($what) : bad($what, $why); }
function section(string $t): void {
    global $db;
    // Every request here comes from 127.0.0.1, so the per-IP limits would trip
    // on the suite itself. Each section starts with a clean window; the
    // rate-limit section tests the limits on their own.
    if ($db) $db->exec('DELETE FROM gr_rate_limits');
    printf("\n  \033[1m%s\033[0m\n", $t);
}
function j($r): string { return $r['status'] . ' ' . substr($r['body'], 0, 300); }

$OWNER_API = '/review-api/owner.php';
$GUEST_API = '/review-api/invite.php';
$PUBLIC_API = '/review-api/public.php';

$db = null;
$env = Env::up();
register_shutdown_function(fn() => $env->down());
$db = $env->pdo();
$T0 = '2026-10-15T06:00:00Z';
$env->clock($T0);
$at = fn(string $iso) => $env->clock($iso);
$plus = fn(int $sec) => gmdate('Y-m-d\TH:i:s\Z', strtotime($T0) + $sec);

try {
/* ======================================================================== */
section('Setup and sign-in');
$anon = $env->client();
$r = $anon->get("$OWNER_API?action=session");
check(($r['json']['state'] ?? '') === 'setup', 'with no code set, the page is offered setup', j($r));
$r = $anon->post($OWNER_API, ['action' => 'setup', 'setup_key' => 'wrong-' . $env->setupKey, 'code' => '12345678']);
check($r['status'] === 403 && !is_file($env->hashFile), 'setup refuses a wrong setup phrase', j($r));
foreach (['1234567', '12345678a', '', '１２３４５６７８'] as $c) {
    $r = $anon->post($OWNER_API, ['action' => 'setup', 'setup_key' => $env->setupKey, 'code' => $c]);
    check($r['status'] === 422 && !is_file($env->hashFile), 'setup refuses code ' . json_encode($c) . ' (digits only, 8+)', j($r));
}
$owner = $env->owner();
$hash = trim((string)file_get_contents($env->hashFile));
check(strpos($hash, '$argon2id$') === 0, 'setup stores an Argon2id hash, in the file outside the web root', $hash);
check(strpos($hash, $env->code) === false, 'the hash does not contain the code');
$r = $env->client()->post($OWNER_API, ['action' => 'setup', 'setup_key' => $env->setupKey, 'code' => '99999999']);
check($r['status'] === 403 && trim((string)file_get_contents($env->hashFile)) === $hash, 'setup is closed for good once a code exists', j($r));

// 1. Owner authentication
$c = $env->client();
$r = $c->post($OWNER_API, ['action' => 'login', 'code' => $env->code]);
check($r['status'] === 200 && ($r['json']['ok'] ?? false) && strlen($r['json']['csrf'] ?? '') === 64, '1. the right code signs in and returns a CSRF token', j($r));
$cookieLine = '';
foreach (preg_split('/\r\n/', $r['head']) as $l) if (stripos($l, 'Set-Cookie: benaka_owner=') === 0) $cookieLine = $l;
check(stripos($cookieLine, 'HttpOnly') !== false && stripos($cookieLine, 'SameSite=Strict') !== false && stripos($cookieLine, 'path=/') !== false,
      '1. the session cookie is HttpOnly and SameSite=Strict', $cookieLine);
$c->csrf = $r['json']['csrf'];
$r = $env->client()->post($OWNER_API, ['action' => 'login', 'code' => '00000000']);
check($r['status'] === 401 && ($r['json']['error'] ?? '') === 'wrong' && ($r['json']['tries_left'] ?? 0) === 4, '1. a wrong code is refused, 4 tries left', j($r));
$db->exec('DELETE FROM gr_login_locks');

// The production cookie flags, read from the code: the test server runs on
// http, so it cannot show Secure and __Host- itself.
$auth = file_get_contents($env->root . '/review-api/lib/auth.php');
check(strpos($auth, "'secure'   => gr_cfg('COOKIE_SECURE', true) !== false") !== false && strpos($auth, "'__Host-benaka_owner'") !== false,
      '1. live cookies are Secure and __Host- (COOKIE_SECURE defaults to true)');
$ex = file_get_contents($env->root . '/review-api/config.example.php');
check(preg_match("/'COOKIE_SECURE'\s*=>\s*true/", $ex) === 1 && preg_match("/'TEST_CLOCK_FILE'\s*=>\s*''/", $ex) === 1
      && preg_match("/'REVIEWS_ENABLED'\s*=>\s*false/", $ex) === 1,
      'config.example.php: Secure cookies on, no test clock, reviews off until switched on');

/* ======================================================================== */
section('2. Owner functions without a session or CSRF token');
$before = (int)$db->query('SELECT COUNT(*) FROM gr_invitations')->fetchColumn();
$acts = [['action' => 'create', 'name' => 'Test Guest X', 'phone' => '9000000099', 'stay_from' => '2026-10-01', 'stay_to' => '2026-10-02'],
         ['action' => 'revoke', 'id' => 1], ['action' => 'verify', 'id' => 1], ['action' => 'reveal', 'id' => 1],
         ['action' => 'approve', 'id' => 1], ['action' => 'reject', 'id' => 1], ['action' => 'takedown', 'id' => 1], ['action' => 'logout']];
$fails = [];
foreach ($acts as $a) {
    $r = $env->client()->post($OWNER_API, $a);
    if ($r['status'] !== 401) $fails[] = $a['action'] . ' no session -> ' . $r['status'];
    $r = $owner->post($OWNER_API, $a, ['X-CSRF-Token' => null]);   // header left off
    $noTok = $owner->csrf; $owner->csrf = '';
    $r = $owner->post($OWNER_API, $a);
    $owner->csrf = $noTok;
    if ($r['status'] !== 403) $fails[] = $a['action'] . ' no CSRF -> ' . $r['status'];
    $r = $owner->post($OWNER_API, $a, ['X-CSRF-Token' => str_repeat('0', 64)]);
    if ($r['status'] !== 403) $fails[] = $a['action'] . ' wrong CSRF -> ' . $r['status'];
}
check(!$fails, '2. every owner action: 401 without a session, 403 without or with a wrong CSRF token', implode('; ', $fails));
$r = $env->client()->get("$OWNER_API?action=dashboard");
check($r['status'] === 401, '2. the dashboard needs a session', j($r));
check((int)$db->query('SELECT COUNT(*) FROM gr_invitations')->fetchColumn() === $before, '2. and none of those requests changed anything');
$r = $owner->req('POST', $OWNER_API, null, ['Content-Type' => 'text/plain'], json_encode($acts[0]));
check($r['status'] === 415, '2. a POST that is not application/json is refused (a cross-site form cannot send JSON)', j($r));
$r = $owner->post($OWNER_API, $acts[0], ['Origin' => 'https://evil.example']);
check($r['status'] === 403, '2. a POST from another origin is refused', j($r));
$r = $env->client()->get('/review-api/lib/db.php');
check($r['status'] === 404 && $r['body'] === '', 'review-api/lib/*.php refuses to run when requested directly', j($r));

/* ======================================================================== */
section('3. Invitation creation');
[$tok, $inv] = $env->invite($owner, ['name' => 'Test Guest One', 'phone' => '98765 43210']);
check(preg_match('/^[A-Za-z0-9_-]{43}$/', $tok) === 1, '3. the link carries a 32-byte random token (43 base64url characters)', $tok);
check(strpos($inv['link'], '/review/#t=') !== false, '3. the token is in the #fragment, so it never reaches a server log', $inv['link']);
$row = $db->query('SELECT * FROM gr_invitations WHERE id = ' . (int)$inv['id'])->fetch();
check($row['token_hash'] === hash('sha256', $tok), '3. only the SHA-256 of the token is stored');
$dump = json_encode($db->query('SELECT * FROM gr_invitations')->fetchAll());
check(strpos($dump, $tok) === false, '3. the token itself is nowhere in the table');
check($row['expires_at'] === gmdate('Y-m-d H:i:s', strtotime($T0) + 30 * 86400), '3. the default expiry is 30 days', $row['expires_at']);
check($row['phone_e164'] === '+919876543210', '3. a 10-digit number is stored as +91…', $row['phone_e164']);
$r = $owner->post($OWNER_API, ['action' => 'create', 'name' => 'Test Guest Default', 'phone' => '9000000002', 'stay_from' => '2026-10-01', 'stay_to' => '2026-10-02']);
check(($r['json']['require_check'] ?? null) === true, '3. the WhatsApp check is on unless the owner turns it off', j($r));
$r = $owner->post($OWNER_API, ['action' => 'create', 'name' => '<b>', 'phone' => '12', 'stay_from' => '2026-13-01', 'stay_to' => '2026-01-01', 'expiry_days' => 400]);
check($r['status'] === 422 && ($r['json']['fields'] ?? []) === ['name', 'phone', 'stay_from', 'expiry_days'], '3. a bad name, number, date and expiry are each named in the refusal', j($r));
$r = $owner->post($OWNER_API, ['action' => 'create', 'name' => 'Test Guest', 'phone' => '9000000001', 'stay_from' => '2026-10-05', 'stay_to' => '2026-10-05']);
check($r['status'] === 422 && in_array('stay_to', $r['json']['fields'] ?? [], true), '3. check-out must be after check-in', j($r));

/* ======================================================================== */
section('4. Invalid tokens');
$g = $env->client();
$dead = $g->post($GUEST_API, ['action' => 'check', 'token' => str_repeat('A', 43)]);
$variants = [
    'random'    => rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '='),
    'truncated' => substr($tok, 0, 42),
    'tampered'  => substr($tok, 0, 42) . ($tok[42] === 'A' ? 'B' : 'A'),
    'too long'  => $tok . 'A',
    'empty'     => '',
    'array'     => [$tok],
    'number'    => 12345,
    'sql'       => "' OR 1=1 -- ",
];
$same = true; $why = '';
foreach ($variants as $k => $v) {
    foreach (['check', 'submit'] as $a) {
        $r = $g->post($GUEST_API, ['action' => $a, 'token' => $v, 'rating' => 5, 'body' => str_repeat('x', 30), 'consent' => true, 'website' => '']);
        if ($r['status'] !== 410 || $r['body'] !== $dead['body']) { $same = false; $why .= "$k/$a: " . j($r) . '; '; }
    }
}
check($dead['status'] === 410 && $same, '4. random, truncated, tampered, malformed tokens: all the same 410 answer', $why);

/* ======================================================================== */
section('5-7. Expired, revoked and used links');
[$tE] = $env->invite($owner, ['name' => 'Test Guest Exp', 'expiry_days' => 1]);
$at($plus(86400 - 1));
$r = $g->post($GUEST_API, ['action' => 'check', 'token' => $tE]);
check($r['status'] === 200, '5. a link works one second before it expires', j($r));
$at($plus(86400));
$r1 = $g->post($GUEST_API, ['action' => 'check', 'token' => $tE]);
$r2 = $env->submit($tE);
check($r1['body'] === $dead['body'] && $r2['body'] === $dead['body'], '5. and at its expiry, check and submit both get the dead-link answer', j($r1) . ' / ' . j($r2));
$at($T0);
$owner = $env->owner();

[$tR, $iR] = $env->invite($owner, ['name' => 'Test Guest Rev']);
$r = $owner->post($OWNER_API, ['action' => 'revoke', 'id' => $iR['id']]);
check($r['status'] === 200, '6. the owner can revoke a link', j($r));
$r1 = $g->post($GUEST_API, ['action' => 'check', 'token' => $tR]);
$r2 = $env->submit($tR);
check($r1['body'] === $dead['body'] && $r2['body'] === $dead['body'], '6. a revoked link gets the dead-link answer for check and submit');
$r = $owner->post($OWNER_API, ['action' => 'revoke', 'id' => $iR['id']]);
check($r['status'] === 409, '6. revoking twice is refused, not repeated', j($r));
check($db->query('SELECT revoked_at FROM gr_invitations WHERE id=' . (int)$iR['id'])->fetchColumn() === gmdate('Y-m-d H:i:s', strtotime($T0)), '6. the revocation time is recorded');

$r = $env->submit($tok);
check($r['status'] === 200, '7. the first submission on a link succeeds', j($r));
$r1 = $env->submit($tok, ['body' => 'A second attempt with different text in it.']);
$r2 = $g->post($GUEST_API, ['action' => 'check', 'token' => $tok]);
check($r1['body'] === $dead['body'] && $r2['body'] === $dead['body'], '7. a second submission gets the dead-link answer', j($r1));
check((int)$db->query('SELECT COUNT(*) FROM gr_reviews WHERE invitation_id=' . (int)$inv['id'])->fetchColumn() === 1, '7. and exactly one review row exists for that link');
check($db->query('SELECT used_at FROM gr_invitations WHERE id=' . (int)$inv['id'])->fetchColumn() !== null, '7. the time it was used is recorded');

/* ======================================================================== */
section('8. The WhatsApp check');
[$tC, $iC] = $env->invite($owner, ['name' => 'Test Guest Check', 'phone' => '+91 90000 00042', 'require_check' => true]);
$r = $g->post($GUEST_API, ['action' => 'check', 'token' => $tC]);
check(($r['json']['needs_check'] ?? null) === true && preg_match('/^[A-Z2-9]{3}-[A-Z2-9]{3}$/', $r['json']['check_code'] ?? '') === 1
      && ($r['json']['owner_wa'] ?? '') === '919448647831', '8. the guest is shown a code and the owner\'s WhatsApp, not the form', j($r));
$r = $env->submit($tC);
check($r['status'] === 409 && ($r['json']['error'] ?? '') === 'needs_check', '8. the server refuses a submission before the owner verifies', j($r));
check((int)$db->query('SELECT COUNT(*) FROM gr_reviews WHERE invitation_id=' . (int)$iC['id'])->fetchColumn() === 0, '8. and stores nothing');
$r = $owner->post($OWNER_API, ['action' => 'verify', 'id' => $iC['id']]);
check($r['status'] === 200, '8. the owner taps Verified', j($r));
$r = $g->post($GUEST_API, ['action' => 'check', 'token' => $tC]);
check(($r['json']['needs_check'] ?? null) === false, '8. then the form opens', j($r));
$r = $env->submit($tC, ['name' => 'Someone Else', 'phone' => '+1 555 0100']);
$rv = $db->query('SELECT display_name FROM gr_reviews WHERE invitation_id=' . (int)$iC['id'])->fetch();
check($r['status'] === 200 && $rv && $rv['display_name'] === 'Test Guest Check', '8. a name sent with the review is ignored; the invitation\'s is used', j($r));
[, $iNo] = $env->invite($owner, ['name' => 'Test Guest NoCheck', 'require_check' => false]);
$r = $owner->post($OWNER_API, ['action' => 'verify', 'id' => $iNo['id']]);
check($r['status'] === 409, '8. Verified does nothing on an invitation with the check off', j($r));

/* ======================================================================== */
section('9-10. Rating and text validation');
[$tV] = $env->invite($owner, ['name' => 'Test Guest Valid']);
$badR = [0, 6, -1, 3.5, '5', 'five', null, true, [5], ['n' => 5]];
$why = '';
foreach ($badR as $v) {
    $r = $env->submit($tV, ['rating' => $v]);
    if ($r['status'] !== 422 || !in_array('rating', $r['json']['fields'] ?? [], true)) $why .= json_encode($v) . ': ' . j($r) . '; ';
}
check($why === '', '9. ratings 0, 6, -1, 3.5, "5", "five", null, true, [5], {} are all refused', $why);
$why = '';
foreach (['' => 'empty', '                         ' => 'spaces', "\n\n\n\t\t\n" => 'whitespace', str_repeat('a', 19) => '19 characters',
          str_repeat('a', 1501) => '1,501 characters', "\x01\x02\x03" . str_repeat('a', 17) => '17 after stripping controls'] as $v => $k) {
    $r = $env->submit($tV, ['body' => (string)$v]);
    if ($r['status'] !== 422 || !in_array('body', $r['json']['fields'] ?? [], true)) $why .= "$k: " . j($r) . '; ';
}
foreach ([123, ['text'], null] as $v) {
    $r = $env->submit($tV, ['body' => $v]);
    if ($r['status'] !== 422) $why .= json_encode($v) . ': ' . j($r) . '; ';
}
check($why === '', '10. empty, whitespace-only, too short, too long and non-text reviews are refused', $why);
foreach (['yes', 1, null] as $v) {
    $r = $env->submit($tV, ['consent' => $v]);
    if ($r['status'] !== 422) $why .= 'consent ' . json_encode($v) . ': ' . j($r);
}
check($why === '', '10. consent must be true or false', $why);
check((int)$db->query("SELECT COUNT(*) FROM gr_invitations WHERE status='used' AND token_hash='" . hash('sha256', $tV) . "'")->fetchColumn() === 0,
      '10. a refused submission does not use up the link');
$r = $env->submit($tV, ['body' => str_repeat('é', 1500)]);
check($r['status'] === 200, '10. exactly 1,500 characters (multi-byte) is accepted', j($r));
[$tV2] = $env->invite($owner, ['name' => 'Test Guest Valid Two']);
$r = $env->submit($tV2, ['body' => "  \x07Twenty-one characters\u{200B}  "]);
$stored = $db->query("SELECT body FROM gr_reviews ORDER BY id DESC LIMIT 1")->fetchColumn();
check($r['status'] === 200 && $stored === 'Twenty-one characters', '10. control and zero-width characters are stripped before counting and storing', j($r) . ' stored=' . json_encode($stored));
[$tH] = $env->invite($owner, ['name' => 'Test Guest Bot']);
$r = $env->submit($tH, ['website' => 'http://spam.example']);
check($r['body'] === $dead['body'] && (int)$db->query("SELECT COUNT(*) FROM gr_invitations WHERE status='used' AND token_hash='" . hash('sha256', $tH) . "'")->fetchColumn() === 0,
      'the honeypot: a filled hidden field stores nothing and does not use the link', j($r));

/* ======================================================================== */
section('11. Stored XSS');
$payload = '<script>alert(1)</script><img src=x onerror=alert(2)> "quotes" & \'apostrophes\' test text';
[$tX, $iX] = $env->invite($owner, ['name' => 'Test Guest Xss']);
$env->submit($tX, ['body' => $payload]);
$idX = (int)$db->query('SELECT id FROM gr_reviews WHERE invitation_id=' . (int)$iX['id'])->fetchColumn();
check($db->query("SELECT body FROM gr_reviews WHERE id=$idX")->fetchColumn() === $payload, '11. the payload is stored exactly as typed, as text');
$owner->post($OWNER_API, ['action' => 'approve', 'id' => $idX]);
$r = $env->client()->get($PUBLIC_API);
$found = array_values(array_filter($r['json']['reviews'] ?? [], fn($x) => $x['name'] === 'Test Guest Xss'));
check($found && $found[0]['body'] === $payload, '11. the public API returns it unchanged as a JSON string');
check(strpos($r['body'], '<script') === false && strpos($r['body'], '<img') === false && strpos($r['head'], 'application/json') !== false,
      '11. and with < > & escaped in the JSON itself, served as application/json');
$js = file_get_contents($env->root . '/web/js/reviews.js') . file_get_contents($env->root . '/owner/owner.js') . file_get_contents($env->root . '/review/review.js');
check(preg_match('/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write/', $js) === 0,
      '11. reviews.js, owner.js and review.js never use innerHTML, insertAdjacentHTML or document.write');
$r = $owner->post($OWNER_API, ['action' => 'create', 'name' => '<script>x</script>', 'phone' => '9000000009', 'stay_from' => '2026-10-01', 'stay_to' => '2026-10-02']);
check($r['status'] === 422, '11. the owner form refuses markup in a guest name', j($r));

/* ======================================================================== */
section('12-13. Moderation, and what is public');
$mk = function (string $name, bool $consent, ?string $fate, string $when) use ($env, $at) {
    $at($when);
    $o = $env->owner();
    [$t, $i] = $env->invite($o, ['name' => $name, 'phone' => '+91 9' . substr((string)crc32($name), 0, 4) . ' 0' . substr((string)crc32($name . 'x'), 0, 4)]);
    $env->submit($t, ['consent' => $consent, 'body' => "Test text from $name, not a real review."]);
    $id = (int)$env->pdo()->query('SELECT id FROM gr_reviews WHERE invitation_id=' . (int)$i['id'])->fetchColumn();
    if ($fate) $o->post('/review-api/owner.php', ['action' => $fate, 'id' => $id]);
    return [$id, $i];
};
[$idP] = $mk('Test Guest Pending', true, null, $T0);
[$idA] = $mk('Test Guest Approved', true, 'approve', $T0);
[$idN] = $mk('Test Guest NoConsent', false, 'approve', $T0);
[$idJ] = $mk('Test Guest Rejected', true, 'reject', $T0);
$owner = $env->owner();
$row = $db->query("SELECT status, moderated_at FROM gr_reviews WHERE id=$idA")->fetch();
check($row['status'] === 'approved' && $row['moderated_at'] === gmdate('Y-m-d H:i:s', strtotime($T0)), '12. approving sets the status and the moderation time');
check($db->query("SELECT status FROM gr_reviews WHERE id=$idJ")->fetchColumn() === 'rejected', '12. rejecting sets the status');
$r = $owner->post($OWNER_API, ['action' => 'approve', 'id' => $idA]);
check($r['status'] === 409, '12. approving twice is refused as no change', j($r));
$r = $owner->post($OWNER_API, ['action' => 'approve', 'id' => 999999]);
check($r['status'] === 409, '12. an unknown review id changes nothing', j($r));
$r = $owner->post($OWNER_API, ['action' => 'approve', 'id' => '1 OR 1=1']);
check($r['status'] === 422, '12. a non-integer id is refused', j($r));
$pub = $env->client()->get($PUBLIC_API);
$names = array_column($pub['json']['reviews'] ?? [], 'name');
check(in_array('Test Guest Approved', $names, true), '13. an approved, consented review is public');
check(!array_intersect(['Test Guest Pending', 'Test Guest NoConsent', 'Test Guest Rejected'], $names), '13. pending, rejected and unconsented reviews are not', implode(', ', $names));
$keys = array_unique(array_merge(...array_map('array_keys', $pub['json']['reviews'] ?: [[]])));
sort($keys);
check($keys === ['body', 'date', 'month', 'name', 'rating'], '13. a public review carries only name, rating, body, date and month', implode(',', $keys));
$r = $owner->post($OWNER_API, ['action' => 'reject', 'id' => $idA]);
$names = array_column($env->client()->get($PUBLIC_API)['json']['reviews'] ?? [], 'name');
check($r['status'] === 200 && !in_array('Test Guest Approved', $names, true), '13. rejecting an approved review takes it off the site at once');
$owner->post($OWNER_API, ['action' => 'approve', 'id' => $idA]);

/* ======================================================================== */
section('15. Months in Asia/Kolkata');
[$idOct] = $mk('Test Guest Oct31', true, 'approve', '2026-10-31T18:29:00Z');   // 23:59 IST, 31 Oct
[$idNov] = $mk('Test Guest Nov1', true, 'approve', '2026-10-31T18:35:00Z');    // 00:05 IST, 1 Nov
$mOct = $db->query("SELECT month_key FROM gr_reviews WHERE id=$idOct")->fetchColumn();
$mNov = $db->query("SELECT month_key FROM gr_reviews WHERE id=$idNov")->fetchColumn();
check($mOct === '2026-10' && $mNov === '2026-11', '15. 31 Oct 23:59 IST files under October, 1 Nov 00:05 IST under November (both 31 Oct in UTC)', "$mOct / $mNov");
$at('2026-11-01T00:00:00Z');
$oct = array_column($env->client()->get("$PUBLIC_API?month=2026-10")['json']['reviews'] ?? [], 'name');
$nov = $env->client()->get("$PUBLIC_API?month=2026-11")['json']['reviews'] ?? [];
check(in_array('Test Guest Oct31', $oct, true) && !in_array('Test Guest Nov1', $oct, true)
      && array_column($nov, 'name') === ['Test Guest Nov1'] && $nov[0]['date'] === '2026-11-01',
      '15. ?month= filters by the IST month, and the date shown is the IST date', json_encode($nov));
$r = $env->client()->get("$PUBLIC_API?month=2026-13");
check($r['status'] === 400, '15. a malformed month is refused', j($r));
$at($T0);

/* ======================================================================== */
section('16. Owner session lifetime');
$at($T0);
$s = $env->owner();
$at($plus(29 * 60));
check($s->get("$OWNER_API?action=dashboard")['status'] === 200, 'a session is still alive after 29 idle minutes');
$at($plus(29 * 60 + 29 * 60));
check($s->get("$OWNER_API?action=dashboard")['status'] === 200, 'activity keeps it alive (58 minutes in, 29 since the last request)');
$at($plus(58 * 60 + 30 * 60));
check($s->get("$OWNER_API?action=dashboard")['status'] === 401, 'it ends after 30 idle minutes');
$at($T0);
$s = $env->owner();
$s->post($OWNER_API, ['action' => 'logout']);
check($s->get("$OWNER_API?action=dashboard")['status'] === 401, 'signing out ends the session on the server');

/* ======================================================================== */
section('21-22. The 5-try lockout');
$db->exec('DELETE FROM gr_login_locks');
$at($T0);
$dev = $env->client();
$left = [];
for ($i = 0; $i < 4; $i++) $left[] = $dev->post($OWNER_API, ['action' => 'login', 'code' => '1111111' . $i])['json']['tries_left'] ?? null;
$r5 = $dev->post($OWNER_API, ['action' => 'login', 'code' => '22222222']);
check($left === [4, 3, 2, 1] && $r5['status'] === 423 && ($r5['json']['retry_after'] ?? 0) === 1800,
      '21. tries left count down 4, 3, 2, 1, and the 5th wrong code locks for 30 minutes', json_encode($left) . ' ' . j($r5));
$r = $dev->post($OWNER_API, ['action' => 'login', 'code' => $env->code]);
check($r['status'] === 423 && !isset($r['json']['csrf']), '21. the 6th try is refused even with the right code', j($r));
$r = $env->client()->post($OWNER_API, ['action' => 'login', 'code' => $env->code]);
check($r['status'] === 423, '21. a fresh browser (no cookies) is locked out too: the count is per account, not per page', j($r));
$r = $env->client()->get("$OWNER_API?action=session");
check(($r['json']['retry_after'] ?? 0) === 1800, '21. reloading the page shows the lock and does not reset it', j($r));
$at($plus(29 * 60 + 59));
$r = $dev->post($OWNER_API, ['action' => 'login', 'code' => $env->code]);
check($r['status'] === 423 && ($r['json']['retry_after'] ?? 0) === 1, '22. still locked one second before the 30 minutes are up', j($r));
$at($plus(30 * 60));
$r = $dev->post($OWNER_API, ['action' => 'login', 'code' => $env->code]);
check($r['status'] === 200, '22. the lock lifts after 30 minutes and the right code works', j($r));
$r = $env->client()->post($OWNER_API, ['action' => 'login', 'code' => '33333333']);
check(($r['json']['tries_left'] ?? 0) === 4, '22. and the count starts again from 5', j($r));
// Per device: the device's own count does not reset when the owner signs in
// from somewhere else, so it cannot be "laundered" by successes in between.
$db->exec('DELETE FROM gr_login_locks');
$at($plus(31 * 60));
$atk = $env->client();
for ($i = 0; $i < 4; $i++) $atk->post($OWNER_API, ['action' => 'login', 'code' => '4444444' . $i]);
$lockRows = $db->query("SELECT scope, fails FROM gr_login_locks")->fetchAll(PDO::FETCH_KEY_PAIR);
$devScope = array_values(array_filter(array_keys($lockRows), fn($k) => strpos($k, 'dev:') === 0));
check(count($devScope) === 1 && $lockRows[$devScope[0]] === 4 && $lockRows['account'] === 4, '21. failures are counted per device and for the account', json_encode($lockRows));
// Concurrency on the lock: 8 wrong codes at once must not slip past 5.
$db->exec('DELETE FROM gr_login_locks');
$mh = curl_multi_init(); $hs = [];
$par = $env->client();
for ($i = 0; $i < 8; $i++) { $h = $par->handle('POST', $OWNER_API, ['action' => 'login', 'code' => '5555555' . $i]); $hs[] = $h; curl_multi_add_handle($mh, $h); }
do { curl_multi_exec($mh, $running); curl_multi_select($mh); } while ($running);
$codes = [];
foreach ($hs as $h) { $codes[] = (int)curl_getinfo($h, CURLINFO_RESPONSE_CODE); curl_multi_remove_handle($mh, $h); }
sort($codes);
check(count(array_filter($codes, fn($c) => $c === 401)) === 4 && count(array_filter($codes, fn($c) => $c === 423)) === 4,
      '21. 8 wrong codes sent at once: exactly 4 are judged, the rest are locked out', json_encode($codes));
$db->exec('DELETE FROM gr_login_locks');
$at($T0);

/* ======================================================================== */
section('C. Two submissions on one link at the same moment');
$owner = $env->owner();
$results = [];
$rounds = 15;
for ($k = 0; $k < $rounds; $k++) {
    $db->exec('DELETE FROM gr_rate_limits');
    [$tt, $ii] = $env->invite($owner, ['name' => "Test Guest Race $k"]);
    $n = $k === 0 ? 8 : 2;
    $mh = curl_multi_init(); $hs = [];
    for ($i = 0; $i < $n; $i++) {
        $h = $env->client()->handle('POST', $GUEST_API, ['action' => 'submit', 'token' => $tt, 'rating' => 4, 'body' => "Test race text number $i, not a real review.", 'consent' => true, 'website' => '']);
        $hs[] = $h; curl_multi_add_handle($mh, $h);
    }
    do { curl_multi_exec($mh, $running); curl_multi_select($mh); } while ($running);
    $codes = [];
    foreach ($hs as $h) { $codes[] = (int)curl_getinfo($h, CURLINFO_RESPONSE_CODE); curl_multi_remove_handle($mh, $h); }
    $rows = (int)$db->query('SELECT COUNT(*) FROM gr_reviews WHERE invitation_id=' . (int)$ii['id'])->fetchColumn();
    $results[] = [count(array_filter($codes, fn($c) => $c === 200)), count(array_filter($codes, fn($c) => $c === 410)), $rows, $n];
}
$good = array_filter($results, fn($x) => $x[0] === 1 && $x[1] === $x[3] - 1 && $x[2] === 1);
check(count($good) === $rounds, "C. $rounds races (one of 8 at once, 14 of 2): every time exactly one succeeds, the rest get the dead-link answer, one row",
      json_encode($results));
$log = (string)@file_get_contents($env->dir . '/server.log');
check(strpos($log, 'Failed') === false || substr_count($log, '[200]') > 0, 'C. the test server ran the requests in parallel (PHP_CLI_SERVER_WORKERS=4)');

/* ======================================================================== */
section('24. Day 30');
$db->exec('DELETE FROM gr_reviews'); $db->exec('DELETE FROM gr_invitations');
$D = '2026-11-20T06:00:00Z';
[$pA, $invA] = $mk('Test Guest Keep', true, 'approve', $D);
[$pN, $invN] = $mk('Test Guest NoShow', false, 'approve', $D);
[$pW, $invW] = $mk('Test Guest Waiting', true, null, $D);
[$pJ, $invJ] = $mk('Test Guest Nope', true, 'reject', $D);
$at($D);
$o = $env->owner();
[, $unused] = $env->invite($o, ['name' => 'Test Guest Unused', 'phone' => '+91 90000 00077', 'expiry_days' => 5]);
$phones = $db->query('SELECT phone_e164 FROM gr_invitations')->fetchAll(PDO::FETCH_COLUMN);
$D30 = gmdate('Y-m-d\TH:i:s\Z', strtotime($D) + 30 * 86400);
$at(gmdate('Y-m-d\TH:i:s\Z', strtotime($D30) - 1));
$env->client()->get($PUBLIC_API);
check((int)$db->query('SELECT COUNT(*) FROM gr_reviews')->fetchColumn() === 4 && (int)$db->query('SELECT COUNT(*) FROM gr_invitations')->fetchColumn() === 5,
      '24. one second before day 30 nothing has been touched');
$o = $env->owner();
$dash = $o->get("$OWNER_API?action=dashboard")['json'];
$w = array_values(array_filter($dash['waiting'] ?? [], fn($x) => $x['name'] === 'Test Guest Waiting'));
check($w && $w[0]['card']['dissolves_in'] === 1, '24. the card says it dissolves in 1 day', json_encode($w[0]['card'] ?? null));
$at($D30);
$pub = $env->client()->get($PUBLIC_API);          // any request runs the purge
$left = $db->query('SELECT id, invitation_id, display_name, rating, body, status, consent_public, submitted_at FROM gr_reviews')->fetchAll();
check(count($left) === 1 && $left[0]['display_name'] === 'Test Guest Keep' && $left[0]['invitation_id'] === null
      && (int)$left[0]['rating'] === 5 && $left[0]['body'] === 'Test text from Test Guest Keep, not a real review.'
      && $left[0]['submitted_at'] === gmdate('Y-m-d H:i:s', strtotime($D)),
      '24. at day 30 the approved, consented review keeps its name, stars, text and date, with no invitation', json_encode($left));
check((int)$db->query("SELECT COUNT(*) FROM gr_reviews WHERE id IN ($pN, $pW, $pJ)")->fetchColumn() === 0,
      '24. the waiting, rejected and unconsented reviews are deleted entirely');
$invLeft = $db->query('SELECT guest_name FROM gr_invitations')->fetchAll(PDO::FETCH_COLUMN);
check($invLeft === ['Test Guest Unused'], '24. every reviewed invitation is gone (number, stay dates and all); the unused one waits for its own clock', json_encode($invLeft));
$all = '';
foreach (['gr_reviews', 'gr_invitations', 'gr_sessions', 'gr_login_locks', 'gr_rate_limits'] as $t) $all .= json_encode($db->query("SELECT * FROM $t")->fetchAll());
$leak = array_filter($phones, fn($p) => $p !== '+919000000077' && strpos($all, substr($p, -10)) !== false);
check(!$leak, '24. no reviewed guest\'s number is left anywhere in the database', implode(',', $leak));
check(array_column($pub['json']['reviews'] ?? [], 'name') === ['Test Guest Keep'], '24. the kept review is still on the site');
$o = $env->owner();
$dash = $o->get("$OWNER_API?action=dashboard")['json'];
check(count($dash['published']) === 1 && $dash['published'][0]['card'] === null && !$dash['waiting'] && !$dash['rejected'],
      '24. on the dashboard it is in Published with no card; Waiting is empty', json_encode($dash['published']));
$r = $o->post($OWNER_API, ['action' => 'takedown', 'id' => $pA]);
check($r['status'] === 200 && !($env->client()->get($PUBLIC_API)['json']['reviews'] ?? [1]), '24. the owner can still take it down, which deletes it', j($r));
// The unused invitation: expired at D+5 days, deleted 30 days after that.
$at(gmdate('Y-m-d\TH:i:s\Z', strtotime($D) + 35 * 86400 - 1));
$env->client()->get($PUBLIC_API);
check((int)$db->query('SELECT COUNT(*) FROM gr_invitations')->fetchColumn() === 1, '24. an unused invitation is kept until 30 days after it expired');
$at(gmdate('Y-m-d\TH:i:s\Z', strtotime($D) + 35 * 86400));
$env->client()->get($PUBLIC_API);
check((int)$db->query('SELECT COUNT(*) FROM gr_invitations')->fetchColumn() === 0, '24. and deleted then');
$at($T0);

/* ======================================================================== */
section('14. Phone numbers never leave through a public or guest response');
$owner = $env->owner();
[$tP] = $env->invite($owner, ['name' => 'Test Guest Phone', 'phone' => '+91 98123 45678', 'require_check' => true]);
$g = $env->client();
$g->post($GUEST_API, ['action' => 'check', 'token' => $tP]);
$env->submit($tP);
$env->client()->get($PUBLIC_API);
$env->client()->get("$PUBLIC_API?month=2026-10");
$allPhones = array_unique(array_merge($phones, ['+919876543210', '+919000000042', '+919812345678']));
$leaks = [];
foreach (Client::$seen as $resp) {
    // Owner responses may hold a number: they are the only ones allowed to.
    if (strpos($resp['head'], 'benaka_owner') !== false) continue;
    $txt = $resp['head'] . $resp['body'];
    if (preg_match('/"phone"\s*:/', $resp['body']) && strpos($resp['body'], '"link"') !== false) continue;   // the owner's create response
    if (strpos($resp['body'], '"waiting"') !== false || strpos($resp['body'], '"phone":"+') !== false) continue;  // owner dashboard / reveal
    $digits = preg_replace('/\D/', '', $txt);
    foreach ($allPhones as $p) {
        $d = substr($p, -10);
        if (strpos($digits, $d) !== false && strpos($txt, $d) !== false) $leaks[] = $d;
        if (strpos($txt, substr($d, 0, 5) . ' ' . substr($d, 5)) !== false) $leaks[] = $d . ' (spaced)';
    }
}
check(!$leaks, '14. scanned ' . count(Client::$seen) . ' responses: no guest number in any guest or public one, before or after day 30', implode(',', array_unique($leaks)));
// And through the owner page, masked unless the owner asks.
$dash = $owner->get("$OWNER_API?action=dashboard");
check(strpos($dash['body'], '98123') === false && strpos($dash['body'], '45678') === false && strpos($dash['body'], '+91 ••••• •••••') !== false,
      '14. the dashboard sends numbers masked');

/* ======================================================================== */
section('23. The code is never in a page, a response or the repository');
$hash = trim((string)file_get_contents($env->hashFile));
$hits = [];
foreach (Client::$seen as $resp) {
    if (strpos($resp['body'], $env->code) !== false) $hits[] = 'a response body';
    if (strpos($resp['body'], $hash) !== false || strpos($resp['body'], '$argon2id$') !== false) $hits[] = 'a response with the hash';
}
$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($env->root, FilesystemIterator::SKIP_DOTS));
foreach ($it as $f) {
    $p = $f->getPathname();
    if (preg_match('#/(\.git|assets|render|node_modules)/#', $p) || $f->getSize() > 2_000_000) continue;
    $s = file_get_contents($p);
    if (strpos($s, $env->code) !== false || strpos($s, $hash) !== false) $hits[] = substr($p, strlen($env->root));
}
foreach (['/owner/', '/owner/owner.js', '/owner/lock.js', '/review/', '/web/'] as $u) {
    $r = $env->client()->get($u);
    if (strpos($r['body'], $env->code) !== false || strpos($r['body'], '$argon2') !== false) $hits[] = $u;
}
check(!$hits, '23. this run\'s code and its hash appear in no response, no page and no file in the repository', implode(', ', $hits));
$log = (string)@file_get_contents($env->dir . '/server.log');
check(strpos($log, $env->code) === false, '23. nor in the server log');

/* ======================================================================== */
section('Rate limits');
$at('2026-10-15T07:00:00Z');
$rl = $env->client();
$codes = [];
for ($i = 0; $i < 31; $i++) $codes[] = $rl->post($GUEST_API, ['action' => 'check', 'token' => str_repeat('B', 43)])['status'];
check(count(array_filter($codes, fn($c) => $c === 410)) === 30 && end($codes) === 429, 'the guest endpoint allows 30 token tries per 10 minutes per IP, then 429', json_encode(array_count_values($codes)));
$at('2026-10-15T07:10:00Z');
check($rl->post($GUEST_API, ['action' => 'check', 'token' => str_repeat('B', 43)])['status'] === 410, 'and lets the next window through');
$at($T0);

/* ======================================================================== */
section('Headers on every API response');
$heads = array_filter(Client::$seen, fn($x) => $x['status'] > 0 && strpos($x['body'], '{') === 0);
$missing = 0;
foreach ($heads as $h) {
    if (stripos($h['head'], 'Cache-Control: no-store') === false || stripos($h['head'], 'X-Content-Type-Options: nosniff') === false
        || stripos($h['head'], 'X-Robots-Tag: noindex') === false || stripos($h['head'], 'application/json') === false) $missing++;
}
check($missing === 0, 'every JSON response is no-store, nosniff, noindex, application/json (' . count($heads) . ' checked)', "$missing without");

/* ======================================================================== */
section('The off switch (REVIEWS_ENABLED)');
$env->writeConfig(['REVIEWS_ENABLED' => false, 'DB_DSN' => 'mysql:host=192.0.2.1;port=1;dbname=nope', 'DB_PASS' => 'wrong']);
$codes = [
    $env->client()->get($PUBLIC_API),
    $env->client()->post($GUEST_API, ['action' => 'check', 'token' => $tok]),
    $env->client()->get("$OWNER_API?action=session"),
    $owner->post($OWNER_API, ['action' => 'login', 'code' => $env->code]),
];
check(count(array_filter($codes, fn($r) => $r['status'] === 503 && ($r['json']['error'] ?? '') === 'paused')) === 4,
      'switched off: every endpoint answers 503 paused, without touching the database (its DSN is unreachable here)',
      implode(' / ', array_map('j', $codes)));
$env->writeConfig(['REVIEWS_ENABLED' => true, 'DB_DSN' => Env::connection()[0] . ';dbname=' . $env->dbName . ';charset=utf8mb4', 'DB_PASS' => Env::connection()[2]]);
check($env->client()->get($PUBLIC_API)['status'] === 200, 'switched back on: it answers again');
@unlink($env->cfgPath);
$r = $env->client()->get($PUBLIC_API);
check($r['status'] === 503 && ($r['json']['error'] ?? '') === 'paused', 'no config file at all: also 503 paused', j($r));
$env->writeConfig();

/* ======================================================================== */
section('Migration');
$env->migrate('001_guest_reviews.down.sql');
$t = $db->query("SHOW FULL TABLES")->fetchAll(PDO::FETCH_COLUMN);
check(!$t, 'the down script removes every table and the view it created, and nothing else', implode(',', $t));
$env->migrate('001_guest_reviews.sql');
$env->migrate('001_guest_reviews.sql');
$t = $db->query("SHOW FULL TABLES")->fetchAll(PDO::FETCH_COLUMN);
sort($t);
check($t === ['gr_invitations', 'gr_login_locks', 'gr_public_reviews', 'gr_rate_limits', 'gr_reviews', 'gr_sessions'], 'the up script runs twice without error (IF NOT EXISTS) and creates 5 tables and 1 view', implode(',', $t));
$up = file_get_contents($env->root . '/migrations/001_guest_reviews.sql');
$stmts = array_filter(array_map('trim', explode(';', preg_replace('/--[^\n]*/', '', $up))));
$notCreate = array_filter($stmts, fn($x) => !preg_match('/^CREATE\s+(TABLE\s+IF\s+NOT\s+EXISTS|OR\s+REPLACE\s+VIEW)\b/i', $x));
check(count($stmts) === 6 && !$notCreate, 'the up script is additive: 6 statements, every one CREATE TABLE IF NOT EXISTS or CREATE OR REPLACE VIEW', implode(' | ', array_map(fn($x) => substr($x, 0, 40), $notCreate)));
$cols = $db->query("SHOW COLUMNS FROM gr_public_reviews")->fetchAll(PDO::FETCH_COLUMN);
check($cols === ['display_name', 'rating', 'body', 'submitted_at', 'month_key'], 'the public view has no id, invitation, phone or status column', implode(',', $cols));

} catch (Throwable $e) {
    bad('the suite crashed', get_class($e) . ': ' . $e->getMessage() . ' at line ' . $e->getLine());
}

printf("\n  %d passed, %d failed\n", $PASS, $FAIL);
exit($FAIL ? 1 : 0);
