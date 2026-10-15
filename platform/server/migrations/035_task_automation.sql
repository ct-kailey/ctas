CREATE TABLE task_automation_settings (
 project_id text PRIMARY KEY REFERENCES projects(id),
 enabled boolean NOT NULL DEFAULT true,
 risk_flow_slug text, development_flow_slug text,
 preview_origins jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(preview_origins)='array'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO task_automation_settings(project_id) SELECT id FROM projects;
CREATE FUNCTION create_task_automation_settings() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN INSERT INTO task_automation_settings(project_id) VALUES(NEW.id); RETURN NEW; END $$;
CREATE TRIGGER task_automation_settings_default AFTER INSERT ON projects FOR EACH ROW EXECUTE FUNCTION create_task_automation_settings();

CREATE TABLE task_automation_intake (
 revision_id uuid PRIMARY KEY,
 project_id text NOT NULL REFERENCES projects(id),created_by uuid NOT NULL REFERENCES users(id),
 request_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','submitted','awaiting_connection','failed')),
 error_code text, next_attempt_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(revision_id,project_id) REFERENCES revisions(id,project_id)
);
CREATE INDEX task_automation_intake_pending_idx ON task_automation_intake(next_attempt_at) WHERE status IN('pending','awaiting_connection');
CREATE INDEX task_automation_intake_project_idx ON task_automation_intake(project_id,created_at);

CREATE TABLE task_automation_analyses (
 id uuid PRIMARY KEY,project_id text NOT NULL REFERENCES projects(id),revision_id uuid NOT NULL,
 request_sha256 text NOT NULL,input_snapshot jsonb NOT NULL,input_sha256 text NOT NULL,dedup_sha256 text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','completed','blocked','awaiting_connection','failed','uncertain')),
 result jsonb,question_ids jsonb NOT NULL DEFAULT '[]',error_code text,
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,project_id),UNIQUE(project_id,dedup_sha256),FOREIGN KEY(revision_id,project_id) REFERENCES revisions(id,project_id)
);
CREATE INDEX task_automation_analyses_project_idx ON task_automation_analyses(project_id,created_at DESC);
CREATE TABLE task_automation_requests (
 id uuid PRIMARY KEY,project_id text NOT NULL REFERENCES projects(id),analysis_id uuid NOT NULL,
 request_sha256 text NOT NULL,created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(analysis_id,project_id) REFERENCES task_automation_analyses(id,project_id)
);
CREATE INDEX task_automation_requests_analysis_idx ON task_automation_requests(analysis_id,project_id);
CREATE TRIGGER task_automation_request_immutable BEFORE UPDATE OR DELETE ON task_automation_requests FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
CREATE TABLE automation_tasks (
 id uuid PRIMARY KEY,project_id text NOT NULL REFERENCES projects(id),analysis_id uuid NOT NULL,
 title text NOT NULL,description text NOT NULL,acceptance_criteria jsonb NOT NULL,evidence jsonb NOT NULL,
 input_snapshot jsonb NOT NULL,input_sha256 text NOT NULL,
 status text NOT NULL DEFAULT 'todo' CHECK(status IN('todo','in_progress','qa','done','blocked')),
 execution_status text NOT NULL DEFAULT 'idle' CHECK(execution_status IN('idle','queued','running','ready','merging','uncertain','failed','awaiting_connection')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),artifact jsonb,merge_result jsonb,review jsonb,error_code text,
 created_by uuid NOT NULL REFERENCES users(id),started_by uuid REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,project_id),FOREIGN KEY(analysis_id,project_id) REFERENCES task_automation_analyses(id,project_id),
 CHECK(status<>'qa' OR artifact IS NOT NULL),CHECK(status<>'done' OR (artifact IS NOT NULL AND review IS NOT NULL AND merge_result IS NOT NULL))
);
CREATE INDEX automation_tasks_project_idx ON automation_tasks(project_id,status,created_at DESC);
CREATE INDEX automation_tasks_analysis_idx ON automation_tasks(analysis_id,project_id);
CREATE TABLE task_automation_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id text NOT NULL REFERENCES projects(id),
 kind text NOT NULL CHECK(kind IN('risk','develop','merge','reconcile_merge')),
 analysis_id uuid,task_id uuid,payload jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','succeeded','awaiting_connection','failed','uncertain')),
 error_code text,lease_token uuid,lease_expires_at timestamptz,next_attempt_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(analysis_id,project_id) REFERENCES task_automation_analyses(id,project_id),
 FOREIGN KEY(task_id,project_id) REFERENCES automation_tasks(id,project_id),
 CHECK((kind='risk' AND analysis_id IS NOT NULL AND task_id IS NULL) OR (kind<>'risk' AND task_id IS NOT NULL AND analysis_id IS NULL))
);
CREATE UNIQUE INDEX task_automation_analysis_job_idx ON task_automation_jobs(analysis_id) WHERE kind='risk';
CREATE UNIQUE INDEX task_automation_develop_job_idx ON task_automation_jobs(task_id) WHERE kind='develop';
CREATE UNIQUE INDEX task_automation_merge_job_idx ON task_automation_jobs(task_id) WHERE kind='merge';
CREATE INDEX task_automation_jobs_claim_idx ON task_automation_jobs(next_attempt_at,created_at) WHERE status IN('queued','awaiting_connection');
CREATE INDEX task_automation_jobs_expired_idx ON task_automation_jobs(lease_expires_at) WHERE status='running';
CREATE INDEX task_automation_jobs_project_idx ON task_automation_jobs(project_id,created_at DESC);

CREATE FUNCTION protect_task_automation_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.project_id,NEW.input_snapshot,NEW.input_sha256,NEW.created_by,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.input_snapshot,OLD.input_sha256,OLD.created_by,OLD.created_at) THEN
 RAISE EXCEPTION 'Automation input is immutable' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='automation_tasks' THEN
  IF ROW(NEW.analysis_id,NEW.title,NEW.description,NEW.acceptance_criteria,NEW.evidence) IS DISTINCT FROM ROW(OLD.analysis_id,OLD.title,OLD.description,OLD.acceptance_criteria,OLD.evidence)
  OR OLD.artifact IS NOT NULL AND NEW.artifact IS DISTINCT FROM OLD.artifact
  OR OLD.review IS NOT NULL AND NEW.review IS DISTINCT FROM OLD.review
  OR OLD.status='done' AND ROW(NEW.status,NEW.merge_result) IS DISTINCT FROM ROW(OLD.status,OLD.merge_result) THEN
  RAISE EXCEPTION 'Automation evidence is immutable' USING ERRCODE='23514'; END IF;
 ELSE
  IF ROW(NEW.revision_id,NEW.request_sha256,NEW.dedup_sha256) IS DISTINCT FROM ROW(OLD.revision_id,OLD.request_sha256,OLD.dedup_sha256)
  OR OLD.result IS NOT NULL AND NEW.result IS DISTINCT FROM OLD.result THEN
  RAISE EXCEPTION 'Risk result is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER automation_analysis_immutable BEFORE UPDATE ON task_automation_analyses FOR EACH ROW EXECUTE FUNCTION protect_task_automation_snapshot();
CREATE TRIGGER automation_task_immutable BEFORE UPDATE ON automation_tasks FOR EACH ROW EXECUTE FUNCTION protect_task_automation_snapshot();
CREATE TRIGGER automation_analysis_no_delete BEFORE DELETE ON task_automation_analyses FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
CREATE TRIGGER automation_task_no_delete BEFORE DELETE ON automation_tasks FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
CREATE FUNCTION protect_task_automation_job() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.project_id,NEW.kind,NEW.analysis_id,NEW.task_id,NEW.payload,NEW.created_by,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.kind,OLD.analysis_id,OLD.task_id,OLD.payload,OLD.created_by,OLD.created_at) THEN
 RAISE EXCEPTION 'Automation dispatch intent is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER task_automation_job_immutable BEFORE UPDATE ON task_automation_jobs FOR EACH ROW EXECUTE FUNCTION protect_task_automation_job();
CREATE TRIGGER task_automation_job_no_delete BEFORE DELETE ON task_automation_jobs FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();

-- Future ready policy revisions only; historical documents are not dispatched.
CREATE FUNCTION enqueue_ready_policy_automation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='ready' AND (TG_OP='INSERT' OR OLD.status<>'ready')
 AND EXISTS(SELECT 1 FROM documents d JOIN project_nora_workspaces n ON n.project_id=d.project_id
 JOIN task_automation_settings s ON s.project_id=d.project_id AND s.enabled
 WHERE d.project_id=NEW.project_id AND d.id=NEW.document_id AND d.document_category='policy') THEN
 INSERT INTO task_automation_intake(revision_id,project_id,created_by) VALUES(NEW.id,NEW.project_id,NEW.created_by) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER task_automation_policy_ready AFTER INSERT OR UPDATE OF status ON revisions FOR EACH ROW EXECUTE FUNCTION enqueue_ready_policy_automation();
