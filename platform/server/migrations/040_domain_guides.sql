-- Project-local, reviewed domain learning guides. Source updates only mark a
-- durable generation; they never call Nora or replace an approved version.
CREATE TABLE domain_guide_settings (
 project_id text PRIMARY KEY REFERENCES projects(id),
 auto_refresh boolean NOT NULL DEFAULT false,
 requested_by uuid REFERENCES users(id),
 dirty_generation bigint NOT NULL DEFAULT 0 CHECK(dirty_generation>=0),
 processed_generation bigint NOT NULL DEFAULT 0 CHECK(processed_generation>=0),
 dirty_at timestamptz NOT NULL DEFAULT now(),
 published_version_id uuid,
 last_error_code text, last_error_message text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE domain_guide_runs (
 id uuid PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id),
 requested_by uuid NOT NULL REFERENCES users(id),
 workspace_id text NOT NULL,
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 source_fingerprint text NOT NULL CHECK(source_fingerprint ~ '^[a-f0-9]{64}$'),
 captured_generation bigint NOT NULL CHECK(captured_generation>=0),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed','uncertain')),
 dispatch_started_at timestamptz,
 lease_token uuid, lease_expires_at timestamptz,
 error_code text, error_message text,
 trace_id text, flow_slug text, published_flow_version_id text,
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 UNIQUE(id,project_id),
 CHECK((lease_token IS NULL)=(lease_expires_at IS NULL)),
 CHECK(status<>'running' OR lease_token IS NOT NULL)
);
CREATE UNIQUE INDEX domain_guide_one_active_idx ON domain_guide_runs(project_id) WHERE status IN ('queued','running');
CREATE INDEX domain_guide_runs_project_idx ON domain_guide_runs(project_id,created_at DESC,id);
CREATE INDEX domain_guide_runs_queued_idx ON domain_guide_runs(created_at,id) WHERE status='queued';
CREATE INDEX domain_guide_runs_expired_idx ON domain_guide_runs(lease_expires_at) WHERE status='running';
-- An uncertain run is never rewritten or automatically replayed. A reviewer may
-- explicitly authorize a new, independently identified draft-generation request.
CREATE TABLE domain_guide_run_retries (
 run_id uuid PRIMARY KEY,
 project_id text NOT NULL REFERENCES projects(id),
 authorized_by uuid NOT NULL REFERENCES users(id),
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 2000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(run_id,project_id) REFERENCES domain_guide_runs(id,project_id)
);
CREATE INDEX domain_guide_run_retries_project_idx ON domain_guide_run_retries(project_id,created_at);
CREATE INDEX domain_guide_run_retries_actor_idx ON domain_guide_run_retries(authorized_by);
CREATE TRIGGER domain_guide_retry_immutable BEFORE UPDATE OR DELETE ON domain_guide_run_retries FOR EACH ROW EXECUTE FUNCTION protect_event_history();
CREATE TABLE domain_guide_versions (
 id uuid PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id),
 run_id uuid NOT NULL UNIQUE,
 number integer NOT NULL CHECK(number>0),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','rejected')),
 guide jsonb NOT NULL CHECK(jsonb_typeof(guide)='object'),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 source_fingerprint text NOT NULL CHECK(source_fingerprint ~ '^[a-f0-9]{64}$'),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid REFERENCES users(id), reviewed_at timestamptz, review_comment text,
 UNIQUE(id,project_id), UNIQUE(project_id,number),
 FOREIGN KEY(run_id,project_id) REFERENCES domain_guide_runs(id,project_id),
 CHECK((status='draft')=(reviewed_by IS NULL)),
 CHECK((reviewed_by IS NULL)=(reviewed_at IS NULL))
);
ALTER TABLE domain_guide_settings ADD CONSTRAINT domain_guide_published_project_fk FOREIGN KEY(published_version_id,project_id) REFERENCES domain_guide_versions(id,project_id);
CREATE INDEX domain_guide_versions_project_idx ON domain_guide_versions(project_id,number DESC);
CREATE INDEX domain_guide_settings_pending_idx ON domain_guide_settings(dirty_at,project_id) WHERE auto_refresh AND dirty_generation>processed_generation;
CREATE INDEX domain_guide_runs_requester_idx ON domain_guide_runs(requested_by);
CREATE INDEX domain_guide_versions_creator_idx ON domain_guide_versions(created_by);
CREATE INDEX domain_guide_versions_reviewer_idx ON domain_guide_versions(reviewed_by);
CREATE INDEX domain_guide_settings_requester_idx ON domain_guide_settings(requested_by);

CREATE FUNCTION protect_domain_guide_run() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.project_id,NEW.requested_by,NEW.workspace_id,NEW.snapshot,NEW.source_fingerprint,NEW.captured_generation,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.requested_by,OLD.workspace_id,OLD.snapshot,OLD.source_fingerprint,OLD.captured_generation,OLD.created_at) THEN
 RAISE EXCEPTION 'Domain guide request is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.status IN ('succeeded','failed','uncertain') AND NEW IS DISTINCT FROM OLD THEN
 RAISE EXCEPTION 'Domain guide terminal outcome is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER domain_guide_run_immutable BEFORE UPDATE ON domain_guide_runs FOR EACH ROW EXECUTE FUNCTION protect_domain_guide_run();
CREATE TRIGGER domain_guide_run_no_delete BEFORE DELETE ON domain_guide_runs FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
CREATE FUNCTION protect_domain_guide_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.project_id,NEW.run_id,NEW.number,NEW.guide,NEW.snapshot,NEW.source_fingerprint,NEW.created_by,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.run_id,OLD.number,OLD.guide,OLD.snapshot,OLD.source_fingerprint,OLD.created_by,OLD.created_at)
 OR (OLD.status<>'draft' AND NEW IS DISTINCT FROM OLD) THEN
 RAISE EXCEPTION 'Domain guide version and review are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER domain_guide_version_immutable BEFORE UPDATE ON domain_guide_versions FOR EACH ROW EXECUTE FUNCTION protect_domain_guide_version();
CREATE TRIGGER domain_guide_version_no_delete BEFORE DELETE ON domain_guide_versions FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();

CREATE FUNCTION mark_domain_guide_dirty() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p text;
BEGIN
 IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='projects' THEN p:=NEW.id;
 ELSE p:=COALESCE(NEW.project_id,OLD.project_id); END IF;
 INSERT INTO domain_guide_settings(project_id,dirty_generation,dirty_at) VALUES(p,1,clock_timestamp())
 ON CONFLICT(project_id) DO UPDATE SET dirty_generation=domain_guide_settings.dirty_generation+1,dirty_at=clock_timestamp(),last_error_code=NULL,last_error_message=NULL;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER domain_guide_project_dirty AFTER INSERT OR UPDATE OF name ON projects FOR EACH ROW EXECUTE FUNCTION mark_domain_guide_dirty();
CREATE TRIGGER domain_guide_goal_dirty AFTER INSERT OR UPDATE OF goal ON project_settings FOR EACH ROW EXECUTE FUNCTION mark_domain_guide_dirty();
CREATE TRIGGER domain_guide_domain_dirty AFTER INSERT OR UPDATE OR DELETE ON project_domains FOR EACH ROW EXECUTE FUNCTION mark_domain_guide_dirty();
CREATE TRIGGER domain_guide_document_dirty AFTER INSERT OR UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION mark_domain_guide_dirty();
CREATE TRIGGER domain_guide_revision_dirty AFTER INSERT OR UPDATE OF status,document_json ON revisions FOR EACH ROW WHEN (NEW.status='ready') EXECUTE FUNCTION mark_domain_guide_dirty();
CREATE TRIGGER domain_guide_context_dirty AFTER INSERT ON context_records FOR EACH ROW EXECUTE FUNCTION mark_domain_guide_dirty();
CREATE TRIGGER domain_guide_supersession_dirty AFTER INSERT ON context_supersessions FOR EACH ROW EXECUTE FUNCTION mark_domain_guide_dirty();
CREATE TRIGGER domain_guide_commercial_dirty AFTER INSERT OR UPDATE ON commercial_documents FOR EACH ROW EXECUTE FUNCTION mark_domain_guide_dirty();
CREATE TRIGGER domain_guide_commercial_decision_dirty AFTER INSERT ON commercial_decisions FOR EACH ROW EXECUTE FUNCTION mark_domain_guide_dirty();
CREATE TRIGGER domain_guide_commercial_profile_dirty AFTER UPDATE ON commercial_profiles FOR EACH ROW EXECUTE FUNCTION mark_domain_guide_dirty();
-- These mutable evidence sources can invalidate a previously confirmed record.
CREATE TRIGGER domain_guide_channel_dirty AFTER UPDATE OF evidence_changed ON channel_inbox FOR EACH ROW EXECUTE FUNCTION mark_domain_guide_dirty();
CREATE TRIGGER domain_guide_question_dirty AFTER UPDATE ON project_questions FOR EACH ROW EXECUTE FUNCTION mark_domain_guide_dirty();
CREATE TRIGGER domain_guide_work_dirty AFTER UPDATE ON work_items FOR EACH ROW EXECUTE FUNCTION mark_domain_guide_dirty();
CREATE TRIGGER domain_guide_binding_dirty AFTER INSERT OR UPDATE OF status ON project_nora_workspaces FOR EACH ROW WHEN (NEW.status='ready') EXECUTE FUNCTION mark_domain_guide_dirty();
