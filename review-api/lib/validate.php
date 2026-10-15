<?php
/*
 * Guest reviews: input rules. Every value from a browser passes through one of
 * these, on the server, whatever the page already checked. Each returns the
 * clean value or null.
 */
declare(strict_types=1);
if (!defined('BENAKA_REVIEWS')) { http_response_code(404); exit; }

const GR_BODY_MIN = 20;
const GR_BODY_MAX = 1500;
const GR_NAME_MAX = 80;

/** Remove control characters (keeping newlines), normalise line ends, trim. */
function gr_clean_text(string $s, bool $multiline): string {
    if (!mb_check_encoding($s, 'UTF-8')) return '';
    $s = str_replace(["\r\n", "\r"], "\n", $s);
    $s = str_replace("\t", ' ', $s);
    // C0 and C1 controls, DEL, zero-width and bidi overrides. Newlines stay
    // only where a paragraph break makes sense.
    $s = preg_replace('/[\x{0000}-\x{0009}\x{000B}-\x{001F}\x{007F}-\x{009F}\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}\x{FEFF}]/u', '', $s) ?? '';
    if (!$multiline) $s = str_replace("\n", ' ', $s);
    $s = preg_replace('/[ ]{2,}/u', ' ', $s) ?? '';
    $s = preg_replace("/ *\n */u", "\n", $s) ?? '';
    $s = preg_replace("/\n{3,}/u", "\n\n", $s) ?? '';
    return trim($s);
}

/** Stars: a JSON integer 1-5. Not "5", not 3.5, not true, not [5]. */
function gr_v_rating($v): ?int {
    return (is_int($v) && $v >= 1 && $v <= 5) ? $v : null;
}

function gr_v_body($v): ?string {
    if (!is_string($v)) return null;
    $s = gr_clean_text($v, true);
    $n = mb_strlen($s, 'UTF-8');
    return ($n >= GR_BODY_MIN && $n <= GR_BODY_MAX) ? $s : null;
}

/** A person's full name as the owner types it: 2-80 characters, at least one letter. */
function gr_v_name($v): ?string {
    if (!is_string($v)) return null;
    $s = gr_clean_text($v, false);
    $n = mb_strlen($s, 'UTF-8');
    if ($n < 2 || $n > GR_NAME_MAX) return null;
    if (!preg_match('/\p{L}/u', $s)) return null;
    if (preg_match('/[<>{}\[\]\\\\|`$=@#%^*_+~]/u', $s)) return null;   // names do not need these
    return $s;
}

/**
 * A WhatsApp number. Ten digits are taken as Indian (+91); otherwise it must
 * carry its country code (8-15 digits, E.164). Returns '+<digits>'.
 */
function gr_v_phone($v): ?string {
    if (!is_string($v)) return null;
    $t = trim($v);
    if (!preg_match('/^\+?[0-9 ()\-.]{8,24}$/', $t)) return null;
    $d = preg_replace('/\D/', '', $t) ?? '';
    if (strlen($d) === 11 && $d[0] === '0') $d = substr($d, 1);         // 0 98765 43210
    if (strlen($d) === 10 && strpos($t, '+') !== 0) {
        if (!preg_match('/^[6-9]/', $d)) return null;                    // Indian mobiles
        $d = '91' . $d;
    }
    if (strlen($d) < 8 || strlen($d) > 15 || $d[0] === '0') return null;
    return '+' . $d;
}

function gr_v_date($v): ?string {
    if (!is_string($v) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) return null;
    $d = DateTimeImmutable::createFromFormat('!Y-m-d', $v, new DateTimeZone('UTC'));
    return ($d && $d->format('Y-m-d') === $v) ? $v : null;
}

function gr_v_int_range($v, int $min, int $max): ?int {
    return (is_int($v) && $v >= $min && $v <= $max) ? $v : null;
}

function gr_v_id($v): ?int { return gr_v_int_range($v, 1, PHP_INT_MAX); }

/** The link token: base64url, the length gr_random_token(32) produces. */
function gr_v_token($v): ?string {
    return (is_string($v) && preg_match('/^[A-Za-z0-9_-]{43}$/', $v)) ? $v : null;
}

function gr_mask_phone(string $e164): string {
    $d = substr($e164, 1);
    if (strpos($d, '91') === 0 && strlen($d) === 12) return '+91 ••••• •••••';
    return '+' . substr($d, 0, max(1, strlen($d) - 10)) . ' ••••••••••';
}
