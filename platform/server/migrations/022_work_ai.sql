CREATE TABLE work_ai_runs (
 id uuid PRIMARY KEY,
 project_id text NOT NULL REFERENCES projects(id),
 created_by uuid NOT NULL REFERENCES users(id),
 request_sha256 text NOT NULL,
 request jsonb NOT NULL,
 source_refs jsonb NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','waiting_approval','finalizing','ready','rejected','failed','uncertain')),
 trace_id text,
 approval_id text UNIQUE,
 reviewed_candidate jsonb,
 reviewed_sha256 text,
 decision jsonb,
 result jsonb,
 imported_ids jsonb NOT NULL DEFAULT '[]',
 error_code text,
 worker_id uuid,
 started_at timestamptz,
 heartbeat_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,project_id)
);
CREATE INDEX work_ai_project_idx ON work_ai_runs(project_id,created_at DESC);
CREATE INDEX work_ai_target_idx ON work_ai_runs(project_id,(request->>'target_type'),(request->>'target_id'));
CREATE INDEX work_ai_queue_idx ON work_ai_runs(created_at) WHERE status='queued';
CREATE INDEX work_ai_creator_idx ON work_ai_runs(created_by);
CREATE TRIGGER work_ai_input_immutable BEFORE UPDATE ON work_ai_runs FOR EACH ROW EXECUTE FUNCTION protect_context_ai_input();
CREATE TRIGGER work_ai_no_delete BEFORE DELETE ON work_ai_runs FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
