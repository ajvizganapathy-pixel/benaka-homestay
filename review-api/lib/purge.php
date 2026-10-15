<?php
/*
 * Guest reviews: day 30. Runs at the start of every request (gr_boot), so it
 * needs no cron and nothing can "fail to run".
 *
 * 30 days after a review is submitted its approval card dissolves:
 *   - the invitation row goes, and with it the WhatsApp number and stay dates;
 *   - an APPROVED review the guest agreed to show keeps only its public part:
 *     name, stars, review and date (invitation_id becomes NULL);
 *   - every other review (waiting, rejected, or approved without consent,
 *     which was never public) is deleted outright.
 * An invitation nobody used is deleted 30 days after it expired or was revoked.
 * Idle sessions, old lock counters and old rate-limit windows go too.
 */
declare(strict_types=1);
if (!defined('BENAKA_REVIEWS')) { http_response_code(404); exit; }

function gr_purge(PDO $db, DateTimeImmutable $now): void {
    $n = gr_sql($now);
    gr_tx($db, function (PDO $db) use ($n, $now) {
        // 1. Reviews past their day 30 that are not public-and-approved: gone.
        $db->prepare("DELETE FROM gr_reviews
                       WHERE purge_at <= ? AND NOT (status = 'approved' AND consent_public = 1)")
           ->execute([$n]);
        // 2. The invitations behind reviews past day 30: gone. The FK sets the
        //    surviving review's invitation_id to NULL; do it explicitly as well,
        //    so the result never depends on the engine honouring the FK.
        $db->prepare("DELETE i FROM gr_invitations i JOIN gr_reviews r ON r.invitation_id = i.id
                       WHERE r.purge_at <= ?")->execute([$n]);
        $db->prepare("UPDATE gr_reviews SET invitation_id = NULL
                       WHERE purge_at <= ? AND invitation_id IS NOT NULL")->execute([$n]);
        // 3. Invitations that were never used, 30 days after they died. A used
        //    invitation always has its review, and goes with step 2.
        $keep = gr_sql($now->modify('-' . GR_UNUSED_KEEP_DAYS . ' days'));
        $db->prepare("DELETE FROM gr_invitations
                       WHERE status IN ('active','verified') AND expires_at <= ?")->execute([$keep]);
        $db->prepare("DELETE FROM gr_invitations
                       WHERE status = 'revoked' AND revoked_at <= ?")->execute([$keep]);
        // A 'used' invitation whose review the owner took down early.
        $db->prepare("DELETE i FROM gr_invitations i LEFT JOIN gr_reviews r ON r.invitation_id = i.id
                       WHERE i.status = 'used' AND r.id IS NULL")->execute();
    });
    // Housekeeping, outside the transaction: none of it is about guests.
    $db->prepare('DELETE FROM gr_sessions WHERE last_seen_at <= ? OR created_at <= ?')
       ->execute([gr_sql($now->modify('-' . GR_SESSION_IDLE . ' seconds')),
                  gr_sql($now->modify('-' . GR_SESSION_MAX . ' seconds'))]);
    $db->prepare('DELETE FROM gr_rate_limits WHERE window_start <= ?')
       ->execute([gr_sql($now->modify('-1 day'))]);
    $db->prepare('DELETE FROM gr_login_locks WHERE (locked_until IS NULL OR locked_until <= ?) AND updated_at <= ?')
       ->execute([$n, gr_sql($now->modify('-1 day'))]);
}
