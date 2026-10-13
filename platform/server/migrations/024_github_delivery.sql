CREATE TABLE github_delivery_settings (
 project_id text PRIMARY KEY REFERENCES projects(id),
 repository_url text NOT NULL,
 secret_envelope jsonb,
 enabled boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1,
 updated_by uuid NOT NULL REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE github_deliveries (
 id uuid PRIMARY KEY,
 project_id text NOT NULL REFERENCES projects(id),
 execution_id uuid NOT NULL,
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 snapshot jsonb NOT NULL,
 snapshot_sha256 text NOT NULL CHECK(snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','publishing','published','failed','uncertain')),
 stage text NOT NULL DEFAULT 'prepared',
 version integer NOT NULL DEFAULT 1,
 branch text NOT NULL,
 tree_sha text,
 commit_sha text,
 pr_number integer,
 pr_url text,
 decision jsonb,
 error_code text,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,project_id),
 UNIQUE(execution_id),
 FOREIGN KEY(execution_id,project_id) REFERENCES implementation_requests(id,project_id)
);
CREATE INDEX github_deliveries_project_idx ON github_deliveries(project_id,created_at DESC,id);
CREATE INDEX github_deliveries_creator_idx ON github_deliveries(created_by);
CREATE INDEX github_delivery_settings_actor_idx ON github_delivery_settings(updated_by);
CREATE FUNCTION protect_github_delivery_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.project_id,NEW.execution_id,NEW.request_sha256,NEW.snapshot,NEW.snapshot_sha256,NEW.branch,NEW.created_by,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.execution_id,OLD.request_sha256,OLD.snapshot,OLD.snapshot_sha256,OLD.branch,OLD.created_by,OLD.created_at) THEN
 RAISE EXCEPTION 'GitHub delivery snapshot is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'GitHub delivery needs next version' USING ERRCODE='23514'; END IF;
 IF OLD.status='published' THEN RAISE EXCEPTION 'Published delivery is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER github_delivery_snapshot BEFORE UPDATE ON github_deliveries FOR EACH ROW EXECUTE FUNCTION protect_github_delivery_snapshot();
CREATE TRIGGER github_delivery_no_delete BEFORE DELETE ON github_deliveries FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
