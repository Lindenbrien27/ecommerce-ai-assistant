-- Up Migration

-- Email-only allowlist, no password column - Google Sign-In (see
-- adminAuthService.js) is what proves identity; being a row here is what
-- makes an email an admin. Seeded with the app owner's own real inbox
-- (lindenbrien27@gmail.com) rather than a throwaway dev@example.com the
-- way other seed migrations do (see 1785631599842_add-dev-seed-account.sql)
-- - Google OAuth requires signing into a real Google account, so a fake
-- address wouldn't actually be usable here.
CREATE TABLE admins (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO admins (email) VALUES ('lindenbrien27@gmail.com')
ON CONFLICT (email) DO NOTHING;

-- Down Migration

DROP TABLE admins;