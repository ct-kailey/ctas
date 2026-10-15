ALTER TABLE automation_tasks
  ADD COLUMN question_ids jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(question_ids)='array' AND jsonb_array_length(question_ids)<=100),
  ADD COLUMN execution_context jsonb CHECK (execution_context IS NULL OR jsonb_typeof(execution_context)='object'),
  ADD COLUMN execution_context_sha256 text CHECK (execution_context_sha256 IS NULL OR execution_context_sha256 ~ '^[a-f0-9]{64}$'),
  ADD COLUMN start_request_sha256 text CHECK (start_request_sha256 IS NULL OR start_request_sha256 ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT automation_execution_context_complete CHECK ((execution_context IS NULL AND execution_context_sha256 IS NULL AND start_request_sha256 IS NULL) OR (execution_context IS NOT NULL AND execution_context_sha256 IS NOT NULL AND start_request_sha256 IS NOT NULL));

CREATE FUNCTION protect_task_execution_context() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.question_ids IS DISTINCT FROM OLD.question_ids
   OR OLD.execution_context IS NOT NULL AND ROW(NEW.execution_context,NEW.execution_context_sha256,NEW.start_request_sha256) IS DISTINCT FROM ROW(OLD.execution_context,OLD.execution_context_sha256,OLD.start_request_sha256)
   OR OLD.execution_context IS NULL AND NEW.execution_context IS NOT NULL AND NOT (OLD.status='todo' AND OLD.execution_status='idle' AND NEW.status='in_progress' AND NEW.execution_status='queued')
 THEN RAISE EXCEPTION 'Task execution consent and question scope are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER automation_task_execution_context_immutable BEFORE UPDATE ON automation_tasks FOR EACH ROW EXECUTE FUNCTION protect_task_execution_context();

ALTER TABLE project_implementation_notes ADD COLUMN execution_context jsonb
  CHECK (execution_context IS NULL OR jsonb_typeof(execution_context)='object');
-- Existing append-only note protection covers this metadata as well.

ALTER TABLE task_automation_jobs ADD COLUMN trace_id text CHECK (trace_id IS NULL OR trace_id ~ '^trc_[A-Za-z0-9_-]{1,200}$');
ALTER TABLE automation_tasks ADD COLUMN execution_trace_id text CHECK (execution_trace_id IS NULL OR execution_trace_id ~ '^trc_[A-Za-z0-9_-]{1,200}$');
CREATE FUNCTION protect_task_execution_trace() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='task_automation_jobs' THEN
  IF OLD.trace_id IS NOT NULL AND NEW.trace_id IS DISTINCT FROM OLD.trace_id THEN RAISE EXCEPTION 'Execution trace is immutable' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.execution_trace_id IS NOT NULL AND NEW.execution_trace_id IS DISTINCT FROM OLD.execution_trace_id THEN RAISE EXCEPTION 'Execution trace is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER task_job_trace_immutable BEFORE UPDATE ON task_automation_jobs FOR EACH ROW EXECUTE FUNCTION protect_task_execution_trace();
CREATE TRIGGER task_trace_immutable BEFORE UPDATE ON automation_tasks FOR EACH ROW EXECUTE FUNCTION protect_task_execution_trace();
