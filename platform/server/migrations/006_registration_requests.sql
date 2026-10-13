-- Store recommendation dispatch/results separately from confirmed source records.
-- Draft text is not retained here. The fingerprint and trace identify the exact run.
CREATE TABLE registration_requests (
  id uuid PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  input_sha256 text NOT NULL CHECK (input_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed','uncertain')),
  suggestion jsonb,
  trace_id text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (status <> 'succeeded' OR (suggestion IS NOT NULL AND trace_id IS NOT NULL))
);
CREATE INDEX registration_requests_project_created_idx ON registration_requests(project_id,created_at DESC);
