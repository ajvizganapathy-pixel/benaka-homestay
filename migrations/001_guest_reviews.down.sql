-- Guest reviews, migration 001 (DOWN). Removes exactly what 001 created and
-- nothing else. This DELETES every review and invitation: take an hPanel
-- database backup first. The site does not need these tables to run; with
-- REVIEWS_ENABLED off, or with the PR reverted, nothing reads them.
DROP VIEW  IF EXISTS gr_public_reviews;
DROP TABLE IF EXISTS gr_reviews;
DROP TABLE IF EXISTS gr_invitations;
DROP TABLE IF EXISTS gr_sessions;
DROP TABLE IF EXISTS gr_login_locks;
DROP TABLE IF EXISTS gr_rate_limits;
