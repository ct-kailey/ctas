-- Human-authored task drafts keep source evidence without inventing an AI run.
CREATE TABLE project_task_draft_batches (
  id uuid PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id),
  source_revision_id uuid NOT NULL,
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[a-f0-9]{64}$'),
  request_payload jsonb NOT NULL CHECK (jsonb_typeof(request_payload)='object'),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,project_id),
  FOREIGN KEY (source_revision_id,project_id) REFERENCES revisions(id,project_id)
);
CREATE INDEX task_draft_batches_project_idx ON project_task_draft_batches(project_id,created_at DESC);
CREATE INDEX task_draft_batches_revision_idx ON project_task_draft_batches(source_revision_id,project_id);
CREATE INDEX task_draft_batches_creator_idx ON project_task_draft_batches(created_by);

CREATE TABLE project_task_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES projects(id),
  batch_id uuid NOT NULL,
  task_key text NOT NULL CHECK (task_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$'),
  position integer NOT NULL CHECK (position BETWEEN 0 AND 49),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin='manual'),
  status text NOT NULL DEFAULT 'todo' CHECK (status='todo'),
  execution_status text NOT NULL DEFAULT 'blocked' CHECK (execution_status='blocked'),
  execution_blocker text NOT NULL DEFAULT 'NORA_ANALYSIS_REQUIRED' CHECK (execution_blocker='NORA_ANALYSIS_REQUIRED'),
  source_revision_id uuid NOT NULL,
  source_document_id uuid NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  source_title text NOT NULL,
  source_url text,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 10000),
  acceptance_criteria jsonb NOT NULL CHECK (jsonb_typeof(acceptance_criteria)='array' AND jsonb_array_length(acceptance_criteria) BETWEEN 1 AND 30),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence)='array' AND jsonb_array_length(evidence) BETWEEN 1 AND 20),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('high','normal','low')),
  question_notes jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(question_notes)='array'),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,project_id,batch_id),
  UNIQUE (batch_id,task_key),
  UNIQUE (batch_id,position),
  FOREIGN KEY (batch_id,project_id) REFERENCES project_task_draft_batches(id,project_id),
  FOREIGN KEY (source_revision_id,project_id,source_document_id) REFERENCES revisions(id,project_id,document_id)
);
CREATE INDEX task_drafts_project_idx ON project_task_drafts(project_id,created_at DESC,id);
CREATE INDEX task_drafts_revision_idx ON project_task_drafts(source_revision_id,project_id,source_document_id);
CREATE INDEX task_drafts_creator_idx ON project_task_drafts(created_by);

CREATE TABLE project_task_draft_dependencies (
  project_id text NOT NULL,
  batch_id uuid NOT NULL,
  task_id uuid NOT NULL,
  dependency_id uuid NOT NULL,
  PRIMARY KEY (task_id,dependency_id),
  CHECK (task_id<>dependency_id),
  FOREIGN KEY (task_id,project_id,batch_id) REFERENCES project_task_drafts(id,project_id,batch_id),
  FOREIGN KEY (dependency_id,project_id,batch_id) REFERENCES project_task_drafts(id,project_id,batch_id)
);
CREATE INDEX task_draft_dependencies_target_idx ON project_task_draft_dependencies(dependency_id,project_id,batch_id);

CREATE TRIGGER task_draft_batches_immutable BEFORE UPDATE OR DELETE ON project_task_draft_batches FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
CREATE TRIGGER task_drafts_immutable BEFORE UPDATE OR DELETE ON project_task_drafts FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
CREATE TRIGGER task_draft_dependencies_immutable BEFORE UPDATE OR DELETE ON project_task_draft_dependencies FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
