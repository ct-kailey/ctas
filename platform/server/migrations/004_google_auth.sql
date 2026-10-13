-- Pending OAuth attempts are short-lived; only the PKCE verifier requires plaintext.
CREATE TABLE google_oauth_attempts (
  state_hash text PRIMARY KEY CHECK (state_hash ~ '^[a-f0-9]{64}$'),
  browser_hash text NOT NULL UNIQUE CHECK (browser_hash ~ '^[a-f0-9]{64}$'),
  nonce_hash text NOT NULL CHECK (nonce_hash ~ '^[a-f0-9]{64}$'),
  code_verifier text NOT NULL CHECK (length(code_verifier) BETWEEN 43 AND 128),
  expires_at timestamptz NOT NULL
);
CREATE INDEX google_oauth_attempts_expiry_idx ON google_oauth_attempts(expires_at);

-- Email is only an initial match; the permanent external identity is Google's sub.
CREATE TABLE google_identities (
  subject text PRIMARY KEY CHECK (length(subject) BETWEEN 1 AND 255),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  linked_email text NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION protect_google_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Google identity cannot be reassigned' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER google_identity_immutable BEFORE UPDATE ON google_identities
  FOR EACH ROW EXECUTE FUNCTION protect_google_identity();
