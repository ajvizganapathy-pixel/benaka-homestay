-- Guest reviews, migration 002 (UP). Additive: two nullable columns on
-- gr_reviews and a wider public view. Safe to run while the site is live, and
-- the code before it ignores the new columns.
--
-- Why: the homepage card shows the guest's stay (check-in, check-out,
-- nights). The stay lives on the invitation, which day 30 deletes, so the
-- review keeps its own copy, taken when the guest submits.
--
-- Run it once in phpMyAdmin (SQL tab) BEFORE the code that reads the columns
-- is deployed. Take an hPanel database backup first.
ALTER TABLE gr_reviews
  ADD COLUMN stay_from DATE NULL AFTER consent_public,
  ADD COLUMN stay_to   DATE NULL AFTER stay_from;

-- Reviews whose invitation still exists get their stay now.
UPDATE gr_reviews r JOIN gr_invitations i ON i.id = r.invitation_id
   SET r.stay_from = i.stay_from, r.stay_to = i.stay_to
 WHERE r.stay_from IS NULL;

CREATE OR REPLACE VIEW gr_public_reviews AS
  SELECT display_name, rating, body, submitted_at, month_key, stay_from, stay_to
    FROM gr_reviews
   WHERE status = 'approved' AND consent_public = 1;
