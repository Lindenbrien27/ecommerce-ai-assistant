-- Up Migration

-- One row per requested code, not one row per email - an earlier version of
-- this migration had a UNIQUE index on email instead, with each new
-- request replacing the previous row. That created a real race: two
-- concurrent requests for the same email (two browser tabs, or - what
-- actually surfaced this live - this project's own e2e suite running many
-- specs in parallel against one shared seeded test email) would have the
-- second request silently invalidate the code the first request's flow was
-- still about to submit, failing it for no reason visible to that flow.
-- Multiple valid outstanding codes per email is the correct model - each
-- request gets its own independently-verifiable code, and a successful
-- verify (see otpService.js) deletes all of them for that email at once,
-- not just the one that matched. code_hash, not the plaintext code - a
-- code is short-lived and single-use (attempts-limited, deleted on
-- success), so this isn't trying to defend against offline brute force the
-- way a password hash would; it's just not leaving a readable code sitting
-- in the database for anyone with read access to the table.
CREATE TABLE otp_codes (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_otp_codes_email ON otp_codes (LOWER(email));

-- Down Migration

DROP TABLE IF EXISTS otp_codes;
