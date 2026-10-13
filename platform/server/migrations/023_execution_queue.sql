CREATE TABLE execution_agents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id text NOT NULL REFERENCES projects(id),
 created_by uuid NOT NULL REFERENCES users(id),
 token_hash text NOT NULL UNIQUE,
 label text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 last_poll_at timestamptz,
 scan_after_created_at timestamptz,
 scan_after_request_id uuid
);
CREATE INDEX execution_agents_project_idx ON execution_agents(project_id,created_at DESC);
CREATE INDEX execution_agents_owner_idx ON execution_agents(created_by);
CREATE TABLE execution_queue_claims (
 request_id uuid PRIMARY KEY,
 project_id text NOT NULL REFERENCES projects(id),
 agent_id uuid NOT NULL REFERENCES execution_agents(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(request_id,project_id) REFERENCES implementation_requests(id,project_id)
);
CREATE INDEX execution_queue_project_idx ON execution_queue_claims(project_id,created_at);
CREATE INDEX execution_queue_agent_idx ON execution_queue_claims(agent_id);
CREATE TRIGGER execution_queue_claims_immutable BEFORE UPDATE OR DELETE ON execution_queue_claims FOR EACH ROW EXECUTE FUNCTION protect_event_history();
