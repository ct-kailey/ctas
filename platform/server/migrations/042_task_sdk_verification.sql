ALTER TABLE task_automation_settings
 ADD COLUMN execution_mode text NOT NULL DEFAULT 'connector_api' CHECK (execution_mode IN ('connector_api','nora_sdk')),
 ADD COLUMN sdk_provider text CHECK (sdk_provider IS NULL OR sdk_provider IN ('codex','claude-code')),
 ADD COLUMN sdk_connection_id text CHECK (sdk_connection_id IS NULL OR length(sdk_connection_id) BETWEEN 1 AND 200),
 ADD COLUMN sdk_working_folder text CHECK (sdk_working_folder IS NULL OR length(sdk_working_folder) BETWEEN 2 AND 2000);
-- Original code and implementation report stay immutable. Only independent,
-- subsequent verification observations may change until human approval.
ALTER TABLE automation_tasks ADD COLUMN verification jsonb CHECK (verification IS NULL OR jsonb_typeof(verification)='object');
CREATE FUNCTION protect_task_verification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.review IS NOT NULL AND NEW.verification IS DISTINCT FROM OLD.verification THEN
 RAISE EXCEPTION 'Approved verification is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER automation_verification_review_lock BEFORE UPDATE ON automation_tasks FOR EACH ROW EXECUTE FUNCTION protect_task_verification();
