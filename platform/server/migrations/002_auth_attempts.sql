CREATE TABLE IF NOT EXISTS auth_attempts (
  bucket text PRIMARY KEY,
  count integer NOT NULL CHECK (count > 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_attempts_expiry_idx ON auth_attempts(expires_at);
