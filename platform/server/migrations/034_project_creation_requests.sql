-- A browser may repeat project registration after losing the response.
CREATE TABLE project_creation_requests (
  user_id uuid NOT NULL REFERENCES users(id),
  request_id uuid NOT NULL,
  input_sha256 text NOT NULL CHECK (input_sha256 ~ '^[a-f0-9]{64}$'),
  project_id text NOT NULL UNIQUE REFERENCES projects(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,request_id)
);
