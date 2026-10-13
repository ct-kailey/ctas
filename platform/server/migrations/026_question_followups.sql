-- Follow-up questions replace a stale answer for a particular workflow without
-- rewriting the original question, answer, resolution, or event history.
CREATE TABLE question_followups (
 id uuid PRIMARY KEY,
 project_id text NOT NULL REFERENCES projects(id),
 prior_question_id uuid NOT NULL,
 followup_question_id uuid NOT NULL UNIQUE,
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 3000),
 actor_id uuid NOT NULL REFERENCES users(id),
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 origin_snapshot jsonb NOT NULL CHECK(jsonb_typeof(origin_snapshot)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(prior_question_id<>followup_question_id),
 FOREIGN KEY(prior_question_id,project_id) REFERENCES project_questions(id,project_id),
 FOREIGN KEY(followup_question_id,project_id) REFERENCES project_questions(id,project_id)
);
CREATE INDEX question_followups_prior_idx ON question_followups(project_id,prior_question_id,created_at);
CREATE INDEX question_followups_child_idx ON question_followups(project_id,followup_question_id);
CREATE TRIGGER question_followups_immutable BEFORE UPDATE OR DELETE ON question_followups FOR EACH ROW EXECUTE FUNCTION protect_event_history();
