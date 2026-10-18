<?php
/*
 * GET /review-api/public.php            every published review
 * GET /review-api/public.php?month=YYYY-MM   one month (Asia/Kolkata)
 *
 * The only endpoint a visitor's browser touches. It reads the
 * gr_public_reviews view and nothing else: approved AND consented, and the
 * view has no id, invitation, phone or status column to leak.
 *
 * GitHub Pages serves this file as plain text, never as PHP, so there the
 * homepage gets non-JSON and hides the section. That is intended.
 */
declare(strict_types=1);
define('BENAKA_REVIEWS', true);
require __DIR__ . '/lib/bootstrap.php';

if (gr_method() !== 'GET') gr_json(405, ['ok' => false, 'error' => 'method']);
$db = gr_boot('public');
gr_rate_limit($db, 'public');

$month = $_GET['month'] ?? null;
if ($month !== null && (!is_string($month) || !preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $month))) {
    gr_json(400, ['ok' => false, 'error' => 'month']);
}

$sql = 'SELECT display_name, rating, body, submitted_at, month_key, stay_from, stay_to FROM gr_public_reviews';
$args = [];
if ($month !== null) { $sql .= ' WHERE month_key = ?'; $args[] = $month; }
$sql .= ' ORDER BY submitted_at DESC LIMIT 300';
$st = $db->prepare($sql);
$st->execute($args);

$out = [];
foreach ($st as $r) {
    $out[] = [
        'name'   => $r['display_name'],
        'rating' => (int)$r['rating'],
        'body'   => $r['body'],
        'date'   => gr_ist_date($r['submitted_at']),
        'month'  => $r['month_key'],
        // The guest's stay, shown on the card. Null only for a review older
        // than migration 002 whose invitation had already gone.
        'stay'   => ($r['stay_from'] && $r['stay_to']) ? [
            'from'   => $r['stay_from'],
            'to'     => $r['stay_to'],
            'nights' => (int)round((strtotime($r['stay_to']) - strtotime($r['stay_from'])) / 86400),
        ] : null,
    ];
}
gr_json(200, ['ok' => true, 'reviews' => $out]);
