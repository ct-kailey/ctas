-- Only new registrations explicitly enqueue an analysis. Historical documents
-- are never backfilled or sent to an external model by this migration.
CREATE TABLE document_analysis_queue (
  revision_id uuid PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id),
  created_by uuid NOT NULL REFERENCES users(id),
  request_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  request jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted','blocked')),
  error_code text,
  lease_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (revision_id,project_id) REFERENCES revisions(id,project_id),
  CHECK (request IS NULL OR (jsonb_typeof(request)='object' AND request->>'request_id'=request_id::text))
);
CREATE INDEX document_analysis_pending_idx ON document_analysis_queue(next_attempt_at,created_at) WHERE status='pending';
CREATE INDEX document_analysis_project_idx ON document_analysis_queue(project_id,created_at DESC);
