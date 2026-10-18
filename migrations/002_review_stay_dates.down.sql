-- Guest reviews, migration 002 (DOWN). Puts the view and gr_reviews back as
-- 001 left them. Only the stay dates copied onto reviews are lost; every
-- review and invitation stays. Revert the code first: it reads the columns.
CREATE OR REPLACE VIEW gr_public_reviews AS
  SELECT display_name, rating, body, submitted_at, month_key
    FROM gr_reviews
   WHERE status = 'approved' AND consent_public = 1;

ALTER TABLE gr_reviews DROP COLUMN stay_to, DROP COLUMN stay_from;
