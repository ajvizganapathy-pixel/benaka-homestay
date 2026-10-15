<?php
/*
 * Guest reviews: fixed-window rate limits, per endpoint and hashed IP.
 * The real gate on reviews is the single-use link; this only slows down
 * guessing and spam. A limit hit answers 429 with Retry-After.
 */
declare(strict_types=1);
if (!defined('BENAKA_REVIEWS')) { http_response_code(404); exit; }

const GR_LIMITS = [
    // name    => [hits, window seconds]
    'public'  => [120, 60],
    'invite'  => [30, 600],     // token checks and submissions
    'login'   => [20, 600],     // on top of the 5-try lockout
    'owner'   => [600, 600],
    'setup'   => [10, 600],
];

function gr_rate_limit(PDO $db, string $name): void {
    [$max, $win] = GR_LIMITS[$name];
    $now = gr_now()->getTimestamp();
    $start = $now - ($now % $win);
    $bucket = hash('sha256', $name . '|' . gr_ip_hash() . '|' . $start);
    $ws = gr_sql((new DateTimeImmutable('@' . $start)));
    $db->prepare('INSERT INTO gr_rate_limits (bucket, window_start, hits) VALUES (?, ?, 1)
                  ON DUPLICATE KEY UPDATE hits = hits + 1')->execute([$bucket, $ws]);
    $st = $db->prepare('SELECT hits FROM gr_rate_limits WHERE bucket = ?');
    $st->execute([$bucket]);
    $hits = (int)$st->fetchColumn();
    if ($hits > $max) {
        header('Retry-After: ' . (($start + $win) - $now));
        gr_json(429, ['ok' => false, 'error' => 'slow_down']);
    }
}
