-- Risk analysis is read-only and may be explicitly retried after failure.
-- Keep every terminal attempt and its immutable trace; only one live attempt
-- may exist for an analysis. Development/merge uniqueness remains unchanged.
DROP INDEX task_automation_analysis_job_idx;
CREATE UNIQUE INDEX task_automation_analysis_job_idx
 ON task_automation_jobs(analysis_id)
 WHERE kind='risk' AND status IN('queued','running','awaiting_connection');
CREATE INDEX task_automation_risk_attempts_idx
 ON task_automation_jobs(project_id,analysis_id,created_at DESC,id DESC)
 WHERE kind='risk';
