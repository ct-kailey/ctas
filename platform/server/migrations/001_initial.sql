CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 320),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  csrf_token text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE projects (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text CHECK (id ~ '^[a-zA-Z0-9_-]{1,128}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  domain_pack jsonb NOT NULL DEFAULT '{"id":"sism","version":"1.0","glossary":[]}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE memberships (
  project_id text NOT NULL REFERENCES projects(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('owner','reviewer','member','viewer')),
  PRIMARY KEY (project_id,user_id)
);
CREATE INDEX memberships_user_idx ON memberships(user_id,project_id);
CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES projects(id),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  baseline_revision_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,project_id)
);
CREATE INDEX documents_project_idx ON documents(project_id,created_at DESC);
CREATE TABLE revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  document_id uuid NOT NULL,
  filename text NOT NULL CHECK (length(filename) BETWEEN 1 AND 255),
  mime_type text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 20971520),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','ready','failed','uncertain')),
  document_json jsonb,
  error_code text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,project_id),
  UNIQUE (id,project_id,document_id),
  FOREIGN KEY (document_id,project_id) REFERENCES documents(id,project_id),
  CHECK (status <> 'ready' OR document_json IS NOT NULL)
);
CREATE INDEX revisions_document_idx ON revisions(project_id,document_id,created_at DESC);
CREATE INDEX revisions_created_by_idx ON revisions(created_by);
ALTER TABLE documents ADD CONSTRAINT documents_baseline_fk FOREIGN KEY (baseline_revision_id,project_id,id) REFERENCES revisions(id,project_id,document_id);
CREATE TABLE reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  document_id uuid NOT NULL,
  baseline_revision_id uuid NOT NULL,
  current_revision_id uuid NOT NULL,
  request jsonb NOT NULL,
  result jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','needs_review','no_change','blocked','failed','uncertain','approved','rejected','published')),
  decision jsonb,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,project_id),
  UNIQUE (project_id,document_id,baseline_revision_id,current_revision_id),
  FOREIGN KEY (document_id,project_id) REFERENCES documents(id,project_id),
  FOREIGN KEY (baseline_revision_id,project_id,document_id) REFERENCES revisions(id,project_id,document_id),
  FOREIGN KEY (current_revision_id,project_id,document_id) REFERENCES revisions(id,project_id,document_id),
  CHECK (baseline_revision_id <> current_revision_id),
  CHECK ((status IN ('approved','rejected','published')) = (decision IS NOT NULL))
);
CREATE INDEX reviews_project_idx ON reviews(project_id,created_at DESC);
CREATE INDEX reviews_baseline_idx ON reviews(baseline_revision_id);
CREATE INDEX reviews_current_idx ON reviews(current_revision_id);
CREATE INDEX reviews_created_by_idx ON reviews(created_by);
CREATE TABLE answers (
  review_id uuid NOT NULL REFERENCES reviews(id),
  question_id text NOT NULL,
  answer text NOT NULL CHECK (length(answer) BETWEEN 1 AND 10000),
  evidence text NOT NULL CHECK (length(evidence) BETWEEN 1 AND 10000),
  actor_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (review_id,question_id)
);
CREATE INDEX answers_actor_idx ON answers(actor_id);
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES projects(id),
  kind text NOT NULL CHECK (kind IN ('intake','review')),
  revision_id uuid,
  review_id uuid,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','uncertain')),
  stage text NOT NULL DEFAULT 'queued',
  stage_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (revision_id),
  UNIQUE (review_id),
  FOREIGN KEY (revision_id,project_id) REFERENCES revisions(id,project_id),
  FOREIGN KEY (review_id,project_id) REFERENCES reviews(id,project_id),
  CHECK ((kind = 'intake' AND revision_id IS NOT NULL AND review_id IS NULL) OR (kind = 'review' AND review_id IS NOT NULL AND revision_id IS NULL))
);
CREATE INDEX jobs_claim_idx ON jobs(created_at,id) WHERE status = 'queued';
CREATE INDEX jobs_expired_idx ON jobs(lease_expires_at) WHERE status = 'running';
CREATE INDEX jobs_project_idx ON jobs(project_id,created_at DESC);
CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES projects(id),
  actor_id uuid REFERENCES users(id),
  kind text NOT NULL,
  entity_id text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_project_idx ON events(project_id,created_at DESC,id DESC);
CREATE INDEX events_actor_idx ON events(actor_id);

CREATE FUNCTION protect_revision_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.project_id,NEW.document_id,NEW.filename,NEW.mime_type,NEW.sha256,NEW.content,NEW.created_by,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.document_id,OLD.filename,OLD.mime_type,OLD.sha256,OLD.content,OLD.created_by,OLD.created_at) THEN
    RAISE EXCEPTION 'Revision source is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'ready' AND (NEW.document_json IS DISTINCT FROM OLD.document_json OR NEW.status <> 'ready') THEN
    RAISE EXCEPTION 'Ready revision is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER revision_immutable BEFORE UPDATE ON revisions FOR EACH ROW EXECUTE FUNCTION protect_revision_snapshot();
CREATE FUNCTION protect_review_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.project_id,NEW.document_id,NEW.baseline_revision_id,NEW.current_revision_id,NEW.request,NEW.created_by,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.document_id,OLD.baseline_revision_id,OLD.current_revision_id,OLD.request,OLD.created_by,OLD.created_at) THEN
    RAISE EXCEPTION 'Review request is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.decision IS NOT NULL AND (NEW.decision IS DISTINCT FROM OLD.decision OR NEW.result IS DISTINCT FROM OLD.result OR
     NOT (NEW.status = OLD.status OR (OLD.status = 'approved' AND NEW.status = 'published'))) THEN
    RAISE EXCEPTION 'Review decision is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER review_immutable BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION protect_review_snapshot();
CREATE FUNCTION protect_event_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit events are append only' USING ERRCODE = '23514'; END $$;
CREATE TRIGGER events_append_only BEFORE UPDATE OR DELETE ON events FOR EACH ROW EXECUTE FUNCTION protect_event_history();
