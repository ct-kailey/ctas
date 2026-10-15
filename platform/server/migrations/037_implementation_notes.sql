ALTER TABLE task_automation_settings ADD COLUMN uncertainty_mode text NOT NULL DEFAULT 'strict'
  CHECK (uncertainty_mode IN ('strict','provisional'));

CREATE UNIQUE INDEX project_task_drafts_id_project_idx ON project_task_drafts(id,project_id);
CREATE TABLE project_implementation_notes (
  id uuid PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id),
  kind text NOT NULL CHECK (kind IN ('temporary_decision','work_gap')),
  origin text NOT NULL CHECK (origin IN ('manual','nora')),
  trace_id text,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  uncertainty text NOT NULL CHECK (length(uncertainty) BETWEEN 1 AND 5000),
  temporary_approach text CHECK (length(temporary_approach) BETWEEN 1 AND 10000),
  rationale text NOT NULL CHECK (length(rationale) BETWEEN 1 AND 5000),
  impact text NOT NULL CHECK (length(impact) BETWEEN 1 AND 5000),
  replacement_condition text NOT NULL CHECK (length(replacement_condition) BETWEEN 1 AND 5000),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence)='array' AND jsonb_array_length(evidence) BETWEEN 1 AND 20),
  source_revision_id uuid NOT NULL,
  source_document_id uuid NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_title text NOT NULL,
  automation_task_id uuid,
  task_draft_id uuid,
  analysis_id uuid,
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','feedback_received','followup_created','accepted','resolved')),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,project_id),
  FOREIGN KEY(source_revision_id,project_id,source_document_id) REFERENCES revisions(id,project_id,document_id),
  FOREIGN KEY(automation_task_id,project_id) REFERENCES automation_tasks(id,project_id),
  FOREIGN KEY(task_draft_id,project_id) REFERENCES project_task_drafts(id,project_id),
  FOREIGN KEY(analysis_id,project_id) REFERENCES task_automation_analyses(id,project_id),
  CHECK (kind<>'temporary_decision' OR temporary_approach IS NOT NULL),
  CHECK ((origin='manual' AND trace_id IS NULL) OR (origin='nora' AND trace_id IS NOT NULL AND trace_id ~ '^trc_[A-Za-z0-9_-]+$')),
  CHECK (status<>'accepted' OR kind='temporary_decision'),
  CHECK (status<>'resolved' OR kind='work_gap')
);
CREATE INDEX implementation_notes_project_idx ON project_implementation_notes(project_id,created_at DESC,id DESC);
CREATE INDEX implementation_notes_status_idx ON project_implementation_notes(project_id,status,created_at DESC);
CREATE INDEX implementation_notes_task_idx ON project_implementation_notes(project_id,automation_task_id) WHERE automation_task_id IS NOT NULL;
CREATE INDEX implementation_notes_draft_idx ON project_implementation_notes(project_id,task_draft_id) WHERE task_draft_id IS NOT NULL;
CREATE INDEX implementation_notes_analysis_idx ON project_implementation_notes(project_id,analysis_id) WHERE analysis_id IS NOT NULL;
CREATE INDEX implementation_notes_source_idx ON project_implementation_notes(project_id,source_revision_id);

CREATE TABLE project_implementation_note_history (
  id uuid PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id),
  note_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('created','feedback','followup_created','accepted','resolved')),
  version integer NOT NULL CHECK (version>0),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  detail jsonb NOT NULL CHECK (jsonb_typeof(detail)='object'),
  actor_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(note_id,project_id) REFERENCES project_implementation_notes(id,project_id),
  UNIQUE(note_id,version),
  CHECK ((kind='created' AND version=1) OR (kind<>'created' AND version>1))
);
CREATE INDEX implementation_note_history_project_idx ON project_implementation_note_history(project_id,note_id,version DESC);
CREATE TRIGGER implementation_note_history_immutable BEFORE UPDATE OR DELETE ON project_implementation_note_history
  FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
CREATE TRIGGER implementation_note_no_delete BEFORE DELETE ON project_implementation_notes
  FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();

-- The only mutable fields are a projection of an append-only history entry.
CREATE FUNCTION protect_implementation_note() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW)-'status'-'version'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'version'-'updated_at')
    OR NEW.version<>OLD.version+1
    OR NOT EXISTS(SELECT 1 FROM project_implementation_note_history h WHERE h.project_id=NEW.project_id AND h.note_id=NEW.id
      AND h.version=NEW.version AND NEW.updated_at=h.created_at AND NEW.status=CASE h.kind WHEN 'feedback' THEN 'feedback_received' ELSE h.kind END)
  THEN RAISE EXCEPTION 'Implementation note evidence and history projection are immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER implementation_note_immutable BEFORE UPDATE ON project_implementation_notes
  FOR EACH ROW EXECUTE FUNCTION protect_implementation_note();
CREATE FUNCTION project_implementation_note_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_note project_implementation_notes;
BEGIN
  SELECT * INTO current_note FROM project_implementation_notes WHERE project_id=NEW.project_id AND id=NEW.note_id FOR UPDATE;
  IF NEW.kind='created' THEN
    IF current_note.version<>1 OR current_note.status<>'open' OR NEW.id<>current_note.id THEN
      RAISE EXCEPTION 'Invalid initial implementation note history' USING ERRCODE='23514'; END IF;
  ELSE
    IF NEW.version<>current_note.version+1 OR (NEW.kind='followup_created' AND current_note.status<>'feedback_received')
      OR (NEW.kind IN ('accepted','resolved') AND current_note.status IN ('accepted','resolved'))
    THEN RAISE EXCEPTION 'Implementation note history version or transition conflict' USING ERRCODE='23514'; END IF;
    UPDATE project_implementation_notes SET status=CASE NEW.kind WHEN 'feedback' THEN 'feedback_received' ELSE NEW.kind END,
      version=NEW.version,updated_at=NEW.created_at WHERE project_id=NEW.project_id AND id=NEW.note_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER implementation_note_project_history AFTER INSERT ON project_implementation_note_history
  FOR EACH ROW EXECUTE FUNCTION project_implementation_note_history();
