<?php
/*
 * Brings up a test environment full of OBVIOUSLY FAKE data and keeps its
 * server running, for the browser suite and for screenshots.
 *
 *   php tests/reviews/seed.php <out.json> [--empty] [--xss]
 *
 * Writes {base, code, db} to out.json, then waits. SIGTERM/SIGINT tears it
 * all down: server stopped, database dropped, files removed.
 *
 * Every name is "Test Guest ..." and every review says it is test text. No
 * real guest, no invented praise, nothing that could be mistaken for a real
 * review if a screenshot of it travels.
 */
declare(strict_types=1);
require __DIR__ . '/harness.php';

$out = $argv[1] ?? '';
if ($out === '') { fwrite(STDERR, "usage: seed.php <out.json> [--empty] [--xss]\n"); exit(2); }
$empty = in_array('--empty', $argv, true);
$xss = in_array('--xss', $argv, true);

$env = Env::up();
$stop = function () use ($env, $out) { $env->down(); @unlink($out); exit(0); };
pcntl_async_signals(true);
pcntl_signal(SIGTERM, $stop);
pcntl_signal(SIGINT, $stop);

try {
    $owner = $env->owner();
    $NOW = '2026-10-15T06:00:00Z';

    // [name, phone, from, to, submitted (UTC), stars, body, consent, fate]
    $text = [
        's' => 'Test text for the layout. Not a real review.',
        'm' => 'Test text for the layout, medium length. This is not a real review; it stands in so the card sizes can be checked before any guest writes one.',
        'l' => "Test text for the layout, long. This is not a real review.\n\nIt runs to several sentences so that the tall card, the paragraph break and the line length can be checked on a phone and on a wide screen. Nothing here describes the property, because the site must never show invented praise. It only takes up the space a real review would.",
    ];
    $rows = $empty ? [] : [
        ['Test Guest One',   '+91 90000 00001', '2026-09-02', '2026-09-05', '2026-09-08T05:00:00Z', 5, $text['m'], true,  'approve'],
        ['Test Guest Two',   '+91 90000 00002', '2026-09-20', '2026-09-22', '2026-09-24T09:30:00Z', 4, $text['s'], true,  'approve'],
        ['Test Guest Three', '+91 90000 00003', '2026-09-28', '2026-10-01', '2026-10-03T12:00:00Z', 5, $text['l'], true,  'approve'],
        ['Test Guest Four',  '+91 90000 00004', '2026-10-04', '2026-10-06', '2026-10-07T04:15:00Z', 5, $text['s'], true,  'approve'],
        ['Test Guest Five',  '+91 90000 00005', '2026-10-05', '2026-10-08', '2026-10-09T15:45:00Z', 3, $text['m'], true,  'approve'],
        ['Test Guest Six',   '+91 90000 00006', '2026-10-08', '2026-10-10', '2026-10-11T07:20:00Z', 4, $text['s'], false, 'approve'],
        ['Test Guest Seven', '+91 90000 00007', '2026-10-10', '2026-10-13', '2026-10-14T10:00:00Z', 5, $text['m'], true,  'wait'],
        ['Test Guest Eight', '+91 90000 00008', '2026-10-11', '2026-10-12', '2026-10-14T16:30:00Z', 2, $text['s'], false, 'wait'],
        ['Test Guest Nine',  '+91 90000 00009', '2026-09-25', '2026-09-27', '2026-09-29T08:00:00Z', 1, $text['s'], true,  'reject'],
    ];
    if ($xss) {
        $rows[] = ['Test Guest <img src=x onerror=alert(1)>', '+91 90000 00010', '2026-10-01', '2026-10-02', '2026-10-12T05:00:00Z', 5,
                   '<script>window.__xss=1</script><img src=x onerror="window.__xss=2"> test text, not a real review', true, 'approve'];
    }

    foreach ($rows as [$name, $phone, $from, $to, $at, $stars, $body, $consent, $fate]) {
        $env->clock(date('Y-m-d\TH:i:s\Z', strtotime($at) - 86400));
        $owner = $env->owner();     // the clock jumped: the old session has idled out, as it should
        // The name validator refuses < and >; the XSS row goes straight into
        // the table, as if the validator had been bypassed.
        if (strpbrk($name, '<>') !== false) {
            [$tok] = $env->invite($owner, ['name' => 'Test Guest XSS', 'phone' => $phone, 'stay_from' => $from, 'stay_to' => $to]);
            $env->pdo()->prepare('UPDATE gr_invitations SET guest_name = ? WHERE guest_name = ?')->execute([$name, 'Test Guest XSS']);
        } else {
            [$tok] = $env->invite($owner, ['name' => $name, 'phone' => $phone, 'stay_from' => $from, 'stay_to' => $to]);
        }
        $env->clock($at);
        $r = $env->submit($tok, ['rating' => $stars, 'body' => $body, 'consent' => $consent]);
        if (($r['json']['ok'] ?? false) !== true) throw new RuntimeException("submit failed for $name: " . $r['body']);
        $id = (int)$env->pdo()->query('SELECT MAX(id) FROM gr_reviews')->fetchColumn();
        if ($fate !== 'wait') {
            $owner = $env->owner();
            $owner->post('/review-api/owner.php', ['action' => $fate, 'id' => $id]);
        }
    }

    if (!$empty) {
        // Invitations in every state.
        $env->clock('2026-10-12T05:00:00Z');
        $owner = $env->owner();
        $env->invite($owner, ['name' => 'Test Guest Ten', 'phone' => '+91 90000 00011', 'stay_from' => '2026-10-09', 'stay_to' => '2026-10-11', 'require_check' => true]);
        [, $v] = $env->invite($owner, ['name' => 'Test Guest Eleven', 'phone' => '+91 90000 00012', 'stay_from' => '2026-10-10', 'stay_to' => '2026-10-12', 'require_check' => true]);
        [, $rv] = $env->invite($owner, ['name' => 'Test Guest Twelve', 'phone' => '+91 90000 00013', 'stay_from' => '2026-10-01', 'stay_to' => '2026-10-03']);
        $env->clock('2026-09-10T05:00:00Z');
        $owner = $env->owner();
        $env->invite($owner, ['name' => 'Test Guest Thirteen', 'phone' => '+91 90000 00014', 'stay_from' => '2026-08-28', 'stay_to' => '2026-08-30', 'expiry_days' => 14]);
        $env->clock('2026-10-13T05:00:00Z');
        $owner = $env->owner();
        $owner->post('/review-api/owner.php', ['action' => 'verify', 'id' => $v['id']]);
        $owner->post('/review-api/owner.php', ['action' => 'revoke', 'id' => $rv['id']]);
    }
    $env->clock($NOW);
    // Leave no session behind: the browser signs in for itself.
    $env->pdo()->exec('DELETE FROM gr_sessions');
    $env->pdo()->exec('DELETE FROM gr_login_locks');
} catch (Throwable $e) {
    fwrite(STDERR, 'seed failed: ' . $e->getMessage() . "\n");
    $env->down();
    exit(1);
}

file_put_contents($out, json_encode(['base' => $env->base, 'code' => $env->code, 'db' => $env->dbName,
                                     'clock' => $env->clockFile, 'config' => $env->cfgPath]));
while (true) sleep(1);
