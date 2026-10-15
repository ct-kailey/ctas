-- Milestones record a person's declaration, not inferred lifecycle completion.
CREATE TABLE project_journey_milestones (
 id uuid PRIMARY KEY,
 project_id text NOT NULL REFERENCES projects(id),
 kind text NOT NULL CHECK(kind IN ('planning_started','contract_signed','final_delivery','contract_closed','custom')),
 stage text NOT NULL CHECK(stage IN ('planning','contract','requirements','implementation','review','delivery','closure')),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 300),
 description text NOT NULL DEFAULT '' CHECK(length(description)<=10000),
 occurred_at timestamptz NOT NULL,
 source_refs jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(source_refs)='array' AND jsonb_array_length(source_refs)<=20),
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(kind='custom' OR stage=CASE kind WHEN 'planning_started' THEN 'planning' WHEN 'contract_signed' THEN 'contract' WHEN 'final_delivery' THEN 'delivery' WHEN 'contract_closed' THEN 'closure' END)
);
CREATE INDEX journey_milestones_project_time_idx ON project_journey_milestones(project_id,occurred_at,id);
CREATE INDEX journey_milestones_recorded_idx ON project_journey_milestones(project_id,created_at);
CREATE TRIGGER journey_milestones_immutable BEFORE UPDATE OR DELETE ON project_journey_milestones
 FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();

-- Existing histories are read directly; no synthetic backfill events are created.
CREATE INDEX revisions_project_time_idx ON revisions(project_id,created_at,id);
CREATE INDEX commercial_revisions_project_time_idx ON commercial_document_revisions(project_id,created_at,id);
CREATE INDEX implementation_note_history_time_idx ON project_implementation_note_history(project_id,created_at,id);
CREATE INDEX context_records_occurrence_idx ON context_records(project_id,occurred_at,id);
