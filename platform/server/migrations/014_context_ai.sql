CREATE TABLE context_ai_runs (
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
CREATE INDEX context_ai_project_idx ON context_ai_runs(project_id,created_at DESC);
CREATE INDEX context_ai_queue_idx ON context_ai_runs(created_at) WHERE status='queued';
CREATE INDEX context_ai_creator_idx ON context_ai_runs(created_by);
CREATE FUNCTION protect_context_ai_input() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.project_id,NEW.created_by,NEW.request_sha256,NEW.request,NEW.source_refs,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.created_by,OLD.request_sha256,OLD.request,OLD.source_refs,OLD.created_at) THEN
 RAISE EXCEPTION 'Context AI input is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.reviewed_candidate IS NOT NULL AND ROW(NEW.approval_id,NEW.trace_id,NEW.reviewed_candidate,NEW.reviewed_sha256)
 IS DISTINCT FROM ROW(OLD.approval_id,OLD.trace_id,OLD.reviewed_candidate,OLD.reviewed_sha256) THEN
 RAISE EXCEPTION 'Context AI reviewed output is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.result IS NOT NULL AND NEW.result IS DISTINCT FROM OLD.result THEN
 RAISE EXCEPTION 'Context AI completed output is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.decision IS NOT NULL AND NEW.decision IS DISTINCT FROM OLD.decision THEN
 RAISE EXCEPTION 'Context AI decision is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER context_ai_input_immutable BEFORE UPDATE ON context_ai_runs FOR EACH ROW EXECUTE FUNCTION protect_context_ai_input();
CREATE TRIGGER context_ai_no_delete BEFORE DELETE ON context_ai_runs FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
