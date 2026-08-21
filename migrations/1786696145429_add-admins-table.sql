

CREATE TABLE admins (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO admins (email) VALUES ('lindenbrien27@gmail.com')
ON CONFLICT (email) DO NOTHING;

DROP TABLE admins;
