-- CTAS device transport is independent of Nora SDK connections and traces.
CREATE TABLE desktop_execution_pairings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id text NOT NULL REFERENCES projects(id),
 code_hash text NOT NULL UNIQUE CHECK(code_hash ~ '^[a-f0-9]{64}$'),
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL, consumed_at timestamptz,
 CHECK(expires_at>created_at)
);
CREATE INDEX desktop_pairings_project_idx ON desktop_execution_pairings(project_id,created_at DESC);
CREATE INDEX desktop_pairings_actor_idx ON desktop_execution_pairings(created_by);
CREATE TABLE desktop_execution_devices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id text NOT NULL REFERENCES projects(id),
 device_name text NOT NULL CHECK(length(device_name) BETWEEN 1 AND 100),
 provider text NOT NULL CHECK(provider IN('codex','claude-code')),
 repository_url text NOT NULL, workspace_id text NOT NULL,
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '90 days', revoked_at timestamptz,
 last_seen_at timestamptz, UNIQUE(id,project_id)
);
CREATE INDEX desktop_devices_project_idx ON desktop_execution_devices(project_id,created_at DESC);
CREATE INDEX desktop_devices_actor_idx ON desktop_execution_devices(created_by);
ALTER TABLE task_automation_settings DROP CONSTRAINT task_automation_settings_execution_mode_check;
ALTER TABLE task_automation_settings ADD CONSTRAINT task_automation_settings_execution_mode_check CHECK(execution_mode IN('connector_api','nora_sdk','desktop'));
ALTER TABLE task_automation_settings ADD COLUMN desktop_device_id uuid;
ALTER TABLE task_automation_settings ADD CONSTRAINT desktop_settings_device_scope FOREIGN KEY(desktop_device_id,project_id) REFERENCES desktop_execution_devices(id,project_id);
CREATE INDEX task_settings_desktop_device_idx ON task_automation_settings(desktop_device_id) WHERE desktop_device_id IS NOT NULL;
ALTER TABLE task_automation_jobs ADD CONSTRAINT desktop_job_project_unique UNIQUE(id,project_id);
CREATE TABLE desktop_execution_jobs (
 job_id uuid PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id), device_id uuid NOT NULL,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','running','uncertain','completed','failed')),
 prompt text NOT NULL CHECK(length(prompt) BETWEEN 1 AND 12000),
 prompt_sha256 text NOT NULL CHECK(prompt_sha256 ~ '^[a-f0-9]{64}$'),
 claimed_at timestamptz, local_run_id text CHECK(local_run_id IS NULL OR local_run_id ~ '^run-[a-f0-9]{32}$'),
 native_status text, completion_sha256 text, completion jsonb, completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(job_id,project_id) REFERENCES task_automation_jobs(id,project_id),
 FOREIGN KEY(device_id,project_id) REFERENCES desktop_execution_devices(id,project_id),
 CHECK((completion_sha256 IS NULL AND completion IS NULL AND completed_at IS NULL) OR
       (completion_sha256 ~ '^[a-f0-9]{64}$' AND completion IS NOT NULL AND completed_at IS NOT NULL))
);
CREATE INDEX desktop_jobs_device_queue_idx ON desktop_execution_jobs(device_id,created_at) WHERE state='queued';
CREATE UNIQUE INDEX desktop_jobs_device_running_idx ON desktop_execution_jobs(device_id) WHERE state IN('running','uncertain');
CREATE INDEX desktop_jobs_project_idx ON desktop_execution_jobs(project_id,created_at DESC);
CREATE TABLE desktop_execution_claims (
 id uuid PRIMARY KEY, device_id uuid NOT NULL REFERENCES desktop_execution_devices(id),
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 job_id uuid NOT NULL UNIQUE REFERENCES desktop_execution_jobs(job_id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX desktop_claims_device_idx ON desktop_execution_claims(device_id,created_at);
CREATE FUNCTION protect_desktop_execution() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='desktop_execution_devices' THEN
  IF ROW(NEW.id,NEW.project_id,NEW.device_name,NEW.provider,NEW.repository_url,NEW.workspace_id,NEW.token_hash,NEW.created_by,NEW.created_at,NEW.expires_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.device_name,OLD.provider,OLD.repository_url,OLD.workspace_id,OLD.token_hash,OLD.created_by,OLD.created_at,OLD.expires_at)
    OR OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'Desktop identity is immutable' USING ERRCODE='23514'; END IF;
 ELSE
  IF ROW(NEW.job_id,NEW.project_id,NEW.device_id,NEW.prompt,NEW.prompt_sha256,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.job_id,OLD.project_id,OLD.device_id,OLD.prompt,OLD.prompt_sha256,OLD.created_at)
    OR OLD.claimed_at IS NOT NULL AND NEW.claimed_at IS DISTINCT FROM OLD.claimed_at
    OR OLD.local_run_id IS NOT NULL AND NEW.local_run_id IS DISTINCT FROM OLD.local_run_id
    OR OLD.completion IS NOT NULL AND ROW(NEW.completion,NEW.completion_sha256,NEW.completed_at,NEW.state) IS DISTINCT FROM ROW(OLD.completion,OLD.completion_sha256,OLD.completed_at,OLD.state) THEN
    RAISE EXCEPTION 'Desktop run evidence is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER desktop_device_identity_immutable BEFORE UPDATE ON desktop_execution_devices FOR EACH ROW EXECUTE FUNCTION protect_desktop_execution();
CREATE TRIGGER desktop_job_evidence_immutable BEFORE UPDATE ON desktop_execution_jobs FOR EACH ROW EXECUTE FUNCTION protect_desktop_execution();
CREATE TRIGGER desktop_claim_immutable BEFORE UPDATE OR DELETE ON desktop_execution_claims FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
