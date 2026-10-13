-- Read-only repository access is separate from permission to publish a PR.
CREATE TABLE project_repository_access (
  project_id text PRIMARY KEY REFERENCES projects(id),
  repository_url text NOT NULL,
  secret_ciphertext text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_repository_access_actor_idx ON project_repository_access(updated_by);
