-- OAuth grants are independent of the Codex/browser account and belong to one
-- immutable AINS project / Nora workspace binding. Secrets use the server vault.
CREATE TABLE project_nora_oauth (
  project_id text PRIMARY KEY REFERENCES project_nora_workspaces(project_id),
  workspace_id text NOT NULL,
  attempt_id uuid NOT NULL,
  secret_ciphertext text,
  expires_at timestamptz,
  scope text NOT NULL DEFAULT 'read build run',
  authorized_by uuid REFERENCES users(id),
  authorized_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((secret_ciphertext IS NULL) = (expires_at IS NULL))
);
CREATE INDEX project_nora_oauth_authorized_by_idx ON project_nora_oauth(authorized_by);

CREATE TABLE project_nora_oauth_states (
  state_hash text PRIMARY KEY CHECK (state_hash ~ '^[0-9a-f]{64}$'),
  project_id text NOT NULL REFERENCES project_nora_oauth(project_id),
  workspace_id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES users(id),
  attempt_id uuid NOT NULL,
  verifier_ciphertext text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_nora_oauth_states_project_idx ON project_nora_oauth_states(project_id);
CREATE INDEX project_nora_oauth_states_owner_idx ON project_nora_oauth_states(owner_id);
CREATE INDEX project_nora_oauth_states_expiry_idx ON project_nora_oauth_states(expires_at);
