-- Short-lived credentials authorize one already approved implementation request only.
CREATE TABLE implementation_runner_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL,
 project_id text NOT NULL,
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 FOREIGN KEY(request_id,project_id) REFERENCES implementation_requests(id,project_id)
);
CREATE INDEX implementation_runner_request_idx ON implementation_runner_tokens(request_id,created_at DESC);
CREATE INDEX implementation_runner_project_idx ON implementation_runner_tokens(project_id);
CREATE INDEX implementation_runner_creator_idx ON implementation_runner_tokens(created_by);
ALTER TABLE implementation_requests ADD COLUMN runner_token_id uuid REFERENCES implementation_runner_tokens(id);
ALTER TABLE implementation_requests ADD COLUMN completion_sha256 text CHECK(completion_sha256 ~ '^[a-f0-9]{64}$');
CREATE INDEX implementation_requests_runner_idx ON implementation_requests(runner_token_id);
