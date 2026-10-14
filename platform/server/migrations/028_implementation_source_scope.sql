-- Project intent is explicit; existing data is never silently classified or moved.
ALTER TABLE project_settings ADD COLUMN project_kind text NOT NULL DEFAULT 'unspecified'
 CHECK(project_kind IN ('product_development','client_project','unspecified'));
CREATE OR REPLACE FUNCTION protect_project_settings() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.project_id<>OLD.project_id THEN RAISE EXCEPTION 'Project settings identity is immutable' USING ERRCODE='23514'; END IF;
 IF ROW(NEW.goal,NEW.repository_url,NEW.base_branch,NEW.project_kind) IS DISTINCT FROM ROW(OLD.goal,OLD.repository_url,OLD.base_branch,OLD.project_kind) THEN
  IF NEW.version<>OLD.version+1 OR NEW.repository_check IS NOT NULL THEN RAISE EXCEPTION 'Configuration changes require a new version and repository check' USING ERRCODE='23514'; END IF;
 ELSIF NEW.version NOT IN (OLD.version,OLD.version+1) OR (NEW.version=OLD.version+1 AND NEW.repository_check IS NOT NULL) THEN
  RAISE EXCEPTION 'Project identity changes require a new version and repository check' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TABLE implementation_source_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 project_id text NOT NULL REFERENCES projects(id),
 document_id uuid NOT NULL,
 revision_id uuid NOT NULL,
 revision_sha256 text NOT NULL CHECK(revision_sha256 ~ '^[a-f0-9]{64}$'),
 settings_version bigint NOT NULL CHECK(settings_version>0),
 project_kind text NOT NULL CHECK(project_kind IN ('product_development','client_project')),
 repository_url text NOT NULL, base_branch text NOT NULL,
 usage text NOT NULL CHECK(usage IN ('implementation','reference','mismatch')),
 intended_project_id text REFERENCES projects(id),
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 2000),
 actor_id uuid NOT NULL REFERENCES users(id),
 reviewed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,project_id),
 FOREIGN KEY(revision_id,project_id,document_id) REFERENCES revisions(id,project_id,document_id),
 CHECK(usage<>'implementation' OR (intended_project_id IS NOT NULL AND intended_project_id=project_id))
);
CREATE INDEX implementation_source_reviews_current_idx ON implementation_source_reviews(project_id,revision_id,sequence DESC);
CREATE TRIGGER implementation_source_reviews_immutable BEFORE UPDATE OR DELETE ON implementation_source_reviews FOR EACH ROW EXECUTE FUNCTION protect_event_history();
CREATE TABLE implementation_plan_preparations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id text NOT NULL REFERENCES projects(id),
 prepared_by uuid NOT NULL REFERENCES users(id),
 status text NOT NULL CHECK(status IN ('ready','blocked')),
 revision_ids uuid[] NOT NULL CHECK(cardinality(revision_ids) BETWEEN 1 AND 5),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 snapshot_sha256 text NOT NULL CHECK(snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes',
 UNIQUE(id,project_id)
);
CREATE INDEX implementation_plan_preparations_project_idx ON implementation_plan_preparations(project_id,created_at DESC);
CREATE TRIGGER implementation_plan_preparations_immutable BEFORE UPDATE OR DELETE ON implementation_plan_preparations FOR EACH ROW EXECUTE FUNCTION protect_event_history();
CREATE TABLE implementation_plan_confirmations (
 plan_id uuid PRIMARY KEY,
 project_id text NOT NULL REFERENCES projects(id),
 preparation_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id),
 confirmed_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(plan_id,project_id) REFERENCES implementation_plans(id,project_id),
 FOREIGN KEY(preparation_id,project_id) REFERENCES implementation_plan_preparations(id,project_id)
);
CREATE TRIGGER implementation_plan_confirmations_immutable BEFORE UPDATE OR DELETE ON implementation_plan_confirmations FOR EACH ROW EXECUTE FUNCTION protect_event_history();
