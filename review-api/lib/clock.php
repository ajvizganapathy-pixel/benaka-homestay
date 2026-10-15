<?php
/*
 * Guest reviews: the one clock. Every time the code writes or compares comes
 * from gr_now(), never from SQL NOW()/UTC_TIMESTAMP(), so the tests can step
 * past an expiry, a 30-minute lockout or the day-30 purge without waiting.
 *
 * TEST_CLOCK_FILE is honoured only by the PHP built-in server and the CLI.
 * Under Apache/LiteSpeed it is ignored even if someone sets it, and
 * tools/test.sh fails if config.example.php ever sets it.
 */
declare(strict_types=1);
if (!defined('BENAKA_REVIEWS')) { http_response_code(404); exit; }

function gr_now(): DateTimeImmutable {
    $utc = new DateTimeZone('UTC');
    if (PHP_SAPI === 'cli-server' || PHP_SAPI === 'cli') {
        $f = (string)gr_cfg('TEST_CLOCK_FILE', '');
        if ($f !== '' && is_file($f)) {
            $t = trim((string)file_get_contents($f));
            if ($t !== '') return new DateTimeImmutable($t, $utc);
        }
    }
    return new DateTimeImmutable('now', $utc);
}

/** UTC DATETIME string for SQL. */
function gr_sql(DateTimeImmutable $t): string {
    return $t->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
}

function gr_from_sql(?string $s): ?DateTimeImmutable {
    if ($s === null || $s === '') return null;
    return new DateTimeImmutable($s, new DateTimeZone('UTC'));
}

/** 'YYYY-MM' of a UTC instant, as the calendar reads in Asia/Kolkata. */
function gr_month_key(DateTimeImmutable $t): string {
    return $t->setTimezone(new DateTimeZone(GR_TZ))->format('Y-m');
}

/** 'YYYY-MM-DD' of a UTC instant in Asia/Kolkata. */
function gr_ist_date(?string $sqlUtc): ?string {
    $t = gr_from_sql($sqlUtc);
    return $t ? $t->setTimezone(new DateTimeZone(GR_TZ))->format('Y-m-d') : null;
}

/** ISO 8601 UTC for JSON. */
function gr_iso(?string $sqlUtc): ?string {
    $t = gr_from_sql($sqlUtc);
    return $t ? $t->format('Y-m-d\TH:i:s\Z') : null;
}
