-- A reviewed conversation can create a request or supply a candidate answer.
-- This append-only journal preserves the exact evidence and operator edits.
CREATE TABLE channel_workflow_mappings (
 id uuid PRIMARY KEY,
 project_id text NOT NULL REFERENCES projects(id),
 inbox_id uuid NOT NULL,
 source_id uuid NOT NULL,
 target_type text NOT NULL CHECK(target_type IN ('classification','question_answer')),
 classification_id uuid,
 question_id uuid,
 target_version integer NOT NULL CHECK(target_version>0),
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 source_ref jsonb NOT NULL CHECK(jsonb_typeof(source_ref)='object'),
 source_snapshot jsonb NOT NULL CHECK(jsonb_typeof(source_snapshot)='object'),
 event_ids uuid[] NOT NULL CHECK(cardinality(event_ids) BETWEEN 1 AND 50),
 selection_sha256 text NOT NULL CHECK(selection_sha256 ~ '^[a-f0-9]{64}$'),
 request_snapshot jsonb NOT NULL CHECK(jsonb_typeof(request_snapshot)='object'),
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(inbox_id,source_id,project_id) REFERENCES channel_inbox(id,source_id,project_id),
 FOREIGN KEY(classification_id,project_id) REFERENCES maintenance_classifications(id,project_id),
 FOREIGN KEY(question_id,project_id) REFERENCES project_questions(id,project_id),
 CHECK((target_type='classification' AND classification_id IS NOT NULL AND question_id IS NULL)
    OR (target_type='question_answer' AND question_id IS NOT NULL AND classification_id IS NULL))
);
CREATE UNIQUE INDEX channel_workflow_selection_classification_idx ON channel_workflow_mappings(project_id,selection_sha256) WHERE target_type='classification';
CREATE UNIQUE INDEX channel_workflow_selection_answer_idx ON channel_workflow_mappings(project_id,selection_sha256,question_id) WHERE target_type='question_answer';
CREATE INDEX channel_workflow_inbox_idx ON channel_workflow_mappings(project_id,inbox_id,created_at DESC);
CREATE INDEX channel_workflow_source_idx ON channel_workflow_mappings(source_id);
CREATE INDEX channel_workflow_classification_idx ON channel_workflow_mappings(classification_id,project_id);
CREATE INDEX channel_workflow_question_idx ON channel_workflow_mappings(question_id,project_id);
CREATE INDEX channel_workflow_actor_idx ON channel_workflow_mappings(created_by);
CREATE TRIGGER channel_workflow_append_only BEFORE UPDATE OR DELETE ON channel_workflow_mappings FOR EACH ROW EXECUTE FUNCTION protect_event_history();
