ALTER TABLE users ADD COLUMN is_shared_view boolean NOT NULL DEFAULT false;

CREATE TABLE shared_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  creator_id uuid NOT NULL REFERENCES users(id),
  source_user_id uuid NOT NULL REFERENCES users(id),
  viewer_user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  project_ids text[] NOT NULL CHECK (cardinality(project_ids) BETWEEN 1 AND 50),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at <= created_at + interval '7 days'),
  CHECK (viewer_user_id <> source_user_id AND viewer_user_id <> creator_id)
);
CREATE INDEX shared_views_creator_idx ON shared_views(creator_id, created_at DESC);
CREATE TABLE shared_view_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  shared_view_id uuid NOT NULL REFERENCES shared_views(id),
  csrf_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shared_view_sessions_link_idx ON shared_view_sessions(shared_view_id);
CREATE INDEX shared_view_sessions_expiry_idx ON shared_view_sessions(expires_at);

-- Shared viewers cannot become normal team members or gain permissions through
-- the existing membership management API, even if their synthetic ID is known.
CREATE FUNCTION guard_shared_view_membership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE id=NEW.user_id AND is_shared_view) AND
    (NEW.role <> 'viewer' OR NOT EXISTS (
      SELECT 1 FROM shared_views WHERE viewer_user_id=NEW.user_id AND NEW.project_id=ANY(project_ids)
    )) THEN
    RAISE EXCEPTION 'Shared viewers have fixed read-only project access' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER shared_view_membership_guard BEFORE INSERT OR UPDATE ON memberships
FOR EACH ROW EXECUTE FUNCTION guard_shared_view_membership();
