-- Project intent and a repository target are configuration, never execution authorization.
CREATE TABLE project_settings (
  project_id text PRIMARY KEY REFERENCES projects(id),
  goal text NOT NULL DEFAULT '' CHECK(length(goal)<=5000),
  repository_url text,
  base_branch text,
  version bigint NOT NULL DEFAULT 1 CHECK(version>0),
  repository_check jsonb CHECK(repository_check IS NULL OR jsonb_typeof(repository_check)='object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((repository_url IS NULL)=(base_branch IS NULL))
);
INSERT INTO project_settings(project_id) SELECT id FROM projects;
CREATE FUNCTION create_project_settings() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN INSERT INTO project_settings(project_id) VALUES(NEW.id); RETURN NEW; END $$;
CREATE TRIGGER project_settings_default AFTER INSERT ON projects FOR EACH ROW EXECUTE FUNCTION create_project_settings();
CREATE FUNCTION protect_project_settings() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.project_id<>OLD.project_id THEN RAISE EXCEPTION 'Project settings identity is immutable' USING ERRCODE='23514'; END IF;
  IF ROW(NEW.goal,NEW.repository_url,NEW.base_branch) IS DISTINCT FROM ROW(OLD.goal,OLD.repository_url,OLD.base_branch) THEN
    IF NEW.version<>OLD.version+1 OR NEW.repository_check IS NOT NULL THEN
      RAISE EXCEPTION 'Configuration changes require a new version and repository check' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.version<>OLD.version THEN
    RAISE EXCEPTION 'Settings version only changes with configuration' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER project_settings_version BEFORE UPDATE ON project_settings FOR EACH ROW EXECUTE FUNCTION protect_project_settings();
CREATE TRIGGER project_settings_no_delete BEFORE DELETE ON project_settings FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
CREATE TABLE implementation_plans (
  id uuid PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id),
  requested_revision_ids uuid[] NOT NULL CHECK(cardinality(requested_revision_ids) BETWEEN 1 AND 5),
  request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
  input_snapshot jsonb NOT NULL CHECK(jsonb_typeof(input_snapshot)='object'),
  input_sha256 text NOT NULL CHECK(input_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','needs_review','failed','uncertain','approved','rejected')),
  result jsonb CHECK(result IS NULL OR jsonb_typeof(result)='object'),
  trace_id text,
  error_code text,
  lease_token uuid,
  lease_expires_at timestamptz,
  decision jsonb CHECK(decision IS NULL OR jsonb_typeof(decision)='object'),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(id,project_id),
  CHECK ((status IN ('approved','rejected'))=(decision IS NOT NULL)),
  CHECK (status NOT IN ('needs_review','approved') OR (result IS NOT NULL AND trace_id IS NOT NULL))
);
CREATE INDEX implementation_plans_project_idx ON implementation_plans(project_id,created_at DESC,id);
CREATE INDEX implementation_plans_creator_idx ON implementation_plans(created_by);
CREATE INDEX implementation_plans_claim_idx ON implementation_plans(created_at,id) WHERE status='queued';
CREATE INDEX implementation_plans_expired_idx ON implementation_plans(lease_expires_at) WHERE status='running';
CREATE TABLE implementation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  plan_id uuid NOT NULL UNIQUE,
  input_snapshot jsonb NOT NULL CHECK(jsonb_typeof(input_snapshot)='object'),
  input_sha256 text NOT NULL CHECK(input_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'awaiting_runner' CHECK(status IN ('awaiting_runner','running','patch_ready','failed','uncertain')),
  result jsonb CHECK(result IS NULL OR jsonb_typeof(result)='object'),
  error_code text,
  lease_token uuid,
  lease_expires_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(id,project_id),
  FOREIGN KEY(plan_id,project_id) REFERENCES implementation_plans(id,project_id),
  CHECK (status<>'patch_ready' OR result IS NOT NULL)
);
CREATE INDEX implementation_requests_project_idx ON implementation_requests(project_id,created_at DESC,id);
CREATE INDEX implementation_requests_creator_idx ON implementation_requests(created_by);
CREATE INDEX implementation_requests_claim_idx ON implementation_requests(created_at,id) WHERE status='awaiting_runner';
CREATE INDEX implementation_requests_expired_idx ON implementation_requests(lease_expires_at) WHERE status='running';
CREATE FUNCTION protect_implementation_plan() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.project_id,NEW.requested_revision_ids,NEW.request_sha256,NEW.input_snapshot,NEW.input_sha256,NEW.created_by,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.requested_revision_ids,OLD.request_sha256,OLD.input_snapshot,OLD.input_sha256,OLD.created_by,OLD.created_at) THEN
    RAISE EXCEPTION 'Implementation planning source is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.decision IS NOT NULL AND ROW(NEW.status,NEW.result,NEW.trace_id,NEW.error_code,NEW.decision,NEW.completed_at)
    IS DISTINCT FROM ROW(OLD.status,OLD.result,OLD.trace_id,OLD.error_code,OLD.decision,OLD.completed_at) THEN
    RAISE EXCEPTION 'Implementation planning decision is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER implementation_plan_immutable BEFORE UPDATE ON implementation_plans FOR EACH ROW EXECUTE FUNCTION protect_implementation_plan();
CREATE TRIGGER implementation_plan_no_delete BEFORE DELETE ON implementation_plans FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
CREATE FUNCTION protect_implementation_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.project_id,NEW.plan_id,NEW.input_snapshot,NEW.input_sha256,NEW.created_by,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.plan_id,OLD.input_snapshot,OLD.input_sha256,OLD.created_by,OLD.created_at) THEN
    RAISE EXCEPTION 'Implementation execution authorization is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.status IN ('patch_ready','failed','uncertain') AND ROW(NEW.status,NEW.result,NEW.error_code,NEW.completed_at)
    IS DISTINCT FROM ROW(OLD.status,OLD.result,OLD.error_code,OLD.completed_at) THEN
    RAISE EXCEPTION 'Implementation result is immutable; request a newly approved plan' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER implementation_request_immutable BEFORE UPDATE ON implementation_requests FOR EACH ROW EXECUTE FUNCTION protect_implementation_request();
CREATE TRIGGER implementation_request_no_delete BEFORE DELETE ON implementation_requests FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
