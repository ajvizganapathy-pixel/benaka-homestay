-- Guest reviews, migration 001 (UP). MariaDB 10.4+ / MySQL 8.
--
-- ADDITIVE ONLY: it creates new gr_* tables and one view, and alters or drops
-- nothing that exists. Safe to run twice (IF NOT EXISTS / OR REPLACE).
-- The matching down script is 001_guest_reviews.down.sql.
--
-- All times are UTC, written by PHP from its own clock (never NOW() or
-- UTC_TIMESTAMP(), so the tests can move time). month_key is computed in PHP in
-- Asia/Kolkata, because Hostinger's MySQL may not have the time zone tables.
--
-- .htaccess denies *.sql, and migrations/ answers 404, so this is never served.

CREATE TABLE IF NOT EXISTS gr_invitations (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  token_hash    CHAR(64)     NOT NULL,             -- SHA-256 of the link token; the token itself is never stored
  guest_name    VARCHAR(80)  NOT NULL,
  phone_e164    VARCHAR(16)  NOT NULL,             -- owner page only; deleted with the row at day 30
  stay_from     DATE         NOT NULL,
  stay_to       DATE         NOT NULL,
  require_check TINYINT(1)   NOT NULL DEFAULT 1,   -- WhatsApp check on
  check_code    CHAR(7)      NOT NULL,             -- e.g. K7Q-4M2, a label the owner matches by eye
  status        ENUM('active','verified','used','revoked') NOT NULL DEFAULT 'active',
  created_at    DATETIME     NOT NULL,
  expires_at    DATETIME     NOT NULL,
  verified_at   DATETIME     NULL,
  used_at       DATETIME     NULL,
  revoked_at    DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gr_inv_token (token_hash),
  KEY ix_gr_inv_status (status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gr_reviews (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  invitation_id  INT UNSIGNED NULL,                -- NULL once the approval card has dissolved
  display_name   VARCHAR(80)  NOT NULL,            -- copied from the invitation, so it outlives it
  rating         TINYINT UNSIGNED NOT NULL,
  body           TEXT         NOT NULL,
  consent_public TINYINT(1)   NOT NULL DEFAULT 0,
  status         ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  submitted_at   DATETIME     NOT NULL,
  month_key      CHAR(7)      NOT NULL,            -- 'YYYY-MM' in Asia/Kolkata
  moderated_at   DATETIME     NULL,
  purge_at       DATETIME     NOT NULL,            -- submitted_at + 30 days
  PRIMARY KEY (id),
  UNIQUE KEY uq_gr_rev_invitation (invitation_id), -- one review per link, the backstop to the atomic claim
  KEY ix_gr_rev_public (status, consent_public, month_key),
  KEY ix_gr_rev_purge (purge_at),
  CONSTRAINT ck_gr_rev_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT fk_gr_rev_invitation FOREIGN KEY (invitation_id)
    REFERENCES gr_invitations (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Owner sign-in sessions. Only a hash of the cookie value is stored.
CREATE TABLE IF NOT EXISTS gr_sessions (
  id_hash      CHAR(64) NOT NULL,
  csrf         CHAR(64) NOT NULL,
  created_at   DATETIME NOT NULL,
  last_seen_at DATETIME NOT NULL,
  PRIMARY KEY (id_hash),
  KEY ix_gr_sess_seen (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=ascii;

-- Wrong-code counters. scope is 'account', 'ip:<hash>' or 'dev:<hash>'.
-- Five failures in a scope set locked_until = now + 30 minutes.
CREATE TABLE IF NOT EXISTS gr_login_locks (
  scope        VARCHAR(80) NOT NULL,
  fails        INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  updated_at   DATETIME NOT NULL,
  PRIMARY KEY (scope)
) ENGINE=InnoDB DEFAULT CHARSET=ascii;

-- Fixed-window request counters. bucket is SHA-256(endpoint | hashed IP | window).
CREATE TABLE IF NOT EXISTS gr_rate_limits (
  bucket       CHAR(64) NOT NULL,
  window_start DATETIME NOT NULL,
  hits         INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket),
  KEY ix_gr_rl_window (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=ascii;

-- The only shape a public request ever reads. No id, no invitation, no phone,
-- no status column: approved AND consented, and nothing else.
CREATE OR REPLACE VIEW gr_public_reviews AS
  SELECT display_name, rating, body, submitted_at, month_key
    FROM gr_reviews
   WHERE status = 'approved' AND consent_public = 1;
